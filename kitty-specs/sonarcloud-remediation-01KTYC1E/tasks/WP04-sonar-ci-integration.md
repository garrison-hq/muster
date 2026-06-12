---
work_package_id: WP04
title: SonarCloud CI integration (blocking gate + coverage)
dependencies:
- WP01
- WP02
- WP03
requirement_refs:
- FR-1
- FR-2
- FR-6
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-12T18:19:06Z'
subtasks:
- T020
- T021
- T022
- T023
- T024
- T025
agent: "claude:opus:reviewer:reviewer"
shell_pid: "1287534"
history:
- timestamp: '2026-06-12T18:19:06Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: .github/workflows/
execution_mode: code_change
owned_files:
- sonar-project.properties
- .github/workflows/ci.yml
- .github/workflows/site.yml
- package.json
- pnpm-lock.yaml
- vitest.config.ts
tags: []
---

# WP04 — SonarCloud CI integration (blocking gate + coverage)

## Objective

Make SonarCloud a **blocking PR check from day one** with lcov coverage
upload, and close the 6 CI/workflow findings: 3 vulnerabilities (workflow-
level permissions in `site.yml`) and 2 hotspots (unpinned third-party
actions) — plus the unpinned action the new sonar job would otherwise add.
This WP **depends on WP01–WP03** purely for merge order: the gate must flip
on against a `main` that already analyzes clean.

## Context (read first)

- Spec: `kitty-specs/sonarcloud-remediation-01KTYC1E/spec.md` (FR-1, FR-2.1,
  FR-6.4; AC-1)
- Research: `kitty-specs/sonarcloud-remediation-01KTYC1E/research.md` —
  **D-1** (scan mechanism, Automatic-Analysis conflict), **D-2** (coverage),
  **D-6** (permissions + pinning)
- Contract: `kitty-specs/sonarcloud-remediation-01KTYC1E/contracts/ci-quality-gate.md`
- Existing workflows: `.github/workflows/ci.yml` (build-test matrix, Node 22,
  pnpm), `.github/workflows/site.yml` (Pages deploy with workflow-level
  permissions block — the vulnerability)

**User decisions baked in**: gate **blocking immediately**
(`sonar.qualitygate.wait=true`); coverage **in scope now**
(`@vitest/coverage-v8`, no coverage-percentage gate).

## Subtasks

### T020 — `sonar-project.properties` (NEW file, repo root)

```properties
sonar.projectKey=garrison-hq_muster
sonar.organization=garrison-hq
sonar.sources=src
sonar.tests=tests
sonar.exclusions=dist/**,node_modules/**,site/**,kitty-specs/**,.kittify/**,behave/**,cts/**,souls/**
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.coverage.exclusions=tests/**
```

Verify the org/key against the SonarCloud project page
(https://sonarcloud.io/project/overview?id=garrison-hq_muster) — key is
`garrison-hq_muster`; confirm organization slug from the project's
Information panel (expected `garrison-hq`).

**Validation**: file exists at repo root; keys verified.

### T021 — Coverage wiring (`package.json`, `vitest.config.ts`, `pnpm-lock.yaml`)

**Steps**:
1. `pnpm add -D @vitest/coverage-v8` — pick the version line matching the
   installed vitest major (`vitest ^3.2.4` → coverage-v8 ^3.x; pnpm resolves
   this automatically).
2. Add script: `"test:coverage": "vitest run --coverage"`.
3. In `vitest.config.ts`, add:
   ```ts
   coverage: {
     provider: 'v8',
     reporter: ['text', 'lcov'],
     include: ['src/**'],
   }
   ```
   Merge into the existing config object — do not disturb existing test
   options.
4. Verify locally: `pnpm test:coverage` → suite green AND
   `coverage/lcov.info` exists, non-empty. Confirm `coverage/` is
   git-ignored (check `.gitignore`; if missing, it belongs to this repo's
   ignore file — but `.gitignore` is not in owned_files, so if an entry is
   needed, flag it in the PR description instead of editing; vitest's
   default `coverage/` output is already ignored if `.gitignore` has it —
   verify and report).

**Validation**: `pnpm test:coverage` green; lcov file produced; lockfile
updated and committed.

### T022 — Blocking sonar job in `.github/workflows/ci.yml`

**Steps**:
1. Append a `sonar` job (do not modify the `build-test` job's steps):
   ```yaml
   sonar:
     name: sonarcloud scan
     runs-on: ubuntu-latest
     needs: build-test
     # Secrets are unavailable to fork PRs; skip rather than fail (documented
     # limitation in contracts/ci-quality-gate.md).
     if: github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository
     steps:
       - uses: actions/checkout@<SHA>            # v4 — full history for blame/new-code
         with:
           fetch-depth: 0
       - uses: pnpm/action-setup@<SHA>           # v4
       - uses: actions/setup-node@<SHA>          # v4
         with:
           node-version: '22'
           cache: pnpm
       - run: pnpm install --frozen-lockfile
       - run: pnpm test:coverage
       - uses: SonarSource/sonarqube-scan-action@<SHA>   # vX.Y.Z (latest stable)
         env:
           SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
         with:
           args: >
             -Dsonar.qualitygate.wait=true
   ```
2. Resolve every `<SHA>` per T024's procedure (one consistent pass over both
   workflows).
3. `sonar.qualitygate.wait=true` makes the job fail on gate failure — this IS
   the blocking behavior (user decision #1). Do not add `continue-on-error`.

**Validation**: `actionlint` clean if available (`npx actionlint` or skip if
not installed — note which); YAML parses (`python3 -c "import yaml,sys;
yaml.safe_load(open('.github/workflows/ci.yml'))"`).

### T023 — `site.yml` permissions to job level (S8233 ×2 + S8264 — the 3 vulnerabilities)

**Steps**: delete the workflow-level block:
```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```
and add per job:
- `build` job → `permissions: { contents: read }`
- `deploy` job → `permissions: { pages: write, id-token: write }`
  (deploy-pages needs both; it does not need `contents: read` — the deploy
  job has no checkout step. If the action errors post-merge, adding
  `contents: read` to deploy is the documented fallback.)

**Validation**: YAML parses; job-level permissions only; no workflow-level
`permissions:` key remains.

### T024 — SHA-pin third-party actions in BOTH workflows (2 hotspots + consistency)

**Steps**:
1. The flagged hotspots are `pnpm/action-setup@v4` in `ci.yml:24` and
   `site.yml:35`. Resolve each tag to its full commit SHA:
   ```bash
   gh api repos/pnpm/action-setup/git/ref/tags/v4 --jq '.object.sha'
   # if the tag is an annotated tag object, dereference:
   gh api repos/pnpm/action-setup/git/tags/<sha-from-above> --jq '.object.sha' 2>/dev/null || true
   ```
   Same procedure for `SonarSource/sonarqube-scan-action` (find latest stable
   release tag first: `gh api repos/SonarSource/sonarqube-scan-action/releases/latest --jq '.tag_name'`).
2. Replace `uses: owner/action@vN` with `uses: owner/action@<full-40-char-sha> # vN(.x.y)`
   for ALL third-party (non-`actions/*`) actions in both workflows. For
   GitHub-owned `actions/*`, pin them too for consistency (cheap, same
   procedure) — the hotspots only require the third-party ones, so if any
   `actions/*` pin is problematic, tags are acceptable there.
3. Keep the version comment — renovate/dependabot and humans need it.

**Validation**: every `uses:` in both workflows is either a 40-char SHA with
version comment, or a justified `actions/*` tag; both hotspot lines resolved.

### T025 — WP04 verification + manual-step flags

**Steps**:
1. Local verification battery:
   ```bash
   pnpm test:coverage && ls -la coverage/lcov.info
   python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); yaml.safe_load(open('.github/workflows/site.yml')); print('YAML OK')"
   git diff --stat   # only the six owned files
   ```
2. The WP's PR description MUST contain this checklist (from
   `contracts/ci-quality-gate.md` — these are user-side, one-time steps that
   gate the first successful scan):
   ```
   ## ⚠ Manual steps required BEFORE merging this PR
   - [ ] Create SONAR_TOKEN repo secret (SonarCloud → My Account → Security → generate; GitHub → Settings → Secrets → Actions)
   - [ ] Disable Automatic Analysis (SonarCloud → Project → Administration → Analysis Method) — CI analysis errors if both are active
   ## After merge, verify
   - [ ] SonarCloud check appears and passes on this PR / next main push
   - [ ] Coverage visible on SonarCloud dashboard
   - [ ] Quality gate status = OK (expect 0 issues after WP01–03)
   ```
3. Post-merge follow-through (whoever lands it): run the three quickstart
   API checks (issues=0, hotspots TO_REVIEW=0 after UI acceptances, gate=OK)
   and complete any D-5/D-7/D-9 "mark safe / accept" actions recorded in the
   WP01–WP03 work logs.

## Definition of Done

- [ ] `sonar-project.properties` present, keys verified
- [ ] `pnpm test:coverage` green, lcov produced
- [ ] `sonar` job: blocking (`qualitygate.wait=true`), `fetch-depth: 0`,
      fork-PR guard, coverage uploaded, no `continue-on-error`
- [ ] `site.yml`: no workflow-level permissions; least-privilege per job
- [ ] All third-party `uses:` SHA-pinned with version comments in both files
- [ ] PR description carries the manual-steps checklist verbatim
- [ ] Only `owned_files` modified

## Reviewer guidance

- Check the fork-PR `if:` guard logic and that the job `needs: build-test`
  (don't scan red builds).
- Verify each pinned SHA actually corresponds to the commented tag
  (spot-check one with `gh api`).
- Reject `continue-on-error: true` anywhere in the sonar job — that silently
  un-blocks the gate (user decision #1 says blocking).
- Confirm the deploy job got `pages: write` + `id-token: write` and the build
  job only `contents: read` — swapped/duplicated permissions defeat S8233.

## Activity Log

- 2026-06-12T19:21:19Z – claude:sonnet:implementer:implementer – shell_pid=1256727 – Started implementation via action command
- 2026-06-12T19:25:46Z – claude:sonnet:implementer:implementer – shell_pid=1256727 – WP04 complete. All 6 subtasks done; 6 owned files modified; tests green; YAML valid.

NOTE: coverage/ directory is untracked (not committed) — it is a build artifact. .gitignore does not have a coverage/ entry (flagged below).
- 2026-06-12T19:26:35Z – claude:opus:reviewer:reviewer – shell_pid=1287534 – Started review via action command

## Per-subtask outcomes
- T020: sonar-project.properties created at repo root (projectKey garrison-hq_muster, org garrison-hq)
- T021: @vitest/coverage-v8@^3.2.6 installed, test:coverage script added, vitest.config.ts coverage block wired; pnpm test:coverage green, coverage/lcov.info 57 KB produced
- T022: sonar job added to ci.yml — needs build-test, fetch-depth 0, fork-PR guard, pnpm test:coverage + SonarSource/sonarqube-scan-action, sonar.qualitygate.wait=true, no continue-on-error
- T023: site.yml workflow-level permissions block removed; contents:read added to build job; pages:write + id-token:write added to deploy job (closes S8233x2 + S8264)
- T024: All uses: entries SHA-pinned in both workflows with version comments
- T025: Verification battery passed; 6 owned files only in diff

## Resolved SHAs
- pnpm/action-setup@v4             → b906affcce14559ad1aafd4ab0e942779e9f58b1
- actions/checkout@v4              → 34e114876b0b11c390a56381ad16ebd13914f8d5
- actions/setup-node@v4            → 49933ea5288caeca8642d1e84afbd3f7d6820020
- actions/upload-pages-artifact@v3 → 56afc609e74202658d3ffba0e8f6dda462b719fa
- actions/deploy-pages@v4          → d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e
- SonarSource/sonarqube-scan-action@v8.2.0 → 713881670b6b3676cda39549040e2d88c70d582e

## FLAG: coverage/ not in .gitignore
coverage/ is not listed in .gitignore. Add 'coverage/' entry to .gitignore before merge.

## ⚠ Manual steps required BEFORE merging this PR
- [ ] Create SONAR_TOKEN repo secret (SonarCloud → My Account → Security → generate; GitHub → Settings → Secrets → Actions)
- [ ] Disable Automatic Analysis (SonarCloud → Project → Administration → Analysis Method) — CI analysis errors if both are active
## After merge, verify
- [ ] SonarCloud check appears and passes on this PR / next main push
- [ ] Coverage visible on SonarCloud dashboard
- [ ] Quality gate status = OK (expect 0 issues after WP01–03)
