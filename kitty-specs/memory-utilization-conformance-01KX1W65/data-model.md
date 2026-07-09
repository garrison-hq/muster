# Data Model: Memory-Utilization / Learning-Lift Conformance

Domain entities for the Tier-1 learning-lift adapter. Full methodology in `research.md`
(esp. §3 internal fit and §4A statistics). Refined further in `plan.md`.

## Entities

### MemoryFixture
The agent's declared memory, stageable as a file (never operated live).
- `path`: file path
- `format`: `openclaw-md` (`MEMORY.md`/`USER.md`, reuses the Memory adapter parser) | `af` (Letta Agent File) *[future]*
- `variant`: `real` | `none` (empty/absent) | `scrambled` (irrelevant but plausible facts)
- `facts[]`: parsed `MemoryFact` (reused from `src/adapters/memory/`)
- Relationship: one logical fixture yields three staged variants (real / none / scrambled).

### Probe
A scenario whose correct answer requires the memory.
- `id`; `turns[]` (scripted user turns, reuses the behavioral-runner `Turn`)
- `expected`: grading target — fact substring | judge-rubric ref | `abstain`
- `requiresMemory`: bool — contamination-checked (must fail closed-book)
- `kind`: `lift` | `abstention`
- Relationship: each Probe runs under every `ConditionArm`.

### ConditionArm
- `name`: `with-memory` | `no-memory` | `scrambled-memory`
- `fixtureVariant`: ref to a `MemoryFixture` variant
- Relationship: 1 arm : N `ProbeRun`.

### ProbeRun
One stochastic execution of a Probe under an arm.
- `probeId`, `arm`, `sampleIndex` (1..N)
- `score`: 0 | 1 (mechanical grader or LLM judge)
- `transcript`, `error?`
- Constraint (FR-009): an errored run scores as a failed run (never skipped/retried).

### PairedOutcome  *(design dependency C-005)*
Per-probe retained per-arm scores — required for the paired statistic.
- `probeId`; `withMemory`, `noMemory`, `scrambledMemory`: per-arm pass-rate over N
- Relationship: aggregates a probe's `ProbeRun`s across arms; feeds `LiftMeasurement`.

### LiftMeasurement
- `passRate{With,Without,Scrambled}`: continuous 0..1 with CI (CLT/Bernoulli; Wilson/Clopper-Pearson near 0/1)
- `delta` = passRateWith − passRateWithout (paired); `deltaCI`: Tango / Newcombe
- `mcnemarMidP`: paired significance; `scrambledDelta`/`scrambledMidP`: negative-control result
- `mde`: minimum detectable effect for n (Miller Eq. 10)
- `baselineValid`: bool (rule-survival `BASELINE_THRESHOLD` guard)
- `contaminated`: bool (closed-book gate)
- `verdict`: `LiftVerdict`

### LiftVerdict (enum)
`lift-confirmed | no-lift | contaminated | baseline-invalid`

### DiscriminationControl
- `scrambledArm` (negative control — must show no lift)
- `cappedControl` (rigged-impossible — must fail; cap-of-zero pattern)
- `allRefuseGuard` (trivial-refusal guard)

### Rubric
`docs/rubric/memory-utilization-taxonomy.md` — muster's published source of record; defines the
lift definition, estimator/CI/paired-test choices, muster's own conjunctive `pass^k` estimator, and
the judge-bias reasoning (no upstream normative source exists — C-003).

### Report
- `cases[]`: per-case `LiftMeasurement` + verdict
- `exitCode`: 0 conforming | 1 any failed/no-lift/contaminated | 2 execution error

## Flow

`MemoryFixture` (3 variants) → `ConditionArm` (3) → [each Probe × arm × N samples] `ProbeRun`
→ `PairedOutcome` (per probe) → `LiftMeasurement` → `LiftVerdict` → `Report`.

## Statistical pipeline (research §4A)

paired difference → **McNemar mid-p** (significance) → **Tango/Newcombe** (delta CI) →
**Miller Eq. 9/10** (N-sizing / MDE). Single-arm CI: CLT/Bernoulli, Wilson at boundaries.

## Open questions → plan / tasks

- Derive & publish muster's own conjunctive `pass^k` estimator (beta-binomial / Bayesian).
- Judge-bias: enumerate common-mode-cancelling vs. arm-dependent biases; implement arm-order blinding.
- Pilot protocol to estimate `ω²` / within-probe score correlation (no seed available).
- Two core enhancements: expose continuous pass-rate (currently collapsed to boolean); retain per-probe paired outcomes.
