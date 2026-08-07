---
schema_version: 1
artifact_type: spec-kitty.analysis-report
command: /spec-kitty.analyze
mission_slug: cassette-core-engine-01KZCWFE
mission_id: 01KZCWFEZC1TS3N5250Q5G0XPM
generated_at: 2026-08-07T10:18:07+00:00
analyzer_agent: claude (Sonnet 5, ANALYZE seat, final re-analysis after fix round 43b4b48)
input_artifacts:
  spec.md:
    path: kitty-specs/cassette-core-engine-01KZCWFE/spec.md
    sha256: ad85b80a520adc3dc2075f18b0f0ac0d673550e6b1bbf1ca31051dc8538b06d4
  plan.md:
    path: kitty-specs/cassette-core-engine-01KZCWFE/plan.md
    sha256: 0e799e6f5f6059c67b853823427dc6a5b0c3435bafa08b9b4545aeb2d66d23a5
  tasks.md:
    path: kitty-specs/cassette-core-engine-01KZCWFE/tasks.md
    sha256: 6848ad5eacaa98942f96fa011421b0ec470bdd047a6fb58a14d70a732280b7e7
  charter:
    path: .kittify/charter/charter.md
    sha256: c6b7d972b530b54b5ded0bbd9978f338780f75a22aa4c422ced5bb27d34710e2
schema: analysis-findings/v1
verdict_hint: ready
verdict: ready
counts:
  low: 0
  medium: 0
  high: 0
  critical: 0
  info: 0
issue_counts:
  low: 0
  medium: 0
  high: 0
  critical: 0
  info: 0
findings: []
---

# Cross-Artifact Analysis Report — cassette-core-engine-01KZCWFE (final re-analysis)

**Mission**: `cassette-core-engine-01KZCWFE` (`01KZCWFEZC1TS3N5250Q5G0XPM`)
**Run**: final re-analysis after fix round `43b4b48` (fixed `ANALYZE-003`, the last open finding from the prior cross-artifact analysis pass)
**Artifacts reviewed**: `spec.md` (416 lines), `plan.md` (997 lines), `tasks.md` (263 lines), `.kittify/charter/charter.md` (62 lines)
**Codebase verified against**: `/home/jeroennouws/dev/muster-missions/99` at commit `db80a42` (`fix(openclaw-sop): stop applying the k-run passThreshold to a single run's judge vote (#89)`); `src/` and `tests/` confirmed byte-identical to the worktree checkout.

This is a genuinely fresh pass, not a rubber-stamp of the two prior reports. All three artifacts were read start to finish, all six detection passes were re-run from scratch, and every source-code citation cited below was independently re-verified against the codebase (not trusted from either prior analyze report's own claims).

## Methodology

Six detection passes across all three design artifacts plus the charter: duplication, ambiguity, underspecification, charter alignment, coverage gaps, inconsistency. Every mechanically-checkable citation in `plan.md` and `tasks.md` — line numbers, function/interface signatures, exact file lists, line/file counts, comment contents — was verified directly against the codebase at `db80a42`, not trusted from artifact prose.

## ANALYZE-001 — FR-022 citation disambiguation (re-verified resolved)

`plan.md`'s "Replay miss → `CassetteMissError`" section states `runCase`'s catch block already converts a thrown error into an errored/failed run per "the pre-existing 'an errored run counts as a failed run' contract documented at `src/core/behavioral/types.ts` lines 66/101/112 — an earlier mission's FR-022, distinct from *this* mission's FR-022, the `personaPrompt` purity guard."

**Verified against source** (`src/core/behavioral/types.ts` at `db80a42`, via `grep -n "FR-022"`):
- Line 66: `/** k in k-of-n; an errored run counts as a failed run (FR-022). */`
- Line 101: `/** Verdict for a single run (1..n). Errored runs carry \`error\` and fail (FR-022). */`
- Line 112: `* (FR-022: an errored run counts as a failed run, never partial credit).`

All three lines carry the "an errored run counts as a failed run" contract under an earlier mission's FR-022 label, distinct from this mission's own FR-022 (`spec.md` line 270: `personaPrompt` purity guard — reads none of `Date`, `Math.random`, `process.env`). The disambiguating parenthetical in `plan.md` is accurate. **Resolved.**

## ANALYZE-002 — NFR-005 coverage-scope widening (re-verified resolved)

`spec.md` NFR-005's Requirement column: "All new code added by this mission (across every work package, not only `src/core/cassette/`) MUST meet the project's new-code coverage gate." Its Measure column: "≥ 80% coverage on new code (SonarCloud quality gate), lcov-uploaded" — scope-agnostic, consistent with the Requirement.

Cross-checked against `plan.md:917` ("NFR-005 ... is a cross-cutting gate verified at IC-06 against every concern's new code, not a single concern's output") and `tasks.md:47`/T038 ("NFR-005 ... → WP06, cross-cutting, checked against every WP's new code"; T038 enumerates whole-file coverage for wholly-new files, per-changed-region hit-rate for large shared files, and an explicit type-only carve-out for `behavioral/types.ts`'s `stale?: boolean` addition). Re-confirmed the type-only carve-out is accurate: `grep -nE '^(export )?(function|const|class|enum)' src/core/behavioral/types.ts` returns zero matches against the actual 192-line file — no executable statement exists there. No contradicting mention of NFR-005/coverage scope found anywhere else in the three artifacts. **Resolved.**

## ANALYZE-003 — T025 citation drift (re-verified resolved)

Prior finding: `tasks.md` T025 cited `tests/unit/cli.test.ts:725` (the enclosing `it(...)` line) for the NFR-003 zero-network-I/O precedent, while `plan.md` correctly cited `:727` (the `vi.spyOn(globalThis, "fetch")` call itself) — a two-line drift.

**Verified against source** (`tests/unit/cli.test.ts` at `db80a42`):
- Line 725: `it("BUG-B: MUSTER_ENDPOINT env var enables behavioral run without manifest endpoint block", async () => {`
- Line 727: `vi.spyOn(globalThis, "fetch").mockImplementation(() => {`

**Verified against current artifact text**: `tasks.md` T025 now reads "...zero network I/O via `vi.spyOn(globalThis, \"fetch\")` mirroring the `cli.test.ts:727` precedent (NFR-003, Scenario 5)..." — the citation now points at line 727, the actual `vi.spyOn` call, matching `plan.md`'s Technical Context and Test Strategy row 5 (both also cite `:727`). Fix commit `43b4b48` is a one-line, single-character-range change (725→727) with no other diff. **Resolved**, and no new drift was introduced by the fix — every other citation in `tasks.md` T025's same sentence (the scenario number, the NFR reference, "BUG-B" framing via `plan.md`) is unaffected and still accurate.

## Fix-introduced issues — hunt result

Searched the full diff of `43b4b48` (one line, `tasks.md` only) and every other `cli.test.ts` line-number citation across `plan.md`/`tasks.md` (both artifacts' only numbered `cli.test.ts` citations are `:377`, the `"muster behave run"` describe block, and `:727`, the `vi.spyOn` precedent — both re-verified exact). No drift introduced. **Clean.**

## Three cross-cutting mechanisms — re-derived and re-checked

**NFR-002 replay determinism (`transcript.durationMs` normalization, three levels deep)**
- `spec.md` NFR-002 states the outcome only ("running it twice yields byte-identical verdict `--json`"), correctly deferring mechanism to plan — and deliberately carries no "modulo `durationMs`" carve-out, unlike NFR-001, which plan.md's Hazard 3 explicitly reasons from.
- `spec.md` NFR-001 requires `Transcript.durationMs` (a *different*, opt-in `CassetteExchange.durationMs` field, `FR-004`) to be excluded from the cassette's own byte-stability comparison — a separate field from the required `Transcript.durationMs` `runner.ts` stamps.
- `plan.md` Hazard 3 designs the fix: `runner.ts:547` (`const started = Date.now();`) and `:572` (`durationMs: Date.now() - started`) verified exact against source — unconditional, mode-unaware timing. The replay-only fix builds a copy three levels deep — `CaseVerdict[] → each CaseVerdict.runs: RunVerdict[] → each RunVerdict.transcript: Transcript` — citing `types.ts:82-88,102-106,124-128`; re-verified against source: `Transcript` interface at line 81 (`export interface Transcript {`), `RunVerdict` at line 102 (`export interface RunVerdict {`, `runs`/`transcript` fields confirmed), `CaseVerdict` at line 124 (`runs: RunVerdict[]` confirmed at line 128) — citations accurate to normal region-citation precision. `doBehaveRun`'s emission (`io.outLine`, verified at line 475) sits above the exit-code branch (`allRuns.every(...)`, verified at line 482-489, text matches plan.md's quoted excerpt verbatim including the `io.errLine` string), confirming Hazard 3's "exit-code branch reads only `run.error`, never `durationMs`, so ordering is safe" claim.
- `tasks.md` T022 implements it ("replay-only `durationMs` normalization to `0` three levels deep before `JSON.stringify`... Hazard 3, NFR-002"); T025 tests it with a forced-timing-difference assertion between two replay invocations, matching plan.md's anti-vacuous-test design exactly.
- **Consistent across `spec.md`, `plan.md`, `tasks.md`.**

**NI-004 guard (FR-024) — directory-walk scope, quote/paren-aware scan**
- `spec.md` FR-024 states the requirement generically, correctly deferring algorithm and scope to plan.
- `plan.md`'s "NI-004 design" specifies a directory walk over `src/adapters/`, `src/core/behavioral/`, `src/crosslayer/`, with quote/template-literal-aware comment stripping and paren-balance enclosure detection. Re-verified against source: `grep -rln '\.chat(\|\.chatWithTools(' src/adapters src/core/behavioral src/crosslayer` returns exactly the 10 files plan.md names, alphabetically identical. `find src/adapters src/core/behavioral src/crosslayer -name '*.ts' | wc -l` returns 83; total line count 25,022 — matches plan's "83 `.ts` files, ~25,000 lines" exactly. Zero `*.test.ts`/`*.spec.ts` files exist under `src/` (confirmed) — matches plan's "no test-file exclusion needed" claim. `src/adapters/memory-utilization/index.ts` carries a `"Promise.all"` comment substring at lines 7 and 288 (exact match) near a real `.chat(` call at line 181; `src/crosslayer/rule-survival.ts` carries the same at line 309, exactly 13 lines from its real `.chat(` call at line 322 — plan's "13 lines from" claim is exact. `blindArmOrder` confirmed at `rubric.ts:234` exactly, matching spec.md's Acceptance Scenario 4 citation.
- `tasks.md` T028/T029 implement the same algorithm and name the same two must-not-false-positive fixtures.
- **Consistent across all three artifacts**, and precisely grounded against the live tree.

**NFR-005 coverage gate (≥80% new-code, whole-file vs. per-region, type-only carve-out)**
- Covered under ANALYZE-002 above. **Consistent.**

## Detection passes

**Duplication** — None harmful. Spec→plan→tasks restate the same facts at increasing detail (expected of this pipeline); no two artifacts assert conflicting versions of any requirement, design decision, or citation.

**Ambiguity** — None found. All five items `spec.md` deferred to "plan-time" (suite index schema, non-empty-directory semantics, surplus-exchange behavior, file-per-case mapping, size-lint threshold) are concretely resolved in `plan.md`'s "Design decisions resolving the spec's 'plan-time' Open Questions," with no residual TBD. FR-013's "exact name TBD at plan time, e.g. `stale?: boolean`" resolves to exactly `stale?: boolean`, implemented as such in `types.ts` and `tasks.md` T023.

**Underspecification** — None found. All 24 FRs, 7 NFRs, 9 constraints (spec.md's own header count, independently re-counted via table-row grep: 24/7/9/7 — matches) map to at least one Implementation Concern in `plan.md` and at least one WP/task in `tasks.md`; `plan.md`'s "FR / NFR / Constraint coverage" table and `tasks.md`'s "Requirement → Work Package map" enumerate the same 24 FRs with matching WP assignments. All 16 acceptance scenarios map to a test location and a WP.

**Charter alignment** — Consistent. The ≥80% new-code SonarCloud coverage gate (charter Testing Standards/Quality Gates) matches NFR-005 verbatim. "An errored run counts as a failed run everywhere — never skipped, never retried" (charter) matches FR-013's replay-miss handling (labeled distinctly as `stale`, but still routed through the existing error-containment path, never skipped). "Every judge-backed grader ships with a rigged-impossible control case" (charter) matches FR-019's discrimination-control cassette. C-007/C-008 map to charter Branch Strategy and Project Directive 1 respectively, both PASS in `plan.md`'s Charter Check. "No hardcoded model providers and no credentials in the repository" (charter Deployment Constraints) matches C-004/FR-020's credential-redaction requirements.

**Coverage gaps** — None found. Every FR/NFR/C traces to a WP; every acceptance scenario traces to a test location and WP; the one plan-authored behavior with no `spec.md` scenario (non-empty-target-directory semantics, design decision #2) is explicitly flagged in both `plan.md` and `tasks.md` and given its own dedicated test (`store.test.ts`, WP03).

**Inconsistency** — None found. `ANALYZE-001`, `ANALYZE-002`, `ANALYZE-003` are all genuinely resolved (re-verified against source above); no new inconsistency was introduced by any of the three fix commits (`653dced`, `43b4b48`) or discovered independently in this pass.

## Source verification summary

Citations independently re-verified against `/home/jeroennouws/dev/muster-missions/99` at `db80a42` and found accurate: `types.ts:66/101/112` (ANALYZE-001), `cli.test.ts:725/727` (ANALYZE-003), `openclaw-sop/runner.ts:191-194,351-354,424-427` (FR-001's three mock-literal sites), `behavioral/client.ts:57` (`hostnameOf`, confirmed module-private pre-mission), `skills/trigger.ts:71,91` (`ResolvedEndpointBaseUrl`/`resolveEndpointBaseUrl`) and `:115,120` (`TriggerChatClient`/`chatWithTools` signature — confirmed structurally distinct from core's `ToolChatClient.chatWithTools(messages: ChatMessage[], tools: unknown[]): Promise<unknown>` at `client.ts:105-109`), `types.ts:187-192` (`ChatClient.chat`), `tools/selection.ts` (`FetchFn` type, default `globalThis.fetch`, no `ChatClient`/`ToolChatClient` reference — confirmed), `cli/index.ts:1615` (`buildSopClient`) and `:1643` (`SOP_NOOP_CLIENT`), `:1778` (`doToolsRun`'s `MUSTER_ENDPOINT` check, exact line match to FR-018's citation), `:936-943` (crosslayer's error-message-substring endpoint-block fallback, confirmed matches FR-018's description), `heartbeat/index.ts:497` (`MUSTER_ENDPOINT` read, exact), `memory-utilization/rubric.ts:234` (`blindArmOrder`, exact), `spec-kitty-profile/projection.ts:32,133` (sole existing `createHash` call site — confirmed no second site in `src/`), `a2a/signature.ts:22` (`createPublicKey`/`verify`, confirmed distinct from `createHash`, not a second precedent), `invariants.test.ts`'s `FETCH_ALLOWED`/`walk()`/`BASE_EXCLUDES` (exact), `runner.ts:525,547,562,572` (`runCase`, timing, catch block — exact), `types.ts:81,102,124,128` (`Transcript`/`RunVerdict`/`CaseVerdict`, `passRate?: number` additive-field precedent confirmed at lines 120/136), `cli/index.ts:475-489` (emission + exit-code block, verbatim match to plan.md's quoted excerpt).

## Verdict

**`ready`** — findings-free. `ANALYZE-001`, `ANALYZE-002`, and `ANALYZE-003` are all genuinely resolved and re-verified against source in this pass; no new finding was manufactured or suppressed. All three re-derived cross-cutting mechanisms (NFR-002 `durationMs` normalization, NI-004 guard, NFR-005 coverage gate) agree across `spec.md`, `plan.md`, and `tasks.md`, and every mechanically-checkable source citation examined in this pass matched the codebase exactly. This closes the design-analysis loop for this mission.

## Persistence note

`spec-kitty agent mission record-analysis` could not be used for this mission: it resolves the project root by following the linked worktree's `.git` pointer back to the primary checkout (`/home/jeroennouws/dev/muster-missions/99`, on protected `main`, with no mission directory present there), so it fails with `Required artifact missing`; there is no `--project-root` flag or environment override to redirect it. This report and `reviews/analyze-verdict.yaml` were written directly and committed via `spec-kitty safe-commit` instead, per operator authorization; the canonical `kitty-specs/cassette-core-engine-01KZCWFE/analysis-report.md` location was deliberately left absent, per operator instruction.
