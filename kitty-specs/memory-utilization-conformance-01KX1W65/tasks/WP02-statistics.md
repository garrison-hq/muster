---
work_package_id: WP02
title: In-house statistics module
dependencies: []
requirement_refs:
- FR-004
- FR-008
- FR-013
tracker_refs: []
planning_base_branch: chore/spec-kitty-3.2.5-upgrade
merge_target_branch: chore/spec-kitty-3.2.5-upgrade
branch_strategy: Planning artifacts for this mission were generated on chore/spec-kitty-3.2.5-upgrade. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into chore/spec-kitty-3.2.5-upgrade unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-memory-utilization-conformance-01KX1W65
base_commit: 4e99e2f3ac51748ae9ebf0ab763b39a6ffd6156a
created_at: '2026-07-09T00:52:38.145002+00:00'
subtasks:
- T004
- T005
- T006
- T007
- T008
phase: Phase 1 - Foundations
assignee: ''
agent: ''
shell_pid: '1992528'
history:
- timestamp: '2026-07-09T00:00:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: src/core/behavioral/stats/
create_intent:
- src/core/behavioral/stats/proportion-ci.ts
- src/core/behavioral/stats/paired.ts
- src/core/behavioral/stats/power.ts
- src/core/behavioral/stats/passk.ts
- src/core/behavioral/stats/index.ts
execution_mode: code_change
owned_files:
- src/core/behavioral/stats/proportion-ci.ts
- src/core/behavioral/stats/paired.ts
- src/core/behavioral/stats/power.ts
- src/core/behavioral/stats/passk.ts
- src/core/behavioral/stats/index.ts
tags: []
---

# Work Package Prompt: WP02 — In-house statistics module

**Covers**: FR-004, FR-008, FR-013 (the estimator math).
**Owned files**: `src/core/behavioral/stats/{proportion-ci,paired,power,passk,index}.ts` + `tests/**/stats/*` for these.

## Goal

Implement the statistics from `research.md` §4A as **pure, dependency-free** functions with **known-answer** unit tests. No numerical runtime dependency (muster minimal-deps invariant). These are generic (no memory specifics) so they live in core.

## Subtasks

- **T004 — `proportion-ci.ts`**: single-arm pass-rate CI. CLT/Bernoulli `s̄ ± 1.96·√(s̄(1−s̄)/n)`; switch to **Wilson score** (and optionally Clopper–Pearson) near 0/1 or small n. Cite Miller `arXiv:2411.00640`, Brown/Cai/DasGupta 2001.
- **T005 — `paired.ts`**: **McNemar mid-p** test on matched-pairs booleans; **Tango asymptotic-score** (and Newcombe) CI for the paired difference of proportions. Do **not** implement McNemar exact-conditional as the default. Cite Fagerland/Lydersen/Laake 2013/2014.
- **T006 — `power.ts`**: Miller Eq.9 N-sizing `n=(z_{α/2}+z_β)²(ω²+σ²_A/K_A+σ²_B/K_B)/δ²` and Eq.10 MDE inversion; a helper to render a `no-lift` bounded/powered null (CI-excludes-threshold).
- **T007 — `passk.ts`**: the **unbiased disjunctive pass@k** combinatorial estimator (Chen 2021 / openai-human-eval — never the biased `1−(1−p̂)^k`), and muster's **own conjunctive pass^k** estimator (derive a beta-binomial / Bayesian posterior on per-probe success probability; documented in the rubric, WP04).
- **T008 — tests**: every function verified against **hand-computed known answers**; explicit boundary cases (pass-rate 0, 1, tiny n); pass@k requires n≥k (error otherwise).

## Key references
- `research.md` §4A (the full pipeline + citations); `data-model.md` (statistical pipeline).

## Verification
`pnpm build` + `pnpm test` green; known-answer tests pass; boundary coverage; no new runtime dependency in `package.json`.
