/**
 * A2aAdapter — the SpecAdapter assembly for A2A Agent Card conformance.
 *
 * Implements the C-001/C-004 boundary: no A2A-specific type is ever imported by
 * src/core/. This module is the ONLY place the CLI needs to import to plug A2A
 * lint into the spec-agnostic registry.
 *
 * Architecture note: A2A Agent Cards is not a Soul.md RFC-1 document, so the
 * SpecAdapter methods (parse, validate, resolve, evaluateTriggers) are stubs
 * satisfying the interface contract. The real A2A conformance work is done
 * through runManifest() and lintCard(), which the CLI calls directly. This
 * mirrors the HeartbeatAdapter's boundary contract.
 *
 * Citation: muster A2A adapter spec (FR-001, FR-012, FR-013); A2A spec v1.0.0
 * protobuf a2a.proto §8.2 / §8.3.1 / §7; muster rubric NFR-001.
 */

import { readFileSync } from "node:fs";
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
  loadManifest,
  type ManifestCase,
  type CaseResult,
  type ManifestSummary,
} from "./types.js";
import { parseAgentCard } from "./card.js";
import type { Jwks } from "./signature.js";
import { lintCard } from "./lint.js";
import { envEndpoint, discoverCard } from "./transport.js";
import {
  probeSkill,
  aggregateSkillBehavior,
} from "./graders/skill-behavior.js";
import { checkAuthEnforcement } from "./graders/auth-negative.js";
import { checkLiveSignedCard } from "./graders/signed-card.js";
import {
  loadBehavioralManifest,
  isA2aBehavioralManifestError,
  resolveThresholds,
} from "./behavioral-manifest.js";
import type { A2aBehavioralCase } from "./behavioral-manifest.js";
import { runBehavioralCases } from "./graders/behavioral.js";
import type { BehavioralRunResult } from "./graders/behavioral.js";

// Re-export public surface (FR-012, T024)
export { lintCard, serializeLintReport } from "./lint.js";
export type { ManifestCase, CaseResult, ManifestSummary } from "./types.js";
export type { BehavioralRunResult } from "./graders/behavioral.js";
export type { CaseVerdict } from "./graders/behavioral.js";

// ---------------------------------------------------------------------------
// Version from package.json (mirrors HeartbeatAdapter pattern)
// ---------------------------------------------------------------------------

const VERSION = (
  JSON.parse(
    readFileSync(new URL("../../../package.json", import.meta.url), "utf8")
  ) as { version: string }
).version;

// ---------------------------------------------------------------------------
// Skip reason constants (FR-009, FR-010)
// ---------------------------------------------------------------------------

const LIVE_SKIP_REASON =
  "MUSTER_A2A_ENDPOINT not set — live A2A case requires an endpoint";

// ---------------------------------------------------------------------------
// Internal grading helpers
// ---------------------------------------------------------------------------

/**
 * Grade a static-lint case: runs lintCard offline against the card fixture.
 *
 * Reads the card fixture file, parses via parseAgentCard, runs lintCard,
 * and maps the LintReport to a CaseResult.
 *
 * When the case has a `signed` block, loads the JWKS fixture (resolved
 * relative to manifestDir — the directory containing the manifest JSON) and
 * passes it to lintCard for offline JWS verification (FR-004).
 *
 * For control:true cases the CALLER applies the inversion — this function
 * returns the raw grader result. The inversion is applied in runManifest
 * centrally, keeping the control logic in one place.
 *
 * Always runs — no env dependency (FR-005, NFR-001).
 *
 * @param kase        - The manifest case.
 * @param manifestDir - Directory of the manifest file, for resolving jwksSource paths.
 */
function gradeStaticLintCase(
  kase: ManifestCase,
  manifestDir: string
): CaseResult {
  // cardSource is already resolved to absolute by loadManifest.
  let cardRaw: string;
  try {
    cardRaw = readFileSync(kase.cardSource, "utf-8");
  } catch {
    return {
      id: kase.id,
      description: kase.description,
      gradingClass: kase.gradingClass,
      passed: false,
      skipped: false,
      detail: { error: `Cannot read card fixture: ${kase.cardSource}` },
    };
  }

  // Use per-case discoveredFrom override when set (enables §8.2 rule for controls).
  const discoveredFrom = kase.discoveredFrom ?? kase.cardSource;
  const card = parseAgentCard(cardRaw, discoveredFrom);

  let jwks: Jwks | undefined;
  if (kase.signed !== undefined) {
    const jwksSource = kase.signed.jwksSource;
    // "live" is a sentinel value meaning fetch from the live endpoint (WP04).
    // For static-lint, we skip JWKS loading for "live" sources.
    if (jwksSource !== "live") {
      const jwksPath = jwksSource.startsWith("/")
        ? jwksSource
        : resolvePath(manifestDir, jwksSource);
      let jwksRaw: string;
      try {
        jwksRaw = readFileSync(jwksPath, "utf-8");
      } catch {
        return {
          id: kase.id,
          description: kase.description,
          gradingClass: kase.gradingClass,
          passed: false,
          skipped: false,
          detail: { error: `Cannot read JWKS fixture: ${jwksPath}` },
        };
      }
      const jwksParsed = JSON.parse(jwksRaw) as { keys: Array<Record<string, unknown>> };
      jwks = { keys: jwksParsed.keys };
    }
  }

  const report = lintCard(card, {
    jwks,
    expectSigned: kase.signed?.expectVerified,
  });

  return {
    id: kase.id,
    description: kase.description,
    gradingClass: kase.gradingClass,
    passed: report.ok,
    skipped: false,
    detail: {
      ok: report.ok,
      findings: report.findings.map((f) => f.rule),
      signature: report.signature,
      schemaValidation: report.detail.schemaValidation,
    },
  };
}

/**
 * Grade a skill-behavior case against a live A2A endpoint (FR-006).
 *
 * The manifest `expect` field in skillProbe is the NON-LEAKY consistency matcher
 * (FIX 5): it is checked against the received response AFTER invoking the skill,
 * never sent in the request. If `expect` is empty, falls back to checking that
 * the response contains the `input` string.
 *
 * k is the integer passThreshold from the manifest case. Defaults to ceil(0.8 * runs).
 *
 * @param kase     - The manifest case (gradingClass: "skill-behavior").
 * @param endpoint - Live A2A endpoint base URL.
 */
async function gradeSkillBehaviorCase(
  kase: ManifestCase,
  endpoint: string
): Promise<CaseResult> {
  const card = await discoverCard(endpoint);
  const skillProbe = kase.skillProbe;
  if (skillProbe === undefined) {
    return {
      id: kase.id,
      description: kase.description,
      gradingClass: kase.gradingClass,
      passed: false,
      skipped: false,
      detail: { error: "skill-behavior case missing skillProbe" },
    };
  }

  const skill = card.skills.find((s) => s.id === skillProbe.skillId);
  const skillForProbe = skill ?? { id: skillProbe.skillId, description: "" };

  const runs = kase.runs ?? 3;
  // passThreshold from the manifest is an INTEGER COUNT k (not a fraction).
  const k = kase.passThreshold ?? Math.ceil(0.8 * runs);

  // Pass the bearer token when MUSTER_A2A_TOKEN is set — so skill probes work
  // against endpoints that enforce bearer auth (e.g. the healthy test-server mode).
  const token = process.env["MUSTER_A2A_TOKEN"] ?? null;

  const results = await probeSkill(
    endpoint,
    skillForProbe,
    skillProbe.input,
    skillProbe.expect,
    runs,
    token
  );

  const passed = aggregateSkillBehavior(results, k);
  const passCount = results.filter((r) => r.consistent).length;

  return {
    id: kase.id,
    description: kase.description,
    gradingClass: kase.gradingClass,
    passed,
    skipped: false,
    detail: {
      skillId: skillProbe.skillId,
      runs,
      k,
      passCount,
      // `expect` is the (non-leaky) consistency matcher — checked against the response
      // AFTER receiving it (FIX 5). Never sent to the agent in the request.
      expectMatcher: skillProbe.expect,
    },
  };
}

/**
 * Grade an auth-negative case against a live A2A endpoint (FR-007).
 *
 * @param kase     - The manifest case (gradingClass: "auth-negative").
 * @param endpoint - Live A2A endpoint base URL.
 */
async function gradeAuthNegativeCase(
  kase: ManifestCase,
  endpoint: string
): Promise<CaseResult> {
  const auth = kase.auth;
  if (auth === undefined) {
    return {
      id: kase.id,
      description: kase.description,
      gradingClass: kase.gradingClass,
      passed: false,
      skipped: false,
      detail: { error: "auth-negative case missing auth block" },
    };
  }

  const card = await discoverCard(endpoint);
  const scheme = card.securitySchemes.find((s) => s.type === auth.scheme);
  const schemeForCheck = scheme ?? { id: auth.scheme, type: auth.scheme, protectedMethods: [auth.method] };

  // When authorized:false in the manifest, we only probe the unauthorized path.
  const token = auth.authorized ? (process.env["MUSTER_A2A_TOKEN"] ?? null) : null;

  const authCheck = await checkAuthEnforcement(
    endpoint,
    schemeForCheck,
    auth.method,
    token
  );

  // FIX 4: unsupported scheme type → SKIPPED (not a false pass, not a misleading failure).
  if (authCheck.schemeTypeUnsupported !== undefined) {
    return {
      id: kase.id,
      description: kase.description,
      gradingClass: kase.gradingClass,
      passed: false,
      skipped: true,
      skipReason: `scheme type '${authCheck.schemeTypeUnsupported}' is not exercised by this residual-gap adapter (only bearer-style schemes)`,
      detail: authCheck.detail,
    };
  }

  return {
    id: kase.id,
    description: kase.description,
    gradingClass: kase.gradingClass,
    passed: authCheck.passed,
    skipped: false,
    detail: {
      rejectedUnauthorized: authCheck.rejectedUnauthorized,
      acceptedAuthorized: authCheck.acceptedAuthorized,
      ...authCheck.detail,
    },
  };
}

/**
 * Grade a signed-card-live case against a live A2A endpoint (FR-008).
 *
 * Handles the nested-skip path: if the JWKS endpoint is unreachable while the
 * card endpoint is reachable, returns skipped:true (not a failure).
 *
 * @param kase     - The manifest case (gradingClass: "signed-card-live").
 * @param endpoint - Live A2A endpoint base URL.
 */
async function gradeSignedCardLiveCase(
  kase: ManifestCase,
  endpoint: string
): Promise<CaseResult> {
  const liveResult = await checkLiveSignedCard(endpoint);

  if (liveResult.skipped) {
    return {
      id: kase.id,
      description: kase.description,
      gradingClass: kase.gradingClass,
      passed: false,
      skipped: true,
      skipReason: liveResult.skipReason ?? "live JWKS unavailable",
      detail: { signature: liveResult.signature },
    };
  }

  return {
    id: kase.id,
    description: kase.description,
    gradingClass: kase.gradingClass,
    passed: liveResult.passed,
    skipped: false,
    detail: { signature: liveResult.signature },
  };
}

/**
 * Apply the control inversion (FR-011).
 *
 * For control:true cases: the case PASSES iff the grader FAILS.
 * A control that stops discriminating (grader passes) turns the suite red.
 *
 * This inversion is applied AFTER the raw grader result, NEVER before.
 * A skipped case stays skipped (skip semantics take precedence — the control
 * can only invert a grader result that actually ran).
 *
 * @param result  - Raw CaseResult from the grader.
 * @param control - true when this is a discrimination control case.
 */
function applyControlInversion(result: CaseResult, control: boolean): CaseResult {
  if (!control || result.skipped) {
    return result;
  }
  // The control fires (grader fails as designed) → case passes.
  // The control stops discriminating (grader passes) → case fails.
  return {
    ...result,
    passed: !result.passed,
    detail: {
      ...result.detail,
      controlInverted: true,
      graderRawPassed: result.passed,
    },
  };
}

/**
 * Build a skipped CaseResult for live cases when MUSTER_A2A_ENDPOINT is unset.
 */
function skippedResult(kase: ManifestCase): CaseResult {
  return {
    id: kase.id,
    description: kase.description,
    gradingClass: kase.gradingClass,
    passed: false,
    skipped: true,
    skipReason: LIVE_SKIP_REASON,
  };
}

/**
 * Build a failed CaseResult from a caught live grader error (FR-010).
 * A thrown live error is a FAILED RUN — never skipped.
 */
function failedFromError(kase: ManifestCase, err: unknown): CaseResult {
  return {
    id: kase.id,
    description: kase.description,
    gradingClass: kase.gradingClass,
    passed: false,
    skipped: false,
    detail: { error: String(err) },
  };
}

/**
 * Run a live grader against the endpoint.
 *
 * When endpoint is null (env unset) → returns a skipped result (FR-009).
 * When the grader throws → returns a failed result (FR-010, never skipped).
 *
 * @param kase     - The manifest case.
 * @param endpoint - Live endpoint or null.
 * @param grader   - Async grader function that takes (kase, endpoint).
 */
async function runLiveCase(
  kase: ManifestCase,
  endpoint: string | null,
  grader: (kase: ManifestCase, ep: string) => Promise<CaseResult>
): Promise<CaseResult> {
  if (endpoint === null) {
    return skippedResult(kase);
  }
  try {
    return await grader(kase, endpoint);
  } catch (err) {
    return failedFromError(kase, err);
  }
}

// ---------------------------------------------------------------------------
// Behavioral manifest runner (WP04, T020/T021)
// ---------------------------------------------------------------------------

/**
 * Outcome returned by runA2aBehavioralManifest; consumed by doA2aRun in the CLI.
 *
 * - skipped: true when MUSTER_A2A_ENDPOINT was not set (no endpoint → cases
 *   skipped, not failed — FR-009).
 * - violations: non-empty when the manifest failed schema validation (exit 2).
 * - result: present when the runner executed (skipped=false, violations=[]).
 */
export interface A2aBehavioralManifestOutcome {
  skipped: boolean;
  violations: Violation[];
  result: BehavioralRunResult | null;
}

/**
 * Load, validate, and run an A2A behavioral manifest.
 *
 * Endpoint activation (FR-009): reads the env-var name from the manifest's
 * `endpoint.env` field and resolves the URL at call time. If the env var is
 * absent, all cases are marked skipped and exit 0 is recommended.
 *
 * Threshold resolution (decision-C): calls WP02's resolveThresholds() per case,
 * injecting the provided adapter for soul parsing + resolution.
 *
 * Error contract (FR-010): an errored run is a failed run; allErrored → exit 2.
 *
 * NFR-002: token value is read from env at call time inside runBehavioralCases;
 * it is never stored or logged here.
 *
 * @param manifestPath - Absolute path to the behavioral manifest YAML.
 * @param adapter      - SpecAdapter for soul resolution (threshold decision-C).
 */
export async function runA2aBehavioralManifest(
  manifestPath: string,
  adapter: SpecAdapter
): Promise<A2aBehavioralManifestOutcome> {
  const loaded = await loadBehavioralManifest(manifestPath);
  if (isA2aBehavioralManifestError(loaded)) {
    return { skipped: false, violations: loaded, result: null };
  }

  // FR-009: if the endpoint env var is absent, skip all cases (not fail).
  const endpointValue = process.env[loaded.endpoint.env] ?? "";
  if (endpointValue === "") {
    return { skipped: true, violations: [], result: null };
  }

  // Build per-case threshold resolver (decision-C, WP02 resolveThresholds).
  const resolveThresholdsFor = async (
    kase: A2aBehavioralCase
  ): Promise<import("./behavioral-manifest.js").ResolvedThresholds> => {
    const resolved = await resolveThresholds(
      kase.id,
      kase.soul,
      kase.thresholds,
      kase.overrides,
      kase.axes,
      adapter
    );
    if (Array.isArray(resolved)) {
      // Threshold violation: throw so runBehavioralCases records an errored run.
      const msgs = resolved.map((v) => `${v.path}: ${v.message}`).join("; ");
      throw new Error(`threshold resolution failed for case "${kase.id}": ${msgs}`);
    }
    return resolved;
  };

  const result = await runBehavioralCases(loaded, resolveThresholdsFor);
  return { skipped: false, violations: [], result };
}

// ---------------------------------------------------------------------------
// T025 — runManifest (FR-012)
// ---------------------------------------------------------------------------

/**
 * Run all cases in an A2A test manifest and return a deterministic
 * pass/fail summary sorted by case ID (UTF-16 code-unit ordering, NFR-001).
 *
 * Dispatch by gradingClass:
 * - "static-lint"       → always runs offline (lintCard).
 * - "skill-behavior"    → skipped when MUSTER_A2A_ENDPOINT is unset; else live probe.
 * - "auth-negative"     → skipped when MUSTER_A2A_ENDPOINT is unset; else live check.
 * - "signed-card-live"  → skipped when MUSTER_A2A_ENDPOINT is unset; else live check
 *                         (may also produce a nested skip if live JWKS is unavailable).
 *
 * A thrown live error is a FAILED RUN (never skipped, FR-010). Env-unset is the
 * only skip path for live cases.
 *
 * For control:true cases: the case PASSES iff the grader FAILS (the control
 * behaves as designed). A control that stops discriminating turns the suite red.
 *
 * @param manifestPath - Absolute or resolvable path to manifest JSON.
 * @param projectRoot  - Root for resolving relative fixture paths. Defaults
 *                       to the manifest file's directory.
 */
export async function runManifest(
  manifestPath: string,
  _projectRoot?: string
): Promise<ManifestSummary> {
  const absManifest = resolvePath(manifestPath);
  // manifestDir: the directory containing the manifest file, used to resolve
  // relative fixture paths (cardSource, jwksSource) within the manifest.
  // _projectRoot is accepted for API compatibility with heartbeat's runManifest
  // but fixture paths are always resolved against the manifest's own directory
  // (consistent with how loadManifest resolves cardSource, FR-002).
  const manifestDir = dirname(absManifest);

  const manifest = loadManifest(absManifest);
  const endpoint = envEndpoint();

  const results: CaseResult[] = [];

  for (const kase of manifest.cases) {
    let result: CaseResult;

    switch (kase.gradingClass) {
      case "static-lint":
        result = gradeStaticLintCase(kase, manifestDir);
        break;

      case "skill-behavior":
        // Errored live probe = failed run (FR-010), never skipped.
        result = await runLiveCase(kase, endpoint, gradeSkillBehaviorCase);
        break;

      case "auth-negative":
        result = await runLiveCase(kase, endpoint, gradeAuthNegativeCase);
        break;

      case "signed-card-live":
        result = await runLiveCase(kase, endpoint, gradeSignedCardLiveCase);
        break;

      default: {
        const exhaustiveCheck: never = kase.gradingClass;
        result = {
          id: kase.id,
          description: kase.description,
          gradingClass: String(exhaustiveCheck) as ManifestCase["gradingClass"],
          passed: false,
          skipped: false,
          detail: { error: `Unknown gradingClass: ${String(exhaustiveCheck)}` },
        };
        break;
      }
    }

    // Apply control inversion AFTER the grader runs (FR-011).
    results.push(applyControlInversion(result, kase.control ?? false));
  }

  // Sort by case ID using UTF-16 code-unit ordering (NFR-001).
  // NEVER use localeCompare — it is locale-dependent and breaks byte-stability.
  results.sort((a, b) => {
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });

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
// SpecAdapter stubs (C-001/C-004 boundary satisfaction)
//
// A2A Agent Cards is not a Soul.md RFC-1 document. These stubs satisfy the
// SpecAdapter interface contract so the adapter can be placed in a registry
// alongside rfc1Adapter. The CLI uses runManifest() / lintCard() instead
// of the Soul.md pipeline when --adapter a2a is selected.
//
// Key invariant: NO A2A-specific type is imported by src/core/. The boundary
// is one-directional (C-001).
// ---------------------------------------------------------------------------

const A2A_MERGE_STRATEGY: MergeStrategy = {
  scalars: "replace",
  maps: "deep",
  lists: "replace",
  typeMismatch: "replace",
  nullIsValue: true,
};

const A2A_THRESHOLDS: ThresholdMapping = {
  maxWords(verbosity: number): number {
    return 10 + verbosity;
  },
  refusalCap: 25,
  words(s: string): number {
    return s.trim().split(/\s+/).filter(Boolean).length;
  },
};

/** The A2aAdapter — satisfies SpecAdapter and the C-001/C-004 contract. */
export class A2aAdapter implements SpecAdapter {
  readonly name = "a2a" as const;
  readonly specVersion: string = VERSION;
  readonly mergeStrategy: MergeStrategy = A2A_MERGE_STRATEGY;
  readonly thresholds: ThresholdMapping = A2A_THRESHOLDS;

  /** Stub parse: A2A Agent Cards is not a Soul.md RFC-1 document. */
  parse(raw: string, path: string, _mode: Mode): SoulDocument | Violation[] {
    return { path, frontMatter: {}, body: raw, kind: "soul" };
  }

  /** Stub validate: no RFC-1 schema validation for A2A Agent Cards. */
  validate(_doc: SoulDocument, _mode: Mode): Violation[] {
    return [];
  }

  /** Stub resolve: no Soul.md composition for A2A Agent Cards. */
  async resolve(
    _doc: SoulDocument,
    _opts: { profile?: string; state?: string; mode: Mode },
    _loadRef: (ref: string, fromPath: string) => Promise<SoulDocument | Violation[]>
  ): Promise<EffectiveConfig | Violation[]> {
    return {};
  }

  /** Stub evaluateTriggers: no trigger evaluation for A2A Agent Cards. */
  evaluateTriggers(
    _effective: EffectiveConfig,
    _facts: Record<string, boolean | string>,
    _mode: Mode
  ): string | Violation[] | null {
    return null;
  }
}

/** The singleton A2A adapter instance. */
export const a2aAdapter: SpecAdapter = new A2aAdapter();

/** Structural conformance witness: satisfies the C-004 contract. */
const _contractCheck: SpecAdapter = a2aAdapter;
