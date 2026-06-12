# Feature Specification: Schedule (HEARTBEAT.md) Conformance Adapter

**Mission**: `heartbeat-adapter-01KTYMCG` (mission_id `01KTYMCG4N3X9ASWF4RGGJTFCR`)
**Created**: 2026-06-12
**Status**: Draft
**Mission Type**: software-dev
**Milestone**: v1-extended (agent-file stack) — OpenClaw convention layer
**Input**: Add a Schedule adapter that lints `HEARTBEAT.md` and behaviorally tests heartbeat behavior on simulated ticks: the agent does what the checklist says (action-diff), does not repeat work (idempotency), and stays quiet when there is nothing to do (the documented `HEARTBEAT_OK` ack).
**Seeds**: `BRIEF.md` (schedule layer; action-diff / idempotency / quiet-when-nothing-to-do); `kitty-specs/v2-agent-stack-research-01KTYA4C/research.md` (RQ-04); the project charter.

---

## Overview

OpenClaw's `HEARTBEAT.md` is an optional checklist run on a periodic heartbeat
tick. The research (RQ-04) documented its semantics precisely from official
docs: the default heartbeat prompt is *"Read HEARTBEAT.md if it exists. Follow
it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs
attention, reply HEARTBEAT_OK."*; the interval defaults to 30 minutes (1 hour
under Anthropic OAuth — so a check must read config, never assume an interval);
a reply of `HEARTBEAT_OK` (with the rest under `ackMaxChars`, default 300)
suppresses delivery; and an empty/comment-only file skips the run entirely.

This mission adds a **Schedule adapter** behind muster's `SpecAdapter`
boundary, delivering two test classes against a `HEARTBEAT.md` file:

1. **Static lint** (offline, deterministic): structural checks per muster's
   published rubric (e.g. the docs' "keep it short to avoid token burn"
   guidance), plus the documented empty/comment-only → skip semantics.
2. **Behavioral tick probes** (stochastic, k-of-n): simulate heartbeat ticks
   and assert three documented behaviors —
   - **action-diff**: on a tick where the checklist has something to do, the
     agent takes the actions `HEARTBEAT.md` specifies and no others;
   - **idempotency**: on a repeated tick with no new state, the agent does not
     repeat or duplicate prior actions ("do not infer or repeat old tasks");
   - **quiet-when-nothing-to-do**: on a tick with nothing to attend to, the
     agent replies `HEARTBEAT_OK` within `ackMaxChars` (quiet ack).

Checks cite muster's published rubric, with the OpenClaw heartbeat docs (pinned
to a commit SHA) as supporting source — the docs are unusually precise here, so
several behavioral assertions cite the docs directly (`HEARTBEAT_OK`,
`ackMaxChars`, empty-file-skip). The interval is read from a supplied config, so
checks are interval-aware rather than assuming 30m.

## User Scenarios & Testing

### Primary User Stories

1. **Agent operator (quiet)**: As an operator, I confirm my agent stays quiet on
   heartbeat ticks when there is nothing to do — replying `HEARTBEAT_OK` rather
   than burning tokens or pestering me — before I enable scheduled heartbeats.
2. **Agent operator (action)**: As an operator, I confirm that when the heartbeat
   checklist does have something to do, the agent does exactly that and does not
   resurrect old tasks on every tick.
3. **Heartbeat author (static)**: As an author, I get a static report flagging an
   over-long or malformed `HEARTBEAT.md` and confirming the empty/comment-only
   skip semantics.

### Acceptance Scenarios

#### Static lint

1. **Given** a concise, well-formed `HEARTBEAT.md`, **When** muster lints it,
   **Then** the report says `ok: true`.
2. **Given** a `HEARTBEAT.md` that is empty or comment-only, **When** linted,
   **Then** the report records the documented "skip the run" semantics (the tick
   would not execute), citing the OpenClaw docs.
3. **Given** a `HEARTBEAT.md` exceeding the rubric's length guidance, **When**
   linted, **Then** a "token burn" advisory finding is emitted citing the rubric.

#### Behavioral tick probes

4. **Given** a `HEARTBEAT.md` checklist with a concrete due action and a
   simulated tick whose state makes the action due, **When** muster runs the tick
   N times against a BYOM endpoint, **Then** the agent's action-diff matches the
   checklist's intended action (and no extra actions) at or above the rubric
   threshold (k-of-n).
5. **Given** the same checklist and a simulated **repeat** tick with no new state
   since the prior tick, **When** graded, **Then** the agent does not repeat or
   duplicate the prior action — idempotency holds (k-of-n).
6. **Given** a tick whose state has nothing due, **When** graded, **Then** the
   agent replies `HEARTBEAT_OK` with the remainder within `ackMaxChars` (default
   300), satisfying quiet-when-nothing-to-do; the check cites the OpenClaw docs.
7. **Given** a supplied config setting the interval to the Anthropic-OAuth value
   (1h) rather than the 30m default, **When** the suite runs, **Then** any
   interval-dependent assertion uses the configured interval, not a hardcoded
   one.
8. **Given** a rigged-impossible discrimination control (a quiet-ack grader
   forced to pass a noisy non-ack, and an idempotency grader forced to pass an
   obvious repeat), **When** the suite runs, **Then** the controls fail as
   designed.
9. **Given** the same suite, **When** run against a second, differently-hosted
   OpenAI-compatible endpoint with only endpoint config changed, **Then** the
   harness runs identically.

### Edge Cases

- `HEARTBEAT_OK` present but the remainder exceeds `ackMaxChars` — the docs say
  delivery is not suppressed; the quiet check fails (the agent was not actually
  quiet).
- Agent replies `HEARTBEAT_OK` but ALSO takes an action when something WAS due —
  graded as an action-diff miss, not a quiet pass (the ack was wrong).
- Idempotency vs legitimately recurring action (a checklist item due every tick
  by design) — the manifest declares which items are once-only vs recurring;
  only once-only items drive the idempotency check.
- Interval config absent — the check defaults to the documented 30m but records
  that the default was assumed.
- Empty-file-skip vs a file with only whitespace/comments — both skip per docs;
  a file with a single real instruction does not.
- Behavioral: endpoint errors mid-suite (errored run counts as failed run);
  agent emits malformed output.

## Requirements

### Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-001 | The Schedule adapter implements muster's `SpecAdapter` contract and reuses the core pipeline, canonical-JSON, report, CTS runner, and behavioral runner/graders/client without modifying the spec-agnostic core. | Proposed |
| FR-002 | The adapter parses `HEARTBEAT.md` and a companion manifest that declares each checklist item's recurrence (once-only vs recurring) and the simulated tick states. | Proposed |
| FR-003 | The adapter performs a static lint: length/"token burn" advisory per the rubric and the documented empty/comment-only → skip semantics, citing the OpenClaw docs for the skip rule. | Proposed |
| FR-004 | The adapter provides an action-diff behavioral probe: on a tick with a due action, the agent's actions must match the checklist's intended action set (no missing, no extra) over N runs, k-of-n. | Proposed |
| FR-005 | The adapter provides an idempotency behavioral probe: on a repeat tick with no new state, once-only checklist items must not be repeated or duplicated, over N runs, k-of-n. | Proposed |
| FR-006 | The adapter provides a quiet-when-nothing-to-do probe: on a tick with nothing due, the agent must reply `HEARTBEAT_OK` with the remainder within `ackMaxChars` (default 300); the check cites the OpenClaw docs. | Proposed |
| FR-007 | Interval-dependent assertions read the interval from a supplied config (default 30m, Anthropic-OAuth 1h) rather than assuming a fixed value; the assumed default is recorded when config is absent. | Proposed |
| FR-008 | An errored run counts as a failed run everywhere (never skipped, never retried). | Proposed |
| FR-009 | Every grader (action-diff, idempotency, quiet-ack) ships a rigged-impossible discrimination control proving it can fail. | Proposed |
| FR-010 | The adapter reports findings in muster's machine-readable format; checks cite muster's published rubric, with the OpenClaw heartbeat docs (pinned commit SHA) cited directly for `HEARTBEAT_OK`, `ackMaxChars`, and empty-file-skip. | Proposed |
| FR-011 | The adapter runs from a test manifest (case id, `HEARTBEAT.md`, item recurrence labels, tick states, interval config, grading class, expectations) and produces a pass/fail summary. | Proposed |
| FR-012 | The mission ships a fixture set: heartbeat checklists, tick-state sequences (due / repeat / nothing-due), and interval configs, shaped as a candidate upstream conformance suite. | Proposed |

### Non-Functional Requirements

| ID | Requirement | Threshold | Status |
|----|-------------|-----------|--------|
| NFR-001 | The static lint path runs fully offline with byte-stable deterministic output. | Zero network calls; identical bytes across repeated runs and machines. | Proposed |
| NFR-002 | Single-`HEARTBEAT.md` static lint latency. | < 5 seconds. | Proposed |
| NFR-003 | Full static fixture suite latency. | < 10 seconds. | Proposed |
| NFR-004 | Behavioral tick suite latency against a local 7B model. | < 15 minutes. | Proposed |
| NFR-005 | Model access is bring-your-own via any OpenAI-compatible endpoint; credentials from the environment only. | No provider SDKs; no credentials in the repo. | Proposed |
| NFR-006 | Type-check and test gates. | `tsc` strict passes; full Vitest suite green incl. the heartbeat fixture suite; SonarCloud quality gate passes. | Proposed |

### Constraints

| ID | Constraint | Status |
|----|------------|--------|
| C-001 | The spec-agnostic core never learns heartbeat specifics; all schedule knowledge lives in the adapter behind the `SpecAdapter` boundary. | Proposed |
| C-002 | Behavioral assertions read the interval from supplied config; the adapter never assumes a fixed interval (research RQ-04: default differs by auth mode). | Proposed |
| C-003 | `HEARTBEAT_OK`, `ackMaxChars`, and empty-file-skip checks cite the OpenClaw heartbeat docs (pinned commit SHA); other checks cite muster's published rubric. | Proposed |
| C-004 | muster simulates ticks via scenario framing and supplied tick states; it does not run a real scheduler or wait real time (keeps the suite fast and deterministic). | Proposed |
| C-005 | The work is shaped to be upstreamable as a conformance suite for the schedule layer. | Proposed |

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | An operator can confirm the agent stays quiet (`HEARTBEAT_OK` within `ackMaxChars`) when nothing is due. |
| SC-002 | An operator can confirm the agent takes the checklist's intended action when something is due, and no extra actions. |
| SC-003 | An operator can confirm the agent does not repeat once-only tasks on repeat ticks (idempotency). |
| SC-004 | Interval-dependent checks use the configured interval, not a hardcoded default. |
| SC-005 | Every grader fails its rigged-impossible control. |
| SC-006 | The static lint produces byte-identical output across repeated runs and machines; the same behavioral suite runs unchanged against two differently-hosted endpoints. |

## Key Entities

- **HEARTBEAT.md**: an optional periodic checklist.
- **Checklist item**: an instruction with a recurrence label (once-only /
  recurring).
- **Simulated tick**: a scenario framing plus a supplied state (due / repeat /
  nothing-due).
- **Action-diff**: the comparison between the agent's actions on a tick and the
  checklist's intended action set.
- **Quiet-ack check**: asserts `HEARTBEAT_OK` within `ackMaxChars`.
- **Idempotency check**: asserts once-only items are not repeated across ticks.
- **Interval config**: supplied input (default 30m / Anthropic-OAuth 1h).

## Dependencies & Assumptions

- **Depends on**: muster v1 core (`SpecAdapter`, pipeline, canonical JSON,
  report, behavioral runner/graders/client).
- **Assumption**: ticks are simulated via scenario framing and supplied state;
  muster does not run a real scheduler or wait wall-clock time.
- **Assumption**: "action" is observed via the transcript and any tool-calls the
  endpoint emits; endpoints without tool support still allow text-action
  assertions (the manifest declares how each action is observed).
- **Out of scope**: running a real scheduler; the tools, memory, SoulSpec, A2A
  layers; cross-layer composition.

## Scope Guard (carried from BRIEF.md)

Not an agent framework or runtime; not a prompt optimizer or generator; not a
registry; not a hosted service. CLI + CI exit codes only.
