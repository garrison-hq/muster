---
work_package_id: WP02
title: Directory layout + bundled-file drift checks + Anthropic optional profile
dependencies:
- WP01
requirement_refs:
- FR-006
- FR-007
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base computed in lanes.json, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-13T01:30:00Z'
subtasks:
- T008
- T009
- T010
- T011
- T012
history:
- timestamp: '2026-06-13T01:30:00Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/adapters/skills/
execution_mode: code_change
owned_files:
- src/adapters/skills/layout.ts
- tests/unit/skills-layout.test.ts
tags: []
---

# WP02 — Directory layout + bundled-file drift checks + Anthropic optional profile

## Objective

Complete the static conformance surface. Deliver the bundled-file directory-layout
drift check (FR-006), extend the optional-field validation rules (FR-005), and
implement the Anthropic platform profile gate (FR-007). The static path remains
fully offline and byte-stable after this WP.

This WP adds `src/adapters/skills/layout.ts` (new file) and extends two files
already created by WP01: `src/adapters/skills/validate.ts` and
`tests/unit/skills-validate.test.ts`. No other file is modified.

## Context (read first)

- Spec: `kitty-specs/skills-adapter-01KTYKNX/spec.md`
  — FR-005, FR-006, FR-007, FR-008; C-001, C-002, C-003; acceptance scenarios 5, 6, 7
- Plan: `kitty-specs/skills-adapter-01KTYKNX/plan.md`
  — WP02 outline, path-traversal guard note, Anthropic profile gate design
- Data model: `kitty-specs/skills-adapter-01KTYKNX/data-model.md`
  — `SkillProfile` ("base" | "anthropic"), `StaticCheck` invariants, `SkillFrontmatter`
    optional fields
- Charter: `.kittify/charter/charter.md`
  — byte-stable static output (NFR-001), every check cites a normative source
    (C-003), no core modification (C-001)
- WP01 deliverables (already merged): `src/adapters/skills/types.ts`,
  `src/adapters/skills/validate.ts`, `tests/unit/skills-validate.test.ts`

**Hard rules for this WP** (from spec + charter):
1. Touch ONLY the files in `owned_files` plus the two WP01 extension points
   (`validate.ts` and `tests/unit/skills-validate.test.ts`). No other file.
2. Path-traversal guard is **lexical** — never call `fs.exists` or any filesystem
   function on a path that escapes the skill root. Reject the reference before
   any I/O.
3. The Anthropic profile gate must be silent when `profile === "base"` — a skill
   with `name: claude-tool` passes the base spec without any warning.
4. Every new check cites a normative source in its `section` field: either the
   agentskills.io layout/optional-fields clause at the pinned SHA (same SHA
   from `validate.ts` header), or the Anthropic docs URL for profile checks.
5. Byte-stability assertion must be added to the test suite (T012). The static
   path must produce identical bytes across two sequential runs.

## Subtasks

### T008 — Implement bundled-file layout drift check (`src/adapters/skills/layout.ts`)

**Purpose**: Scan the skill body for file references under `scripts/`, `references/`,
and `assets/`, verify each exists on disk within the skill directory, and reject
path-traversal attempts lexically. This is the FR-006 conformance check.

**Steps**:
1. Create `src/adapters/skills/layout.ts`.
2. Export `checkLayout(doc: SkillDocument): Violation[]`.
   Import `Violation` from `src/core/report.ts`. Import `SkillDocument` from
   `./types`.
3. Extract bundled file references from `doc.body`:
   - Scan for Markdown link patterns and inline code/block references that
     resolve to a path beginning with `scripts/`, `references/`, or `assets/`.
   - A simple regex over the body is sufficient: match path tokens starting
     with `scripts/`, `references/`, or `assets/` (case-sensitive). One pass;
     deduplicate.
   - The spec specifies only these three prefix directories as bundled-file
     locations (agentskills.io §directory-layout@SHA). Other paths are not checked
     by this rule.
4. Path-traversal guard (lexical, before any I/O):
   - Normalize the reference path using `path.posix.normalize` (never `path.resolve`
     against the skill root at this stage).
   - If the normalized path begins with `..` or is absolute, generate a
     `Violation` with `severity: "error"`, `path: "(layout)"`, message describing
     the path-traversal attempt, and `section` citing the agentskills.io layout
     clause at the pinned SHA. **Do not call `fs.existsSync` or any I/O on this
     path.** Proceed to the next reference.
5. Existence check (only for references that passed the traversal guard):
   - Resolve the reference against `doc.skillDir`: `path.resolve(doc.skillDir, ref)`.
   - Re-verify the resolved absolute path starts with `doc.skillDir + path.sep`
     (double-check after resolution — defense in depth).
   - If the resolved file does not exist (`fs.existsSync` returns false):
     generate a `Violation` with `severity: "error"`, `path: "(layout)"`,
     message naming the missing file, and `section` citing the agentskills.io
     layout clause.
6. Nested `SKILL.md` detection (informational):
   - Search `doc.body` for the literal string `SKILL.md` appearing at a
     path depth greater than zero (e.g., `subdir/SKILL.md`). If found, emit
     a `Violation` with `severity: "warning"`, `path: "(document)"`, and message
     explaining that nested `SKILL.md` files are not authoritative.
7. Return all collected violations. An empty slice means no layout issues.

**Files**: `src/adapters/skills/layout.ts`

**Validation**: T011 covers all cases; `pnpm build` compiles.

---

### T009 — Extend `validate.ts`: optional-field rules + `allowed-tools` experimental warning

**Purpose**: FR-005 — validate optional frontmatter fields when present. Extend
`validateStatic` in `src/adapters/skills/validate.ts` (WP01 file, `// TODO WP02`
marker is the insertion point).

**Steps**:
1. Open `src/adapters/skills/validate.ts`. Locate the `// TODO WP02` marker.
2. Add optional-field validation immediately after the name/description checks,
   only if the field is present (`frontmatter["fieldName"] !== undefined`):
   - `license`: must be a string (schema already enforces type; add a semantic
     check that it is not empty if present — an empty license is ambiguous but
     the spec does not forbid it; emit a `severity: "warning"` if empty).
   - `compatibility`: 1–500 chars if present. A string longer than 500 chars
     produces a `severity: "error"` citing agentskills.io §frontmatter.compatibility@SHA.
   - `metadata`: value types already caught by schema (non-string = schema error).
     No additional semantic check needed beyond schema for this WP.
   - `"allowed-tools"`: if present, must be a non-empty string of space-separated
     tokens (split on space, filter empty strings — must have at least one token).
     An empty `allowed-tools` value produces a `severity: "error"`.
     Additionally, **always** emit a `severity: "warning"` when `allowed-tools`
     is present (even when valid): message: `"allowed-tools is an experimental
     field per the agentskills.io specification"`. Section: agentskills.io
     §frontmatter.allowed-tools@SHA (the spec's own "experimental" marking).
3. Emit violations using the same `Violation` shape as name/description checks.
   Every violation must have a non-empty `section`.

**Files**: `src/adapters/skills/validate.ts` (extension, no new file)

**Validation**: extended `skills-validate.test.ts` (T011) covers these rules.

---

### T010 — Add Anthropic profile gate to `validate.ts`

**Purpose**: FR-007 — when `profile === "anthropic"`, apply additional platform
constraints: reserved words in `name` and XML tags in `description`. The base
spec governs when profile is `"base"` — these checks must be completely silent
then (acceptance scenario 7).

**Steps**:
1. In `src/adapters/skills/validate.ts`, after the optional-field block (T009),
   add the profile-gated section.
2. The gate: `if (profile === "anthropic") { ... }` — the block only runs for
   the Anthropic profile.
3. Reserved-word check on `name` (FR-007):
   - Test: `name.toLowerCase().includes("anthropic") || name.toLowerCase().includes("claude")`.
   - If true: `Violation` with `severity: "error"`, `path: "name"`, message naming
     the reserved word, and `section` set to the Anthropic docs URL:
     `"https://docs.anthropic.com/en/docs/build-with-claude/tool-use#best-practices-for-tool-definitions"`.
   - Citation note: the implementing agent must verify this URL resolves and points
     to the tool-naming constraints before hardcoding it. Record the verified URL
     in the work log.
4. XML-tag check on `description` (FR-007):
   - Test: `/<[^>]+>/.test(description)`.
   - If true: `Violation` with `severity: "error"`, `path: "description"`,
     message explaining XML tags degrade performance with Anthropic models, and
     `section` set to the same Anthropic docs URL.
5. Acceptance scenario 7 contract (must be verified in T011):
   - A skill with `name: "claude-tool"` + valid description: **passes** when
     `profile === "base"`, **fails** when `profile === "anthropic"`.
   - A skill with description containing `<tag>`: **passes** when `profile === "base"`,
     **fails** when `profile === "anthropic"`.

**Files**: `src/adapters/skills/validate.ts` (extension, no new file)

**Validation**: T011 Anthropic profile tests cover scenario 7 explicitly.

---

### T011 — Unit tests: `skills-layout.test.ts` + extend `skills-validate.test.ts`

**Purpose**: Exercise all new rules added in T008–T010, plus the byte-stability
assertion required by NFR-001.

**Steps**:
1. Create `tests/unit/skills-layout.test.ts`.
   Use a temporary directory per test (Vitest's `vi.spyOn(fs, ...)` or actual
   temp dirs via `fs.mkdtempSync` + cleanup in `afterEach`) to set up real skill
   directories for I/O-dependent tests.

   Cover:
   - No bundled-file references in body: returns empty violations.
   - `scripts/helper.sh` referenced and present on disk: no violation.
   - `scripts/missing.sh` referenced but absent: violation at `(layout)`.
   - `../outside.sh` path-traversal reference: violation at `(layout)`, no
     filesystem I/O performed (assert the violation message names "path traversal").
   - `/absolute/path.sh` absolute reference: violation at `(layout)`.
   - Nested `SKILL.md` mentioned in body (`subdir/SKILL.md`): warning at
     `(document)`.
   - `assets/icon.png` referenced and present: no violation.
   - `references/guide.md` referenced and absent: violation.

2. Extend `tests/unit/skills-validate.test.ts` (adding new `describe` blocks,
   not replacing existing tests).

   Cover optional fields:
   - `compatibility` of 500 chars: passes.
   - `compatibility` of 501 chars: violation.
   - `allowed-tools: "web_search code_execution"`: passes (valid tokens) BUT
     emits an experimental warning.
   - `allowed-tools: ""`: error (empty).
   - `allowed-tools` absent: no warning.
   - `metadata: { key: "value" }`: passes.
   - `metadata: { key: 42 }`: schema error at `metadata/key`.

   Cover Anthropic profile gate (acceptance scenario 7):
   - `name: "claude-tool"`, `profile: "base"`: zero violations.
   - `name: "claude-tool"`, `profile: "anthropic"`: violation at path `name`.
   - `name: "anthropic-helper"`, `profile: "anthropic"`: violation at path `name`.
   - Description containing `<instructions>`, `profile: "base"`: zero violations.
   - Description containing `<instructions>`, `profile: "anthropic"`: violation
     at path `description`.
   - Fully valid skill (no reserved words, no XML), `profile: "anthropic"`:
     zero errors (experimental warning from allowed-tools may be present if
     that field is also set).

3. Byte-stability assertion:
   Add a test in `tests/unit/skills-validate.test.ts` (or a new dedicated block)
   that:
   - Calls `validateStatic` twice on the same document with the same profile.
   - `JSON.stringify`s both results and asserts they are strictly equal.
   This is the NFR-001 / SC-006 check for this module.

**Files**: `tests/unit/skills-layout.test.ts` (new),
`tests/unit/skills-validate.test.ts` (extended)

**Validation**: `pnpm test` green for both files; no existing test
modified in a way that changes its pass/fail behavior; scenario 7 tests pass.

---

### T012 — WP02 verification (gate for Definition of Done)

**Steps** (run in order):
```bash
pnpm build              # strict tsc — zero errors
pnpm test               # full suite — zero failures, zero new skips
```

Byte-stability smoke check (manual, documents NFR-001):
```bash
pnpm build
node -e "
const { validateStatic } = require('./dist/adapters/skills/validate.js');
// create a minimal doc object and call validateStatic twice
// compare JSON.stringify of both results
console.log('byte-stable: see test suite assertion');
"
```
(The actual byte-stability assertion is in the test suite from T011; CI green
proves it passes.)

Confirm no core files modified:
```bash
git diff --stat src/core/   # must show no changes
```

Confirm only owned files changed:
```bash
git diff --stat   # must show only: src/adapters/skills/layout.ts (new),
                  # src/adapters/skills/validate.ts (modified),
                  # tests/unit/skills-layout.test.ts (new),
                  # tests/unit/skills-validate.test.ts (modified)
```

## Definition of Done

- [ ] `src/adapters/skills/layout.ts` implements path-traversal guard lexically (no I/O on escaping paths)
- [ ] `src/adapters/skills/layout.ts` emits violations for missing bundled files citing agentskills.io §directory-layout@SHA
- [ ] `src/adapters/skills/validate.ts` extended with optional-field rules + allowed-tools experimental warning
- [ ] `src/adapters/skills/validate.ts` Anthropic profile gate silent when `profile === "base"`
- [ ] Byte-stability assertion in test suite passes
- [ ] All Anthropic profile tests cover acceptance scenario 7 explicitly
- [ ] `pnpm build` (strict tsc) passes with zero errors
- [ ] `pnpm test` green; no existing test modified; no new skips
- [ ] No file under `src/core/` modified
- [ ] Every new violation has a non-empty `section` citing an agentskills.io clause or the Anthropic docs URL

## Reviewer guidance

- **Reject if** `layout.ts` calls any `fs.*` function on a path that escapes the skill root
  (check for any `fs.existsSync` or similar call that could receive a `../` path).
- Check the Anthropic profile gate: grep for `profile === "base"` guard — if it's
  missing, a profile=base run could incorrectly surface reserved-word violations.
- Verify the Anthropic docs URL in `validate.ts` is a real, non-placeholder URL.
  A placeholder URL is an automatic reject.
- For the `allowed-tools` experimental warning: the warning must be emitted even
  when the field value is structurally valid — check the test assertions confirm
  `severity: "warning"` appears alongside zero errors.
- Byte-stability test: confirm it calls `validateStatic` twice and does a strict
  string equality comparison on the serialized output (not a reference comparison).
