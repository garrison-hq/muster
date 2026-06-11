---
work_package_id: WP03
title: §7.2 Reference Documentation
dependencies:
- WP01
requirement_refs:
- FR-006
planning_base_branch: main
merge_target_branch: main
branch_strategy: 'Planning/base branch: main. Completed changes merge into main. Execution worktree allocated per computed lane from lanes.json.'
subtasks:
- T008
- T009
history:
- timestamp: '2026-06-11T02:00:00Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: README.md
execution_mode: code_change
owned_files:
- README.md
tags: []
---

# WP03 — §7.2 Reference Documentation

## Objective

Close mission-review DRIFT-2: RFC-1 §7.2 makes documenting supported reference schemes a **MUST**, and the parent mission's spec promised it. Add a "Reference resolution" README section describing what WP01 actually shipped — verified against the built binary, not memory.

## Context

- Depends on WP01 (merged into your lane before you start — confirm `--restrict-refs` exists in `muster check --help` before writing a word).
- Spec FR-006, SC-004. Vendored spec §7.2 (`.kittify/reference/soul-spec.md`) is the normative anchor — quote its MUST.
- Mission-review RISK-1 analysis supplies the trust-model framing.

## Implementation command

```bash
spec-kitty agent action implement WP03 --agent <name>
```

## Subtasks

### T008 — README section

Add a `## Reference resolution` section (place after the existing CTS/fixture material):
1. **Supported schemes** (§7.2): relative paths (resolved against the referencing file's directory) and absolute paths (used verbatim). State this satisfies §7.2's "Runtimes MUST document which reference schemes they support."
2. **URI schemes** (`https://`, `file://`, …): unsupported this pass — show the actual error message verbatim.
3. **`--restrict-refs [dir]`**: the three modes (absent = unrestricted; bare = root soul's directory, per-case for `cts run`; with value = given directory), each one line, plus the escape error verbatim.
4. **Trust model** (one short paragraph): souls you authored need nothing; souls from elsewhere should be checked with `--restrict-refs` because references may read any file you can read; symlinks are not resolved by the containment check.

### T009 — Docs-vs-reality cross-check

1. `pnpm build`; run `node dist/cli/index.js check --help` and capture the flag's help line — README wording must match.
2. Reproduce both error messages live (a `/tmp` soul with `https://` extends; a `/tmp` escape attempt under `--restrict-refs`) and paste them verbatim into the section.
3. Confirm no other README claims went stale (the threshold table, command list — read the diff-adjacent sections).

## Definition of Done

- README is the only file touched; every quoted message/flag line reproduced from the built CLI (SC-004).
- §7.2 explicitly cited; trust-model paragraph present.

## Reviewer guidance

- Run the documented commands yourself; any deviation between README text and observed output is a major.
- Check the section doesn't contradict the existing "Endpoint setup" docs.

## Risks

- WP01's final message strings may differ from the plan's draft wording — that is exactly why this WP depends on WP01 and quotes the binary, not the plan.
