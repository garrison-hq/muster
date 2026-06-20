---
work_package_id: WP03
title: A2A behavioral runner + black-box state (B2 + B4)
dependencies:
- WP01
- WP02
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-007
- FR-011
- NFR-001
planning_base_branch: main
merge_target_branch: main
branch_strategy: Plan/tasks on kitty/mission-a2a-behavioral-conformance; execution worktree allocated per lane from lanes.json; completed work merges to main via PR.
subtasks:
- T013
- T014
- T015
- T016
- T017
- T018
- T019
history:
- Created by /spec-kitty.tasks for mission a2a-behavioral-conformance-01KVJDWE
authoritative_surface: src/adapters/a2a/graders/behavioral.ts
execution_mode: code_change
owned_files:
- src/adapters/a2a/graders/behavioral.ts
- tests/a2a/behavioral-runner.test.ts
- tests/fixtures/a2a/transcripts/**
tags: []
---

# WP03 — A2A behavioral runner + black-box state (B2 + B4)

## Objective

Add `src/adapters/a2a/graders/behavioral.ts`: the adapter-side runner that, per behavioral case,
drives a multi-turn A2A conversation (via WP01's `sendMessage`), builds a `TranscriptEntry[]`
sending **only user turns** (no persona/system prompt), grades it with the **core** axis graders,
and scores k-of-n with `conjunctivePassK`. State-shift is **black-box** (B4): track the
*expected* state locally and never tell the agent.

This is the one genuinely new piece. It depends on WP01 (transport `sendMessage` + handle) and
WP02 (manifest types + `resolveThresholds`).

## Context (read before coding)

- Data model: `kitty-specs/a2a-behavioral-conformance-01KVJDWE/data-model.md` (entity → type map).
- Research: `.../research.md` D2 (reuse the graders, NOT `runCase`), D3 (black-box thresholds).
- Reuse **by import** from core:
  - `src/core/behavioral/graders.ts` → `gradeVerbosity`, `gradeRefusal`, `gradeStateShift`,
    `verbosityLimit`.
  - `src/core/behavioral/pass-k.ts` → `conjunctivePassK`.
  - `src/core/behavioral/types.ts` → `TranscriptEntry`, `Transcript`, `AxisGrade`, `RunVerdict`,
    `CaseVerdict`.
- From WP01: `sendMessage(endpoint, turnText, handle, opts)` + `ConversationHandle`.
- From WP02: `A2aBehavioralCase`, `ResolvedThresholds`, and `resolveThresholds(case)`.
- **Do NOT import `src/core/behavioral/runner.ts` (`runCase`)** — it injects a persona system
  prompt (incl. a `Current mood state: X` line). Black-box forbids that. Reuse only the graders +
  pass-k.
- Boundary: this file imports core and WP01/WP02 (same adapter); core never imports it (C-004).

## Subtasks

### T013 — Per-case turn walk over A2A

**Purpose:** Run one case once (one "run"), producing a transcript.

**Steps:**
1. `runA2aCaseOnce(case, endpoint, token, thresholds): Promise<RunVerdict>`.
2. Initialize an empty `ConversationHandle`. For each `turn` in `case.turns`:
   - call `sendMessage(endpoint, turn.content, handle, { token, idSeq })`; update `handle` from
     the result;
   - append a `TranscriptEntry { role:"user", content: turn.content, activeState }` and a
     `TranscriptEntry { role:"assistant", content: reply, activeState, wordCount }`.
3. If any turn errors (WP01 error contract), abort the run and return a `RunVerdict` with
   `error` set and `passed: false` (errored = failed; do not retry).
4. Record `Transcript { entries, model: <card id or placeholder>, baseUrl: endpoint,
   temperature: "default", durationMs }`.

**Files:** `src/adapters/a2a/graders/behavioral.ts`.

### T014 — Build `TranscriptEntry[]` (user turns only)

**Purpose:** Produce exactly the transcript the core graders expect, with **no** system/persona
content.

**Steps:**
1. Never push a system/persona entry. Only `role:"user"` (from the case) and `role:"assistant"`
   (the reply) entries.
2. Compute assistant `wordCount` the same way the chat path does (reuse the thresholds/word
   helper used by `gradeVerbosity`; find `thresholds.words(...)` and reuse it — do not invent a
   new word-count).
3. `activeState` on each entry = muster's **expected** state at that turn (T015), never anything
   the agent was told.

**Files:** `src/adapters/a2a/graders/behavioral.ts`.

### T015 — Expected-state tracking (black-box, B4)

**Purpose:** Track the state muster *expects* so the verbosity threshold and `state_shift` axis
can be graded — without informing the agent.

**Steps:**
1. Before each turn, evaluate the case's `facts`/trigger semantics to compute the expected
   active state (mirror how the chat runner decides a shift from `facts`/`trigger_turn`, but
   **do not** add any system message and **do not** send state to the agent).
2. After a `state_shift` axis's `trigger_turn`, the expected state becomes `expect_state`; entries
   from then on carry that `activeState` and use the shifted threshold (T016).
3. Document clearly in a header comment that this is the black-box decision (D3/FR-011): state is
   muster-internal; the agent must reveal the shift through observable behavior.

**Files:** `src/adapters/a2a/graders/behavioral.ts`.

### T016 — Threshold mapping for the graders

**Purpose:** Feed `gradeVerbosity`/`gradeStateShift` the right per-state word caps from decision C.

**Steps:**
1. Take `ResolvedThresholds` from WP02 (`resolveThresholds(case)`).
2. Adapt it into whatever `ThresholdMapping`/args `gradeVerbosity` expects (it takes a thresholds
   object with `maxWords(verbosity)` / `words(...)` / `refusalCap`). Build a mapping that returns
   the resolved default cap for the base state and the per-state cap for shifted states, plus the
   resolved `refusal_cap`.
3. Honor `overrides.max_words`/`refusal_cap` already folded in by WP02.

**Files:** `src/adapters/a2a/graders/behavioral.ts`.

### T017 — Grade with the core axis graders

**Purpose:** Reuse the exact grading logic — no axis logic re-implemented (FR-002).

**Steps:** for each run's transcript, for each axis in `case.axes`:
- `verbosity` → `gradeVerbosity(entry, effective?, override, thresholds, turn)` for the targeted
  turns (or all); push the `AxisGrade`s.
- `refusal` → `gradeRefusal(entry, override, assertions, thresholds, turn)` at `axis.turn`.
- `state_shift` → `gradeStateShift(expectedState, axis.expect_state, postShiftVerbosityGrades,
  { turn: axis.trigger_turn, shiftedLimit })`.
Collect all `AxisGrade[]`; a run `passed` iff every grade passed.

**Files:** `src/adapters/a2a/graders/behavioral.ts`.

### T018 — Aggregate runs → `CaseVerdict`

**Purpose:** k-of-n scoring + the exit-contract inputs.

**Steps:**
1. `runA2aCase(case, ...)`: execute `case.runs` runs (sequential; no retry). Map each
   `RunVerdict.passed` (errored → `false`).
2. `passCount = passed runs`; `passed = passCount >= case.pass_threshold` (use `conjunctivePassK`
   for the all-must-pass semantics where applicable; the case-level pass is the
   `passCount >= pass_threshold` check — match the chat runner's aggregation exactly).
3. Return `CaseVerdict { id, passed, passCount, runs }`.
4. Expose a case-collection entry point `runBehavioralCases(manifest, env): CaseVerdict[]` plus a
   classification the CLI (WP04) maps to exit codes: all passed → 0; ≥1 failed → 1; **every run of
   every case errored** → 2. Surface enough info (e.g. an `allErrored` flag) for WP04.

**Files:** `src/adapters/a2a/graders/behavioral.ts`.

### T019 — Unit tests with fixture transcripts

**Purpose:** Prove grading offline by injecting transcripts (mock `sendMessage`).

**Steps:**
1. New `tests/a2a/behavioral-runner.test.ts`. Mock WP01 `sendMessage` to return scripted replies
   (no network).
2. Fixtures under `tests/fixtures/a2a/transcripts/` (or inline scripted replies): a passing case,
   a verbosity-fail (reply too long), a refusal-fail (reply contains a forbidden substring), a
   state-shift case (replies tighten after the trigger turn → pass; stay verbose → fail), and an
   all-errored case (`sendMessage` throws every run → verdict failed, classification `allErrored`).
3. Assert: verdicts correct; the **core** graders are the ones producing grades (e.g. spy/structure
   check, or assert measured-vs-limit values match the core grader output); determinism (same
   scripted transcript ⇒ identical verdict across repeated runs, NFR-001).

**Files:** `tests/a2a/behavioral-runner.test.ts`, `tests/fixtures/a2a/transcripts/**`.
**Validation:** `pnpm test` green; `pnpm typecheck` clean.

## Definition of Done

- `behavioral.ts` runs a multi-turn case over A2A, builds a system-prompt-free transcript, grades
  with the core graders + pass-k, and returns `CaseVerdict[]` plus the exit classification.
- State-shift is black-box; no persona/system content is ever sent; `runCase` is not imported.
- New tests pass; `pnpm build` + `pnpm test` green; C-004 invariant still passes.

## Reviewer guidance

- Grep the file: it must NOT import `core/behavioral/runner` and must NOT construct any
  system/persona message.
- Confirm axis grades come from the core graders (no re-implemented verbosity/refusal/state logic).
- Confirm errored runs count as failed and an all-errored case is distinguishable for exit 2.

## Implementation command

```
spec-kitty agent action implement WP03 --agent <name>
```
