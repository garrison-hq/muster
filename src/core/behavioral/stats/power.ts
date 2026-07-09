/**
 * power.ts — Sample-size / minimum-detectable-effect (MDE) for a lift delta,
 * plus a "no-lift" bounded/powered null-verdict helper.
 *
 * Implements Miller's Eq. 9 (required N for a target lift) and its Eq. 10
 * inversion (MDE for a fixed N), and a helper that turns a lift-delta CI plus
 * a pre-declared meaningful-lift threshold into a proper bounded/powered
 * "no-lift" verdict — never "absence of evidence is evidence of absence"
 * (research.md §4A, Miller §5).
 *
 * Pure, dependency-free, deterministic — muster minimal-deps invariant.
 *
 * Normative citations:
 *   - Miller, "Adding Error Bars to Evals" (arXiv:2411.00640) — RESEARCH.
 *     Eq. 9: n = (z_{α/2}+z_β)²·(ω²+σ²_A/K_A+σ²_B/K_B)/δ². Eq. 10: the MDE
 *     inversion. §5: "report a 'no-lift' verdict as a bounded/powered null
 *     (CI excludes the lift threshold / equivalence), never 'absence of
 *     evidence'."
 */

import { standardNormalQuantile } from "./proportion-ci.js";

// ---------------------------------------------------------------------------
// Sample size (Eq. 9) / MDE (Eq. 10)
// ---------------------------------------------------------------------------

export interface PowerVarianceComponents {
  /** ω² — the paired/shared variance component (grading noise common to both arms). */
  readonly omega2: number;
  /** σ²_A — arm-A per-sample variance. */
  readonly sigmaA2: number;
  /** K_A — samples per probe in arm A. */
  readonly kA: number;
  /** σ²_B — arm-B per-sample variance. */
  readonly sigmaB2: number;
  /** K_B — samples per probe in arm B. */
  readonly kB: number;
}

export interface PowerParams extends PowerVarianceComponents {
  /** Two-sided significance level. Default 0.05. */
  readonly alpha?: number;
  /** Target statistical power (1 − β). Default 0.8. */
  readonly power?: number;
}

const DEFAULT_ALPHA = 0.05;
const DEFAULT_POWER = 0.8;

function validateVarianceComponents(params: PowerVarianceComponents): void {
  const { omega2, sigmaA2, kA, sigmaB2, kB } = params;
  if (omega2 < 0 || sigmaA2 < 0 || sigmaB2 < 0) {
    throw new Error("power: variance components (omega2, sigmaA2, sigmaB2) must be >= 0");
  }
  if (!Number.isInteger(kA) || kA < 1 || !Number.isInteger(kB) || kB < 1) {
    throw new Error(`power: kA and kB must be positive integers, got kA=${kA}, kB=${kB}`);
  }
}

function resolveAlphaPower(params: { alpha?: number; power?: number }): { alpha: number; power: number } {
  const alpha = params.alpha ?? DEFAULT_ALPHA;
  const power = params.power ?? DEFAULT_POWER;
  if (!(alpha > 0 && alpha < 1)) {
    throw new Error(`power: alpha must be in the open interval (0, 1), got ${alpha}`);
  }
  if (!(power > 0 && power < 1)) {
    throw new Error(`power: power (1-beta) must be in the open interval (0, 1), got ${power}`);
  }
  return { alpha, power };
}

function totalVariance(params: PowerVarianceComponents): number {
  return params.omega2 + params.sigmaA2 / params.kA + params.sigmaB2 / params.kB;
}

/** z_{α/2} + z_β — the critical-z sum shared by Eq. 9 and its Eq. 10 inversion. */
function criticalZSum(resolved: { alpha: number; power: number }): number {
  const zAlpha = standardNormalQuantile(1 - resolved.alpha / 2);
  const zBeta = standardNormalQuantile(resolved.power);
  return zAlpha + zBeta;
}

/**
 * Miller Eq. 9 — the required (unrounded) probe-set size to detect a lift
 * `delta` with the given variance components, alpha and power:
 *   n = (z_{α/2}+z_β)²·(ω²+σ²_A/K_A+σ²_B/K_B) / δ²
 */
export function computeSampleSize(delta: number, params: PowerParams): number {
  // NaN-safe equivalent of `!(delta > 0)` without the double-negation
  // SonarCloud flags (S1940): `NaN > 0` is `false`, so the original also
  // throws on NaN — a plain `delta <= 0` flip would NOT, silently accepting
  // a malformed NaN delta.
  if (Number.isNaN(delta) || delta <= 0) {
    throw new Error(`computeSampleSize: delta must be > 0, got ${delta}`);
  }
  validateVarianceComponents(params);
  const resolved = resolveAlphaPower(params);
  const zSum = criticalZSum(resolved);
  return (zSum * zSum * totalVariance(params)) / (delta * delta);
}

/** The practical whole-probe sample size: `Math.ceil` of Eq. 9. */
export function requiredSampleSize(delta: number, params: PowerParams): number {
  return Math.ceil(computeSampleSize(delta, params));
}

/**
 * Miller Eq. 10 — the minimum detectable effect (MDE) for a fixed probe-set
 * size `n`, inverting Eq. 9:
 *   δ = (z_{α/2}+z_β)·√(ω²+σ²_A/K_A+σ²_B/K_B) / √n
 */
export function minimumDetectableEffect(n: number, params: PowerParams): number {
  if (!(Number.isFinite(n) && n > 0)) {
    throw new Error(`minimumDetectableEffect: n must be > 0, got ${n}`);
  }
  validateVarianceComponents(params);
  const resolved = resolveAlphaPower(params);
  const zSum = criticalZSum(resolved);
  return (zSum * Math.sqrt(totalVariance(params))) / Math.sqrt(n);
}

// ---------------------------------------------------------------------------
// No-lift bounded/powered null verdict
// ---------------------------------------------------------------------------

export interface ConfidenceInterval {
  readonly lower: number;
  readonly upper: number;
}

export type LiftVerdict = "lift-confirmed" | "no-lift" | "inconclusive";

export interface LiftVerdictResult {
  readonly verdict: LiftVerdict;
  readonly ciLower: number;
  readonly ciUpper: number;
  readonly liftThreshold: number;
}

function resolveLiftVerdict(ci: ConfidenceInterval, liftThreshold: number): LiftVerdict {
  if (ci.upper < liftThreshold) return "no-lift";
  if (ci.lower >= liftThreshold) return "lift-confirmed";
  return "inconclusive";
}

/**
 * Render a bounded/powered "no-lift" null verdict from a lift-delta CI and a
 * pre-declared meaningful-lift threshold (the CI-excludes-threshold /
 * equivalence framing Miller §5 requires): `"no-lift"` iff the CI's upper
 * bound is entirely below the threshold (a genuine powered null, not
 * "absence of evidence"); `"lift-confirmed"` iff the CI's lower bound meets
 * or exceeds the threshold; `"inconclusive"` otherwise (underpowered — the
 * threshold falls inside the CI).
 */
export function evaluateLiftVerdict(ci: ConfidenceInterval, liftThreshold: number): LiftVerdictResult {
  // NaN-safe equivalent of `!(liftThreshold > 0)` without the double-negation
  // SonarCloud flags (S1940): `NaN > 0` is `false`, so the original also
  // throws on NaN — a plain `liftThreshold <= 0` flip would NOT, silently
  // accepting a malformed NaN threshold.
  if (Number.isNaN(liftThreshold) || liftThreshold <= 0) {
    throw new Error(`evaluateLiftVerdict: liftThreshold must be > 0, got ${liftThreshold}`);
  }
  if (ci.lower > ci.upper) {
    throw new Error(`evaluateLiftVerdict: ci.lower (${ci.lower}) must be <= ci.upper (${ci.upper})`);
  }
  return {
    verdict: resolveLiftVerdict(ci, liftThreshold),
    ciLower: ci.lower,
    ciUpper: ci.upper,
    liftThreshold,
  };
}
