---
work_package_id: WP03
title: Behavioral trigger conformance (two-axis grader, k-of-n, discrimination control)
dependencies:
- WP01
- WP02
requirement_refs:
- FR-009
- FR-010
- FR-011
- FR-012
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base computed in lanes.json, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-13T01:30:00Z'
subtasks:
- T013
- T014
- T015
- T016
- T017
- T018
history:
- timestamp: '2026-06-13T01:30:00Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/adapters/skills/
execution_mode: code_change
owned_files:
- src/adapters/skills/trigger.ts
- tests/unit/skills-trigger.test.ts
tags: []
---

# WP03 — Behavioral trigger conformance (two-axis grader, k-of-n, discrimination control)

## Objective

Deliver the full behavioral trigger conformance surface in `trigger.ts`. Present
a skill as an OpenAI-compatible tool, run labeled queries against a BYOM endpoint
N times per query, grade two axes (should-trigger and near-miss), aggregate with
k-of-n semantics (errored run = failed run), and ship a rigged-impossible
discrimination control proving the grader can fail. This satisfies FR-009 through
FR-012 and the charter's cap-of-zero discrimination requirement.

The ChatClient extension approach (local fetch wrapper vs. core `chatWithTools`
method) must be documented in the work log **before any code is written**. The
implementing agent reads the plan's WP03 design note and `src/core/behavioral/client.ts`
first, then records the chosen approach.

## Context (read first)

- Spec: `kitty-specs/skills-adapter-01KTYKNX/spec.md`
  — FR-009, FR-010, FR-011, FR-012; C-001, C-003; acceptance scenarios 9–13; edge cases
- Plan: `kitty-specs/skills-adapter-01KTYKNX/plan.md`
  — WP03 outline, ChatClient extension design note (two options; document chosen before coding)
- Data model: `kitty-specs/skills-adapter-01KTYKNX/data-model.md`
  — `TriggerCase`, `TriggerVerdict`, `AxisVerdict`, `QueryRunResult`, `TriggerQuerySet`
  invariants; errored-run invariant; wrong-skill edge case
- Charter: `.kittify/charter/charter.md`
  — k-of-n for trigger axes; errored run = failed run everywhere; every judge-backed
  grader ships with rigged-impossible control; no core modification (C-001)
- WP01 deliverables: `src/adapters/skills/types.ts` (TriggerVerdict etc. are already defined)
- Core behavioral client: `src/core/behavioral/client.ts` — read this before T013

**Hard rules for this WP** (from spec + charter):
1. Touch ONLY the files in `owned_files`. Document the ChatClient extension decision
   in the work log before writing any code in `trigger.ts`.
2. An errored run counts as a failed (non-trigger) run. It is never skipped and
   never retried. `QueryRunResult.runsErrored` tracks it for diagnostics.
3. The discrimination control (`isControl: true`) must produce `passed: false`.
   The unit test in T017 must assert this explicitly (charter cap-of-zero).
4. Wrong-skill invocation: if the model invokes a different tool than the one under
   test, that run is a non-trigger for the target skill.
5. No credentials in code. The endpoint URL and API key come from env vars
   (`MUSTER_API_KEY` or `OPENAI_API_KEY`, and `MUSTER_BASE_URL`) only.
6. Trigger axes are stylistic (k-of-n applies), NOT safety-critical (pass^k is
   not required here). See charter behavioral grading tiers.

## Subtasks

### T013 — Implement trigger runner + ChatClient extension (`src/adapters/skills/trigger.ts`)

**Purpose**: Build the tool-call payload, drive the model endpoint, and record per-run
trigger decisions. This is the core of FR-009.

**Steps**:

**BEFORE WRITING CODE**: Read `src/core/behavioral/client.ts` fully. Then decide
which approach to use for tool-calling support:

- **Option A (local fetch wrapper)**: `trigger.ts` contains a self-contained
  `callWithTools(endpoint, messages, tools)` function using `fetch` directly,
  mirroring client.ts's error-hygiene pattern but NOT importing from it. Chosen
  when the core client would need to import skill types to support tools (violating C-001).
- **Option B (core extension)**: Add a `chatWithTools` method to
  `src/core/behavioral/client.ts` that accepts a `tools` parameter. Acceptable
  ONLY if the extension adds no skill-specific knowledge to core (the method
  signature uses generic `unknown[]` for the tools parameter, not any `SkillDocument`
  type). This would modify a core file — document the C-001 justification explicitly.

Record the chosen approach (A or B) and its C-001 justification in the work log
before any implementation.

**Implementation steps**:
1. Create `src/adapters/skills/trigger.ts`.
2. Export `runTriggerConformance(triggerCase: TriggerCase): Promise<TriggerVerdict>`.
3. Build the `tools[]` payload (FR-009):
   ```ts
   const tools: ToolDefinition[] = [
     { type: "function", function: { name: skill.name, description: skill.description } },
     // decoy tool for discrimination (FR-012 — added in T016)
   ];
   ```
   The skill `name` and `description` come from parsing `triggerCase.skillDir`
   (call the parse step from `index.ts`).
4. For each query in `triggerCase.querySet.shouldTrigger` and
   `triggerCase.querySet.nearMiss`: run the query `triggerCase.runsPerQuery` times.
   For each run, send the query as a user message with the `tools[]` payload to
   the endpoint using the chosen approach (A or B).
5. Record per-run trigger decision:
   - A run is a trigger if the endpoint response includes a `tool_calls` entry
     whose `function.name` matches `triggerCase.querySet` (the skill under test's name).
   - A run invoking a different tool name: non-trigger (wrong-skill edge case).
   - A run with no `tool_calls` key in the response: non-trigger.
   - A run with a network error, timeout, malformed JSON, or missing expected
     fields: `runsErrored++`; counts as non-trigger (FR-011).
   - An endpoint that returns HTTP 4xx/5xx for tool-call requests: errors the run.
6. Populate `QueryRunResult` for each query:
   `{ query, runsTotal: runsPerQuery, runsTriggered, runsErrored }`.
7. The two-axis grading and k-of-n aggregation are implemented in T014/T015 as
   separate exported functions; `runTriggerConformance` calls them.

**Files**: `src/adapters/skills/trigger.ts`

**Validation**: unit tests in T017 cover the tool-call payload shape and
error-handling behavior.

---

### T014 — Implement two-axis grader (`src/adapters/skills/trigger.ts`)

**Purpose**: FR-010 — evaluate should-trigger and near-miss axes independently;
case passes only if both axes pass. Methodology cites agentskills.io trigger-testing
documentation as normative source (C-003).

**Steps**:
1. In `trigger.ts`, export `gradeAxis(results: QueryRunResult[], axis: "should-trigger" | "near-miss", threshold: number): AxisVerdict`.
2. Compute overall trigger rate:
   `triggerRate = sum(runsTriggered) / sum(runsTotal)`.
   Note: `runsTotal` is the per-query value (constant = `runsPerQuery`); errored
   runs are already counted in `runsTotal` and not in `runsTriggered` (FR-011
   invariant from T013).
3. Axis pass condition:
   - `"should-trigger"`: `passed = triggerRate >= threshold`.
   - `"near-miss"`: `passed = triggerRate < threshold`.
4. Return `AxisVerdict` as defined in `data-model.md`: `{ axis, triggerRate, threshold, passed, queryBreakdown: results }`.
5. In `runTriggerConformance`: call `gradeAxis` for both axes; assemble
   `TriggerVerdict`:
   ```ts
   { id, passed: shouldTriggerAxis.passed && nearMissAxis.passed,
     shouldTriggerAxis, nearMissAxis, isControl }
   ```
6. Section citation in the verdict metadata (add a `source` field to `TriggerVerdict`
   or the enclosing report): `"agentskills.io/specification#trigger-testing@<SHA>"`.
   The SHA is the same pinned SHA used in `validate.ts`.

**Files**: `src/adapters/skills/trigger.ts` (extension of T013 work)

**Validation**: T017 tests cover split verdict (one axis passes, other fails),
all-pass, all-fail cases.

---

### T015 — Implement k-of-n aggregation + errored-run semantics (`src/adapters/skills/trigger.ts`)

**Purpose**: FR-011, charter — errored run = failed run everywhere, never skipped,
never retried. k-of-n applies to trigger axes (not pass^k — these are stylistic axes).

**Steps**:
1. The per-run loop in `runTriggerConformance` (T013) already increments
   `runsErrored` and counts each errored run as non-trigger. This T015 step
   verifies the invariant is explicit and tested.
2. Validate query set minimum before grading begins (data-model.md invariant):
   If `querySet.shouldTrigger.length < 8` or `querySet.nearMiss.length < 8`,
   return a `TriggerVerdict` with `passed: false` and an error message explaining
   the minimum was not met. Do not proceed to grading. This is a hard gate.
3. Export a utility: `assertRunerredInvariant(result: QueryRunResult): void`
   — throws if `runsTriggered + runsErrored > runsTotal` (internal consistency
   check, caught by T017).
4. The k-of-n interpretation here: `runsPerQuery` is N; a query "passes" if
   `runsTriggered / runsTotal >= threshold`. Aggregating across queries: the
   axis trigger rate is the aggregate `sum(triggered) / sum(total)`. This is
   the correct k-of-n interpretation per the agentskills.io methodology (C-003).
5. Add a comment in `trigger.ts` distinguishing k-of-n (stylistic axes, this
   adapter) from pass^k (safety-critical axes, future layers) per the charter.

**Files**: `src/adapters/skills/trigger.ts` (extension)

**Validation**: T017 tests cover: errored run counted as non-trigger; query set
below minimum produces `passed: false`; mixed errored + triggered runs aggregate correctly.

---

### T016 — Implement rigged-impossible discrimination control

**Purpose**: FR-012, charter cap-of-zero — a discrimination control case whose skill
description cannot match any realistic query. The test suite must assert the grader
produces `passed: false` for this control, proving the grader discriminates rather
than rubber-stamps.

**Steps**:
1. Define a control skill description constant in `trigger.ts`:
   ```ts
   export const RIGGED_IMPOSSIBLE_DESCRIPTION =
     "ZZZCONTROL-IMPOSSIBLE: This tool is never invoked by any realistic query. " +
     "It exists solely to verify the trigger grader can produce a failed result.";
   ```
   This description is nonsensical and cannot be the best routing choice for any
   natural language query.
2. The discrimination control is a `TriggerCase` with:
   - `isControl: true`
   - A `querySet` where `shouldTrigger` contains plausible real-world queries
     (weather, code help, etc.) — queries a model would route to a useful tool,
     NOT to the rigged tool.
   - `threshold: 0.5` (standard rubric).
   The control *asserts* that the grader produces `passed: false` because no
   real query triggers the rigged tool.
3. Export `createDiscriminationControl(queries: string[]): TriggerCase` — builds
   the rigged control case from a provided query list. The fixture set (WP04)
   supplies the actual queries.
4. In `runTriggerConformance`: when `isControl` is true, add a post-grading
   assertion: if `verdict.passed === true`, log a warning noting the control
   unexpectedly passed (this would indicate the model is invoking an irrelevant
   tool — a model-quality issue, not a grader bug). The verdict still accurately
   reflects what happened; the test in T017 explicitly asserts `passed: false`
   for a stubbed control run.

**Files**: `src/adapters/skills/trigger.ts` (extension)

**Validation**: T017 must have a test that asserts `gradeAxis` returns
`passed: false` for the rigged control, using a mock that returns zero trigger
calls. The test description must say "discrimination control: grader produces
passed: false for rigged-impossible case".

---

### T017 — Unit tests: `tests/unit/skills-trigger.test.ts`

**Purpose**: Full unit coverage for `trigger.ts` logic. All tests use mocked
fetch/client — no real model endpoint required (these are pure logic tests).

**Steps**:
1. Create `tests/unit/skills-trigger.test.ts`.
2. Mock the HTTP layer: use Vitest's `vi.mock` to stub the fetch call (or the
   chosen ChatClient extension approach) so tests never make real network calls.
3. Cover two-axis grader logic:
   - All queries trigger on should-trigger axis: `passed: true` for that axis.
   - No queries trigger on should-trigger axis: `passed: false`.
   - Split: 6/10 trigger on should-trigger (threshold 0.5): `passed: true`.
   - 5/10 trigger on near-miss axis (threshold 0.5): `passed: false`.
   - One axis passes, other fails: `passed: false` for the case.
   - Both axes pass: `passed: true` for the case.
4. Cover errored-run-counts-as-failed:
   - A run that errors: `runsErrored` incremented, counts as non-trigger.
   - All runs errored: trigger rate = 0; should-trigger axis fails.
   - Mixed: 3 triggered, 2 errored, 5 total — trigger rate = 3/5 = 0.6; passes
     a 0.5 threshold.
5. Cover discrimination control (CRITICAL — charter cap-of-zero):
   ```ts
   it("discrimination control: grader produces passed: false for rigged-impossible case", () => {
     // mock returns zero tool calls for all queries
     const verdict = gradeAxis(mockResultsAllNonTrigger, "should-trigger", 0.5);
     expect(verdict.passed).toBe(false);
   });
   ```
6. Cover wrong-skill invocation:
   - Response includes `tool_calls` for a *different* tool name: run counts as
     non-trigger for the target.
7. Cover query-set minimum gate (T015):
   - A `TriggerQuerySet` with 7 `shouldTrigger` entries: `runTriggerConformance`
     returns `passed: false` without grading.
8. Cover endpoint-does-not-support-tools:
   - Mock returns a response with no `tool_calls` key: runs count as errored
     (per FR-011 — "endpoints that do not support tool calling cause behavioral
     cases to error").

**Files**: `tests/unit/skills-trigger.test.ts`

**Validation**: `pnpm test` green; discrimination control test has exact description
quoted in step 5; no real HTTP calls in any test (mock verified by absence of
`fetch` in non-mocked context).

---

### T018 — WP03 verification (gate for Definition of Done)

**Steps** (run in order):
```bash
pnpm build              # strict tsc — zero errors
pnpm test               # full suite — zero failures, zero new skips
```

Confirm discrimination control test passes and asserts `passed: false`:
```bash
pnpm test -- --reporter=verbose tests/unit/skills-trigger.test.ts | grep "discrimination control"
# must print the test name and "passed"
```

Confirm no core files modified (unless Option B chosen — see work log):
```bash
git diff --stat src/core/   # if Option A: zero changes; if Option B: only client.ts with C-001 justification
```

Confirm ChatClient extension decision is recorded in work log before code:
The work log entry must predate any commit touching `trigger.ts`.

## Definition of Done

- [ ] Work log entry recording chosen ChatClient extension approach (A or B) with C-001 justification exists BEFORE any trigger.ts code
- [ ] `src/adapters/skills/trigger.ts` builds tool-call payload with `type: "function"` shape
- [ ] Errored run counted as non-trigger in `QueryRunResult.runsErrored`; never skipped, never retried
- [ ] Two-axis grader: case passes iff BOTH axes pass
- [ ] k-of-n aggregation: trigger rate = sum(triggered)/sum(total) across all queries on the axis
- [ ] Query-set minimum (8 per axis) enforced as a hard gate before grading
- [ ] Rigged-impossible discrimination control exported; `createDiscriminationControl` function present
- [ ] Unit test explicitly asserts `passed: false` for the rigged control case
- [ ] `RIGGED_IMPOSSIBLE_DESCRIPTION` constant exported from `trigger.ts`
- [ ] `pnpm build` (strict tsc) passes with zero errors
- [ ] `pnpm test` green; no existing test modified; no new skips
- [ ] All behavioral runner tests in `tests/behavioral/runner.test.ts` remain green

## Reviewer guidance

- **Reject if** the discrimination control test is missing or does not use
  `expect(verdict.passed).toBe(false)`. A test that mocks away the assertion is
  a charter violation.
- Verify the errored-run test: the mock must cause the run to error (not silently
  return zero triggers) and `runsErrored` must be > 0 in the assertion.
- If Option B (core extension) was chosen: verify `src/core/behavioral/client.ts`
  has no import from `src/adapters/skills/` and the added method uses only generic
  types. Any skill-specific type in core is an automatic reject.
- Check that the tool-call payload uses `function.name` = the skill's `name`
  field (not a modified/sanitized version). The spec requires the exact name.
- Verify the wrong-skill edge case test: the mock must return a `tool_calls` with
  a different function name, and the assertion must confirm trigger rate = 0 for
  the target skill.
