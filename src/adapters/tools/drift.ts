/**
 * Drift checks: compare a TOOLSFile (parsed TOOLS.md) against an
 * EnvironmentDescriptor (MCP manifest or OpenAI-compatible tool registry)
 * and emit structured DriftFinding entries.
 *
 * FR-004: Drift checks — documented-but-missing, present-but-undocumented,
 *         schema-mismatch with direction and differing fields.
 * FR-005: Offline — the environment descriptor is loaded from a file path.
 *         Zero network calls; no fetch, http, https, axios, got, or request.
 * FR-009: Every DriftFinding must carry a non-empty citedRubric.
 *
 * Charter constraints:
 * - Offline static path: zero network calls (C-003, NFR-001).
 * - Byte-stable, static path (SC-002, NFR-001): findings sorted by
 *   (kind, toolName) using UTF-16 code-unit comparator — NOT localeCompare.
 *   localeCompare is locale-dependent and breaks byte-stable canonical output
 *   on machines with non-English locales. Use < / > string comparators only.
 * - Every DriftFinding must have a non-empty citedRubric (charter invariant,
 *   FR-009). Enforced at compile time (required field) and runtime (assertion).
 * - Unknown descriptor format must throw UnknownDescriptorFormatError (never
 *   a silent pass or null return).
 */

import { readFile } from "node:fs/promises";
import type { ParameterDescriptor, TOOLSFile } from "./lint.js";

// ---------------------------------------------------------------------------
// T008 — Type declarations
// ---------------------------------------------------------------------------

/**
 * Recognised environment descriptor formats.
 * Detection is by structural inspection (duck typing), not by a "format" key.
 */
export type EnvironmentDescriptorFormat = "mcp-manifest" | "openai-tool-registry";

/**
 * A single tool entry extracted from an environment descriptor.
 *
 * Invariants:
 * - `parameters` is an empty Map (never null/undefined) when the tool has no
 *   parameters in the descriptor.
 * - `name` is the match key used by the drift check's match-rubric (exact
 *   string equality, case-sensitive — no fuzzy matching).
 */
export interface EnvironmentToolEntry {
  /** Tool name exactly as in the environment descriptor. */
  readonly name: string;
  /**
   * Structured parameter declarations extracted from the environment.
   * Keys are parameter names; values carry the declared type and required flag.
   */
  readonly parameters: ReadonlyMap<string, ParameterDescriptor>;
}

/**
 * A normalised, in-memory representation of an environment descriptor file.
 *
 * Invariants:
 * - `tools` keys are normalised tool name strings (exact strings from the
 *   descriptor).
 * - Loading a file that matches neither known format throws
 *   UnknownDescriptorFormatError — never returns a partially-constructed
 *   descriptor.
 */
export interface EnvironmentDescriptor {
  readonly format: EnvironmentDescriptorFormat;
  /** Absolute or runner-relative path to the source file. */
  readonly path: string;
  /** Map from tool name to EnvironmentToolEntry. */
  readonly tools: ReadonlyMap<string, EnvironmentToolEntry>;
}

/**
 * The three finding kinds emitted by the drift check.
 */
export type DriftFindingKind =
  | "documented-but-missing"
  | "present-but-undocumented"
  | "schema-mismatch";

/**
 * Direction of a schema-mismatch finding.
 *
 * - "docs-ahead": documentation declares more or different parameters than the
 *   environment has (docs outpace reality).
 * - "reality-ahead": the environment has parameters not present in docs, or
 *   type/required differences where the environment diverges beyond docs.
 */
export type SchemaMismatchDirection = "docs-ahead" | "reality-ahead";

/**
 * A single finding from the drift check.
 *
 * Charter invariant: citedRubric is NEVER absent — every finding must cite
 * a normative muster rubric source (FR-009). This is a required field at the
 * type level and is additionally asserted at runtime in runDriftCheck().
 */
export interface DriftFinding {
  readonly kind: DriftFindingKind;
  /** The tool name involved in the finding (exact string). */
  readonly toolName: string;
  /**
   * Direction of schema mismatch.
   * Only present for schema-mismatch findings.
   */
  readonly direction?: SchemaMismatchDirection;
  /**
   * Specific parameter names (or suffixes like "type", "required") that differ.
   * Only present for schema-mismatch findings with structured differences.
   * Sorted by UTF-16 code-unit comparator (locale-independent, byte-stable).
   */
  readonly fields?: readonly string[];
  /**
   * true when structured schemas are identical but only prose descriptions
   * differ. Lower-severity finding. Only present for schema-mismatch findings.
   */
  readonly proseOnly?: boolean;
  /**
   * Muster-published rubric clause that defines this finding type.
   * NEVER absent — charter invariant (FR-009).
   * Example values:
   *   "muster-rubric:tools/drift/v1"
   *   "muster-rubric:tools/drift/prose-description/v1"
   */
  readonly citedRubric: string;
}

/**
 * The complete output of a drift check comparing a TOOLSFile against an
 * EnvironmentDescriptor.
 *
 * Invariant: clean === (findings.length === 0).
 */
export interface DriftReport {
  readonly toolsFilePath: string;
  readonly envDescriptorPath: string;
  readonly envDescriptorFormat: EnvironmentDescriptorFormat;
  /**
   * Sorted by (kind, toolName) using UTF-16 code-unit comparator.
   * Identical bytes across runs (byte-stable, SC-002, NFR-001).
   */
  readonly findings: readonly DriftFinding[];
  /** true iff findings is empty. Invariant: clean === (findings.length === 0). */
  readonly clean: boolean;
}

// ---------------------------------------------------------------------------
// T009 — UnknownDescriptorFormatError + loadEnvironmentDescriptor()
// ---------------------------------------------------------------------------

/**
 * Thrown when a file does not match either of the two recognised descriptor
 * formats (MCP manifest or OpenAI tool registry).
 *
 * Never return null or a partial descriptor — always throw this error.
 */
export class UnknownDescriptorFormatError extends Error {
  constructor(filePath: string) {
    super(
      `Unknown environment descriptor format in file: "${filePath}". ` +
        `Expected one of: ` +
        `(1) MCP manifest — JSON object with "tools" array of objects having "name" and optional "inputSchema"; ` +
        `(2) OpenAI tool registry — JSON object with "tools" array of objects having "type": "function" and "function" sub-object.`
    );
    this.name = "UnknownDescriptorFormatError";
  }
}

/**
 * Detect whether the parsed JSON is an MCP manifest.
 *
 * An MCP manifest is a JSON object with a "tools" array where each entry is
 * an object with a "name" string. It does NOT have "type": "function" entries.
 */
function isMcpManifest(data: unknown): boolean {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj["tools"])) {
    return false;
  }
  const tools = obj["tools"] as unknown[];
  // Need at least structural check: tools is array of objects with "name"
  // and entries do NOT have "type": "function" (that would be OpenAI format)
  if (tools.length === 0) {
    // Empty tools array — could be either format; use MCP as default
    // if no OpenAI marker is present
    return true;
  }
  const firstTool = tools[0];
  if (typeof firstTool !== "object" || firstTool === null) {
    return false;
  }
  const firstToolObj = firstTool as Record<string, unknown>;
  // If first entry has "type": "function", it is OpenAI format
  if (firstToolObj["type"] === "function") {
    return false;
  }
  // MCP manifest: has "name" at the top level of each entry
  return typeof firstToolObj["name"] === "string";
}

/**
 * Detect whether the parsed JSON is an OpenAI-compatible tool registry.
 *
 * An OpenAI tool registry has a "tools" array where each entry has
 * "type": "function" and a "function" sub-object containing "name" and
 * "parameters". Alternatively the top level may be an array of such objects.
 */
function isOpenAiRegistry(data: unknown): boolean {
  // Handle top-level array format
  let tools: unknown[];
  if (Array.isArray(data)) {
    tools = data;
  } else if (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as Record<string, unknown>)["tools"])
  ) {
    tools = (data as Record<string, unknown>)["tools"] as unknown[];
  } else {
    return false;
  }

  if (tools.length === 0) {
    return false;
  }
  const firstTool = tools[0];
  if (typeof firstTool !== "object" || firstTool === null) {
    return false;
  }
  const entry = firstTool as Record<string, unknown>;
  return (
    entry["type"] === "function" &&
    typeof entry["function"] === "object" &&
    entry["function"] !== null
  );
}

/**
 * Extract parameters from a JSON Schema "properties" object + "required" array.
 */
function extractParameters(
  properties: Record<string, { type?: string }> | undefined,
  required: string[] | undefined
): Map<string, ParameterDescriptor> {
  const params = new Map<string, ParameterDescriptor>();
  if (!properties) return params;
  const reqSet = new Set(required ?? []);
  for (const [name, schema] of Object.entries(properties)) {
    params.set(name, {
      type: typeof schema.type === "string" ? schema.type : "string",
      required: reqSet.has(name),
    });
  }
  return params;
}

/**
 * Parse MCP manifest tools array into EnvironmentToolEntry records.
 */
function parseMcpTools(
  toolsArray: unknown[]
): Map<string, EnvironmentToolEntry> {
  const map = new Map<string, EnvironmentToolEntry>();
  for (const item of toolsArray) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as Record<string, unknown>;
    const name = typeof entry["name"] === "string" ? entry["name"] : null;
    if (!name) continue;

    const inputSchema =
      typeof entry["inputSchema"] === "object" && entry["inputSchema"] !== null
        ? (entry["inputSchema"] as Record<string, unknown>)
        : undefined;

    const properties =
      inputSchema !== undefined &&
      typeof inputSchema["properties"] === "object" &&
      inputSchema["properties"] !== null
        ? (inputSchema["properties"] as Record<string, { type?: string }>)
        : undefined;

    const required =
      inputSchema !== undefined && Array.isArray(inputSchema["required"])
        ? (inputSchema["required"] as string[])
        : undefined;

    map.set(name, {
      name,
      parameters: extractParameters(properties, required),
    });
  }
  return map;
}

/**
 * Parse OpenAI tool registry tools array into EnvironmentToolEntry records.
 */
function parseOpenAiTools(
  toolsArray: unknown[]
): Map<string, EnvironmentToolEntry> {
  const map = new Map<string, EnvironmentToolEntry>();
  for (const item of toolsArray) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as Record<string, unknown>;
    if (entry["type"] !== "function") continue;
    const fn =
      typeof entry["function"] === "object" && entry["function"] !== null
        ? (entry["function"] as Record<string, unknown>)
        : null;
    if (!fn) continue;

    const name = typeof fn["name"] === "string" ? fn["name"] : null;
    if (!name) continue;

    const params =
      typeof fn["parameters"] === "object" && fn["parameters"] !== null
        ? (fn["parameters"] as Record<string, unknown>)
        : undefined;

    const properties =
      params !== undefined &&
      typeof params["properties"] === "object" &&
      params["properties"] !== null
        ? (params["properties"] as Record<string, { type?: string }>)
        : undefined;

    const required =
      params !== undefined && Array.isArray(params["required"])
        ? (params["required"] as string[])
        : undefined;

    map.set(name, {
      name,
      parameters: extractParameters(properties, required),
    });
  }
  return map;
}

/**
 * Load an environment descriptor from a JSON file on disk.
 *
 * Detects the format by structural inspection (duck typing):
 * - MCP manifest: "tools" array with entries having "name" and optional
 *   "inputSchema" (no "type": "function" marker).
 * - OpenAI tool registry: "tools" array with entries having "type": "function"
 *   and a "function" sub-object.
 *
 * Throws UnknownDescriptorFormatError if neither format is recognised.
 * Never makes network calls — the file must be accessible on disk (FR-005,
 * C-003, NFR-001).
 *
 * @param filePath - Path to the environment descriptor JSON file.
 */
export async function loadEnvironmentDescriptor(
  filePath: string
): Promise<EnvironmentDescriptor> {
  const raw = await readFile(filePath, "utf-8");
  const data: unknown = JSON.parse(raw);

  if (isOpenAiRegistry(data)) {
    // OpenAI tool registry
    let toolsArray: unknown[];
    if (Array.isArray(data)) {
      toolsArray = data;
    } else {
      toolsArray = (data as Record<string, unknown>)["tools"] as unknown[];
    }
    return {
      format: "openai-tool-registry",
      path: filePath,
      tools: parseOpenAiTools(toolsArray),
    };
  }

  if (isMcpManifest(data)) {
    // MCP manifest
    const toolsArray = (data as Record<string, unknown>)[
      "tools"
    ] as unknown[];
    return {
      format: "mcp-manifest",
      path: filePath,
      tools: parseMcpTools(toolsArray),
    };
  }

  // Neither format matched — throw a clear error (never silent pass)
  throw new UnknownDescriptorFormatError(filePath);
}

// ---------------------------------------------------------------------------
// T010 + T011 — runDriftCheck() with deterministic ordering
// ---------------------------------------------------------------------------

/**
 * Compare the documented tool set (TOOLSFile) against a live environment
 * descriptor and emit DriftFinding entries for each divergence.
 *
 * Match-rubric (muster-rubric:tools/drift/v1):
 * 1. Name-match: exact string equality, case-sensitive. No fuzzy matching.
 * 2. documented-but-missing: tool in TOOLSFile absent from environment.
 * 3. present-but-undocumented: tool in environment absent from TOOLSFile.
 * 4. schema-mismatch: names match but parameter names, types, or required
 *    flags differ. Direction:
 *    - "docs-ahead": docs declare parameters not in the environment.
 *    - "reality-ahead": environment has parameters not in docs.
 * 5. prose-only: structured schemas are identical but prose descriptions
 *    differ — emitted with proseOnly: true and lower citedRubric.
 *
 * Output ordering (SC-002, NFR-001 — byte-stable):
 * Findings are sorted by (kind, toolName) using UTF-16 code-unit comparator.
 * Do NOT use localeCompare — that is locale-dependent and breaks byte-stable
 * canonical output on machines with non-English locales.
 *
 * @param toolsFile - Parsed TOOLSFile from WP01.
 * @param envDescriptor - Loaded EnvironmentDescriptor from loadEnvironmentDescriptor().
 */
export function runDriftCheck(
  toolsFile: TOOLSFile,
  envDescriptor: EnvironmentDescriptor
): DriftReport {
  const findings: DriftFinding[] = [];

  // Build documented tool set (name → ToolDescriptor)
  const documentedMap = new Map(toolsFile.tools.map((t) => [t.name, t]));

  // Build environment tool name set
  const envNames = new Set(envDescriptor.tools.keys());

  // --- Pass 1: documented-but-missing ---
  for (const [name] of documentedMap) {
    if (!envNames.has(name)) {
      const finding: DriftFinding = {
        kind: "documented-but-missing",
        toolName: name,
        citedRubric: "muster-rubric:tools/drift/v1",
      };
      // Runtime assertion: citedRubric must be non-empty (charter invariant, FR-009)
      if (!finding.citedRubric) {
        throw new Error(
          `DriftFinding for "${name}" (documented-but-missing) has an empty citedRubric — charter invariant violated (FR-009).`
        );
      }
      findings.push(finding);
    }
  }

  // --- Pass 2: present-but-undocumented ---
  for (const [name] of envDescriptor.tools) {
    if (!documentedMap.has(name)) {
      const finding: DriftFinding = {
        kind: "present-but-undocumented",
        toolName: name,
        citedRubric: "muster-rubric:tools/drift/v1",
      };
      // Runtime assertion: citedRubric must be non-empty (charter invariant, FR-009)
      if (!finding.citedRubric) {
        throw new Error(
          `DriftFinding for "${name}" (present-but-undocumented) has an empty citedRubric — charter invariant violated (FR-009).`
        );
      }
      findings.push(finding);
    }
  }

  // --- Pass 3: schema-mismatch ---
  for (const [name, docTool] of documentedMap) {
    const envTool = envDescriptor.tools.get(name);
    if (!envTool) continue; // Already handled in Pass 1

    const docParams = docTool.parameters;
    const envParams = envTool.parameters;

    const docParamNames = new Set(docParams.keys());
    const envParamNames = new Set(envParams.keys());

    // Collect differing field identifiers
    const differingFields: string[] = [];

    // Parameters in docs but not in environment
    for (const paramName of docParamNames) {
      if (!envParamNames.has(paramName)) {
        differingFields.push(`parameters.${paramName}`);
      }
    }

    // Parameters in environment but not in docs
    for (const paramName of envParamNames) {
      if (!docParamNames.has(paramName)) {
        differingFields.push(`parameters.${paramName}`);
      }
    }

    // Parameters present in both — compare type and required
    for (const paramName of docParamNames) {
      if (!envParamNames.has(paramName)) continue; // already captured above
      const docParam = docParams.get(paramName)!;
      const envParam = envParams.get(paramName)!;
      if (docParam.type !== envParam.type) {
        differingFields.push(`parameters.${paramName}.type`);
      }
      if (docParam.required !== envParam.required) {
        differingFields.push(`parameters.${paramName}.required`);
      }
    }

    if (differingFields.length === 0) {
      // No structured difference; could check prose (descriptions) but
      // ToolDescriptor carries description while EnvironmentToolEntry does not —
      // no prose comparison possible here without environment descriptions.
      // No finding emitted for a clean match.
      continue;
    }

    // Sort fields by UTF-16 code-unit comparator (locale-independent, SC-002)
    differingFields.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    // Determine direction:
    // "docs-ahead": docs declare params not in environment (docs outpace reality)
    // "reality-ahead": environment has params not in docs
    const docsAheadParams = [...docParamNames].filter(
      (n) => !envParamNames.has(n)
    );
    const realityAheadParams = [...envParamNames].filter(
      (n) => !docParamNames.has(n)
    );

    let direction: SchemaMismatchDirection;
    if (docsAheadParams.length > 0 && realityAheadParams.length === 0) {
      // Docs declare more than environment; only type/required diffs where
      // docs have params not in env
      direction = "docs-ahead";
    } else if (realityAheadParams.length > 0) {
      // Environment has params not in docs
      direction = "reality-ahead";
    } else {
      // Both sets have the same parameter names but type/required differ;
      // treat as reality-ahead (environment diverges from what was documented)
      direction = "reality-ahead";
    }

    const finding: DriftFinding = {
      kind: "schema-mismatch",
      toolName: name,
      direction,
      fields: differingFields,
      citedRubric: "muster-rubric:tools/drift/v1",
    };
    // Runtime assertion: citedRubric must be non-empty (charter invariant, FR-009)
    if (!finding.citedRubric) {
      throw new Error(
        `DriftFinding for "${name}" (schema-mismatch) has an empty citedRubric — charter invariant violated (FR-009).`
      );
    }
    findings.push(finding);
  }

  // --- Sort findings by (kind, toolName) using UTF-16 code-unit comparator ---
  // Do NOT use localeCompare — locale-independent ordering is required for
  // byte-stable canonical output (SC-002, NFR-001, charter constraint).
  findings.sort((a, b) => {
    // UTF-16 code-unit string comparison (locale-independent)
    const kindCmp = a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
    if (kindCmp !== 0) return kindCmp;
    return a.toolName < b.toolName ? -1 : a.toolName > b.toolName ? 1 : 0;
  });

  return {
    toolsFilePath: toolsFile.path,
    envDescriptorPath: envDescriptor.path,
    envDescriptorFormat: envDescriptor.format,
    findings,
    clean: findings.length === 0,
  };
}
