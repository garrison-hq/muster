---
work_package_id: WP05
title: Fixtures, manifest runner, and integration wiring
dependencies:
- WP01
- WP02
- WP03
- WP04
requirement_refs:
- FR-011
- FR-012
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-13T01:30:00Z'
subtasks:
- T019
- T020
- T021
- T022
history:
- timestamp: '2026-06-13T01:30:00Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/adapters/memory/
execution_mode: code_change
owned_files:
- src/adapters/memory/index.ts
- tests/integration/memory/memory-suite.test.ts
tags: []
---

# WP05 — Fixtures, manifest runner, and integration wiring

## Objective

Wire all fixture sets into the memory adapter's manifest runner, register
`MemoryAdapter` with the CLI, and confirm that the full static fixture suite
produces byte-identical output across two runs (NFR-001). The manifest runner
drives consistent/stale/contradictory memory sets, recall scenarios, and
group-context leak scenarios and produces a pass/fail summary in muster's
machine-readable format. The fixture suite is shaped as a candidate upstream
conformance suite (C-005). This WP merges last.

## Context (read first)

- Spec: `kitty-specs/memory-adapter-01KTYMCD/spec.md` — FR-001, FR-011, FR-012,
  NFR-001/NFR-002/NFR-003; C-001/C-005.
- Plan: `kitty-specs/memory-adapter-01KTYMCD/plan.md` — WP05 outline; `index.ts`
  as entry point; registration pattern mirrors `src/adapters/rfc1/`.
- WP01–WP04 outputs: all adapter modules (`lint.ts`, `recall.ts`, `privacy.ts`)
  and fixture sets are complete. This WP owns only `index.ts` and the integration
  test.
- Charter: `.kittify/charter/charter.md` — all fixture suites must pass; byte-stable
  static path; ≥ 80% new-code coverage; `tsc` strict; no core modifications.

**Hard rules for this WP**:
1. `index.ts` must NOT modify or re-export from `src/core/`. The adapter boundary
   is intact (C-001). The only permitted `src/core/` use is importing the
   `SpecAdapter` interface and CLI registration hook (same pattern as `rfc1`).
2. The byte-stability check (T022) must use a fixed reference date, not the
   system clock — two independent runs of the static suite must produce
   byte-identical output (NFR-001, C-003).
3. Touch only files in `owned_files`. All WP01–WP04 files are read-only here.
4. The fixture suite must be shaped for upstream contribution: case ids are
   stable and human-readable, YAML/JSON fixtures are self-contained, and the
   suite's README (already present in `tests/fixtures/memory/`) describes the
   layout (C-005).

## Subtasks

### T019 — Wire `MemoryAdapter` entry point in `src/adapters/memory/index.ts`

**Purpose**: create the `MemoryAdapter` class that implements muster's
`SpecAdapter` interface and export it for CLI registration.

**Steps**:
1. Create `src/adapters/memory/index.ts`. Import `StalenessLinter`,
   `ContradictionLinter`, `FactParser` from `./lint.ts`; `RecallProbeRunner` from
   `./recall.ts`; `PrivacyLeakProbeRunner` from `./privacy.ts`.
2. Import the `SpecAdapter` interface from `src/core/` (the only permitted
   `src/core/` import in this file). Do not import any core implementation
   modules.
3. Export `MemoryAdapter` class implementing `SpecAdapter`:
   ```ts
   export class MemoryAdapter implements SpecAdapter {
     readonly name = 'memory';
     // run(manifest: AdapterManifest, options: AdapterOptions): Promise<AdapterResult>
   }
   ```
   The `run` method delegates to the manifest runner implemented in T020.
4. Export a named factory function `createMemoryAdapter(): MemoryAdapter` for
   CLI registration (matches the `rfc1` pattern — inspect
   `src/adapters/rfc1/index.ts` for the exact registration call and replicate it
   for the memory adapter).

**Files**: `src/adapters/memory/index.ts` (new)

**Validation (FR-001, C-001)**:
- `tsc` compiles `index.ts` with no errors.
- `MemoryAdapter` implements `SpecAdapter` (TypeScript enforces this at compile
  time).
- No `src/core/` implementation module is imported except the `SpecAdapter`
  interface and CLI registration hook.

---

### T020 — Implement manifest runner in `src/adapters/memory/index.ts`

**Purpose**: implement the `run` method — wire all fixture sets into a manifest
runner that produces a pass/fail summary in muster's machine-readable format.

**Steps**:
1. In `MemoryAdapter.run`, parse the adapter manifest YAML (passed via
   `AdapterManifest`). The manifest lists:
   - Static lint cases: a list of `{id, memoryPath, userPath, manifestPath, referenceDate?}` objects.
   - Recall probe cases: a list of `RecallProbe` YAML paths.
   - Privacy probe cases: a list of `PrivacyLeakProbe` YAML paths.
2. For each static lint case:
   a. Parse `MEMORY.md` and `USER.md` via `FactParser`.
   b. Run `StalenessLinter.lint(facts, referenceDate)`.
   c. Run `ContradictionLinter.lint(memFacts, userFacts)`.
   d. Merge results into a `LintReport`.
3. For each recall probe case (only when `options.behavioral === true` to
   support offline mode): load the YAML via `FactParser.parseScenario` (or plain
   YAML read), construct a `RecallProbe`, run `RecallProbeRunner.run`.
4. For each privacy probe case (only when `options.behavioral === true`): load
   the YAML, construct a `PrivacyLeakProbe`, run `PrivacyLeakProbeRunner.run`.
   After each privacy run, call `allRefuseGuard` with the companion recall
   result.
5. Produce an `AdapterResult` in muster's machine-readable format:
   - `ok: boolean` — true iff all static lints pass and (if behavioral) all
     recall + privacy probes pass and no all-refuse guards fired.
   - `summary: string` — human-readable one-liner.
   - `findings: Finding[]` — array of all `StalenessFinding`,
     `ContradictionFinding`, `RecallVerdict`, and `PrivacyLeakVerdict` objects.
6. Canonical-JSON serialisation of the `AdapterResult` (UTF-16 code-unit key
   ordering) ensures byte-stable output (NFR-001).
7. All static lint findings must be deterministic regardless of run order; sort
   findings by `factId` in UTF-16 code-unit order before emitting the result.

**Files**: `src/adapters/memory/index.ts` (extend from T019)

**Validation (FR-011, NFR-001)**:
- Offline static-only run on the consistent fixture returns `ok: true`.
- Offline static-only run on the stale fixture returns `ok: false` with a
  staleness finding.
- Two identical static runs on the same fixture produce byte-identical
  `AdapterResult` JSON.

---

### T021 — Integration test: `tests/integration/memory/memory-suite.test.ts`

**Purpose**: run the full memory fixture suite end-to-end via the manifest
runner; confirm static output is byte-stable.

**Steps**:
1. Create `tests/integration/memory/memory-suite.test.ts`. Import `MemoryAdapter`
   from `src/adapters/memory/index.ts`.
2. **Consistent fixture — static lint pass** (acceptance scenario 4, FR-011):
   - Build an `AdapterManifest` pointing to the consistent fixture set with
     `referenceDate: '2026-01-01T00:00:00Z'`.
   - Run `MemoryAdapter.run(manifest, { behavioral: false })`.
   - Assert `result.ok === true`.
   - Assert `result.findings.length === 0`.
3. **Stale fixture — staleness finding** (acceptance scenario 1, FR-011):
   - Build manifest pointing to stale fixture, same reference date.
   - Assert `result.ok === false`.
   - Assert at least one finding with `kind === 'staleness'`.
4. **Contradictory fixture — contradiction finding** (acceptance scenarios 2/3, FR-011):
   - Build manifest pointing to contradictory fixture.
   - Assert `result.ok === false`.
   - Assert at least one finding with `kind === 'contradiction'`.
5. **Byte-stability check** (NFR-001, SC-006):
   - Run the consistent fixture lint twice with the same manifest and reference
     date.
   - Assert `JSON.stringify(result1) === JSON.stringify(result2)`.
   - Run the stale fixture lint twice.
   - Assert byte-identical output on both runs.
6. **Candidate upstream conformance suite shape** (C-005):
   - Assert that all case `id` values in the manifest are non-empty stable
     strings (no UUIDs generated at run time).
   - Assert that each fixture path resolves to an existing file.
   - This test acts as a lightweight smoke check of the conformance suite's
     structural integrity.
7. **Full `pnpm test` stays green**: this test must not break any existing test.
   No mocking of `Date.now()` — all temporal values are supplied as fixed strings.

**Files**: `tests/integration/memory/memory-suite.test.ts` (new)

**Validation (FR-011, FR-012, NFR-001)**:
- All five sub-tests pass; no skips.
- Byte-stability assertion passes for both consistent and stale fixture runs.

---

### T022 — WP05 verification (gate for Definition of Done)

**Purpose**: full end-to-end verification before requesting review.

**Steps** (run in order):
```bash
pnpm build                   # strict tsc — zero errors; memory adapter compiles
pnpm test                    # full suite — zero failures, zero new skips
pnpm test -- tests/integration/memory/
# Byte-stability smoke (offline, fixed reference date — not system clock):
node -e "
const { MemoryAdapter } = require('./dist/adapters/memory/index.js');
const adapter = new MemoryAdapter();
const manifest = {
  cases: [{ id: 'smoke-01', memoryPath: 'tests/fixtures/memory/consistent/MEMORY.md',
    userPath: 'tests/fixtures/memory/consistent/USER.md',
    manifestPath: 'tests/fixtures/memory/consistent/manifest.json',
    referenceDate: '2026-01-01T00:00:00Z' }]
};
Promise.all([
  adapter.run(manifest, { behavioral: false }),
  adapter.run(manifest, { behavioral: false })
]).then(([r1, r2]) => {
  if (JSON.stringify(r1) !== JSON.stringify(r2)) {
    console.error('BYTE UNSTABLE'); process.exit(1);
  }
  console.log('BYTE STABLE OK');
});
"
# CLI smoke: confirm 'memory' subcommand is registered
node dist/cli/index.js --help 2>&1 | grep -q 'memory' && echo 'CLI REGISTERED OK' || echo 'CLI NOT REGISTERED'
git diff --stat HEAD   # only owned_files changed; src/core/ unmodified
```

**Validation**: all commands exit 0; `BYTE STABLE OK` printed; `CLI REGISTERED OK`
printed; git diff shows only `index.ts` and the integration test.

---

## Definition of Done

- [ ] `MemoryAdapter` implements `SpecAdapter`; `tsc` strict passes (FR-001, C-001)
- [ ] Manifest runner produces `AdapterResult` with `ok: true` on consistent fixture and `ok: false` on stale/contradictory fixtures (FR-011)
- [ ] Byte-stability check (T022) passes for the static fixture suite: identical JSON output on two runs with the same fixed reference date (NFR-001, SC-006)
- [ ] `memory` subcommand visible in `node dist/cli/index.js --help` (FR-001)
- [ ] Integration test: all five sub-tests pass; no skips (FR-011, FR-012)
- [ ] Fixture suite is shaped as a candidate upstream conformance suite: stable case ids, self-contained fixtures, `README.md` describes layout (C-005)
- [ ] `pnpm build` (strict tsc) + `pnpm test` green; no file outside `owned_files` modified
- [ ] No `src/core/` implementation module imported from `index.ts` (C-001)
- [ ] SonarCloud coverage gate condition: ≥ 80% line coverage on new code (NFR-006)

## Reviewer guidance

- **Reject if** any WP01–WP04 file is modified — this WP owns only `index.ts`
  and the integration test.
- Verify `SpecAdapter` implementation: run `pnpm build` and confirm no TypeScript
  error about missing interface members.
- Byte-stability evidence (T022) must appear in the activity log with the
  `BYTE STABLE OK` line.
- CLI registration check: confirm `node dist/cli/index.js --help` shows `memory`.
- Confirm no `Date.now()` in `index.ts`: `grep -n 'Date.now()\|new Date()' src/adapters/memory/index.ts || echo OK` → expect `OK`.
- Conformance-suite shape: spot-check that case `id` values in the fixture
  manifest are human-readable strings, not generated UUIDs.
