/**
 * paired.ts — Matched-pairs (paired-probe) significance test and CI.
 *
 * For the same probe run under two arms (e.g. "with memory fixture" vs
 * "without"), retained as a per-probe boolean pair, this module answers two
 * questions muster's learning-lift verdict needs:
 *   1. Is the paired difference distinguishable from noise? → McNemar mid-p
 *      test on the discordant pairs.
 *   2. What is the confidence interval on the paired difference itself? →
 *      Tango's asymptotic-score interval (primary), with Newcombe's
 *      square-and-add method available as a closed-form cross-check.
 *
 * Both deliberately avoid the two documented anti-patterns for this data
 * structure: the McNemar *exact-conditional* test (too conservative, needs
 * huge N) and a plain Wald interval on the paired difference (anti-
 * conservative, poor coverage) — see research.md §4A.
 *
 * Pure, dependency-free, deterministic — muster minimal-deps invariant.
 *
 * Normative citations:
 *   - Fagerland, Lydersen, Laake, "The McNemar test for binary matched-pairs
 *     data: mid-p and asymptotic are better than exact conditional" (BMC
 *     Medical Research Methodology, 2013, PMC3716987) — RESEARCH / de-facto
 *     biostatistics CONVENTION. Recommends mid-p over exact-conditional.
 *   - Fagerland, Lydersen, Laake, "Recommended confidence intervals for two
 *     independent binomial proportions" companion paper family and Tango's
 *     original method — Statistics in Medicine, 2014, 10.1002/sim.6148 —
 *     RESEARCH. Recommends the Tango asymptotic-score interval (or Newcombe)
 *     over Wald for the paired difference.
 *   - Tango, T. (1998), "Equivalence test and confidence interval for the
 *     difference in proportions for the paired-sample design", Statistics in
 *     Medicine 17, 891–908 — RESEARCH. Origin of the asymptotic-score method
 *     implemented in `tangoScoreCI` (constrained-MLE quadratic + score
 *     inversion, reproduced from first principles below).
 *   - Newcombe, R.G. (1998), "Improved confidence intervals for the
 *     difference between binomial proportions based on paired data",
 *     Statistics in Medicine 17, 2635–2650 — RESEARCH. "Method 10"
 *     square-and-add interval implemented in `newcombeMoverCI`.
 */

import { wilsonProportionCI, zForConfidenceLevel } from "./proportion-ci.js";

// ---------------------------------------------------------------------------
// Shared pair tally
// ---------------------------------------------------------------------------

/** One probe's paired boolean outcome under two arms (generic — no layer specifics). */
export interface PairedOutcome {
  readonly armA: boolean;
  readonly armB: boolean;
}

interface PairTally {
  readonly n: number;
  /** n11 — both arms passed (concordant pass). */
  readonly bothPass: number;
  /** n10 — arm A passed, arm B failed (discordant, favors A). */
  readonly aOnlyPass: number;
  /** n01 — arm A failed, arm B passed (discordant, favors B). */
  readonly bOnlyPass: number;
  /** n00 — both arms failed (concordant fail). */
  readonly bothFail: number;
}

function tallyPairs(pairs: readonly PairedOutcome[]): PairTally {
  let bothPass = 0;
  let aOnlyPass = 0;
  let bOnlyPass = 0;
  let bothFail = 0;
  for (const pair of pairs) {
    if (pair.armA && pair.armB) bothPass++;
    else if (pair.armA && !pair.armB) aOnlyPass++;
    else if (!pair.armA && pair.armB) bOnlyPass++;
    else bothFail++;
  }
  return { n: pairs.length, bothPass, aOnlyPass, bOnlyPass, bothFail };
}

function validateNonEmptyPairs(pairs: readonly PairedOutcome[], fnName: string): void {
  if (pairs.length === 0) {
    throw new Error(`${fnName}: pairs must be non-empty`);
  }
}

// ---------------------------------------------------------------------------
// McNemar mid-p test
// ---------------------------------------------------------------------------

export interface McNemarResult {
  readonly n: number;
  /** b — discordant pairs favoring arm A. */
  readonly discordantFavoringA: number;
  /** c — discordant pairs favoring arm B. */
  readonly discordantFavoringB: number;
  readonly pValue: number;
}

/**
 * Binomial(trials, 0.5) PMF at every k=0..trials, via the standard
 * multiplicative recurrence pmf[k] = pmf[k-1]·(trials-k+1)/k (p/(1-p) is 1
 * for p=0.5). Kept in linear (non-log) space: exact and simple for the
 * probe-count scale muster targets (up to ~thousands of discordant pairs);
 * documented limitation below.
 *
 * Numerical note: `Math.pow(0.5, trials)` underflows to 0 for trials beyond
 * ~1075 (double-precision denormal floor). Mid-p McNemar is a small-sample
 * test by design (research.md §4A: "dominates on small probe sets") so this
 * is not a practical limitation for muster's probe counts.
 */
function binomialPMFHalf(trials: number): number[] {
  const pmf = new Array<number>(trials + 1);
  pmf[0] = Math.pow(0.5, trials);
  for (let k = 1; k <= trials; k++) {
    pmf[k] = pmf[k - 1] * ((trials - k + 1) / k);
  }
  return pmf;
}

/**
 * McNemar mid-p test on matched-pairs booleans. Uses only the discordant
 * pairs b (favoring A) and c (favoring B): under H0, each discordant pair is
 * independently equally likely to favor either arm, so b ~ Binomial(b+c,
 * 0.5). The mid-p adjustment subtracts half the point mass at the observed
 * boundary from the two-sided exact binomial p-value — less conservative
 * than the exact-conditional test, which research.md §4A flags as having
 * poor power on realistic probe-set sizes.
 *
 * mid-p = 2·P(X ≤ m) − P(X = m), where m = min(b, c), X ~ Binomial(b+c, 0.5).
 * (Equivalently: mid-p = 2·[P(X ≤ m) − ½·P(X = m)], i.e. "exact p minus half
 * the point mass", doubled for the two-sided test — see module tests for the
 * hand-verified derivation.)
 */
export function mcnemarMidP(pairs: readonly PairedOutcome[]): McNemarResult {
  validateNonEmptyPairs(pairs, "mcnemarMidP");
  const tally = tallyPairs(pairs);
  const b = tally.aOnlyPass;
  const c = tally.bOnlyPass;
  const discordant = b + c;
  if (discordant === 0) {
    // No discordant pairs: complete agreement, no evidence of a difference.
    return { n: tally.n, discordantFavoringA: b, discordantFavoringB: c, pValue: 1 };
  }
  const pmf = binomialPMFHalf(discordant);
  const m = Math.min(b, c);
  let cdfAtM = 0;
  for (let i = 0; i <= m; i++) cdfAtM += pmf[i];
  const midP = 2 * cdfAtM - pmf[m];
  return {
    n: tally.n,
    discordantFavoringA: b,
    discordantFavoringB: c,
    pValue: Math.min(1, Math.max(0, midP)),
  };
}

// ---------------------------------------------------------------------------
// Paired-difference confidence intervals
// ---------------------------------------------------------------------------

export interface PairedDifferenceCIResult {
  readonly n: number;
  /** d̂ = p1 − p2, the observed paired difference. */
  readonly estimate: number;
  readonly lower: number;
  readonly upper: number;
  readonly confidenceLevel: number;
  readonly method: "tango-score" | "newcombe-mover";
}

interface TangoContext {
  readonly n: number;
  /** s = b + c, total discordant pairs. */
  readonly s: number;
  /** m = n11 + n00, total concordant pairs. */
  readonly m: number;
  /** d̂ = (b − c) / n. */
  readonly dHat: number;
}

function makeTangoContext(tally: PairTally): TangoContext {
  const s = tally.aOnlyPass + tally.bOnlyPass;
  const m = tally.bothPass + tally.bothFail;
  const dHat = (tally.aOnlyPass - tally.bOnlyPass) / tally.n;
  return { n: tally.n, s, m, dHat };
}

const TANGO_ROOT_TOLERANCE = 1e-9;

/**
 * Tango (1998): solve the constrained-MLE quadratic for φ = π10 + π01 (total
 * discordant probability) given a hypothesized paired difference `delta`.
 *
 * Derivation (reproduced here since Tango's paper states the result without
 * re-deriving it): maximizing the multinomial log-likelihood subject to
 * π10 − π01 = delta and Σπ = 1 eliminates π11 and π00 in closed form
 * (π11 ∝ n11(1−φ), π00 ∝ n00(1−φ)), and the remaining stationarity condition
 * in φ reduces to the quadratic:
 *
 *   n·φ² − (s + n·d̂·delta)·φ + (n·d̂·delta − m·delta²) = 0
 *
 * The feasible root lies in [|delta|, 1]; when both roots of the quadratic
 * are feasible the larger is the constrained MLE (verified algebraically at
 * delta = d̂, where the two roots are exactly s/n and d̂², and s/n ≥ d̂²
 * always holds by the triangle inequality on the discordant counts — see
 * module tests).
 */
function solvePhi(ctx: TangoContext, delta: number): number {
  const linearCoefficient = -(ctx.s + ctx.n * ctx.dHat * delta);
  const constantCoefficient = ctx.n * ctx.dHat * delta - ctx.m * delta * delta;
  const discriminant = linearCoefficient * linearCoefficient - 4 * ctx.n * constantCoefficient;
  if (discriminant < 0) return Number.NaN;
  const sqrtDiscriminant = Math.sqrt(discriminant);
  const root1 = (-linearCoefficient + sqrtDiscriminant) / (2 * ctx.n);
  const root2 = (-linearCoefficient - sqrtDiscriminant) / (2 * ctx.n);
  const lowerBound = Math.abs(delta);
  const feasibleRoots = [root1, root2].filter(
    (root) => root >= lowerBound - TANGO_ROOT_TOLERANCE && root <= 1 + TANGO_ROOT_TOLERANCE
  );
  if (feasibleRoots.length === 0) return Number.NaN;
  return Math.min(1, Math.max(lowerBound, Math.max(...feasibleRoots)));
}

/** Tango's asymptotic score statistic T(delta) = (d̂ − delta) / √Var(delta). */
function tangoScoreStatistic(ctx: TangoContext, delta: number): number {
  const phi = solvePhi(ctx, delta);
  const variance = (phi - delta * delta) / ctx.n;
  // `variance <= 0` (not `!(variance > 0)`, S1940): when `phi` is NaN (an
  // infeasible root in solvePhi), `variance` is NaN too, `variance <= 0` is
  // `false`, and control falls through — but `Math.sqrt(NaN)` is NaN, so the
  // final returned value is NaN either way. The two forms are output-equivalent
  // here, so the simplification is safe.
  if (variance <= 0) return Number.NaN;
  return (ctx.dHat - delta) / Math.sqrt(variance);
}

const TANGO_SCAN_STEPS = 400;
const TANGO_BISECTION_ITERATIONS = 80;
const TANGO_BOUNDARY_EPSILON = 1e-9;

interface ScanBracket {
  readonly lo: number;
  readonly hi: number;
}

/** Coarse scan for a sign change of `T(delta) − targetScore` over [from, to]. */
function scanForBracket(ctx: TangoContext, targetScore: number, from: number, to: number): ScanBracket | null {
  let previousDelta = from;
  let previousSign: number | null = null;
  for (let i = 0; i <= TANGO_SCAN_STEPS; i++) {
    const delta = from + ((to - from) * i) / TANGO_SCAN_STEPS;
    const score = tangoScoreStatistic(ctx, delta);
    if (Number.isNaN(score)) continue;
    const sign = Math.sign(score - targetScore);
    if (previousSign !== null && sign !== previousSign && sign !== 0) {
      return { lo: previousDelta, hi: delta };
    }
    previousSign = sign;
    previousDelta = delta;
  }
  return null;
}

/** Bisection refinement of a bracket found by `scanForBracket`. */
function bisectForDelta(ctx: TangoContext, targetScore: number, bracket: ScanBracket): number {
  let lo = bracket.lo;
  let hi = bracket.hi;
  let signAtLo = Math.sign(tangoScoreStatistic(ctx, lo) - targetScore);
  for (let i = 0; i < TANGO_BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const signAtMid = Math.sign(tangoScoreStatistic(ctx, mid) - targetScore);
    if (signAtMid === signAtLo) {
      lo = mid;
      signAtLo = signAtMid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/** Find the delta where T(delta) = targetScore over [from, to]; `fallback` if no bracket exists. */
function findScoreBound(ctx: TangoContext, targetScore: number, from: number, to: number, fallback: number): number {
  const bracket = scanForBracket(ctx, targetScore, from, to);
  return bracket === null ? fallback : bisectForDelta(ctx, targetScore, bracket);
}

/**
 * Tango's asymptotic-score confidence interval for the paired difference of
 * proportions. Primary CI method per research.md §4A — never a plain Wald
 * interval, which is anti-conservative for this design.
 */
export function tangoScoreCI(pairs: readonly PairedOutcome[], confidenceLevel = 0.95): PairedDifferenceCIResult {
  validateNonEmptyPairs(pairs, "tangoScoreCI");
  const z = zForConfidenceLevel(confidenceLevel);
  const ctx = makeTangoContext(tallyPairs(pairs));

  const upper =
    ctx.dHat >= 1 - TANGO_BOUNDARY_EPSILON ? 1 : findScoreBound(ctx, -z, ctx.dHat, 1, 1);
  const lower =
    ctx.dHat <= -1 + TANGO_BOUNDARY_EPSILON ? -1 : findScoreBound(ctx, z, -1, ctx.dHat, -1);

  return { n: ctx.n, estimate: ctx.dHat, lower, upper, confidenceLevel, method: "tango-score" };
}

/** The 2×2 phi correlation coefficient between the two arms' binary outcomes. */
function phiCorrelationCoefficient(tally: PairTally): number {
  const { bothPass: a, aOnlyPass: b, bOnlyPass: c, bothFail: d } = tally;
  const denominator = Math.sqrt((a + b) * (c + d) * (a + c) * (b + d));
  return denominator === 0 ? 0 : (a * d - b * c) / denominator;
}

/**
 * Newcombe's (1998) "Method 10" square-and-add confidence interval for the
 * paired difference — a closed-form alternative to `tangoScoreCI` (no
 * root-finding), built from the two arms' Wilson intervals plus a
 * phi-coefficient correlation correction. Offered per research.md §4A ("Tango
 * ... and optionally Newcombe") as a cross-check, not the primary method.
 */
export function newcombeMoverCI(pairs: readonly PairedOutcome[], confidenceLevel = 0.95): PairedDifferenceCIResult {
  validateNonEmptyPairs(pairs, "newcombeMoverCI");
  const tally = tallyPairs(pairs);
  const n = tally.n;
  const successesA = tally.bothPass + tally.aOnlyPass;
  const successesB = tally.bothPass + tally.bOnlyPass;
  const p1 = successesA / n;
  const p2 = successesB / n;
  const ci1 = wilsonProportionCI(successesA, n, confidenceLevel);
  const ci2 = wilsonProportionCI(successesB, n, confidenceLevel);
  const psi = phiCorrelationCoefficient(tally);

  const lowerRadicand =
    (p1 - ci1.lower) ** 2 - 2 * psi * (p1 - ci1.lower) * (ci2.upper - p2) + (ci2.upper - p2) ** 2;
  const upperRadicand =
    (ci1.upper - p1) ** 2 - 2 * psi * (ci1.upper - p1) * (p2 - ci2.lower) + (p2 - ci2.lower) ** 2;

  const estimate = p1 - p2;
  return {
    n,
    estimate,
    lower: estimate - Math.sqrt(Math.max(0, lowerRadicand)),
    upper: estimate + Math.sqrt(Math.max(0, upperRadicand)),
    confidenceLevel,
    method: "newcombe-mover",
  };
}
