# Tasks: Spec-Kitty Agent-Profile Static Conformance Adapter

**Mission**: `spec-kitty-profile-adapter-01KYG7KR`
**Input**: `spec.md` (FR-001..010, NFR-001..002, C-001..004), `plan.md` (IC-01..IC-04, Project Structure, Charter Check), `data-model.md` (entities, exit-code contract, module→entity table), `research.md` (R1..R9), `quickstart.md` (build/test/run/verify walkthrough), `contracts/spec-kitty-profile-manifest.schema.json`, `contracts/spec-kitty-profile-report.schema.json`.
**Branch contract**: planned on `kitty/mission-spec-kitty-profile-adapter` (current branch matches target — `branch_matches_target: true`); WPs execute in lanes; completed changes merge back into `kitty/mission-spec-kitty-profile-adapter`. This mission's coordination branch (`kitty/mission-spec-kitty-profile-adapter-01KYG7KR`) is a separate, ULID-suffixed branch used only by mission tooling in `.worktrees/spec-kitty-profile-adapter-01KYG7KR-coord/` — implementation WPs never check it out.

**Ownership note**: this mission ships exactly the four WPs `garrison-hq/muster#58` §6 already names, mapped 1:1 to plan.md's Implementation Concern Map (IC-01..IC-04). `owned_files` are sliced by module so no two WPs write the same file:

- **WP01** — the data layer every other check depends on: `manifest.ts`, `profile.ts`, `schema.ts`, `findings.ts` (IC-01).
- **WP02** — the four cross-profile lints plus the rubric-citation module: `handoff.ts`, `references.ts`, `context-sources.ts`, `identity.ts`, `rubric.ts` (IC-02).
- **WP03** — projection drift, adapter assembly, CLI wiring, and the entire fixture/example/cross-cutting-test surface: `projection.ts`, `index.ts`, `src/cli/index.ts` (additive), `src/cli/output.ts` (additive), `fixtures/skprofile/**`, `examples/skprofile/**`, plus `tests/skprofile/projection.test.ts`, `fixtures.test.ts`, `cli.test.ts` (IC-03).
- **WP04** — the published rubric surface: `docs/rubric/spec-kitty-profile-taxonomy.md`, `docs/rubric/spec-kitty-behavioral-axes.md`, `docs/rubric/sop-rule-taxonomy.md` (amended) (IC-04).

**Lane split**: lane-a (code: WP01→WP02→WP03, sequential dependency chain) and lane-b (docs: WP04, no code dependency — `docs/rubric/**` never collides with lane-a's `write_scope`). Lane assignment and `parallel_group` are computed automatically by `spec-kitty agent mission finalize-tasks` from the dependency graph + `owned_files`; this document states the intended shape so that computation is a confirmation, not a surprise.

**Same-mission ordering note (not a lane dependency — spec.md Dependencies & Assumptions, plan.md IC-02)**: WP02's lint finding text (in `rubric.ts`) quotes `docs/rubric/spec-kitty-profile-taxonomy.md` §-clauses that WP04 authors. WP04 must exist in enough draft form for WP02 to cite real §-clause ids before WP02's citation strings are finalized. This is deliberately **not** encoded as `WP02 depends on WP04` in frontmatter or `lanes.json`'s `depends_on_lanes` — WP04 has no code dependency and lane-b can build in parallel with lane-a; it is purely an authoring-order concern inside WP02's own subtasks (see WP02 T007) and is closed out by WP04's T024 reconciliation pass. If WP02 lands first, it uses research.md R6's draft §-area table as a placeholder and WP04 reconciles wording afterward — the plan.md precedent for exactly this situation.

## Requirement → Work Package map

| ID | Requirement (short) | WP |
|----|---------------------|----|
| FR-001 | Manifest type `{version, profilesDir, schemaPath, schemaSha, doctrineRoot, activationConfigPath?, projectionManifestPath?, cases[]}` + `validateManifest` | WP01 |
| FR-002 | Schema conformance via Ajv2020; `source.normative` from `schemaPath`+`schemaSha` | WP01 |
| FR-003 | Handoff lint: role-based resolution + asymmetry warning | WP02 |
| FR-004 | Reference lint: directive/tactic resolution + activation-set gating | WP02 |
| FR-005 | `context-sources` on-disk integrity | WP02 |
| FR-006 | Profile-id legality/filename-match/collision | WP02 |
| FR-007 | Projection drift vs `.kittify/agent_profiles_manifest.json` | WP03 |
| FR-008 | CLI `muster skprofile run <manifest>`, hand-wired, exit 0/1/2 | WP03 |
| FR-009 | Every finding cites `source.normative` (schema@SHA half: WP01; rubric §-clause half: WP02, WP03) | WP01, WP02, WP03 |
| FR-010 | Three `docs/rubric/` documents land | WP04 |
| NFR-001 | Static path offline + byte-stable | WP01, WP02, WP03 |
| NFR-002 | `tsc` strict + full Vitest green + SonarCloud gate | WP01, WP02, WP03 |
| C-001 | `src/core/` untouched; NI-002 stays green | WP01, WP02, WP03 |
| C-002 | Offline, byte-stable, no clock reads | WP01, WP02, WP03 |
| C-003 | No SK dependency; never shells out; plain file reads only | WP01, WP02, WP03 |
| C-004 | Muster-local fixtures; vendored schema records its upstream SHA | WP03 |

Every FR-001..010, NFR-001..002, and C-001..004 maps to at least one WP. None are unmapped.

## Subtask Index

| ID | Description | WP | Parallel |
|---|---|---|---|
| T001 | `findings.ts` — `SkProfileFinding` type + the frozen 13-kind `SkProfileFindingKind` union (verbatim from data-model.md / the report contract) + `err()`/`warn()` constructors | WP01 | [P] |
| T002 | `manifest.ts` — `SkProfileManifest`/`SkProfileCase` types + `validateManifest` (path resolution, required `schemaSha`/`doctrineRoot`, throws on empty `cases`/duplicate id/unresolvable `case.profileId`) | WP01 | [P] |
| T003 | `profile.ts` — `AgentProfile` parsing from `*.agent.yaml` (parse-error-tolerant), profile-set loader over `profilesDir` | WP01 | |
| T004 | `schema.ts` — Ajv2020 schema-conformance check (`ajv/dist/2020`, `.default ?? AjvModule` interop) + `source.normative` GitHub blob URL construction (R7) | WP01 | |
| T005 | Unit tests: `manifest.test.ts` + `schema.test.ts` (inline/tmp fixtures — `fixtures/skprofile/` does not exist yet) | WP01 | |
| T006 | WP01 verification gate (`pnpm build`, `pnpm test`, `src/core/` untouched) | WP01 | |
| T007 | `rubric.ts` — rubric doc path constant + `source.normative` citation strings per finding kind (same-mission ordering note: reconcile against WP04's draft before finalizing wording) | WP02 | [P] |
| T008 | `handoff.ts` — handoff-graph resolution (role names, not profile-ids) + symmetry (`handoff-unresolved` error / `handoff-asymmetric` warning) | WP02 | [P] |
| T009 | `references.ts` — directive/tactic reference resolution against `doctrineRoot` + activation-set gating + the loud `activation-config-unrecognized-shape` warning | WP02 | |
| T010 | `context-sources.ts` — on-disk integrity for `context-sources.{directives,tactics,toolguides,styleguides}` (never activation-gated) | WP02 | |
| T011 | `identity.ts` — profile-id legality, filename-stem match, cross-profile collision | WP02 | |
| T012 | Unit tests for all four lint modules + `rubric.ts` citation-resolves test (in-memory/tmp `AgentProfile[]` fixtures) | WP02 | |
| T013 | WP02 verification gate | WP02 | |
| T014 | `projection.ts` — `ProjectionEntry` matching by `profile_urn` + SHA-256 recompute of `source_hash`/`file_hash` (`projection-output-missing` error / `projection-hash-drift` warning); skipped when `projectionManifestPath` omitted | WP03 | [P] |
| T015 | `index.ts` — `SpecKittyProfileAdapter` factory + `run(manifest, options?)` orchestrating all six check modules → whole-graph `findings[]` → `cases[]` filter view → `AdapterResult` | WP03 | |
| T016 | CLI wiring: `skprofile run <manifest>` hand-wired in `buildProgram()` (D1/FR-008 template: `src/cli/index.ts:1717-1755`); `SkProfileReport` wrapping + exit 0/1/2; `src/cli/output.ts` human formatter | WP03 | |
| T017 | Fixture authoring: `fixtures/skprofile/clean/`, `fixtures/skprofile/broken/` (≥1 rigged violation per lint class, SC-002/R6), `fixtures/skprofile/doctrine/{directives,tactics,toolguides,styleguides}/`, vendored `agent-profile.schema.yaml` (+ its `schemaSha`), `manifest.yaml`, `broken-manifest.yaml`, `activation-config.yaml` | WP03 | [P] |
| T018 | `examples/skprofile/manifest.yaml` + its own small clean profile/doctrine copy (AC-1, Scenario 9 — the guaranteed fully-clean run) | WP03 | [P] |
| T019 | Test suite: `projection.test.ts`, `fixtures.test.ts` (discrimination-control suite, SC-002/SC-003), `cli.test.ts` (exit 0/1/2 + byte-stability, AC-4/NFR-001/SC-004) | WP03 | |
| T020 | Real-CLI verification (binding operator directive, non-optional DoD gate): `pnpm build`; run against muster-local fixtures (clean → 0, broken → 1); run against the actual 18 SK profiles at `/home/jeroennouws/dev/spec-kitty-conformance/src/doctrine/agent_profiles/built-in/` (read-only) recording the observed exit code; exercise the malformed-`projectionManifestPath` path (exit 2); confirm NI-002 stays green | WP03 | |
| T021 | Author `docs/rubric/spec-kitty-profile-taxonomy.md` — normative source for every M2 check class, `[NORMATIVE]`/`[CONVENTION]`/`[MUSTER-OWN]` tagged per `memory-utilization-taxonomy.md` house style, `status: normative` front matter, stable §-clause ids | WP04 | [P] |
| T022 | Author `docs/rubric/spec-kitty-behavioral-axes.md` — verbatim `rubricText` blocks between `<RUBRIC>` tags per profile axis (avoidance-boundary adherence, capability containment, handoff discipline, canonical-verb usage) — the hard M4 dependency | WP04 | [P] |
| T023 | Amend `docs/rubric/sop-rule-taxonomy.md` — v1.1 directive-mapping appendix (ruleText field mapping, decidability mapping onto the 5 binary + 2 judge classes, `source.supporting` citation format), v1.0.0 classes untouched | WP04 | |
| T024 | Cross-check + reconcile: verify every citation string WP02's `rubric.ts` needs resolves to a real §-clause in `spec-kitty-profile-taxonomy.md`; record any reconciled wording in the Activity Log | WP04 | |

## Phase 1 — Foundation (WP01)

### WP01 — Manifest, profile loading, schema conformance — prompt: `tasks/WP01-manifest-schema.md`

**Goal**: the data layer every other check depends on — manifest parsing/validation (with `schemaSha`/`doctrineRoot`), `*.agent.yaml` loading into `AgentProfile[]` (parse-error-tolerant), the frozen 13-kind finding vocabulary, and FR-002's Ajv2020 schema-conformance check against the SHA-pinned vendored schema.
**Priority**: P1 · **Estimated prompt size**: ~350 lines
**Independent test**: `pnpm build` (strict tsc) passes; `tests/skprofile/manifest.test.ts` + `tests/skprofile/schema.test.ts` green; a unit test proves plain `new Ajv()` would fail/mis-validate against the draft-2020-12 schema (R4 regression guard).

- T001 `findings.ts` (WP01)
- T002 `manifest.ts` (WP01)
- T003 `profile.ts` (WP01)
- T004 `schema.ts` (WP01)
- T005 Unit tests (WP01)
- T006 WP01 verification gate (WP01)

**Dependencies**: none (foundation).
**Parallel**: T001/T002 touch disjoint new files and can be drafted in parallel; T003 depends on T001 (uses `AgentProfile`'s shape from data-model.md, no direct import needed but the parse-error contract must match `findings.ts`'s vocabulary); T004 depends on T002 (needs `schemaSha`/`schemaPath` from the manifest type).
**Risks**: the Ajv2020 import path (`ajv/dist/2020`, not default `Ajv`) is an easy miss given the schema's `$schema: draft/2020-12` header (research.md R4) — must be exercised by a unit test that would fail loudly under plain `Ajv`.

## Phase 2 — Cross-profile lints (WP02, after WP01)

### WP02 — Cross-profile lints (handoff, reference, context-sources, identity) — prompt: `tasks/WP02-cross-profile-lints.md`

**Goal**: the four graph-wide/file-existence checks that make this adapter more than a schema validator, plus the rubric-citation module every one of them cites. Covers FR-003, FR-004, FR-005, FR-006, and the rubric-citation half of FR-009.
**Priority**: P1 · **Estimated prompt size**: ~480 lines
**Independent test**: `pnpm build` passes; `tests/skprofile/{handoff,references,context-sources,identity}.test.ts` green; every emitted finding's `source.normative` is non-empty and resolvable to a rubric doc path.

- T007 `rubric.ts` (WP02)
- T008 `handoff.ts` (WP02)
- T009 `references.ts` (WP02)
- T010 `context-sources.ts` (WP02)
- T011 `identity.ts` (WP02)
- T012 Unit tests (WP02)
- T013 WP02 verification gate (WP02)

**Dependencies**: WP01 (`AgentProfile[]`, `SkProfileFinding`/`err()`/`warn()` must exist first).
**Parallel**: T008/T009/T010/T011 touch disjoint new files and can be drafted in parallel once T007's citation-constant shape is agreed; T012 depends on all four check modules.
**Risks**: the role-vs-profile-id handoff typing is muster's own interpretive reading (`[MUSTER-OWN]` in the rubric) — mitigated by treating asymmetry as warning, not error; the activation-config shape-validation loud-failure path (`activation-config-unrecognized-shape`) must fire exactly once per run, never once per reference — a naive per-reference emission is a common mistake to guard against in review.

## Phase 3 — Projection, CLI, fixtures (WP03, after WP01+WP02) / Rubric surface (WP04, parallel)

### WP03 — Projection drift, CLI, fixtures/examples — prompt: `tasks/WP03-cli-projection-fixtures.md`

**Goal**: FR-007's independent projection-drift re-verification, the `muster skprofile run` command with its 0/1/2 exit-code contract, the full fixture/example surface (including the rigged discrimination-control set), and the mandatory real-CLI verification against the actual 18 SK profiles.
**Priority**: P1 (merges last of the code WPs) · **Estimated prompt size**: ~550 lines
**Independent test**: `pnpm build` passes; `tests/skprofile/{projection,fixtures,cli}.test.ts` green; `muster skprofile run fixtures/skprofile/manifest.yaml --json` exits 0; `muster skprofile run fixtures/skprofile/broken-manifest.yaml --json` exits 1 with the expected finding kinds; the real-CLI verification against the actual SK profile set has been run and its observed exit code recorded in the Activity Log; two consecutive runs of the muster-local fixture manifest are byte-identical.

- T014 `projection.ts` (WP03)
- T015 `index.ts` (WP03)
- T016 CLI wiring (WP03)
- T017 Fixture authoring (WP03)
- T018 Example (WP03)
- T019 Test suite (WP03)
- T020 Real-CLI verification (WP03)

**Dependencies**: WP01, WP02 (needs the full finding set to wire exit codes and to author fixtures that exercise every kind).
**Parallel**: T014 (projection.ts) and T017/T018 (fixture/example authoring) can proceed in parallel once T015's `AdapterResult` shape is settled; T016 (CLI wiring) depends on T015; T019/T020 depend on everything else in this WP.
**Risks**: the real `.kittify/agent_profiles_manifest.json`-shaped projection manifest bakes in absolute, machine-specific paths (research.md R5) — the byte-stability test (T019) must target the muster-local fixture manifest only, never the real one, or it will be flaky by construction; the real-CLI verification (T020) must record whichever exit code is actually observed against the real SK profile set rather than assuming 0.

### WP04 — Published rubric surface — prompt: `tasks/WP04-rubric-surface.md`

**Goal**: `docs/rubric/spec-kitty-profile-taxonomy.md` (the normative source every non-schema finding cites), `docs/rubric/spec-kitty-behavioral-axes.md` (unblocks the downstream M4 mission with verbatim `rubricText` blocks), and the `sop-rule-taxonomy.md` v1.1 directive-mapping appendix.
**Priority**: P1 (no code dependency; builds in parallel with lane-a) · **Estimated prompt size**: ~320 lines
**Independent test**: all three documents exist at their specified paths with `status: normative` front matter matching the `memory-utilization-taxonomy.md` house style; `spec-kitty-behavioral-axes.md`'s `rubricText` blocks are well-formed enough for verbatim embedding.

- T021 `spec-kitty-profile-taxonomy.md` (WP04)
- T022 `spec-kitty-behavioral-axes.md` (WP04)
- T023 `sop-rule-taxonomy.md` v1.1 appendix (WP04)
- T024 Cross-check + reconcile against WP02's citations (WP04)

**Dependencies**: none from this mission's own build order (needs no code to exist first). WP02 depends on **it** in the same-mission-ordering sense described above, not as a lane dependency.
**Parallel**: T021/T022 are independent documents and can be drafted in parallel; T023 is independent of both; T024 must follow T021 (needs the final §-clause ids) and ideally follows WP02 landing (to reconcile real citation strings), but does not block WP02/WP03's own merge — it is a documentation-quality closeout, not a code gate.
**Risks**: `spec-kitty-behavioral-axes.md`'s `rubricText` blocks must be well-formed enough for the downstream M4 mission to embed verbatim inside `<RUBRIC>` tags with no further editing — a wording error here is a defect discovered downstream, in a different mission, so this deliverable needs its own careful review before the mission is called done.

## Dependency summary

```
WP01 ──▶ WP02 ──▶ WP03   (lane-a, sequential — one worktree per WP, computed by finalize-tasks)
WP04                     (lane-b, independent — no code dependency; same-mission ordering note only, see above)
```

## Acceptance traceability

| Acceptance / Constraint | WP delivering it |
|---|---|
| AC-1 (FR-008, Scenario 9 — clean example exits 0) | WP03 |
| AC-2 (FR-002..007, Scenarios 3–8 + 11 — per-check-class findings + discrimination control) | WP01 (schema), WP02 (handoff/reference/context-sources/identity), WP03 (projection + fixtures proving it) |
| AC-3 (C-001, Scenario 13 — NI-002 stays green) | WP01, WP02, WP03 (each WP's own verification gate) |
| AC-4 (C-002, Scenario 10 — byte-stable `--json` across repeated runs) | WP03 (`cli.test.ts`) |
| AC-5 (FR-010, Scenario 12 — rubric docs land with `status: normative`) | WP04 |
| Scenario 14 (exit code 2 — malformed `projectionManifestPath`) | WP03 |
| SC-002/SC-003 (every lint class has a passing + a broken fixture; the broken set fails as designed) | WP03 (fixture authoring + `fixtures.test.ts`) |
| SC-005 (rubric `rubricText` blocks usable verbatim by M4) | WP04 |
| SC-006 / C-001 (`src/core/` remains unmodified) | WP01, WP02, WP03 |
| Real-CLI verification against the real 18 SK profiles (binding operator directive) | WP03 (T020) |
