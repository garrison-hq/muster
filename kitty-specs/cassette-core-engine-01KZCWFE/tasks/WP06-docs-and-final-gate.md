---
work_package_id: WP06
title: Documentation and mission-closing gate verification
dependencies:
- WP01
- WP02
- WP03
- WP04
- WP05
requirement_refs:
- FR-012
- FR-023
tracker_refs: []
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this mission were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T036
- T037
- T038
phase: Phase 4 — Documentation and final gate (WP06, depends on all)
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

# Work Package Prompt: WP06 – Documentation and mission-closing gate verification

## Goal

Publish `docs/guides/cassette-format.md` (the `chat()`/`chatWithTools()`
fidelity asymmetry FR-012 requires be documented), add the SC-006
cross-boundary public-API smoke test, and perform the mission-closing
confirmation that `pnpm test`, `tsc --noEmit`, and the SonarCloud
≥80%-new-code gate are all green with every prior WP's changes included.

Priority: P2 · Estimated prompt size: ~120 lines.

## Owned files

- `docs/guides/cassette-format.md`
- `tests/cassette/public-api.test.ts`

## Subtasks

- **T036** — `docs/guides/cassette-format.md` (new): the
  `chat()`/`chatWithTools()` fidelity asymmetry, the information-loss
  limitation (only `choices[0].message.content` survives the `chat()` seam
  — `finish_reason`/`usage`/additional `choices`/server-echoed `model` are
  discarded), and the requested-vs-served model distinction (FR-012). [P]
- **T037** — `tests/cassette/public-api.test.ts` (new): SC-006 — imports
  `makeCassetteClient` (WP03) and `resolveExecutionSource` (WP02) from a
  path outside `src/core/`, the way a wave-2 adapter would, proving genuine
  cross-boundary consumption.
- **T038** — Final gate verification (FR-023): `pnpm test` (full Vitest
  suite incl. every fixture suite) and `tsc --noEmit` green with every WP's
  changes included; the authoritative coverage check is SonarCloud's
  ≥80%-new-code quality gate in CI (NFR-005, charter Quality Gates) — the
  check that actually blocks the PR, measured on changed lines only, not on
  any file's aggregate. Locally, run `pnpm test:coverage` (`vitest run
  --coverage`, `package.json:77`) and inspect the v8 text/lcov summary
  (`vitest.config.ts:11-14`, `include: ["src/**"]`) as a pre-PR proxy,
  reading it per file class: for the wholly-new files this mission adds —
  `src/core/cassette/{types,hash,errors,store,client,index}.ts`,
  `src/core/execution-source.ts` — whole-file coverage *is* new-code
  coverage, so assert each reports ≥80% line and branch coverage directly
  from the summary, and fail the gate on any shortfall there. For the
  large, only-partially-touched shared files this mission edits —
  `src/adapters/openclaw-sop/runner.ts`, `src/cli/index.ts` (2364 lines
  total; this mission touches ~3 narrow regions of it),
  `src/core/behavioral/{types,client,runner}.ts` — the file's aggregate
  percentage is not a valid stand-in (pre-existing, unrelated code in those
  files can pull it either direction independent of this mission's own
  lines); instead open the lcov report's per-line hit annotations for just
  the regions this mission changed (per WP: T001/T002 in
  `runner.ts`/`index.ts`'s SOP region, T012 in `behavioral/client.ts`'s
  `hostnameOf` export, T020-T022/T024 in `index.ts`'s `behave run` region
  and `behavioral/runner.ts`'s catch block) and confirm ≥80% of each
  region's changed lines/branches are hit, matching NFR-005's threshold
  exactly rather than a stricter 100%-hit bar; fail the gate and route back
  to the under-covered WP if a changed region's hit rate falls below 80%.
  T023's `stale?: boolean` addition to `behavioral/types.ts` is excluded
  from this per-region enumeration: `grep -nE
  '^(export )?(function|const|class|enum)' src/core/behavioral/types.ts`
  returns no matches — the whole 192-line file is interface/type
  declarations only, erased at compile time, so there is no executable
  line or branch there for v8/lcov to report and the change carries no
  coverage obligation. Treat the regional read as a local sanity check
  only — SonarCloud's own new-code measurement in CI is the check of
  record and can still differ (NFR-005).

## Dependencies

WP01, WP02, WP03, WP04, WP05 (all) — this is the mission's final
integration pass; FR-023 requires the full tree green, not just this WP's
own new files, and T037 specifically needs both WP03's and WP02's exports
to exist.

## Parallel

None — always last.

## Risks

None material. The only failure mode is discovering a gate regression
introduced by an earlier WP; T038 exists precisely to catch that before
this mission is handed to review, not to introduce new risk itself.

## Independent test

`pnpm test` and `tsc --noEmit` both green from a clean checkout with all
five prior WPs merged; `tests/cassette/public-api.test.ts` imports both
`makeCassetteClient` and `resolveExecutionSource` successfully from outside
`src/core/`; `pnpm test:coverage` reports ≥80% line/branch coverage for
every wholly-new file this mission adds, and shows ≥80% of changed
lines/branches hit in the touched regions of the large shared files it
edits (`src/cli/index.ts`, `src/adapters/openclaw-sop/runner.ts`,
`src/core/behavioral/{client,runner}.ts`; `behavioral/types.ts`'s
`stale?: boolean` addition is type-only with zero executable statements, so
it carries no coverage obligation and is excluded from this read) — as the
local signal that SonarCloud's ≥80%-new-code gate (NFR-005), the check that
actually blocks the PR, will clear.
