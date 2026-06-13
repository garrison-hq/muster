# Mission Review: Schedule (HEARTBEAT.md) Conformance Adapter

**Mission**: `heartbeat-adapter-01KTYMCG`
**Reviewer**: principal-engineer mission review (post-implementation)
**Date**: 2026-06-13
**Lane branch**: `.worktrees/heartbeat-adapter-01KTYMCG-lane-a` (5 heartbeat commits over `main`)
**Verdict**: **PASS-WITH-NOTES** — no CRITICAL or HIGH blocking findings.

## Verification performed

- `pnpm build` (lane branch) → PASS (tsc strict, 0 errors).
- `pnpm test` (full suite) → 82 files, 1850 passed, 3 skipped (all `skipIf(!MUSTER_ENDPOINT/!MUSTER_BASE_URL)` BYOM gates — legitimate, not weakened tests), Type Errors: none.
- Scoped coverage `src/adapters/heartbeat/**`: 95.76% stmts / 92.14% branch / 100% funcs. graders/ at 100%/100%. All files well above the 80% new-code gate.
- `src/core/**` diff: empty. `grep` confirms core imports no adapter and no `heartbeat` symbol (C-001/C-004 boundary clean).
- No `localeCompare`, no `Date`/`Date.now`/`Math.random`/`performance.now` anywhere in `src/adapters/heartbeat/**`. No `TODO`/`FIXME`/`not implemented` in heartbeat source.

## 1. FR / acceptance-scenario coverage trace

| FR / Scenario | Implementation | Test | Status |
|---|---|---|---|
| FR-001 (SpecAdapter contract, reuse core behavioral client; no core modification) | `index.ts` `HeartbeatAdapter implements SpecAdapter`; behavioral cases call `makeClient` from `src/core/behavioral/client.js` (`runManifest` → `gradeBehavioralCase`) | fixture-suite T019 stub-client tests (l.296-414); T020 boundary tests (l.421-468) | COVERED |
| FR-002 (parse HEARTBEAT.md + recurrence manifest + tick states) | `lint.ts` `parseHeartbeat`, `loadManifest`/`applyManifest`; `tick.ts` `loadTickState` | lint.test.ts, tick.test.ts | COVERED |
| FR-003 (static lint: length advisory + empty/comment-only skip, cite docs) | `lint.ts` `lintHeartbeat` (`heartbeat/empty-file-skip` info + `heartbeat/length-advisory`) | lint.test.ts; fixture cases hb-static-001..004 | COVERED |
| FR-004 (action-diff probe, exact match, k-of-n) | `graders/action-diff.ts` `gradeActionDiff`/`gradeRun`/`aggregateActionDiff`; `index.ts` `runActionDiffCase` | action-diff.test.ts (35); fixture-suite stub tests | COVERED |
| FR-005 (idempotency probe, once-only only, k-of-n) | `graders/idempotency.ts`; `index.ts` `runIdempotencyCase` (filters `recurrence==='once-only'`) | idempotency.test.ts (26); fixture-suite | COVERED |
| FR-006 (quiet-ack `HEARTBEAT_OK` within `ackMaxChars` 300, cite docs) | `graders/quiet-ack.ts` `gradeQuietAck`/`gradeRun`; `index.ts` `runQuietAckCase` | quiet-ack.test.ts (46) | COVERED |
| FR-007 (interval read from config; default 30m recorded when absent) | `tick.ts` `buildIntervalConfig` (30m/assumed=true default; 60m never defaulted); `quiet-ack.ts` `loadIntervalConfig` + `buildAssumedIntervalNote` | tick.test.ts; fixture-suite l.538-554 (absent/default/oauth-1h); hb-config-001 | COVERED |
| FR-008 (errored run = failed run, never skipped/retried) | per-run `try/catch` in all three `run*Case` materialises `passed:false`; aggregators count failures | fixture-suite FR-008 tests l.373-414 (throw → passCount 0; partial → below k) | COVERED |
| FR-009 (rigged-impossible discrimination control per grader) | n/a (test-only) | action-diff.test.ts l.326-352; quiet-ack.test.ts l.501-538 (controls A+B); idempotency.test.ts l.311-328 — all assert `passed===false` | COVERED |
| FR-010 (machine-readable report; citations: docs for OK/ackMaxChars/skip, rubric for length) | `lint.ts` `CITATIONS` (doc content-SHA for skip; rubric for length), `serializeLintReport` | lint.test.ts serialize/citation tests | COVERED |
| FR-011 (test manifest runner → pass/fail summary) | `index.ts` `loadManifestFile`/`runManifest`/`ManifestSummary` | fixture-suite T022 (l.501-519) | COVERED |
| FR-012 (fixture set shaped as upstream conformance suite) | `tests/fixtures/heartbeat/` checklists + tick-states + interval-configs + manifest.json (9 cases) | fixture-suite | COVERED |
| Scenario 1 (concise → ok:true) | hb-static-001 | fixture-suite l.504-512 | COVERED |
| Scenario 2 (empty/comment-only → skip semantics, cite docs) | hb-static-002/003; `empty-file-skip` info finding | fixture-suite, lint.test.ts | COVERED |
| Scenario 3 (over-length → token-burn advisory cite rubric) | hb-static-004 (over-length.md = 52 lines / 2002 chars > 50/2000) | fixture-suite l.491-494 | COVERED |
| Scenario 4 (action-diff k-of-n on due tick) | `runActionDiffCase` | stub: all-actions → pass; HEARTBEAT_OK → fail | COVERED |
| Scenario 5 (idempotency on repeat tick) | `runIdempotencyCase` | idempotency.test.ts + stub | COVERED |
| Scenario 6 (quiet `HEARTBEAT_OK` within ackMaxChars, cite docs) | `runQuietAckCase` | quiet-ack.test.ts + stub | COVERED |
| Scenario 7 (configured interval 1h, not hardcoded) | `loadIntervalConfig`/`buildIntervalConfig` never defaults 60 | tick.test.ts l.33-53; oauth-1h.json l.550-554 | COVERED |
| Scenario 8 (discrimination controls fail) | see FR-009 | three control suites | COVERED |
| Scenario 9 (second endpoint, only endpoint config changed → identical run) | endpoint/model/key read only from `MUSTER_ENDPOINT`/`MUSTER_MODEL`/`MUSTER_API_KEY`; no code path hardcodes a host | stub-client tests prove runner is endpoint-agnostic; determinism test l.275-279 | COVERED (architectural) |
| Edge: OK present but remainder > ackMaxChars → fail | `gradeQuietAck` `withinCharLimit = reply.length <= ackMaxChars` | quiet-ack Control B (400-char overflow) | COVERED |
| Edge: OK + action on due tick → action-diff miss | action-diff `gradeRun` returns miss when reply starts with `HEARTBEAT_OK` | action-diff control l.344-352 | COVERED |
| Edge: idempotency vs recurring | only `recurrence==='once-only'` items drive the check | idempotency.test.ts | COVERED |
| Edge: interval config absent → default 30m recorded | `assumed:true` + `buildAssumedIntervalNote` | hb-config-001; fixture-suite l.538-541 | COVERED |
| Edge: whitespace/comment-only skip vs single real instruction | `parseHeartbeat` `stripComments` then `trim().length===0` | lint.test.ts | COVERED |
| Edge: endpoint error mid-suite / malformed output | per-run try/catch → failed run; empty reply → quiet-ack fail | FR-008 tests | COVERED |

No FR gaps.

## 2. Drift findings (spec vs code)

- **None material.** Implementation matches data-model entity shapes (`ChecklistItem`, `HeartbeatFile`, `SimulatedTick`, `ActionDiff`, `QuietAckCheck`, `IdempotencyCheck`, `IntervalConfig`) and their invariants.
- Planned `src/adapters/heartbeat/{index,lint,tick}.ts` was extended with a `graders/` subdirectory (action-diff, idempotency, quiet-ack). This is an organizational improvement over the plan's "graders imported from core" phrasing — the heartbeat graders are adapter-specific logic correctly kept behind the boundary; the *core behavioral client/runner* are the reused pieces. No drift in intent.
- `idempotency` semantics: `repeatedActions` = once-only ∩ priorActions ∩ observed. This matches data-model l.131 exactly ("intersection of priorActions and observedActions restricted to onceOnlyItems"). Note: an item the agent repeats that was NOT in `priorActions` is not flagged — this is per-spec by construction (priorActionSummary is the ground truth of "what was already done").

## 3. Risk + security findings

- **Transport/endpoint errors**: all three `run*Case` wrap `client.chat` in per-run try/catch and materialise `passed:false` (FR-008). Empty/null reply in quiet-ack is also a failed run. Verified by tests that throw and assert passCount 0 and below-k aggregation. SAFE.
- **Path traversal / fixture loading**: manifest/tick/interval/checklist paths are resolved with `node:path resolve(root, relativePath)` from a project-controlled manifest; no user-supplied network input reaches the filesystem on the static path. Loaders (`loadManifest`, `loadTickState`, `loadIntervalConfig`, `loadManifestFile`) validate JSON shape and throw typed errors on malformed input. Acceptable for a CI conformance harness; no injection vector.
- **Determinism of static path**: no clock, no RNG, no `localeCompare`; findings and case results sorted by UTF-16 code-unit comparator (`a < b ? -1 : ...`). `serializeLintReport` uses fixed key insertion order. Byte-stability is directly tested. SAFE.
- **Credentials**: endpoint/model/key sourced from env only (`MUSTER_ENDPOINT`/`MUSTER_MODEL`/`MUSTER_API_KEY`); no provider SDK, no secrets in repo (NFR-005). SAFE.

## 4. Charter compliance

| Charter gate | Result |
|---|---|
| C-001/C-004 core boundary (core never imports heartbeat) | PASS — `src/core/**` diff empty; no adapter import in core; dependencies point inward (graders import `lint.ts`/`tick.ts`; index imports core behavioral client, not vice versa). |
| Static byte-stability (UTF-16 ordering, offline) | PASS — UTF-16 comparators, no localeCompare, no clock/RNG; determinism tested. |
| Two-tier grading / pass^k where safety-critical | PASS (with note) — charter and plan classify action-diff/idempotency/quiet-ack as **stylistic** axes (k-of-n), no safety-critical axis in this adapter. k = `ceil(passThreshold * n)`; aggregation uses `>= k`. Conjunctive pass^k is achievable by setting passThreshold=1.0 (k=n). Correct for the declared axis classification. |
| Errored run = failed run | PASS — enforced in every behavioral run path; tested. |
| Discrimination control per grader, genuinely fails | PASS — three control suites assert `passed===false` against rigged-impossible inputs; they are real assertions that would break on grader regression. |
| Cite-a-source on every check | PASS — `empty-file-skip`/`quiet-ack` cite OpenClaw docs pinned to a content-SHA (`f32e439...`, documented drift-watch); `length-advisory` cites muster rubric §heartbeat-length. |
| >=80% new-code coverage | PASS — 95.76% stmts / 92.14% branch on the adapter; graders 100%. |
| Scope: only owned files; no test weakened/skipped | PASS — only `src/adapters/heartbeat/**`, `tests/heartbeat/**`, `tests/fixtures/heartbeat/**`, and a 16-line additive `src/cli/index.ts` wiring change. The 3 skips are env-gated BYOM tests, not weakened. |

## Notes (non-blocking, LOW)

1. **CLI `--adapter heartbeat` path is untested.** `src/cli/index.ts` `doCheck` adds a heartbeat branch (`checkHeartbeatFile` + `serializeLintReport`, exit 0/1) but `tests/unit/cli.test.ts` has no heartbeat case. The underlying functions are fully covered via fixture-suite; only the CLI glue (option choices, exit code mapping) is uncovered. Recommend a CLI test asserting `muster check --adapter heartbeat <file>` exit codes for valid vs over-length. LOW.
2. **`serializeLintReport` uses raw `JSON.stringify` with fixed key order rather than the core canonical-JSON helper.** Output is byte-stable (deterministic string-key insertion order) so NFR-001 holds, but reusing the core canonicalizer would be more consistent with FR-001's "reuse canonical-JSON" intent. Cosmetic. LOW.
3. **`over-length.md` straddles both thresholds (52 lines AND 2002 chars).** The advisory fires on `lines>50 || chars>2000`; a fixture that trips only one threshold would harden the OR-branch coverage. Branch coverage already 94% on lint.ts. LOW.

## Verdict

**PASS-WITH-NOTES.** Build green, full suite green, coverage well above gate, core boundary clean, determinism and citations sound, discrimination controls genuine, errored-run-as-failed enforced and tested. The three notes are LOW and do not block. reviewPass = true.
