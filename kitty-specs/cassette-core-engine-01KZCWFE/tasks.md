# Tasks: Cassette Core Engine

**Mission**: `cassette-core-engine-01KZCWFE`
**Input**: `spec.md` (24 FRs, 7 NFRs, 9 constraints, 7 success criteria, 16 acceptance scenarios), `plan.md` (Implementation Concern Map IC-01..IC-06, Charter Check, Project Structure, Hazards 1-3, NI-004 design, Test Strategy) — both already passed full adversarial review; treated here as locked, not re-litigated.
**Branch contract**: `meta.json` declares `topology: coord`, `coordination_branch: kitty/mission-cassette-core-engine-01KZCWFE`, `target_branch: main`. WPs execute in dependency-ordered lanes off this coordination branch; completed changes merge back into `main`.

**Ownership note**: six work packages, mapped 1:1 to plan.md's Implementation Concern Map (IC-01..IC-06) — no concern was split or merged. `owned_files` are sliced so no two WPs *create* the same file; two files are deliberately **extended by a second WP after the first WP's version has merged** (sequential, not concurrent, edits — see the two bullets below), because the plan places one FR's dedicated assertion inside a file whose surrounding suite belongs to an earlier concern:

- **WP01** — `src/adapters/openclaw-sop/runner.ts`, the `doSopRun`/`buildSopClient` region of `src/cli/index.ts` (~L1615-1686), `tests/adapters/openclaw-sop/runner.test.ts` (IC-01).
- **WP02** — `src/core/execution-source.ts`, `tests/unit/execution-source.test.ts` (IC-03).
- **WP03** — `src/core/cassette/{types,hash,errors,store,client,index}.ts`, the one-line `hostnameOf` export in `src/core/behavioral/client.ts`, `tests/cassette/{hash,store,client,client-tools}.test.ts` (IC-02).
- **WP04** — the `BehaveOpts`/`behave run` command/`doBehaveRun` regions of `src/cli/index.ts` (~L387-393, ~L1978-2011, ~L414-489), `src/core/behavioral/types.ts` (`stale?: boolean`), `src/core/behavioral/runner.ts`'s `runCase` catch block (~L562), `tests/unit/cli.test.ts`'s existing `"muster behave run"` describe block (line 377), `tests/behavioral/runner.test.ts` (pre-existing 895-line file with 11 describe blocks — extended here, not created: FR-013 stale-propagation assertion added as a new describe/it block) (IC-04).
- **WP05** — `tests/unit/invariants.test.ts` (NI-004 + size lint), `fixtures/cassettes/discrimination-control/**`, `tests/cassette/discrimination-control.test.ts`, **plus two sequential extensions**: `tests/cassette/store.test.ts` (WP03's file — adds FR-020's credential-redaction assertion) and `tests/behavioral/runner.test.ts` (WP04's file — adds FR-022's `personaPrompt` purity guard) (IC-05).
- **WP06** — `docs/guides/cassette-format.md`, `tests/cassette/public-api.test.ts` (IC-06).

**Extension-not-overlap note**: plan.md's own Project Structure places FR-020's "no credential ever persisted" assertion physically inside `store.test.ts` ("FR-020's dedicated assertion lives here too") while its FR/Concern coverage table attributes FR-020 to IC-05, and separately places FR-022's `personaPrompt` purity guard inside `tests/behavioral/runner.test.ts` while attributing FR-022 to IC-05 even though that file's `stale`-propagation assertion belongs to IC-04. Both are genuine same-file, different-requirement additions from two different concerns, not a mistake to resolve away — but the two files reach this mission with different starting states, and the framing must match each: `store.test.ts` under `tests/cassette/` does not exist before this mission (`tests/cassette/` is a new directory) — WP03 genuinely creates it fresh, and WP05 extends that WP03-created file after WP03 has merged. `tests/behavioral/runner.test.ts`, by contrast, already exists pre-mission (895 lines, 11 describe blocks, including a pre-existing `describe("personaPrompt rendering", ...)`) — neither WP04 nor WP05 creates it; both modify already-existing content, WP04 first (adding the FR-013 stale-propagation test), WP05 second (adding the FR-022 purity guard on top of WP04's merged state). Because WP05 already depends on WP03 and WP04 (see below), all four of these edits are always sequenced *after* the file reaches the state each extension needs — WP05's edits never land concurrently with WP03's or WP04's edits to the same file, so no merge conflict is possible under the phase ordering below.

## Requirement → Work Package map

| ID | Requirement (short) | WP |
|----|---------------------|----|
| FR-001 | SOP runner stamps real `model`/`baseUrl`/measured `durationMs`, no mock literal (closes #90) | WP01 |
| FR-002 | Core cassette module exports types, canonical-JSON reader/writer, hashing, decorator; no adapter imports | WP03 |
| FR-003 | One directory per suite run, one file per case + suite index, RFC 8785 canonical JSON, `schemaVersion` | WP03 |
| FR-004 | Exchange shape: hash, ordinal, request, response, `{model, hostname}` provenance, opt-in `durationMs` | WP03 |
| FR-005 | Request hash computed post-transform (after `blindArmOrder`), never pre-transform | WP03 |
| FR-006 | Ordinal resets per case file, increments per repeated identical key | WP03 |
| FR-007 | `makeCassetteClient` decorates both `chat` and `chatWithTools`, no new fetch call site | WP03 |
| FR-008 | Record mode: pass-through + append, return value unchanged | WP03 |
| FR-009 | Replay mode: never network I/O, miss throws identifying error | WP03 |
| FR-010 | Live mode (default): fully inert pass-through | WP03 |
| FR-011 | `chatWithTools` recorded/replayed in its own shape, own keying | WP03 |
| FR-012 | Cassette format doc names the `chat()` information-loss limitation and fidelity asymmetry | WP03 (type/behavior) + WP06 (doc) |
| FR-013 | Replay miss fails only that run, suite continues, `stale` field, normal non-zero exit | WP04 |
| FR-014 | Replay run count resolved from cassette before any other resolution | WP04 |
| FR-015 | Conflicting explicit `--runs` fails before any case executes, names both counts | WP04 |
| FR-016 | `--record`/`--replay` require `--cassette`; both together is a usage error | WP04 |
| FR-017 | `replayed: true` only on replay `--json`/report output; other paths unchanged | WP04 |
| FR-018 | `resolveExecutionSource` exported with its own tests, 5-branch precedence | WP02 |
| FR-019 | Discrimination-control cassette + load-bearing failing-graders test | WP05 |
| FR-020 | Credential-shaped fake-token recording test asserts no key/URL persisted | WP05 (assertion added to WP03's `store.test.ts`) |
| FR-021 | `fixtures/cassettes/` size lint in the invariant suite | WP05 |
| FR-022 | `personaPrompt` purity guard (no `Date`/`Math.random`/`process.env`) | WP05 (assertion added to WP04's `tests/behavioral/runner.test.ts`) |
| FR-023 | `pnpm test`/`tsc --noEmit`/SonarCloud gate stay green with everything included | WP06 (cross-cutting final gate) |
| FR-024 | NI-004: `Promise.all`-wraps-`.chat(`/`.chatWithTools(` regression guard | WP05 |

NFR-001 (byte-stable recording) → WP03 (unit-level, `store.test.ts`) + WP04 (CLI-level record-twice round trip, Scenario 2). NFR-002 (credential-free deterministic replay) → WP04. NFR-003 (zero network I/O) → WP04. NFR-004 (no new fetch call site) → WP03, verified structurally (no `fetch(` added anywhere under `src/core/cassette/`) plus NI-003's pre-existing `FETCH_ALLOWED` assertion in `tests/unit/invariants.test.ts` continuing to pass unmodified — no new test file is needed or added for this NFR. NFR-005 (≥80% new-code coverage) → WP06, cross-cutting, checked against every WP's new code. NFR-006 (non-cassette `--json` unchanged) → WP04. NFR-007 (invariant suite budget) → WP05.

C-001/C-002/C-003/C-004/C-009 → WP03 (core/adapter boundary, no new fetch site, `canonicalJson`/`hostnameOf` reuse, no sanitizer reuse). C-005 (resolver ships unwired) → WP02, with WP01 called out as the one pre-approved exception (FR-001 changes what `buildSopClient` stamps, not the `MUSTER_ENDPOINT` skip-gate decision — Charter Check's own caveat). C-006 (sequential-only execution, regression-enforced) → WP05 (NI-004) and structurally true of every WP (none introduces a `Promise.all` around a model call). C-007 (PR + gates on `main`) and C-008 (conformance-harness scope guard) are process/scope constraints satisfied by the existing merge pipeline, not tied to one WP.

Every FR-001..024, NFR-001..007, and C-001..009 maps to at least one WP. None are unmapped.

## Subtask Index

| ID | Description | WP | Parallel |
|---|---|---|---|
| T001 | `src/adapters/openclaw-sop/runner.ts`: `SuiteRunOptions` gains `model`/`baseUrl`; `runProbeOnce` times its client-call loop and stamps real `model`/`baseUrl` (via `hostnameOf`) instead of `"mock"`/`"mock://test"`/`0` at all three sites (~L191-194, ~L351-354, ~L424-427) | WP01 | [P] |
| T002 | `src/cli/index.ts`: `doSopRun`/`buildSopClient` (~L1615-1686) thread `{model, baseUrl}` through to the suite runner; `"unconfigured"`/`"unconfigured://no-endpoint"` sentinel used only when no endpoint is configured | WP01 | |
| T003 | `tests/adapters/openclaw-sop/runner.test.ts`: Scenario 15 — mock client with a deliberate ≥5ms async delay, assert `durationMs >= 5`, real `model`/hostname-only `baseUrl` asserted, no `"mock"` literal remains at any of the three sites | WP01 | |
| T004 | WP01 verification gate: `pnpm test` and `tsc --noEmit` green | WP01 | |
| T005 | `src/core/execution-source.ts`: `resolveExecutionSource(input)` — 5-branch precedence (cassette-replay > `MUSTER_ENDPOINT` > deprecated `MUSTER_BASE_URL` alias > manifest-endpoint-block > none) per FR-018's contract | WP02 | [P] |
| T006 | `tests/unit/execution-source.test.ts`: one test per precedence branch, plus the two falsification cases (`MUSTER_BASE_URL` alone → `usedDeprecatedAlias: true`; both env vars set → `MUSTER_ENDPOINT` wins silently, matching `skills/trigger.ts`'s `resolveEndpointBaseUrl`) | WP02 | |
| T007 | WP02 verification gate | WP02 | |
| T008 | `src/core/cassette/types.ts`: `CassetteMode`, `CassetteExchange` (`kind`/`requestHash`/`ordinal`/`request`/`response`/`provenance`/`durationMs`), `CassetteCaseFile`, `CassetteSuiteIndex`, `SCHEMA_VERSION` | WP03 | [P] |
| T009 | `src/core/cassette/hash.ts`: `computeRequestHash` — sha256 hex over `canonicalJson(request)`, post-transform only (FR-005) | WP03 | |
| T010 | `src/core/cassette/errors.ts`: `CassetteMissError` identifying the case id and missing `(requestHash, ordinal)` key (FR-009/013) | WP03 | |
| T011 | `src/core/cassette/store.ts`: `writeCassetteCase`/`readCassetteCase`, `writeCassetteSuiteIndex`/`readCassetteSuiteIndex`; one file per case + one suite index (D1/FR-003); redaction via `hostnameOf` (C-004); `durationMs` excluded from the compared/hashed form (FR-004/NFR-001); non-empty-target-directory semantics — overwrite only this run's own files, never delete untouched files (design decision #2) | WP03 | |
| T012 | `src/core/behavioral/client.ts`: add `export` to `hostnameOf` (one-line, C-004, no behavior change) | WP03 | [P] |
| T013 | `src/core/cassette/client.ts`: `makeCassetteClient(inner, opts)` — record (pass-through + append)/replay (never touches network, miss throws `CassetteMissError`)/live (fully inert) modes over both `chat` and `chatWithTools`, no new fetch call site (FR-007..011) | WP03 | |
| T014 | `src/core/cassette/index.ts`: public barrel re-exporting the above | WP03 | |
| T015 | `tests/cassette/hash.test.ts`: FR-005 — post-transform hashing; `blindArmOrder` (`src/adapters/memory-utilization/rubric.ts:234`) collision proof (Scenario 4) | WP03 | |
| T016 | `tests/cassette/store.test.ts`: FR-003/004/006 — file format, ordinal reset/increment for k-of-n identical prompts (Scenario 1, 7), non-empty-target-directory behavior (pre-populate with an unrelated file + a stale case file from a different suite, record, assert only the current suite's files changed) | WP03 | |
| T017 | `tests/cassette/client.test.ts`: FR-007..011 — record/replay/live mode contracts | WP03 | |
| T018 | `tests/cassette/client-tools.test.ts`: Decorator-coverage acceptance scenario (Scenario 16) — `chatWithTools` record→replay round trip via a raw `ToolChatClient`, zero network I/O, own request-hash keying independent of any `chat` exchange | WP03 | |
| T019 | WP03 verification gate | WP03 | |
| T020 | `src/cli/index.ts`: `BehaveOpts` (~L387-393) gains `cassette?: string`, `record?: boolean`, `replay?: boolean` | WP04 | |
| T021 | `src/cli/index.ts`: `behave run` command definition (~L1978-2011) gains `--cassette <dir>`, `--record`, `--replay` options | WP04 | |
| T022 | `src/cli/index.ts`: `doBehaveRun` (~L414-489) — flag validation (FR-016), replay run-count preflight reading only `readCassetteSuiteIndex` (FR-014/015), per-case `makeCassetteClient` construction (FR-007..010), `replayed: true` output-envelope branch for `--json` and human formatter (FR-017, Hazard 2), replay-only `durationMs` normalization to `0` three levels deep before `JSON.stringify` (Hazard 3, NFR-002), exit-2 "endpoint fatal" heuristic gated off when `opts.replay === true` (Hazard 1) | WP04 | |
| T023 | `src/core/behavioral/types.ts`: `stale?: boolean` added to `RunVerdict` and `CaseVerdict` (FR-013, additive, mirrors the `passRate` precedent) | WP04 | |
| T024 | `src/core/behavioral/runner.ts`: `runCase`'s existing catch block (~L562) gains an `instanceof CassetteMissError` check setting `stale: true`, reusing the untouched error-containment path | WP04 | |
| T025 | `tests/unit/cli.test.ts`: new cases inside the existing `"muster behave run"` describe block (line 377) — flag validation (FR-016, Scenario 12/13), record-twice byte-stability (NFR-001, Scenario 2), replay-twice byte-identical `--json` incl. a deliberate timing difference between invocations proving `durationMs` normalization (NFR-002, Scenario 6, Hazard 3), `replayed: true` shape present only on replay (FR-017, Scenario 8), zero network I/O via `vi.spyOn(globalThis, "fetch")` mirroring the `cli.test.ts:727` precedent (NFR-003, Scenario 5), stale-miss exit code 1 not 2 (FR-013, Scenario 9, Hazard 1), `n=5` recorded/no `--runs` uses 5 (FR-014, Scenario 10), `--runs 3` vs. recorded 5 fails before any case executes naming both counts (FR-015, Scenario 11) | WP04 | |
| T026 | `tests/behavioral/runner.test.ts` (existing 895-line file — add a new `describe`/`it` block, do not overwrite): `stale` field propagation assertion — a replay run against a cassette missing an exchange produces a `CaseVerdict`/`RunVerdict` with `stale: true` (FR-013) | WP04 | |
| T027 | WP04 verification gate | WP04 | |
| T028 | `tests/unit/invariants.test.ts`: NI-004 — quote/template-literal-aware comment stripper + paren-balanced enclosure walk (shared `trackQuoteState`-style helper) detecting a `Promise.all` call wrapping a `.chat(`/`.chatWithTools(` call site; directory-walked over `src/adapters/`, `src/core/behavioral/`, `src/crosslayer/` (83 `.ts` files; 10 currently contain a `.chat(`/`.chatWithTools(` call site) using the existing `walk()`/`BASE_EXCLUDES` helpers; `PROMISE_ALL_CALL` token built by concatenation matching `FETCH_CALL`'s style; folded into the existing combined timer (FR-024/C-006, NFR-007) | WP05 | |
| T029 | `tests/unit/invariants.test.ts`: NI-004 fixture coverage — `src/adapters/memory-utilization/index.ts` and `src/crosslayer/rule-survival.ts` must report zero violations (both contain a `"Promise.all"` comment substring near a real `.chat(` site); two direct helper-function unit assertions (not filesystem-walked) proving the quote-aware stripper leaves real code after an in-string `//` intact, and the paren-balance walk is not desynced by an unbalanced `(` inside a string argument | WP05 | |
| T030 | `tests/unit/invariants.test.ts`: `fixtures/cassettes/` size lint — `readdirSync` walk summing `statSync(...).size`, 2 MiB threshold, folded into the same combined timer (FR-021/D7) | WP05 | |
| T031 | `fixtures/cassettes/discrimination-control/index.json` + `rigged-case.json`: committed, git-tracked cassette whose recorded responses are rigged to flunk the graders, authored using WP03's decorator record mode against a scripted mock `ChatClient` (D7/FR-019) | WP05 | |
| T032 | `tests/cassette/discrimination-control.test.ts`: FR-019 — `behave run --cassette fixtures/cassettes/discrimination-control --replay` produces a failing verdict (Scenario 14); a second assertion with the graders stubbed/bypassed proves the control itself then fails, i.e. is load-bearing | WP05 | |
| T033 | `tests/cassette/store.test.ts` (extends WP03's file): FR-020 — record against an endpoint whose configured base URL contains a credential-shaped fake token (`https://fake-token-abc123@api.example.com/v1`); assert the persisted cassette files contain no API key value, no `apiKeyEnv` value, and no full endpoint URL, hostname only (Scenario 3) | WP05 | |
| T034 | `tests/behavioral/runner.test.ts` (extends WP04's file): FR-022 — `personaPrompt` (`src/core/behavioral/runner.ts`) purity guard, asserting its source reads none of `Date`, `Math.random`, `process.env` | WP05 | |
| T035 | WP05 verification gate | WP05 | |
| T036 | `docs/guides/cassette-format.md` (new): the `chat()`/`chatWithTools()` fidelity asymmetry, the information-loss limitation (only `choices[0].message.content` survives the `chat()` seam — `finish_reason`/`usage`/additional `choices`/server-echoed `model` are discarded), and the requested-vs-served model distinction (FR-012) | WP06 | [P] |
| T037 | `tests/cassette/public-api.test.ts` (new): SC-006 — imports `makeCassetteClient` (WP03) and `resolveExecutionSource` (WP02) from a path outside `src/core/`, the way a wave-2 adapter would, proving genuine cross-boundary consumption | WP06 | |
| T038 | Final gate verification (FR-023): `pnpm test` (full Vitest suite incl. every fixture suite) and `tsc --noEmit` green with every WP's changes included; the authoritative coverage check is SonarCloud's ≥80%-new-code quality gate in CI (NFR-005, charter Quality Gates) — the check that actually blocks the PR, measured on changed lines only, not on any file's aggregate. Locally, run `pnpm test:coverage` (`vitest run --coverage`, `package.json:77`) and inspect the v8 text/lcov summary (`vitest.config.ts:11-14`, `include: ["src/**"]`) as a pre-PR proxy, reading it per file class: for the wholly-new files this mission adds — `src/core/cassette/{types,hash,errors,store,client,index}.ts`, `src/core/execution-source.ts` — whole-file coverage *is* new-code coverage, so assert each reports ≥80% line and branch coverage directly from the summary, and fail the gate on any shortfall there. For the large, only-partially-touched shared files this mission edits — `src/adapters/openclaw-sop/runner.ts`, `src/cli/index.ts` (2364 lines total; this mission touches ~3 narrow regions of it), `src/core/behavioral/{types,client,runner}.ts` — the file's aggregate percentage is not a valid stand-in (pre-existing, unrelated code in those files can pull it either direction independent of this mission's own lines); instead open the lcov report's per-line hit annotations for just the regions this mission changed (per WP: T001/T002 in `runner.ts`/`index.ts`'s SOP region, T012 in `behavioral/client.ts`'s `hostnameOf` export, T020-T022/T024 in `index.ts`'s `behave run` region and `behavioral/runner.ts`'s catch block) and confirm ≥80% of each region's changed lines/branches are hit, matching NFR-005's threshold exactly rather than a stricter 100%-hit bar; fail the gate and route back to the under-covered WP if a changed region's hit rate falls below 80%. T023's `stale?: boolean` addition to `behavioral/types.ts` is excluded from this per-region enumeration: `grep -nE '^(export )?(function|const|class|enum)' src/core/behavioral/types.ts` returns no matches — the whole 192-line file is interface/type declarations only, erased at compile time, so there is no executable line or branch there for v8/lcov to report and the change carries no coverage obligation. Treat the regional read as a local sanity check only — SonarCloud's own new-code measurement in CI is the check of record and can still differ (NFR-005) | WP06 | |

## Phase 1 — Independent foundations (WP01, WP02, WP03 — genuinely parallel)

Plan.md states this explicitly: "IC-01 and IC-03 have no dependency on the core module and can run in parallel with it." The three WPs touch entirely disjoint files (`openclaw-sop/runner.ts` + a narrow slice of `cli/index.ts`; `execution-source.ts`; `core/cassette/**` + a one-line export in `behavioral/client.ts`) and none imports from either of the other two's new code, so there is no ordering constraint between them — only later phases depend on their outputs.

### WP01 — SOP transcript provenance fix (closes #90) — prompt: `tasks/WP01-sop-provenance-fix.md`

**Goal**: stamp `Transcript.model`/`baseUrl`/`durationMs` from real, measured values at all three sites in `src/adapters/openclaw-sop/runner.ts` that currently hardcode `"mock"`/`"mock://test"`/`0`, and thread the real endpoint identity through `buildSopClient`/`doSopRun`. Lands first per spec.md's own mandate ("recording is meaningless while the thing being recorded lies about its own provenance") even though it has no technical dependency on anything else in this mission.
**Priority**: P1 · **Estimated prompt size**: ~150 lines
**Independent test**: `pnpm test` green; `grep -n '"mock"' src/adapters/openclaw-sop/runner.ts` returns no hits; Scenario 15's delayed-mock-client test fails if the `durationMs: 0` literal is reintroduced.

- T001 `runner.ts` three-site stamp fix (WP01)
- T002 `cli/index.ts` `doSopRun`/`buildSopClient` threading (WP01)
- T003 Scenario 15 regression test (WP01)
- T004 WP01 verification gate (WP01)

**Dependencies**: none.
**Parallel**: [P] with WP02 and WP03 (disjoint files, no shared types). T001 and T002 are sequential within the WP (T002 needs the widened `SuiteRunOptions` T001 introduces).
**Risks**: every existing mock `ChatClient` factory in `tests/adapters/openclaw-sop/runner.test.ts` (`makeMockClient`, `makeConstantClient`, `makeRunVaryingJudgeClient`, `makeErrorClient`) resolves synchronously — a test that only asserts `durationMs` is a number would pass on a fast machine even with the old `0` literal. T003 MUST introduce a deliberate `await new Promise((r) => setTimeout(r, 5))` delay and assert `durationMs >= 5`, not merely that the field is defined.

### WP02 — Execution-source resolver — prompt: `tasks/WP02-execution-source-resolver.md`

**Goal**: ship `resolveExecutionSource` from core with its own full test suite, reproducing FR-018's five-branch precedence table exactly (including the deprecated `MUSTER_BASE_URL` alias and `skills/trigger.ts`'s canonical-wins-silently behavior). Consumed by no call site in this mission (C-005) — wave-2 (#100/#101/#102) wires it later.
**Priority**: P2 · **Estimated prompt size**: ~120 lines
**Independent test**: `pnpm test` green; every branch of the precedence table has its own passing test case; the two falsification cases pass.
**Independent test note**: T005 needs no other WP's output — it is a pure function over `{ env?, cassetteReplayConfigured?, manifestHasEndpointBlock? }` with no I/O and no adapter knowledge.

- T005 `execution-source.ts` (WP02)
- T006 `execution-source.test.ts` (WP02)
- T007 WP02 verification gate (WP02)

**Dependencies**: none.
**Parallel**: [P] with WP01 and WP03.
**Risks**: none material — fully specified precedence table in spec.md FR-018; the only care needed is reproducing `skills/trigger.ts:91-101`'s existing precedence exactly rather than inventing a new one.

### WP03 — Core cassette module: types, hashing, store, decorator — prompt: `tasks/WP03-cassette-core-module.md`

**Goal**: the foundation every other cassette-touching WP builds on — `src/core/cassette/{types,hash,errors,store,client,index}.ts`, plus exporting `hostnameOf` from `src/core/behavioral/client.ts`. Covers the canonical-JSON format, post-transform request hashing, per-case-file ordinal keying, credential-safe provenance redaction, and the three-mode (`record`/`replay`/`live`) decorator over `ChatClient`/`ToolChatClient`.
**Priority**: P1 · **Estimated prompt size**: ~500 lines
**Independent test**: `pnpm test` green; `tsc --noEmit` passes; NI-002 (core→adapter boundary) and NI-003 (`FETCH_ALLOWED` unchanged) both stay green with no modification to either invariant test.

- T008 `types.ts` (WP03)
- T009 `hash.ts` (WP03)
- T010 `errors.ts` (WP03)
- T011 `store.ts` (WP03)
- T012 `hostnameOf` export (WP03)
- T013 `client.ts` decorator (WP03)
- T014 `index.ts` barrel (WP03)
- T015 `hash.test.ts` (WP03)
- T016 `store.test.ts` (WP03)
- T017 `client.test.ts` (WP03)
- T018 `client-tools.test.ts` (WP03)
- T019 WP03 verification gate (WP03)

**Dependencies**: none from other new code in this mission — only the existing `canonicalJson` (`src/core/canonical-json.ts`) and the newly-exported `hostnameOf`.
**Parallel**: [P] with WP01 and WP02. Within the WP: T008 (types) is the prerequisite for T009-T011/T013 (all import `CassetteExchange`/`CassetteMode`); T012 (`hostnameOf` export, `src/core/behavioral/client.ts`) has no dependency on T008 — it touches an unrelated file with no shared types, so it can start immediately, in parallel with T008 and T009 (matching its own `[P]` marking in the Subtask Index); T011 (store) depends on T008/T009/T012; T013 (decorator) depends on T008/T009/T010; T014 (barrel) depends on all of T008-T013; T015-T018 depend on their respective source file.
**Risks**: this is the riskiest, least-precedented concern in the mission (novel per-case-file hash/ordinal keying design — an explicit in-memory `Map<requestHash, number>` counter, not scan-order inference). Mitigated by T016's dedicated coverage of FR-006's exact scenario (k-of-n identical prompts → n distinct recorded responses, recorded order, each exactly once) before WP04 builds any CLI wiring on top of it. This WP is the load-bearing dependency for WP04 and WP05 — a design defect here is expensive to discover late, hence it is scheduled in Phase 1, not deferred.

## Phase 2 — CLI wiring (WP04, depends on WP03)

### WP04 — `behave run` CLI wiring — prompt: `tasks/WP04-behave-run-cli-wiring.md`

**Goal**: wire `--cassette <dir> --record|--replay` end to end into `behave run`: flag validation, replay run-count preflight read from the cassette before any other resolution, per-case decorator construction, the `replayed: true` output marker, the `stale` verdict field, and the three pre-designed hazard fixes (exit-2 heuristic misfiring on an all-stale replay, the `--json` shape asymmetry, and `durationMs` non-determinism breaking byte-identical replay output).
**Priority**: P1 · **Estimated prompt size**: ~450 lines
**Independent test**: `pnpm test` green; a `--replay` run against a cassette with zero matching case files exits 1, not 2; two `--replay` invocations of the same suite with an artificially forced timing difference between them produce byte-identical `--json`.

- T020 `BehaveOpts` (WP04)
- T021 `behave run` command options (WP04)
- T022 `doBehaveRun` wiring (WP04)
- T023 `stale?: boolean` on `RunVerdict`/`CaseVerdict` (WP04)
- T024 `runCase` catch-block `stale` flag (WP04)
- T025 `cli.test.ts` additions (WP04)
- T026 `runner.test.ts` stale-propagation test (WP04)
- T027 WP04 verification gate (WP04)

**Dependencies**: WP03 (needs `makeCassetteClient`, `CassetteMissError`, `readCassetteCase`/`writeCassetteCase`/`readCassetteSuiteIndex`/`writeCassetteSuiteIndex`). Also sequenced strictly after WP01 for a same-file reason only, not a functional one: both WP01 (T002) and WP04 (T020-T022) edit `src/cli/index.ts` in different regions (`doSopRun`/`buildSopClient` vs. `BehaveOpts`/`behave run`/`doBehaveRun`); Phase 1 completing before Phase 2 starts means WP04 always begins from a tree that already has WP01's edit merged, so no same-file merge conflict is possible.
**Parallel**: none — this WP is the sole occupant of Phase 2; nothing else is ready to start until WP03 lands, and WP05/WP06 need WP04's output.
**Risks**: Hazard 1 (exit-2 heuristic misfires on an all-stale replay — must be gated off entirely when `opts.replay === true`), Hazard 2 (`--json` shape is deliberately asymmetric: only `--replay` wraps the array as `{ replayed: true, verdicts }`), and Hazard 3 (`Transcript.durationMs` is a required, unconditionally-stamped field with zero cassette-mode awareness — the replay-only output copy must normalize it to `0` three levels deep, `CaseVerdict[] → RunVerdict[] → Transcript`, without mutating the original objects `runCase` returns) are all pre-designed in plan.md specifically because they are easy to get subtly wrong. T022 must implement all three; T025 must test all three with tests that would fail if the fix were absent (not merely fast/uniform-timing tests that would pass either way). `tests/behavioral/runner.test.ts` (T026's target) is a pre-existing 895-line file with 11 describe blocks unrelated to this WP (e.g. `personaPrompt rendering`, `C-006 makeClient`, `FR-023 transcript completeness`) — T026's diff against this file MUST be an addition of one new describe/it block, never a rewrite or truncation of the file.

## Phase 3 — Invariant guards and fixtures (WP05, depends on WP03 and WP04)

### WP05 — Invariant guards, discrimination-control fixture, remaining purity/redaction assertions — prompt: `tasks/WP05-invariant-guards-fixtures.md`

**Goal**: NI-004 (a quote/template-literal-aware, paren-balanced `Promise.all`-wraps-`.chat(`/`.chatWithTools(` regression guard, directory-walked so it cannot rot the way a hand-maintained file list already did once in this mission's own plan-review history), the `fixtures/cassettes/` size lint, the committed discrimination-control cassette and its load-bearing failing-graders test, plus two same-file extensions of earlier WPs' test files (FR-020's credential-redaction assertion in WP03's `store.test.ts`, FR-022's `personaPrompt` purity guard in WP04's `runner.test.ts`).
**Priority**: P1 · **Estimated prompt size**: ~350 lines
**Independent test**: `pnpm test` green; NI-004 reports zero violations against the current tree, including its two named must-not-false-positive fixtures (`memory-utilization/index.ts`, `crosslayer/rule-survival.ts`); the discrimination-control test itself fails when graders are stubbed/bypassed; the combined invariant suite (NI-001..004 + size lint) stays within its 2000ms budget.

- T028 NI-004 scan + algorithm (WP05)
- T029 NI-004 fixture coverage (WP05)
- T030 size lint (WP05)
- T031 discrimination-control fixture (WP05)
- T032 discrimination-control test (WP05)
- T033 `store.test.ts` FR-020 extension (WP05)
- T034 `runner.test.ts` FR-022 extension (WP05)
- T035 WP05 verification gate (WP05)

**Dependencies**: WP03 (the discrimination-control fixture, T031, is authored using WP03's decorator in record mode against a scripted mock client, then committed as static JSON — not generated at test-run time; T033 extends WP03's `store.test.ts`). WP04 (T032's stronger, representative assertion drives the fixture through `behave run --cassette ... --replay`, exercising the full CLI path rather than a bare `readCassetteCase` + grader call; T034 extends `tests/behavioral/runner.test.ts`, which already exists pre-mission and is first extended by WP04 (T026's stale-propagation test), then further extended by WP05 (T034's `personaPrompt` purity guard)).
**Parallel**: T028/T029/T030 all edit the same file, `tests/unit/invariants.test.ts` (and T028/T030 both fold into the same combined timer variable), so none of the three carries a `[P]` marker in the Subtask Index — per this mission's own `[P]` convention (tasks-template.md:18, "different files/components"), same-file edits are never `[P]` regardless of whether they share a data dependency. T028/T029/T030 have no *data* dependency on each other or on WP03/WP04's specific output, so an implementer may sequence them in any order within WP05, but they must still be applied one at a time to the shared file. All three wait for Phase 3 to start regardless, since this WP's other tasks (T031-T034) require WP03 and WP04 to be merged first, and splitting T028-T030 into an earlier phase would fragment one invariants.test.ts edit across two WPs for no net parallelism gain (the file has one owner, WP05, for the whole mission).
**Risks**: a naive same-file/co-occurrence substring scan (matching NI-002/NI-003's own simpler style) would false-positive today on `memory-utilization/index.ts` and `rule-survival.ts` — both already contain a `"Promise.all"` comment substring documenting the pattern's *absence* near a real `.chat(` call site. A comment stripper that is not quote-aware would overcorrect the other way, deleting real code following an in-string `//` (e.g. `baseUrl: "mock://test",`). T028 must implement the full quote-aware-strip + paren-balanced-enclosure algorithm from plan.md's "NI-004 design" section, not a shortcut version — T029's two named fixtures are the regression proof.

## Phase 4 — Documentation and final gate (WP06, depends on all)

### WP06 — Documentation and mission-closing gate verification — prompt: `tasks/WP06-docs-and-final-gate.md`

**Goal**: publish `docs/guides/cassette-format.md` (the `chat()`/`chatWithTools()` fidelity asymmetry FR-012 requires be documented), add the SC-006 cross-boundary public-API smoke test, and perform the mission-closing confirmation that `pnpm test`, `tsc --noEmit`, and the SonarCloud ≥80%-new-code gate are all green with every prior WP's changes included.
**Priority**: P2 · **Estimated prompt size**: ~120 lines
**Independent test**: `pnpm test` and `tsc --noEmit` both green from a clean checkout with all five prior WPs merged; `tests/cassette/public-api.test.ts` imports both `makeCassetteClient` and `resolveExecutionSource` successfully from outside `src/core/`; `pnpm test:coverage` reports ≥80% line/branch coverage for every wholly-new file this mission adds, and shows ≥80% of changed lines/branches hit in the touched regions of the large shared files it edits (`src/cli/index.ts`, `src/adapters/openclaw-sop/runner.ts`, `src/core/behavioral/{client,runner}.ts`; `behavioral/types.ts`'s `stale?: boolean` addition is type-only with zero executable statements, so it carries no coverage obligation and is excluded from this read) — as the local signal that SonarCloud's ≥80%-new-code gate (NFR-005), the check that actually blocks the PR, will clear.

- T036 `docs/guides/cassette-format.md` (WP06)
- T037 `public-api.test.ts` (WP06)
- T038 final gate verification (WP06)

**Dependencies**: WP01, WP02, WP03, WP04, WP05 (all) — this is the mission's final integration pass; FR-023 requires the full tree green, not just this WP's own new files, and T037 specifically needs both WP03's and WP02's exports to exist.
**Parallel**: none — always last.
**Risks**: none material. The only failure mode is discovering a gate regression introduced by an earlier WP; T038 exists precisely to catch that before this mission is handed to review, not to introduce new risk itself.

## Dependency summary

```
Phase 1 (parallel)         Phase 2            Phase 3                 Phase 4
┌─────────┐
│  WP01   │──────────────────────────────────────────────────────────┐
│ (IC-01) │──┐ (same-file ordering only,                              │
└─────────┘  │  src/cli/index.ts)                                    │
              │                                                       │
┌─────────┐  │                                                       │
│  WP02   │──┼───────────────────────────────────────────────────────┤
│ (IC-03) │  │                                                       │
└─────────┘  │                                                       │
              │                                                       │
┌─────────┐  ▼                                                       │
│  WP03   │─────────▶┌─────────┐        ┌─────────┐                 │
│ (IC-02) │          │  WP04   │───────▶│  WP05   │─────────────────▶│
└─────────┘          │ (IC-04) │        │ (IC-05) │        ┌─────────┴┐
                      └─────────┘        └─────────┘        │  WP06   │
                                                              │ (IC-06) │
                                                              └─────────┘
```

WP01, WP02, WP03 are the only genuinely parallel set — no shared files, no import relationship. WP04 depends functionally on WP03 and is sequenced after WP01 purely to avoid a same-file conflict in `src/cli/index.ts`. WP05 depends on both WP03 and WP04. WP06 depends on all five prior WPs as the mission's final integration and gate-verification pass.

## Acceptance scenario traceability

| # | Scenario (spec.md) | Test location | WP |
|---|---|---|---|
| 1 | Record writes one case file + suite index, canonical JSON, `schemaVersion` | `tests/cassette/store.test.ts` | WP03 |
| 2 | Same suite recorded twice → byte-identical modulo `durationMs` | `tests/unit/cli.test.ts` | WP04 |
| 3 | Credential-shaped fake token never persisted | `tests/cassette/store.test.ts` (WP05 extension) | WP05 |
| 4 | Post-transform (`blindArmOrder`) hash collision | `tests/cassette/hash.test.ts` | WP03 |
| 5 | Replay with no endpoint/API key env set → completes, zero network I/O | `tests/unit/cli.test.ts` | WP04 |
| 6 | Same replay run twice → byte-identical `--json` | `tests/unit/cli.test.ts` (Hazard 3) | WP04 |
| 7 | k-of-n identical-key case → n distinct responses, recorded order, each once | `tests/cassette/store.test.ts` + `client.test.ts` | WP03 |
| 8 | `replayed: true` present only on replay output | `tests/unit/cli.test.ts` (Hazard 2) | WP04 |
| 9 | Deleted exchange → stale-labeled failure, suite continues, exit 1 not 2/0 | `tests/unit/cli.test.ts` (Hazard 1) | WP04 |
| 10 | `n=5` recorded, no `--runs` → uses 5 | `tests/unit/cli.test.ts` | WP04 |
| 11 | `n=5` recorded, `--runs 3` → fails before any case executes | `tests/unit/cli.test.ts` | WP04 |
| 12 | `--record`/`--replay` without `--cassette` → CLI usage error | `tests/unit/cli.test.ts` | WP04 |
| 13 | `--record` and `--replay` together → CLI usage error | `tests/unit/cli.test.ts` | WP04 |
| 14 | Rigged cassette fails; graders stubbed ⇒ control test itself fails | `tests/cassette/discrimination-control.test.ts` | WP05 |
| 15 | SOP transcript reflects real endpoint + measured duration, no `"mock"` literal | `tests/adapters/openclaw-sop/runner.test.ts` | WP01 |
| 16 | `chatWithTools` record→replay round trip, zero network, own keying | `tests/cassette/client-tools.test.ts` | WP03 |

All 16 acceptance scenarios map to a WP. Success criteria SC-001..007 are each covered by the union of the scenario tests above (SC-001↔1/5, SC-002↔8, SC-003↔9, SC-004↔3, SC-005↔15, SC-006↔`tests/cassette/public-api.test.ts` (WP06), SC-007↔the full existing suite staying green, checked at WP06's T038).

**Plan-authored behavior not in the 16-scenario table**: design decision #2 (non-empty target directory on `--record`: overwrite only the files this run touches, never delete untouched files) has no corresponding spec.md scenario but is safety-relevant. Covered by T016 (`store.test.ts`), owned by WP03, so it is not lost at implementation time.

## Gates

`pnpm test` and `tsc --noEmit` both run at the close of every WP (T004, T007, T019, T027, T035, T038), not only at the mission's end — WP01 and WP02 are small enough that a full green gate after each is cheap and catches regressions before they compound into WP04's larger surface. SonarCloud's ≥80%-new-code gate is the final, mission-closing check (WP06/T038), consistent with how CI actually blocks the PR (charter Quality Gates). No WP is considered done while `pnpm test` or `tsc --noEmit` is red.
