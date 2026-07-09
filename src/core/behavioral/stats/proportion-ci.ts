/**
 * proportion-ci.ts — Single-arm pass-rate confidence intervals.
 *
 * Provides the normal-approximation (Wald/CLT) confidence interval for a
 * single Bernoulli pass-rate, and the Wilson score interval that muster uses
 * near the p̂≈0/1 or small-n boundary where Wald has documented poor
 * coverage. Also exports a shared `standardNormalQuantile` (probit) helper
 * used across the `stats/` module for any z-score derived from a confidence
 * level or a target power.
 *
 * Pure, dependency-free, deterministic (no I/O, no Date.now()/Math.random()
 * on the static path) — muster minimal-deps invariant (see BRIEF.md).
 *
 * Normative citations:
 *   - Miller, "Adding Error Bars to Evals" (arXiv:2411.00640) — RESEARCH.
 *     CLT/Bernoulli normal-approximation CI for a single pass-rate.
 *   - Brown, Cai, DasGupta, "Interval Estimation for a Binomial Proportion"
 *     (Statistical Science, 2001) — RESEARCH. Documents Wald's poor coverage
 *     near p=0/1 and for small n; recommends Wilson (or Jeffreys) instead.
 *   - muster memory-utilization-conformance research.md §4A (own rubric,
 *     synthesizing the above into the boundary-switching policy below).
 */

// ---------------------------------------------------------------------------
// standardNormalQuantile — inverse standard normal CDF (probit function)
// ---------------------------------------------------------------------------

/**
 * Rational-approximation coefficients for Peter J. Acklam's algorithm for
 * the inverse standard normal CDF ("An algorithm for computing the inverse
 * normal cumulative distribution function", 2003) — a widely republished,
 * public-domain approximation accurate to ~1.15e-9 relative error across the
 * whole domain. No numerical dependency is pulled in; this is the standard
 * technique used in dependency-free statistics code.
 */
const ACKLAM_A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
  -3.066479806614716e1, 2.506628277459239e0,
] as const;
const ACKLAM_B = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
  -1.328068155288572e1,
] as const;
const ACKLAM_C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0, -2.549732539343734e0,
  4.374664141464968e0, 2.938163982698783e0,
] as const;
const ACKLAM_D = [
  7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0, 3.754408661907416e0,
] as const;
const ACKLAM_LOW_TAIL = 0.02425;

function acklamTail(q: number): number {
  const numerator = ((((ACKLAM_C[0] * q + ACKLAM_C[1]) * q + ACKLAM_C[2]) * q + ACKLAM_C[3]) * q + ACKLAM_C[4]) * q + ACKLAM_C[5];
  const denominator = (((ACKLAM_D[0] * q + ACKLAM_D[1]) * q + ACKLAM_D[2]) * q + ACKLAM_D[3]) * q + 1;
  return numerator / denominator;
}

function acklamLowerTail(p: number): number {
  return acklamTail(Math.sqrt(-2 * Math.log(p)));
}

function acklamCentral(p: number): number {
  const q = p - 0.5;
  const r = q * q;
  const numerator = ((((ACKLAM_A[0] * r + ACKLAM_A[1]) * r + ACKLAM_A[2]) * r + ACKLAM_A[3]) * r + ACKLAM_A[4]) * r + ACKLAM_A[5];
  const denominator = ((((ACKLAM_B[0] * r + ACKLAM_B[1]) * r + ACKLAM_B[2]) * r + ACKLAM_B[3]) * r + ACKLAM_B[4]) * r + 1;
  return (numerator * q) / denominator;
}

/**
 * Inverse standard normal CDF (probit function): the z such that
 * Φ(z) = p, for p ∈ (0, 1). Pure rational approximation (Acklam's
 * algorithm) — no dependency, no lookup table.
 */
export function standardNormalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) {
    throw new Error(`standardNormalQuantile: p must be in the open interval (0, 1), got ${p}`);
  }
  if (p < ACKLAM_LOW_TAIL) return acklamLowerTail(p);
  if (p <= 1 - ACKLAM_LOW_TAIL) return acklamCentral(p);
  return -acklamLowerTail(1 - p);
}

/**
 * The two-sided critical z-value for a given confidence level, e.g.
 * `zForConfidenceLevel(0.95)` ≈ 1.959964 (the "1.96" in the CLT formula).
 */
export function zForConfidenceLevel(confidenceLevel = 0.95): number {
  validateConfidenceLevel(confidenceLevel);
  const tail = (1 - confidenceLevel) / 2;
  return standardNormalQuantile(1 - tail);
}

// ---------------------------------------------------------------------------
// Proportion CIs
// ---------------------------------------------------------------------------

export interface ProportionCIResult {
  readonly successes: number;
  readonly n: number;
  readonly confidenceLevel: number;
  /** p̂ = successes / n. */
  readonly pointEstimate: number;
  readonly lower: number;
  readonly upper: number;
  readonly method: "wald" | "wilson";
}

function validateProportionInputs(successes: number, n: number): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`proportion CI: n must be a positive integer, got ${n}`);
  }
  if (!Number.isInteger(successes) || successes < 0 || successes > n) {
    throw new Error(`proportion CI: successes must be an integer in [0, n], got ${successes} (n=${n})`);
  }
}

function validateConfidenceLevel(confidenceLevel: number): void {
  if (!(confidenceLevel > 0 && confidenceLevel < 1)) {
    throw new Error(`confidenceLevel must be in the open interval (0, 1), got ${confidenceLevel}`);
  }
}

/** Clamp a proportion CI's bounds to the valid [0, 1] probability range. */
function clampToUnitInterval(result: ProportionCIResult): ProportionCIResult {
  return { ...result, lower: Math.max(0, result.lower), upper: Math.min(1, result.upper) };
}

/**
 * The CLT/Bernoulli normal-approximation ("Wald") confidence interval:
 * p̂ ± z·√(p̂(1−p̂)/n). Known to have poor coverage near p̂≈0/1 or for small
 * n — prefer `wilsonProportionCI` (or the auto-selecting `proportionCI`)
 * near those boundaries.
 */
export function waldProportionCI(successes: number, n: number, confidenceLevel = 0.95): ProportionCIResult {
  validateProportionInputs(successes, n);
  const z = zForConfidenceLevel(confidenceLevel);
  const pointEstimate = successes / n;
  const standardError = Math.sqrt((pointEstimate * (1 - pointEstimate)) / n);
  return clampToUnitInterval({
    successes,
    n,
    confidenceLevel,
    pointEstimate,
    lower: pointEstimate - z * standardError,
    upper: pointEstimate + z * standardError,
    method: "wald",
  });
}

/**
 * The Wilson score interval — inverts the normal-approximation score test
 * rather than centering on p̂, giving materially better coverage than Wald
 * near p̂≈0/1 and for small n (Brown/Cai/DasGupta 2001).
 */
export function wilsonProportionCI(successes: number, n: number, confidenceLevel = 0.95): ProportionCIResult {
  validateProportionInputs(successes, n);
  const z = zForConfidenceLevel(confidenceLevel);
  const pointEstimate = successes / n;
  const zSquared = z * z;
  const denominator = 1 + zSquared / n;
  const center = (pointEstimate + zSquared / (2 * n)) / denominator;
  const halfWidth =
    (z / denominator) * Math.sqrt((pointEstimate * (1 - pointEstimate)) / n + zSquared / (4 * n * n));
  return clampToUnitInterval({
    successes,
    n,
    confidenceLevel,
    pointEstimate,
    lower: center - halfWidth,
    upper: center + halfWidth,
    method: "wilson",
  });
}

/**
 * Boundary heuristic for the auto-selecting `proportionCI`: Wald's coverage
 * degrades near p̂≈0/1 and for small n (Brown/Cai/DasGupta 2001). muster's
 * judgment call (no single universal threshold is normatively mandated):
 * treat p̂ at either extreme, or p̂ within 10% of either extreme, or n below
 * 30, as "near the boundary".
 */
function isNearBoundary(successes: number, n: number): boolean {
  const pointEstimate = successes / n;
  return successes === 0 || successes === n || n < 30 || pointEstimate <= 0.1 || pointEstimate >= 0.9;
}

/**
 * Single-arm pass-rate CI with automatic method selection: Wilson near the
 * p̂≈0/1 or small-n boundary (where Wald's coverage is documented-poor),
 * Wald in the well-behaved interior. See `isNearBoundary` for the exact
 * switching rule.
 */
export function proportionCI(successes: number, n: number, confidenceLevel = 0.95): ProportionCIResult {
  validateProportionInputs(successes, n);
  return isNearBoundary(successes, n)
    ? wilsonProportionCI(successes, n, confidenceLevel)
    : waldProportionCI(successes, n, confidenceLevel);
}
