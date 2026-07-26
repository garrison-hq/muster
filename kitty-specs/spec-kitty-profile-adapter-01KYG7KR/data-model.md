# Data Model: Spec-Kitty Agent-Profile Static Conformance Adapter

Entities for `src/adapters/spec-kitty-profile/`. Resolution algorithms and the
design calls behind fields not literally spelled out in spec.md's FR-001 are
in `research.md` (R1, R2, R5); this document is the settled shape.

## Entities

### SkProfileManifest

The adapter's single input document (FR-001, extended per R1/R2).

```ts
interface SkProfileManifest {
  readonly version: string;
  readonly profilesDir: string;          // dir of *.agent.yaml files, relative to manifest
  readonly schemaPath: string;           // vendored agent-profile.schema.yaml, relative to manifest
  readonly schemaSha: string;            // upstream commit SHA the schema was vendored from (FR-002)
  readonly doctrineRoot: string;         // dir containing directives/, tactics/, toolguides/, styleguides/ (R2)
  readonly activationConfigPath?: string; // YAML exposing activated_directives/activated_tactics (R3)
  readonly projectionManifestPath?: string; // .kittify/agent_profiles_manifest.json-shaped file (FR-007)
  readonly cases: readonly SkProfileCase[];
}
```

All paths resolve relative to the manifest file's own directory (matches
`memory-utilization`/`skills` path-resolution convention).

### SkProfileCase

A named report-grouping filter (R1) — not an independent run, not an
expectation gate.

```ts
interface SkProfileCase {
  readonly id: string;
  readonly profileId?: string; // omitted = whole profilesDir set
}
```

`validateManifest` throws (manifest error, exit 2) on: empty `cases`,
duplicate `case.id`, or a `case.profileId` that resolves to no profile after
the profile set loads — a malformed manifest must fail fast and loudly, never
silently under-report (mirrors `memory-utilization`'s `validateCase`).

### AgentProfile

The parsed subset of a `*.agent.yaml` file the cross-profile lints need
(schema conformance validates the *whole* raw YAML object separately, before
this narrower shape is built).

```ts
interface AgentProfile {
  readonly filePath: string;         // absolute path to the source *.agent.yaml
  readonly fileNameStem: string;     // basename without .agent.yaml (FR-006 comparison target)
  readonly profileId: string;        // profile-id field, "" if absent/invalid at this layer
  readonly roles: readonly string[]; // normalized: role (scalar) folded into a 1-element array, or roles[]
  readonly handoffTo: readonly string[];
  readonly handoffFrom: readonly string[];
  readonly worksWith: readonly string[];
  readonly directiveRefs: readonly string[];   // directive-references[].code
  readonly tacticRefs: readonly string[];      // tactic-references[].id
  readonly toolguideRefs: readonly string[];   // toolguide-references[].id
  readonly styleguideRefs: readonly string[];  // styleguide-references[].id
  readonly contextSources: {
    readonly directives: readonly string[];
    readonly tactics: readonly string[];
    readonly toolguides: readonly string[];
    readonly styleguides: readonly string[];
  };
  readonly parseError?: string; // set when the YAML failed to parse; all other fields are defaults
}
```

A profile whose YAML fails to parse still gets an `AgentProfile` record
(`parseError` set, all list fields empty) so it participates in profile-id
collision/filename checks (still has a `fileNameStem`) but never resolves as
a handoff/reference target for other profiles — "errored counts as failed,
never silently skipped" (BRIEF.md carried-over constraint 4, read onto the
static path as "a profile that fails to load surfaces a `profile-parse-error`
finding, never disappears from the run").

### HandoffEdge (conceptual, not a stored type — computed at check time)

`collaboration.handoff-to`/`handoff-from`/`works-with` are role-name edges
(NOT profile-id edges — verified: architect-alphonso hands off to `planner`,
`implementer`, both role names). Resolution and symmetry rules (FR-003):

- **Resolution** (`handoff-to`, `handoff-from`, `works-with` alike): a role
  name `r` declared by profile A resolves iff at least one *other* profile B
  declares `r` in `B.roles`. Unresolved → `handoff-unresolved` (error),
  `path` = `collaboration.<field>[<i>]`.
- **Symmetry** (`handoff-to` only, against `handoff-from`): for each role `r`
  in `A.handoffTo` that *does* resolve to some set of holder profiles `{B}`,
  symmetry holds iff **at least one** `B` in that set has any of `A.roles` in
  `B.handoffFrom`. If none reciprocate → `handoff-asymmetric` (warning).
  `works-with` has no symmetric counterpart in this rubric (spec.md only
  defines the A→B/B←A asymmetry for `handoff-to`/`handoff-from`).
- Absence of a declared entry is never itself a finding (spec.md edge case).

### ReferenceTarget (conceptual)

`directive-references[].code` / `tactic-references[].id` (FR-004), resolved
in two stages:

1. **On-disk existence** against `doctrineRoot` (R2's filename-match table).
   Not found → `reference-unresolved` (error).
2. **Activation membership**, only when `activationConfigPath` is supplied
   (R3's prefix/exact-match rules). Found-but-inactive → `reference-not-
   activated` (warning). When `activationConfigPath` is absent, this stage
   is skipped entirely — every unresolved reference is an error either way
   (spec.md edge case).

### ContextSource (conceptual)

`context-sources.{directives,tactics,toolguides,styleguides}[]` (FR-005) —
same on-disk resolver as `ReferenceTarget` stage 1, **never** activation-
gated (FR-005 defines only "missing → error"; there is no warning tier for
context-sources, unlike directive/tactic references). Not found →
`context-source-missing` (error).

### ProjectionEntry

One `schema_version: 1` entry from `.kittify/agent_profiles_manifest.json`
(9 fields, verified against the real manifest on disk):

```ts
interface ProjectionEntry {
  readonly profile_urn: string;        // "agent_profile:<profile-id>"
  readonly source_layer: string;
  readonly tool_key: string;
  readonly output_path: string;
  readonly format: string;
  readonly file_hash: string;          // sha256 hex of output_path's bytes
  readonly source_path: string;        // NOT used for matching (R5) — provenance only
  readonly source_hash: string;        // sha256 hex of the source *.agent.yaml's bytes
  readonly projection_version: number;
}
```

Matched to a local `AgentProfile` by `profile_urn === "agent_profile:" +
profile.profileId`. Both hashes are recomputed independently by this adapter
(R5) and compared:

- No matching entry, OR entry's `output_path` missing on disk →
  `projection-output-missing` (error).
- Matching entry, `output_path` exists, but recomputed `source_hash` and/or
  `file_hash` differ from the entry's recorded values →
  `projection-hash-drift` (warning) — message names which hash(es) differed.
- Otherwise: clean, no finding.

Skipped entirely when `projectionManifestPath` is omitted (spec.md: "only
when `projectionManifestPath` is supplied; otherwise this class is
skipped").

### SkProfileFinding

```ts
type SkProfileFindingKind =
  | "schema-conformance-violation"
  | "profile-parse-error"
  | "handoff-unresolved"
  | "handoff-asymmetric"
  | "reference-unresolved"
  | "reference-not-activated"
  | "context-source-missing"
  | "profile-id-illegal"
  | "profile-id-filename-mismatch"
  | "profile-id-collision"
  | "projection-output-missing"
  | "projection-hash-drift";

interface SkProfileFinding {
  readonly kind: SkProfileFindingKind;
  readonly profileId: string;   // "(manifest)" for manifest/schema-load-level findings not tied to one profile
  readonly path: string;        // e.g. "collaboration.handoff-to[0]", "profile-id", "directive-references[2].code"
  readonly message: string;
  readonly severity: "error" | "warning";
  readonly source: { readonly normative: string }; // schema+SHA URL (FR-002) or rubric §clause (FR-003..007)
}
```

Local type, not a reuse of `src/core/report.ts`'s `Violation` — this adapter
does not implement `SpecAdapter` (D1) so there is no contractual reason to
match that shape, but the field *names* (`path`/`message`/`severity`) are
kept identical to `Violation`'s for cross-codebase readability. This mirrors
`openclaw-sop`'s own locally-defined `SOPLintFinding` (which also does not
reuse `Violation`), not `skills`' reuse (which is required there only because
`skillsAdapter` *does* implement `SpecAdapter`).

### AdapterResult / Report

```ts
interface SkProfileCaseResult {
  readonly caseId: string;
  readonly profileId?: string;
  readonly findings: readonly SkProfileFinding[]; // filtered view (R1) — no independent pass/fail per case
}

interface AdapterResult {
  readonly ok: boolean;                    // true iff no finding has severity "error", across the WHOLE graph
  readonly summary: string;
  readonly findings: readonly SkProfileFinding[]; // authoritative, ungrouped, whole-graph finding set
  readonly cases: readonly SkProfileCaseResult[]; // report-organization view only
}
```

The CLI layer (`src/cli/index.ts`) wraps `AdapterResult` into the emitted
JSON report, adding `rubricDocPath` and `exitCode` — same separation of
concerns as `memory-utilization`'s `buildMemoryUtilizationReport`:

```ts
interface SkProfileReport {
  readonly ok: boolean;
  readonly summary: string;
  readonly rubricDocPath: string;  // "docs/rubric/spec-kitty-profile-taxonomy.md"
  readonly exitCode: 0 | 1 | 2;
  readonly findings: readonly SkProfileFinding[];
  readonly cases: readonly SkProfileCaseResult[];
}
```

## Exit-code contract (FR-008)

| Code | Meaning |
|---|---|
| `0` | `adapterResult.ok === true` — no error-severity finding anywhere in the graph. |
| `1` | `adapterResult.ok === false` — at least one error-severity finding. |
| `2` | The manifest file (or `projectionManifestPath`, when supplied) could not be read/parsed, or `profilesDir`/`schemaPath`/`doctrineRoot`/`activationConfigPath` is declared but missing at the structural level — the adapter's own `run()` throws (`ExecutionError`, same pattern as `memory-utilization`/`skills`). Never triggered by a per-profile issue inside `profilesDir` (a malformed individual `*.agent.yaml` is a `profile-parse-error` finding → exit 1 territory, not 2). |

## Flow

`manifest` → load + validate → load `profilesDir` into `AgentProfile[]`
(parse-error-tolerant) → run six independent check modules over the whole
set (schema, handoff, references, context-sources, identity, projection —
projection only if `projectionManifestPath` given) → concatenate into one
`findings[]` → group into `cases[]` per `SkProfileCase.profileId` (report
view only) → `AdapterResult` → CLI wraps into `SkProfileReport` with
`exitCode`.

## Module → entity ownership (maps to Implementation Concern Map in plan.md)

| Module | Owns |
|---|---|
| `manifest.ts` | `SkProfileManifest`, `SkProfileCase`, `validateManifest` |
| `profile.ts` | `AgentProfile`, YAML loading, profile-set loader |
| `schema.ts` | schema-conformance check (Ajv2020, R4) |
| `handoff.ts` | handoff-graph resolution + symmetry |
| `references.ts` | directive/tactic reference resolution + activation gating |
| `context-sources.ts` | context-sources on-disk integrity |
| `identity.ts` | profile-id legality, filename match, collision |
| `projection.ts` | `ProjectionEntry` matching + hash recomputation |
| `findings.ts` | `SkProfileFinding`, `SkProfileFindingKind`, `err()`/`warn()` helpers |
| `rubric.ts` | rubric doc path constant + `source.normative` citation strings (content sourced from WP04's taxonomy doc — same-mission ordering note) |
| `index.ts` | `SpecKittyProfileAdapter` (factory + `run()`), orchestration |
