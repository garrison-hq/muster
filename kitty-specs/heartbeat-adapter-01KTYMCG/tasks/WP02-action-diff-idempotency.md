---
work_package_id: WP02
title: Action-diff probe + idempotency probe
dependencies:
- WP01
requirement_refs:
- FR-004
- FR-005
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
history: []
authoritative_surface: src/adapters/heartbeat/
execution_mode: code_change
owned_files:
- src/adapters/heartbeat/graders/action-diff.ts
- src/adapters/heartbeat/graders/idempotency.ts
- tests/heartbeat/action-diff.test.ts
- tests/heartbeat/idempotency.test.ts
tags: []
assignee: "claude"
agent: "claude:opus:reviewer:reviewer"
---

# WP02 — Action-diff probe + idempotency probe

## Objective

Implement two behavioral probe graders behind the `SpecAdapter` boundary:

1. **`src/adapters/heartbeat/graders/action-diff.ts`** — action-diff behavioral probe:
   on a due tick the agent's observed action set must match the checklist's intended
   actions exactly (no missing, no extra), k-of-n (FR-004, FR-008).
2. **`src/adapters/heartbeat/graders/idempotency.ts`** — idempotency behavioral probe:
   on a repeat tick with no new state, once-only checklist items must not be repeated
   or duplicated (FR-005, FR-008).
3. A rigged-impossible discrimination control for each grader proving the grader can
   fail (FR-009).
4. Unit tests for both graders at ≥80% new-code coverage (charter testing standards).

Both graders reuse `src/core/behavioral/` runner, graders, and client without
modification (FR-001, C-001). No `src/core/` file is modified.

## Context

- Spec: `kitty-specs/heartbeat-adapter-01KTYMCG/spec.md` (FR-004, FR-005, FR-008,
  FR-009, Acceptance Scenario 4, 5, 8)
- Data model: `kitty-specs/heartbeat-adapter-01KTYMCG/data-model.md` — `ActionDiff`,
  `IdempotencyCheck` entities with invariants
- WP01 deliverables: `ChecklistItem` (with `recurrence` label), `SimulatedTick`,
  `IntervalConfig` from `src/adapters/heartbeat/lint.ts` and `tick.ts`
- Charter: `.kittify/charter/charter.md` — two-tier grading (stylistic axes = k-of-n),
  errored run = failed run, rigged-impossible control per grader

**Hard rules for the whole WP**:
1. Touch only `owned_files` — do not modify `src/core/`, WP01 source files, or any
   existing test file.
2. Errored run counts as a failed run everywhere — never skipped, never retried (FR-008,
   charter testing standards). This invariant is enforced at the `RunVerdict` level in
   `src/core/behavioral/types.ts`; do not override it.
3. The idempotency grader must use the manifest's `recurrence` label to distinguish
   once-only from recurring items — never infer recurrence from item text (data-model
   invariant).
4. Ticks are simulated via scenario framing and supplied state; no real model calls are
   made in unit tests (use mock responses, C-004).
5. Discrimination controls use rigged-impossible inputs (a response the grader
   must fail); they are standard test cases, not separate executables.

## Subtasks

### T008 — Action-diff grader + due-tick probe

**Purpose**: Implement the `ActionDiff` grader that compares the agent's observed actions
on a due tick to the checklist's intended action set, grading pass/fail with k-of-n
aggregation. Covers FR-004 and the spec edge case: an agent that replies `HEARTBEAT_OK`
on a due tick is an action-diff miss, not a quiet-ack pass.

**Steps**:
1. Create `src/adapters/heartbeat/graders/action-diff.ts`. Define the `ActionDiff`
   interface mirroring the data model exactly:
   ```ts
   export interface ActionDiff {
     intendedActions: string[];
     observedActions: string[];
     missingActions: string[];
     extraActions: string[];
     passed: boolean;
   }
   ```
2. Implement `gradeActionDiff(intended: string[], observed: string[]): ActionDiff`:
   - `missingActions` = intended items not in observed (set difference)
   - `extraActions` = observed items not in intended (set difference)
   - `passed` = `missingActions.length === 0 && extraActions.length === 0`
   - Use exact string match for set membership (no fuzzy matching unless the manifest
     declares an observation strategy — keep this version exact; the manifest extension
     point is noted but not implemented in this WP)
3. Implement `buildDueTick(checklist: HeartbeatFile, tick: SimulatedTick): string` —
   assembles the scenario framing string for a `due` tick using `buildScenarioFraming`
   from `tick.ts`.
4. Implement `extractObservedActions(agentResponse: string): string[]` — extracts action
   items from a raw agent response string. Strategy: look for Markdown list items, tool
   call summaries, and explicit action phrases. Document the extraction strategy with a
   comment; keep it simple and deterministic.
5. Implement `gradeRun(agentResponse: string, intendedActions: string[]): ActionDiff` —
   calls `extractObservedActions` then `gradeActionDiff`. This is the per-run grading
   function.
6. Implement `aggregateActionDiff(runs: ActionDiff[], k: number): boolean` — k-of-n
   aggregation: returns `true` if `runs.filter(r => r.passed).length >= k`. Errored runs
   (represented as `ActionDiff` with `passed: false`) count as failed, never skipped.
7. Spec edge case: add a guard in `gradeRun` — if the agent response starts with
   `HEARTBEAT_OK` (the quiet-ack token) on a `due` tick, immediately return an
   `ActionDiff` with `passed: false` and `missingActions` = intended actions. Add a
   comment: "An agent that replies HEARTBEAT_OK on a due tick is an action-diff miss,
   not a quiet-ack pass (data-model invariant, spec edge case)."

**Files**: `src/adapters/heartbeat/graders/action-diff.ts`

**Validation**: `tests/heartbeat/action-diff.test.ts` (T011) covers:
- Exact match → `passed: true`, empty missing/extra
- Missing action → `passed: false`, correct `missingActions`
- Extra action → `passed: false`, correct `extraActions`
- HEARTBEAT_OK on due tick → `passed: false`, all intended actions are missing
- `aggregateActionDiff` with k=3 of 5 passing runs → `true`
- `aggregateActionDiff` with only 2 of 5 passing (k=3) → `false`
- Errored run (empty response treated as failed) → counts in failure total

---

### T009 — Idempotency grader + repeat-tick probe

**Purpose**: Implement the `IdempotencyCheck` grader that asserts once-only checklist
items are not repeated or duplicated on a repeat tick (FR-005). Only items with
`recurrence === 'once-only'` contribute to the check — recurring items are expected on
every tick and must not be penalised (data-model invariant).

**Steps**:
1. Create `src/adapters/heartbeat/graders/idempotency.ts`. Define the `IdempotencyCheck`
   interface mirroring the data model exactly:
   ```ts
   export interface IdempotencyCheck {
     onceOnlyItems: ChecklistItem[];
     priorActions: string[];
     observedActions: string[];
     repeatedActions: string[];
     passed: boolean;
   }
   ```
2. Implement `gradeIdempotency(onceOnlyItems: ChecklistItem[], priorActions: string[], observed: string[]): IdempotencyCheck`:
   - `repeatedActions` = intersection of `priorActions` and `observed` restricted to
     `onceOnlyItems` text (exact string match)
   - `passed` = `repeatedActions.length === 0`
   - Items with `recurrence === 'recurring'` are explicitly excluded from the intersection
     check. Add a comment: "Recurring items are expected on every tick; only once-only
     items drive idempotency grading (FR-005, data-model invariant)."
3. Implement `buildRepeatTick(checklist: HeartbeatFile, tick: SimulatedTick): string` —
   assembles the scenario framing for a `repeat` tick. Uses `buildScenarioFraming` from
   `tick.ts`; for `repeat` ticks the prior action summary is injected into the framing
   (data-model `SimulatedTick.priorActionSummary` invariant: must not be null for repeat
   ticks — validate and throw `TickStateValidationError` if null).
4. Implement `extractObservedActions(agentResponse: string): string[]` — same extraction
   strategy as action-diff; can be a shared helper imported from `action-diff.ts` or
   re-implemented here. Prefer import if it is already exported.
5. Implement `gradeRun(agentResponse: string, onceOnlyItems: ChecklistItem[], priorActions: string[]): IdempotencyCheck`.
6. Implement `aggregateIdempotency(runs: IdempotencyCheck[], k: number): boolean` — k-of-n
   aggregation: returns `true` if `runs.filter(r => r.passed).length >= k`. Errored runs
   count as failed (FR-008).

**Files**: `src/adapters/heartbeat/graders/idempotency.ts`

**Validation**: `tests/heartbeat/idempotency.test.ts` (T011) covers:
- Repeat tick where once-only item NOT re-executed → `passed: true`, empty `repeatedActions`
- Repeat tick where once-only item IS re-executed → `passed: false`, item in `repeatedActions`
- Recurring item re-executed on repeat tick → `passed: true` (not penalised)
- Mixed checklist (once-only + recurring): once-only repeated, recurring repeated → only
  the once-only item fails
- `priorActionSummary === null` on repeat tick → `TickStateValidationError` thrown
- k-of-n aggregation: 4 of 5 passing (k=4) → `true`; 3 of 5 passing (k=4) → `false`

---

### T010 — Rigged-impossible discrimination controls for action-diff and idempotency

**Purpose**: Each grader ships a rigged-impossible discrimination control proving it can
fail (FR-009, charter testing standards). These are standard test cases with inputs
engineered to produce guaranteed failure.

**Steps**:
1. In `tests/heartbeat/action-diff.test.ts`, add a `describe('discrimination control')` block:
   - **Control scenario**: a response that contains clearly irrelevant actions (e.g.,
     `"I updated the calendar"`) when the intended action is `"Send the daily summary"`.
     Assert: `gradeActionDiff` produces `passed: false` and `extraActions` is non-empty.
   - **Harder control**: a response that starts with `HEARTBEAT_OK` when actions were due.
     Assert: `gradeRun` produces `passed: false` (the HEARTBEAT_OK-on-due-tick guard, T008 step 7).
   - Add a comment: "Rigged-impossible discrimination control (FR-009). These inputs are
     designed to fail the grader. If either of these tests fails (i.e. the grader passes
     them), the grader has a bug."
2. In `tests/heartbeat/idempotency.test.ts`, add a `describe('discrimination control')` block:
   - **Control scenario**: a repeat-tick response that verbatim repeats the once-only
     prior action. Assert: `gradeIdempotency` produces `passed: false` and
     `repeatedActions` contains the action.
   - Add the same comment as above.
3. Document each control with a one-line comment explaining why the input is rigged to fail.
4. Both control test cases must be in the same files as the regular tests (not separate
   files) so coverage counts them.

**Files**: `tests/heartbeat/action-diff.test.ts`, `tests/heartbeat/idempotency.test.ts`

**Validation**:
- Both discrimination control test cases pass (the graders correctly identify the
  rigged inputs as failures)
- Running the tests with the grader's `passed` logic temporarily inverted confirms the
  controls would catch a broken grader (manual review step)

---

### T011 — `action-diff.test.ts` + `idempotency.test.ts`

**Purpose**: Full unit test files for both graders, combining scenario tests (T008/T009
Validation sections) and discrimination controls (T010). ≥80% new-code coverage on
both grader source files.

**Steps**:
1. Write `tests/heartbeat/action-diff.test.ts`:
   - Import from `src/adapters/heartbeat/graders/action-diff.ts` and
     `src/adapters/heartbeat/lint.ts` (for `ChecklistItem`).
   - No real model calls — all `agentResponse` strings are hardcoded literals.
   - Structure:
     ```
     describe('gradeActionDiff', () => { ... })   // T008 grader tests
     describe('gradeRun', () => { ... })           // end-to-end grading
     describe('aggregateActionDiff', () => { ... }) // k-of-n tests
     describe('discrimination control', () => { ... }) // T010
     ```
2. Write `tests/heartbeat/idempotency.test.ts`:
   - Import from `src/adapters/heartbeat/graders/idempotency.ts` and
     `src/adapters/heartbeat/lint.ts`.
   - No real model calls — all `agentResponse` strings are hardcoded literals.
   - Structure mirrors action-diff.test.ts.
3. Run `pnpm test:coverage` and confirm coverage ≥80% on both grader source files.

**Files**: `tests/heartbeat/action-diff.test.ts`, `tests/heartbeat/idempotency.test.ts`

**Validation**:
- `pnpm test -- tests/heartbeat/action-diff tests/heartbeat/idempotency` → all pass
- `pnpm build` (strict tsc) → no errors in test or source files
- Coverage ≥80% on `src/adapters/heartbeat/graders/action-diff.ts` and
  `src/adapters/heartbeat/graders/idempotency.ts`

---

### T012 — WP02 verification (gate for Definition of Done)

**Purpose**: Confirm the complete WP02 deliverable is green before WP03 proceeds.

**Steps** (in order):
```bash
pnpm build                          # strict tsc — zero errors
pnpm test                           # full Vitest suite — zero failures, zero new skips
pnpm test -- tests/heartbeat/action-diff tests/heartbeat/idempotency   # WP02 specifically
pnpm test:coverage                  # check new-code coverage on grader files
git diff --stat                     # ONLY the four owned files + any new graders/ subdir
git diff -U0 | grep '^[-+]export' || echo OK    # no unintended exports from core
```

Discrimination controls check:
```bash
pnpm test -- tests/heartbeat/action-diff --reporter=verbose 2>&1 | grep -E '(discrimination|control)'
# Both discrimination control tests should appear as passing
```

**Files**: none (verification only)

**Validation**:
- `pnpm build` green
- Full Vitest suite green with no new skips
- Both discrimination controls appear as passing test cases in verbose output
- `git diff --stat` shows only owned files changed (no `src/core/` modifications)

## Definition of Done

- [ ] `src/adapters/heartbeat/graders/action-diff.ts`: `gradeActionDiff`, `gradeRun`,
  `aggregateActionDiff` implemented; HEARTBEAT_OK-on-due-tick guard in place; tsc strict passes
- [ ] `src/adapters/heartbeat/graders/idempotency.ts`: `gradeIdempotency`, `gradeRun`,
  `aggregateIdempotency` implemented; once-only/recurring discrimination from manifest label;
  tsc strict passes
- [ ] Rigged-impossible discrimination control in each test file, with comment (FR-009)
- [ ] `tests/heartbeat/action-diff.test.ts` + `idempotency.test.ts`: all scenarios + controls pass
- [ ] Errored run (empty/malformed response) counted as failed, not skipped (FR-008)
- [ ] No `src/core/` file modified; no WP01 source file modified; no existing file outside
  owned_files touched
- [ ] `pnpm build` + `pnpm test` green; no new skips; new-code coverage ≥80% on grader files

## Reviewer guidance

- **Reject if** any `src/core/` file is modified, any WP01 source file is modified, any
  existing test file is changed, or either discrimination control is missing from the test file.
- Check idempotency grader: must use `item.recurrence === 'once-only'` as the filter —
  any version that infers recurrence from item text is an automatic reject (data-model
  invariant).
- Check HEARTBEAT_OK-on-due-tick guard: must be in `gradeRun`, not in
  `gradeActionDiff`; must produce `passed: false` with `missingActions` = intended actions.
- Check errored run: ask for the test case covering empty or malformed response;
  it must count as a failure.
- Check k-of-n: verify `aggregateActionDiff` and `aggregateIdempotency` use `>=` not `>`.
- Discrimination control comment must say "rigged-impossible" and cite FR-009.

## Activity Log

- 2026-06-13T01:30:00Z – /spec-kitty.tasks – created
- 2026-06-13T14:26:29Z – claude:sonnet:implementer:implementer – Moved to in_progress
- 2026-06-13T14:30:59Z – claude:sonnet:implementer:implementer – Implemented on rebased code-only lane; build+test green, coverage >=89%
- 2026-06-13T14:34:00Z – claude:opus:reviewer:reviewer – action-diff + idempotency graders correct; HEARTBEAT_OK-on-due guard in gradeRun; recurrence from manifest label not text; genuine discrimination controls fail as designed; errored=failed; k-of-n uses >=
- 2026-06-13T14:53:17Z – claude:sonnet:implementer:implementer – Reopen: action-diff live observation contract fix (FR-004)
- 2026-06-13T14:59:43Z – claude:sonnet:implementer:implementer – Action observation contract implemented; action-diff matches ACTION: lines
- 2026-06-13T15:03:24Z – claude:opus:reviewer:reviewer – FR-004 fix: action-diff.ts grader now extracts ACTION: <label> lines (case-insensitive prefix, trim+collapse-whitespace, dedup by normalized key), matches against manifest intendedActions with set semantics (no missing/no extra). HEARTBEAT_OK-on-due guard kept (gradeRun returns passed:false). Discrimination controls genuine and failing: irrelevant label, HEARTBEAT_OK, and prose-with-no-ACTION-lines all assert passed:false (FR-009). aggregateActionDiff k-of-n (>=k) matches FR-004's stated k-of-n. No localeCompare. WP02-owned files only. action-diff.ts 100% coverage.
