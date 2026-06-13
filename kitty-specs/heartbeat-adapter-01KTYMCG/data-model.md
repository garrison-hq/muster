# Data Model: Schedule (HEARTBEAT.md) Conformance Adapter

**Mission**: `heartbeat-adapter-01KTYMCG`
**Date**: 2026-06-13
**Spec**: `kitty-specs/heartbeat-adapter-01KTYMCG/spec.md`

This document describes the domain entities, their invariants, and the
relationships between them.  All entities live behind the `SpecAdapter`
boundary (C-001): the spec-agnostic core never imports them.

---

## Entities

### HEARTBEAT.md

The source file consumed by the Schedule adapter.

| Field | Type | Notes |
|---|---|---|
| `path` | `string` | Absolute path to the file on disk. |
| `raw` | `string` | Raw UTF-8 content as read; may be empty or comment-only. |
| `items` | `ChecklistItem[]` | Parsed checklist instructions; empty when the file is empty or comment-only (skip semantics — FR-003, C-003). |
| `isEmpty` | `boolean` | True when `raw` is empty or contains only whitespace and Markdown comment blocks. The documented `empty file skips the run` semantics apply (OpenClaw docs, pinned commit SHA, C-003). |

**Invariants**:
- `isEmpty === true` implies `items.length === 0`.
- A file with a single real instruction (non-whitespace, non-comment) is NOT
  empty even if all other lines are blank or comments (spec edge case).
- Static lint output is byte-stable and deterministic across repeated runs and
  machines (NFR-001).

---

### ChecklistItem

One instruction extracted from `HEARTBEAT.md`.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable identifier within the file (e.g., ordinal, slug). |
| `text` | `string` | The instruction text as written in the file. |
| `recurrence` | `"once-only" \| "recurring"` | Declared in the companion item-recurrence manifest (FR-002). `once-only` items drive the idempotency check; `recurring` items are expected on every tick and are excluded from idempotency grading (spec edge case: legitimately recurring actions). |

**Invariants**:
- Every `ChecklistItem` has a non-empty `text`.
- `recurrence` is set from the manifest; it is never inferred from the item
  text (the adapter does not guess recurrence).
- Only items with `recurrence === "once-only"` contribute to
  `IdempotencyCheck` grading (FR-005).

---

### SimulatedTick

The unit of behavioral testing.  A tick is simulated via scenario framing plus
a supplied state; no real scheduler runs and no wall-clock time is waited
(C-004).

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Unique identifier within the test manifest. |
| `scenarioFraming` | `string` | The system-prompt framing injected to simulate the heartbeat prompt. Derived from the documented default prompt: *"Read HEARTBEAT.md if it exists. Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT\_OK."* (OpenClaw docs, pinned SHA, C-003). |
| `state` | `"due" \| "repeat" \| "nothing-due"` | The tick's logical state. Determines which grader applies and what the expected agent behaviour is. |
| `priorActionSummary` | `string \| null` | For `repeat` ticks: a summary of what the agent did on the previous (due) tick, injected into context to allow idempotency grading.  `null` for `due` and `nothing-due` ticks. |
| `intervalConfig` | `IntervalConfig` | The interval configuration for this tick run (FR-007). |

**Invariants**:
- `state === "repeat"` implies `priorActionSummary !== null`.
- `state === "due"` and `state === "nothing-due"` imply `priorActionSummary === null`.
- The scenario framing cites the OpenClaw documented default prompt verbatim
  (C-003).

---

### ActionDiff

The comparison between the agent's observed actions on a due tick and the
intended action set declared in the `HEARTBEAT.md` items that are due (FR-004).

| Field | Type | Notes |
|---|---|---|
| `intendedActions` | `string[]` | The action descriptions from `ChecklistItem.text` for all items the tick state makes due. |
| `observedActions` | `string[]` | The actions extracted from the agent's transcript (tool calls and/or text actions, per the manifest's observation declaration). |
| `missingActions` | `string[]` | Intended actions not observed. |
| `extraActions` | `string[]` | Observed actions not in the intended set. |
| `passed` | `boolean` | `missingActions.length === 0 && extraActions.length === 0`. |

**Invariants**:
- An agent that replies `HEARTBEAT_OK` on a due tick produces an action-diff
  miss (the quiet ack was wrong), not a quiet-ack pass (spec edge case).
- `passed` requires exact match: no missing, no extra actions (FR-004).

---

### QuietAckCheck

Asserts the agent's quiet-when-nothing-to-do behaviour on a nothing-due tick
(FR-006).

| Field | Type | Notes |
|---|---|---|
| `ackToken` | `"HEARTBEAT_OK"` | The required acknowledgement token. Cited from OpenClaw docs (pinned SHA, C-003). |
| `ackMaxChars` | `number` | Maximum total character count of the reply when `HEARTBEAT_OK` is present. Default: 300. Cited from OpenClaw docs (C-003). |
| `observedReply` | `string` | The full agent reply text for this run. |
| `startsWithAck` | `boolean` | True when `observedReply` starts with `HEARTBEAT_OK`. |
| `withinCharLimit` | `boolean` | True when `observedReply.length <= ackMaxChars`. |
| `passed` | `boolean` | `startsWithAck && withinCharLimit`. |

**Invariants**:
- `HEARTBEAT_OK` present but remainder exceeds `ackMaxChars` → `passed = false`
  (delivery not suppressed per docs; spec edge case).
- An agent that replies `HEARTBEAT_OK` but also takes an action on a due tick
  is graded as an action-diff miss, NOT as a quiet-ack pass (spec edge case:
  graders are exclusive by tick state).
- `ackMaxChars` is read from `IntervalConfig`; when absent the default 300 is
  used and recorded (FR-007 analog).

---

### IdempotencyCheck

Asserts the agent does not repeat or duplicate once-only checklist items on a
repeat tick (FR-005).

| Field | Type | Notes |
|---|---|---|
| `onceOnlyItems` | `ChecklistItem[]` | The subset of `ChecklistItem[]` where `recurrence === "once-only"`. |
| `priorActions` | `string[]` | Actions the agent took on the prior (due) tick, injected into context. |
| `observedActions` | `string[]` | Actions the agent took on the repeat tick. |
| `repeatedActions` | `string[]` | Intersection of `priorActions` and `observedActions` restricted to `onceOnlyItems`. |
| `passed` | `boolean` | `repeatedActions.length === 0`. |

**Invariants**:
- Only `once-only` items contribute to `repeatedActions` (recurring items are
  expected on every tick and must not be penalised).
- An errored run counts as a failed run (FR-008, charter testing standards).

---

### IntervalConfig

The supplied heartbeat interval configuration (FR-007).

| Field | Type | Notes |
|---|---|---|
| `intervalMinutes` | `number` | The heartbeat interval in minutes as supplied by the caller. |
| `assumed` | `boolean` | True when no config was supplied and the default was assumed. Set to `true` and recorded in the report when the config is absent (spec edge case). |

**Invariants**:
- Default value when config is absent: 30 minutes (documented OpenClaw default,
  C-002, C-003).
- Anthropic OAuth mode default: 60 minutes — must be supplied via config, never
  assumed by the adapter (C-002, RQ-04).
- The adapter never hardcodes either value in grading logic; it reads from
  `IntervalConfig.intervalMinutes` at all times.
- When `assumed === true`, the report records that the default was used (FR-007).

---

## Entity Relationships

```
HEARTBEAT.md
  └─ items: ChecklistItem[]
        │
        ├─ recurrence="once-only"  ──► IdempotencyCheck.onceOnlyItems
        └─ recurrence="recurring"  (excluded from idempotency grading)

SimulatedTick
  ├─ state="due"         ──► ActionDiff grader
  ├─ state="repeat"      ──► IdempotencyCheck grader
  ├─ state="nothing-due" ──► QuietAckCheck grader
  └─ intervalConfig      ──► IntervalConfig (all graders read it)

ActionDiff
  ├─ intendedActions  (from ChecklistItem.text, filtered by tick state)
  └─ observedActions  (from transcript + tool calls)

QuietAckCheck
  └─ ackMaxChars  (from IntervalConfig or default 300)

IdempotencyCheck
  ├─ onceOnlyItems    (from ChecklistItem[recurrence="once-only"])
  └─ priorActions     (from SimulatedTick.priorActionSummary)
```

---

## Charter Notes

- **Normative citations** (C-003): `HEARTBEAT_OK`, `ackMaxChars`, and
  empty/comment-only skip semantics are cited from OpenClaw docs pinned to a
  commit SHA.  Length advisory and all other checks cite muster's published
  rubric.
- **Interval invariant** (C-002): `IntervalConfig` is always supplied or
  defaulted with `assumed=true`; no grader contains a literal interval value.
- **Core boundary** (C-001, FR-001): no entity in this data model is imported
  by `src/core/`.  The behavioral runner and graders from `src/core/behavioral/`
  receive these entities as parameters at call sites.
- **Errored = failed** (FR-008): this invariant is enforced at the
  `RunVerdict` level in `src/core/behavioral/types.ts` and is not overridden
  by any heartbeat grader.
- **Discrimination controls** (FR-009): each grader (`ActionDiff`,
  `IdempotencyCheck`, `QuietAckCheck`) ships a rigged-impossible control case
  proving `passed` can be `false`.
