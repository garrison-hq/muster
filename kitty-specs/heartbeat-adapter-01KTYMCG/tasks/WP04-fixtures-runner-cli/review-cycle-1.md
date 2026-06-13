---
affected_files: []
cycle_number: 1
mission_slug: heartbeat-adapter-01KTYMCG
reproduction_command:
reviewed_at: '2026-06-13T14:34:41Z'
reviewer_agent: claude:opus:reviewer:reviewer
verdict: rejected
wp_id: WP04
---

# WP04 review — REJECTED

Build, full test suite (1838 passed / 3 endpoint-gated skips), type-check, and
static coverage (>=90% on src/adapters/heartbeat) are all green, and the static
path is byte-stable. Fixtures, manifest schema, CLI wiring, and the SpecAdapter
boundary are correct. WP04 is rejected on one load-bearing defect: the manifest
runner never wires the behavioral graders or the core behavioral runner, so the
adapter's entire behavioral half is unreachable in production. This is the
"TODO that hides unwired functionality" failure mode.

## 1. (BLOCKER) Behavioral cases are stubbed out even WITH an endpoint — FR-001, FR-004/005/006, WP04 T019

`src/adapters/heartbeat/index.ts:255-263` — in `runManifest`, when
`MUSTER_ENDPOINT` IS set, action-diff / idempotency / quiet-ack cases still
return `{ skipped: true, skipReason: "Behavioral endpoint execution not yet
implemented in this runner" }`. They are never dispatched to the graders.

- The graders built in WP02/WP03 (`gradeRun`/`aggregateActionDiff` in
  graders/action-diff.ts, `gradeRun`/`aggregateIdempotency` in
  graders/idempotency.ts, `gradeRun`/`aggregateQuietAck` in graders/quiet-ack.ts)
  are imported by NO production module. `index.ts:34` imports only
  `loadIntervalConfig` from quiet-ack.ts. `grep -rn "core/behavioral"
  src/adapters/heartbeat/` returns nothing.
- FR-001 (spec line 119) is explicit: the adapter "reuses the core ...
  behavioral runner/graders/client." The heartbeat adapter imports
  `src/core/behavioral/` nowhere. Compare the peer pattern in
  `src/adapters/memory/index.ts` (`runBehavioralCases`, which calls `makeClient`
  from `src/core/behavioral/client.ts` and actually executes the probes) — that
  is the established wiring this WP must mirror.
- FR-004/005/006 acceptance scenarios 4/5/6 ("When muster runs the tick N times
  against a BYOM endpoint") cannot be satisfied: the runner never calls a model.
- WP04 T019 (step 2) requires: "For action-diff, idempotency, quiet-ack cases:
  runs against the supplied BYOM endpoint (skips gracefully if MUSTER_ENDPOINT
  is not set)." The delivered runner skips them UNCONDITIONALLY, even when the
  endpoint is set.

**Required change:** wire the behavioral path. In `runManifest`, when
`MUSTER_ENDPOINT` is set, the action-diff/idempotency/quiet-ack branches must:
load the tick state + interval config + checklist (with manifest recurrence
applied), build the scenario framing via `buildScenarioFraming`, run N times
through the core behavioral client (`src/core/behavioral/client.ts` /
`runner.ts` — the same import surface the memory adapter uses), grade each run
with the corresponding WP02/WP03 `gradeRun`, aggregate with the corresponding
`aggregate*` (mapping the manifest `passThreshold` to k = ceil(passThreshold *
N)), and surface pass/fail. The `it.skipIf(!MUSTER_ENDPOINT)` test at
`tests/heartbeat/fixture-suite.test.ts:249` must then assert the behavioral
cases actually RUN (not merely that the skipReason changed). The "not yet
implemented" reason string must be removed.

## 2. (RELATED) FR-008 errored=failed is not enforced anywhere a run actually executes

The aggregators correctly count a `passed:false` element as a failure, but no
production code constructs run results, so FR-008 ("an errored run counts as a
failed run") is unenforced on any live path. The idempotency unit test at
tests/heartbeat/idempotency.test.ts:214 even notes "the caller is responsible
for representing errored runs as passed:false" — and that caller does not
exist. When you wire item 1, ensure an endpoint/transport error or
malformed/empty model output is materialized as a failed run before
aggregation, and add an integration assertion that an errored run drops the
pass count.

## What is already acceptable (do not change)
- Fixture set, manifest.json (8 stable hb-* IDs), CLI `--adapter heartbeat`
  wiring (import + one registry entry + one check branch), SpecAdapter stub
  boundary, UTF-16 case-id sort, byte-stable static output, no core import of
  heartbeat types. These pass.

## Verification after fix
- With a mock/stub endpoint set, `runManifest` must return non-skipped
  pass/fail results for hb-behavioral-001/002/003 driven through the WP02/WP03
  graders and the core behavioral runner.
- `grep -rn "core/behavioral" src/adapters/heartbeat/` must show the runner
  importing the core client.
- `grep -rn "not yet implemented" src/adapters/heartbeat/` must return nothing.
