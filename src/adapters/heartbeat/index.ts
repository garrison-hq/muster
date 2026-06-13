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
import { makeClient } from "../../core/behavioral/client.js";
import type { ChatClient } from "../../core/behavioral/types.js";
import {
  parseHeartbeat,
  applyManifest,
  lintHeartbeat,
  serializeLintReport,
} from "./lint.js";
import type { LintReport, RecurrenceManifest } from "./lint.js";
import { loadTickState, buildScenarioFraming } from "./tick.js";
import { loadIntervalConfig } from "./graders/quiet-ack.js";
import * as ActionDiffGrader from "./graders/action-diff.js";
import * as IdempotencyGrader from "./graders/idempotency.js";
import * as QuietAckGrader from "./graders/quiet-ack.js";

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
  /**
   * For action-diff cases: the ground-truth action labels the agent must emit
   * via ACTION: lines (FR-004 observation contract). Each entry is the exact
   * label string declared in the checklist item that the model should act on.
   * When absent, the runner falls back to checklist item texts (legacy path).
   */
  intendedActions?: string[];
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

// ---------------------------------------------------------------------------
// Behavioral case runner helpers (FR-001, FR-004/005/006, FR-008)
// ---------------------------------------------------------------------------

/** Default number of runs for k-of-n aggregation when not specified. */
const DEFAULT_BEHAVIORAL_RUNS = 3;

/**
 * Build the recurrence manifest from a ManifestCase's itemRecurrence array.
 * Used to annotate checklist items with their declared recurrence before grading.
 */
function buildRecurrenceManifest(kase: ManifestCase, checklistPath: string): RecurrenceManifest {
  return {
    checklistPath,
    items: kase.itemRecurrence.map((entry) => ({
      itemId: entry.itemId,
      recurrence: entry.recurrence,
    })),
  };
}

/**
 * Run N model calls for an action-diff behavioral case.
 * Each errored run is represented as ActionDiff with passed:false (FR-008).
 * Returns the aggregated pass/fail and run-level detail.
 */
async function runActionDiffCase(
  kase: ManifestCase,
  root: string,
  client: ChatClient,
  n: number,
  k: number
): Promise<CaseResult> {
  const absChecklistPath = resolvePath(root, kase.checklistPath);
  const raw = readFileSync(absChecklistPath, "utf-8");
  const fileBase = parseHeartbeat(absChecklistPath, raw);
  const recurrenceManifest = buildRecurrenceManifest(kase, absChecklistPath);
  const checklist = applyManifest(fileBase, recurrenceManifest);

  const tickStatePath = resolvePath(root, kase.tickState as string);
  const tick = loadTickState(tickStatePath);
  const intervalConfig = loadIntervalConfig(resolvePath(root, kase.intervalConfig));
  const tickWithInterval = { ...tick, intervalConfig };
  const framing = buildScenarioFraming(checklist, tickWithInterval);

  // Use manifest-declared intendedActions when present (FR-004 observation
  // contract). Fall back to checklist item texts for cases without an explicit
  // intendedActions declaration (legacy/non-action-diff cases).
  //
  // ACTION-DIFF INDIRECTION CONTRACT (FR-004, data-model invariant):
  // The manifest's intendedActions MUST be consistent with the checklist item
  // texts shown to the model — because the model is instructed (via
  // ACTION_OBSERVATION_CONVENTION in tick.ts) to emit "ACTION: <label> where
  // <label> is the action label from the checklist item". If intendedActions
  // diverges silently from the checklist, the model cannot emit matching labels
  // and every run will fail, making the grading result meaningless.
  //
  // SAFE BECAUSE: manifest authorship is a deliberate coupling step — the
  // manifest author is responsible for keeping intendedActions aligned with
  // the checklist item texts they want to observe. The fixture-suite test
  // "action-diff intendedActions aligns with checklist item texts" documents
  // and verifies this contract for all action-diff cases in manifest.json.
  const intendedActions =
    Array.isArray(kase.intendedActions) && kase.intendedActions.length > 0
      ? kase.intendedActions
      : checklist.items.map((item) => item.text);
  const runs: ActionDiffGrader.ActionDiff[] = [];

  for (let i = 0; i < n; i++) {
    let agentResponse: string;
    try {
      agentResponse = await client.chat(
        [{ role: "user", content: framing }],
        {}
      );
    } catch {
      // FR-008: transport/model error is a failed run, never skipped.
      runs.push({
        intendedActions,
        observedActions: [],
        missingActions: [...intendedActions],
        extraActions: [],
        passed: false,
      });
      continue;
    }
    runs.push(ActionDiffGrader.gradeRun(agentResponse, intendedActions));
  }

  const passed = ActionDiffGrader.aggregateActionDiff(runs, k);
  const passCount = runs.filter((r) => r.passed).length;

  return {
    id: kase.id,
    description: kase.description,
    gradingClass: kase.gradingClass,
    passed,
    skipped: false,
    detail: { runs: n, k, passCount, runResults: runs },
  };
}

/**
 * Run N model calls for an idempotency behavioral case.
 * Each errored run is represented as IdempotencyCheck with passed:false (FR-008).
 */
async function runIdempotencyCase(
  kase: ManifestCase,
  root: string,
  client: ChatClient,
  n: number,
  k: number
): Promise<CaseResult> {
  const absChecklistPath = resolvePath(root, kase.checklistPath);
  const raw = readFileSync(absChecklistPath, "utf-8");
  const fileBase = parseHeartbeat(absChecklistPath, raw);
  const recurrenceManifest = buildRecurrenceManifest(kase, absChecklistPath);
  const checklist = applyManifest(fileBase, recurrenceManifest);

  const tickStatePath = resolvePath(root, kase.tickState as string);
  const tick = loadTickState(tickStatePath);
  const intervalConfig = loadIntervalConfig(resolvePath(root, kase.intervalConfig));
  const tickWithInterval = { ...tick, intervalConfig };
  const framing = buildScenarioFraming(checklist, tickWithInterval);

  const onceOnlyItems = checklist.items.filter((item) => item.recurrence === "once-only");
  const priorActions = tick.priorActionSummary !== null
    ? tick.priorActionSummary.split("\n").map((l) => l.trim()).filter((l) => l.length > 0)
    : [];

  const runs: IdempotencyGrader.IdempotencyCheck[] = [];

  for (let i = 0; i < n; i++) {
    let agentResponse: string;
    try {
      agentResponse = await client.chat(
        [{ role: "user", content: framing }],
        {}
      );
    } catch {
      // FR-008: errored run is a failed run, never skipped.
      runs.push({
        onceOnlyItems,
        priorActions,
        observedActions: [],
        repeatedActions: [],
        passed: false,
      });
      continue;
    }
    runs.push(IdempotencyGrader.gradeRun(agentResponse, onceOnlyItems, priorActions));
  }

  const passed = IdempotencyGrader.aggregateIdempotency(runs, k);
  const passCount = runs.filter((r) => r.passed).length;

  return {
    id: kase.id,
    description: kase.description,
    gradingClass: kase.gradingClass,
    passed,
    skipped: false,
    detail: { runs: n, k, passCount, runResults: runs },
  };
}

/**
 * Run N model calls for a quiet-ack behavioral case.
 * Each errored/empty run is represented as QuietAckCheck with passed:false (FR-008).
 */
async function runQuietAckCase(
  kase: ManifestCase,
  root: string,
  client: ChatClient,
  n: number,
  k: number
): Promise<CaseResult> {
  const absChecklistPath = resolvePath(root, kase.checklistPath);
  const raw = readFileSync(absChecklistPath, "utf-8");
  const fileBase = parseHeartbeat(absChecklistPath, raw);
  const checklist = applyManifest(fileBase, { checklistPath: absChecklistPath, items: [] });

  const tickStatePath = resolvePath(root, kase.tickState as string);
  const tick = loadTickState(tickStatePath);
  const intervalConfig = loadIntervalConfig(resolvePath(root, kase.intervalConfig));
  const tickWithInterval = { ...tick, intervalConfig };
  const framing = buildScenarioFraming(checklist, tickWithInterval);

  const runs: QuietAckGrader.QuietAckCheck[] = [];

  for (let i = 0; i < n; i++) {
    let agentResponse: string | null = null;
    try {
      agentResponse = await client.chat(
        [{ role: "user", content: framing }],
        {}
      );
    } catch {
      // FR-008: transport/model error is a failed run, never skipped.
      runs.push(QuietAckGrader.gradeRun(null, intervalConfig, tickWithInterval));
      continue;
    }
    runs.push(QuietAckGrader.gradeRun(agentResponse, intervalConfig, tickWithInterval));
  }

  const passed = QuietAckGrader.aggregateQuietAck(runs, k);
  const passCount = runs.filter((r) => r.passed).length;

  return {
    id: kase.id,
    description: kase.description,
    gradingClass: kase.gradingClass,
    passed,
    skipped: false,
    detail: { runs: n, k, passCount, runResults: runs },
  };
}

/**
 * Grade one behavioral case (action-diff / idempotency / quiet-ack) using the
 * core behavioral client. Called only when MUSTER_ENDPOINT is set.
 *
 * Maps manifest passThreshold → k = ceil(passThreshold * N) (charter pass^k).
 * Errors per-run are materialised as passed:false before aggregation (FR-008).
 */
async function gradeBehavioralCase(
  kase: ManifestCase,
  root: string,
  client: ChatClient
): Promise<CaseResult> {
  const exp = kase.expectation;
  const passThreshold = typeof exp["passThreshold"] === "number" ? exp["passThreshold"] : 0.6;
  const n = typeof exp["runs"] === "number" ? exp["runs"] : DEFAULT_BEHAVIORAL_RUNS;
  const k = Math.ceil(passThreshold * n);

  if (kase.gradingClass === "action-diff") {
    return runActionDiffCase(kase, root, client, n, k);
  }
  if (kase.gradingClass === "idempotency") {
    return runIdempotencyCase(kase, root, client, n, k);
  }
  return runQuietAckCase(kase, root, client, n, k);
}

/**
 * Run all cases in a heartbeat test manifest and return a deterministic
 * pass/fail summary sorted by case ID (UTF-16 code-unit ordering, NFR-001).
 *
 * Behavioral cases (action-diff, idempotency, quiet-ack) are skipped when
 * MUSTER_ENDPOINT is not set (pass^k grading requires a BYOM endpoint).
 * When MUSTER_ENDPOINT IS set, they run through the core behavioral client
 * (src/core/behavioral/client.ts) with the WP02/WP03 graders (FR-001,
 * FR-004/005/006, FR-008).
 *
 * @param manifestPath - Absolute or project-relative path to manifest.json.
 * @param projectRoot  - Root directory for resolving relative fixture paths.
 *                       Defaults to the manifest file's parent directory.
 */
export async function runManifest(
  manifestPath: string,
  projectRoot?: string
): Promise<ManifestSummary> {
  const absManifest = resolvePath(manifestPath);
  const root = projectRoot ?? dirname(absManifest);

  const manifest = loadManifestFile(absManifest);
  const endpointUrl = process.env["MUSTER_ENDPOINT"];
  const hasMusterEndpoint = Boolean(endpointUrl);

  const results: CaseResult[] = [];

  for (const kase of manifest.cases) {
    let result: CaseResult;
    switch (kase.gradingClass) {
      case "static-lint":
        result = gradeStaticLintCase(kase, root);
        break;
      case "interval-config":
        result = gradeIntervalConfigCase(kase, root);
        break;
      case "action-diff":
      case "idempotency":
      case "quiet-ack":
        if (!hasMusterEndpoint) {
          result = {
            id: kase.id,
            description: kase.description,
            gradingClass: kase.gradingClass,
            passed: false,
            skipped: true,
            skipReason: `MUSTER_ENDPOINT not set — behavioral case requires a BYOM endpoint`,
          };
        } else {
          const client = makeClient({
            baseUrl: endpointUrl as string,
            model: process.env["MUSTER_MODEL"] ?? "default",
            apiKeyEnv: "MUSTER_API_KEY",
          });
          result = await gradeBehavioralCase(kase, root, client);
        }
        break;
      default: {
        const exhaustiveCheck: never = kase.gradingClass;
        result = {
          id: kase.id,
          description: kase.description,
          gradingClass: String(exhaustiveCheck),
          passed: false,
          skipped: false,
          detail: { error: `Unknown gradingClass: ${String(exhaustiveCheck)}` },
        };
        break;
      }
    }
    results.push(result);
  }

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
