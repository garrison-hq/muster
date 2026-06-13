---
work_package_id: WP01
title: Adapter scaffold + frontmatter/naming static validation
dependencies: []
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
- FR-005
- FR-008
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base computed in lanes.json, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
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
authoritative_surface: src/adapters/skills/
execution_mode: code_change
owned_files:
- src/adapters/skills/types.ts
- src/adapters/skills/frontmatter.ts
- src/adapters/skills/schema.ts
- src/adapters/skills/validate.ts
- src/adapters/skills/index.ts
- tests/unit/skills-frontmatter.test.ts
- tests/unit/skills-validate.test.ts
tags: []
---

# WP01 — Adapter scaffold + frontmatter/naming static validation

## Objective

Create the `SkillsAdapter` skeleton behind muster's `SpecAdapter` boundary and
deliver the first two static conformance layers: YAML frontmatter extraction
from `SKILL.md` and the name/description semantic validation rules. This WP
produces all skills-specific types and proves the core boundary holds under
strict TypeScript.

No existing file under `src/core/` is modified. No new runtime dependencies are
added. The static path runs fully offline.

## Context (read first)

- Spec: `kitty-specs/skills-adapter-01KTYKNX/spec.md`
  — FR-001, FR-002, FR-003, FR-004, FR-008; C-001, C-002, C-003
- Plan: `kitty-specs/skills-adapter-01KTYKNX/plan.md`
  — WP01 outline, Project Structure, Charter Check table
- Data model: `kitty-specs/skills-adapter-01KTYKNX/data-model.md`
  — `SkillDocument`, `SkillFrontmatter`, `SkillProfile`, `StaticCheck` invariants
- Charter: `.kittify/charter/charter.md`
  — byte-stable static output, every check cites a normative source, no core
  modification, tsc strict before merge, ≥80% new-code coverage

**Hard rules for the whole WP** (from spec + charter):
1. Touch ONLY the files in `owned_files`. If a core file needs to export an
   interface the adapter requires, raise it in the work log — do NOT edit core.
2. The `SpecAdapter` tsc enforcement check (`const _contractCheck: SpecAdapter =
   skillsAdapter` in `index.ts`) must compile. This is the C-001 proof.
3. Every static check must set `section` to the agentskills.io clause at the
   pinned commit SHA (see T004). `section` is never undefined for an error.
4. Before writing any check logic, verify the pinned SHA in `validate.ts`'s
   header comment still resolves. Record any spec delta as a blocker in the
   work log before proceeding.
5. Agentskills.io SHA drift: if the spec has changed since plan.md was written,
   stop and file a note in the mission work log. Do not silently update checks
   without a record.

## Subtasks

### T001 — Define skills-specific types (`src/adapters/skills/types.ts`)

**Purpose**: All skills-specific interfaces live here. No other new file imports
from core types it doesn't already use; this file only imports from core where
the type is genuinely shared (e.g., `Violation` from `src/core/report.ts`).

**Steps**:
1. Create `src/adapters/skills/types.ts`.
2. Define `SkillDocument` exactly as in `data-model.md`: `path`, `skillDir`,
   `frontmatter: unknown`, `body: string`.
3. Define `SkillFrontmatter` exactly as in `data-model.md`: `name`, `description`
   (required); `license`, `compatibility`, `metadata`, `"allowed-tools"` (optional
   with the documented types).
4. Define `type SkillProfile = "base" | "anthropic"`.
5. Define `SkillStaticCheck` — the rule-definition conceptual type (path, message,
   severity, section fields matching the `StaticCheck` entity in data-model.md).
6. Define `TriggerQuerySet`, `TriggerCase`, `TriggerVerdict`, `AxisVerdict`,
   `QueryRunResult` exactly as specified in `data-model.md`. Import
   `EndpointConfig` from `src/core/behavioral/types.ts`; define `ToolDefinition`
   as a local interface (`{ type: "function"; function: { name: string; description: string } }`).
7. Export all types as named exports. No default exports.

**Files**: `src/adapters/skills/types.ts`

**Validation**: `pnpm build` compiles with zero type errors on this file.

---

### T002 — Implement frontmatter extraction (`src/adapters/skills/frontmatter.ts`)

**Purpose**: Pure text extraction — no YAML parsing. Splits the first `---`-delimited
block from `SKILL.md` content and returns raw YAML string + body string. Handles
every edge case documented in `data-model.md`.

**Steps**:
1. Create `src/adapters/skills/frontmatter.ts`.
2. Export `extractFrontmatter(content: string, skillMdPath: string, skillDir: string): SkillDocument | SkillStaticCheck`.
   Return type: either a valid `SkillDocument` (with `frontmatter: unknown` from
   YAML parse) or a single `SkillStaticCheck` error that halts further checks.
3. Strip a leading UTF-8 BOM (`﻿`) before delimiter detection.
4. Edge cases (each returns an error with `path: "(document)"` and a message
   citing the spec's frontmatter section):
   - Content does not begin with `---` after BOM strip (any non-whitespace or
     whitespace before the first `---`): error "frontmatter must be the first
     content in SKILL.md".
   - No closing `---` delimiter found: error "unterminated frontmatter block".
   - Opening `---` present but YAML block is empty (closing `---` immediately
     follows): this is valid — an empty frontmatter block; return the document
     with `frontmatter: {}` (validation will catch missing required fields).
5. Parse the YAML block using the `yaml` package (already a project dependency)
   with `{ strict: false }` to avoid parser throws; if parsing returns `null`
   treat as `{}`.
6. Set `SkillDocument.path` = `skillMdPath`, `SkillDocument.skillDir` = `skillDir`,
   `SkillDocument.frontmatter` = parsed YAML object, `SkillDocument.body` = the
   remainder of the file after the closing `---`.
7. This function performs zero network I/O and zero filesystem reads; it takes
   already-read content as a string.

**Files**: `src/adapters/skills/frontmatter.ts`

**Validation**: unit tests in T006 cover all edge cases; `pnpm build` passes.

---

### T003 — Implement Ajv-backed frontmatter schema (`src/adapters/skills/schema.ts`)

**Purpose**: JSON Schema Draft 2020-12 via Ajv validates the frontmatter object's
structural types before semantic rules run. Catches type mismatches
(e.g., `metadata` value is a number) early with good error paths.

**Steps**:
1. Create `src/adapters/skills/schema.ts`.
2. Define the JSON Schema:
   - `name`: required, type `string`.
   - `description`: required, type `string`.
   - `license`: optional, type `string`.
   - `compatibility`: optional, type `string`.
   - `metadata`: optional, type `object`, `additionalProperties: { type: "string" }`
     — this rejects non-string values (FR-005).
   - `"allowed-tools"`: optional, type `string`.
   - `additionalProperties: true` (unknown fields are not an error at schema level;
     semantic rules in `validate.ts` handle scope).
3. Export `validateSchema(frontmatter: unknown): { valid: boolean; errors: { path: string; message: string }[] }`.
   Compile the schema once at module load (Ajv `compile`). Map AJV error
   `instancePath` to the `path` field; trim the leading `/` to match the
   frontmatter field name.
4. Do not import from `src/core/` in this file; the Ajv instance is adapter-private.
   The `yaml` and `ajv` packages are existing project dependencies.

**Files**: `src/adapters/skills/schema.ts`

**Validation**: `pnpm build` compiles; `metadata` with a numeric value produces
an error at path `metadata/<key>`; a fully valid frontmatter object passes.

---

### T004 — Implement name + description validation (`src/adapters/skills/validate.ts`)

**Purpose**: Semantic rules for `name` and `description`. Every check cites the
agentskills.io clause pinned to the commit SHA (C-002, C-003, charter). This is
the primary deliverable for FR-003 and FR-004.

**Steps**:
1. Create `src/adapters/skills/validate.ts`.
2. **Header comment** (mandatory): record the agentskills.io pinned commit SHA
   and a drift-watch note, e.g.:
   ```
   // agentskills.io specification pinned to agentskills/agentskills@<SHA>
   // Drift-watch: verify this SHA resolves before any edit to check clauses.
   // Any spec delta is a mission blocker — record in work log before proceeding.
   ```
   The implementing agent must fill `<SHA>` with the actual current SHA before
   writing check clauses.
3. Export `validateStatic(doc: SkillDocument, profile: SkillProfile): Violation[]`.
   Import `Violation` from `src/core/report.ts`. Return an empty array for a
   fully conforming document.
4. Schema validation: call `validateSchema(doc.frontmatter)` first. Map each
   schema error to a `Violation` with severity `"error"` and `section` citing
   the agentskills.io frontmatter section at the pinned SHA. If schema errors
   exist, return them immediately (further semantic rules require the types to
   be correct).
5. Name rules (all FR-003, cite agentskills.io §frontmatter.name@SHA):
   - Present and non-empty.
   - Length 1–64 characters.
   - Charset `[a-z0-9-]` only (pattern: `/^[a-z0-9-]+$/`).
   - No leading hyphen: `name[0] !== "-"`.
   - No trailing hyphen: `name[name.length - 1] !== "-"`.
   - No consecutive hyphens: `!name.includes("--")`.
   - Equals `basename(doc.skillDir)` exactly (case-sensitive string equality).
   Each rule is a separate `Violation` if violated; collect all name violations
   before moving to description (do not short-circuit within the name block).
6. Description rules (all FR-004, cite agentskills.io §frontmatter.description@SHA):
   - Present and non-empty (trim before checking).
   - Length ≤ 1024 characters.
7. Each `Violation` must have:
   - `path`: the frontmatter key, e.g. `"name"` or `"description"`.
   - `message`: a human-readable string naming the rule.
   - `severity: "error"`.
   - `section`: `"agentskills.io §<clause>@<SHA>"`.
8. Optional fields and Anthropic profile gate are NOT implemented in this WP —
   they land in WP02 as extensions to this file. Add a `// TODO WP02: optional fields`
   marker at the end of `validateStatic` so the WP02 agent knows where to extend.

**Files**: `src/adapters/skills/validate.ts`

**Validation**: all `skills-validate.test.ts` cases pass; every `Violation` in
test output has a non-empty `section`.

---

### T005 — Assemble SkillsAdapter (`src/adapters/skills/index.ts`)

**Purpose**: Implement the `SpecAdapter` contract and wire the parse + validate
pipeline. Stubs for `resolveConfig`, `thresholds`, and `evaluateTriggers` are
intentional — WP02/WP03 complete them.

**Steps**:
1. Create `src/adapters/skills/index.ts`.
2. Import `SpecAdapter` from `src/core/adapter.ts` (or wherever the contract lives
   in core — read the existing `src/adapters/rfc1/index.ts` to locate the import).
3. Implement the `SpecAdapter` interface methods:
   - `parse(skillDir: string)`: read `SKILL.md` from the skill directory
     (`fs.readFileSync`); call `extractFrontmatter`; return the `SkillDocument`
     or throw on a document-level error. The skill directory path is resolved to
     absolute before any call.
   - `validate(doc: SkillDocument, profile: SkillProfile)`: call `validateStatic`
     from `validate.ts`; return the `Violation[]`.
   - `resolveConfig(doc: SkillDocument)`: stub — return `{}` or the minimal
     config shape the `SpecAdapter` contract requires. Add a `// TODO WP02`
     comment.
   - `thresholds()`: stub — return the behavioral thresholds shape. Add
     `// TODO WP03`.
   - `evaluateTriggers(...)`: stub — return empty results. Add `// TODO WP03`.
4. Export the adapter as `skillsAdapter` (named export) AND add the tsc contract
   enforcement check at the bottom of the file:
   ```ts
   // C-001 enforcement: SpecAdapter contract satisfied at compile time.
   const _contractCheck: SpecAdapter = skillsAdapter;
   void _contractCheck;
   ```
5. Read `src/adapters/rfc1/index.ts` to understand the expected assembly pattern
   (this WP mirrors that file's structure, not its content).

**Files**: `src/adapters/skills/index.ts`

**Validation**: `pnpm build` compiles; the `_contractCheck` line compiles without
casting; no `src/core/` file is modified.

---

### T006 — Unit tests: `skills-frontmatter.test.ts` + `skills-validate.test.ts`

**Purpose**: Exercise every edge case in frontmatter extraction and every name/description
rule in validation. These are the acceptance tests for FR-002, FR-003, FR-004.

**Steps**:
1. Create `tests/unit/skills-frontmatter.test.ts`.
   Cover:
   - Valid minimal frontmatter: returns a `SkillDocument`.
   - Absent frontmatter (file starts with prose): returns an error.
   - Leading blank line before `---`: returns an error.
   - Unterminated frontmatter (no closing `---`): returns an error.
   - Leading BOM stripped: returns a valid `SkillDocument`.
   - Empty frontmatter block (`---\n---`): returns a `SkillDocument` with
     `frontmatter: {}`.
   - Frontmatter with body: `body` contains everything after the closing `---`.

2. Create `tests/unit/skills-validate.test.ts`.
   Cover name rules (each as a separate test):
   - Missing `name`: violation at path `name`.
   - Empty `name` string: violation.
   - `name` length 65 chars: violation.
   - `name` with uppercase: violation citing charset rule.
   - `name` with leading hyphen: violation.
   - `name` with trailing hyphen: violation.
   - `name` with consecutive hyphens (`foo--bar`): violation.
   - `name` equals dir basename: passes (no violation).
   - `name` differs from dir basename by case only: violation (case-sensitive).
   Cover description rules:
   - Missing `description`: violation at path `description`.
   - Empty string after trim: violation.
   - `description` of exactly 1024 chars: passes.
   - `description` of 1025 chars: violation.
   Cover combined valid case:
   - A fully valid name + description with matching dir basename: zero violations.
   Verify all returned violations have non-empty `section`.

3. Use Vitest (`import { describe, it, expect } from "vitest"`). Do not use
   global test helpers not already in the project.

**Files**: `tests/unit/skills-frontmatter.test.ts`, `tests/unit/skills-validate.test.ts`

**Validation**: `pnpm test` green for both new files; no existing test file
modified; test count increases by exactly the number of new tests.

---

### T007 — WP01 verification (gate for Definition of Done)

**Steps** (run in order):
```bash
pnpm build              # strict tsc — must pass with zero errors
pnpm test               # full suite — zero failures, zero new skips
git diff --stat         # ONLY the seven owned files changed (or new files created)
```

Confirm the contract enforcement compiles:
```bash
grep '_contractCheck' src/adapters/skills/index.ts   # must be present
```

Confirm no `src/core/` file was modified:
```bash
git diff --stat src/core/   # must show no changes
```

Confirm every `Violation` produced by a skills check has a non-empty `section`:
The `skills-validate.test.ts` assertions cover this; CI green proves it.

## Definition of Done

- [ ] `src/adapters/skills/types.ts` defines all 9 interfaces/types from data-model.md
- [ ] `src/adapters/skills/frontmatter.ts` handles all 4 edge cases (absent, leading-whitespace, unterminated, BOM)
- [ ] `src/adapters/skills/schema.ts` rejects metadata with non-string values
- [ ] `src/adapters/skills/validate.ts` implements all 7 name rules + 2 description rules with `section` citations
- [ ] `src/adapters/skills/index.ts` compiles the `_contractCheck: SpecAdapter` line without casting
- [ ] `pnpm build` (strict tsc) passes with zero new errors
- [ ] `pnpm test` green; no test file outside `owned_files` modified; no new skips
- [ ] No file under `src/core/` modified (verified by `git diff --stat src/core/`)
- [ ] Pinned agentskills.io SHA recorded in `validate.ts` header comment; drift-watch note present

## Reviewer guidance

- **Reject if** any `src/core/` file is in the diff, or if the `_contractCheck`
  line uses `as unknown as SpecAdapter` or any other cast.
- Check `validate.ts` header comment: the pinned SHA must be a real commit hash
  (40 hex chars), not a placeholder. A placeholder (`<SHA>`) is an automatic reject.
- For each name rule, verify the test asserts the `path` is `"name"` and the
  `section` is non-empty.
- Confirm `frontmatter.ts` performs zero filesystem I/O — it takes string content
  as input, it does not call `fs.readFile` internally.
- The `schema.ts` file must use the `ajv` package already in the project, not
  a new import. Check `package.json` is unchanged.
