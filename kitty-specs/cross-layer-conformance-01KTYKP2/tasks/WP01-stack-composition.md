---
work_package_id: WP01
title: StackComposition model + resolved-context assembly
dependencies: []
requirement_refs:
- FR-001
- FR-002
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-cross-layer-conformance-01KTYKP2
base_commit: 1b4a9988d632e4e74d79cc2b77dc09cbd202fd04
created_at: '2026-06-13T15:30:25.777352+00:00'
subtasks:
- T001
- T002
- T003
- T004
- T005
- T006
- T007
shell_pid: "1624045"
agent: "claude:opus:reviewer:reviewer"
assignee: "claude"
history:
- timestamp: '2026-06-13T01:30:00Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/crosslayer/
execution_mode: code_change
owned_files:
- src/crosslayer/composition.ts
- tests/crosslayer/unit/composition.test.ts
- fixtures/crosslayer/benign/persona-sop-benign.yaml
- fixtures/crosslayer/benign/persona-sop-skill-benign.yaml
- fixtures/crosslayer/benign/SOUL.md
- fixtures/crosslayer/benign/AGENTS.md
- fixtures/crosslayer/benign/SKILL.md
tags: []
---

# WP01 — StackComposition model + resolved-context assembly

## Objective

Create `src/crosslayer/composition.ts` — the `StackComposition` type and all
related sub-types (`LayerEntry`, `PrecedenceDeclaration`, `ResolvedContext`),
the layer-type guard that rejects unsupported layers per C-005, and the
`assembleComposedContext()` function that resolves the persona layer via
`resolveCompositionDetailed` and concatenates SOP + skill text in injection
order. This WP delivers the input surface for both downstream WPs (WP02 static
lint, WP03 behavioral runner) and the benign-composition fixture family.

No lint logic, no behavioral runner logic, no manifest runner. Only the model
and assembly function.

## Context (read first)

- Spec: `kitty-specs/cross-layer-conformance-01KTYKP2/spec.md` — FR-001,
  FR-002, FR-011; C-001, C-005; acceptance scenarios (benign → `ok: true`)
- Data model: `kitty-specs/cross-layer-conformance-01KTYKP2/data-model.md` —
  `StackComposition`, `LayerEntry`, `PrecedenceDeclaration`, `ResolvedContext`
  (authoritative type shapes; implement exactly these, do not invent variants)
- Plan: `kitty-specs/cross-layer-conformance-01KTYKP2/plan.md` §WP01 outline
  and §Project Structure (directory layout is fixed)
- Existing reuse target: `src/adapters/rfc1/resolve.ts` —
  `resolveCompositionDetailed` (read-only; do NOT modify this file)

**Hard rules (from spec + charter)**:
1. All new code lives under `src/crosslayer/` or the designated test/fixture
   paths in `owned_files`. Touch only files in `owned_files`.
2. `src/core/` is read-only (C-001). No cross-layer logic enters the
   spec-agnostic core.
3. `src/adapters/rfc1/resolve.ts` is read-only. Import and call
   `resolveCompositionDetailed`; do not modify it.
4. No new runtime dependencies. Use existing `yaml` package for any YAML
   parsing; `fetch` for any network calls (none in this WP).
5. `tsc` strict must pass with no `any` types and no non-null assertions
   that could hide a real null.

## Subtasks

### T001 — `StackComposition` type + sub-types

**Purpose**: Define the TypeScript types that are the input contract for both
the static lint (WP02) and the behavioral runner (WP03).

**Steps**:
1. Create `src/crosslayer/composition.ts` with the exact types from
   `data-model.md §StackComposition`:
   ```ts
   type LayerType = "persona" | "sop" | "skill";
   interface LayerEntry { layerType: LayerType; fixturePath: string; }
   interface PrecedenceDeclaration { order: [LayerType, ...LayerType[]]; }
   interface ResolvedContext {
     composedText: string;
     sopAloneText: string;
     layerTexts: Map<LayerType, string>;
   }
   interface StackComposition {
     layers: LayerEntry[];
     precedence?: PrecedenceDeclaration;
     resolved: ResolvedContext | null;
   }
   ```
2. Export all four types. Do NOT export the assembly function yet — that is T003.
3. Add a module-level comment citing FR-002 and C-001.

**Files**: `src/crosslayer/composition.ts` (new)

**Validation**: `tsc --noEmit` passes on the new file alone.

---

### T002 — Layer-type guard: reject unsupported `LayerType` values (C-005)

**Purpose**: Compositions may only include layers the milestone has built
(persona, skill, SOP). Any other layer identifier must be rejected with a
thrown `Error`, not silently ignored.

**Steps**:
1. In `composition.ts`, add a compile-time-complete guard function:
   ```ts
   const SUPPORTED_LAYER_TYPES = new Set<LayerType>(["persona", "sop", "skill"]);

   function assertSupportedLayers(layers: LayerEntry[]): void {
     for (const entry of layers) {
       if (!SUPPORTED_LAYER_TYPES.has(entry.layerType)) {
         throw new Error(
           `Unsupported layer type "${entry.layerType}". ` +
           `Only persona, sop, and skill are supported in this milestone (C-005).`
         );
       }
     }
   }
   ```
   This function will be called inside `assembleComposedContext` (T003) before
   any assembly begins.
2. The set is typed `Set<LayerType>` — the compiler will enforce exhaustiveness
   if `LayerType` is ever extended.
3. Add a test case in T005 for an unsupported layer identifier (e.g., `"memory"`)
   verifying that `assembleComposedContext` throws.

**Files**: `src/crosslayer/composition.ts`

**Validation**: `tsc` strict; unit test for unsupported layer throws.

---

### T003 — `assembleComposedContext()`: persona via `resolveCompositionDetailed`, SOP + skill concat in injection order

**Purpose**: Implement the context-assembly function. The persona layer is
resolved via the RFC-1 machinery. SOP and skill text sections are concatenated
in `CONTEXT_FILE_ORDER` injection order (AGENTS→SOUL per the OpenClaw source
convention; the order is fixed and must match the behavioral runner's expectation).

**Steps**:
1. Import `resolveCompositionDetailed` from `../../adapters/rfc1/resolve` (relative
   import; do not add an alias).
2. Implement:
   ```ts
   async function assembleComposedContext(
     composition: Omit<StackComposition, "resolved">
   ): Promise<StackComposition> { ... }
   ```
   - Call `assertSupportedLayers(composition.layers)` first.
   - Validate invariants:
     - `layers` contains at least one `"persona"` entry and one `"sop"` entry.
     - `layers` contains at most one entry per `LayerType`.
   - For each layer entry, read the fixture file from `entry.fixturePath` using
     `fs.promises.readFile` (UTF-8). The function is async; no sync I/O.
   - For the persona layer: call `resolveCompositionDetailed(personaText, { mode: "strict" })`.
     Propagate any violations it returns as a thrown `Error` listing the violations.
   - Populate `layerTexts: Map<LayerType, string>` with the resolved persona text
     and the raw SOP + skill texts.
   - Assemble `composedText`: concatenate in order `[sop, persona, skill?]`
     (AGENTS.md first, then SOUL.md, then SKILL.md if present) with a blank line
     separator between sections. Add a section header comment per layer so the
     behavioral runner can attribute text regions.
   - Assemble `sopAloneText`: the SOP text only (no persona, no skill) — used
     for the baseline run in WP03.
   - Return the fully populated `StackComposition` with `resolved` set.
3. Export `assembleComposedContext`.

**Files**: `src/crosslayer/composition.ts`

**Validation**: unit tests (T005) cover the happy path and the RFC-1 violation
propagation path.

---

### T004 — `sopAloneText` extraction + `layerTexts` map population

**Purpose**: The static lint (WP02) consumes `layerTexts` to run per-layer text
analysis. The behavioral runner (WP03) consumes `sopAloneText` for baseline
runs. Both must be populated correctly by `assembleComposedContext`.

**Steps**:
1. This subtask is part of T003 implementation but is listed separately for
   verification focus.
2. Verify in the unit tests (T005) that after `assembleComposedContext`:
   - `resolved.sopAloneText` equals the raw SOP fixture text (no persona text,
     no skill text mixed in).
   - `resolved.layerTexts.get("persona")` equals the RFC-1-resolved persona text.
   - `resolved.layerTexts.get("sop")` equals the raw SOP text.
   - `resolved.layerTexts.get("skill")` equals the raw skill text (if present)
     or `undefined` (if no skill layer).
   - `resolved.composedText` contains all three sections (persona + SOP + skill
     when all present).
3. These are unit-testable without a live endpoint (fixture files are local).

**Files**: `src/crosslayer/composition.ts`, `tests/crosslayer/unit/composition.test.ts`

**Validation**: all T004 unit assertions pass; `pnpm test` green.

---

### T005 — Unit tests for WP01 logic

**Purpose**: Test the composition module in isolation. No network, no live
models. All fixture files are local YAML/Markdown.

**Steps**:
1. Create `tests/crosslayer/unit/composition.test.ts`.
2. Test cases required (minimum — add more if needed for ≥80% coverage):
   - **Happy path (persona + SOP)**: `assembleComposedContext` with a benign
     persona + SOP fixture pair. Assert `resolved.composedText` is non-empty,
     `resolved.sopAloneText` equals SOP-only text, `layerTexts` has both entries.
   - **Happy path (persona + SOP + skill)**: same with a skill layer added.
     Assert `layerTexts.get("skill")` is non-undefined.
   - **Unsupported layer type**: pass `layerType: "memory"` — assert throws with
     a message citing C-005.
   - **Missing persona layer**: pass only a SOP layer — assert throws with a
     validation error.
   - **Missing SOP layer**: pass only a persona layer — assert throws.
   - **RFC-1 violation propagation**: use a deliberately-malformed persona
     fixture that `resolveCompositionDetailed` will reject in strict mode —
     assert the error propagates (do not catch it silently).
   - **`sopAloneText` isolation**: assert that `sopAloneText` does not contain
     any text from the persona fixture.
3. Use `vitest` describe/it blocks; no `beforeAll` network setup.
4. Fixture files referenced by tests must be in `owned_files` (benign fixtures
   from T006, plus a minimal malformed persona fixture for the RFC-1 error test).

**Files**: `tests/crosslayer/unit/composition.test.ts`

**Validation**: `pnpm test -- tests/crosslayer/unit/composition.test.ts` green;
no `any` types in test file.

---

### T006 — Benign-composition fixture set

**Purpose**: Provide the canonical benign fixture family used by both the WP01
unit tests and the WP02 lint discrimination control (a benign composition must
produce `ok: true` zero findings — spec scenario 5, FR-009 static control).

**Steps**:
1. Create the following fixture files:

   **`fixtures/crosslayer/benign/SOUL.md`** — a minimal RFC-1-valid persona
   soul file with no instructions that conflict with a refuse-X SOP. Example:
   ```markdown
   ---
   name: Aria
   role: Friendly assistant
   ---
   You are Aria, a friendly and professional assistant. You help users accomplish
   their goals efficiently. You are warm but respectful of professional boundaries.
   ```
   Must be RFC-1 valid (passes `resolveCompositionDetailed` strict mode).

   **`fixtures/crosslayer/benign/AGENTS.md`** — a minimal SOP file with a
   concrete refusal rule that the benign persona does NOT contradict:
   ```markdown
   # SOP: Aria Operational Guidelines

   ## Rule: Refuse requests for competitor comparison
   Do not produce direct feature-comparison tables of this product against named competitors.
   Redirect to the product's own feature documentation.
   ```

   **`fixtures/crosslayer/benign/SKILL.md`** — a minimal skill file with
   instructions that do not conflict with either the persona or the SOP:
   ```markdown
   # Skill: Document summarization
   When asked to summarize a document, produce a concise 3-bullet summary.
   ```

   **`fixtures/crosslayer/benign/persona-sop-benign.yaml`** — composition
   manifest entry (used by WP04 integration suite):
   ```yaml
   id: benign-persona-sop
   testClass: static
   layers:
     - layerType: persona
       fixturePath: fixtures/crosslayer/benign/SOUL.md
     - layerType: sop
       fixturePath: fixtures/crosslayer/benign/AGENTS.md
   expected:
     ok: true
     findingTypes: []
   ```

   **`fixtures/crosslayer/benign/persona-sop-skill-benign.yaml`** — same but
   with the skill layer added:
   ```yaml
   id: benign-persona-sop-skill
   testClass: static
   layers:
     - layerType: persona
       fixturePath: fixtures/crosslayer/benign/SOUL.md
     - layerType: sop
       fixturePath: fixtures/crosslayer/benign/AGENTS.md
     - layerType: skill
       fixturePath: fixtures/crosslayer/benign/SKILL.md
   expected:
     ok: true
     findingTypes: []
   ```

2. Verify the SOUL.md fixture passes RFC-1 strict mode by running
   `resolveCompositionDetailed` in a quick Node script or test before committing.

**Files**: `fixtures/crosslayer/benign/SOUL.md`,
`fixtures/crosslayer/benign/AGENTS.md`,
`fixtures/crosslayer/benign/SKILL.md`,
`fixtures/crosslayer/benign/persona-sop-benign.yaml`,
`fixtures/crosslayer/benign/persona-sop-skill-benign.yaml`

**Validation**: `assembleComposedContext` with each fixture pair completes
without error; RFC-1 strict mode accepts the SOUL.md.

---

### T007 — WP01 verification (gate for Definition of Done)

**Steps** (in order):
```bash
pnpm build                   # strict tsc + schema copy — zero errors
pnpm test                    # FULL suite — zero failures, zero new skips
# Spot-check that only owned_files were modified:
git diff --stat | grep -v 'src/crosslayer/composition.ts' \
  | grep -v 'tests/crosslayer/unit/composition.test.ts' \
  | grep -v 'fixtures/crosslayer/benign/' \
  | grep '^' && echo "UNEXPECTED FILE CHANGED" || echo "OK — only owned files"
# Confirm no exports from existing modules were changed:
git diff -U0 -- src/core/ src/adapters/ src/cli/ | grep '^[-+]export' \
  || echo "OK — no existing exports changed"
```

**Validation**: build clean; full Vitest suite green; only `owned_files` modified.

## Definition of Done

- [ ] `src/crosslayer/composition.ts` created with all four types + `assertSupportedLayers` + `assembleComposedContext` exported
- [ ] Layer-type guard rejects unsupported layer types with an explicit error citing C-005
- [ ] `assembleComposedContext` calls `resolveCompositionDetailed` with `mode: "strict"` and propagates violations
- [ ] `sopAloneText` contains only SOP text; `layerTexts` map populated correctly
- [ ] Benign fixture set created and RFC-1-valid (`SOUL.md` passes strict mode)
- [ ] All unit tests in `tests/crosslayer/unit/composition.test.ts` pass
- [ ] `pnpm build` (strict tsc) green — no `any`, no suppressed errors
- [ ] `pnpm test` full suite green — no new skips
- [ ] Only files in `owned_files` modified; `src/core/`, `src/adapters/rfc1/` untouched
- [ ] New-code coverage ≥ 80% (SonarCloud gate)

## Reviewer guidance

- **Reject if** any file outside `owned_files` is modified.
- **Reject if** `src/core/` or `src/adapters/rfc1/resolve.ts` is modified in any way.
- Verify that `assembleComposedContext` calls `resolveCompositionDetailed` with
  `mode: "strict"` — not `mode: "lenient"` or omitted — and that RFC-1 violation
  propagation is explicitly tested.
- Verify that `sopAloneText` is the SOP text only — no persona text leaking in.
- Spot-check `layerTexts` map: the static lint (WP02) will rely on the map
  containing per-layer text; incorrect population here breaks WP02.
- The benign SOUL.md fixture must be RFC-1 valid — ask for evidence that
  `resolveCompositionDetailed` accepts it in strict mode.
- Check that the layer-type guard error message explicitly cites C-005 (per
  spec FR-010 requirement that findings cite a normative source).

## Activity Log

- 2026-06-13T01:30:00Z – /spec-kitty.tasks – created
- 2026-06-13T15:30:26Z – claude:sonnet:implementer:implementer – shell_pid=1624045 – Assigned agent via action command
- 2026-06-13T15:33:24Z – claude:sonnet:implementer:implementer – shell_pid=1624045 – Moved to in_progress
- 2026-06-13T15:39:26Z – claude:sonnet:implementer:implementer – shell_pid=1624045 – StackComposition types + assembleComposedContext implemented. RFC-1 strict-mode persona resolution via resolveCompositionDetailed. 25 unit tests, 85.86% coverage on src/crosslayer. Build and full test suite green.
- 2026-06-13T15:41:41Z – claude:opus:reviewer:reviewer – shell_pid=1624045 – Build clean (0 tsc errors), full suite 1435 passed/2 pre-existing skips, src/crosslayer coverage 85.86% stmt / 85% branch (>=80 gate). Types match data-model.md exactly (LayerType, LayerEntry, PrecedenceDeclaration, ResolvedContext, StackComposition). assembleComposedContext genuinely reuses resolveCompositionDetailed with mode:strict and propagates error-severity violations; does not reimplement resolution. git diff main on src/adapters/rfc1/ and src/core/ both empty; no 'crosslayer' in src/core. Deterministic: no localeCompare/clock/RNG on static path. C-005 guard rejects unsupported layers citing C-005; invariants enforce >=1 persona + >=1 sop, at-most-one-per-type. Benign fixtures RFC-1-valid (SOUL.md passes strict via happy-path test). Only owned_files + spec-kitty bookkeeping changed; no test weakened/skipped; no any/non-null assertions.
