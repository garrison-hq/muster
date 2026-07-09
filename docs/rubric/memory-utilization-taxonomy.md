---
version: "2.0.0"
date: "2026-07-09"
status: "normative"
---

# Memory-Utilization / Learning-Lift Conformance Rubric

## Introduction

This document is muster's **own published source of record** for the
memory-utilization / learning-lift conformance capability (the
`memory-utilization` adapter, `src/adapters/memory-utilization/`). It exists
because — per the mission's research pass (`research.md` §2.2) — **no true
normative standard (RFC/ISO/IETF/W3C) governs either agent-memory files or
self-learning agents**. Neither the Letta Agent File (`.af`) convention nor
any research paper defines *measurement*; they define serialization or report
findings, not a conformance method. muster's charter cite-a-source rule
("every check cites a normative source, upstream **or ours**") is satisfied
here the same way it already is for the TOOLS/MEMORY/HEARTBEAT/SOP layers:
muster **publishes its own versioned rubric**, and every rubric clause
anchors, where one exists, to the cited convention or research paper it
adopts (C-003).

Every methodological choice made by the `memory-utilization` adapter —
the lift definition, every estimator/CI/test, muster's own conjunctive
`pass^k` derivation, the judge-bias reasoning, and the verdict semantics —
carries a stable clause id (`§X.Y`) below. Every emitted finding's
`rubricCitation` field must resolve to one of these clause ids (FR-012); see
"Citation Format for Emitted Findings" at the end of this document. The
document is versioned (front matter `version`); any change to grading
semantics increments the version and is a breaking change for callers that
pin a clause id + version pair.

Each source below is flagged **[RESEARCH]** (a peer-reviewed or arXiv paper,
adopted but not normatively binding), **[CONVENTION]** (a de-facto
discipline practice with no standards body, e.g. biostatistics practice or
the OpenAI `human-eval` reference implementation), or **[MUSTER-OWN]**
(muster's own derivation or judgment call, with no citable precedent at
all). No clause in this document is ever cited as **[NORMATIVE]** — per
C-003, that authority does not exist for this layer, and asserting otherwise
would itself violate the charter's cite-a-source rule.

---

## §1 No Normative Standard Exists

### §1.1 The Landscape Gap

**[RESEARCH]** `research.md` §2.1–2.2 (this mission's landscape research
pass, 21/25 claims confirmed): no existing harness tests declared,
non-runtime memory-utilization as conformance. DeepEval tests only
within-conversation recall; Inspect provides judge infrastructure but no
memory/longitudinal/delta/contamination capability. Neither the Letta Agent
File (`.af`, `https://github.com/letta-ai/agent-file`) nor MemGPT
(`arXiv:2310.08560`) define a measurement method — `.af` explicitly scopes
itself to serialization/portability/preservation.

### §1.2 What This Rubric Anchors To

**[CONVENTION]** The Letta Agent File (`.af`) — self-labelled "open
standard" but GitHub-only, no standards body, launched Apr 2025 — is adopted
as the **fixture format** target (Tier 1 currently stages the OpenClaw
`MEMORY.md`/`USER.md` shape muster's Memory adapter already parses;
`.af`-compatibility is a stated future target, not a Tier 1 requirement).

**[RESEARCH]** Reflexion (`arXiv:2303.11366`, NeurIPS 2023) supplies the
citable *shape* of a real learning-lift delta (91% vs 80% pass@1 on
HumanEval, same base model, with/without a self-reflection memory loop,
independently replicated ~89% vs ~82%) — the empirical existence proof that
a "declared additional context measurably changes task success" delta is a
real, previously-observed phenomenon, not a hypothetical muster invents.

**[RESEARCH]** LongMemEval (`arXiv:2410.10813`, ICLR 2025) supplies the
**abstention** ability (§2.5) as one of its five decomposed long-term-memory
abilities, and quantifies that long-context recall alone materially degrades
accuracy relative to an oracle-evidence baseline (GPT-4o 0.870→0.606) — the
citable basis for "context/retrieval is not free," which motivates the
no-memory baseline arm (§2.2) being a genuine, fair reference point rather
than a straw-man.

**[RESEARCH]** GEM (`arXiv:1706.08840`, NeurIPS 2017) supplies the
directional-transfer vocabulary (Backward/Forward Transfer) referenced as an
optional Tier 2 extension in §6.1; Tier 1 (this rubric) does not require it.

---

## §2 The Learning-Lift Definition

### §2.1 Learning-Lift Definition

**[MUSTER-OWN]**, anchored to Reflexion/LongMemEval/GEM per §1.2.

> An agent **conforms to a declared learning-lift claim** iff, over a fixed
> probe set and a declared memory fixture `M`, the pass-rate **with `M`**
> exceeds the pass-rate **without `M`** by a margin that:
>
> **(a)** exceeds grading noise — the delta's confidence interval (§3.3)
> excludes the null, corroborated by the McNemar mid-p paired significance
> test (§3.2);
>
> **(b)** survives the **scrambled/irrelevant-memory negative control**
> (§2.3) — no significant lift when `M` is replaced by plausible-but-useless
> facts, proving the effect is not prompt-stuffing;
>
> **(c)** survives the **closed-book contamination check** (§2.4) — the
> probes are not answerable without `M`, proving the effect is not
> parametric-knowledge leakage; and
>
> **(d)** the agent **abstains** on declared-unanswerable probes (§2.5) —
> the memory does not induce fabrication on questions it cannot answer.
>
> All four conditions are conjunctive. A lift that satisfies (a) alone is an
> *apparent* lift, not a *conforming* one.

### §2.2 Baseline-Validity Guard (Asymmetric)

**[MUSTER-OWN]**, related to but *deliberately not* a mirror of
`crosslayer/rule-survival.ts`'s `BASELINE_THRESHOLD` guard.

`rule-survival.ts` measures downward **erosion** from an already-compliant
baseline, so its **single-sided floor** ("baseline too low to have anything to
erode" ⇒ `"baseline-failure"`) is correct *for erosion* — erosion needs a high
starting point.

Learning-lift measures **upward** movement, which needs a **low** starting
point. The two arms therefore play different roles, and the guard is
**asymmetric** — not a two-sided mirror of the baseline:

- **Ceiling — on the no-memory baseline.** If the no-memory arm already aces
  the probes (`p̂ ≈ 1`, ≥ ceiling) there is no headroom for `M` to demonstrate
  improvement; any measured "no lift" is uninformative (it may only reflect
  saturation, not memory's uselessness). ⇒ `baseline-invalid`. Distinct from
  contamination (§2.4): a saturated baseline is a *design* problem (the probe
  is too easy outright); contamination is a *leakage* problem (the specific
  fact is answerable parametrically even when the set overall is not trivial).

- **Floor — on the WITH-memory (treatment) arm, NOT the baseline.** A floored
  **no-memory** baseline (`p̂ ≈ 0`) is the *ideal* condition for this layer:
  §2.4's contamination gate *defines* a well-formed lift probe as one the
  no-memory arm **cannot** answer, so a genuinely clean suite floors the
  no-memory arm **by construction** — and that low baseline is exactly what
  makes a lift visible. The floor guard therefore applies to the **treatment**
  arm: only when even *with* memory the pass-rate floors
  (`passRateWithMemory ≤ floor`) are the probes unanswerable/broken and no lift
  measurable ⇒ `baseline-invalid`.

> **Correction (rubric v2.0.0 — breaking grading-semantics change).** Earlier
> this clause applied the floor to the *no-memory baseline* by direct analogy
> to `rule-survival.ts` (a two-sided guard). That inverted the ideal condition
> into a failure: a contamination-clean suite — the very thing §2.4 mandates —
> floors the no-memory arm and so could **never** return `lift-confirmed`
> (confirmed by a live run: no-memory 0.0, with-memory 0.5, all controls
> correct, yet `baseline-invalid`). The floor belongs on the treatment arm, not
> the baseline. Broken-grader / mis-staged-fixture concerns remain caught: the
> treatment arm also floors (⇒ `baseline-invalid`), or the all-refuse guard
> (§discrimination controls) fires when all three arms are zero.

The concrete floor/ceiling constants are an adapter-owned
(`src/adapters/memory-utilization/verdict.ts`) numeric judgment call that cites
this clause; this rubric mandates the *shape* of the guard (ceiling on the
baseline, floor on the treatment arm), not a single universally-mandated number
(no such number is citable — §1).

### §2.3 Scrambled-Memory Negative Control

**[RESEARCH]**, anchored to `research.md` §2.4 (`arXiv:2601.15915` "more
context is not monotonically good"; LoCoMo's context-vs-human gap).

The scrambled-memory arm replaces every fact in `M` with a
plausible-but-irrelevant fact of the same shape (same length/format/subject
class, unrelated content) via a deterministic scrambler. If the same paired
apparatus (§3) finds a *significant* lift on the scrambled arm, the suite
**fails** — a positive result here proves the probe is measuring
context-stuffing (any extra tokens help) rather than the declared memory's
*content*. This is the mission's primary discrimination control between
"learning" and "prompt-stuffing" (spec.md acceptance scenario 3; FR-005).

### §2.4 Closed-Book Contamination Gate

**[RESEARCH]**, anchored to `research.md` §2.4 (`arXiv:2605.08838`,
"Generating Leakage-Free Benchmarks": 52–75% of RAG-benchmark questions are
answerable from parametric memory alone).

A probe is **contaminated** if the no-memory arm answers it correctly at a
rate exceeding the rubric's contamination threshold — i.e. the model already
knows the answer from its own parametric knowledge, so `M` cannot be
credited with the pass. Contaminated probes are flagged and excluded from
the lift computation; if the flagged fraction of the probe set is large
enough that the measured lift's significance depends on the contaminated
probes, the suite verdict is `contaminated`, not `lift-confirmed` — see §6.3
(contamination flag+veto).

### §2.5 Abstention Requirement

**[RESEARCH]**, anchored to LongMemEval (`arXiv:2410.10813`)'s
"abstention" ability.

Declared-unanswerable probes (the memory fixture does not, even in the
with-memory arm, contain the fact needed) must be **refused**, not
fabricated. A fabricated (confidently wrong) answer fails the probe under
every arm; this is graded identically to the Memory adapter's existing
all-refuse-family guard vocabulary, reused rather than reinvented. See §6.4
for the with-memory-specific abstention concern (memory-induced
overconfidence).

---

## §3 Estimator / CI / Paired-Test Choices

All statistics in this section are implemented, pure and dependency-free, in
`src/core/behavioral/stats/{proportion-ci,paired,power}.ts` (WP02). This
section is each function's normative citation source (`rubricCitation` in
every emitted `LiftMeasurement`).

### §3.1 Single-Arm Pass-Rate CI (CLT / Wilson)

**[RESEARCH]** Miller, "Adding Error Bars to Evals" (`arXiv:2411.00640`) —
the CLT/Bernoulli normal-approximation ("Wald") interval
`p̂ ± z·√(p̂(1−p̂)/n)` for a single condition arm's continuous pass-rate.

**[RESEARCH]** Brown, Cai, DasGupta, "Interval Estimation for a Binomial
Proportion" (*Statistical Science*, 2001) — documents Wald's poor coverage
near `p̂ ≈ 0/1` and for small `n`; recommends switching to the **Wilson**
score interval near those boundaries. Implemented as
`wilsonProportionCI`/`proportionCI` in `proportion-ci.ts`, with the
boundary-switching rule itself flagged **[MUSTER-OWN]** (no single
universal switching threshold is normatively mandated; muster's rule is
documented at `isNearBoundary` in that module).

### §3.2 Paired Significance — McNemar Mid-P

**[RESEARCH/CONVENTION]** Fagerland, Lydersen, Laake, "The McNemar test for
binary matched-pairs data: mid-p and asymptotic are better than exact
conditional" (*BMC Medical Research Methodology*, 2013, PMC3716987) — the
de-facto biostatistics convention for exactly this paired-boolean data
shape. muster uses **mid-p**, never the exact-conditional variant (poor
power on realistic probe-set sizes — the sizes this mission's probe sets are
expected to have). Implemented as `mcnemarMidP` in `paired.ts`.

### §3.3 Confidence Interval for the Lift Delta — Tango / Newcombe

**[RESEARCH]** Fagerland, Lydersen, Laake, companion paper family and
Tango's original method (*Statistics in Medicine*, 2014, `10.1002/sim.6148`)
— recommends the **Tango asymptotic-score** interval (or Newcombe) over a
plain Wald interval for the paired difference of proportions, which is
anti-conservative and has documented poor coverage for this data shape.

**[RESEARCH]** Tango, T. (1998), "Equivalence test and confidence interval
for the difference in proportions for the paired-sample design," *Statistics
in Medicine* 17, 891–908 — origin of the asymptotic-score method,
implemented as `tangoScoreCI` in `paired.ts` (primary method).

**[RESEARCH]** Newcombe, R.G. (1998), "Improved confidence intervals for the
difference between binomial proportions based on paired data," *Statistics
in Medicine* 17, 2635–2650 — "Method 10" square-and-add interval,
implemented as `newcombeMoverCI` in `paired.ts` (closed-form cross-check,
not the primary method).

### §3.4 N-Sizing and Minimum Detectable Effect — Miller Eq. 9/10

**[RESEARCH]** Miller, "Adding Error Bars to Evals" (`arXiv:2411.00640`)
§5, Eq. 9 (required probe-set size `n` for a target lift `δ` given
variance components) and its Eq. 10 inversion (minimum detectable effect
`δ` for a fixed `n`). Implemented as `computeSampleSize`/`requiredSampleSize`
(Eq. 9) and `minimumDetectableEffect` (Eq. 10) in `power.ts`.

A `no-lift` verdict is rendered as Miller §5 mandates: **a bounded/powered
null** — the delta CI's upper bound must fall entirely below the declared
lift threshold (equivalence framing), never bare "absence of evidence."
Implemented as `evaluateLiftVerdict` in `power.ts` (`"no-lift"` iff
`ci.upper < liftThreshold`; `"lift-confirmed"` iff `ci.lower >=
liftThreshold`; otherwise `"inconclusive"` — under-powered, report the
achievable MDE rather than a verdict either way). The variance components
(`ω²`, `σ²_A`, `σ²_B`) feeding Eq. 9/10 are not universal constants — the
mission's pilot protocol (`docs/guides/memory-utilization-pilot-protocol.md`,
WP06) estimates them empirically per deployment; Miller's own illustrative
figures (`≈969` probes to detect `δ=0.03` at 80% power, `α=0.05`) are cited
here only as an order-of-magnitude sanity anchor, not a mandated `n`.

### §3.5 Dichotomization of Per-Probe Rates

**[MUSTER-OWN]** — an explicit design decision, flagged for revision.

The paired significance (§3.2) and delta CI (§3.3) operate on **matched-pairs
booleans**: each probe's per-arm continuous pass-rate (over `runsN` samples) is
reduced to a single boolean by a majority threshold (`rate ≥ 0.5`,
`src/adapters/memory-utilization/index.ts`) before the McNemar / Tango
estimators see it. This is a deliberate trade-off:

- **What it buys.** McNemar mid-p and the Tango score interval are *exact*
  small-sample paired-binary methods (§3.2/§3.3, Fagerland/Lydersen/Laake) —
  well-behaved on the handful of probes a conformance suite typically ships,
  with no distributional assumption on the per-probe rate.
- **What it costs.** It discards the per-probe *continuous* variance-reduction
  that Miller's paired design describes (§3.4, `arXiv:2411.00640`): a probe at
  `with = 0.4 / without = 0.0` dichotomizes to `(false, false)` — concordant —
  and contributes nothing to the paired statistic despite a real continuous
  lift. The continuous rates are still **retained and reported** per probe
  (FR-003 / C-005, `pairedOutcomes[].perArmScore`), so nothing is lost from the
  *output*; only the *decision* runs on the dichotomized view.

muster gates on the dichotomized paired-binary view because its exactness on
small `n` is the more defensible default absent a pilot-estimated `ω²` (§3.4,
FR-015). A future revision MAY move the decision onto a continuous paired test
(e.g. a paired difference of per-probe rates with a bootstrap / cluster-robust
interval) once the pilot protocol supplies the variance components — a breaking
grading-semantics change that would bump this rubric's major version.

---

## §4 muster's Own Conjunctive `pass^k` Estimator

### §4.1 Why No Citable Estimator Exists

**[MUSTER-OWN]**, motivated by `research.md` §4A.

The disjunctive `pass@k` estimator (Chen et al. 2021, `arXiv:2107.03374` +
the `openai/human-eval` reference implementation — **[RESEARCH/CONVENTION]**)
answers a **combinatorial** question about an *already-observed, fixed*
population of `n` samples: "if I additionally draw `k` of those `n` samples
at random without replacement, what is the probability at least one is a
pass?" That question is answerable exactly by counting subsets
(`pass@k = 1 − C(n−c,k)/C(n,k)`), needs no probability model of the probe
itself, and is exactly why an *unbiased*, distribution-free estimator
exists — implemented as `passAtK` in
`src/core/behavioral/stats/passk.ts`.

The **conjunctive** analogue ("never fails k times in a row",
safety-critical) is a fundamentally different, **predictive** question about
`k` *future*, not-yet-drawn trials: "given `n` past trials with `c`
successes, how confident should we be that the next `k` independent trials
would **all** succeed?" There is no model-free combinatorial answer to a
question about unobserved data — this requires a probability model of the
probe's underlying success rate `p`. `research.md` §4A confirms no citable
unbiased estimator survived verification for this conjunctive case; muster
must derive and publish its own.

### §4.2 The Beta-Binomial Posterior Derivation

**[MUSTER-OWN application]** of standard Bayesian conjugate analysis
(**[RESEARCH]** Gelman et al., *Bayesian Data Analysis*, ch. 2 — textbook,
not novel math; the *application* of this standard machinery to a
safety-critical "never fails" `pass^k` conformance concept is muster's own).
Implemented as `conjunctivePassKPosterior` in
`src/core/behavioral/stats/passk.ts`.

Derivation:

1. Model each of the `n` observed trials as i.i.d. `Bernoulli(p)`, `p`
   unknown.
2. Place a `Beta(α, β)` prior on `p` (the prior *family* choice is standard
   — the conjugate prior for a Bernoulli/binomial likelihood; the prior
   *parameters* are muster's judgment call, §4.3).
3. By Beta-Binomial conjugacy, after observing `c` successes in `n` trials,
   the posterior is `p | data ~ Beta(a, b)` with `a = α + c`,
   `b = β + (n − c)`.
4. The conjunctive `pass^k` probability is the **posterior-predictive**
   probability that `k` future i.i.d. `Bernoulli(p)` draws are **all**
   successes, integrating out the remaining uncertainty in `p`:

   ```
   P(all k future draws succeed | data)
     = ∫₀¹ p^k · Beta-pdf(p; a, b) dp
     = E_{p ~ Beta(a,b)}[p^k]
     = B(a+k, b) / B(a, b)
     = Π_{i=0}^{k−1} (a+i) / (a+b+i)
   ```

   the last step a standard rising-factorial-ratio identity for the Beta
   function ratio, requiring no explicit Gamma/Beta function evaluation
   (numerically stable for large `n`/`k` — the same convention `passAtK`
   uses for its product form).

Two judgment calls are made explicit here (both documented at the
implementation, `conjunctivePassKPosterior`'s JSDoc in `passk.ts`, and cited
back to this clause):

- **(a)** The prior family (Beta) and its default parameters — §4.3.
- **(b)** The `k` future trials are treated as **exchangeable** with the `n`
  observed trials — a single, stationary per-probe success rate `p`. If a
  probe's true success rate drifts between the observed window and the `k`
  future trials, this estimator will not capture that; it is a
  **point-in-time reliability estimate**, not a trend/drift model. (A trend
  model belongs to the out-of-scope Tier 2 learning-curve extension.)

Unlike `passAtK`, `conjunctivePassKPosterior` requires no `n ≥ k`: it
predicts forward from a probability model rather than resampling from an
already-observed finite set, so `n = 0` (a pure-prior estimate) is valid.

### §4.3 The Jeffreys-Prior Default

**[MUSTER-OWN judgment call]**, anchored to **[RESEARCH]** Brown, Cai,
DasGupta (2001) — the same source cited at §3.1 for Wilson's boundary
behavior.

No prior is normatively mandated for a `pass^k` conformance estimator.
muster's default is the **Jeffreys prior**, `Beta(0.5, 0.5)`
(`JEFFREYS_PRIOR` in `passk.ts`) rather than the Bayes–Laplace uniform prior
`Beta(1, 1)` (`UNIFORM_PRIOR`, also exported for callers who prefer it):
Jeffreys is the standard *reference* prior for a binomial proportion, and is
the prior Brown/Cai/DasGupta specifically recommend for good coverage **near
the `p ≈ 0` / `p ≈ 1` boundary** — exactly the regime a "never fails"
safety-critical probe's true success rate is expected to occupy. Callers may
override the prior via `conjunctivePassKPosterior`'s `prior` parameter; the
Jeffreys default is muster's own recommendation, not an enforced constraint.

---

## §5 Judge-Bias Reasoning

### §5.1 Common-Mode Cancellation in the Paired Design

**[MUSTER-OWN]**, motivated by `research.md` §4A ("LLM-judge bias
mitigation returned nothing independently verifiable — but the paired
design helps").

Because the **same judge grades both arms on the same probes**, any bias
that is a property of the judge's *general disposition toward a response's
surface characteristics* — independent of which arm produced it — is
**common-mode** and cancels in the paired difference `d̂ᵢ = sᵢ,ᵥᵢₜₕ − sᵢ,ₙₒᵥₑ`:

- **Verbosity bias** (the judge rewards longer/more-detailed answers): if
  both arms are graded by the same verbosity-sensitive judge on the same
  probe, the bias inflates (or deflates) *both* `sᵢ,ᵥᵢₜₕ` and `sᵢ,ₙₒᵥₑ`
  identically whenever response length does not differ systematically
  *because of* the memory content itself — it does not create a systematic
  *directional* skew in `d̂ᵢ`.
- **Self-enhancement bias** (the judge favors outputs from a familiar
  model/style): identical for both arms — same underlying model, same
  judge, same probe.
- **Absolute miscalibration** (the judge's PASS/FAIL threshold is
  systematically too lenient or too strict): shifts both arms' pass
  probabilities in the same direction; the *difference* is unaffected to
  first order.

### §5.2 Arm-Order Blinding (Does Not Cancel)

**[MUSTER-OWN]**, motivated by `research.md` §4A.

**Position/order bias** (the judge systematically favors whichever answer
it sees first, or whichever position/label it is presented as "A") does
**not** cancel the way §5.1's biases do, because it is not a property of
response content — it is a property of **where in the presentation** the
judge encounters an answer. If arm identity/order is fixed or predictable
(e.g. "with-memory" is always shown first, or always labelled "Answer A"),
a position bias becomes a **confound with the treatment**: it inflates (or
deflates) the with-memory arm's *measured* pass-rate for every probe in the
same direction, which is exactly the shape of a spurious lift — the bias
would not cancel in `d̂ᵢ`; it would be baked into it.

**Mitigation (mandatory, FR-011):** arm identity is never disclosed to the
judge, and presentation order is **blinded and randomized per probe**
(deterministically, not via `Math.random()`/`Date.now()` — see
`blindArmOrder` in `src/adapters/memory-utilization/rubric.ts`, §4.2's
"future trials exchangeable" caveat does not apply here; this is pure
combinatorics on presentation order, not a probability model). Each probe
gets an independently-derived permutation from `(seed, probeId)`, so a
judge's residual position bias (if any) is **averaged out across probes**
rather than **systematically attached to one arm** — the same
variance-vs-bias argument that motivates randomized-controlled-trial
treatment-order randomization generally. **If arm order/label leaks to the
judge, the run is invalid until blinding is restored** (spec.md edge case).

---

## §6 Verdict Semantics

### §6.1 The Four Verdicts

**[MUSTER-OWN]**, formalizing `data-model.md`'s `LiftVerdict` enum.

| Verdict | Meaning |
|---|---|
| `lift-confirmed` | The paired delta's CI (§3.3) lower bound meets or exceeds the declared lift threshold, **and** McNemar mid-p (§3.2) is significant at the rubric's `α` — see §6.2 — **and** the scrambled control (§2.3) shows no significant lift, **and** the run is not `contaminated` (§6.3), **and** the baseline is valid (§2.2). |
| `no-lift` | The delta CI's upper bound falls entirely below the declared lift threshold (Miller §5 equivalence framing, §3.4) — a **bounded/powered null**, reported with the achievable MDE for the actual probe count, never bare "no difference found." |
| `contaminated` | The measured lift (or its significance) depends materially on probes the closed-book gate (§2.4) flagged as answerable without `M` — the effect cannot be attributed to the declared memory. This verdict **takes precedence over** an otherwise-qualifying `lift-confirmed` (§6.3: veto, not merely a caveat). |
| `baseline-invalid` | The no-memory baseline fails the two-sided validity guard (§2.2) — the measurement itself is not trustworthy; muster does not report a `no-lift`/`lift-confirmed` verdict computed from an invalid reference point. |

A run that qualifies for more than one verdict resolves by this table's
**listed order**: `baseline-invalid` is checked first (§2.2, before any
paired statistic is even computed), then `contaminated` (veto, §6.3), then
`lift-confirmed`/`no-lift`/inconclusive by §3.4's CI-vs-threshold rule.

### §6.2 Double Confirmation (CI + McNemar)

**[MUSTER-OWN]**, motivated by `research.md` §4A offering the CI and the
paired significance test as complementary, not substitutable, checks.

`lift-confirmed` requires **both**:

1. The delta CI (Tango, §3.3) lower bound `≥` the declared lift threshold
   — the *magnitude* is large enough to matter; and
2. McNemar mid-p (§3.2) `< α` — the *direction* is distinguishable from
   chance discordance.

Neither check alone is sufficient: a CI lower bound above threshold with a
non-significant McNemar result can occur with highly correlated/discordant
pairs where the CI and the exact discordant-pairs test disagree at the
margin (they are different approximations to the same underlying
question); requiring both is a conservative double-confirmation, consistent
with the charter's "safety-critical checks aggregate strictly" posture
applied to a lift claim rather than to a pass^k probe. Reporting **both**
numbers (never collapsing to a single p-value or a single CI) is itself
part of the citation contract (§FR-004).

### §6.3 Contamination Flag + Veto

**[MUSTER-OWN]**, formalizing §2.4 into a verdict rule.

Per-probe contamination flagging (§2.4) alone is a *diagnostic*, not a
*verdict*. The **veto** rule: if excluding every flagged-contaminated probe
from the paired computation would change the verdict from
`lift-confirmed` to anything else (i.e. the measured lift's significance
*depends on* the contaminated probes), the suite reports `contaminated` —
never `lift-confirmed` with a contamination footnote. This is a veto, not a
discount: a suite cannot partially launder a contaminated lift by averaging
it against a clean majority; the presence of contamination-dependent
significance is disqualifying by design (spec.md acceptance scenario 5:
"a suite whose lift is explained by parametric-knowledge leakage is
reported `contaminated`, not `lift-confirmed`").

### §6.4 Abstention — Graded Per Arm

**[MUSTER-OWN]**, extending §2.5 with a with-memory-specific concern.

§2.5 requires abstention on unanswerable probes under every arm, and the adapter
grades them **under every arm** (`src/adapters/memory-utilization/index.ts`
`runAbstentionProbes`), passing a probe iff it abstains in all of no-memory,
with-memory, and scrambled-memory. The with-memory arm is the notable
failure direction this clause formalizes: injecting a memory
fixture can make a model **more** willing to assert an answer — even to a
probe the fixture does not actually resolve — because the presence of *some*
contextual material lowers the model's apparent uncertainty
(over-confidence induced by context, distinct from genuine recall). muster
therefore grades abstention probes **per arm**, not only once: a model that
correctly abstains without memory but **fabricates** once memory is present
fails the with-memory abstention check specifically, and this failure is
reported as a `pass^k`-style safety-critical failure (§4), not folded into
the continuous lift pass-rate — an abstention failure is never "outvoted" by
an otherwise-positive lift.

---

## Citation Format for Emitted Findings

Every finding/`LiftMeasurement` emitted by the `memory-utilization` adapter
must carry a `rubricCitation` field resolving to one of the constants
exported from `src/adapters/memory-utilization/rubric.ts`'s
`RUBRIC_CITATIONS` map, e.g.:

```ts
import { RUBRIC_CITATIONS } from "./rubric.js";

const finding = {
  // ...
  rubricCitation: RUBRIC_CITATIONS.LIFT_DEFINITION, // "muster memory-utilization rubric §2.1 ..."
};
```

Each `RUBRIC_CITATIONS` value is a string of the form
`"muster memory-utilization rubric §X.Y (<short label>) — docs/rubric/memory-utilization-taxonomy.md"`,
where `§X.Y` matches a heading in this document verbatim. A finding whose
`rubricCitation` does not resolve to a clause defined here is a lint error
(FR-012), mirroring the SOP adapter's `source.normative` enforcement
(`docs/rubric/sop-rule-taxonomy.md`, "Citation Format for Manifest
Entries").
