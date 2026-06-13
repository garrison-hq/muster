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
 * UTF-16 code-unit string comparator (locale-independent, byte-stable).
 * Returns -1, 0, or 1. Use instead of nested ternaries (S3358) and
 * instead of localeCompare (SC-002, NFR-001).
 */
function compareStrings(a: string, b: string): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
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
 * Parse a single MCP manifest tool item into an EnvironmentToolEntry, or
 * return null if the item is not a valid MCP tool entry.
 */
function parseMcpToolItem(
  item: unknown
): { name: string; entry: EnvironmentToolEntry } | null {
  if (typeof item !== "object" || item === null) return null;
  const entry = item as Record<string, unknown>;
  const name = typeof entry["name"] === "string" ? entry["name"] : null;
  if (!name) return null;

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

  return { name, entry: { name, parameters: extractParameters(properties, required) } };
}

/**
 * Parse MCP manifest tools array into EnvironmentToolEntry records.
 */
function parseMcpTools(
  toolsArray: unknown[]
): Map<string, EnvironmentToolEntry> {
  const map = new Map<string, EnvironmentToolEntry>();
  for (const item of toolsArray) {
    const parsed = parseMcpToolItem(item);
    if (parsed !== null) {
      map.set(parsed.name, parsed.entry);
    }
  }
  return map;
}

/**
 * Parse a single OpenAI tool registry item into an EnvironmentToolEntry, or
 * return null if the item is not a valid OpenAI function tool entry.
 */
function parseOpenAiToolItem(
  item: unknown
): { name: string; entry: EnvironmentToolEntry } | null {
  if (typeof item !== "object" || item === null) return null;
  const entry = item as Record<string, unknown>;
  if (entry["type"] !== "function") return null;

  const fn =
    typeof entry["function"] === "object" && entry["function"] !== null
      ? (entry["function"] as Record<string, unknown>)
      : null;
  if (!fn) return null;

  const name = typeof fn["name"] === "string" ? fn["name"] : null;
  if (!name) return null;

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

  return { name, entry: { name, parameters: extractParameters(properties, required) } };
}

/**
 * Parse OpenAI tool registry tools array into EnvironmentToolEntry records.
 */
function parseOpenAiTools(
  toolsArray: unknown[]
): Map<string, EnvironmentToolEntry> {
  const map = new Map<string, EnvironmentToolEntry>();
  for (const item of toolsArray) {
    const parsed = parseOpenAiToolItem(item);
    if (parsed !== null) {
      map.set(parsed.name, parsed.entry);
    }
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

/** Charter rubric constant — every DriftFinding must cite this (FR-009). */
const DRIFT_RUBRIC = "muster-rubric:tools/drift/v1";

/**
 * Build a simple (non-schema-mismatch) DriftFinding.
 *
 * citedRubric is DRIFT_RUBRIC (a non-empty compile-time constant), satisfying
 * the charter invariant (FR-009) at construction without a runtime check.
 */
function buildSimpleFinding(
  kind: "documented-but-missing" | "present-but-undocumented",
  toolName: string
): DriftFinding {
  return { kind, toolName, citedRubric: DRIFT_RUBRIC };
}

/**
 * Pass 1: Emit documented-but-missing findings for every documented tool
 * that is absent from the environment.
 */
function collectMissingFindings(
  documentedMap: Map<string, unknown>,
  envNames: Set<string>
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  for (const [name] of documentedMap) {
    if (!envNames.has(name)) {
      findings.push(buildSimpleFinding("documented-but-missing", name));
    }
  }
  return findings;
}

/**
 * Pass 2: Emit present-but-undocumented findings for every environment tool
 * that is absent from the documentation.
 */
function collectUndocumentedFindings(
  envDescriptor: EnvironmentDescriptor,
  documentedMap: Map<string, unknown>
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  for (const [name] of envDescriptor.tools) {
    if (!documentedMap.has(name)) {
      findings.push(buildSimpleFinding("present-but-undocumented", name));
    }
  }
  return findings;
}

/**
 * Collect the set of differing field identifiers between documented and
 * environment parameters for a single tool.
 *
 * Returns a sorted (UTF-16 code-unit, SC-002) array of field path strings,
 * or an empty array when the schemas are identical.
 */
function collectDiffFields(
  docParams: ReadonlyMap<string, ParameterDescriptor>,
  envParams: ReadonlyMap<string, ParameterDescriptor>
): string[] {
  const docParamNames = new Set(docParams.keys());
  const envParamNames = new Set(envParams.keys());
  const fields: string[] = [];

  for (const paramName of docParamNames) {
    if (!envParamNames.has(paramName)) {
      fields.push(`parameters.${paramName}`);
    }
  }
  for (const paramName of envParamNames) {
    if (!docParamNames.has(paramName)) {
      fields.push(`parameters.${paramName}`);
    }
  }
  for (const paramName of docParamNames) {
    if (!envParamNames.has(paramName)) continue;
    const docParam = docParams.get(paramName)!;
    const envParam = envParams.get(paramName)!;
    if (docParam.type !== envParam.type) {
      fields.push(`parameters.${paramName}.type`);
    }
    if (docParam.required !== envParam.required) {
      fields.push(`parameters.${paramName}.required`);
    }
  }

  fields.sort(compareStrings);
  return fields;
}

/**
 * Determine the schema-mismatch direction from the two disjoint param-name sets.
 *
 * - "docs-ahead": docs declare params not in the environment.
 * - "reality-ahead": environment has params not in docs, or only type/required differ.
 */
function determineMismatchDirection(
  docParamNames: Set<string>,
  envParamNames: Set<string>
): SchemaMismatchDirection {
  const docsAheadCount = [...docParamNames].filter(
    (n) => !envParamNames.has(n)
  ).length;
  const realityAheadCount = [...envParamNames].filter(
    (n) => !docParamNames.has(n)
  ).length;
  if (docsAheadCount > 0 && realityAheadCount === 0) {
    return "docs-ahead";
  }
  // environment has params not in docs, or only type/required differ
  return "reality-ahead";
}

/**
 * Pass 3: Emit schema-mismatch findings for every tool that appears in both
 * the documentation and the environment but whose parameter schemas differ.
 */
function collectSchemaMismatchFindings(
  documentedMap: Map<string, import("./lint.js").ToolDescriptor>,
  envDescriptor: EnvironmentDescriptor
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  for (const [name, docTool] of documentedMap) {
    const envTool = envDescriptor.tools.get(name);
    if (!envTool) continue; // Already handled in Pass 1

    const fields = collectDiffFields(docTool.parameters, envTool.parameters);
    if (fields.length === 0) {
      // No structured difference — no finding emitted for a clean match.
      continue;
    }

    const direction = determineMismatchDirection(
      new Set(docTool.parameters.keys()),
      new Set(envTool.parameters.keys())
    );

    // citedRubric is DRIFT_RUBRIC (non-empty compile-time constant) — FR-009 invariant satisfied.
    findings.push({ kind: "schema-mismatch", toolName: name, direction, fields, citedRubric: DRIFT_RUBRIC });
  }
  return findings;
}

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
  // Build documented tool set (name → ToolDescriptor)
  const documentedMap = new Map(toolsFile.tools.map((t) => [t.name, t]));
  // Build environment tool name set
  const envNames = new Set(envDescriptor.tools.keys());

  const findings: DriftFinding[] = [
    ...collectMissingFindings(documentedMap, envNames),
    ...collectUndocumentedFindings(envDescriptor, documentedMap),
    ...collectSchemaMismatchFindings(documentedMap, envDescriptor),
  ];

  // Sort by (kind, toolName) using UTF-16 code-unit comparator (SC-002, NFR-001).
  // Do NOT use localeCompare — locale-dependent and breaks byte-stable output.
  findings.sort((a, b) => {
    const kindCmp = compareStrings(a.kind, b.kind);
    if (kindCmp !== 0) return kindCmp;
    return compareStrings(a.toolName, b.toolName);
  });

  return {
    toolsFilePath: toolsFile.path,
    envDescriptorPath: envDescriptor.path,
    envDescriptorFormat: envDescriptor.format,
    findings,
    clean: findings.length === 0,
  };
}
