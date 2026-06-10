---
work_package_id: WP05
title: Pipeline & Adapter Assembly
dependencies:
- WP02
- WP03
- WP04
requirement_refs:
- FR-012
- FR-024
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T018
- T019
- T020
agent: "claude"
shell_pid: "1097442"
history:
- timestamp: '2026-06-10T20:21:16Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/core/pipeline.ts
execution_mode: code_change
owned_files:
- src/core/pipeline.ts
- src/adapters/rfc1/index.ts
- tests/unit/pipeline.test.ts
tags: []
---

# WP05 — Pipeline & Adapter Assembly

## Objective

Wire the static spine end-to-end: a spec-agnostic `checkSoul` pipeline in core (parse → validate → resolve → §25.1 report) and the `Rfc1Adapter` object that implements the SpecAdapter contract from the WP02–WP04 pieces. After this WP, the architecture constraint C-004 is demonstrable: core compiles standalone; the adapter plugs in from outside.

## Context

- Contracts: `contracts/adapter-interface.md` (the interface), `contracts/conformance-report.schema.json` (output shape).
- The CLI (WP10) and CTS runner (WP06) both consume `checkSoul` — keep its signature stable.
- FR-012 (report emission), FR-024 (mode selectable per run).

## Implementation command

```bash
spec-kitty agent action implement WP05 --agent <name>
```

## Subtasks

### T018 — Static pipeline (`src/core/pipeline.ts`)

**Steps**:
1. Export:
   ```ts
   export interface CheckOptions { profile?: string; state?: string; mode: Mode }
   export interface CheckResult { report: ConformanceReport; effective: EffectiveConfig | null }
   export async function checkSoul(
     adapter: SpecAdapter,
     raw: string,
     path: string,
     opts: CheckOptions,
     loadRef: LoadRef           // (ref, fromPath) => Promise<SoulDocument | Violation[]>
   ): Promise<CheckResult>
   ```
2. Sequence: `adapter.parse` → on violations, short-circuit to report (effective null). Then `adapter.validate` (collect, continue if only warnings; errors short-circuit resolution in strict mode but still report). Then `adapter.resolve` with loadRef. Aggregate all violations; split by severity into report errors/warnings; `ok = errors.length === 0`.
3. Build the report via WP01's `buildReport` with `spec: adapter.specVersion`, `soul_id` from parsed doc (or `""`), echo `mode`/`profile` (default `"default"`)/`state` (resolved active state or null).
4. Also export `makeFsLoadRef(parseFn)` — the default filesystem loadRef factory: resolves relative refs against `dirname(fromPath)`, reads UTF-8, delegates to the adapter's parse. This is core's only fs touchpoint, isolated and injectable for tests.

**Validation**:
- [ ] broken parse → report ok:false, effective null, errors carry §-sections
- [ ] valid soul → ok:true, effective non-null

### T019 — Rfc1Adapter (`src/adapters/rfc1/index.ts`)

**Steps**:
1. Compose and export `rfc1Adapter: SpecAdapter`:
   - `name: "rfc1"`, `specVersion: "1.0.0-rc1"`;
   - `parse` = frontmatter (T005) + soul-yaml (T006) + kind defaulting (§5.3: omitted → `"soul"`);
   - `validate` = schema (T008) + keyspace/typing/profile checks (T009–T011), deduplicated;
   - `resolve` = T013 composition (which internally applies state via T014);
   - `mergeStrategy` = Standard Merge constants (§8.1);
   - `evaluateTriggers` = T016;
   - `thresholds`: placeholder typed export delegating to `./thresholds.js` — **do not create thresholds.ts here**; it is WP09-owned. Import it lazily/type-only so WP05 compiles before WP09 exists: declare the property via a function that throws "thresholds not yet linked" if the module is absent at runtime. Simplest compliant approach: `thresholds` getter that does a dynamic import with a clear error — document it.
2. No CLI concerns here; pure assembly.

**Validation**:
- [ ] `rfc1Adapter` satisfies `SpecAdapter` structurally (tsc enforces)
- [ ] grep gate still holds: nothing under `src/core/` imports `src/adapters/`

### T020 — Pipeline tests (`tests/unit/pipeline.test.ts`)

**Steps**:
- [ ] In-memory end-to-end: minimal valid soul string → checkSoul with rfc1Adapter and a stub loadRef → ok:true; serialize report and validate against `contracts/conformance-report.schema.json` using Ajv (test-only import of the contract file — assert EXACT field set, §25.1).
- [ ] Composition through loadRef stub: root extends "./base.md" served from an in-memory map → effective reflects merge.
- [ ] Mode passthrough: same broken-unknown-key soul → strict ok:false / permissive ok:true-with-warning (FR-024).
- [ ] `state` field in report: soul with states → resolved active state name; without → null.

## Definition of Done

- Tests green; report instances validate against the contract schema byte-for-byte field-wise.
- `src/core/pipeline.ts` imports only from `src/core/` — verified by grep in test (add a small test that reads the file and asserts no `adapters` import string; cheap and durable).
- thresholds indirection documented so WP09 knows the linking point.

## Reviewer guidance

- The C-004 gate lives here: read the imports. If pipeline.ts mentions rfc1 anything, reject.
- Check violation aggregation doesn't lose warnings when errors exist — a report can carry both.

## Risks

- The thresholds forward-reference is the one awkward seam from ownership splitting. The dynamic-import-with-clear-error pattern keeps both WPs independently implementable; WP09's tests will exercise the real linkage.

## Activity Log

- 2026-06-10T22:10:02Z – claude – shell_pid=1097442 – Started implementation via action command
- 2026-06-10T22:18:13Z – claude – shell_pid=1097442 – Ready for review: checkSoul pipeline (core-only imports, makeFsLoadRef isolated fs touchpoint, DetailedSpecAdapter seam) + rfc1Adapter assembly with WP09 thresholds dynamic-linkage seam; 314 tests green incl. §25.1 contract-schema validation and C-004 grep gate
