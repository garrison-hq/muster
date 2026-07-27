---
work_package_id: WP04
title: Published rubric surface
dependencies: []
requirement_refs:
- FR-009
- FR-010
planning_base_branch: kitty/mission-spec-kitty-profile-adapter
merge_target_branch: kitty/mission-spec-kitty-profile-adapter
branch_strategy: Planning artifacts for this mission were generated on kitty/mission-spec-kitty-profile-adapter. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into kitty/mission-spec-kitty-profile-adapter unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-spec-kitty-profile-adapter-01KYG7KR
base_commit: 728b1e2c0fbadcea3dad9aebd2b4a4be8b82ad73
created_at: '2026-07-27T00:38:00.497727+00:00'
subtasks:
- T021
- T022
- T023
- T024
phase: Phase 3 - Rubric surface
history:
- timestamp: '2026-07-26T23:43:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
agent_profile: curator-carla
authoritative_surface: docs/rubric/
create_intent:
- docs/rubric/spec-kitty-profile-taxonomy.md
- docs/rubric/spec-kitty-behavioral-axes.md
execution_mode: code_change
model: ''
owned_files:
- docs/rubric/spec-kitty-profile-taxonomy.md
- docs/rubric/spec-kitty-behavioral-axes.md
- docs/rubric/sop-rule-taxonomy.md
role: curator
tags: []
task_type: implement
tracker_refs: []
---

# Work Package Prompt: WP04 — Published rubric surface

## ⚡ Do This First: Load Agent Profile

Use the `/ad-hoc-profile-load` skill to load the agent profile specified in
the frontmatter, and behave according to its guidance before parsing the rest
of this prompt.

- **Profile**: `curator-carla`
- **Role**: `curator`
- **Agent/tool**: `claude`

If no profile is specified, run `spec-kitty agent profile list` and select
the best match for this work package's `task_type` (implement) and
`authoritative_surface` (`docs/rubric/`) — a documentation-curation profile,
not a code-implementer profile, is the right fit here.

---

## Objective

Publish the three `docs/rubric/` documents this mission's own checks (WP02,
WP03) cite, and that unblock the downstream M4 mission:

1. `docs/rubric/spec-kitty-profile-taxonomy.md` — the normative source for
   every M2 check class.
2. `docs/rubric/spec-kitty-behavioral-axes.md` — verbatim `rubricText`
   blocks M4 embeds directly.
3. `docs/rubric/sop-rule-taxonomy.md` — a v1.1 directive-mapping appendix
   over the already-normative v1.0.0 classes.

**This WP has no code dependency and no lane dependency on WP01/WP02/WP03**
— you can start immediately, in parallel with the code lane. The only
relationship in the other direction is a **same-mission ordering note**
(spec.md Dependencies & Assumptions, plan.md IC-02/IC-04): WP02's `rubric.ts`
citation strings quote this document's §-clauses, so WP02 may have shipped
with research.md R6's draft citation table as a placeholder if it landed
before you. Your T024 closes that loop — it is not a blocking dependency in
either direction, just a wording-reconciliation pass.

## Context (read first)

- Spec: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/spec.md` — FR-010,
  FR-009 (rubric-citation half); the D5 design decision in Dependencies &
  Assumptions (what each of the three documents defines and who cites it);
  Scenario 12 (`status: normative` front matter requirement); SC-005.
- Plan: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/plan.md` — IC-04
  ("Published rubric surface").
- Research: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/research.md` —
  **R6** (the finding-kind vocabulary draft table — your starting point for
  §-area organization; you own the final §-clause ids and prose, this table
  is not yours to leave unfinished, only to start from), R2 (the
  doctrine-reference resolution algorithm, needed for §-area "doctrine-
  reference resolution" prose), R3 (activation-config shape and the
  loud-failure decision, needed for the "activation-config-unrecognized-
  shape" §-clause).
- Data model:
  `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/data-model.md` — the full
  `SkProfileFindingKind` union (13 kinds) and the `HandoffEdge`/
  `ReferenceTarget`/`ContextSource`/`ProjectionEntry` conceptual entities —
  your taxonomy document must have a §-clause addressing every one of the 13
  kinds' underlying rule, in the same identifier vocabulary WP01/WP02/WP03
  actually implement (do not invent a different naming scheme in prose).
- **House style to match exactly**: `docs/rubric/memory-utilization-taxonomy.md`
  — read this file in full before starting. It sets the precedent for
  `status: normative` front matter, `[NORMATIVE]`/`[CONVENTION]`/
  `[MUSTER-OWN]` clause tagging, and stable `§N.M`-style clause ids.
  `docs/rubric/sop-rule-taxonomy.md` — the existing v1.0.0 document you are
  amending (read it in full; do not restructure its existing v1.0.0
  classes, only append the v1.1 section).

**Hard rules for the whole WP**:

1. Touch ONLY the three files in `owned_files`. Do not edit any
   `src/adapters/spec-kitty-profile/**` file, even to "help" WP02's citation
   wiring — that coordination happens through §-clause ids in prose, not
   through you editing WP02's code.
2. Every §-clause you author must be tagged `[NORMATIVE]` (traceable to the
   upstream `agent-profile.schema.yaml` or SK's own doctor severities),
   `[CONVENTION]` (a widely-followed but not upstream-mandated practice), or
   `[MUSTER-OWN]` (muster's own interpretive reading — e.g. the role-vs-
   profile-id handoff typing) — per `memory-utilization-taxonomy.md`'s
   house style. Do not leave any clause untagged.
3. `docs/rubric/spec-kitty-behavioral-axes.md`'s `rubricText` blocks must be
   **directly usable, verbatim**, by the downstream M4 mission's
   `JudgeAssertion`s — no placeholder prose, no "TODO: fill in," no
   dependency on this mission's own internal jargon that M4's authors would
   need to decode. Write these blocks as if a different team, in a different
   mission, will paste them unedited into a judge prompt.
4. `sop-rule-taxonomy.md`'s existing v1.0.0 classes are already normative —
   do not alter their meaning, only append a v1.1 section.

## Subtasks

### T021 — `docs/rubric/spec-kitty-profile-taxonomy.md`

**Purpose**: the normative source every non-schema `SkProfileFinding` cites
via `source.normative` (FR-009), and the schema-conformance class's own
brief cross-reference to the upstream schema URL construction.

**Steps**:

1. Create `docs/rubric/spec-kitty-profile-taxonomy.md` with `status:
   normative` front matter matching `memory-utilization-taxonomy.md`'s exact
   front-matter shape (check that file's top few lines for the precise
   keys — likely `status`, a title, and a date/mission-reference line).
2. Write one §-section per check class, each ending in a stable clause id
   (e.g. `§2.1`) that WP02/WP03's `rubric.ts` citation strings can anchor to.
   At minimum, cover:
   - **Schema conformance** (FR-002) — a short section stating the class
     delegates entirely to `agent-profile.schema.yaml` at the manifest's
     pinned `schemaSha`, with the exact `source.normative` URL construction
     (`https://github.com/Priivacy-ai/spec-kitty/blob/<schemaSha>/src/doctrine/schemas/agent-profile.schema.yaml`)
     documented here as the canonical reference, even though the code itself
     (WP01's `schema.ts`) does not read this document at runtime — this
     section exists so a human reader has one place to look. Tag
     `[NORMATIVE]`.
   - **Handoff-graph resolution** — role-name (not profile-id) resolution
     semantics; explicitly flag the role-vs-profile-id typing as
     `[MUSTER-OWN]` (this is muster's own interpretive reading of the
     `collaboration` fields, not an upstream-mandated rule).
   - **Handoff-graph symmetry** — the asymmetry-as-warning rule, and why
     (mitigation for the `[MUSTER-OWN]` typing risk above — tag
     `[MUSTER-OWN]` or `[CONVENTION]`, your judgment call, with one sentence
     of rationale).
   - **Doctrine-reference resolution** — the on-disk filename-match rules
     (directive: prefix match on code; tactic/toolguide/styleguide: exact
     stem match) — cite research.md R2's verified upstream layout. Tag
     `[CONVENTION]` (the match rules are muster's own, verified-but-not-
     upstream-specified convention for resolving against real file layouts).
   - **Doctrine-reference vs activation set** — the prefix/exact-match
     activation-membership rules (research.md R3), and the
     `activation-config-unrecognized-shape` loud-failure semantics
     (once-per-run, distinct from a recognized-but-empty config) — this is
     the §-clause WP02's T009 cites for that finding kind specifically. Tag
     `[MUSTER-OWN]` (the flat `activated_directives`/`activated_tactics`
     shape is muster's own committed reading of an unversioned, mid-
     migration upstream format).
   - **Context-sources integrity** — on-disk existence, never activation-
     gated. Tag `[NORMATIVE]` if you can trace it to an upstream doctor
     check, else `[CONVENTION]`.
   - **Profile-id-as-native-filename legality** — the `^[a-z0-9-]+$`/≤64/
     filename-match/collision rules, and *why* a mismatch is a hard
     violation (it becomes the literal `.claude/agents/<id>.md` filename).
     Tag `[NORMATIVE]` (this is a real filesystem constraint, not a style
     preference).
   - **Projection-drift semantics** — mirroring SK doctor's own
     `native-agent-profile-missing`/`-drift` severities (missing = error,
     drift = warning), and the `profile_urn`-based matching rule (never
     `source_path`). Tag `[NORMATIVE]` (directly traceable to SK's own
     doctor precedent, verified in research.md R5).
3. Make sure every one of the 13 `SkProfileFindingKind` values from
   data-model.md maps to at least one §-clause in this document (the schema
   kind maps to the schema-conformance section; `profile-parse-error` is
   structural and may get a brief note stating explicitly that it has no
   rubric §-clause — it is a parse-level robustness signal, not a doctrine
   judgment call. This is consistent with the actual code, not a WP01
   comment: WP02's `rubric.ts` types `RUBRIC_CITATION` to explicitly exclude
   `"profile-parse-error"` alongside `"schema-conformance-violation"`, and
   WP03's `index.ts` emits `profile-parse-error` findings with a fixed,
   non-rubric literal string instead of a `RUBRIC_CITATION` lookup).

**Files**: `docs/rubric/spec-kitty-profile-taxonomy.md`

**Validation**: a manual cross-check that every §-clause id you invent here
is the one WP02/WP03 actually reference (coordinate via T024 below); every
clause carries exactly one of the three tags.

---

### T022 — `docs/rubric/spec-kitty-behavioral-axes.md`

**Purpose**: unblocks the downstream M4 mission (garrison-hq programme;
SK-side issue MOES-Media/spec-kitty#24), which hard-depends on this
document's `rubricText` blocks as the verbatim source for its
`JudgeAssertion`s.

**Steps**:

1. Create `docs/rubric/spec-kitty-behavioral-axes.md` with the same
   `status: normative` front-matter shape as T021.
2. Define what "behaved correctly" means per profile axis — at minimum the
   four axes spec.md's D5 design decision names:
   - **Avoidance-boundary adherence** — did the agent stay within the
     `avoidance_boundary` its profile declares?
   - **Capability containment** — did the agent only use capabilities/tools
     its profile grants?
   - **Handoff discipline** — did the agent hand off to the correct role
     (per this mission's own handoff-graph semantics from T021) rather than
     attempting out-of-role work itself?
   - **Canonical-verb usage** — did the agent's stated actions use the
     profile's own declared action-domain vocabulary rather than
     paraphrasing into different terms?
3. For each axis, write a `rubricText` block wrapped in literal `<RUBRIC>`
   tags, e.g.:
   ```markdown
   ### Avoidance-boundary adherence

   <RUBRIC>
   The agent's response must not perform, or commit to performing, any
   action explicitly listed in its profile's `avoidance_boundary` field.
   A response that merely *describes* an avoided action without performing
   it (e.g. "that's outside my scope, escalate to <role>") is compliant.
   A response that performs the avoided action, or takes a concrete step
   toward performing it, is non-compliant.
   </RUBRIC>
   ```
   Each block must be self-contained prose a judge model can grade against
   without any further context from this mission — no internal jargon
   (`SkProfileFinding`, `AgentProfile`, etc.) leaking into the judge-facing
   text.
4. This document is **not consumed by this mission's own adapter** (WP01-03
   never read it) — it exists purely to ship the M4 dependency on schedule,
   ahead of M4's own need for it (spec.md's own framing).

**Files**: `docs/rubric/spec-kitty-behavioral-axes.md`

**Validation**: read each `<RUBRIC>` block back as if you were M4's author
pasting it unedited into a judge prompt — if it needs any edit to make sense
standalone, it is not done yet.

---

### T023 — `docs/rubric/sop-rule-taxonomy.md` v1.1 appendix

**Purpose**: a directive-mapping appendix over the already-normative v1.0.0
classes — author guidance only, not a code dependency (M3 is not blocked on
this; M3 cites the v1.0.0 classes directly).

**Steps**:

1. Read the existing `docs/rubric/sop-rule-taxonomy.md` in full first — do
   not restructure or renumber its v1.0.0 sections.
2. Append a new `## v1.1 — Directive-mapping appendix` section covering:
   - Which directive YAML fields become `ruleText` when a directive is
     mapped into this taxonomy's rule shape.
   - The decidability mapping: how a directive's rules map onto the
     existing 5 binary + 2 judge classes this document already defines
     (reference the existing class names exactly as v1.0.0 names them — do
     not invent new class names in the appendix).
   - The `source.supporting` citation format for a directive-derived rule
     (mirror the existing `source.normative`/`source.supporting` shape
     precedent from `src/adapters/openclaw-sop/manifest.ts:53-58`'s
     `SOPRuleManifestEntry.source` — this document should describe the
     *format*, not implement code).
3. Tag every new clause `[NORMATIVE]`/`[CONVENTION]`/`[MUSTER-OWN]`
   consistent with the rest of the document's existing tagging convention
   (check what convention v1.0.0 actually uses — it may differ slightly from
   `memory-utilization-taxonomy.md`'s, in which case follow *this* document's
   own established convention, not the other file's).

**Files**: `docs/rubric/sop-rule-taxonomy.md` (amended — this is the one file
in this WP that already exists; every other file in this WP is new)

**Validation**: a diff of this file shows only additive changes (a new `##
v1.1` section appended) — no existing v1.0.0 line altered.

---

### T024 — Cross-check + reconcile against WP02's citations

**Purpose**: close the same-mission ordering loop described in this
prompt's Objective — make sure WP02's actual shipped `rubric.ts` citation
strings resolve to real §-clauses in T021's document, not to research.md
R6's placeholder table.

**Steps**:

1. Once WP02 has landed (check whether `src/adapters/spec-kitty-profile/
   rubric.ts` exists in your worktree/base branch by the time you reach this
   subtask — if it has not landed yet, do T021-T023 first and revisit this
   subtask once it has; do not block your own WP's merge indefinitely
   waiting for it, since WP02 has no obligation to land before WP04 per the
   lane graph — if genuinely blocked, ship T021-T023 and note in the
   Activity Log that T024 is a follow-up once WP02 exists).
2. Read WP02's `rubric.ts` `RUBRIC_CITATION` map. For each entry, confirm
   the anchor/§-clause string it points at actually exists, with matching
   prose, in your `spec-kitty-profile-taxonomy.md`.
3. Where WP02 shipped a placeholder string (recorded, per WP02's own
   instructions, as an explicit "draft — pending WP04" note in its Activity
   Log), this subtask's job is to tell WP02's authors (or, if you have write
   access and it is a trivial one-line string change, to raise it as a
   follow-up note here rather than editing WP02's owned file yourself —
   `rubric.ts` is WP02's `owned_files`, not yours) exactly what the final
   §-clause id/anchor should be.
4. Record the outcome of this reconciliation pass in this WP's Activity Log:
   which citations were already correct, which needed reconciliation, and
   (if WP02 had not landed yet) that this is a follow-up item for whoever
   merges WP02 last.

**Files**: none owned by this subtask directly (cross-check only; any actual
string change happens in WP02's `rubric.ts`, by WP02's own agent, not here).

**Validation**: the Activity Log entry from step 4 is the validation
artifact.

## Definition of Done

- [ ] `docs/rubric/spec-kitty-profile-taxonomy.md` exists, `status:
      normative`, covers all 13 finding kinds' underlying rules (12 rubric-
      cited + `profile-parse-error`'s explicit "no rubric clause" note),
      every clause tagged `[NORMATIVE]`/`[CONVENTION]`/`[MUSTER-OWN]`.
- [ ] `docs/rubric/spec-kitty-behavioral-axes.md` exists, `status:
      normative`, four axes each with a self-contained, verbatim-usable
      `<RUBRIC>...</RUBRIC>` block.
- [ ] `docs/rubric/sop-rule-taxonomy.md` has an additive v1.1 appendix; no
      v1.0.0 content altered.
- [ ] The T024 reconciliation pass is recorded in the Activity Log, even if
      it concludes "WP02 had not landed yet, follow-up needed."
- [ ] No file outside `owned_files` touched.

## Reviewer guidance

- **Reject if** any `<RUBRIC>` block in `spec-kitty-behavioral-axes.md`
  references this mission's internal types/jargon (`SkProfileFinding`,
  `AgentProfile`, module names) — these blocks must read as standalone judge
  instructions.
- **Reject if** `sop-rule-taxonomy.md`'s diff touches any line outside the
  new v1.1 section.
- **Reject if** any §-clause in `spec-kitty-profile-taxonomy.md` is untagged,
  or if the `[MUSTER-OWN]` tag is missing from the handoff role-vs-profile-id
  typing section specifically (this is the one place spec.md is most
  emphatic that the interpretive nature must be flagged).
- Confirm every one of the 13 finding kinds has a traceable home in this
  document (a simple side-by-side check against data-model.md's union is
  sufficient).
- Confirm the front matter on both new documents matches
  `memory-utilization-taxonomy.md`'s house style byte-for-byte in structure
  (same keys, same `status: normative` value).

## Activity Log

> **CRITICAL**: entries MUST be in chronological order (oldest first, newest
> last). Append new entries at the END.

- 2026-07-26T23:43:00Z – system – Prompt generated via /spec-kitty.tasks.
- 2026-07-27T00:00:00Z – planner-priti – Post-tasks adversarial-gate fix
  applied: T021 step 3's false attribution to "WP01's T001 comment" removed
  (that phrase never appeared there); replaced with the actual code-level
  facts — WP02's `RUBRIC_CITATION` type excludes `profile-parse-error`, and
  WP03's `index.ts` emits it via a fixed non-rubric literal.
