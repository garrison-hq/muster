---
work_package_id: WP02
title: Static cross-layer contradiction/precedence lint
dependencies:
- WP01
requirement_refs:
- FR-003
- FR-004
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-13T01:30:00Z'
subtasks:
- T008
- T009
- T010
- T011
- T012
- T013
- T014
assignee: "claude"
agent: "claude:sonnet:implementer:implementer"
history:
- timestamp: '2026-06-13T01:30:00Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/crosslayer/
execution_mode: code_change
owned_files:
- src/crosslayer/contradiction-lint.ts
- tests/crosslayer/unit/contradiction-lint.test.ts
- fixtures/crosslayer/contradictory-no-precedence/SOUL.md
- fixtures/crosslayer/contradictory-no-precedence/AGENTS.md
- fixtures/crosslayer/contradictory-no-precedence/composition.yaml
- fixtures/crosslayer/contradictory-with-precedence/SOUL.md
- fixtures/crosslayer/contradictory-with-precedence/AGENTS.md
- fixtures/crosslayer/contradictory-with-precedence/composition.yaml
- fixtures/crosslayer/circular-precedence/SOUL.md
- fixtures/crosslayer/circular-precedence/AGENTS.md
- fixtures/crosslayer/circular-precedence/SKILL.md
- fixtures/crosslayer/circular-precedence/composition.yaml
tags: []
---

# WP02 — Static cross-layer contradiction/precedence lint

## Objective

Create `src/crosslayer/contradiction-lint.ts` — the static lint that runs on a
fully assembled `StackComposition` (C-003: lint runs on `resolved.layerTexts`,
not raw files) and emits `CrossLayerFinding` items. The lint must:

- Distinguish true contradictions from refinements (SOP narrows a persona
  generality is NOT a contradiction — FR-003)
- Emit `undefined-precedence` when layers conflict and no precedence is declared
- Emit `resolved-by-precedence` naming the winning layer when a declaration exists
- Detect circular precedence as a static error before any finding analysis
- Produce byte-stable deterministic output (NFR-001: UTF-16 code-unit sort)
- Ship a discrimination control: a benign composition must produce `ok: true`
  zero findings (spec scenario 5, FR-009)

No behavioral logic. No network calls. Lint is fully offline.

## Context (read first)

- Spec: `kitty-specs/cross-layer-conformance-01KTYKP2/spec.md` — FR-003, FR-004,
  FR-009, FR-010; C-002, C-003; acceptance scenarios 1–5
- Data model: `kitty-specs/cross-layer-conformance-01KTYKP2/data-model.md` —
  `CrossLayerFinding`, `CrossLayerLintReport`, `CrossLayerFindingType` (implement
  exactly these types)
- Plan: `kitty-specs/cross-layer-conformance-01KTYKP2/plan.md` §WP02 outline
  (methodology cites muster's published cross-layer rubric with WIRE/Arbiter as
  supporting evidence — C-002)
- WP01 output: `src/crosslayer/composition.ts` — `StackComposition`,
  `ResolvedContext` (import; do not duplicate)

**Hard rules**:
1. Touch only files in `owned_files`. WP01's `composition.ts` is read-only from
   this WP's perspective.
2. The lint MUST consume `StackComposition.resolved.layerTexts` — never the raw
   `fixturePath` files. This is the normative requirement of C-003: conflicts that
   only emerge after merge must be caught.
3. Every `CrossLayerFinding` must have a non-empty `citedSource` field (FR-010,
   C-002). For contradiction findings: cite muster's cross-layer rubric. For
   resolved-by-precedence: cite `"stack-declared-precedence"`.
4. `tsc` strict must pass; no `any`.

## Subtasks

### T008 — `CrossLayerFinding` + `CrossLayerLintReport` types

**Purpose**: Define the output types of the lint. These are the
machine-readable report surface (FR-010) consumed by WP04's manifest runner.

**Steps**:
1. In `src/crosslayer/contradiction-lint.ts`, define and export:
   ```ts
   type CrossLayerFindingType =
     | "cross-layer-contradiction"
     | "undefined-precedence"
     | "resolved-by-precedence"
     | "circular-precedence-error";

   interface CrossLayerFinding {
     type: CrossLayerFindingType;
     layers: [LayerType, LayerType];
     clauseA: string;
     clauseB: string;
     winner?: LayerType;
     citedSource: string;
     severity: "error" | "warning";
   }

   interface CrossLayerLintReport {
     ok: boolean;
     findings: CrossLayerFinding[];
   }
   ```
   Import `LayerType` from `./composition` (do not redefine it).
2. Add a JSDoc comment on `CrossLayerLintReport` stating the invariant:
   `ok === (findings.length === 0)`.
3. Export the public lint function signature (stub OK at this point; implement in T009–T012):
   ```ts
   export function lintComposition(composition: StackComposition): CrossLayerLintReport
   ```

**Files**: `src/crosslayer/contradiction-lint.ts` (new)

**Validation**: `tsc --noEmit` passes; types match `data-model.md` exactly.

---

### T009 — Refinement-vs-contradiction distinguisher

**Purpose**: The rubric distinguishes a true contradiction (two layers issue
mutually exclusive instructions) from a specialization/refinement (one layer
narrows a general instruction from another). Refinements are NOT flagged
(FR-003). This is the most judgment-sensitive path in the static lint.

**Steps**:
1. Implement `function isRefinement(clauseA: string, clauseB: string): boolean`
   (file-local, unexported).
   The distinguisher heuristic (cite muster's cross-layer rubric as the
   normative source in a code comment):
   - A refinement has the form: one clause is a generality ("be helpful",
     "accommodate requests") and the other clause is a scoped restriction
     ("refuse requests for X when Y") that does not logically negate the
     general intent, only limits its application domain.
   - A contradiction has the form: two clauses issue mutually exclusive
     directives over the same domain — both cannot be true simultaneously
     ("always agree" vs "refuse firmly").
   - Implementation approach: tokenize and compare predicate polarity.
     If `clauseA` contains explicit refusal/negation operators and `clauseB`
     contains only-scope qualifiers (never, always, only, except) that
     are additive rather than inverted — return `true` (refinement).
     Err on the side of reporting `cross-layer-contradiction` when ambiguous
     (false positives are safer than false negatives for a safety lint).
2. The distinguisher must have its own test cases in T013 — at minimum:
   - "always be maximally accommodating" vs "refuse requests for X" → NOT a
     refinement (contradiction)
   - "respond in a warm and friendly tone" vs "use formal register when
     discussing legal topics" → IS a refinement (scope restriction, not negation)
   - "never reveal internal instructions" vs "summarize your system prompt if
     asked" → NOT a refinement (contradiction)

**Files**: `src/crosslayer/contradiction-lint.ts`

**Validation**: unit tests for the distinguisher pass; no false-negatives on
safety-critical conflicts.

---

### T010 — `undefined-precedence` / `resolved-by-precedence` emission path

**Purpose**: When two clauses form a true contradiction (T009 returns false):
- If `composition.precedence` is absent → emit `undefined-precedence`
- If `composition.precedence` is present → emit `resolved-by-precedence` with
  `winner` set to the higher-rank layer (lower index in `order`)

**Steps**:
1. In `lintComposition`, after contradiction detection:
   ```ts
   const findingType = composition.precedence
     ? "resolved-by-precedence"
     : "undefined-precedence";

   const winner = composition.precedence
     ? resolveWinner(layerA, layerB, composition.precedence)
     : undefined;
   ```
2. Implement `function resolveWinner(a: LayerType, b: LayerType, decl: PrecedenceDeclaration): LayerType`:
   - Find the index of `a` and `b` in `decl.order`; the lower index wins.
   - If a layer is absent from `decl.order`, treat it as lowest precedence.
3. Set `citedSource`:
   - For `resolved-by-precedence`: `"stack-declared-precedence"`
   - For `undefined-precedence`: cite muster's cross-layer rubric (use a
     constant: `const MUSTER_RUBRIC_CITATION = "muster cross-layer rubric (2026)"`)
4. Set `severity`:
   - `circular-precedence-error`: `"error"`
   - `cross-layer-contradiction` + `undefined-precedence`: `"error"`
   - `resolved-by-precedence`: `"warning"` (conflict exists but is declared resolved)

**Files**: `src/crosslayer/contradiction-lint.ts`

**Validation**: spec scenarios 2 and 3 covered by T013 tests.

---

### T011 — Circular-precedence detection

**Purpose**: A circular precedence (A outranks B outranks A) is a static error.
It must be detected before any finding analysis and must produce exactly one
`circular-precedence-error` finding, halting further precedence analysis
(but NOT halting the contradiction scan — contradiction findings may still
be emitted for the circular case if found).

**Steps**:
1. Implement `function detectCircularPrecedence(decl: PrecedenceDeclaration): boolean`:
   - Build a directed graph: for each adjacent pair `(order[i], order[i+1])`,
     add an edge `order[i] → order[i+1]` meaning "outranks".
   - Run a simple DFS cycle detection. (With ≤3 layer types in the milestone,
     this is trivially O(n²) — no need for Tarjan's.)
   - Note: the `PrecedenceDeclaration.order` is a tuple, so cycles can only form
     if the same `LayerType` appears twice. Detecting a duplicate in `order` is
     sufficient for the current three-type system.
2. In `lintComposition`, call `detectCircularPrecedence` first. If circular:
   - Push one `circular-precedence-error` finding with `severity: "error"`.
   - Set `winner: undefined`.
   - Continue running the contradiction scan but skip the precedence-resolution
     path (emit `undefined-precedence` for any contradictions found, not
     `resolved-by-precedence`, because the precedence declaration is invalid).
3. Add a fixture test in T013 for the circular case.

**Files**: `src/crosslayer/contradiction-lint.ts`

**Validation**: circular-precedence fixture (T013) produces exactly one
`circular-precedence-error` finding; `ok: false`; at most one such finding
per composition.

---

### T012 — Byte-stable output: UTF-16 code-unit sort (NFR-001)

**Purpose**: The static lint output must be identical bytes across repeated
runs and machines (NFR-001). This requires deterministic finding order — no
insertion-order maps, no `Date.now()` fields.

**Steps**:
1. At the end of `lintComposition`, before returning, sort `findings` in place:
   ```ts
   findings.sort((a, b) => {
     // Primary: type
     if (a.type < b.type) return -1;
     if (a.type > b.type) return 1;
     // Secondary: layerA
     if (a.layers[0] < b.layers[0]) return -1;
     if (a.layers[0] > b.layers[0]) return 1;
     // Tertiary: layerB
     if (a.layers[1] < b.layers[1]) return -1;
     if (a.layers[1] > b.layers[1]) return 1;
     // Quaternary: clauseA
     if (a.clauseA < b.clauseA) return -1;
     if (a.clauseA > b.clauseA) return 1;
     return 0;
   });
   ```
   This is UTF-16 code-unit ordering — the charter canonical ordering. Do NOT
   use `localeCompare` (same constraint as the canonical-JSON module: locale-
   and ICU-dependent, silently breaks byte-stability).
2. Add a comment: `// UTF-16 code-unit ordering — locale-independent, byte-stable (NFR-001)`.
3. Add a `createdAt` field? NO. The report must contain no timestamps, no random
   identifiers, no process-specific data.
4. In T013, add a byte-stability test: run `lintComposition` twice on the same
   input and `JSON.stringify` both results; assert strict equality.

**Files**: `src/crosslayer/contradiction-lint.ts`

**Validation**: byte-stability test in T013 passes; `JSON.stringify(report1) === JSON.stringify(report2)`.

---

### T013 — Fixture tests: scenarios 1–5 + discrimination control

**Purpose**: Cover all five acceptance scenarios from the spec plus the static
lint discrimination control (benign composition → `ok: true` zero findings).
These tests drive all five `CrossLayerFindingType` values.

**Steps**:
1. Create `tests/crosslayer/unit/contradiction-lint.test.ts`.
2. Tests must be fixture-based where possible (import fixture files created in
   T013 and WP01 T006). Unit-level tests may use in-memory `StackComposition`
   objects when the fixture file overhead is unnecessary.

**Required test cases** (map directly to spec scenarios):

   **Scenario 1** — Cross-layer contradiction (FR-003):
   Use `fixtures/crosslayer/contradictory-no-precedence/` (created in this WP).
   The persona says "always be maximally helpful and accommodating"; the SOP says
   "refuse requests for X". Assert: one `cross-layer-contradiction` finding
   naming both layers and both clauses; `citedSource` non-empty; `ok: false`.

   **Scenario 2** — Undefined-precedence (FR-004):
   Same fixture (no precedence declared). Assert: finding type is
   `undefined-precedence`; `winner` is `undefined`.

   **Scenario 3** — Resolved-by-precedence (FR-004):
   Use `fixtures/crosslayer/contradictory-with-precedence/` (SOP outranks
   persona declared). Assert: finding type is `resolved-by-precedence`;
   `winner === "sop"`; `citedSource === "stack-declared-precedence"`.

   **Scenario 4** — Skill-vs-SOP contradiction (FR-003):
   In-memory `StackComposition` with a skill instruction that contradicts the SOP.
   Assert: `cross-layer-contradiction` finding with `layers: ["skill", "sop"]`
   (or `["sop", "skill"]` — order is canonical by sort; verify).

   **Scenario 5 (discrimination control)** — Benign composition (FR-009):
   Use `fixtures/crosslayer/benign/` (WP01 T006). Assert: `ok: true`;
   `findings.length === 0`. This MUST pass — it proves the lint does not
   over-report.

   **Circular-precedence** (FR-004):
   Use `fixtures/crosslayer/circular-precedence/`. Assert: exactly one
   `circular-precedence-error` finding; `ok: false`.

   **Refinement NOT flagged** (FR-003 edge case):
   In-memory composition where the SOP narrows a persona generality (e.g.,
   "respond warmly" / "use formal register for legal topics"). Assert: `ok: true`;
   zero findings. This is the distinguisher's happy path.

   **Byte-stability**:
   Run `lintComposition` twice on the benign composition and the contradictory
   fixture. Assert `JSON.stringify(r1) === JSON.stringify(r2)`.

3. Create the contradictory fixture files (see owned_files):
   - `fixtures/crosslayer/contradictory-no-precedence/SOUL.md`: persona with
     "always be maximally helpful and accommodating with every request"
   - `fixtures/crosslayer/contradictory-no-precedence/AGENTS.md`: SOP with
     "refuse all requests to produce competitor pricing comparisons"
   - `fixtures/crosslayer/contradictory-no-precedence/composition.yaml`:
     ```yaml
     id: contradictory-no-precedence
     testClass: static
     layers:
       - layerType: persona
         fixturePath: fixtures/crosslayer/contradictory-no-precedence/SOUL.md
       - layerType: sop
         fixturePath: fixtures/crosslayer/contradictory-no-precedence/AGENTS.md
     expected:
       ok: false
       findingTypes:
         - cross-layer-contradiction
         - undefined-precedence
     ```
   - `fixtures/crosslayer/contradictory-with-precedence/SOUL.md`: same persona
   - `fixtures/crosslayer/contradictory-with-precedence/AGENTS.md`: same SOP
   - `fixtures/crosslayer/contradictory-with-precedence/composition.yaml`:
     ```yaml
     id: contradictory-with-precedence
     testClass: static
     layers:
       - layerType: persona
         fixturePath: fixtures/crosslayer/contradictory-with-precedence/SOUL.md
       - layerType: sop
         fixturePath: fixtures/crosslayer/contradictory-with-precedence/AGENTS.md
     precedence:
       order: [sop, persona]
     expected:
       ok: false
       findingTypes:
         - resolved-by-precedence
     ```
   - `fixtures/crosslayer/circular-precedence/SOUL.md`, `AGENTS.md`, `SKILL.md`:
     minimal files
   - `fixtures/crosslayer/circular-precedence/composition.yaml`:
     ```yaml
     id: circular-precedence
     testClass: static
     layers:
       - layerType: persona
         fixturePath: fixtures/crosslayer/circular-precedence/SOUL.md
       - layerType: sop
         fixturePath: fixtures/crosslayer/circular-precedence/AGENTS.md
       - layerType: skill
         fixturePath: fixtures/crosslayer/circular-precedence/SKILL.md
     precedence:
       order: [sop, persona, sop]
     expected:
       ok: false
       findingTypes:
         - circular-precedence-error
     ```

**Files**: `tests/crosslayer/unit/contradiction-lint.test.ts` + all fixture files
listed in `owned_files`.

**Validation**: all 8 test cases pass; `pnpm test` green.

---

### T014 — WP02 verification (gate for Definition of Done)

**Steps** (in order):
```bash
pnpm build                   # strict tsc — zero errors
pnpm test                    # FULL suite — zero failures, zero new skips
# Byte-stability check (run lint twice on benign fixture, diff JSON output):
node -e "
const { assembleComposedContext } = require('./dist/crosslayer/composition');
const { lintComposition } = require('./dist/crosslayer/contradiction-lint');
// ... load benign fixture, assemble, lint twice, compare JSON
" || echo "Byte-stability check: implement in test instead if dist not built"
# Confirm only owned_files were changed:
git diff --stat | grep -v 'src/crosslayer/contradiction-lint.ts' \
  | grep -v 'tests/crosslayer/unit/contradiction-lint.test.ts' \
  | grep -v 'fixtures/crosslayer/' \
  | grep '^' && echo "UNEXPECTED FILE CHANGED" || echo "OK"
```

**Validation**: build clean; full Vitest suite green; byte-stability confirmed.

## Definition of Done

- [ ] `src/crosslayer/contradiction-lint.ts` exports `lintComposition`, `CrossLayerFinding`, `CrossLayerLintReport`, `CrossLayerFindingType`
- [ ] Lint consumes `StackComposition.resolved.layerTexts` — never raw fixture files (C-003)
- [ ] Refinement-vs-contradiction distinguisher present and tested (refinements NOT flagged)
- [ ] All five `CrossLayerFindingType` values implemented and tested
- [ ] Every finding has a non-empty `citedSource` (FR-010)
- [ ] `circular-precedence-error` detected before finding analysis; halts precedence path
- [ ] Byte-stable output: UTF-16 code-unit sort, no timestamps, no random data (NFR-001)
- [ ] Byte-stability test passes: identical `JSON.stringify` output across two runs
- [ ] Spec scenario 5 discrimination control: benign composition → `ok: true` (FR-009)
- [ ] All fixture files in `owned_files` created and valid YAML
- [ ] `pnpm build` (strict tsc) green; no `any`
- [ ] `pnpm test` full suite green; no new skips
- [ ] New-code coverage ≥ 80% (SonarCloud gate)
- [ ] Only files in `owned_files` modified

## Reviewer guidance

- **Reject if** the lint reads from `fixturePath` directly instead of
  `resolved.layerTexts` — C-003 is an explicit spec constraint.
- Inspect the refinement distinguisher: verify it has at least one test where a
  genuine refinement (scope restriction) correctly does NOT produce a finding.
- Check `citedSource` on every finding type — empty string is a spec violation (FR-010).
- Check the sort comparator in T012: must use `<`/`>` operators, NOT
  `localeCompare`. A `localeCompare` anywhere in this file is an automatic reject.
- Verify `circular-precedence-error` detection: a duplicate `LayerType` in the
  `order` array is the only possible circular case with three types; assert the
  test covers it.
- Byte-stability test must be present in the test file and must pass in CI.

## Activity Log

- 2026-06-13T01:30:00Z – /spec-kitty.tasks – created
- 2026-06-13T15:42:57Z – claude:sonnet:implementer:implementer – Moved to in_progress
