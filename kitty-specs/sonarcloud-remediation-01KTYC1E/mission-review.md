# Mission Review Report: sonarcloud-remediation-01KTYC1E

**Reviewer**: claude (mission-review skill)
**Date**: 2026-06-12
**Mission**: `sonarcloud-remediation-01KTYC1E` — SonarCloud remediation + PR quality gate
**Baseline (squash parent)**: `2c5c3e2`
**Merge commit**: `03f9a5a` (+ follow-up `05ed403` gitignore)
**HEAD at review**: `05ed403`
**WPs reviewed**: WP01–WP04 (all approved; merged, mission_number=3)

---

## Scope & method

This is a lint-remediation + CI-enablement mission, not a product-feature
mission. The contract is: fix the 77 open SonarCloud issues + 6 hotspots
(`sonar-inventory.md`) and add a blocking SonarCloud PR check **with zero
behavior change** (AC-5: byte-identical static output). Review surface is the
squash-merge diff `03f9a5a` (28 files, +1394/−545). Review history: WP03 had
one rejection cycle (opus caught a loosened assertion; fixed in cycle 1, approved
cycle 2). WP01/WP02/WP04 approved on first review.

**Coverage map**: every changed file maps to exactly one WP's declared
`owned_files` — `src/core/**` (WP01), `src/adapters/rfc1/**` + `src/cli/**`
(WP02), `tests/**` (WP03), workflows + sonar/coverage config (WP04). One
bookkeeping change to `meta.json` (friendly_name). No surprise files; no
ownership overlap.

---

## FR Coverage Matrix

| FR | Description | WP | Evidence | Adequacy | Finding |
|----|-------------|----|----------|----------|---------|
| FR-1 | SonarCloud blocking PR check + coverage | WP04 | `ci.yml:71 -Dsonar.qualitygate.wait=true`; `needs: build-test`; fork guard; lcov via `test:coverage` | ADEQUATE | — (NOTE-1: token/UI steps) |
| FR-2 | 4 vulnerabilities | WP04+WP03 | `site.yml` job-level perms (S8233×2, S8264); `pipeline.test.ts` mkdtemp (S5443) | ADEQUATE | — |
| FR-3 | 3 bugs (S2871 sort) | WP01+WP03 | `canonical-json.ts:56` code-unit comparator; `pipeline.test.ts` ×2 same | ADEQUATE | — (D-3 honored) |
| FR-4 | 17 critical smells (S3776×10, S3735×3, …) | WP01+WP02 | extraction-only refactors in runner/manifest/resolve/state; void-operator removals | ADEQUATE | — |
| FR-5 | 53 major+minor smells | WP01–WP03 | mechanical fixes; 4 justified-accepted | PARTIAL | OPEN-1 (4 accepted) |
| FR-6 | 6 hotspots | WP01+WP03+WP04 | client.ts ReDoS fix; cli.test.ts:331 ReDoS; http→https ×2; 2 SHA pins | ADEQUATE | — |

All 6 FRs have closed spec→code chains. AC-4 (build/test/smoke green) and AC-5
(byte-identical) independently re-verified on merged main: `pnpm build` clean,
**567/567 tests**, CLI smoke exit 0, `pnpm test:coverage` → `coverage/lcov.info`
(57 KB).

---

## Drift Findings

**None.** Adversarial checks for the locked decisions and constraints all pass:

- **D-3 (byte-stable determinism — no `localeCompare`)**: HONORED. `localeCompare`
  appears nowhere in `src/` except a forbidding comment
  (`canonical-json.ts`). The comparator is the exact code-unit form
  `(a, b) => (a < b ? -1 : a > b ? 1 : 0)` — provably equivalent to the bare
  `.sort()`, locale-independent. The Sonar-suggested fix that would have broken
  determinism was correctly refused.
- **Zero-behavior-change constraint**: HONORED. No exported API surface changed
  (`resolveCompositionDetailed` shows in the diff only as a context-shift; both
  signature lines are byte-identical). The `): void {` diff hits are return-type
  annotations on extracted helpers, not the `void` operator. Errored-run
  semantics preserved (`runner.ts:549 catch (error_)` → `records === null` →
  `passed: false`, with the `FR-022` citation intact).
- **No test weakening**: HONORED. Zero `.skip`/`.todo` added; test count
  identical (567); the one loosened assertion (cli.test.ts:331) was caught in
  WP03 review and restored to an anchored `/^\d+ passed, 0 failed of \d+$/`.

---

## Risk Findings

**None blocking.** The complexity refactors (S3776) are within-file extractions
whose helpers are called by their originating functions — not dead code, and the
567-test suite exercises the call paths. The blocking gate has no
`continue-on-error` escape hatch. SHA pins were independently verified against
`gh api` during WP04 review (all 6 match their version comments).

---

## Silent Failure Candidates

None introduced. The refactors preserved existing error handling rather than
adding new `catch … return ""` paths. The one error sink reviewed
(`runner.ts` `executeRun`) deliberately records the error and marks the run
failed — the intended v1 behavior, not a silent swallow.

---

## Security Notes

| Area | Finding | Risk class | Status |
|------|---------|------------|--------|
| ReDoS | `client.ts:67` regex (parses untrusted BYOM endpoint responses) replaced with linear `stripTrailingSlashes` loop | super-linear-backtracking | FIXED, verified linear |
| Workflow perms | `site.yml` least-privilege per job | over-broad-token | FIXED (S8233×2, S8264) |
| Supply chain | all third-party actions pinned to full commit SHAs | unpinned-action | FIXED (2 hotspots) |
| Writable dir | `pipeline.test.ts` uses `mkdtemp` not a fixed `/tmp` path | predictable-temp-path | FIXED (S5443) |

No new subprocess, network, or credential paths were introduced. `SONAR_TOKEN`
is referenced only via `secrets.` (never embedded).

---

## Final Verdict

**PASS WITH NOTES**

### Rationale

All six FRs have adequate, closed spec→code chains. The mission's load-bearing
constraint — zero behavior change with byte-stable determinism — is honored:
the locked `localeCompare` trap (D-3) was correctly avoided, no exported
surface changed, errored-run semantics survived, and the full suite plus CLI
smoke verify byte-identically on merged main. No drift, no blocking risk, no
security regression; the security posture is strictly improved (ReDoS,
least-privilege workflows, pinned actions). No CRITICAL or HIGH finding exists.
The notes below are unfinished **manual/UI steps**, not code defects — they do
not gate the merge but do gate the SonarCloud dashboard reading clean.

### Open items (non-blocking)

- **OPEN-1 — 4 accepted smells need "won't fix" marking.** Four issues were
  intentionally accepted, not fixed, each with a verified justification:
  `pipeline.test.ts` S7784 ×3 (JSON round-trip is the tested semantics) and
  `runner.test.ts:546` S7780 (quadruple-backslash YAML would be corrupted by
  `String.raw`). These remain valid open issues on the next analysis until
  marked "won't fix" in the SonarCloud UI; until then AC-2 ("0 open issues")
  reads 4, not 0. The acceptances themselves are sound.
- **NOTE-1 — Gate activation requires two user-side steps** (carried in WP04's
  PR note): create the `SONAR_TOKEN` repo secret, and disable SonarCloud
  Automatic Analysis (mutually exclusive with the CI scan; the first CI
  analysis errors if both are active).
- **NOTE-2 — `coverage/` gitignore** was a flagged WP04 follow-up (not in its
  owned files); already resolved by orchestrator commit `05ed403`.
- **NOTE-3 — `node_modules` refresh**: the new `@vitest/coverage-v8` dev-dep is
  in the merged lockfile; a `pnpm install` is needed on any pre-merge checkout
  before `pnpm test:coverage` runs (CI installs fresh, so unaffected).
