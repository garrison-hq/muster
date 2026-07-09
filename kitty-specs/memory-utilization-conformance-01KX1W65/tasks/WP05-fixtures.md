---
work_package_id: WP05
title: Fixtures + probe corpus + runnable example
dependencies:
- WP03
requirement_refs:
- FR-014
tracker_refs: []
planning_base_branch: chore/spec-kitty-3.2.5-upgrade
merge_target_branch: chore/spec-kitty-3.2.5-upgrade
branch_strategy: Planning artifacts for this mission were generated on chore/spec-kitty-3.2.5-upgrade. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into chore/spec-kitty-3.2.5-upgrade unless the human explicitly redirects the landing branch.
subtasks:
- T017
- T018
- T019
phase: Phase 3 - Fixtures, CLI, gates
assignee: ''
agent: ''
shell_pid: '2156193'
history:
- timestamp: '2026-07-09T00:00:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: tests/fixtures/memory-utilization/
create_intent:
- tests/fixtures/memory-utilization/
- examples/memory-utilization/
execution_mode: code_change
owned_files:
- tests/fixtures/memory-utilization/
- examples/memory-utilization/
tags: []
---

# Work Package Prompt: WP05 — Fixtures + probe corpus + example

**Covers**: FR-014; C-004.
**Owned files**: `tests/fixtures/memory-utilization/**`, `examples/memory-utilization/**`.

## Goal

A candidate upstream conformance suite: a declared memory fixture with the three variants, a **contamination-clean** probe set (each probe must fail closed-book), abstention probes, and a runnable example.

## Subtasks

- **T017 — fixtures**: `tests/fixtures/memory-utilization/` with a `MEMORY.md`/`USER.md` memory fixture; a `scrambled/` variant (irrelevant plausible facts); a probe set whose answers **require** the memory (verified to fail in the no-memory arm); and abstention probes (declared-unanswerable).
- **T018 — corpus licensing**: if any external probe/contamination corpus is vendored, retain `LICENSE` + `CITATION.md` (MIT/Apache/CC-BY only, per C-004). If none is needed, record that decision in the fixture `README`.
- **T019 — example**: `examples/memory-utilization/` — a self-contained memory fixture + manifest that the CLI (WP06) runs, mirroring `examples/memory/`.

## Key references
- `research.md` §2.3 (LongMemEval abilities incl. abstention; LoCoMo fixture design), §2.4 (contamination gate); `spec.md` FR-014, C-004.
- Existing: `examples/memory/`, `tests/fixtures/memory/`.

## Verification
Fixtures load; every probe fails closed-book (contamination-clean) under the WP03 gate; the example runs end-to-end via the CLI; licenses verified.
