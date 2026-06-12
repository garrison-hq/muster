# Implementation Plan: SonarCloud remediation + PR quality gate

**Branch**: `main` (planning base and merge target; WPs run in spec-kitty lanes) | **Date**: 2026-06-12 | **Spec**: `kitty-specs/sonarcloud-remediation-01KTYC1E/spec.md`
**Input**: Feature specification from `/home/jeroennouws/dev/garrison-hq/muster/kitty-specs/sonarcloud-remediation-01KTYC1E/spec.md`

## Summary

Wire SonarCloud analysis into CI as a **blocking** PR check (quality gate
fails the check from day one) **with lcov coverage upload**, and remediate the
full SonarCloud backlog: 77 open issues (4 vulnerabilities, 3 bugs, 70 code
smells) and 6 security hotspots, inventoried in
`kitty-specs/sonarcloud-remediation-01KTYC1E/sonar-inventory.md`. Zero
behavior change: `pnpm build` (tsc strict) and the full Vitest suite stay
green, and the static path's byte-stable determinism is verified explicitly.

**Planning decisions confirmed by the user (2026-06-12):**
1. Quality gate is blocking from day one (remediation merges within this
   mission, so the gate only bites on new issues).
2. Coverage upload is in scope now: `@vitest/coverage-v8` (dev-dep) + lcov →
   SonarCloud. No coverage-percentage gate (charter sets none).

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 22 LTS (unchanged)
**Primary Dependencies**: no new runtime deps. New **dev** dependency:
`@vitest/coverage-v8` (matches vitest ^3.2.4). CI: official
`SonarSource/sonarqube-scan-action` (exact major + full commit SHA pin
resolved at implement time; the older `sonarcloud-github-action` is
deprecated).
**Storage**: N/A
**Testing**: Vitest 3 (`vitest.config.ts` present); full suite + CTS fixture
suite is the regression net. New: `vitest run --coverage` in CI emitting
`coverage/lcov.info`.
**Target Platform**: GitHub Actions (ubuntu-latest) + local Fedora dev
**Project Type**: single package (existing layout)
**Performance Goals**: unchanged v1 targets; CI scan job must not slow the
build-test job (runs as a separate job).
**Constraints**: zero behavior change; static path offline + byte-stable
deterministic; no credentials in repo (`SONAR_TOKEN` is a GitHub secret);
spec-agnostic core boundary untouched.
**Scale/Scope**: 77 issues + 6 hotspots across 18 files (13 src, 5 tests/CI);
4 work packages anticipated.

## Charter Check

*Charter: `.kittify/charter/charter.md` (v1 charter; engineering constraints
carry over to this housekeeping mission).*

| Charter gate | Status |
|---|---|
| tsc strict passes before merge | PASS — AC-4 requires it per WP |
| Full Vitest suite green incl. CTS fixture suite | PASS — AC-4/AC-5; refactors are behavior-preserving, no test weakened |
| No implementation before spec/plan/tasks locked | PASS — this plan precedes any code change |
| Minimal dependencies | PASS with note — one new dev-dep (`@vitest/coverage-v8`), no runtime deps; justified in Complexity Tracking |
| Static checks zero network / offline | PASS — FR-3 comparator fix preserves byte-stable output; AC-5 verifies byte-identity |
| No hardcoded providers / no credentials in repo | PASS — `SONAR_TOKEN` via GitHub secrets only |
| Performance targets | PASS — no runtime code paths made slower; complexity refactors are structure-only |

No violations. Re-checked after Phase 1 design: still clean.

## Project Structure

### Documentation (this feature)

```
kitty-specs/sonarcloud-remediation-01KTYC1E/
├── spec.md              # done
├── sonar-inventory.md   # done — closed checklist of all 77 issues + 6 hotspots
├── plan.md              # this file
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — config surface (no domain entities)
├── quickstart.md        # Phase 1 — local verification steps
├── contracts/
│   └── ci-quality-gate.md  # Phase 1 — the PR-check contract
└── tasks.md             # Phase 2 (/spec-kitty.tasks — NOT created here)
```

### Source Code (repository root — files touched, no structural change)

```
sonar-project.properties        # NEW — project key, sources, exclusions, lcov path
.github/workflows/ci.yml        # MODIFIED — sonar job (blocking), coverage run, SHA pins
.github/workflows/site.yml      # MODIFIED — permissions to job level, SHA pins
package.json                    # MODIFIED — @vitest/coverage-v8 dev-dep, coverage script
vitest.config.ts                # MODIFIED — coverage reporter config (lcov)
src/adapters/rfc1/              # evaluation, frontmatter, index, keyspace, resolve, state
src/cli/                        # index.ts, output.ts
src/core/                       # canonical-json.ts, behavioral/{client,manifest,runner}.ts,
                                # cts/{manifest,runner}.ts
tests/                          # behavioral/{graders,runner}.test.ts,
                                # unit/{canonical-json,cli,cts-runner,pipeline}.test.ts
```

**Structure Decision**: single-package layout unchanged; this mission only
adds `sonar-project.properties` at the root and edits existing files in place.

## Work-package outline (preview for /spec-kitty.tasks — not tasks.md)

- **WP-1 — CI integration (blocking gate + coverage)**: FR-1 complete
  (`sonar-project.properties`, sonar job with quality-gate wait, lcov upload),
  FR-6.4 (SHA-pin third-party actions in both workflows), FR-2.1 (site.yml
  job-level permissions — same file, same WP to avoid conflicts).
  Lands **last** in merge order (gate flips on against a clean main), though
  it can be implemented in parallel.
- **WP-2 — Security & correctness fixes in src + tests**: FR-2.2 (mkdtemp),
  FR-3 (S2871 comparators with byte-stability guard), FR-6.1–6.3 (ReDoS
  regexes, http fixture URLs).
- **WP-3 — Critical complexity refactors**: FR-4 (10× S3776 extractions, 3×
  S3735 void removals). Highest-risk WP; behavior-preserving, test-guarded.
- **WP-4 — Mechanical smells sweep**: FR-5 (53 major+minor), including the
  S7784 structuredClone-semantics check.

Dependencies: WP-2/3/4 independent of each other but **WP-3 and WP-4 touch
overlapping files** (`runner.ts`, `manifest.ts`, `cli/index.ts`) — sequence
WP-3 → WP-4 to avoid rebase pain. WP-1 merges last.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New dev-dep `@vitest/coverage-v8` (charter: minimal dependencies) | Coverage upload confirmed in scope by user; v8 provider is vitest's first-party coverage engine | Hand-rolled c8 invocation duplicates what vitest ships natively; "no coverage" rejected by user decision #2 |
