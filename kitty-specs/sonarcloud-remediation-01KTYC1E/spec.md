# Feature Specification: SonarCloud remediation + PR quality gate

**Mission**: `sonarcloud-remediation-01KTYC1E`
**Created**: 2026-06-12
**Status**: Draft
**Type**: mini mission (housekeeping, blocks the v2 run)
**Input**: SonarCloud project `garrison-hq_muster`
(https://sonarcloud.io/project/overview?id=garrison-hq_muster); full snapshot
in `sonar-inventory.md` (77 open issues, 6 hotspots, taken 2026-06-12).

## Why

Garrison runs a SonarQube check on PRs; muster currently has no SonarCloud
step in CI, and the v1 codebase carries 77 open issues (17 critical, 12 major,
48 minor — 4 vulnerabilities, 3 bugs, 70 code smells) plus 6 unreviewed
security hotspots. Both gaps must close before the v2 mission starts so v2
PRs land on a green baseline.

## Functional Requirements

### FR-1 — SonarCloud PR check in CI
- **FR-1.1**: Add `sonar-project.properties` (projectKey `garrison-hq_muster`,
  organization `garrison-hq`, sources `src`, tests `tests`, exclusions for
  `dist/`, `node_modules/`, `site/`, `kitty-specs/`, `.kittify/`).
- **FR-1.2**: Add a SonarCloud scan job to `.github/workflows/ci.yml` running
  on `push` to `main` and on `pull_request`, using the official
  SonarSource scan action with `SONAR_TOKEN` from repo secrets, and
  `fetch-depth: 0` checkout (blame/new-code detection needs history).
- **FR-1.3**: Quality gate must be enforced (fail the check when the gate
  fails). Current gate status is `NONE` — analysis appears to come from
  SonarCloud Automatic Analysis. CI-based analysis and Automatic Analysis are
  mutually exclusive: Automatic Analysis MUST be disabled in the SonarCloud UI
  when the CI scan lands (manual step — flag it in the PR description for the
  user).
- **FR-1.4**: Test coverage upload (lcov from the vitest/node test run) is in
  scope if the test runner already emits it cheaply; otherwise record as
  follow-up, do not block this mission on coverage plumbing.

### FR-2 — Fix the 4 vulnerabilities
- **FR-2.1**: `.github/workflows/site.yml` — move workflow-level
  `contents: read` / `pages: write` / `id-token: write` permissions to job
  level (S8233 ×2, S8264 ×1).
- **FR-2.2**: `tests/unit/pipeline.test.ts:283` (S5443, publicly writable
  directory) — replace direct `/tmp` (or `os.tmpdir()`) path construction
  with `fs.mkdtempSync(path.join(os.tmpdir(), ...))` per-test unique dirs,
  cleaned up after.

### FR-3 — Fix the 3 bugs (S2871 sort without comparator) ⚠ domain constraint
- `src/core/canonical-json.ts:53` and `tests/unit/pipeline.test.ts:120-121`.
- **The Sonar-suggested `localeCompare` fix is WRONG for this codebase.**
  Canonical JSON key ordering is a byte-stable determinism guarantee (carried
  v1 constraint: "static path fully offline and byte-stable deterministic");
  `localeCompare` is locale-dependent and would break it.
- **Required fix**: an explicit UTF-16 code-unit comparator that preserves
  current ordering exactly, e.g. `(a, b) => (a < b ? -1 : a > b ? 1 : 0)`.
  This satisfies S2871 (a compare function is provided) without changing a
  single output byte.
- **Guard**: canonical-JSON byte-stability tests and all CTS fixture
  snapshots must pass unchanged. Any diff in emitted bytes = the fix is
  wrong.

### FR-4 — Fix the 17 critical code smells
- **FR-4.1** (S3776 ×10): reduce cognitive complexity to ≤15 in
  `src/adapters/rfc1/resolve.ts` (102, 254), `src/adapters/rfc1/state.ts`
  (81, 285), `src/core/behavioral/manifest.ts` (256, 339),
  `src/core/behavioral/runner.ts` (97, 235, 338), `src/core/cts/manifest.ts`
  (82). Extract helpers; behavior-preserving refactors only — the existing
  test suite is the safety net, no test may be weakened to pass.
- **FR-4.2** (S3735 ×3): remove `void` operator uses in
  `src/adapters/rfc1/index.ts:129`, `src/cli/index.ts:498-499`.

### FR-5 — Fix the remaining major + minor code smells (53)
Mechanical, per `sonar-inventory.md`: nested ternaries (S3358 ×4), nested
template literal (S4624), too-many-params via options object (S107),
top-level await (S7785), function-to-outer-scope (S7721 ×2), unnecessary type
assertions (S4325 ×13), negated conditions (S7735 ×8), `String.raw`
(S7780 ×8), `replaceAll` (S7781 ×3), `structuredClone` (S7784 ×3),
single-push (S7778 ×2), `\w` char class (S6353 ×2), `Number.NaN` (S7773 ×2),
template-literal object stringification in tests (S6551 ×2), plus the five
singletons (S7753, S7758, S7718, S7748, S7723).
- S7784 (`structuredClone` over `JSON.parse(JSON.stringify())`) in
  `tests/unit/pipeline.test.ts`: verify the test does not *intend* JSON
  round-trip semantics (dropping `undefined`, etc.) before swapping — if it
  does, keep behavior and mark the issue accepted instead.

### FR-6 — Resolve all 6 security hotspots
- **FR-6.1**: `src/core/behavioral/client.ts:67` regex backtracking (dos,
  MEDIUM) — production code: rewrite the regex to remove super-linear
  backtracking, or replace with non-regex parsing. This one is a real fix,
  not a review-away.
- **FR-6.2**: `tests/unit/cli.test.ts:331` regex backtracking — fix the same
  way (cheap) rather than justify.
- **FR-6.3**: `tests/unit/cli.test.ts:418,428` http URLs — test fixtures for
  BYOM endpoints; prefer changing fixtures to `https://` where the test
  semantics allow, else mark "safe" in the SonarCloud UI with justification
  (loopback test fixture, no transport involved).
- **FR-6.4**: `ci.yml:24`, `site.yml:35` — pin third-party GitHub Actions to
  full commit SHAs (with version comment), resolving both "others" hotspots.

## Non-functional constraints (carried from v1, non-negotiable)

1. **Zero behavior change.** This is lint remediation: every fix must keep
   `pnpm build` (tsc strict) and `pnpm test` green, including the CLI smoke
   path (`muster check`, `muster cts run`) byte-for-byte.
2. Static path stays fully offline and byte-stable deterministic (see FR-3).
3. Spec-agnostic core / adapter boundary untouched — refactors must not move
   layer knowledge into core.
4. If any Sonar fix genuinely conflicts with a v1 constraint, do NOT force
   it: implement the constraint-preserving alternative, or mark the issue
   "accepted" in SonarCloud with a written justification and record it in the
   mission notes. "Every check cites a normative source" applies to our own
   deviations too.

## Acceptance criteria

- AC-1: SonarCloud analysis runs in CI on PRs and pushes to `main`; the
  quality-gate check appears on PRs and fails when the gate fails.
- AC-2: SonarCloud shows **0 open issues** on the next `main` analysis — every
  one of the 77 inventoried issues is either fixed or accepted-with-written-
  justification (justifications listed in the mission's closing notes;
  expected acceptances: none or near-none).
- AC-3: **0 hotspots in TO_REVIEW** — each fixed or marked safe with
  justification.
- AC-4: Full local suite green: `pnpm build && pnpm test` plus the CLI smoke
  commands from ci.yml.
- AC-5: CTS fixture outputs and canonical-JSON outputs byte-identical to
  pre-mission `main` (determinism guard).

## Out of scope

- Coverage-percentage targets or new-code coverage gates (FR-1.4 records the
  hook; tuning the gate definition is a Garrison org decision).
- Any v2 feature work; any new checks/rules in muster itself.
- Changing the SonarCloud quality-gate definition.

## Notes for planning

- Suggested WP split: **WP-1** CI integration (FR-1, FR-6.4) · **WP-2**
  vulnerabilities + bugs + hotspot fixes in src (FR-2, FR-3, FR-6.1–6.3) ·
  **WP-3** critical complexity refactors (FR-4) · **WP-4** mechanical smells
  sweep (FR-5). WP-2/3/4 are independent of WP-1 but WP-1 should merge last
  or with the gate initially non-blocking, so the gate flips on against an
  already-clean main.
- `SONAR_TOKEN` secret and disabling Automatic Analysis are user-side
  SonarCloud/GitHub actions; surface both clearly when WP-1 lands.
