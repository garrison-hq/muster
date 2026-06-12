# Research: SonarCloud remediation — Phase 0 decisions

**Mission**: `sonarcloud-remediation-01KTYC1E` · **Date**: 2026-06-12
**Primary input**: `sonar-inventory.md` (live API snapshot, 77 issues + 6
hotspots). No NEEDS CLARIFICATION items remain — both open planning questions
were answered by the user on 2026-06-12 (gate blocking from day one; coverage
in scope).

## D-1 — Scan mechanism: CI-based scan via official action, replacing Automatic Analysis

- **Decision**: Use `SonarSource/sonarqube-scan-action` (the maintained,
  unified action; `sonarcloud-github-action` is deprecated) in a dedicated
  `sonar` job in `.github/workflows/ci.yml`, with
  `sonar.qualitygate.wait=true` so the job — and thus the PR check — fails
  when the gate fails. Pin the action to a full commit SHA (resolve the SHA
  for the latest stable major at implement time via the GitHub API) with a
  version comment, consistent with hotspot fix FR-6.4.
- **Rationale**: Current analyses come from SonarCloud **Automatic Analysis**
  (quality gate status reads `NONE`; no scanner config exists in the repo).
  CI-based analysis and Automatic Analysis are mutually exclusive — running
  both produces a hard analysis error. CI-based is required for coverage
  upload (Automatic Analysis cannot ingest lcov), which the user confirmed in
  scope.
- **Alternatives considered**: keep Automatic Analysis + add only a gate
  status check (no coverage, no scanner control — rejected); run sonar
  scanner inside the build-test job (couples scan failures to the test
  matrix, slower feedback — rejected).
- **Manual user steps surfaced (WP-1 lands these in the PR description)**:
  (1) create `SONAR_TOKEN` repo secret; (2) disable Automatic Analysis
  (SonarCloud → Administration → Analysis Method) before the first CI scan
  merges.

## D-2 — Coverage wiring

- **Decision**: `@vitest/coverage-v8` dev-dep; CI runs
  `vitest run --coverage` with `lcov` reporter; `sonar-project.properties`
  sets `sonar.javascript.lcov.reportPaths=coverage/lcov.info`. Coverage
  excluded for `tests/**`, `dist/**`, `site/**`. No coverage gate condition
  (charter: "No minimum coverage gate").
- **Rationale**: first-party vitest provider, one dev-dep, zero runtime
  impact; satisfies FR-1.4 without inventing a coverage policy the charter
  deliberately omits.

## D-3 — S2871 sort comparators (the determinism trap)

- **Decision**: explicit UTF-16 code-unit comparator
  `(a, b) => (a < b ? -1 : a > b ? 1 : 0)` in `src/core/canonical-json.ts:53`
  and the two test sites; **never** `localeCompare`.
- **Rationale**: default `Array#sort()` already sorts strings by UTF-16 code
  units — which is exactly what RFC 8785-style canonical JSON requires and
  what v1's byte-stability constraint freezes. The comparator above encodes
  the *current* ordering explicitly, silencing S2871 with provably zero
  output change. `localeCompare` (Sonar's suggested fix) is locale- and
  ICU-version-dependent — it would break byte-stable determinism.
- **Verification**: AC-5 — CTS fixture outputs and canonical-JSON unit-test
  snapshots byte-identical before/after. Any snapshot churn fails the WP.

## D-4 — ReDoS hotspots (S5852-class, dos/MEDIUM)

- **Decision**: treat `src/core/behavioral/client.ts:67` as a real fix:
  rewrite the regex to eliminate super-linear backtracking (possessive-style
  restructuring — split alternations, anchor, replace nested quantifiers — or
  swap to simple string parsing if the pattern allows). Same treatment for
  `tests/unit/cli.test.ts:331` (cheaper to fix than justify). Mark hotspots
  resolved via the fix, not via "safe" review.
- **Rationale**: client.ts parses responses from **untrusted BYOM endpoints**
  — attacker-influenceable input, so the DoS class is genuinely reachable;
  review-away would be wrong.

## D-5 — http:// fixture URLs in tests (encrypt-data/LOW ×2)

- **Decision**: switch fixtures to `https://` where the test only checks URL
  plumbing; if a test specifically exercises http endpoint support (BYOM
  allows local `http://localhost` endpoints, e.g. Ollama), keep it and mark
  the hotspot **safe** in the SonarCloud UI with justification "loopback BYOM
  test fixture; no transport occurs in unit tests".
- **Rationale**: v1 explicitly supports local OpenAI-compatible endpoints
  over http (local Ollama); blanket https-ification could delete real
  coverage. Decide per test at implement time; record outcomes in WP notes.

## D-6 — Workflow permissions + action pinning

- **Decision**: `site.yml` — delete workflow-level `permissions:` block; add
  `permissions: contents: read` to the `build` job and
  `permissions: pages: write, id-token: write` to the `deploy` job. Pin
  third-party actions (`pnpm/action-setup@v4` in both workflows, plus the new
  Sonar action) to full commit SHAs with `# vX.Y.Z` comments. GitHub-owned
  `actions/*` may stay on tags (the two flagged hotspots point only at
  `pnpm/action-setup`), but pin them too if cheap for consistency.
- **Rationale**: resolves S8233 ×2 + S8264 (vulnerabilities) and both
  "others" hotspots; least-privilege per job is the documented GitHub
  hardening guidance Sonar's rules encode.

## D-7 — S7784 `structuredClone` swaps need a semantics check

- **Decision**: before replacing `JSON.parse(JSON.stringify(x))` in
  `tests/unit/pipeline.test.ts` (×3), check whether the test relies on JSON
  round-trip semantics (dropping `undefined`, functions, prototype
  stripping for comparison against pipeline output). If it does, keep the
  JSON idiom and mark the issue **accepted** with justification; else swap.
- **Rationale**: these tests exercise the canonical-JSON pipeline — JSON
  round-trip there may be intentional, and `structuredClone` preserves things
  JSON drops. Blind compliance could weaken the test.

## D-8 — Cognitive-complexity refactors (S3776 ×10)

- **Decision**: extract named helper functions (guard clauses, per-case
  handlers) within the same module; no cross-module moves, no signature
  changes to exported APIs, no behavior branches added/removed. The S107
  too-many-params fix (`executeRun`, 8 params) folds trailing params into a
  single options object at the same call sites.
- **Rationale**: keeps the spec-agnostic core boundary untouched (charter)
  and the diff reviewable; the existing suite (unit + CTS fixtures +
  behavioral runner tests with mocked fetch) is the behavior lock.

## D-9 — Issue-closure policy

- **Decision**: target **fix** for all 77; the only anticipated
  accepted-with-justification candidates are the S7784 trio (D-7) and at most
  the two http hotspots (D-5). Every acceptance gets a one-line justification
  in the mission's closing notes and in the SonarCloud UI.
- **Rationale**: spec AC-2/AC-3; keeps the "deviations are documented" rule
  (DIRECTIVE_010) honest.
