---
work_package_id: WP01
title: 'Core additive: pass-rate surfacing + paired-outcome retention'
dependencies: []
requirement_refs:
- FR-003
tracker_refs: []
planning_base_branch: chore/spec-kitty-3.2.5-upgrade
merge_target_branch: chore/spec-kitty-3.2.5-upgrade
branch_strategy: Planning artifacts for this mission were generated on chore/spec-kitty-3.2.5-upgrade. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into chore/spec-kitty-3.2.5-upgrade unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-memory-utilization-conformance-01KX1W65
base_commit: 4e99e2f3ac51748ae9ebf0ab763b39a6ffd6156a
created_at: '2026-07-09T00:39:48.024064+00:00'
subtasks:
- T001
- T002
- T003
phase: Phase 1 - Foundations
assignee: ''
agent: "claude"
shell_pid: '1956086'
history:
- timestamp: '2026-07-09T00:00:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: src/core/behavioral/
create_intent: []
execution_mode: code_change
owned_files:
- src/core/behavioral/types.ts
- src/core/behavioral/runner.ts
tags: []
---

# Work Package Prompt: WP01 — Core additive (pass-rate surfacing + paired-outcome retention)

**Covers**: FR-003; supports C-005, C-006.
**Owned files**: `src/core/behavioral/types.ts`, `src/core/behavioral/report.ts`, and the corresponding tests (`tests/behavioral/*` additions for these changes only).

## Goal

The behavioral layer computes `computePassRate` internally then collapses it to a boolean before reporting (see `research.md` §3). A paired lift needs the number, and the per-probe outcome under each arm. Add both **additively** — no existing behavioral verdict, aggregation, or output byte may change.

## Subtasks

- **T001** — In `src/core/behavioral/types.ts`, add additive fields: a continuous `passRate` (0..1) alongside the existing boolean on `CaseVerdict`/`RunVerdict`, and a `PairedOutcome` shape (`{ probeId, perArmScore }`) usable by callers. Do not remove or rename existing fields.
- **T002** — In `src/core/behavioral/report.ts`, surface the continuous pass-rate in the emitted report without altering existing fields/ordering (append-only). Keep the boolean verdict authoritative for exit codes.
- **T003** — Tests: (a) the continuous pass-rate is exposed and equals `passCount/total`; (b) **regression** — existing behavioral/CTS suites produce byte-identical reports for the pre-existing fields (snapshot compare); (c) errored run still contributes a failed outcome.

## Key references
- `research.md` §3 (prerequisites); `data-model.md` (`ProbeRun`, `PairedOutcome`).
- Existing: `src/core/behavioral/{types.ts,report.ts,pass-k.ts}`.

## Verification
`pnpm build` (tsc strict) + `pnpm test` green; snapshot diff confirms no change to existing report bytes; new fields covered by unit tests.

## Activity Log

- 2026-07-09T01:18:32Z – claude – shell_pid=1956086 – Moved to for_review
