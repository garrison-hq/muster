---
work_package_id: WP01
title: Scaffold & Deterministic Primitives
dependencies: []
requirement_refs:
- FR-006
- FR-013
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-cts1-conformance-harness-01KTS86B
base_commit: a9736800c4b6e1196e32ab339dfb389626a70bc1
created_at: '2026-06-10T21:06:05.520039+00:00'
subtasks:
- T001
- T002
- T003
- T004
shell_pid: "870022"
agent: "claude"
history:
- timestamp: '2026-06-10T20:21:16Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/core/
execution_mode: code_change
owned_files:
- package.json
- pnpm-lock.yaml
- tsconfig.json
- vitest.config.ts
- .gitignore
- src/core/adapter.ts
- src/core/report.ts
- src/core/canonical-json.ts
- src/core/merge.ts
- tests/unit/canonical-json.test.ts
- tests/unit/merge.test.ts
tags: []
---

# WP01 — Scaffold & Deterministic Primitives

## Objective

Create the buildable `@garrison-hq/muster` package (strict TypeScript, Node 22, pnpm, Vitest) and implement the two pure cores every later WP depends on: the RFC 8785 canonical-JSON serializer and the parameterized Standard Merge engine. Also define the core type vocabulary (SpecAdapter contract, Violation, ConformanceReport).

## Context

- Spec: `kitty-specs/cts1-conformance-harness-01KTS86B/spec.md` (FR-006 merge semantics, FR-013 canonical JSON, NFR-001 determinism)
- Contracts: `contracts/adapter-interface.md` (copy the interface verbatim), `contracts/conformance-report.schema.json`
- Research: R2 (hand-rolled JCS rationale), data-model.md (type shapes)
- Normative source: `.kittify/reference/soul-spec.md` — §8 (merge), Appendix F.2 (canonical JSON)
- Charter: core (`src/core/`) MUST NOT import from `src/adapters/` — there is no adapter yet, keep it that way.

## Implementation command

```bash
spec-kitty agent action implement WP01 --agent <name>
```

## Subtasks

### T001 — Project scaffold

**Steps**:
1. `package.json`: name `@garrison-hq/muster`, `"type": "module"`, `bin: {"muster": "dist/cli/index.js"}`, scripts: `build` (tsc), `test` (vitest run), `dev` (tsx). Engines: node >=22.
2. Dependencies: `yaml`, `ajv`, `commander`. Dev: `typescript`, `vitest`, `tsx`, `@types/node`. Nothing else (charter: minimal deps).
3. `tsconfig.json`: `strict: true`, `module: NodeNext`, `moduleResolution: NodeNext`, `target: ES2022`, `outDir: dist`, `rootDir: src` — tests excluded from build, type-checked by vitest.
4. `vitest.config.ts`: include `tests/**/*.test.ts`.
5. Append to `.gitignore`: `node_modules/`, `dist/`.

**Validation**: `pnpm install && pnpm build` succeeds on an empty `src/` placeholder; `pnpm test` runs (0 tests OK at this step).

### T002 — Core types (`src/core/adapter.ts`, `src/core/report.ts`)

**Steps**:
1. `adapter.ts`: transcribe the `SpecAdapter` interface from `contracts/adapter-interface.md` exactly, plus `Mode = "strict" | "permissive"`, `MergeStrategy`, `ThresholdMapping`, `SoulDocument`, `EffectiveConfig` (per data-model.md shapes).
2. `report.ts`: `Violation { path; message; severity; section? }`, `ConformanceReport` (§25.1 field set exactly — `spec, soul_id, mode, profile, state, ok, errors, warnings`), plus builders: `buildReport(...)` computes `ok = errors.length === 0` and serializes violations as `{path, message}` with `section` included only when set.

**Validation**: types compile under strict; a sample report object validates against `contracts/conformance-report.schema.json` (assert in T003/T004 test files or a tiny type-level test).

### T003 — RFC 8785 canonical JSON (`src/core/canonical-json.ts`)

**Steps**:
1. Export `canonicalJson(value: unknown): string`:
   - objects: keys sorted by UTF-16 code units (`Array.prototype.sort()` default), recurse;
   - arrays: element order preserved, recurse;
   - primitives: `JSON.stringify` (ECMA-262 number formatting and string escaping match RFC 8785 — R2);
   - reject `undefined`, functions, non-finite numbers with a thrown `TypeError` (canonical JSON cannot represent them).
2. No trailing newline; output is the exact comparison form for CTS (F.2).

**Tests** (`tests/unit/canonical-json.test.ts`, name tests with "RFC 8785"):
- [ ] Appendix B-style vectors: key reordering `{"b":1,"a":2}` → `{"a":2,"b":1}`; nested objects; unicode keys sorted by code units (e.g. `"é"` vs `"z"`).
- [ ] Number forms: `1.0` → `1`, `1e+30` → `1e+30`, `-0` → `0` (per ECMA-262 via JSON.stringify behavior).
- [ ] Determinism: serializing the same structure built in different key-insertion orders yields identical bytes (NFR-001).

### T004 — Standard Merge engine (`src/core/merge.ts`)

**Steps**:
1. Export `merge(base: unknown, overlay: unknown, strategy: MergeStrategy): unknown` implementing §8.1 as data-driven behavior:
   - scalars (string/number/bool/null): overlay replaces;
   - both maps: deep-merge by key recursively;
   - lists: overlay replaces entirely — never append/union (§8.2);
   - **type mismatch** (map↔scalar, list↔map, etc.): overlay replaces, NOT an error (§8.1);
   - `null` overlay value: key remains with value `null` — `null` is a value, not deletion (§8.3).
2. Pure function: never mutates inputs; returns new structures.

**Tests** (`tests/unit/merge.test.ts`, cite sections in test names):
- [ ] "§8.1 scalars replace", "§8.1 maps deep-merge", "§8.1 lists replace not append"
- [ ] "§8.1 type mismatch: overlay replaces (voice: map → null)" — reproduce the spec's exact example
- [ ] "§8.3 null is a value: key present with null after merge"
- [ ] input immutability check

## Definition of Done

- `pnpm install && pnpm build && pnpm test` all green.
- `src/core/` has zero imports from `src/adapters/` (doesn't exist yet) — grep gate.
- Every test name carries its RFC-1 citation (charter directive 3).
- No dependencies beyond the five declared in T001.

## Reviewer guidance

- Diff `adapter.ts` against `contracts/adapter-interface.md` — drift here corrupts every later WP.
- Check merge type-mismatch handling: the tempting bug is recursing into mismatched types; spec says replace.
- Check canonical-json rejects non-finite numbers rather than emitting `null`.

## Risks

- JCS subtleties live in number formatting; we deliberately ride on `JSON.stringify` (R2). Do not introduce a custom number formatter.

## Activity Log

- 2026-06-10T21:06:06Z – claude – shell_pid=870022 – Assigned agent via action command
