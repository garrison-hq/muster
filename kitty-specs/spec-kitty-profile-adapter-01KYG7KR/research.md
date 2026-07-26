# Research: Spec-Kitty Agent-Profile Static Conformance Adapter

Ground-truth verification pass against the real upstream artifacts (schema,
18 shipped profiles, `.kittify/config.yaml`, `.kittify/agent_profiles_manifest.json`)
plus the two reference adapters this mission follows (`memory-utilization`,
`skills`). Every decision below closes a genuine gap between the literal
FR-001 manifest-type text and what a working implementation needs — the spec
deliberately deferred these to planning (see spec.md Dependencies &
Assumptions, "deferred vocabulary note").

---

## R1 — `cases[]` semantics (manifest-shape gap)

**Decision**: `cases[]` is a **named report-grouping filter**, not an
independent-run partition and not a skills-style expectation gate.

```ts
interface SkProfileCase {
  readonly id: string;
  readonly profileId?: string; // omitted = the whole profile set
}
```

Case results are a pure filtered view over one shared, whole-graph finding
set: `case.findings = allFindings.filter(f => case.profileId === undefined || f.profileId === case.profileId)`.
Overall `ok` is computed once, directly from `allFindings` (`ok := no finding
has severity "error"`), independent of case coverage.

**Rationale**: FR-001 lists `profilesDir`/`schemaPath`/`activationConfigPath`/
`projectionManifestPath` at the manifest's top level (singular, not per-case),
which means there is exactly **one** profile graph per manifest — unlike
`memory-utilization` (each case is a fully independent 3-arm run with its own
fixture) or `skills` (each case is an independent skill directory with no
cross-case relationship). Here, the schema/handoff/reference/context-source/
identity/projection checks are inherently **graph-wide**: resolving
`architect-alphonso`'s `handoff-to: [planner]` requires seeing every other
profile in the set, regardless of which "case" either belongs to. A
partitioning or independent-expectations design (mirroring `skills`'
`expectations.ok`) would either force every case to redundantly re-load the
whole graph, or would silently under-check profiles not named by any case —
directly contradicted by the spec's own edge case: *"An `*.agent.yaml` file
present in `profilesDir` but not referenced by any `cases[]` entry: still
schema-checked and included in the cross-profile graph... even if no explicit
case targets it individually."* That sentence only makes sense if cases can
name individual profiles while the graph checks run regardless — which is
exactly what the grouping-filter design gives for free, with no separate
bookkeeping.

**Alternatives considered**:
- *Skills-style `expectations.ok` per case* (rejected): would require the
  overall exit code to reconcile "did this case's actual outcome match its
  declared expectation" against "is the whole graph clean" — two different
  pass/fail definitions that could disagree, and no AC in spec.md ever reads
  a `report.cases[].expectations` field; Scenario 11 only asserts `exitCode
  === 1` and inspects `findings[].kind` directly. Expectations would be
  unused complexity.
- *Memory-utilization-style independent per-case runs* (rejected): breaks
  the graph-wide nature of every FR-003..007 check; a handoff edge or
  directive reference must resolve against the *entire* `profilesDir`, not a
  case-scoped subset.

---

## R2 — `doctrineRoot`: a manifest field FR-001 omits but FR-004/FR-005 require

**Decision**: add `doctrineRoot: string` (required, resolved relative to the
manifest file like `profilesDir`) to the manifest type, beyond the literal
FR-001 field list.

**Rationale**: FR-004 ("`directive-references[].code`/`tactic-references[].id`
resolve to existing doctrine files") and FR-005 ("context-sources... exist on
disk") both need to know *where* doctrine files live. Verified against the
real upstream layout
(`/home/jeroennouws/dev/spec-kitty-conformance/src/doctrine/`): directives,
tactics, toolguides, and styleguides are separate sibling trees
(`directives/built-in/`, `tactics/built-in/**` recursively, `toolguides/
built-in/`, `styleguides/built-in/`) — not nested under `agent_profiles/`.
Without a root to resolve against, FR-004/FR-005 are unimplementable for any
`profilesDir` that isn't hard-coded to this one machine's install path. This
mirrors the mission's own prior correction (`schemaSha` was added to FR-001
post-spec-gate for the identical reason: a check the FRs require had no field
to carry its input). C-004 already anticipates a muster-local doctrine
fixture tree existing (`fixtures/skprofile/doctrine/`), which needs exactly
this field to be addressable.

**Resolution algorithm** (filename-only; never parses doctrine YAML content —
out of scope per spec.md: *"this mission only checks that references
resolve, not that the referenced doctrine is well-formed"*):

| Reference | Resolves against | Match rule |
|---|---|---|
| `directive-references[].code` / `context-sources.directives[]` (e.g. `"001"`) | `<doctrineRoot>/directives/**/*.directive.yaml` | filename **starts with** `"<code>-"` (verified: `001-architectural-integrity-standard.directive.yaml`) |
| `tactic-references[].id` / `context-sources.tactics[]` (e.g. `"development-bdd"`) | `<doctrineRoot>/tactics/**/*.tactic.yaml` (recursive — verified tactics nest under subdirectories, e.g. `tactics/built-in/architecture/development-bdd.tactic.yaml`) | filename stem **equals** `id` |
| `context-sources.toolguides[]` | `<doctrineRoot>/toolguides/**/*.toolguide.yaml` | filename stem equals id (verified: `contextive.toolguide.yaml`) |
| `context-sources.styleguides[]` / `styleguide-references[].id` | `<doctrineRoot>/styleguides/**/*.styleguide.yaml` | filename stem equals id |

**Alternatives considered**: infer `doctrineRoot` implicitly from
`profilesDir`'s directory shape (e.g. assume `profilesDir` sits at
`<root>/agent_profiles/built-in`). Rejected: fragile, undocumented magic that
breaks the moment a muster-local fixture tree doesn't mirror the upstream
directory shape exactly; an explicit field is one line in the manifest and
removes the ambiguity entirely.

---

## R3 — Activation-config format: state clearly which shape is read

**Decision**: `activationConfigPath` (when supplied) is parsed as YAML and
must expose **flat top-level keys** `activated_directives: string[]` and
`activated_tactics: string[]`. This is the shape verified in this repo's own
`.kittify/config.yaml`. The adapter does not attempt to auto-detect or
normalize a differently-nested shape (e.g. a hypothetical
`.kittify/charter/charter.yaml`).

**Rationale**: the mission brief flags that spec-kitty's own repo is
"mid-migration" to `.kittify/charter/charter.yaml` and instructs "tolerate
both locations or state clearly which it reads" — an explicit OR. No shipped
copy of the second shape's actual key nesting was available to verify (only
its *existence* as a migration target is asserted, not its schema), so
committing to an unverified shape risks silently mis-reading it. Per the
Technical Facts' own permitted alternative, this plan states clearly: point
`activationConfigPath` at any YAML file exposing the two flat keys above; a
project using the newer charter-nested location must pre-flatten it or
generate a compatible shim. muster's own `.kittify/config.yaml` — the
verified real-world case FR-004 cites (19/26 directives activated) — already
satisfies this directly.

**Match rule difference (important, verified from real data)**:
`activated_directives` entries are **slugs** (`"001-architectural-integrity-
standard"`), not bare codes, while `directive-references[].code` is a bare
code (`"001"`). So activation membership uses the **same prefix-match** rule
as on-disk resolution (R2's table): `activated_directives.some(slug =>
slug.startsWith(code + "-"))`. `activated_tactics` entries are exact tactic
ids (`"acceptance-test-first"`) and match `tactic-references[].id` by exact
equality — consistent with R2's tactic resolution rule. This symmetry (the
same code-prefix trick resolves both on-disk files and activation-slug
membership) is a useful implementation simplification worth keeping in one
shared helper.

**Shape-validation (post-plan-gate correction — resolved, not accepted, risk)**:
committing to the flat `.kittify/config.yaml` shape above creates a silent
under-coverage failure mode if `activationConfigPath` instead points at a
`charter.yaml`-shaped project (the shape spec-kitty's own repo is
mid-migration toward): the file parses as valid YAML, but exposes neither
`activated_directives` nor `activated_tactics` at the top level, so every
reference would silently read as "not activated" indistinguishably from a
project that has activated nothing. This is closed, not accepted: when
`activationConfigPath` is supplied, the adapter validates that the parsed
top-level YAML object exposes **at least one** of `activated_directives` /
`activated_tactics`. If neither key is present, the run emits a dedicated
`activation-config-unrecognized-shape` finding (severity: warning) **exactly
once per run** (not once per reference) — explicitly distinct from the case
where the file *does* expose one of those keys but its array is genuinely
empty (that case activation-gates normally: every reference resolves as
found-but-inactive via `reference-not-activated`, with no shape complaint).
This is a structural, whole-manifest check, so it runs once at
activation-config load time, not once per profile/reference.

---

## R4 — Ajv schema draft: the upstream schema requires Ajv2020, not default Ajv

**Decision**: import `Ajv2020` from `ajv/dist/2020.js`, not plain `new
Ajv()`, applying to it the same `.default ?? AjvModule` interop idiom
`src/adapters/openclaw-sop/manifest.ts` already uses for its own Ajv import
(`const Ajv = (AjvModule as any).default ?? AjvModule`). *(Post-plan-gate
citation correction: `openclaw-sop` itself validates against draft-07 using
plain default `Ajv`, not `ajv/dist/2020` — it is precedent only for the
`.default ?? AjvModule` CJS/ESM interop idiom, not for the 2020-draft entry
point. The `ajv/dist/2020` choice below is independently verified correct
against the upstream schema's own `$schema` header, not by house
precedent.)*

**Rationale**: verified `agent-profile.schema.yaml`'s own header:
`$schema: https://json-schema.org/draft/2020-12/schema`. Ajv 8.x's default
export only supports draft-07 out of the box; draft 2020-12 requires the
`ajv/dist/2020` entry point. muster already depends on `ajv@^8.17.1`
(`package.json`), which ships this entry point. This is a genuine
implementation pitfall worth flagging now — `new Ajv()` against this schema
would throw or silently mis-validate `$ref`/`definitions` resolution
depending on Ajv's strict-mode defaults.

---

## R5 — Projection-drift hash algorithm (verified against real SK source)

**Decision**: both `source_hash` and `file_hash` are **SHA-256 hex digests of
raw UTF-8 file bytes**, no normalization, no line-ending handling.

**Rationale**: verified directly against SK's own projector implementation
(`spec-kitty-conformance/src/specify_cli/tool_surface/profiles/manifest.py`):
`hash_content(content) = sha256(content.encode("utf-8")).hexdigest()`, and
`hash_file` calls the identical fingerprint function on file bytes. Confirmed
against the real manifest on disk (`.kittify/agent_profiles_manifest.json`):
every `source_hash`/`file_hash` value is exactly 64 hex characters (SHA-256).
Node's `crypto.createHash("sha256").update(content, "utf8").digest("hex")`
reproduces this exactly — no new dependency needed.

**Matching key**: manifest entries are matched to a locally-loaded profile by
`profile_urn === "agent_profile:" + profile.profileId"` (verified format from
the real manifest: `"profile_urn": "agent_profile:architect-alphonso"`) —
**never** by comparing `entry.source_path` literally, because that field
records the path on the machine that *ran the projector* (verified: it points
at spec-kitty-cli's own installed package directory, e.g.
`/home/jeroennouws/.local/share/uv/tools/spec-kitty-cli/lib/...`), which will
essentially never equal this adapter's `profilesDir`. Re-hashing the
*locally-loaded* profile file and comparing against the manifest's recorded
`source_hash` is the whole point of independent re-verification (spec.md
Dependencies & Assumptions: "independent re-verification inside muster
catches SK-doctor regressions").

**Design call — profile with no manifest entry**: FR-007's literal text
("missing output → error") is read to also cover a local profile that has
**no** matching `profile_urn` entry in the projection manifest at all (never
projected) — treated identically to a matched entry whose `output_path` is
missing on disk. Both surface as `projection-output-missing` (error),
matching SK doctor's `native-agent-profile-missing` severity precedent cited
by the spec.

**Byte-stability scope note**: the real
`.kittify/agent_profiles_manifest.json` bakes in **absolute, machine-specific**
`output_path`/`source_path` values (verified). NFR-001's byte-stable-across-
machines guarantee therefore applies only to the muster-local
`fixtures/skprofile/` manifests (fixture-relative paths throughout, portable
by construction) — the mandatory real-CLI run against the actual 18 SK
profiles (binding constraint 5) is a one-off demonstration of "it works on
real artifacts," not a byte-stability assertion, and quickstart.md must say
so explicitly to avoid a false BYTE-STABLE claim over machine-specific input.

---

## R6 — Finding-kind vocabulary (WP04 authoritative; this is the starting draft)

Per spec.md's own note, the finding-kind vocabulary is WP04's deliverable in
`spec-kitty-profile-taxonomy.md`, and WP02 must sequence after WP04's drafts
exist. This plan proposes the initial vocabulary so `data-model.md` and the
finding-shape contract have a concrete shape to commit to; WP04 owns the
final §-clause prose and WP02 reconciles wording against it (already recorded
as a same-mission ordering note in spec.md, not a lane dependency).

| Kind | Severity | FR | Rubric §-area (WP04 to finalize) |
|---|---|---|---|
| `schema-conformance-violation` | error | FR-002 | schema conformance |
| `profile-parse-error` | error | (robustness — malformed YAML syntax, not a required fixture) | n/a — never cited, structural |
| `handoff-unresolved` | error | FR-003 | handoff-graph resolution |
| `handoff-asymmetric` | warning | FR-003 | handoff-graph symmetry |
| `reference-unresolved` | error | FR-004 | doctrine-reference resolution |
| `reference-not-activated` | warning | FR-004 | doctrine-reference vs activation set |
| `activation-config-unrecognized-shape` | warning | FR-004 (R3 shape-validation correction) | doctrine-reference vs activation set — activation config present but exposes neither `activated_directives` nor `activated_tactics`; emitted once per run, distinct from a recognized-but-empty activation config |
| `context-source-missing` | error | FR-005 | context-sources integrity |
| `profile-id-illegal` | error | FR-006 | profile-id-as-filename legality |
| `profile-id-filename-mismatch` | error | FR-006 | profile-id-as-filename legality |
| `profile-id-collision` | error | FR-006 (edge case) | profile-id-as-filename legality |
| `projection-output-missing` | error | FR-007 | projection-drift (mirrors `native-agent-profile-missing`) |
| `projection-hash-drift` | warning | FR-007 | projection-drift (mirrors `native-agent-profile-drift`) |

**Discrimination-control mapping (Scenario 11)**: dangling handoff role →
`handoff-unresolved`; unresolvable directive code → `reference-unresolved`;
id≠filename → `profile-id-filename-mismatch`. These three are the minimum
`fixtures/skprofile/broken/` must rig; SC-002 additionally requires at least
one broken fixture per lint class, so the broken set also needs one fixture
each producing `schema-conformance-violation`, `context-source-missing`,
and — for the optional projection-drift class — `projection-output-missing`/
`projection-hash-drift` when a broken projection manifest fixture is
supplied.

---

## R7 — `source.normative` construction for schema findings (housekeeping judgment)

**Decision**: `source.normative` for `schema-conformance-violation` findings
is built as:

```
https://github.com/Priivacy-ai/spec-kitty/blob/${schemaSha}/src/doctrine/schemas/agent-profile.schema.yaml
```

— a hardcoded, compile-time upstream repo-relative path constant
(`src/doctrine/schemas/agent-profile.schema.yaml`, SK's own stable layout,
verified) combined with the **manifest-supplied** `schemaSha`. This matches
FR-002's own worked example exactly and is a standard GitHub `/blob/<ref>/
<path>` URL — `<ref>` is a SHA, not a literal `@`-joined path segment.

**Housekeeping judgment (spec.md:150, D5 prose)**: D5's prose phrase
`agent-profile.schema.yaml@<SHA>` is **not** genuinely misleading and needs
no edit. A reader reaches FR-002 (line 90, in the Requirements table) well
before D5 (line 150, in Dependencies & Assumptions), and FR-002 already spells
out the literal, unambiguous URL construction with a worked example. By the
time a reader hits D5's shorthand, `pkg@sha`-style shorthand for "the pinned
artifact at that SHA" (a widely-understood convention — see `npm`'s own
`pkg@version` syntax, and this same repo's `skillsAdapter.specVersion =
"agentskills.io@5d4c1fda..."` string, which is exactly this shorthand used as
a literal value, not a path segment) reads naturally as descriptive prose,
not as an instruction to embed `@<SHA>` inside a file path. No change made.

---

## R8 — No `ChatClient` / `RunOptions` divergence from the `memory-utilization` template

**Decision**: `SpecKittyProfileAdapter.run(manifest, options?: RunOptions)`
where `RunOptions` is reserved-but-currently-empty (`interface RunOptions {}`)
— no `client`/`endpoint` field.

**Rationale**: this capability has **no behavioral half** at all (unlike
`memory-utilization`, which is "C-002 non-runtime but every case grades live
transcripts" and therefore *requires* a `ChatClient`). Every spec-kitty-
profile check is static YAML/JSON file comparison. Carrying a mandatory
`ChatClient` parameter the checks never call would be a false signature. The
`(manifest, options)` **shape** is kept identical to the `memory-utilization`
template per D1's explicit instruction ("factory + `run(manifest, {client})`
returning an `AdapterResult`") so the CLI wiring and adapter-instantiation
pattern stay uniform across manifest-runner adapters — only the options
object's *content* differs, which is exactly the kind of adapter-local
variation the shape is designed to tolerate (`skills`' `resolve()` similarly
returns an always-empty `EffectiveConfig` because skills have no cross-file
composition).

---

## R9 — CLI global `--mode`/`--json` are program-level, not adapter-specific

**Decision**: `skprofile run` is wired exactly like `memory-utilization run`
and `skills run` — the subcommand accepts `GlobalOpts` (inherited
`--mode`/`--json` defined once on `program`, verified at
`src/cli/index.ts:1589-1597`) and passes them through via
`cmd.optsWithGlobals()`. `--mode` (`strict`/`permissive`) is accepted but
unused by this adapter's checks, identical to how `memory-utilization`
accepts-but-ignores it (Soul.md RFC-1 strict/permissive semantics do not
apply to schema/handoff/reference/identity/projection lints). FR-008's
"global `--mode`/`--json`" phrasing is confirmed to mean exactly this
inheritance, not a new mode dimension this adapter must define.
