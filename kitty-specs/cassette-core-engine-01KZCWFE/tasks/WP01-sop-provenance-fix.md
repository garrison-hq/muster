---
work_package_id: WP01
title: 'SOP transcript provenance fix (closes #90)'
dependencies: []
requirement_refs:
- FR-001
tracker_refs: []
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this mission were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T001
- T002
- T003
- T004
phase: Phase 1 — Independent foundations (WP01, WP02, WP03 — genuinely parallel)
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

# Work Package Prompt: WP01 – SOP transcript provenance fix (closes #90)

## Goal

Stamp `Transcript.model`/`baseUrl`/`durationMs` from real, measured values at all
three sites in `src/adapters/openclaw-sop/runner.ts` that currently hardcode
`"mock"`/`"mock://test"`/`0`, and thread the real endpoint identity through
`buildSopClient`/`doSopRun`. This lands first per spec.md's own mandate
("recording is meaningless while the thing being recorded lies about its own
provenance") even though it has no technical dependency on anything else in
this mission.

Priority: P1 · Estimated prompt size: ~150 lines.

## Owned files

- `src/adapters/openclaw-sop/runner.ts`
- the `doSopRun`/`buildSopClient` region of `src/cli/index.ts` (~L1615-1686)
- `tests/adapters/openclaw-sop/runner.test.ts`

## Subtasks

- **T001** — `src/adapters/openclaw-sop/runner.ts`: `SuiteRunOptions` gains
  `model`/`baseUrl`; `runProbeOnce` times its client-call loop and stamps real
  `model`/`baseUrl` (via `hostnameOf`) instead of `"mock"`/`"mock://test"`/`0`
  at all three sites (~L191-194, ~L351-354, ~L424-427). [P]
- **T002** — `src/cli/index.ts`: `doSopRun`/`buildSopClient` (~L1615-1686)
  thread `{model, baseUrl}` through to the suite runner; the
  `"unconfigured"`/`"unconfigured://no-endpoint"` sentinel is used only when
  no endpoint is configured.
- **T003** — `tests/adapters/openclaw-sop/runner.test.ts`: Scenario 15 — mock
  client with a deliberate ≥5ms async delay, assert `durationMs >= 5`, real
  `model`/hostname-only `baseUrl` asserted, no `"mock"` literal remains at any
  of the three sites.
- **T004** — WP01 verification gate: `pnpm test` and `tsc --noEmit` green.

T001 and T002 are sequential within the WP (T002 needs the widened
`SuiteRunOptions` T001 introduces).

## Dependencies

None.

## Parallel

[P] with WP02 and WP03 — disjoint files, no shared types.

## Risks

Every existing mock `ChatClient` factory in
`tests/adapters/openclaw-sop/runner.test.ts` (`makeMockClient`,
`makeConstantClient`, `makeRunVaryingJudgeClient`, `makeErrorClient`) resolves
synchronously — a test that only asserts `durationMs` is a number would pass
on a fast machine even with the old `0` literal. T003 MUST introduce a
deliberate `await new Promise((r) => setTimeout(r, 5))` delay and assert
`durationMs >= 5`, not merely that the field is defined.

## Independent test

`pnpm test` green; `grep -n '"mock"' src/adapters/openclaw-sop/runner.ts`
returns no hits; Scenario 15's delayed-mock-client test fails if the
`durationMs: 0` literal is reintroduced.
