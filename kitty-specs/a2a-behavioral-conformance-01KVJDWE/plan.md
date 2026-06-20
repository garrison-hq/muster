# Implementation Plan: A2A Behavioral Conformance

**Branch**: `kitty/mission-a2a-behavioral-conformance` | **Merge target**: `main` (via PR) | **Date**: 2026-06-20
**Spec**: `kitty-specs/a2a-behavioral-conformance-01KVJDWE/spec.md`
**Research**: `kitty-specs/a2a-behavioral-conformance-01KVJDWE/research.md`
**Data model**: `kitty-specs/a2a-behavioral-conformance-01KVJDWE/data-model.md`

## Summary

Add a multi-turn **A2A behavioral conformance** path: drive an external *running* agent over
A2A JSON-RPC, conduct a multi-turn conversation, and grade the agent's observed behavior on
verbosity / refusal / state_shift **k-of-n**, reusing muster's core axis graders + pass^k.
The new behavioral logic is **adapter-side** (`src/adapters/a2a/`) and imports core; core
gains no A2A import (C-004). State-shift is graded **black-box** (the agent is never told its
state). Thresholds come from an **optional persona reference and/or explicit per-case
thresholds** (decision C). Surfaced through the existing `muster a2a run`.

Technical approach is settled by research D1–D5 (see research.md). This plan adds the design
contracts and the build/verify strategy; it does not re-open scope.

## Technical Context

**Language/Version**: TypeScript (strict, `tsc`), Node ≥ 22, ESM.
**Primary Dependencies**: none new at runtime — reuse `src/core/behavioral/*` (graders,
pass-k, types, manifest validators) and `src/adapters/a2a/transport.ts` (the allow-listed
A2A `fetch` site). YAML loading + the existing manifest validators only.
**Storage**: N/A (manifests on disk; no persistence).
**Testing**: vitest (`pnpm test`), offline unit + fixture suites; live behavioral runs gated
behind `MUSTER_A2A_ENDPOINT` and skipped when absent. CLI smoke via `node dist/cli/index.js`.
**Target Platform**: Linux/CI (ubuntu-latest), offline-capable static path.
**Project Type**: single project (CLI + library), existing `src/` layout.
**Performance Goals**: grading is O(turns × runs); deterministic and sub-second per case
excluding network/model latency (the running agent owns generation time).
**Constraints**: spec-agnostic core (C-001/C-004, NI-002), single new network only via the
already-allow-listed `transport.ts` (NI-003), token read at call time and never stored
(NFR-002), no baked-in provider (C-003), determinism for fixed transcripts (NFR-001).
**Scale/Scope**: ~5 work packages (B1–B5 from the briefing); net-new code confined to
`src/adapters/a2a/` plus reuse wiring.

## Charter Check

*GATE: must pass before Phase 0 (passed — research done) and re-checked after Phase 1.*

| Charter anchor | Requirement | This plan |
|----------------|-------------|-----------|
| Branch Strategy | All changes land on `main` via PR; build+test + SonarCloud gates pass | Planning on `kitty/mission-a2a-behavioral-conformance`; PR → `main` (C-005). PASS |
| Testing Standards | Static checking works fully offline; live behavior gated | Live A2A behavioral skips with no endpoint; unit/fixture suites stay offline. PASS |
| Quality Gates | No hardcoded providers, no credentials in repo | Endpoint/token are env-var *names* only in manifests (FR-005/NFR-002); no provider baked in (C-003). PASS |
| Project Directives DIR-001/002 | (software-dev-default) testable, traceable changes | Every new check cites its spec section (NFR-004); FRs are testable. PASS |
| Performance Benchmarks | Deterministic grading | Fixed transcript ⇒ identical verdict (NFR-001). PASS |

**Boundary gate (NI-002/C-004):** all new behavioral logic lives under `src/adapters/a2a/`
and imports core; `tests/unit/invariants.test.ts` must still pass. **No new `fetch` site** —
multi-turn send extends the already-allow-listed `transport.ts` (NI-003). PASS

No charter conflicts. No gate violations.

## Project Structure

### Documentation (this feature)

```
kitty-specs/a2a-behavioral-conformance-01KVJDWE/
├── plan.md                      # This file
├── spec.md                      # Requirements (FR/NFR/C, scenarios)
├── research.md                  # Phase 0 (D1–D5, open questions)
├── data-model.md                # Phase 1 (entity → muster type mapping)
├── quickstart.md                # Phase 1 (author + run a behavioral case)
├── contracts/
│   ├── a2a-behavioral-manifest.md   # The behavioral manifest schema contract
│   ├── a2a-message-send.md          # The A2A wire contract muster sends/expects
│   └── cli-contract.md              # `muster a2a run` behavioral surface + exit codes
├── checklists/requirements.md   # Spec quality checklist
└── research/{evidence-log,source-register}.csv
```

### Source code (repository root) — touched / added

```
src/adapters/a2a/
├── transport.ts                 # EXTEND: conformant multi-turn send (Message + contextId/taskId threading)
├── graders/
│   └── behavioral.ts            # NET-NEW: A2A behavioral-case runner (builds transcript over A2A, calls core graders)
├── behavioral-manifest.ts       # NET-NEW (or in index.ts): A2A behavioral manifest loader (reuses core validators)
├── index.ts                     # EXTEND: wire behavioral cases into runManifest / `muster a2a run`
└── types.ts                     # EXTEND: A2A behavioral manifest/case types

src/core/behavioral/             # REUSED UNCHANGED (graders.ts, pass-k.ts, types.ts, manifest.ts validators)
examples/a2a/                    # NET-NEW: runnable behavioral case example
site/ (docs)                     # EXTEND: layers table + CLI reference
tests/
├── unit/                        # NET-NEW: manifest validation, transcript build, grading, reply-extraction (Message+Task)
└── (fixtures)                   # NET-NEW: A2A behavioral fixtures
```

## Phase 0 — Research (COMPLETE)

`research.md` resolved the technical unknowns: D1 (contextId-threaded `message/send`; current
payload non-conformant), D2 (reuse grading half, not `runCase`), D3 (black-box thresholds),
D4 (reuse manifest validators), D5 (reuse exit/skip/network contracts). Open items Q1–Q5 are
tracked; Q2 resolved here as **decision C**.

## Phase 1 — Design & Contracts (THIS COMMAND)

**Artifacts produced:**

- `data-model.md` — entity → existing-muster-type mapping (authored in Phase 0; authoritative).
- `contracts/a2a-behavioral-manifest.md` — strict manifest schema: `endpoint` (env-name
  refs), `defaults` (runs/pass_threshold/temperature), `cases` (turns/axes/overrides, optional
  `soul` reference **and/or** explicit thresholds — decision C). Unknown fields rejected.
- `contracts/a2a-message-send.md` — the A2A wire contract muster emits (Message shape,
  contextId/taskId threading) and the response shapes it tolerates (Message vs Task — Q1).
- `contracts/cli-contract.md` — `muster a2a run` behavioral activation, skip/fail semantics,
  and the 0/1/2 exit contract.
- `quickstart.md` — author a `soul`-referenced and an explicit-threshold case, run it, read
  the verdict.

**Decision C wiring:** a case MAY carry `soul` (→ resolve `EffectiveConfig` → thresholds) and
MAY carry explicit thresholds; explicit values **override** the persona-derived ones; a case
with neither is valid only if its axes need no verbosity/state threshold (e.g. refusal-only
with `refusal_cap`).

### Implementation phasing (informs `/spec-kitty.tasks`, not created here)

Ordering follows the briefing B1 → B3 → B2 → B4 → B5:

1. **B1 — multi-turn transport** (`transport.ts`): conformant `Message` send + contextId/taskId
   threading + reply extraction tolerant of Message/Task (Q1). Additive; single-turn probe
   untouched (Q3). Tests: wire-shape, threading, extraction for both response shapes.
2. **B3 — A2A behavioral manifest** (`behavioral-manifest.ts`/`types.ts`): reuse core
   Turn/AxisSpec/ContentAssertion/CaseOverrides/defaults validators; add endpoint(env-name) +
   decision-C threshold source; strict unknown-field rejection; no literal token field.
3. **B2 — behavioral runner** (`graders/behavioral.ts`): per case, walk turns → B1 → build
   `TranscriptEntry[]` (user turns only, no persona prompt) → core graders → `conjunctivePassK`
   → `CaseVerdict`. Resolve thresholds via decision C.
4. **B4 — black-box state**: track expected state locally from `facts`/triggers; grade
   state_shift from observable post-shift verbosity; never inform the agent. Documented + tested.
5. **B5 — CLI + docs + example**: surface behavioral cases via `muster a2a run`; `examples/a2a/`
   case; layers table + CLI reference; spec-section citations; preserve exit/skip contract.

## Complexity Tracking

No charter-gate violations to justify. The one deliberate complexity is **decision C** (both
threshold sources), accepted for author flexibility against an external black-box agent that
may lack a muster-side Soul.md; cost is a slightly larger manifest validator + the
override-precedence rule, both covered by tests.

## Progress

- [x] Phase 0 research complete (`research.md`)
- [x] Q2 resolved → decision C
- [x] Charter Check passed (pre- and post-design)
- [x] Phase 1 contracts + quickstart generated
- [ ] `/spec-kitty.tasks` — break B1–B5 into work packages (next command, user-invoked)
