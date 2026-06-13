---
work_package_id: WP03
title: Behavioral tool-selection probes
dependencies:
- WP01
requirement_refs:
- FR-006
- FR-007
- FR-008
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-13T01:30:00Z'
subtasks:
- T015
- T016
- T017
- T018
- T019
- T020
- T021
history:
- timestamp: '2026-06-13T01:30:00Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/adapters/tools/
execution_mode: code_change
owned_files:
- src/adapters/tools/selection.ts
- tests/tools/unit/selection.test.ts
- tests/tools/fixtures/selection-scenarios/correct-tool.json
- tests/tools/fixtures/selection-scenarios/abstain.json
- tests/tools/fixtures/selection-scenarios/control.json
tags: []
---

# WP03 — Behavioral tool-selection probes

## Objective

Implement `src/adapters/tools/selection.ts`: the behavioral layer of the tools
adapter. Register documented tools from a `TOOLSFile` as OpenAI-compatible
function-call invocables, send task scenarios to a BYOM endpoint, grade on two
axes (correct-selection and abstention), aggregate over k-of-n runs with
errored-run-is-failed semantics, and ship a rigged-impossible discrimination
control that must fail as designed.

This is the stochastic path — unit tests use mock `fetch` so no live endpoint
is required. The charter's "errored run = failed run everywhere" and "every
grader ships a rigged-impossible control" rules are primary acceptance criteria.

## Context (read first)

- Spec: `kitty-specs/tools-adapter-01KTYMCB/spec.md` (FR-006, FR-007, FR-008,
  NFR-005; acceptance scenarios 7–9; edge cases: endpoint without tool-calling,
  tool not in registered set, errored run)
- Data model: `kitty-specs/tools-adapter-01KTYMCB/data-model.md`
  (`ToolSelectionCase`, `ToolSelectionVerdict`, `ToolSelectionRunResult` — read
  all invariants)
- Plan: `kitty-specs/tools-adapter-01KTYMCB/plan.md` — WP03 section; k-of-n;
  correct-selection + abstention axes
- WP01: `src/adapters/tools/lint.ts` — `TOOLSFile` (tools registered from here)
- Charter: `.kittify/charter/charter.md` — "errored run counts as a failed run
  everywhere — never skipped, never retried"; "every judge-backed grader ships
  with a rigged-impossible control case proving it can fail"; BYOM via
  environment only; no credentials in repo
- Reference behavioral layer for structural context: `src/core/behavioral/`
  (runner, client, graders) — read but do NOT modify

**Hard rules for the whole WP**:
1. Touch only files in `owned_files`. Do not modify `src/core/` or any other
   existing file.
2. BYOM endpoint read from `process.env` (e.g. `process.env.MUSTER_ENDPOINT`
   or reuse the core client's env var convention — check `src/core/behavioral/client.ts`
   first). Never hardcode a provider URL or API key (NFR-005; charter).
3. An errored run counts as a failed run — the run result's `passed` field is
   `false` and `error` is non-empty. Never mark errored as skipped (charter).
4. A tool selected by the model that is not in the registered tool set counts
   as a wrong selection (spec edge case) — `passed === false` for that run.
5. The rigged-impossible control case (FR-008) **must** produce
   `ToolSelectionVerdict.passed === false`. A passing control is itself a test
   failure — the test asserts `verdict.passed === false`.
6. Plain `fetch` only — no provider SDK. Reuse the core behavioral client if
   it supports OpenAI-compatible function calling; if not, implement a minimal
   wrapper in `selection.ts` (no modifications to `src/core/`).

## Subtasks

### T015 — Types: `ToolSelectionCase`, `ToolSelectionVerdict`, `ToolSelectionRunResult`

**Purpose**: Declare the three data-model interfaces in `src/adapters/tools/selection.ts`.

**Steps**:
1. Read `kitty-specs/tools-adapter-01KTYMCB/data-model.md` — `ToolSelectionCase`,
   `ToolSelectionRunResult`, `ToolSelectionVerdict` in full, including invariants.
2. Import `TOOLSFile` from `./lint` (tools are registered from a parsed `TOOLSFile`).
3. Declare `ToolSelectionRunResult`:
   - `run: number` — run index (1-based)
   - `passed: boolean`
   - `selectedTool: string | null` — null means model abstained
   - `durationMs: number`
   - `error?: string` — present when run errored; `passed` is `false`
4. Declare `ToolSelectionCase` with all fields from the data model. Add invariant
   comments from the data model: `1 ≤ pass_threshold ≤ runs`; `expectedAxis ===
   "correct-selection"` implies `expectedTool` non-empty; `expectedAxis ===
   "control"` implies `controlRiggedTool` present.
5. Declare `ToolSelectionVerdict` with `id`, `passed`, `passCount`,
   `runs: readonly ToolSelectionRunResult[]`, `axis`. Add the control-case
   invariant comment: for `axis === "control"`, `passed` must be `false` in the
   test suite.
6. Export all three types.

**Files**: `src/adapters/tools/selection.ts` (create; types only)

**Validation**: `pnpm build` clean.

---

### T016 — `runSelectionCase()` — OpenAI function-call registration, k-of-n loop, errored=failed

**Purpose**: Implement the main behavioral runner. Given a `TOOLSFile` and a
`ToolSelectionCase`, register the tools as OpenAI-compatible function definitions,
run the scenario N times against the BYOM endpoint, and collect
`ToolSelectionRunResult` entries with `errored = failed` semantics.

**Steps**:
1. Read `src/core/behavioral/client.ts` to understand the existing fetch wrapper.
   If it exposes an OpenAI-compatible function-call request (sending
   `"tools": [...]` in the request body and receiving `"tool_calls"` in the
   response), reuse it. If it does not, implement a minimal `callWithTools()`
   function locally in `selection.ts` using plain `fetch`:
   ```ts
   async function callWithTools(opts: {
     endpoint: string;
     apiKey?: string;
     model: string;
     messages: Array<{role: string; content: string}>;
     tools: Array<{type: 'function'; function: {name: string; description: string; parameters: object}}>;
   }): Promise<string | null>   // returns selected tool name or null for abstain
   ```
2. Build the `tools` array from `toolsFile.tools`: each `ToolDescriptor` maps to
   an OpenAI function definition:
   ```json
   {
     "type": "function",
     "function": {
       "name": "<descriptor.name>",
       "description": "<descriptor.description>",
       "parameters": {
         "type": "object",
         "properties": { /* from descriptor.parameters */ },
         "required": [ /* names where required === true */ ]
       }
     }
   }
   ```
3. Implement `runSelectionCase(toolsFile: TOOLSFile, testCase: ToolSelectionCase,
   opts: {endpoint: string; apiKey?: string; model: string}): Promise<ToolSelectionVerdict>`.
4. Loop `testCase.runs` times (1-indexed). For each run:
   - Record `Date.now()` before and after.
   - Call the endpoint. If the call throws or returns a network error: set
     `passed = false`, `error = err.message` — **never skip, never retry**
     (charter).
   - If the endpoint responds with no `tool_calls` field (endpoint lacks
     function-calling support): set `passed = false`, `error = "endpoint does
     not support tool-calling"`.
   - Extract the selected tool name from `tool_calls[0].function.name`, or
     `null` if the model made no tool call (abstained).
   - Check if the selected tool (if non-null) is in the registered set; if not,
     the run is wrong — `passed = false`.
   - Grade the run via the grader (T017, T018) to produce the run's `passed` value.
5. Compute `passCount = runs.filter(r => r.passed).length`.
6. Set `verdict.passed = passCount >= testCase.pass_threshold`.
7. Return the verdict.

**Files**: `src/adapters/tools/selection.ts`

**Validation**: `pnpm build` clean. Full validation in T020 (mock fetch).

---

### T017 — Correct-selection grader + abstention-axis grader

**Purpose**: Implement the two grading functions that evaluate a single run's
outcome on the correct-selection and abstention axes.

**Steps**:
1. **Correct-selection grader** `gradeCorrectSelection(runResult: {selectedTool: string | null},
   testCase: ToolSelectionCase): boolean`:
   - Returns `true` iff `runResult.selectedTool === testCase.expectedTool`.
   - Returns `false` if `runResult.selectedTool` is null (model abstained when
     it should have selected).
   - Returns `false` if `runResult.selectedTool` is a tool name not in the
     registered set (spec edge case — wrong selection).
2. **Abstention grader** `gradeAbstention(runResult: {selectedTool: string | null}):
   boolean`:
   - Returns `true` iff `runResult.selectedTool === null` (model correctly
     abstained from selecting any tool).
   - Returns `false` if the model selected any tool.
3. Wire both graders into `runSelectionCase` (T016): select the grader based on
   `testCase.expectedAxis` — `"correct-selection"` uses the correct-selection
   grader; `"abstain"` uses the abstention grader; `"control"` uses the
   rigged-impossible control grader (T018).
4. Export `gradeCorrectSelection` and `gradeAbstention` for testability.

**Files**: `src/adapters/tools/selection.ts`

**Validation**: `pnpm build` clean. Unit tests in T020.

---

### T018 — Rigged-impossible discrimination control (FR-008)

**Purpose**: Implement the rigged-impossible control grader that proves the grading
machinery can fail. This is the charter's "every judge-backed grader ships with a
rigged-impossible control case proving it can fail" requirement (FR-008).

**The discrimination control pattern**:
A control case is a scenario where the grader is forced to accept an
obviously-wrong answer as the expected answer. Because no model will select that
obviously-wrong tool for a reasonable scenario, the control case always fails —
proving the grader is wired correctly and is capable of producing a failing verdict.

**Steps**:
1. Implement `gradeControl(runResult: {selectedTool: string | null},
   testCase: ToolSelectionCase): boolean`:
   - `testCase.expectedAxis === "control"` implies `testCase.controlRiggedTool`
     is present (type invariant; assert it).
   - Returns `true` iff `runResult.selectedTool === testCase.controlRiggedTool`.
   - The fixture (`control.json`, T019) sets `controlRiggedTool` to a nonsensical
     or absent tool name (e.g., `"__rigged_impossible__"`) that no model will
     select for the given scenario. Therefore this grader will never return `true`
     in practice, and the verdict for the control case will always be
     `passed === false`.
2. The test (T020, step 5) must assert:
   ```ts
   expect(verdict.passed).toBe(false);   // MUST fail as designed
   expect(verdict.axis).toBe('control');
   ```
   A test that instead asserts `verdict.passed === true` on a control case is
   itself wrong — reject in review.
3. Export `gradeControl`.

**Files**: `src/adapters/tools/selection.ts`

**Validation**: control grader returns `false` for a run where `selectedTool` is
not `controlRiggedTool` (which is always the case in real runs). Test in T020.

---

### T019 — Fixture authoring: `correct-tool.json`, `abstain.json`, `control.json`

**Purpose**: Author the three behavioral scenario fixture files. These drive
acceptance scenarios 7–9 and are the primary acceptance surface for the
behavioral path.

**Steps**:
1. **`tests/tools/fixtures/selection-scenarios/correct-tool.json`** — scenario 7
   (correct-selection axis; acceptance test uses mock fetch):
   ```json
   {
     "id": "tools-select-correct-001",
     "scenario": "Send an email to alice@example.com with subject 'Hello' and body 'Hi there'.",
     "expectedAxis": "correct-selection",
     "expectedTool": "send_email",
     "runs": 3,
     "pass_threshold": 2
   }
   ```
   The unambiguous prompt ("send an email") should cause a functional model to
   select `send_email`. For unit tests using mock fetch, the mock returns a
   `tool_calls` response selecting `send_email`.

2. **`tests/tools/fixtures/selection-scenarios/abstain.json`** — scenario 8
   (abstention axis; no applicable tool):
   ```json
   {
     "id": "tools-select-abstain-001",
     "scenario": "What is the capital of France?",
     "expectedAxis": "abstain",
     "runs": 3,
     "pass_threshold": 2
   }
   ```
   The prompt has no applicable tool — no email to send, no file to list. A
   correct model abstains (makes no tool call). For unit tests using mock fetch,
   the mock returns a response with no `tool_calls`.

3. **`tests/tools/fixtures/selection-scenarios/control.json`** — scenario 9
   (rigged-impossible discrimination control; FR-008):
   ```json
   {
     "id": "tools-select-control-001",
     "scenario": "List the files in the /tmp directory.",
     "expectedAxis": "control",
     "controlRiggedTool": "__rigged_impossible__",
     "runs": 1,
     "pass_threshold": 1
   }
   ```
   The scenario prompt would correctly elicit `list_files` from any reasonable
   model — but the control rig expects `__rigged_impossible__` (a tool that does
   not exist). The grader will always return `false`, proving it can fail.

**Files**:
- `tests/tools/fixtures/selection-scenarios/correct-tool.json` (NEW)
- `tests/tools/fixtures/selection-scenarios/abstain.json` (NEW)
- `tests/tools/fixtures/selection-scenarios/control.json` (NEW)

**Validation**: JSON parses cleanly; `controlRiggedTool` in `control.json` is a
name that no reasonable model would ever select for the given prompt.

---

### T020 — `tests/tools/unit/selection.test.ts` — grader + control unit tests (mock fetch)

**Purpose**: Write the complete unit test suite using mock `fetch`. No live endpoint
required. Must cover acceptance scenarios 7–9 and all charter invariants: errored
run = failed, control must fail, tool-not-in-set = failed. Meets ≥80% new-code
coverage.

**Steps**:
1. Import `runSelectionCase`, `gradeCorrectSelection`, `gradeAbstention`,
   `gradeControl` from `src/adapters/tools/selection.ts`.
   Import `parseTOOLSFile` from `src/adapters/tools/lint.ts`.
2. Mock `fetch` using Vitest's `vi.fn()` / `vi.spyOn(global, 'fetch')`. Prepare
   helpers:
   - `mockCorrectSelection(toolName: string)` — returns a Response with
     `{"choices": [{"message": {"tool_calls": [{"function": {"name": toolName}}]}}]}`.
   - `mockAbstain()` — returns a Response with
     `{"choices": [{"message": {"content": "Paris", "tool_calls": []}}]}` or no
     `tool_calls` key.
   - `mockError()` — `fetch` rejects with a network error.
3. **Scenario 7 (correct-selection)**: mock `send_email` selection for 3 runs;
   assert `verdict.passed === true`, `verdict.passCount >= 2`,
   `verdict.axis === 'correct-selection'`.
4. **Scenario 8 (abstention)**: mock abstain for 3 runs; assert
   `verdict.passed === true`, `verdict.axis === 'abstain'`.
5. **Scenario 9 (control — FR-008)**: mock `list_files` selection for 1 run
   (a correct selection for the scenario, but not the rigged tool); assert:
   - `verdict.passed === false` — **the control MUST fail**
   - `verdict.axis === 'control'`
6. **Errored-run-is-failed (charter)**: mock `fetch` rejecting with a network
   error for all runs; assert all `runResult.passed === false` and all
   `runResult.error` is non-empty. The verdict must also be `passed === false`.
7. **Tool-not-in-set edge case**: mock a response selecting
   `"__unknown_tool__"` (not in `TOOLSFile.tools`); assert `runResult.passed === false`.
8. **Endpoint-without-tool-calling edge case**: mock a response with no
   `tool_calls` field when `expectedAxis === 'correct-selection'`; assert
   `runResult.passed === false` and `runResult.error` contains
   `"tool-calling"`.
9. **gradeCorrectSelection unit test**: call directly; assert correct for
   matching tool, wrong for null, wrong for mismatched name.
10. **gradeAbstention unit test**: call directly; assert correct for null
    selected tool, wrong for any tool name.

**Files**: `tests/tools/unit/selection.test.ts` (NEW)

**Validation**: `pnpm test -- tests/tools/unit/selection.test.ts` green; zero skips;
≥80% new-code coverage on `src/adapters/tools/selection.ts`.

---

### T021 — WP03 verification: control `passed === false`; errored=failed verified

**Purpose**: Gate for Definition of Done.

**Steps** (in order):
```bash
pnpm build                                                # strict tsc — zero errors
pnpm test -- tests/tools/unit/selection.test.ts          # all cases green; zero skips
git diff --stat                                           # ONLY owned_files changed
# Confirm no hardcoded credentials or provider URLs:
grep -n 'api\.openai\|anthropic\.com\|sk-\|API_KEY\s*=' src/adapters/tools/selection.ts || echo "OK"
# Confirm endpoint only read from process.env:
grep -n 'process\.env' src/adapters/tools/selection.ts
```

Confirm:
- Scenario 7 (correct-selection mock) produces `passed === true`.
- Scenario 8 (abstain mock) produces `passed === true`.
- Scenario 9 (control) produces `passed === false` — charter invariant.
- Errored-run mock produces `passed === false` with non-empty `error` field.
- No hardcoded provider URL or credentials in `selection.ts`.
- BYOM endpoint read from environment variable only.

**Files**: no new files; verification only.

**Validation**: all checks above pass; WP is ready for reviewer.

## Definition of Done

- [ ] `src/adapters/tools/selection.ts` exports `ToolSelectionCase`,
  `ToolSelectionVerdict`, `ToolSelectionRunResult`, `runSelectionCase`,
  `gradeCorrectSelection`, `gradeAbstention`, `gradeControl`
- [ ] Acceptance scenario 7 (correct-selection, k-of-n passes) passes with mock
- [ ] Acceptance scenario 8 (abstention axis) passes with mock
- [ ] Acceptance scenario 9 (control) produces `verdict.passed === false` (charter;
  FR-008) — a control that passes is a test failure
- [ ] Errored run → `passed === false`, `error` non-empty (charter "errored = failed")
- [ ] Tool not in registered set → `passed === false` (spec edge case)
- [ ] Endpoint lacking tool-calling → error, `passed === false` (spec edge case)
- [ ] No hardcoded provider URL or API key anywhere in `selection.ts`
- [ ] BYOM endpoint from `process.env` only
- [ ] `pnpm build` (strict tsc) green; `pnpm test -- selection.test.ts` green
- [ ] No files outside `owned_files` modified; `src/core/` unchanged

## Reviewer guidance

- **Reject if** the control case test asserts `verdict.passed === true` — that
  is the opposite of what FR-008 requires.
- **Reject if** any hardcoded URL, API key, or model name appears in
  `selection.ts` (NFR-005; charter).
- Check errored-run handling: the run result's `passed` must be `false` and
  `error` must be a non-empty string. Never `undefined`, never skip-like.
- Check tool-not-in-set: confirm the test covers this edge case explicitly
  (step 7 above).
- Check endpoint-without-tool-calling: must error the run, not silently pass
  with a null selection on the correct-selection axis.
- Verify mock `fetch` is properly restored between tests (Vitest `afterEach`
  or `vi.restoreAllMocks()`) so tests do not bleed into each other.
- The `gradeControl` function logic: must return `true` only when
  `selectedTool === controlRiggedTool`. Since `controlRiggedTool` is impossible
  to match in practice, the control verdict is always `passed === false`.
