/**
 * CompositionManifest YAML runner — FR-011 pass/fail summary.
 *
 * Reads a manifest YAML (with optional `$ref` case includes), validates it,
 * and dispatches each case to the correct module:
 *   - testClass "static"    → assembleComposedContext + lintComposition
 *   - testClass "behavioral" → assembleComposedContext + runRuleSurvival
 *
 * FR-008: Declared-precedence behavioral resolution — behavioral cases with
 *         precedence are passed to runRuleSurvival which evaluates survival.
 * FR-011: Produces a machine-readable per-case pass/fail summary.
 * C-001:  src/core/ is not modified; this module lives at the adapter edge.
 * C-004:  Shaped as a candidate upstream conformance suite fixture runner.
 * NFR-001: No timestamps or random data on the static path.
 * NFR-005: API key never stored; resolved from process.env at runtime.
 *
 * Normative citation: muster cross-layer conformance rubric
 * (cross-layer-conformance-01KTYKP2), FR-008, FR-011, FR-012.
 */

import { promises as fs } from "node:fs";
import { resolve as pathResolve, dirname } from "node:path";
import { parse as yamlParse } from "yaml";
import { assembleComposedContext } from "./composition.js";
import { lintComposition } from "./contradiction-lint.js";
import { runRuleSurvival } from "./rule-survival.js";
import type { LayerEntry, PrecedenceDeclaration } from "./composition.js";
import type { CrossLayerFindingType } from "./contradiction-lint.js";
import type { GradingClass, RuleSurvivalVerdict } from "./rule-survival.js";

// ---------------------------------------------------------------------------
// Types (data-model.md §CompositionManifest — implement exactly these)
// ---------------------------------------------------------------------------

/** Endpoint configuration section of the manifest (NFR-005: key by env-var name). */
export interface EndpointManifestConfig {
  base_url: string;
  model: string;
  /** Environment variable name holding the API key. Never the key value itself. */
  api_key_env: string;
}

/** One case entry in a CompositionManifest. */
export interface CompositionManifestCase {
  id: string;
  layers: LayerEntry[];
  precedence?: PrecedenceDeclaration;
  /** Only for behavioral cases — the SOP rule under test. */
  rule?: string;
  probeSet?: string[];
  baselineConfig?: { runs: number; passThreshold: number };
  composedRuns?: number;
  passThreshold?: number;
  gradingClass?: GradingClass;
  testClass: "static" | "behavioral";
  /** Whether this is the rigged-impossible discrimination control (FR-009). */
  isDiscriminationControl?: boolean;
  /** Optional adversarial probe text (FR-007). */
  adversarialProbe?: string;
  /**
   * Expected outcome. Optional: when absent (e.g. integration/mocked-error cases
   * with no declared expected verdict), the case is skipped gracefully on live
   * runs rather than crashing (FR-008 null-safety).
   */
  expected?: {
    ok?: boolean;
    findingTypes?: CrossLayerFindingType[];
    verdict?: RuleSurvivalVerdict;
  };
}

/** Top-level manifest structure. endpoint is required for behavioral cases. */
export interface CompositionManifest {
  endpoint?: EndpointManifestConfig;
  cases: CompositionManifestCase[];
}

/** Result for one case in a manifest run. */
export interface CaseResult {
  id: string;
  passed: boolean;
  verdict?: RuleSurvivalVerdict;
  findings?: CrossLayerFindingType[];
  error?: string;
}

/** Aggregate output of runManifest (FR-011). */
export interface ManifestRunSummary {
  total: number;
  passed: number;
  failed: number;
  results: CaseResult[];
}

// ---------------------------------------------------------------------------
// $ref resolution — load referenced case files relative to manifest dir
// ---------------------------------------------------------------------------

/** Shape of a raw parsed manifest before $ref entries are resolved. */
interface RawManifest {
  endpoint?: EndpointManifestConfig;
  cases: (CompositionManifestCase | { $ref: string })[];
}

/**
 * Resolves a single case entry: if it contains a `$ref` key, load and parse
 * the referenced YAML file relative to the manifest directory. Otherwise
 * return the entry as-is.
 *
 * Normative note: `!include` tags are not natively supported by the `yaml`
 * package; `$ref` paths achieve equivalent case-include semantics without
 * adding dependencies (T029 guidance).
 */
async function resolveCase(
  entry: CompositionManifestCase | { $ref: string },
  manifestDir: string
): Promise<CompositionManifestCase> {
  if (!("$ref" in entry)) {
    return entry;
  }
  const refPath = pathResolve(manifestDir, entry.$ref);
  const raw = await fs.readFile(refPath, "utf-8");
  return yamlParse(raw) as CompositionManifestCase;
}

/**
 * Load a manifest YAML file, resolve any `$ref` case entries, and return the
 * fully materialised CompositionManifest.
 */
async function loadManifest(manifestPath: string): Promise<CompositionManifest> {
  const absPath = pathResolve(manifestPath);
  const raw = await fs.readFile(absPath, "utf-8");
  const parsed = yamlParse(raw) as RawManifest;
  const manifestDir = dirname(absPath);

  const cases = await Promise.all(
    (parsed.cases ?? []).map((entry) => resolveCase(entry, manifestDir))
  );

  return { endpoint: parsed.endpoint, cases };
}

// ---------------------------------------------------------------------------
// Manifest validation
// ---------------------------------------------------------------------------

/**
 * Validate the manifest invariants before running any case.
 *
 * - IDs must be unique across all cases.
 * - endpoint must be present if any behavioral case exists in the active run set
 *   (i.e., when not dry-run and not filtered to static-only).
 *
 * Throws on any violation so the caller can abort cleanly.
 */
function validateManifest(
  manifest: CompositionManifest,
  options: { filter?: "static" | "behavioral"; dryRun?: boolean }
): void {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const c of manifest.cases) {
    if (seen.has(c.id)) {
      duplicates.push(c.id);
    }
    seen.add(c.id);
  }

  if (duplicates.length > 0) {
    throw new Error(
      `Manifest validation failed: duplicate case IDs: ${duplicates.join(", ")}.`
    );
  }

  // Dry-run: skip endpoint validation (no cases will run, so no endpoint needed).
  if (options.dryRun === true) {
    return;
  }

  // Only require endpoint when behavioral cases are present in the active run set.
  // When testClassFilter is "static", behavioral cases are excluded — no endpoint needed.
  const activeCases = options.filter !== undefined
    ? manifest.cases.filter((c) => c.testClass === options.filter)
    : manifest.cases;

  const hasBehavioral = activeCases.some((c) => c.testClass === "behavioral");
  if (hasBehavioral && manifest.endpoint === undefined) {
    throw new Error(
      "Manifest validation failed: 'endpoint' is required when behavioral cases are present."
    );
  }
}

// ---------------------------------------------------------------------------
// API-key resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the API key from the environment at runtime.
 * Throws if the key is missing and behavioral cases exist.
 * NFR-005: credentials from environment only, never from the manifest itself.
 */
function resolveApiKey(
  manifest: CompositionManifest
): string | undefined {
  if (manifest.endpoint === undefined) {
    return undefined;
  }
  return process.env[manifest.endpoint.api_key_env] ?? undefined;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Options for runManifest. */
export interface RunManifestOptions {
  /** Parse and validate the manifest without running any cases. */
  dryRun?: boolean;
  /**
   * Run only cases matching this testClass.
   * When unset, all cases run.
   */
  testClassFilter?: "static" | "behavioral";
}

// ---------------------------------------------------------------------------
// Static case dispatch
// ---------------------------------------------------------------------------

/**
 * Run one static case (lintComposition) and return a CaseResult.
 * Compares the lint report against the case's expected outcome.
 *
 * - expected.ok: report.ok must match.
 * - expected.findingTypes: each expected type must appear in report findings.
 *
 * When expected is absent, the case is skipped gracefully (FR-008 null-safety).
 */
async function runStaticCase(c: CompositionManifestCase): Promise<CaseResult> {
  if (c.expected === undefined) {
    return {
      id: c.id,
      passed: false,
      error: `Static case "${c.id}" has no expected declaration — skipped (no verdict possible).`,
    };
  }

  const resolvedLayers = resolveLayerPaths(c.layers);
  const composition = await assembleComposedContext({
    layers: resolvedLayers,
    precedence: c.precedence,
  });
  const report = lintComposition(composition);

  const emittedTypes = new Set(report.findings.map((f) => f.type));

  let passed = true;

  if (c.expected.ok !== undefined && report.ok !== c.expected.ok) {
    passed = false;
  }

  if (c.expected.findingTypes !== undefined) {
    for (const expectedType of c.expected.findingTypes) {
      if (!emittedTypes.has(expectedType)) {
        passed = false;
        break;
      }
    }
  }

  return {
    id: c.id,
    passed,
    findings: Array.from(emittedTypes),
  };
}

// ---------------------------------------------------------------------------
// Behavioral case dispatch
// ---------------------------------------------------------------------------

/**
 * Run one behavioral case (runRuleSurvival) and return a CaseResult.
 * Uses the first probe in probeSet (the manifest runner does not fan-out;
 * each probe would be a separate case if independent assessment is needed).
 *
 * Errored run = failed (charter, FR-006): the per-case catch in runManifest
 * handles endpoint errors; individual run errors within runRuleSurvival are
 * already counted as failed inside that module.
 */
async function runBehavioralCase(
  c: CompositionManifestCase,
  manifest: CompositionManifest,
  apiKey: string | undefined
): Promise<CaseResult> {
  const endpointCfg = manifest.endpoint;
  if (endpointCfg === undefined) {
    return {
      id: c.id,
      passed: false,
      error: "No endpoint configured for behavioral case.",
    };
  }

  if (!apiKey) {
    return {
      id: c.id,
      passed: false,
      error: `API key environment variable "${endpointCfg.api_key_env}" is not set.`,
    };
  }

  const probe = c.probeSet?.[0];
  if (probe === undefined || probe === "") {
    return {
      id: c.id,
      passed: false,
      error: `Behavioral case "${c.id}" has no probeSet entries.`,
    };
  }

  const resolvedLayers = resolveLayerPaths(c.layers);
  const composition = await assembleComposedContext({
    layers: resolvedLayers,
    precedence: c.precedence,
  });

  const survivalCase = buildSurvivalCase(c, probe);

  const endpointConfig = {
    baseUrl: endpointCfg.base_url,
    model: endpointCfg.model,
    apiKeyEnv: endpointCfg.api_key_env,
  };

  if (c.expected === undefined) {
    // No expected declaration — skip gracefully (FR-008 null-safety).
    // Per spec intent: mocked-error / integration-only cases with no expected key
    // are not runnable on a live path. Count as skipped (passed: false, clear reason).
    return {
      id: c.id,
      passed: false,
      error: `Behavioral case "${c.id}" has no expected declaration — skipped on live path (integration/mocked-error case).`,
    };
  }

  const result = await runRuleSurvival(survivalCase, composition, endpointConfig);

  const passed =
    c.expected.verdict !== undefined
      ? result.verdict === c.expected.verdict
      : result.verdict !== "eroded" && result.verdict !== "baseline-failure";

  return {
    id: c.id,
    passed,
    verdict: result.verdict,
  };
}

/** Build a RuleSurvivalCase from a manifest case entry. */
function buildSurvivalCase(
  c: CompositionManifestCase,
  probe: string
) {
  return {
    id: c.id,
    rule: c.rule ?? "",
    probe,
    baselineRuns: c.baselineConfig?.runs ?? 3,
    composedRuns: c.composedRuns ?? 3,
    passThreshold: c.passThreshold ?? c.baselineConfig?.passThreshold ?? 0.6,
    gradingClass: (c.gradingClass ?? "pass-k") as GradingClass,
    isDiscriminationControl: c.isDiscriminationControl === true,
    adversarialProbe: c.adversarialProbe,
  };
}

// ---------------------------------------------------------------------------
// Layer path resolution (relative to manifest directory)
// ---------------------------------------------------------------------------

/**
 * Resolve each layer's fixturePath against the process working directory.
 *
 * Layer paths in fixture YAML files are expressed relative to the project root
 * by convention (e.g. "fixtures/crosslayer/benign/SOUL.md"). `pathResolve`
 * with a single argument uses process.cwd() as the base, which is the project
 * root when the test runner or CLI is invoked from there.
 *
 * Pure string operation — no I/O, no clock, no RNG (NFR-001).
 */
function resolveLayerPaths(layers: LayerEntry[]): LayerEntry[] {
  return layers.map((layer) => ({
    ...layer,
    fixturePath: pathResolve(layer.fixturePath),
  }));
}

// ---------------------------------------------------------------------------
// runManifest — main entry point (T025)
// ---------------------------------------------------------------------------

/**
 * Run all cases in a CompositionManifest YAML file and produce a pass/fail summary.
 *
 * Dispatch:
 *   - testClass "static"     → assembleComposedContext + lintComposition
 *   - testClass "behavioral" → assembleComposedContext + runRuleSurvival
 *
 * Per-case catch (FR-008, charter errored=failed rule):
 *   Any thrown error for a case records { passed: false, error: message } and
 *   execution continues to remaining cases — never breaks or rethrows.
 *
 * Dry-run mode (options.dryRun):
 *   Parses and validates the manifest; returns total case count with zero
 *   results. No assembleComposedContext, no lintComposition, no runRuleSurvival
 *   calls, no fetch calls.
 *
 * testClassFilter:
 *   When set, only cases of the matching testClass are run; others are skipped
 *   (not counted in total).
 *
 * @param manifestPath - Path to the manifest YAML file (absolute or relative to cwd).
 * @param options - Optional run configuration.
 * @returns ManifestRunSummary with per-case CaseResult.
 *
 * Normative citation: muster cross-layer conformance rubric, FR-011; charter
 * errored=failed rule (FR-006, FR-008).
 */
export async function runManifest(
  manifestPath: string,
  options?: RunManifestOptions
): Promise<ManifestRunSummary> {
  const manifest = await loadManifest(manifestPath);
  const filter = options?.testClassFilter;
  validateManifest(manifest, { filter, dryRun: options?.dryRun });

  // Dry-run: parse and validate only — no cases executed (T025, T030).
  if (options?.dryRun === true) {
    return {
      total: manifest.cases.length,
      passed: 0,
      failed: 0,
      results: [],
    };
  }

  const casesToRun = filter !== undefined
    ? manifest.cases.filter((c) => c.testClass === filter)
    : manifest.cases;

  // Resolve API key once before running any behavioral case.
  const apiKey = resolveApiKey(manifest);

  const results: CaseResult[] = [];

  for (const c of casesToRun) {
    try {
      const result = await dispatchCase(c, manifest, apiKey);
      results.push(result);
    } catch (err) {
      // Per-case catch: errored run = failed; remaining cases continue (FR-008, charter).
      results.push({
        id: c.id,
        passed: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

/** Dispatch a single case to the correct module. */
async function dispatchCase(
  c: CompositionManifestCase,
  manifest: CompositionManifest,
  apiKey: string | undefined
): Promise<CaseResult> {
  if (c.testClass === "static") {
    return runStaticCase(c);
  }
  return runBehavioralCase(c, manifest, apiKey);
}
