# Implementation Plan: Memory-Utilization / Learning-Lift Conformance

**Branch**: `chore/spec-kitty-3.2.5-upgrade` | **Date**: 2026-07-09 | **Spec**: `kitty-specs/memory-utilization-conformance-01KX1W65/spec.md`
**Input**: Feature specification from `kitty-specs/memory-utilization-conformance-01KX1W65/spec.md`; research base `research.md`; entities `data-model.md`.

## Summary

Add a Tier-1 **memory-utilization / learning-lift** conformance adapter behind muster's `SpecAdapter`/named-`run()` boundary. It stages a **declared memory fixture** in three variants (real / none / scrambled) as fixtures, runs a fixed probe set under each arm, and measures whether the with-memory arm beats the no-memory arm by a **statistically real, paired** margin — decided with McNemar mid-p, reported with a Tango/Newcombe CI and a Miller-sized MDE, guarded by a scrambled-memory negative control and a closed-book contamination gate. The verdict is `lift-confirmed | no-lift | contaminated | baseline-invalid`. Every methodological choice cites muster's **own published rubric** (`docs/rubric/memory-utilization-taxonomy.md`) because no upstream normative standard exists. The measurement reuses the existing `crosslayer/rule-survival` baseline-vs-condition primitive; the spec-agnostic core is only extended additively (surface the continuous pass-rate; retain per-probe paired outcomes). It never operates the agent (non-runtime).

## Technical Context

**Language/Version**: TypeScript 5.x on Node 22+ (strict `tsc`)
**Primary Dependencies**: muster core (`src/core/behavioral/*`, `src/core/adapter.ts`, `src/crosslayer/rule-survival.ts`), the Memory adapter parser (`src/adapters/memory/`); dev: Vitest. **Statistics implemented in-house** (Wilson/CLT CI, McNemar mid-p, Tango score interval, Miller power/MDE, muster's own `pass^k`) — no new numerical runtime dependency, per muster's minimal-dependency invariant.
**Storage**: files only — fixtures under `tests/fixtures/`, rubric under `docs/rubric/`, example under `examples/`. No DB.
**Testing**: Vitest — unit tests for every statistical function against **known-answer fixtures** (hand-computed McNemar/Tango/Wilson/Miller values); adapter integration with a **scripted mock `ChatClient`** (offline, deterministic); a rigged-impossible discrimination control per grader; a reduced behavioral smoke profile in CI.
**Target Platform**: Node 22 CLI + CI exit codes.
**Project Type**: single project (the muster package).
**Performance Goals**: offline paths byte-stable and deterministic; statistics are pure and O(n) in probes; behavioral latency bounded and documented, with a small CI smoke profile.
**Constraints**: non-runtime (fixtures, never operate the agent); spec-agnostic core untouched except additive pass-rate/paired-outcome surfacing; BYOM/no provider SDKs; minimal deps; every check cites the published rubric.
**Scale/Scope**: one new adapter, one in-house stats module, one published rubric, one fixture suite + example. ~Tier-1 only; Tier-2 (learning-curve) and Tier-3 (autonomous) explicitly excluded.

## Charter Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Spec-agnostic core / adapter boundary** — PASS: all learning/memory knowledge lives in the adapter; core changes are additive and generic (a continuous pass-rate + paired-outcome retention on the behavioral report). C-001.
- **Offline & deterministic static path** — PASS: fixture loading, contamination-gate structure, rubric rendering, and all statistics are offline/deterministic (NFR-001).
- **BYOM, no baked-in providers** — PASS: reuses `makeClient`/`ChatClient`; env-only keys (NFR-003).
- **k-of-n / pass^k, errored=failed** — PASS: reused; errored run counts as failed everywhere (FR-009).
- **Cite a normative source** — PASS via the exception the charter allows for convention-only layers: muster publishes its own rubric and cites it (C-003).
- **Discrimination controls** — PASS: every grader ships a rigged-impossible control + all-refuse guard (FR-010).

No violations → Complexity Tracking empty.

## Project Structure

### Documentation (this mission)

```
kitty-specs/memory-utilization-conformance-01KX1W65/
├── plan.md              # This file
├── research.md          # Research base (two verified deep-research passes)
├── data-model.md        # Entities + statistical pipeline
├── quickstart.md        # Phase 1 output (added in tasks/impl)
├── contracts/           # Verdict + report + manifest schema
└── tasks.md             # Phase 2 output (/spec-kitty.tasks)
```

### Source Code (repository root)

```
src/
├── core/
│   └── behavioral/
│       ├── stats/               # NEW in-house statistics (pure, unit-tested)
│       │   ├── proportion-ci.ts   # CLT/Bernoulli + Wilson/Clopper-Pearson
│       │   ├── paired.ts          # McNemar mid-p; Tango/Newcombe delta CI
│       │   ├── power.ts           # Miller Eq.9/10 N-sizing + MDE
│       │   └── passk.ts           # disjunctive pass@k + muster's conjunctive pass^k
│       ├── types.ts             # + continuous pass-rate + paired-outcome retention (additive)
│       └── report.ts            # + surface continuous pass-rate (additive)
├── adapters/
│   └── memory-utilization/      # NEW adapter (behind the boundary)
│       ├── index.ts               # run(); 3-arm orchestration via rule-survival
│       ├── manifest.ts            # case schema (fixture, probes, arms, N, thresholds)
│       ├── fixture.ts             # load memory variants (reuse memory parser); scrambler
│       ├── contamination.ts       # closed-book gate
│       ├── verdict.ts             # LiftMeasurement → LiftVerdict
│       └── controls.ts            # scrambled negative control; cap-of-zero; all-refuse guard
├── crosslayer/
│   └── rule-survival.ts         # reused (baseline-vs-condition); generalized arm param if needed
└── cli/
    └── index.ts                 # + `memory-utilization run` subcommand

docs/rubric/
└── memory-utilization-taxonomy.md   # NEW published rubric (cited source of record)

tests/
├── unit/ (stats known-answer)   ├── adapters/memory-utilization/ (integration, controls)
tests/fixtures/memory-utilization/  # memory variants, probe set, scrambled, abstention, licensed corpus
examples/memory-utilization/        # runnable example + manifest
```

**Structure Decision**: single project. New numerics live in `src/core/behavioral/stats/` (pure, generic — no memory specifics, preserving the spec-agnostic boundary). All memory/learning knowledge lives in `src/adapters/memory-utilization/`. The published rubric is the cited source of record.

## Complexity Tracking

*No Charter Check violations — section intentionally empty.*

## Implementation Concern Map

> Concerns, not work packages. `/spec-kitty.tasks` maps these to WPs.

### IC-01 — Core additive enhancements (pass-rate surfacing + paired-outcome retention)
- **Purpose**: expose the continuous pass-rate the behavioral report currently collapses to a boolean, and retain per-probe paired outcomes across arms — the hard prerequisites for a paired lift.
- **Relevant requirements**: FR-003; C-005; C-006.
- **Affected surfaces**: `src/core/behavioral/types.ts`, `report.ts` (additive, non-breaking).
- **Sequencing/depends-on**: none (foundation).
- **Risks**: must not change existing behavioral verdicts/bytes; additive only. Regression-test existing layers.

### IC-02 — In-house statistics module
- **Purpose**: the numerically-critical primitives — single-arm CI (CLT/Wilson), paired McNemar mid-p, Tango/Newcombe delta CI, Miller N-sizing/MDE, disjunctive pass@k, and muster's own conjunctive `pass^k` estimator.
- **Relevant requirements**: FR-003, FR-004, FR-008, FR-013.
- **Affected surfaces**: `src/core/behavioral/stats/*`.
- **Sequencing/depends-on**: none (pure functions; can proceed in parallel with IC-01).
- **Risks**: correctness — every function needs known-answer unit tests; boundary coverage near 0/1; `pass^k` estimator is muster-original (derive + document + test).

### IC-03 — Learning-lift adapter (3-arm orchestration + verdict)
- **Purpose**: load the memory fixture variants, run the probe set under no-memory/with-memory/scrambled arms via the rule-survival primitive, apply the contamination gate + abstention + discrimination controls, and emit `LiftMeasurement`/verdict/report.
- **Relevant requirements**: FR-001, FR-002, FR-004, FR-005, FR-006, FR-007, FR-009, FR-010.
- **Affected surfaces**: `src/adapters/memory-utilization/*`, reuse `src/crosslayer/rule-survival.ts`.
- **Sequencing/depends-on**: IC-01, IC-02.
- **Risks**: preserving the spec-agnostic boundary; the scrambled-memory control and baseline-validity guard must be first-class, not afterthoughts.

### IC-04 — Published rubric (cited source of record)
- **Purpose**: `docs/rubric/memory-utilization-taxonomy.md` — the lift definition, estimator/CI/test choices with citations, muster's derived `pass^k` estimator, and the judge-bias reasoning (common-mode cancellation + arm blinding).
- **Relevant requirements**: FR-011, FR-012, FR-013; C-003.
- **Affected surfaces**: `docs/rubric/`, plus per-check citation wiring in the adapter.
- **Sequencing/depends-on**: IC-02 (must match the implemented math).
- **Risks**: every check must cite a rubric clause; the `pass^k` and judge-bias sections are muster-original and must be defensible.

### IC-05 — Fixtures + probe corpus
- **Purpose**: a declared memory fixture, a contamination-clean probe set, its scrambled-memory variant, and abstention probes — shaped as a candidate upstream suite; vendored corpora license-verified.
- **Relevant requirements**: FR-014; C-004.
- **Affected surfaces**: `tests/fixtures/memory-utilization/`, `examples/memory-utilization/`.
- **Sequencing/depends-on**: IC-03 (manifest shape).
- **Risks**: contamination cleanliness (probes must genuinely fail closed-book); license hygiene for any vendored corpus.

### IC-06 — CLI wiring, reporting, gates & pilot protocol
- **Purpose**: the `memory-utilization run` subcommand + machine-readable report + exit codes; the pilot protocol doc for estimating `ω²`; `tsc`/Vitest/SonarCloud green incl. the new suite and a CI smoke profile.
- **Relevant requirements**: FR-008, FR-010, FR-015; NFR-002, NFR-004, NFR-005.
- **Affected surfaces**: `src/cli/index.ts`, `quickstart.md`, CI config.
- **Sequencing/depends-on**: IC-03, IC-04, IC-05.
- **Risks**: behavioral latency budget; keeping the CI profile deterministic (scripted mock client).
