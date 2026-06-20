# Specification: A2A Behavioral Conformance

**Mission:** `a2a-behavioral-conformance-01KVJDWE`
**Type:** software-dev
**Status:** Draft
**Source briefing:** `briefings/a2a-behavioral-conformance.md`
**Companion (out of scope):** `briefings/muster-github-action.md`

## Summary

Today muster can grade a `Soul.md` **persona** by sending its declared voice/safety/state
to a direct chat endpoint and scoring replies k-of-n on three axes (verbosity, refusal,
state_shift). It cannot grade the thing a customer actually talks to: an **assembled,
running agent** (router → input redaction → language detection → grounding → disclosure →
escalation) reached over the wire.

This feature lets muster drive an external running agent over **A2A JSON-RPC**, conduct a
**multi-turn** conversation, and grade the agent's observed behavior on the same three
axes k-of-n — reusing muster's existing core axis graders and pass^k scoring rather than
re-implementing them. It is surfaced through the existing `muster a2a run` command and is
gated by the same endpoint/token environment contract the A2A adapter already uses.

## Goals

- Make the **running agent** (not just its persona prompt) conformance-testable over A2A.
- Reuse the proven verbosity/refusal/state_shift grading and k-of-n scoring unchanged.
- Keep the result usable as a CI gate (deterministic exit-code contract; safe on fork PRs
  and when no endpoint is configured).

## Non-Goals (Out of Scope)

- The reusable GitHub Action that wraps this capability (`briefings/muster-github-action.md`
  — a separate, downstream mission).
- Standing up the external agent's A2A server. That surface is a **hey-anton dependency**
  (Agent Card discovery, JSON-RPC `message/send` with multi-turn history, a bearer scheme,
  conversation threading). This mission consumes that surface; it does not build it.
- Changing the existing static card-lint, single-turn skill-probe, auth-negative, or
  signed-card behavior.
- Adding a state-hint injection path. The state-shift axis is graded **black-box** (see
  Assumptions).

## Actors

- **Conformance author** — writes an A2A behavioral manifest (multi-turn cases + axis
  expectations) and runs `muster a2a run` against a live endpoint.
- **CI workflow** — boots the external agent, waits for readiness, runs the behavioral
  cases, and gates on the exit code.
- **External running agent** — the assembled agent under test, reached over A2A; a
  black-box that receives turns and returns replies.

## User Scenarios & Testing

### Scenario 1 — Grade a running agent multi-turn (primary)

A conformance author defines a manifest with one or more multi-turn behavioral cases (an
ordered list of user turns, plus per-axis expectations and a k-of-n run policy). With the
endpoint and token configured, they run `muster a2a run <manifest>`. muster walks each
case turn by turn over A2A, collects the agent's replies into a transcript, grades that
transcript on the configured axes k-of-n, and reports pass/fail per case. Exit code is 0
when all cases pass.

### Scenario 2 — Behavioral failure is reported, not hidden

An agent that is too verbose (or fails to refuse, or does not tighten after a state shift)
on more than the allowed number of runs causes its case to **fail**. muster reports which
axis failed with measured-vs-expected detail, and the command exits non-zero so a CI gate
blocks.

### Scenario 3 — No endpoint configured → skip (safe default)

When the endpoint environment variable is absent (e.g. a fork PR with no secrets), the
behavioral run is **skipped**, not failed — preserving the adapter's existing skip
semantics so CI stays green where it cannot run.

### Scenario 4 — Endpoint unreachable / errored → fail

When the endpoint is configured but unreachable or every run errors, the run **fails**
(exit code reserved for "all runs errored"), distinguishing an infrastructure failure from
a conformance failure.

### Scenario 5 — Existing A2A paths unaffected

Running the existing static card-lint, single-turn skill-probe, auth-negative, and
signed-card checks produces identical results to before this feature.

### Edge cases

- A case with a single turn behaves as a degenerate multi-turn case (no regression for
  single-turn intent).
- An agent reply that is empty or malformed is treated as a failing run for that case, not
  a crash.
- A manifest with an unknown/extra field is rejected at load time (strict validation), with
  a clear error — no silent acceptance.
- A token configured but rejected by the agent surfaces as an auth failure, not a hang.
- State shift cannot be demonstrated by the agent from the conversation alone → the case
  is gradable only on what is observable; the manifest author is responsible for
  constructing turns that elicit an observable shift (black-box decision).

## Requirements

### Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-001 | The system MUST conduct a multi-turn A2A conversation for a behavioral case, sending each user turn with the accumulated conversation history and collecting the agent's reply per turn into a transcript. | Proposed |
| FR-002 | The system MUST grade a collected transcript on the verbosity, refusal, and state_shift axes using the existing core grading behavior, with no axis logic re-implemented for A2A. | Proposed |
| FR-003 | The system MUST score each case k-of-n (a configurable number of runs and a pass threshold) using the existing pass^k behavior. | Proposed |
| FR-004 | The system MUST accept an A2A behavioral manifest describing, per case: the ordered user turns, optional state facts, the per-axis expectations, and the run/threshold policy. | Proposed |
| FR-005 | The system MUST strictly validate the A2A behavioral manifest, rejecting unknown or malformed fields with a clear error and never accepting a literal key/token value as a manifest field (only environment-variable references). | Proposed |
| FR-006 | The system MUST surface behavioral A2A cases through the existing `muster a2a run` command, activated by the existing endpoint/token environment contract. | Proposed |
| FR-007 | The system MUST report, for each case, pass/fail and — on failure — which axis failed with measured-vs-expected detail. | Proposed |
| FR-008 | The system MUST exit 0 when all cases pass, 1 when at least one case fails, and reserve a distinct non-zero code for the case where every run errored — matching the existing behavioral-run exit contract. | Proposed |
| FR-009 | When the endpoint environment variable is absent, the system MUST skip the behavioral run rather than fail it. | Proposed |
| FR-010 | When the endpoint is configured but unreachable or every run errors, the system MUST fail the run. | Proposed |
| FR-011 | The system MUST grade the state_shift axis from the agent's observable post-shift behavior only, without informing the agent of its state (black-box). | Proposed |
| FR-012 | The system MUST allow case selection / run-count configuration so a workflow can run a lighter subset (or fewer runs) on pull requests and the full set on the main branch, without code changes. | Proposed |
| FR-013 | The system MUST ship a runnable example A2A behavioral case and documentation (layers table + CLI reference), with every new check citing its governing spec section. | Proposed |

### Non-Functional Requirements

| ID | Requirement | Threshold / Measure | Status |
|----|-------------|---------------------|--------|
| NFR-001 | Grading of a fixed transcript MUST be deterministic. | Identical transcript + manifest ⇒ identical verdict across 100/100 repeated runs. | Proposed |
| NFR-002 | The token MUST be read at call time and never stored or written to any output or log. | 0 occurrences of the token value in stdout, stderr, files, or process state across the test suite; the repository key-invariant test passes. | Proposed |
| NFR-003 | The feature MUST NOT regress existing A2A paths. | 100% of existing A2A static-card-lint / single-turn-probe / auth-negative / signed-card tests still pass unchanged. | Proposed |
| NFR-004 | A new check MUST be traceable to a governing spec section. | 100% of new checks carry a spec-section citation (A2A spec and/or the axis FRs). | Proposed |
| NFR-005 | The feature MUST add no new runtime model/provider dependency and no new heavyweight dependency. | 0 new baked-in providers; new third-party runtime dependencies = 0 (reuse existing transport + core). | Proposed |

### Constraints

| ID | Constraint | Status |
|----|------------|--------|
| C-001 | The conformance core MUST remain spec-agnostic: no core source file may import the A2A adapter (the C-001/C-004 core→adapter boundary; the NI-003 invariant guard must still pass). | Accepted |
| C-002 | The new behavioral-over-A2A logic MUST live in the A2A adapter and import the core graders — never the reverse. | Accepted |
| C-003 | No model provider may be baked in; endpoints are configured at run time and tokens live only in environment/CI secrets, never in the repository. | Accepted |
| C-004 | Multi-turn messages MUST be sent per the A2A `message/send` shape (history carried across turns). | Accepted |
| C-005 | All changes land on `main` via a pull request that passes the build+test and SonarCloud gates (per the project charter Branch Strategy). | Accepted |

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | A conformance author can grade a real running agent across a multi-turn conversation and get a per-axis, per-case k-of-n verdict in a single command. |
| SC-002 | A behavioral regression in the running agent (over-verbose, fails to refuse, fails to tighten after a shift) is caught and blocks a CI gate; a passing agent does not. |
| SC-003 | The same run is safe to wire into CI: it skips cleanly with no endpoint configured and fails clearly when the configured endpoint is unreachable. |
| SC-004 | No credential value ever appears in any output, file, or the repository. |
| SC-005 | All previously passing A2A and core conformance behavior is unchanged. |
| SC-006 | A new contributor can copy the shipped example and documentation to author their own A2A behavioral case without reading the source. |

## Key Entities

- **A2A behavioral case** — a named multi-turn scenario: an ordered list of user turns,
  optional state facts, per-axis expectations, and a k-of-n run policy.
- **Turn** — a single user message in a case; the agent's reply to it becomes one
  transcript entry.
- **Transcript** — the ordered sequence of (user turn, agent reply) entries produced for
  one run of a case; the unit the axis graders consume.
- **Axis expectation** — the verbosity / refusal / state_shift expectation for a case (the
  same discriminated shape the existing behavioral manifest validates).
- **Run policy** — the number of runs and the pass threshold (k-of-n) for a case.
- **Endpoint/token contract** — the environment references that activate the run; values
  are never stored in the manifest.

## Dependencies

- **hey-anton A2A surface (external, blocking for live runs):** Agent Card at a
  well-known path, JSON-RPC `message/send` supporting multi-turn history, a bearer auth
  scheme, and conversation threading. This mission's static and unit behavior does not
  depend on it; only live grading does.
- **CI execution model (boot-in-CI):** the conformance workflow boots the agent with the
  model key, waits for the Agent Card to be ready, runs the behavioral cases, and tears
  down. The readiness wait and the fork-PR/missing-secret guard live in the workflow, not
  in muster (muster only skips when the endpoint is absent and fails when it is unreachable).

## Assumptions

- **State-shift is graded black-box (B4 = option b, confirmed):** muster does not inject a
  state hint; the state_shift axis is judged purely from observable post-shift behavior.
  Manifest authors construct turns that elicit an observable shift.
- The existing core axis graders and pass^k operate on a transcript independent of how it
  was produced, and are reusable unchanged.
- The existing `muster a2a run` env-activated switch is the correct surface; no new
  top-level command is needed.
- Live behavioral runs incur model cost and some non-determinism; the workflow — not this
  spec — decides when to run them (static every PR; behavioral on main/nightly), enabled by
  FR-012.

## Open Questions / Risks

- **Manifest reuse boundary:** how much of the existing behavioral manifest validators can
  be reused for A2A cases versus needing an A2A-specific wrapper — resolved during planning,
  not a scope question.
- **Conversation threading contract:** the exact A2A multi-turn `message/send` history shape
  depends on the hey-anton surface; the example/manifest must track whatever that surface
  finalizes. Risk if the external surface changes shape late.
- **Black-box gradability of state shift:** some shifts may not be observable from the
  conversation alone; mitigated by making case authorship responsible for eliciting an
  observable signal, documented in the example.
