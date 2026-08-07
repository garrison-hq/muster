# Implementation Plan: Cassette Core Engine

**Branch**: `kitty/mission-cassette-core-engine-01KZCWFE` | **Date**: 2026-08-07 | **Spec**: `kitty-specs/cassette-core-engine-01KZCWFE/spec.md`
**Input**: Feature specification from `kitty-specs/cassette-core-engine-01KZCWFE/spec.md` (416 lines, 24 FRs, 7 NFRs, 9 constraints, 7 success criteria; already passed a full adversarial spec review — treated here as locked, not re-litigated).

**Branch contract**: `meta.json` declares `topology: coord`, `coordination_branch:
kitty/mission-cassette-core-engine-01KZCWFE`, `target_branch: main`. This
worktree's HEAD is the coordination branch; the eventual merge target is
`main` (via `spec-kitty merge`, a later pipeline step — not performed here).

## Summary

Ship a new spec-agnostic core module, `src/core/cassette/`, that gives
muster a schema-versioned, canonical-JSON, byte-stable recording format for
`ChatClient`/`ToolChatClient` exchanges, plus a `makeCassetteClient`
decorator that wraps any concrete client at that one seam in `record` /
`replay` / `live` modes. `behave run` (`src/cli/index.ts:1978-2011`) is
wired end-to-end with `--cassette <dir> --record|--replay`, gated by new CLI
validation, run-count discipline read from the cassette before any other
resolution, a `replayed: true` output marker, and a `stale` verdict field
distinguishing cassette misses from ordinary conformance failure. A
standalone `resolveExecutionSource` function ships from core with its own
tests, ready for wave-2 (#100/#101/#102) to consume — **this mission does
not wire it into any of the five existing gate-bearing call sites** (that
wiring is explicitly Out of Scope per spec.md Non-Goals; FR-018's "drop-in
fifth consumer" language describes `tools`' readiness, not an instruction to
touch `doToolsRun` here). `src/adapters/openclaw-sop/runner.ts`'s three
hardcoded `model: "mock"` / `baseUrl: "mock://test"` / `durationMs: 0`
literals (FR-001, absorbing #90) are fixed first, ahead of the cassette
engine itself, because recording is meaningless while the thing being
recorded lies about its own provenance.

## Technical Context

**Language/Version**: TypeScript on Node 22 (strict `tsc --noEmit`).
**Primary Dependencies**: `node:crypto` (`createHash("sha256")`, the same
primitive already used at `src/adapters/spec-kitty-profile/projection.ts:32,133`
— no new runtime dependency); `node:fs`/`node:path` for the cassette
store; the existing `canonicalJson` (`src/core/canonical-json.ts`) reused
verbatim for both the request-hash input and the persisted file bytes
(C-003). No new package.json dependency of any kind.
**Storage**: files only — `fixtures/cassettes/discrimination-control/`
(git-committed, D7) plus test-authored temp directories for every other
cassette fixture (recording/replay round-trips, credential redaction). No
DB, no network in the cassette path itself.
**Testing**: Vitest. New suites: `tests/cassette/**` (core module unit +
integration tests), `tests/unit/execution-source.test.ts`, additions to
`tests/unit/cli.test.ts`'s existing `"muster behave run"` describe block
(`src/cli/index.ts` line 377 in that file today), `tests/unit/
invariants.test.ts` (NI-004 + the fixtures/cassettes size lint), and
`tests/adapters/openclaw-sop/runner.test.ts` (FR-001 provenance
assertions). `tsc --noEmit` and `pnpm test` (full Vitest suite) both green
at every phase boundary (FR-023).
**Target Platform**: Node 22 CLI + CI exit codes (0/1/2 contract, unchanged
shape).
**Project Type**: single project (the muster package).
**Performance Goals**: byte-stable, deterministic recording/replay
(NFR-001/002 — NFR-002's literal "byte-identical `--json`" requires
normalizing `Transcript.durationMs` to a fixed sentinel for replay output
only, since that field is required, wall-clock-measured, and has no
"modulo durationMs" carve-out unlike NFR-001; see Hazard 3); zero network
I/O during replay (NFR-003, verified by `vi.spyOn(globalThis, "fetch")`
asserting zero calls — mirroring the existing precedent at
`cli.test.ts:727` — not merely a mock `clientFactory`, which would be
vacuous; see Test Strategy row 5); invariant guard suite (NI-001..004 +
size lint) stays
inside its existing 2000 ms combined budget (NFR-007) — new scan work is
appended into the existing single-timer block in `tests/unit/
invariants.test.ts`, not a second timer.
**Constraints**: C-001..C-009 (see Charter Check below). No new fetch call
site (C-002/NFR-004) — the decorator only ever calls the inner client's
existing `chat`/`chatWithTools` methods or reads/writes files.
**Scale/Scope**: one new core module (6 files under `src/core/cassette/`),
one new standalone core module (`src/core/execution-source.ts`), 3-site
fix in one existing adapter file (`openclaw-sop/runner.ts`), CLI wiring in
one existing file (`src/cli/index.ts`), one new docs/guides page, one
committed fixture cassette, and additions to five existing test files plus
several new test files — no new adapter directory, no new CLI command
group (this rides the existing `behave run` subcommand).

## Charter Check

*GATE: Must pass before Phase 0 work begins. Re-checked after the core
module design below.*

- **Spec-agnostic core / adapter boundary (C-001)** — PASS by construction:
  `src/core/cassette/**` and `src/core/execution-source.ts` import only
  `node:crypto`, `node:fs`, `node:path`, and sibling `src/core/**` modules
  (`canonical-json.ts`, `behavioral/types.ts`, `behavioral/client.ts`'s
  newly-exported `hostnameOf`). Nothing under `src/core/` imports
  `src/adapters/**`, `src/cli/**`, or `src/crosslayer/**`. NI-002
  (`tests/unit/invariants.test.ts`) mechanically re-verifies this on every
  test run; no manual audit is the enforcement mechanism.
- **No new fetch call site (C-002/NFR-004)** — PASS: the decorator (`src/
  core/cassette/client.ts`) calls only `inner.chat(...)` /
  `inner.chatWithTools(...)` (methods the caller already constructed) or
  the cassette store's file I/O. NI-003's `FETCH_ALLOWED` list
  (`["src/core/behavioral/client.ts", "src/adapters/a2a/transport.ts"]`,
  `tests/unit/invariants.test.ts:136-139`) is asserted unchanged by a new
  test (mirrors NFR-004's own acceptance measure).
- **Canonicalization reuse (C-003)** — PASS: `src/core/cassette/hash.ts`
  and `store.ts` both import `canonicalJson` from `src/core/
  canonical-json.ts`; no second RFC 8785 implementation is written.
- **No parallel hostname/redaction logic (C-004)** — PASS: `hostnameOf`
  (currently module-private at `src/core/behavioral/client.ts:57`) is
  exported (one-line change: add `export` to the function declaration) and
  imported by `src/core/cassette/store.ts` for provenance redaction. No
  second implementation.
- **Resolver ships, is not wired (C-005)** — PASS: `resolveExecutionSource`
  (`src/core/execution-source.ts`) is exported with its own test suite
  (`tests/unit/execution-source.test.ts`) reproducing the FR-018 precedence
  table as literal test cases per branch. **This mission makes zero edits to
  the skip-gate *decision logic*** at `heartbeat/index.ts:497`,
  `cli/index.ts:1778` (`doToolsRun`'s endpoint check), `cli/index.ts:936-943`
  (crosslayer's manifest-endpoint-block fallback), or `skills/
  trigger.ts:83-101` (`resolveEndpointBaseUrl`) — confirmed against spec.md's
  own Non-Goals ("Any change to the five gate-bearing commands' own
  `MUSTER_ENDPOINT` skip-gate behavior" is out of scope). **Caveat, so this
  bullet does not contradict IC-01 below**: `cli/index.ts:1616-1646`
  (`buildSopClient`/`SOP_NOOP_CLIENT`) IS edited by this mission — by IC-01
  (FR-001, the #90 fix), which is a different concern from C-005/the
  resolver and lands first specifically because it must land before the
  resolver exists. That edit threads `{model, baseUrl}` through so SOP
  transcripts stop lying about their provenance; it changes what gets
  *stamped* once a probe runs, not the `MUSTER_ENDPOINT`-driven skip-gate
  *decision* of whether a probe runs at all — `buildSopClient`'s branch
  structure is unchanged. Note this mission's own claim here is *stronger*
  than spec.md's actual C-005 text, which forbids only further `src/core/`
  modification at the five wave-2 call sites and says nothing about
  `src/cli/index.ts`.
- **Sequential-only execution (C-006)** — PASS: this mission adds no
  concurrent model-call path anywhere; NI-004 (FR-024, IC-05 below) makes
  the invariant a regression-tested guarantee instead of a point-in-time
  read.
- **PR + gates on `main` (C-007)** — process constraint, not a design
  constraint; satisfied by following the existing spec-kitty merge
  pipeline (out of this plan's scope to re-describe).
- **Conformance-harness scope guard (C-008)** — PASS: the cassette
  mechanism adds a recording/replay format and a decorator, not a runtime,
  registry, or hosted service. `behave run --replay` is still a one-shot CLI
  invocation with exit codes; nothing here starts a server or persists
  state across invocations beyond the committed cassette files themselves.
- **No report-envelope sanitizer reuse (C-009)** — PASS: the cassette
  store's own redaction logic (hostname-only via `hostnameOf`, never a
  full URL, never `apiKeyEnv`'s value) is written from scratch in `src/
  core/cassette/store.ts`; no import from the report-envelope programme
  (#91/#92). The only type shared with #92 is `Transcript`, and only by
  virtue of both consuming `src/core/behavioral/types.ts` — no new coupling
  is introduced.

No violations → Complexity Tracking is empty.

## Project Structure

### Documentation (this mission)

```
kitty-specs/cassette-core-engine-01KZCWFE/
├── plan.md              # This file
├── research/             # (empty — no Phase 0 research doc was generated;
│                            all "open questions" the spec deferred to
│                            plan-time are resolved inline below instead)
├── reviews/               # Spec-phase adversarial review trail (existing)
└── tasks/                 # Phase 2 output (/spec-kitty.tasks — NOT this file)
```

### Source Code (repository root)

```
src/core/
├── cassette/                      # NEW — spec-agnostic cassette module (C-001)
│   ├── types.ts                     # CassetteMode, CassetteExchange, CassetteCaseFile,
│   │                                 # CassetteSuiteIndex, SCHEMA_VERSION const (FR-002/003)
│   ├── hash.ts                      # computeRequestHash(request): sha256 hex over
│   │                                 # canonicalJson(request) — post-transform only (FR-005)
│   ├── store.ts                     # writeCassetteCase/readCassetteCase,
│   │                                 # writeCassetteSuiteIndex/readCassetteSuiteIndex —
│   │                                 # one file per case + one suite index file (D1/FR-003),
│   │                                 # redaction via hostnameOf (C-004), byte-stable output
│   │                                 # (canonicalJson, durationMs excluded from the hashed/
│   │                                 # compared form — FR-004/NFR-001)
│   ├── errors.ts                    # CassetteMissError (FR-009/FR-013)
│   ├── client.ts                    # makeCassetteClient(inner, opts) — record/replay/live
│   │                                 # (FR-007..FR-011)
│   └── index.ts                     # public barrel: re-exports the above
├── execution-source.ts            # NEW — resolveExecutionSource (FR-018), standalone,
│                                     # no dependency on cassette/** beyond the
│                                     # ExecutionSourceInput.cassetteReplayConfigured field name
├── behavioral/
│   ├── types.ts                     # MODIFIED — + `stale?: boolean` on RunVerdict and
│   │                                 # CaseVerdict (FR-013, additive, mirrors the `passRate`
│   │                                 # precedent already in this file)
│   ├── client.ts                    # MODIFIED — `hostnameOf` gains `export` (C-004); no
│   │                                 # behavior change
│   └── runner.ts                    # MODIFIED — runCase's existing per-run catch block
│                                     # (line ~562) additionally sets `stale: true` when the
│                                     # caught error is a CassetteMissError (FR-013)
└── canonical-json.ts               # UNCHANGED — reused, not modified

src/adapters/openclaw-sop/
└── runner.ts                       # MODIFIED — FR-001: SuiteRunOptions gains `model`/
                                      # `baseUrl` (caller-supplied endpoint identity);
                                      # runProbeOnce times its client-call loop and stamps
                                      # real model/baseUrl (hostname via hostnameOf) instead
                                      # of the "mock"/"mock://test"/0 literals; the two
                                      # catch-block Transcript literals (~L349-355, ~L421-428)
                                      # get the same treatment

src/cli/
└── index.ts                        # MODIFIED —
                                      #  (a) doSopRun/buildSopClient (~L1615-1686): thread
                                      #      {model, baseUrl} through to runManifestSuite,
                                      #      using an "unconfigured"/"unconfigured://
                                      #      no-endpoint" sentinel ONLY when no endpoint is
                                      #      configured (SOP_NOOP_CLIENT path) — the mock
                                      #      literal becomes conditional, never unconditional
                                      #      (FR-001)
                                      #  (b) BehaveOpts (~L387-393): + cassette?: string,
                                      #      record?: boolean, replay?: boolean
                                      #  (c) behave run command definition (~L1978-2011):
                                      #      + --cassette <dir>, --record, --replay options
                                      #  (d) doBehaveRun (~L414-490): flag validation
                                      #      (FR-016), replay run-count preflight (FR-014/015,
                                      #      via readCassetteSuiteIndex only — see IC-04 Risks),
                                      #      per-case decorator construction wrapping
                                      #      `client` (FR-007/008/009/010), replayed:true
                                      #      output-envelope branch (FR-017) whose replay-only
                                      #      copy also normalizes every
                                      #      transcript.durationMs to 0 before JSON.stringify
                                      #      (Hazard 3, NFR-002), and the exit-2 "endpoint
                                      #      fatal" heuristic (~L483-488) gated OFF in replay
                                      #      mode (see Hazard 1 below)
                                      #  doToolsRun (L1765-1799) is UNCHANGED (C-005 scope
                                      #  note above)

docs/guides/
└── cassette-format.md              # NEW (FR-012) — the chat()/chatWithTools() fidelity
                                      # asymmetry, the information-loss limitation, the
                                      # requested-vs-served model distinction

fixtures/cassettes/
└── discrimination-control/          # NEW, git-committed (D7/FR-019)
    ├── index.json                    # suite index (schemaVersion, caseIds, declared runs)
    └── rigged-case.json               # one case file with responses that flunk a grader

tests/cassette/                    # NEW test directory (mirrors the flat per-concern
                                      # convention: tests/behavioral/, tests/skills/, etc.)
├── hash.test.ts                     # FR-005: post-transform hashing, blindArmOrder collision
├── store.test.ts                    # FR-003/004/006: file format, ordinal reset/increment,
│                                     # redaction (FR-020's dedicated assertion lives here too);
│                                     # + design decision #2 (non-empty target directory on
│                                     # --record): pre-populate the directory with an unrelated
│                                     # file plus a stale case file from a different suite,
│                                     # record the current suite, assert the unrelated file is
│                                     # untouched and only the current suite's files changed
├── client.test.ts                   # FR-007..011: record/replay/live mode contracts
├── client-tools.test.ts             # Decorator-coverage acceptance scenario: chatWithTools
│                                     # round-trip via a raw ToolChatClient (FR-011/FR-016
│                                     # scenario — no CLI surface, integration-level per spec)
├── discrimination-control.test.ts   # FR-019: replaying the rigged fixture fails; the
│                                     # control's own "graders stubbed ⇒ this test itself
│                                     # fails" proof
└── public-api.test.ts               # SC-006: same-mission smoke test importing
                                      # makeCassetteClient (IC-02) and resolveExecutionSource
                                      # (IC-03) from a path outside src/core/, the way a
                                      # wave-2 adapter would — owned by IC-06 (see below)

tests/unit/
├── execution-source.test.ts        # NEW — FR-018 precedence table, one case per branch
├── invariants.test.ts              # MODIFIED — + NI-004 (quote-aware-comment-stripped,
│                                     # paren-balanced Promise.all-wraps-chat scan, directory-
│                                     # walked over src/adapters+src/core/behavioral+
│                                     # src/crosslayer — see "NI-004 design" above —
│                                     # FR-024/C-006, with memory-utilization/index.ts and
│                                     # crosslayer/rule-survival.ts as explicit
│                                     # must-not-false-positive fixtures) + fixtures/cassettes
│                                     # size lint (FR-021/D7), both folded into the existing
│                                     # combined timer (NFR-007)
└── cli.test.ts                     # MODIFIED — new cases inside the existing
                                      # `describe("muster behave run ...")` block (line 377
                                      # today): --cassette/--record/--replay flag validation
                                      # (FR-016), record→replay round-trip byte-stability
                                      # (NFR-001/002, incl. Hazard 3's durationMs-normalization
                                      # assertion), replayed:true shape (FR-017), zero network
                                      # I/O during replay (NFR-003, via `vi.spyOn(globalThis,
                                      # "fetch")` mirroring the BUG-B precedent at
                                      # cli.test.ts:727 — NOT the plain mock `clientFactory`
                                      # alone, which would be vacuous since replay must never
                                      # call `inner.chat` regardless of decorator correctness),
                                      # stale-miss exit code (FR-013, Hazard 1), --runs
                                      # conflict (FR-015)

tests/behavioral/
└── runner.test.ts                  # MODIFIED — + personaPrompt purity guard (FR-022: reads
                                      # none of Date/Math.random/process.env) + `stale` field
                                      # propagation assertion (FR-013)

tests/adapters/openclaw-sop/
└── runner.test.ts                  # MODIFIED — FR-001/Scenario 15: real endpoint identity +
                                      # measured durationMs (mock client delayed ≥5ms,
                                      # asserted durationMs >= 5 — see IC-01 Risks) assertions;
                                      # existing tests carry no "mock" literal assertions today
                                      # (verified — no rewrite of pre-existing expectations
                                      # needed, only additions)
```

**Structure Decision**: single project. The cassette module is a new
sibling to `src/core/behavioral/` and `src/core/canonical-json.ts` inside
`src/core/`, not nested inside `behavioral/` — it decorates a `ChatClient`/
`ToolChatClient` from outside that seam and must stay importable by
adapters that construct their own client wrappers (e.g. wave-2's `skills`
`TriggerChatClient`) without pulling in behavioral-runner internals.
`resolveExecutionSource` is a further sibling, not nested under `cassette/`,
because its contract (`{ env, cassetteReplayConfigured,
manifestHasEndpointBlock }`) is deliberately usable by callers that never
touch the cassette store or decorator directly (FR-018 names `heartbeat`,
`sop`, `skills`, `crosslayer` as future consumers that have nothing to do
with cassette file I/O). Tests mirror the flat per-concern directory
convention already used by `tests/behavioral/`, `tests/skills/`, `tests/
sop/`, `tests/skprofile/` — `tests/cassette/`, not `tests/core/cassette/`.

## Design decisions resolving the spec's "plan-time" Open Questions

The spec explicitly deferred five items to this plan (spec.md "Open
Questions / Risks"). Resolved here so `/spec-kitty.tasks` has no ambiguity
left to invent around:

1. **Suite index/provenance file schema** — `{ schemaVersion: string;
   suiteId: string; cases: { id: string; runs: number }[]; recordedAt:
   string }`. `suiteId` is the manifest's resolved absolute path at record
   time (informational provenance only, never compared for byte-stability
   — NFR-001 governs the case files, not this diagnostic field).
   `cases[].runs` is the authoritative per-case declared run count FR-014
   reads (see design note below — **not** inferred from exchange counts).
2. **Non-empty target directory on `--record`** — **overwrite the specific
   files this run produces** (the suite index and each case file for cases
   in the current manifest), create the directory if absent, and never
   delete files this run does not touch. This keeps re-recording a suite
   after an endpoint or manifest change a normal, safe operation (matching
   "record once, replay forever" as a *repeatable* action, not a one-shot),
   while not silently destroying an unrelated prior recording that happens
   to share the directory.
3. **Surplus recorded exchanges** — inert: a case file may contain more
   exchanges than replay ends up requesting (e.g. after the manifest was
   edited to remove a turn); replay simply never reaches them. No warning
   is emitted in this mission (D2 only locks the *miss* direction) — a
   future mission may add one.
4. **File-per-case ↔ adapter-case mapping** — out of scope for `behave
   run`'s consumption in this mission (`behave run` cases map 1:1 to
   cassette case files, keyed by `BehavioralCase.id`). Wave-2 adapters
   with a fan-out case concept (e.g. SOP's compliance/adversarial split)
   choose their own mapping when they wire cassette support themselves —
   the core module imposes no adapter-specific convention.
5. **`fixtures/cassettes/` size-lint threshold (FR-021)** — **2 MiB**
   total. The discrimination-control cassette (one small rigged case) is
   on the order of a few KB; 2 MiB leaves generous headroom for wave-2
   adapters to add their own fixture cassettes later while still catching
   a runaway/accidental large recording early. Implemented as a `readdirSync`
   walk over `fixtures/cassettes/` summing `statSync(...).size`, folded into
   `tests/unit/invariants.test.ts`'s existing combined-timer block (NFR-007).

## Cassette core module — key design points (grounding for tasks)

**`CassetteExchange` shape** (`types.ts`):
```ts
interface CassetteExchange {
  kind: "chat" | "chatWithTools";
  requestHash: string;   // hex sha256 over canonicalJson(request), FR-005
  ordinal: number;        // 1-based; resets per case file, increments per
                           // repeated identical requestHash within the file (FR-006)
  request: { messages: ChatMessage[]; opts: Record<string, unknown> }
         | { messages: ChatMessage[]; tools: unknown[] };
  response: string | unknown;   // chat → string; chatWithTools → unknown (FR-011)
  provenance: { model: string; hostname: string };   // requested model, never served (FR-012)
  durationMs?: number;    // opt-in; excluded from the canonical form NFR-001 compares (FR-004)
}
```
`kind` disambiguates the two shapes at the same seam without re-serializing
`chatWithTools` into `chat`'s shape (FR-011) and without them ever
colliding on `requestHash` (the fully-built request differs by
construction — tools present vs. absent, per spec.md's own Edge Cases
note).

**Ordinal/hash keying implementation**: computed and stored explicitly at
record time (not inferred from array position at replay time) — the
recorder keeps an in-memory `Map<requestHash, number>` counter scoped to
the current case file, incrementing on every call; the same counter
pattern, reset to empty, drives replay lookups against the loaded case
file's `exchanges` array (indexed by `(requestHash, ordinal)`, not by
scan position). This makes FR-006 mechanically testable against the
persisted file content directly, not just against decorator behavior.

**Decorator construction is per-case, not per-suite**: `doBehaveRun`
constructs one `makeCassetteClient(client, opts)` instance per case inside
its existing case loop (matching D1's one-file-per-case shape), passing a
mutable `recordSink: CassetteExchange[]` (record mode) or a loaded
`replaySource: readonly CassetteExchange[]` (replay mode, from
`readCassetteCase`). The decorator itself never opens a file handle — file
I/O is the CLI/adapter caller's responsibility (`writeCassetteCase` is
called once per case, after that case's runs complete), which keeps
`makeCassetteClient`'s return type exactly `ChatClient`/`ToolChatClient`
shaped (FR-007) with no extra lifecycle methods a wave-2 caller would need
to remember to invoke.

**Replay miss → `CassetteMissError`**: thrown by the decorator (FR-009)
identifying the case id and the missing `(requestHash, ordinal)` key.
`runCase`'s existing per-run `catch` block (`src/core/behavioral/
runner.ts` line ~562, unchanged control flow) already converts any thrown
error into an errored/failed run (the pre-existing "an errored run
counts as a failed run" contract documented at `src/core/behavioral/
types.ts` lines 66/101/112 — an earlier mission's FR-022, distinct from
*this* mission's FR-022, the `personaPrompt` purity guard) — this plan
adds one `instanceof
CassetteMissError` check inside that same catch block to additionally set
`stale: true` on the `RunVerdict` (FR-013), reusing the untouched
error-containment path rather than adding a second one.

**`resolveExecutionSource` implementation**: a direct, five-branch
translation of FR-018's precedence table — no I/O, no adapter knowledge,
pure function over its `ExecutionSourceInput`. `tests/unit/
execution-source.test.ts` writes one test per branch plus the two documented
falsification cases (`MUSTER_BASE_URL` set alone → `usedDeprecatedAlias:
true`; both set → `MUSTER_ENDPOINT` wins silently, matching `skills/
trigger.ts`'s existing `resolveEndpointBaseUrl` precedent verbatim).

## Hazard 1 — the exit-2 "endpoint fatal" heuristic misfires on an all-stale replay

`doBehaveRun`'s existing tail (`src/cli/index.ts:482-489` — the same
block Hazard 3 below cites precisely):
```ts
const allRuns = verdicts.flatMap((verdict) => verdict.runs);
if (allRuns.length > 0 && allRuns.every((run) => run.error !== undefined)) {
  io.errLine("endpoint fatal: every run of every case errored — treating as an execution error (exit 2)");
  return 2;
}
return verdicts.every((verdict) => verdict.passed) ? 0 : 1;
```
Every `CassetteMissError` is caught into `run.error` (see above), so a
replay run where **every** case is entirely stale (e.g. the whole cassette
directory was deleted) would satisfy `allRuns.every(run => run.error !==
undefined)` and incorrectly exit **2** ("execution error") — but FR-013
requires "the suite MUST still exit with its normal non-zero failure
code," and Acceptance Scenario 9 requires "the process exits with the
normal failure exit code — not 0, not a skip code," which this plan reads
as exit **1**
(conformance failure), matching every other all-cases-failed replay run,
not exit 2 (which this codebase reserves for "the live endpoint itself is
unreachable" — a condition that cannot occur during replay at all,
NFR-003). **Fix**: gate the exit-2 heuristic off entirely when
`opts.replay === true` (replay never touches a live endpoint, so the
heuristic's premise — "maybe the endpoint is down" — never applies; a
dedicated `replayAllStale` check is unnecessary complexity when the
simpler "this heuristic only makes sense for live runs" framing covers
it). A dedicated test (`tests/unit/cli.test.ts`) drives a `--replay` run
against a cassette directory with no matching case files and asserts exit
code 1, not 2 — this is exactly the kind of interaction a reviewer would
otherwise have to find independently, so it is called out and pre-fixed
here.

## Hazard 2 — `--json` output shape is genuinely asymmetric by design (FR-017)

`doBehaveRun` currently emits a bare `CaseVerdict[]` array via
`JSON.stringify(verdicts, null, 2)`. Arrays cannot carry a named
`replayed` property, and FR-017 requires non-replay output to stay
byte-identical to its pre-mission shape — so replay output cannot simply
add a field to the existing shape. **Resolution**: only `--replay`
invocations wrap the array: `{ replayed: true, verdicts: CaseVerdict[] }`;
every other invocation (no cassette, `--record`) keeps emitting the bare
array, unchanged. This is a deliberate, spec-required shape asymmetry, not
an oversight — documented here so a reviewer checking "does `--json`
output stay stable" does not flag the replay-mode shape change as a
regression. The human-readable formatter (`formatBehaveHuman`) gets an
analogous `(replayed: true)` marker appended to its summary line for
replay invocations only (SC-002's "every replay output is marked" read in
spirit for the human-readable path too, not just the `--json` payload
FR-017 names literally).

## Hazard 3 — `Transcript.durationMs` breaks NFR-002's byte-identical replay `--json` guarantee unless normalized

`Transcript.durationMs` (`src/core/behavioral/types.ts:88`) is a
**required** `number` field — a different field entirely from the cassette
module's own **opt-in** `CassetteExchange.durationMs` (`FR-004`, correctly
excluded from NFR-001's byte-stability comparison). `runCase`
(`src/core/behavioral/runner.ts:547` `started = Date.now()`, `:572`
`durationMs: Date.now() - started`) stamps it unconditionally around
`executeRun`'s turn loop, with **zero cassette-mode awareness** — this runs
identically whether `client` is live, cassette-record, or cassette-replay
decorated, because the decorator sits *underneath* `client.chat()` and
`runCase`'s timing wrapper never sees which mode is active. `doBehaveRun`
then embeds this field verbatim in the `--json` verdicts array
(`src/cli/index.ts:476`, `JSON.stringify(verdicts, null, 2)`). Two
consecutive `--replay` invocations of the same suite will measure slightly
different in-process wall-clock durations (file I/O + JS scheduling
jitter), so NFR-002's literal "byte-identical verdict `--json`" claim —
unlike NFR-001, which carries an explicit "modulo the opt-in `durationMs`
field" carve-out — cannot hold without an explicit fix; the spec's own
asymmetry between NFR-001 and NFR-002 is deliberate (NFR-002 has no modulo
clause) and is authoritative, so the fix belongs here, not as a spec
amendment.

**Resolution**: `doBehaveRun`'s output-emission step, **only when
`opts.replay === true`**, builds a copy of `verdicts` **three levels deep**
— `CaseVerdict[]` → each `CaseVerdict.runs: RunVerdict[]` → each
`RunVerdict.transcript: Transcript` (`src/core/behavioral/types.ts:82-88,
102-106, 124-128`) — normalizing every `RunVerdict.transcript.durationMs` to
a fixed sentinel (`0`) before the copy reaches `JSON.stringify`/
`formatBehaveHuman`: `verdicts.map((v) => ({ ...v, runs: v.runs.map((r) =>
({ ...r, transcript: { ...r.transcript, durationMs: 0 } })) }))`. A single
top-level array spread (`[...verdicts]`) is **not** sufficient here —
`durationMs` sits three objects below the array element, and a
one-level-shallow copy would still alias each `RunVerdict`'s (and its
`Transcript`'s) object reference, so writing through the "copy" would mutate
the original `Transcript` objects `runCase` returns, defeating the "leave
`Transcript` unmutated" goal this resolution exists to satisfy. Only the
array itself, each `CaseVerdict`, each `RunVerdict`, and each `Transcript`
need their own new object/array — `TranscriptEntry` items inside
`transcript.entries` are never written through and can stay shared
references. The copy is built immediately before output, not a mutation of
the `Transcript` objects `runCase` returns; the exit-code branch (`allRuns
.every((run) => run.error !== undefined)`, `src/cli/index.ts:482-489`) sits
**below** the emission line (`io.outLine(...)`, `:475-477`), not above it,
and reads only `run.error`, never `durationMs`, so it observes the
original, unmutated `verdicts` and this ordering is safe regardless. This
keeps `Transcript.durationMs: number`'s type contract intact, requires zero
changes to `runner.ts`/`runCase` beyond the already-planned `stale`-flag
catch-block edit (IC-04's Affected surfaces are unchanged), and is
localized entirely to IC-04's `doBehaveRun` — the same function Hazard 1
and Hazard 2 already modify, in the same replay-only branch Hazard 2
introduces for the `{ replayed: true, verdicts }` wrapper. Live and
`--record` runs are unaffected: their `durationMs` values stay real,
matching FR-001's real-timing requirement and NFR-006's "non-cassette
output unchanged" guarantee.

**Test**: a dedicated assertion (`tests/unit/cli.test.ts`, extending
scenario 6) must make normalization observable, not merely assumed: run
`--replay` twice with a deliberately introduced timing difference between
the two invocations (e.g. the mock client used by the second invocation
resolves after an artificial `setTimeout` delay the first invocation's
mock does not have, so the two runs' *real* elapsed wall-clock time
provably differs) and assert the two `--json` payloads are still
byte-identical. A test that never introduces timing variance between the
two runs would pass whether or not normalization were implemented, so it
would not actually prove NFR-002.

## NI-004 design — detecting a `Promise.all` wrapping a `.chat`/`.chatWithTools` call site

FR-024 requires a **nesting/enclosure** check ("a `Promise.all` call
wrapping a `.chat(`/`.chatWithTools(` call site"), not a same-file or
nearby-line co-occurrence check. NI-002/NI-003 (`tests/unit/
invariants.test.ts:107-152`) are both flat substring/co-occurrence checks —
mirroring that *style* for NI-004 (as spec.md's "analogous to the existing
NI-002/NI-003 pattern" phrasing could be read to suggest) would
false-positive **today** on two real, correct files: `src/adapters/
memory-utilization/index.ts:7,288` and `src/crosslayer/
rule-survival.ts:309` each contain the literal comment substring
"Promise.all" (explicitly documenting its *absence*, for rate-kindness to
local endpoints) within the same file as, and in `rule-survival.ts`'s case
13 lines from, a real `.chat(` call site at `:181`/`:322` respectively. A
same-file or small-proximity-window implementation breaks the invariant
suite — and therefore the merge gate — on day one.

**Algorithm** (text-scanning, matching the codebase's existing NI-002/
NI-003 style — no AST parser/new dependency introduced):

1. **Strip comments before scanning, quote-aware.** Remove `//...` line
   comments and `/* ... */` block comments from each candidate file's text,
   but only when the `//`/`/*` sequence occurs outside a string or template
   literal — track a single-pass in-string state (none / `"` / `'` / `` ` ``)
   toggled by unescaped quote characters (a `\` inside a string escapes the
   next character rather than closing the string), and only treat `//`/`/*`
   as a comment start while that state is "none". This is still a small,
   single-purpose stripper, not a full tokenizer — it needs quote/escape
   tracking but not template-literal `${...}` interpolation-aware parsing:
   treating an entire backtick span (open backtick to matching close
   backtick, `${...}` included) as opaque — no comment-stripping inside
   it — is sufficient and safe, since no template literal in the scan scope
   embeds a `//`/`/*` sequence *inside* a `${...}` expression itself
   (grep-verified). Plain `://` text does appear inside a backtick string's
   literal segment today (`src/adapters/spec-kitty-profile/
   schema.ts:47`'s `` `https://github.com/.../${schemaSha}/...` ``) —
   that is handled correctly by the same open-to-matching-close backtick
   tracking used for `"`/`'`, no interpolation-specific logic required.
   Quote-awareness is required, not
   defensive-only: scan-scope files already contain code lines where a `//`
   sits *inside* a string literal next to real code —
   `src/adapters/openclaw-sop/runner.ts:192,352,425` (`baseUrl:
   "mock://test",`) and `src/adapters/memory/recall.ts:24` (an
   `https://...` citation URL) — and a non-quote-aware stripper would read
   from that in-string `//` to end-of-line as a comment, deleting whatever
   real code follows it on the line. That is a false-negative risk exactly
   symmetric to the false-positive risk steps 2-4 guard against: a
   `Promise.all(...)`/`.chat(`/`.chatWithTools(` token sharing a line with
   such a string literal would be silently erased before the scan ever sees
   it, and NI-004 would report zero violations even for a real one. No
   scan-scope line combines a `://` string literal with a `Promise.all(`/
   `.chat(`/`.chatWithTools(` token today (grep-verified), so this is a
   design-time correction, not a fix for a currently-failing case — but the
   guard exists precisely to hold under future changes, not just today's
   tree, so relying on that absence would reintroduce the same
   "unverified-today, wrong-tomorrow" failure mode this round is fixing
   elsewhere. Quote-aware stripping also still clears the two known comment
   false positives (memory-utilization/index.ts, rule-survival.ts below),
   since their "Promise.all" occurrences are inside `//`/`/* */` comments
   outside any string.
2. In the comment-stripped text, scan for `PROMISE_ALL_CALL = "Promise" +
   "." + "all" + "("` (built by concatenation, matching NI-003's
   `FETCH_CALL` token style for consistency — not a functional necessity
   here, since NI-004's scan scope, `src/adapters/`, `src/core/
   behavioral/`, and `src/crosslayer/`, structurally excludes this test
   file at `tests/unit/invariants.test.ts`; unlike NI-003, which scans
   `src/` + `tests/` and so does need `FETCH_CALL`'s concatenation to
   avoid self-tripping on its own literal token).
3. For every match, balance-track parens from that opening `(` to find its
   matching closing `)`, walking the **same quote/template-literal state
   machine built in step 1** (none / `"` / `'` / `` ` ``, escape-aware) over
   the raw (not comment-stripped — step 1 already removed comments from the
   text this walk runs over, so only string/template state remains to
   track) substring: the depth counter increments/decrements on `(`/`)`
   only while that state is "none," and is left untouched by any `(`/`)`
   character encountered while inside a string or template-literal span.
   This is required, not defensive-only, for the same reason step 1's
   quote-awareness is: a `Promise.all(...)` argument containing a string
   literal with an unbalanced paren (e.g. an error message like `"forgot to
   close ("`) would otherwise desync a raw depth counter, either truncating
   the enclosure span early (a real `.chat(`/`.chatWithTools(` wrap goes
   unreported — a false negative undermining the C-006 guarantee NI-004
   exists to enforce) or extending it past the call's real close paren (a
   false positive sweeping in an unrelated later call). No `Promise.all(`
   call site in the scan scope embeds such a string today
   (`src/crosslayer/manifest-runner.ts:195`'s is a plain
   `Promise.all(arr.map(...))` shape with no argument string) — this is
   the same "the guard must hold under future changes, not just today's
   tree" discipline step 1 already applies, extended to step 3 instead of
   stopping short of it. The quote-tracking logic itself is factored into
   one shared local helper (`trackQuoteState`, or equivalent) called from
   both step 1's stripping pass and step 3's paren-balance walk, so the two
   never drift apart into two separately-maintained scanners.
4. Report a violation only if a `.chat(` or `.chatWithTools(` token
   substring falls **inside** that matched span (between the opening paren
   and its balanced closing paren) — same-file or nearby co-occurrence
   *outside* that span is not a violation. This matches FR-024's "wrapping"
   language exactly (enclosure, not proximity) instead of over-triggering.

**Scan scope: derived by directory walk, not a hand-maintained file list.**
An earlier version of this plan enumerated eight specific files as the scan
scope and asserted the list was "confirmed live via grep." Re-running that
exact command (`grep -rln '\.chat(\|\.chatWithTools(' src/adapters
src/core/behavioral src/crosslayer`) against the tree at `db80a42` returns
**ten** files, not eight: the eight already listed, plus
`src/adapters/memory-utilization/judge.ts:137` and
`src/adapters/openclaw-sop/judge.ts:118` — both real `.chat(` call sites the
prior enumeration silently dropped. (Full ten, alphabetical:
`src/adapters/heartbeat/index.ts`, `src/adapters/memory/privacy.ts`,
`src/adapters/memory/recall.ts`, `src/adapters/memory-utilization/index.ts`,
`src/adapters/memory-utilization/judge.ts`,
`src/adapters/openclaw-sop/judge.ts`, `src/adapters/openclaw-sop/runner.ts`,
`src/adapters/skills/trigger.ts`, `src/core/behavioral/runner.ts`,
`src/crosslayer/rule-survival.ts`.)

A hand-maintained file list is the wrong shape for this guard regardless of
whether it happens to be complete today: every time a new runner or judge
module adds a `.chat(`/`.chatWithTools(` call site — and NI-004's entire
purpose is to keep enforcing C-006's sequential-only invariant as the
codebase grows — the list has to be remembered and updated by hand, or the
guard silently stops covering that file. That is precisely the failure that
just happened: two real call sites dropped from an enumeration one review
round after it was written. A scope defined by **derivation** — walk a
directory tree and scan whatever is there — cannot rot this way, because
nothing needs to be kept in sync with it. NI-004 therefore scans every
`.ts` file under the three directories that can contain runner/judge code
— `src/adapters/`, `src/core/behavioral/`, `src/crosslayer/` — using the
same `walk()` helper NI-002 already uses in this file (`walk(dir, {
exclude: BASE_EXCLUDES })`, recursive, symlinks never followed), filtered
to `.ts` files exactly as NI-002/NI-003 already do
(`.filter((f) => f.endsWith(".ts"))`). No test-file exclusion is needed:
zero `*.test.ts`/`*.spec.ts` files exist under `src/` today (grep-verified).
This makes the scope self-maintaining in both directions: a file with no
`.chat(`/`.chatWithTools(` call site simply never matches step 2's
`PROMISE_ALL_CALL` span search and costs one cheap substring scan; a new
file that *does* add such a call site is automatically in-scope the moment
it lands under one of these three directories, with no companion edit to
this test ever required again. The three directories match spec.md's "all
eight behavioral runners" assumption's own locations — `behave` under
`src/core/behavioral/`; the other seven named runners (`memory`,
`memory-utilization`, `crosslayer`, `heartbeat`, `skills`, `sop`, `tools`)
and their judge/helper modules under `src/adapters/*`; `crosslayer` under
`src/crosslayer/` — so walking `src/adapters/` wholesale also covers
`src/adapters/tools/`, `src/adapters/a2a/`, `src/adapters/rfc1/`, and
`src/adapters/spec-kitty-profile/`, none of which contain a `.chat(`/
`.chatWithTools(` call site today (grep-verified) but each of which is
automatically in-scope if one of them ever gains one — `tools` in
particular, since FR-018's "drop-in fifth consumer" framing already
anticipates it growing behavioral judging later. Total walked files: 83
`.ts` files, ~25,000 lines (`find`/`wc`-verified at `db80a42`) — well
inside NFR-007's combined budget and the same order of magnitude NI-003
already walks today (all of `src/` + `tests/`).

**Fixture coverage**: `src/adapters/memory-utilization/index.ts` and
`src/crosslayer/rule-survival.ts` are explicit must-not-false-positive
assertions in NI-004's own test coverage — both are real files already
inside the directory-walk scan scope, so no extra wiring is needed to
exercise them; NI-004 must report zero violations for both, verified
directly (not merely inferred from the guard suite staying green).

Two further fixtures exercise the quote/template-literal state machine
itself — the one shared by step 1's comment stripper and step 3's
paren-balance enclosure walk — rather than the directory-walk scan. That
state-tracking logic (and the stripping/enclosure logic built on it) is
factored into small local helper functions at module scope in `tests/
unit/invariants.test.ts`, alongside `walk()`/`PROMISE_ALL_CALL`, exactly
mirroring how NI-002/NI-003's `walk()` and `FETCH_ALLOWED` are already
both used inside their scan and asserted against directly in separate
`it()` blocks. These two fixtures call those helpers directly with
literal strings, never through the filesystem walk, so neither requires
a synthetic or production file under the scanned directories:

- **Quote-aware stripper**: a literal string containing a `://`-bearing
  segment followed by real code on the same line (e.g. `` `baseUrl:
  "mock://test", Promise.all(x.chat())` ``, mirroring
  `src/adapters/openclaw-sop/runner.ts`'s real `"mock://test"` shape) fed
  directly to the stripping helper must leave the trailing
  `Promise.all(x.chat())` text intact in the output — proving the
  stripper does not swallow real code after an in-string `//`.
- **Quote-aware enclosure walk**: a literal string shaped like
  `Promise.all(["forgot to close (", x.chat()])` fed directly to the
  paren-balance helper must still resolve the enclosure span to the
  call's real matching closing paren — not desynced by the unbalanced
  `(` inside the string argument — and report `.chat(` as enclosed,
  proving step 3's quote-awareness holds against exactly the shape
  identified as the guard's remaining gap.

Neither fixture changes any production file or adds a file to the
scanned directories; both are direct unit assertions against the shared
helper functions the directory-walk scan itself also calls, so the
helpers and the scan can never silently drift apart.

## Implementation Concern Map

> Concerns, not work packages. `/spec-kitty.tasks` maps these to WPs.
> Ordered by dependency; IC-01 and IC-03 have no dependency on the core
> module and can run in parallel with it.

### IC-01 — SOP transcript provenance fix (FR-001, absorbs #90)

- **Purpose**: land first, per spec.md Summary's own ordering mandate —
  "this fix lands first, in the same mission" — because recording is
  meaningless while the thing being recorded lies about its own
  provenance. Independent of every other concern below.
- **Relevant requirements**: FR-001.
- **Affected surfaces**: `src/adapters/openclaw-sop/runner.ts`
  (`SuiteRunOptions`, `runProbeOnce`, the two catch-block `Transcript`
  literals), `src/cli/index.ts` (`doSopRun`/`buildSopClient` thread
  `{model, baseUrl}` through — the endpoint identity already exists there
  today and is simply discarded after `makeClient(endpoint)` is built;
  it needs to be passed alongside the client instead).
- **Sequencing/depends-on**: none.
- **Risks**: low — three literal-value sites plus one options-interface
  widening; no behavior change to the skip-gate decision itself (only to
  what gets stamped once a probe *does* run). Existing SOP runner tests
  assert no "mock" literal today (verified live), so no pre-existing
  assertion needs rewriting — only new assertions are added (Scenario 15).
  **Regression-proof risk**: every existing mock `ChatClient` factory in
  `tests/adapters/openclaw-sop/runner.test.ts` (`makeMockClient`,
  `makeConstantClient`, `makeRunVaryingJudgeClient`, `makeErrorClient`)
  resolves synchronously with no delay — a Scenario-15 regression test that
  merely asserts `durationMs` is a number/is defined would legitimately
  compute `0` on a fast machine and be indistinguishable from the removed
  `durationMs: 0` literal, silently passing even if FR-001's fix regressed.
  The Scenario-15 test's mock client MUST introduce a deliberate async delay
  (e.g. `await new Promise((r) => setTimeout(r, 5))` before resolving) and
  assert `durationMs >= 5`, not merely that the field exists or is a
  number, so the test actually fails if the hardcoded `0` literal
  reappeared.

### IC-02 — Core cassette module: types, hashing, store, decorator

- **Purpose**: the foundation everything else in this mission builds on —
  `src/core/cassette/{types,hash,store,errors,client,index}.ts`.
- **Relevant requirements**: FR-002, FR-003, FR-004, FR-005, FR-006,
  FR-007, FR-008, FR-009, FR-010, FR-011, FR-012 (doc content references
  this module's shape), NFR-004.
- **Affected surfaces**: `src/core/cassette/**` (new), `src/core/
  behavioral/client.ts` (`hostnameOf` export — one line), `tests/
  cassette/{hash,store,client,client-tools}.test.ts`.
- **Sequencing/depends-on**: none from other new code (only the existing
  `canonicalJson` and the newly-exported `hostnameOf`). This is the
  riskiest, least-precedented concern in the mission (novel hashing/
  ordinal design, three-mode decorator contract) and is deliberately
  front-loaded immediately after the small, low-risk IC-01.
- **Risks**: the ordinal/hash keying design (explicit per-file counter,
  not scan-order inference) is new territory for this codebase — mitigate
  with the dedicated `store.test.ts` coverage of FR-006's exact scenario
  (k-of-n identical prompts → n distinct recorded responses, recorded
  order, each exactly once) before any CLI wiring depends on it.

### IC-03 — Execution-source resolver (FR-018)

- **Purpose**: `src/core/execution-source.ts`, shipped with its own tests,
  consumed by no call site in this mission (C-005).
- **Relevant requirements**: FR-018.
- **Affected surfaces**: `src/core/execution-source.ts` (new), `tests/
  unit/execution-source.test.ts` (new).
- **Sequencing/depends-on**: none — independent of IC-01 and IC-02, can be
  built in parallel with either.
- **Risks**: none material — a pure five-branch function with a fully
  specified precedence table in the spec; the only care needed is
  reproducing `skills/trigger.ts`'s existing canonical-wins-silently
  behavior exactly (verified against source at `trigger.ts:91-101` above).

### IC-04 — `behave run` CLI wiring

- **Purpose**: `--cassette <dir> --record|--replay` wired end-to-end:
  flag validation, run-count preflight, per-case decorator construction,
  `replayed: true` output, the Hazard 1 exit-code fix.
- **Relevant requirements**: FR-013, FR-014, FR-015, FR-016, FR-017,
  NFR-001, NFR-002, NFR-003, NFR-006.
- **Affected surfaces**: `src/cli/index.ts` (`BehaveOpts`, the `behave
  run` command definition, `doBehaveRun`), `src/core/behavioral/types.ts`
  (`stale?: boolean`), `src/core/behavioral/runner.ts` (`runCase`'s catch
  block), `tests/unit/cli.test.ts` (existing `"muster behave run"` block).
- **Sequencing/depends-on**: IC-02 (needs `makeCassetteClient`,
  `CassetteMissError`, the store's read/write functions).
- **Risks**: Hazard 1, Hazard 2, and Hazard 3 above are exactly the class of
  subtle interaction bug this concern must get right; all three are
  pre-designed above specifically so implementation does not have to
  rediscover them. The FR-014/015 preflight ("fails before any case
  executes") reads **only the single suite index file**, via
  `readCassetteSuiteIndex` (design decision #1 above; the file already
  lists every case's authoritative `runs` count in one read) — it never
  opens individual per-case cassette files during the preflight. A case
  missing from the suite index's `cases[]` list, or a case whose per-case
  file is absent, is **not** a preflight/FR-015 failure: that remains a
  per-case D2/FR-013 stale-miss, handled later during that case's own turn
  in the main loop (via `readCassetteCase`), so FR-015's whole-suite-abort
  failure mode and D2/FR-013's per-case stale-label failure mode stay
  structurally separate and are never conflated by a naive per-case-file
  preflight read.

### IC-05 — Invariant guards + discrimination-control fixture

- **Purpose**: NI-004 (FR-024/C-006 — a quote-aware-comment-stripped,
  paren-balanced scan, directory-walked over `src/adapters/`,
  `src/core/behavioral/`, and `src/crosslayer/`, for a `Promise.all` call
  wrapping a `.chat(`/`.chatWithTools(` call site; see "NI-004 design"
  above for the algorithm and scan scope), the `fixtures/
  cassettes/` size lint (FR-021/D7), the discrimination-control cassette
  and its load-bearing test (FR-019), the credential-redaction test
  (FR-020), the `personaPrompt` purity guard (FR-022).
- **Relevant requirements**: FR-019, FR-020, FR-021, FR-022, FR-024,
  NFR-007.
- **Affected surfaces**: `tests/unit/invariants.test.ts` (NI-004 + size
  lint, both folded into the existing timer), `fixtures/cassettes/
  discrimination-control/**` (new, committed), `tests/cassette/
  discrimination-control.test.ts`, `tests/cassette/store.test.ts`
  (redaction assertion), `tests/behavioral/runner.test.ts`
  (`personaPrompt` purity).
- **Sequencing/depends-on**: IC-02 (the discrimination-control fixture is
  authored using the decorator's record mode against a scripted mock
  `ChatClient`, then committed as static JSON — not generated at test-run
  time) and IC-04 for the CLI-level replay-fails-loudly half of FR-019's
  assertion (a pure `readCassetteCase` + grader call could satisfy FR-019
  without IC-04, but exercising it through `behave run --replay` is the
  stronger, more representative test and is preferred here).
- **Risks**: see "NI-004 design" above — a naive same-file/co-occurrence
  substring scan (NI-002/NI-003's own style) would false-positive today on
  `src/adapters/memory-utilization/index.ts` and `src/crosslayer/
  rule-survival.ts`, both of which document their own `Promise.all`
  *absence* in comments near a real `.chat(` call site; a comment stripper
  that is not string-literal-aware would go too far the other way, creating
  a symmetric false-negative risk by deleting real code that follows a
  `://`-bearing string literal (`"mock://test"`, citation URLs) misread as
  a line comment. The quote-aware comment-strip + paren-balanced-enclosure
  algorithm specified above avoids both, and its own `PROMISE_ALL_CALL`
  token is built by string concatenation matching NI-003's `FETCH_CALL`
  token style at `invariants.test.ts:128` — a stylistic choice, not a
  functional necessity, since NI-004's scan scope (`src/adapters/`,
  `src/core/behavioral/`, `src/crosslayer/`) structurally excludes this
  test file at `tests/unit/invariants.test.ts`, unlike NI-003 whose
  `src/` + `tests/` scan does need the concatenation to avoid self-tripping.
  A hand-maintained scan scope carries its own rot risk independent of the
  algorithm — see "NI-004 design"'s scope discussion for why the scope is
  directory-derived instead.

### IC-06 — Documentation + final gate verification

- **Purpose**: `docs/guides/cassette-format.md` (FR-012 — the
  `chat()`/`chatWithTools()` fidelity asymmetry, the information-loss
  limitation, requested-vs-served model), and the mission-closing
  confirmation that `pnpm test`, `tsc --noEmit`, and the SonarCloud
  ≥80%-new-code gate are all green with every prior concern's changes
  included (FR-023).
- **Relevant requirements**: FR-012, FR-023, SC-006.
- **Affected surfaces**: `docs/guides/cassette-format.md` (new),
  `tests/cassette/public-api.test.ts` (new — SC-006's cross-boundary import
  smoke test: imports `makeCassetteClient`/`resolveExecutionSource` from a
  path outside `src/core/`, proving wave-2 can genuinely consume these
  exports, not just that unit tests inside `src/core/` pass).
- **Sequencing/depends-on**: IC-02 and IC-03 (documents/exercises both
  modules' actual exported shape), otherwise last — a natural
  mission-closing concern.
- **Risks**: none material.

## FR / NFR / Constraint coverage

| Requirement | Concern | Requirement | Concern | Requirement | Concern |
|---|---|---|---|---|---|
| FR-001 | IC-01 | FR-009 | IC-02 | FR-017 | IC-04 |
| FR-002 | IC-02 | FR-010 | IC-02 | FR-018 | IC-03 |
| FR-003 | IC-02 | FR-011 | IC-02 | FR-019 | IC-05 |
| FR-004 | IC-02 | FR-012 | IC-02 / IC-06 | FR-020 | IC-05 |
| FR-005 | IC-02 | FR-013 | IC-04 | FR-021 | IC-05 |
| FR-006 | IC-02 | FR-014 | IC-04 | FR-022 | IC-05 |
| FR-007 | IC-02 | FR-015 | IC-04 | FR-023 | IC-06 (all) |
| FR-008 | IC-02 | FR-016 | IC-04 | FR-024 | IC-05 |

All 24 FRs are mapped; none deferred. NFR-001/002/003/006 → IC-04;
NFR-004 → IC-02; NFR-005 (≥80% new-code coverage) is a cross-cutting gate
verified at IC-06 against every concern's new code, not a single concern's
output; NFR-007 → IC-05. C-001..C-009 are addressed in the Charter Check
above, each tied to the concern(s) that implement it.

## Test Strategy

Per acceptance scenario (spec.md "Acceptance Scenarios", numbered 1-16).
*Convention*: this plan refers to spec.md's numbered Acceptance Scenarios
as "Scenario N" throughout (spec.md itself uses bare numbers, no "AC-"
prefix — that shorthand does not appear in the reference artifact).

| # | Scenario | Test location |
|---|---|---|
| 1 | Record writes one case file + suite index, canonical JSON, `schemaVersion` | `tests/cassette/store.test.ts` |
| 2 | Same suite recorded twice → byte-identical modulo `durationMs` | `tests/unit/cli.test.ts` (behave run --record twice, diff) |
| 3 | Credential-shaped fake token never persisted | `tests/cassette/store.test.ts` (FR-020) |
| 4 | Post-transform (`blindArmOrder`) hash collision, pre-transform would not collide | `tests/cassette/hash.test.ts` |
| 5 | Replay with no endpoint/API key env set → completes, zero network I/O | `tests/unit/cli.test.ts` (NFR-002/003; `vi.spyOn(globalThis, "fetch")` asserted `not.toHaveBeenCalled()`, mirroring `cli.test.ts:727` — a mock `clientFactory` alone is not sufficient, see Technical Context) |
| 6 | Same replay run twice → byte-identical `--json` | `tests/unit/cli.test.ts` (Hazard 3: run with a deliberate timing difference between the two invocations and assert the payloads are still byte-identical, proving `durationMs` normalization, not merely fast/uniform timing) |
| 7 | k-of-n identical-key case → n distinct responses, recorded order, each once | `tests/cassette/store.test.ts` + `client.test.ts` |
| 8 | `replayed: true` present only on replay output; other paths unchanged | `tests/unit/cli.test.ts` (Hazard 2) |
| 9 | Deleted exchange → stale-labeled failure, suite continues, non-zero non-skip exit | `tests/unit/cli.test.ts` (Hazard 1) |
| 10 | `n=5` recorded, no `--runs` → uses 5 | `tests/unit/cli.test.ts` |
| 11 | `n=5` recorded, `--runs 3` → fails before any case executes, names both counts | `tests/unit/cli.test.ts` |
| 12 | `--record`/`--replay` without `--cassette` → CLI usage error | `tests/unit/cli.test.ts` |
| 13 | `--record` and `--replay` together → CLI usage error | `tests/unit/cli.test.ts` |
| 14 | Rigged cassette fails; graders stubbed ⇒ control test itself fails | `tests/cassette/discrimination-control.test.ts` |
| 15 | SOP transcript reflects real endpoint + measured duration, no "mock" literal | `tests/adapters/openclaw-sop/runner.test.ts` (mock client delayed ≥5ms, asserts `durationMs >= 5` — see IC-01 Risks) |
| 16 | `chatWithTools` record→replay round-trip, zero network, own request-hash keying | `tests/cassette/client-tools.test.ts` |

Success criteria SC-001..007 are each covered by the union of the scenario
tests above (SC-001↔1/5, SC-002↔8, SC-003↔9, SC-004↔3, SC-005↔15,
SC-006↔ IC-02/IC-03's public-export tests + `tests/cassette/
public-api.test.ts` (owned by IC-06, see Project Structure) — a
same-mission smoke test that imports `makeCassetteClient`/
`resolveExecutionSource` from a path outside `src/core/` the way an
adapter would, SC-007↔ the full existing suite staying green, checked at
IC-06).

**Plan-authored behavior coverage**: not every tested branch traces back to
a numbered spec.md Acceptance Scenario — design decision #2 above
(non-empty target directory on `--record`: overwrite only the files this
run touches, never delete untouched files) is a plan-invented,
safety-relevant behavior with no corresponding spec.md scenario. It is
covered by a dedicated `tests/cassette/store.test.ts` case (see Project
Structure) rather than a Test Strategy table row, precisely so it is not
lost at `/spec-kitty.tasks` time despite falling outside the 16-scenario
table above.

**Coverage**: every new file listed in Project Structure gets direct unit
coverage; `≥80%` new-code coverage (NFR-005) is realistic given the module
is small, pure-function-heavy (hashing, store read/write, resolver), and
every branch in `resolveExecutionSource` and the decorator's three modes
is independently exercised by the table above (plus the plan-authored
behavior coverage immediately above). No branch is planned that lacks a
corresponding test.

**Determinism/byte-stability verification**: NFR-001 (`store.test.ts`,
scenario 2) and NFR-002 (`cli.test.ts`, scenario 6) are both round-trip
tests that record/replay twice and diff the resulting bytes — not
single-run smoke tests — matching how NFR-001/002 are phrased as
comparisons, not single-observation assertions. NFR-002 additionally
requires the scenario-6 test to force a real timing difference between the
two replay invocations (Hazard 3) — otherwise a byte-identical result could
mean either "durationMs is correctly normalized" or "both runs just
happened to take the same measured time," and only the former is what
NFR-002 actually claims.

**Gates stated explicitly**: `tsc --noEmit` and `pnpm test` (full Vitest
suite, including every fixture suite) both run at the close of every
concern above, not only at the mission's end — IC-01 and IC-03 in
particular are small enough that a full green gate after each is cheap
and catches regressions before they compound into IC-04's larger surface.
SonarCloud's ≥80%-new-code gate is the final, mission-closing check
(IC-06), consistent with how CI actually blocks the PR (charter Quality
Gates).

## Complexity Tracking

*No Charter Check violations — section intentionally empty.*
