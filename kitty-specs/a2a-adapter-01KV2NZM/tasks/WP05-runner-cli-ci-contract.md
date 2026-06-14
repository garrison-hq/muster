---
work_package_id: WP05
title: Manifest runner + CLI wiring + CI contract + docs
dependencies:
- WP01
- WP02
- WP03
- WP04
requirement_refs:
- FR-001
- FR-012
- FR-013
- FR-014
- NFR-006
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts were generated on feat/a2a-adapter (main is protected). During implementation this WP builds on the single mission lane atop WP01-WP04; completed changes merge into main via one PR unless the human redirects the landing branch.
created_at: '2026-06-14T09:11:11Z'
subtasks:
- T024
- T025
- T026
- T027
- T028
- T029
- T030
assignee: claude
agent: claude:sonnet:implementer:implementer
history: []
authoritative_surface: src/adapters/a2a/
execution_mode: code_change
owned_files:
- src/adapters/a2a/index.ts
- src/cli/index.ts
- tests/a2a/manifest.test.ts
- tests/fixtures/a2a/manifest.json
tags: []
---

# WP05 — Manifest runner + CLI wiring + CI contract + docs

## Objective

Assemble the adapter and ship the user-facing surface:

1. **`src/adapters/a2a/index.ts`** — the `A2aAdapter` class (stubbed `SpecAdapter`
   methods, mirroring heartbeat) + `runManifest` that iterates every grading class and
   produces a `ManifestSummary` with correct skip/fail/exit semantics (FR-001, FR-012).
2. **`src/cli/index.ts`** (existing — wiring only) — `muster a2a run <manifest>` with a
   `doA2aRun` handler (`--json` + human output, exit-code contract), the `A2aAdapter`
   registry entry, the `--adapter a2a` choice, and the static `muster check --adapter a2a`
   path (FR-012, FR-013).
3. **`tests/fixtures/a2a/manifest.json`** — the full manifest exercising all four grading
   classes + every discrimination control (FR-014).
4. **`tests/a2a/manifest.test.ts`** — end-to-end runner integration; assert controls fail,
   exit-code/skip semantics hold.
5. CLI help/env docs + verify the `quickstart.md` CI recipe.

This is the only WP that modifies an existing file (`src/cli/index.ts`).

## Context

- Spec: `spec.md` (FR-001, FR-012, FR-013, FR-014, NFR-005, NFR-006).
- Contracts: `contracts/manifest-and-report.md` (manifest input, report output, exit codes).
- Quickstart: `quickstart.md` (commands + CI recipe to verify).
- Depends on ALL of WP01–WP04 (imports `card`, `types`, `lint`, `signature`, `transport`,
  all three graders, and the test-server for the integration test).
- Peer reference: `src/adapters/heartbeat/index.ts` (`HeartbeatAdapter` + `runManifest`),
  and `src/cli/index.ts` heartbeat wiring (`doHeartbeatRun`, `ADAPTER_REGISTRY`,
  `--adapter` choices, `setExit`). Mirror those exactly.

**Hard rules**:
1. Touch only `owned_files`. In `src/cli/index.ts` ADD a2a wiring; do NOT alter unrelated commands.
2. Exit-code contract (FR-012): `summary.failed > 0 → 1`; else `0` (skipped never fails);
   manifest/IO error → `2` (via the existing `ExecutionError` path).
3. `A2aAdapter` reuses the core; `src/core/` imports nothing a2a-specific (C-001, FR-001).
4. The adapter uses `MUSTER_A2A_ENDPOINT`/`MUSTER_A2A_TOKEN` only — never the chat-model env.

## Subtasks

### T024 — A2aAdapter class (SpecAdapter stubs)
**Purpose**: Satisfy the `SpecAdapter` contract behind the boundary (FR-001).

**Steps**:
1. In `index.ts`, `export class A2aAdapter implements SpecAdapter` mirroring `HeartbeatAdapter`:
   `name = "a2a"`, `specVersion = VERSION`, `mergeStrategy`, `thresholds`, and stub
   `parse`/`validate`/`resolve`/`evaluateTriggers` (pass-through/empty — A2A is not an RFC-1
   Soul spec). Re-export the adapter’s public surface (`runManifest`, `lintCard`, types).

**Files**: `index.ts`
**Validation**: `tsc` strict; `new A2aAdapter().name === "a2a"`.

### T025 — runManifest → ManifestSummary
**Purpose**: Drive all grading classes and aggregate the summary (FR-012).

**Steps**:
1. `export async function runManifest(manifestPath: string, projectRoot?: string): Promise<ManifestSummary>`:
   - `loadManifest` (WP01); for each case dispatch by `gradingClass`:
     - `static-lint` → `lintCard` (WP02) with the case’s card + optional jwks fixture. Always runs.
     - `skill-behavior` → if `envEndpoint()` null → skipped; else `probeSkill`/`aggregateSkillBehavior` (WP03).
     - `auth-negative` → if `envEndpoint()` null → skipped; else `checkAuthEnforcement` (WP04).
     - `signed-card-live` → if `envEndpoint()` null → skipped; else `checkLiveSignedCard` (WP04, may nested-skip).
   - Map each to a `CaseResult` (`passed`/`skipped`/`skipReason`/`detail`). A thrown live error →
     `passed:false` (failed run), NOT skipped (FR-010).
   - For `control:true` cases, the case passes iff the grader **fails** (i.e. the control behaves as
     designed); surface this so a control that stops discriminating turns the suite red.
   - Tally `totalCases/passed/failed/skipped`.

**Files**: `index.ts`
**Validation** (T029): mixed manifest → correct tallies; env-unset → live cases skipped, static still run.

### T026 — CLI `muster a2a run` + doA2aRun
**Purpose**: User-facing run command with the CI contract.

**Steps**:
1. In `src/cli/index.ts`, mirror the heartbeat block:
   ```ts
   const a2a = program.command("a2a").description("A2A adapter: static card lint + live conformance probes (skill-behavior, auth-negatives, signed cards)");
   a2a.command("run")
     .description("Run the A2A conformance manifest")
     .argument("<manifest>", "path to a2a adapter manifest JSON")
     .addHelpText("after", /* env: MUSTER_A2A_ENDPOINT, MUSTER_A2A_TOKEN; live cases skip when endpoint unset */)
     .action(async (manifest, _local, cmd) => { setExit(await doA2aRun(manifest, cmd.optsWithGlobals(), io)); });
   ```
2. `async function doA2aRun(manifestPath, opts, io): Promise<number>` mirroring `doHeartbeatRun`:
   run `runManifest(toAbsolute(manifestPath), process.cwd())` inside try/catch (`ExecutionError`
   → exit 2); print `opts.json ? JSON.stringify(summary,null,2) : formatA2aSummaryHuman(summary)`;
   `return summary.failed > 0 ? 1 : 0`.

**Files**: `src/cli/index.ts`
**Validation** (T029): failing case → exit 1; all pass/skip → exit 0; bad manifest → exit 2; `--json` emits summary.

### T027 — CLI registry + `--adapter a2a` + static check path
**Purpose**: Static-only lint via the shared `check` command.

**Steps**:
1. Add `a2a: () => new A2aAdapter()` to `ADAPTER_REGISTRY`; add `"a2a"` to the `--adapter` `.choices([...])`.
2. In `doCheck`, add the a2a branch mirroring heartbeat: `if (opts.adapter === "a2a") { const report = await lintCard(parseAgentCard(read(abs), abs)); io.outLine(serializeLintReport(report)); return report.ok ? 0 : 1; }`.

**Files**: `src/cli/index.ts`
**Validation** (T029): `muster check --adapter a2a tests/fixtures/a2a/cards/valid.json` → ok, exit 0; obsolete-uri → exit 1.

### T028 — Full manifest fixture [P]
**Purpose**: Exercise every grading class + control (FR-014).

**Steps**:
1. `tests/fixtures/a2a/manifest.json` per `contracts/manifest-and-report.md` §1: static-lint
   (valid, obsolete-uri, signed-ok, tampered-fails), skill-behavior (honest + control),
   auth-negative (enforced + control), signed-card-live (+ control). Reference the WP01–WP04 fixtures.

**Files**: `tests/fixtures/a2a/manifest.json`
**Validation**: consumed by T029.

### T029 — Manifest runner integration test
**Purpose**: End-to-end proof incl. controls + exit/skip semantics.

**Steps**:
1. `tests/a2a/manifest.test.ts`: (a) run with NO endpoint → static cases run, live cases
   `skipped`, exit maps to 0 when no static failure; (b) start the WP03 in-process server,
   set `MUSTER_A2A_ENDPOINT`, run full manifest → live cases run; (c) assert every `control:true`
   case reports the control firing (grader fails as designed); (d) assert a deliberately-failing
   case yields `failed>0`. Tear down server + unset env in `afterEach`.

**Files**: `tests/a2a/manifest.test.ts`
**Validation**: green; ≥80% new-code coverage of `index.ts`; SonarCloud gate passes (NFR-006).

### T030 — CLI help/env docs + quickstart verification
**Purpose**: Ship the CI-monitoring posture docs (FR-012).

**Steps**:
1. Ensure `a2a run --help` documents `MUSTER_A2A_ENDPOINT`/`MUSTER_A2A_TOKEN`, the skip-on-unset
   behavior, and the exit-code/JSON contract. 2. Re-run the `quickstart.md` commands and correct
   any drift so the documented CI recipe matches actual CLI behavior.

**Files**: `src/cli/index.ts` (help text) — quickstart.md already committed; only fix if commands drift.
**Validation**: help text accurate; quickstart commands run as written.

## Branch Strategy
Single mission lane atop WP01–WP04 on `feat/a2a-adapter`; merges to `main` via one PR.

## Definition of Done
- [ ] `A2aAdapter` implements `SpecAdapter`; `runManifest` aggregates all grading classes with
      correct skip/fail/exit semantics (FR-001, FR-012).
- [ ] `muster a2a run <manifest>` + `--json` + exit-code contract; `muster check --adapter a2a`
      static path; registry + `--adapter` choice added.
- [ ] Full `manifest.json` exercises all four grading classes + every control.
- [ ] `manifest.test.ts` green (env-unset skip path + live path + controls fire + failure→exit 1).
- [ ] `tsc` strict + full Vitest suite green; SonarCloud quality gate passes (NFR-006); no new deps.
- [ ] Only `owned_files` touched; `src/core/` imports nothing a2a-specific (C-001).

## Reviewer guidance
Confirm the exit-code contract exactly (`failed>0?1:0`, IO error→2, skip never fails); confirm
control cases pass iff the grader fails; confirm no chat-model env leaks in; confirm the CLI diff
is additive (no unrelated command changed); run `muster a2a run` against the in-process server to
prove end-to-end, not just unit-green (live-smoke gate).
