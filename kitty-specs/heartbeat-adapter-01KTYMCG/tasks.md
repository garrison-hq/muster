# Tasks: Schedule (HEARTBEAT.md) Conformance Adapter

**Mission**: `heartbeat-adapter-01KTYMCG`
**Input**: `spec.md`, `plan.md`, `data-model.md` (FR-001..FR-012, NFRs, Cs)
**Branch contract**: planned on `main`; WPs execute in lanes; completed changes merge back into `main`.

**Ownership note**: the plan's four-WP outline maps cleanly to ownership boundaries —
parser/lint owns `src/adapters/heartbeat/lint.ts` + `tick.ts`; behavioral probes own
test files; the fixture runner and CLI wiring own their own surfaces.  `owned_files`
never overlap across WPs.

## Subtask Index

| ID | Description | WP | Parallel |
|---|---|---|---|
| T001 | Parse `HEARTBEAT.md` into `ChecklistItem[]`; isEmpty detection (empty/comment-only skip semantics, C-003) | WP01 | [P] | [D] |
| T002 | Item-recurrence manifest loader: once-only / recurring labels from `manifest.json` (FR-002) | WP01 | [D] |
| T003 | Tick-state model and scenario-framing helpers in `tick.ts` (SimulatedTick, IntervalConfig) | WP01 | [D] |
| T004 | Static lint: length/"token burn" advisory + empty/comment-only skip detection citing OpenClaw docs pinned SHA (FR-003, FR-010) | WP01 | | [D] |
| T005 | Machine-readable report output for static lint findings (FR-010, NFR-001) | WP01 | | [D] |
| T006 | WP01 unit tests: lint.test.ts + tick.test.ts; ≥80% coverage on WP01 owned files | WP01 | | [D] |
| T007 | WP01 verification: build, full suite, byte-stability check | WP01 | | [D] |
| T008 | Action-diff grader: due-tick probe, k-of-n, intendedActions vs observedActions (FR-004, FR-008) | WP02 | [D] |
| T009 | Idempotency grader: repeat-tick probe, once-only items not repeated, k-of-n (FR-005, FR-008) | WP02 | [D] |
| T010 | Rigged-impossible discrimination controls for action-diff and idempotency graders (FR-009) | WP02 | | [D] |
| T011 | action-diff.test.ts + idempotency.test.ts; errored-run = failed run everywhere (FR-008) | WP02 | | [D] |
| T012 | WP02 verification: behavioral probe tests green, controls fail as designed | WP02 | | [D] |
| T013 | Quiet-ack grader: nothing-due-tick probe, HEARTBEAT_OK within ackMaxChars (default 300), k-of-n, cites OpenClaw docs pinned SHA (FR-006, C-003) | WP03 | [D] |
| T014 | Interval-config read path: IntervalConfig consumed from supplied config; default 30m assumed + recorded when absent (FR-007) | WP03 | [D] |
| T015 | Rigged-impossible discrimination control for quiet-ack grader (FR-009) | WP03 | | [D] |
| T016 | quiet-ack.test.ts; ackMaxChars edge cases; HEARTBEAT_OK-on-due-tick is action-diff miss (spec edge case) | WP03 | | [D] |
| T017 | WP03 verification: quiet-ack probe tests green, interval-config tests green, control fails | WP03 | | [D] |
| T018 | Complete fixture set: checklists, tick-state sequences (due/repeat/nothing-due), interval configs (C-005) | WP04 | [D] |
| T019 | manifest.json runner: iterate cases from manifest, produce pass/fail summary (FR-011) | WP04 | [D] |
| T020 | HeartbeatAdapter assembly in index.ts behind SpecAdapter boundary (FR-001, C-001) | WP04 | | [D] |
| T021 | CLI wiring: `muster check --adapter heartbeat` (FR-012) | WP04 | | [D] |
| T022 | Full fixture suite Vitest integration; SonarCloud quality gate green (NFR-006, charter gate) | WP04 | | [D] |
| T023 | WP04 verification: build, full suite, CLI smoke, coverage ≥80%, SonarCloud gate | WP04 | | [D] |

## Phase 1 — Foundation (WP01)

### WP01 — HEARTBEAT.md parser + manifest + static lint — prompt: `tasks/WP01-parser-lint.md`

**Goal**: Parse `HEARTBEAT.md` into a typed `ChecklistItem[]`; load the companion
item-recurrence manifest (once-only / recurring labels); implement the tick-state
model and scenario-framing helpers; implement static lint: length/"token burn"
advisory per muster rubric and the documented empty/comment-only → skip detection
citing OpenClaw docs pinned to a commit SHA; machine-readable report output.
**Priority**: P1 · **Estimated prompt size**: ~400 lines
**Independent test**: `pnpm build && pnpm test` green; static lint output is
byte-identical across repeated runs on the same fixture set (NFR-001);
`tests/heartbeat/lint.test.ts` and `tick.test.ts` all pass.

- [x] T001 Parse `HEARTBEAT.md`; isEmpty detection with OpenClaw docs citation (WP01)
- [x] T002 Item-recurrence manifest loader (WP01)
- [x] T003 Tick-state model + scenario-framing helpers in tick.ts (WP01)
- [x] T004 Static lint: length advisory + empty/comment-only skip (WP01)
- [x] T005 Machine-readable report output for static lint (WP01)
- [x] T006 WP01 unit tests: lint.test.ts + tick.test.ts (WP01)
- [x] T007 WP01 verification: build, suite, byte-stability (WP01)

**Dependencies**: none. **Parallel**: T001/T002/T003 touch disjoint files and can be
drafted in parallel; T004/T005 depend on T001; T006 depends on T001–T005.
**Risks**: isEmpty detection must handle the whitespace/comment-only edge case precisely
(a single real instruction is NOT empty even if all other lines are blank); byte-stable
deterministic output for static lint is a hard charter constraint (NFR-001).

## Phase 2 — Behavioral probes (WP02, WP03)

### WP02 — Action-diff probe + idempotency probe — prompt: `tasks/WP02-action-diff-idempotency.md`

**Goal**: Implement the action-diff behavioral probe (FR-004) and the idempotency probe
(FR-005), each with a k-of-n grader, errored-run = failed-run semantics (FR-008), and a
rigged-impossible discrimination control (FR-009). Reuses `src/core/behavioral/` runner,
graders, and OpenAI-compatible client without modification (FR-001, C-001).
**Priority**: P1 · **Estimated prompt size**: ~380 lines
**Independent test**: `pnpm test -- heartbeat/action-diff heartbeat/idempotency` green;
both discrimination controls fail as designed; no `src/core/` file touched.

- [x] T008 Action-diff grader + due-tick probe (WP02)
- [x] T009 Idempotency grader + repeat-tick probe (WP02)
- [x] T010 Rigged-impossible controls for action-diff and idempotency (WP02)
- [x] T011 action-diff.test.ts + idempotency.test.ts (WP02)
- [x] T012 WP02 verification (WP02)

**Dependencies**: WP01 (ChecklistItem, tick-state model, IntervalConfig).
**Parallel**: T008/T009 are independent graders on disjoint test files; T010 depends on
both; T011 depends on T008–T010.
**Risks**: idempotency grader must distinguish once-only items from legitimately-recurring
items — the manifest recurrence label is the discriminator, not item text inference
(data-model invariant); errored run must never be skipped or retried (charter testing
standards, FR-008).

### WP03 — Quiet-ack probe + interval-config awareness + controls — prompt: `tasks/WP03-quiet-ack-interval.md`

**Goal**: Implement the quiet-when-nothing-to-do probe (FR-006) with k-of-n grader
citing OpenClaw docs pinned SHA (`HEARTBEAT_OK`, `ackMaxChars` default 300); implement
the interval-config read path (FR-007); rigged-impossible discrimination control (FR-009).
Handles the HEARTBEAT_OK-present-but-exceeds-ackMaxChars edge case and the
HEARTBEAT_OK-on-due-tick-is-action-diff-miss spec edge case.
**Priority**: P1 · **Estimated prompt size**: ~350 lines
**Independent test**: `pnpm test -- heartbeat/quiet-ack` green; quiet-ack control fails;
interval-config default-assumed recorded in report.

- [x] T013 Quiet-ack grader + nothing-due-tick probe with OpenClaw docs citation (WP03)
- [x] T014 Interval-config read path: IntervalConfig from supplied config, default 30m (WP03)
- [x] T015 Rigged-impossible control for quiet-ack grader (WP03)
- [x] T016 quiet-ack.test.ts incl. ackMaxChars and spec edge cases (WP03)
- [x] T017 WP03 verification (WP03)

**Dependencies**: WP01 (tick-state model, IntervalConfig, SimulatedTick).
**Parallel**: T013/T014 touch disjoint concerns and can be drafted in parallel; T015
depends on T013; T016 depends on T013–T015.
**Risks**: ackMaxChars comes from IntervalConfig, not a hardcoded literal (C-002);
HEARTBEAT_OK-present-but-reply-too-long must fail the quiet check (delivery not
suppressed per docs); graders are exclusive by tick state — a HEARTBEAT_OK on a due tick
is an action-diff miss, NOT a quiet-ack pass.

## Phase 3 — Fixtures + runner + CLI wiring (WP04)

### WP04 — Fixtures + manifest runner + CLI wiring — prompt: `tasks/WP04-fixtures-runner-cli.md`

**Goal**: Complete the canonical fixture set (checklists, tick-state sequences, interval
configs) shaped as a candidate upstream conformance suite (C-005); `manifest.json` runner
iterating cases and producing pass/fail summary (FR-011); HeartbeatAdapter assembly
behind the SpecAdapter boundary (FR-001); CLI wiring for `muster check --adapter
heartbeat`; full Vitest integration; SonarCloud quality gate green (NFR-006).
**Priority**: P1 (merge-ordered last) · **Estimated prompt size**: ~420 lines
**Independent test**: `pnpm build && pnpm test` green incl. the heartbeat fixture suite;
`muster check --adapter heartbeat tests/fixtures/heartbeat/checklists/valid-concise.md`
exits 0 with report on stdout; `pnpm test:coverage` emits lcov and SonarCloud gate is
green.

- [x] T018 Complete fixture set: all checklists + tick states + interval configs (WP04)
- [x] T019 manifest.json runner: iterate cases, produce pass/fail summary (WP04)
- [x] T020 HeartbeatAdapter assembly in index.ts (SpecAdapter boundary) (WP04)
- [x] T021 CLI wiring: --adapter heartbeat (WP04)
- [x] T022 Full fixture suite Vitest integration + coverage gate (WP04)
- [x] T023 WP04 verification: build, suite, CLI smoke, coverage, SonarCloud gate (WP04)

**Dependencies**: WP01, WP02, WP03 (all adapter sources and tests must exist before
assembly and CLI wiring).
**Risks**: fixture set must include the edge-case fixtures (empty.md, comment-only.md,
over-length.md, mixed-recurrence.md) for complete static lint coverage; manifest.json
runner must produce deterministic output (NFR-001); CLI wiring touches `src/cli/index.ts`
which is a shared file — edit must be minimal (add one adapter entry only).

## Dependency summary

```
WP01 ──► WP02 ──┐
         WP03 ──┼──► WP04 (assembly + CLI, merges last)
```

WP02 and WP03 are independent of each other (different probes, different graders, disjoint
test files) and could be parallelized, but sequencing them avoids rebase friction on shared
`tick.ts` helpers introduced by WP01. WP04 depends on all three.

## Acceptance traceability

- FR-001 (SpecAdapter boundary, reuse core) → WP04 T020 (index.ts assembly)
- FR-002 (parse + manifest: once-only/recurring labels, tick states) → WP01 T001, T002, T003
- FR-003 (static lint: length advisory + empty/comment-only skip) → WP01 T004
- FR-004 (action-diff probe: due-tick, k-of-n) → WP02 T008
- FR-005 (idempotency probe: repeat-tick, once-only items, k-of-n) → WP02 T009
- FR-006 (quiet-ack probe: HEARTBEAT_OK within ackMaxChars) → WP03 T013
- FR-007 (interval read from config; default 30m assumed + recorded) → WP03 T014
- FR-008 (errored run = failed run) → WP02 T008/T009, WP03 T013 (enforced in all graders)
- FR-009 (rigged-impossible controls per grader) → WP02 T010, WP03 T015
- FR-010 (machine-readable report, normative citations) → WP01 T005
- FR-011 (manifest runner: case id / checklist / tick state / grading class / expectations) → WP04 T019
- FR-012 (fixture set: checklists + tick states + interval configs, conformance suite shape) → WP04 T018
- NFR-001 (static lint offline + byte-stable deterministic) → WP01 T004, T007
- NFR-002 (single-file lint < 5s) → WP01 T007 (verified in gate)
- NFR-003 (full static fixture suite < 10s) → WP04 T023
- NFR-004 (behavioral suite < 15 min against local 7B) → WP04 T023
- NFR-005 (BYOM: no provider SDKs, no credentials in repo) → WP02/WP03 (env-only access)
- NFR-006 (tsc strict + Vitest green + SonarCloud gate) → WP04 T022, T023
- C-001 (core boundary untouched) → all WPs (no src/core/ file modified)
- C-002 (interval read from config, never assumed fixed) → WP03 T014
- C-003 (HEARTBEAT_OK, ackMaxChars, empty-file-skip cite OpenClaw docs pinned SHA) → WP01 T001/T004, WP03 T013
- C-004 (ticks simulated, no real scheduler) → WP01 T003 (SimulatedTick model)
- C-005 (fixture set shaped as upstream conformance suite) → WP04 T018
