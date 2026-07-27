---
work_package_id: WP02
title: Cross-profile lints (handoff, reference, context-sources, identity)
dependencies:
- WP01
requirement_refs:
- C-001
- C-002
- C-003
- FR-003
- FR-004
- FR-005
- FR-006
- FR-009
- NFR-001
- NFR-002
planning_base_branch: kitty/mission-spec-kitty-profile-adapter
merge_target_branch: kitty/mission-spec-kitty-profile-adapter
branch_strategy: Planning artifacts for this mission were generated on kitty/mission-spec-kitty-profile-adapter. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into kitty/mission-spec-kitty-profile-adapter unless the human explicitly redirects the landing branch.
subtasks:
- T007
- T008
- T009
- T010
- T011
- T012
- T013
phase: Phase 2 - Cross-profile lints
history:
- timestamp: '2026-07-26T23:43:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
agent_profile: node-norris
authoritative_surface: src/adapters/spec-kitty-profile/
create_intent:
- src/adapters/spec-kitty-profile/handoff.ts
- src/adapters/spec-kitty-profile/references.ts
- src/adapters/spec-kitty-profile/context-sources.ts
- src/adapters/spec-kitty-profile/identity.ts
- src/adapters/spec-kitty-profile/rubric.ts
- tests/skprofile/handoff.test.ts
- tests/skprofile/references.test.ts
- tests/skprofile/context-sources.test.ts
- tests/skprofile/identity.test.ts
execution_mode: code_change
model: ''
owned_files:
- src/adapters/spec-kitty-profile/handoff.ts
- src/adapters/spec-kitty-profile/references.ts
- src/adapters/spec-kitty-profile/context-sources.ts
- src/adapters/spec-kitty-profile/identity.ts
- src/adapters/spec-kitty-profile/rubric.ts
- tests/skprofile/handoff.test.ts
- tests/skprofile/references.test.ts
- tests/skprofile/context-sources.test.ts
- tests/skprofile/identity.test.ts
role: implementer
tags: []
task_type: implement
tracker_refs: []
---

# Work Package Prompt: WP02 — Cross-profile lints

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

Implement the four graph-wide/file-existence checks that make this adapter
more than a schema validator — handoff-graph resolution/symmetry (FR-003),
doctrine-reference resolution against an optional activation set (FR-004),
`context-sources` on-disk integrity (FR-005), and profile-id-as-native-
filename legality (FR-006) — plus the `rubric.ts` module every one of them
cites for `source.normative` (FR-009's rubric-citation half).

This WP depends on **WP01** (`src/adapters/spec-kitty-profile/manifest.ts`,
`profile.ts`, `findings.ts` must already exist and be mergeable). Do not
start until WP01 is available on your base branch.

## Context (read first)

- Spec: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/spec.md` — FR-003,
  FR-004, FR-005, FR-006, FR-009 (rubric-citation half); the Edge Cases
  section (dangling roles, non-unique handoff holders, profile-id collision,
  the "activationConfigPath omitted → every unresolved reference is an
  error" rule).
- Plan: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/plan.md` — IC-02
  ("Cross-profile lints"), including its **resolved** post-plan-gate note on
  the activation-config shape-validation loud-failure path.
- Data model: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/data-model.md`
  — `HandoffEdge`, `ReferenceTarget`, `ContextSource` (conceptual entities),
  and the module→entity ownership table.
- Research: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/research.md` —
  **R2** (the `doctrineRoot` resolution algorithm and filename-match table —
  this is the single most load-bearing table in this WP, read it twice), R3
  (activation-config format, the prefix/exact-match rules, and the
  shape-validation loud-failure decision), R6 (finding-kind vocabulary draft
  — your starting point for citation text).
- Upstream ground truth already verified by research.md R2 (you do not need
  to re-verify, but may want to look): a real doctrine tree lives at
  `/home/jeroennouws/dev/spec-kitty-conformance/src/doctrine/` with sibling
  `directives/built-in/`, `tactics/built-in/**` (recursive), `toolguides/
  built-in/`, `styleguides/built-in/` directories, and a real activation
  config at this repo's own `.kittify/config.yaml`.
- Rubric precedent: `docs/rubric/sop-rule-taxonomy.md` and
  `docs/rubric/memory-utilization-taxonomy.md` (house style for
  `[NORMATIVE]`/`[CONVENTION]`/`[MUSTER-OWN]` tagging and `status: normative`
  front matter) — WP04 (parallel, different lane) is authoring
  `docs/rubric/spec-kitty-profile-taxonomy.md` to this same house style; you
  are consuming its §-clause ids, not authoring the document itself.

**Hard rules for the whole WP** (from spec + charter):

1. Touch ONLY the files in `owned_files`. `docs/rubric/**` is WP04's; CLI
   wiring is WP03's; fixture/example authoring is WP05's (split out of the
   original WP03 by the post-tasks adversarial-gate review).
2. Every finding you emit must carry a non-empty `source.normative` pointing
   at a `docs/rubric/spec-kitty-profile-taxonomy.md` §-clause string (never a
   schema URL — that is WP01's `schema.ts` only).
3. **Same-mission ordering note** (spec.md Dependencies & Assumptions,
   plan.md IC-02 — this is not a lane dependency, it is an authoring-order
   concern inside this WP's own T007): the citation *text* in `rubric.ts`
   should quote real §-clause ids from WP04's
   `docs/rubric/spec-kitty-profile-taxonomy.md`. If that document does not
   yet exist in your worktree when you reach T007, use research.md R6's
   draft §-area table as a placeholder (e.g. `"§handoff-resolution (draft —
   pending WP04)"`), record this explicitly as an open item in this file's
   Activity Log, and do not block your own WP on WP04's landing — WP04 will
   reconcile the wording in its own T024 closeout pass. Do not silently ship
   an empty or generic citation string; a placeholder that says it is a
   placeholder is acceptable, a placeholder that looks finished is not.
4. Do not parse or validate the *content* of doctrine files (directive/tactic
   YAML) — only check that a referenced file **exists** by filename match.
   Content validation is M3's domain (out of scope, per spec.md).
5. Never call `fs.exists`/attempt a read on a path that has already escaped
   `doctrineRoot` via `..` segments — resolve lexically first (same
   path-traversal discipline as the `skills` adapter's `layout.ts`).

## Subtasks

### T007 — `rubric.ts`: citation-constant module

**Purpose**: the single place every lint module in this WP (and WP03's
`projection.ts`) imports its `source.normative` string from — never
inline a citation string in a check module directly.

**Steps**:

1. Create `src/adapters/spec-kitty-profile/rubric.ts`.
2. Export the rubric doc path constant:
   ```ts
   export const RUBRIC_DOC_PATH = "docs/rubric/spec-kitty-profile-taxonomy.md";
   ```
3. Export one named citation-string constant per non-schema, non-structural
   finding kind (everything in `SkProfileFindingKind` except
   `schema-conformance-violation`, which cites the schema URL, not this
   file, and `profile-parse-error`, which is structural — WP03's `index.ts`
   emits it with a fixed, non-rubric literal string instead, per its own
   T015; do **not** add a `profile-parse-error` entry here, and do not widen
   the `Exclude<...>` back down to reintroduce it):
   ```ts
   export const RUBRIC_CITATION: Record<
     Exclude<SkProfileFindingKind, "schema-conformance-violation" | "profile-parse-error">,
     string
   > = {
     "handoff-unresolved": `${RUBRIC_DOC_PATH}#handoff-resolution`,
     "handoff-asymmetric": `${RUBRIC_DOC_PATH}#handoff-symmetry`,
     "reference-unresolved": `${RUBRIC_DOC_PATH}#doctrine-reference-resolution`,
     "reference-not-activated": `${RUBRIC_DOC_PATH}#doctrine-reference-activation`,
     "activation-config-unrecognized-shape": `${RUBRIC_DOC_PATH}#doctrine-reference-activation`,
     "context-source-missing": `${RUBRIC_DOC_PATH}#context-sources-integrity`,
     "profile-id-illegal": `${RUBRIC_DOC_PATH}#profile-id-legality`,
     "profile-id-filename-mismatch": `${RUBRIC_DOC_PATH}#profile-id-legality`,
     "profile-id-collision": `${RUBRIC_DOC_PATH}#profile-id-legality`,
     "projection-output-missing": `${RUBRIC_DOC_PATH}#projection-drift`,
     "projection-hash-drift": `${RUBRIC_DOC_PATH}#projection-drift`,
   };
   ```
   The exact anchor slugs (`#handoff-resolution`, etc.) are a first draft —
   align them with WP04's actual heading ids once
   `docs/rubric/spec-kitty-profile-taxonomy.md` exists (same-mission
   ordering note above). Keep the `Record<...>` type so a future missing
   entry is a compile error, not a silent `undefined`.
4. Export a small helper `citationFor(kind): string` that indexes the map
   (neither the schema kind nor `profile-parse-error` is representable —
   calling it with `"schema-conformance-violation"` or `"profile-parse-
   error"` should be a type error at the call site, which the
   `Exclude<...>` type already guarantees).

**Files**: `src/adapters/spec-kitty-profile/rubric.ts`

**Validation**: `pnpm build` compiles; T012 asserts every non-schema,
non-structural finding kind has a resolvable, non-empty citation.

---

### T008 — `handoff.ts`: handoff-graph resolution + symmetry

**Purpose**: FR-003 — `collaboration.handoff-to`/`handoff-from`/`works-with`
are **role names**, not profile-ids (verified: `architect-alphonso` hands off
to `planner`, `implementer`, both role names — this is muster's own
interpretive reading, flagged `[MUSTER-OWN]` in the rubric).

**Steps**:

1. Create `src/adapters/spec-kitty-profile/handoff.ts`.
2. Export `checkHandoffs(profiles: readonly AgentProfile[]): SkProfileFinding[]`.
3. **Resolution** (data-model.md `HandoffEdge`): for each profile `A` and
   each role `r` in `A.handoffTo ∪ A.handoffFrom ∪ A.worksWith`, resolve iff
   at least one *other* profile `B` (`B !== A`) has `r` in `B.roles`. A role
   held by more than one profile resolves against **any** match (spec.md
   edge case — not required to be unique). Unresolved →
   `err("handoff-unresolved", A.profileId, "collaboration.<field>[<i>]",
   <message>, RUBRIC_CITATION["handoff-unresolved"])`.
4. **Symmetry** (`handoff-to` only, against `handoff-from` — `works-with` has
   no symmetric counterpart per spec.md): for each role `r` in
   `A.handoffTo` that *does* resolve to holder set `{B}`, symmetry holds iff
   **at least one** `B` has any of `A.roles` in `B.handoffFrom`. If none
   reciprocate → `warn("handoff-asymmetric", A.profileId,
   "collaboration.handoff-to[<i>]", <message>,
   RUBRIC_CITATION["handoff-asymmetric"])`.
5. Absence of a declared entry (empty `handoffTo`/`handoffFrom`/`worksWith`)
   is never itself a finding — only a *declared* entry that fails to resolve.
6. Deterministic output order: iterate profiles in the order they were
   loaded (already `compareStrings`-sorted by WP01's `loadProfileSet`), and
   within a profile iterate `handoffTo` then `handoffFrom` then `worksWith`
   in array order — never re-sort by anything content-dependent that could
   vary run-to-run.

**Files**: `src/adapters/spec-kitty-profile/handoff.ts`

**Validation**: T012 covers: a role resolved by exactly one profile passes;
a role resolved by two profiles (non-unique) passes; a dangling role
produces `handoff-unresolved` (error); a one-directional `handoff-to`
produces `handoff-asymmetric` (warning); a fully reciprocal pair produces no
warning; an empty `collaboration` block produces zero findings.

---

### T009 — `references.ts`: directive/tactic reference resolution + activation gating

**Purpose**: FR-004 — the most detailed lint in this WP. Two independent
stages: on-disk existence, then (optionally) activation membership.

**Steps**:

1. Create `src/adapters/spec-kitty-profile/references.ts`.
2. **Stage 1 — on-disk existence** (research.md R2's table, filename-only,
   never parses doctrine YAML content):

   | Reference | Resolves against | Match rule |
   |---|---|---|
   | `directiveRefs[i]` (e.g. `"001"`) | `<doctrineRoot>/directives/**/*.directive.yaml` | filename **starts with** `"<code>-"` |
   | `tacticRefs[i]` (e.g. `"development-bdd"`) | `<doctrineRoot>/tactics/**/*.tactic.yaml` (recursive) | filename stem **equals** id |

   Not found → `err("reference-unresolved", profileId,
   "directive-references[<i>].code"` (or `"tactic-references[<i>].id"`),
   `<message>`, `RUBRIC_CITATION["reference-unresolved"]`).
3. Export a shared resolver helper (also used by T010's `context-sources.ts`
   for the same match rules against `toolguides`/`styleguides`) —
   `resolveDoctrineFile(doctrineRoot, kind, id): boolean` where `kind` is
   `"directive" | "tactic" | "toolguide" | "styleguide"`, so the prefix-vs-
   exact-match logic (directives use prefix, everything else uses exact
   stem match) lives in exactly one place. Recursively walk the relevant
   subtree once per `run()` call (cache the file list per `doctrineRoot` for
   the duration of one run — do not re-`readdir` per reference, this is
   O(n·m) as plan.md's Performance Goals note, but re-walking per reference
   would be needlessly worse).
4. **Stage 2 — activation membership**, only when `activationConfigPath` is
   supplied (skip entirely otherwise — every unresolved reference from stage
   1 is an error either way, per spec.md's edge case):
   - Parse `activationConfigPath` as YAML.
   - **Shape validation** (research.md R3's post-plan-gate correction, and
     this mission's binding operator decision — must be LOUD): if the parsed
     top-level object exposes **neither** `activated_directives` nor
     `activated_tactics`, emit exactly **one**
     `warn("activation-config-unrecognized-shape", "(manifest)",
     "activationConfigPath", <message>,
     RUBRIC_CITATION["activation-config-unrecognized-shape"])` finding for
     the **whole run** (never once per reference — this is a structural,
     whole-manifest check performed once at activation-config load time).
     After emitting it, every reference-lint stage-2 check still runs,
     degrading gracefully to "no reference is activated" — this is
     explicitly distinct from a recognized config whose arrays are simply
     empty (that case activation-gates normally with no shape complaint).
   - When the shape **is** recognized: `activated_directives` entries are
     **slugs** (`"001-architectural-integrity-standard"`), matched by the
     same prefix rule as stage 1
     (`activated_directives.some(slug => slug.startsWith(code + "-"))`).
     `activated_tactics` entries are exact tactic ids, matched by exact
     equality. Found-but-inactive →
     `warn("reference-not-activated", profileId, <path>, <message>,
     RUBRIC_CITATION["reference-not-activated"])`.
5. `toolguideRefs`/`styleguideRefs` are **not** activation-gated in FR-004 —
   only `directiveRefs`/`tacticRefs` are. (Toolguide/styleguide references
   still get stage-1 on-disk resolution here for completeness of the
   `references.ts` module, but if your reading of FR-004's literal text
   restricts it to directives/tactics only, route toolguide/styleguide
   resolution through T010's `context-sources.ts` resolver instead and leave
   `references.ts` scoped to directives/tactics only — either placement is
   acceptable as long as every reference is checked exactly once, not zero
   or two times. Document your choice in this WP's Activity Log.)

**Files**: `src/adapters/spec-kitty-profile/references.ts`

**Validation**: T012 covers: a resolvable directive code passes; an
unresolvable code produces `reference-unresolved`; with an activation config
supplied, a resolvable-but-inactive directive produces
`reference-not-activated` (warning, not error); without an activation config,
the same inactive directive produces no `reference-not-activated` finding at
all (there is nothing to gate against) but still resolves cleanly at stage 1;
an activation config missing both `activated_directives` and
`activated_tactics` produces exactly one
`activation-config-unrecognized-shape` finding regardless of how many
references the profile set has (test with ≥2 profiles each holding
references, and assert the finding count is exactly one, not one per
profile/reference). Regardless of which module ends up owning
`toolguideRefs`/`styleguideRefs` resolution per step 5's either-placement
rule: a resolvable `toolguideRefs`/`styleguideRefs` entry must pass stage-1
resolution, and an unresolvable one must produce `reference-unresolved` —
assert this explicitly in whichever test file exercises the module that
actually owns the check (`references.test.ts` if it stayed here,
`context-sources.test.ts` if you routed it there per T010). A check that
compiles but is silently never invoked (checked zero times instead of
exactly once) must fail this test.

---

### T010 — `context-sources.ts`: on-disk integrity

**Purpose**: FR-005 — same on-disk resolver as T009's stage 1, **never**
activation-gated (there is no warning tier for context-sources — only
"missing → error").

**Steps**:

1. Create `src/adapters/spec-kitty-profile/context-sources.ts`.
2. Export `checkContextSources(profiles, doctrineRoot): SkProfileFinding[]`
   — for each of `contextSources.directives`/`.tactics`/`.toolguides`/
   `.styleguides`, resolve each id via T009's shared `resolveDoctrineFile`
   helper (import it from `references.ts` — do not duplicate the resolution
   logic). Not found →
   `err("context-source-missing", profileId,
   "context-sources.<kind>[<i>]", <message>,
   RUBRIC_CITATION["context-source-missing"])`.
3. This check runs regardless of whether `activationConfigPath` is supplied
   — activation has no bearing on context-sources at all.

**Files**: `src/adapters/spec-kitty-profile/context-sources.ts`

**Validation**: T012 covers all four `context-sources` kinds resolving
cleanly, and each of the four producing `context-source-missing` when the
referenced file does not exist on disk.

---

### T011 — `identity.ts`: profile-id legality, filename match, collision

**Purpose**: FR-006 — the profile-id is the literal `.claude/agents/<id>.md`
filename stem, so a mismatch is a hard native-filename violation, not a
style nit.

**Steps**:

1. Create `src/adapters/spec-kitty-profile/identity.ts`.
2. Export `checkIdentity(profiles: readonly AgentProfile[]): SkProfileFinding[]`.
3. **Legality**: `profileId` must match `^[a-z0-9-]+$` and be ≤ 64
   characters. Violation → `err("profile-id-illegal", profileId || "(empty)",
   "profile-id", <message>, RUBRIC_CITATION["profile-id-illegal"])`. An empty
   `profileId` (absent from the source YAML) also fails this check — do not
   special-case it into a different kind.
4. **Filename match**: `profileId` must equal `fileNameStem` exactly
   (case-sensitive). Mismatch → `err("profile-id-filename-mismatch",
   profileId, "profile-id", <message>,
   RUBRIC_CITATION["profile-id-filename-mismatch"])`. This check still runs
   even when the legality check above already failed (both can fire on the
   same profile — they are distinct violations, per spec.md's edge case
   about a profile-id that is "legal in isolation but collides").
5. **Collision**: two or more profiles in the same `profilesDir` sharing the
   same (legal or illegal) `profileId` → `err("profile-id-collision", <that
   profileId>, "profile-id", <message>,
   RUBRIC_CITATION["profile-id-collision"])` for **each** profile
   participating in the collision (not just one representative) — this is a
   distinct finding from the filename-mismatch check (spec.md edge case:
   "reported as a distinct finding from the filename-mismatch check — both
   are id-legality concerns but are different violations").
6. A profile with `parseError` set (from WP01's `profile.ts`) still
   participates in filename-match and collision checks (it has a
   `fileNameStem`) but its `profileId` is `""` — treat `""` as its own
   collision bucket only if genuinely multiple profiles failed to parse with
   the exact same empty id; more usefully, skip the collision check for
   `profileId === ""` entirely (an empty id is already caught by the
   legality check, and grouping every unparsed profile into one giant
   "collision" would be noise, not signal).

**Files**: `src/adapters/spec-kitty-profile/identity.ts`

**Validation**: T012 covers: a fully legal, filename-matching, unique
profile-id produces zero findings; an uppercase-charset id produces
`profile-id-illegal`; a 65-character id produces `profile-id-illegal`; an id
that differs from the filename by case only produces
`profile-id-filename-mismatch`; two profiles sharing one profile-id both
produce `profile-id-collision`; an unparsed profile (`profileId === ""`) is
excluded from collision grouping.

---

### T012 — Unit tests for all four lint modules + rubric-citation test

**Purpose**: exercise every rule above with in-memory `AgentProfile[]`
fixtures constructed directly in the test files — `fixtures/skprofile/` does
not exist until WP05, and these are pure-function checks over already-loaded
`AgentProfile` objects, so no filesystem fixture is even needed for most
cases (only T009/T010's on-disk resolution needs a `tmpdir`-based doctrine
tree).

**Steps**:

1. Create `tests/skprofile/handoff.test.ts` — construct `AgentProfile[]`
   literals directly (you do not need WP01's `loadProfileSet` for this;
   plain object literals matching the `AgentProfile` interface are simpler
   and more explicit for edge-case coverage). Cover every case listed in
   T008's Validation note.
2. Create `tests/skprofile/references.test.ts` — use
   `node:fs/promises.mkdtemp` to build a small real doctrine tree on disk
   (a handful of `*.directive.yaml`/`*.tactic.yaml` files with realistic
   names, e.g. `001-architectural-integrity-standard.directive.yaml`) plus an
   inline activation-config YAML file. Cover every case in T009's Validation
   note, including the "exactly one `activation-config-unrecognized-shape`
   finding regardless of profile/reference count" assertion.
3. Create `tests/skprofile/context-sources.test.ts` — reuse the same
   `tmpdir` doctrine-tree pattern. Cover every case in T010's Validation
   note.
4. Create `tests/skprofile/identity.test.ts` — plain `AgentProfile[]`
   literals. Cover every case in T011's Validation note.
5. In one of the above (or a small dedicated block), assert every key in
   `SkProfileFindingKind` except `"schema-conformance-violation"` and
   `"profile-parse-error"` has a non-empty, string-typed entry in
   `rubric.ts`'s `RUBRIC_CITATION` map — this is a compile-time guarantee
   already (the `Record<...>` type), but a runtime test doubles as living
   documentation and catches an accidental empty-string value.
   `"profile-parse-error"` is deliberately absent from this map (it is
   structural, not rubric-cited — see WP03's `index.ts` T015) and must not
   be asserted against it.
6. Use Vitest. Clean up any `tmpdir` directories in `afterEach`/`afterAll`.

**Files**: `tests/skprofile/handoff.test.ts`,
`tests/skprofile/references.test.ts`,
`tests/skprofile/context-sources.test.ts`,
`tests/skprofile/identity.test.ts`

**Validation**: `pnpm test` green for all four new files; no existing test
file modified.

---

### T013 — WP02 verification gate (Definition of Done)

**Steps** (run in order):

```bash
pnpm build              # strict tsc — must pass with zero errors
pnpm test               # full suite — zero failures, zero new skips
git diff --stat         # ONLY the nine owned files changed / created
git diff --stat src/core/   # must show no changes
```

## Definition of Done

- [ ] `rubric.ts` exports `RUBRIC_DOC_PATH` and a `RUBRIC_CITATION` map
      covering every non-schema, non-structural finding kind, typed so a
      missing entry is a compile error.
- [ ] `handoff.ts` implements role-based resolution (not profile-id-based)
      and one-directional-symmetry-as-warning exactly per data-model.md.
- [ ] `references.ts` implements the two-stage (on-disk, then activation)
      resolution, including the once-per-run
      `activation-config-unrecognized-shape` loud-failure path.
- [ ] `context-sources.ts` reuses `references.ts`'s on-disk resolver and
      never activation-gates.
- [ ] `identity.ts` implements legality, filename-match, and collision as
      three distinct finding kinds that can co-occur on one profile.
- [ ] `pnpm build` (strict tsc) passes with zero new errors.
- [ ] `pnpm test` green; no test file outside `owned_files` modified.
- [ ] No file under `src/core/` modified.
- [ ] Every emitted finding's `source.normative` is a non-empty string
      pointing at `docs/rubric/spec-kitty-profile-taxonomy.md` (or an
      explicitly-marked placeholder, per the same-mission ordering note,
      recorded in this file's Activity Log).

## Reviewer guidance

- **Reject if** `handoff.ts` resolves roles against `profileId` instead of
  `roles`/`role` — this is the exact naive-implementation bug the mission's
  operator flagged: "A naive profile-id lookup would report every handoff as
  dangling."
- **Reject if** `activation-config-unrecognized-shape` is emitted more than
  once per run, or is emitted per-reference instead of once at
  activation-config load time — check the test asserting this in
  `references.test.ts` directly.
- **Reject if** `context-sources.ts` applies any activation gating — FR-005
  defines only "missing → error," no warning tier.
- **Reject if** `identity.ts` treats filename-mismatch and collision as the
  same finding kind, or short-circuits legality checking when a profile-id
  is already flagged illegal.
- Confirm the same-mission ordering note in `rubric.ts` is honestly recorded
  in the Activity Log if WP04's rubric document did not exist yet at
  authoring time — a citation string that silently pretends to be final
  when it is a research.md-R6 placeholder is a defect, not a convenience.
- Confirm `references.ts`'s doctrine-tree walk is cached per `doctrineRoot`
  for the run, not re-executed per reference (performance note, not
  correctness, but worth a quick check on a profile set with many
  references).

## Activity Log

> **CRITICAL**: entries MUST be in chronological order (oldest first, newest
> last). Append new entries at the END.

- 2026-07-26T23:43:00Z – system – Prompt generated via /spec-kitty.tasks.
- 2026-07-27T00:00:00Z – planner-priti – Post-tasks adversarial-gate fix
  applied: `RUBRIC_CITATION`'s type now excludes `"profile-parse-error"`
  alongside `"schema-conformance-violation"` (that kind is structural, not
  rubric-cited — WP03's `index.ts` emits it with a fixed literal string
  instead); T012's runtime-assertion step and the DoD bullet updated to
  match. T009's Validation note now explicitly requires a test proving
  `toolguideRefs`/`styleguideRefs` resolution actually runs, regardless of
  which module owns it.
