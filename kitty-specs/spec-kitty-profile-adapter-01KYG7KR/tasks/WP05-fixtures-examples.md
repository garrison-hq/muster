---
work_package_id: WP05
title: Fixture and example authoring (spec-kitty-profile)
dependencies:
- WP01
- WP02
requirement_refs:
- C-004
planning_base_branch: kitty/mission-spec-kitty-profile-adapter
merge_target_branch: kitty/mission-spec-kitty-profile-adapter
branch_strategy: Planning artifacts for this mission were generated on kitty/mission-spec-kitty-profile-adapter. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into kitty/mission-spec-kitty-profile-adapter unless the human explicitly redirects the landing branch.
subtasks:
- T017
- T018
phase: Phase 3 - Fixtures & examples
history:
- timestamp: '2026-07-27T00:00:00Z'
  agent: planner-priti
  action: Split out of the original WP03 by the post-tasks adversarial-gate
    review (Fix 3) — T017/T018 (fixture/example authoring) do not depend on
    CLI wiring and were sitting in front of WP03's T020 real-CLI
    verification gate for no dependency reason. This WP depends on WP01+WP02
    only; WP03 depends on this WP in turn.
agent_profile: node-norris
authoritative_surface: fixtures/skprofile/
create_intent:
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
execution_mode: code_change
model: ''
owned_files:
- fixtures/skprofile/**
- examples/skprofile/**
role: implementer
tags: []
task_type: implement
tracker_refs: []
---

# Work Package Prompt: WP05 — Fixture and example authoring

## ⚡ Do This First: Load Agent Profile

Use the `/ad-hoc-profile-load` skill to load the agent profile specified in
the frontmatter, and behave according to its guidance before parsing the rest
of this prompt.

- **Profile**: `node-norris`
- **Role**: `implementer`
- **Agent/tool**: `claude`

If no profile is specified, run `spec-kitty agent profile list` and select
the best match for this work package's `task_type` (implement) and
`authoritative_surface` (`fixtures/skprofile/`).

---

## Objective

Author the entire muster-local fixture and example surface this mission's
tests and real-CLI verification run against: a small legal profile set that
passes every check, a rigged "broken" set with at least one violation per
lint class (the discrimination-control set, SC-002/SC-003), the vendored
upstream schema + doctrine tree those manifests point at, and the one
guaranteed-clean runnable example (AC-1/Scenario 9).

**This WP is a split of the original WP03** (post-tasks adversarial-gate
review, Fix 3): `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/tasks.md`
already conceded the fixture work does not depend on CLI wiring, so it no
longer sits in front of WP03's T020 real-CLI-verification gate. This WP owns
exactly the original T017 and T018 — nothing else moved.

This WP depends on **WP01 and WP02 only** (it needs the full finding-kind
vocabulary and the four lint modules' exact rules to rig fixtures that
exercise every check class correctly) — it does **not** depend on WP03.
**WP03 depends on this WP** in turn: WP03's `tests/skprofile/fixtures.test.ts`
and `tests/skprofile/cli.test.ts` (T019) and its real-CLI verification (T020)
both read the fixtures/examples this WP creates. Do not start until WP01 and
WP02 are available on your base branch.

**You have no CLI to run.** `muster skprofile run` is WP03's deliverable
(T016), and WP03 depends on this WP, not the other way around — the CLI does
not exist yet in your dependency chain. Where the original T018 called for a
manual `muster skprofile run examples/... --json` smoke check, that
confirmation is deferred to WP03's T020 (see T018 below); construct your
fixtures/example correctly by construction, against WP01/WP02's actual
exported check functions if you want to self-verify (you can call
`checkHandoffs`/`checkReferences`/`checkContextSources`/`checkIdentity`/
WP01's schema check directly from a scratch script or from your own
`pnpm exec vitest` run against ad-hoc test code — do not commit that
scratch-verification code, it is not part of `owned_files`).

## Context (read first)

- Spec: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/spec.md` — C-004;
  Scenarios 8, 9, 11; SC-001..003.
- Plan: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/plan.md` — IC-03,
  Project Structure (the fixture/example portion of the file tree).
- Data model: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/data-model.md`
  — the 13-kind `SkProfileFindingKind` union (you must rig at least the
  lint-class kinds named in `quickstart.md` §4).
- Research: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/research.md` —
  R2 (doctrine-tree layout/filename-match rules — needed to author a fixture
  doctrine tree that actually resolves), R3 (activation-config shape), R6
  (the discrimination-control mapping table you must satisfy).
- Quickstart: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/quickstart.md`
  — §3-4 are close to a literal script for this WP's fixtures; §5 for the
  example. §6 (real-CLI verification) is WP03's T020, not yours.
- Already-shipped modules to author against (read them, do not modify them):
  WP01's `manifest.ts`/`profile.ts`/`schema.ts`/`findings.ts`, WP02's
  `handoff.ts`/`references.ts`/`context-sources.ts`/`identity.ts`/`rubric.ts`.

**Hard rules for the whole WP** (from spec + charter):

1. Touch ONLY the files in `owned_files` (`fixtures/skprofile/**`,
   `examples/skprofile/**`). Do not touch any `src/` file, even to "help"
   verify your fixtures — write ad-hoc scratch scripts outside the repo
   (e.g. `/tmp`) if you want to self-check against WP01/WP02's exported
   functions, and do not commit them.
2. Do not parse or validate the *content* of doctrine files beyond what
   filename-resolution requires — content stubs are fine (WP02's checks
   never read doctrine-file content).
3. C-004: fixtures must be muster-local (no dependency on the real SK repo
   at runtime) — the vendored schema records its real upstream SHA, sourced
   read-only from `/home/jeroennouws/dev/spec-kitty-conformance`.
4. Never read the system clock or make a network call while authoring these
   fixtures' *content* (the one-time `git rev-parse` to source the vendor SHA
   is an authoring-time action, not part of the shipped adapter's runtime
   path, and does not violate C-002/C-003 — those constrain the adapter code
   WP01-03 ship, not how a fixture file was sourced).

## Subtasks

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

**Validation**: no automated test lives in this WP (fixtures are data, not
code) — covered downstream by WP03's `fixtures.test.ts` (SC-002/SC-003) and
the manual runs in `quickstart.md` §3-4. Self-check before marking this WP
`for_review`: read `clean/` and `broken/` back against WP02's actual
`checkHandoffs`/`checkReferences`/`checkContextSources`/`checkIdentity`
rules (not just this prompt's paraphrase of them) and confirm each rigged
file trips exactly the lint class you intended.

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
2. **You cannot run `muster skprofile run` from this WP** — the CLI is
   WP03's deliverable (T016), and WP03 depends on this WP, not the reverse.
   Construct this manifest so it is clean **by construction**: apply exactly
   the same reference-resolution/handoff/context-source/identity rules you
   already used for `fixtures/skprofile/clean/` in T017, with zero
   intentional violations of any kind (not even a warning-tier one — AC-1
   requires *zero findings*, not just `ok: true`). Record in this WP's
   Activity Log that the actual `exitCode: 0`/`ok: true`/zero-findings
   confirmation is deferred to WP03's T020, which is the first point in the
   dependency chain where the CLI exists to run it — this WP's own DoD bullet
   below is "constructed to be clean," not "confirmed clean."

**Files**: everything under `examples/skprofile/**`

**Validation**: none from this WP directly (no CLI available yet) — WP03's
T020 real-CLI verification is the actual proof this manifest exits 0; record
the deferral explicitly in the Activity Log per step 2.

## Definition of Done

- [ ] `fixtures/skprofile/clean/` is a legal profile set with zero rigged
      violations; `fixtures/skprofile/broken/` rigs at least one fixture per
      lint class, including all three `quickstart.md` §4 names literally
      (`handoff-unresolved`, `reference-unresolved`,
      `profile-id-filename-mismatch`).
- [ ] `fixtures/skprofile/agent-profile.schema.yaml` records a real,
      resolvable upstream SHA (40 or a valid short hex, not a placeholder),
      sourced from `/home/jeroennouws/dev/spec-kitty-conformance`'s actual
      HEAD; `manifest.yaml`/`broken-manifest.yaml`'s `schemaSha` matches it
      exactly.
- [ ] `fixtures/skprofile/doctrine/` mirrors the real upstream
      directives/tactics/toolguides/styleguides directory shape closely
      enough for WP02's filename-resolution rules to exercise both the
      resolve and not-resolve paths.
- [ ] `fixtures/skprofile/activation-config.yaml` exercises the
      `reference-not-activated` warning path against at least one reference
      in `clean/`.
- [ ] `examples/skprofile/manifest.yaml` is constructed to be genuinely
      clean (zero findings) by the same construction discipline as
      `fixtures/skprofile/clean/`; the Activity Log records that live
      exit-0 confirmation is deferred to WP03's T020.
- [ ] No file outside `owned_files` (`fixtures/skprofile/**`,
      `examples/skprofile/**`) touched — in particular, no `src/` file.

## Reviewer guidance

- Spot-check that `fixtures/skprofile/agent-profile.schema.yaml` records a
  real, resolvable upstream SHA (40 or a valid short hex, not a placeholder)
  and that `manifest.yaml`/`broken-manifest.yaml`'s `schemaSha` matches it.
- **Reject if** `fixtures/skprofile/broken/` is missing a rigged case for
  any of the three `quickstart.md` §4-named kinds
  (`handoff-unresolved`/`reference-unresolved`/`profile-id-filename-mismatch`),
  or if `clean/` contains an unintentional violation of its own.
- **Reject if** `examples/skprofile/manifest.yaml` references anything
  outside `examples/skprofile/**` (e.g. a path back into `fixtures/`) — it
  must be self-contained.
- Confirm the Activity Log honestly records that this WP could not run the
  CLI itself and defers exit-0 confirmation to WP03's T020 — a claim of
  "confirmed exit 0" from this WP (which has no CLI to run) is a defect, not
  a convenience.
- This WP has no code to `pnpm build`/`pnpm test` against on its own; do not
  reject for a missing build/test run — that gate belongs to WP03's T019/T020,
  which consume these fixtures.

## Activity Log

> **CRITICAL**: entries MUST be in chronological order (oldest first, newest
> last). Append new entries at the END.

- 2026-07-27T00:00:00Z – planner-priti – WP created by splitting T017/T018
  out of the original WP03, per the post-tasks adversarial-gate review
  (Fix 3, binding operator decision). See WP03's own Activity Log/history for
  the corresponding removal.
- 2026-07-27T09:52:00Z – claude (implementer, node-norris) – **Remediation of
  post-review blockers F-1 (seven missing discrimination controls) and F-2
  (this Activity Log entry)**, per the operator's binding decision. Scope:
  `fixtures/skprofile/**` only (no `src/` file touched; `owned_files`
  unchanged).

  **CLI-deferral restated (still true after this remediation):** this WP
  still has no CLI to run — `muster skprofile run` is WP03's deliverable
  (T016), and WP03 depends on this WP, not the reverse. Every finding
  vector below was produced by driving WP01's `checkSchemaConformance` and
  WP02's `checkIdentity`/`checkHandoffs`/`checkReferences`/
  `checkContextSources` directly via an ad-hoc, uncommitted `tsx` scratch
  script run from `/tmp` (never inside `owned_files`, never inside
  `src/`), per this WP's own prompt guidance ("you can call ... directly
  from a scratch script ... do not commit that scratch-verification
  code"). `projection.ts` (§7.2/§7.3) does not exist yet on this WP's
  dependency chain (WP01+WP02 only, per this WP's frontmatter
  `dependencies`) — its two new fixtures below were verified by an
  independent, uncommitted re-implementation of T014's exact documented
  algorithm (profile_urn matching, raw-UTF8 SHA-256 hex, no
  normalization, output_path resolved against the projection-manifest
  file's own parent directory's parent) against real fixture bytes on
  disk, not against WP03's actual `projection.ts` (which is still
  unwritten). Live exit-0/exit-1/exit-2 CLI confirmation for all of the
  below remains deferred to WP03's T020, exactly as before.

  **Seven new discrimination-control fixtures added** (F-1), each with an
  in-file header documenting its expected finding vector — three are
  honestly-documented multi-kind vectors, not concealed as one-kind:

  | # | Clause | File(s) | Documented vector | Observed vector (verified) |
  |---|---|---|---|---|
  | 1 | §6.1 profile-id-illegal (charset) | `broken/profile-id-illegal-charset.agent.yaml` | profile-id-illegal(error) + profile-id-filename-mismatch(error) + schema-conformance-violation(error) — 3 findings. The third kind (schema) was **not** anticipated by the remediation brief's "two-finding" framing; it is real and unavoidable (muster's `^[a-z0-9-]+$` is a charset superset of, never a subset of, the vendored schema's `^[a-z][a-z0-9-]*$`, so any genuine charset violation of muster's own rule is always also a schema-pattern violation) — disclosed in the file's own header. | Matches exactly. |
  | 2 | §6.2 profile-id-illegal (length) | `broken/profile-id-length-ceiling-fixture-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.agent.yaml` | profile-id-illegal(error) only — one-kind; the 65-char id is both the declared `profile-id` and the literal filename stem. | Matches exactly. |
  | 3 | §6.4 profile-id-collision | `broken/collision-a.agent.yaml` + `broken/collision-b.agent.yaml` (pair, both declare `profile-id: collision-a`) | profile-id-collision(error) x2 (one per file, per `identity.ts`'s per-profile-in-group emission) + profile-id-filename-mismatch(error) x1 (collision-b only — its filename stem is "collision-b", not "collision-a") — 3 findings across the pair. | Matches exactly. |
  | 4 | §3.2 handoff-asymmetric (warning) | `broken/asymmetric-a.agent.yaml` + `broken/asymmetric-b.agent.yaml` (pair) | handoff-asymmetric(warning) x1, on asymmetric-a's `collaboration.handoff-to[0]` only; asymmetric-b contributes zero findings. Proves the warning/error split (resolves cleanly, is merely unreciprocated). | Matches exactly. |
  | 5 | §4.3 activation-config-unrecognized-shape (warning) | `bad-activation-config.yaml` (nested `charter:`-shaped, exposes neither `activated_directives` nor `activated_tactics`) + `broken/activation-shape/valid-profile.agent.yaml` (deliberately zero-finding profile) + `broken-activation-manifest.yaml` (new manifest, isolates this class) | Exactly 1 finding for the whole manifest run: activation-config-unrecognized-shape(warning), `profileId: "(manifest)"`. `ok === true`. | Matches exactly. |
  | 6 | §7.2 projection-output-missing (error) | `broken/projection/projection-output-missing.agent.yaml` + `projection-manifest.json` (entry's `output_path` deliberately points at a file that is never created) + `broken-projection-manifest.yaml` (new manifest, isolates FR-007) | projection-output-missing(error) only, for this profile. | Matches exactly (verified via the independent re-implementation described above, not WP03's own code). |
  | 7 | §7.3 projection-hash-drift (warning) | `broken/projection/projection-hash-drift.agent.yaml` + `projection-manifest.json` (matching entry, real `output_path` at `broken/projection/outputs/hash-drift.md`, but both `source_hash` and `file_hash` recorded as deliberately-wrong placeholders) | projection-hash-drift(warning) only, for this profile; recomputed real hashes (`c3734807...` source, `53e6d5e8...` output) independently confirmed to differ from the manifest's recorded placeholders. | Matches exactly. |

  **Full post-remediation `fixtures/skprofile/broken/` table** (10 → 11
  direct `*.agent.yaml` children; `broken/activation-shape/` and
  `broken/projection/` are separate, isolated profilesDirs consumed by
  their own new manifests, non-recursively excluded from
  `broken-manifest.yaml`'s own run by `loadProfileSet`'s flat-directory
  read):

  ```
  asymmetric-a.agent.yaml                -> [handoff-asymmetric(warning)]
  asymmetric-b.agent.yaml                -> []
  collision-a.agent.yaml                 -> [profile-id-collision(error)]
  collision-b.agent.yaml                 -> [profile-id-collision(error), profile-id-filename-mismatch(error)]
  context-source-missing.agent.yaml      -> [context-source-missing(error)]
  dangling-handoff.agent.yaml            -> [handoff-unresolved(error)]
  id-filename-mismatch.agent.yaml        -> [profile-id-filename-mismatch(error)]
  profile-id-illegal-charset.agent.yaml  -> [profile-id-illegal(error), profile-id-filename-mismatch(error), schema-conformance-violation(error)]
  profile-id-length-ceiling-fixture-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.agent.yaml -> [profile-id-illegal(error)]
  schema-violation.agent.yaml            -> [schema-conformance-violation(error)]
  unresolvable-reference.agent.yaml      -> [reference-unresolved(error)]
  ```

  TOTAL for `fixtures/skprofile/broken-manifest.yaml`: **13 findings** (12
  error, 1 warning). `ok === false`, exit 1 (once WP03's CLI exists).
  `broken/` file count: **11** `*.agent.yaml` files, verified via
  `find fixtures/skprofile/broken -maxdepth 1 -name '*.agent.yaml' -type f | wc -l`.

  **Literal scratch-driver output, full fixture set, this repo's actual
  WP01/WP02 exports** (captured verbatim; commands run from the lane-e
  worktree, `NODE_PATH` set to that worktree's own `node_modules` for the
  standard-lint driver, direct `pnpm exec tsx` for the manifest-level
  driver — both scripts uncommitted, deleted before this WP moved to
  `for_review`):

  ```
  $ tsx verify.ts fixtures/skprofile/clean fixtures/skprofile/doctrine \
      fixtures/skprofile/agent-profile.schema.yaml \
      ebfbaddd653789417f89b040320ccfe452f15424 \
      fixtures/skprofile/activation-config.yaml
  TOTAL FINDINGS: 2
  fixtures/skprofile/clean/architect.agent.yaml -> [reference-not-activated(warning)]
  fixtures/skprofile/clean/planner.agent.yaml -> [reference-not-activated(warning)]
  errors=0 warnings=2 ok=true

  $ tsx verify.ts fixtures/skprofile/broken fixtures/skprofile/doctrine \
      fixtures/skprofile/agent-profile.schema.yaml \
      ebfbaddd653789417f89b040320ccfe452f15424
  TOTAL FINDINGS: 13
  fixtures/skprofile/broken/asymmetric-a.agent.yaml -> [handoff-asymmetric(warning)]
  fixtures/skprofile/broken/collision-a.agent.yaml & fixtures/skprofile/broken/collision-b.agent.yaml -> [profile-id-filename-mismatch(error), profile-id-collision(error), profile-id-collision(error)]
  fixtures/skprofile/broken/context-source-missing.agent.yaml -> [context-source-missing(error)]
  fixtures/skprofile/broken/dangling-handoff.agent.yaml -> [handoff-unresolved(error)]
  fixtures/skprofile/broken/id-filename-mismatch.agent.yaml -> [profile-id-filename-mismatch(error)]
  fixtures/skprofile/broken/profile-id-illegal-charset.agent.yaml -> [schema-conformance-violation(error), profile-id-illegal(error), profile-id-filename-mismatch(error)]
  fixtures/skprofile/broken/profile-id-length-ceiling-fixture-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.agent.yaml -> [profile-id-illegal(error)]
  fixtures/skprofile/broken/schema-violation.agent.yaml -> [schema-conformance-violation(error)]
  fixtures/skprofile/broken/unresolvable-reference.agent.yaml -> [reference-unresolved(error)]
  errors=12 warnings=1 ok=false

  $ tsx verify.ts fixtures/skprofile/broken/activation-shape fixtures/skprofile/doctrine \
      fixtures/skprofile/agent-profile.schema.yaml \
      ebfbaddd653789417f89b040320ccfe452f15424 \
      fixtures/skprofile/bad-activation-config.yaml
  TOTAL FINDINGS: 1
  (manifest) -> [activation-config-unrecognized-shape(warning)]
  errors=0 warnings=1 ok=true

  $ tsx verify-projection.ts fixtures/skprofile/broken/projection fixtures/skprofile/projection-manifest.json
  projection-hash-drift -> projection-hash-drift (warning; source_hash and file_hash differ; recomputed source_hash=c3734807cf8967130f0ece027257c4962c65f6aabf802c201f5d70eb280b2578 file_hash=53e6d5e8e50fbd082c30e64e73298362cb608374b49a989c98a0f14c09d48490)
  projection-output-missing -> projection-output-missing (output_path ".../fixtures/skprofile/broken/projection/outputs/output-missing-does-not-exist.md" does not exist)

  $ tsx verify.ts fixtures/skprofile/broken/projection fixtures/skprofile/doctrine \
      fixtures/skprofile/agent-profile.schema.yaml \
      ebfbaddd653789417f89b040320ccfe452f15424
  TOTAL FINDINGS: 0
  errors=0 warnings=0 ok=true

  $ tsx verify.ts examples/skprofile/profiles examples/skprofile/doctrine \
      examples/skprofile/agent-profile.schema.yaml \
      ebfbaddd653789417f89b040320ccfe452f15424
  TOTAL FINDINGS: 0
  errors=0 warnings=0 ok=true
  ```

  A second, full end-to-end driver (loading each manifest exactly as
  `manifest.ts`/`profile.ts` do, plus schema + all four WP02 lints + an
  independently re-implemented projection check) against all five
  manifests confirms the same totals: `fixtures/skprofile/manifest.yaml` →
  2 findings (0 errors, 2 warnings, `ok: true`);
  `fixtures/skprofile/broken-manifest.yaml` → 13 findings (12/1, `ok:
  false`); `fixtures/skprofile/broken-activation-manifest.yaml` → 1
  finding (0/1, `ok: true`); `fixtures/skprofile/broken-projection-
  manifest.yaml` → 2 findings (1/1, `ok: false`);
  `examples/skprofile/manifest.yaml` → 0 findings (`ok: true`). Re-run
  twice and `cmp`'d byte-for-byte identical (determinism).

  **The exact finding vector WP03's `fixtures.test.ts` must pin** (F-1/F-2
  deliverable — do not assert only `ok`/membership; assert these exact
  values):

  1. `fixtures/skprofile/broken-manifest.yaml` → `ok === false`;
     `findings.length === 13` **exactly** (12 error, 1 warning) — not "at
     least"; the literal per-`(sourceFile → kind[])` pairing is the table
     above (three fixtures are documented, deliberate multi-kind: the
     charset-illegal file at 3 kinds, the collision pair at 3 kinds
     combined); every other fixture is exactly one-kind.
  2. A **file-count assertion** independent of the finding assertions:
     `readdirSync('fixtures/skprofile/broken', { withFileTypes: true })
     .filter(e => e.isFile() && e.name.endsWith('.agent.yaml')).length
     === 11` — so an accidental future deletion from this directory fails
     loudly even if some other fixture's kind coincidentally papers over
     the missing finding.
  3. `fixtures/skprofile/manifest.yaml` → `ok === true` **and exactly 2**
     `reference-not-activated` warnings **and zero errors** (both
     `architect` and `planner`) — not merely `ok === true`.
  4. `examples/skprofile/manifest.yaml` → `findings.length === 0` **and**
     `ok === true` — AC-1 is zero findings of any severity, not merely a
     passing verdict.
  5. `fixtures/skprofile/broken-activation-manifest.yaml` (new) → `ok ===
     true`; `findings.length === 1`; that one finding is
     `activation-config-unrecognized-shape`, severity `warning`,
     `profileId === "(manifest)"`.
  6. `fixtures/skprofile/broken-projection-manifest.yaml` (new) → `ok ===
     false`; `findings.length === 2`: one `projection-output-missing`
     (error, `profileId === "projection-output-missing"`) and one
     `projection-hash-drift` (warning, `profileId ===
     "projection-hash-drift"`).

  **Build/typecheck/test, this WP's fixture-only change** (no `src/`
  touched, so these are a no-op-on-adapter-code sanity check, run anyway
  per the remediation brief): `pnpm build` → exit 0. `pnpm typecheck` →
  exit 0. `pnpm test` → exit 0, `164 passed (164)` test files, `3531
  passed | 3 skipped (3534)` tests (unaffected by this fixture-only
  change; `tests/unit/invariants.test.ts`'s NI-002 is part of this run).

  **What this WP could not do, and precisely why**: (a) run
  `muster skprofile run` against any of the new/changed manifests —
  `src/adapters/spec-kitty-profile/index.ts` and `src/cli/index.ts`'s
  `skprofile` subcommand are WP03's deliverables and do not exist on this
  WP's dependency chain (WP01+WP02 only); all verification above is
  against WP01/WP02's real exported check functions plus an independent,
  documented re-implementation of §7.2/§7.3's algorithm, never against
  WP03's own (still-unwritten) `projection.ts`/`index.ts`/CLI wiring —
  WP03's own T019/T020 remain the actual proof of live exit-code/CLI
  behavior. (b) verify the §7.2/§7.3 `output_path` resolution rule against
  WP03's actual code for the same reason — the resolution rule used here
  (relative to the projection-manifest file's own parent directory's
  parent) is transcribed directly from the already-merged, already-
  normative rubric §7.2 clause, not inferred or guessed, but WP03 is the
  first point in the dependency chain that can confirm its own
  implementation matches that clause exactly.

  **Traceability note on this entry's location**: `spec-kitty agent tasks
  add-history WP05 --mission spec-kitty-profile-adapter-01KYG7KR` was
  probed once from the lane-e worktree and resolved to this file in the
  main repo checkout (`/home/jeroennouws/dev/garrison-hq/muster`, branch
  `kitty/mission-spec-kitty-profile-adapter`) — **not** to lane-e's own
  `kitty-specs/` copy, and not to the `-coord` worktree — confirming the
  operator's note that `kitty-specs/` edits on a lane branch trigger only
  a warning-mode protected-path guard (warn, exit 0), never a rejection.
  This entry itself was authored directly in that resolved location (the
  planning repo) rather than through the CLI's single-line `--note`
  argument, so it could carry the full per-fixture table and fenced
  transcripts F-2 requires; the CLI's probe call is reflected only in this
  note's presence at this path, not in any surviving placeholder text.
  A separately pre-existing, unrelated uncommitted change to this same
  planning repo's `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/tasks/
  WP01-manifest-schema.md` (adding `base_branch`/`base_commit`/
  `created_at` frontmatter fields) was observed already present before
  this entry was written and was left untouched — it is not this WP's
  concern and predates this remediation session.

- 2026-07-27T18:00:00Z – claude (implementer, node-norris) – **Digest-fix
  remediation on top of F-3/A1 (`d502427` on lane-e,
  `fix(spec-kitty-profile): correct §7.3 fixture header misquote (F-3) +
  drop non-schema _comment keys (A1)`), landed as lane-e commit `e53e2a4`
  (`fix(spec-kitty-profile): correct stale digests folded into F-3's header
  edit`).**

  **This entry supersedes the two recomputed-digest values recorded above
  at lines 344 and 413** (`c3734807cf8967130f0ece027257c4962c65f6aabf802c
  201f5d70eb280b2578` for `projection-hash-drift.agent.yaml`'s own bytes,
  and `53e6d5e8e50fbd082c30e64e73298362cb608374b49a989c98a0f14c09d48490`
  for `outputs/hash-drift.md`). Both were accurate when this WP's original
  F-1/F-2 remediation captured them, and both were carried over verbatim,
  unrecomputed, into `projection-hash-drift.agent.yaml`'s header by
  `d502427`'s F-3 rewrite of that same header — which is exactly the class
  of defect F-3 itself was raised to fix (a header making a false factual
  claim about a file it names), reintroduced by F-3's own fix.

  **What was wrong, and what was done about it:**

  1. `projection-hash-drift.agent.yaml`'s header claimed its own real
     sha256 was `c3734807...b280b2578`. That value is stale (d502427
     rewrote this very header, changing this file's bytes) and,
     independent of staleness, **unfixable by construction**: a file
     cannot correctly quote its own digest — recording the true value
     changes the bytes and re-invalidates the claim, a fixed point no edit
     can reach. **Removed outright, not corrected** — the header now
     states plainly that no self-digest is recorded and why, rather than
     substituting a new value that would only go stale again at the next
     edit.
  2. The same header claimed `outputs/hash-drift.md`'s real sha256 was
     `53e6d5e8...c09d48490`. `outputs/hash-drift.md` is a separate file,
     untouched by d502427 or by this fix, so a correct value here is
     stable. Recomputed independently two ways — `sha256sum
     fixtures/skprofile/broken/projection/outputs/hash-drift.md` and a
     from-scratch Node `createHash("sha256")` re-implementation of rubric
     §7.2/§7.3's projection-drift algorithm driven against
     `broken-projection-manifest.yaml` — both agree:
     `ba652c9944928a73cbf70f4fdb0144ee1517d29497797972039ce15f3228b807`.
     **Corrected the header to this value** (preferred over deleting it,
     per the operator's guidance: this digest lives in a different, stable
     file, so a maintainer pasting it into `file_hash` gets the real
     discrimination-control signal rather than a silently-wrong one).
  3. **Advisory, also applied**: `projection-manifest.json`'s
     `source_hash` for the `projection-output-missing` entry
     (`070d48f2d1f56913d200bfaa4515473a934c17349957ea055700ff4fae81d14e`)
     went stale in the same commit — d502427 also rewrote
     `projection-output-missing.agent.yaml`'s header text (correcting its
     own quoted `output_path` literal), which changed that file's bytes to
     a real sha256 of
     `64b658baf947825b837cd9d96c031b82a72072b3cf8480bb3cf513f6b45bdb8c`.
     Non-behavioral (§7.3 is gated on `output_path` existing, which for
     this entry it does not, so no spurious warning was ever at risk) but
     the field read as an intentional real digest while being silently
     wrong. **Decision: zeroed it** (`0000...0000`, 64 hex digits) to match
     its sibling `file_hash` field's existing all-zero placeholder in the
     same entry, rather than pinning it to `64b658ba...` — pinning would
     recreate the identical fixed-point trap one file removed (this
     manifest field records another file's hash; any future edit to that
     file's header text goes stale again with no comment support in JSON
     to flag it for re-pinning). Zeroing removes the trap entirely at zero
     behavioral cost.

  **Sweep of every remaining factual claim under `broken/projection/`**
  (the same check applied file-by-file, not just to the two corrected
  claims): `projection-hash-drift.agent.yaml`'s quoted `output_path`
  literal and its "DOES exist on disk" claim — true (verified against
  `projection-manifest.json` and the filesystem).
  `projection-output-missing.agent.yaml`'s quoted `output_path` literal and
  its "does NOT exist on disk" claim — true (verified the same way;
  `output-missing-does-not-exist.md` confirmed absent). `outputs/hash-
  drift.md`'s claim that its own real sha256 "deliberately does NOT match"
  the manifest's recorded `file_hash` — true (`deadbeef...` vs.
  `ba652c99...`), and its `../../../projection-manifest.json` relative-path
  claim — true (three levels up from `outputs/hash-drift.md` resolves to
  `fixtures/skprofile/projection-manifest.json`). No other digest or path
  claim about file contents/bytes remains in `broken/projection/`.

  **Regression re-verification** (independent driver: WP01/WP02's real
  exported check functions — `loadSkProfileManifest`/
  `resolveSkProfileManifestPaths`/`validateManifest`/`loadProfileSet`/
  `checkSchemaConformance`/`checkHandoffs`/`checkReferences`/
  `checkContextSources`/`checkIdentity` — plus the from-scratch
  §7.2/§7.3 projection-drift re-implementation described above; uncommitted
  scratch script, deleted after use, never inside `owned_files` or
  `src/`):

  - `fixtures/skprofile/broken-manifest.yaml` → `TOTAL FINDINGS: 13`,
    `errors=12 warnings=1 ok=false` — unchanged.
  - `fixtures/skprofile/manifest.yaml` → `TOTAL FINDINGS: 2`, both
    `reference-not-activated(warning)` (`architect`, `planner`),
    `errors=0 warnings=2 ok=true` — unchanged.
  - `fixtures/skprofile/broken-activation-manifest.yaml` → `TOTAL
    FINDINGS: 1`, `(manifest) -> activation-config-unrecognized-shape
    (warning)`, `errors=0 warnings=1 ok=true` — unchanged.
  - `examples/skprofile/manifest.yaml` → `TOTAL FINDINGS: 0`, `errors=0
    warnings=0 ok=true` — unchanged.
  - `fixtures/skprofile/broken-projection-manifest.yaml` → `TOTAL
    FINDINGS: 2`: `projection-output-missing(error)` +
    `projection-hash-drift(warning)`, the latter's own driver output
    reporting `recorded=deadbeef...deadbeef actual=ba652c99...b807` —
    independently re-confirming this entry's corrected digest via a
    second, different code path (Node `crypto.createHash`, not the
    `sha256sum` CLI used for the header text itself). `errors=1 warnings=1
    ok=false` — unchanged.

  `pnpm build` → exit 0. `pnpm typecheck` → exit 0. `pnpm test` → exit 0,
  `164 passed (164)` test files, `3531 passed | 3 skipped (3534)` tests —
  identical totals to the F-1/F-2 entry above (fixture/comment-only change,
  no `src/` file touched). `tests/unit/invariants.test.ts` (including
  NI-002) re-run directly: `2 passed (2)` files, `12 passed (12)` tests.

  **CLI-deferral restated (still true after this fix):** this WP still has
  no CLI to run — `muster skprofile run` and `projection.ts` are WP03's
  deliverables and do not exist on this WP's dependency chain. The
  independent Node `createHash` re-implementation above is not WP03's own
  `projection.ts`; WP03's own T020 real-CLI verification remains the actual
  proof of live behavior.

  No file outside `owned_files` (`fixtures/skprofile/**`,
  `examples/skprofile/**`) was touched on lane-e for this fix; this
  Activity Log entry itself is the only planning-repo change made as part
  of it.
