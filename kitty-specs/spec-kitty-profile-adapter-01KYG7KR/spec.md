# Feature Specification: Spec-Kitty Agent-Profile Static Conformance Adapter

**Mission**: `spec-kitty-profile-adapter-01KYG7KR` (mission_id `01KYG7KRMZ5WZ030A9ZND5E6N9`)
**Created**: 2026-07-27
**Status**: Draft
**Mission Type**: software-dev
**Milestone**: muster ⇄ Spec Kitty agent-conformance programme, wave 1 (M2) — parallel with M1, unblocks M4
**Input**: Add a spec-kitty agent-profile adapter behind muster's core: static conformance for `*.agent.yaml` — schema conformance citing the upstream schema pinned to a SHA, cross-profile lints muster does not have (handoff-graph resolution/symmetry, directive/tactic-reference resolution against the activation set, context-sources integrity, profile-id filename legality), and projection-drift verification against `.kittify/agent_profiles_manifest.json`. Ships the profile taxonomy rubric, the behavioral-axes rubric (unblocking M4), and the sop-rule-taxonomy directive-mapping appendix. Manifest-runner shaped, fully offline.
**Seeds**: GitHub issue `garrison-hq/muster#58` ([M2] spec-kitty-profile-adapter); `BRIEF.md`; the project charter; `src/adapters/memory-utilization/index.ts` (manifest-runner + factory + hand-wired CLI pattern this mission follows, D1 evidence).

---

## Overview

Spec Kitty agent profiles (`*.agent.yaml`) have a real, citable upstream schema (`agent-profile.schema.yaml`) but muster's own project already exercises cross-profile properties the schema alone cannot check: whether a `collaboration.handoff-to` role actually resolves to a profile that declares that role, whether a `directive-references`/`tactic-references` entry points at doctrine that exists (and is actually activated), whether `context-sources` point at real files, and whether the profile-id is a legal native filename. A fifth class — projection drift against `.kittify/agent_profiles_manifest.json` — independently re-verifies that the manifest SK's own `doctor` maintains still matches the source YAML and its projected `.claude/agents/<id>.md` output (only when `projectionManifestPath` is supplied; otherwise this class is skipped).

This mission adds a **spec-kitty-profile adapter** that plugs into muster's manifest-runner shape (the pattern `memory-utilization` established: factory + `run(manifest, {client})` returning an `AdapterResult`, with a hand-wired CLI command) rather than the `SpecAdapter` interface. This is a deliberate, evidence-backed choice (design decision **D1**, carried below): `SpecAdapter`/`ADAPTER_REGISTRY` is Soul-document shaped and serves only `muster check --adapter`; none of the three candidate profile artefacts (source YAML, the `.claude/agents/<id>.md` projection, `spec-kitty profiles show --json`) fit that registry, and the cross-profile lints this mission runs need fields that only the **source YAML** carries — the projection and the JSON view are both lossy relative to it.

The mission is entirely static and offline: it validates files on disk against a schema and a muster-published rubric, and never shells out to `spec-kitty` or operates a live agent. It ships three rubric documents under `docs/rubric/` that source-tag every check `[NORMATIVE]` / `[CONVENTION]` / `[MUSTER-OWN]`, following the `memory-utilization-taxonomy.md` precedent — the second of which (`spec-kitty-behavioral-axes.md`) is the hard, verbatim `rubricText` source for the downstream M4 behavioral-axes mission (garrison-hq programme; SK-side issue MOES-Media/spec-kitty#24), and the third of which is a v1.1 directive-mapping appendix over M3's already-normative directive classes.

## User Scenarios & Testing

### Primary User Stories

1. **Profile author (static conformance)**: As an author of a `*.agent.yaml` profile, I run muster against my profile set and get a pass/fail conformance report that names each violation by check class and field (schema violation, dangling handoff role, unresolved directive/tactic reference, missing context-source file, illegal or mismatched profile-id), so I can fix the profile set without manually cross-referencing every other profile in the set.
2. **Reviewer (projection drift)**: As a reviewer of a profile change, I run the adapter against a manifest that also declares `projectionManifestPath`, and learn whether the projected `.claude/agents/<id>.md` files and their manifest entries have drifted from the source YAML they were generated from — independent of whether SK's own `doctor` already caught it.
3. **Downstream rubric consumer (M4)**: As the author of the M4 behavioral-axes mission, I depend on this mission's `docs/rubric/spec-kitty-behavioral-axes.md` shipping with well-formed, citable `rubricText` blocks per profile axis (avoidance-boundary adherence, capability containment, handoff discipline, canonical-verb usage) before M4 can embed them verbatim in its `JudgeAssertion`s.

### Acceptance Scenarios

*(Post-spec-gate correction: AC-1..AC-5, cited by FR-008/FR-002..007/C-001/C-002/FR-010 and by SC-002, were previously undefined. Mapping to the scenarios below:)*

> AC-1 (FR-008) = Scenario 9; AC-2 (FR-002..007) = Scenarios 3–8 + 11; AC-3 (C-001) = new Scenario 13; AC-4 (C-002) = Scenario 10; AC-5 (FR-010) = Scenario 12.

#### Schema conformance

1. **Given** a manifest whose `profilesDir` contains only profiles that validate against the schema at `schemaPath`, **When** muster runs the adapter, **Then** the run reports zero schema findings and each finding's `source` records the schema path and its pinned SHA (there are none to report in this case, but the field shape is exercised by the negative fixture below).
2. **Given** a profile that violates the schema (e.g. a required field missing or a field of the wrong type), **When** checked, **Then** a schema-conformance finding is reported whose `source` cites `schemaPath` + the pinned SHA.

#### Cross-profile lints

3. **Given** a profile whose `collaboration.handoff-to`/`handoff-from`/`works-with` entry names a role, **When** at least one other profile in the set declares that role in `role`/`roles`, **Then** the handoff resolves cleanly; **When** no profile declares that role, **Then** an error finding is reported citing the taxonomy rubric's handoff-resolution clause.
4. **Given** profile A hands off to a role held by profile B but B does not declare a reciprocal hand-back to A's role, **When** checked, **Then** a warning (not an error) finding reports the asymmetry.
5. **Given** a `directive-references[].code` or `tactic-references[].id` that does not resolve to an existing doctrine file, **When** checked, **Then** an error finding is reported; **given** `activationConfigPath` is supplied and the reference resolves to doctrine that exists but is not in the activated set, **When** checked, **Then** a warning finding is reported instead of an error.
6. **Given** a `context-sources` entry (directive, tactic, toolguide, or styleguide) that does not exist on disk, **When** checked, **Then** an error finding is reported.
7. **Given** a profile-id that is not `^[a-z0-9-]+$`, exceeds 64 characters, or does not equal its YAML filename stem, **When** checked, **Then** an error finding is reported (the id is the literal `.claude/agents/<id>.md` filename stem, so mismatch is a hard native-filename violation, not a style nit).

#### Projection drift

8. **Given** a manifest that supplies `projectionManifestPath`, **When** muster recomputes each source YAML's `source_hash` and each `output_path`'s `file_hash` and compares them to the matching entry in the 9-field schema_version-1 manifest, **Then** a missing `output_path` is reported as an error and a hash mismatch (either `source_hash` or `file_hash`) is reported as a warning — mirroring SK doctor's own `native-agent-profile-missing`/`-drift` severities.

#### CLI

9. **Given** a well-formed manifest and profile set, **When** an operator runs `muster skprofile run examples/skprofile/manifest.yaml`, **Then** the process exits `0`.
10. **Given** the same command with `--json`, **When** run twice in a row with no source changes, **Then** the two stdout payloads are byte-identical.

#### Discrimination control

11. **Given** the rigged `fixtures/skprofile/broken/` profile set (a dangling handoff role, an unresolvable directive code, and a profile-id that does not equal its filename — at least one broken fixture per lint class), **When** muster runs `muster skprofile run fixtures/skprofile/broken-manifest.yaml --json`, **Then** the process exits `1` and the JSON output's findings include the expected finding kind for each rigged violation. A checker that reports `ok: true`/exit `0` on this fixture set is indistinguishable from a checker that never runs its lints, so this fixture set existing and failing is itself part of the adapter's contract, not merely a test convenience.

#### Rubric docs

12. **Given** the mission is complete, **When** the three rubric documents are inspected, **Then** each exists at its specified path with `status: normative` front matter matching the `memory-utilization-taxonomy.md` house style, and `spec-kitty-behavioral-axes.md` contains the verbatim `rubricText` blocks M4 will embed between `<RUBRIC>` tags.

#### Core-boundary invariant

13. **Given** the mission's implementation is complete, **When** an operator runs `pnpm test`, **Then** the suite passes, including `tests/unit/invariants.test.ts`'s NI-002 assertion that no `src/core/` file imports from `src/adapters/`.

#### CLI (exit code 2)

14. **Given** `projectionManifestPath` is set but that file does not parse, **When** `muster skprofile run <manifest>` runs, **Then** the process exits `2`.

### Edge Cases

- A manifest whose `activationConfigPath` is omitted: reference-lint findings for non-existent doctrine still error; there is no activated-set to compare against, so the warning-vs-error split in scenario 5 does not apply and every unresolved reference is an error.
- A handoff role held by more than one profile: the handoff resolves against **any** match; it is not required to be unique.
- Two profiles that legitimately share no handoff relationship: absence of a handoff entry is not itself a finding — only a *declared* entry that fails to resolve is.
- A profile-id that is legal in isolation but collides with another profile's id in the same `profilesDir`: reported as a distinct finding from the filename-mismatch check (both are id-legality concerns but are different violations).
- `projectionManifestPath` present but the manifest file itself does not parse or is missing entirely: the run errors (an errored run counts as a failed run — it is never silently skipped), per the charter's "errored run counts as a failed run" constraint.
- An `*.agent.yaml` file present in `profilesDir` but not referenced by any `cases[]` entry: still schema-checked and included in the cross-profile graph (handoff/reference resolution must see the whole profile set to be meaningful), even if no explicit case targets it individually.
- Upstream schema evolution: since `schemaPath` is pinned to a SHA recorded in the manifest's `schemaSha` field and mirrored in fixtures, an upstream schema change is a deliberate, reviewed version bump — never a silent behavior change underneath a fixed manifest.

## Requirements

### Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-001 | New adapter `src/adapters/spec-kitty-profile/` with manifest type `{version, profilesDir, schemaPath, schemaSha, activationConfigPath?, projectionManifestPath?, cases[]}`; paths relative to the manifest file. *(Post-spec-gate correction: `schemaSha` added to the manifest type to resolve an internal contradiction between the Edge Cases SHA-pinning statement and D1's `agent-profile.schema.yaml@<SHA>` evidence, neither of which had a manifest field to carry the SHA; see Dependencies & Assumptions.)* | Proposed |
| FR-002 | Schema conformance: each `*.agent.yaml` validates against the referenced agent-profile schema via Ajv; findings carry `source.normative` built from `schemaPath` + `schemaSha` into a resolvable upstream reference (e.g. `https://github.com/Priivacy-ai/spec-kitty/blob/<schemaSha>/src/doctrine/schemas/agent-profile.schema.yaml`), never a literal `@<SHA>` path segment. | Proposed |
| FR-003 | Handoff lint: every `collaboration.handoff-to`/`handoff-from`/`works-with` entry resolves to ≥1 profile whose `role`/`roles` contains it (these are role names, not profile-ids — e.g. architect hands to `planner, implementer`); unresolvable → error. Asymmetry (A→B without B←A) → warning. | Proposed |
| FR-004 | Reference lint: `directive-references[].code` and `tactic-references[].id` resolve to existing doctrine files; when `activationConfigPath` is given, references to non-activated doctrine → warning (muster's own project activates 19/26 directives — real-world case). | Proposed |
| FR-005 | `context-sources` integrity: listed directives/tactics/toolguides/styleguides exist on disk; missing → error. | Proposed |
| FR-006 | Profile-id legality: `^[a-z0-9-]+$`, ≤64, equals the YAML filename stem (it becomes `.claude/agents/<id>.md` — native-filename constraint). | Proposed |
| FR-007 | Projection drift: when `projectionManifestPath` is given, recompute `source_hash` of each source YAML and `file_hash` of each `output_path` and compare to the manifest entries (9-field schema_version-1 shape); missing output → error, hash drift → warning (mirroring SK doctor severities: `native-agent-profile-missing`/`-drift`). | Proposed |
| FR-008 | CLI: `muster skprofile run <manifest>` with global `--mode`/`--json`; exit 0/1/2 per house contract; hand-wired in `buildProgram()` like `memory-utilization` (`src/cli/index.ts:1717-1755` as the template). | Proposed |
| FR-009 | Every finding carries `source.normative` = the taxonomy rubric §clause, or the schema@SHA for FR-002. | Proposed |
| FR-010 | Rubric docs land: `docs/rubric/spec-kitty-profile-taxonomy.md`, `docs/rubric/spec-kitty-behavioral-axes.md`, sop-rule-taxonomy v1.1 appendix (D5 table — see Dependencies & Assumptions). | Proposed |

### Non-Functional Requirements

<!-- Author-added (NFR-001, NFR-002): not present in source issue garrison-hq/muster#58, which
     specifies no NFR-### rows. Both restate an existing C-### / AC as a measurable threshold,
     mirroring the exact convention already used by kitty-specs/memory-utilization-conformance-01KX1W65
     and kitty-specs/skills-adapter-01KTYKNX (each pairs a Constraints-table statement with a
     Non-Functional-Requirements-table measurable-threshold restatement). Evidence: NFR-001 restates
     C-002 and is directly the substance AC-4 proves; NFR-002 restates the repo's actual CI gate,
     already cited verbatim in AC-3 ("pnpm test" / NI-002) and identical in kind to NFR-004 (skills-adapter)
     and NFR-004 (memory-utilization). -->

| ID | Requirement | Threshold | Status |
|----|-------------|-----------|--------|
| NFR-001 | The static check path (schema, handoff, reference, context-sources, profile-id, and projection-drift lints) runs fully offline with byte-stable deterministic output. | Zero network calls; identical bytes across repeated runs and across machines for `muster skprofile run <manifest> --json`. | Proposed |
| NFR-002 | Type-check and test gates. | `tsc` strict passes; full Vitest suite green including the new `tests/skprofile/**` fixture suite; SonarCloud quality gate passes. | Proposed |

### Constraints

| ID | Constraint | Status |
|----|------------|--------|
| C-001 | `src/core/` untouched; no imports from core internals beyond the sanctioned surfaces; NI-002 stays green. | Proposed |
| C-002 | Fully offline, byte-stable deterministic output (BRIEF constraint 2); no clock reads. | Proposed |
| C-003 | No SK dependency: plain YAML/JSON file reading; the adapter never shells out to `spec-kitty`. | Proposed |
| C-004 | Fixtures are muster-local (a miniature profile set under `fixtures/skprofile/`), so muster CI never needs the SK repo. Where a muster-local vendored copy of the schema fixture exists, it records the upstream SHA it was vendored from (matching `schemaSha`). | Proposed |

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | A profile author can validate a `*.agent.yaml` profile set and receive a precise, per-check-class pass/fail report — schema, handoff, reference, context-sources, profile-id, projection-drift — without manually cross-referencing every other profile by hand. |
| SC-002 | Every lint class (FR-002 through FR-007) has at least one passing fixture and one intentionally-broken fixture that the harness catches, per the fixture suite proving AC-2. |
| SC-003 | The rigged discrimination fixture set (`fixtures/skprofile/broken/`) demonstrably fails the suite (exit 1) with the expected finding kinds — proving the checker discriminates rather than rubber-stamps. |
| SC-004 | The static path produces byte-identical `--json` output across repeated runs, with zero network calls. |
| SC-005 | The three rubric documents ship with `status: normative` front matter, and `spec-kitty-behavioral-axes.md`'s `rubricText` blocks are directly usable, verbatim, by the downstream M4 mission. |
| SC-006 | `src/core/` remains unmodified and `tests/unit/invariants.test.ts` NI-002 stays green. |

## Key Entities

- **Manifest**: `{version, profilesDir, schemaPath, activationConfigPath?, projectionManifestPath?, cases[]}` — the adapter's single input document; all paths resolve relative to the manifest file (FR-001).
- **Agent profile (`*.agent.yaml`)**: the source-of-truth YAML the adapter grades; the only one of the three candidate artefacts (source YAML, `.claude/agents/<id>.md` projection, `spec-kitty profiles show --json`) that is not lossy for cross-profile lint purposes (D1).
- **Handoff graph**: the set of `collaboration.handoff-to`/`handoff-from`/`works-with` role-name edges across the profile set; resolved against declared `role`/`roles`, with asymmetry as a distinct (warning-level) property from unresolvability (error-level).
- **Reference lint target**: a `directive-references[].code` or `tactic-references[].id` resolved first against existence on disk, then (when an activation config is supplied) against the activated subset.
- **Projection-drift record**: a 9-field schema_version-1 entry in `.kittify/agent_profiles_manifest.json` pairing a source YAML's `source_hash` with an `output_path`'s `file_hash`; the adapter recomputes and re-verifies both independently of SK's own `doctor`.
- **Finding**: a single conformance result carrying a check class, severity (error/warning), and `source.normative` — either a taxonomy-rubric §clause or, for schema findings, the schema path + pinned SHA (FR-009).
- **Rubric surface**: the three `docs/rubric/` documents this mission ships (profile taxonomy, behavioral axes, sop-rule-taxonomy v1.1 appendix) — see Dependencies & Assumptions for what each defines and who cites it.

## Dependencies & Assumptions

- **Depends on**: nothing outside this mission (wave 1, parallel with M1 — different repo). Reuses muster's existing manifest-runner conventions (`memory-utilization` adapter shape) and CLI wiring pattern only; does not depend on any core enhancement.
- **Unblocks**: M4 (garrison-hq programme; SK-side issue MOES-Media/spec-kitty#24) hard-depends on this mission's `docs/rubric/spec-kitty-behavioral-axes.md` as the verbatim `rubricText` source for its `JudgeAssertion`s. M3 (MOES-Media/spec-kitty#23) is not blocked on the sop-rule-taxonomy v1.1 appendix — that mission cites the already-normative v1.0.0 directive classes; the appendix is author guidance only.
- **Rubric surface (D5)**: `docs/rubric/spec-kitty-profile-taxonomy.md` normatively defines every M2 check class (schema-conformance delegating to `agent-profile.schema.yaml@<SHA>`, handoff-graph resolution/symmetry semantics including the role-vs-profile-id typing, doctrine-reference resolution vs the activation set, `context-sources` integrity, profile-id-as-native-filename legality, projection-drift semantics), tagged `[NORMATIVE]`/`[CONVENTION]`/`[MUSTER-OWN]` following `memory-utilization-taxonomy.md`. `docs/rubric/spec-kitty-behavioral-axes.md` defines what "behaved correctly" means per profile axis (avoidance-boundary adherence, capability containment, handoff discipline, canonical-verb usage) — needed by M2's own ship date, ahead of M4's need for it. `docs/rubric/sop-rule-taxonomy.md`'s v1.1 appendix adds the directive-mapping guidance (which directive fields become `ruleText`, decidability mapping onto the existing 5 binary + 2 judge classes, `source.supporting` citation format) without altering the already-normative v1.0.0 classes.
- **Design decision D1 (why not `SpecAdapter`)**: the three candidate artefacts are all lossy except the source YAML — the `.claude/agents/<id>.md` projection keeps only name/description/roles + purpose + primary-focus + avoidance-boundary, and `spec-kitty profiles show --json` omits capabilities, routing-priority, context-sources, output-artifacts, and operating-procedures. Cross-profile lints need fields only the source YAML carries. The `SpecAdapter`/`ADAPTER_REGISTRY` surface serves only `muster check --adapter` over Soul documents; the newest adapter (`memory-utilization`, shipped 2026-07-09) already skips `SpecAdapter` entirely in favor of manifest-runner + factory + hand-wired CLI, and RFC-1's required front-matter keyspace (voice/interaction enums) does not exist in an agent profile at all. The projector artefact is explicitly deferred to M7 (MOES-Media/spec-kitty#26): it will live in the SK fork's own conformance tooling, its fabricated defaults published in a mapping document, and its output used only to satisfy a composition-slot type — fabricated fields are never themselves graded by this or any mission.
- **Design decision (post-spec-gate: schema SHA-pinning mechanism)**: the manifest carries a `schemaSha` field (added to FR-001) recording the SHA that the pinned `agent-profile.schema.yaml` was vendored from; `source.normative` for schema findings is built from `schemaPath` + `schemaSha` into a resolvable upstream reference, never a literal `@<SHA>` path segment. Rejected alternative: embedding the SHA in the schema file's own `$comment`, rejected because it would require muster to read Spec Kitty file internals to learn provenance — violating the operator's binding principle that muster must not be tightly coupled to SK — and because it would trust SK's self-description instead of recording what muster actually verified against. The chosen shape matches existing house precedent: the SOP rule manifest already pins `source.supporting` to a commit SHA (`src/adapters/openclaw-sop/manifest.ts:35-68`, C-002).
- **Deferred vocabulary note**: the finding-kind vocabulary for the discrimination control (Scenario 11) is undefined in this spec by design; it is WP04's deliverable in `spec-kitty-profile-taxonomy.md`, and WP04 must produce it before WP02 can assert against it.
- **Internal authoring-order note** (not a lane dependency): WP02's lint finding text quotes rubric clauses WP04 defines, so WP04's rubric drafts must exist before WP02's finding text is finalized — to be encoded as a same-mission ordering note, not a cross-lane `depends_on_lanes` edge, when tasks are materialized.
- **Assumption**: handoff role names are genuinely typed as roles (`role`/`roles`), not profile-ids — this is muster's own interpretive reading of the collaboration fields (flagged `[MUSTER-OWN]` in the rubric), mitigated by treating asymmetry as a warning rather than an error.
- **Assumption**: overlapping coverage with SK's own `doctor` command (which already performs some projection-drift and reference-resolution checking) is deliberate — independent re-verification inside muster catches SK-doctor regressions; the rubric documents this overlap explicitly rather than treating it as redundant.
- **Known cross-mission concurrency note**: `src/cli/index.ts` is touched by both this mission and M5 (garrison-hq/muster#59) in the same repo; this is a normal cross-mission file-collision to be sequenced or rebased through the ordinary mission-merge flow, not a specification-level blocker or ambiguity.
- **Out of scope** (scope guard, carried from the issue): any behavioral checks (that is M4's domain, once the rubric surface ships); the projector (M7); grading the *content* of the projected markdown (only hash-drift vs the manifest, never content correctness); any changes to the Spec Kitty repository itself; a `SpecAdapter` implementation or an `ADAPTER_REGISTRY` entry; validating the doctrine (directives/tactics) files themselves (M3's domain — this mission only checks that references *resolve*, not that the referenced doctrine is well-formed).

## Scope Guard (carried from BRIEF.md)

Not an agent framework or runtime; not a prompt optimizer or generator; not a registry; not a hosted service. CLI + CI exit codes only.
