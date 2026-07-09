# Mission Review — a2a-behavioral-conformance-01KVJDWE

**Reviewer:** claude:opus:reviewer
**Reviewed at:** 2026-06-20
**Verdict:** PASS-WITH-NOTES
**Build+test:** `pnpm build` clean; `pnpm test` 124 files, 2818 pass / 3 skip (pre-existing env-gated live tests); invariants 12/12.
**Code under review:** lane branch `kitty/mission-a2a-behavioral-conformance-01KVJDWE-lane-a` (worktree), not yet merged into the mission branch.

## FR coverage trace

| FR | Status | Evidence |
|----|--------|----------|
| FR-001 multi-turn send w/ history | PASS | `transport.sendMessage` + `buildSendRequest` thread `contextId`/`taskId`; `tests/a2a/transport-multiturn.test.ts` turn-1/turn-2 threading. |
| FR-002 grade verbosity/refusal/state_shift via core graders | PASS | `graders/behavioral.ts` imports `gradeVerbosity/gradeRefusal/gradeStateShift` + `conjunctivePassK` from `src/core/behavioral`; no axis logic re-implemented. |
| FR-003 k-of-n via pass^k | PASS | `runA2aCase` uses `conjunctivePassK` per run + `passCount >= pass_threshold`; `behavioral-runner.test.ts` k-of-n cases. |
| FR-004 manifest of turns/state/axes/policy | PASS | `behavioral-manifest.ts` validators; fixtures persona/explicit/both. |
| FR-005 strict validation, env-name-only token | PASS | `rejectUnknown` everywhere; `isEnvVarName` rejects `sk-`/`nvapi-`/URL; `literal-token.yaml`, `unknown-field.yaml` fixtures. |
| FR-006 surfaced via `muster a2a run` | PASS | `doA2aRun` routes by `kind:"behavioral"` via adapter `peekManifestKind`. |
| FR-007 per-case pass/fail + measured-vs-expected | PASS | `formatA2aBehavioralHuman` + `formatRunFailure`. |
| FR-008 exit 0/1/2 | PASS | `runBehavioralCases` exitCode 0/1/2; `behavioral-cli.test.ts` (a)-(d). |
| FR-009 skip when endpoint absent | PASS | `runA2aBehavioralManifest` returns `skipped:true` when env empty → exit 0. |
| FR-010 unreachable/all-errored → fail | PASS | sendMessage throws on net/timeout/non-2xx/empty; errored run = failed; all-errored test hits 127.0.0.1:1. |
| FR-011 black-box state_shift | PASS | `expectedStateAtTurn` tracked muster-internally; only user turns sent; no system/persona entry; `behavioral-runner.test.ts` black-box state test. |
| FR-012 case/run-count config w/o code | PASS | per-case `runs`/`pass_threshold` manifest fields (explicit.yaml runs:5/threshold:4). |
| FR-013 example + docs + citations | PASS | `examples/a2a/behavioral-{persona,explicit}.yaml`, `site/a2a-behavioral.md` (16 spec citations). |

NFR-001 determinism: dedicated test (fixed transcript → identical verdict). NFR-002 token: read at call time, never stored/logged; error messages carry endpoint+status only; NI-001 secret-scan guard passes. NFR-003 no-regression: static path byte-identical, `invokeSkill` untouched, regression test. NFR-005 no new runtime dep.

## Charter / boundary confirmations

- **C-004 / C-001 boundary:** `src/core/**` imports no adapter (NI-002 guard 12/12); behavioral runner lives in `src/adapters/a2a/` and imports core. CONFIRMED.
- **Additive static path:** routing is `if kind==="behavioral"` only; static/skill/auth/signed and `invokeSkill` unchanged; `src/core` diff empty. CONFIRMED.
- **Black-box state:** no system/persona message; expected state local-only. CONFIRMED.
- **Env-name-only token:** `isEnvVarName` rejects literal tokens/URLs; default `MUSTER_A2A_TOKEN`. CONFIRMED.
- **Determinism:** no `localeCompare` in new code; messageId from `idSeq` (no RNG/clock on static/grading path); sort uses UTF-16 code-unit ordering. CONFIRMED.
- **Scope:** every changed file in lane `write_scope`; no test weakened/skipped (.skip/.only/.todo absent). CONFIRMED.
- **Failure modes:** no TODO hiding unwired code; `doA2aRun` cognitive complexity reduced to ~4 (cycle-1 issues 1/2/3 genuinely fixed — `peekManifestKind` now exists in adapter, single read). CONFIRMED.

## Notes / non-blocking

1. **New-code coverage on `behavioral-manifest.ts` ~72–73%** (file-scoped), below the 80% new-code target. Uncovered lines are predominantly individual `errors.push(violation(...))` malformed-input branches in the validators, not core logic; decision-C soul/explicit/both precedence and all primary load paths are tested. SonarCloud new-code coverage (diff lines) is the authoritative gate; recommend confirming the Sonar new-code number on the PR. Not a behavioral defect — flagged as a coverage-hardening follow-up (add fixtures for the remaining malformed-field branches).
2. **Stale bookkeeping:** lane `status.json` shows WPs "planned" and `review-cycle-2.md` frontmatter reads `verdict: rejected` (cycle-1 content); git history is authoritative — fix commit `af11ede` resolved the cycle-1 issues and `96e8863` moved WP04 to approved. Known muster bookkeeping wart.

## Verdict

PASS-WITH-NOTES. No CRITICAL/HIGH blocking finding. Spec FRs all satisfied and tested; boundary, determinism, black-box, and env-name-only invariants hold in code and pass their guards. The one substantive note (manifest-loader coverage) is a non-blocking hardening item to confirm against the SonarCloud new-code gate on the PR.
