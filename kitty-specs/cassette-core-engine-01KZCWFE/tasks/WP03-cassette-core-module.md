---
work_package_id: WP03
title: 'Core cassette module: types, hashing, store, decorator'
dependencies: []
requirement_refs:
- FR-002
- FR-003
- FR-004
- FR-005
- FR-006
- FR-007
- FR-008
- FR-009
- FR-010
- FR-011
- FR-012
tracker_refs: []
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this mission were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T008
- T009
- T010
- T011
- T012
- T013
- T014
- T015
- T016
- T017
- T018
- T019
phase: Phase 1 — Independent foundations (WP01, WP02, WP03 — genuinely parallel)
assignee: ''
agent: ''
history:
- timestamp: '2026-08-07T12:59:34Z'
  agent: system
  action: Materialized during implement-phase preflight from the reviewed tasks.md, after the design-phase `spec-kitty tasks` scaffold failed to generate WP files against the old topology.
authoritative_surface: ''
create_intent: []
execution_mode: code_change
owned_files: []
tags: []
---

# Work Package Prompt: WP03 – Core cassette module: types, hashing, store, decorator

## Goal

The foundation every other cassette-touching WP builds on —
`src/core/cassette/{types,hash,errors,store,client,index}.ts`, plus exporting
`hostnameOf` from `src/core/behavioral/client.ts`. Covers the canonical-JSON
format, post-transform request hashing, per-case-file ordinal keying,
credential-safe provenance redaction, and the three-mode
(`record`/`replay`/`live`) decorator over `ChatClient`/`ToolChatClient`.

Priority: P1 · Estimated prompt size: ~500 lines.

## Owned files

- `src/core/cassette/{types,hash,errors,store,client,index}.ts`
- the one-line `hostnameOf` export in `src/core/behavioral/client.ts`
- `tests/cassette/{hash,store,client,client-tools}.test.ts`

## Subtasks

- **T008** — `src/core/cassette/types.ts`: `CassetteMode`, `CassetteExchange`
  (`kind`/`requestHash`/`ordinal`/`request`/`response`/`provenance`/`durationMs`),
  `CassetteCaseFile`, `CassetteSuiteIndex`, `SCHEMA_VERSION`. [P]
- **T009** — `src/core/cassette/hash.ts`: `computeRequestHash` — sha256 hex
  over `canonicalJson(request)`, post-transform only (FR-005).
- **T010** — `src/core/cassette/errors.ts`: `CassetteMissError` identifying
  the case id and missing `(requestHash, ordinal)` key (FR-009/013).
- **T011** — `src/core/cassette/store.ts`:
  `writeCassetteCase`/`readCassetteCase`,
  `writeCassetteSuiteIndex`/`readCassetteSuiteIndex`; one file per case + one
  suite index (D1/FR-003); redaction via `hostnameOf` (C-004); `durationMs`
  excluded from the compared/hashed form (FR-004/NFR-001); non-empty-target-
  directory semantics — overwrite only this run's own files, never delete
  untouched files (design decision #2).
- **T012** — `src/core/behavioral/client.ts`: add `export` to `hostnameOf`
  (one-line, C-004, no behavior change). [P]
- **T013** — `src/core/cassette/client.ts`: `makeCassetteClient(inner, opts)`
  — record (pass-through + append)/replay (never touches network, miss
  throws `CassetteMissError`)/live (fully inert) modes over both `chat` and
  `chatWithTools`, no new fetch call site (FR-007..011).
- **T014** — `src/core/cassette/index.ts`: public barrel re-exporting the
  above.
- **T015** — `tests/cassette/hash.test.ts`: FR-005 — post-transform hashing;
  `blindArmOrder` (`src/adapters/memory-utilization/rubric.ts:234`) collision
  proof (Scenario 4).
- **T016** — `tests/cassette/store.test.ts`: FR-003/004/006 — file format,
  ordinal reset/increment for k-of-n identical prompts (Scenario 1, 7),
  non-empty-target-directory behavior (pre-populate with an unrelated file +
  a stale case file from a different suite, record, assert only the current
  suite's files changed).
- **T017** — `tests/cassette/client.test.ts`: FR-007..011 — record/replay/live
  mode contracts.
- **T018** — `tests/cassette/client-tools.test.ts`: Decorator-coverage
  acceptance scenario (Scenario 16) — `chatWithTools` record→replay round
  trip via a raw `ToolChatClient`, zero network I/O, own request-hash keying
  independent of any `chat` exchange.
- **T019** — WP03 verification gate.

Within the WP: T008 (types) is the prerequisite for T009-T011/T013 (all
import `CassetteExchange`/`CassetteMode`); T012 (`hostnameOf` export) has no
dependency on T008 — it touches an unrelated file with no shared types, so it
can start immediately, in parallel with T008 and T009; T011 (store) depends
on T008/T009/T012; T013 (decorator) depends on T008/T009/T010; T014 (barrel)
depends on all of T008-T013; T015-T018 depend on their respective source
file.

## Dependencies

None from other new code in this mission — only the existing `canonicalJson`
(`src/core/canonical-json.ts`) and the newly-exported `hostnameOf`.

## Parallel

[P] with WP01 and WP02.

## Risks

This is the riskiest, least-precedented concern in the mission (novel
per-case-file hash/ordinal keying design — an explicit in-memory
`Map<requestHash, number>` counter, not scan-order inference). Mitigated by
T016's dedicated coverage of FR-006's exact scenario (k-of-n identical
prompts → n distinct recorded responses, recorded order, each exactly once)
before WP04 builds any CLI wiring on top of it. This WP is the load-bearing
dependency for WP04 and WP05 — a design defect here is expensive to discover
late, hence it is scheduled in Phase 1, not deferred.

## Independent test

`pnpm test` green; `tsc --noEmit` passes; NI-002 (core→adapter boundary) and
NI-003 (`FETCH_ALLOWED` unchanged) both stay green with no modification to
either invariant test.
