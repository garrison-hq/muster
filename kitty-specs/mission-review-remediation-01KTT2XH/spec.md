# Feature Specification: Mission-Review Remediation

**Mission**: `mission-review-remediation-01KTT2XH`
**Created**: 2026-06-11
**Status**: Draft
**Mission Type**: software-dev
**Input**: Remediate the four non-blocking findings from the post-merge mission review of `cts1-conformance-harness-01KTS86B` (`kitty-specs/cts1-conformance-harness-01KTS86B/mission-review.md`): RISK-1, RISK-2, RISK-3, DRIFT-2. DRIFT-1 (local Ollama acceptance run) is **explicitly out of scope** — it requires a reboot that other in-flight work currently forbids; its reproduction command is already committed in `behave/results/README.md`.

## Overview

The muster harness shipped with a PASS WITH NOTES verdict. This mission closes every note that can be closed without a reboot: make reference resolution safe for untrusted soul files (containment + honest URI errors + no content leakage), turn the acceptance matrix's negative invariants into permanently-executing test code, and satisfy RFC-1 §7.2's documentation MUST.

## User Scenarios & Testing

### Primary User Stories

1. **Operator checking untrusted souls**: As an operator running muster on soul files I didn't author, I can restrict reference resolution to a base directory so a hostile `extends: ["../../../../etc/passwd"]` is rejected instead of read.
2. **Soul author with a URI reference**: As an author who mistakenly writes `extends: ["https://example.org/base.md"]`, I get an error that tells me URI schemes are unsupported — not a baffling ENOENT for a mangled local path.
3. **Future maintainer**: As a maintainer adding CI, I inherit invariant checks (no secrets, core/adapter boundary, fetch isolation) that run in `pnpm test` and cannot be silently defeated by grep's binary-file heuristic.

### Acceptance Scenarios

1. **Given** a soul whose `extends` entry matches a URI scheme (`https://`, `file://`), **When** checked, **Then** the report carries a violation stating URI schemes are unsupported, citing §7.2 — in both modes, with or without restriction.
2. **Given** restriction enabled with a base directory and a soul referencing `../../outside.md`, **When** resolved, **Then** loading is refused with a violation naming the escape; **Given** no restriction, **Then** behavior is unchanged from the shipped release (spec-permitted).
3. **Given** restriction enabled with no explicit directory, **When** checking a soul, **Then** the restriction base defaults to the root soul file's directory.
4. **Given** a referenced document that fails YAML parsing, **When** the violation is reported, **Then** the message contains position information but no raw source excerpt from the referenced file.
5. **Given** `pnpm test`, **When** the suite runs, **Then** invariant tests verify (in Node, not grep): no committed secret patterns, no `src/core/` file importing from `src/adapters/`, and `fetch(` appearing only in the behavioral client.
6. **Given** the README, **When** a reader looks for reference behavior, **Then** a section documents supported schemes (relative, absolute), URI non-support, the restriction flag, and the trust model for untrusted souls.

### Edge Cases

- Bare restriction flag vs. flag-with-value vs. absent flag (three distinct behaviors).
- Reference that is exactly the base directory boundary (resolves inside — allowed).
- Absolute-path reference while restricted (must also be subject to containment).
- Scheme-like strings that are valid relative paths (`a:b/c.md` has no `//` — not a URI; must keep working as a path).
- Case-insensitive scheme match (`HTTPS://`).
- CTS fixture suite must be byte-identical with restriction absent (no behavior drift).

## Requirements

### Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-001 | References matching a URI scheme pattern (`<alpha><alnum+.->*://`, case-insensitive) are rejected with a violation citing §7.2 stating URI schemes are unsupported, instead of being treated as filesystem paths. | Proposed |
| FR-002 | Reference loading supports an optional containment base directory; when set, any reference (relative or absolute) whose resolved target falls outside the base is rejected with a violation naming the escape. When unset, resolution behavior is unchanged. | Proposed |
| FR-003 | The CLI exposes containment on all four subcommands as an optional flag taking an optional directory value; bare flag defaults the base to the root soul file's directory (for `cts run`: each case's root soul directory). | Proposed |
| FR-004 | Violations produced while parsing *referenced* documents carry position information (line/column where available) but never raw source excerpts of the referenced file's content. | Proposed |
| FR-005 | The test suite includes Node-implemented invariant guards: (a) no secret-pattern matches in tracked repo files, (b) no `src/core/` file imports from `src/adapters/`, (c) `fetch(` occurs only in the behavioral client module. Guards are written in Node specifically because RFC-section characters make GNU grep classify sources as binary. | Proposed |
| FR-006 | The README documents reference resolution per RFC-1 §7.2: supported schemes (relative anchored to the referencing file, absolute verbatim), URI schemes unsupported this pass with the exact error behavior, the containment flag with its three modes, and a trust-model recommendation for untrusted souls. | Proposed |

### Non-Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-001 | Zero behavior change when containment is not requested: the shipped 28-case CTS suite passes unchanged and `resolve --output-format canonical-json` output is byte-identical for all existing fixtures. | Proposed |
| NFR-002 | Full test suite (existing 519 + new tests) stays green and completes in under 10 seconds; invariant guards contribute under 2 seconds. | Proposed |
| NFR-003 | No new runtime dependencies. | Proposed |

### Constraints

| ID | Constraint | Status |
|----|-----------|--------|
| C-001 | Scope is exactly mission-review findings RISK-1, RISK-2, RISK-3, DRIFT-2. DRIFT-1 (local Ollama run) is out of scope this mission (reboot blocked by other in-flight work). | Locked |
| C-002 | Containment is opt-in. RFC-1 §7.2 permits relative and absolute references; default behavior must remain spec-conformant and backward compatible. | Locked |
| C-003 | Inherited from the parent mission unchanged: TypeScript strict / Node 22 / pnpm toolchain, C-004 core-never-imports-adapters boundary, charter directives (RFC-1 citations in tests, no committed credentials). | Locked |
| C-004 | The two code work streams must own disjoint files so they can execute in parallel isolated worktrees; documentation lands after the code it describes. | Locked |

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | Live demonstration: a hostile `../../`-referencing soul is rejected under restriction and (still) resolved without it; an `https://` reference yields the documented §7.2 message. Verified by executing the built CLI, not only unit tests. |
| SC-002 | `pnpm test` green including new guards; shipped CTS suite 28/28 with byte-identical canonical outputs (NFR-001 proven, not assumed). |
| SC-003 | Deleting any one invariant's protected property (e.g. planting a fake secret-pattern string in a tracked file in a scratch worktree) makes the corresponding guard fail — guards demonstrably constrain, not decorate. |
| SC-004 | README section verified against the built CLI's `--help` output and actual error messages (docs match reality, not intent). |

## Key Entities

- **Containment base**: the directory references must resolve within when restriction is active.
- **URI-scheme reference**: a reference string matching the scheme pattern — never resolved, always refused.
- **Invariant guard**: a Node-based test encoding one acceptance-matrix negative invariant permanently.

## Assumptions

- Symlink-based escapes are out of scope (consistent with the parent mission's WP04 depth-cap note); containment compares lexically resolved paths.
- The acceptance-matrix JSON from the parent mission is a historical record and is not rewritten; the guards supersede it operationally.
- The voice-frontdesk soul and shipped fixtures contain no URI or escaping references, so NFR-001's byte-identity claim is testable against them as-is.

## Out of Scope

- DRIFT-1: the local Ollama acceptance run (pending reboot; reproduction command already committed).
- Symlink resolution/realpath hardening of containment.
- Any change to merge semantics, grading, thresholds, or other parent-mission locked behavior.
- A lockfile/integrity mechanism for references (RFC-1 §7.2.1 — was already out of scope upstream).

## Dependencies

- Parent mission artifacts: `kitty-specs/cts1-conformance-harness-01KTS86B/mission-review.md` (findings are the scope source), the merged muster codebase at `7caf5d7`+.
- Vendored spec `.kittify/reference/soul-spec.md` §7.2 (normative anchor for FR-001/FR-006).
