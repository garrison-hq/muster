# Pilot Protocol: Sizing the Memory-Utilization / Learning-Lift Suite (FR-015)

**Status**: muster's own operational guidance — **not** a citable statistical
convention (C-003). The estimator machinery it feeds (Miller Eq. 9/10) is
cited RESEARCH (`arXiv:2411.00640`); the *pilot procedure itself* — how to
obtain the plug-in variance numbers that formula needs, given muster sends no
seed — has no upstream citable source (research.md §4A / §6 open question 1b,
"the pilot protocol to estimate ω²/score-correlation for concrete N-sizing").
This document is muster's own answer, published so every probe-count decision
this mission makes can point at *something concrete* rather than an unwritten
guess. See `docs/rubric/memory-utilization-taxonomy.md` §3.4 for the cited
N-sizing/MDE clause this protocol feeds.

## 1. Why a pilot is needed

`src/core/behavioral/stats/power.ts` implements Miller's Eq. 9 (required
probe-set size `n` for a target lift `δ`) and its Eq. 10 inversion (the
achievable minimum detectable effect, MDE, for a fixed `n`):

```
n = (z_{α/2}+z_β)² · (ω² + σ²_A/K_A + σ²_B/K_B) / δ²
```

Both directions need three numbers the formula does not supply on its own:

- `σ²_A`, `σ²_B` — each arm's per-sample (within-probe) variance at the
  sampling budget `K` the real suite will use.
- `ω²` — the paired/shared variance component: probe-to-probe difficulty
  variability that both arms feel in common, and that resampling the *same*
  probe more times (`K`) does **not** reduce.

Miller's paper illustrates its rule-of-thumb (`n ≈ 969` probes to detect
`δ=0.03` at 80% power, `α=0.05`) with numbers from its *own* evals. muster's
memory-utilization fixtures are different probes on different content — using
someone else's `ω²`/`σ²` here would be exactly the kind of unwritten opinion
the charter forbids. muster must estimate its own from a small **pilot run**,
which is what this document specifies.

## 2. The pilot recipe

1. **Choose a pilot probe set** of size `M` — either a fixed subset of the
   target conformance probe set, or a separate calibration set with a similar
   difficulty distribution. `M ≥ 20` is recommended; smaller pilots make the
   variance estimate in §3 noisy (see §5 caveats).
2. **Fix `K`**, the number of samples per probe per arm, to the value the
   *target* conformance suite will actually use (the manifest's `runsN`). If
   the pilot must use a different `K_pilot`, the estimator in §3 still works
   — just pass the pilot's own `K_pilot` into the variance-component formulas,
   not the target `K`.
3. **Run the pilot exactly like the real suite** — same declared memory
   fixture, same `no-memory`/`with-memory` arms (the `scrambled-memory` arm is
   not needed for N-sizing), same system-prompt staging
   (`src/adapters/memory-utilization/fixture.ts`), same temperature-pinning
   (C-006: arms are temperature-pinned; no seed is ever sent). The easiest way
   to run it is the `memory-utilization run` CLI itself (`src/cli/index.ts`)
   against a manifest whose cases are the `M` pilot probes at `runsN: K` —
   the emitted JSON report's `cases[].pairedOutcomes[]` already carries each
   probe's per-arm continuous pass-rate (`perArmScore["with-memory"]`,
   `perArmScore["no-memory"]`) at that `K`; that is exactly the pilot data
   §3 consumes.
4. **Record two arrays of length `M`**: `withRates[i]` and `noRates[i]`, the
   pilot's per-probe pass-rate in each arm (each a multiple of `1/K`, since it
   is `c/K` successes out of `K` runs).

## 3. Estimating the variance components

muster's estimator is a straightforward **method-of-moments** application of
the same decomposition Eq. 9 already assumes — no citable convention exists
for this step (C-003), so the reasoning is spelled out here in full rather
than asserted.

**Per-arm variance** (`σ²_A`, `σ²_B`): treat each pilot probe's outcome as
approximately `Bernoulli(p_i)` and average the natural Bernoulli variance
across the `M` pilot probes — the same judgment call
`src/adapters/memory-utilization/verdict.ts`'s `estimateMDE` already makes at
run time (`p(1-p)`, no additional assumption):

```
σ²_A_hat = mean_i[ withRates[i] · (1 − withRates[i]) ]
σ²_B_hat = mean_i[ noRates[i]  · (1 − noRates[i])  ]
```

**Shared/paired variance** (`ω²`): Eq. 9 states that the *observed* variance
of the per-probe paired delta `d_i = withRates[i] − noRates[i]`, taken across
probes, decomposes as `Var(d_i) = ω² + σ²_A/K + σ²_B/K` (the shared component
plus each arm's own sampling noise at the pilot's `K`). Estimate `Var(d_i)`
directly as the sample variance of the pilot's `M` deltas, then subtract the
already-estimated within-arm terms and floor at zero (a variance component
can never be negative; the naive difference can dip below zero from pilot
sampling noise alone — that is expected, not a bug):

```
Var_hat(d)  = sample_variance_i( withRates[i] − noRates[i] )
ω²_hat      = max(0, Var_hat(d) − σ²_A_hat/K − σ²_B_hat/K)
```

**Diagnostic (not fed into Eq. 9 directly): the per-probe score correlation.**
research.md §4A frames the paired design's benefit as "a positive per-probe
correlation gives a 'free' variance reduction (relative reduction = the score
correlation; frontier evals show 0.3–0.7)". Report the Pearson correlation of
`withRates` and `noRates` across the `M` pilot probes as a sanity check
alongside `ω²_hat` — a high `ρ_hat` with a near-zero `ω²_hat` is not a
contradiction (see §4, step 2): it means the within-arm binomial noise at the
chosen `K` already explains most of the paired-delta spread, so the shared
component the Eq. 9 decomposition asks for is small at *this* `K`. `ρ_hat`
is not itself a parameter `computeSampleSize`/`minimumDetectableEffect`
accept; it is reported for interpretability and to sanity-check the pilot
against the literature's anchor range.

## 4. Feeding the estimate into WP02's `power.ts`

`src/core/behavioral/stats/power.ts` exports:

- `requiredSampleSize(delta, { omega2, sigmaA2, kA, sigmaB2, kB, alpha?, power? })`
  — Eq. 9: the probe-set size `n` needed to detect `delta` at the given
  significance/power (defaults `alpha=0.05`, `power=0.8`).
- `minimumDetectableEffect(n, { ...same params })` — Eq. 10: the MDE
  achievable with a fixed probe-set size `n` (this is exactly what the
  `memory-utilization run` CLI reports per case, FR-008 — see
  `src/cli/index.ts`'s `buildMemoryUtilizationNoLiftRendering`).

Plug the pilot's `σ²_A_hat`, `σ²_B_hat`, `ω²_hat` straight in, with `kA`/`kB`
set to the **target** suite's `runsN` (not necessarily the pilot's `K`, if
they differ):

```ts
import {
  requiredSampleSize,
  minimumDetectableEffect,
} from "../../src/core/behavioral/stats/power.js";

const targetDelta = 0.1; // the rubric's declared minimum meaningful lift
const K_target = 8;      // the real suite's runsN

const n = requiredSampleSize(targetDelta, {
  omega2: omega2Hat,
  sigmaA2: sigmaAHat,
  kA: K_target,
  sigmaB2: sigmaBHat,
  kB: K_target,
  alpha: 0.05,
  power: 0.8,
});
// -> the probe-set size to declare for the target manifest

const mde = minimumDetectableEffect(40, {
  omega2: omega2Hat,
  sigmaA2: sigmaAHat,
  kA: K_target,
  sigmaB2: sigmaBHat,
  kB: K_target,
  alpha: 0.05,
  power: 0.8,
});
// -> "if I can only afford 40 probes, this is the smallest real lift I
//    could reliably detect" — the number the CLI's no-lift rendering reports.
```

## 5. A fully worked, reproducible example

The numbers below are reproducible: they come from a deterministic
synthetic-pilot generator (seed `42`, `mulberry32` — used here purely to make
this document's numbers checkable, **not** a runtime dependency of the
adapter or the CLI). `M=20` pilot probes, `K=8` samples per probe per arm:

```
withRates = 0.750, 0.375, 0.750, 0.625, 0.625, 0.750, 0.375, 0.500, 0.625, 0.375,
            0.375, 0.750, 0.375, 0.875, 0.875, 0.250, 0.625, 0.875, 0.625, 0.625
noRates   = 0.500, 0.250, 0.625, 0.500, 0.500, 0.500, 0.375, 0.500, 0.375, 0.250,
            0.250, 0.500, 0.375, 0.375, 0.500, 0.250, 0.500, 0.500, 0.500, 0.500
```

Applying §3's estimator:

| Quantity | Value |
|---|---|
| mean `withRate` | 0.6000 |
| mean `noRate` | 0.4313 |
| `σ²_A_hat` | 0.2047 |
| `σ²_B_hat` | 0.2336 |
| `Var_hat(d)` | 0.0176 |
| `ω²_hat` | **0.0000** (floored — see below) |
| `ρ_hat` (diagnostic) | 0.723 |

`ω²_hat` floors at zero here: `σ²_A_hat/K + σ²_B_hat/K = (0.2047+0.2336)/8 ≈
0.0548`, larger than the observed `Var_hat(d) = 0.0176`. This is a common,
*expected* pilot outcome, not an error — it means that at `K=8`, each arm's
own within-probe sampling noise already accounts for essentially all of the
observed paired-delta spread, so there is little probe-to-probe shared
("both arms feel this probe's difficulty in common") noise left over beyond
that. A zero `ω²_hat` is the honest estimate in that regime; Eq. 9 then
reduces to (very nearly) the familiar two-independent-proportions form. Do
**not** substitute a nonzero placeholder to "be safe" — that silently changes
the declared MDE without a documented basis (C-003).

Feeding these into `requiredSampleSize`/`minimumDetectableEffect` at
`K_target=8`, `α=0.05`, `power=0.8`:

| Query | Result |
|---|---|
| `requiredSampleSize(0.10, {...})` | **n ≈ 44** probes |
| `minimumDetectableEffect(40, {...})` | MDE ≈ **0.1037** |
| `minimumDetectableEffect(100, {...})` | MDE ≈ **0.0656** |
| `minimumDetectableEffect(200, {...})` | MDE ≈ **0.0464** |

Read the last row as: "with 200 probes at 8 samples/arm/probe, this fixture's
suite can reliably (80% power, α=0.05) detect a paired lift as small as
≈0.046 — reporting a `no-lift` verdict below that is a genuine bounded/powered
null, not silence." Compare against research.md §4A's anchor
(`n ≈ 969` for `δ=0.03` at the same power/α on the paper's *own* variance) —
muster's fixture happens to need fewer probes for a *larger* target `δ=0.10`
because this pilot's own `σ²`/`ω²` are smaller than the paper's illustrative
numbers, exactly the point of running a fixture-specific pilot rather than
reusing someone else's constants.

## 6. Caveats

- **The pilot estimate is itself noisy.** `M=20` gives a rough `ω²_hat`; if
  the resulting `n`/MDE is a close call for a conformance decision that
  matters, re-pilot with a larger `M` (e.g. 40–50) before committing to a
  declared probe count.
- **Treat sized `N` as a planning number, not a guarantee.** It assumes the
  pilot's `σ²`/`ω²` generalize to the full probe set; a fixture whose full
  probe set spans a much wider difficulty range than the pilot sample will
  need re-piloting.
- **Re-pilot when the fixture changes materially.** A new declared memory
  fixture, a different probe corpus, or a different judge/grading path all
  change the underlying variance components — this is a per-fixture
  calibration, not a one-time global constant.
- **`ω²_hat` flooring at zero is normal**, not a sign of a broken pilot (§5).
  It means Eq. 9 is, for this fixture, dominated by ordinary within-arm
  sampling noise rather than shared probe-difficulty variance.
- **This protocol sizes `N` for the *paired lift* decision only.** It does
  not size the abstention probe count (that is governed by the conjunctive
  `pass^k` posterior, `docs/rubric/memory-utilization-taxonomy.md` §4) or the
  contamination-gate threshold (§2.4 of the same rubric).

## 7. Normative sources

- Miller, "Adding Error Bars to Evals" (`arXiv:2411.00640`), §5, Eq. 9/10 —
  RESEARCH: the N-sizing/MDE formula this protocol feeds.
- `docs/rubric/memory-utilization-taxonomy.md` §3.4 — muster's published
  rubric clause citing the above and this protocol.
- research.md §4A / §6 open question 1(b) — the mission research base
  identifying this as an unresolved gap muster must fill in its own rubric
  (C-003: no upstream normative source exists for the pilot procedure
  itself).
