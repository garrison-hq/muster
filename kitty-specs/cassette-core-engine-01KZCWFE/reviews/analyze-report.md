---
schema_version: 1
artifact_type: spec-kitty.analysis-report
command: /spec-kitty.analyze
mission_slug: cassette-core-engine-01KZCWFE
mission_id: 01KZCWFEZC1TS3N5250Q5G0XPM
generated_at: 2026-08-07T00:00:00+00:00
analyzer_agent: claude (Sonnet 5, ANALYZE seat, re-analysis after fix round 653dced)
input_artifacts:
  spec.md:
    path: kitty-specs/cassette-core-engine-01KZCWFE/spec.md
    sha256: ad85b80a520adc3dc2075f18b0f0ac0d673550e6b1bbf1ca31051dc8538b06d4
  plan.md:
    path: kitty-specs/cassette-core-engine-01KZCWFE/plan.md
    sha256: 0e799e6f5f6059c67b853823427dc6a5b0c3435bafa08b9b4545aeb2d66d23a5
  tasks.md:
    path: kitty-specs/cassette-core-engine-01KZCWFE/tasks.md
    sha256: bf32ec5c3cc1f6ba0eff74767e7c807291568b837d2258d93eaf2bac31b12aaa
  charter:
    path: .kittify/charter/charter.md
    sha256: c6b7d972b530b54b5ded0bbd9978f338780f75a22aa4c422ced5bb27d34710e2
schema: analysis-findings/v1
verdict_hint: ready
verdict: ready
counts:
  low: 1
  medium: 0
  high: 0
  critical: 0
  info: 0
issue_counts:
  low: 1
  medium: 0
  high: 0
  critical: 0
  info: 0
findings:
  - id: ANALYZE-003
    severity: low
    category: inconsistency
    summary: >-
      plan.md's Technical Context and Test Strategy (Scenario 5 row) cite
      tests/unit/cli.test.ts:727 for the `vi.spyOn(globalThis, "fetch")`
      NFR-003 zero-network-I/O precedent — verified correct against source
      (line 727 is the exact `vi.spyOn` call inside the "BUG-B" test).
      tasks.md T025 cites the same precedent as tests/unit/cli.test.ts:725,
      which is the enclosing `it(...)` block's description line, two lines
      off from the actual fetch-spy call. Non-blocking: the surrounding
      prose in both documents ("mirroring the BUG-B precedent" /
      "mirroring cli.test.ts:727") uniquely identifies the pattern to copy
      regardless of the exact line number, so no implementation risk:
      grep for `vi.spyOn(globalThis, "fetch")` finds it immediately. Worth
      a one-line correction in tasks.md T025 in a future pass for
      precision, not because it blocks WP04.
---

# Cross-Artifact Analysis Report — cassette-core-engine-01KZCWFE (re-analysis)

**Mission**: `cassette-core-engine-01KZCWFE` (`01KZCWFEZC1TS3N5250Q5G0XPM`)
**Run**: re-analysis after fix round `653dced` (fixed `ANALYZE-001`, `ANALYZE-002` from the prior cross-artifact analysis)
**Artifacts reviewed**: `spec.md` (416 lines), `plan.md` (997 lines), `tasks.md` (263 lines), `.kittify/charter/charter.md` (62 lines)
**Codebase verified against**: `/home/jeroennouws/dev/muster-missions/99` at commit `db80a42` (`fix(openclaw-sop): stop applying the k-run passThreshold to a single run's judge vote (#89)`)

## Methodology

Full fresh cross-artifact analysis, not a spot-check of the two prior findings. Six detection passes were run across all three design artifacts plus the charter: duplication, ambiguity, underspecification, charter alignment, coverage gaps, inconsistency. In addition, every concrete source-code citation in `plan.md` and `tasks.md` that could be mechanically checked (line numbers, function/interface names, existing test helper names, exact list contents, file/line counts) was verified directly against the codebase rather than trusted from the artifacts' own prose — several dozen individual citations were checked this way (see "Source verification" below); all but the one finding below matched exactly.

## ANALYZE-001 — FR-022 citation disambiguation (verify resolved)

**Claim now in plan.md** (Cassette core module design section, "Replay miss → `CassetteMissError`"): `runCase`'s catch block already converts a thrown error into an errored/failed run per "the pre-existing 'an errored run counts as a failed run' contract documented at `src/core/behavioral/types.ts` lines 66/101/112 — an earlier mission's FR-022, distinct from *this* mission's FR-022, the `personaPrompt` purity guard."

**Verified against source** (`src/core/behavioral/types.ts` at `db80a42`):
- Line 66: `/** k in k-of-n; an errored run counts as a failed run (FR-022). */`
- Line 101: `/** Verdict for a single run (1..n). Errored runs carry \`error\` and fail (FR-022). */`
- Line 112: `* (FR-022: an errored run counts as a failed run, never partial credit).`

All three lines exist exactly as cited and carry the "an errored run counts as a failed run" contract under an FR-022 label from an earlier mission (this file's `BehavioralCase`/`RunVerdict` types predate this mission). Cross-checked against this mission's own FR-022 in `spec.md` (line 270: "A dedicated test MUST assert that `personaPrompt` ... reads none of `Date`, `Math.random`, or `process.env`") — genuinely a different requirement. The disambiguating parenthetical plan.md now carries is accurate and resolves the collision. **Resolved.**

## ANALYZE-002 — NFR-005 coverage-scope widening (verify resolved)

**Claim now in spec.md** (NFR-005 row): "All new code added by this mission (across every work package, not only `src/core/cassette/`) MUST meet the project's new-code coverage gate."

**Cross-checked against plan.md and tasks.md**, which were already written against the wider scope before the fix (the fix commit `653dced` widened spec.md's wording to *match* plan/tasks, not the other way around — confirmed via `git show 653dced`):
- `plan.md:917`: "NFR-005 (≥80% new-code coverage) is a cross-cutting gate verified at IC-06 against every concern's new code, not a single concern's output."
- `tasks.md:47`: "NFR-005 (≥80% new-code coverage) → WP06, cross-cutting, checked against every WP's new code."
- `tasks.md` T038 (WP06's final gate task) enumerates coverage obligations per file class across every WP: whole-file for wholly-new files (`src/core/cassette/**`, `src/core/execution-source.ts`), per-changed-region hit-rate for large shared files (`openclaw-sop/runner.ts`, `cli/index.ts`, `behavioral/{types,client,runner}.ts`), and an explicit type-only carve-out for `behavioral/types.ts`'s `stale?: boolean` addition (verified: `grep -nE '^(export )?(function|const|class|enum)' src/core/behavioral/types.ts` returns zero matches against the actual 192-line file — confirmed no executable code exists there, so the carve-out is accurate, not just asserted).

No other spec.md/plan.md/tasks.md mention of NFR-005 or coverage was found to contradict the widened text. **Resolved**, and the fix did not introduce a new contradiction — it aligned spec.md to what plan.md/tasks.md already specified.

## Fix-introduced issues — hunt result

Searched every NFR-005/coverage mention across all three artifacts (six total hits) for disagreement. None found. The fix's `plan.md` diff (+5/-2, the FR-022 disambiguation only) touched a single paragraph with no other prose depending on its old wording; the `spec.md` diff (+1/-1) touched only the NFR-005 Requirement cell, whose Measure cell (`≥ 80% coverage on new code`) was already scope-agnostic and needed no change. **No drift introduced by the fix.**

## Three cross-cutting mechanisms — consistency re-check

**NFR-002 replay determinism (`transcript.durationMs` normalization, three levels deep)**
- `spec.md` NFR-002 states the outcome ("running it twice yields byte-identical verdict `--json`") without prescribing the mechanism — correctly left to plan.
- `plan.md` Hazard 3 fully designs it: `Transcript` is a required, unconditionally-stamped field (verified `runner.ts:547` `const started = Date.now();`, `:572` `durationMs: Date.now() - started;`, both exact matches); the replay-only fix builds a copy three levels deep, `CaseVerdict[] → RunVerdict[] → Transcript`, citing `types.ts:82-88,102-106,124-128` for the three interfaces (verified: `Transcript` at line 81, `RunVerdict` at line 100/101, `CaseVerdict` at line 123/124 — citations accurate to within normal "region" precision).
- `tasks.md` T022 implements it ("replay-only `durationMs` normalization to `0` three levels deep before `JSON.stringify`") and T025 tests it with a forced-timing-difference assertion, matching plan.md's anti-vacuous-test design exactly.
- **Consistent across all three artifacts.**

**NI-004 guard (FR-024) — directory-walk scope, quote/paren-aware scan**
- `spec.md` FR-024 states the requirement generically ("scans all runner files for a `Promise.all` call wrapping a `.chat(`/`.chatWithTools(` call site"), correctly deferring algorithm/scope to plan.
- `plan.md`'s "NI-004 design" section specifies directory-walk scope over `src/adapters/`, `src/core/behavioral/`, `src/crosslayer/`, quote/template-literal-aware comment stripping, and paren-balance enclosure detection — verified against source: `grep -rln '\.chat(\|\.chatWithTools(' src/adapters src/core/behavioral src/crosslayer` returns exactly the 10 files plan.md names (alphabetically identical list); `find ... -name "*.ts" | wc -l` returns exactly 83 files at ~25,022 lines, matching plan's "83 `.ts` files, ~25,000 lines" claim; `memory-utilization/index.ts`'s "Promise.all" comment sits at lines 7 and 288 (exact match) with a real `.chat(` call at line 181 (exact match); `crosslayer/rule-survival.ts`'s "Promise.all" comment sits at line 309, exactly 13 lines from the real `.chat(` call at line 322 — plan's "13 lines from" claim is exact; zero `*.test.ts`/`*.spec.ts` files exist under `src/` (confirmed), matching plan's claim this scope needs no test-file exclusion.
- `tasks.md` T028/T029 implement the same algorithm and the same two named must-not-false-positive fixtures.
- **Consistent across all three artifacts**, and unusually precisely grounded against source.

**NFR-005 coverage gate (≥80% new-code, whole-file vs. per-region, type-only carve-out)**
- Covered above under ANALYZE-002. **Consistent** post-fix.

## Detection passes

**Duplication** — No harmful duplication found. Requirement tables, design elaborations, and WP/task breakdowns restate spec content at increasing levels of detail as expected of spec→plan→tasks; no two artifacts assert conflicting versions of the same fact.

**Ambiguity** — No remaining ambiguity found in Requirements, Non-Goals, Locked Decisions, or Open Questions. All five items spec.md deferred to "plan-time" (suite index schema, non-empty-directory semantics, surplus-exchange behavior, file-per-case mapping, size-lint threshold) are concretely resolved in plan.md's "Design decisions resolving the spec's 'plan-time' Open Questions" section with no residual TBD. FR-013's "exact name TBD at plan time, e.g. `stale?: boolean`" is resolved to exactly `stale?: boolean` in plan.md and implemented as such in tasks.md T023.

**Underspecification** — None found. All 24 FRs, 7 NFRs, and 9 constraints map to at least one Implementation Concern in plan.md and at least one WP/task in tasks.md (cross-checked plan.md's "FR / NFR / Constraint coverage" table against tasks.md's "Requirement → Work Package map" — both enumerate the same 24 FRs with matching WP assignments). All 16 acceptance scenarios map to a test location and a WP (tasks.md's "Acceptance scenario traceability" table).

**Charter alignment** — Consistent. The ≥80% new-code SonarCloud coverage gate (charter Testing Standards / Quality Gates) matches NFR-005 verbatim in threshold and "new code only, no whole-project floor" framing. "An errored run counts as a failed run everywhere" (charter Testing Standards) matches this mission's own FR-013 replay-miss handling (labeled distinctly as `stale`, but still counted as a failed run via the existing error-containment path, not skipped/retried). "Every judge-backed grader ships with a rigged-impossible control case" (charter) matches FR-019's discrimination-control cassette. C-007/C-008 map directly to charter Branch Strategy and Project Directive 1 (scope guard) respectively, both PASS in plan.md's Charter Check. No hardcoded model providers / no credentials constraint (charter Deployment Constraints) matches C-004/FR-020's credential-redaction requirements.

**Coverage gaps** — None found. Every FR/NFR/C traces to a WP; every acceptance scenario traces to a test location; the one plan-authored behavior with no spec.md scenario (non-empty-target-directory semantics, design decision #2) is explicitly flagged in both plan.md and tasks.md as "not lost at implementation time" and given its own test (`store.test.ts`, owned by WP03).

**Inconsistency** — One low-severity finding: **ANALYZE-003** (see carrier above) — a two-line citation drift between `plan.md` (`cli.test.ts:727`, correct) and `tasks.md` T025 (`cli.test.ts:725`, off by two lines) for the same `vi.spyOn(globalThis, "fetch")` precedent. Non-blocking; the surrounding prose in both documents makes the intended precedent unambiguous regardless of the exact line cited.

## Source verification summary

The following citations (non-exhaustive list of the highest-value checks) were verified directly against `/home/jeroennouws/dev/muster-missions/99` at `db80a42` and found accurate: `types.ts:66/101/112` (ANALYZE-001), `openclaw-sop/runner.ts:191-194,351-354,424-427` (FR-001's three mock-literal sites), `canonical-json.ts:22` (`canonicalJson` export), `memory-utilization/rubric.ts:234` (`blindArmOrder`), `spec-kitty-profile/projection.ts:32,133` (sole existing `createHash` call site — confirmed no second site anywhere in `src/`), `behavioral/client.ts:57` (`hostnameOf`, confirmed currently module-private), `invariants.test.ts`'s `FETCH_ALLOWED` list (exact match), `skills/trigger.ts:91` (`resolveEndpointBaseUrl`) and `:115` (`TriggerChatClient` interface), `heartbeat/index.ts:497` region, `cli/index.ts` `buildSopClient`/`doSopRun`/`doToolsRun`/crosslayer-fallback regions, `cli/index.ts:387` (`BehaveOpts`), `:414` (`doBehaveRun`), `:482-490` (exit-code heuristic block), `:1979` (`behave` command), `runner.ts:547/562/572` (timing/catch-block citations, exact), `tests/behavioral/runner.test.ts` (895 lines, 11 `describe` blocks — exact match to plan/tasks' claim), `tests/unit/cli.test.ts:377` (`"muster behave run"` describe block), `tests/adapters/openclaw-sop/runner.test.ts`'s four mock-client factory names (all confirmed to exist, no `"mock"` literal in the test file today), `package.json:77` (`test:coverage` script) and `vitest.config.ts` coverage config, `behavioral/types.ts` (192 lines, zero executable statements per grep — type-only carve-out confirmed valid).

## Verdict

**`ready`** — one low-severity finding (`ANALYZE-003`), no high/critical findings, `ANALYZE-001` and `ANALYZE-002` both genuinely resolved and verified against source, no drift introduced by the fix round, and all three re-verified cross-cutting mechanisms (NFR-002 durationMs normalization, NI-004 guard, NFR-005 coverage gate) agree across `spec.md`, `plan.md`, and `tasks.md`.

## Persistence note

`spec-kitty agent mission record-analysis` could not be used for this mission: it resolves the project root by following the linked worktree's `.git` pointer back to the primary checkout (`/home/jeroennouws/dev/muster-missions/99`, on protected `main`, with no mission directory present there), so it fails with `Required artifact missing: .../99/kitty-specs/.../spec.md`; there is no `--project-root` flag or environment override to redirect it, so this report and `reviews/analyze-verdict.yaml` were written directly and committed via `spec-kitty safe-commit` instead, per operator authorization, and the canonical `kitty-specs/cassette-core-engine-01KZCWFE/analysis-report.md` location was deliberately left absent.
