# Tasks: A2A Behavioral Conformance

**Mission:** `a2a-behavioral-conformance-01KVJDWE`
**Planning branch:** `kitty/mission-a2a-behavioral-conformance` · **Merge target:** `main` (via PR)
**Spec:** `kitty-specs/a2a-behavioral-conformance-01KVJDWE/spec.md` ·
**Plan:** `.../plan.md` · **Contracts:** `.../contracts/`

4 work packages, 25 subtasks. WP01 and WP02 are independent (parallel lanes). WP03 depends
on both; WP04 depends on WP02+WP03.

## Dependency graph

```
WP01 (transport) ─┐
                  ├─► WP03 (runner) ─► WP04 (CLI + docs + examples)
WP02 (manifest) ──┘                        ▲
                  └────────────────────────┘
```

## Subtask Index

| ID | Description | WP | Parallel |
|----|-------------|----|----------|
| T001 | A2A `Message`/`Part` request builder (role:user, text part, messageId) | WP01 | [P] | [D] |
| T002 | Conversation handle: thread `contextId`/`taskId` across turns | WP01 |  | [D] |
| T003 | `sendMessage(endpoint, turn, handle, opts)` — fetch, bearer auth, timeout | WP01 |  | [D] |
| T004 | Reply extraction tolerant of Message and Task response shapes (Q1) | WP01 |  | [D] |
| T005 | Error/timeout/non-2xx/JSON-RPC-error → errored result; never log token | WP01 |  | [D] |
| T006 | Unit tests: request shape, threading, extraction (both shapes), errors | WP01 |  | [D] |
| T007 | A2A behavioral types in `behavioral-types.ts` | WP02 | [D] |
| T008 | Top-level + `endpoint` (env-name) strict validation | WP02 |  | [D] |
| T009 | Case validation reusing core Turn/AxisSpec/ContentAssertion/CaseOverrides | WP02 |  | [D] |
| T010 | Decision-C threshold resolution (soul EffectiveConfig + explicit + override precedence) | WP02 |  | [D] |
| T011 | Strict unknown-field rejection + all load-time error cases | WP02 |  | [D] |
| T012 | Unit tests: valid (persona/explicit/both) + each error case | WP02 |  | [D] |
| T013 | Per-case turn walk driving WP01 `sendMessage` with the handle | WP03 |  |
| T014 | Build `TranscriptEntry[]` (user turns only; replies; wordCount; expected activeState) | WP03 |  |
| T015 | Expected-state tracking from facts/triggers (black-box; never sent to agent) | WP03 |  |
| T016 | Resolve thresholds via decision C → ThresholdMapping for graders | WP03 |  |
| T017 | Call core gradeVerbosity/gradeRefusal/gradeStateShift → AxisGrade[] per run | WP03 |  |
| T018 | Aggregate runs (errored→false, conjunctivePassK, passCount≥pass_threshold) → CaseVerdict | WP03 |  |
| T019 | Unit tests with fixture transcripts (pass/verbosity-fail/refusal-fail/state-shift/all-errored) | WP03 |  |
| T020 | Route by manifest `kind: behavioral` in adapter `runManifest` (no edit to existing loader) | WP04 |  |
| T021 | Map behavioral `CaseVerdict[]` into the `a2a run` summary + exit codes 0/1/2 | WP04 |  |
| T022 | Human + `--json` formatting for behavioral cases (axis/turn measured-vs-limit) | WP04 |  |
| T023 | Two example manifests (persona-referenced + explicit-threshold) | WP04 | [P] |
| T024 | Docs: layers table + CLI reference; each new check cites its spec section | WP04 | [P] |
| T025 | CLI smoke/integration test (skip when no endpoint) + verify no regression | WP04 |  |

---

## WP01 — Multi-turn A2A transport (B1)

**Prompt:** `tasks/WP01-multiturn-transport.md` · **Priority:** P1 (foundation) ·
**Dependencies:** none · **Est:** ~6 subtasks, ~350 lines.

**Goal:** Extend `src/adapters/a2a/transport.ts` with a conformant multi-turn `message/send`
(structured `Message`, `contextId`/`taskId` threading) and a response-shape-tolerant reply
extractor — **additively**, leaving the existing single-turn `{skill, message}` probe untouched.

**Independent test:** with fixture request/response payloads, the builder emits the spec
`Message` shape, threading carries `contextId`/`taskId` to turn 2, and extraction yields the
reply text from both a Message result and a Task result; error/timeout produce an errored result.

- [x] T001 A2A `Message`/`Part` request builder (WP01)
- [x] T002 Conversation handle: thread `contextId`/`taskId` across turns (WP01)
- [x] T003 `sendMessage(endpoint, turn, handle, opts)` — fetch, bearer auth, timeout (WP01)
- [x] T004 Reply extraction tolerant of Message and Task response shapes (WP01)
- [x] T005 Error/timeout/non-2xx/JSON-RPC-error → errored result; never log token (WP01)
- [x] T006 Unit tests: request shape, threading, extraction (both shapes), errors (WP01)

**Dependencies/risks:** the `message/send` response shape is an external (hey-anton) unknown
(Q1) — extractor must tolerate both shapes. No new `fetch` site (extend the allow-listed file).

---

## WP02 — A2A behavioral manifest schema + loader (B3)

**Prompt:** `tasks/WP02-behavioral-manifest.md` · **Priority:** P1 (foundation) ·
**Dependencies:** none (parallel with WP01) · **Est:** ~6 subtasks, ~400 lines.

**Goal:** New `behavioral-manifest.ts` + `behavioral-types.ts` that strict-validate an A2A
behavioral manifest, **reusing the core behavioral validators** by import, and implementing the
decision-C threshold source (optional `soul` reference and/or explicit thresholds; explicit
overrides persona-derived). Per `contracts/a2a-behavioral-manifest.md`.

**Independent test:** valid persona/explicit/both manifests load; every error case
(unknown field, literal token, `pass_threshold > runs`, empty turns/axes, out-of-range turn
ref, duplicate id, missing-threshold-when-needed) is rejected with a clear message.

- [x] T007 A2A behavioral types in `behavioral-types.ts` (WP02)
- [x] T008 Top-level + `endpoint` (env-name) strict validation (WP02)
- [x] T009 Case validation reusing core Turn/AxisSpec/ContentAssertion/CaseOverrides (WP02)
- [x] T010 Decision-C threshold resolution (soul EffectiveConfig + explicit + precedence) (WP02)
- [x] T011 Strict unknown-field rejection + all load-time error cases (WP02)
- [x] T012 Unit tests: valid (persona/explicit/both) + each error case (WP02)

**Dependencies/risks:** must keep the C-004 boundary (import core validators; never edit core).
Do **not** modify the existing `src/adapters/a2a/types.ts` static loader (owned elsewhere).

---

## WP03 — A2A behavioral runner + black-box state (B2 + B4)

**Prompt:** `tasks/WP03-behavioral-runner.md` · **Priority:** P1 (core) ·
**Dependencies:** WP01, WP02 · **Est:** ~7 subtasks, ~450 lines.

**Goal:** New `src/adapters/a2a/graders/behavioral.ts` — the adapter-side runner that, per
case, walks turns over A2A (WP01), builds a `TranscriptEntry[]` sending **only user turns**
(no persona/system prompt), grades it with the **core** axis graders, and scores k-of-n via
`conjunctivePassK`. State-shift is graded **black-box** (B4): muster tracks the *expected*
state locally and never tells the agent.

**Independent test:** fixture transcripts produce the right `CaseVerdict` for pass,
verbosity-fail, refusal-fail, state-shift, and all-errored; grading reuses core graders
(no axis logic re-implemented); deterministic for a fixed transcript.

- [ ] T013 Per-case turn walk driving WP01 `sendMessage` with the handle (WP03)
- [ ] T014 Build `TranscriptEntry[]` (user turns only; replies; wordCount; expected activeState) (WP03)
- [ ] T015 Expected-state tracking from facts/triggers (black-box) (WP03)
- [ ] T016 Resolve thresholds via decision C → ThresholdMapping for graders (WP03)
- [ ] T017 Call core gradeVerbosity/gradeRefusal/gradeStateShift → AxisGrade[] per run (WP03)
- [ ] T018 Aggregate runs → CaseVerdict (errored→false; conjunctivePassK; passCount≥threshold) (WP03)
- [ ] T019 Unit tests with fixture transcripts (WP03)

**Dependencies/risks:** must NOT reuse `core/behavioral/runner.runCase` (it injects a persona
prompt — forbidden by black-box). Import the *graders* and *pass-k*, not the runner.

---

## WP04 — CLI surfacing + examples + docs (B5)

**Prompt:** `tasks/WP04-cli-examples-docs.md` · **Priority:** P2 (surface) ·
**Dependencies:** WP02, WP03 · **Est:** ~6 subtasks, ~400 lines.

**Goal:** Surface behavioral cases through `muster a2a run`: route by manifest `kind`, map
`CaseVerdict[]` to the existing exit contract (0/1/2) and output formatting, ship two runnable
example manifests, and write docs with spec citations. Preserve the skip-when-absent and
no-regression guarantees. Per `contracts/cli-contract.md`.

**Independent test:** `muster a2a run <behavioral manifest>` skips with no endpoint (exit 0),
fails a deliberately-bad case (exit 1), exits 2 when all runs error; existing static/skill/
auth/signed manifests behave identically (no regression).

- [ ] T020 Route by manifest `kind: behavioral` in adapter `runManifest` (WP04)
- [ ] T021 Map behavioral `CaseVerdict[]` into the `a2a run` summary + exit codes 0/1/2 (WP04)
- [ ] T022 Human + `--json` formatting for behavioral cases (WP04)
- [ ] T023 Two example manifests (persona-referenced + explicit-threshold) (WP04)
- [ ] T024 Docs: layers table + CLI reference; cite spec sections (WP04)
- [ ] T025 CLI smoke/integration test (skip when no endpoint) + verify no regression (WP04)

**Dependencies/risks:** touches shared CLI files (`src/cli/index.ts`, `src/cli/output.ts`) —
keep edits additive and behind the behavioral path; do not change static-path output.

---

## MVP scope

WP01 + WP02 + WP03 deliver the gradable capability (a behavioral case can be run and scored
programmatically). WP04 makes it usable from the CLI and shippable. Recommended MVP: **WP01–WP03**.

## Parallelization

- **Lane A:** WP01 → WP03 → WP04
- **Lane B:** WP02 ──┘ (joins at WP03)

WP01 and WP02 run concurrently. WP04 is the single integration point and runs last.
