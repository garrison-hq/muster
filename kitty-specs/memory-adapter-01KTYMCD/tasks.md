# Tasks: Memory (MEMORY.md / USER.md) Conformance Adapter

**Mission**: `memory-adapter-01KTYMCD`
**Input**: `spec.md` (FR-001..FR-012, NFR-001..NFR-007, C-001..C-005), `plan.md` (WP outline, file structure, FR map), `data-model.md` (entities, invariants)
**Branch contract**: planned on `main`; WPs execute in lanes; completed changes merge back into `main`.

**Ownership note**: WPs are sliced by implementation surface — parse/lint core
(WP01/WP02), behavioral recall (WP03), privacy/leak probe (WP04), and
integration wiring (WP05). Every source file appears in exactly one WP's
`owned_files` list; no overlap is possible because each WP writes distinct
modules under `src/adapters/memory/` and distinct test and fixture subdirectories.
WP01 owns `lint.ts` and `lint.test.ts`; WP02 owns `contradiction.ts` and
`contradiction.test.ts` (imports from `lint.ts` read-only). WP05 owns only the
entry-point, manifest runner, and integration test; all adapter modules belong
to WP01–WP04.

## Subtask Index

| ID | Description | WP | Parallel |
|---|---|---|---|
| T001 | Implement `FactParser` in `lint.ts` — parse MEMORY.md + USER.md into `MemoryFact[]` | WP01 | [P] |
| T002 | Implement `StalenessLinter` — flag stale time-sensitive facts vs reference date | WP01 | [P] |
| T003 | Fixtures: `tests/fixtures/memory/consistent/` + `tests/fixtures/memory/stale/` | WP01 | [P] |
| T004 | Unit tests `lint.test.ts` — staleness branch (stale find; clean ok; no-ref-date skip) | WP01 | |
| T005 | WP01 verification: `pnpm build && pnpm test` green; byte-stability check | WP01 | |
| T006 | Create `ContradictionLinter` in `contradiction.ts` — cross-file + intra-file, supersession-aware | WP02 | [P] |
| T007 | Fixtures: `tests/fixtures/memory/contradictory/` | WP02 | [P] |
| T008 | Unit tests `contradiction.test.ts` — contradiction branch (cross-file; intra-file; supersession not flagged; clean ok) | WP02 | |
| T009 | WP02 verification: build + full suite green; no regressions | WP02 | |
| T010 | Implement `RecallProbeRunner` in `recall.ts` — wrap behavioral runner; k-of-n; errored=failed | WP03 | [P] |
| T011 | Fixtures: `tests/fixtures/memory/recall-scenarios/` (fact-recall.yaml + addressing-recall.yaml) | WP03 | [P] |
| T012 | Unit tests `recall.test.ts` — grader with mock client; discrimination control fails; errored=failed | WP03 | |
| T013 | WP03 verification: build + full suite green | WP03 | |
| T014 | Implement `PrivacyLeakProbeRunner` in `privacy.ts` — pass^k; group-context framing; all-refuse guard; OpenClaw SHA cite | WP04 | [P] |
| T015 | Vendored adversarial corpus: `tests/fixtures/memory/vendored/` — extraction-probes.jsonl + LICENSE + CITATION.md | WP04 | [P] |
| T016 | Fixtures: `tests/fixtures/memory/privacy-scenarios/` (group-context.yaml + adversarial-group-context.yaml) | WP04 | [P] |
| T017 | Unit tests `privacy.test.ts` — leak detect; clean pass; all-refuse guard fires; adversarial probe runs; rigged control fails; errored=failed | WP04 | |
| T018 | WP04 verification: build + full suite green | WP04 | |
| T019 | Wire `MemoryAdapter` entry point `index.ts` — register with CLI; export adapter | WP05 | [P] |
| T020 | Implement manifest runner in `index.ts` — consistent/stale/contradictory/recall/privacy fixture sets; pass/fail summary | WP05 | [P] |
| T021 | Integration test: full memory fixture suite via manifest runner; `pnpm test` green; byte-stable static output on second run | WP05 | |
| T022 | WP05 verification: full `pnpm test` green; CLI smoke; byte-diff confirms static output is stable | WP05 | |

## Phase 1 — Static lint (WP01, WP02 — sequential; WP03/WP04 parallel after WP01)

### WP01 — MEMORY.md / USER.md parse + fact-label manifest + staleness lint — prompt: `tasks/WP01-parse-staleness.md`

**Goal**: Implement `FactParser` (parses both files into `MemoryFact[]`, honours
private/time-sensitive labels from the manifest) and `StalenessLinter` (flags
stale time-sensitive facts relative to a supplied reference date; skips with a
recorded note when no reference date is supplied) in `src/adapters/memory/lint.ts`.
Ship `consistent/` and `stale/` fixture sets. Byte-stable deterministic output
(NFR-001, C-003).
**Priority**: P1 · **Estimated prompt size**: ~380 lines
**Independent test**: `pnpm build && pnpm test` green; staleness branch of
`lint.test.ts` passes; clean fixture returns `ok: true`; stale fixture returns
at least one `StalenessFinding`; no-reference-date path returns
`StalenessSkipNote` with `reason: "no-reference-date"`.

- [ ] T001 Implement `FactParser` in `lint.ts` (WP01)
- [ ] T002 Implement `StalenessLinter` in `lint.ts` (WP01)
- [ ] T003 Fixtures: `tests/fixtures/memory/consistent/` + `tests/fixtures/memory/stale/` (WP01)
- [ ] T004 Unit tests `lint.test.ts` staleness branch (WP01)
- [ ] T005 WP01 verification (WP01)

**Dependencies**: none.
**Risks**: reference date must be a supplied input — no `new Date()` or
`Date.now()` anywhere in `lint.ts` (C-003, NFR-001); `MemoryFact.id` must be
deterministic so `StalenessFinding` is byte-stable across runs; `timeSensitive`
facts with unparseable dates emit an `unparseable-date` note rather than silently
passing.

### WP02 — Contradiction lint (cross-file + intra-file, supersession-aware) — prompt: `tasks/WP02-contradiction-lint.md`

**Goal**: Create `src/adapters/memory/contradiction.ts` with `ContradictionLinter`
— flags contradictions between `MEMORY.md`↔`USER.md` and within `MEMORY.md`;
distinguishes timestamped supersession (not a finding) from genuine contradiction
(`ContradictionFinding`). Imports `MemoryFact`, `LintReport`, and `RUBRIC_CITATION`
from `lint.ts` (WP01) read-only; does NOT modify `lint.ts`. Byte-stable output
(NFR-001, C-002).
**Priority**: P1 · **Estimated prompt size**: ~340 lines
**Independent test**: `pnpm build && pnpm test` green; contradiction fixture
returns at least two `ContradictionFinding`s (cross-file + intra-file); clean
fixture returns `ok: true`; supersession case returns `SupersessionNote` only, no
finding.

- [ ] T006 Create `ContradictionLinter` in `contradiction.ts` (WP02)
- [ ] T007 Fixtures: `tests/fixtures/memory/contradictory/` (WP02)
- [ ] T008 Unit tests `contradiction.test.ts` contradiction branch (WP02)
- [ ] T009 WP02 verification (WP02)

**Dependencies**: WP01 (requires `FactParser` from `lint.ts`).
**Risks**: supersession detection requires comparing `timestamp` fields —
linter must not flag a fact pair where the newer fact has a later `timestamp` and
covers the same topic; the rubric distinction must be cited (C-002).

## Phase 2 — Behavioral probes (WP03, WP04 — parallel after WP01)

### WP03 — Behavioral recall probes (k-of-n) — prompt: `tasks/WP03-recall-probes.md`

**Goal**: Implement `RecallProbeRunner` in `src/adapters/memory/recall.ts` —
wraps the existing behavioral runner (`src/core/behavioral/runner.ts`); loads
`MEMORY.md`/`USER.md` facts into session context; runs each recall scenario N
times against a BYOM endpoint; grades on whether the model recalled the fact at
or above rubric threshold; aggregates k-of-n. Errored run counts as failed
(FR-008). Rigged-impossible discrimination control (FR-009). Cites muster's
published rubric (C-002).
**Priority**: P1 · **Estimated prompt size**: ~370 lines
**Independent test**: `pnpm build && pnpm test` green; `recall.test.ts` passes
with a mock client; discrimination control produces a fail as designed; errored
run is recorded as a failure, not skipped.

- [ ] T010 Implement `RecallProbeRunner` in `recall.ts` (WP03)
- [ ] T011 Fixtures: `tests/fixtures/memory/recall-scenarios/` (WP03)
- [ ] T012 Unit tests `recall.test.ts` (WP03)
- [ ] T013 WP03 verification (WP03)

**Dependencies**: WP01 (requires `FactParser`).
**Parallel**: can proceed alongside WP02 (no shared code beyond `FactParser`).
**Risks**: no provider SDKs; endpoint + token from environment only (NFR-005);
`RecallProbeRunner` must reuse `src/core/behavioral/runner.ts` — no reimplementation of the runner logic (C-001, FR-001).

### WP04 — Privacy / leak probe (group-context, pass^k, all-refuse guard) + adversarial extraction probes — prompt: `tasks/WP04-privacy-probe.md`

**Goal**: Implement `PrivacyLeakProbeRunner` in `src/adapters/memory/privacy.ts`
— the safety headline. In a group/shared-context scenario, private `MEMORY.md`
facts must not surface across all k runs (pass^k, FR-006, NFR-007). A single
leak fails the case. Cites the OpenClaw docs verbatim rule pinned to a commit
SHA (C-002). Includes adversarial extraction probes from a vendored corpus
(FR-007, C-004). All-refuse discrimination guard (FR-009, SC-004). Errored run
counts as failed (FR-008).
**Priority**: P1 · **Estimated prompt size**: ~450 lines
**Independent test**: `pnpm build && pnpm test` green; `privacy.test.ts` passes;
leak is detected; clean response passes; all-refuse guard fires; adversarial
probe runs; rigged-impossible discrimination control fails as designed; errored
run recorded as failure.

- [ ] T014 Implement `PrivacyLeakProbeRunner` in `privacy.ts` (WP04)
- [ ] T015 Vendored corpus: `tests/fixtures/memory/vendored/` (WP04)
- [ ] T016 Fixtures: `tests/fixtures/memory/privacy-scenarios/` (WP04)
- [ ] T017 Unit tests `privacy.test.ts` (WP04)
- [ ] T018 WP04 verification (WP04)

**Dependencies**: WP01 (requires `FactParser`).
**Parallel**: can proceed alongside WP02 and WP03.
**Risks**: vendored corpus must be MIT/Apache/CC-BY, license-verified at vendoring
time with upstream LICENSE + CITATION.md retained (C-004); pass^k requires
**all** k runs to pass — a single leak fails; the all-refuse guard fires when
the companion recall probe also fails (indeterminate non-compliance, not a pass);
OpenClaw SHA citation must reference the exact commit where the "private session
only" rule is documented in official docs.

## Phase 3 — Integration wiring (WP05 — after WP01–WP04)

### WP05 — Fixtures, manifest runner, and integration wiring — prompt: `tasks/WP05-integration-wiring.md`

**Goal**: Wire all fixture sets into the memory adapter's manifest runner and
register `MemoryAdapter` with the CLI. Produce a pass/fail summary in muster's
machine-readable format. Verify byte-stable output for the full static fixture
suite on a second run (NFR-001). Shape the fixture suite as a candidate upstream
conformance suite (C-005).
**Priority**: P1 (merge-ordered last) · **Estimated prompt size**: ~320 lines
**Independent test**: `pnpm test` green; integration-level fixture suite run
confirms all fixture sets produce expected verdicts; second run of static suite
produces byte-identical output; CLI registers `memory` subcommand without
touching any WP01–WP04 file.

- [ ] T019 Wire `MemoryAdapter` entry point in `index.ts` (WP05)
- [ ] T020 Implement manifest runner in `index.ts` (WP05)
- [ ] T021 Integration test: full memory fixture suite (WP05)
- [ ] T022 WP05 verification (WP05)

**Dependencies**: WP01, WP02, WP03, WP04 (all adapter modules must exist before
integration wiring).
**Risks**: `MemoryAdapter` must register with the CLI exactly as `rfc1` does —
no core changes (C-001); `index.ts` must not re-export anything from
`src/core/`; byte-stability check must use a second run on a fixed reference
date, not the system clock.

## Dependency summary

```
WP01 ──┬──▶ WP02
       ├──▶ WP03   (parallel with WP02)
       └──▶ WP04   (parallel with WP02/WP03)
WP02 ──┐
WP03 ──┼──▶ WP05 (integration wiring, merges last)
WP04 ──┘
```

WP01 has no dependencies. WP02/WP03/WP04 can all proceed in parallel once WP01
is merged (they import from `lint.ts` read-only but do not modify it).
WP05 is integration-only and must land after WP01–WP04.

## Acceptance traceability

- FR-001 (SpecAdapter boundary, reuse core pipeline) → WP01–WP05 (no core modification; adapter boundary enforced throughout)
- FR-002 (parse MEMORY.md + USER.md into MemoryFact[]) → WP01 (T001, T003, T004)
- FR-003 (staleness lint vs reference date; skip with note when absent) → WP01 (T002, T004, T005)
- FR-004 (contradiction lint, cross-file + intra-file, supersession-aware) → WP02 (T006, T007, T008)
- FR-005 (behavioral recall probes, k-of-n) → WP03 (T010, T011, T012)
- FR-006 (privacy/leak probes, pass^k, group-context) → WP04 (T014, T016, T017)
- FR-007 (adversarial extraction probes from vendored corpus) → WP04 (T015, T017)
- FR-008 (errored run counts as failed) → WP03 (T012), WP04 (T017)
- FR-009 (rigged-impossible discrimination controls + all-refuse guard) → WP03 (T012), WP04 (T017)
- FR-010 (machine-readable findings; citations) → WP01 (T002), WP02 (T006), WP03 (T010), WP04 (T014)
- FR-011 (manifest runner, pass/fail summary) → WP05 (T019, T020, T021)
- FR-012 (fixture set as candidate upstream conformance suite) → WP05 (T020, T022)
- NFR-001 (byte-stable deterministic static path) → WP01 (T002, T005), WP05 (T022)
- NFR-002/NFR-003 (< 5 s / < 10 s static latency) → WP01 (T005), WP05 (T022)
- NFR-004 (< 15 min behavioral suite) → WP03 (T013), WP04 (T018)
- NFR-005 (no provider SDKs; credentials from env) → WP03 (T010), WP04 (T014)
- NFR-006 (tsc strict; Vitest green; SonarCloud gate; ≥ 80% new-code coverage) → all WPs
- NFR-007 (pass^k; single leak fails) → WP04 (T014, T017, T018)
- C-001 (adapter boundary; core never imports memory specifics) → WP01–WP05
- C-002 (OpenClaw SHA cite for privacy; rubric cite for others) → WP01 (T002), WP02 (T006), WP03 (T010), WP04 (T014)
- C-003 (reference date is input; no clock reads on static path) → WP01 (T002, T004)
- C-004 (vendored corpora MIT/Apache/CC-BY, license-verified) → WP04 (T015)
- C-005 (shaped as upstream conformance suite candidate) → WP05 (T020)
- SC-001 (privacy probe pass^k vs documented rule) → WP04
- SC-002 (recall measurement) → WP03
- SC-003 (staleness + contradiction lint, supersession distinguished) → WP01, WP02
- SC-004 (all graders fail rigged controls; all-refuse guard fires) → WP03 (T012), WP04 (T017)
- SC-005 (same suite against two differently-hosted endpoints) → WP03 (T010), WP04 (T014)
- SC-006 (byte-identical static output) → WP01 (T005), WP05 (T022)
