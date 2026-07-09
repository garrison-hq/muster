---
work_package_id: WP03
title: Learning-lift adapter (3-arm orchestration + verdict + controls)
dependencies:
- WP01
- WP02
requirement_refs:
- FR-001
- FR-002
- FR-004
- FR-005
- FR-006
- FR-007
- FR-009
- FR-010
tracker_refs: []
planning_base_branch: chore/spec-kitty-3.2.5-upgrade
merge_target_branch: chore/spec-kitty-3.2.5-upgrade
branch_strategy: Planning artifacts for this mission were generated on chore/spec-kitty-3.2.5-upgrade. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into chore/spec-kitty-3.2.5-upgrade unless the human explicitly redirects the landing branch.
subtasks:
- T009
- T010
- T011
- T012
- T013
phase: Phase 2 - Adapter + rubric
assignee: ''
agent: ''
history:
- timestamp: '2026-07-09T00:00:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: src/adapters/memory-utilization/
create_intent:
- src/adapters/memory-utilization/index.ts
- src/adapters/memory-utilization/manifest.ts
- src/adapters/memory-utilization/fixture.ts
- src/adapters/memory-utilization/contamination.ts
- src/adapters/memory-utilization/verdict.ts
- src/adapters/memory-utilization/controls.ts
execution_mode: code_change
owned_files:
- src/adapters/memory-utilization/index.ts
- src/adapters/memory-utilization/manifest.ts
- src/adapters/memory-utilization/fixture.ts
- src/adapters/memory-utilization/contamination.ts
- src/adapters/memory-utilization/verdict.ts
- src/adapters/memory-utilization/controls.ts
tags: []
---

# Work Package Prompt: WP03 — Learning-lift adapter

**Covers**: FR-001, FR-002, FR-004 (wiring), FR-005, FR-006, FR-007, FR-009, FR-010.
**Owned files**: `src/adapters/memory-utilization/{index,manifest,fixture,contamination,verdict,controls}.ts` + `tests/adapters/memory-utilization/*`. (Reuses `src/crosslayer/rule-survival.ts` and the WP01/WP02 outputs read-only; the CLI subcommand is WP06.)

## Goal

The adapter behind muster's boundary. It stages the memory fixture in three variants and measures a paired lift — never operating the agent (C-002).

## Subtasks

- **T009 — `manifest.ts` + `fixture.ts`**: case schema `{ id, memory fixture ref, probes[], arms, N, thresholds }`; load the `real`/`none`/`scrambled` variants (reuse the Memory adapter parser for `MEMORY.md`/`USER.md`); a deterministic **scrambler** that replaces facts with plausible-but-irrelevant ones.
- **T010 — `index.ts`**: `run()` — orchestrate the 3 arms by reusing/parameterizing `crosslayer/rule-survival` (condition A/B = no-memory/with-memory), running N samples per probe per arm; **retain per-probe paired outcomes** (WP01); compute the paired delta/CI/significance via WP02.
- **T011 — `contamination.ts` + `verdict.ts`**: closed-book gate (a probe answerable in the no-memory arm above a rubric threshold is flagged contaminated); `LiftMeasurement`→`LiftVerdict` (`lift-confirmed | no-lift | contaminated | baseline-invalid`) with the `BASELINE_THRESHOLD` validity guard.
- **T012 — `controls.ts`**: the **scrambled-memory negative control** (a significant lift on scrambled memory fails the suite); a rigged-impossible **cap-of-zero** control per grader; the **all-refuse guard**.
- **T013 — integration tests**: scripted mock `ChatClient` producing each outcome — `lift-confirmed`, `no-lift`, `contaminated`, `baseline-invalid`; the scrambled control and cap-of-zero fail as designed; **errored run counts as failed** (FR-009).

## Key references
- `spec.md` FR-001..FR-010; `data-model.md` (flow); `research.md` §3 (rule-survival reuse), §4A.
- Existing: `src/crosslayer/rule-survival.ts`, `src/core/behavioral/*`, `src/adapters/memory/`.

## Verification
`pnpm build` + `pnpm test` green; the four verdicts and all controls covered; no modification to the spec-agnostic core beyond WP01's additive changes.
