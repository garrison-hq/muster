# Implementation Plan: Schedule (HEARTBEAT.md) Conformance Adapter

**Branch**: `main` (planning base and merge target; WPs run in spec-kitty lanes) | **Date**: 2026-06-13 | **Spec**: `kitty-specs/heartbeat-adapter-01KTYMCG/spec.md`
**Input**: Feature specification from `/home/jeroennouws/dev/garrison-hq/muster/kitty-specs/heartbeat-adapter-01KTYMCG/spec.md`

## Summary

Add a **Schedule adapter** behind muster's `SpecAdapter` boundary that lints
`HEARTBEAT.md` and behaviorally tests heartbeat behavior on **simulated ticks** —
no real scheduler is ever run, no wall-clock time is waited.  Ticks are
simulated via scenario framing and a supplied tick state (due / repeat /
nothing-due), keeping the suite fast and deterministic (C-004).

Three behavioral probes ship alongside a static lint path:

- **action-diff** (FR-004): on a due tick the agent's action set matches the
  checklist's intended actions exactly — no missing, no extra — k-of-n.
- **idempotency** (FR-005): on a repeat tick with no new state, once-only
  checklist items are not repeated or duplicated — k-of-n.
- **quiet-when-nothing-to-do** (FR-006): on a nothing-due tick the agent
  replies `HEARTBEAT_OK` with the remainder within `ackMaxChars` (default 300),
  suppressing delivery — k-of-n.

OpenClaw's heartbeat docs are unusually precise (RQ-04 in
`kitty-specs/v2-agent-stack-research-01KTYA4C/research.md`): `HEARTBEAT_OK`,
`ackMaxChars`, and the empty/comment-only skip semantics are cited directly from
the OpenClaw docs pinned to a commit SHA (C-003); length-advisory and other
checks cite muster's published rubric.  The heartbeat interval is read from a
supplied config (default 30m, 1h under Anthropic OAuth) — the adapter never
assumes a fixed interval (C-002, RQ-04 open question 8).

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 22 LTS (unchanged)
**Primary Dependencies**: no new runtime deps; no new dev deps. The behavioral
runner, graders, and OpenAI-compatible client already exist in
`src/core/behavioral/`; the CTS pipeline and report machinery in `src/core/`
are reused as-is (FR-001, C-001).
**Storage**: N/A
**Testing**: Vitest 3 (existing `vitest.config.ts`); fixture suite is the
primary acceptance surface.  `pnpm test:coverage` uploads lcov to SonarCloud
(existing CI wire-up); new-code coverage must be ≥ 80 % (charter gate).
**Target Platform**: Linux (Fedora) dev + GitHub Actions ubuntu-latest; static
lint path is fully offline (NFR-001).
**Project Type**: single package (existing layout); new adapter mirrors
`src/adapters/rfc1/` exactly.
**Performance Goals**: static lint < 5 s per file (NFR-002), full static
fixture suite < 10 s (NFR-003), behavioral suite < 15 min against a local 7B
model (NFR-004).
**Constraints**: byte-stable deterministic static output; no model-provider
SDKs; no credentials in repo; spec-agnostic core boundary untouched (C-001).
**Scale/Scope**: one new adapter (~4 WPs); fixture set shaped as a candidate
upstream conformance suite (C-005).

## Charter Check

*Charter: `.kittify/charter/charter.md` (v1 charter; all engineering
constraints carry forward to this v1-extended mission).*

| Charter gate | Status |
|---|---|
| `tsc` strict passes before merge | PASS — every WP carries a type-check AC |
| Full Vitest suite green incl. CTS + heartbeat fixture suite | PASS — behavioral + static fixture suites are the primary AC surface (FR-011, FR-012) |
| No implementation before spec/plan/tasks locked | PASS — this plan precedes any code change |
| ≥ 80 % new-code coverage (SonarCloud quality gate) | PASS — graders + lint + parser are 100 % unit-testable; fixture-driven tests supply the line coverage (charter testing standards) |
| Every check cites a normative source | PASS — `HEARTBEAT_OK`, `ackMaxChars`, empty-file-skip cite OpenClaw docs pinned to commit SHA (C-003); length advisory and other checks cite muster rubric (FR-010) |
| Grading is two-tier; errored run = failed run | PASS — action-diff / idempotency / quiet-ack are stylistic axes (k-of-n); no safety-critical axes in this adapter; errored = failed everywhere (FR-008, charter testing standards) |
| Every grader ships a rigged-impossible discrimination control | PASS — FR-009 mandates a rigged control per grader (quiet-ack, idempotency, action-diff) |
| Interval read from config; never assumed | PASS — C-002; default 30m recorded when config absent (FR-007) |
| Static path offline + byte-stable deterministic | PASS — NFR-001; no network calls in static lint path |
| No hardcoded providers / no credentials in repo | PASS — NFR-005; endpoint + key via environment at run time |
| Minimal dependencies | PASS — zero new runtime deps; zero new dev deps; behavioral runner + graders + client fully reused (FR-001) |
| Scope guard: not a framework, runtime, optimizer, or hosted service | PASS — CLI + CI exit codes only; adapter stays behind `SpecAdapter` boundary |

No violations.

## Project Structure

### Documentation (this mission)

```
kitty-specs/heartbeat-adapter-01KTYMCG/
├── spec.md              # done
├── plan.md              # this file
├── data-model.md        # Phase 1 — entities, invariants, charter notes
├── quickstart.md        # Phase 1 — local verification steps
└── tasks.md             # Phase 2 (/spec-kitty.tasks — NOT created here)
```

### Source Code (new files only; no existing file is modified except CLI wiring)

```
src/adapters/heartbeat/
├── index.ts             # HeartbeatAdapter assembly (mirrors rfc1/index.ts)
├── lint.ts              # static lint: length advisory, empty/comment-only skip
└── tick.ts              # tick-state model + scenario framing helpers

tests/
├── heartbeat/
│   ├── lint.test.ts     # unit tests for the static lint path
│   ├── tick.test.ts     # unit tests for tick-state model helpers
│   ├── action-diff.test.ts    # WP02 behavioral probe + discrimination control
│   ├── idempotency.test.ts    # WP02 behavioral probe + discrimination control
│   └── quiet-ack.test.ts      # WP03 behavioral probe + discrimination control
└── fixtures/heartbeat/
    ├── checklists/
    │   ├── valid-concise.md          # passes all static checks
    │   ├── empty.md                  # empty-file-skip fixture
    │   ├── comment-only.md           # comment-only-skip fixture
    │   ├── over-length.md            # triggers length advisory
    │   └── mixed-recurrence.md       # once-only + recurring items
    ├── tick-states/
    │   ├── due.json                  # state that makes an action due
    │   ├── repeat.json               # repeated tick, no new state
    │   └── nothing-due.json          # nothing for the agent to do
    ├── interval-configs/
    │   ├── default-30m.json          # explicit 30m config
    │   ├── oauth-1h.json             # Anthropic OAuth 1h config
    │   └── absent.json               # absent config — default assumed + recorded
    └── manifest.json                 # test manifest (FR-011): case id, checklist
                                      # path, item recurrence labels, tick state,
                                      # interval config, grading class, expectations
```

**Structure Decision**: single-package layout unchanged; new adapter at
`src/adapters/heartbeat/` mirrors `src/adapters/rfc1/` exactly so the
CLI can compose it via the same `SpecAdapter` boundary (C-001, FR-001).
The three adapter source files (index, lint, tick) map to the three
adapter-specific concerns; behavioral runner and graders are imported from
`src/core/behavioral/` without modification.

**Item-recurrence manifest**: each checklist item carries a `recurrence`
label (`once-only` | `recurring`); the manifest file (per FR-002) declares
these alongside the simulated tick states and interval config. Only
`once-only` items drive the idempotency check (spec edge case: idempotency
vs. legitimately recurring actions).

## Work-Package Outline (preview for /spec-kitty.tasks — not tasks.md)

| WP | Title | FRs | Description |
|---|---|---|---|
| WP01 | HEARTBEAT.md parser + manifest + static lint | FR-002, FR-003, FR-010, NFR-001–003 | Parse `HEARTBEAT.md` into a `ChecklistItem[]` list; load the item-recurrence manifest (once-only / recurring labels) and tick-state model; implement static lint: length/"token burn" advisory per muster rubric; empty/comment-only → skip detection citing OpenClaw docs (pinned SHA); machine-readable report output. |
| WP02 | Action-diff probe + idempotency probe | FR-004, FR-005, FR-008, FR-009 | Action-diff behavioral probe: due-tick scenario, agent action set vs. checklist intent, k-of-n grader + rigged-impossible control. Idempotency probe: repeat-tick scenario, once-only items not repeated, k-of-n grader + rigged-impossible control. Errored run = failed run throughout. |
| WP03 | Quiet-ack probe + interval-config awareness + controls | FR-006, FR-007, FR-008, FR-009 | Quiet-when-nothing-to-do probe: nothing-due-tick scenario, `HEARTBEAT_OK` + remainder within `ackMaxChars` (default 300), k-of-n grader citing OpenClaw docs (pinned SHA) + rigged-impossible control. Interval-config read path: `IntervalConfig` consumed from supplied config; default 30m assumed + recorded when absent (FR-007 edge case). |
| WP04 | Fixtures + manifest runner + CLI wiring | FR-011, FR-012, NFR-001–004, NFR-006 | Complete fixture set (checklists, tick-state sequences, interval configs — shaped as a candidate upstream conformance suite, C-005); `manifest.json` runner that iterates cases and produces pass/fail summary; CLI wiring so `muster check --adapter heartbeat` works; full fixture suite Vitest integration; SonarCloud quality gate green. |

**Build order**: WP01 → WP02 → WP03 → WP04. WP01 is the parser/lint
foundation both behavioral WPs depend on. WP02 and WP03 are independent of
each other (different probes, different graders) and could be parallelized, but
sequencing them avoids rebase friction on the shared `tick.ts` helpers.

**Position in v1-extended layer stack**: this is one of three parallel
OpenClaw convention layers (tools / memory / schedule) that land after the
OpenClaw SOP adapter. Per RQ-10, the research-locked order is skills → SOP →
cross-layer → then the three convention layers; the schedule layer (this
mission) is independent of tools and memory and can proceed in parallel with
them once SOP is merged.

## Complexity Tracking

No charter violations. The adapter introduces no new architectural pattern:
the `SpecAdapter` boundary, behavioral runner, k-of-n graders, fixture-driven
test manifest, and OpenAI-compatible client are all pre-existing primitives.
The item-recurrence manifest is new data (needed to distinguish once-only from
recurring items for idempotency) but is a plain JSON sidecar, not a new
abstraction layer.
