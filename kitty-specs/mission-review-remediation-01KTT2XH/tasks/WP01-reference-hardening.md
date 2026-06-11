---
work_package_id: WP01
title: Reference-Resolution Hardening
dependencies: []
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
planning_base_branch: main
merge_target_branch: main
branch_strategy: 'Planning/base branch: main. Completed changes merge into main. Execution worktree allocated per computed lane from lanes.json.'
subtasks:
- T001
- T002
- T003
- T004
- T005
history:
- timestamp: '2026-06-11T02:00:00Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/core/pipeline.ts
execution_mode: code_change
owned_files:
- src/core/pipeline.ts
- src/core/cts/runner.ts
- src/cli/index.ts
- tests/unit/pipeline.test.ts
- tests/unit/cli.test.ts
tags: []
---

# WP01 — Reference-Resolution Hardening

## Objective

Close mission-review RISK-1 and RISK-2 (see `kitty-specs/cts1-conformance-harness-01KTS86B/mission-review.md`): URI-scheme references get an honest §7.2 rejection, reference loading gains opt-in containment, and violations from referenced documents stop echoing source content. Absent the new flag, behavior is **byte-identical** to the shipped release (NFR-001 — this is a hard gate).

## Context

- Plan: `kitty-specs/mission-review-remediation-01KTT2XH/plan.md` — R1/R2 decisions and the CLI contract are normative; implement them exactly.
- Current code: `src/core/pipeline.ts:239-257` (`makeFsLoadRef`), `src/core/cts/runner.ts:223` (its own loadRef construction), `src/cli/index.ts:107` (CLI loadRef). NOTE: source files contain `§` characters — GNU grep needs `-a`; prefer reading files directly.
- Spec FRs: FR-001 (scheme), FR-002 (containment), FR-003 (CLI flag), FR-004 (sanitization). Charter directive 3: new tests cite §7.2.

## Implementation command

```bash
spec-kitty agent action implement WP01 --agent <name>
```

## Subtasks

### T001 — URI-scheme detection (`src/core/pipeline.ts`)

1. In `makeFsLoadRef`'s returned loader, before any path resolution: if `/^[a-z][a-z0-9+.-]*:\/\//i.test(ref)` return `[{path: "composition", message: 'URI reference schemes are not supported by muster (this pass): "<ref>" — use a relative or absolute file path', severity: "error", section: "§7.2"}]`.
2. The `//` requirement is deliberate: `a:b/c.md` must continue to resolve as a relative path (spec edge case). Windows drive letters are out of scope (Linux/macOS targets per charter).

**Validation**: `https://x/y.md`, `file:///y.md`, `HTTPS://x` rejected; `a:b/c.md`, `./x.md`, `/abs/x.md` unaffected.

### T002 — Containment (`src/core/pipeline.ts`)

1. Signature: `makeFsLoadRef(parseFn: ParseFn, opts?: { restrictTo?: string }): LoadRef`. Optional second arg → zero call-site churn for existing users.
2. After computing `target`: when `opts.restrictTo` is set, resolve both to absolute; `const rel = relative(restrictTo, target)`; reject when `rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)` with `[{path: "composition", message: 'reference "<ref>" escapes the restricted base directory', severity: "error"}]`. Applies to absolute refs too (FR-002).
3. Lexical comparison only; document symlink non-handling in a short comment (spec assumption).

**Validation**: `../../outside.md` rejected when restricted, loads (or ENOENTs normally) when not; a ref resolving exactly inside the base allowed; sibling-dir false-positive case (`/a/bc` vs base `/a/b`) allowed.

### T003 — Leak sanitization (`src/core/pipeline.ts`)

1. Audit what `parseFn(raw, target)` violations contain for a referenced document that fails Soul-YAML parsing (the `yaml` library's error messages can embed source excerpts/code frames).
2. In `makeFsLoadRef` (NOT in the parse layer — keep WP02-era files untouched): post-process violations returned by `parseFn` to strip excerpt content — keep `path`, `section`, and the message's first line up to any embedded newline; append `(line/column preserved where available; source excerpt withheld for referenced documents)` only when something was actually stripped.
3. Root-document parsing (via `checkSoul` directly) is unchanged — authors debugging their own file keep full errors; only *referenced* documents are sanitized (the untrusted-input surface).

**Validation**: referenced file with a YAML error containing a distinctive marker string in its content → marker absent from the report; line/col still present; root-document errors unchanged.

### T004 — CLI flag + runner pass-through (`src/cli/index.ts`, `src/core/cts/runner.ts`)

1. Add `--restrict-refs [dir]` to check, resolve, `cts run`, `behave run` (plan Phase 1 contract). Commander optional-value: `undefined` absent / `true` bare / `string` value.
2. Mapping: absent → no `restrictTo`; bare → `dirname(resolved root soul path)`; value → `resolvePath(value)`. For `cts run`, bare means each case's root soul directory — thread an option into `runCts` so `runner.ts:223` constructs its loadRef with the right base per case (signature: optional field on its existing opts object).
3. Help text documents the three modes in one line each.

**Validation**: all three modes per command; exit codes unchanged (escape/URI violations → 1).

### T005 — Tests (`tests/unit/pipeline.test.ts`, `tests/unit/cli.test.ts`)

- [ ] "§7.2 URI scheme rejected" (https/file/case-insensitive) + "§7.2 scheme-less colon path still resolves"
- [ ] containment: escape rejected / unrestricted allowed / boundary-inside allowed / absolute-ref contained / sibling-dir not falsely blocked
- [ ] sanitization: marker-string test from T003
- [ ] CLI: three flag modes on `check`; `cts run --restrict-refs` (bare) over a tmp manifest; exit codes
- [ ] **NFR-001 byte-identity**: run `resolve --output-format canonical-json` (in-process `runCli`) against `cts/fixtures/minimal/valid/Soul.md` and one composition fixture with NO flag — outputs byte-equal to the same call's output recorded before your changes (capture via git stash or assert equality against `expected.json` fixtures, which encode pre-change bytes)
- [ ] full CTS suite still 28/28 (`tests/cts/suite.test.ts` untouched and green)

## Definition of Done

- `pnpm build` + `pnpm test` green; CTS 28/28; no new deps; only the five owned files (+ pnpm-lock untouched) modified.
- Every new test cites §7.2 or names the FR it covers.
- Default-path code review shows the options object is genuinely optional (no behavior change when absent).

## Reviewer guidance

- THE check: NFR-001. Diff the default code path before/after — any change in violation text, ordering, or canonical bytes for existing fixtures is a blocker.
- Verify containment applies to absolute refs (easy to miss — `isAbsolute(ref) ? ref : ...` short-circuits before the check if written naively).
- Verify sanitization triggers only for referenced documents, not the root.

## Risks

- Commander optional-value flags have quirky `true`-vs-string typing — test all three modes explicitly rather than trusting types.
