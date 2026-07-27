---
version: "1.2.0"
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

**Version note (1.1.0)**: this revision remediates a rejected review of the
1.0.0 draft. No clause id, check semantics, or finding-kind mapping changed.
The fixes are entirely provenance and completeness: §7.1's matching-rule
provenance is corrected (it is muster's own improvement over upstream's
`output_path` keying, not a traced upstream behavior); §6.1/§6.2's
`[NORMATIVE]` tags are corrected to disclose where muster's rule diverges
from (and is looser than) the actual upstream pattern, and §6.2 is retagged
`[CONVENTION]`; the Citation Format section gains the clause-id → label
table and the pinned `profile-parse-error` literal that §2.1/"Citation
Format for Emitted Findings" always described but never spelled out; the
Discrimination Controls Policy gains a clean-fixture control; §7.2 states
that `output_path` is accepted in both absolute and repo-relative form.

**Version note (1.2.0)**: this revision resolves a self-contradiction the
1.1.0 fix introduced: the former §6.1 ("Legal Character Set and Length")
carried both `[NORMATIVE]` (for the character-set floor) and `[CONVENTION]`
(for the `≤64` length ceiling) on one clause, violating this document's own
Introduction rule that every clause carries exactly one provenance tag. The
former §6.1 is split into §6.1 (Legal Character Set, `[NORMATIVE]`) and §6.2
(Length Ceiling, `[CONVENTION]`); the former §6.2 (Filename-Stem Match) is
renumbered §6.3 and the former §6.3 (Cross-Profile Collision) is renumbered
§6.4. No check semantics or finding-kind changed — `profile-id-illegal`
still fires for the same two conditions, now cited via two clause ids
instead of one. The clause-id → label table and all in-document
cross-references to the former §6.2/§6.3 are updated accordingly.

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
| `toolguide-references[].id` | `<doctrineRoot>/toolguides/**/*.toolguide.yaml` (recursive) | filename stem **equals** `id` |
| `styleguide-references[].id` | `<doctrineRoot>/styleguides/**/*.styleguide.yaml` (recursive) | filename stem **equals** `id` |

This taxonomy only checks that a reference **resolves** to an existing file
on disk — it never parses or validates the *content* of the referenced
doctrine file; content validation is a different mission's domain.
`toolguide-references`/`styleguide-references` get this on-disk resolution
stage only — they are never activation-gated (§4.2 is directive/tactic-only
per FR-004), so an unresolved toolguide/styleguide reference is always this
finding kind, never `reference-not-activated`.

**Finding kind**: `reference-unresolved` (error). `path` =
`directive-references[<i>].code`, `tactic-references[<i>].id`,
`toolguide-references[<i>].id`, or `styleguide-references[<i>].id`.

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

### §6.1 Legal Character Set

**[NORMATIVE]**

A profile's `profile-id` must match `^[a-z0-9-]+$`. Upstream's own schema
pins a **stricter, narrower** pattern — `^[a-z][a-z0-9-]*$`, requiring the
first character to be a letter
(`src/doctrine/schemas/agent-profile.schema.yaml`'s `profile-id` property).
muster's `^[a-z0-9-]+$` is honestly disclosed here as **looser** than
upstream on the leading character — it accepts `-x` or `9x`, which
upstream's own pattern rejects — so this clause does not add a new
constraint upstream lacks; §1.1's schema-conformance delegation already
enforces upstream's stricter pattern, and this clause's character-set
portion is a restatement of a real filesystem floor (the `profile-id`
becomes the literal filename stem of `.claude/agents/<id>.md`, so
characters illegal in a portable filename are a genuine constraint) that
happens to be looser than, not stricter than, what §1.1 already catches.

**Finding kind**: `profile-id-illegal` (error). `path` = `"profile-id"`.

### §6.2 Length Ceiling

**[CONVENTION]**

A profile's `profile-id` must be at most 64 characters. This ceiling has
**no upstream basis at all** (upstream declares no `maxLength`) and no
filesystem basis either (the POSIX filename-component limit is 255, not
64) — it is muster's own `[CONVENTION]` for human/tool navigability (a
shorter id is easier to read in a terminal, a log line, or a file
listing), not a constraint any real filesystem requires. It is tagged
separately from §6.1 because the two sub-rules do not share a provenance:
the character set traces (loosely) to a genuine upstream pattern, the
length ceiling does not trace to anything upstream or filesystem-mandated
at all.

**Finding kind**: `profile-id-illegal` (error). `path` = `"profile-id"`.
Both §6.1 and §6.2 share this finding kind — see "Citation Format for
Emitted Findings" below for how a citing implementation picks between the
two clause ids.

### §6.3 Filename-Stem Match

**[CONVENTION]**

A profile's `profile-id` must equal the YAML file's own basename with the
`.agent.yaml` suffix removed (`fileNameStem` in `AgentProfile`). This is
**not** a hard filesystem-conflict constraint the way §6.1/§6.4 are: Spec
Kitty itself builds a profile's projected output path from the **declared**
`profile-id`, not from the source filename
(`_PATH_PATTERN = ".claude/agents/{profile_id}.md"`,
`src/specify_cli/tool_surface/providers/agent_profiles.py:64`), and its own
profile loader keys the in-memory profile registry by declared id as well
(`self._profiles[profile.profile_id] = profile`,
`src/doctrine/agent_profiles/repository.py:486`) — never by the source
file's basename. A stem mismatch therefore produces **no** filesystem
conflict anywhere in Spec Kitty's own pipeline: two files can disagree with
their own declared ids and still each project cleanly. This clause exists
for human/tool navigability instead — a source file whose name does not
match the id it declares is confusing to a person or script that expects to
find `foo-bar.agent.yaml` when they already know `profile-id: foo-bar`, even
though nothing downstream actually breaks.

**Finding kind**: `profile-id-filename-mismatch` (error). `path` =
`"profile-id"`.

### §6.4 Cross-Profile Collision

**[NORMATIVE]**

Two profiles in the same `profilesDir` must not declare the same
`profile-id`, even if each is independently legal under §6.1 and §6.2 and
self-consistent under §6.3. A collision is reported as a **distinct**
finding from a filename mismatch — both are id-legality concerns, but they
are different violations: a mismatch is one profile disagreeing with its
own file, while a collision is two different profiles racing to become the
same projected `.claude/agents/<id>.md` file. The same native-filename
reasoning as §6.1/§6.2/§6.3 makes this a hard constraint: two source files
cannot both legitimately own one output filename.

**Finding kind**: `profile-id-collision` (error). `path` = `"profile-id"`.

---

## §7 Projection-Drift Semantics

### §7.1 Matching Rule — `profile_urn`, Never `source_path`

**[MUSTER-OWN]** — the matching *key* is muster's own deliberate improvement
over upstream's own keying, not a traced upstream behavior. Spec Kitty
itself keys its projection manifest by **`output_path`**, not by
`profile_urn`: `ProfileManifest` stores and looks up entries via
`self._entries[str(entry.output_path)]`
(`src/specify_cli/tool_surface/profiles/manifest.py:71,75,79`), and the
`providers/agent_profiles.py` surface-instance construction reads
`native.output_path` the same way
(`src/specify_cli/tool_surface/providers/agent_profiles.py:209-214`). There
is no Spec Kitty `doctor` precedent that matches by `profile_urn` for this
adapter to delegate to. muster deliberately matches by `profile_urn`
instead, because muster's own live manifest
(`.kittify/agent_profiles_manifest.json`) stores an absolute `source_path`
pointing into a machine-specific `uv tool` install directory — matching on
`source_path` (or, symmetrically, on an absolute `output_path` recorded by
a different machine) would make the check spuriously fail on every machine
other than the one that produced the manifest, while `profile_urn` is
derived from the portable `profile-id` and is stable across machines. This
divergence from upstream's own keying is the point, not an oversight.

What genuinely **is** traceable to upstream, and independently verified, is
the *shape* of the two fields this check compares once a match is found:
`entry.profile_urn === "agent_profile:" + profile.profileId` matches Spec
Kitty's own `profile_urn` construction
(`src/doctrine/agent_profiles/repository.py`'s `_profile_urn`), and both
`source_hash` and `file_hash` are SHA-256 hex digests of raw UTF-8 file
bytes (`sha256(bytes).hexdigest()`, verified against Spec Kitty's own
`hash_content`/`hash_file` functions) — no line-ending normalization, no
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

**`output_path` resolution**: both an absolute and a repo-relative
`output_path` are accepted, resolved relative to the manifest file's own
parent directory's parent (the project root) when relative. Spec Kitty's
own writer relativizes `output_path` on save
(`relativize_under_root(entry.output_path, project_root)`,
`src/specify_cli/tool_surface/profiles/manifest.py:112`) while keeping the
in-memory/lookup-key form absolute — but this is not the only form actually
observed in the wild: muster's own live
`.kittify/agent_profiles_manifest.json` stores `output_path` as a fully
absolute path (e.g.
`/home/.../muster/.claude/agents/architect-alphonso.md`), not a
repo-relative one. Both forms are therefore accepted inputs to this check,
not just the one upstream's own writer currently produces.

**Finding kind**: `projection-output-missing` (error). `path` =
`"projectionManifestPath"` unconditionally — both the no-matching-entry case
and the matched-but-missing-`output_path` case report the same literal
manifest-level path, never the profile's own identity.

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

**Finding kind**: `projection-hash-drift` (warning). `path` =
`"projectionManifestPath"` unconditionally — the finding message (not
`path`) names which hash(es) differed; `path` does not vary by which side
drifted or by profile identity.

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
`handoff-unresolved`, §4.1's `reference-unresolved`, and §6.3's
`profile-id-filename-mismatch` are the three discrimination-control fixtures
this rubric's own governing specification names explicitly as the required
minimum; every other error-severity clause above (§1.1, §5.1, §6.1, §6.2,
§6.4, §7.2) additionally needs at least one rigged fixture of its own for full
per-class coverage, and §3.2/§4.2/§4.3/§7.3's warning-severity clauses need
at least one fixture each that resolves-but-warns rather than errors, to
prove the warning/error split is real and not a single undifferentiated
failure signal.

A violation-only fixture suite is not, by itself, sufficient: a checker
that **always** returns a non-passing verdict — regardless of input — would
pass every rigged-violation fixture above without ever having run a single
lint correctly. This taxonomy therefore also requires a **clean-fixture
control**: a fully valid `profilesDir` (every profile schema-conformant,
every handoff resolved and symmetric, every reference resolved and
activated, every context source present, every id legal/matched/unique,
and — when a `projectionManifestPath` is supplied — every projection
present with matching hashes) that the adapter must run against and report
`ok: true` / exit `0` for. A checker that fails this fixture despite it
being genuinely clean is broken in the opposite direction from the
always-fail case, and only the pairing of both controls (rigged-violation
fixtures that must fail, and this clean fixture that must pass) actually
proves the checker is discriminating rather than trivially constant.

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

`<short label>` is not free text left to the caller's judgment — it is
fixed per clause id, one row per finding kind, covering all 13 kinds in
`SkProfileFindingKind`:

| Finding kind | Clause id | `<short label>` |
|---|---|---|
| `schema-conformance-violation` | §1.1 | *(cited via the schema URL, shape 1 above — never via this `§X.Y (<short label>)` form)* |
| `profile-parse-error` | §2.1 | *(no clause citation at all — see the pinned literal below)* |
| `handoff-unresolved` | §3.1 | handoff resolution |
| `handoff-asymmetric` | §3.2 | handoff symmetry |
| `reference-unresolved` | §4.1 | doctrine-reference resolution |
| `reference-not-activated` | §4.2 | doctrine-reference activation |
| `activation-config-unrecognized-shape` | §4.3 | doctrine-reference activation |
| `context-source-missing` | §5.1 | context-sources integrity |
| `profile-id-illegal` | §6.1/§6.2 | profile-id-as-filename legality |
| `profile-id-filename-mismatch` | §6.3 | profile-id-as-filename legality |
| `profile-id-collision` | §6.4 | profile-id-as-filename legality |
| `projection-output-missing` | §7.2 | projection drift |
| `projection-hash-drift` | §7.3 | projection drift |

For example, `handoff-unresolved`'s citation string is exactly `muster
spec-kitty-profile rubric §3.1 (handoff resolution) —
docs/rubric/spec-kitty-profile-taxonomy.md`. Two clause ids (§4.2/§4.3 and
§6.1/§6.2/§6.3/§6.4) share one label each because their finding kinds are
siblings under the same §-area — a shared label is not a defect, the clause
id (`§X.Y`) is what disambiguates the citation, not the label. `§6.1/§6.2`
is a distinct case from the others: it is one finding kind
(`profile-id-illegal`) mapped to *two* clause ids rather than two finding
kinds sharing one label. A citing implementation resolves this by checking
which sub-rule actually failed: cite §6.1 when the `^[a-z0-9-]+$` character
set is violated, §6.2 when the id is otherwise legal but exceeds 64
characters. The two sub-rules were split into separate clauses specifically
so each keeps its own unambiguous provenance tag ([NORMATIVE] for §6.1,
[CONVENTION] for §6.2) rather than one clause carrying both.

`profile-parse-error` (§2.1) is the sole exception: it carries no citation
into this document at all. The adapter emits it with a fixed, non-rubric
literal `source.normative` string instead — this is a deliberate,
documented departure from the citation contract above, not an oversight.
That literal is pinned here, verbatim, so WP02's `RUBRIC_CITATION` map (and
any lint asserting against it) can special-case this exact value rather
than an unstated placeholder:

```
structural: malformed *.agent.yaml
```

A lint that expects every finding kind to resolve into this document's
clause ids must special-case this one kind exactly as `schema-conformance-
violation` is special-cased for shape (1) above.

A finding whose `source.normative` does not resolve to one of these three
shapes (schema URL, `§X.Y` clause string, or the documented
`profile-parse-error` literal) is a defect in the adapter's citation wiring,
mirroring the SOP adapter's `source.normative` enforcement precedent
(`docs/rubric/sop-rule-taxonomy.md`, "Citation Format for Manifest
Entries").
