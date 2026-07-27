---
work_package_id: WP01
title: Manifest, profile loading, schema conformance
dependencies: []
requirement_refs:
- C-001
- C-002
- C-003
- FR-001
- FR-002
- FR-009
- NFR-001
- NFR-002
planning_base_branch: kitty/mission-spec-kitty-profile-adapter
merge_target_branch: kitty/mission-spec-kitty-profile-adapter
branch_strategy: Planning artifacts for this mission were generated on kitty/mission-spec-kitty-profile-adapter. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into kitty/mission-spec-kitty-profile-adapter unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-spec-kitty-profile-adapter-01KYG7KR
base_commit: a2c8ad239835477c004c4f548b1b3a0e12f4d561
created_at: '2026-07-27T00:41:20.622058+00:00'
subtasks:
- T001
- T002
- T003
- T004
- T005
- T006
phase: Phase 1 - Foundation
history:
- timestamp: '2026-07-26T23:43:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
agent_profile: node-norris
authoritative_surface: src/adapters/spec-kitty-profile/
create_intent:
- src/adapters/spec-kitty-profile/manifest.ts
- src/adapters/spec-kitty-profile/profile.ts
- src/adapters/spec-kitty-profile/schema.ts
- src/adapters/spec-kitty-profile/findings.ts
- tests/skprofile/manifest.test.ts
- tests/skprofile/schema.test.ts
execution_mode: code_change
model: ''
owned_files:
- src/adapters/spec-kitty-profile/manifest.ts
- src/adapters/spec-kitty-profile/profile.ts
- src/adapters/spec-kitty-profile/schema.ts
- src/adapters/spec-kitty-profile/findings.ts
- tests/skprofile/manifest.test.ts
- tests/skprofile/schema.test.ts
role: implementer
tags: []
task_type: implement
tracker_refs: []
---

# Work Package Prompt: WP01 — Manifest, profile loading, schema conformance

## ⚡ Do This First: Load Agent Profile

Use the `/ad-hoc-profile-load` skill to load the agent profile specified in the
frontmatter, and behave according to its guidance before parsing the rest of
this prompt.

- **Profile**: `node-norris`
- **Role**: `implementer`
- **Agent/tool**: `claude`

If no profile is specified, run `spec-kitty agent profile list` and select the
best match for this work package's `task_type` (implement) and
`authoritative_surface` (`src/adapters/spec-kitty-profile/`).

---

## Objective

Build the data layer every other check in this mission depends on: the
manifest type + validation, `*.agent.yaml` profile loading into a normalized
`AgentProfile[]`, the frozen 13-kind finding vocabulary, and FR-002's
Ajv2020 schema-conformance check against the SHA-pinned vendored schema.

This WP touches **no** file under `src/core/` and adds **no** new runtime
dependency (`ajv` and `yaml` are already muster dependencies). The static
path is fully offline, deterministic, and never reads the clock (C-002).

## Context (read first)

- Spec: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/spec.md` — FR-001,
  FR-002, FR-009 (schema-citation half); C-001, C-002, C-003; NFR-001, NFR-002.
- Plan: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/plan.md` — IC-01
  ("Manifest + profile loading + schema conformance"), Project Structure,
  Charter Check.
- Data model: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/data-model.md`
  — `SkProfileManifest`, `SkProfileCase`, `AgentProfile`, `SkProfileFinding`,
  the exit-code contract, and the module→entity ownership table.
- Research: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/research.md`
  — R1 (`cases[]` semantics), R2 (`doctrineRoot`), R4 (Ajv2020 requirement),
  R6 (finding-kind vocabulary draft), R7 (`source.normative` schema URL).
- Contracts:
  `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/contracts/spec-kitty-profile-manifest.schema.json`
  (manifest shape) and
  `.../contracts/spec-kitty-profile-report.schema.json` (the frozen 13-kind
  `finding.kind` enum — copy this enum verbatim, do not paraphrase it).
- House precedent to mirror: `src/adapters/memory-utilization/manifest.ts`
  (case validation, `compareStrings` byte-stable sort pattern) and
  `src/adapters/openclaw-sop/manifest.ts:15-17` (the
  `const Ajv = (AjvModule as any).default ?? AjvModule;` CJS/ESM interop
  idiom — you will use `ajv/dist/2020.js`'s default export the same way, see
  T004).

**Hard rules for the whole WP** (from spec + charter):

1. Touch ONLY the files in `owned_files`. If you believe a shared surface
   (`src/cli/index.ts`) needs a change, that is WP03's job — do not touch it
   here, and do not touch `docs/rubric/` (WP04's job).
2. No file under `src/core/` is read or modified. This adapter has **no**
   behavioral half at all (research.md R8) — no `ChatClient`, no endpoint.
3. Never shell out to `spec-kitty` and never import from it — plain
   YAML/JSON file reads only (C-003).
4. Every `SkProfileFinding` this module (or any later module) ever produces
   must carry a non-empty `source.normative` (FR-009). For schema findings
   that is the GitHub blob URL you build in T004; for every other kind it is
   a rubric §-clause (WP02/WP04's job) — `findings.ts` itself never
   hardcodes citation text, only the shape.
5. `fixtures/skprofile/` does **not exist yet** — it is WP05's deliverable
   (split out of the original WP03 by the post-tasks adversarial-gate review;
   WP05 depends on WP01+WP02, so it will not exist yet either). Your unit
   tests (T005) must construct their own minimal inline/tmp-dir fixtures,
   never a forward reference to a path WP05 hasn't created.

## Subtasks

### T001 — `findings.ts`: the frozen finding vocabulary

**Purpose**: every check module in this mission (this WP's and the two that
follow) emits `SkProfileFinding` values through this one module's helpers, so
the shape and the kind vocabulary are defined exactly once.

**Steps**:

1. Create `src/adapters/spec-kitty-profile/findings.ts`.
2. Define the **frozen** union, copied verbatim from data-model.md /
   `contracts/spec-kitty-profile-report.schema.json`'s `finding.kind` enum —
   do not invent, rename, or reorder any of the 13 values:
   ```ts
   export type SkProfileFindingKind =
     | "schema-conformance-violation"
     | "profile-parse-error"
     | "handoff-unresolved"
     | "handoff-asymmetric"
     | "reference-unresolved"
     | "reference-not-activated"
     | "activation-config-unrecognized-shape"
     | "context-source-missing"
     | "profile-id-illegal"
     | "profile-id-filename-mismatch"
     | "profile-id-collision"
     | "projection-output-missing"
     | "projection-hash-drift";
   ```
   These 13 identifiers are frozen by the contract schema; only their
   `message`/`source.normative` **text** is refined later (WP02's `rubric.ts`,
   after WP04's rubric draft exists — see WP02's own T007). Do not treat this
   list as WP04's to rename.
3. Define `SkProfileFinding` exactly as in data-model.md:
   ```ts
   export interface SkProfileFinding {
     readonly kind: SkProfileFindingKind;
     readonly profileId: string; // "(manifest)" for manifest/schema-level findings
     readonly path: string;
     readonly message: string;
     readonly severity: "error" | "warning";
     readonly source: { readonly normative: string };
   }
   ```
4. Export two constructor helpers (mirroring `openclaw-sop`'s `err()`/`warn()`
   naming convention — check `src/adapters/openclaw-sop/manifest.ts` for the
   precedent shape, do not copy its OpenClaw-specific fields):
   ```ts
   export function err(
     kind: SkProfileFindingKind,
     profileId: string,
     path: string,
     message: string,
     normative: string
   ): SkProfileFinding { /* severity: "error" */ }

   export function warn(/* same signature */): SkProfileFinding { /* severity: "warning" */ }
   ```
5. No default export. This file imports nothing from `src/core/`.

**Files**: `src/adapters/spec-kitty-profile/findings.ts`

**Validation**: `pnpm build` compiles this file with zero type errors; T005's
tests construct at least one finding of each severity via `err()`/`warn()`.

---

### T002 — `manifest.ts`: manifest types + `validateManifest`

**Purpose**: the single input document's type and its fail-fast validation —
a malformed manifest must error loudly (exit 2), never silently under-report.

**Steps**:

1. Create `src/adapters/spec-kitty-profile/manifest.ts`.
2. Define exactly the shape in data-model.md (this is the FR-001 manifest
   type, **extended** per research.md R2 with `doctrineRoot` and per the
   post-spec-gate correction with `schemaSha` — both are required fields,
   not optional):
   ```ts
   export interface SkProfileManifest {
     readonly version: string;
     readonly profilesDir: string;
     readonly schemaPath: string;
     readonly schemaSha: string;
     readonly doctrineRoot: string;
     readonly activationConfigPath?: string;
     readonly projectionManifestPath?: string;
     readonly cases: readonly SkProfileCase[];
   }

   export interface SkProfileCase {
     readonly id: string;
     readonly profileId?: string;
   }
   ```
3. Export `loadSkProfileManifest(path: string): Promise<unknown>` — reads and
   `JSON.parse`s (or `yaml.parse`s, matching whichever extension the fixture
   manifests use — check `contracts/spec-kitty-profile-manifest.schema.json`
   and `quickstart.md`'s worked example, which uses `.yaml`) the raw manifest
   file. Throw a plain `Error` on read/parse failure — the CLI layer (WP03)
   is responsible for mapping that to exit code 2, this module just throws.
4. Export `resolveSkProfileManifestPaths(raw: SkProfileManifest, manifestDir: string): SkProfileManifest`
   — resolves `profilesDir`, `schemaPath`, `doctrineRoot`,
   `activationConfigPath`, `projectionManifestPath` to absolute paths against
   `manifestDir` (mirrors `memory-utilization`'s
   `resolveMemoryUtilizationManifestPaths` pattern in `src/cli/index.ts`).
   `schemaSha` and `cases[].id`/`cases[].profileId` are not paths — leave
   them untouched.
5. Export `validateManifest(manifest: SkProfileManifest, profileIds: readonly string[]): void`
   — throws (never returns a result object) on:
   - `manifest.cases.length === 0` (empty cases array — the manifest schema's
     own `minItems: 1` is a JSON-Schema-level check the CLI can also run, but
     this function is the code-level backstop for callers that construct a
     manifest programmatically, e.g. tests).
   - a duplicate `case.id` across `manifest.cases`.
   - a `case.profileId` that does not appear in `profileIds` (the caller
     passes the loaded profile-id set — this function does not load
     profiles itself, keeping it a pure function over already-known data).
   This mirrors `memory-utilization`'s `validateCase` fail-fast pattern
   (`src/adapters/memory-utilization/manifest.ts`).
6. Use the repo's own `compareStrings` UTF-16 comparator (copy the small
   function — do **not** import it from `src/adapters/memory-utilization/` or
   `src/adapters/tools/drift.ts`, this adapter must not depend on sibling
   adapters) wherever you need a deterministic sort, e.g. sorting
   `profileIds` before duplicate-scanning so error messages are byte-stable
   across `readdir` orderings. Never use `Array.prototype.sort()`'s default
   comparator or `localeCompare` (NFR-001/C-002 byte-stability).

**Files**: `src/adapters/spec-kitty-profile/manifest.ts`

**Validation**: T005's `manifest.test.ts` covers every throw path.

---

### T003 — `profile.ts`: `AgentProfile` parsing + profile-set loader

**Purpose**: turn each `*.agent.yaml` file in `profilesDir` into the narrow
`AgentProfile` shape every downstream check consumes — tolerant of individual
parse failures (a broken profile never disappears from the run).

**Steps**:

1. Create `src/adapters/spec-kitty-profile/profile.ts`.
2. Define `AgentProfile` exactly as in data-model.md:
   ```ts
   export interface AgentProfile {
     readonly filePath: string;
     readonly fileNameStem: string;
     readonly profileId: string;
     readonly roles: readonly string[];
     readonly handoffTo: readonly string[];
     readonly handoffFrom: readonly string[];
     readonly worksWith: readonly string[];
     readonly directiveRefs: readonly string[];
     readonly tacticRefs: readonly string[];
     readonly toolguideRefs: readonly string[];
     readonly styleguideRefs: readonly string[];
     readonly contextSources: {
       readonly directives: readonly string[];
       readonly tactics: readonly string[];
       readonly toolguides: readonly string[];
       readonly styleguides: readonly string[];
     };
     readonly parseError?: string;
   }
   ```
3. Export `loadAgentProfile(filePath: string): AgentProfile` — reads the file
   synchronously or async (match the module's own async style — prefer
   async, `node:fs/promises`), parses with the `yaml` package. On any
   parse/read failure: return an `AgentProfile` with `parseError` set to the
   error message, `fileNameStem` still computed from the path (needed by
   identity checks later), and every list field `[]` — **never throw**. A
   profile that fails to parse is data, not an execution error (data-model.md:
   "errored counts as failed, never silently skipped").
4. Field extraction rules (all read from the raw parsed YAML object,
   defensively — treat every field as possibly absent/wrong-typed):
   - `profileId` ← `profile-id` field, or `""` if absent/not-a-string.
   - `roles` ← normalize: `role` (scalar string) folds into a 1-element
     array; `roles` (array) is used as-is; if both or neither present, prefer
     `roles` when present, else `role`, else `[]`.
   - `handoffTo`/`handoffFrom`/`worksWith` ← `collaboration.handoff-to` /
     `collaboration.handoff-from` / `collaboration.works-with`, each an
     array of role-name strings (default `[]` if absent).
   - `directiveRefs` ← `directive-references[].code`.
   - `tacticRefs` ← `tactic-references[].id`.
   - `toolguideRefs` ← `toolguide-references[].id`.
   - `styleguideRefs` ← `styleguide-references[].id`.
   - `contextSources` ← `context-sources.directives`/`.tactics`/
     `.toolguides`/`.styleguides`, each an array of id strings (default `[]`).
5. Export `loadProfileSet(profilesDir: string): Promise<AgentProfile[]>` —
   lists `*.agent.yaml` files in `profilesDir` (non-recursive — verified
   real layout is flat), loads each via `loadAgentProfile`, and returns the
   array **sorted by `fileNameStem`** using the same `compareStrings`
   comparator as T002, so iteration order (and therefore finding order) is
   byte-stable regardless of the OS's `readdir` ordering (NFR-001).
6. This module performs filesystem reads (unlike `frontmatter.ts`-style pure
   parsers in the `skills` adapter) — that is intentional here, since the
   profile-set loader is inherently a directory-scan operation.

**Files**: `src/adapters/spec-kitty-profile/profile.ts`

**Validation**: T005 covers a valid profile, a profile with `role` (scalar)
vs `roles` (array), a profile with no `collaboration` block at all (all
handoff lists resolve to `[]`, not a crash), and a profile with syntactically
invalid YAML (returns `parseError`, does not throw).

---

### T004 — `schema.ts`: Ajv2020 schema-conformance check

**Purpose**: FR-002 — validate each profile's *raw* YAML object (not the
narrowed `AgentProfile`) against the vendored `agent-profile.schema.yaml`,
and build the `source.normative` citation.

**Steps**:

1. Create `src/adapters/spec-kitty-profile/schema.ts`.
2. **Critical import** (research.md R4 — this is the single easiest mistake
   in this WP): the upstream schema's own header is
   `$schema: https://json-schema.org/draft/2020-12/schema`. Ajv 8.x's
   default export only supports draft-07. You must import the 2020 entry
   point:
   ```ts
   import Ajv2020Module from "ajv/dist/2020.js";
   const Ajv2020 = (Ajv2020Module as any).default ?? Ajv2020Module;
   ```
   This is the same `.default ?? Module` CJS/ESM interop idiom
   `src/adapters/openclaw-sop/manifest.ts:15-17` uses for plain `Ajv` — here
   applied to the `2020` entry point instead, which is an independently
   verified requirement of *this* schema's `$schema` header, not something
   borrowed from `openclaw-sop`'s own (draft-07) usage.
3. Read the schema file at `schemaPath` (already resolved absolute by T002's
   `resolveSkProfileManifestPaths`) as YAML (the file is
   `agent-profile.schema.yaml`, a YAML-serialized JSON Schema — parse with
   the `yaml` package, not `JSON.parse`), then compile it once with
   `new Ajv2020({ allErrors: true, strict: false })` (module-level cache is
   fine as long as it is keyed by `schemaPath`, since a run may only ever use
   one schema — do not over-engineer a multi-schema cache).
4. Export `checkSchemaConformance(rawProfileYaml: unknown, filePath: string, profileId: string, schemaSha: string): SkProfileFinding[]`
   — runs the compiled validator against `rawProfileYaml` (the **raw**
   parsed object, before `profile.ts`'s field narrowing — you will need a
   second, un-narrowed YAML parse of the same file, or have `profile.ts`
   expose the raw object too; prefer having `index.ts`, WP03's module, pass
   both down rather than re-reading the file here — but for this WP's own
   unit tests, parsing the raw YAML directly in the test is fine). Map every
   Ajv error to one `err("schema-conformance-violation", profileId, <ajv
   instancePath, trimmed>, <message>, <source.normative>)` via `findings.ts`'s
   `err()`.
5. Build `source.normative` (research.md R7, FR-002's own worked example) as:
   ```ts
   const SCHEMA_UPSTREAM_PATH = "src/doctrine/schemas/agent-profile.schema.yaml";
   function schemaNormativeSource(schemaSha: string): string {
     return `https://github.com/Priivacy-ai/spec-kitty/blob/${schemaSha}/${SCHEMA_UPSTREAM_PATH}`;
   }
   ```
   This is a **compile-time constant path** combined with the
   **manifest-supplied** `schemaSha` — never a literal `@<SHA>` path segment,
   and never read from the schema file's own `$comment` (spec.md's
   Dependencies & Assumptions explicitly rejects that alternative — it would
   make muster trust SK's self-description instead of recording what muster
   actually verified against).
6. A profile whose YAML failed to parse (`AgentProfile.parseError` set) is
   **not** schema-checked (there is no raw object to validate) — it instead
   surfaces via a separate `profile-parse-error` finding, which T003's
   `loadAgentProfile`/T015 (WP03's `index.ts`) is responsible for emitting,
   not this module. `schema.ts` only ever emits
   `schema-conformance-violation`.

**Files**: `src/adapters/spec-kitty-profile/schema.ts`

**Validation**: T005 includes a regression test that would fail loudly if
`new Ajv()` (plain, draft-07) were used instead of `Ajv2020` — e.g. a schema
feature that only draft-2020-12 resolves correctly (check the real
`agent-profile.schema.yaml`'s use of `$defs`/`$ref` for a concrete example to
assert against — `$defs` is the 2020-12 keyword; draft-07 uses `definitions`
and will silently fail to resolve `$defs`-based `$ref`s).

---

### T005 — Unit tests: `manifest.test.ts` + `schema.test.ts`

**Purpose**: exercise every edge case in T002's `validateManifest` and T004's
schema check, using **inline or `tmpdir`-based fixtures only** —
`fixtures/skprofile/` does not exist until WP05.

**Steps**:

1. Create `tests/skprofile/manifest.test.ts`. Cover:
   - Path resolution: `profilesDir`/`schemaPath`/`doctrineRoot` resolve
     relative to a manifest file's directory, not `process.cwd()`.
   - Empty `cases: []` throws.
   - Duplicate `case.id` throws.
   - `case.profileId` naming a profile-id not present in the supplied
     `profileIds` list throws.
   - A well-formed manifest with one case and no `activationConfigPath`/
     `projectionManifestPath` validates cleanly (no throw).
2. Create `tests/skprofile/schema.test.ts`. Construct a small inline
   draft-2020-12 JSON Schema (write it to a `tmpdir` via
   `node:fs/promises.mkdtemp` + `writeFile`, YAML-serialized) with at least
   one `$defs`/`$ref` pair, and:
   - A profile object that validates cleanly → zero findings.
   - A profile object missing a required field → one
     `schema-conformance-violation` finding whose `source.normative` contains
     the literal `schemaSha` you passed in and the constant upstream path.
   - The R4 regression test described in T004's Validation note.
3. Use Vitest (`import { describe, it, expect } from "vitest"`). Clean up any
   `tmpdir` directories in an `afterEach`/`afterAll`.

**Files**: `tests/skprofile/manifest.test.ts`, `tests/skprofile/schema.test.ts`

**Validation**: `pnpm test` green for both new files; no existing test file
modified; test count increases by exactly the number of new tests.

---

### T006 — WP01 verification gate (Definition of Done)

**Steps** (run in order):

```bash
pnpm build              # strict tsc — must pass with zero errors
pnpm test               # full suite — zero failures, zero new skips
git diff --stat         # ONLY the six owned files changed / created
git diff --stat src/core/   # must show no changes
```

Confirm the frozen 13-kind union is copied verbatim (no typos, no reordering
that would change JSON key order in a way that affects byte-stability):

```bash
grep -c '".*-.*"' src/adapters/spec-kitty-profile/findings.ts  # sanity spot-check only
```

## Definition of Done

- [ ] `findings.ts` defines the frozen 13-kind `SkProfileFindingKind` union
      verbatim (matches `contracts/spec-kitty-profile-report.schema.json`'s
      `finding.kind` enum exactly) plus `SkProfileFinding`, `err()`, `warn()`.
- [ ] `manifest.ts` defines `SkProfileManifest`/`SkProfileCase` with
      `schemaSha` and `doctrineRoot` as **required** fields, plus
      `loadSkProfileManifest`, `resolveSkProfileManifestPaths`,
      `validateManifest` (throws on all three documented edge cases).
- [ ] `profile.ts` defines `AgentProfile` and `loadProfileSet`; a profile
      that fails to parse returns `parseError` set, never throws.
- [ ] `schema.ts` uses `ajv/dist/2020.js` (not plain `Ajv`), builds
      `source.normative` as the GitHub blob URL from `schemaPath`'s constant
      upstream path + the manifest's `schemaSha`.
- [ ] `pnpm build` (strict tsc) passes with zero new errors.
- [ ] `pnpm test` green; no test file outside `owned_files` modified; no new
      skips.
- [ ] No file under `src/core/` modified (verified by
      `git diff --stat src/core/`).
- [ ] No new runtime dependency added (`ajv`, `yaml` are pre-existing).

## Reviewer guidance

- **Reject if** any `src/core/` file is in the diff, or if a new dependency
  appears in `package.json`.
- **Reject if** `schema.ts` imports plain `Ajv` instead of `ajv/dist/2020.js`
  — verify by reading the import line directly, not just by tests passing
  (a permissively-configured Ajv instance can pass simple fixtures under the
  wrong draft and only fail on `$defs`/`$ref`-heavy real schemas).
- **Reject if** `findings.ts`'s `SkProfileFindingKind` union does not match
  `contracts/spec-kitty-profile-report.schema.json`'s enum exactly (diff the
  two lists character-for-character) — this union must not drift even
  slightly, since WP02/WP03 and the eventual rubric depend on the exact
  identifiers.
- **Reject if** `validateManifest` returns a result object instead of
  throwing, or if any test relies on `fixtures/skprofile/` (a path this WP
  must not reference).
- Confirm `resolveSkProfileManifestPaths` resolves relative to the manifest
  file's directory, not `process.cwd()` — a quick way to check: run the test
  suite from a different `cwd()` (`cd /tmp && pnpm --dir <repo> test` is
  overkill; instead confirm the test itself asserts against a manifest path
  outside the repo root, e.g. a `tmpdir`).
- Confirm `loadProfileSet`'s output ordering is deterministic
  (`compareStrings`-sorted by `fileNameStem`), not raw `readdir` order.

## Activity Log

> **CRITICAL**: entries MUST be in chronological order (oldest first, newest
> last). Append new entries at the END.

- 2026-07-26T23:43:00Z – system – Prompt generated via /spec-kitty.tasks.
- 2026-07-27T00:00:00Z – planner-priti – Post-tasks adversarial-gate split:
  fixture ownership cross-references updated from WP03 to the new WP05
  (fixture/example authoring split out of WP03); no other change to this
  WP's own scope, subtasks, or requirement mapping.
