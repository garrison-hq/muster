---
work_package_id: WP04
title: behave run CLI wiring
dependencies:
- WP03
requirement_refs:
- FR-013
- FR-014
- FR-015
- FR-016
- FR-017
tracker_refs: []
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this mission were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T020
- T021
- T022
- T023
- T024
- T025
- T026
- T027
phase: Phase 2 — CLI wiring (WP04, depends on WP03)
assignee: ''
agent: ''
history:
- timestamp: '2026-08-07T12:59:34Z'
  agent: system
  action: Materialized during implement-phase preflight from the reviewed tasks.md, after the design-phase `spec-kitty tasks` scaffold failed to generate WP files against the old topology.
authoritative_surface: ''
create_intent: []
execution_mode: code_change
owned_files: []
tags: []
---

# Work Package Prompt: WP04 – `behave run` CLI wiring

## Goal

Wire `--cassette <dir> --record|--replay` end to end into `behave run`: flag
validation, replay run-count preflight read from the cassette before any
other resolution, per-case decorator construction, the `replayed: true`
output marker, the `stale` verdict field, and the three pre-designed hazard
fixes (exit-2 heuristic misfiring on an all-stale replay, the `--json` shape
asymmetry, and `durationMs` non-determinism breaking byte-identical replay
output).

Priority: P1 · Estimated prompt size: ~450 lines.

## Owned files

- the `BehaveOpts`/`behave run` command/`doBehaveRun` regions of
  `src/cli/index.ts` (~L387-393, ~L1978-2011, ~L414-489)
- `src/core/behavioral/types.ts` (`stale?: boolean`)
- `src/core/behavioral/runner.ts`'s `runCase` catch block (~L562)
- `tests/unit/cli.test.ts`'s existing `"muster behave run"` describe block
  (line 377)
- `tests/behavioral/runner.test.ts` (pre-existing 895-line file with 11
  describe blocks — extended here, not created: FR-013 stale-propagation
  assertion added as a new describe/it block)

## Subtasks

- **T020** — `src/cli/index.ts`: `BehaveOpts` (~L387-393) gains
  `cassette?: string`, `record?: boolean`, `replay?: boolean`.
- **T021** — `src/cli/index.ts`: `behave run` command definition
  (~L1978-2011) gains `--cassette <dir>`, `--record`, `--replay` options.
- **T022** — `src/cli/index.ts`: `doBehaveRun` (~L414-489) — flag validation
  (FR-016), replay run-count preflight reading only
  `readCassetteSuiteIndex` (FR-014/015), per-case `makeCassetteClient`
  construction (FR-007..010), `replayed: true` output-envelope branch for
  `--json` and human formatter (FR-017, Hazard 2), replay-only `durationMs`
  normalization to `0` three levels deep before `JSON.stringify` (Hazard 3,
  NFR-002), exit-2 "endpoint fatal" heuristic gated off when
  `opts.replay === true` (Hazard 1).
- **T023** — `src/core/behavioral/types.ts`: `stale?: boolean` added to
  `RunVerdict` and `CaseVerdict` (FR-013, additive, mirrors the `passRate`
  precedent).
- **T024** — `src/core/behavioral/runner.ts`: `runCase`'s existing catch
  block (~L562) gains an `instanceof CassetteMissError` check setting
  `stale: true`, reusing the untouched error-containment path.
- **T025** — `tests/unit/cli.test.ts`: new cases inside the existing
  `"muster behave run"` describe block (line 377) — flag validation
  (FR-016, Scenario 12/13), record-twice byte-stability (NFR-001,
  Scenario 2), replay-twice byte-identical `--json` incl. a deliberate
  timing difference between invocations proving `durationMs` normalization
  (NFR-002, Scenario 6, Hazard 3), `replayed: true` shape present only on
  replay (FR-017, Scenario 8), zero network I/O via
  `vi.spyOn(globalThis, "fetch")` mirroring the `cli.test.ts:727`
  precedent (NFR-003, Scenario 5), stale-miss exit code 1 not 2 (FR-013,
  Scenario 9, Hazard 1), `n=5` recorded/no `--runs` uses 5 (FR-014,
  Scenario 10), `--runs 3` vs. recorded 5 fails before any case executes
  naming both counts (FR-015, Scenario 11).
- **T026** — `tests/behavioral/runner.test.ts` (existing 895-line file — add
  a new `describe`/`it` block, do not overwrite): `stale` field propagation
  assertion — a replay run against a cassette missing an exchange produces
  a `CaseVerdict`/`RunVerdict` with `stale: true` (FR-013).
- **T027** — WP04 verification gate.

## Dependencies

WP03 (needs `makeCassetteClient`, `CassetteMissError`,
`readCassetteCase`/`writeCassetteCase`/`readCassetteSuiteIndex`/`writeCassetteSuiteIndex`).
Also sequenced strictly after WP01 for a same-file reason only, not a
functional one: both WP01 (T002) and WP04 (T020-T022) edit
`src/cli/index.ts` in different regions (`doSopRun`/`buildSopClient` vs.
`BehaveOpts`/`behave run`/`doBehaveRun`); Phase 1 completing before Phase 2
starts means WP04 always begins from a tree that already has WP01's edit
merged, so no same-file merge conflict is possible.

## Parallel

None — this WP is the sole occupant of Phase 2; nothing else is ready to
start until WP03 lands, and WP05/WP06 need WP04's output.

## Risks

Hazard 1 (exit-2 heuristic misfires on an all-stale replay — must be gated
off entirely when `opts.replay === true`), Hazard 2 (`--json` shape is
deliberately asymmetric: only `--replay` wraps the array as
`{ replayed: true, verdicts }`), and Hazard 3 (`Transcript.durationMs` is a
required, unconditionally-stamped field with zero cassette-mode awareness —
the replay-only output copy must normalize it to `0` three levels deep,
`CaseVerdict[] → RunVerdict[] → Transcript`, without mutating the original
objects `runCase` returns) are all pre-designed in plan.md specifically
because they are easy to get subtly wrong. T022 must implement all three;
T025 must test all three with tests that would fail if the fix were absent
(not merely fast/uniform-timing tests that would pass either way).
`tests/behavioral/runner.test.ts` (T026's target) is a pre-existing
895-line file with 11 describe blocks unrelated to this WP (e.g.
`personaPrompt rendering`, `C-006 makeClient`, `FR-023 transcript
completeness`) — T026's diff against this file MUST be an addition of one
new describe/it block, never a rewrite or truncation of the file.

## Independent test

`pnpm test` green; a `--replay` run against a cassette with zero matching
case files exits 1, not 2; two `--replay` invocations of the same suite with
an artificially forced timing difference between them produce
byte-identical `--json`.
