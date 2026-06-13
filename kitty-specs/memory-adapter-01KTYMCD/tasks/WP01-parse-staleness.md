---
work_package_id: WP01
title: MEMORY.md / USER.md parse + fact-label manifest + staleness lint
dependencies: []
requirement_refs:
- FR-001
- FR-002
- FR-003
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-13T01:30:00Z'
subtasks:
- T001
- T002
- T003
- T004
- T005
agent: "claude:sonnet:implementer:implementer"
shell_pid: "2440450"
history:
- timestamp: '2026-06-13T01:30:00Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/adapters/memory/
execution_mode: code_change
owned_files:
- src/adapters/memory/lint.ts
- tests/unit/memory/lint.test.ts
- tests/fixtures/memory/consistent/MEMORY.md
- tests/fixtures/memory/consistent/USER.md
- tests/fixtures/memory/stale/MEMORY.md
- tests/fixtures/memory/stale/USER.md
tags: []
---

# WP01 — MEMORY.md / USER.md parse + fact-label manifest + staleness lint

## Objective

Implement `FactParser` and `StalenessLinter` in `src/adapters/memory/lint.ts`.
`FactParser` converts raw `MEMORY.md` and `USER.md` markdown into
`MemoryFact[]`, honouring a caller-supplied manifest that labels each fact as
`private`/`timeSensitive` and optionally records a timestamp. `StalenessLinter`
flags time-sensitive facts whose recorded date is older than the rubric
tolerance relative to a **supplied** `ReferenceDate`; when no reference date is
supplied it records a `StalenessSkipNote` and does not produce a pass verdict.
All output is byte-stable and deterministic across repeated runs and machines
(NFR-001, C-003). This WP delivers the parser and lint foundation every other
WP depends on.

## Context (read first)

- Spec: `kitty-specs/memory-adapter-01KTYMCD/spec.md` — FR-002, FR-003, FR-010,
  FR-011; NFR-001/NFR-002/NFR-003; C-001/C-002/C-003; acceptance scenarios 1–4;
  edge cases (no reference date; unparseable timestamp).
- Data model: `kitty-specs/memory-adapter-01KTYMCD/data-model.md` — `MemoryFact`,
  `ReferenceDate`, `StalenessFinding`, `StalenessSkipNote`, `LintReport`.
- Plan: `kitty-specs/memory-adapter-01KTYMCD/plan.md` — WP01 outline; file
  structure for `src/adapters/memory/lint.ts` and fixture layout.
- Charter: `.kittify/charter/charter.md` — byte-stable static path; ≥ 80%
  new-code coverage (SonarCloud quality gate); tsc strict; every check cites a
  normative source; errored run = failed run.

**Hard rules for this WP** (from spec + charter):
1. No `new Date()`, `Date.now()`, or any system-clock read anywhere in
   `src/adapters/memory/lint.ts` (C-003). The static path is deterministic;
   all temporal reasoning is relative to the supplied `ReferenceDate`.
2. `MemoryFact.id` must be deterministic: same source file, same position, same
   text → same id across repeated invocations (NFR-001 byte-stability).
3. The `private` and `timeSensitive` labels come from the caller-supplied
   manifest, never inferred by the parser (data-model invariant).
4. Touch only files in `owned_files`. `src/core/` is never imported from
   `src/adapters/memory/lint.ts` (C-001).
5. All findings carry a `rubricCitation` field pointing to muster's published
   rubric (C-002). No normative claim without a citation.

## Subtasks

### T001 — Implement `FactParser` in `src/adapters/memory/lint.ts`

**Purpose**: parse `MEMORY.md` and `USER.md` into `MemoryFact[]`, honouring
the caller-supplied manifest that labels each fact as `private`/`timeSensitive`.

**Steps**:
1. Create `src/adapters/memory/lint.ts`. Export `FactParser` as a named export.
   Define the `MemoryFact` interface per the data model:
   ```ts
   export interface MemoryFact {
     id: string;
     source: 'MEMORY.md' | 'USER.md';
     text: string;
     private: boolean;
     timeSensitive: boolean;
     timestamp: Date | undefined;
   }
   ```
2. `FactParser.parse(filePath: string, manifest: FactManifest): MemoryFact[]`
   reads the file and splits it into individual facts. A fact is a non-empty
   paragraph or bullet item. Slug the section heading and ordinal position to
   produce the deterministic `id` (e.g., `memory-${heading-slug}-${ordinal}`).
3. Lookup each fact's labels in `manifest.labels` (keyed by `id`). If a fact
   id is absent from the manifest, default `private: false`,
   `timeSensitive: false`, `timestamp: undefined`.
4. For `timeSensitive: true` facts, attempt to parse a date from the fact text
   (ISO 8601 or `YYYY-MM-DD` inline). On parse failure set `timestamp: undefined`
   — the `StalenessLinter` will emit an `unparseable-date` note rather than
   silently passing (data-model invariant; spec edge case).
5. `id` generation must be locale-independent (no `localeCompare`, no
   `Intl.Collator`). Use UTF-16 code-unit ordering for any sort of ids
   (NFR-001).

**Files**: `src/adapters/memory/lint.ts` (new)

**Validation (FR-002)**:
- `FactParser.parse` returns a `MemoryFact[]` for each fixture file.
- `id` is identical across two parse calls on the same file content.
- `private` and `timeSensitive` flags match the supplied manifest labels.
- `timestamp` is `undefined` for non-time-sensitive facts.

---

### T002 — Implement `StalenessLinter` in `src/adapters/memory/lint.ts`

**Purpose**: flag time-sensitive `MemoryFact`s older than the rubric tolerance
relative to a supplied `ReferenceDate`; emit `StalenessSkipNote` when no
reference date is provided.

**Steps**:
1. Define `ReferenceDate`, `StalenessFinding`, `StalenessSkipNote`, and
   `LintReport` interfaces in `lint.ts` per the data model. `LintReport` for
   this WP covers only `stalenessFindings` and `stalenessSkip`; the
   `contradictionFindings` and `supersessionNotes` fields are added in WP02.
2. Export `StalenessLinter` with method:
   ```ts
   lint(facts: MemoryFact[], referenceDate: ReferenceDate | undefined): LintReport
   ```
3. When `referenceDate` is `undefined`: return
   `{ ok: false, stalenessFindings: [], stalenessSkip: { kind: 'staleness-skip', reason: 'no-reference-date' }, contradictionFindings: [], supersessionNotes: [] }`.
   Note: `ok: false` — this is not a pass (spec edge case; FR-003).
4. For each `MemoryFact` where `timeSensitive: true`:
   a. If `timestamp` is `undefined`: emit a `StalenessFinding` with a
      `rubricCitation` noting `unparseable-date` — the linter does not silently
      pass an unverifiable claim.
   b. Compute `ageInDays = Math.floor((referenceDate.value.getTime() - fact.timestamp.getTime()) / 86_400_000)`.
   c. If `ageInDays` exceeds the rubric staleness tolerance (defined as a named
      constant `STALENESS_TOLERANCE_DAYS`, default 90 — cite muster's published
      rubric in a comment), produce a `StalenessFinding`.
5. `rubricCitation` in every `StalenessFinding` must reference muster's published
   rubric; use a string constant `RUBRIC_CITATION` defined at the top of
   `lint.ts` — not an inline magic string (C-002).
6. Serialise `LintReport` via canonical-JSON ordering (UTF-16 code-unit key sort)
   so output is byte-stable across runs (NFR-001). Reuse
   `src/core/canonical-json.ts` — this is the only `src/core/` import permitted
   in this adapter (C-001 does not prohibit core utility imports; it prohibits
   `src/core/` from importing memory specifics in the opposite direction).
7. Do NOT call `new Date()` or `Date.now()` anywhere in `lint.ts` (C-003).
   All temporal values must originate from the caller.

**Files**: `src/adapters/memory/lint.ts` (extend from T001)

**Validation (FR-003, NFR-001, C-003)**:
- Stale fixture produces `StalenessFinding` naming the stale fact and its age.
- Clean fixture returns `ok: true` with empty `stalenessFindings`.
- No-reference-date path returns `StalenessSkipNote` with `reason: "no-reference-date"` and `ok: false`.
- Output of two lint runs on the same inputs is byte-identical (`JSON.stringify` of the `LintReport`).

---

### T003 — Fixtures: `tests/fixtures/memory/consistent/` and `tests/fixtures/memory/stale/`

**Purpose**: provide the fixture sets for staleness testing.

**Steps**:
1. Create `tests/fixtures/memory/consistent/MEMORY.md`. Include:
   - At least two non-time-sensitive facts (no timestamps).
   - One fact explicitly labelled non-private in a companion manifest.
   - No contradictions with `USER.md`.
   Use a plausible agent memory scenario (e.g., a user's project preferences and
   name). Keep content brief (10–20 lines total).
2. Create `tests/fixtures/memory/consistent/USER.md`. Include:
   - The user's preferred name and addressing style.
   - Communication preference consistent with `MEMORY.md`.
3. Create `tests/fixtures/memory/stale/MEMORY.md`. Include:
   - At least one time-sensitive fact with an ISO 8601 date that is more than
     `STALENESS_TOLERANCE_DAYS` (90) days before the test's reference date of
     `2026-01-01T00:00:00Z` (i.e., dated no later than `2025-09-29`). Mark it
     clearly in the manifest.
   - One non-time-sensitive fact to confirm the linter skips it.
4. Create `tests/fixtures/memory/stale/USER.md`. Minimal; consistent with the
   stale MEMORY.md; no new time-sensitive facts.
5. Create companion manifest files
   `tests/fixtures/memory/consistent/manifest.json` and
   `tests/fixtures/memory/stale/manifest.json` that label each fact's `id` with
   `private` and `timeSensitive` flags. The stale MEMORY.md fact must carry
   `timeSensitive: true`.

**Files**:
- `tests/fixtures/memory/consistent/MEMORY.md` (new)
- `tests/fixtures/memory/consistent/USER.md` (new)
- `tests/fixtures/memory/consistent/manifest.json` (new)
- `tests/fixtures/memory/stale/MEMORY.md` (new)
- `tests/fixtures/memory/stale/USER.md` (new)
- `tests/fixtures/memory/stale/manifest.json` (new)

**Validation**: manifest `id` values match the ids produced by `FactParser` when
run against the fixture files (verify in T004 tests).

---

### T004 — Unit tests: `tests/unit/memory/lint.test.ts` (staleness branch)

**Purpose**: exercise the staleness path of `FactParser` + `StalenessLinter`
with the fixture sets from T003.

**Steps**:
1. Create `tests/unit/memory/lint.test.ts`. Import `FactParser`,
   `StalenessLinter`, and `ReferenceDate` from `src/adapters/memory/lint.ts`.
2. **Stale-fact test** (acceptance scenario 1, FR-003):
   - Parse `tests/fixtures/memory/stale/MEMORY.md` with its manifest.
   - Supply `referenceDate = { value: new Date('2026-01-01T00:00:00Z') }`.
   - Call `StalenessLinter.lint(facts, referenceDate)`.
   - Assert `report.ok === false`.
   - Assert `report.stalenessFindings.length >= 1`.
   - Assert the finding names the correct `factId` and that `ageInDays > 90`.
   - Assert `finding.rubricCitation` is a non-empty string (C-002).
3. **Clean set test** (acceptance scenario 4, FR-003):
   - Parse `tests/fixtures/memory/consistent/MEMORY.md` with its manifest.
   - Supply a reference date of `2026-01-01T00:00:00Z`.
   - Assert `report.ok === true` and `report.stalenessFindings.length === 0`.
4. **No-reference-date test** (edge case, FR-003):
   - Parse `tests/fixtures/memory/stale/MEMORY.md` with its manifest.
   - Call `StalenessLinter.lint(facts, undefined)`.
   - Assert `report.ok === false`.
   - Assert `report.stalenessSkip?.reason === 'no-reference-date'`.
   - Assert `report.stalenessFindings.length === 0` — no findings, just the skip note.
5. **Byte-stability test** (NFR-001):
   - Run the stale-fact lint twice with the same inputs.
   - Assert `JSON.stringify(report1) === JSON.stringify(report2)`.
6. **Rigged-impossible discrimination control** (FR-009):
   - Create a fact array where every fact is `timeSensitive: false`. Supply a
     reference date.
   - Assert `report.ok === true` and `stalenessFindings.length === 0` (control
     cannot produce a false positive).
   - Also confirm the stale-fact test produces `ok: false` — proving the linter
     can fail on real input (the control would fail by contradiction if the
     linter always returned `ok: true`).
7. **Coverage target**: ≥ 80% of `lint.ts` lines covered after this file alone
   (the remaining lines are contradiction-specific, exercised in T008). The full
   coverage gate (≥ 80% new-code) is enforced by SonarCloud on the PR (NFR-006).

**Files**: `tests/unit/memory/lint.test.ts` (new)

**Validation**: `pnpm test -- tests/unit/memory/lint.test.ts` green; all six test
cases pass with no skips.

---

### T005 — WP01 verification

**Purpose**: gate the Definition of Done before requesting review.

**Steps** (run in order):
```bash
pnpm build                         # strict tsc — zero errors
pnpm test                          # full suite — zero failures, zero new skips
pnpm test -- tests/unit/memory/lint.test.ts  # targeted confirmation
# Byte-stability check (NFR-001, C-003):
node -e "
const { FactParser, StalenessLinter } = require('./dist/adapters/memory/lint.js');
// Two lint runs with the same fixed reference date
const rd = { value: new Date('2026-01-01T00:00:00Z') };
const fp = new FactParser();
const facts = fp.parse('tests/fixtures/memory/stale/MEMORY.md', require('./tests/fixtures/memory/stale/manifest.json'));
const r1 = new StalenessLinter().lint(facts, rd);
const r2 = new StalenessLinter().lint(facts, rd);
const s1 = JSON.stringify(r1);
const s2 = JSON.stringify(r2);
if (s1 !== s2) { console.error('BYTE UNSTABLE'); process.exit(1); }
console.log('BYTE STABLE OK');
"
git diff --stat HEAD   # only owned_files changed; no src/core/ modified
```
Confirm no `export` declarations in `src/core/` changed:
`git diff HEAD | grep '^[-+]export' | grep 'src/core' || echo OK` → expect `OK`.

**Validation**: all commands exit 0; `BYTE STABLE OK` printed; git diff shows
only files from `owned_files`.

---

## Definition of Done

- [ ] `FactParser.parse` returns `MemoryFact[]` for both `MEMORY.md` and `USER.md`, with deterministic `id` values
- [ ] `StalenessLinter.lint` flags stale facts with correct `ageInDays` and `rubricCitation`
- [ ] No-reference-date path returns `StalenessSkipNote` with `ok: false`
- [ ] Byte-stability check (T005) passes: identical JSON output on two runs with the same inputs
- [ ] No `new Date()` / `Date.now()` anywhere in `lint.ts` (C-003)
- [ ] No `src/core/` modification; adapter boundary intact (C-001)
- [ ] `pnpm build` (strict tsc) + `pnpm test` green; no test file outside `owned_files` touched
- [ ] `tests/unit/memory/lint.test.ts` staleness branch: all six cases pass, no skips
- [ ] Every `StalenessFinding` carries a non-empty `rubricCitation` (C-002)
- [ ] SonarCloud coverage gate condition: ≥ 80% line coverage on new code (NFR-006)

## Reviewer guidance

- **Reject if** any file outside `owned_files` is modified, or if
  `src/core/canonical-json.ts` (or any other core file) is changed.
- Check C-003 compliance: `grep -n 'new Date()\|Date.now()' src/adapters/memory/lint.ts` must return nothing.
- Verify `id` determinism: two parse calls on the same file content must return
  identical `id` values; inspect the id generation code for any source of
  non-determinism (array index drift, `Math.random()`, etc.).
- Confirm `rubricCitation` is set to a non-empty string constant, not an empty
  string or `undefined`.
- Byte-stability check evidence (T005) must appear in the activity log.
- For the no-reference-date edge case: confirm `ok: false` (not `ok: true`) and
  `stalenessFindings.length === 0`.

## Activity Log

- 2026-06-13T08:35:31Z – claude:sonnet:implementer:implementer – shell_pid=2440450 – Started implementation via action command
