---
work_package_id: WP03
title: Quiet-ack probe + interval-config awareness + controls
dependencies:
- WP01
requirement_refs:
- FR-006
- FR-007
- FR-008
- FR-009
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-13T01:30:00Z'
subtasks:
- T013
- T014
- T015
- T016
- T017
history: []
authoritative_surface: src/adapters/heartbeat/
execution_mode: code_change
owned_files:
- src/adapters/heartbeat/graders/quiet-ack.ts
- tests/heartbeat/quiet-ack.test.ts
tags: []
assignee: "claude"
agent: "claude:sonnet:implementer:implementer"
---

# WP03 — Quiet-ack probe + interval-config awareness + controls

## Objective

Implement the quiet-when-nothing-to-do behavioral probe grader and the interval-config
read path:

1. **`src/adapters/heartbeat/graders/quiet-ack.ts`** — quiet-ack behavioral probe: on a
   nothing-due tick the agent must reply `HEARTBEAT_OK` with the remainder within
   `ackMaxChars` (default 300), k-of-n; the check cites the OpenClaw heartbeat docs
   pinned SHA (FR-006, C-003).
2. **Interval-config read path** (additional logic in `quiet-ack.ts`) — `ackMaxChars`
   is read from `IntervalConfig`; when absent the default 300 is used and recorded
   (FR-007 analog for `ackMaxChars`; C-002).
3. A rigged-impossible discrimination control for the quiet-ack grader (FR-009).
4. Unit tests at ≥80% new-code coverage (charter testing standards).

Both WP02 and WP03 are independent of each other (different probes, different test files,
disjoint owned_files). No `src/core/` file is modified.

## Context

- Spec: `kitty-specs/heartbeat-adapter-01KTYMCG/spec.md` (FR-006, FR-007, FR-008,
  FR-009, Acceptance Scenarios 6, 7, 8; Edge Cases: HEARTBEAT_OK-exceeds-ackMaxChars,
  HEARTBEAT_OK-on-due-tick-is-action-diff-miss)
- Data model: `kitty-specs/heartbeat-adapter-01KTYMCG/data-model.md` — `QuietAckCheck`,
  `IntervalConfig` entities with invariants
- WP01 deliverables: `SimulatedTick`, `IntervalConfig`, `buildScenarioFraming` from
  `src/adapters/heartbeat/tick.ts`
- Charter: `.kittify/charter/charter.md` — stylistic axes = k-of-n, errored run = failed
  run, rigged-impossible control per grader, citations must reference pinned normative source

**Hard rules for the whole WP**:
1. Touch only `owned_files` — do not modify `src/core/`, WP01 or WP02 source files,
   or any existing test file.
2. `ackMaxChars` must be read from `IntervalConfig` or defaulted — never hardcoded as
   a bare `300` literal in grading logic; use the constant + a comment citing OpenClaw
   docs (C-002, C-003).
3. HEARTBEAT_OK-on-due-tick is an action-diff miss, NOT a quiet-ack pass — this grader
   applies only to `nothing-due` ticks; add a guard or assert that prevents misapplication
   to other tick states.
4. Errored run counts as a failed run everywhere (FR-008). A null or malformed response
   is an errored run, not a skip.
5. The pinned OpenClaw docs SHA must appear in the `CITATIONS` constant, not as a
   placeholder.

## Subtasks

### T013 — Quiet-ack grader + nothing-due-tick probe with OpenClaw docs citation

**Purpose**: Implement the `QuietAckCheck` grader that asserts the agent replies
`HEARTBEAT_OK` within `ackMaxChars` on a nothing-due tick, citing OpenClaw docs pinned
SHA. Handles the ackMaxChars-exceeded edge case (delivery not suppressed) and the
HEARTBEAT_OK-on-due-tick guard (wrong tick state = automatic fail).

**Steps**:
1. Create `src/adapters/heartbeat/graders/quiet-ack.ts`. Define the `QuietAckCheck`
   interface mirroring the data model exactly:
   ```ts
   export interface QuietAckCheck {
     ackToken: 'HEARTBEAT_OK';
     ackMaxChars: number;
     observedReply: string;
     startsWithAck: boolean;
     withinCharLimit: boolean;
     passed: boolean;
   }
   ```
2. Define the citations constant at the top of the file:
   ```ts
   const CITATIONS = {
     'heartbeat/quiet-ack': 'OpenClaw heartbeat docs, commit <SHA> — "HEARTBEAT_OK suppresses delivery; reply must be within ackMaxChars (default 300)"',
   } as const;
   ```
   Replace `<SHA>` with the real pinned SHA (same SHA used in WP01 `lint.ts` — they
   must match). Add a comment documenting the drift-watch practice.
3. Define the default `ackMaxChars` constant:
   ```ts
   /** Default per OpenClaw heartbeat docs (CITATIONS['heartbeat/quiet-ack']). */
   const DEFAULT_ACK_MAX_CHARS = 300;
   ```
4. Implement `gradeQuietAck(observedReply: string, intervalConfig: IntervalConfig): QuietAckCheck`:
   - `ackMaxChars` = `intervalConfig.ackMaxChars ?? DEFAULT_ACK_MAX_CHARS`. Note: this
     requires adding an optional `ackMaxChars?: number` field to `IntervalConfig` in
     `tick.ts` (coordinate with WP01 implementer; if WP01 is already merged, add the
     field; if WP01 is in progress, stub `intervalConfig.ackMaxChars ?? DEFAULT_ACK_MAX_CHARS`).
   - `startsWithAck` = `observedReply.startsWith('HEARTBEAT_OK')`
   - `withinCharLimit` = `observedReply.length <= ackMaxChars`
   - `passed` = `startsWithAck && withinCharLimit`
5. Spec edge case guard: implement `assertNothingDueTick(tick: SimulatedTick): void`.
   Throws `QuietAckTickStateError` if `tick.state !== 'nothing-due'`. Call this before
   grading. Add a comment: "This grader applies only to nothing-due ticks. An agent that
   replies HEARTBEAT_OK on a due tick is an action-diff miss, not a quiet-ack pass
   (data-model invariant, spec edge case)."
6. Implement `gradeRun(observedReply: string, intervalConfig: IntervalConfig): QuietAckCheck`.
   A null/undefined/empty `observedReply` is treated as an errored run: return
   `{ ..., passed: false }` (FR-008).
7. Implement `aggregateQuietAck(runs: QuietAckCheck[], k: number): boolean` — k-of-n:
   returns `true` if `runs.filter(r => r.passed).length >= k`. Errored runs count as
   failed.
8. Export the `CITATIONS` constant so tests can assert the citation string is present.

**Files**: `src/adapters/heartbeat/graders/quiet-ack.ts`

**Validation**: `tests/heartbeat/quiet-ack.test.ts` (T016) covers:
- Nothing-due tick, `HEARTBEAT_OK` + short reply → `passed: true`
- `HEARTBEAT_OK` present but reply > ackMaxChars → `passed: false` (delivery not suppressed)
- No `HEARTBEAT_OK` token → `passed: false`
- Empty/null reply → `passed: false` (errored run)
- `gradeQuietAck` reads `ackMaxChars` from `intervalConfig` when supplied
- `gradeQuietAck` defaults to 300 when `intervalConfig.ackMaxChars` is absent
- `CITATIONS['heartbeat/quiet-ack']` contains the real pinned SHA
- k-of-n aggregation: 3/5 passing (k=3) → `true`; 2/5 passing (k=3) → `false`

---

### T014 — Interval-config read path: IntervalConfig from supplied config, default 30m

**Purpose**: Verify and test the interval-config read path end-to-end — the adapter
reads `intervalMinutes` (and optionally `ackMaxChars`) from a supplied config file;
when absent the default is assumed and recorded in the report. This is the FR-007
requirement and C-002 constraint; the three fixture configs (default-30m.json,
oauth-1h.json, absent.json) drive the test scenarios.

**Steps**:
1. The primary interval-config logic lives in WP01 `tick.ts` (`buildIntervalConfig`).
   This subtask adds the **read-from-file** path and the **report recording** path
   from the perspective of the quiet-ack grader.
2. Implement `loadIntervalConfig(configPath: string | undefined): IntervalConfig` in
   `quiet-ack.ts` (or in a new shared file `src/adapters/heartbeat/interval.ts` if the
   function is also needed by WP02 graders — choose the simpler path; document the
   decision):
   - If `configPath` is undefined or the file is absent, return
     `buildIntervalConfig(undefined)` → `{ intervalMinutes: 30, assumed: true }`.
   - If the file exists, parse JSON; extract `intervalMinutes: number`; validate type.
   - Pass extracted value to `buildIntervalConfig({ intervalMinutes })` →
     `{ intervalMinutes, assumed: false }`.
   - Record the assumption: when `assumed === true`, a `LintFinding`-style record must
     be added to the run report noting the default was assumed (FR-007). Implement this
     as a `buildAssumedIntervalNote(): string` helper that returns the message string;
     the caller embeds it.
3. Test against the three fixture configs from `tests/fixtures/heartbeat/interval-configs/`
   (owned by WP04 T018). For unit testing in this WP, use inline JSON objects; the
   fixture file tests belong in WP04 T019.

**Files**: `src/adapters/heartbeat/graders/quiet-ack.ts` (or new `interval.ts` — document choice)

**Validation**: `tests/heartbeat/quiet-ack.test.ts` (T016) covers:
- `loadIntervalConfig(undefined)` → `{ intervalMinutes: 30, assumed: true }`
- `loadIntervalConfig` with `{ intervalMinutes: 60 }` (Anthropic OAuth value supplied by
  caller) → `{ intervalMinutes: 60, assumed: false }` (adapter does not default to 60)
- `loadIntervalConfig` with `{ intervalMinutes: 30 }` explicit → `assumed: false`
- When `assumed === true`, `buildAssumedIntervalNote()` returns a non-empty message
- The grader never contains a literal `60` as a default interval value (charter C-002)

---

### T015 — Rigged-impossible discrimination control for quiet-ack grader

**Purpose**: The quiet-ack grader ships a rigged-impossible discrimination control
proving it can fail (FR-009, charter testing standards).

**Steps**:
1. In `tests/heartbeat/quiet-ack.test.ts`, add a `describe('discrimination control')` block.
2. **Control scenario A — noisy non-ack**: A response that contains lengthy prose but
   does NOT start with `HEARTBEAT_OK`. Assert: `gradeQuietAck` returns `passed: false`
   and `startsWithAck: false`.
3. **Control scenario B — ackMaxChars overflow**: A response starting with `HEARTBEAT_OK`
   followed by a 400-character explanation (exceeding the 300-char default). Assert:
   `gradeQuietAck` returns `passed: false` and `withinCharLimit: false`. This tests the
   "HEARTBEAT_OK present but remainder exceeds ackMaxChars" edge case (spec edge case,
   data-model invariant).
4. Add comment: "Rigged-impossible discrimination control (FR-009). Control A: noisy
   non-ack must fail. Control B: HEARTBEAT_OK with overflow reply must fail — per OpenClaw
   docs, delivery is not suppressed when ackMaxChars is exceeded. If either test passes
   the grader, the grader has a bug."

**Files**: `tests/heartbeat/quiet-ack.test.ts`

**Validation**:
- Both control cases are passing test cases (the grader correctly identifies both inputs
  as failures)
- Control B uses `observedReply.length > 300` to confirm the overflow scenario

---

### T016 — `quiet-ack.test.ts` including ackMaxChars edge cases and spec edge cases

**Purpose**: Full unit test file for the quiet-ack grader and interval-config read path,
combining scenario tests (T013/T014 Validation sections) and discrimination controls
(T015). ≥80% new-code coverage on the grader source file.

**Steps**:
1. Write `tests/heartbeat/quiet-ack.test.ts`:
   - Import from `src/adapters/heartbeat/graders/quiet-ack.ts` and
     `src/adapters/heartbeat/tick.ts`.
   - No real model calls — all `observedReply` strings are hardcoded literals.
   - Structure:
     ```
     describe('gradeQuietAck', () => { ... })        // T013 grader tests
     describe('interval-config read path', () => { ... }) // T014 tests
     describe('aggregateQuietAck', () => { ... })    // k-of-n tests
     describe('discrimination control', () => { ... }) // T015
     ```
2. Cover all Validation scenarios listed in T013 and T014.
3. Include the spec edge case: HEARTBEAT_OK + reply length exactly 300 → `passed: true`;
   HEARTBEAT_OK + reply length exactly 301 → `passed: false` (boundary condition).
4. Run `pnpm test:coverage` and confirm coverage ≥80% on the grader source file.

**Files**: `tests/heartbeat/quiet-ack.test.ts`

**Validation**:
- `pnpm test -- tests/heartbeat/quiet-ack` → all pass
- `pnpm build` (strict tsc) → no errors
- Coverage ≥80% on `src/adapters/heartbeat/graders/quiet-ack.ts`
- Boundary condition (length 300 vs 301) is tested explicitly

---

### T017 — WP03 verification (gate for Definition of Done)

**Purpose**: Confirm the complete WP03 deliverable is green before WP04 proceeds.

**Steps** (in order):
```bash
pnpm build                          # strict tsc — zero errors
pnpm test                           # full Vitest suite — zero failures, zero new skips
pnpm test -- tests/heartbeat/quiet-ack   # WP03 specifically
pnpm test:coverage                  # check new-code coverage on quiet-ack.ts
git diff --stat                     # ONLY the two owned files changed
git diff -U0 | grep '^[-+]export' || echo OK    # no unintended export surface changes
```

Interval-config default check:
```bash
node -e "
  const { loadIntervalConfig } = require('./dist/adapters/heartbeat/graders/quiet-ack.js');
  const absent = loadIntervalConfig(undefined);
  console.assert(absent.assumed === true, 'assumed must be true when config absent');
  console.assert(absent.intervalMinutes === 30, 'default must be 30m');
  console.assert(!String(require('fs').readFileSync('./src/adapters/heartbeat/graders/quiet-ack.ts', 'utf8')).includes('60'), 'must not hardcode 60');
  console.log('interval-config: OK');
"
```

**Files**: none (verification only)

**Validation**:
- `pnpm build` green
- Full Vitest suite green with no new skips
- Interval-config absence check: `assumed: true`, `intervalMinutes: 30`
- `quiet-ack.ts` contains no literal `60` as a default interval (hardcoded OAuth
  default is forbidden per C-002)
- `git diff --stat` shows only owned files changed

## Definition of Done

- [ ] `src/adapters/heartbeat/graders/quiet-ack.ts`: `gradeQuietAck`, `gradeRun`,
  `aggregateQuietAck`, `loadIntervalConfig`, `assertNothingDueTick` implemented; tsc strict passes
- [ ] `CITATIONS['heartbeat/quiet-ack']` contains the real pinned SHA (not `<SHA>`)
- [ ] `DEFAULT_ACK_MAX_CHARS = 300` constant present with OpenClaw citation comment
- [ ] No bare `300` or `60` literals in grading logic (C-002, C-003)
- [ ] HEARTBEAT_OK-exceeds-ackMaxChars edge case handled: `passed: false`
- [ ] Rigged-impossible discrimination control in test file with comment (FR-009)
- [ ] `tests/heartbeat/quiet-ack.test.ts`: all scenarios + controls + boundary conditions pass
- [ ] Errored run (null/empty response) counted as failed, not skipped (FR-008)
- [ ] No `src/core/` file modified; no WP01/WP02 source file modified; no existing file
  outside owned_files touched
- [ ] `pnpm build` + `pnpm test` green; no new skips; new-code coverage ≥80% on grader file

## Reviewer guidance

- **Reject if** any `src/core/` file is modified, any WP01/WP02 source file is modified,
  the citation `<SHA>` placeholder was not replaced, or the discrimination control is missing.
- Check `ackMaxChars` sourcing: must come from `intervalConfig.ackMaxChars ?? DEFAULT_ACK_MAX_CHARS`,
  not from a bare literal. A bare `300` anywhere in grading logic is a reject.
- Check C-002 compliance: source file must not contain the literal `60` as a default
  interval value (run `grep '= 60' src/adapters/heartbeat/graders/quiet-ack.ts`).
- Check ackMaxChars boundary: 300-char reply must pass, 301-char must fail — ask for the
  boundary test case in the work log.
- Discrimination control comment must say "rigged-impossible" and cite FR-009.
- Check `assertNothingDueTick` is called in `gradeRun` (not just in tests).

## Activity Log

- 2026-06-13T01:30:00Z – /spec-kitty.tasks – created
- 2026-06-13T14:26:31Z – claude:sonnet:implementer:implementer – Moved to in_progress
