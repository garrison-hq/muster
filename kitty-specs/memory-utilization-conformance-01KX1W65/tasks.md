# Tasks: Memory-Utilization / Learning-Lift Conformance

**Mission**: `memory-utilization-conformance-01KX1W65`
**Input**: `spec.md` (FR-001..FR-015, NFR-001..NFR-005, C-001..C-006), `plan.md` (IC-01..IC-06, structure), `data-model.md` (entities, pipeline), `research.md` (§3 internal fit, §4A statistics).
**Branch contract**: planned on `chore/spec-kitty-3.2.5-upgrade`; WPs execute flat; completed changes merge back into `chore/spec-kitty-3.2.5-upgrade`.

**Ownership note**: WPs are sliced by implementation surface with non-overlapping `owned_files`:
core-additive (WP01, `src/core/behavioral/{types,report}.ts`), statistics (WP02, `src/core/behavioral/stats/`), the adapter (WP03, `src/adapters/memory-utilization/` except the CLI), the published rubric (WP04, `docs/rubric/`), fixtures+example (WP05, `tests/fixtures/memory-utilization/` + `examples/memory-utilization/`), and CLI+gates (WP06, `src/cli/index.ts` additive + docs). Each source file is written by exactly one WP.

## Requirement → Work Package map

| FR | Requirement (short) | WP |
|----|---------------------|----|
| FR-001 | Adapter behind boundary, reuse rule-survival, core untouched | WP03 |
| FR-002 | Load memory fixture (3 variants) + probe set + manifest | WP03 |
| FR-003 | Paired per-probe outcomes + continuous pass-rate exposed | WP01 |
| FR-004 | McNemar mid-p + Tango/Newcombe CI + verdict | WP02, WP03 |
| FR-005 | Scrambled-memory negative control | WP03 |
| FR-006 | Closed-book contamination gate | WP03 |
| FR-007 | Abstention probes | WP03 |
| FR-008 | MDE + bounded/powered null | WP02, WP06 |
| FR-009 | Errored run counts as failed | WP03 |
| FR-010 | Discrimination controls + all-refuse guard | WP03, WP06 |
| FR-011 | Judge-bias mitigation (same-judge + blinding) | WP04 |
| FR-012 | Machine-readable report; per-check rubric citations | WP04, WP06 |
| FR-013 | Published rubric; muster's own pass^k estimator | WP02, WP04 |
| FR-014 | Fixture set (memory, contamination-clean probes, scrambled, abstention) | WP05 |
| FR-015 | Pilot protocol for ω²/correlation | WP06 |

## Subtask Index

| ID | Description | WP | Parallel |
|---|---|---|---|
| T001 | Extend `src/core/behavioral/types.ts` — additive `PairedOutcome` + continuous pass-rate fields (boolean preserved) | WP01 | [P] |
| T002 | Surface continuous pass-rate in `src/core/behavioral/report.ts` (additive; existing bytes unchanged) | WP01 | |
| T003 | Regression + unit tests: pass-rate exposed; existing behavioral verdicts/bytes unchanged | WP01 | |
| T004 | `stats/proportion-ci.ts` — CLT/Bernoulli + Wilson/Clopper-Pearson single-arm CI | WP02 | [P] |
| T005 | `stats/paired.ts` — McNemar mid-p + Tango/Newcombe paired-delta CI | WP02 | [P] |
| T006 | `stats/power.ts` — Miller Eq.9/10 N-sizing + MDE | WP02 | [P] |
| T007 | `stats/passk.ts` — disjunctive pass@k (Chen) + muster's conjunctive pass^k (beta-binomial) | WP02 | [P] |
| T008 | Known-answer unit tests for every stats function (hand-computed) + boundary coverage | WP02 | |
| T009 | `manifest.ts` + `fixture.ts` — load real/none/scrambled variants (reuse memory parser); scrambler | WP03 | [P] |
| T010 | `index.ts` — 3-arm orchestration via `rule-survival`; retain per-probe paired outcomes | WP03 | |
| T011 | `contamination.ts` (closed-book gate) + `verdict.ts` (`LiftMeasurement`→`LiftVerdict`) | WP03 | |
| T012 | `controls.ts` — scrambled negative control, cap-of-zero, all-refuse guard | WP03 | |
| T013 | Integration tests (scripted mock `ChatClient`): lift-confirmed/no-lift/contaminated/baseline-invalid; controls fail as designed; errored=failed | WP03 | |
| T014 | Author `docs/rubric/memory-utilization-taxonomy.md` — lift definition, estimator/CI/test citations, own pass^k, judge-bias reasoning | WP04 | [P] |
| T015 | Wire per-check rubric citations into adapter/report; judge arm-order blinding | WP04 | |
| T016 | Tests: every emitted check carries a rubric citation; blinding verified | WP04 | |
| T017 | Fixtures: memory (real/none/scrambled), contamination-clean probe set, abstention probes | WP05 | [D] |
| T018 | Any vendored corpus license-verified (LICENSE + CITATION); else document none needed | WP05 | [D] |
| T019 | Runnable `examples/memory-utilization/` + manifest | WP05 | | [D] |
| T020 | CLI `memory-utilization run` subcommand + machine-readable report + exit codes | WP06 | |
| T021 | Pilot-protocol doc (estimate ω²/score-correlation) + `quickstart.md` | WP06 | [P] |
| T022 | CI smoke profile; `tsc` strict + full Vitest green + SonarCloud; byte-stability of offline paths | WP06 | |

## Phase 1 — Foundations (WP01, WP02 — parallel)

### WP01 — Core additive: pass-rate surfacing + paired-outcome retention — prompt: `tasks/WP01-core-additive.md`
**Goal**: additively expose the continuous pass-rate (currently collapsed to a boolean) and retain per-probe paired outcomes, without changing any existing behavioral verdict or output bytes. Covers FR-003; enables the paired statistics.

### WP02 — In-house statistics module — prompt: `tasks/WP02-statistics.md`
**Goal**: pure, known-answer-tested statistics — single-arm CI, McNemar mid-p, Tango/Newcombe delta CI, Miller N-sizing/MDE, disjunctive pass@k, and muster's own conjunctive pass^k. Covers FR-004, FR-008, FR-013 (math).

## Phase 2 — Adapter + rubric (WP03 after WP01+WP02; WP04 after WP02)

### WP03 — Learning-lift adapter (3-arm orchestration + verdict + controls) — prompt: `tasks/WP03-adapter.md`
**Goal**: the adapter behind the boundary — load fixtures, run 3 arms via rule-survival, contamination gate + abstention + discrimination controls, emit LiftMeasurement/verdict/report. Covers FR-001, FR-002, FR-004, FR-005, FR-006, FR-007, FR-009, FR-010.

### WP04 — Published rubric + citation wiring — prompt: `tasks/WP04-rubric.md`
**Goal**: `docs/rubric/memory-utilization-taxonomy.md` as the cited source of record (incl. muster's own pass^k + judge-bias reasoning), and per-check citation wiring. Covers FR-011, FR-012, FR-013.

## Phase 3 — Fixtures, CLI, gates (WP05 after WP03; WP06 last)

### WP05 — Fixtures + probe corpus + example — prompt: `tasks/WP05-fixtures.md`
**Goal**: a candidate upstream fixture suite: memory variants, contamination-clean probes, abstention probes, runnable example. Covers FR-014; C-004.

### WP06 — CLI, reporting, pilot protocol, gates — prompt: `tasks/WP06-cli-gates.md`
**Goal**: the `memory-utilization run` subcommand + report + exit codes, the pilot protocol doc, and all green gates incl. a CI smoke profile. Covers FR-008 (report), FR-010 (wiring), FR-012 (report), FR-015.
