# Tasks: SonarCloud remediation + PR quality gate

**Mission**: `sonarcloud-remediation-01KTYC1E`
**Input**: `spec.md`, `plan.md`, `research.md` (D-1…D-9), `sonar-inventory.md` (closed checklist: 77 issues + 6 hotspots)
**Branch contract**: planned on `main`; WPs execute in lanes; completed changes merge back into `main`.

**Ownership note**: the plan's issue-type WP outline (CI / security / complexity
/ mechanical) is re-sliced here **by file ownership** so `owned_files` never
overlap: the same files (`behavioral/runner.ts`, `cli/index.ts`,
`pipeline.test.ts`) carry critical *and* mechanical issues, so all issues in a
file are fixed by the WP that owns the file. Coverage of FR-2…FR-6 is
unchanged; FR-1 lives in WP04, which merges last (user decision: gate blocking
from day one, flipped on against a clean main).

## Subtask Index

| ID | Description | WP | Parallel |
|---|---|---|---|
| T001 | S2871 comparator in canonical-json.ts + byte-stability guard | WP01 | [P] | [D] |
| T002 | ReDoS regex fix in behavioral/client.ts:67 (hotspot, untrusted input) | WP01 | [D] |
| T003 | Complexity refactors in behavioral/runner.ts (S3776 ×3, S107) | WP01 | | [D] |
| T004 | runner.ts line-107 cluster + catch rename (S7735 ×2, S3358, S4624, S7718) | WP01 | | [D] |
| T005 | behavioral/manifest.ts: S3776 ×2, S4325 ×4, S7735 | WP01 | [D] |
| T006 | cts/manifest.ts + cts/runner.ts: S3776, S7735 ×3, S3358 | WP01 | [D] |
| T007 | WP01 verification: build, full suite, smoke, byte-diff vs pre-change | WP01 | | [D] |
| T008 | rfc1/resolve.ts: S3776 ×2, S7778 ×2 | WP02 | [D] |
| T009 | rfc1/state.ts: S3776 ×2, S6353 ×2 | WP02 | [D] |
| T010 | rfc1 small fixes: evaluation, keyspace, frontmatter, index (6 issues) | WP02 | [D] |
| T011 | cli/index.ts: S3735 ×2, S3358, S7785, S7735 | WP02 | [D] |
| T012 | cli/output.ts: S7735, S7780 | WP02 | [D] |
| T013 | WP02 verification: build, full suite, smoke | WP02 | | [D] |
| T014 | pipeline.test.ts: S5443 mkdtemp, S2871 ×2, S7784 ×3 (semantics check D-7) | WP03 | [D] |
| T015 | cli.test.ts: ReDoS hotspot, http fixtures (D-5), S4325 ×4, S7723 | WP03 | [D] |
| T016 | runner.test.ts: S7721 ×2, S6551 ×2, S7780 ×2, S4325 | WP03 | [D] |
| T017 | graders.test.ts + cts-runner.test.ts: S7780 ×5 | WP03 | [D] |
| T018 | canonical-json.test.ts + cts/suite.test.ts: S4325 ×4, S7773 ×2, S7748 | WP03 | [D] |
| T019 | WP03 verification: full suite green, no test weakened | WP03 | | [D] |
| T020 | sonar-project.properties (project key, sources, exclusions, lcov path) | WP04 | [D] |
| T021 | Coverage wiring: @vitest/coverage-v8, test:coverage script, vitest config | WP04 | [D] |
| T022 | Blocking sonar job in ci.yml (fetch-depth 0, qualitygate.wait, fork guard) | WP04 | | [D] |
| T023 | site.yml: workflow-level permissions → job level (S8233 ×2, S8264) | WP04 | [D] |
| T024 | SHA-pin third-party actions in both workflows (2 hotspots) | WP04 | [D] |
| T025 | WP04 verification + PR-description flags for the 2 manual user steps | WP04 | | [D] |

## Phase 1 — Parallel remediation (WP01, WP02, WP03)

### WP01 — Core remediation (`src/core/**`) — prompt: `tasks/WP01-core-remediation.md`

**Goal**: Fix all 24 SonarCloud findings in `src/core/**`, including the two
highest-risk items of the mission: the canonical-JSON sort comparator
(byte-stability constraint, research D-3) and the ReDoS regex in the
behavioral client (D-4). Behavior-preserving only.
**Priority**: P1 · **Estimated prompt size**: ~420 lines
**Independent test**: `pnpm build && pnpm test` green; CTS output byte-identical
(quickstart diff procedure); SonarCloud shows 0 open issues under `src/core/`.

- [x] T001 S2871 comparator in canonical-json.ts + byte-stability guard (WP01)
- [x] T002 ReDoS regex fix in behavioral/client.ts:67 (WP01)
- [x] T003 Complexity refactors in behavioral/runner.ts (S3776 ×3, S107) (WP01)
- [x] T004 runner.ts line-107 cluster + catch rename (WP01)
- [x] T005 behavioral/manifest.ts fixes (WP01)
- [x] T006 cts/manifest.ts + cts/runner.ts fixes (WP01)
- [x] T007 WP01 verification incl. byte-diff (WP01)

**Dependencies**: none. **Parallel**: T001/T002/T005/T006 touch disjoint files.
**Risks**: comparator must not change output bytes (AC-5); runner refactors are
the largest cognitive-complexity reductions (44→15).

### WP02 — Adapter & CLI remediation (`src/adapters/rfc1/**`, `src/cli/**`) — prompt: `tasks/WP02-adapter-cli-remediation.md`

**Goal**: Fix all 19 SonarCloud findings in the RFC-1 adapter and CLI:
4 complexity refactors, void-operator removals, top-level await, and
mechanical smells. Behavior-preserving only; adapter/core boundary untouched.
**Priority**: P1 · **Estimated prompt size**: ~360 lines
**Independent test**: `pnpm build && pnpm test` green; CLI smoke commands
byte-identical output; 0 open issues under `src/adapters/` + `src/cli/`.

- [x] T008 rfc1/resolve.ts fixes (WP02)
- [x] T009 rfc1/state.ts fixes (WP02)
- [x] T010 rfc1 small fixes: evaluation/keyspace/frontmatter/index (WP02)
- [x] T011 cli/index.ts fixes (WP02)
- [x] T012 cli/output.ts fixes (WP02)
- [x] T013 WP02 verification (WP02)

**Dependencies**: none. **Parallel**: every subtask owns distinct files.
**Risks**: resolve.ts/state.ts are the deterministic-resolution heart of the
RFC-1 adapter — refactors must be extraction-only; S7781 `replaceAll` swaps in
keyspace.ts must verify global-flag equivalence.

### WP03 — Test-suite remediation (`tests/**`) — prompt: `tasks/WP03-test-remediation.md`

**Goal**: Fix all 27 findings + 3 hotspots in test files without weakening any
assertion: mkdtemp for the writable-dir vulnerability, comparator fixes,
structuredClone swaps gated by a JSON-semantics check (D-7), http-fixture
decisions per D-5, regex hotspot fix.
**Priority**: P1 · **Estimated prompt size**: ~400 lines
**Independent test**: `pnpm test` green with identical test counts (no skips
added); 0 open issues + 0 TO_REVIEW hotspots under `tests/`.

- [x] T014 pipeline.test.ts fixes (WP03)
- [x] T015 cli.test.ts fixes incl. hotspot decisions (WP03)
- [x] T016 runner.test.ts fixes (WP03)
- [x] T017 graders.test.ts + cts-runner.test.ts String.raw fixes (WP03)
- [x] T018 canonical-json.test.ts + cts/suite.test.ts fixes (WP03)
- [x] T019 WP03 verification (WP03)

**Dependencies**: none. **Parallel**: every subtask owns distinct files.
**Risks**: S7784 structuredClone may silently change what a pipeline test
asserts (JSON round-trip drops `undefined`) — D-7 requires a semantics check
first, "accepted with justification" is the documented fallback; http→https
fixture swaps must not delete real http-endpoint coverage (BYOM supports
local Ollama over http).

## Phase 2 — Gate flip (after Phase 1 merges)

### WP04 — SonarCloud CI integration (blocking gate + coverage) — prompt: `tasks/WP04-sonar-ci-integration.md`

**Goal**: FR-1 complete: `sonar-project.properties`, blocking sonar job with
quality-gate wait and lcov coverage upload, site.yml job-level permissions
(the 3 workflow vulnerabilities), SHA-pinned third-party actions (2 hotspots).
Lands last so the blocking gate activates against a clean `main`.
**Priority**: P1 (merge-ordered last) · **Estimated prompt size**: ~430 lines
**Independent test**: CI green on the WP's PR with the SonarCloud check
visible; `pnpm test:coverage` emits `coverage/lcov.info`; post-merge `main`
analysis: 0 issues, 0 hotspots, gate `OK`.

- [x] T020 sonar-project.properties (WP04)
- [x] T021 Coverage wiring (@vitest/coverage-v8, script, vitest config) (WP04)
- [x] T022 Blocking sonar job in ci.yml (WP04)
- [x] T023 site.yml permissions to job level (WP04)
- [x] T024 SHA-pin third-party actions (WP04)
- [x] T025 WP04 verification + manual-step flags (WP04)

**Dependencies**: Depends on WP01, WP02, WP03 (merge-order enforcement: the
blocking gate must flip on against a remediated main; user decision #1).
**Risks**: Automatic Analysis must be disabled (manual user step) before this
merges or the first CI analysis errors; `SONAR_TOKEN` secret must exist;
fork PRs can't access secrets — the job needs an `if:` guard.

## Dependency summary

```
WP01 ──┐
WP02 ──┼──▶ WP04 (gate flip, merges last)
WP03 ──┘
```

WP01/WP02/WP03 are fully parallel (disjoint owned_files). WP04 is config-only
and could be implemented any time, but its lane branches after WP01–03 so the
blocking quality gate never sees a dirty main.

## Acceptance tracebility

- AC-1 (PR check, blocking) → WP04 (T020–T022, T025)
- AC-2 (0 open issues) → WP01–WP03 fix 71 of 77; WP04 fixes the 6 workflow/CI
  findings (3 vulnerabilities + pinning-adjacent); acceptances per D-9 only
- AC-3 (0 hotspots TO_REVIEW) → T002, T015 (fix), T015/D-5 (justified-safe),
  T024 (pinning)
- AC-4 (build/test/smoke green) → T007, T013, T019, T025
- AC-5 (byte-identical static output) → T001, T007
