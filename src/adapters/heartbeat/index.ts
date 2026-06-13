/**
 * HeartbeatAdapter — the SpecAdapter assembly for HEARTBEAT.md conformance.
 *
 * Implements the C-004 boundary: no heartbeat-specific type is ever imported
 * by src/core/. This module is the ONLY place the CLI needs to import to plug
 * heartbeat lint into the spec-agnostic registry.
 *
 * Architecture note: HEARTBEAT.md is not a Soul.md RFC-1 document, so the
 * SpecAdapter methods (parse, validate, resolve, etc.) are stubs that satisfy
 * the interface contract. The real heartbeat conformance work is done through
 * checkHeartbeatFile(), which the CLI calls directly when --adapter heartbeat
 * is set. This mirrors the rfc1Adapter's boundary contract: composition happens
 * from outside (in the CLI), and core never imports this module.
 */

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve as resolvePath, dirname } from "node:path";
import type {
  EffectiveConfig,
  MergeStrategy,
  Mode,
  SoulDocument,
  SpecAdapter,
  ThresholdMapping,
} from "../../core/adapter.js";
import type { Violation } from "../../core/report.js";
import {
  parseHeartbeat,
  lintHeartbeat,
  serializeLintReport,
} from "./lint.js";
import type { LintReport } from "./lint.js";
import { loadIntervalConfig } from "./graders/quiet-ack.js";

// ---------------------------------------------------------------------------
// Version from package.json (mirrors rfc1Adapter pattern)
// ---------------------------------------------------------------------------

const VERSION = (
  JSON.parse(
    readFileSync(new URL("../../../package.json", import.meta.url), "utf8")
  ) as { version: string }
).version;

// ---------------------------------------------------------------------------
// Manifest runner types and runner (FR-011, T019)
// ---------------------------------------------------------------------------

/**
 * A single conformance test case entry in the heartbeat test manifest.
 * Case IDs are stable strings (hb-static-001, etc.) — not ordinals.
 * This is the candidate upstream conformance suite schema (C-005, FR-012).
 */
export interface ManifestCase {
  id: string;
  description: string;
  checklistPath: string;
  itemRecurrence: Array<{ itemId: string; recurrence: "once-only" | "recurring" }>;
  tickState: string | null;
  intervalConfig: string;
  gradingClass: "static-lint" | "interval-config" | "action-diff" | "idempotency" | "quiet-ack";
  expectation: Record<string, unknown>;
}

export interface ManifestFile {
  cases: ManifestCase[];
}

/** Result for one manifest case (pass/fail summary entry). */
export interface CaseResult {
  id: string;
  description: string;
  gradingClass: string;
  passed: boolean;
  skipped: boolean;
  skipReason?: string;
  detail?: Record<string, unknown>;
}

/** Full manifest runner summary (FR-011). Sorted by case ID (UTF-16, NFR-001). */
export interface ManifestSummary {
  totalCases: number;
  passed: number;
  failed: number;
  skipped: number;
  results: CaseResult[];
}

/**
 * Load and validate a heartbeat test manifest from a JSON file.
 *
 * @throws Error if the file is not valid JSON or missing the 'cases' array.
 */
export function loadManifestFile(manifestPath: string): ManifestFile {
  const raw = readFileSync(manifestPath, "utf-8");
  const data = JSON.parse(raw) as unknown;
  if (
    typeof data !== "object" ||
    data === null ||
    !Array.isArray((data as Record<string, unknown>)["cases"])
  ) {
    throw new Error(
      `Manifest at ${manifestPath} must be a JSON object with a 'cases' array`
    );
  }
  return data as ManifestFile;
}

/**
 * Grade a static-lint case from the manifest.
 *
 * Resolves the checklistPath relative to projectRoot, runs parseHeartbeat
 * and lintHeartbeat, and checks the result against the expectation.
 *
 * Deterministic and byte-stable: no randomness, no model calls.
 */
function gradeStaticLintCase(kase: ManifestCase, projectRoot: string): CaseResult {
  const absPath = resolvePath(projectRoot, kase.checklistPath);

  let raw: string;
  try {
    raw = readFileSync(absPath, "utf-8");
  } catch {
    return {
      id: kase.id,
      description: kase.description,
      gradingClass: kase.gradingClass,
      passed: false,
      skipped: false,
      detail: { error: `Cannot read checklist file: ${absPath}` },
    };
  }

  const heartbeatFile = parseHeartbeat(absPath, raw);
  const report = lintHeartbeat(heartbeatFile);

  const exp = kase.expectation;
  let passed = true;

  // Check ok expectation (when specified).
  if ("ok" in exp && exp["ok"] !== undefined) {
    if (report.ok !== exp["ok"]) passed = false;
  }

  // Check isEmpty expectation (when specified).
  if ("isEmpty" in exp && exp["isEmpty"] !== undefined) {
    if (report.isEmpty !== exp["isEmpty"]) passed = false;
  }

  // Check that a specific rule is present in findings.
  if ("hasRule" in exp && typeof exp["hasRule"] === "string") {
    const hasRule = report.findings.some((f) => f.rule === exp["hasRule"]);
    if (!hasRule) passed = false;
  }

  // Check that findings array is empty (when expectation says findings: []).
  if (
    "findings" in exp &&
    Array.isArray(exp["findings"]) &&
    (exp["findings"] as unknown[]).length === 0
  ) {
    if (report.findings.length !== 0) passed = false;
  }

  return {
    id: kase.id,
    description: kase.description,
    gradingClass: kase.gradingClass,
    passed,
    skipped: false,
    detail: {
      ok: report.ok,
      isEmpty: report.isEmpty,
      itemCount: report.itemCount,
      findingRules: report.findings.map((f) => f.rule),
    },
  };
}

/**
 * Grade an interval-config case from the manifest.
 *
 * Resolves the intervalConfig path relative to projectRoot and checks the
 * IntervalConfig result matches the expectation (assumed, intervalMinutes).
 */
function gradeIntervalConfigCase(kase: ManifestCase, projectRoot: string): CaseResult {
  const absPath = resolvePath(projectRoot, kase.intervalConfig);
  const config = loadIntervalConfig(absPath);

  const exp = kase.expectation;
  let passed = true;

  if ("assumed" in exp && exp["assumed"] !== undefined) {
    if (config.assumed !== exp["assumed"]) passed = false;
  }
  if ("intervalMinutes" in exp && typeof exp["intervalMinutes"] === "number") {
    if (config.intervalMinutes !== exp["intervalMinutes"]) passed = false;
  }

  return {
    id: kase.id,
    description: kase.description,
    gradingClass: kase.gradingClass,
    passed,
    skipped: false,
    detail: {
      intervalMinutes: config.intervalMinutes,
      assumed: config.assumed,
    },
  };
}

/**
 * Run all cases in a heartbeat test manifest and return a deterministic
 * pass/fail summary sorted by case ID (UTF-16 code-unit ordering, NFR-001).
 *
 * Behavioral cases (action-diff, idempotency, quiet-ack) are skipped when
 * MUSTER_ENDPOINT is not set (pass^k grading requires a BYOM endpoint).
 * Static and interval-config cases run synchronously without an endpoint.
 *
 * @param manifestPath - Absolute or project-relative path to manifest.json.
 * @param projectRoot  - Root directory for resolving relative fixture paths.
 *                       Defaults to the manifest file's parent directory.
 */
export function runManifest(
  manifestPath: string,
  projectRoot?: string
): ManifestSummary {
  const absManifest = resolvePath(manifestPath);
  const root = projectRoot ?? dirname(absManifest);

  const manifest = loadManifestFile(absManifest);
  const hasMusterEndpoint = Boolean(process.env["MUSTER_ENDPOINT"]);

  const results: CaseResult[] = manifest.cases.map((kase): CaseResult => {
    switch (kase.gradingClass) {
      case "static-lint":
        return gradeStaticLintCase(kase, root);
      case "interval-config":
        return gradeIntervalConfigCase(kase, root);
      case "action-diff":
      case "idempotency":
      case "quiet-ack":
        if (!hasMusterEndpoint) {
          return {
            id: kase.id,
            description: kase.description,
            gradingClass: kase.gradingClass,
            passed: false,
            skipped: true,
            skipReason: `MUSTER_ENDPOINT not set — behavioral case requires a BYOM endpoint`,
          };
        }
        // Behavioral endpoint execution is out of scope for the static suite runner.
        return {
          id: kase.id,
          description: kase.description,
          gradingClass: kase.gradingClass,
          passed: false,
          skipped: true,
          skipReason: `Behavioral endpoint execution not yet implemented in this runner`,
        };
      default: {
        const exhaustiveCheck: never = kase.gradingClass;
        return {
          id: kase.id,
          description: kase.description,
          gradingClass: String(exhaustiveCheck),
          passed: false,
          skipped: false,
          detail: { error: `Unknown gradingClass: ${String(exhaustiveCheck)}` },
        };
      }
    }
  });

  // Sort by case ID using UTF-16 code-unit ordering (NFR-001).
  // DO NOT use localeCompare — it is locale-dependent and breaks byte-stability.
  results.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const passed = results.filter((r) => !r.skipped && r.passed).length;
  const failed = results.filter((r) => !r.skipped && !r.passed).length;
  const skipped = results.filter((r) => r.skipped).length;

  return {
    totalCases: results.length,
    passed,
    failed,
    skipped,
    results,
  };
}

// ---------------------------------------------------------------------------
// HeartbeatAdapter.checkFile — the CLI-facing check entry point (T020)
// ---------------------------------------------------------------------------

/**
 * Run heartbeat lint on a file path and return the LintReport.
 *
 * This is the primary entry point for the CLI when --adapter heartbeat is set.
 * It reads the file, parses, and lints — byte-stable deterministic output
 * (NFR-001).
 */
export async function checkHeartbeatFile(filePath: string): Promise<LintReport> {
  const raw = await readFile(filePath, "utf-8");
  const heartbeatFile = parseHeartbeat(filePath, raw);
  return lintHeartbeat(heartbeatFile);
}

// ---------------------------------------------------------------------------
// SpecAdapter stubs (C-004 boundary satisfaction)
//
// HEARTBEAT.md is not a Soul.md RFC-1 document. These stubs satisfy the
// SpecAdapter interface contract so the adapter can be placed in a registry
// alongside rfc1Adapter. The CLI uses checkHeartbeatFile() instead of the
// Soul.md pipeline when --adapter heartbeat is selected.
//
// Key invariant: NO heartbeat-specific type is exported from this module
// in a way that src/core/ would need to import. The boundary is one-directional.
// ---------------------------------------------------------------------------

const HEARTBEAT_MERGE_STRATEGY: MergeStrategy = {
  scalars: "replace",
  maps: "deep",
  lists: "replace",
  typeMismatch: "replace",
  nullIsValue: true,
};

const HEARTBEAT_THRESHOLDS: ThresholdMapping = {
  maxWords(verbosity: number): number {
    return 10 + verbosity;
  },
  refusalCap: 25,
  words(s: string): number {
    return s.trim().split(/\s+/).filter(Boolean).length;
  },
};

/** The HeartbeatAdapter — satisfies SpecAdapter and the C-004 contract. */
export class HeartbeatAdapter implements SpecAdapter {
  readonly name = "heartbeat" as const;
  readonly specVersion: string = VERSION;
  readonly mergeStrategy: MergeStrategy = HEARTBEAT_MERGE_STRATEGY;
  readonly thresholds: ThresholdMapping = HEARTBEAT_THRESHOLDS;

  /** Stub parse: HEARTBEAT.md is not a Soul.md RFC-1 document. */
  parse(raw: string, path: string, _mode: Mode): SoulDocument | Violation[] {
    return { path, frontMatter: {}, body: raw, kind: "soul" };
  }

  /** Stub validate: no RFC-1 schema validation for HEARTBEAT.md. */
  validate(_doc: SoulDocument, _mode: Mode): Violation[] {
    return [];
  }

  /** Stub resolve: no Soul.md composition for HEARTBEAT.md. */
  async resolve(
    _doc: SoulDocument,
    _opts: { profile?: string; state?: string; mode: Mode },
    _loadRef: (ref: string, fromPath: string) => Promise<SoulDocument | Violation[]>
  ): Promise<EffectiveConfig | Violation[]> {
    return {};
  }

  /** Stub evaluateTriggers: no trigger evaluation for HEARTBEAT.md. */
  evaluateTriggers(
    _effective: EffectiveConfig,
    _facts: Record<string, boolean | string>,
    _mode: Mode
  ): string | Violation[] | null {
    return null;
  }
}

/** The singleton heartbeat adapter instance. */
export const heartbeatAdapter: SpecAdapter = new HeartbeatAdapter();

/** Structural conformance witness: satisfies the C-004 contract. */
const _contractCheck: SpecAdapter = heartbeatAdapter;

// Re-export serializeLintReport for CLI use (avoids the CLI importing
// from lint.ts directly — all heartbeat types flow through this module).
export { serializeLintReport };
