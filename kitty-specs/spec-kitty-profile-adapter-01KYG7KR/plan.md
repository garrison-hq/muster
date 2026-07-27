# Implementation Plan: Spec-Kitty Agent-Profile Static Conformance Adapter

**Branch**: `kitty/mission-spec-kitty-profile-adapter-01KYG7KR` | **Date**: 2026-07-27 | **Spec**: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/spec.md`
**Input**: Feature specification from `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/spec.md`; research base `research.md`; entities `data-model.md`.

**Branch contract**: current branch, planning/base branch, and merge target
are all the same branch — `kitty/mission-spec-kitty-profile-adapter-01KYG7KR`
(confirmed via `spec-kitty agent mission setup-plan --json`:
`branch_matches_target: true`). This mission's implementation and merge both
land on this branch; there is no separate integration branch.

## Summary

Add a **manifest-runner-shaped** `spec-kitty-profile` adapter
(`src/adapters/spec-kitty-profile/`) that statically validates Spec Kitty
agent-profile YAML (`*.agent.yaml`) against six independent check classes —
schema conformance (Ajv2020 against a SHA-pinned upstream schema), handoff-
graph resolution/symmetry, doctrine-reference resolution against an optional
activation set, `context-sources` on-disk integrity, profile-id-as-native-
filename legality, and projection-drift re-verification against
`.kittify/agent_profiles_manifest.json` (skipped when not supplied). It is
entirely static and offline: no `ChatClient`, no behavioral half, no upstream
SK dependency — plain YAML/JSON file reads only (C-002/C-003). It follows
`memory-utilization`'s factory + `run(manifest, options)` → `AdapterResult`
shape and hand-wired CLI pattern (D1), explicitly **not** `SpecAdapter`/
`ADAPTER_REGISTRY`. It ships three rubric documents under `docs/rubric/`
(profile taxonomy, behavioral axes for the downstream M4 mission, and a
sop-rule-taxonomy v1.1 directive-mapping appendix).

## Technical Context

**Language/Version**: TypeScript 5.x on Node 22+ (strict `tsc`)
**Primary Dependencies**: `ajv` (`^8.17.1`, already a muster dependency) via
its `ajv/dist/2020` entry point — the upstream schema declares `$schema:
.../draft/2020-12/schema` (research.md R4), matching the same default-interop
pattern `src/adapters/openclaw-sop/manifest.ts` already uses for draft-07;
`yaml` (`^2.8.2`, already a dependency) to parse `*.agent.yaml` and the
activation-config YAML; Node's built-in `node:crypto` (`createHash("sha256")`)
for projection-drift hashing (research.md R5) — no new numerical or network
dependency.
**Storage**: files only — `fixtures/skprofile/`, `docs/rubric/`,
`examples/skprofile/`. No DB, no network.
**Testing**: Vitest — unit tests per check module against hand-authored
fixture profiles; a fixture-driven discrimination-control suite
(`fixtures/skprofile/broken/`) proving every lint class can fail (SC-002/
SC-003); a CLI end-to-end suite asserting the 0/1/2 exit-code contract and
byte-stability (AC-4). No mock `ChatClient` needed anywhere — there is no
behavioral half to mock.
**Target Platform**: Node 22 CLI + CI exit codes.
**Project Type**: single project (the muster package).
**Performance Goals**: fully offline, byte-stable, deterministic
(NFR-001); O(n·m) in profile count × doctrine-file count for reference
resolution — negligible at the scale of a few dozen profiles and a few
hundred doctrine files (muster's own project: 18 profiles, ~26 directives).
**Constraints**: spec-agnostic core untouched (C-001, NI-002); no clock
reads anywhere in the static path; every check cites a normative source
(FR-009) — the pinned upstream schema URL for FR-002, muster's own published
rubric (`docs/rubric/spec-kitty-profile-taxonomy.md`) for FR-003..007; every
new lint class ships a rigged-impossible discrimination fixture (C-004,
SC-003); never shells out to `spec-kitty`, never imports from it (C-003).
**Scale/Scope**: one new adapter (11 modules under
`src/adapters/spec-kitty-profile/`, see Project Structure) plus additive
wiring in the two existing CLI-layer files (`src/cli/index.ts`,
`src/cli/output.ts`) — *(post-plan-gate correction: previously stated as "12
modules," which conflated the 11 new adapter-directory modules with the
CLI-layer wiring; reconciled here so the tasks phase does not propagate the
wrong count into a work-package scope line)* — three published rubric
documents, one fixture suite (clean + broken + muster-local vendored
doctrine tree), one runnable example, one CLI command group
(`skprofile run`).

## Charter Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Spec-agnostic core / adapter boundary** (C-001) — PASS: every SK-specific
  concept (agent-profile schema, handoff roles, directive/tactic codes,
  activation config, projection manifest) lives entirely in
  `src/adapters/spec-kitty-profile/`; `src/core/` is not touched at all.
  *(Post-plan-gate correction: NI-002 (`tests/unit/invariants.test.ts`)
  mechanically enforces only C-001 — it scans `src/core/**` and asserts no
  line contains the literal `"adapters"`; it does not scan
  `src/adapters/spec-kitty-profile/` for imports from `src/core/`. This
  plan's stronger claim — that the adapter needs *no* core surface
  whatsoever (no behavioral runner, no `ChatClient`), unlike
  `memory-utilization`'s "additive core changes only" bar — is an
  aspirational design target this mission holds itself to, not a target
  NI-002 mechanically verifies. AC-3/Scenario 13 correctly cite NI-002 only
  for the C-001 direction it does enforce.)*
- **Offline & deterministic static path** (C-002) — PASS: every check is a
  file read + comparison; no clock reads; `--json` output is byte-stable
  across repeated runs on one machine (research.md R5 notes the one
  necessary carve-out: the real, machine-specific
  `.kittify/agent_profiles_manifest.json` used for the mandatory real-CLI
  demonstration is not claimed byte-stable *across machines*, only across
  repeated runs on the same machine — the muster-local fixture suite that
  the automated byte-stability test (AC-4) actually asserts against has no
  such carve-out).
- **BYOM, no baked-in providers** — N/A: this capability has no behavioral
  half at all; nothing to configure.
- **k-of-n / pass^k, errored=failed** — reinterpreted for a static-only
  capability (research.md data-model `AgentProfile.parseError`): a profile
  that fails to parse never silently disappears from the run — it surfaces
  as a `profile-parse-error` finding (error severity), same "errored counts
  as failed" spirit BRIEF.md's carried-over constraint 4 states for
  behavioral runs.
- **Cite a normative source** (FR-009) — PASS: FR-002 schema findings cite
  the pinned upstream schema URL (`schemaPath`+`schemaSha`, research.md R7);
  every other check class cites `docs/rubric/spec-kitty-profile-taxonomy.md`
  §clause (WP04's deliverable, referenced by module in
  `rubric.ts` — same-mission ordering note: WP02 finalizes citation text only
  after WP04's drafts exist, per spec.md Dependencies & Assumptions).
- **Discrimination controls** (C-004) — PASS: `fixtures/skprofile/broken/`
  rigs at least one violation per lint class (SC-002); the suite asserting
  it fails (exit 1, expected finding kinds present) is itself part of the
  adapter's contract, not a test convenience (Scenario 11).
- **Scope guard** — PASS: no behavioral checks (M4's domain once the rubric
  ships), no projector (M7), no grading of projected-markdown *content*
  (only hash-drift), no SK-repo changes, no `SpecAdapter`/`ADAPTER_REGISTRY`
  entry (D1), no doctrine-content validation (M3's domain — this mission only
  checks that references *resolve*).

No violations → Complexity Tracking empty.

## Project Structure

### Documentation (this mission)

```
kitty-specs/spec-kitty-profile-adapter-01KYG7KR/
├── plan.md              # This file
├── research.md          # Phase 0 output — 9 design-call resolutions (R1..R9)
├── data-model.md         # Phase 1 output — entities, exit-code contract
├── quickstart.md         # Phase 1 output — build/test/run/verify walkthrough
├── contracts/            # Phase 1 output
│   ├── spec-kitty-profile-manifest.schema.json
│   └── spec-kitty-profile-report.schema.json
└── tasks.md              # Phase 2 output (/spec-kitty.tasks — NOT created here)
```

### Source Code (repository root)

```
src/
├── adapters/
│   └── spec-kitty-profile/        # NEW adapter (behind the boundary)
│       ├── manifest.ts              # SkProfileManifest/SkProfileCase types + validateManifest
│       ├── profile.ts               # AgentProfile parsing (yaml) + profile-set loader
│       ├── schema.ts                # FR-002: Ajv2020 schema conformance
│       ├── handoff.ts               # FR-003: handoff-graph resolution + symmetry
│       ├── references.ts            # FR-004: directive/tactic reference + activation lint
│       ├── context-sources.ts       # FR-005: context-sources on-disk integrity
│       ├── identity.ts              # FR-006: profile-id legality/filename/collision
│       ├── projection.ts            # FR-007: projection-drift re-verification
│       ├── findings.ts              # SkProfileFinding + kind vocabulary + err()/warn()
│       ├── rubric.ts                # rubric doc path + source.normative citation constants
│       └── index.ts                 # SpecKittyProfileAdapter (factory + run())
└── cli/
    ├── index.ts                    # + `skprofile run` subcommand (FR-008), hand-wired
    └── output.ts                   # + formatSkProfileResultHuman (Soul/CTS/A2A precedent)

docs/rubric/
├── spec-kitty-profile-taxonomy.md    # NEW (WP04) — normative source for all M2 checks
├── spec-kitty-behavioral-axes.md     # NEW (WP04) — unblocks downstream M4
└── sop-rule-taxonomy.md              # AMENDED (WP04) — v1.1 directive-mapping appendix

fixtures/skprofile/
├── clean/*.agent.yaml                # small legal profile set exercising every pass path
├── broken/*.agent.yaml                # rigged discrimination fixtures — ≥1 per lint class (SC-002)
├── doctrine/{directives,tactics,toolguides,styleguides}/  # muster-local vendored doctrine tree (C-004)
├── agent-profile.schema.yaml          # vendored schema fixture, records its upstream schemaSha
├── manifest.yaml                      # clean-fixture manifest
├── broken-manifest.yaml               # rigged-broken manifest (AC-2, Scenario 11)
└── activation-config.yaml             # sample activation config exercising the FR-004 warning path

examples/skprofile/
└── manifest.yaml                      # runnable example (AC-1, Scenario 9) + its own small profile/doctrine copy

tests/skprofile/
├── manifest.test.ts
├── schema.test.ts
├── handoff.test.ts
├── references.test.ts
├── context-sources.test.ts
├── identity.test.ts
├── projection.test.ts
├── fixtures.test.ts                   # discrimination-control suite (SC-002/SC-003)
└── cli.test.ts                        # exit-code 0/1/2 + byte-stability (AC-4)
```

**Structure Decision**: single project, following the `skills` adapter's
directory conventions exactly (`fixtures/skprofile/`, `examples/skprofile/`,
`tests/skprofile/` at repo-top-level — not `tests/fixtures/skprofile/` as
`memory-utilization` uses), per the source issue's own lane `write_scope`.
All SK-specific knowledge lives in `src/adapters/spec-kitty-profile/`; the
three rubric documents are the cited source of record for every non-schema
check.

## Complexity Tracking

*No Charter Check violations — section intentionally empty.*

## Implementation Concern Map

> Concerns, not work packages. `/spec-kitty.tasks` maps these to WPs. This
> map is written to line up 1:1 with the four WPs the source issue (garrison-
> hq/muster#58 §6) already names, to make `/spec-kitty.tasks` a
> near-mechanical translation.

### IC-01 — Manifest + profile loading + schema conformance

- **Purpose**: the data layer every other check depends on — manifest
  parsing/validation (with the `doctrineRoot` field this plan adds,
  research.md R2), `*.agent.yaml` loading into `AgentProfile[]`
  (parse-error-tolerant), and FR-002's Ajv2020 schema-conformance check
  against the SHA-pinned vendored schema.
- **Relevant requirements**: FR-001, FR-002, FR-009 (schema citation half).
- **Affected surfaces**: `src/adapters/spec-kitty-profile/manifest.ts`,
  `profile.ts`, `schema.ts`, `findings.ts`.
- **Sequencing/depends-on**: none (foundation).
- **Risks**: Ajv2020 import path (`ajv/dist/2020`, not default `Ajv`) is an
  easy miss given the schema's `$schema: draft/2020-12` header — verified in
  research.md R4, must be exercised by a unit test that would fail loudly
  under plain `Ajv`.

### IC-02 — Cross-profile lints (handoff, reference, context-sources, identity)

- **Purpose**: the four graph-wide/file-existence checks that make this
  adapter more than a schema validator — FR-003..006.
- **Relevant requirements**: FR-003, FR-004, FR-005, FR-006, FR-009 (rubric
  citation half).
- **Affected surfaces**: `src/adapters/spec-kitty-profile/handoff.ts`,
  `references.ts`, `context-sources.ts`, `identity.ts`, `rubric.ts`.
- **Sequencing/depends-on**: IC-01 (needs `AgentProfile[]`). **Same-mission
  ordering note** (not a lane dependency, per spec.md Dependencies &
  Assumptions): this concern's finding *text* quotes `docs/rubric/
  spec-kitty-profile-taxonomy.md` §clauses that IC-04/WP04 authors — IC-04's
  rubric drafts must exist before this concern's citation strings are
  finalized, even though IC-02 and IC-04 sit in different lanes with no
  `depends_on_lanes` edge between them.
- **Risks**: the role-vs-profile-id handoff typing is muster's own
  interpretive reading (`[MUSTER-OWN]` in the rubric) — mitigated by treating
  asymmetry as warning, not error, exactly as spec.md requires.
- **Resolved behavior (post-plan-gate correction — was previously an
  accepted risk, now closed)**: the activation-config format decision
  (research.md R3, "state clearly which shape is read") means a project
  using the unverified nested `charter.yaml` shape presents valid-but-
  unrecognized YAML at `activationConfigPath`. Rather than letting this
  silently degrade every reference to activation-blind with no signal, the
  adapter validates the parsed top-level YAML exposes at least one of
  `activated_directives`/`activated_tactics`; when neither is present it
  emits a dedicated `activation-config-unrecognized-shape` finding
  (warning, once per run), distinct from a recognized-but-genuinely-empty
  activation config. Spec-kitty's own repo is mid-migration between these
  two shapes, so this is expected to occur in practice, not a hypothetical
  edge case.

### IC-03 — Projection drift + CLI + fixtures/examples

- **Purpose**: FR-007's independent re-verification against
  `.kittify/agent_profiles_manifest.json`; the `muster skprofile run`
  command (FR-008) with the 0/1/2 exit-code contract; the fixture set
  (clean + broken + vendored doctrine tree) and the runnable example.
- **Relevant requirements**: FR-007, FR-008, C-004, SC-001..004.
- **Affected surfaces**: `src/adapters/spec-kitty-profile/projection.ts`,
  `index.ts`; `src/cli/index.ts`, `src/cli/output.ts`;
  `fixtures/skprofile/**`, `examples/skprofile/**`, `tests/skprofile/**`.
- **Sequencing/depends-on**: IC-01, IC-02 (needs the full finding set to
  wire exit codes and to author fixtures that exercise every kind). **Real-
  CLI verification is mandatory** (operator directive, quickstart.md §6):
  `pnpm build` then `muster skprofile run` against muster-local fixtures
  (clean → 0, broken → 1) **and** at least once against the actual 18 SK
  profiles at `/home/jeroennouws/dev/spec-kitty-conformance/src/doctrine/
  agent_profiles/built-in/` — exit codes 0, 1, and 2 must each be observed,
  not assumed.
- **Risks**: the real projection manifest bakes in absolute, machine-
  specific paths (research.md R5) — the byte-stability test (AC-4) must
  target the muster-local fixture manifest, never the real one, or it will
  be flaky by construction.

### IC-04 — Published rubric surface

- **Purpose**: `docs/rubric/spec-kitty-profile-taxonomy.md` (normative
  source for every M2 check class, `[NORMATIVE]/[CONVENTION]/[MUSTER-OWN]`
  tagged per `memory-utilization-taxonomy.md`'s house style),
  `docs/rubric/spec-kitty-behavioral-axes.md` (unblocks M4 — verbatim
  `rubricText` blocks between `<RUBRIC>` tags), and the `sop-rule-taxonomy.md`
  v1.1 directive-mapping appendix (author guidance over the already-normative
  v1.0.0 classes).
- **Relevant requirements**: FR-010, FR-009 (source for IC-02's citations).
- **Affected surfaces**: `docs/rubric/spec-kitty-profile-taxonomy.md`,
  `docs/rubric/spec-kitty-behavioral-axes.md`, `docs/rubric/sop-rule-
  taxonomy.md`.
- **Sequencing/depends-on**: none from this mission's own build order (it
  needs no code to exist first) — but IC-02 depends on **it**, in the
  same-mission ordering sense above, not a lane dependency. Lane-b
  (`docs/rubric/**`) and lane-a (`src/adapters/spec-kitty-profile/**`,
  `src/cli/**`, `tests/skprofile/**`, `fixtures/skprofile/**`,
  `examples/skprofile/**`) have disjoint `write_scope`s — no file collision
  between the two lanes.
- **Risks**: `spec-kitty-behavioral-axes.md`'s `rubricText` blocks must be
  well-formed enough for M4 to embed verbatim inside `<RUBRIC>` tags with no
  further editing — a wording error here is a defect discovered downstream,
  in a different mission, so this deliverable needs its own careful review
  before the mission is called done.
