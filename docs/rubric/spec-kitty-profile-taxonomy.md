---
version: "1.0.0"
date: "2026-07-27"
status: "normative"
---

# Spec Kitty Agent-Profile Static Conformance Taxonomy

## Introduction

This document is muster's **own published source of record** for every static
check class the `spec-kitty-profile` adapter (`src/adapters/spec-kitty-profile/`)
implements against Spec Kitty `*.agent.yaml` agent profiles. It exists because
the charter's cite-a-source rule ("every check cites a normative source,
upstream **or ours**") requires a citable target for six check classes, and
only one of them — schema conformance — has a genuine upstream artefact to
delegate to. Spec Kitty's profile *format* has a real schema
(`agent-profile.schema.yaml`); Spec Kitty does **not** publish a normative
specification for how a *set* of profiles must relate to one another (handoff
graphs, doctrine-reference resolution, activation gating, filename identity,
projection-drift severities). muster fills that gap here, exactly as it
already does for the SOP, memory-utilization, tools, and heartbeat layers.

Every clause below carries a stable id (`§X.Y`) and exactly one provenance
tag:

- **`[NORMATIVE]`** — traceable to a genuine upstream authority: the pinned
  `agent-profile.schema.yaml` itself, or a documented Spec Kitty `doctor`
  severity precedent, or a real filesystem constraint that is not a matter of
  house style.
- **`[CONVENTION]`** — a verified-but-not-upstream-mandated practice: a
  resolution rule inferred from the real on-disk doctrine layout, not from
  any written Spec Kitty specification of that layout.
- **`[MUSTER-OWN]`** — muster's own interpretive reading or judgment call,
  with no upstream precedent at all.

No clause in this document invents an upstream authority that does not
exist; per the `memory-utilization-taxonomy.md` precedent, honesty about
provenance is the point of tagging at all. Every finding emitted by the
`spec-kitty-profile` adapter must resolve `source.normative` to one of the
clause ids below (FR-009); see "Citation Format for Emitted Findings" at the
end of this document. The document is versioned; any change to check
semantics increments the version and is a breaking change for callers
pinning a clause id + version pair.

---

## §1 Schema Conformance

### §1.1 Delegation to the Upstream Schema

**[NORMATIVE]**

Every `*.agent.yaml` file in a manifest's `profilesDir` must validate against
`agent-profile.schema.yaml` as fetched/vendored at the manifest's own
`schemaSha` — the adapter delegates this check's normativity entirely to
that upstream JSON Schema document (draft 2020-12); this rubric does not
restate the schema's own field-level rules. A finding's `source.normative`
for this class is **not** a clause id in this document; it is the literal
resolvable upstream reference:

```
https://github.com/Priivacy-ai/spec-kitty/blob/<schemaSha>/src/doctrine/schemas/agent-profile.schema.yaml
```

`<schemaSha>` is supplied by the manifest's `schemaSha` field, never inferred
or hardcoded — an upstream schema change is a deliberate, reviewed version
bump of the manifest's pinned SHA, never a silent behavior change underneath
a fixed manifest. This is the canonical reference for a human reader even
though the adapter's own `schema.ts` module does not read this document at
runtime — it delegates directly to the vendored schema file.

**Finding kind**: `schema-conformance-violation`.

---

## §2 Structural Parse Robustness

### §2.1 Malformed Profile YAML — No Rubric Clause, By Design

**[MUSTER-OWN]** (a design choice about the taxonomy's own scope, not a
grading rule)

A `*.agent.yaml` file that fails to parse as YAML at all is a structural
robustness signal, not a doctrine judgment call: there is no meaningful
"which rule did this violate" question to answer when the file could not be
read as a document in the first place. This taxonomy therefore deliberately
does **not** define a §-clause for this condition, and the corresponding
finding kind does not carry a `source.normative` citation into this
document at all — the adapter emits it with a fixed, non-rubric literal
string instead (`src/adapters/spec-kitty-profile/index.ts`). A profile that
fails to parse still surfaces this finding (error severity) and still
participates in filename/collision checks by its stem — it is never
silently dropped from the run ("errored counts as failed, never silently
skipped").

**Finding kind**: `profile-parse-error` — the one finding kind with no
citable clause anywhere in this document.

---

## §3 Handoff-Graph Resolution and Symmetry

### §3.1 Role-Name Resolution Semantics

**[MUSTER-OWN]**

`collaboration.handoff-to`, `collaboration.handoff-from`, and
`collaboration.works-with` entries are **role names**, not profile-ids. This
is muster's own interpretive reading of the `collaboration` fields — Spec
Kitty's schema and documentation do not state this typing explicitly, but it
is verified directly against the shipped built-in profile set (e.g.
`architect-alphonso` hands off to the role names `planner` and
`implementer`, not to any profile-id string). A role name `r` declared by
profile A resolves iff at least one **other** profile B in the same
`profilesDir` declares `r` in its own `role`/`roles` field (scalar `role` is
folded into a one-element `roles` array for this comparison). A role held by
more than one profile resolves against **any** match — uniqueness is never
required. Absence of a declared handoff entry is never itself a finding;
only a *declared* entry that fails to resolve is.

An unresolved role name is a hard failure: a downstream consumer following
`handoff-to` has nowhere to route the handoff, which is a structural break
in the collaboration graph, not a style nit.

**Finding kind**: `handoff-unresolved` (error). `path` =
`collaboration.<field>[<i>]`.

### §3.2 Handoff Symmetry

**[MUSTER-OWN]** — rationale: this clause is a deliberate **mitigation** for
§3.1's interpretive risk, not an independent upstream rule, so it inherits
§3.1's tag rather than being demoted to `[CONVENTION]`; a symmetry
expectation that exists only because muster chose the role-typing reading
above should not read as more independently authoritative than the reading
it depends on.

For each role `r` in profile A's `handoffTo` that **does** resolve to some
set of holder profiles `{B}` (§3.1), symmetry holds iff **at least one** `B`
in that set lists any of A's declared roles in its own `handoffFrom`. If no
holder reciprocates, this is reported as a **warning**, not an error: an
asymmetric handoff is very plausibly an intentional one-directional
routing relationship (A escalates to B, but B never hands work back to A),
so the taxonomy treats it as worth surfacing but not as a structural break
the way an unresolved role is. `works-with` has no symmetric counterpart in
this taxonomy — only `handoff-to`/`handoff-from` form a directed pair that
symmetry can meaningfully be asked of.

**Finding kind**: `handoff-asymmetric` (warning). `path` =
`collaboration.handoff-to[<i>]`.

---

## §4 Doctrine-Reference Resolution

### §4.1 On-Disk Existence Resolution

**[CONVENTION]**

`directive-references[].code` and `tactic-references[].id` must resolve to
a real file under the manifest's `doctrineRoot`. Spec Kitty does not publish
a written specification of its doctrine-tree layout; this taxonomy's match
rules are muster's own verified-against-the-real-repository convention
(directives, tactics, toolguides, and styleguides are separate sibling
trees under `doctrineRoot`, not nested under the profiles directory):

| Reference | Resolves against | Match rule |
|---|---|---|
| `directive-references[].code` (e.g. `"001"`) | `<doctrineRoot>/directives/**/*.directive.yaml` | filename **starts with** `"<code>-"` |
| `tactic-references[].id` (e.g. `"development-bdd"`) | `<doctrineRoot>/tactics/**/*.tactic.yaml` (recursive) | filename stem **equals** `id` |

This taxonomy only checks that a reference **resolves** to an existing file
on disk — it never parses or validates the *content* of the referenced
doctrine file; content validation is a different mission's domain.

**Finding kind**: `reference-unresolved` (error). `path` =
`directive-references[<i>].code` or `tactic-references[<i>].id`.

### §4.2 Doctrine-Reference vs the Activation Set

**[MUSTER-OWN]**

When a manifest supplies `activationConfigPath`, a reference that resolves
on disk (§4.1) is checked a second time against that project's activated
subset. muster reads a flat top-level shape —
`activated_directives: string[]` and `activated_tactics: string[]` — because
that is the shape verified in a real, shipped `.kittify/config.yaml`; this
is muster's own committed reading of an unversioned, mid-migration upstream
format (Spec Kitty's own repository is in the process of migrating toward a
differently-nested `.kittify/charter/charter.yaml` shape whose actual key
nesting was not available to verify at the time this taxonomy was written).
Activation membership uses the same code-prefix trick as on-disk resolution:
`activated_directives` entries are slugs (`"001-architectural-integrity-
standard"`), so membership is `activated_directives.some(slug =>
slug.startsWith(code + "-"))`; `activated_tactics` entries are exact tactic
ids, matched by equality. A reference that resolves on disk but is not in
the activated set is a **warning**, never an error — the doctrine exists and
is simply not switched on for this project, which is expected, real-world
behavior (muster's own project activates 19 of 26 directives).

When `activationConfigPath` is omitted entirely, this stage is skipped and
every unresolved reference from §4.1 is an error either way — there is no
activated-set to soften the verdict against.

**Finding kind**: `reference-not-activated` (warning). `path` =
`directive-references[<i>].code` or `tactic-references[<i>].id`.

### §4.3 Activation-Config Shape Validation — Loud Failure

**[MUSTER-OWN]**

Committing to the flat shape in §4.2 creates a silent under-coverage risk if
`activationConfigPath` instead points at a differently-shaped file (for
example, a project already migrated to the nested `charter.yaml` shape):
the file parses as valid YAML, but exposes neither `activated_directives`
nor `activated_tactics` at its top level, and every reference would
otherwise silently read as "not activated" — indistinguishable from a
project that has genuinely activated nothing. This taxonomy closes that gap
explicitly: when `activationConfigPath` is supplied, the adapter validates
that the parsed top-level YAML object exposes **at least one** of
`activated_directives` / `activated_tactics` before running §4.2 at all. If
**neither** key is present, the run emits exactly **one**
`activation-config-unrecognized-shape` finding, **once per run** — never
once per reference — and every reference-lint stage still runs, degrading
gracefully to "no reference is activated" for that run.

This is explicitly distinct from a recognized activation config whose
arrays are present but genuinely empty: that case activation-gates normally
(every reference reports `reference-not-activated` per §4.2), with no shape
complaint at all. A naive per-reference emission of this finding is a
correctness bug in an implementation of this clause, not an acceptable
reading of it.

**Finding kind**: `activation-config-unrecognized-shape` (warning).
`profileId` = `"(manifest)"`. `path` = `"activationConfigPath"`.

---

## §5 Context-Sources Integrity

### §5.1 On-Disk Existence, Never Activation-Gated

**[CONVENTION]**

`context-sources.{directives,tactics,toolguides,styleguides}[]` entries must
exist on disk, resolved by the same file-layout match rules as §4.1
(directives by code-prefix, everything else by exact filename-stem match
against `<doctrineRoot>/toolguides/**/*.toolguide.yaml` and
`<doctrineRoot>/styleguides/**/*.styleguide.yaml` respectively). Unlike
§4.1's references, a `context-sources` entry is **never** activation-gated —
there is no warning tier here, only "exists" or "missing." A profile
declares its context sources as material it actually loads at
initialization time, which is a stronger, unconditional claim than a
directive/tactic *reference*; there is no sense in which an unactivated
context source is a softer violation the way an unactivated reference is.

**Finding kind**: `context-source-missing` (error). `path` =
`context-sources.<kind>[<i>]`.

---

## §6 Profile-Id-as-Native-Filename Legality

### §6.1 Legal Character Set and Length

**[NORMATIVE]**

A profile's `profile-id` must match `^[a-z0-9-]+$` and be at most 64
characters. This is not a style preference: the `profile-id` becomes the
literal filename stem of the profile's projected native artefact
(`.claude/agents/<id>.md`), so an illegal id is a real filesystem
constraint violation — an id containing characters illegal in a portable
filename, or long enough to risk truncation on some filesystems, cannot
safely become that file.

**Finding kind**: `profile-id-illegal` (error). `path` = `"profile-id"`.

### §6.2 Filename-Stem Match

**[NORMATIVE]**

A profile's `profile-id` must equal the YAML file's own basename with the
`.agent.yaml` suffix removed (`fileNameStem` in `AgentProfile`). This is the
same native-filename constraint as §6.1 applied in the other direction: if
the declared id does not match the file it lives in, then either the
source file or its own projected `.claude/agents/<id>.md` artefact is named
wrong relative to the other — a hard violation, not a naming-convention
nit, because a human or tool navigating by filename would resolve the wrong
identity.

**Finding kind**: `profile-id-filename-mismatch` (error). `path` =
`"profile-id"`.

### §6.3 Cross-Profile Collision

**[NORMATIVE]**

Two profiles in the same `profilesDir` must not declare the same
`profile-id`, even if each is independently legal under §6.1 and
self-consistent under §6.2. A collision is reported as a **distinct**
finding from a filename mismatch — both are id-legality concerns, but they
are different violations: a mismatch is one profile disagreeing with its
own file, while a collision is two different profiles racing to become the
same projected `.claude/agents/<id>.md` file. The same native-filename
reasoning as §6.1/§6.2 makes this a hard constraint: two source files cannot
both legitimately own one output filename.

**Finding kind**: `profile-id-collision` (error). `path` = `"profile-id"`.

---

## §7 Projection-Drift Semantics

### §7.1 Matching Rule — `profile_urn`, Never `source_path`

**[NORMATIVE]** — traceable to Spec Kitty's own projector implementation and
its `doctor` command's matching behavior, independently verified against the
real `.kittify/agent_profiles_manifest.json` on disk.

A locally-loaded `AgentProfile` is matched to a
`.kittify/agent_profiles_manifest.json` entry by
`entry.profile_urn === "agent_profile:" + profile.profileId` — **never** by
comparing `entry.source_path` literally. `source_path` records the path on
the machine that *ran* Spec Kitty's projector (verified: it points at that
machine's own installed package directory), which will essentially never
equal this adapter's local `profilesDir`; matching on it would make the
check spuriously fail on every machine other than the one that produced the
manifest. Both `source_hash` and `file_hash` are SHA-256 hex digests of raw
UTF-8 file bytes (`sha256(bytes).hexdigest()`, verified against Spec Kitty's
own `hash_content`/`hash_file` functions) — no line-ending normalization, no
text canonicalization. The adapter recomputes both hashes independently
from the locally-loaded files and compares them to the manifest's recorded
values; re-verifying independently of Spec Kitty's own `doctor` command is
the entire purpose of this check class (an independent re-verification
catches regressions in `doctor` itself, not only regressions in the source
profiles).

### §7.2 Missing Output — Error

**[NORMATIVE]** — mirrors Spec Kitty `doctor`'s own
`native-agent-profile-missing` severity.

A local profile with **no** matching `profile_urn` entry in the projection
manifest at all (never projected), or a matching entry whose `output_path`
does not exist on disk, is reported identically: the projected native
artefact this profile is supposed to have does not exist where the manifest
says it should. This is an error, mirroring the severity Spec Kitty's own
`doctor` assigns to the same missing-output condition.

**Finding kind**: `projection-output-missing` (error). `path` =
`"projectionManifestPath"` (manifest-level) or the profile's own identity
when a matched-but-missing `output_path` is at fault.

### §7.3 Hash Drift — Warning

**[NORMATIVE]** — mirrors Spec Kitty `doctor`'s own
`native-agent-profile-drift` severity.

A matching entry whose `output_path` exists, but whose independently
recomputed `source_hash` and/or `file_hash` (§7.1) differ from the values
recorded in the manifest, is reported as a warning, not an error: the
projected artefact exists and is at least stale rather than absent, which
Spec Kitty's own `doctor` treats as the softer of its two severities for
this check family. The finding message names which hash(es) differed
(`source_hash`, `file_hash`, or both), so a reviewer does not have to
recompute both to learn which side drifted.

This entire class is **skipped**, not merely vacuously passing, when the
manifest omits `projectionManifestPath` — there is no projection artefact
to independently re-verify in that configuration.

**Finding kind**: `projection-hash-drift` (warning). `path` = the profile's
own identity (the specific source or output file whose hash differed).

---

## Discrimination Controls Policy

Every check class in this document is a **deterministic, static** function
of file contents — schema validation, filename-pattern matching, on-disk
existence, and byte-hash comparison. No check class defined here involves a
language-model judge, so the bias-mitigation machinery `sop-rule-
taxonomy.md`'s judge-required classes need (order-swap, rubric anchoring)
does not apply to any clause in this document.

The discrimination-control obligation for this taxonomy is instead a
**fixture-suite** responsibility: `fixtures/skprofile/broken/` (owned by the
work package that authors muster-local fixtures) must rig at least one
violation per lint class defined above, so that a checker returning
`ok: true`/exit `0` against that rigged set is provably indistinguishable
from a checker that never ran its lints — and is therefore caught by the
fixture suite that asserts against it, not merely trusted to work. §3.1's
`handoff-unresolved`, §4.1's `reference-unresolved`, and §6.2's
`profile-id-filename-mismatch` are the three discrimination-control fixtures
this rubric's own governing specification names explicitly as the required
minimum; every other error-severity clause above (§1.1, §5.1, §6.1, §6.3,
§7.2) additionally needs at least one rigged fixture of its own for full
per-class coverage, and §3.2/§4.2/§4.3/§7.3's warning-severity clauses need
at least one fixture each that resolves-but-warns rather than errors, to
prove the warning/error split is real and not a single undifferentiated
failure signal.

---

## Citation Format for Emitted Findings

Every `SkProfileFinding` emitted by the `spec-kitty-profile` adapter must
carry a `source.normative` string resolving to one of two shapes:

1. **Schema findings** (`schema-conformance-violation` only): the literal
   GitHub blob URL constructed in §1.1 —
   `https://github.com/Priivacy-ai/spec-kitty/blob/<schemaSha>/src/doctrine/schemas/agent-profile.schema.yaml`.
2. **Every other citable finding kind**: a string of the form

   ```
   muster spec-kitty-profile rubric §X.Y (<short label>) — docs/rubric/spec-kitty-profile-taxonomy.md
   ```

   where `§X.Y` matches a clause heading in this document verbatim (e.g.
   `§3.1`, `§7.3`).

`profile-parse-error` (§2.1) is the sole exception: it carries no citation
into this document at all. The adapter emits it with a fixed, non-rubric
literal `source.normative` string instead — this is a deliberate,
documented departure from the citation contract above, not an oversight; a
lint that expects every finding kind to resolve into this document's clause
ids must special-case this one kind exactly as `schema-conformance-
violation` is special-cased for shape (1) above.

A finding whose `source.normative` does not resolve to one of these three
shapes (schema URL, `§X.Y` clause string, or the documented
`profile-parse-error` literal) is a defect in the adapter's citation wiring,
mirroring the SOP adapter's `source.normative` enforcement precedent
(`docs/rubric/sop-rule-taxonomy.md`, "Citation Format for Manifest
Entries").
