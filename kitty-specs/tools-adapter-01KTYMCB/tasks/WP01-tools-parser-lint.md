---
work_package_id: WP01
title: TOOLS.md parser + static structure lint
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
- T006
- T007
history:
- timestamp: '2026-06-13T01:30:00Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/adapters/tools/
execution_mode: code_change
owned_files:
- src/adapters/tools/lint.ts
- tests/tools/unit/lint.test.ts
- tests/tools/fixtures/tools-md/well-formed.md
- tests/tools/fixtures/tools-md/missing-section.md
- tests/tools/fixtures/tools-md/duplicate-tool.md
tags: []
---

# WP01 — TOOLS.md parser + static structure lint

## Objective

Implement `src/adapters/tools/lint.ts`: the `parseTOOLSFile()` function that
reads a `TOOLS.md` file into a structured `TOOLSFile` entity (section map +
ordered `ToolDescriptor` array), and the static lint checks (required sections,
duplicate-name detection, empty descriptions) that run on the parsed result.
Produce a deterministic canonical-JSON lint report. Author the three static
TOOLS.md fixtures and the unit test suite that covers acceptance scenarios 1 and 2.

This WP provides the types and parser consumed by both WP02 (drift checks, which
read `TOOLSFile.tools` as the documented side of the comparison) and WP03
(behavioral probes, which register `TOOLSFile.tools` as OpenAI-compatible
function-call invocables). Getting the data model right here keeps WP02 and WP03
clean.

## Context (read first)

- Spec: `kitty-specs/tools-adapter-01KTYMCB/spec.md` (FR-002, FR-003, FR-009;
  acceptance scenarios 1–2; edge case: duplicate-name static error)
- Data model: `kitty-specs/tools-adapter-01KTYMCB/data-model.md`
  (`TOOLSFile`, `ToolDescriptor`, `ParameterDescriptor` — read all invariants)
- Plan: `kitty-specs/tools-adapter-01KTYMCB/plan.md` — WP01 section; project
  structure (src/adapters/tools/ mirrors src/adapters/rfc1/)
- Charter: `.kittify/charter/charter.md` — "every check cites a normative
  source"; ≥80% new-code coverage; offline + byte-stable static path;
  UTF-16 code-unit canonical ordering
- Reference existing adapter for structural context: `src/adapters/rfc1/` — do
  NOT modify any file there; read only

**Hard rules for the whole WP**:
1. Touch only files in `owned_files`. Do not create `src/adapters/tools/index.ts`
   — that is WP04's file.
2. The spec-agnostic core (`src/core/`) is never modified (C-001). Reuse its
   canonical-JSON utilities by importing from `src/core/canonical-json.ts`.
3. Every static finding emitted by the linter must carry a `citedRubric` field
   (charter; FR-009). No finding without a normative citation.
4. Section-heading normalisation must be locale-independent — lower-case +
   trimmed, consistent with the UTF-16 code-unit ordering in
   `src/core/canonical-json.ts`. Do not use `toLocaleLowerCase()`.
5. `pnpm build` (`tsc` strict) must pass before each commit.

## Subtasks

### T001 — Type declarations: `TOOLSFile`, `ToolDescriptor`, `ParameterDescriptor`

**Purpose**: Define the three data-model interfaces in `src/adapters/tools/lint.ts`
(top of file, exported). These types are the shared language for WP01, WP02, and
WP03 — getting them right here prevents breaking changes later.

**Steps**:
1. Read `kitty-specs/tools-adapter-01KTYMCB/data-model.md` in full — especially
   the **Invariants** sections. All invariants stated there become code comments
   on the interface fields.
2. Declare `ParameterDescriptor` (two fields: `type: string`, `required: boolean`).
3. Declare `ToolDescriptor` (three fields: `name`, `description`, `parameters:
   ReadonlyMap<string, ParameterDescriptor>`). Add the invariant comment:
   `parameters` is an empty map (never null/undefined) when no parameters are
   documented.
4. Declare `TOOLSFile` (three fields: `path: string`, `tools: readonly
   ToolDescriptor[]`, `sections: ReadonlyMap<string, string>`). Add the
   invariant comment: `sections` keys are normalised (lower-case trimmed) for
   locale-independent comparison.
5. Export all three. Do not export anything else from this file yet — the lint
   function and finding types come in T002–T003.

**Files**: `src/adapters/tools/lint.ts` (create; types only at this stage)

**Validation**: `pnpm build` succeeds with zero type errors.

---

### T002 — `parseTOOLSFile()` — Markdown heading scan, section map, tool extraction

**Purpose**: Implement the parser that reads a `TOOLS.md` file from disk (given a
path) and produces a `TOOLSFile`. The parser must:
- Build a `sections` map keyed by normalised heading text (lower-case trimmed,
  locale-independent — use `.toLowerCase().trim()`, not `.toLocaleLowerCase()`).
- Extract `ToolDescriptor` entries in declaration order (top to bottom).
- Surface duplicate `name` values in `tools` without deduplicating them — the
  linter (T003) rejects them; the parser records them both.
- Use `yaml` (already a dependency) or plain string parsing — `TOOLS.md` is
  Markdown, not YAML; choose the simpler approach (line-by-line heading +
  paragraph scan is sufficient unless the fixture format demands otherwise).

**Steps**:
1. Read `tests/tools/fixtures/tools-md/well-formed.md` (T005 authors this; draft
   its structure first if T005 hasn't run yet — agree on a concrete format: each
   tool is a level-2 or level-3 heading with `name`, a prose description paragraph,
   and optionally a parameters subsection or fenced code block in JSON/YAML).
2. Implement `parseTOOLSFile(filePath: string): Promise<TOOLSFile>`. Use Node's
   `fs/promises` `readFile` (already used in `src/adapters/rfc1/`).
3. Section map: split on level-2 headings (`## `). Each section's heading text is
   normalised (lower-case trimmed) as the key; its body prose is the value.
4. Tool extraction: within each section (or at the top-level), detect tool
   entries. A tool entry is identified by its name (heading or bolded name field
   per the fixture format), description paragraph, and optional parameters block.
5. Build `parameters` as a `Map<string, ParameterDescriptor>`. If no parameters
   section exists, return an empty `new Map()`.
6. Return the assembled `TOOLSFile`.

**Files**: `src/adapters/tools/lint.ts` (add function after type declarations)

**Validation**: `pnpm build` clean; `parseTOOLSFile` is importable. Full
validation deferred to T006.

---

### T003 — Static lint checks: required sections, duplicate names, empty descriptions

**Purpose**: Implement the static linter that runs on a parsed `TOOLSFile` and
emits structured findings. Introduce the `LintFinding` and `LintReport` types
(local to `lint.ts`; exported).

**Steps**:
1. Define `LintFindingKind` union: `"missing-required-section"` |
   `"duplicate-tool-name"` | `"empty-description"`. Extend if the rubric adds
   more categories (document in a comment).
2. Define `LintFinding` interface:
   ```ts
   interface LintFinding {
     readonly kind: LintFindingKind;
     readonly toolName?: string;       // present for duplicate-name + empty-desc
     readonly sectionName?: string;    // present for missing-section
     readonly citedRubric: string;     // NEVER absent (charter; FR-009)
   }
   ```
3. Define `LintReport` interface:
   ```ts
   interface LintReport {
     readonly toolsFilePath: string;
     readonly findings: readonly LintFinding[];
     readonly ok: boolean;             // true iff findings is empty
   }
   ```
4. Implement `lintTOOLSFile(file: TOOLSFile): LintReport`. Three checks:
   - **Required sections**: muster's published rubric defines which sections a
     `TOOLS.md` must contain. For this mission, the required sections are:
     `"overview"` and `"tools"` (document this as the muster rubric; cite it in
     `citedRubric` as `"muster-rubric:tools/required-sections/v1"`). For each
     missing required section, emit a `missing-required-section` finding with
     the normalised `sectionName`.
   - **Duplicate tool names**: scan `file.tools` for repeated `name` values.
     For each duplicate name, emit a `duplicate-tool-name` finding with
     `toolName` set. Cite `"muster-rubric:tools/unique-names/v1"`.
   - **Empty descriptions**: for each `ToolDescriptor` with a `description` that
     is empty or whitespace-only, emit an `empty-description` finding. Cite
     `"muster-rubric:tools/non-empty-description/v1"`.
5. Set `ok: findings.length === 0`.

**Files**: `src/adapters/tools/lint.ts` (add types + function)

**Validation**: `pnpm build` clean. Full validation in T006.

---

### T004 — Deterministic canonical-JSON output from `TOOLSFile`

**Purpose**: Export a `toCanonicalJson(file: TOOLSFile): string` helper that
serialises a `TOOLSFile` to a byte-stable JSON string, reusing
`src/core/canonical-json.ts`. This is the static path's output — identical
bytes across runs and machines (NFR-001, SC-002).

**Steps**:
1. Import `canonicalJson` from `src/core/canonical-json.ts` (check the actual
   export name by reading that file first).
2. Convert `TOOLSFile` to a plain serialisable object. `ReadonlyMap` instances
   must be converted to plain objects for serialisation — iterate map entries and
   collect into a plain `Record<string, …>`. Maintain insertion order for
   determinism (maps preserve insertion order in ES2015+).
3. Implement `toCanonicalJson(file: TOOLSFile): string` by calling `canonicalJson`
   on the plain-object form.
4. Key ordering in the serialised form must satisfy the UTF-16 code-unit ordering
   (`canonical-json.ts` handles this; do not apply an additional sort that could
   conflict).

**Files**: `src/adapters/tools/lint.ts` (add function)

**Validation**: `pnpm build` clean; confirmed in T006 (round-trip + stability test).

---

### T005 — Fixture authoring: `well-formed.md`, `missing-section.md`, `duplicate-tool.md`

**Purpose**: Author the three `TOOLS.md` fixture files that drive acceptance
scenarios 1 and 2 and the duplicate-name edge case. These files are the
primary acceptance surface for WP01 and are also reused by WP02 (drift checks
use `well-formed.md` as the documented side).

**Steps**:
1. **`tests/tools/fixtures/tools-md/well-formed.md`** — a valid `TOOLS.md`
   documenting exactly two tools (used across scenarios and drift fixtures):
   - Tool 1: `send_email` — description "Send an email to a recipient address
     with a subject and body."; parameters: `recipient` (type: `string`,
     required: true), `subject` (type: `string`, required: true),
     `body` (type: `string`, required: false).
   - Tool 2: `list_files` — description "List files in a directory, optionally
     filtered by extension."; parameters: `directory` (type: `string`,
     required: true), `extension` (type: `string`, required: false).
   - Include `## Overview` and `## Tools` sections (the two required sections
     per the muster rubric).
   - Format each tool as a level-3 heading (`### send_email`) followed by a
     prose description paragraph and a `Parameters` sub-heading with a Markdown
     table listing name, type, and required columns. Keep the format consistent
     and parseable by the T002 implementation.
2. **`tests/tools/fixtures/tools-md/missing-section.md`** — a `TOOLS.md` that
   deliberately omits the `## Overview` section. Still contains `## Tools` and
   a valid `send_email` entry. This triggers scenario 2 (missing-required-section
   finding for `overview`).
3. **`tests/tools/fixtures/tools-md/duplicate-tool.md`** — a `TOOLS.md` with
   both `## Overview` and `## Tools` sections but two entries both named
   `send_email`. This triggers the duplicate-tool-name static error (spec edge
   case).

**Files**:
- `tests/tools/fixtures/tools-md/well-formed.md` (NEW)
- `tests/tools/fixtures/tools-md/missing-section.md` (NEW)
- `tests/tools/fixtures/tools-md/duplicate-tool.md` (NEW)

**Validation**: manual read confirms format matches the parser's expectations
from T002; full validation in T006.

---

### T006 — `tests/tools/unit/lint.test.ts` — parser + lint unit tests

**Purpose**: Write the complete unit test suite for the parser and linter.
Must cover acceptance scenarios 1 and 2, the duplicate-name edge case, the
canonical-JSON stability guarantee, and enough edge cases to meet ≥80% new-code
coverage (charter; SonarCloud gate).

**Steps**:
1. Import `parseTOOLSFile`, `lintTOOLSFile`, `toCanonicalJson` from
   `src/adapters/tools/lint.ts`.
2. **Scenario 1 (FR-003 acceptance)**: given `well-formed.md`, assert:
   - `lintReport.ok === true`
   - `lintReport.findings.length === 0`
   - `parsedFile.tools.length === 2`
   - `parsedFile.tools[0].name === 'send_email'`
   - `parsedFile.tools[0].parameters.get('recipient')?.required === true`
3. **Scenario 2 (FR-003 acceptance)**: given `missing-section.md`, assert:
   - `lintReport.ok === false`
   - `lintReport.findings.some(f => f.kind === 'missing-required-section' && f.sectionName === 'overview')`
   - `lintReport.findings[0].citedRubric` is non-empty (charter invariant)
4. **Duplicate-name edge case**: given `duplicate-tool.md`, assert:
   - `lintReport.findings.some(f => f.kind === 'duplicate-tool-name' && f.toolName === 'send_email')`
5. **Canonical-JSON stability (NFR-001)**: call `toCanonicalJson` on the
   `well-formed.md` parse result twice; assert both calls return identical
   strings.
6. **Empty description edge case**: construct a `TOOLSFile` with a tool whose
   `description` is `''`; assert `lintTOOLSFile` emits an `empty-description`
   finding.
7. **Section normalisation**: assert `parsedFile.sections.has('tools')` (lower-
   case key, not `'Tools'`).
8. Use `path.resolve` from Node `path` to build fixture paths relative to the
   repo root — do not hardcode absolute paths.

**Files**: `tests/tools/unit/lint.test.ts` (NEW)

**Validation**: `pnpm test -- tests/tools/unit/lint.test.ts` green; zero skipped
tests; coverage of `src/adapters/tools/lint.ts` meets ≥80% threshold.

---

### T007 — WP01 verification

**Purpose**: Gate for Definition of Done. Run the full build and the lint test
suite; confirm no files outside `owned_files` were modified.

**Steps** (in order):
```bash
pnpm build                          # strict tsc — zero errors
pnpm test -- tests/tools/unit/lint.test.ts   # all cases green; zero skips
git diff --stat                     # ONLY owned_files changed
git diff -U0 | grep '^[-+]export' -- src/core/ || echo OK   # core unchanged
```

Confirm:
- `well-formed.md` parse produces zero findings.
- `missing-section.md` parse produces exactly one `missing-required-section` finding for `overview`.
- `duplicate-tool.md` parse produces a `duplicate-tool-name` finding for `send_email`.
- Running `toCanonicalJson` twice on the same `TOOLSFile` produces byte-identical output.
- `pnpm build` latency (static lint path) is well under the 5 s NFR-002 target.

**Files**: no new files; verification only.

**Validation**: all checks above pass; WP is ready for reviewer.

## Definition of Done

- [ ] `src/adapters/tools/lint.ts` exports `TOOLSFile`, `ToolDescriptor`,
  `ParameterDescriptor`, `LintFinding`, `LintReport`, `parseTOOLSFile`,
  `lintTOOLSFile`, `toCanonicalJson`
- [ ] Acceptance scenario 1 (well-formed → ok: true, zero findings) passes
- [ ] Acceptance scenario 2 (missing section → finding with non-empty citedRubric) passes
- [ ] Duplicate-name edge case triggers `duplicate-tool-name` finding
- [ ] `toCanonicalJson` produces identical bytes across repeated calls (NFR-001)
- [ ] Section keys are lower-case trimmed (locale-independent)
- [ ] `pnpm build` (strict tsc) green; `pnpm test -- tests/tools/unit/lint.test.ts` green
- [ ] No files outside `owned_files` modified; `src/core/` unchanged
- [ ] Every `LintFinding` carries a non-empty `citedRubric` (charter)

## Reviewer guidance

- **Reject if** `src/core/` is modified in any way, or any file outside
  `owned_files` is touched.
- Check the section-heading normalisation: must use `.toLowerCase()` (not
  `.toLocaleLowerCase()`); comment explaining the locale-independence requirement
  should be present.
- Check `citedRubric`: every finding emitted in tests must have a non-empty
  string. A test that does not assert on `citedRubric` is not sufficient — add
  the assertion.
- Verify `parameters` returns an empty `Map` (not `undefined`) for tools with no
  parameters section.
- Spot-check that `parseTOOLSFile` does not silently deduplicate duplicate tool
  names — both entries must appear in `tools`.
- Canonical-JSON stability: confirm the round-trip test exists (T006 step 5).
