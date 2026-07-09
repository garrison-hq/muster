# Feature Specification: Memory-Utilization / Learning-Lift Conformance

**Mission**: `memory-utilization-conformance-01KX1W65` (mission_id `01KX1W65HYFFCTQSPM4FK0BYMH`)
**Created**: 2026-07-09
**Status**: Draft
**Mission Type**: software-dev
**Milestone**: v2 (agent-file stack) — a new conformance capability: does declared memory *measurably help*?
**Input**: Add a memory-utilization / learning-lift conformance capability that stages a **declared agent-memory fixture** and measures whether it produces a **statistically real behavior lift** on a fixed probe set — with a scrambled-memory negative control, a closed-book contamination gate, abstention, and a paired statistical test — **without ever operating the agent** (non-runtime; memory states are fixtures, not a live write-back loop).
**Seeds**: `briefings/self-learning-conformance-research.md` (this mission's research base; also copied to `research.md`) — two adversarially-verified deep-research passes (landscape + statistics); `kitty-specs/memory-adapter-01KTYMCD/` (the Memory adapter this reuses and extends); `BRIEF.md`; the project charter.

---

## Overview

Vendors increasingly claim their agents "learn" — that accumulated memory measurably improves behavior over time. The research base establishes two things. First (landscape pass, 21/25 claims confirmed): **no existing harness tests this as file-declared, non-runtime conformance** — DeepEval only tests within-conversation recall; Inspect offers judge infrastructure but no memory/longitudinal/delta/contamination capability; and there is **no normative standard** (RFC/ISO/W3C) for either agent-memory files or self-learning agents. Second (statistics pass, 23/25 claims confirmed): the correct way to measure a lift is a **paired difference** on the same probe set, decided with a paired significance test and reported with a confidence interval and a powered null.

This mission adds that capability to muster as a new adapter behind the `SpecAdapter` boundary. It is deliberately scoped to **Tier 1 — memory-utilization / learning-lift**: *given a declared memory fixture M and a fixed probe set, does behavior improve in the declared direction vs. without M, beyond grading noise and beyond two decisive controls?* muster stages M (and its no-memory and scrambled variants) as **fixtures** and asserts on transcripts — it never hosts, schedules, or operates the agent's own read/write learning loop. The learning-curve tier (memory grown M0→…→Mn) is a follow-up; the autonomous self-learning tier (a live agent rewriting its own state) is **out of scope by the runtime scope guard**.

The measurement reuses muster's existing `crosslayer/rule-survival` primitive — which already establishes a baseline pass-rate under condition A, reruns the same probes under condition B, and emits a `survived | eroded | baseline-failure` verdict with a baseline-validity guard — re-parameterized so condition A/B = "without memory / with memory." Because no upstream normative source exists, every check cites **muster's own published rubric** (`docs/rubric/memory-utilization-taxonomy.md`, new), which in turn anchors to the cited conventions/research (Miller `arXiv:2411.00640`; Fagerland/Lydersen/Laake 2013/2014; Chen et al. 2021; LongMemEval; GEM; Reflexion; Letta `.af`).

## User Scenarios & Testing

### Primary User Stories

1. **Agent operator (does memory help?)**: As an operator, I run muster's learning-lift suite against my agent's declared memory and get a verdict — `lift-confirmed | no-lift | contaminated | baseline-invalid` — that tells me whether the memory produces a **statistically real** improvement, not an apparent one.
2. **Skeptic / reviewer (is the lift real?)**: As a reviewer of a "self-learning" claim, I confirm the improvement survives a **scrambled-memory control** (irrelevant facts show no lift → it is not prompt-stuffing) and a **closed-book contamination gate** (the probes are not answerable without the memory).
3. **Suite author (bounded null)**: As an author, when there is no lift I get a **bounded/powered null** — the reported minimum detectable effect for my probe count — not a bare "no difference found."

### Acceptance Scenarios

#### Lift measurement (paired)

1. **Given** a declared memory fixture M and a fixed probe set, **When** muster runs each probe under the no-memory and with-memory conditions over N samples and computes the **question-level paired difference**, **Then** it reports a per-condition continuous pass-rate, the lift delta, the delta's confidence interval (Tango/Newcombe), and a paired significance result (McNemar mid-p), citing the rubric.
2. **Given** a fixture that genuinely helps, **When** the delta is positive and the paired test is significant at the rubric threshold with the baseline valid, **Then** the verdict is `lift-confirmed`.

#### Discrimination control (learning vs. prompt-stuffing)

3. **Given** a **scrambled/irrelevant-memory** variant of the fixture, **When** the same suite runs, **Then** the lift must **not** be significant; a significant lift on scrambled memory fails the suite (it proves the probe measures context-stuffing, not learning).
4. **Given** a rigged-impossible discrimination control (a lift grader forced to "confirm" a zero-signal delta), **When** the suite runs, **Then** the control fails as designed (cap-of-zero).

#### Contamination gate (closed-book)

5. **Given** the probe set, **When** muster runs the **no-memory / closed-book** condition, **Then** probes answerable *without* the memory are flagged/excluded as contaminated; a suite whose lift is explained by parametric-knowledge leakage is reported `contaminated`, not `lift-confirmed`.

#### Abstention

6. **Given** a declared-unanswerable probe, **When** graded, **Then** the model must **abstain** (not fabricate); fabrication fails the probe.

#### Rigor / reproducibility

7. **Given** a probe set of size n, **When** the suite reports a `no-lift` verdict, **Then** it also reports the **minimum detectable effect** for n at the rubric's α/power (a bounded null), never bare "absence of evidence."
8. **Given** any probe graded by an LLM judge, **When** both arms are graded, **Then** the **same judge** grades both on the same probes and **arm identity/order is blinded/randomized** to the judge; the rubric records which biases cancel common-mode in the paired delta and which do not.
9. **Given** the same suite, **When** run against a second, differently-hosted OpenAI-compatible endpoint with only endpoint config changed, **Then** the harness runs identically.

### Edge Cases

- **Baseline already saturated (ceiling)** — if the no-memory arm already aces the probes, there is no headroom for a lift → `baseline-invalid`. (A *floored* no-memory baseline is NOT invalid — it is the ideal condition for this layer, since a contamination-clean probe cannot be answered without the memory; the floor guard applies to the *with-memory* treatment arm instead. See rubric §2.2.)
- **Under-powered probe set** — n too small to detect the rubric's target effect → the verdict reports the achievable MDE and flags the suite under-powered rather than claiming `no-lift`.
- **Judge sees arm identity** — if arm order/label leaks to the judge, position bias no longer cancels → the run is invalid until blinding is restored.
- **Conjunctive pass^k on a safety-critical probe** — the disjunctive `pass@k` estimator does not apply; muster uses its own published pass^k estimator (rubric) rather than a biased closed form.
- **Endpoint errors mid-suite** — an errored run counts as a failed run (never skipped/retried); remaining probes still run.
- **No seed available** — arms are temperature-pinned; the paired design and N-sampling absorb residual noise; reproduction is statistical, not exact.

## Requirements

### Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-001 | The capability is implemented as an adapter behind muster's `SpecAdapter`/named-`run()` boundary, reusing the core pipeline, canonical-JSON, report, behavioral runner/client, and the `crosslayer/rule-survival` baseline-vs-condition primitive, **without modifying the spec-agnostic core**. | Proposed |
| FR-002 | The adapter loads a **declared memory fixture** (initially the OpenClaw `MEMORY.md`/`USER.md` shape muster already parses; designed toward Letta `.af` compatibility) plus a probe set and a manifest, and runs the same probe set under **≥3 conditions**: no-memory baseline, with-memory, and scrambled/irrelevant-memory control. | Proposed |
| FR-003 | The lift is measured as a **question-level paired difference** on the same probes; the adapter **retains per-probe paired outcomes** under both arms and **exposes the continuous pass-rate** per condition (not only the collapsed k-of-n/pass^k boolean). | Proposed |
| FR-004 | Real-vs-noise is decided with a **paired significance test (McNemar mid-p)** and the delta is reported with a **Tango/Newcombe confidence interval**; the verdict is one of `lift-confirmed \| no-lift \| contaminated \| baseline-invalid`, with the `BASELINE_THRESHOLD` validity guard. | Proposed |
| FR-005 | The **scrambled-memory negative control** must show no significant lift; a significant lift on scrambled memory **fails the suite** (discrimination between learning and prompt-stuffing). | Proposed |
| FR-006 | A **closed-book contamination gate** flags/excludes probes answerable without the memory; a lift explained by parametric-knowledge leakage is reported `contaminated`. | Proposed |
| FR-007 | **Abstention** probes: declared-unanswerable queries must be refused, not fabricated. | Proposed |
| FR-008 | The suite reports the **minimum detectable effect** for its probe count (Miller Eq. 10) and renders a `no-lift` verdict as a **bounded/powered null** (CI excludes the lift threshold), never bare absence of evidence. | Proposed |
| FR-009 | An **errored run counts as a failed run** everywhere (never skipped, never retried). | Proposed |
| FR-010 | Every grader/verdict ships a **rigged-impossible discrimination control** (cap-of-zero), including an **all-refuse guard**. | Proposed |
| FR-011 | Where an LLM judge is used, the **same judge grades both arms on the same probes** and **arm identity/order is blinded/randomized** to the judge; the rubric documents which biases cancel common-mode and which do not. | Proposed |
| FR-012 | Findings are emitted in muster's machine-readable format; **every methodological choice cites muster's published rubric** (`docs/rubric/memory-utilization-taxonomy.md`), which anchors to the cited conventions/research. | Proposed |
| FR-013 | The mission ships the **published rubric** (`docs/rubric/memory-utilization-taxonomy.md`) defining: the learning-lift definition; the estimator/CI/paired-test choices (citing Miller, Fagerland, Chen); the **conjunctive `pass^k` estimator muster derives** (e.g. beta-binomial/Bayesian posterior — no citable convention exists); and the **judge-bias reasoning** (common-mode cancellation + blinding). | Proposed |
| FR-014 | The mission ships a **fixture set**: a declared memory fixture, a contamination-clean probe set, its scrambled-memory variant, and abstention probes — shaped as a candidate upstream conformance suite. | Proposed |
| FR-015 | The mission documents a **pilot protocol** to estimate the paired within-probe score correlation / `ω²` needed for concrete N-sizing, given muster sends no seed. | Proposed |

### Non-Functional Requirements

| ID | Requirement | Threshold | Status |
|----|-------------|-----------|--------|
| NFR-001 | Fixture loading, the contamination-gate structure, and rubric rendering run fully offline with byte-stable deterministic output. | Zero network in the offline path; identical bytes across runs/machines. | Proposed |
| NFR-002 | The lift verdict resists endpoint flakiness. | Decisions rest on N-sampled pass-rates with reported CIs, not single draws; N sized to the declared MDE. | Proposed |
| NFR-003 | Model access is bring-your-own via any OpenAI-compatible endpoint; credentials from the environment only. | No provider SDKs; no credentials in the repo. | Proposed |
| NFR-004 | Type-check and test gates. | `tsc` strict passes; full Vitest suite green incl. the new fixture suite; SonarCloud quality gate passes. | Proposed |
| NFR-005 | Behavioral suite latency (N × conditions × probes) is bounded and documented. | Documented budget; a reduced smoke profile runs in CI. | Proposed |

### Constraints

| ID | Constraint | Status |
|----|------------|--------|
| C-001 | The spec-agnostic core never learns learning/memory specifics; all such knowledge lives in the adapter behind the boundary. | Proposed |
| C-002 | **Non-runtime**: muster stages memory states as fixtures and asserts on transcripts; it never hosts, schedules, or operates an agent, and never runs a live write-back/learning loop (that is the out-of-scope Tier 3). | Proposed |
| C-003 | No normative standard exists; every check cites **muster's own published rubric**, which anchors to the cited conventions/research (Miller/Fagerland/Chen/`.af`/Reflexion/LongMemEval/GEM). No check cites these as normative authorities. | Proposed |
| C-004 | Vendored probe/contamination corpora must be MIT/Apache/CC-BY, license-verified, with LICENSE + citation retained. | Proposed |
| C-005 | The design **retains per-probe paired outcomes** — a hard dependency for the paired variance-reduction and the McNemar/paired-CI apparatus. | Proposed |
| C-006 | Arms are **temperature-pinned**; no seed is available, so reproducibility is statistical (N-sampling + CIs), not exact. | Proposed |

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | An operator learns whether a declared memory fixture produces a **statistically real** behavior lift (paired delta + CI + significance), not merely an apparent one. |
| SC-002 | The **scrambled-memory control** shows no lift — the suite distinguishes learning from prompt-stuffing. |
| SC-003 | The **contamination gate** ensures the measured lift is not explained by parametric-knowledge leakage. |
| SC-004 | A `no-lift` verdict is a **bounded/powered null** (reported MDE), not absence of evidence. |
| SC-005 | Every grader fails its rigged-impossible control, including the all-refuse guard. |
| SC-006 | The same behavioral suite runs unchanged against two differently-hosted OpenAI-compatible endpoints. |
| SC-007 | The published rubric cites its methodological source per check, and defines muster's own `pass^k` estimator and judge-bias reasoning where no citable convention exists. |

## Key Entities

- **Declared memory fixture**: the agent's memory expressed as a stageable file (OpenClaw `MEMORY.md`/`USER.md` now; `.af`-compatible later), with a no-memory and a scrambled-memory variant.
- **Probe set**: fixed scenarios whose correct answer requires the memory (contamination-checked), plus abstention probes.
- **Condition arm**: no-memory / with-memory / scrambled-memory; the same probes run under each.
- **Paired outcome**: a probe's per-arm score pair, retained for the paired statistic.
- **Lift verdict**: `lift-confirmed | no-lift | contaminated | baseline-invalid`, with delta, CI, significance, and MDE.
- **Discrimination control**: the scrambled-memory arm + a rigged-impossible cap-of-zero control + the all-refuse guard.
- **Published rubric**: `docs/rubric/memory-utilization-taxonomy.md` — muster's cited source of record for this layer.

## Dependencies & Assumptions

- **Depends on**: muster core (`SpecAdapter`, pipeline, canonical JSON, report, behavioral runner/client), the `crosslayer/rule-survival` baseline-vs-condition primitive, and the Memory adapter's fixture-parsing (`MEMORY.md`/`USER.md`).
- **Requires two core enhancements** (call out in plan): (1) surface the **continuous pass-rate** currently collapsed to a boolean before reporting; (2) **retain per-probe paired outcomes** across arms.
- **Assumption**: "memory helps" is established by staging the fixture into context per the declared convention; muster does not run a retriever or a live agent.
- **Assumption**: this is the executable acceptance harness for a memory that *claims* to improve behavior; it certifies conformance to a **declared** lift claim, and can return a failed verdict when the claim is not real.
- **Out of scope**: Tier 2 learning-curve (memory grown across a fixture *sequence*) — a follow-up; Tier 3 autonomous self-learning (a live agent rewriting its own state) — forbidden by the runtime scope guard; per-file-path doctrine scoping; rewriting the agent's memory files.

## Scope Guard (carried from BRIEF.md)

Not an agent framework or runtime; not a prompt optimizer or generator; not a registry; not a hosted service; no benchmark leaderboard. If the controls show no lift or contamination, the correct output is a **failed conformance verdict** — the harness must be able to say a learning claim is not real. CLI + CI exit codes only.
