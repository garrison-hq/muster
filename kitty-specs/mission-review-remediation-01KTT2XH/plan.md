# Implementation Plan: Mission-Review Remediation

**Branch**: `main` | **Date**: 2026-06-11 | **Spec**: [spec.md](spec.md)
**Input**: `kitty-specs/mission-review-remediation-01KTT2XH/spec.md` + parent mission-review findings

## Summary

Three small, sharply-scoped work streams against the merged muster codebase: (1) reference-resolution hardening in `makeFsLoadRef` + CLI (URI-scheme rejection, opt-in containment, referenced-document leak sanitization — RISK-1/RISK-2); (2) Node-based invariant guard tests codifying the acceptance matrix's negative invariants (RISK-3); (3) the §7.2 reference-resolution README section + trust model (DRIFT-2). Streams 1 and 2 own disjoint files and run in parallel isolated worktrees; stream 3 documents stream 1's final behavior and lands after it.

## Technical Context

**Language/Toolchain**: inherited unchanged — TypeScript strict, Node 22, pnpm, Vitest (charter; spec C-003). No new dependencies (NFR-003).
**Change surface**:
- Stream 1: `src/core/pipeline.ts` (`makeFsLoadRef` gains `opts {restrictTo?}` + scheme sniff), `src/core/cts/runner.ts` (options pass-through at its loadRef construction, `runner.ts:223`), `src/cli/index.ts` (`--restrict-refs [dir]` on check/resolve/cts run/behave run), `tests/unit/pipeline.test.ts`, `tests/unit/cli.test.ts`.
- Stream 2: `tests/unit/invariants.test.ts` (new file only).
- Stream 3: `README.md` only.
**Key design points**:
- Scheme detection: `/^[a-z][a-z0-9+.-]*:\/\//i` — requires `//`, so `a:b/c.md` stays a valid relative path (spec edge case). Violation `section: "§7.2"`.
- Containment check: resolve target, then `relative(restrictTo, target)` must not start with `..` (and not be absolute); applies to absolute refs too. Lexical only — symlinks documented out of scope (spec assumption).
- Leak sanitization: when a referenced document's parse yields violations, never surface raw source excerpts; keep path + line/col. Fix at the loadRef/violation-assembly layer in pipeline.ts so the WP02-era parse layer stays untouched.
- CLI flag: Commander optional-value flag (`--restrict-refs [dir]`); bare → `dirname(root soul)`; `cts run` bare → per-case root dir.
- Invariant guards walk files via Node `fs` (no grep — RFC-section `§` characters make GNU grep classify sources as binary): secrets patterns (`nvapi-[A-Za-z0-9]{8}`, `sk-[A-Za-z0-9_-]{20}`), core→adapter import scan over every `src/core/**/*.ts`, fetch isolation (`fetch(` only in the behavioral client). Guard self-test (SC-003) performed at verify time in a scratch worktree, not as a committed test.
**Performance**: suite stays < 10 s; guards < 2 s.

## Charter Check

| Gate | Status |
|---|---|
| Stack/toolchain unchanged, no new deps | PASS |
| Directive 2 (spec→plan→tasks before code) | PASS — this document precedes implementation |
| Directive 3 (RFC-1 citations in tests) | PASS — §7.2 citations specified for stream 1 tests |
| Directive 4 (parent locked constraints untouched) | PASS — opt-in flag; NFR-001 byte-identity gate proves it |
| Directive 5 (no credentials) | PASS — stream 2 strengthens enforcement |

No violations; Complexity Tracking empty.

## Project Structure (delta only)

```
src/core/pipeline.ts          # modified (stream 1)
src/core/cts/runner.ts        # modified, minimal pass-through (stream 1)
src/cli/index.ts              # modified (stream 1)
tests/unit/pipeline.test.ts   # modified (stream 1)
tests/unit/cli.test.ts        # modified (stream 1)
tests/unit/invariants.test.ts # NEW (stream 2)
README.md                     # modified (stream 3)
```

## Phase 0 — Research (3 decisions)

- **R1 — Commander optional-value flag**: `.option("--restrict-refs [dir]")` yields `true` (bare) | string | undefined — exactly the three modes FR-003 needs. Two separate flags rejected: worse UX for one concept.
- **R2 — Containment comparison**: both paths absolute-resolved, then `path.relative(base, target)` must not start with `..` nor be absolute. `target.startsWith(base)` rejected: false positives on sibling directories (`/a/bc` vs `/a/b`).
- **R3 — Guard file walking**: recursive `readdirSync` with exclusion set (`node_modules`, `.git`, `dist`, `.worktrees`, `.kittify`); `kitty-specs/` excluded from the secrets guard only (historical planning text), while the boundary and fetch guards scan their natural domains (`src/`, `tests/`). `git ls-files` subprocess rejected: subprocess in tests adds flake surface.

## Phase 1 — Contract (CLI delta)

`--restrict-refs [dir]` on all four subcommands:
- absent → unrestricted (shipped behavior; byte-identical outputs — NFR-001)
- bare → base = root soul file's directory (per-case root for `cts run`)
- with value → base = given directory (resolved from cwd)
- Escape violation: `{path: "composition", message: 'reference "<ref>" escapes the restricted base directory', severity: "error"}`
- URI violation: `{path: "composition", message: 'URI reference schemes are not supported by muster (this pass): "<ref>" — use a relative or absolute file path', severity: "error", section: "§7.2"}`
- Exit codes unchanged (violations → 1; flag misuse → 2).

No data-model or quickstart deltas — entities live in spec.md Key Entities; the README section *is* the user-facing doc deliverable (FR-006).

## Execution & Parallelization (feeds /spec-kitty.tasks)

- **WP-A (stream 1)** ∥ **WP-B (stream 2)** — disjoint owned_files, parallel isolated worktrees (spec C-004).
- **WP-C (stream 3)** depends on WP-A (documents its final behavior).
- Per-WP discipline: implement → independent review → live-execution verify (SC-001/SC-003/SC-004 are explicitly live checks) → fix loop.
