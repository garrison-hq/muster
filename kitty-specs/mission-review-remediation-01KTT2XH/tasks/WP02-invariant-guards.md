---
work_package_id: WP02
title: Invariant Guards
dependencies: []
requirement_refs:
- FR-005
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-mission-review-remediation-01KTT2XH
base_commit: 4f772b7ca9df1f863d461cab3888975c9759afdd
created_at: '2026-06-11T01:04:30.609501+00:00'
subtasks:
- T006
- T007
shell_pid: "1876919"
agent: "claude"
history:
- timestamp: '2026-06-11T02:00:00Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: tests/unit/invariants.test.ts
execution_mode: code_change
owned_files:
- tests/unit/invariants.test.ts
tags: []
---

# WP02 — Invariant Guards

## Objective

Close mission-review RISK-3: the parent mission's acceptance-matrix negative invariants (NI-001 no secrets, NI-002 core/adapter boundary, NI-003 fetch isolation) become **Node-implemented** Vitest guards running in every `pnpm test`. Node, not grep, because the `§` citation characters make GNU grep classify the sources as binary and silently suppress matches — the precise failure mode that motivated this WP.

## Context

- Plan R3 decision: recursive `readdirSync` walking, no `git ls-files` subprocess.
- Parent artifacts: `kitty-specs/cts1-conformance-harness-01KTS86B/acceptance-matrix.json` (the invariants being codified — read it; do not modify it, it is a historical record).
- New file only — zero overlap with WP01; fully parallel.
- Spec FR-005, NFR-002 (guards < 2 s).

## Implementation command

```bash
spec-kitty agent action implement WP02 --agent <name>
```

## Subtasks

### T006 — Guards (`tests/unit/invariants.test.ts`)

Implement a small `walk(dir, {exclude})` helper (recursive `readdirSync`, exclusion set `node_modules`, `.git`, `dist`, `.worktrees`, `.kittify`), reading files as UTF-8 strings. Resolve the repo root from `import.meta.url`, never cwd. Three describe blocks:

1. **"NI-001 no committed secrets"**: walk the whole repo (additionally excluding `kitty-specs/` — historical planning text legitimately *names* the patterns) and assert no file content matches `/nvapi-[A-Za-z0-9]{8}/` or `/\bsk-[A-Za-z0-9_-]{20}/`. On failure, report file + index, NEVER the matched text (a failing guard must not become the leak).
2. **"NI-002 / C-004 core never imports adapters"**: for every `src/core/**/*.ts`, assert no `import`/`from` statement references `adapters` (match import-statement lines, not comments — simple heuristic: lines starting with `import` or containing `from "` / `from '`). This widens the existing single-file gate in `tests/unit/pipeline.test.ts` (leave that test alone — owned by WP01's files).
3. **"NI-003 fetch isolation"**: across `src/**/*.ts` and `tests/**/*.ts`, `fetch(` occurs only in `src/core/behavioral/client.ts` (string occurrences in stub setups like `stubGlobal("fetch", ...)` don't match `fetch(` — verify and note).

### T007 — Rationale + perf

1. File-header doc comment: why Node instead of grep (the binary-classification gotcha, citing mission-review RISK-3), and that these guards operationalize the parent mission's acceptance-matrix negative invariants.
2. A timing assertion around the three guards combined: `expect(elapsedMs).toBeLessThan(2000)` (NFR-002).

## Definition of Done

- `pnpm test` green with the new file included; guards demonstrably pass on the clean tree.
- Only `tests/unit/invariants.test.ts` created; nothing else touched.
- Failure output reviewed for leak-safety (NI-001 failure shows location, not content).

## Reviewer guidance

- Adversarial check (SC-003, do this in your own scratch copy, not committed): plant `nvapi-XXXXXXXX`-shaped text in a tracked file → guard 1 fails; add `import { x } from "../adapters/rfc1/index.js"` to a core file → guard 2 fails; add `fetch(` to a test → guard 3 fails. All three must trip.
- Check the walker doesn't follow symlinks (readdirSync withFileTypes; skip symlinks) — `.worktrees` may reappear during parallel WP01 execution.

## Risks

- Pattern false positives in prose (e.g. "sk-" in documentation): the 20-char charset anchor handles it; if a legitimate hit appears, tighten the pattern rather than excluding the file, and document why inline.

## Activity Log

- 2026-06-11T01:04:30Z – claude – shell_pid=1833582 – Assigned agent via action command
- 2026-06-11T01:09:40Z – claude – shell_pid=1833582 – Ready for review: invariant guards implemented in tests/unit/invariants.test.ts; full suite 531 green incl. base 519 and CTS; SC-003 adversarial checks all trip; guards run in <50ms (NFR-002 budget 2s)
- 2026-06-11T01:10:17Z – claude – shell_pid=1876919 – Started review via action command
