---
work_package_id: WP04
title: CLI surfacing + examples + docs (B5)
dependencies:
- WP02
- WP03
requirement_refs:
- FR-006
- FR-007
- FR-008
- FR-009
- FR-013
- NFR-003
planning_base_branch: kitty/mission-a2a-behavioral-conformance
merge_target_branch: kitty/mission-a2a-behavioral-conformance
branch_strategy: Planning artifacts for this feature were generated on kitty/mission-a2a-behavioral-conformance. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into kitty/mission-a2a-behavioral-conformance unless the human explicitly redirects the landing branch.
subtasks:
- T020
- T021
- T022
- T023
- T024
- T025
agent: "claude:opus:reviewer:reviewer"
shell_pid: "882609"
history:
- Created by /spec-kitty.tasks for mission a2a-behavioral-conformance-01KVJDWE
authoritative_surface: src/adapters/a2a/index.ts
execution_mode: code_change
owned_files:
- src/adapters/a2a/index.ts
- src/cli/index.ts
- src/cli/output.ts
- examples/a2a/behavioral-persona.yaml
- examples/a2a/behavioral-explicit.yaml
- tests/a2a/behavioral-cli.test.ts
- site/a2a-behavioral.md
tags: []
---

# WP04 — CLI surfacing + examples + docs (B5)

## Objective

Surface behavioral A2A cases through the existing `muster a2a run`: route by manifest `kind`,
map the runner's `CaseVerdict[]` to the established **exit contract (0/1/2)** and to human +
`--json` output, ship two runnable example manifests, and write docs that cite spec sections.
Preserve skip-when-absent and **no regression** to static/skill/auth/signed paths.

Final integration WP. Depends on WP02 (manifest loader) and WP03 (runner + classification).

## Context (read before coding)

- Contract (authoritative): `kitty-specs/a2a-behavioral-conformance-01KVJDWE/contracts/cli-contract.md`.
- Quickstart (mirror its examples): `.../quickstart.md`.
- Existing surfaces: `src/adapters/a2a/index.ts` `runManifest()` (grader dispatch by
  `gradingClass`), the `muster a2a run` handler in `src/cli/index.ts`, and `formatA2aSummaryHuman`
  in `src/cli/output.ts`.
- From WP02: `loadBehavioralManifest()`. From WP03: `runBehavioralCases()` + the exit
  classification (`allErrored`).
- Reuse env activation from `transport.ts` (`envEndpoint()` → absent ⇒ skip).
- Charter: no credential ever printed; `--json` to stdout / human summary as existing.

## Subtasks

### T020 — Route by manifest `kind: behavioral`

**Purpose:** Send behavioral manifests down the new path without disturbing the static loader.

**Steps:**
1. In `src/adapters/a2a/index.ts`, before the existing `loadManifest()` (static) runs, peek at
   the manifest's `kind` (read the YAML's `kind` field cheaply, or try the behavioral loader when
   `kind: behavioral`).
2. If `kind === "behavioral"` → `loadBehavioralManifest()` (WP02) + `runBehavioralCases()` (WP03);
   otherwise fall through to the **unchanged** static/skill/auth/signed path.
3. Do **not** modify `src/adapters/a2a/types.ts` (the static `loadManifest`). Routing lives in
   `index.ts` only.

**Files:** `src/adapters/a2a/index.ts`.

### T021 — Map verdicts → summary + exit codes

**Purpose:** Honor the behave exit contract (FR-008).

**Steps:**
1. Build (or extend) a summary object the CLI consumes carrying behavioral `CaseVerdict[]`.
2. Exit mapping in the `a2a run` handler (`src/cli/index.ts`): no endpoint (`envEndpoint()` null)
   ⇒ cases reported **skipped**, exit 0; all cases passed ⇒ 0; ≥1 case failed ⇒ 1; runner's
   `allErrored` ⇒ 2. Keep the existing static-path exit logic intact for non-behavioral manifests.

**Files:** `src/adapters/a2a/index.ts`, `src/cli/index.ts`.

### T022 — Output formatting (human + `--json`)

**Purpose:** Make failures legible and machine-readable.

**Steps:**
1. Human (`src/cli/output.ts`): a behavioral summary mirroring the behave format — per case
   pass/fail, `passCount/runs`, and for failing runs the axis/turn `measured` vs `limit`
   (reuse the `AxisGrade` shape). Add a `formatA2aBehavioralHuman(...)` rather than overloading
   the static formatter.
2. `--json`: emit the `CaseVerdict[]` (the existing verdict shapes) to stdout, consistent with
   `behave run --json`.
3. Never print the endpoint token or any secret.

**Files:** `src/cli/output.ts`, `src/cli/index.ts`.

### T023 — Example manifests

**Purpose:** Ship runnable examples (FR-013).

**Steps:** create, matching `contracts/a2a-behavioral-manifest.md` + quickstart:
1. `examples/a2a/behavioral-persona.yaml` — a `soul`-referenced case (point at an existing
   `souls/.../Soul.md` in the repo) with verbosity + state_shift axes.
2. `examples/a2a/behavioral-explicit.yaml` — an explicit-`thresholds` case (no soul) with a
   refusal axis (`must_not_contain`) + verbosity.
3. Keep them offline-valid: they must **load** and **skip** cleanly with no endpoint (so CI can
   smoke them statically).

**Files:** `examples/a2a/behavioral-persona.yaml`, `examples/a2a/behavioral-explicit.yaml`.

### T024 — Docs

**Purpose:** Document the new check with spec citations (NFR-004).

**Steps:**
1. `site/a2a-behavioral.md`: what it does, the manifest schema (link the contract), the
   black-box state note, the CI execution model (boot-in-CI; skip/fail/exit), and the two
   examples.
2. Update the layers table / CLI reference entry for `muster a2a run` to mention behavioral cases.
   (If the layers table lives in `site/README.md`, add `site/README.md` to this WP's owned_files
   in a follow-up; otherwise keep the addition in `site/a2a-behavioral.md` and link it.)
3. Every new check cites its spec section (A2A spec + the axis FRs), per `CONTRIBUTING.md`.

**Files:** `site/a2a-behavioral.md`.

### T025 — CLI smoke / integration test + no-regression

**Purpose:** Prove the surface end-to-end and protect the existing paths (NFR-003).

**Steps:**
1. New `tests/a2a/behavioral-cli.test.ts` invoking `runCli([...])` directly (the CLI is testable
   without `process.exit`, per `src/cli/index.ts`).
2. Cases: behavioral manifest with **no** endpoint set ⇒ skip + exit 0; a manifest crafted to
   fail ⇒ exit 1 (mock the runner or use a scripted endpoint); all-errored ⇒ exit 2; `--json`
   shape.
3. Regression: run the existing `examples/a2a/manifest.json` static path and assert identical
   behavior to before (exit code + summary).
4. Add a CLI smoke line mirroring `ci.yml`: `node dist/cli/index.js a2a run
   examples/a2a/behavioral-explicit.yaml` returns 0 (skips offline).

**Files:** `tests/a2a/behavioral-cli.test.ts`.
**Validation:** `pnpm build` + `pnpm test` green; CLI smoke returns 0 offline.

## Definition of Done

- `muster a2a run` runs behavioral manifests, with the 0/1/2 exit contract, skip-when-absent, and
  human + `--json` output; static/skill/auth/signed paths unchanged (regression test proves it).
- Two example manifests + docs with spec citations land; offline smoke passes.
- `pnpm build` + `pnpm test` green; invariants test green.

## Reviewer guidance

- Confirm the static path (`gradingClass` cases) is byte-unchanged in behavior; routing is purely
  additive on `kind`.
- Confirm no secret reaches stdout/stderr; `--json` matches the behave convention.
- Confirm examples load+skip offline (CI must stay green with no endpoint).

## Implementation command

```
spec-kitty agent action implement WP04 --agent <name>
```

## Activity Log

- 2026-06-20T13:03:43Z – claude:sonnet:implementer:implementer – shell_pid=817088 – Started implementation via action command
- 2026-06-20T13:14:11Z – claude:sonnet:implementer:implementer – shell_pid=817088 – WP04 implemented: kind:behavioral routing in a2a/index.ts and cli/index.ts; formatA2aBehavioralHuman in cli/output.ts; two runnable example manifests; site/a2a-behavioral.md docs; 38 new tests covering skip/pass/fail/allErrored/--json/static-regression/output-formatting. pnpm build clean; pnpm test 2806/2806 passed; CLI smoke exit 0 offline; invariants 12/12 green.
- 2026-06-20T13:14:34Z – claude:opus:reviewer:reviewer – shell_pid=852982 – Started review via action command
- 2026-06-20T13:18:41Z – claude:opus:reviewer:reviewer – shell_pid=852982 – Moved to planned
- 2026-06-20T13:19:17Z – claude:sonnet:implementer:implementer – shell_pid=865161 – Started implementation via action command
- 2026-06-20T13:25:59Z – claude:sonnet:implementer:implementer – shell_pid=865161 – Fix-cycle-2 complete. Extracted peekManifestKind to src/adapters/a2a/index.ts: single file read, JSON-then-YAML on same buffer, returns kind|null. doA2aRun cognitive complexity dropped from ~16 to 4 (if + catch + 2 ternaries). Added 6 unit tests covering all peekManifestKind branches. pnpm build clean; pnpm test 2818/2821 green (12 new tests vs prior 2806). Invariants 12/12 green.
- 2026-06-20T13:26:17Z – claude:opus:reviewer:reviewer – shell_pid=882609 – Started review via action command
- 2026-06-20T13:29:18Z – claude:opus:reviewer:reviewer – shell_pid=882609 – Cycle-3 approved. All 3 cycle-1 blockers fixed: peekManifestKind extracted to src/adapters/a2a/index.ts (adapter-parse leak gone from CLI), doA2aRun cognitive complexity now ~4 (single if + try/catch + 2 ternaries), single file read on routing path. pnpm build clean; pnpm test 2818 passed/3 skipped; invariants 12/12 (C-004 + NI-003). Exit contract 0/1/2 correct; static/skill/auth/signed paths byte-unchanged (regression test); all-errored discrimination uses real dead endpoint 127.0.0.1:1; examples carry env-var NAMES only; docs cite FRs+A2A spec; no localeCompare/clock/RNG; only 7 owned_files touched; no test weakened.
