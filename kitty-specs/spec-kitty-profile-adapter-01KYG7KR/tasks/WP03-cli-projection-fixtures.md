---
work_package_id: WP03
title: Projection drift, CLI wiring, real-CLI verification
dependencies:
- WP01
- WP02
- WP05
requirement_refs:
- C-001
- C-002
- C-003
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
- T019
- T020
phase: Phase 4 - Projection, CLI, verification
history:
- timestamp: '2026-07-26T23:43:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
- timestamp: '2026-07-27T00:00:00Z'
  agent: planner-priti
  action: Post-tasks adversarial-gate split — T017/T018 (fixture/example
    authoring) extracted to new WP05; this WP now also depends on WP05 and
    no longer owns fixtures/skprofile/**, examples/skprofile/**, or
    src/cli/output.ts.
agent_profile: node-norris
authoritative_surface: src/adapters/spec-kitty-profile/
create_intent:
- src/adapters/spec-kitty-profile/projection.ts
- src/adapters/spec-kitty-profile/index.ts
- tests/skprofile/projection.test.ts
- tests/skprofile/fixtures.test.ts
- tests/skprofile/cli.test.ts
execution_mode: code_change
model: ''
owned_files:
- src/adapters/spec-kitty-profile/projection.ts
- src/adapters/spec-kitty-profile/index.ts
- src/cli/index.ts
- tests/skprofile/projection.test.ts
- tests/skprofile/fixtures.test.ts
- tests/skprofile/cli.test.ts
role: implementer
tags: []
task_type: implement
tracker_refs: []
---

# Work Package Prompt: WP03 — Projection drift, CLI, real-CLI verification

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
with its 0/1/2 exit-code contract, and — **non-optional** — the real-CLI
verification against the actual 18 shipped Spec Kitty profiles, consuming
WP05's fixture/example surface (including its rigged discrimination-control
set) to do so.

This WP depends on **WP01, WP02, and WP05** (every module WP01/WP02 ship
must exist and compile, and WP05's fixtures/examples must exist for T019's
test suite and T020's real-CLI verification to run against). Do not start
until all three are available on your base branch — this WP's `index.ts`
imports from all four of WP02's lint modules plus WP01's
`manifest.ts`/`profile.ts`/`schema.ts`/`findings.ts`, and T019/T020 read
files WP05 authors under `fixtures/skprofile/**`/`examples/skprofile/**`.
(Fixture/example authoring itself — the original T017/T018 — was split out
into WP05 by the post-tasks adversarial-gate review: `tasks.md` had already
conceded the fixture work does not depend on CLI wiring, so it no longer sits
in front of T020's verification gate.)

**`src/cli/index.ts` is a shared-surface file.** This WP owns it for this
mission's purposes — make **additive** changes only (new subcommand, new
formatter function — see T016 for exactly which file the new formatter goes
in) and do not touch any unrelated existing code path, and do not touch
`src/cli/output.ts` at all (per the post-tasks adversarial-gate review, the
new human formatter goes in `index.ts`, alongside the majority of existing
hand-wired-adapter formatters, not in `output.ts`). (Spec.md's own
Dependencies & Assumptions note flags that `src/cli/index.ts` is also touched
by mission M5 in the same repo — this is an expected, normal cross-mission
file collision resolved by the ordinary mission-merge flow, not something to
work around here.)

## Context (read first)

- Spec: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/spec.md` — FR-007,
  FR-008, FR-009; Scenarios 8, 9, 10, 11, 14; SC-001..006. (C-004 — the
  muster-local fixtures/vendored-schema requirement — is WP05's, since WP05
  now authors the fixture surface.)
- Plan: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/plan.md` — IC-03,
  Project Structure (the full file tree this mission realizes, split across
  this WP and WP05).
- Data model: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/data-model.md`
  — `ProjectionEntry`, `AdapterResult`/`SkProfileReport`, the **exit-code
  contract table**, and the Flow section.
- Research: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/research.md` —
  **R5** (hash algorithm + matching key — read this before writing
  `projection.ts`), R8 (`RunOptions` is reserved-but-empty, no `ChatClient`),
  R9 (CLI `--mode`/`--json` inheritance), R6 (the discrimination-control
  mapping table you must satisfy with fixtures).
- Quickstart: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/quickstart.md`
  — this is close to a literal script for this WP's T014-T016/T019-T020 (and,
  upstream of it, WP05's T017-T018); follow its exact commands and expected
  outputs.
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
5. In `src/cli/index.ts`, add `formatSkProfileResultHuman(report:
   SkProfileReport): string` (additive) — one line per finding
   (`[<severity>] <profileId> <path>: <message>`), grouped by case, mirroring
   `formatMemoryUtilizationResultHuman`'s general shape (`src/cli/index.ts:
   832-845`). **Verified precedent count** (do not re-derive this, it has
   already been counted): **8** hand-wired-adapter human formatters live in
   `src/cli/index.ts` (`formatMemoryResultHuman`,
   `formatMemoryUtilizationResultHuman`, `formatCrossLayerResultHuman`,
   `formatHeartbeatSummaryHuman`, `formatA2aSummaryHuman`,
   `formatSkillsResultHuman`, `formatSopResultHuman`,
   `formatToolsResultHuman`) versus **4** in `src/cli/output.ts`
   (`formatReportHuman`, `formatCtsHuman`, `formatBehaveHuman`,
   `formatA2aBehavioralHuman`). The majority precedent is `src/cli/index.ts`
   — put `formatSkProfileResultHuman` there, alongside the other eight, not
   in `output.ts`. This WP does not touch `src/cli/output.ts` at all. If you
   deviate from this placement, record why in this WP's Activity Log.
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

**Files**: `src/cli/index.ts` (additive only)

**Validation**: covered by T019's `cli.test.ts`.

---

> **T017 (fixture authoring) and T018 (runnable example) moved to WP05.**
> The post-tasks adversarial-gate review split fixture/example authoring out
> of this WP into a dedicated `tasks/WP05-fixtures-examples.md`, since it does
> not depend on CLI wiring and was sitting in front of T020's verification
> gate for no dependency reason. This WP now depends on WP05 for
> `fixtures/skprofile/**` and `examples/skprofile/**`; T019/T020 below read
> those files but do not author them.

### T019 — Test suite

**Purpose**: automate everything `quickstart.md` walks through by hand.

**Steps**:

1. `tests/skprofile/projection.test.ts` — unit tests for T014: matching by
   `profile_urn` (never `source_path`); missing entry → `projection-output-
   missing`; missing `output_path` on disk → same kind; hash drift on either
   hash → `projection-hash-drift` (warning); clean match → no finding;
   `projectionManifestPath` omitted → empty findings, check never runs.
2. `tests/skprofile/fixtures.test.ts` — the discrimination-control suite
   (SC-002/SC-003): load `fixtures/skprofile/manifest.yaml` (WP05's
   deliverable) and assert `ok === true`; load
   `fixtures/skprofile/broken-manifest.yaml` and assert `ok === false` **and**
   that `findings[]` contains at least one finding of each of the required
   kinds from WP05's T017 step 2 (`handoff-unresolved`, `reference-unresolved`,
   `profile-id-filename-mismatch`, and whichever others WP05 rigged). This
   test is itself part of the adapter's contract
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
   (this and step 3's manifest are WP05's fixture deliverables) — record the
   exit code (expect 0).
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
8. Capture the **literal stdout** (not paraphrased) of steps 2, 3, 4, and 6 —
   including the exact `--json` payload's `exitCode` field and, for step 4,
   the exact `findings[]` array content (profile IDs and message text) from
   the real 18-profile run — and paste it verbatim into this WP's Activity
   Log inside a fenced code block, before moving this WP to `for_review`.
   Prose summaries alone ("exit code was 1, one finding") do not satisfy
   this step.

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
- [ ] `fixtures.test.ts` proves every fixture WP05 rigged under
      `fixtures/skprofile/broken/` produces its expected specific finding
      kind, including all three `quickstart.md` §4 names literally
      (authoring the fixtures themselves is WP05's deliverable; this WP
      consumes them).
- [ ] `examples/skprofile/manifest.yaml` (WP05's deliverable) is confirmed
      genuinely clean via this WP's CLI: exit 0, zero findings.
- [ ] `pnpm build` + `pnpm test` green, including the byte-stability
      assertion and `tests/unit/invariants.test.ts` (NI-002).
- [ ] **Real-CLI verification (T020) has actually been run** — the Activity
      Log contains a verbatim, fenced transcript of steps 2, 3, 4, and 6's
      stdout (literal `exitCode` and, for step 4, literal `findings[]`
      content from the real 18-profile run), not a prose paraphrase.
- [ ] No unrelated change to `src/cli/index.ts` beyond the additive
      `skprofile` wiring; `src/cli/output.ts` is not touched at all.

## Reviewer guidance

- **Independently re-run T020's steps 2, 3, 4, and 6 yourself** (you have
  Bash access) before approving. **Reject if** your own observed exit
  codes/findings diverge from the logged transcript, or the transcript is a
  paraphrase you cannot byte-check against your own run.
- **Reject if** T020's real-CLI verification is missing, or if the Activity
  Log only says "ran real CLI, worked" without the actual recorded exit
  codes and the real-profile-set verdict — "record the real exit code," not
  "confirm it ran."
- **Reject if** the byte-stability test uses a real (non-fixture) projection
  manifest — that test must target `fixtures/skprofile/manifest.yaml` only.
- **Reject if** `projection.ts` matches entries by `source_path` instead of
  `profile_urn`.
- **Reject if** `src/cli/index.ts` contains any change unrelated to the
  `skprofile` subcommand (including the new `formatSkProfileResultHuman`
  formatter, which belongs here per the 8-vs-4 precedent count, not
  `output.ts`) — diff it carefully, this is the mission's one genuinely
  shared-surface risk. **Reject if** `src/cli/output.ts` is touched at all —
  this WP no longer owns it and has no reason to change it.
- Confirm the broken-fixture test (`fixtures.test.ts`) asserts on **specific
  finding kinds**, not just `ok === false` — spec.md Scenario 11 is explicit
  that a checker reporting `ok: true` here would be indistinguishable from
  one that never runs its lints; the inverse failure mode (asserting only
  `ok === false`) is the same discrimination gap one level up the test
  itself.

## Activity Log

> **CRITICAL**: entries MUST be in chronological order (oldest first, newest
> last). Append new entries at the END.

- 2026-07-26T23:43:00Z – system – Prompt generated via /spec-kitty.tasks.
- 2026-07-27T00:00:00Z – planner-priti – Post-tasks adversarial-gate fixes
  applied: T017/T018 (fixture/example authoring) split out to new WP05, this
  WP's `dependencies` now includes WP05, `owned_files`/`create_intent` no
  longer include `fixtures/skprofile/**`, `examples/skprofile/**`, or
  `src/cli/output.ts`. T020's verification step 8/DoD/reviewer-guidance
  tightened to require a verbatim stdout transcript instead of a prose
  paraphrase. T015's duplicate, contradictory second "5." coordination note
  about `profile-parse-error` citation removed (WP02's `RUBRIC_CITATION` map
  now explicitly excludes that kind; the fixed non-rubric literal in T015's
  first "5." is the sole path). T016's formatter placement corrected to
  `src/cli/index.ts` (8 existing formatters there vs. 4 in `output.ts`).
- 2026-07-27T16:46:01Z – claude – shell_pid=1735012 – T020 real-CLI verification — verbatim transcripts (all four exit-code
scenarios actually observed, not assumed). Commands run from the lane
worktree after `pnpm build`.

STEP 2 — clean fixture manifest, exit 0:
$ node dist/cli/index.js skprofile run fixtures/skprofile/manifest.yaml --json
```
{
  "ok": true,
  "summary": "spec-kitty-profile adapter: 0 error finding(s) across 2 profile(s)",
  "exitCode": 0,
  "findings": [reference-not-activated x2 (architect, planner) — see fixture header, expected]
}
```
$ echo $? -> 0

STEP 3 — broken fixture manifest, exit 1:
$ node dist/cli/index.js skprofile run fixtures/skprofile/broken-manifest.yaml --json
```
{
  "ok": false,
  "summary": "spec-kitty-profile adapter: 12 error finding(s) across 11 profile(s)",
  "exitCode": 1,
  "findings": [13 total — handoff-asymmetric(warning) x1, handoff-unresolved(error) x1,
    reference-unresolved(error) x1, context-source-missing(error) x1,
    profile-id-filename-mismatch(error) x3, profile-id-illegal(error) x2,
    profile-id-collision(error) x2, schema-conformance-violation(error) x2]
}
```
$ echo $? -> 1
(Matches fixtures.test.ts's pinned 13-finding vector exactly.)

STEP 4 — real 18 shipped Spec Kitty profiles (read-only), run TWICE for
byte-stability comparison:
$ git -C /home/jeroennouws/dev/spec-kitty-conformance rev-parse HEAD
268f01634fec75574bb02d0f6f97b72d95a4d1fc
Manifest (schemaSha pinned to that HEAD, activationConfigPath pointed at
this repo's own .kittify/config.yaml for a fuller demonstration):
```yaml
version: "1.0.0"
profilesDir: /home/jeroennouws/dev/spec-kitty-conformance/src/doctrine/agent_profiles/built-in
schemaPath: /home/jeroennouws/dev/spec-kitty-conformance/src/doctrine/schemas/agent-profile.schema.yaml
schemaSha: 268f01634fec75574bb02d0f6f97b72d95a4d1fc
doctrineRoot: /home/jeroennouws/dev/spec-kitty-conformance/src/doctrine
activationConfigPath: <this-worktree>/.kittify/config.yaml
cases:
  - id: real-profiles
```
$ node dist/cli/index.js skprofile run /tmp/skprofile-real-run-manifest.yaml --json > /tmp/real-run-1.json
$ echo $? -> 1  (report.ok: false, report.exitCode: 1)
Observed finding-kind counts: handoff-asymmetric: 9, handoff-unresolved: 7,
reference-not-activated: 27 — total 43 findings, 7 error-severity
(the handoff-unresolved ones) + 36 warning-severity. This matches the
externally-reported expectation (7/9/27, 43 total) exactly.

**Post-acceptance pre-merge review correction (2026-07-27)**: this exact
configuration is now checked in at
`kitty-specs/spec-kitty-profile-adapter-01KYG7KR/verification/real-profile-run-manifest.yaml`
(schemaSha re-pinned to the fork's current HEAD, `c425bc188…`, at time of
checking-in; the 18 profiles' own content — and therefore this 43/7/9/27
figure — is unchanged since `91eeced1d`, 2026-06-22). Re-derived
independently against the checked-in manifest: still exactly 43 findings
(7/9/27), `report.ok === false`, exit `1`. Without `activationConfigPath`
supplied, the same profile set yields 16 (7 + 9 only) — the 27 is a
function of the activation config, which is why it is now pinned in a
checked-in file rather than restated from memory.

Literal findings[] content (profileId, kind, path, message — extracted
directly from the JSON, not paraphrased):
  WARNING handoff-asymmetric      curator-carla              collaboration.handoff-to[0]
          role "researcher" in collaboration.handoff-to is not reciprocated by any holder's handoff-from
  WARNING handoff-asymmetric      curator-carla              collaboration.handoff-to[1]
          role "planner" in collaboration.handoff-to is not reciprocated by any holder's handoff-from
  WARNING handoff-asymmetric      doctrine-daphne            collaboration.handoff-to[0]
          role "curator" in collaboration.handoff-to is not reciprocated by any holder's handoff-from
  WARNING handoff-asymmetric      doctrine-daphne            collaboration.handoff-to[1]
          role "reviewer" in collaboration.handoff-to is not reciprocated by any holder's handoff-from
  ERROR   handoff-unresolved      frontend-freddy            collaboration.works-with[3]
          role "node-norris" declared in collaboration.works-with does not match any other profile's roles
  WARNING handoff-asymmetric      generic-agent              collaboration.handoff-to[1]
          role "planner" in collaboration.handoff-to is not reciprocated by any holder's handoff-from
  ERROR   handoff-unresolved      node-norris                collaboration.works-with[3]
          role "frontend-freddy" declared in collaboration.works-with does not match any other profile's roles
  WARNING handoff-asymmetric      paula-patterns             collaboration.handoff-to[2]
          role "architect" in collaboration.handoff-to is not reciprocated by any holder's handoff-from
  ERROR   handoff-unresolved      paula-patterns             collaboration.handoff-from[2]
          role "debugger" declared in collaboration.handoff-from does not match any other profile's roles
  ERROR   handoff-unresolved      planner-priti              collaboration.works-with[1]
          role "manager" declared in collaboration.works-with does not match any other profile's roles
  WARNING handoff-asymmetric      randy-reducer              collaboration.handoff-to[1]
          role "implementer" in collaboration.handoff-to is not reciprocated by any holder's handoff-from
  ERROR   handoff-unresolved      randy-reducer              collaboration.works-with[2]
          role "debugger" declared in collaboration.works-with does not match any other profile's roles
  WARNING handoff-asymmetric      retrospective-facilitator  collaboration.handoff-to[0]
          role "human-in-charge" in collaboration.handoff-to is not reciprocated by any holder's handoff-from
  ERROR   handoff-unresolved      retrospective-facilitator  collaboration.handoff-to[1]
          role "synthesize-command" declared in collaboration.handoff-to does not match any other profile's roles
  ERROR   handoff-unresolved      retrospective-facilitator  collaboration.handoff-from[4]
          role "generic-agent" declared in collaboration.handoff-from does not match any other profile's roles
  WARNING handoff-asymmetric      reviewer-renata            collaboration.handoff-to[1]
          role "planner" in collaboration.handoff-to is not reciprocated by any holder's handoff-from
  WARNING reference-not-activated architect-alphonso         directive-references[4].code
          directive code "041" resolves on disk but is not in the activated set
  WARNING reference-not-activated architect-alphonso         directive-references[5].code
          directive code "043" resolves on disk but is not in the activated set
  WARNING reference-not-activated architect-alphonso         directive-references[6].code
          directive code "044" resolves on disk but is not in the activated set
  WARNING reference-not-activated doctrine-daphne            directive-references[3].code
          directive code "043" resolves on disk but is not in the activated set
  WARNING reference-not-activated doctrine-daphne            directive-references[4].code
          directive code "044" resolves on disk but is not in the activated set
  WARNING reference-not-activated implementer-ivan           directive-references[1].code
          directive code "043" resolves on disk but is not in the activated set
  WARNING reference-not-activated implementer-ivan           directive-references[2].code
          directive code "044" resolves on disk but is not in the activated set
  WARNING reference-not-activated implementer-ivan           directive-references[3].code
          directive code "045" resolves on disk but is not in the activated set
  WARNING reference-not-activated paula-patterns             directive-references[4].code
          directive code "041" resolves on disk but is not in the activated set
  WARNING reference-not-activated paula-patterns             tactic-references[0].id
          tactic id "paula-patterns-architecture-scout-review" resolves on disk but is not in the activated set
  WARNING reference-not-activated python-pedro               directive-references[5].code
          directive code "041" resolves on disk but is not in the activated set
  WARNING reference-not-activated python-pedro               directive-references[6].code
          directive code "043" resolves on disk but is not in the activated set
  WARNING reference-not-activated python-pedro               directive-references[7].code
          directive code "044" resolves on disk but is not in the activated set
  WARNING reference-not-activated python-pedro               directive-references[8].code
          directive code "045" resolves on disk but is not in the activated set
  WARNING reference-not-activated python-pedro               tactic-references[0].id
          tactic id "test-scaffolding-as-design-smell" resolves on disk but is not in the activated set
  WARNING reference-not-activated python-pedro               tactic-references[1].id
          tactic id "delete-the-assertion-not-the-test" resolves on disk but is not in the activated set
  WARNING reference-not-activated randy-reducer              directive-references[5].code
          directive code "041" resolves on disk but is not in the activated set
  WARNING reference-not-activated randy-reducer              tactic-references[0].id
          tactic id "semantic-compression-behavioral-boundary-mapping" resolves on disk but is not in the activated set
  WARNING reference-not-activated randy-reducer              tactic-references[1].id
          tactic id "semantic-compression-redundancy-discovery" resolves on disk but is not in the activated set
  WARNING reference-not-activated randy-reducer              tactic-references[2].id
          tactic id "semantic-compression-abstraction-extraction" resolves on disk but is not in the activated set
  WARNING reference-not-activated randy-reducer              tactic-references[3].id
          tactic id "semantic-compression-dead-weight-elimination" resolves on disk but is not in the activated set
  WARNING reference-not-activated randy-reducer              tactic-references[4].id
          tactic id "semantic-compression-semantic-consolidation" resolves on disk but is not in the activated set
  WARNING reference-not-activated randy-reducer              tactic-references[5].id
          tactic id "semantic-compression-equivalence-verification" resolves on disk but is not in the activated set
  WARNING reference-not-activated randy-reducer              tactic-references[6].id
          tactic id "test-scaffolding-as-design-smell" resolves on disk but is not in the activated set
  WARNING reference-not-activated reviewer-renata            directive-references[4].code
          directive code "041" resolves on disk but is not in the activated set
  WARNING reference-not-activated reviewer-renata            tactic-references[4].id
          tactic id "test-scaffolding-as-design-smell" resolves on disk but is not in the activated set
  WARNING reference-not-activated reviewer-renata            tactic-references[5].id
          tactic id "delete-the-assertion-not-the-test" resolves on disk but is not in the activated set

$ node dist/cli/index.js skprofile run /tmp/skprofile-real-run-manifest.yaml --json > /tmp/real-run-2.json
$ diff /tmp/real-run-1.json /tmp/real-run-2.json
(no output — byte-identical across these two consecutive runs on this
machine, as required; NOT claimed byte-identical across machines, per
research.md R5's scoping note, since profilesDir/schemaPath/doctrineRoot
here are this machine's absolute paths, baked into schema-conformance
citation text and hypothetically into any future projection entries.)

STEP 6 — exit-code-2 path, invalid-JSON projectionManifestPath:
$ echo '{ not valid json' > /tmp/skprofile-bad-projection.json
$ node dist/cli/index.js skprofile run /tmp/skprofile-exit2-manifest.yaml --json
muster: spec-kitty-profile adapter run failed: spec-kitty-profile projection manifest: could not parse "/tmp/skprofile-bad-projection.json" as JSON: Expected property name or '}' in JSON at position 2 (line 1 column 3)
$ echo $? -> 2

STEP 7 — `pnpm test` re-run after T020, full suite green: 170 test files
passed, 3599 passed | 3 skipped (3602 total), Type Errors: no errors
(tests/unit/invariants.test.ts's NI-002 assertion included and green).
