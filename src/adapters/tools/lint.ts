/**
 * TOOLS.md parser and static structure linter.
 *
 * FR-002: Parse a TOOLS.md file into a TOOLSFile entity.
 * FR-003: Static lint checks — required sections, duplicate-name detection,
 *         empty-description validation.
 * FR-009: Every finding cites a muster rubric (citedRubric is never absent).
 * NFR-001: Byte-stable canonical JSON output via src/core/canonical-json.ts.
 *
 * Charter constraints:
 * - Offline static path: no network calls; deterministic output.
 * - Locale-independent section normalization: .toLowerCase().trim() only.
 *   Do NOT use .toLocaleLowerCase() — that is locale-dependent and breaks
 *   byte-stable canonical output on machines with non-English locales.
 * - Every finding must cite a muster rubric via citedRubric.
 * - Byte-stable canonical JSON: identical output across runs and machines.
 */

import { readFile } from "node:fs/promises";
import { canonicalJson } from "../../core/canonical-json.js";

// ---------------------------------------------------------------------------
// T001 — Type declarations
// ---------------------------------------------------------------------------

/**
 * A single parameter as documented in TOOLS.md.
 */
export interface ParameterDescriptor {
  /** JSON Schema type string as documented (e.g. "string", "integer", …). */
  readonly type: string;
  /** Whether the parameter is required per the documentation. */
  readonly required: boolean;
}

/**
 * A single tool as documented in TOOLS.md.
 *
 * Invariants:
 * - `parameters` is an empty Map (never null/undefined) when no parameters
 *   are documented.
 * - `name` is the match key used by the drift check's match-rubric.
 */
export interface ToolDescriptor {
  /** Tool name, exactly as documented. Must be unique within a TOOLSFile. */
  readonly name: string;
  /**
   * Prose description. Used for semantic-drift detection.
   * The linter enforces a non-empty description per the muster rubric (FR-003).
   */
  readonly description: string;
  /**
   * Structured parameter declarations as documented.
   * Keys are parameter names; values carry the declared type and required flag.
   * This is an empty Map (never null/undefined) when no parameters are documented.
   */
  readonly parameters: ReadonlyMap<string, ParameterDescriptor>;
}

/**
 * The parsed representation of a TOOLS.md file.
 *
 * Invariants:
 * - `tools` entries are ordered by declaration position in the file (top to bottom).
 * - Duplicate `name` values within `tools` are a static-lint error, not a parse
 *   error — the parser surfaces them; the linter rejects them.
 * - `sections` keys are normalised to lower-case trimmed heading text for
 *   locale-independent comparison. Use .toLowerCase().trim() — never .toLocaleLowerCase().
 */
export interface TOOLSFile {
  /** Absolute or runner-relative path to the source file. */
  readonly path: string;
  /** Ordered list of tool descriptors extracted from the file. */
  readonly tools: readonly ToolDescriptor[];
  /**
   * Raw section inventory used by static lint.
   * Keys are normalised section headings (lower-case trimmed, locale-independent);
   * values are the extracted prose body of each section.
   */
  readonly sections: ReadonlyMap<string, string>;
}

// ---------------------------------------------------------------------------
// T003 — Lint finding types
// ---------------------------------------------------------------------------

/**
 * The set of finding kinds emitted by the static linter.
 * Extend this union if the muster rubric adds more categories (document in a comment).
 */
export type LintFindingKind =
  | "missing-required-section"
  | "duplicate-tool-name"
  | "empty-description";

/**
 * A single finding from the static lint pass.
 *
 * Charter invariant: citedRubric is NEVER absent — every finding must cite
 * a normative muster rubric source (FR-009).
 */
export interface LintFinding {
  readonly kind: LintFindingKind;
  /** Present for duplicate-tool-name and empty-description findings. */
  readonly toolName?: string;
  /** Present for missing-required-section findings. */
  readonly sectionName?: string;
  /**
   * Muster-published rubric clause that defines this finding type.
   * NEVER absent — charter invariant (FR-009).
   */
  readonly citedRubric: string;
}

/**
 * The complete output of a static lint pass on one TOOLS.md file.
 */
export interface LintReport {
  readonly toolsFilePath: string;
  readonly findings: readonly LintFinding[];
  /** true iff findings is empty. */
  readonly ok: boolean;
}

// ---------------------------------------------------------------------------
// T002 — parseTOOLSFile()
// ---------------------------------------------------------------------------

/**
 * Normalise a section heading for locale-independent comparison.
 *
 * Uses .toLowerCase().trim() — NOT .toLocaleLowerCase() — to ensure
 * identical output across machines with different locale settings.
 * This is consistent with the UTF-16 code-unit ordering used by
 * src/core/canonical-json.ts (charter constraint).
 */
function normaliseHeading(text: string): string {
  // Locale-independent: .toLowerCase() uses Unicode simple case folding,
  // which is deterministic regardless of system locale.
  return text.toLowerCase().trim();
}

/**
 * Parse a Markdown parameters table into a Map of ParameterDescriptor.
 *
 * Expected table format (from the fixture spec):
 * | Name | Type | Required |
 * |------|------|----------|
 * | param | string | true |
 */
function parseParametersTable(tableLines: string[]): Map<string, ParameterDescriptor> {
  const params = new Map<string, ParameterDescriptor>();
  // Skip header row and separator row (first two lines after the heading)
  let dataStart = 0;
  for (let i = 0; i < tableLines.length; i++) {
    const line = tableLines[i] ?? "";
    // Separator row contains only |, -, and spaces
    if (/^\|[\s|:-]+\|?\s*$/.test(line)) {
      dataStart = i + 1;
      break;
    }
  }
  for (let i = dataStart; i < tableLines.length; i++) {
    const line = (tableLines[i] ?? "").trim();
    if (!line.startsWith("|")) break;
    // Split on | and filter empty segments from leading/trailing |
    const cells = line.split("|").map((c) => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
    if (cells.length < 3) continue;
    const name = cells[0] ?? "";
    const type = cells[1] ?? "string";
    const requiredRaw = (cells[2] ?? "false").toLowerCase();
    const required = requiredRaw === "true";
    if (name) {
      params.set(name, { type, required });
    }
  }
  return params;
}

/**
 * Extract ToolDescriptor entries from a section body string.
 *
 * Each tool is identified by a level-3 heading (### tool_name), followed
 * by a prose description paragraph, and optionally a #### Parameters
 * sub-heading with a Markdown table.
 */
function extractToolsFromBody(body: string): ToolDescriptor[] {
  const tools: ToolDescriptor[] = [];
  const lines = body.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    // Match level-3 heading: ### tool_name
    const toolHeadingMatch = /^###\s+(\S+)\s*$/.exec(line);
    if (toolHeadingMatch) {
      const name = toolHeadingMatch[1] ?? "";
      i++;

      // Collect description lines (non-empty, non-heading lines)
      const descLines: string[] = [];
      while (i < lines.length) {
        const l = lines[i] ?? "";
        if (l.startsWith("###") || l.startsWith("## ")) {
          // Hit next tool or section heading — stop
          break;
        }
        if (l.startsWith("####")) {
          // Hit sub-heading (e.g. #### Parameters) — stop collecting desc
          break;
        }
        if (l.trim()) {
          // Skip table lines (they belong to description only if before Parameters)
          if (!l.trim().startsWith("|")) {
            descLines.push(l.trim());
          }
        }
        i++;
      }

      // Check for #### Parameters sub-heading
      let parameters = new Map<string, ParameterDescriptor>();
      if (i < lines.length && (lines[i] ?? "").startsWith("####")) {
        const subHeading = normaliseHeading((lines[i] ?? "").replace(/^#+\s*/, ""));
        if (subHeading === "parameters") {
          i++;
          // Collect table lines
          const tableLines: string[] = [];
          while (i < lines.length) {
            const l = lines[i] ?? "";
            if (l.startsWith("###") || l.startsWith("## ") || l.startsWith("####")) {
              break;
            }
            tableLines.push(l);
            i++;
          }
          parameters = parseParametersTable(tableLines);
        }
      }

      tools.push({
        name,
        description: descLines.join(" ").trim(),
        parameters,
      });
    } else {
      i++;
    }
  }

  return tools;
}

/**
 * Parse a TOOLS.md file from disk into a TOOLSFile entity.
 *
 * FR-002: Reads the file and builds:
 * - `sections`: a Map keyed by normalised (lower-case trimmed) heading text
 * - `tools`: an ordered array of ToolDescriptor extracted from the Tools section
 *
 * The parser surfaces duplicate tool names — deduplication is the linter's job.
 * No network calls are made; the path must be accessible on disk.
 */
export async function parseTOOLSFile(filePath: string): Promise<TOOLSFile> {
  const raw = await readFile(filePath, "utf-8");
  const lines = raw.split("\n");

  // Build section map: split on level-2 headings (## heading)
  const sections = new Map<string, string>();
  let currentSectionKey: string | null = null;
  const currentSectionLines: string[] = [];

  for (const line of lines) {
    const h2Match = /^##\s+(.+)$/.exec(line);
    if (h2Match) {
      // Save previous section if any
      if (currentSectionKey !== null) {
        sections.set(currentSectionKey, currentSectionLines.join("\n").trim());
        currentSectionLines.length = 0;
      }
      // Normalise: locale-independent lower-case + trim (charter constraint)
      currentSectionKey = normaliseHeading(h2Match[1] ?? "");
    } else if (currentSectionKey !== null) {
      currentSectionLines.push(line);
    }
  }
  // Save last section
  if (currentSectionKey !== null) {
    sections.set(currentSectionKey, currentSectionLines.join("\n").trim());
  }

  // Extract tools from the "tools" section body
  const toolsSectionBody = sections.get("tools") ?? "";
  const tools = extractToolsFromBody(toolsSectionBody);

  return {
    path: filePath,
    tools,
    sections,
  };
}

// ---------------------------------------------------------------------------
// T003 — lintTOOLSFile()
// ---------------------------------------------------------------------------

/**
 * Required sections per the muster rubric for TOOLS.md files.
 * Muster rubric: muster-rubric:tools/required-sections/v1
 */
const REQUIRED_SECTIONS = ["overview", "tools"] as const;

/**
 * Run static lint checks on a parsed TOOLSFile.
 *
 * Checks (FR-003):
 * 1. Required sections: "overview" and "tools" must be present.
 *    Cited rubric: muster-rubric:tools/required-sections/v1
 * 2. Duplicate tool names: no two ToolDescriptors may share the same name.
 *    Cited rubric: muster-rubric:tools/unique-names/v1
 * 3. Empty descriptions: every ToolDescriptor must have a non-empty description.
 *    Cited rubric: muster-rubric:tools/non-empty-description/v1
 *
 * Charter invariant: every LintFinding carries a non-empty citedRubric (FR-009).
 */
export function lintTOOLSFile(file: TOOLSFile): LintReport {
  const findings: LintFinding[] = [];

  // Check 1: Required sections
  for (const required of REQUIRED_SECTIONS) {
    if (!file.sections.has(required)) {
      findings.push({
        kind: "missing-required-section",
        sectionName: required,
        citedRubric: "muster-rubric:tools/required-sections/v1",
      });
    }
  }

  // Check 2: Duplicate tool names
  const seenNames = new Set<string>();
  const reportedDuplicates = new Set<string>();
  for (const tool of file.tools) {
    if (seenNames.has(tool.name)) {
      // Only report each duplicate name once to avoid redundant findings
      if (!reportedDuplicates.has(tool.name)) {
        findings.push({
          kind: "duplicate-tool-name",
          toolName: tool.name,
          citedRubric: "muster-rubric:tools/unique-names/v1",
        });
        reportedDuplicates.add(tool.name);
      }
    } else {
      seenNames.add(tool.name);
    }
  }

  // Check 3: Empty descriptions
  for (const tool of file.tools) {
    if (!tool.description || !tool.description.trim()) {
      findings.push({
        kind: "empty-description",
        toolName: tool.name,
        citedRubric: "muster-rubric:tools/non-empty-description/v1",
      });
    }
  }

  return {
    toolsFilePath: file.path,
    findings,
    ok: findings.length === 0,
  };
}

// ---------------------------------------------------------------------------
// T004 — toCanonicalJson()
// ---------------------------------------------------------------------------

/**
 * Serialise a TOOLSFile to a byte-stable canonical JSON string.
 *
 * NFR-001: Identical output across runs and machines (SC-002).
 *
 * ReadonlyMap instances are converted to plain Records (insertion order
 * preserved, ES2015+ guarantee) before passing to canonicalJson(), which
 * applies UTF-16 code-unit key ordering per RFC 8785.
 */
export function toCanonicalJson(file: TOOLSFile): string {
  // Convert ReadonlyMap<string, ParameterDescriptor> to plain Record
  const toolsPlain = Array.from(file.tools).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: Object.fromEntries(
      Array.from(tool.parameters.entries()).map(([k, v]) => [
        k,
        { type: v.type, required: v.required },
      ])
    ),
  }));

  // Convert sections ReadonlyMap to plain Record
  const sectionsPlain = Object.fromEntries(file.sections.entries());

  const plain = {
    path: file.path,
    sections: sectionsPlain,
    tools: toolsPlain,
  };

  return canonicalJson(plain);
}
