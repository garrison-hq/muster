# Specification: Cassette Core Engine

**Mission:** `cassette-core-engine-01KZCWFE` (mission_id `01KZCWFEZC1TS3N5250Q5G0XPM`)
**Type:** software-dev
**Status:** Draft
**Source issue:** [garrison-hq/muster#99](https://github.com/garrison-hq/muster/issues/99) — `[M16] cassette-core-engine — the cassette format, the ChatClient decorator, and credential-free behave run replay`
**Programme:** muster cassette record/replay, wave 1 (epic #104)
**Fixes (absorbed, not separate):** #90 — mock literals in `src/adapters/openclaw-sop/runner.ts`
**Blocks:** M17 (#100), M18 (#101), M19 (#102) — and transitively M20 (#103)
**Seeds:** `issue.json`, `.kittify/charter/charter.md`, `AGENTS.md`

---

## Summary

muster today has one seam nearly every chat-based command calls through: `ChatClient.chat` /
`ToolChatClient.chatWithTools` (`src/core/behavioral/types.ts:187-192`,
`src/core/behavioral/client.ts:105-110`) — the one exception is `tools run`'s behavioral
selection probes (`src/adapters/tools/selection.ts`), which call an injected `FetchFn`
directly and never construct a `ChatClient`/`ToolChatClient` (see Non-Goals). Every
behavioral run through that seam is a live network call — there is no way to record a real
conversation and replay it later without credentials or network access, and no shared way
for a command to know "a recorded execution source is configured" as opposed to "a live
endpoint is configured."

This mission ships the **cassette mechanism**: a schema-versioned, canonical-JSON,
byte-stable recording format for chat exchanges; a `makeCassetteClient` decorator that
wraps any concrete `ChatClient`/`ToolChatClient` at that one seam with `record` / `replay`
/ `live` modes; `--cassette <dir> --record|--replay` wired into `behave run` end to end
(the flagship command, and the only one of muster's eight behavioral runners with no
endpoint skip-gate in front of it); and a **shared execution-source resolver**, exported
from core, that the five gate-bearing commands in wave 2 (#100/#101/#102) will consume
unmodified (#103/M20 is a test-fixture migration, not a gate-bearing CLI command — see
Dependencies & Assumptions).

It also folds in #90: `src/adapters/openclaw-sop/runner.ts` stamps every transcript's
`model`, `baseUrl`, and `durationMs` with unconditional literals (`"mock"`,
`"mock://test"`, `0`) regardless of whether the run was against a real credentialed
endpoint. Recording is meaningless while the thing being recorded lies about its own
provenance, so this fix lands first, in the same mission.

## Goals

- Ship a spec-agnostic cassette core module (types, canonical-JSON format
  reader/writer, request hashing, decorator) that imports no adapter code.
- Make `behave run --cassette <dir> --record` produce a byte-stable, credential-free
  recording of a live behavioral run.
- Make `behave run --cassette <dir> --replay` reproduce that run's verdicts with
  **zero** network access and **zero** credentials required.
- Fix #90 so SOP transcripts stamp real endpoint identity and measured timing,
  making recorded provenance trustworthy.
- Export a shared execution-source resolver with its own tests so wave-2 missions
  do not each reinvent "is a recorded source configured" logic.

## Non-Goals (Out of Scope)

- The other seven chat-based commands (`skills run`, `sop run`'s live endpoint probes
  beyond the #90 fix, `crosslayer`, `tools`, `memory`, `memory-utilization run`,
  `heartbeat`) — M17 (#100), M18 (#101), M19 (#102) wire cassette support into their own
  gate-bearing CLI surfaces. Of these, `tools run`'s behavioral selection probes
  (`src/adapters/tools/selection.ts`) do not construct a `ChatClient`/`ToolChatClient` at
  all — by design, they call an injected `FetchFn` directly (default `globalThis.fetch`)
  to stay outside NI-003's `FETCH_ALLOWED` scan — so `makeCassetteClient` cannot intercept
  them as this mission ships it. Wiring cassette support into `tools run` therefore first
  requires migrating `selection.ts` onto the `ChatClient`/`ToolChatClient` seam; that
  refactor is wave-2 (#101/M18) prerequisite work, not a drop-in consumption of this
  mission's decorator. `memory run` and `memory-utilization run` are chat-based but are
  not gate-bearing today (see below) — cassette wiring for either is still wave-2 scope,
  just without a `MUSTER_ENDPOINT` skip-gate to wrap.
- `a2a` — a separate JSON-RPC `sender` transport with zero `ChatClient` references;
  architecturally outside this seam, an explicit follow-up.
- A `muster regrade` verb. `--replay` already re-runs the graders against recorded
  exchanges, which is regrade; a dedicated verb ships only if a later mission proves
  it earns its own surface.
- Reuse of the unified-report-envelope sanitizer (its own FR in the separate
  report-envelope programme spec, #91/#92 — not this spec's FR-024). That sanitizer
  rewrites `apiKey` and regexes every
  `http(s)://` substring out of transcript text; a cassette must NOT inherit that,
  since request identity must be faithful for hashing. No shared types with #92
  beyond `Transcript`.
- Test-suite migration to cassette-backed fixtures (M20, #103), auto/record-if-absent
  mode, fuzzy response matching, and response normalization.
- Any change to the five gate-bearing commands' (`sop`, `crosslayer`, `heartbeat`,
  `skills`, `tools` — the chat-based commands that today skip their behavioral cases
  when `MUSTER_ENDPOINT` is unset; `memory` and `memory-utilization run` are chat-based
  but not gate-bearing, since neither auto-skips on a missing `MUSTER_ENDPOINT`) own
  `MUSTER_ENDPOINT` skip-gate behavior. `behave run` has no such gate today and none is
  added; the resolver ships here so wave 2 can wire its own gates around it later.

## Locked Decisions (inherited from triage — binding, not reopened here)

- **D1** — per-case files inside one directory per suite run; ordinal resets per
  case file; a suite-level index/provenance file accompanies the case files.
- **D2** — a replay miss is a failed run; the suite continues; misses are labeled
  distinctly from ordinary conformance failure.
- **D3** — in replay, the cassette dictates the run count; a conflicting explicit
  `--runs` is an error.
- **D4** — tool calls (`chatWithTools`) are in scope for v1, with the same keying
  as `chat`.
- **D7** — the corpus is committed under `fixtures/cassettes/`, is NI-001-scanned
  (already true — NI-001 walks `fixtures/`), and gets a dedicated size lint.
- **D8** — the mechanism is named "cassette"; the CLI surface is
  `--cassette <dir> --record|--replay`.

## Actors

- **Conformance author** — records a cassette against a live, credentialed endpoint
  once, then replays it repeatedly in development and CI with no credentials.
- **CI workflow** — runs `behave run --cassette <dir> --replay` on every PR with no
  secrets configured, and still gets a real pass/fail verdict against recorded
  responses.
- **Wave-2 mission implementer** (#100/#101/#102) — imports the exported cassette
  types, the decorator, and the execution-source resolver into a different adapter's
  CLI surface without modifying core.

## User Scenarios & Testing

### Primary User Stories

1. **Record once, replay forever.** A conformance author runs a behavioral suite
   against a real endpoint with `--cassette fixtures/cassettes/my-suite --record`,
   then commits the resulting files. From then on, `--replay` reproduces the same
   verdicts offline, with no API key and no network access, in CI or locally.
2. **A replay never lies about being live.** Every report a replay run produces is
   visibly marked as replayed, so a cassette-backed CI green can never be mistaken
   for a live-endpoint conformance pass.
3. **A stale cassette fails loudly, not silently.** If a case's cassette entry goes
   missing (endpoint behavior changed, case was edited), the affected run fails and
   is labeled as **staleness** — distinct from a real conformance failure — while
   the rest of the suite still finishes.
4. **Wave 2 does not reinvent this.** A later mission adding cassette support to
   `skills run`/`sop run`/`crosslayer` imports the same core types, decorator, and
   execution-source resolver unchanged.

### Acceptance Scenarios

#### Recording

1. **Given** a `behave run` manifest and a live, credentialed endpoint, **When** run
   with `--cassette <dir> --record`, **Then** muster writes one case file per case
   plus a suite index/provenance file into `<dir>`, each serialized as RFC 8785
   canonical JSON with a stamped `schemaVersion`.
2. **Given** the same suite recorded twice with identical inputs, **When** the two
   recordings are compared, **Then** the files are byte-identical except for the
   opt-in `durationMs` field.
3. **Given** a case whose endpoint base URL contains a credential-shaped fake token
   (e.g. `https://fake-token-abc123@api.example.com/v1`), **When** recorded,
   **Then** the persisted cassette files contain no API key value, no `apiKeyEnv`
   value, and no full endpoint URL — hostname only.
4. **Given** a probe whose request passes through a blinding/arm-ordering transform
   (e.g. `blindArmOrder`, `src/adapters/memory-utilization/rubric.ts:234`) before
   being sent to the client, **When** two calls carry the same post-transform
   request (`messages[]`, `opts`) but different pre-transform probe/arm identities,
   **Then** the recorded request-hash key is computed from the post-transform form
   only, so both calls collide under one ordinal-keyed entry per FR-005/FR-006; a
   hash computed over the pre-transform identity instead would produce two distinct
   keys and this scenario would fail.

#### Replay

5. **Given** a previously recorded cassette, **When** run with
   `--cassette <dir> --replay` with `MUSTER_ENDPOINT` unset and no API key
   environment variable set, **Then** the run completes, produces verdicts, and
   performs zero network I/O.
6. **Given** the same replay run twice, **When** the two verdict `--json` payloads
   are compared, **Then** they are byte-identical.
7. **Given** a k-of-n case (n ≥ 3) whose recorded exchanges share an identical
   request key, **When** replayed, **Then** the n recorded responses are returned
   in recorded order, each exactly once (ordinal-keyed, not re-shuffled).
8. **Given** any replay run's report or `--json` payload, **When** inspected,
   **Then** it carries `replayed: true`; a non-cassette or `--record` run's output
   carries no such field and is byte-identical to its pre-mission shape.

#### Miss and run-count discipline

9. **Given** a cassette with one recorded exchange deleted, **When** replayed,
   **Then** the affected run fails and is labeled distinctly as stale, the suite
   still completes its remaining cases, and the process exits with the normal
   failure exit code — not 0, not a skip code.
10. **Given** a cassette recorded with `n = 5` runs for a case, **When** replayed
    with no `--runs` flag, **Then** the run count used is 5, resolved from the
    cassette before any other run-count/`k` resolution.
11. **Given** the same cassette, **When** replayed with `--runs 3`, **Then** the
    command fails before any case executes, with an error naming both the
    requested count (3) and the recorded count (5).

#### CLI flag discipline

12. **Given** `behave run` invoked with `--record` or `--replay` but no
    `--cassette`, **When** parsed, **Then** it is a CLI usage error.
13. **Given** `behave run` invoked with both `--record` and `--replay`, **When**
    parsed, **Then** it is a CLI usage error (mutually exclusive).

#### Discrimination control and #90

14. **Given** a rigged cassette in `fixtures/cassettes/` whose recorded responses
    are constructed to flunk the graders, **When** replayed, **Then** the case
    fails; **When** the graders are stubbed or bypassed, **Then** this control's own
    test fails (proving the control is load-bearing, not decorative).
15. **Given** `sop run` executed against a real credentialed endpoint, **When** the
    resulting transcript is inspected, **Then** `model` and `baseUrl` reflect the
    real endpoint (hostname only) and `durationMs` reflects a measured duration —
    no `"mock"` literal remains at any of the three sites in
    `src/adapters/openclaw-sop/runner.ts`.

#### Decorator coverage

16. **Given** a `ToolChatClient` instance (not routed through any CLI command in
    this mission — no CLI surface here calls `chatWithTools`) decorated by
    `makeCassetteClient` in `record` mode, **When** `chatWithTools(messages, tools)`
    is called and the resulting cassette file is then loaded by a second decorator
    instance constructed in `replay` mode, **Then** the replayed call returns the
    same structured record with zero network I/O, keyed by its own request hash
    independent of any `chat` exchange in the same case (FR-011). This scenario is
    exercised as an integration-level test built directly against a `ToolChatClient`
    (bypassing the CLI, since none exists in this mission for `chatWithTools`);
    `skills run` — the only real `chatWithTools` consumer in the tree today — wraps
    it behind its own differently-shaped `TriggerChatClient` adapter
    (`src/adapters/skills/trigger.ts:115-122`), which is wave-2 (#100) scope, not
    this mission's.

### Edge Cases

- Recording into a directory that does not yet exist: the directory is created;
  recording into a non-empty directory from a prior, different suite is a
  plan-time decision (overwrite vs. append vs. reject — see Open Questions).
- A case whose recorded exchange count exceeds the number of calls actually made
  during replay (surplus recorded exchanges unused) — behavior is a plan-time
  decision; this spec only locks the *miss* direction (D2).
- A `chatWithTools` exchange interleaved with `chat` exchanges in the same case:
  each keeps its own request-hash keying and structured record shape (FR-011);
  they do not collide because the key is computed over the fully-built request,
  which differs by construction (tools present vs. absent).
- `--cassette <dir>` supplied with neither `--record` nor `--replay`: this spec
  does not define a "live-but-cassette-configured" third meaning beyond the
  execution-source resolver's own contract (FR-018) — CLI validation rejects it
  (FR-016) rather than silently defaulting to one mode.
- A replay whose case count differs from the manifest's case count (manifest
  edited after recording): each case is matched independently; a case present in
  the manifest but absent from the cassette is a miss for that case (D2), not a
  whole-suite abort.

## Requirements

### Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-001 | `src/adapters/openclaw-sop/runner.ts` MUST stamp `Transcript.model` and `Transcript.baseUrl` (hostname only) from the caller-supplied endpoint identity, and MUST measure `durationMs` around the client call(s), at all three sites currently hardcoding `model: "mock"`, `baseUrl: "mock://test"`, `durationMs: 0` — no unconditional mock literal remains. Closes #90. | Proposed |
| FR-002 | A new spec-agnostic core cassette module MUST export cassette types, a canonical-JSON format reader/writer, request hashing, and the `makeCassetteClient` decorator, importing no adapter code (NI-002/C-004 hold for the new module). | Proposed |
| FR-003 | The cassette format MUST persist one directory per suite run containing one file per case plus a suite index/provenance file, each serialized as RFC 8785 canonical JSON reusing `canonicalJson` from `src/core/canonical-json.ts`, with a stamped `schemaVersion`. | Proposed |
| FR-004 | Each recorded exchange MUST store a canonical-JSON request hash, a per-key ordinal, the fully-built request (`messages[]`, `opts`), the response, minimal provenance limited to the model name and the endpoint **hostname only** (extracted via `hostnameOf`, `src/core/behavioral/client.ts:57`, which this mission MUST export from that module for the cassette module to reuse — no parallel hostname-extraction implementation is added, mirroring C-003's canonicalization-reuse rule), and an **opt-in** `durationMs` field, recorded whenever a measured duration is available for the exchange. `durationMs` is excluded from the RFC 8785 canonical form used for NFR-001's byte-stability comparison (it is real, non-deterministic wall-clock timing, consistent with FR-001's real-timing requirement for SOP transcripts). Provenance never stores the full URL, never `apiKeyEnv`'s value, never key material. | Proposed |
| FR-005 | The request hash MUST be computed over the canonical-JSON form of the fully-built request (`messages[]`, `opts`) **after** any blinding/arm-ordering transform has been applied — never over a pre-blinding logical probe identity. | Proposed |
| FR-006 | The ordinal MUST reset per case file and increment per repeated identical request key within that file, so a k-of-n case with identical prompts replays n distinct recorded responses in recorded order. | Proposed |
| FR-007 | `makeCassetteClient` MUST decorate both `ChatClient.chat` (`types.ts:187-192`) and `ToolChatClient.chatWithTools` (`client.ts:105-110`) around any concrete client instance, without introducing a new fetch call site. | Proposed |
| FR-008 | In `record` mode, the decorator MUST pass every call through to the inner client unchanged and append the resulting exchange to the case's cassette file; the value returned to the caller MUST be identical to what the inner client returned. | Proposed |
| FR-009 | In `replay` mode, the decorator MUST NEVER perform network I/O; a call whose request key/ordinal has no matching recorded exchange MUST throw a hard error identifying the case and the missing key. | Proposed |
| FR-010 | In `live` mode (the default when no cassette is configured), the decorator MUST be fully inert: pass-through only, with no recording, no replay lookup, and no cassette file I/O. | Proposed |
| FR-011 | `chatWithTools` exchanges MUST be recorded/replayed as structured records in the same exchange shape and under the same request-hash keying as `chat` exchanges — not re-serialized into `chat`'s shape. | Proposed |
| FR-012 | The cassette format documentation MUST explicitly name the `ChatClient.chat()` information-loss limitation (only `choices[0].message.content` survives that seam — `finish_reason`, `usage`, additional `choices`, and the server-echoed `model` are discarded before it reaches cassette code) and state that cassette provenance records the **requested** model, never the served one, and MUST state the resulting `chat`/`chatWithTools` fidelity asymmetry. | Proposed |
| FR-013 | A replay miss MUST fail only the affected run/case, MUST NOT stop the suite from continuing to its remaining cases, MUST be labeled distinctly as staleness (not generic conformance failure) via a new additive, optional field on `RunVerdict`/`CaseVerdict` (exact name TBD at plan time, e.g. `stale?: boolean`) — never by embedding a recognizable substring in the existing free-text `error` field — consistent with the additive-field precedent `passRate` (`RunVerdict`/`CaseVerdict`) and `replayed` (FR-017) already establish, and the suite MUST still exit with its normal non-zero failure code — never 0, never a skip code. | Proposed |
| FR-014 | In replay mode, the run count MUST be resolved by reading the cassette **before** any other run-count/`k` resolution the runner performs, and an explicit `--runs` value that matches the recorded count MUST be accepted. | Proposed |
| FR-015 | In replay mode, an explicit `--runs <n>` value that conflicts with the cassette's recorded run count MUST fail — before any case executes — with an error naming both the requested and the recorded counts. | Proposed |
| FR-016 | `behave run` MUST accept `--cassette <dir>` with `--record`/`--replay` as mutually exclusive flags; supplying `--record` or `--replay` without `--cassette` MUST be a CLI usage error, and supplying both together MUST be a CLI usage error. | Proposed |
| FR-017 | Every report and `--json` payload produced by a `behave run --cassette <dir> --replay` invocation MUST carry `replayed: true`; non-cassette and `--record` invocations MUST NOT gain this field, so their existing `--json` output stays byte-identical to its pre-mission shape. | Proposed |
| FR-018 | The core module MUST export a shared execution-source resolver, `resolveExecutionSource(input: ExecutionSourceInput): ExecutionSourceResult`, shipped with its own unit tests independent of any wave-2 command, with the following documented contract: **input** `ExecutionSourceInput = { env?: NodeJS.ProcessEnv; cassetteReplayConfigured?: boolean; manifestHasEndpointBlock?: boolean }` (all fields optional; `env` defaults to `process.env`); **output** `ExecutionSourceResult = { configured: boolean; source: "cassette" \| "env" \| "manifest-endpoint-block" \| "none"; usedDeprecatedAlias: boolean }`; **precedence**, evaluated in order: (1) `cassetteReplayConfigured === true` always resolves `{ configured: true, source: "cassette" }` — a replay-configured cassette counts as a configured execution source regardless of any other input; (2) else `env.MUSTER_ENDPOINT` non-empty resolves `{ configured: true, source: "env", usedDeprecatedAlias: false }`; (3) else `env.MUSTER_BASE_URL` non-empty resolves `{ configured: true, source: "env", usedDeprecatedAlias: true }` (deprecated alias, matching `skills/trigger.ts`'s `resolveEndpointBaseUrl` canonical-wins-silently precedence); (4) else `manifestHasEndpointBlock === true` resolves `{ configured: true, source: "manifest-endpoint-block" }` (crosslayer's signal); (5) otherwise `{ configured: false, source: "none", usedDeprecatedAlias: false }`. This contract MUST replace all four existing call sites without further `src/core/` changes: `heartbeat/index.ts:497` and `sop`'s `buildSopClient`/`SOP_NOOP_CLIENT` (`cli/index.ts:1616-1646`) each pass only `{ env }`; `skills/trigger.ts:83-92`'s canonical/deprecated-alias precedence is reproduced by cases (2)-(3); `crosslayer`'s manifest-endpoint-block fallback (`cli/index.ts:936-943`, today detected by catching and string-matching an error message) is replaced by the caller passing `manifestHasEndpointBlock` explicitly instead of relying on error-message substring matching. | Proposed |
| FR-019 | `fixtures/cassettes/` MUST include a discrimination-control cassette whose recorded responses are rigged to fail the graders; a dedicated test MUST assert that replaying it produces a failing verdict, and that test MUST itself fail if the graders are stubbed or bypassed. | Proposed |
| FR-020 | A dedicated test MUST record a cassette against an endpoint whose configured base URL contains a credential-shaped fake token, then assert the persisted cassette files contain no API key value, no `apiKeyEnv` value, and no full endpoint URL. | Proposed |
| FR-021 | `tests/unit/invariants.test.ts` MUST gain a size lint over `fixtures/cassettes/`, and the combined invariant guard suite MUST continue to complete within its existing performance budget after the lint is added. | Proposed |
| FR-022 | A dedicated test MUST assert that `personaPrompt` (`src/core/behavioral/runner.ts`) reads none of `Date`, `Math.random`, or `process.env`, guarding the purity assumption the request-hash keying depends on. | Proposed |
| FR-023 | `pnpm test`, `tsc --noEmit`, and the SonarCloud quality gate MUST stay green with the new cassette module and the #90 fix included. | Proposed |
| FR-024 | `tests/unit/invariants.test.ts` MUST gain a fourth automated guard (NI-004) that scans all runner files for a `Promise.all` call wrapping a `.chat(`/`.chatWithTools(` call site, failing the guard if one is found, analogous to the existing NI-002/NI-003 pattern; this enforces C-006's sequential-only execution invariant as a regression-tested guarantee rather than a point-in-time assertion. | Proposed |

### Non-Functional Requirements

| ID | Requirement | Threshold / Measure | Status |
|----|-------------|----------------------|--------|
| NFR-001 | Recording MUST be byte-stable. | Recording the same suite twice against identical inputs yields byte-identical cassette files, modulo the opt-in `durationMs` field. | Proposed |
| NFR-002 | Replay MUST be credential-free and deterministic. | `--replay` completes and produces verdicts with `MUSTER_ENDPOINT` unset and no API key environment variable set; running it twice yields byte-identical verdict `--json`. | Proposed |
| NFR-003 | Replay MUST perform zero network I/O. | 0 network/`fetch` invocations observed during a replay run, asserted by test. | Proposed |
| NFR-004 | The decorator MUST introduce no new fetch call site. | `tests/unit/invariants.test.ts`'s NI-003 `FETCH_ALLOWED` list stays exactly `["src/core/behavioral/client.ts", "src/adapters/a2a/transport.ts"]`. | Proposed |
| NFR-005 | New cassette-core code MUST meet the project's new-code coverage gate. | ≥ 80% coverage on new code (SonarCloud quality gate), lcov-uploaded. | Proposed |
| NFR-006 | Existing `--json` output for every non-cassette and non-replay command path MUST NOT change. | 100% of pre-mission `--json` golden/byte-stability tests still pass unchanged. | Proposed |
| NFR-007 | The invariant guard suite (including the new size lint and the new NI-004 sequential-execution guard) MUST stay inside its existing combined performance budget. | Combined NI-001/002/003/004 (+ size lint) runtime ≤ the suite's existing 2000 ms budget. | Proposed |

### Constraints

| ID | Constraint | Status |
|----|------------|--------|
| C-001 | No file under `src/core/` (including the new cassette module) may import from `src/adapters/` — the NI-002 core→adapter boundary. | Accepted |
| C-002 | No new fetch call site: the decorator wraps an existing `ChatClient`/`ToolChatClient` instance and never calls `fetch` itself (NI-003). | Accepted |
| C-003 | Canonicalization reuses `src/core/canonical-json.ts` (`canonicalJson`); no parallel canonicalization implementation is added. | Accepted |
| C-004 | Cassette provenance never stores API key values, `apiKeyEnv` values, or full endpoint URLs — hostname only, matching the client's existing error-hygiene convention (`hostnameOf` in `client.ts`, which this mission exports from that module so the cassette module reuses it directly — no parallel hostname-extraction/redaction implementation is added, mirroring C-003's reuse mandate for `canonicalJson`). | Accepted |
| C-005 | The execution-source resolver (`resolveExecutionSource`, contract defined in FR-018) ships in this mission, exported from core, for wave-2 (#100/#101/#102) to consume by passing their own call-site-specific `ExecutionSourceInput` — no further modification to `src/core/` is required at any of the four wave-2 call sites (heartbeat, sop, skills, crosslayer). | Accepted |
| C-006 | The sequential-only, per-suite model-call execution model (no `Promise.all` around any model call, confirmed across all eight behavioral runners) is preserved and enforced by an automated regression guard (NI-004, FR-024); this mission introduces no concurrent model-call path, since ordinal keying depends on strict sequencing. | Accepted |
| C-007 | All changes land on `main` via a pull request passing the build+test and SonarCloud gates (charter Branch Strategy). | Accepted |
| C-008 | muster remains a conformance harness: the cassette mechanism adds no runtime, registry, or hosted-service behavior (BRIEF.md scope guard, charter Project Directive 1). | Accepted |
| C-009 | No reuse of the unified-report-envelope sanitizer (#91/#92); no shared types with #92 beyond `Transcript`. | Accepted |

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | A conformance author can record a live behavioral run once and replay it indefinitely afterward with no credentials and no network access. |
| SC-002 | A cassette-backed CI run can never be mistaken for a live conformance pass — every replay output is marked `replayed: true`. |
| SC-003 | A stale cassette produces a clearly labeled failure, not a silent pass, a skip, or a suite abort. |
| SC-004 | No credential value or full endpoint URL ever appears in a committed cassette file. |
| SC-005 | `sop run` transcripts reflect real endpoint identity and measured timing; no `"mock"` literal remains at the three fixed sites. |
| SC-006 | Wave-2 missions (#100/#101/#102) can import the cassette core types, decorator, and execution-source resolver (`resolveExecutionSource`, FR-018) without any change to `src/core/`, each passing its own `ExecutionSourceInput` (env snapshot, cassette-replay flag, and/or manifest-endpoint-block signal per call site). |
| SC-007 | All previously passing behavioral and invariant tests, and all previously byte-stable `--json` output, are unchanged by this mission. |

## Key Entities

- **Cassette suite directory** — one directory per recorded suite run, holding one
  file per case plus a suite index/provenance file (D1).
- **Case cassette file** — the recorded exchanges for one case; ordinal resets at
  the start of this file.
- **Suite index/provenance file** — per-suite metadata accompanying the case files
  (`schemaVersion`, suite identity); exact schema is a plan-time detail.
- **Exchange** — one recorded request/response pair: request hash, ordinal, the
  fully-built request (`messages[]`, `opts`), the response, minimal provenance
  (requested model, endpoint hostname), and an opt-in `durationMs` (excluded from
  byte-stability comparison, FR-004/NFR-001).
- **Request hash** — the canonical-JSON hash of the fully-built, post-transform
  request (i.e. computed *after* any blinding/arm-ordering transform such as
  `blindArmOrder` has already been applied, never over a pre-transform probe
  identity — FR-005); the keying identity for an exchange.
- **Ordinal** — a per-key, per-case-file sequence number distinguishing repeated
  identical-key exchanges (k-of-n identical prompts).
- **Decorator (`makeCassetteClient`)** — wraps a `ChatClient`/`ToolChatClient` in one
  of three modes: `record` (pass-through + append), `replay` (never touches the
  network; miss is a hard error), `live` (inert, default).
- **Execution-source resolver (`resolveExecutionSource`)** — a core-exported
  function taking an `ExecutionSourceInput` (optional env snapshot, optional
  cassette-replay flag, optional manifest-endpoint-block signal) and
  precedence-resolving whether an execution source is configured: cassette >
  `MUSTER_ENDPOINT` > deprecated `MUSTER_BASE_URL` alias > manifest endpoint block
  > none. A replay-configured cassette always counts as configured, regardless of
  any other input. Consumed by wave-2 commands (FR-018).
- **Discrimination-control cassette** — a rigged `fixtures/cassettes/` entry whose
  recorded responses must fail the graders, proving replay-time grading can fail.
- **`chat`/`chatWithTools` fidelity asymmetry** — `chat()` returns only
  `choices[0].message.content` (information-lossy); `chatWithTools()` returns the
  raw payload (strictly more fidelity). Cassette provenance records the requested
  model in both cases, never the served one.

## Dependencies & Assumptions

- **Depends on**: the existing `ChatClient`/`ToolChatClient` seam
  (`src/core/behavioral/types.ts`, `src/core/behavioral/client.ts`), the existing
  canonical-JSON serializer (`src/core/canonical-json.ts`), the existing invariant
  guard suite (`tests/unit/invariants.test.ts`), and the existing `behave run` CLI
  command (`src/cli/index.ts`).
- **Absorbs**: #90 — folded in as FR-001 rather than a separate mission, because it
  is a three-site literal change too small to stand alone and must land before any
  recording is trustworthy.
- **Blocks**: M17 (#100), M18 (#101), M19 (#102) — the format, decorator, and
  execution-source resolver they all consume — and transitively M20 (#103). #103 is
  test-suite migration to cassette-backed fixtures, not a CLI command with its own
  gate; it is not among the five gate-bearing commands named in Summary/Non-Goals.
- **Not blocked by**: the report-envelope programme (#91/#92). Cassettes are
  fixtures, not reports: a separate artifact family, schema, and flag surface.
- **Assumption**: all eight behavioral runners (`behave`, `memory`,
  `memory-utilization`, `crosslayer`, `heartbeat`, `skills`, `sop`, `tools`) execute
  cases and runs sequentially — no `Promise.all` around any model call — confirmed
  in the current tree and enforced going forward by the NI-004 guard (FR-024); the
  ordinal keying scheme depends on this remaining true.
- **Assumption**: `personaPrompt` is a pure function of its inputs (no `Date`,
  `Math.random`, `process.env`); currently asserted only in a doc comment (FR-022
  adds the guarding test).
- **Assumption**: `node:crypto`'s `createHash` (already used in
  `src/adapters/spec-kitty-profile/projection.ts:32,133` — the only existing
  `createHash` call site in `src/`) is available and sufficient for request
  hashing — no new runtime dependency is required. (`src/adapters/a2a/signature.ts`
  uses `node:crypto`'s `createPublicKey`/`verify` for signature checking, not
  `createHash`; it is not a second `createHash` precedent.)

## Open Questions / Risks

- **Suite index/provenance file schema** — the exact field set beyond
  `schemaVersion` and suite identity is a plan-time decision, not locked here.
- **Non-empty target directory on `--record`** — overwrite, append, or reject
  semantics when `<dir>` already holds a prior recording are undecided; a
  plan-time decision, not a scope question.
- **Surplus recorded exchanges** — this spec locks the *miss* direction (D2: a
  cassette missing an exchange fails that run); it does not define behavior when a
  case's cassette has more recorded exchanges than calls made during replay.
  Risk: an unstated default here could silently mask a case that under-calls its
  endpoint relative to what was recorded.
- **File-per-case vs. sub-suite grouping when a manifest's "case" fans out into
  multiple probes** (as in the SOP adapter's compliance/adversarial split) — the
  cassette core module is generic; how a specific adapter maps its own case
  concept onto one cassette case file is left to each adapter, consistent with
  C-001/C-004, but the mapping convention itself is a plan-time detail.
- **Corpus growth risk** — `fixtures/cassettes/` is git-committed; FR-021's size
  lint mitigates unbounded growth blowing the invariant suite's performance
  budget, but the lint's exact threshold is a plan-time number.
- **`chatWithTools` has no CLI exercise path within this mission** — `behave run`
  (this mission's only wired CLI surface) never calls `chatWithTools`; its client
  factory type is a plain `ChatClient` (`src/cli/index.ts:157-159`) and the runner
  engine only ever calls `.chat(...)` (`src/core/behavioral/runner.ts:255,384`).
  `chatWithTools` decoration is validated instead by the Decorator-coverage
  acceptance scenario, an integration-level test built directly against a
  `ToolChatClient`. `TriggerChatClient` (`src/adapters/skills/trigger.ts`), the only
  real `chatWithTools` consumer in the tree today, is structurally distinct from
  core's `ToolChatClient` (`chatWithTools(userMessage: string, tools:
  ToolDefinition[]): Promise<string | null>` vs. core's `chatWithTools(messages:
  ChatMessage[], tools: unknown[]): Promise<unknown>`) — wave-2's `skills run`
  integration (#100) will need its own adapter-level wrapping around the decorated
  core client, not a drop-in swap.
- **`tools run`'s behavioral probes need a seam refactor before wave-2 cassette
  wiring is possible** — `src/adapters/tools/selection.ts` bypasses
  `ChatClient`/`ToolChatClient` entirely via an injected `FetchFn`, so
  `makeCassetteClient` cannot intercept it as shipped by this mission (see
  Non-Goals). Migrating `selection.ts` onto the `ChatClient`/`ToolChatClient` seam
  is an unscoped prerequisite that wave-2 (#101/M18) must account for.
