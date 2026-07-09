---
work_package_id: WP04
title: Published rubric + citation wiring
dependencies:
- WP02
requirement_refs:
- FR-011
- FR-012
- FR-013
tracker_refs: []
planning_base_branch: chore/spec-kitty-3.2.5-upgrade
merge_target_branch: chore/spec-kitty-3.2.5-upgrade
branch_strategy: Planning artifacts for this mission were generated on chore/spec-kitty-3.2.5-upgrade. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into chore/spec-kitty-3.2.5-upgrade unless the human explicitly redirects the landing branch.
subtasks:
- T014
- T015
- T016
phase: Phase 2 - Adapter + rubric
assignee: ''
agent: ''
history:
- timestamp: '2026-07-09T00:00:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: docs/rubric/
create_intent:
- docs/rubric/memory-utilization-taxonomy.md
- src/adapters/memory-utilization/rubric.ts
execution_mode: code_change
owned_files:
- docs/rubric/memory-utilization-taxonomy.md
- src/adapters/memory-utilization/rubric.ts
tags: []
---

# Work Package Prompt: WP04 — Published rubric + citation wiring

**Covers**: FR-011, FR-012 (citations), FR-013.
**Owned files**: `docs/rubric/memory-utilization-taxonomy.md` + the citation-wiring edits within the adapter's report path that are not owned by WP03 (coordinate: WP04 adds the `rubricCitation` values; WP03 provides the emit hook).

## Goal

muster's cite-a-source rule has no upstream normative standard here (C-003), so muster **publishes its own rubric** as the source of record, anchored to the cited conventions/research.

## Subtasks

- **T014 — author `docs/rubric/memory-utilization-taxonomy.md`**: the **learning-lift definition** (paired delta beating noise + surviving scrambled + closed-book controls + abstention); the **estimator/CI/paired-test** choices with citations (Miller, Fagerland, Chen); **muster's own conjunctive `pass^k`** estimator (state the beta-binomial/Bayesian derivation from WP02); and the **judge-bias reasoning** — the same judge grades both arms so verbosity/self-enhancement/miscalibration are common-mode and cancel in the paired delta, while position/order bias does not, hence **arm-order blinding**. Each rubric section carries a stable clause id (e.g. `§2.1`).
- **T015 — citation wiring**: every emitted check references its rubric clause (`rubricCitation`), mirroring the Memory adapter's `RUBRIC_CITATION` pattern; implement the judge **arm-order blinding/randomization** at the grading call site.
- **T016 — tests**: every emitted finding carries a resolvable rubric citation; a test asserts the judge cannot see arm identity/order.

## Key references
- `research.md` §2.2 (no normative standard), §4A (methods + the two rubric-owned gaps); `spec.md` FR-011..FR-013, C-003.
- Existing rubric pattern: `docs/rubric/sop-rule-taxonomy.md`.

## Verification
`pnpm build` + `pnpm test` green; rubric doc present and cited by every check; blinding test passes.
