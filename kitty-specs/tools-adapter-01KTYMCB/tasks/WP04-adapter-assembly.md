---
work_package_id: WP04
title: Fixture set + manifest runner + adapter assembly
dependencies:
- WP01
- WP02
- WP03
requirement_refs:
- FR-010
- FR-011
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-13T01:30:00Z'
subtasks:
- T022
- T023
- T024
- T025
- T026
history:
- timestamp: '2026-06-13T01:30:00Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/adapters/tools/
execution_mode: code_change
owned_files:
- src/adapters/tools/index.ts
- tests/tools/integration/tools-adapter.test.ts
tags: []
---

# WP04 — Fixture set + manifest runner + adapter assembly

## Objective

Assemble the three modules (lint, drift, selection) behind muster's `SpecAdapter`
boundary in `src/adapters/tools/index.ts`. Expose a manifest-runner entry point
that accepts a test manifest (case id, `TOOLS.md` path, environment descriptor
path, scenario set, expectations) and produces a pass/fail summary. Write an
integration test that runs the full static/drift fixture suite offline, verifies
byte-stable output, and confirms all nine acceptance scenarios pass. Verify the
SonarCloud gate is green on the new code (≥80% new-code coverage).

This WP merges last so the `SpecAdapter` boundary is enforced against a complete
set of peer modules, and the integration test can cover all three test classes.

## Context (read first)

- Spec: `kitty-specs/tools-adapter-01KTYMCB/spec.md` (FR-001, FR-010, FR-011,
  C-001, C-005; all acceptance scenarios 1–9; SC-002 byte-stability)
- Data model: `kitty-specs/tools-adapter-01KTYMCB/data-model.md` (entity
  relationships diagram — `DriftCheck(TOOLSFile, EnvironmentDescriptor)`)
- Plan: `kitty-specs/tools-adapter-01KTYMCB/plan.md` — WP04 section;
  `SpecAdapter` boundary; project structure
- WP01: `src/adapters/tools/lint.ts`
- WP02: `src/adapters/tools/drift.ts`
- WP03: `src/adapters/tools/selection.ts`
- Charter: `.kittify/charter/charter.md` — "full Vitest suite green"; SonarCloud
  quality gate; tsc strict; offline + byte-stable static/drift path; no
  credentials in repo
- Reference existing adapter assembly: `src/adapters/rfc1/index.ts` — read for
  structural context; do NOT modify

**Hard rules for the whole WP**:
1. Touch only files in `owned_files`. Do not modify WP01/WP02/WP03 files.
2. The `SpecAdapter` boundary: `src/core/` must never import from
   `src/adapters/tools/`. Verify with `tsc` (if there were a circular import,
   the build would fail). Add a comment in `index.ts` documenting this constraint.
3. The integration test exercises only the static + drift paths (offline, zero
   network calls). The behavioral path is exercised only with mock `fetch` in
   WP03's unit tests — the integration test does not call a live endpoint.
4. `pnpm build` (`tsc` strict) must pass before each commit.
5. All fixtures from WP01/WP02/WP03 must pass/fail exactly as designed — no
   silent skips, no fixup changes to earlier WP owned files.

## Subtasks

### T022 — `src/adapters/tools/index.ts` — adapter assembly behind `SpecAdapter` boundary

**Purpose**: Create the adapter's public entry point. Assemble lint, drift, and
selection behind the `SpecAdapter` interface (check `src/core/` for the exact
interface definition), re-export the public API surface, and document the adapter
boundary.

**Steps**:
1. Read `src/core/` to find the `SpecAdapter` interface (likely in
   `src/core/pipeline.ts` or a nearby types file). Understand its contract:
   what methods/properties a conforming adapter must implement.
2. Create `src/adapters/tools/index.ts`. Structure:
   ```ts
   /**
    * Tools adapter — behind the SpecAdapter boundary (C-001).
    * src/core/ must never import from src/adapters/tools/ — TypeScript enforces this.
    */

   // Re-export types that callers of this adapter need:
   export type { TOOLSFile, ToolDescriptor, LintFinding, LintReport } from './lint';
   export type { EnvironmentDescriptor, DriftFinding, DriftReport } from './drift';
   export type { ToolSelectionCase, ToolSelectionVerdict } from './selection';

   // Re-export functions:
   export { parseTOOLSFile, lintTOOLSFile, toCanonicalJson } from './lint';
   export { loadEnvironmentDescriptor, runDriftCheck } from './drift';
   export { runSelectionCase } from './selection';
   ```
3. If the `SpecAdapter` interface requires a specific class/object shape (e.g.,
   a `run()` method), implement it here as a `ToolsAdapter` class or factory
   function that delegates to the three module functions. Follow the exact pattern
   used by `src/adapters/rfc1/index.ts`.
4. Add the `SpecAdapter` boundary comment block at the top.

**Files**: `src/adapters/tools/index.ts` (NEW)

**Validation**: `pnpm build` clean; `import { parseTOOLSFile } from
'./src/adapters/tools/index'` works from a test file.

---

### T023 — Manifest runner entry point

**Purpose**: Expose a `runManifest()` function (or method on `ToolsAdapter`) that
accepts a test manifest describing a complete run — case id, `TOOLS.md` path,
environment descriptor path, scenario set, expectations — and returns a structured
pass/fail summary per FR-010.

**Steps**:
1. Define `ToolsManifestCase` interface (local to `index.ts`; exported):
   ```ts
   interface ToolsManifestCase {
     readonly id: string;
     /** Absolute or runner-relative path to the TOOLS.md file. */
     readonly toolsFilePath: string;
     /**
      * Optional path to an environment descriptor JSON file.
      * When present, drift checks are run against it.
      * Absent: only static lint is run for this case.
      */
     readonly envDescriptorPath?: string;
     /**
      * Optional list of selection-scenario fixture paths.
      * When present, behavioral probes are run for this case.
      * Absent: behavioral probes are skipped for this case.
      */
     readonly selectionScenarioPaths?: readonly string[];
     /** Expected: 'pass' | 'fail' — for manifest-runner assertions. */
     readonly expect?: 'pass' | 'fail';
   }
   ```
2. Define `ToolsManifestResult` interface (exported):
   ```ts
   interface ToolsManifestResult {
     readonly id: string;
     readonly passed: boolean;
     readonly lintReport?: LintReport;
     readonly driftReport?: DriftReport;
     readonly selectionVerdicts?: readonly ToolSelectionVerdict[];
   }
   ```
3. Implement `runManifest(cases: readonly ToolsManifestCase[], opts?: {endpoint?:
   string; apiKey?: string; model?: string}): Promise<readonly ToolsManifestResult[]>`.
   For each case:
   - Parse `TOOLS.md` via `parseTOOLSFile`.
   - Run `lintTOOLSFile`.
   - If `envDescriptorPath` present: load descriptor and run `runDriftCheck`.
   - If `selectionScenarioPaths` present: load each scenario file and run
     `runSelectionCase` (only if `opts.endpoint` is set; skip with a warning
     if not).
   - Determine `passed` based on lint + drift clean + all selection verdicts
     passed, cross-checked against `expect`.
4. Export `runManifest`, `ToolsManifestCase`, `ToolsManifestResult`.

**Files**: `src/adapters/tools/index.ts` (extend)

**Validation**: `pnpm build` clean. Full validation in T024.

---

### T024 — Integration test: full static/drift fixture suite offline, byte-stable

**Purpose**: Write an integration test that exercises the complete static + drift
fixture suite from WP01 and WP02, verifies all nine acceptance scenarios pass
(scenarios 1–6 are static/drift and fully deterministic; scenarios 7–9 are
covered in WP03 unit tests with mock fetch), and confirms byte-stable output on
the drift clean path (SC-002, NFR-001).

**Steps**:
1. Create `tests/tools/integration/tools-adapter.test.ts`.
2. Import `parseTOOLSFile`, `lintTOOLSFile`, `toCanonicalJson` from
   `src/adapters/tools/lint.ts`.
   Import `loadEnvironmentDescriptor`, `runDriftCheck` from
   `src/adapters/tools/drift.ts`.
   Import `runManifest` from `src/adapters/tools/index.ts`.
3. **Scenario 1 (FR-003 acceptance — well-formed static lint)**: parse
   `well-formed.md`; assert `lintReport.ok === true`, zero findings.
4. **Scenario 2 (FR-003 acceptance — missing section)**: parse
   `missing-section.md`; assert `lintReport.ok === false`, one finding with
   `kind === 'missing-required-section'`.
5. **Scenario 3 (FR-004 — documented-but-missing)**: parse `well-formed.md` +
   load `documented-but-missing.json`; assert finding for `send_email`.
6. **Scenario 4 (FR-004 — present-but-undocumented)**: parse `well-formed.md` +
   load `present-but-undocumented.json`; assert finding for `delete_file`.
7. **Scenario 5 (FR-004 — schema-mismatch with direction)**: parse `well-formed.md`
   + load `schema-mismatch-sub.json`; assert `schema-mismatch` finding with
   `direction === 'docs-ahead'`.
8. **Scenario 6 (SC-002 — byte-stable clean drift)**: parse `well-formed.md` +
   load `matching-mcp.json`; run twice; assert `JSON.stringify(run1) ===
   JSON.stringify(run2)` and `report.clean === true`.
9. **OpenAI format scenario 6 variant**: load `matching-openai.json`; assert
   clean report and `envDescriptorFormat === 'openai-tool-registry'`.
10. **Unknown-format edge case**: assert `loadEnvironmentDescriptor('unknown-format.json')`
    throws.
11. **`runManifest` smoke test**: build a manifest with two cases (well-formed +
    matching-mcp.json; missing-section.md with no env-descriptor); run it;
    assert first case passes, second case fails (lint not ok → `passed === false`).
12. **Performance gate (NFR-003)**: assert the full static/drift suite (all
    integration test cases) completes in < 10 seconds. Use `performance.now()`
    or Vitest's built-in timeout (`test.timeout(10_000)`).

**Files**: `tests/tools/integration/tools-adapter.test.ts` (NEW)

**Validation**: `pnpm test -- tests/tools/integration/tools-adapter.test.ts` green;
zero skips; all nine scenarios pass; byte-stability on scenario 6 confirmed;
suite completes under 10 s (NFR-003).

---

### T025 — SonarCloud gate: ≥80% new-code coverage

**Purpose**: Confirm the new code meets the ≥80% new-code coverage threshold that
the SonarCloud quality gate enforces (charter; NFR-006). This is a verification
step — no code changes should be needed if WP01–WP03 unit tests are thorough.

**Steps**:
1. Run `pnpm test:coverage` (added by the sonarcloud-remediation mission).
2. Inspect `coverage/lcov.info` or the coverage report for
   `src/adapters/tools/**`. If coverage is below 80% on any new file:
   - Identify the uncovered branches.
   - Add targeted tests to the appropriate unit test file (WP01's `lint.test.ts`,
     WP02's `drift.test.ts`, WP03's `selection.test.ts`, or the integration test).
   - These additional tests are additive — do not delete existing test cases.
3. Re-run `pnpm test:coverage` to confirm the threshold is met.
4. Do NOT modify `src/core/` or any existing source file to add coverage
   workarounds. Coverage should be achieved through tests, not source changes.

**Files**: may add test cases to any of the four test files owned across WP01–WP04;
only WP04's `owned_files` may be created by this WP — coordinate with the
implementer if test file changes are needed in WP01–WP03 files (those are
technically outside WP04's `owned_files`, but additive test augmentation is
acceptable if clearly flagged in the work log).

**Validation**: `pnpm test:coverage` reports ≥80% new-code coverage for all four
`src/adapters/tools/*.ts` files. SonarCloud quality gate passes on the PR.

---

### T026 — WP04 verification: full suite; all scenarios 1–9 pass; byte-stable diff

**Purpose**: Gate for Definition of Done. Full build and test run; all acceptance
scenarios confirmed; `SpecAdapter` boundary verified; no files outside
`owned_files` modified.

**Steps** (in order):
```bash
pnpm build                                    # strict tsc — zero errors
pnpm test                                     # FULL suite green; zero failures; zero new skips
pnpm test:coverage                            # ≥80% new-code on src/adapters/tools/**
git diff --stat                               # ONLY owned_files changed (src/adapters/tools/index.ts, integration test)
# Verify SpecAdapter boundary (core never imports adapter):
grep -rn "from.*adapters/tools" src/core/ || echo "OK — core boundary clean"
# Confirm no network calls in static/drift integration test:
grep -n 'fetch\|http\|https' tests/tools/integration/tools-adapter.test.ts || echo "OK — offline"
```

Confirm all nine acceptance scenarios pass:
- Scenario 1 (well-formed → ok: true)
- Scenario 2 (missing section → finding)
- Scenario 3 (documented-but-missing `send_email`)
- Scenario 4 (present-but-undocumented `delete_file`)
- Scenario 5 (schema-mismatch with direction)
- Scenario 6 (clean + byte-stable)
- Scenario 7 (correct-selection → passed, from WP03 unit test)
- Scenario 8 (abstention → passed, from WP03 unit test)
- Scenario 9 (control → passed === false, from WP03 unit test)

Confirm:
- Full static/drift integration test suite completes in < 10 s (NFR-003).
- `src/core/` has zero imports of `src/adapters/tools/` (C-001).
- No credentials or hardcoded endpoints anywhere in new code.

**Files**: no new files; verification only.

**Validation**: all checks pass; WP is ready for reviewer.

## Definition of Done

- [ ] `src/adapters/tools/index.ts` exports the full public API surface and
  implements `SpecAdapter` boundary
- [ ] Manifest runner (`runManifest`) accepts a test manifest and produces
  structured pass/fail results (FR-010)
- [ ] Integration test covers all static/drift acceptance scenarios (1–6) and
  verifies byte-stable output on scenario 6 (SC-002)
- [ ] `pnpm build` (strict tsc) green; `pnpm test` full suite green; zero new skips
- [ ] `pnpm test:coverage` shows ≥80% new-code coverage for all
  `src/adapters/tools/*.ts` files (NFR-006; charter)
- [ ] SonarCloud quality gate passes on the PR (blocking check; charter)
- [ ] `src/core/` has zero imports of `src/adapters/tools/` (C-001 — grep-verified)
- [ ] Full static/drift fixture suite completes < 10 s (NFR-003)
- [ ] No files outside `owned_files` modified (net of this WP's additions)
- [ ] Fixture set shaped as candidate upstream conformance suite (FR-011, C-005)

## Reviewer guidance

- **Reject if** `src/core/` imports from `src/adapters/tools/` — the boundary
  is absolute (C-001). Run the grep check from T026 and verify it prints `OK`.
- **Reject if** SonarCloud quality gate is not passing (blocking PR check; charter).
- Check `runManifest`: a case with a failing lint (ok: false) must have
  `passed === false` in the result. A case with a clean lint AND clean drift
  must have `passed === true`.
- Check the byte-stability assertion (T024 step 8): it must actually call
  `JSON.stringify(run1) === JSON.stringify(run2)`, not just check `clean`.
- Check NFR-003: the integration test must assert (or enforce via `test.timeout`)
  that the suite completes in < 10 seconds.
- Verify no network calls in the integration test: the drift path is offline
  (C-003, NFR-001). `fetch` in the integration test file is a reject.
- The fixture set completeness: all seven env-descriptor fixtures from WP02 and
  all three selection-scenario fixtures from WP03 should exist on disk before
  this WP's integration test runs — if any are missing, the test will fail with
  a file-not-found error, not a test assertion error. Flag this if found.
