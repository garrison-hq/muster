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
import { resolve as pathResolve, dirname, normalize, isAbsolute } from "node:path";
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
  /**
   * When true, this case was skipped gracefully (e.g. no `expected` declaration,
   * or no endpoint on the live behavioral path). Skipped cases do NOT count as
   * failures — they are reported separately (Note 3).
   */
  skipped?: boolean;
  verdict?: RuleSurvivalVerdict;
  findings?: CrossLayerFindingType[];
  error?: string;
}

/** Aggregate output of runManifest (FR-011). */
export interface ManifestRunSummary {
  total: number;
  passed: number;
  failed: number;
  /**
   * Number of gracefully-skipped cases (no `expected` declaration, or no
   * endpoint on the live behavioral path). Skipped cases do not contribute to
   * `failed` and do not cause a non-zero exit (Note 3).
   */
  skipped: number;
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
 * Assert that a relative path, once resolved, stays within the manifest's
 * directory tree.
 *
 * Absolute input paths are permitted as-is (the caller deliberately chose a
 * specific location). Only relative paths are checked — they must not escape
 * the manifest directory via `../` traversal (e.g. `../../etc/passwd`).
 *
 * This guard applies to both `$ref` case paths and layer `fixturePath` values.
 *
 * Pure string comparison — no I/O (NFR-001). `normalize` is called inside
 * `pathResolve` already; we compare the canonical prefix here.
 *
 * @throws Error when a relative path resolves outside the manifest directory.
 */
function assertWithinManifestDir(
  originalPath: string,
  resolvedPath: string,
  manifestDir: string,
  field: string
): void {
  // Absolute paths are explicitly anchored — no traversal concern.
  if (isAbsolute(originalPath)) {
    return;
  }
  const normalizedDir = normalize(manifestDir) + "/";
  const normalizedPath = normalize(resolvedPath);
  if (!normalizedPath.startsWith(normalizedDir) && normalizedPath !== normalize(manifestDir)) {
    throw new Error(
      `Path traversal rejected: ${field} resolves outside the manifest directory. ` +
        `Resolved: "${resolvedPath}", manifest dir: "${manifestDir}". ` +
        `Relative paths must remain within the manifest directory tree (security guard, Note 6).`
    );
  }
}

/**
 * Resolves a single case entry: if it contains a `$ref` key, load and parse
 * the referenced YAML file relative to the manifest directory. Otherwise
 * return the entry as-is.
 *
 * Normative note: `!include` tags are not natively supported by the `yaml`
 * package; `$ref` paths achieve equivalent case-include semantics without
 * adding dependencies (T029 guidance).
 *
 * Path traversal guard: the resolved `$ref` path must remain within the
 * manifest directory tree (Note 6 security guard).
 */
async function resolveCase(
  entry: CompositionManifestCase | { $ref: string },
  manifestDir: string
): Promise<CompositionManifestCase> {
  if (!("$ref" in entry)) {
    return entry;
  }
  const refPath = pathResolve(manifestDir, entry.$ref);
  assertWithinManifestDir(entry.$ref, refPath, manifestDir, `$ref "${entry.$ref}"`);
  const raw = await fs.readFile(refPath, "utf-8");
  return yamlParse(raw) as CompositionManifestCase;
}

/** Result of loadManifest — includes the manifest directory for path resolution. */
interface LoadedManifest extends CompositionManifest {
  /** Absolute directory containing the manifest file. */
  manifestDir: string;
}

/**
 * Load a manifest YAML file, resolve any `$ref` case entries, and return the
 * fully materialised CompositionManifest together with its directory.
 */
async function loadManifest(manifestPath: string): Promise<LoadedManifest> {
  const absPath = pathResolve(manifestPath);
  const raw = await fs.readFile(absPath, "utf-8");
  const parsed = yamlParse(raw) as RawManifest;
  const manifestDir = dirname(absPath);

  const cases = await Promise.all(
    (parsed.cases ?? []).map((entry) => resolveCase(entry, manifestDir))
  );

  return { endpoint: parsed.endpoint, cases, manifestDir };
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
  const activeCases = options.filter === undefined
    ? manifest.cases
    : manifest.cases.filter((c) => c.testClass === options.filter);

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
  /**
   * Endpoint configuration supplied by the caller (e.g. from environment
   * variables in the CLI layer). When set and the manifest carries no endpoint
   * block, this value is used instead.
   *
   * NFR-005: the API key is still resolved from process.env via
   * EndpointManifestConfig.api_key_env — never stored as a literal value.
   */
  endpointOverride?: EndpointManifestConfig;
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
async function runStaticCase(c: CompositionManifestCase, manifestDir: string): Promise<CaseResult> {
  if (c.expected === undefined) {
    return {
      id: c.id,
      passed: false,
      skipped: true,
      error: `Static case "${c.id}" has no expected declaration — skipped (no verdict possible).`,
    };
  }

  const resolvedLayers = resolveLayerPaths(c.layers, manifestDir);
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
  apiKey: string | undefined,
  manifestDir: string
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

  const resolvedLayers = resolveLayerPaths(c.layers, manifestDir);
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
    // No expected declaration — skip gracefully (FR-008 null-safety, Note 3).
    // Per spec intent: mocked-error / integration-only cases with no expected key
    // are not runnable on a live path. Count as skipped (not failed).
    return {
      id: c.id,
      passed: false,
      skipped: true,
      error: `Behavioral case "${c.id}" has no expected declaration — skipped on live path (integration/mocked-error case).`,
    };
  }

  const result = await runRuleSurvival(survivalCase, composition, endpointConfig);

  const passed =
    c.expected.verdict === undefined
      ? result.verdict !== "eroded" && result.verdict !== "baseline-failure"
      : result.verdict === c.expected.verdict;

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
    gradingClass: c.gradingClass ?? "pass-k",
    isDiscriminationControl: c.isDiscriminationControl === true,
    adversarialProbe: c.adversarialProbe,
  };
}

// ---------------------------------------------------------------------------
// Layer path resolution (relative to manifest directory)
// ---------------------------------------------------------------------------

/**
 * Resolve each layer's fixturePath relative to the manifest directory.
 *
 * Layer paths in fixture YAML files are expressed relative to the manifest
 * file's directory (e.g. "fixtures/crosslayer/benign/SOUL.md" when the
 * manifest lives at the project root). Paths that are already absolute are
 * returned unchanged.
 *
 * Resolving against the manifest directory — not process.cwd() — ensures
 * `crosslayer run <abs-path>` produces identical results regardless of the
 * working directory from which the command is invoked (NFR-001: deterministic,
 * no process.cwd() dependency on the static path).
 *
 * Path-traversal safety: the traversal guard for fixturePaths runs as a
 * manifest-level preflight (before any case executes) inside runManifest.
 * Paths already validated there; resolveLayerPaths simply resolves them.
 *
 * Pure string operation — no I/O, no clock, no RNG (NFR-001).
 */
function resolveLayerPaths(layers: LayerEntry[], manifestDir: string): LayerEntry[] {
  return layers.map((layer) => ({
    ...layer,
    fixturePath: pathResolve(manifestDir, layer.fixturePath),
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
  const loaded = await loadManifest(manifestPath);
  const { manifestDir } = loaded;

  // Apply endpoint override: when the manifest carries no endpoint block and
  // the caller supplies one (e.g. from environment variables in the CLI), use
  // the override so behavioral cases can run without an in-manifest config.
  const manifest: CompositionManifest = loaded.endpoint === undefined && options?.endpointOverride !== undefined
    ? { ...loaded, endpoint: options.endpointOverride }
    : loaded;

  const filter = options?.testClassFilter;
  validateManifest(manifest, { filter, dryRun: options?.dryRun });

  // Dry-run: parse and validate only — no cases executed (T025, T030).
  if (options?.dryRun === true) {
    return {
      total: manifest.cases.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      results: [],
    };
  }

  const casesToRun = filter === undefined
    ? manifest.cases
    : manifest.cases.filter((c) => c.testClass === filter);

  // Path-traversal preflight (Note 6): validate all relative layer fixturePaths
  // before running any case. Traversal violations are security errors — they
  // propagate as throws (not per-case errors) so the manifest as a whole is
  // rejected rather than silently skipping the offending case.
  for (const c of casesToRun) {
    for (const layer of c.layers) {
      const resolved = pathResolve(manifestDir, layer.fixturePath);
      assertWithinManifestDir(layer.fixturePath, resolved, manifestDir, `fixturePath "${layer.fixturePath}" in case "${c.id}"`);
    }
  }

  // Resolve API key once before running any behavioral case.
  const apiKey = resolveApiKey(manifest);

  const results: CaseResult[] = [];

  for (const c of casesToRun) {
    try {
      const result = await dispatchCase(c, manifest, apiKey, manifestDir);
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
  const skipped = results.filter((r) => r.skipped === true).length;
  // failed = cases that are neither passed nor gracefully skipped (Note 3).
  const failed = results.length - passed - skipped;
  return {
    total: results.length,
    passed,
    failed,
    skipped,
    results,
  };
}

/** Dispatch a single case to the correct module. */
async function dispatchCase(
  c: CompositionManifestCase,
  manifest: CompositionManifest,
  apiKey: string | undefined,
  manifestDir: string
): Promise<CaseResult> {
  if (c.testClass === "static") {
    return runStaticCase(c, manifestDir);
  }
  return runBehavioralCase(c, manifest, apiKey, manifestDir);
}
