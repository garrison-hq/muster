---
work_package_id: WP02
title: Execution-source resolver
dependencies: []
requirement_refs:
- FR-018
tracker_refs: []
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this mission were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T005
- T006
- T007
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

# Work Package Prompt: WP02 – Execution-source resolver

## Goal

Ship `resolveExecutionSource` from core with its own full test suite,
reproducing FR-018's five-branch precedence table exactly (including the
deprecated `MUSTER_BASE_URL` alias and `skills/trigger.ts`'s canonical-wins-
silently behavior). Consumed by no call site in this mission (C-005) —
wave-2 (#100/#101/#102) wires it later.

Priority: P2 · Estimated prompt size: ~120 lines.

## Owned files

- `src/core/execution-source.ts`
- `tests/unit/execution-source.test.ts`

## Subtasks

- **T005** — `src/core/execution-source.ts`: `resolveExecutionSource(input)`
  — 5-branch precedence (cassette-replay > `MUSTER_ENDPOINT` > deprecated
  `MUSTER_BASE_URL` alias > manifest-endpoint-block > none) per FR-018's
  contract. [P]
- **T006** — `tests/unit/execution-source.test.ts`: one test per precedence
  branch, plus the two falsification cases (`MUSTER_BASE_URL` alone →
  `usedDeprecatedAlias: true`; both env vars set → `MUSTER_ENDPOINT` wins
  silently, matching `skills/trigger.ts`'s `resolveEndpointBaseUrl`).
- **T007** — WP02 verification gate.

## Dependencies

None.

## Parallel

[P] with WP01 and WP03.

## Risks

None material — fully specified precedence table in spec.md FR-018; the only
care needed is reproducing `skills/trigger.ts:91-101`'s existing precedence
exactly rather than inventing a new one.

## Independent test

`pnpm test` green; every branch of the precedence table has its own passing
test case; the two falsification cases pass.

Independent test note: T005 needs no other WP's output — it is a pure
function over `{ env?, cassetteReplayConfigured?, manifestHasEndpointBlock? }`
with no I/O and no adapter knowledge.
