/**
 * passk.ts — pass@k (disjunctive, "at least one of k succeeds") and muster's
 * own pass^k (conjunctive, "all k in a row succeed") probability estimators.
 *
 * Pure, dependency-free, deterministic — muster minimal-deps invariant.
 *
 * ---------------------------------------------------------------------------
 * 1. Disjunctive pass@k — the unbiased combinatorial estimator (Chen et al.
 *    2021 / the openai/human-eval reference implementation):
 *
 *      pass@k = 1 − C(n−c, k) / C(n, k)
 *
 *    where n samples were drawn per probe and c of them were correct. This
 *    is the *unbiased* estimator of E_p[1 − (1−p)^k] under resampling; the
 *    naive plug-in `1 − (1 − p̂)^k` (with p̂ = c/n) is BIASED and must never
 *    be used (research.md §4A explicitly flags this as the failure mode to
 *    avoid). We use the numerically-stable product form
 *
 *      pass@k = 1 − Π_{i=n−c+1}^{n} (1 − k/i)
 *
 *    which is algebraically identical to the binomial-coefficient ratio
 *    (verified in the module tests against the direct C(n−c,k)/C(n,k)
 *    definition on several hand-worked cases) but never evaluates a raw
 *    factorial/binomial coefficient, avoiding overflow for large n. Requires
 *    n ≥ k (you cannot estimate "at least one pass in k draws" without k
 *    draws); `passAtK` throws otherwise.
 *
 * ---------------------------------------------------------------------------
 * 2. Conjunctive pass^k — muster's own estimator (derivation; the WP04
 *    rubric cites this section)
 *
 *    research.md §4A is explicit that no citable *unbiased* estimator exists
 *    for the conjunctive ("never fails") analogue of pass@k — only the
 *    disjunctive combinatorial estimator above has a settled citation. This
 *    is because the two questions are fundamentally different in kind:
 *
 *      - pass@k asks a FREQUENTIST/COMBINATORIAL question about a FIXED,
 *        already-observed finite population of n samples: "if I additionally
 *        pick k of those n samples at random (without replacement), what is
 *        the probability at least one is a pass?" That is answerable exactly
 *        by counting subsets — no probability model of the probe itself is
 *        needed, which is exactly why an *unbiased*, distribution-free
 *        estimator exists.
 *
 *      - pass^k ("never fails k times in a row") is a PREDICTIVE question
 *        about k *future*, not-yet-drawn trials: "given what we've observed
 *        so far (n trials, c successes), how confident should we be that the
 *        next k independent trials would ALL succeed?" This requires a
 *        probability model of the per-probe success rate p, because the
 *        future trials are not members of the observed sample. There is no
 *        model-free combinatorial answer to a question about unobserved data.
 *
 *    muster's derivation: standard Bayesian beta-binomial conjugate analysis
 *    (e.g. Gelman et al., "Bayesian Data Analysis", ch. 2 — textbook, not
 *    novel math; the *application* to a "never fails" safety-critical
 *    pass^k concept is muster's own).
 *
 *      - Model each of the n observed trials as i.i.d. Bernoulli(p), p
 *        unknown.
 *      - Prior: p ~ Beta(α, β) (see `BetaPrior`, `JEFFREYS_PRIOR`,
 *        `UNIFORM_PRIOR` below — the prior CHOICE is muster's judgment
 *        call, documented at `JEFFREYS_PRIOR`).
 *      - Posterior after observing c successes in n trials (Beta-Binomial
 *        conjugacy): p | data ~ Beta(α+c, β+n−c).
 *      - The k-consecutive-success ("conjunctive pass^k") probability is the
 *        POSTERIOR-PREDICTIVE probability that k future i.i.d. Bernoulli(p)
 *        draws are ALL successes, integrating out the remaining uncertainty
 *        in p:
 *
 *          P(all k future draws succeed | data)
 *            = ∫₀¹ p^k · Beta-pdf(p; α+c, β+n−c) dp
 *            = E_{p ~ Beta(a,b)}[p^k]                    (a = α+c, b = β+n−c)
 *            = B(a+k, b) / B(a, b)
 *            = Π_{i=0}^{k−1} (a+i) / (a+b+i)              (rising-factorial
 *                                                           ratio form of the
 *                                                           Beta function
 *                                                           ratio — a
 *                                                           standard identity)
 *
 *        The product form is used in `betaPosteriorKthMoment` below — it is
 *        the same "never evaluate a raw factorial/Beta function" convention
 *        `passAtK` uses above, and needs no gamma-function implementation.
 *
 *      - This estimator is deliberately DIFFERENT from n ≥ k not being
 *        required: unlike `passAtK`, `conjunctivePassKPosterior` accepts any
 *        n ≥ 0 (including n=0 — a pure-prior estimate) because it predicts
 *        forward rather than resampling from an already-observed set.
 *
 *    Judgment calls made here (flagged for the WP04 rubric to adopt or
 *    override):
 *      (a) The prior family (Beta) and the default prior (Jeffreys,
 *          Beta(0.5,0.5)) — see `JEFFREYS_PRIOR`.
 *      (b) Treating the k future trials as exchangeable with the n observed
 *          trials (single stationary per-probe success rate p). If a probe's
 *          true success rate can drift between the observed window and the
 *          k future trials, this estimator will not capture that; it is a
 *          reliability *point-in-time* estimate, not a trend model.
 */

// ---------------------------------------------------------------------------
// 1. Disjunctive pass@k
// ---------------------------------------------------------------------------

function validatePassAtKInputs(n: number, c: number, k: number): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`passAtK: n must be a positive integer, got ${n}`);
  }
  if (!Number.isInteger(k) || k < 1) {
    throw new Error(`passAtK: k must be a positive integer, got ${k}`);
  }
  if (n < k) {
    throw new Error(`passAtK: n (${n}) must be >= k (${k}); insufficient samples per probe`);
  }
  if (!Number.isInteger(c) || c < 0 || c > n) {
    throw new Error(`passAtK: c must be an integer in [0, n], got ${c}`);
  }
}

/**
 * The unbiased disjunctive pass@k estimator (Chen et al. 2021 / de-facto
 * openai/human-eval convention): the probability that at least one of k
 * randomly-chosen (without replacement) samples from the n observed samples
 * is a pass, given c of the n were passes. Throws if n < k.
 */
export function passAtK(n: number, c: number, k: number): number {
  validatePassAtKInputs(n, c, k);
  if (n - c < k) {
    // Fewer than k observed failures exist, so no k-subset can be all
    // failures: C(n-c, k) = 0 exactly, i.e. pass@k = 1. (The general product
    // form below also reaches exactly 0 in this case, since i=k always falls
    // within the product range here — this branch just avoids computing a
    // product containing negative factors.)
    return 1;
  }
  let product = 1;
  for (let i = n - c + 1; i <= n; i++) {
    product *= 1 - k / i;
  }
  return 1 - product;
}

// ---------------------------------------------------------------------------
// 2. Conjunctive pass^k — beta-binomial Bayesian posterior estimator
// ---------------------------------------------------------------------------

export interface BetaPrior {
  readonly alpha: number;
  readonly beta: number;
}

/** Bayes–Laplace uniform prior Beta(1,1) — "no prior information", every p equally likely. */
export const UNIFORM_PRIOR: BetaPrior = { alpha: 1, beta: 1 };

/**
 * Jeffreys prior Beta(0.5,0.5) — muster's default. muster judgment call: no
 * prior is normatively mandated for this estimator, but Jeffreys is the
 * standard reference prior for a binomial proportion and is the prior
 * Brown/Cai/DasGupta (2001) recommend for good coverage near the p=0/1
 * boundary — the same regime a "never fails" safety-critical probe's true
 * success rate is expected to live in. Callers may override via `prior`.
 */
export const JEFFREYS_PRIOR: BetaPrior = { alpha: 0.5, beta: 0.5 };

export interface ConjunctivePassKResult {
  readonly n: number;
  readonly c: number;
  readonly k: number;
  readonly prior: BetaPrior;
  /** α + c — the posterior Beta shape parameter. */
  readonly posteriorAlpha: number;
  /** β + (n − c) — the posterior Beta shape parameter. */
  readonly posteriorBeta: number;
  /** Posterior mean of the per-probe success probability p. */
  readonly posteriorMean: number;
  /** The k-consecutive-success ("conjunctive pass^k") posterior-predictive probability. */
  readonly probability: number;
}

function validateConjunctiveInputs(n: number, c: number, k: number, prior: BetaPrior): void {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`conjunctivePassKPosterior: n must be a non-negative integer, got ${n}`);
  }
  if (!Number.isInteger(c) || c < 0 || c > n) {
    throw new Error(`conjunctivePassKPosterior: c must be an integer in [0, n], got ${c}`);
  }
  if (!Number.isInteger(k) || k < 1) {
    throw new Error(`conjunctivePassKPosterior: k must be a positive integer, got ${k}`);
  }
  // NaN-safe equivalent of `!(prior.alpha > 0) || !(prior.beta > 0)` without
  // the double-negations SonarCloud flags (S1940): `NaN > 0` is `false`, so
  // the original throws on a NaN prior too. A plain `<= 0` flip would NOT
  // (`NaN <= 0` is also `false`), silently accepting a malformed NaN prior.
  if (Number.isNaN(prior.alpha) || prior.alpha <= 0 || Number.isNaN(prior.beta) || prior.beta <= 0) {
    throw new Error(`conjunctivePassKPosterior: prior.alpha and prior.beta must be > 0, got ${JSON.stringify(prior)}`);
  }
}

/**
 * E[p^k] under a Beta(a,b) distribution, via the numerically-stable
 * rising-factorial ratio Π_{i=0}^{k-1} (a+i)/(a+b+i) — never evaluates a raw
 * factorial or the Beta/Gamma function directly.
 */
function betaPosteriorKthMoment(a: number, b: number, k: number): number {
  let result = 1;
  for (let i = 0; i < k; i++) {
    result *= (a + i) / (a + b + i);
  }
  return result;
}

/**
 * muster's own conjunctive pass^k estimator: the beta-binomial
 * posterior-predictive probability that k future independent trials of a
 * probe would ALL succeed, given n past trials with c successes. See the
 * module-header derivation above. Unlike `passAtK`, n=0 is valid (a
 * pure-prior estimate); there is no n ≥ k requirement, because this predicts
 * forward rather than resampling from an already-observed set.
 *
 * Published reference estimator (muster's own published rubric): this is
 * the concrete implementation `docs/rubric/memory-utilization-taxonomy.md`
 * §4.2 (beta-binomial posterior derivation) / §4.3 (Jeffreys-prior default)
 * cites and derives. It answers a FORECASTING question — "how confident
 * should we be that k FUTURE trials would all succeed?" — which is why it
 * takes a `prior` and returns a continuous probability rather than a
 * pass/fail boolean.
 *
 * This is deliberately NOT what the memory-utilization adapter's abstention
 * pipeline uses to decide pass/fail today. Abstention is a safety-critical
 * conformance check on trials ALREADY OBSERVED ("did every one of the N
 * sampled runs abstain?"), not a forecast about unobserved future trials —
 * the correct tool for that is the boolean all-must-pass `conjunctivePassK`
 * (`pass-k.ts`, `passFlags.every(Boolean)`), which the adapter calls
 * directly. Both estimators are legitimately "conjunctive pass^k" in the
 * charter's safety-critical-aggregation sense; they answer different
 * questions (observed-set conformance vs. forward-looking reliability
 * forecast) and are not interchangeable.
 */
export function conjunctivePassKPosterior(
  n: number,
  c: number,
  k: number,
  prior: BetaPrior = JEFFREYS_PRIOR
): ConjunctivePassKResult {
  validateConjunctiveInputs(n, c, k, prior);
  const posteriorAlpha = prior.alpha + c;
  const posteriorBeta = prior.beta + (n - c);
  const posteriorMean = posteriorAlpha / (posteriorAlpha + posteriorBeta);
  const probability = betaPosteriorKthMoment(posteriorAlpha, posteriorBeta, k);
  return { n, c, k, prior, posteriorAlpha, posteriorBeta, posteriorMean, probability };
}
