---
work_package_id: WP01
title: SOP parse + rule-manifest schema + static lint
dependencies: []
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-009
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
history:
- timestamp: '2026-06-13T01:30:00Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/adapters/openclaw-sop/
execution_mode: code_change
owned_files:
- src/adapters/openclaw-sop/manifest.ts
- src/adapters/openclaw-sop/index.ts
- tests/adapters/openclaw-sop/manifest.test.ts
- tests/adapters/openclaw-sop/fixtures/agents-wellformed.md
- tests/adapters/openclaw-sop/fixtures/agents-undefined-precedence.md
- tests/adapters/openclaw-sop/fixtures/agents-tool-drift.md
- tests/adapters/openclaw-sop/fixtures/rule-manifest-valid.yaml
- tests/adapters/openclaw-sop/fixtures/rule-manifest-drift.yaml
tags: []
---

# WP01 — SOP parse + rule-manifest schema + static lint

## Objective

Ship `src/adapters/openclaw-sop/manifest.ts` (SOPFile reader, SOPRuleManifest JSON/YAML
schema + Ajv validator, undefined-precedence detector, tool-reference drift detector)
and the initial `src/adapters/openclaw-sop/index.ts` (SOPAdapter entry-point + static
lint orchestration returning `SOPLintReport`). This WP is the **schema gate** for all
downstream WPs: WP02/WP03/WP04 import types from `manifest.ts` and `index.ts`.

No behavioral runner calls land in this WP — static lint only. The manifest runner
(compliance + adversarial probe dispatch) is WP05's responsibility.

## Context (read first)

- Spec: `kitty-specs/openclaw-sop-adapter-01KTYKNZ/spec.md` — FR-001, FR-002, FR-003,
  FR-009, FR-011 (schema portion), FR-013 (rubric doc scaffold placeholder only in this WP)
- Plan: `kitty-specs/openclaw-sop-adapter-01KTYKNZ/plan.md` — WP01 section; new-grader
  capabilities table; Project Structure; Technical Context
- Data model: `kitty-specs/openclaw-sop-adapter-01KTYKNZ/data-model.md` — `SOPFile`,
  `SOPRuleManifest`, `SOPRuleManifestEntry`, `SOPLintFinding`, `SOPSuiteReport`
  (export the interfaces; full report assembly is WP05)
- Charter: `.kittify/charter/charter.md` — every check cites a normative source
  (traceability rule); static path offline + byte-stable deterministic; C-001 (core
  boundary); C-006 (muster never rewrites the SOP file)
- Existing adapter for structural reference: `src/adapters/rfc1/` (index, manifest,
  types pattern to mirror)

**Hard rules for this WP**:
1. `src/core/` is untouched — C-001 is absolute. No SOP-specific imports land in core.
2. The manifest validator **must reject** any entry whose `source.normative` is absent
   or empty — this is a hard manifest error, never a silent pass (FR-009, charter).
3. Static lint output is a pure function of SOP text + manifest; zero network calls
   (NFR-001). No `fetch`, no external I/O beyond reading the files passed as arguments.
4. Touch only files in `owned_files`. WP02/WP03/WP04 own `graders.ts` and `probes.ts`.

## Subtasks

### T001 — `manifest.ts`: SOPFile reader + SOPRuleManifest schema + Ajv validator + detectors

**Purpose**: Implement the data-layer of the static lint path. This is the module that
all other WPs import types from.

**Steps**:
1. Export the TypeScript interfaces from `data-model.md` verbatim (they are
   authoritative): `SOPFile`, `SOPRuleManifest`, `SOPRuleManifestEntry`,
   `SOPLintFinding`, `SOPSuiteReport` (stub only — full assembly is WP05),
   `BinaryAssertion` (discriminated union with all five `kind` values),
   `JudgeAssertion`, `ComplianceProbe`, `AdversarialProbe`, `SOPCaseVerdict`,
   `SOPRunVerdict`, `SOPGrade`.
2. Implement `readSOPFile(filePath: string): Promise<SOPFile>`: read the file as UTF-8,
   populate `path`, `content`, `byteLength` (Buffer.byteLength with encoding 'utf8').
   The content is returned verbatim — muster never rewrites it (C-006).
3. Define the `SOPRuleManifest` JSON Schema (Ajv Draft 2020-12 compatible) as a
   file-local constant. Required properties per data model: `version` (string),
   `sopFile` (string), `rules` (array of entries). Per entry: `ruleId` (string),
   `ruleText` (string), `probeIds` (string[]), `gradingClass` ("binary" | "judge"),
   `aggregation` ("pass-k" | "k-of-n"), `k` (integer ≥ 1),
   `passThreshold` (optional integer), `source` (object with required `normative`
   non-empty string and optional `supporting` string).
4. Implement `loadAndValidateManifest(manifestPath: string): Promise<SOPRuleManifest>`:
   read YAML (use the `yaml` package already in deps), parse, run Ajv validator.
   Any Ajv validation error → throw with a message listing all errors.
   Additional semantic checks after Ajv passes:
   - Duplicate `ruleId` values → throw.
   - Any entry where `source.normative` is an empty string → throw (belt-and-
     suspenders; schema requires non-empty but confirm at runtime too).
   - Any entry where `aggregation === "pass-k"` and `passThreshold` is present and
     `passThreshold !== k` → throw.
5. Implement `detectUndefinedPrecedence(manifest: SOPRuleManifest): SOPLintFinding[]`:
   scan entries for pairs that share the same trigger (same `ruleText` prefix up to
   the first comma or period, case-insensitive) yet declare conflicting
   `gradingClass` or `aggregation`. For each conflicting pair emit a finding with:
   `kind: "UNDEFINED_PRECEDENCE"`, severity `"warning"`, location = both ruleIds
   joined by " / ", `source` = `"docs/rubric/sop-rule-taxonomy.md"` (the normative
   rubric stub; WP05 publishes the full doc at that path). The manifest can also
   declare an explicit `precedence` field per entry (optional string) — if both
   entries have it, no finding is emitted.
6. Implement `detectToolDrift(manifest: SOPRuleManifest, sopFile: SOPFile, envTools: string[]): SOPLintFinding[]`:
   for each manifest entry whose `ruleText` contains a tool name (heuristic:
   backtick-quoted identifier that also appears in `forbiddenTools` or
   `destructiveTools` of any `BinaryAssertion`), check whether that tool name
   appears in `envTools`. If not, emit a `TOOL_DRIFT` finding (severity `"warning"`).
   `envTools` is passed by the caller (the adapter entry-point reads it from a
   companion env-descriptor file if present, or passes `[]`).
7. Implement `checkRuleTextPresence(manifest: SOPRuleManifest, sopFile: SOPFile): SOPLintFinding[]`:
   for each manifest entry, check that `entry.ruleText` appears as a substring of
   `sopFile.content` (verbatim, case-sensitive). If not, emit a `RULE_DRIFT` finding
   (severity `"warning"`, not `"error"` — the rule may still govern the run; spec
   edge case).

**Files**: `src/adapters/openclaw-sop/manifest.ts`

**Validation referencing FR-002, FR-003, FR-009**:
- `readSOPFile` reads the wellformed fixture (`agents-wellformed.md`) without error
  and returns verbatim content.
- `loadAndValidateManifest` accepts `rule-manifest-valid.yaml` and throws on
  `rule-manifest-drift.yaml` — no, wait: `rule-manifest-drift.yaml` is a valid
  manifest (it passes Ajv) but its `ruleText` doesn't appear in the SOP file,
  so `checkRuleTextPresence` emits a `RULE_DRIFT` finding. Verify this distinction.
- `loadAndValidateManifest` throws when `source.normative` is absent.
- `detectUndefinedPrecedence` emits a finding on `agents-undefined-precedence.md`'s
  companion manifest and emits nothing on `rule-manifest-valid.yaml`.
- `detectToolDrift` emits a finding when the SOP references a tool not in `envTools`.

---

### T002 — `index.ts`: SOPAdapter entry-point + static lint orchestration

**Purpose**: Wire the parsing functions from T001 into a `SpecAdapter`-compatible
entry-point and expose the static lint as a callable function returning `SOPLintReport`.

**Steps**:
1. Export a `SOPAdapter` class (or object) that implements the `SpecAdapter` interface
   from `src/core/` (read the existing `src/adapters/rfc1/index.ts` for the expected
   shape). The adapter's `name` is `"openclaw-sop"`.
2. Implement `runStaticLint(sopFilePath: string, manifestPath: string, envToolsPath?: string): Promise<SOPLintReport>`:
   - Read SOP file via `readSOPFile`.
   - Load manifest via `loadAndValidateManifest`; if this throws, return a
     `SOPLintReport` with a single `MANIFEST_ERROR` finding (severity `"error"`,
     `passed: false`).
   - Optionally read env-tools descriptor if `envToolsPath` provided (simple JSON
     array of strings).
   - Run `checkRuleTextPresence`, `detectUndefinedPrecedence`, `detectToolDrift`;
     collect all findings.
   - Return `SOPLintReport`: `{ ok: boolean; findings: SOPLintFinding[] }` where
     `ok` is true iff no finding has severity `"error"`.
3. Export types re-exported from `manifest.ts` so downstream WPs can import from
   `src/adapters/openclaw-sop/index.ts` as a single entry-point.
4. The `runStaticLint` function must be pure deterministic: given the same input
   files it always returns the same output; zero network calls; no side effects
   (NFR-001, charter byte-stable requirement).
5. Add a minimal JSDoc comment to each exported symbol noting the normative source:
   `// FR-003: cites docs/rubric/sop-rule-taxonomy.md as normative source`.

**Files**: `src/adapters/openclaw-sop/index.ts`

**Validation referencing FR-001, FR-003**:
- Calling `runStaticLint` with `agents-wellformed.md` + `rule-manifest-valid.yaml`
  returns `{ ok: true, findings: [] }` (acceptance scenario SC-006 first case).
- Calling with `agents-undefined-precedence.md` + its companion manifest returns a
  report with exactly one `UNDEFINED_PRECEDENCE` finding.
- Calling with `agents-tool-drift.md` + the drift manifest returns a `TOOL_DRIFT`
  finding.
- `SOPAdapter` class instantiates without error; its `name` property equals
  `"openclaw-sop"`.

---

### T003 — Static lint fixtures

**Purpose**: Provide the concrete fixture files that all static lint tests exercise.

**Steps**:
1. `agents-wellformed.md` — a plausible OpenClaw-style `AGENTS.md` SOP with at least
   three rules covering distinct rule classes (never-call-tool, confirm-before-
   destructive, exact-string-non-leakage). Rules are verbatim in the text so
   `checkRuleTextPresence` passes. No contradictions; no undefined precedence; tool
   names match the companion manifest's `forbiddenTools`.
2. `agents-undefined-precedence.md` — same structure but contains two rules with
   overlapping triggers and conflicting `aggregation` declarations (one says `pass-k`,
   the other says `k-of-n` for the same rule class) and no `precedence` field.
   The companion manifest for this file must also be placed here as an inline YAML
   fixture embedded in the test (`manifest.test.ts` T004) rather than a separate file
   to avoid cluttering the fixture dir — or as `rule-manifest-undefined-precedence.yaml`
   if the test benefits from a standalone file (implementer's choice; document it).
3. `agents-tool-drift.md` — SOP referencing a tool (e.g., `delete_file`) that is
   absent from the companion env-tools descriptor (`[]` or `["read_file"]`).
4. `rule-manifest-valid.yaml` — a valid manifest for `agents-wellformed.md`: version,
   sopFile path, three rule entries each with non-empty `source.normative` pointing to
   `docs/rubric/sop-rule-taxonomy.md`, correct `gradingClass` and `aggregation`, and
   `k ≥ 1`. Must pass Ajv validation and all semantic checks.
5. `rule-manifest-drift.yaml` — a manifest that is Ajv-valid but whose first rule's
   `ruleText` does not appear in `agents-wellformed.md` content (triggers `RULE_DRIFT`
   finding). All other fields valid.

**Files**:
- `tests/adapters/openclaw-sop/fixtures/agents-wellformed.md`
- `tests/adapters/openclaw-sop/fixtures/agents-undefined-precedence.md`
- `tests/adapters/openclaw-sop/fixtures/agents-tool-drift.md`
- `tests/adapters/openclaw-sop/fixtures/rule-manifest-valid.yaml`
- `tests/adapters/openclaw-sop/fixtures/rule-manifest-drift.yaml`

**Validation**: fixtures are loaded by T004 tests without modification. Any implementer
edit to fixtures after T004 tests are written is a test-weakening signal.

---

### T004 — `manifest.test.ts`: static lint acceptance scenarios + edge cases

**Purpose**: Verify all three static lint acceptance scenarios from the spec
(SC-006) plus the manifest-drift edge case and the ambiguous-confirmation manifest
error.

**Steps**:
1. Test: `runStaticLint` with `agents-wellformed.md` + `rule-manifest-valid.yaml` →
   `{ ok: true, findings: [] }`. This is SC-006 first case.
2. Test: `runStaticLint` with `agents-undefined-precedence.md` + its companion
   manifest → exactly one finding with `kind === "UNDEFINED_PRECEDENCE"`. Verify
   the finding's `source` field equals `"docs/rubric/sop-rule-taxonomy.md"`.
   This is SC-006 second case and acceptance scenario 2 from spec.
3. Test: `runStaticLint` with `agents-tool-drift.md` + `rule-manifest-valid.yaml` +
   `envTools: []` → exactly one `TOOL_DRIFT` finding. This is acceptance scenario 3
   from spec.
4. Test (manifest drift edge case): `runStaticLint` with `agents-wellformed.md` +
   `rule-manifest-drift.yaml` → report contains a `RULE_DRIFT` finding; `ok` is
   still `true` (RULE_DRIFT is a warning, not an error).
5. Test (ambiguous-confirmation manifest error): construct a manifest entry with
   `gradingClass: "binary"` and a `confirm-before-destructive` assertion whose
   `confirmationKind` is absent. Verify that `loadAndValidateManifest` throws
   with a message identifying the missing `confirmationKind`. This must NOT be a
   silent pass (spec edge case section).
6. Test: `loadAndValidateManifest` called with a manifest that has a rule entry
   with `source.normative: ""` → throws (FR-009 citation gate).
7. Test: `loadAndValidateManifest` called with a manifest having two entries with
   the same `ruleId` → throws (uniqueness invariant).

Each test is independent (no shared state). Use `import.meta.dirname` for resolving
fixture paths. Tests must not make any network calls.

**Files**: `tests/adapters/openclaw-sop/manifest.test.ts`

**Validation**: all 7 test cases pass; `pnpm test` reports no failing tests in this
file; static lint fixture suite total time ≤10 s (NFR-003).

---

### T005 — WP01 verification (gate for Definition of Done)

**Steps** (in order):
```bash
pnpm build              # strict tsc must pass; zero type errors
pnpm test               # full Vitest suite including manifest.test.ts — zero failures
# Measure static lint suite time (must be ≤10 s total)
time pnpm test --reporter=verbose --testPathPattern="adapters/openclaw-sop"
git diff --stat         # ONLY owned_files changed — no src/core/ touched
```
Confirm C-001 boundary:
```bash
grep -r "openclaw-sop\|SOPRule\|SOPFile\|SOPLint" src/core/ && echo "BOUNDARY VIOLATION" || echo "OK"
```
Expected output: `OK`.

Confirm zero network calls on the static path:
```bash
grep -r "fetch\|http\|https\|axios\|node-fetch" src/adapters/openclaw-sop/manifest.ts src/adapters/openclaw-sop/index.ts && echo "NETWORK CALL FOUND" || echo "OK"
```
Expected output: `OK`.

## Definition of Done

- [ ] `manifest.ts` exports all data-model types; Ajv validator rejects manifest with missing `source.normative`
- [ ] `index.ts` exposes `SOPAdapter` and `runStaticLint`; static lint is pure deterministic (zero network I/O)
- [ ] All 5 fixture files created and load without error in tests
- [ ] All 7 `manifest.test.ts` cases pass; acceptance scenarios 1/2/3 and edge cases covered
- [ ] `pnpm build` (strict tsc) and `pnpm test` green; no `src/core/` files touched
- [ ] Static lint fixture suite completes in ≤10 s (NFR-003)
- [ ] C-001 grep check returns `OK`
- [ ] No network calls on the static path (grep check `OK`)
- [ ] ≥80% new-code coverage on `manifest.ts` + `index.ts` (SonarCloud gate, NFR-006)

## Reviewer guidance

- **Reject if** any `src/core/` file is modified, or if any `import` in `manifest.ts`
  or `index.ts` touches `src/core/behavioral/graders.ts` — that boundary is load-bearing.
- Verify that `loadAndValidateManifest` throws on `source.normative: ""` — not a
  warning, a throw. This is the citation gate (charter).
- Check that `runStaticLint` output is byte-stable: call it twice on the same fixture
  and confirm the findings array is in a deterministic order (sort by `location` or
  `kind` if order is implementation-defined — document it).
- For `detectUndefinedPrecedence`: spot-check that a manifest with two NON-contradictory
  rules (different triggers) emits zero findings.
- Confirm `SOPAdapter.name === "openclaw-sop"` in code (not just test).
