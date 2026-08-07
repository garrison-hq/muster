---
work_package_id: WP05
title: Invariant guards, discrimination-control fixture, remaining purity/redaction assertions
dependencies:
- WP03
- WP04
requirement_refs:
- FR-019
- FR-020
- FR-021
- FR-022
- FR-024
tracker_refs: []
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this mission were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T028
- T029
- T030
- T031
- T032
- T033
- T034
- T035
phase: Phase 3 — Invariant guards and fixtures (WP05, depends on WP03 and WP04)
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

# Work Package Prompt: WP05 – Invariant guards, discrimination-control fixture, remaining purity/redaction assertions

## Goal

NI-004 (a quote/template-literal-aware, paren-balanced
`Promise.all`-wraps-`.chat(`/`.chatWithTools(` regression guard,
directory-walked so it cannot rot the way a hand-maintained file list
already did once in this mission's own plan-review history), the
`fixtures/cassettes/` size lint, the committed discrimination-control
cassette and its load-bearing failing-graders test, plus two same-file
extensions of earlier WPs' test files (FR-020's credential-redaction
assertion in WP03's `store.test.ts`, FR-022's `personaPrompt` purity guard
in WP04's `runner.test.ts`).

Priority: P1 · Estimated prompt size: ~350 lines.

## Owned files

- `tests/unit/invariants.test.ts` (NI-004 + size lint)
- `fixtures/cassettes/discrimination-control/**`
- `tests/cassette/discrimination-control.test.ts`
- **sequential extensions** (after WP03 and WP04 have merged, not
  concurrent edits): `tests/cassette/store.test.ts` (WP03's file — adds
  FR-020's credential-redaction assertion) and
  `tests/behavioral/runner.test.ts` (WP04's file — adds FR-022's
  `personaPrompt` purity guard)

## Subtasks

- **T028** — `tests/unit/invariants.test.ts`: NI-004 — quote/template-
  literal-aware comment stripper + paren-balanced enclosure walk (shared
  `trackQuoteState`-style helper) detecting a `Promise.all` call wrapping a
  `.chat(`/`.chatWithTools(` call site; directory-walked over
  `src/adapters/`, `src/core/behavioral/`, `src/crosslayer/` (83 `.ts`
  files; 10 currently contain a `.chat(`/`.chatWithTools(` call site) using
  the existing `walk()`/`BASE_EXCLUDES` helpers; `PROMISE_ALL_CALL` token
  built by concatenation matching `FETCH_CALL`'s style; folded into the
  existing combined timer (FR-024/C-006, NFR-007).
- **T029** — `tests/unit/invariants.test.ts`: NI-004 fixture coverage —
  `src/adapters/memory-utilization/index.ts` and
  `src/crosslayer/rule-survival.ts` must report zero violations (both
  contain a `"Promise.all"` comment substring near a real `.chat(` site);
  two direct helper-function unit assertions (not filesystem-walked)
  proving the quote-aware stripper leaves real code after an in-string
  `//` intact, and the paren-balance walk is not desynced by an unbalanced
  `(` inside a string argument.
- **T030** — `tests/unit/invariants.test.ts`: `fixtures/cassettes/` size
  lint — `readdirSync` walk summing `statSync(...).size`, 2 MiB threshold,
  folded into the same combined timer (FR-021/D7).
- **T031** — `fixtures/cassettes/discrimination-control/index.json` +
  `rigged-case.json`: committed, git-tracked cassette whose recorded
  responses are rigged to flunk the graders, authored using WP03's
  decorator record mode against a scripted mock `ChatClient` (D7/FR-019).
- **T032** — `tests/cassette/discrimination-control.test.ts`: FR-019 —
  `behave run --cassette fixtures/cassettes/discrimination-control
  --replay` produces a failing verdict (Scenario 14); a second assertion
  with the graders stubbed/bypassed proves the control itself then fails,
  i.e. is load-bearing.
- **T033** — `tests/cassette/store.test.ts` (extends WP03's file): FR-020 —
  record against an endpoint whose configured base URL contains a
  credential-shaped fake token
  (`https://fake-token-abc123@api.example.com/v1`); assert the persisted
  cassette files contain no API key value, no `apiKeyEnv` value, and no
  full endpoint URL, hostname only (Scenario 3).
- **T034** — `tests/behavioral/runner.test.ts` (extends WP04's file):
  FR-022 — `personaPrompt` (`src/core/behavioral/runner.ts`) purity guard,
  asserting its source reads none of `Date`, `Math.random`, `process.env`.
- **T035** — WP05 verification gate.

T028/T029/T030 all edit the same file, `tests/unit/invariants.test.ts` (and
T028/T030 both fold into the same combined timer variable), so none of the
three carries a `[P]` marker — same-file edits are never `[P]` regardless of
whether they share a data dependency. They have no data dependency on each
other or on WP03/WP04's specific output, so an implementer may sequence
them in any order within WP05, but they must still be applied one at a time
to the shared file.

## Dependencies

WP03 (the discrimination-control fixture, T031, is authored using WP03's
decorator in record mode against a scripted mock client, then committed as
static JSON — not generated at test-run time; T033 extends WP03's
`store.test.ts`). WP04 (T032's stronger, representative assertion drives
the fixture through `behave run --cassette ... --replay`, exercising the
full CLI path rather than a bare `readCassetteCase` + grader call; T034
extends `tests/behavioral/runner.test.ts`, which already exists pre-mission
and is first extended by WP04 (T026's stale-propagation test), then further
extended by WP05 (T034's `personaPrompt` purity guard)).

## Parallel

None — all of T028-T035 wait for Phase 3 to start, since this WP's other
tasks (T031-T034) require WP03 and WP04 to be merged first, and splitting
T028-T030 into an earlier phase would fragment one `invariants.test.ts`
edit across two WPs for no net parallelism gain (the file has one owner,
WP05, for the whole mission).

## Risks

A naive same-file/co-occurrence substring scan (matching NI-002/NI-003's own
simpler style) would false-positive today on `memory-utilization/index.ts`
and `rule-survival.ts` — both already contain a `"Promise.all"` comment
substring documenting the pattern's *absence* near a real `.chat(` call
site. A comment stripper that is not quote-aware would overcorrect the
other way, deleting real code following an in-string `//` (e.g.
`baseUrl: "mock://test",`). T028 must implement the full quote-aware-strip
+ paren-balanced-enclosure algorithm from plan.md's "NI-004 design"
section, not a shortcut version — T029's two named fixtures are the
regression proof.

## Independent test

`pnpm test` green; NI-004 reports zero violations against the current tree,
including its two named must-not-false-positive fixtures
(`memory-utilization/index.ts`, `crosslayer/rule-survival.ts`); the
discrimination-control test itself fails when graders are stubbed/bypassed;
the combined invariant suite (NI-001..004 + size lint) stays within its
2000ms budget.
