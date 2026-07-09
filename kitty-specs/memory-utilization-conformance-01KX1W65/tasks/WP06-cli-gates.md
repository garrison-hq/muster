---
work_package_id: WP06
title: CLI, reporting, pilot protocol, gates
dependencies:
- WP03
- WP04
- WP05
requirement_refs:
- FR-008
- FR-010
- FR-012
- FR-015
tracker_refs: []
planning_base_branch: chore/spec-kitty-3.2.5-upgrade
merge_target_branch: chore/spec-kitty-3.2.5-upgrade
branch_strategy: Planning artifacts for this mission were generated on chore/spec-kitty-3.2.5-upgrade. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into chore/spec-kitty-3.2.5-upgrade unless the human explicitly redirects the landing branch.
subtasks:
- T020
- T021
- T022
phase: Phase 3 - Fixtures, CLI, gates
assignee: ''
agent: ''
shell_pid: '2217087'
history:
- timestamp: '2026-07-09T00:00:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: src/cli/
create_intent:
- docs/guides/memory-utilization-pilot-protocol.md
execution_mode: code_change
owned_files:
- src/cli/index.ts
- docs/guides/memory-utilization-pilot-protocol.md
tags: []
---

# Work Package Prompt: WP06 — CLI, reporting, pilot protocol, gates

**Covers**: FR-008 (report), FR-010 (wiring), FR-012 (report), FR-015.
**Owned files**: `src/cli/index.ts` (additive subcommand only), `kitty-specs/.../quickstart.md`, `docs/guides/memory-utilization-pilot-protocol.md`, CI config additions, `tests/**` end-to-end for the CLI.

## Goal

Expose the capability as a muster CLI subcommand with a machine-readable report and exit codes, document the pilot protocol, and turn every gate green.

## Subtasks

- **T020 — CLI**: add a `memory-utilization run <manifest>` Commander subcommand in `src/cli/index.ts` (mirroring the `memory`/`crosslayer` subcommands), emitting the JSON `Report` (per-case `LiftMeasurement` + verdict) and exit codes `0` conforming / `1` any failed-or-no-lift-or-contaminated / `2` execution error. Report includes the **MDE** and renders `no-lift` as a bounded/powered null (FR-008).
- **T021 — pilot protocol + quickstart**: `docs/guides/memory-utilization-pilot-protocol.md` — how to estimate the within-probe score correlation / `ω²` for concrete N-sizing given no seed (a documented pilot: run M probes × K samples per arm, estimate correlation, size N via WP02's power module). Plus `quickstart.md` for the mission.
- **T022 — gates**: a reduced **CI smoke profile** (scripted mock client, deterministic); `pnpm build` (tsc strict) + full Vitest green incl. all new suites; SonarCloud quality gate; confirm offline paths are **byte-stable**.

## Key references
- `research.md` §4A (MDE, pilot); `spec.md` FR-008, FR-010, FR-012, FR-015, NFR-002/004/005.
- Existing: `src/cli/index.ts` subcommand pattern; `benchmark/` for cross-config runs.

## Verification
`spec-kitty` + `pnpm build` + `pnpm test` all green; CLI runs the WP05 example end-to-end producing a valid verdict; CI smoke profile deterministic; SonarCloud passes.
