---
work_package_id: WP02
title: Contradiction lint (cross-file + intra-file, supersession-aware)
dependencies:
- WP01
requirement_refs:
- FR-004
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-13T01:30:00Z'
subtasks:
- T006
- T007
- T008
- T009
history:
- timestamp: '2026-06-13T01:30:00Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/adapters/memory/
execution_mode: code_change
owned_files:
- src/adapters/memory/contradiction.ts
- tests/unit/memory/contradiction.test.ts
- tests/fixtures/memory/contradictory/MEMORY.md
- tests/fixtures/memory/contradictory/USER.md
- tests/fixtures/memory/contradictory/manifest.json
tags: []
---

# WP02 — Contradiction lint (cross-file + intra-file, supersession-aware)

## Objective

Create `src/adapters/memory/contradiction.ts` with `ContradictionLinter`: flag
contradictions between `MEMORY.md`↔`USER.md` facts and within `MEMORY.md`
itself, while correctly distinguishing a timestamped supersession from a genuine
contradiction. Output `ContradictionFinding[]` and `SupersessionNote[]`
importable by callers that compose a full `LintReport` (defined in `lint.ts`
by WP01), citing muster's published rubric (C-002). Byte-stable deterministic
output (NFR-001). The linter never flags a valid supersession as a contradiction.

## Context (read first)

- Spec: `kitty-specs/memory-adapter-01KTYMCD/spec.md` — FR-004, FR-010; acceptance
  scenarios 2, 3, 4; edge cases (supersession vs contradiction).
- Data model: `kitty-specs/memory-adapter-01KTYMCD/data-model.md` —
  `ContradictionFinding`, `SupersessionNote`, `LintReport` (full); invariants on
  the contradiction/supersession distinction.
- Plan: `kitty-specs/memory-adapter-01KTYMCD/plan.md` — WP02 outline.
- WP01 output: `FactParser`, `StalenessLinter`, `MemoryFact`, and `LintReport`
  are complete in `lint.ts`. This WP creates `contradiction.ts` as its own
  module, importing `MemoryFact` and `LintReport` from `lint.ts` (read-only
  import — do NOT modify `lint.ts`). A later WP (WP05) composes the staleness
  and contradiction results into the final `LintReport`.

**Hard rules for this WP**:
1. `ContradictionLinter` must not flag a pair where the newer fact has a later
   `timestamp` and covers the same topic — record it as a `SupersessionNote`
   (data-model invariant; spec edge case). The linter must compare `timestamp`
   fields where available.
2. All `ContradictionFinding` values carry a `rubricCitation` referencing
   muster's published rubric (C-002); import and reuse the `RUBRIC_CITATION`
   constant from `lint.ts` (WP01).
3. Byte-stable output: findings must be sorted by `factAId` then `factBId` in
   UTF-16 code-unit order before serialisation (NFR-001).
4. Touch only files in `owned_files`. `src/core/` boundary intact (C-001).
   `lint.ts` and `lint.test.ts` are WP01's files — do NOT modify them.
5. All contradiction tests live in `tests/unit/memory/contradiction.test.ts`
   (owned by this WP). `lint.test.ts` staleness tests are unaffected.

## Subtasks

### T006 — Create `ContradictionLinter` in `src/adapters/memory/contradiction.ts`

**Purpose**: create `contradiction.ts` as its own module exporting
`ContradictionLinter` that detects cross-file and intra-file contradictions and
distinguishes supersession. Results are returned as a partial record that a
caller (WP05) merges into a full `LintReport`.

**Steps**:
1. Create `src/adapters/memory/contradiction.ts`. Import `MemoryFact`,
   `LintReport`, and `RUBRIC_CITATION` from `./lint` (read-only import — do NOT
   modify `lint.ts`). Define `ContradictionFinding` and `SupersessionNote`
   interfaces in this file per the data model:
   ```ts
   import type { MemoryFact, LintReport, RUBRIC_CITATION } from './lint';

   export interface ContradictionFinding {
     kind: 'contradiction';
     factAId: string;
     factBId: string;
     factASource: 'MEMORY.md' | 'USER.md';
     factBSource: 'MEMORY.md' | 'USER.md';
     factAText: string;
     factBText: string;
     rubricCitation: string;
   }
   export interface SupersessionNote {
     kind: 'supersession';
     supersededFactId: string;
     supersedingFactId: string;
     note: string;
   }
   ```
   Note: `LintReport` is defined (and owned) by WP01 in `lint.ts`; import it
   but do not redeclare or extend it here.
2. Export `ContradictionLinter` with method:
   ```ts
   lint(memoryFacts: MemoryFact[], userFacts: MemoryFact[]): Pick<LintReport, 'contradictionFindings' | 'supersessionNotes'>
   ```
   The method takes the two parsed fact arrays separately so callers (WP05) can
   combine results with the staleness lint result to produce a final `LintReport`.
3. **Contradiction detection algorithm**:
   a. Build the full set of fact pairs: MEMORY×USER (cross-file) + MEMORY×MEMORY
      (intra-file). Do not generate USER×USER pairs (USER.md does not contradict
      itself in the rubric).
   b. For each pair `(factA, factB)` with the same topic (detected by semantic
      keyword overlap — at minimum, check if the core subject noun appears in
      both texts using a simple case-folded word intersection; do not use an
      external NLP library):
      - If both facts have `timestamp` values and `factB.timestamp > factA.timestamp`,
        emit a `SupersessionNote` (not a finding). If `factA.timestamp > factB.timestamp`,
        swap the roles so the newer fact is always the superseding one.
      - If neither has a timestamp, or timestamps are equal, and the facts assert
        contradictory values for the same subject, emit a `ContradictionFinding`.
   c. Sort `contradictionFindings` by `factAId` then `factBId` using UTF-16
      code-unit ordering (same pattern as T001's `id` generation): ensures
      byte-stable output (NFR-001).
4. `rubricCitation` in each `ContradictionFinding` must use the `RUBRIC_CITATION`
   constant imported from `lint.ts` (C-002).
5. The linter is deterministic: no `Math.random()`, no `Date.now()`, no
   locale-dependent collation.

**Files**: `src/adapters/memory/contradiction.ts` (new)

**Validation (FR-004)**:
- Cross-file contradictory fixture produces at least one `ContradictionFinding`
  with `factASource !== factBSource`.
- Intra-file contradictory fixture produces at least one `ContradictionFinding`
  with `factASource === factBSource === 'MEMORY.md'`.
- Superseded pair (newer timestamp) produces `SupersessionNote` only, no finding.
- Clean fixture produces `contradictionFindings.length === 0`.

---

### T007 — Fixtures: `tests/fixtures/memory/contradictory/`

**Purpose**: provide fixture files for contradiction and supersession testing.

**Steps**:
1. Create `tests/fixtures/memory/contradictory/MEMORY.md`. Include:
   - One fact that contradicts a fact in `USER.md` (e.g., MEMORY says
     "preferred contact: email"; USER.md says "preferred contact: phone"). This
     exercises the cross-file path.
   - Two internally contradictory facts within `MEMORY.md` itself (same subject,
     mutually exclusive values, no timestamps). This exercises the intra-file path.
   - One fact pair where the newer fact has a later ISO 8601 timestamp and
     supersedes the older one (same subject). This must NOT produce a finding.
2. Create `tests/fixtures/memory/contradictory/USER.md`. Include:
   - The fact that contradicts the MEMORY.md fact above (cross-file trigger).
   - Two other non-contradictory facts for body.
3. Create `tests/fixtures/memory/contradictory/manifest.json` labelling all facts
   with `private: false` and `timeSensitive: false` (except the supersession
   pair, which can be `timeSensitive: true` with dates embedded in the text).
4. Design the content to be clearly parseable by a simple keyword-overlap
   detector: use the same subject noun in both contradictory facts (e.g.,
   "contact method: X" vs "contact method: Y").

**Files**:
- `tests/fixtures/memory/contradictory/MEMORY.md` (new)
- `tests/fixtures/memory/contradictory/USER.md` (new)
- `tests/fixtures/memory/contradictory/manifest.json` (new)

**Validation**: `FactParser` produces `MemoryFact[]` for both files; `id` values
match manifest labels; the supersession pair has parseable timestamps.

---

### T008 — Unit tests: `tests/unit/memory/contradiction.test.ts`

**Purpose**: exercise `ContradictionLinter` with the contradictory fixture set
from T007. Lives in its own file — do NOT touch `tests/unit/memory/lint.test.ts`
(WP01's file).

**Steps**:
1. Create `tests/unit/memory/contradiction.test.ts`. Import `FactParser` from
   `src/adapters/memory/lint` and `ContradictionLinter` from
   `src/adapters/memory/contradiction`.
2. **Cross-file contradiction test** (acceptance scenario 2, FR-004):
   - Parse `tests/fixtures/memory/contradictory/MEMORY.md` and
     `tests/fixtures/memory/contradictory/USER.md` with their manifest.
   - Call `ContradictionLinter.lint(memoryFacts, userFacts)`.
   - Assert at least one `ContradictionFinding` where
     `factASource !== factBSource`.
   - Assert `finding.rubricCitation` is a non-empty string (C-002).
3. **Intra-file contradiction test** (acceptance scenario 3, FR-004):
   - Same fixture, same call.
   - Assert at least one `ContradictionFinding` where
     `factASource === factBSource === 'MEMORY.md'`.
4. **Supersession not flagged test** (edge case, FR-004):
   - Same fixture.
   - Identify the supersession pair by known `id`s (documented in the fixture
     manifest or test comment).
   - Assert `contradictionFindings` contains no entry for that pair.
   - Assert `supersessionNotes.length >= 1` for that pair.
5. **Clean set test** (acceptance scenario 4, FR-004):
   - Parse `tests/fixtures/memory/consistent/MEMORY.md` and
     `tests/fixtures/memory/consistent/USER.md` (WP01 fixtures — read-only here).
   - Assert `contradictionFindings.length === 0`.
   - Assert `supersessionNotes.length === 0`.
6. **Byte-stability test** (NFR-001):
   - Run contradiction lint twice on the contradictory fixture.
   - Assert `JSON.stringify(r1.contradictionFindings) === JSON.stringify(r2.contradictionFindings)`.
7. **Rigged-impossible discrimination control** (FR-009):
   - Create two fact arrays where all subjects are disjoint (no shared keywords).
   - Assert `contradictionFindings.length === 0` — the linter cannot invent
     contradictions from unrelated facts.

**Files**: `tests/unit/memory/contradiction.test.ts` (new)

**Validation**: `pnpm test -- tests/unit/memory/contradiction.test.ts` green;
all seven contradiction-branch cases pass; `lint.test.ts` is unmodified.

---

### T009 — WP02 verification

**Purpose**: gate the Definition of Done.

**Steps** (run in order):
```bash
pnpm build                   # strict tsc — zero errors
pnpm test                    # full suite — zero failures, zero new skips
pnpm test -- tests/unit/memory/contradiction.test.ts  # targeted confirmation
# Byte-stability check (NFR-001):
node -e "
const { FactParser } = require('./dist/adapters/memory/lint.js');
const { ContradictionLinter } = require('./dist/adapters/memory/contradiction.js');
const fp = new FactParser();
const cl = new ContradictionLinter();
const mf = require('./tests/fixtures/memory/contradictory/manifest.json');
const mem = fp.parse('tests/fixtures/memory/contradictory/MEMORY.md', mf);
const usr = fp.parse('tests/fixtures/memory/contradictory/USER.md', mf);
const r1 = cl.lint(mem, usr);
const r2 = cl.lint(mem, usr);
if (JSON.stringify(r1) !== JSON.stringify(r2)) { console.error('BYTE UNSTABLE'); process.exit(1); }
console.log('BYTE STABLE OK');
"
git diff --stat HEAD   # only owned_files changed
```

**Validation**: all commands exit 0; `BYTE STABLE OK` printed; git diff shows
only files from `owned_files`; WP01 staleness tests still pass.

---

## Definition of Done

- [ ] `ContradictionLinter.lint` produces `ContradictionFinding` for cross-file contradictions
- [ ] `ContradictionLinter.lint` produces `ContradictionFinding` for intra-file contradictions
- [ ] Supersession pair (newer timestamp) produces `SupersessionNote` only — no `ContradictionFinding`
- [ ] Clean fixture returns `contradictionFindings.length === 0`
- [ ] Byte-stability check (T009) passes: identical JSON output on two runs
- [ ] All `ContradictionFinding` values carry a non-empty `rubricCitation` (C-002)
- [ ] Findings sorted deterministically (UTF-16 code-unit order on factAId/factBId)
- [ ] `pnpm build` (strict tsc) + `pnpm test` green; `lint.ts` and `lint.test.ts` (WP01) unmodified
- [ ] No `src/core/` modification; adapter boundary intact (C-001)
- [ ] SonarCloud coverage gate condition: ≥ 80% line coverage on new code (NFR-006)

## Reviewer guidance

- **Reject if** the supersession test (T008 step 4) is missing or the
  supersession pair is flagged as a `ContradictionFinding`.
- Verify the sorting logic: findings must be sorted by `factAId` → `factBId` in
  code-unit order; a randomly ordered output is a byte-stability failure.
- Confirm `lint.ts` and `lint.test.ts` are unmodified — run
  `git diff HEAD -- src/adapters/memory/lint.ts tests/unit/memory/lint.test.ts`
  and confirm no changes.
- Confirm `rubricCitation` is the shared `RUBRIC_CITATION` constant imported from
  `lint.ts`, not a different string.
- Confirm all new source code lives in `src/adapters/memory/contradiction.ts` and
  all new tests live in `tests/unit/memory/contradiction.test.ts`.
- Byte-stability evidence (T009) must appear in the activity log.
