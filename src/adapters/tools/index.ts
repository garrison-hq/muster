/**
 * Tools adapter — public API assembly behind the SpecAdapter boundary (C-001).
 *
 * BOUNDARY CONSTRAINT (C-001):
 *   src/core/ must NEVER import from src/adapters/tools/.
 *   TypeScript enforces this transitively: if core imported this module,
 *   circular-import detection or a lint rule would surface it.
 *   Verify at any time with:
 *     grep -rn "from.*adapters/tools" src/core/ || echo "OK — core boundary clean"
 *
 * This module:
 * - Re-exports the full public API surface of lint, drift, and selection modules.
 * - Exposes runManifest() — the top-level manifest runner entry point (FR-010).
 * - Does NOT import from src/core/ — the boundary flows outward only.
 *
 * Reference: src/adapters/rfc1/index.ts (structural pattern for adapter assembly).
 */

// ---------------------------------------------------------------------------
// Re-exports: lint module (WP01)
// ---------------------------------------------------------------------------

export type {
  ParameterDescriptor,
  ToolDescriptor,
  TOOLSFile,
  LintFindingKind,
  LintFinding,
  LintReport,
} from "./lint.js";

export { parseTOOLSFile, lintTOOLSFile, toCanonicalJson } from "./lint.js";

// ---------------------------------------------------------------------------
// Re-exports: drift module (WP02)
// ---------------------------------------------------------------------------

export type {
  EnvironmentDescriptorFormat,
  EnvironmentToolEntry,
  EnvironmentDescriptor,
  DriftFindingKind,
  SchemaMismatchDirection,
  DriftFinding,
  DriftReport,
} from "./drift.js";

export {
  loadEnvironmentDescriptor,
  runDriftCheck,
  UnknownDescriptorFormatError,
} from "./drift.js";

// ---------------------------------------------------------------------------
// Re-exports: selection module (WP03)
// ---------------------------------------------------------------------------

export type {
  ToolSelectionRunResult,
  ToolSelectionCase,
  ToolSelectionVerdict,
  FetchFn,
  SelectionRunOptions,
} from "./selection.js";

export {
  runSelectionCase,
  gradeCorrectSelection,
  gradeAbstention,
  gradeControl,
} from "./selection.js";

// ---------------------------------------------------------------------------
// Manifest runner types (T023)
// ---------------------------------------------------------------------------

import type { LintReport } from "./lint.js";
import type { DriftReport } from "./drift.js";
import type { ToolSelectionVerdict, FetchFn, ToolSelectionCase } from "./selection.js";
import { parseTOOLSFile, lintTOOLSFile } from "./lint.js";
import { loadEnvironmentDescriptor, runDriftCheck } from "./drift.js";
import { readFile } from "node:fs/promises";
import { runSelectionCase } from "./selection.js";

/**
 * A single test case in a tools manifest run.
 *
 * FR-010: Each case describes one TOOLS.md file to lint, with optional
 * environment descriptor for drift checks and optional selection scenarios
 * for behavioral probes.
 */
export interface ToolsManifestCase {
  /** Unique identifier for this case. */
  readonly id: string;
  /** Absolute or runner-relative path to the TOOLS.md file. */
  readonly toolsFilePath: string;
  /**
   * Optional path to an environment descriptor JSON file.
   * When present, drift checks are run against it.
   * Absent: only static lint is run for this case.
   */
  readonly envDescriptorPath?: string;
  /**
   * Optional list of selection-scenario fixture paths.
   * When present, behavioral probes are run for this case (only if opts.endpoint is set).
   * Absent: behavioral probes are skipped for this case.
   */
  readonly selectionScenarioPaths?: readonly string[];
  /**
   * Expected outcome for manifest-runner assertions.
   * - "pass": case is expected to produce clean lint + drift + all selection verdicts passed.
   * - "fail": case is expected to produce at least one finding or failed verdict.
   * When absent, no cross-check against expectation is applied.
   */
  readonly expect?: "pass" | "fail";
}

/**
 * The result of running a single ToolsManifestCase.
 *
 * FR-010: Structured pass/fail summary per case.
 */
export interface ToolsManifestResult {
  /** Case identifier (from ToolsManifestCase.id). */
  readonly id: string;
  /**
   * True iff lint is ok AND drift is clean (if run) AND all selection verdicts
   * passed (if run), AND (when ToolsManifestCase.expect is set) the raw outcome
   * matches the declared expectation.
   *
   * When ToolsManifestCase.expect is:
   *   - "pass": passed is true only if the raw outcome is passing.
   *   - "fail": passed is true only if the raw outcome is failing (expectation satisfied).
   *   - undefined: no cross-check; passed reflects the raw lint/drift/selection outcome.
   */
  readonly passed: boolean;
  /** Lint report for this case. Always present. */
  readonly lintReport?: LintReport;
  /** Drift report for this case. Present only when envDescriptorPath was provided. */
  readonly driftReport?: DriftReport;
  /** Selection verdicts for this case. Present only when selectionScenarioPaths was provided and opts.endpoint is set. */
  readonly selectionVerdicts?: readonly ToolSelectionVerdict[];
}

/**
 * Options for the BYOM endpoint used by behavioral probes.
 * All fields are optional — if endpoint is absent, selection probes are skipped.
 */
export interface ManifestRunOptions {
  /**
   * Base URL for the OpenAI-compatible endpoint.
   * If absent, all selection-scenario probes are skipped (with a warning logged
   * to stderr) regardless of whether selectionScenarioPaths are provided.
   */
  readonly endpoint?: string;
  /** Optional API key; sent as Bearer token if present. */
  readonly apiKey?: string;
  /** Model identifier sent in the request body. Defaults to "gpt-4o". */
  readonly model?: string;
  /**
   * Optional HTTP fetch implementation for selection probes.
   * Defaults to globalThis.fetch (the platform fetch).
   * Tests inject a mock here; production callers omit it.
   * This parameter exists to keep the integration test fully offline (C-003,
   * NFR-001): tests that exercise the endpoint branch inject a mock fetcher
   * instead of making real network calls.
   */
  readonly fetcher?: FetchFn;
}

// ---------------------------------------------------------------------------
// Manifest runner implementation (T023)
// ---------------------------------------------------------------------------

/** Run drift check for a case if envDescriptorPath is present. */
async function runCaseDrift(
  toolsFile: import("./lint.js").TOOLSFile,
  testCase: ToolsManifestCase
): Promise<DriftReport | undefined> {
  if (testCase.envDescriptorPath === undefined) {
    return undefined;
  }
  const envDescriptor = await loadEnvironmentDescriptor(
    testCase.envDescriptorPath
  );
  return runDriftCheck(toolsFile, envDescriptor);
}

/** Run selection probes for a case if scenarioPaths and endpoint are present. */
async function runCaseSelectionProbes(
  toolsFile: import("./lint.js").TOOLSFile,
  testCase: ToolsManifestCase,
  opts: ManifestRunOptions | undefined
): Promise<ToolSelectionVerdict[] | undefined> {
  if (
    testCase.selectionScenarioPaths === undefined ||
    testCase.selectionScenarioPaths.length === 0
  ) {
    return undefined;
  }
  if (opts?.endpoint === undefined) {
    // No endpoint — skip with warning (charter: offline path stays offline)
    process.stderr.write(
      `[runManifest] Warning: case "${testCase.id}" has selectionScenarioPaths but no endpoint is configured — selection probes skipped.\n`
    );
    return undefined;
  }
  const verdicts: ToolSelectionVerdict[] = [];
  for (const scenarioPath of testCase.selectionScenarioPaths) {
    const raw = await readFile(scenarioPath, "utf-8");
    const scenario = JSON.parse(raw) as ToolSelectionCase;
    const verdict = await runSelectionCase(toolsFile, scenario, {
      endpoint: opts.endpoint,
      apiKey: opts.apiKey,
      model: opts.model ?? "gpt-4o",
      // Thread the injected fetcher (if any) so callers and tests can
      // keep the selection path fully offline (C-003, NFR-001).
      fetcher: opts.fetcher,
    });
    verdicts.push(verdict);
  }
  return verdicts;
}

/** Determine whether the raw outcome matches the declared expectation. */
function resolveExpectation(
  rawPassed: boolean,
  expect: ToolsManifestCase["expect"]
): boolean {
  if (expect === "fail") {
    // Expectation satisfied when the raw outcome fails
    return !rawPassed;
  }
  // expect === "pass" or undefined: passed reflects the raw outcome
  return rawPassed;
}

/** Run a single ToolsManifestCase through lint → drift → selection. */
async function runManifestCase(
  testCase: ToolsManifestCase,
  opts: ManifestRunOptions | undefined
): Promise<ToolsManifestResult> {
  // Step 1: Parse and lint TOOLS.md
  const toolsFile = await parseTOOLSFile(testCase.toolsFilePath);
  const lintReport = lintTOOLSFile(toolsFile);

  // Step 2: Drift check (if envDescriptorPath present)
  const driftReport = await runCaseDrift(toolsFile, testCase);

  // Step 3: Selection probes (if selectionScenarioPaths and endpoint)
  const selectionVerdicts = await runCaseSelectionProbes(
    toolsFile,
    testCase,
    opts
  );

  // Step 4: Determine raw outcome
  const lintOk = lintReport.ok;
  const driftOk = driftReport === undefined ? true : driftReport.clean;
  const selectionOk =
    selectionVerdicts === undefined
      ? true
      : selectionVerdicts.every((v) => v.passed);

  const rawPassed = lintOk && driftOk && selectionOk;

  // Step 5: Cross-check against expect (FR-010 "expectations" element)
  const passed = resolveExpectation(rawPassed, testCase.expect);

  return {
    id: testCase.id,
    passed,
    lintReport,
    ...(driftReport !== undefined && { driftReport }),
    ...(selectionVerdicts !== undefined && { selectionVerdicts }),
  };
}

/**
 * Run a manifest of ToolsManifestCase entries and return a structured result
 * per case.
 *
 * FR-010: orchestrates parse → lint → drift (if envDescriptorPath) → selection
 * (if selectionScenarioPaths and opts.endpoint). When a case sets `expect`,
 * the raw outcome is cross-checked: for expect === "fail", the case passes
 * (expectation satisfied) when lint/drift/selection produce at least one failure;
 * for expect === "pass", the case passes only when lint/drift/selection all pass.
 *
 * Charter constraints:
 * - Offline static + drift path: never calls network unless opts.endpoint is set.
 * - Selection probes require opts.endpoint; without it, they are skipped with a
 *   warning to stderr (not an error).
 * - No credentials or endpoints hardcoded here (NFR-005).
 * - opts.fetcher is threaded to runSelectionCase so tests can inject a mock
 *   fetcher and remain fully offline (C-003, NFR-001).
 *
 * @param cases - Array of manifest cases to run.
 * @param opts - Optional endpoint options for behavioral probes.
 */
export async function runManifest(
  cases: readonly ToolsManifestCase[],
  opts?: ManifestRunOptions
): Promise<readonly ToolsManifestResult[]> {
  const results: ToolsManifestResult[] = [];
  for (const testCase of cases) {
    results.push(await runManifestCase(testCase, opts));
  }
  return results;
}
