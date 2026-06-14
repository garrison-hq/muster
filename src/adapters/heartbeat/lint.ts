/**
 * HEARTBEAT.md parser, item-recurrence manifest loader, and static lint.
 *
 * Implements FR-002 (parse + manifest), FR-003 (static lint), FR-010 (machine-
 * readable report with citations), and NFR-001 (byte-stable deterministic output).
 *
 * Static lint output MUST be byte-stable and deterministic: identical bytes
 * across repeated runs on the same fixture. Key enforcement points:
 * - Findings are sorted by rule using UTF-16 code-unit ordering (no localeCompare).
 * - JSON serialisation uses explicit key ordering with JSON.stringify.
 * - No locale-dependent behaviour anywhere in this module.
 */

import { readFileSync } from "node:fs";
import { canonicalJson } from "../../core/canonical-json.js";

// ---------------------------------------------------------------------------
// Citation constants (C-003, FR-010)
//
// The SHA below is the x-amz-meta-openclaw-sha256 content hash returned by
// https://docs.openclaw.ai/gateway/heartbeat on 2026-06-13 (the canonical
// CloudFront/R2 content-hash; the private repository does not publish commit
// SHAs publicly). This hash pins the exact doc revision cited.
//   x-amz-meta-openclaw-sha256: f32e439dc6248942bc2c10fca2ad2d3a4e9761b2569edb7232006e64d1c92a8d
// ---------------------------------------------------------------------------

const OPENCLAW_HEARTBEAT_SHA =
  "f32e439dc6248942bc2c10fca2ad2d3a4e9761b2569edb7232006e64d1c92a8d";

export const CITATIONS = {
  "heartbeat/empty-file-skip": `OpenClaw heartbeat docs, content-SHA ${OPENCLAW_HEARTBEAT_SHA} — "an empty or comment-only file skips the run (reason=empty-heartbeat-file)"`,
  "heartbeat/length-advisory": `muster rubric §heartbeat-length — "keep HEARTBEAT.md short to avoid token burn"`,
} as const;

// ---------------------------------------------------------------------------
// Length thresholds for the length-advisory lint rule (FR-003, FR-010)
// Thresholds per muster rubric §heartbeat-length (cited above).
// ---------------------------------------------------------------------------

/** Maximum number of lines before a length advisory is emitted. */
const RUBRIC_MAX_LINES = 50;
/** Maximum number of UTF-16 characters before a length advisory is emitted. */
const RUBRIC_MAX_CHARS = 2000;

// ---------------------------------------------------------------------------
// Domain types (data-model.md)
// ---------------------------------------------------------------------------

/** One instruction extracted from HEARTBEAT.md. */
export interface ChecklistItem {
  /** Stable ordinal identifier within the file, e.g. "item-1". */
  id: string;
  /** The instruction text as written in the file. */
  text: string;
  /**
   * Declared recurrence. Set by applyManifest(); undefined at parse time.
   * Only 'once-only' items drive idempotency grading (FR-005, data-model).
   */
  recurrence?: "once-only" | "recurring";
}

/**
 * The typed domain entity for HEARTBEAT.md (data-model.md §HEARTBEAT.md).
 *
 * isEmpty semantics follow OpenClaw heartbeat docs (content-SHA recorded in
 * CITATIONS['heartbeat/empty-file-skip']). An empty or comment-only file
 * causes the heartbeat run to be skipped entirely.
 */
export interface HeartbeatFile {
  path: string;
  raw: string;
  items: ChecklistItem[];
  isEmpty: boolean;
}

// ---------------------------------------------------------------------------
// T001 — Parse HEARTBEAT.md; isEmpty detection (FR-002)
// ---------------------------------------------------------------------------

/**
 * Strip all Markdown comment blocks (<!-- ... -->) from text.
 * Handles multi-line comments.
 */
function stripComments(raw: string): string {
  return raw.replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Parse raw HEARTBEAT.md content into a typed HeartbeatFile.
 *
 * isEmpty semantics follow OpenClaw heartbeat docs (pinned SHA recorded in
 * CITATIONS['heartbeat/empty-file-skip']). An empty or comment-only file
 * causes the heartbeat run to be skipped entirely.
 *
 * isEmpty is true when raw is empty or contains only whitespace and Markdown
 * comment blocks (<!-- ... -->). A file with a single real instruction
 * (non-whitespace, non-comment line) is NOT empty even if all other lines are
 * blank or comments — this is the spec edge case documented in data-model.md.
 */
/**
 * Extract the instruction text from a single non-empty, non-heading, non-comment line.
 * Returns the text string, or null when the line should be skipped.
 *
 * Handles checklist markers (- [ ], - [x], - [X], bare - or * prefix) and
 * bare non-list lines. Regex capture starts with \S to avoid catastrophic
 * backtracking (S5852 safe).
 */
function extractLineText(trimmed: string): string | null {
  const checkboxMatch = /^-\s+\[[ xX]\]\s+(\S.*)$/.exec(trimmed);
  if (checkboxMatch) {
    return checkboxMatch[1].trim();
  }
  if (trimmed.startsWith("- ")) {
    return trimmed.slice(2).trim();
  }
  if (trimmed.startsWith("* ")) {
    return trimmed.slice(2).trim();
  }
  // Bare non-blank, non-comment, non-heading line.
  return trimmed;
}

export function parseHeartbeat(path: string, raw: string): HeartbeatFile {
  // Determine isEmpty: strip comments and check if only whitespace remains.
  const stripped = stripComments(raw);
  const isEmpty = stripped.trim().length === 0;

  if (isEmpty) {
    return { path, raw, items: [], isEmpty: true };
  }

  // Parse checklist items from the raw content (not stripped — we parse
  // checklist markers from the original text, ignoring comment blocks).
  const items: ChecklistItem[] = [];
  let ordinal = 0;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();

    // Skip empty lines, pure comment lines, Markdown headings.
    if (trimmed === "") continue;
    if (trimmed.startsWith("<!--")) continue;
    if (trimmed.startsWith("#")) continue;

    const text = extractLineText(trimmed);
    if (text && text.length > 0) {
      ordinal++;
      items.push({ id: `item-${ordinal}`, text });
    }
  }

  return { path, raw, items, isEmpty: false };
}

// ---------------------------------------------------------------------------
// T002 — Item-recurrence manifest loader (FR-002)
// ---------------------------------------------------------------------------

export type Recurrence = "once-only" | "recurring";

export interface ManifestEntry {
  itemId: string;
  recurrence: Recurrence;
}

export interface RecurrenceManifest {
  checklistPath: string;
  items: ManifestEntry[];
}

/** Thrown when the manifest JSON is malformed or fails schema validation. */
export class ManifestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestValidationError";
  }
}

/**
 * Load and validate a JSON item-recurrence manifest from disk.
 *
 * @throws ManifestValidationError if the file is missing, not valid JSON, or
 *   fails the structural validation (every entry must have itemId: string and
 *   recurrence: 'once-only' | 'recurring').
 */
export function loadManifest(manifestPath: string): RecurrenceManifest {
  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf-8");
  } catch (err) {
    throw new ManifestValidationError(
      `Cannot read manifest at ${manifestPath}: ${String(err)}`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    throw new ManifestValidationError(
      `Manifest at ${manifestPath} is not valid JSON`
    );
  }

  return validateManifestData(data, manifestPath);
}

/**
 * Validate a plain-object manifest (useful for inline test objects).
 * Exported for testing.
 */
export function validateManifestData(
  data: unknown,
  sourcePath: string
): RecurrenceManifest {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ManifestValidationError(
      `Manifest at ${sourcePath} must be a JSON object`
    );
  }

  const obj = data as Record<string, unknown>;
  const checklistPath =
    typeof obj["checklistPath"] === "string" ? obj["checklistPath"] : "";

  if (!Array.isArray(obj["items"])) {
    throw new ManifestValidationError(
      `Manifest at ${sourcePath} must have an "items" array`
    );
  }

  const items: ManifestEntry[] = [];
  for (let i = 0; i < (obj["items"] as unknown[]).length; i++) {
    const entry = (obj["items"] as unknown[])[i];
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new ManifestValidationError(
        `Manifest at ${sourcePath} items[${i}] must be an object`
      );
    }
    const e = entry as Record<string, unknown>;
    if (typeof e["itemId"] !== "string") {
      throw new ManifestValidationError(
        `Manifest at ${sourcePath} items[${i}].itemId must be a string`
      );
    }
    if (e["recurrence"] !== "once-only" && e["recurrence"] !== "recurring") {
      throw new ManifestValidationError(
        `Manifest at ${sourcePath} items[${i}].recurrence must be 'once-only' or 'recurring'`
      );
    }
    items.push({ itemId: e["itemId"], recurrence: e["recurrence"] });
  }

  return { checklistPath, items };
}

/**
 * Apply a RecurrenceManifest to a HeartbeatFile, annotating each ChecklistItem
 * with its declared recurrence. Items with no matching manifest entry default
 * to 'recurring' (safe default — they will not affect idempotency grading).
 *
 * Returns a NEW HeartbeatFile (does not mutate the input, data-model invariant).
 */
export function applyManifest(
  file: HeartbeatFile,
  manifest: RecurrenceManifest
): HeartbeatFile {
  // Build lookup map by itemId.
  const lookup = new Map<string, Recurrence>();
  for (const entry of manifest.items) {
    lookup.set(entry.itemId, entry.recurrence);
  }

  const annotatedItems: ChecklistItem[] = file.items.map((item) => ({
    ...item,
    recurrence: lookup.get(item.id) ?? "recurring",
  }));

  return { ...file, items: annotatedItems };
}

// ---------------------------------------------------------------------------
// T004 — Static lint types + lintHeartbeat (FR-003, FR-010, NFR-001)
// ---------------------------------------------------------------------------

export type LintSeverity = "advisory" | "info";

export interface LintFinding {
  rule: string;
  severity: LintSeverity;
  message: string;
  citation: string;
  location?: { line?: number };
}

export interface LintReport {
  path: string;
  ok: boolean;
  isEmpty: boolean;
  itemCount: number;
  findings: LintFinding[];
}

/**
 * Run static lint checks on a HeartbeatFile and return a LintReport.
 *
 * Checks:
 * 1. heartbeat/empty-file-skip (info): empty or comment-only file — the
 *    heartbeat run will be skipped per OpenClaw docs. ok remains true
 *    (skip is documented, not a failure).
 * 2. heartbeat/length-advisory (advisory): file exceeds rubric thresholds
 *    (> RUBRIC_MAX_LINES lines or > RUBRIC_MAX_CHARS characters).
 *    ok remains true; advisory is non-blocking by default.
 *
 * Output is byte-stable: findings are sorted by rule using UTF-16 code-unit
 * ordering (no localeCompare, charter NFR-001).
 */
export function lintHeartbeat(file: HeartbeatFile): LintReport {
  const findings: LintFinding[] = [];

  // Check 1: empty/comment-only file skip (FR-003, C-003).
  if (file.isEmpty) {
    findings.push({
      rule: "heartbeat/empty-file-skip",
      severity: "info",
      message:
        "File is empty or comment-only — the heartbeat run will be skipped per OpenClaw docs.",
      citation: CITATIONS["heartbeat/empty-file-skip"],
    });
  }

  // Check 2: length/"token burn" advisory (FR-003, FR-010).
  const lineCount = file.raw.split("\n").length;
  const charCount = file.raw.length;
  if (!file.isEmpty && (lineCount > RUBRIC_MAX_LINES || charCount > RUBRIC_MAX_CHARS)) {
    findings.push({
      rule: "heartbeat/length-advisory",
      severity: "advisory",
      message:
        "HEARTBEAT.md exceeds the recommended length — long files increase token burn per the muster rubric.",
      citation: CITATIONS["heartbeat/length-advisory"],
    });
  }

  // Sort findings by rule string using UTF-16 code-unit ordering (NFR-001).
  // DO NOT use localeCompare — it is locale-dependent and breaks byte-stability.
  findings.sort((a, b) => {
    if (a.rule < b.rule) return -1;
    if (a.rule > b.rule) return 1;
    return 0;
  });

  // ok is true when there are no 'advisory' or higher-severity findings.
  // 'info' findings are informational only and do not set ok: false.
  const ok = findings.every((f) => f.severity === "info");

  return {
    path: file.path,
    ok,
    isEmpty: file.isEmpty,
    itemCount: file.items.length,
    findings,
  };
}

// ---------------------------------------------------------------------------
// T005 — Machine-readable report serialiser (NFR-001, FR-010)
// ---------------------------------------------------------------------------

/**
 * Serialize a LintReport to a canonical, byte-stable JSON string.
 *
 * Uses the core RFC 8785 canonicalJson helper (FR-001 "reuse canonical-JSON").
 * Object keys are sorted by UTF-16 code-unit ordering — so the report output
 * key order is: findings, isEmpty, itemCount, ok, path.
 * Each finding key order: citation, location (if present), message, rule, severity.
 *
 * Output is byte-identical across:
 * - Repeated calls with the same input
 * - Different machines (no locale-dependent behaviour)
 * - Different Node.js minor versions in the supported range (>=22)
 */
export function serializeLintReport(report: LintReport): string {
  const findingsJson = report.findings.map((f) => {
    const finding: Record<string, unknown> = {
      citation: f.citation,
      message: f.message,
      rule: f.rule,
      severity: f.severity,
    };
    if (f.location !== undefined) {
      finding["location"] = f.location;
    }
    return finding;
  });

  // canonicalJson sorts keys by UTF-16 code units (RFC 8785, NFR-001).
  const output = {
    findings: findingsJson,
    isEmpty: report.isEmpty,
    itemCount: report.itemCount,
    ok: report.ok,
    path: report.path,
  };

  return canonicalJson(output);
}
