---
work_package_id: WP02
title: RFC-1 Parse Layer
dependencies:
- WP01
requirement_refs:
- FR-001
- FR-002
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T005
- T006
- T007
agent: "claude"
shell_pid: "898937"
history:
- timestamp: '2026-06-10T20:21:16Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/adapters/rfc1/frontmatter.ts
execution_mode: code_change
owned_files:
- src/adapters/rfc1/frontmatter.ts
- src/adapters/rfc1/soul-yaml.ts
- tests/unit/frontmatter.test.ts
- tests/unit/soul-yaml.test.ts
tags: []
---

# WP02 — RFC-1 Parse Layer

## Objective

Implement §3.1.1 front-matter extraction and §4.2 Soul-YAML enforcement: detect anchors, aliases, merge keys, and custom tags at the AST level and refuse the document **without ever applying their semantics**. This is the hardest correctness requirement in the parser and the reason the `yaml` package was chosen (R1).

## Context

- Normative: `.kittify/reference/soul-spec.md` §3 (document structure), §3.1.1 (front-matter parsing), §4.1–4.2 (Soul-YAML subset, forbidden features)
- Research R1: use `parseDocument()` from `yaml`; walk nodes **before** calling `.toJS()`.
- Types from WP01: `SoulDocument`, `Violation`, `Mode` (`src/core/adapter.ts`, `src/core/report.ts`).
- FR-001, FR-002. Violations carry `section` (e.g. `"§4.2"`).

## Implementation command

```bash
spec-kitty agent action implement WP02 --agent <name>
```

## Subtasks

### T005 — Front-matter extraction (`src/adapters/rfc1/frontmatter.ts`)

**Steps**:
1. Export `extractFrontMatter(raw: string, mode: Mode): { yamlText: string; body: string } | Violation[]`.
2. Rules (§3.1.1):
   - The document MUST begin with a line that is exactly `---` (allow leading BOM; strip it — §3.2 UTF-8).
   - Front matter is everything until the next line that is exactly `---`; body is everything after.
   - Only the FIRST block is configuration; later `---` lines in the body are ignored.
   - Missing opening delimiter, or unterminated block: strict → error `{path: "", message: "missing or malformed front matter", section: "§3.1.1"}`; permissive → same refusal but the message should be actionable ("front matter must be the first content, delimited by ---").
3. Never parse YAML here — text splitting only, so soul-yaml.ts controls all YAML handling.

**Validation**:
- [ ] file starting with body text → refused both modes
- [ ] `---\nfoo: 1\n---\nbody with --- inside` → yamlText `foo: 1`, body intact
- [ ] empty front matter block (`---\n---\n`) → yamlText empty string (validation layer decides what that means)

### T006 — Soul-YAML enforcement (`src/adapters/rfc1/soul-yaml.ts`)

**Steps**:
1. Export `parseSoulYaml(yamlText: string, mode: Mode): { data: unknown } | Violation[]`.
2. Use `parseDocument(yamlText, { version: "1.2" })` from `yaml`. First check document-level errors (`doc.errors`) → Violations with `section: "§4.1"`.
3. Walk the AST (`visit` from `yaml`) BEFORE `.toJS()` and reject on (each with `section: "§4.2"` and a path built from the visit ancestry):
   - any node with a non-null `anchor` property → "anchor (&) is forbidden in Soul-YAML";
   - any `Alias` node → "alias (*) is forbidden in Soul-YAML";
   - any Pair whose key scalar value is `<<` → "merge key (<<:) is forbidden in Soul-YAML";
   - any node with an explicit custom `tag` (tag not in the YAML 1.2 core schema set) → "custom tag is forbidden in Soul-YAML".
4. Only if the walk finds nothing: `data = doc.toJS()`. The §4.2 critical requirement — forbidden semantics are NEVER applied — holds because aliases are detected before any resolution to JS values.
5. Both modes refuse; permissive mode uses the same Violations but the caller may downgrade presentation (per §4.2 option 1: "reject with warning" is the RECOMMENDED permissive behavior — we refuse to load in both modes).
6. Complex keys (non-scalar mapping keys, §4.2): detect Pair keys that are maps/sequences → reject, `section: "§4.2"`.

**Validation**:
- [ ] `a: &x 1\nb: *x` → exactly two violations (anchor, alias), data never produced
- [ ] `base: {a: 1}\nchild:\n  <<: *base` → merge-key violation; NO expansion observable anywhere
- [ ] `v: !!python/object x` / `v: !custom y` → custom-tag violation
- [ ] clean document → plain JS object with numbers/strings/bools/null intact

### T007 — Parse-layer tests (`tests/unit/frontmatter.test.ts`, `tests/unit/soul-yaml.test.ts`)

**Steps**: Cover every validation bullet above, plus:
- [ ] "§4.2 no-expansion guarantee": a document using an alias to a 1000-char scalar — assert the violation fires and that no parsed output exists (regression against accidental `.toJS()` before the walk).
- [ ] "§3.2 UTF-8": BOM-prefixed file parses; latin-1 mojibake is out of scope (Node reads UTF-8).
- [ ] Violation hygiene: every violation has non-empty `path` (or documented-empty for whole-document errors), non-empty `message`, and a `section` (NFR-005, charter directive 3).
- Test names cite sections: `"§4.2 rejects anchors without expanding"`, etc.

## Definition of Done

- All tests green; no `.toJS()` call reachable before the forbidden-feature walk (review by reading, plus the no-expansion regression test).
- No imports from `src/cli/` or other adapters; imports from `src/core/` types only.
- `pnpm build` clean under strict.

## Reviewer guidance

- THE review point: order of operations in soul-yaml.ts. If `.toJS()` is called before the AST walk completes, §4.2 is violated even if detection works.
- Check merge-key detection catches `<<` as an unquoted plain scalar key (that is how YAML parses it), not a string comparison against the rendered pair.

## Risks

- `yaml` package API surface differences across versions: pin to the version installed in WP01's lockfile; the AST property names used here (`anchor`, `Alias`, `tag`) are stable in yaml@2.x.

## Activity Log

- 2026-06-10T21:21:14Z – claude – shell_pid=898937 – Started implementation via action command
