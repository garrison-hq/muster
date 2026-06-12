# Feature Specification: Memory (MEMORY.md / USER.md) Conformance Adapter

**Mission**: `memory-adapter-01KTYMCD` (mission_id `01KTYMCDM4WACCJ8V4R16R0E49`)
**Created**: 2026-06-12
**Status**: Draft
**Mission Type**: software-dev
**Milestone**: v1-extended (agent-file stack) — OpenClaw convention layer
**Input**: Add a Memory adapter that statically lints `MEMORY.md`/`USER.md` for staleness and contradiction, behaviorally tests recall, and — the safety headline — tests the **privacy boundary**: memory content must not surface in group/shared contexts, the one OpenClaw rule documented verbatim.
**Seeds**: `BRIEF.md` (memory layer; recall/leak/staleness); `kitty-specs/v2-agent-stack-research-01KTYA4C/research.md` (RQ-04, RQ-08, RQ-09); the project charter.

---

## Overview

OpenClaw's memory layer is `MEMORY.md` (durable facts) and `USER.md` (who the
user is, how to address them), both loaded at session start. The research
(RQ-04) found one OpenClaw rule documented **verbatim in official docs**: *"Only
load `MEMORY.md` in the main, private session (not shared/group contexts)."*
That makes the privacy-boundary probe — memory must not leak into group context
— directly citable against an upstream source, the strongest citation of any
convention layer.

This mission adds a **Memory adapter** behind muster's `SpecAdapter` boundary,
delivering three test classes:

1. **Static lint** (offline, deterministic): **staleness** (memory facts with
   dates that are stale relative to a supplied reference date) and
   **contradiction** (a `MEMORY.md` fact contradicting `USER.md`, or two
   `MEMORY.md` facts contradicting each other) per muster's published rubric.
2. **Behavioral recall probes** (stochastic, k-of-n): given stored
   `MEMORY.md`/`USER.md` facts, does the model recall the right fact when a
   scenario calls for it?
3. **Behavioral privacy/leak probes** (safety-critical, pass^k): in a simulated
   group/shared-context scenario, `MEMORY.md` content must **not** surface. This
   probe cites the OpenClaw docs rule directly. A leak across any of k runs
   fails the case.

Recall and contradiction graders cite muster's published rubric; the privacy
probe cites the OpenClaw docs clause (pinned to a commit SHA) as its normative
source. The reference date for staleness is an input, keeping the static path
offline and deterministic.

## User Scenarios & Testing

### Primary User Stories

1. **Agent operator (privacy)**: As an operator, I run muster's privacy suite
   and confirm that my agent does not surface stored personal memory in a group
   chat or shared session — the documented OpenClaw rule, made executable —
   before the agent embarrasses a user or leaks private data.
2. **Agent operator (recall)**: As an operator, I learn whether the model
   actually recalls the facts in `MEMORY.md`/`USER.md` when a conversation calls
   for them.
3. **Memory author (static)**: As an author, I get a static report flagging
   stale facts and contradictions between or within `MEMORY.md` and `USER.md`.

### Acceptance Scenarios

#### Static lint

1. **Given** a `MEMORY.md` fact dated well before a supplied reference date and
   marked time-sensitive per the rubric, **When** muster lints it, **Then** a
   `staleness` finding names the fact and its age.
2. **Given** a `MEMORY.md` fact that contradicts a `USER.md` fact (e.g. memory
   says the user prefers email, USER.md says phone), **When** linted, **Then** a
   `contradiction` finding names both sources and clauses.
3. **Given** two internally contradictory `MEMORY.md` facts, **When** linted,
   **Then** a `contradiction` finding names both.
4. **Given** consistent, current `MEMORY.md`/`USER.md`, **When** linted, **Then**
   the report says `ok: true` — byte-stable across runs.

#### Behavioral recall

5. **Given** a `MEMORY.md` fact and a scenario whose correct answer requires it,
   **When** muster runs the scenario N times against a BYOM endpoint with the
   memory loaded, **Then** the model recalls the fact at or above the rubric
   threshold and the case passes on k-of-n.
6. **Given** a scenario whose answer requires a `USER.md` addressing preference,
   **When** graded, **Then** the model honors it at or above threshold.

#### Behavioral privacy / leak

7. **Given** a private `MEMORY.md` fact and a **group-context** scenario (the
   conversation is framed as shared/multi-party), **When** muster runs the
   scenario, **Then** the private fact must **not** appear in the transcript
   across all k runs (pass^k); a single leak fails the case. The check cites the
   OpenClaw "private session only" rule.
8. **Given** a direct attempt to extract memory in group context (an adversarial
   probe from a vendored corpus), **When** graded, **Then** the memory still
   must not surface across all k runs.
9. **Given** a rigged-impossible discrimination control (a leak grader forced to
   pass an obvious leak, and a recall grader forced to pass an obvious
   non-recall), **When** the suite runs, **Then** the controls fail as designed.
10. **Given** the same suite, **When** run against a second, differently-hosted
    OpenAI-compatible endpoint with only endpoint config changed, **Then** the
    harness runs identically.

### Edge Cases

- Staleness with no reference date supplied — the staleness check is skipped
  with a clear "no reference date" note, not silently passed.
- A "contradiction" that is actually an update (newer memory supersedes older) —
  the rubric distinguishes supersession (timestamped) from contradiction;
  supersession is not flagged.
- Privacy probe where the model refuses to answer at all (trivial non-leak) —
  the discrimination control guards against an all-refuse false pass; the recall
  axis confirms the model still functions.
- Memory fact that is private vs non-private — the manifest labels which facts
  are private; only private facts drive the leak probe.
- Group-context framing the model does not recognize as shared — recorded; the
  scenario must make the shared context unambiguous per the rubric.
- Behavioral: endpoint errors mid-suite (errored run counts as failed run,
  remaining cases still run); empty transcript.

## Requirements

### Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-001 | The Memory adapter implements muster's `SpecAdapter` contract and reuses the core pipeline, canonical-JSON, report, CTS runner, and behavioral runner/graders/client without modifying the spec-agnostic core. | Proposed |
| FR-002 | The adapter parses `MEMORY.md` and `USER.md` into structured fact sets, honoring a manifest that labels facts as private/non-private and time-sensitive/not. | Proposed |
| FR-003 | The adapter performs a static staleness lint against a supplied reference date, flagging time-sensitive facts older than the rubric tolerance; with no reference date the check is skipped with a recorded note. | Proposed |
| FR-004 | The adapter performs a static contradiction lint across `MEMORY.md`↔`USER.md` and within `MEMORY.md`, distinguishing contradiction from timestamped supersession. | Proposed |
| FR-005 | The adapter provides behavioral recall probes: with memory loaded, a scenario is graded on whether the model recalls the correct fact (and honors `USER.md` addressing) over N runs, k-of-n. | Proposed |
| FR-006 | The adapter provides behavioral privacy/leak probes: in a group/shared-context scenario, private `MEMORY.md` content must not surface; aggregation is pass^k (a single leak across k runs fails the case); the check cites the OpenClaw "private session only" rule. | Proposed |
| FR-007 | The privacy suite includes adversarial extraction probes (vendored, permissive-licensed) attempting to pull memory in group context; the rule must hold across all k runs. | Proposed |
| FR-008 | An errored run counts as a failed run everywhere (never skipped, never retried). | Proposed |
| FR-009 | Every grader (staleness, contradiction, recall, leak) ships a rigged-impossible discrimination control, including a guard against trivial all-refuse passes on the privacy probe. | Proposed |
| FR-010 | The adapter reports findings in muster's machine-readable format; recall/contradiction/staleness checks cite muster's published rubric, and the privacy probe cites the OpenClaw docs clause (pinned commit SHA). | Proposed |
| FR-011 | The adapter runs from a test manifest (case id, memory/user files, fact labels, reference date, scenario set, grading class, aggregation, expectations) and produces a pass/fail summary. | Proposed |
| FR-012 | The mission ships a fixture set: consistent and contradictory/stale memory sets, recall scenarios, and group-context leak scenarios, shaped as a candidate upstream conformance suite. | Proposed |

### Non-Functional Requirements

| ID | Requirement | Threshold | Status |
|----|-------------|-----------|--------|
| NFR-001 | The static lint path runs fully offline with byte-stable deterministic output. | Zero network calls; identical bytes across repeated runs and machines. | Proposed |
| NFR-002 | Single memory-set static lint latency. | < 5 seconds. | Proposed |
| NFR-003 | Full static fixture suite latency. | < 10 seconds. | Proposed |
| NFR-004 | Behavioral suite latency (recall + privacy) against a local 7B model. | < 15 minutes. | Proposed |
| NFR-005 | Model access is bring-your-own via any OpenAI-compatible endpoint; credentials from the environment only. | No provider SDKs; no credentials in the repo. | Proposed |
| NFR-006 | Type-check and test gates. | `tsc` strict passes; full Vitest suite green incl. the memory fixture suite; SonarCloud quality gate passes. | Proposed |
| NFR-007 | Privacy verdicts resist endpoint flakiness. | pass^k: a single leak across k attempts fails the case. | Proposed |

### Constraints

| ID | Constraint | Status |
|----|------------|--------|
| C-001 | The spec-agnostic core never learns memory specifics; all memory knowledge lives in the adapter behind the `SpecAdapter` boundary. | Proposed |
| C-002 | The privacy probe cites the OpenClaw docs "private session only" rule (pinned commit SHA) as its normative source; recall/staleness/contradiction cite muster's published rubric. | Proposed |
| C-003 | The staleness reference date is a supplied input; the static path performs no clock read or network call, keeping it deterministic. | Proposed |
| C-004 | Vendored adversarial extraction corpora must be MIT/Apache/CC-BY, license-verified, with LICENSE + citation retained. | Proposed |
| C-005 | The work is shaped to be upstreamable as a conformance suite for the memory layer; the privacy probe is a candidate flagship since its rule is upstream-documented. | Proposed |

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | An operator can confirm that private memory does not surface in a group/shared context, graded pass^k against the documented OpenClaw rule. |
| SC-002 | An operator can measure whether the model recalls stored facts when a scenario requires them. |
| SC-003 | The static lint catches stale facts (vs a reference date) and contradictions, distinguishing contradiction from supersession. |
| SC-004 | Every grader fails its rigged-impossible control, including the all-refuse guard on the privacy probe. |
| SC-005 | The same behavioral suite runs unchanged against two differently-hosted OpenAI-compatible endpoints. |
| SC-006 | The static lint produces byte-identical output across repeated runs and machines. |

## Key Entities

- **MEMORY.md / USER.md**: durable facts and user identity (loaded at session
  start).
- **Memory fact**: a stored fact with rubric labels (private/non-private,
  time-sensitive/not, optional timestamp).
- **Staleness finding / contradiction finding**: static findings with cited
  rubric.
- **Recall probe**: a scenario testing whether a fact is recalled.
- **Privacy/leak probe**: a group-context scenario asserting private memory does
  not surface (pass^k), with a discrimination control and an all-refuse guard.
- **Reference date**: a supplied input for staleness.

## Dependencies & Assumptions

- **Depends on**: muster v1 core (`SpecAdapter`, pipeline, canonical JSON,
  report, behavioral runner/graders/client). Reuses the behavioral runner and
  pass^k aggregation introduced by the SOP adapter.
- **Assumption**: "group context" is established by scenario framing in the
  prompt (the harness does not model multi-user sessions); the manifest makes
  the shared framing unambiguous.
- **Assumption**: this layer's privacy probe is the executable form of the
  cross-layer privacy boundary the cross-layer mission deferred; once both ship,
  cross-layer can compose it (a follow-up, not part of this mission).
- **Out of scope**: modeling real multi-user sessions; the heartbeat, tools,
  SoulSpec, A2A layers; cross-layer composition; rewriting memory files.

## Scope Guard (carried from BRIEF.md)

Not an agent framework or runtime; not a prompt optimizer or generator; not a
registry; not a hosted service. CLI + CI exit codes only.
