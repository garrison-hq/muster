# Feature Specification: Tools (TOOLS.md) Conformance Adapter + Drift Checks

**Mission**: `tools-adapter-01KTYMCB` (mission_id `01KTYMCB7SJAC3G323W1Z673RQ`)
**Created**: 2026-06-12
**Status**: Draft
**Mission Type**: software-dev
**Milestone**: v1-extended (agent-file stack) — OpenClaw convention layer; **introduces the drift test class**
**Input**: Add a Tools adapter that lints a `TOOLS.md` file and, the headline of this mission, performs **drift checks** comparing the documented tools against the live environment (the tool registry / MCP manifest the agent actually has), plus behavioral tool-selection probes.
**Seeds**: `BRIEF.md` (tools layer; "drift checks" as the third test class); `kitty-specs/v2-agent-stack-research-01KTYA4C/research.md` (RQ-04, RQ-06); the project charter.

---

## Overview

`TOOLS.md` (OpenClaw convention) documents the tools and conventions available
to an agent. The research confirmed (RQ-04) that OpenClaw's `TOOLS.md` is
**guidance-only** — official docs state it "does not control tool
availability". That makes it the natural home for the **drift test class**, the
one class muster's v1 did not have: *file vs. reality*. Does every tool the file
documents actually exist in the agent's live environment? Do the schemas match?
Is anything present in the environment but undocumented?

This mission adds a **Tools adapter** behind muster's `SpecAdapter` boundary,
delivering three test classes against a `TOOLS.md` file:

1. **Static lint** (offline, deterministic): structural/presence checks on
   `TOOLS.md` per muster's published rubric (OpenClaw is convention-only).
2. **Drift checks** (NEW class — file vs. live environment): compare each
   documented tool against a supplied environment descriptor (an MCP server
   manifest or an OpenAI-compatible tool/function registry) and report
   `documented-but-missing`, `present-but-undocumented`, and `schema-mismatch`
   findings. The environment descriptor is an input, so the drift check is
   reproducible and does not itself require a live network call.
3. **Behavioral tool-selection probes** (stochastic, k-of-n): given the
   documented tools registered as invocables, does the model select the correct
   tool for a task scenario and abstain when no tool applies?

Because `TOOLS.md` has no normative spec, drift and static checks cite muster's
published rubric (with OpenClaw docs, pinned to a commit SHA, as supporting
source). The drift check's comparison contract (what "match" means between a
documented tool and an environment descriptor entry) is itself a muster-published
rubric.

## User Scenarios & Testing

### Primary User Stories

1. **Agent operator (drift)**: As an operator, I run muster against my `TOOLS.md`
   and my agent's actual tool manifest and learn whether the documentation has
   drifted from reality — tools I describe that no longer exist, tools present
   that I never documented, or schemas that no longer match — before a user hits
   a tool the agent cannot actually call.
2. **Tool author (selection)**: As an author, I learn whether a model, given my
   documented tools, picks the right one for a task and abstains when none fits.
3. **SOP/stack author (static)**: As an author, I get a static report flagging
   structural problems in `TOOLS.md` per the published rubric.

### Acceptance Scenarios

#### Static lint

1. **Given** a well-formed `TOOLS.md`, **When** muster lints it, **Then** the
   report says `ok: true` with zero structural errors.
2. **Given** a malformed `TOOLS.md` (missing a required section per the rubric),
   **When** linted, **Then** the violation is reported citing the muster rubric.

#### Drift checks

3. **Given** a `TOOLS.md` documenting a tool `send_email` and an environment
   descriptor that does not contain it, **When** muster runs the drift check,
   **Then** a `documented-but-missing` finding names `send_email`.
4. **Given** an environment descriptor containing a tool `delete_file` that
   `TOOLS.md` does not mention, **When** checked, **Then** a
   `present-but-undocumented` finding names `delete_file`.
5. **Given** a tool documented with a parameter the environment descriptor's
   schema does not declare (or a type mismatch), **When** checked, **Then** a
   `schema-mismatch` finding names the tool and the differing field.
6. **Given** a `TOOLS.md` whose documented tools exactly match the environment
   descriptor, **When** checked, **Then** the drift report is clean — byte-stable
   across runs.

#### Behavioral tool-selection probes

7. **Given** documented tools registered as invocables and a task scenario whose
   correct tool is unambiguous, **When** muster runs the scenario N times against
   a BYOM endpoint, **Then** the model selects the correct tool at or above the
   rubric threshold and the case passes on k-of-n.
8. **Given** a scenario for which no documented tool applies, **When** graded,
   **Then** the model must abstain (select no tool) at or above the rubric
   threshold — the abstention axis.
9. **Given** a rigged-impossible discrimination control (a tool-selection grader
   forced to pass an obviously-wrong selection), **When** the suite runs, **Then**
   the control fails as designed.

### Edge Cases

- `TOOLS.md` documents a tool with the same name as an environment tool but a
  different description (semantic drift) — reported as `schema-mismatch` only if
  the structured schema differs; pure prose differences are a lower-severity
  finding per the rubric.
- Environment descriptor format the adapter does not recognize (neither MCP
  manifest nor OpenAI tool registry) — the drift check errors clearly rather
  than silently passing.
- A documented tool whose parameters are a superset of the environment's
  (documentation ahead of reality) vs subset (reality ahead of docs) — both are
  `schema-mismatch`, with direction recorded.
- Behavioral: endpoint without tool-calling support (cases error and fail);
  model selects a tool not in the registered set (counts as a wrong selection).
- Two documented tools with the same name (duplicate) — static error.

## Requirements

### Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-001 | The Tools adapter implements muster's `SpecAdapter` contract and reuses the core pipeline, canonical-JSON, report, CTS runner, and behavioral runner without modifying the spec-agnostic core. | Proposed |
| FR-002 | The adapter parses a `TOOLS.md` file into a structured set of documented tool descriptors (name, description, parameters). | Proposed |
| FR-003 | The adapter performs a static lint of `TOOLS.md` structure per muster's published rubric, citing the rubric (with OpenClaw docs as supporting source). | Proposed |
| FR-004 | The adapter performs drift checks against a supplied environment descriptor (MCP server manifest or OpenAI-compatible tool/function registry), emitting `documented-but-missing`, `present-but-undocumented`, and `schema-mismatch` findings per a published match-rubric. | Proposed |
| FR-005 | The drift check takes the environment descriptor as an input artifact so it is reproducible and the static/drift path performs no live network call. | Proposed |
| FR-006 | The adapter provides behavioral tool-selection probes: documented tools are registered as invocables to a BYOM endpoint, and a task scenario is graded on whether the model selects the correct tool and abstains when none applies, over N runs. | Proposed |
| FR-007 | Tool-selection aggregation uses k-of-n over N runs with both a correct-selection axis and an abstention axis; an errored run counts as a failed run. | Proposed |
| FR-008 | Every grader (drift and selection) ships a rigged-impossible discrimination control proving it can fail. | Proposed |
| FR-009 | The adapter reports findings in muster's machine-readable format; every check cites a muster-published rubric (with OpenClaw docs, pinned to a commit SHA, as supporting source). | Proposed |
| FR-010 | The adapter runs from a test manifest (case id, `TOOLS.md`, environment descriptor, scenario set, expectations) and produces a pass/fail summary. | Proposed |
| FR-011 | The mission ships a fixture set: `TOOLS.md` files, matching and drifted environment descriptors, and tool-selection scenarios, shaped as a candidate upstream conformance suite. | Proposed |

### Non-Functional Requirements

| ID | Requirement | Threshold | Status |
|----|-------------|-----------|--------|
| NFR-001 | The static + drift paths run fully offline with byte-stable deterministic output. | Zero network calls; identical bytes across repeated runs and machines. | Proposed |
| NFR-002 | Single-`TOOLS.md` static + drift check latency. | < 5 seconds. | Proposed |
| NFR-003 | Full static/drift fixture suite latency. | < 10 seconds. | Proposed |
| NFR-004 | Behavioral tool-selection suite latency against a local 7B model. | < 15 minutes. | Proposed |
| NFR-005 | Model access is bring-your-own via any OpenAI-compatible endpoint; credentials from the environment only. | No provider SDKs; no credentials in the repo. | Proposed |
| NFR-006 | Type-check and test gates. | `tsc` strict passes; full Vitest suite green incl. the tools fixture suite; SonarCloud quality gate passes. | Proposed |

### Constraints

| ID | Constraint | Status |
|----|------------|--------|
| C-001 | The spec-agnostic core never learns tool specifics; all tool knowledge lives in the adapter behind the `SpecAdapter` boundary. | Proposed |
| C-002 | `TOOLS.md` is guidance-only and convention-only; checks cite muster's published rubric as the normative source, with OpenClaw docs (pinned commit SHA) as supporting source. | Proposed |
| C-003 | The drift check compares against a supplied descriptor artifact; muster does not itself connect to a live MCP server or tool endpoint to gather the environment (keeps the path offline and reproducible). | Proposed |
| C-004 | The drift test class introduced here is reusable by other adapters (e.g. skills bundled-file existence) but its tool-specific match-rubric stays in this adapter. | Proposed |
| C-005 | The work is shaped to be upstreamable as a conformance suite for the tools layer. | Proposed |

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | An operator can detect drift between documented tools and the live environment, classified as missing / undocumented / schema-mismatch. |
| SC-002 | The drift check is reproducible: the same `TOOLS.md` + environment descriptor produces byte-identical findings across runs and machines. |
| SC-003 | An author can measure whether a model selects the correct documented tool and abstains when none applies. |
| SC-004 | Every grader fails its rigged-impossible control. |
| SC-005 | The same behavioral suite runs unchanged against two differently-hosted OpenAI-compatible endpoints. |

## Key Entities

- **TOOLS.md**: documents available tools/conventions (guidance-only).
- **Tool descriptor**: name, description, parameters (from `TOOLS.md`).
- **Environment descriptor**: the live tool manifest (MCP manifest or
  OpenAI-compatible tool/function registry), supplied as an input artifact.
- **Drift finding**: `documented-but-missing`, `present-but-undocumented`, or
  `schema-mismatch`, with direction and cited rubric.
- **Tool-selection case / verdict**: a scenario graded on correct-selection and
  abstention axes over N runs, with a discrimination control.

## Dependencies & Assumptions

- **Depends on**: muster v1 core (`SpecAdapter`, pipeline, canonical JSON,
  report, behavioral runner/graders/client).
- **Assumption**: the environment descriptor is supplied as a file (MCP manifest
  export or tool-registry JSON); muster does not crawl a live server, keeping the
  drift path offline and deterministic.
- **Assumption**: tool-selection observation maps onto OpenAI-compatible
  function calling; endpoints without it cause those cases to error (fail).
- **Out of scope**: executing tools; connecting to live MCP servers; the
  memory, heartbeat, SoulSpec, and A2A layers; cross-layer composition.

## Scope Guard (carried from BRIEF.md)

Not an agent framework or runtime; not a prompt optimizer or generator; not a
registry; not a hosted service. CLI + CI exit codes only.
