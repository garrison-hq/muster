# Tasks: Mission-Review Remediation

**Mission**: `mission-review-remediation-01KTT2XH` | **Branch**: planning on `main`, merging to `main`
**Inputs**: spec.md, plan.md (research + CLI contract inlined), parent `mission-review.md`
**Tests**: REQUIRED — charter testing standards; new behavior gets §7.2-citing tests; NFR-001 byte-identity is itself a test gate.

## Subtask Index

| ID | Description | WP | Parallel |
|----|-------------|----|----------|
| T001 | URI-scheme detection in makeFsLoadRef (§7.2 violation, R1 regex) | WP01 | [P] | [D] |
| T002 | Containment option (restrictTo) incl. absolute refs, R2 comparison | WP01 | | [D] |
| T003 | Referenced-document leak sanitization (position kept, no excerpts) | WP01 | | [D] |
| T004 | CLI --restrict-refs [dir] on all four subcommands + cts runner pass-through | WP01 | | [D] |
| T005 | Stream-1 tests: scheme/escape/bare-flag/sanitization/exit codes + NFR-001 byte-identity | WP01 | | [D] |
| T006 | Invariant guards test file (Node-based: secrets, core boundary, fetch isolation) | WP02 | [D] |
| T007 | Guard documentation comment (grep-binary rationale) + perf budget assert | WP02 | | [D] |
| T008 | README "Reference resolution" section (§7.2 MUST: schemes, flag modes, trust model) | WP03 | |
| T009 | README cross-check against built CLI help/error output (SC-004) | WP03 | |

## Phase 1 — Parallel code streams

### WP01 — Reference-Resolution Hardening
**Goal**: Close RISK-1 + RISK-2: honest URI rejection, opt-in containment, no referenced-content leakage — with shipped behavior byte-identical when the flag is absent.
**Priority**: P0 | **Dependencies**: none | **Estimated prompt**: ~280 lines
**Independent test**: hostile `../../` soul rejected under restriction / resolved without; `https://` ref yields §7.2 message; CTS 28/28 byte-identical with flag absent.
- [x] T001 URI-scheme detection (WP01)
- [x] T002 Containment option (WP01)
- [x] T003 Leak sanitization (WP01)
- [x] T004 CLI flag + runner pass-through (WP01)
- [x] T005 Tests incl. NFR-001 byte-identity (WP01)
**Prompt**: [tasks/WP01-reference-hardening.md](tasks/WP01-reference-hardening.md)

### WP02 — Invariant Guards
**Goal**: Close RISK-3: the acceptance matrix's three negative invariants become Node-based tests that run in every `pnpm test` and are immune to grep's binary-file heuristic.
**Priority**: P0 | **Dependencies**: none (parallel with WP01; new file only) | **Estimated prompt**: ~200 lines
**Independent test**: guards pass on clean tree; planting a fake secret / boundary import / stray fetch in a scratch worktree makes the matching guard fail (SC-003, verified at verify time).
- [x] T006 Guards test file (WP02)
- [x] T007 Rationale comment + perf assert (WP02)
**Prompt**: [tasks/WP02-invariant-guards.md](tasks/WP02-invariant-guards.md)

## Phase 2 — Documentation

### WP03 — §7.2 Reference Documentation
**Goal**: Close DRIFT-2: README documents reference resolution (a §7.2 MUST), the new flag's three modes, and the trust model — matching the code WP01 actually shipped.
**Priority**: P1 | **Dependencies**: WP01 | **Estimated prompt**: ~150 lines
**Independent test**: every documented flag mode and error message reproduced verbatim from the built CLI.
- [ ] T008 README section (WP03)
- [ ] T009 Docs-vs-reality cross-check (WP03)
**Prompt**: [tasks/WP03-reference-docs.md](tasks/WP03-reference-docs.md)

## Dependency Graph & Parallelization

```
WP01 ──┬── WP03
WP02 ──┘ (barrier only for WP03's docs accuracy; WP02 itself has no dependents)
```
- WP01 ∥ WP02 from the start (disjoint owned_files — spec C-004).
- WP03 after WP01. MVP = WP01 (the security-relevant half).

## Risks

1. **NFR-001 regression** (WP01): threading an options object through three loadRef call sites could perturb default behavior — the byte-identity test (T005) is the tripwire.
2. **Guard false positives** (WP02): secrets regexes may match legitimate strings (e.g. `sk-` in prose); tune patterns with length/charset anchors and document exclusions inline.
3. **Docs drift** (WP03): mitigated by T009's verbatim cross-check against the built binary.
