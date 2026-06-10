---
work_package_id: WP10
title: CLI Assembly
dependencies:
- WP05
- WP06
- WP09
requirement_refs:
- FR-012
- FR-013
- FR-023
- FR-024
planning_base_branch: main
merge_target_branch: main
branch_strategy: 'Planning/base branch: main. Completed changes merge into main. Execution worktree allocated per computed lane from lanes.json.'
subtasks:
- T037
- T038
- T039
- T040
- T041
history:
- timestamp: '2026-06-10T20:21:16Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/cli/
execution_mode: code_change
owned_files:
- src/cli/**
- tests/unit/cli.test.ts
tags: []
---

# WP10 — CLI Assembly

## Objective

The `muster` binary, implementing `contracts/cli.md` exactly: `check`, `resolve`, `cts run`, `behave run`, global `--mode`/`--json`, uniform exit codes (0 conforming / 1 violations / 2 execution error). The CLI is thin — argument parsing, adapter injection, output formatting; all logic lives in core/adapters.

## Context

- Contract: `contracts/cli.md` is the specification — when this prompt and that file disagree, the contract wins.
- Everything is built: pipeline (WP05), CTS runner (WP06), behavioral runner (WP09). The CLI composes `rfc1Adapter` into them — this file is the only place core and adapter meet (C-004).
- FR-012/013 surface (report + canonical output), FR-023 (behavioral report emission), FR-024 (mode selection).

## Implementation command

```bash
spec-kitty agent action implement WP10 --agent <name>
```

## Subtasks

### T037 — Program + `muster check` (`src/cli/index.ts`)

**Steps**:
1. Commander program `muster`, version from package.json. Global options: `--mode <strict|permissive>` (default strict), `--json`.
2. `check <soul> [--profile <p>] [--state <s>]`: read file → `checkSoul(rfc1Adapter, ...)` with the fs loadRef → `--json`: print the §25.1 report (2-space JSON) to stdout; human mode: `OK`/`FAIL` headline, then one line per error/warning: `  ERROR <path>: <message> [<section>]`.
3. Exit codes: report.ok → 0; !ok → 1; unreadable file / unexpected throw → message to stderr, exit 2.
4. Logs/diagnostics to stderr always; stdout carries ONLY the requested artifact (json/report/config) — pipeline-friendly.

### T038 — `muster resolve` (`src/cli/index.ts` or `src/cli/output.ts`)

**Steps**:
1. `resolve <soul> [--profile] [--state] --output-format <canonical-json|json|yaml>` (default canonical-json — the F.2-normative form; its existence is REQUIRED of CTS-1 runners).
2. canonical-json: `canonicalJson(effective)` raw, no trailing newline. json: `JSON.stringify(effective, null, 2)`. yaml: `yaml.stringify` (convenience, non-normative per F.2 — note in help text).
3. Resolution errors → report to stderr (json if --json), exit 1.

### T039 — `muster cts run` (`src/cli/index.ts`)

**Steps**:
1. `cts run <manifest> [--filter <glob>]` — glob matched against case ids (simple `*` wildcard, no dep — convert to RegExp).
2. Human output: `PASS <id>` / `FAIL <id>` lines, failures followed by indented mismatches; summary line `N passed, M failed of T`. `--json`: `CtsCaseResult[]`.
3. Exit: all passed → 0; any failed → 1; manifest unreadable/invalid → 2.

### T040 — `muster behave run` (`src/cli/index.ts`)

**Steps**:
1. `behave run <manifest> [--base-url <u>] [--model <m>] [--temperature <t>] [--runs <n>]` — flags override manifest endpoint/defaults (contract precedence).
2. Per case: resolve the soul via pipeline first (a non-conforming soul → exit 2 with its static report — don't grade against a broken persona); construct client; `runCase`.
3. Human output: per-case `PASS/FAIL <id> (k/n runs)` + per-axis measured-vs-limit on failures. `--json`: `CaseVerdict[]` with full transcripts (FR-023).
4. API key: never a flag (charter directive 5) — document `MUSTER_API_KEY`/`OPENAI_API_KEY` in `--help` text.
5. Exit: all cases passed → 0; any failed → 1; manifest/soul/endpoint-fatal → 2.

### T041 — CLI tests (`tests/unit/cli.test.ts`)

Invoke the program in-process (export a `runCli(argv): Promise<number>` from index.ts; the bin entry calls it — testable without subprocess spawn):
- [ ] exit-code matrix: valid soul → 0; broken soul → 1; missing file → 2 (all three commands where applicable)
- [ ] `check --json` output parses and validates against `contracts/conformance-report.schema.json`
- [ ] `resolve --output-format canonical-json` byte-identical across two invocations (SC-004 surface)
- [ ] stdout purity: human diagnostics absent from stdout in --json mode
- [ ] behave run with mocked client wiring (inject via a test seam: accept optional client factory param in runCli options)
- [ ] `--filter 'merge_*'` selects matching ids only

## Definition of Done

- `pnpm build` → `node dist/cli/index.js check <fixture>` works; bin mapping verified via `pnpm exec muster --help`.
- Behavior matches `contracts/cli.md` clause-by-clause (review against the file, not memory).
- No business logic in src/cli/ beyond formatting/wiring (reviewer judgment call — flag anything resembling validation rules).

## Reviewer guidance

- Exit-code discipline is the contract's spine — the test matrix must cover 0/1/2 per command.
- stdout/stderr separation: run `muster check broken.md --json 2>/dev/null` mentally — stdout must still be parseable JSON.
- Confirm `resolve` default format is canonical-json (the normative option), not pretty json.

## Risks

- Commander's default exit behavior (process.exit on parse errors) fights testability — use `exitOverride()` and map to code 2 in runCli.
