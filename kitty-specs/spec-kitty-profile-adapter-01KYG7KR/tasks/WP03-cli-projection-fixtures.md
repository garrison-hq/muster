---
work_package_id: WP03
title: Projection drift, CLI wiring, fixtures/examples, real-CLI verification
dependencies:
- WP01
- WP02
requirement_refs:
- C-001
- C-002
- C-003
- C-004
- FR-007
- FR-008
- FR-009
- NFR-001
- NFR-002
planning_base_branch: kitty/mission-spec-kitty-profile-adapter
merge_target_branch: kitty/mission-spec-kitty-profile-adapter
branch_strategy: Planning artifacts for this mission were generated on kitty/mission-spec-kitty-profile-adapter. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into kitty/mission-spec-kitty-profile-adapter unless the human explicitly redirects the landing branch.
subtasks:
- T014
- T015
- T016
- T017
- T018
- T019
- T020
phase: Phase 3 - Projection, CLI, fixtures
history:
- timestamp: '2026-07-26T23:43:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
agent_profile: node-norris
authoritative_surface: src/adapters/spec-kitty-profile/
create_intent:
- src/adapters/spec-kitty-profile/projection.ts
- src/adapters/spec-kitty-profile/index.ts
- fixtures/skprofile/clean/architect.agent.yaml
- fixtures/skprofile/clean/planner.agent.yaml
- fixtures/skprofile/broken/dangling-handoff.agent.yaml
- fixtures/skprofile/broken/unresolvable-reference.agent.yaml
- fixtures/skprofile/broken/id-filename-mismatch.agent.yaml
- fixtures/skprofile/broken/schema-violation.agent.yaml
- fixtures/skprofile/broken/context-source-missing.agent.yaml
- fixtures/skprofile/doctrine/directives/001-architectural-integrity-standard.directive.yaml
- fixtures/skprofile/doctrine/tactics/development-bdd.tactic.yaml
- fixtures/skprofile/doctrine/toolguides/contextive.toolguide.yaml
- fixtures/skprofile/doctrine/styleguides/prose.styleguide.yaml
- fixtures/skprofile/agent-profile.schema.yaml
- fixtures/skprofile/manifest.yaml
- fixtures/skprofile/broken-manifest.yaml
- fixtures/skprofile/activation-config.yaml
- examples/skprofile/manifest.yaml
- tests/skprofile/projection.test.ts
- tests/skprofile/fixtures.test.ts
- tests/skprofile/cli.test.ts
execution_mode: code_change
model: ''
owned_files:
- src/adapters/spec-kitty-profile/projection.ts
- src/adapters/spec-kitty-profile/index.ts
- src/cli/index.ts
- src/cli/output.ts
- fixtures/skprofile/**
- examples/skprofile/**
- tests/skprofile/projection.test.ts
- tests/skprofile/fixtures.test.ts
- tests/skprofile/cli.test.ts
role: implementer
tags: []
task_type: implement
tracker_refs: []
---

# Work Package Prompt: WP03 — Projection drift, CLI, fixtures/examples

## ⚡ Do This First: Load Agent Profile

Use the `/ad-hoc-profile-load` skill to load the agent profile specified in
the frontmatter, and behave according to its guidance before parsing the rest
of this prompt.

- **Profile**: `node-norris`
- **Role**: `implementer`
- **Agent/tool**: `claude`

If no profile is specified, run `spec-kitty agent profile list` and select
the best match for this work package's `task_type` (implement) and
`authoritative_surface` (`src/adapters/spec-kitty-profile/`).

---

## Objective

Close out the code side of this mission: FR-007's projection-drift
re-verification, the `SpecKittyProfileAdapter` factory + `run()` that
orchestrates all six check modules, the `muster skprofile run` CLI command
with its 0/1/2 exit-code contract, the entire fixture/example surface
(including the rigged discrimination-control set), and — **non-optional** —
the real-CLI verification against the actual 18 shipped Spec Kitty profiles.

This WP depends on **WP01 and WP02** (every module they ship must exist and
compile). Do not start until both are available on your base branch — this
WP's `index.ts` imports from all four of WP02's lint modules plus WP01's
`manifest.ts`/`profile.ts`/`schema.ts`/`findings.ts`.

**`src/cli/index.ts` and `src/cli/output.ts` are shared-surface files.** This
WP owns them for this mission's purposes — make **additive** changes only
(new subcommand, new formatter function) and do not touch any unrelated
existing code path. (Spec.md's own Dependencies & Assumptions note flags
that `src/cli/index.ts` is also touched by mission M5 in the same repo — this
is an expected, normal cross-mission file collision resolved by the ordinary
mission-merge flow, not something to work around here.)

## Context (read first)

- Spec: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/spec.md` — FR-007,
  FR-008, FR-009, C-004; Scenarios 8, 9, 10, 11, 14; SC-001..006.
- Plan: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/plan.md` — IC-03,
  Project Structure (the full file tree this WP realizes).
- Data model: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/data-model.md`
  — `ProjectionEntry`, `AdapterResult`/`SkProfileReport`, the **exit-code
  contract table**, and the Flow section.
- Research: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/research.md` —
  **R5** (hash algorithm + matching key — read this before writing
  `projection.ts`), R8 (`RunOptions` is reserved-but-empty, no `ChatClient`),
  R9 (CLI `--mode`/`--json` inheritance), R6 (the discrimination-control
  mapping table you must satisfy with fixtures).
- Quickstart: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/quickstart.md`
  — this is close to a literal script for T017-T020; follow its exact
  commands and expected outputs.
- House precedent (read these actual files, not just the excerpts below):
  - `src/adapters/memory-utilization/index.ts` — factory + `run(manifest,
    options)` → `AdapterResult` shape (D1's template).
  - `src/cli/index.ts:1717-1755` — the exact `memory-utilization run`
    subcommand wiring you are mirroring for `skprofile run` (the
    `.command()`/`.description()`/`.argument()`/`.action()` chain).
  - `src/cli/index.ts:692-722` (`buildMemoryUtilizationReport`) and
    `:782-809` (`doMemoryUtilizationRun`) — the exact
    `AdapterResult` → `Report` (adds `rubricDocPath`, `exitCode`) → CLI
    `action()` pattern you are mirroring for `SkProfileReport`.
  - `src/cli/index.ts:140` (`class ExecutionError extends Error {}`) — the
    exit-code-2 exception type; the CLI's top-level handler already maps any
    thrown `ExecutionError` (or any other throw) from a `run` action to exit
    code 2 — you do not need to call `process.exit()` yourself inside the
    action, just `throw` or `return` the report's own `exitCode`.

**Hard rules for the whole WP** (from spec + charter):

1. `RunOptions` stays reserved-but-empty (`interface RunOptions {}`, research
   R8) — do not add a `client`/`endpoint` field. This capability has no
   behavioral half at all.
2. The real projection manifest at
   `/home/jeroennouws/.../.kittify/agent_profiles_manifest.json`-shaped files
   (or this repo's own `.kittify/agent_profiles_manifest.json`) bakes in
   absolute, machine-specific paths (research.md R5) — your byte-stability
   test (T019) must run against the **muster-local fixture manifest only**,
   never a real one, or it will be flaky by construction.
3. The real-CLI verification (T020) is a **non-optional Definition-of-Done
   gate**, not an optional nice-to-have — the mission cannot be called done
   on unit tests alone (binding operator directive).
4. Never read the system clock anywhere in the static path; never make a
   network call.

## Subtasks

### T014 — `projection.ts`: projection-drift re-verification

**Purpose**: FR-007 — independently re-verify that SK's own projector output
still matches the source YAML it was generated from, without trusting SK's
`doctor` command's own verdict.

**Steps**:

1. Create `src/adapters/spec-kitty-profile/projection.ts`.
2. Define `ProjectionEntry` exactly as in data-model.md (9 fields,
   `schema_version: 1`):
   ```ts
   export interface ProjectionEntry {
     readonly profile_urn: string;
     readonly source_layer: string;
     readonly tool_key: string;
     readonly output_path: string;
     readonly format: string;
     readonly file_hash: string;
     readonly source_path: string; // provenance only — never used for matching
     readonly source_hash: string;
     readonly projection_version: number;
   }
   ```
3. Export `loadProjectionManifest(path: string): Promise<{ entries: readonly ProjectionEntry[] }>`
   — reads and `JSON.parse`s the file (this one is genuinely JSON, not
   YAML — verified against the real `.kittify/agent_profiles_manifest.json`
   shape). Throw a plain `Error` on read/parse failure (the CLI layer maps
   this to exit 2, per Scenario 14).
4. Export `checkProjectionDrift(profiles: readonly AgentProfile[],
   entries: readonly ProjectionEntry[] | undefined): SkProfileFinding[]` —
   returns `[]` immediately if `entries === undefined` (i.e.
   `projectionManifestPath` was omitted — the whole class is skipped,
   per spec.md).
5. **Matching key** (research.md R5 — critical, do not use `source_path`):
   match by `entry.profile_urn === "agent_profile:" + profile.profileId`.
   `source_path` is provenance-only, recorded on the machine that *ran the
   projector*, and will essentially never equal this adapter's `profilesDir`
   — using it for matching would silently break on every real installation.
6. For each local `AgentProfile` (skip profiles with `parseError` set — they
   have no valid content to hash meaningfully, and are already surfaced via
   `profile-parse-error`):
   - Recompute `source_hash` = `sha256(utf8 bytes of the profile's own
     *.agent.yaml file).hexdigest()` using
     `crypto.createHash("sha256").update(content, "utf8").digest("hex")` —
     **raw bytes, no normalization, no line-ending handling** (research.md
     R5, verified against SK's own `hash_content`).
   - If no matching `profile_urn` entry exists, **or** the matching entry's
     `output_path` does not exist on disk → `err("projection-output-missing",
     profileId, "projectionManifestPath", <message>,
     RUBRIC_CITATION["projection-output-missing"])` (import
     `RUBRIC_CITATION` from WP02's `rubric.ts` — this is a cross-WP,
     read-only import of an already-merged module, not a new file you own).
   - If a matching entry exists and `output_path` exists on disk: recompute
     `file_hash` = sha256 of `output_path`'s raw bytes. If **either** the
     recomputed `source_hash` or `file_hash` differs from the entry's
     recorded value → `warn("projection-hash-drift", profileId,
     "projectionManifestPath", <message naming which hash(es) differed>,
     RUBRIC_CITATION["projection-hash-drift"])`.
   - Otherwise: clean, no finding.
7. This mirrors SK doctor's own severity precedent: missing = error, drift =
   warning (spec.md, data-model.md).

**Files**: `src/adapters/spec-kitty-profile/projection.ts`

**Validation**: covered by T019's `projection.test.ts`.

---

### T015 — `index.ts`: `SpecKittyProfileAdapter` factory + orchestration

**Purpose**: tie every check module (WP01's schema check, WP02's four lints,
this WP's projection check) into one whole-graph run, per data-model.md's
Flow section.

**Steps**:

1. Create `src/adapters/spec-kitty-profile/index.ts`.
2. Define `RunOptions` (reserved-but-empty, research.md R8):
   ```ts
   export interface RunOptions {}
   ```
3. Define `AdapterResult`/`SkProfileCaseResult` exactly as in data-model.md.
4. Export `createSpecKittyProfileAdapter()` returning an object with a
   `run(manifest: SkProfileManifest, options?: RunOptions): Promise<AdapterResult>`
   method (factory + `run()` shape, mirroring
   `createMemoryUtilizationAdapter()` — read that function's shape in
   `src/adapters/memory-utilization/index.ts` for the exact pattern, but do
   **not** import anything from it; this adapter has no shared code with
   `memory-utilization` beyond the shape convention).
5. `run()`'s orchestration, in order:
   - Load the profile set via WP01's `loadProfileSet(manifest.profilesDir)`.
   - `validateManifest(manifest, profiles.map(p => p.profileId))` (WP01) —
     let it throw; the CLI layer wraps this as exit 2.
   - For each profile with `parseError` set, emit one
     `err("profile-parse-error", profileId || "(unknown)", "(document)",
     parseError, <a fixed, non-rubric citation — this kind is structural,
     not one of WP04's rubric §-clauses; use a literal string like
     "structural: malformed *.agent.yaml">)`.
   - Run WP01's schema check per profile (skip profiles with `parseError`
     set, per WP01's T004 note) — you will need the **raw** parsed YAML
     object per profile for this, not just the narrowed `AgentProfile`;
     either have `profile.ts` additionally expose the raw object (a small,
     justified touch — coordinate via a one-line rationale in this WP's
     Activity Log if you find you need it) or re-parse the file once more
     here. Prefer not to re-read from disk twice per profile if you can
     avoid it — a small return-shape extension on WP01's already-merged
     `loadAgentProfile` (e.g. an additional non-breaking field) is
     preferable to a duplicate read, but only touch `profile.ts` if this WP
     genuinely needs to; if you do, it counts as a small, justified
     out-of-map edit under the tasks-generation guidance ("a small,
     well-justified out-of-map edit is acceptable when recorded with a
     one-line rationale").
   - Run WP02's `checkHandoffs(profiles)`, `checkReferences(profiles,
     manifest.doctrineRoot, manifest.activationConfigPath)`,
     `checkContextSources(profiles, manifest.doctrineRoot)`,
     `checkIdentity(profiles)`.
   - If `manifest.projectionManifestPath` is set, load it via T014's
     `loadProjectionManifest` and run `checkProjectionDrift`; otherwise skip
     (empty findings contribution).
   - Concatenate every module's findings into one whole-graph `findings[]`
     (order: schema, then profile-parse-error, then handoff, references,
     context-sources, identity, then projection — a fixed, documented order
     so `--json` output is byte-stable independent of which check happened
     to run first in code).
   - `ok := findings.every(f => f.severity !== "error")`.
   - Build `cases: SkProfileCaseResult[]` — research.md R1's **filter-only**
     semantics: `case.findings = findings.filter(f => case.profileId ===
     undefined || f.profileId === case.profileId)`. This is a report-
     organization view only; `ok` is computed once above, independent of
     case coverage.
   - `summary`: a short human string, e.g. `` `spec-kitty-profile adapter:
     ${errorCount} error finding(s) across ${profiles.length} profile(s)` ``
     (match `quickstart.md`'s worked example shape).
5. This module imports `RUBRIC_CITATION`/`RUBRIC_DOC_PATH` from WP02's
   `rubric.ts` for the `profile-parse-error` fallback citation decision
   above — actually, per the note in this file, `profile-parse-error` is
   **not** in WP02's `RUBRIC_CITATION` map (that map is typed to exclude
   only `schema-conformance-violation`, so it currently *requires* a
   `profile-parse-error` entry too — coordinate: either WP02 already
   included `profile-parse-error` in its map with a structural citation
   string, in which case use it, or extend the type's `Exclude<...>` if you
   find `profile-parse-error` genuinely does not belong in a rubric-clause
   map. Re-read WP02's actual shipped `rubric.ts` before writing this bullet
   of code — do not guess its exact exported shape from this prompt alone.

**Files**: `src/adapters/spec-kitty-profile/index.ts`

**Validation**: covered by T019's suite plus the fixture-driven
`fixtures.test.ts`.

---

### T016 — CLI wiring: `skprofile run <manifest>`

**Purpose**: FR-008 — hand-wire the subcommand exactly like
`memory-utilization run` and `skills run` (D1, research.md R9).

**Steps**:

1. In `src/cli/index.ts`, add (near the other adapter command groups, using
   `:1717-1755`'s `memory-utilization run` wiring as the literal template):
   ```ts
   const skProfile = program
     .command("skprofile")
     .description(
       "Spec-Kitty agent-profile static conformance adapter: schema " +
       "conformance, handoff-graph resolution, doctrine-reference " +
       "resolution, context-sources integrity, profile-id legality, and " +
       "projection-drift re-verification (FR-001..FR-010)."
     );
   skProfile
     .command("run")
     .description(
       "Run a spec-kitty-profile manifest against a *.agent.yaml profile " +
       "set. Fully static and offline — no endpoint, no ChatClient."
     )
     .argument("<manifest>", "path to a spec-kitty-profile manifest (YAML)")
     .action(async (manifest: string, _local, cmd: Command) => {
       setExit(await doSkProfileRun(manifest, cmd.optsWithGlobals(), io));
     });
   ```
   No `--behavioral`/`--base-url`/`--model` options — this adapter has no
   behavioral half (unlike `memory-utilization`).
2. Implement `doSkProfileRun(manifestPath, opts, io)` mirroring
   `doMemoryUtilizationRun` (`:782-809`) exactly in structure but without a
   `clientFactory` parameter:
   ```ts
   async function doSkProfileRun(
     manifestPath: string,
     opts: GlobalOpts,
     io: Io
   ): Promise<number> {
     const absManifestPath = toAbsolute(manifestPath);
     let raw: unknown;
     try {
       raw = await loadSkProfileManifest(absManifestPath);
     } catch (error) {
       throw new ExecutionError(`cannot read spec-kitty-profile manifest: ${errorMessage(error)}`);
     }
     const manifest = resolveSkProfileManifestPaths(raw as SkProfileManifest, dirname(absManifestPath));

     const adapter = createSpecKittyProfileAdapter();
     let result: AdapterResult;
     try {
       result = await adapter.run(manifest);
     } catch (error) {
       throw new ExecutionError(`spec-kitty-profile adapter run failed: ${errorMessage(error)}`);
     }

     const report = buildSkProfileReport(result);
     io.outLine(
       opts.json === true ? JSON.stringify(report, null, 2) : formatSkProfileResultHuman(report)
     );
     return report.exitCode;
   }
   ```
   (Adjust exact type names/imports to what WP01/WP02/T015 actually export —
   this is a structural template, not a byte-for-byte copy-paste target.)
3. Implement `buildSkProfileReport(result: AdapterResult): SkProfileReport`
   mirroring `buildMemoryUtilizationReport` (`:692-709`):
   ```ts
   function buildSkProfileReport(result: AdapterResult): SkProfileReport {
     return {
       ok: result.ok,
       summary: result.summary,
       rubricDocPath: RUBRIC_DOC_PATH, // from WP02's rubric.ts
       exitCode: result.ok ? 0 : 1,
       findings: result.findings,
       cases: result.cases,
     };
   }
   ```
4. `--mode`/`--json` are inherited `GlobalOpts` (research.md R9) — `--mode`
   is accepted but unused by this adapter's checks, identical to how
   `memory-utilization` accepts-but-ignores it. Do not define a new
   `--mode`-like flag specific to this subcommand.
5. In `src/cli/output.ts`, add `formatSkProfileResultHuman(report:
   SkProfileReport): string` (additive) — one line per finding
   (`[<severity>] <profileId> <path>: <message>`), grouped by case, mirroring
   `formatMemoryUtilizationResultHuman`'s general shape (`src/cli/index.ts:
   832-845` — note that function currently lives in `index.ts`, not
   `output.ts`; if `output.ts` already hosts formatters for other adapters
   [check the Soul/CTS/A2A precedent named in this mission's own plan.md],
   follow whichever file the majority of existing hand-wired-adapter human
   formatters actually live in, and place this one alongside them for
   consistency — record which file you chose and why in this WP's Activity
   Log if it differs from this prompt's assumption).
6. Exit-code contract (data-model.md, verify exactly):
   - `0` — `report.ok === true`.
   - `1` — `report.ok === false` (at least one error-severity finding).
   - `2` — manifest/`projectionManifestPath` unreadable/unparseable, or a
     required manifest path is declared but structurally missing — i.e. any
     `ExecutionError` thrown from `doSkProfileRun`. Confirm the top-level CLI
     dispatcher already maps a thrown `ExecutionError` to exit 2 (it does,
     for every other hand-wired `run` subcommand) — you should not need to
     add new top-level exit-code plumbing, only throw `ExecutionError` in the
     right places.

**Files**: `src/cli/index.ts` (additive), `src/cli/output.ts` (additive)

**Validation**: covered by T019's `cli.test.ts`.

---

### T017 — Fixture authoring

**Purpose**: C-004 — a miniature, muster-local profile set (so muster CI
never needs the SK repo) exercising every pass path and, separately, every
lint class's failure path.

**Steps**:

1. `fixtures/skprofile/clean/*.agent.yaml` — a small legal profile set (2-3
   profiles is enough) with reciprocal handoffs, resolvable
   directive/tactic/toolguide/styleguide references, resolvable
   context-sources, legal and filename-matching profile-ids, and — if you
   choose to exercise the activation-gating pass path here too — references
   that resolve as activated against `activation-config.yaml` (step 6).
2. `fixtures/skprofile/broken/*.agent.yaml` — rigged, **at least one file per
   lint class** (SC-002/research.md R6's discrimination mapping), minimum
   set:
   - a dangling `collaboration.handoff-to` role → `handoff-unresolved`.
   - an unresolvable `directive-references[].code` → `reference-unresolved`.
   - a `profile-id` that does not equal its filename stem →
     `profile-id-filename-mismatch`.
   - a profile violating the vendored schema (e.g. missing a required field)
     → `schema-conformance-violation`.
   - a `context-sources` entry naming a file that does not exist →
     `context-source-missing`.
   These at minimum three (`handoff-unresolved`, `reference-unresolved`,
   `profile-id-filename-mismatch`) are the ones `quickstart.md` §4 names
   literally as required in the broken-manifest run's findings — do not omit
   any of them.
3. `fixtures/skprofile/doctrine/{directives,tactics,toolguides,styleguides}/`
   — a muster-local vendored doctrine tree mirroring the real upstream shape
   verified in research.md R2 (e.g.
   `directives/001-architectural-integrity-standard.directive.yaml`,
   `tactics/development-bdd.tactic.yaml`, `toolguides/contextive.toolguide.yaml`,
   `styleguides/prose.styleguide.yaml`) — content can be minimal stub YAML,
   since this mission never validates doctrine *content*, only filename
   resolution.
4. `fixtures/skprofile/agent-profile.schema.yaml` — a vendored copy of the
   upstream schema. Record the upstream SHA it was vendored from (C-004) —
   either as a header comment in the file itself or in a small sidecar note
   — and use that same SHA as `schemaSha` in `manifest.yaml`/
   `broken-manifest.yaml` below. To get a real SHA: read
   `/home/jeroennouws/dev/spec-kitty-conformance`'s current HEAD commit
   (read-only reference repo, do not modify it) via `git -C
   /home/jeroennouws/dev/spec-kitty-conformance rev-parse HEAD`, and vendor
   the real `agent-profile.schema.yaml` content from that checkout's
   `src/doctrine/schemas/agent-profile.schema.yaml`.
5. `fixtures/skprofile/manifest.yaml` — points at `clean/`, the vendored
   schema + its real `schemaSha`, `fixtures/skprofile/doctrine/`, and one
   case (`{ id: "all-profiles" }`, matching `quickstart.md`'s expected report
   shape).
6. `fixtures/skprofile/broken-manifest.yaml` — points at `broken/`, same
   schema/doctrine tree, one case.
7. `fixtures/skprofile/activation-config.yaml` — flat
   `activated_directives: [...]`/`activated_tactics: [...]` YAML (research.md
   R3's shape) exercising the FR-004 warning path (some resolvable-but-
   inactive reference somewhere in `clean/` or a dedicated fixture profile).

**Files**: everything under `fixtures/skprofile/**`

**Validation**: covered by T019's `fixtures.test.ts` (SC-002/SC-003) and the
manual runs in `quickstart.md` §3-4.

---

### T018 — Runnable example

**Purpose**: AC-1/Scenario 9 — `muster skprofile run examples/skprofile/manifest.yaml`
must exit 0. This is the one **guaranteed fully-clean** run (the
`fixtures/skprofile/clean/` manifest is not itself guaranteed to be
perfectly clean of every non-error finding — see `quickstart.md` §3's own
caveat).

**Steps**:

1. Create `examples/skprofile/manifest.yaml` + its own small clean
   profile/doctrine copy (can be a subset of, or identical to,
   `fixtures/skprofile/clean/` — but keep it in `examples/skprofile/`, not a
   reference back into `fixtures/`, so the example is self-contained and
   demonstrates real usage rather than test plumbing).
2. Confirm (manually, before writing T019/T020's automated assertions) that
   `muster skprofile run examples/skprofile/manifest.yaml --json` produces
   `exitCode: 0` and `ok: true` with zero findings — this is the literal
   claim AC-1 makes.

**Files**: everything under `examples/skprofile/**`

**Validation**: T020's real-CLI verification step exercises this manifest
directly; `quickstart.md` §5 documents the expected output.

---

### T019 — Test suite

**Purpose**: automate everything `quickstart.md` walks through by hand.

**Steps**:

1. `tests/skprofile/projection.test.ts` — unit tests for T014: matching by
   `profile_urn` (never `source_path`); missing entry → `projection-output-
   missing`; missing `output_path` on disk → same kind; hash drift on either
   hash → `projection-hash-drift` (warning); clean match → no finding;
   `projectionManifestPath` omitted → empty findings, check never runs.
2. `tests/skprofile/fixtures.test.ts` — the discrimination-control suite
   (SC-002/SC-003): load `fixtures/skprofile/manifest.yaml` and assert
   `ok === true`; load `fixtures/skprofile/broken-manifest.yaml` and assert
   `ok === false` **and** that `findings[]` contains at least one finding of
   each of the required kinds from T017 step 2 (`handoff-unresolved`,
   `reference-unresolved`, `profile-id-filename-mismatch`, and whichever
   others you rigged). This test is itself part of the adapter's contract
   (spec.md Scenario 11) — a version of this test that only asserts `ok ===
   false` without checking the specific finding kinds would pass even if the
   wrong check failed, which defeats the point.
3. `tests/skprofile/cli.test.ts` — drive the actual CLI entry point (in
   -process, not a subprocess, matching house convention — check how
   `memory-utilization`'s own CLI test invokes `runCli`/`buildProgram`
   directly with injected `out`/`err` sinks) against:
   - `fixtures/skprofile/manifest.yaml --json` → exit 0.
   - `fixtures/skprofile/broken-manifest.yaml --json` → exit 1.
   - a manifest whose `projectionManifestPath` points at a file containing
     invalid JSON → exit 2 (Scenario 14).
   - **Byte-stability** (AC-4/NFR-001/SC-004): run the clean fixture manifest
     twice in-process, capture both JSON payloads, assert byte-for-byte
     equality (`===` on the raw string, not a deep-equal on parsed objects —
     deep-equal would miss key-ordering regressions that break the literal
     byte-stability claim).
4. Use Vitest throughout.

**Files**: `tests/skprofile/projection.test.ts`,
`tests/skprofile/fixtures.test.ts`, `tests/skprofile/cli.test.ts`

**Validation**: `pnpm test` green; the byte-stability test specifically
proves NFR-001/SC-004, not just "tests pass."

---

### T020 — Real-CLI verification (non-optional Definition-of-Done gate)

**Purpose**: binding operator directive — this mission cannot be called done
on unit tests alone. Prove the adapter runs end-to-end against real,
non-fixture artifacts, and that exit codes 0, 1, **and** 2 have each been
**observed**, not assumed.

**Steps** (follow `quickstart.md` §6 as the literal script):

1. `pnpm build`.
2. `node dist/cli/index.js skprofile run fixtures/skprofile/manifest.yaml --json`
   — record the exit code (expect 0).
3. `node dist/cli/index.js skprofile run fixtures/skprofile/broken-manifest.yaml --json`
   — record the exit code (expect 1) and confirm the required finding kinds
   are present in the printed JSON.
4. Build a one-off manifest pointing at the **real** upstream profile set
   (read-only; never write there):
   ```yaml
   version: "1.0.0"
   profilesDir: /home/jeroennouws/dev/spec-kitty-conformance/src/doctrine/agent_profiles/built-in
   schemaPath: /home/jeroennouws/dev/spec-kitty-conformance/src/doctrine/schemas/agent-profile.schema.yaml
   schemaSha: <the actual HEAD commit SHA of that checkout — get it via `git -C /home/jeroennouws/dev/spec-kitty-conformance rev-parse HEAD`>
   doctrineRoot: /home/jeroennouws/dev/spec-kitty-conformance/src/doctrine
   cases:
     - id: real-profiles
   ```
   Run `node dist/cli/index.js skprofile run <that manifest path> --json`.
   **Record whichever exit code is actually observed and why** — do not
   assume 0. This step's purpose is proving the harness discriminates on
   real data (18 real profiles, real handoff graph, real directive codes),
   not asserting a specific verdict.
5. Run the same real-profile command a second time and diff the two `--json`
   payloads. They are **not** required to be byte-identical across machines
   (research.md R5 — no `projectionManifestPath` needed for this to matter;
   even without it, note in your Activity Log whether you additionally
   pointed `activationConfigPath` at this repo's own `.kittify/config.yaml`
   for a fuller demonstration) but **are** required to be byte-identical
   across these two consecutive runs on this machine.
6. Exercise the exit-code-2 path: point `projectionManifestPath` at a file
   containing invalid JSON and confirm `muster skprofile run <manifest>`
   exits 2.
7. Run `pnpm test` once more (full suite, including
   `tests/unit/invariants.test.ts`'s NI-002 assertion) and confirm it is
   green.
8. Record every observed exit code (step 2, 3, 4, 6) and the real-profile
   run's actual verdict in this WP's Activity Log, in prose, before moving
   this WP to `for_review`. A reviewer must be able to read the Activity Log
   and know, without re-running anything, that exit codes 0, 1, and 2 were
   each genuinely observed.

**Files**: none (verification only — do not create scratch files inside the
repo for this step; use `/tmp` for the one-off real-profile manifest).

**Validation**: the Activity Log entry described in step 8 *is* the
validation artifact for this subtask.

## Definition of Done

- [ ] `projection.ts` matches by `profile_urn`, never `source_path`; hashes
      are raw-UTF8 SHA-256 hex, no normalization.
- [ ] `index.ts`'s `run()` orchestrates all six check modules in a fixed,
      documented order and computes `ok` once over the whole graph.
- [ ] `skprofile run` is hand-wired in `buildProgram()` per the
      `memory-utilization` template; `--mode`/`--json` inherited, not
      redefined.
- [ ] Exit-code contract (0/1/2) matches data-model.md exactly.
- [ ] `fixtures/skprofile/broken/` rigs at least one fixture per lint class,
      including all three `quickstart.md` §4 names literally.
- [ ] `examples/skprofile/manifest.yaml` is genuinely, guaranteed-clean
      (exit 0, zero findings).
- [ ] `pnpm build` + `pnpm test` green, including the byte-stability
      assertion and `tests/unit/invariants.test.ts` (NI-002).
- [ ] **Real-CLI verification (T020) has actually been run**, not merely
      described — exit codes 0, 1, and 2 each recorded as observed in the
      Activity Log, including the real-profile-set verdict and rationale.
- [ ] No unrelated change to `src/cli/index.ts`/`src/cli/output.ts` beyond
      the additive `skprofile` wiring.

## Reviewer guidance

- **Reject if** T020's real-CLI verification is missing, or if the Activity
  Log only says "ran real CLI, worked" without the actual recorded exit
  codes and the real-profile-set verdict — "record the real exit code," not
  "confirm it ran."
- **Reject if** the byte-stability test uses a real (non-fixture) projection
  manifest — that test must target `fixtures/skprofile/manifest.yaml` only.
- **Reject if** `projection.ts` matches entries by `source_path` instead of
  `profile_urn`.
- **Reject if** `src/cli/index.ts`/`src/cli/output.ts` contain any change
  unrelated to the `skprofile` subcommand — diff those two files carefully,
  this is the mission's one genuinely shared-surface risk.
- Confirm the broken-fixture test (`fixtures.test.ts`) asserts on **specific
  finding kinds**, not just `ok === false` — spec.md Scenario 11 is explicit
  that a checker reporting `ok: true` here would be indistinguishable from
  one that never runs its lints; the inverse failure mode (asserting only
  `ok === false`) is the same discrimination gap one level up the test
  itself.
- Spot-check that `fixtures/skprofile/agent-profile.schema.yaml` records a
  real, resolvable upstream SHA (40 or a valid short hex, not a placeholder)
  and that `manifest.yaml`/`broken-manifest.yaml`'s `schemaSha` matches it.

## Activity Log

> **CRITICAL**: entries MUST be in chronological order (oldest first, newest
> last). Append new entries at the END.

- 2026-07-26T23:43:00Z – system – Prompt generated via /spec-kitty.tasks.
