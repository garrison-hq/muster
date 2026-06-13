---
work_package_id: WP02
title: Drift checks vs. supplied environment descriptor
dependencies:
- WP01
requirement_refs:
- FR-004
- FR-005
- FR-009
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
history:
- timestamp: '2026-06-13T01:30:00Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/adapters/tools/
execution_mode: code_change
owned_files:
- src/adapters/tools/drift.ts
- tests/tools/unit/drift.test.ts
- tests/tools/fixtures/env-descriptors/matching-mcp.json
- tests/tools/fixtures/env-descriptors/matching-openai.json
- tests/tools/fixtures/env-descriptors/documented-but-missing.json
- tests/tools/fixtures/env-descriptors/present-but-undocumented.json
- tests/tools/fixtures/env-descriptors/schema-mismatch-sub.json
- tests/tools/fixtures/env-descriptors/schema-mismatch-super.json
- tests/tools/fixtures/env-descriptors/unknown-format.json
tags: []
---

# WP02 — Drift checks vs. supplied environment descriptor

## Objective

Implement `src/adapters/tools/drift.ts`: the headline of this mission. Accept a
`TOOLSFile` (parsed in WP01) and an `EnvironmentDescriptor` (an MCP server
manifest export or OpenAI-compatible tool/function registry JSON supplied as an
input artifact) and emit structured `DriftFinding` entries classifying any
divergence between the documented tool set and the live environment. Produce a
byte-stable `DriftReport`.

This WP introduces the **drift test class** for muster — the first file-vs-reality
comparison. The class is designed to be reusable by other adapters (e.g. memory
recall, schedule action-diff) but the tool-specific match-rubric stays inside
this adapter (C-004).

## Context (read first)

- Spec: `kitty-specs/tools-adapter-01KTYMCB/spec.md` (FR-004, FR-005, FR-009,
  C-003, C-004; acceptance scenarios 3–6; all edge cases)
- Data model: `kitty-specs/tools-adapter-01KTYMCB/data-model.md`
  (`EnvironmentDescriptor`, `DriftFinding`, `DriftReport` — read all invariants)
- Plan: `kitty-specs/tools-adapter-01KTYMCB/plan.md` — WP02 section; match-rubric
  description; drift finding kinds and direction
- WP01: `src/adapters/tools/lint.ts` — `TOOLSFile`, `ToolDescriptor`,
  `ParameterDescriptor` (import from here; do not re-declare)
- Charter: `.kittify/charter/charter.md` — "every check cites a normative source";
  offline + byte-stable; UTF-16 code-unit canonical ordering

**Hard rules for the whole WP**:
1. Touch only files in `owned_files`. Do not modify `src/adapters/tools/lint.ts`.
2. `src/core/` is never modified (C-001).
3. The drift path performs **zero network calls** — the `EnvironmentDescriptor`
   is loaded from a file path (C-003, NFR-001). No `fetch`, no HTTP client.
4. Every `DriftFinding` must carry a non-empty `citedRubric` — the code must
   refuse to emit a finding without one (charter; FR-009). Enforce this with a
   compile-time check (required field) and a runtime assertion in tests.
5. Unknown descriptor format must produce a clear error, never a silent pass
   (spec edge case).
6. `pnpm build` (`tsc` strict) must pass before each commit.

## Subtasks

### T008 — Types: `EnvironmentDescriptor`, `EnvironmentToolEntry`, `DriftFinding`, `DriftReport`

**Purpose**: Declare all four types in `src/adapters/tools/drift.ts`. These are
the output contract of the drift test class; getting them right here keeps the
integration (WP04) clean.

**Steps**:
1. Read `kitty-specs/tools-adapter-01KTYMCB/data-model.md` — `EnvironmentDescriptor`,
   `EnvironmentToolEntry`, `DriftFinding`, `DriftReport` sections in full,
   including all invariants.
2. Import `ParameterDescriptor` from `./lint` (do not re-declare it).
3. Declare `EnvironmentDescriptorFormat` union:
   `"mcp-manifest" | "openai-tool-registry"`.
4. Declare `EnvironmentToolEntry` (`name: string`,
   `parameters: ReadonlyMap<string, ParameterDescriptor>`).
5. Declare `EnvironmentDescriptor` (`format`, `path`, `tools:
   ReadonlyMap<string, EnvironmentToolEntry>`). Add invariant comment: tools keys
   are normalised name strings; loading a file that matches neither known format
   throws a clear error.
6. Declare `DriftFindingKind` union:
   `"documented-but-missing" | "present-but-undocumented" | "schema-mismatch"`.
7. Declare `SchemaMismatchDirection` union:
   `"docs-ahead" | "reality-ahead"`.
8. Declare `DriftFinding` with all fields from the data model, including the
   invariant comment on `citedRubric` ("never absent; charter invariant").
9. Declare `DriftReport` with `toolsFilePath`, `envDescriptorPath`,
   `envDescriptorFormat`, `findings: readonly DriftFinding[]`, `clean: boolean`.
   Add invariant: `clean === (findings.length === 0)`.
10. Export all types.

**Files**: `src/adapters/tools/drift.ts` (create; types only at this stage)

**Validation**: `pnpm build` clean.

---

### T009 — Format detection and `loadEnvironmentDescriptor()`

**Purpose**: Implement the function that reads a JSON file from disk and detects
whether it is an MCP server manifest or an OpenAI-compatible tool/function
registry. Unknown formats must produce a clear error.

**Steps**:
1. Define the two JSON shapes the adapter recognises:
   - **MCP manifest**: a JSON object with a `"tools"` array where each entry has
     `"name"` (string) and optionally `"inputSchema"` (JSON Schema object). A
     presence check on `tools[0].inputSchema` or `tools` being an array of
     objects with `"name"` is sufficient for detection.
   - **OpenAI tool registry**: a JSON object with a `"tools"` array where each
     entry has `"type": "function"` and `"function"` sub-object containing
     `"name"` and `"parameters"` (JSON Schema). Alternatively, the top level may
     itself be an array of such objects.
   Detection is by structural inspection (duck typing), not by a `"format"` key.
2. Implement `loadEnvironmentDescriptor(filePath: string): Promise<EnvironmentDescriptor>`:
   - Read the file with `fs/promises.readFile` + `JSON.parse`.
   - Detect format. If neither shape matches, throw a descriptive error:
     `UnknownDescriptorFormatError` (a named Error subclass) with a message that
     names the file path and explains the two recognised formats. Never return a
     partially-constructed descriptor.
   - Normalise to `EnvironmentDescriptor`: build `tools` as a
     `Map<string, EnvironmentToolEntry>` keyed by tool name. For MCP manifests,
     extract parameter types from `inputSchema.properties` if present; mark
     `required` from the `required` array. For OpenAI registries, extract from
     `function.parameters.properties`.
   - Set `format` and `path`.
3. Export `loadEnvironmentDescriptor` and `UnknownDescriptorFormatError`.

**Files**: `src/adapters/tools/drift.ts`

**Validation**: `pnpm build` clean. Full validation in T013.

---

### T010 — `runDriftCheck()` — match-rubric: name-match, param-set comparison, type-match

**Purpose**: Implement the core drift-check function. Compare a `TOOLSFile` against
a loaded `EnvironmentDescriptor` using the muster-published match-rubric and emit
`DriftFinding` entries for each divergence.

**Match-rubric** (cite as `"muster-rubric:tools/drift/v1"` in every finding):
1. **Name-match**: a documented tool name matches an environment tool name if
   they are identical strings (exact match, case-sensitive). No fuzzy matching.
2. **documented-but-missing**: a tool in `TOOLSFile.tools` whose `name` has no
   corresponding key in `EnvironmentDescriptor.tools`.
3. **present-but-undocumented**: a tool in `EnvironmentDescriptor.tools` whose
   `name` has no corresponding entry in `TOOLSFile.tools`.
4. **schema-mismatch**: names match but structured schemas differ — parameter
   names, types, or required flags differ. Emit one finding per mismatched tool.
   - Record `direction`:
     - `"docs-ahead"`: documented parameters are a strict superset of environment
       parameters (documentation declares more than the environment has).
     - `"reality-ahead"`: environment parameters are a strict superset or type
       differs with environment having more/different info.
   - Record `fields`: the specific parameter names (or `"type"` / `"required"`
     suffixes) that differ, e.g. `["parameters.recipient.type"]`.
   - Prose-only differences (descriptions differ but structured schemas are
     identical): emit with `proseOnly: true`, `fields` absent/empty, lower
     severity (spec edge case). Cite
     `"muster-rubric:tools/drift/prose-description/v1"`.
5. A clean comparison (no divergence) produces an empty `findings` array.

**Steps**:
1. Implement
   `runDriftCheck(toolsFile: TOOLSFile, envDescriptor: EnvironmentDescriptor): DriftReport`.
2. Collect documented tool names (from `toolsFile.tools`).
3. Collect environment tool names (from `envDescriptor.tools.keys()`).
4. Documented-but-missing pass: iterate documented names; emit findings for any
   absent from environment.
5. Present-but-undocumented pass: iterate environment names; emit findings for
   any absent from documented set.
6. Schema-mismatch pass: for names present in both, compare
   `ToolDescriptor.parameters` vs `EnvironmentToolEntry.parameters`. A
   parameter-set mismatch is any difference in: the set of parameter names, any
   type field, any required flag.
7. Build `DriftReport`: set `findings` (ordering deferred to T011), `clean`.
8. Every finding must have a non-empty `citedRubric`. Add a runtime assertion
   (`if (!finding.citedRubric) throw new Error(...)`) as a safety net alongside
   the compile-time type guarantee.

**Files**: `src/adapters/tools/drift.ts`

**Validation**: `pnpm build` clean. Full validation in T013.

---

### T011 — Deterministic output ordering (kind-then-toolName, UTF-16 code-unit)

**Purpose**: Ensure `DriftReport.findings` is sorted in a deterministic,
locale-independent order so that the same `TOOLS.md` + env-descriptor always
produces byte-identical output (SC-002, NFR-001).

**Steps**:
1. Sort `findings` by `(kind, toolName)` using UTF-16 code-unit comparator:
   ```ts
   findings.sort((a, b) => {
     const kindCmp = a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
     if (kindCmp !== 0) return kindCmp;
     return a.toolName < b.toolName ? -1 : a.toolName > b.toolName ? 1 : 0;
   });
   ```
   Do NOT use `localeCompare` — locale-independence is required (consistent with
   `src/core/canonical-json.ts`; charter byte-stable constraint). Add a comment
   stating this.
2. Apply the sort in `runDriftCheck` before constructing the final `DriftReport`.
3. For `schema-mismatch` findings, also sort `fields` by the same UTF-16
   code-unit comparator so the fields array is byte-stable.

**Files**: `src/adapters/tools/drift.ts`

**Validation**: running `runDriftCheck` twice on the same inputs produces
`JSON.stringify`-identical output (confirmed in T013 test step for scenario 6).

---

### T012 — Fixture authoring: 7 env-descriptor JSON files

**Purpose**: Author the seven environment-descriptor fixtures that drive acceptance
scenarios 3–6 and the spec edge cases. These fixtures use `well-formed.md`
(from WP01) as the documented side — `send_email` and `list_files` are the two
documented tools.

**Steps**:
1. **`matching-mcp.json`** — MCP manifest shape; exactly matches `well-formed.md`:
   both `send_email` and `list_files` with parameter schemas that are identical
   to the documented versions. Used by scenario 6 (drift report clean; SC-002).
   ```json
   {
     "tools": [
       {
         "name": "send_email",
         "inputSchema": {
           "type": "object",
           "properties": {
             "recipient": { "type": "string" },
             "subject": { "type": "string" },
             "body": { "type": "string" }
           },
           "required": ["recipient", "subject"]
         }
       },
       {
         "name": "list_files",
         "inputSchema": {
           "type": "object",
           "properties": {
             "directory": { "type": "string" },
             "extension": { "type": "string" }
           },
           "required": ["directory"]
         }
       }
     ]
   }
   ```
2. **`matching-openai.json`** — OpenAI tool-registry shape; same tools, same
   schemas, using `{"type": "function", "function": {"name": ..., "parameters": ...}}`
   envelope. Both `send_email` and `list_files`. Used to verify format detection
   for the OpenAI shape also produces a clean report.
3. **`documented-but-missing.json`** — MCP manifest with only `list_files`;
   `send_email` is absent. Used by scenario 3 (FR-004 — documented-but-missing
   finding for `send_email`).
4. **`present-but-undocumented.json`** — MCP manifest with `send_email`,
   `list_files`, and `delete_file` (extra, undocumented). Used by scenario 4
   (present-but-undocumented finding for `delete_file`).
5. **`schema-mismatch-sub.json`** — MCP manifest with `send_email` whose
   `inputSchema` omits the `body` parameter (a subset of the documented schema —
   reality-ahead direction: docs declare more than environment has — actually
   "docs-ahead"; `body` is documented but absent from environment). Used by
   scenario 5 (schema-mismatch; direction `"docs-ahead"`; field
   `"parameters.body"`).
6. **`schema-mismatch-super.json`** — MCP manifest with `send_email` whose
   `inputSchema` adds an extra `cc` parameter not in the documentation
   (superset — `"reality-ahead"`). Used by the superset edge case.
7. **`unknown-format.json`** — a JSON object that matches neither known shape
   (e.g., `{"version": 1, "capabilities": []}`) — used to verify the
   unknown-format error edge case.

**Files**:
- `tests/tools/fixtures/env-descriptors/matching-mcp.json` (NEW)
- `tests/tools/fixtures/env-descriptors/matching-openai.json` (NEW)
- `tests/tools/fixtures/env-descriptors/documented-but-missing.json` (NEW)
- `tests/tools/fixtures/env-descriptors/present-but-undocumented.json` (NEW)
- `tests/tools/fixtures/env-descriptors/schema-mismatch-sub.json` (NEW)
- `tests/tools/fixtures/env-descriptors/schema-mismatch-super.json` (NEW)
- `tests/tools/fixtures/env-descriptors/unknown-format.json` (NEW)

**Validation**: JSON is valid (parse with `JSON.parse` in a quick node one-liner
to check); format detection in T009 correctly classifies each fixture.

---

### T013 — `tests/tools/unit/drift.test.ts` — all three finding types + clean + edge cases

**Purpose**: Write the complete unit test suite for the drift check. Must cover
acceptance scenarios 3–6 and all spec edge cases. Meets ≥80% new-code coverage
requirement.

**Steps**:
1. Import `loadEnvironmentDescriptor`, `runDriftCheck`,
   `UnknownDescriptorFormatError` from `src/adapters/tools/drift.ts`.
   Import `parseTOOLSFile` from `src/adapters/tools/lint.ts` (WP01 dependency).
2. **Scenario 3 (FR-004)**: parse `well-formed.md` + load
   `documented-but-missing.json`; assert:
   - `report.findings.some(f => f.kind === 'documented-but-missing' && f.toolName === 'send_email')`
   - `report.findings[0].citedRubric` is non-empty (charter invariant)
   - `report.clean === false`
3. **Scenario 4 (FR-004)**: parse `well-formed.md` + load
   `present-but-undocumented.json`; assert:
   - `report.findings.some(f => f.kind === 'present-but-undocumented' && f.toolName === 'delete_file')`
4. **Scenario 5 (FR-004)**: parse `well-formed.md` + load `schema-mismatch-sub.json`;
   assert:
   - `report.findings.some(f => f.kind === 'schema-mismatch' && f.toolName === 'send_email')`
   - `f.direction === 'docs-ahead'`
   - `f.fields` includes `'parameters.body'`
5. **Scenario 6 (SC-002 — byte-stable clean report)**: parse `well-formed.md` +
   load `matching-mcp.json`; assert:
   - `report.clean === true`
   - `report.findings.length === 0`
   - Run twice; assert `JSON.stringify(run1) === JSON.stringify(run2)` (byte-stability)
6. **Schema-mismatch superset edge case**: `well-formed.md` + `schema-mismatch-super.json`;
   assert direction is `'reality-ahead'`.
7. **Unknown-format edge case**: assert `loadEnvironmentDescriptor('unknown-format.json')`
   throws `UnknownDescriptorFormatError` with a non-empty message naming the
   file path.
8. **OpenAI format**: `well-formed.md` + `matching-openai.json`; assert clean report
   and `report.envDescriptorFormat === 'openai-tool-registry'`.
9. **citedRubric invariant**: for every `DriftFinding` in every test, assert
   `finding.citedRubric.length > 0`.
10. **Ordering invariant**: for a multi-finding report, assert `findings` are
    sorted kind-first then toolName (spot-check two entries in declared order).

**Files**: `tests/tools/unit/drift.test.ts` (NEW)

**Validation**: `pnpm test -- tests/tools/unit/drift.test.ts` green; zero skips;
≥80% new-code coverage on `src/adapters/tools/drift.ts`.

---

### T014 — WP02 verification: offline constraint + byte-stability

**Purpose**: Gate for Definition of Done. Confirm the drift path holds all constraints.

**Steps** (in order):
```bash
pnpm build                                           # strict tsc — zero errors
pnpm test -- tests/tools/unit/drift.test.ts         # all cases green; zero skips
git diff --stat                                      # ONLY owned_files changed
# Confirm no network calls introduced:
grep -rn 'fetch\|http\|https\|axios\|got\|request' src/adapters/tools/drift.ts || echo "OK — zero network calls"
```

Confirm:
- Scenario 3 (documented-but-missing `send_email`) passes.
- Scenario 4 (present-but-undocumented `delete_file`) passes.
- Scenario 5 (schema-mismatch with direction + fields) passes.
- Scenario 6 (clean + byte-stable) passes.
- Unknown-format throws `UnknownDescriptorFormatError`, not a silent pass.
- Every `DriftFinding` carries a non-empty `citedRubric`.

**Files**: no new files; verification only.

**Validation**: all checks above pass; WP is ready for reviewer.

## Definition of Done

- [ ] `src/adapters/tools/drift.ts` exports `EnvironmentDescriptor`, `DriftFinding`,
  `DriftReport`, `loadEnvironmentDescriptor`, `runDriftCheck`,
  `UnknownDescriptorFormatError`
- [ ] Acceptance scenario 3 (`documented-but-missing`) passes
- [ ] Acceptance scenario 4 (`present-but-undocumented`) passes
- [ ] Acceptance scenario 5 (`schema-mismatch` with direction + fields) passes
- [ ] Acceptance scenario 6 (clean report; byte-stable across runs — SC-002) passes
- [ ] Unknown-format error: throws `UnknownDescriptorFormatError`, never silent pass
- [ ] Superset and subset direction correctly classified as `reality-ahead` /
  `docs-ahead`
- [ ] `findings` array ordered deterministically (kind-then-toolName, UTF-16
  code-unit; no `localeCompare`)
- [ ] Zero network calls in `drift.ts` (grep-verified)
- [ ] Every `DriftFinding` carries a non-empty `citedRubric` (charter)
- [ ] `pnpm build` (strict tsc) green; `pnpm test -- drift.test.ts` green
- [ ] No files outside `owned_files` modified; `src/core/` unchanged

## Reviewer guidance

- **Reject if** any network call (`fetch`, `http`, `axios`) appears in
  `drift.ts` — the drift path is offline (C-003, NFR-001).
- **Reject if** any `DriftFinding` is emitted with an empty or missing
  `citedRubric` — check the test assertions, not just the code.
- Check format detection: unknown format must throw a named error class with
  informative message. A catch-all returning `null` or empty descriptor is wrong.
- Check the ordering sort: must use `<`/`>` comparator, not `localeCompare`.
  Comment explaining the locale-independence constraint must be present.
- Check direction on schema-mismatch: `schema-mismatch-sub.json` → `docs-ahead`;
  `schema-mismatch-super.json` → `reality-ahead`. Verify the test covers both.
- Verify `proseOnly` flag: when structured schemas are identical but only prose
  descriptions differ, the finding should have `proseOnly: true`.
