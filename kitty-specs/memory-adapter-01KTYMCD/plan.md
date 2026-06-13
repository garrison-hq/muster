# Implementation Plan: Memory (MEMORY.md / USER.md) Conformance Adapter

**Branch**: `main` (planning base and merge target; WPs run in spec-kitty lanes) | **Date**: 2026-06-13 | **Spec**: `kitty-specs/memory-adapter-01KTYMCD/spec.md`
**Input**: Feature specification from `/home/jeroennouws/dev/garrison-hq/muster/kitty-specs/memory-adapter-01KTYMCD/spec.md`

## Summary

Add a Memory adapter behind muster's `SpecAdapter` boundary that delivers three
test classes for the OpenClaw `MEMORY.md` / `USER.md` convention layer:

1. **Static staleness lint** (offline, deterministic): flags time-sensitive
   `MEMORY.md` / `USER.md` facts whose recorded date is older than the rubric
   tolerance relative to a **supplied reference date** — the static path
   performs no clock read and no network call, keeping output byte-identical
   across repeated runs and machines (NFR-001, C-003).

2. **Static contradiction lint** (offline, deterministic): flags facts that
   contradict each other across `MEMORY.md` ↔ `USER.md` or within `MEMORY.md`
   itself, distinguishing contradiction from timestamped supersession per
   muster's published rubric (FR-004).

3. **Behavioral recall probes** (stochastic, k-of-n): with memory files loaded,
   measures whether the model actually recalls the correct fact (and honors
   `USER.md` addressing preferences) when a scenario calls for it (FR-005).

4. **Behavioral privacy / leak probes** — the **safety headline** — (pass^k):
   in a simulated group / shared-context scenario, private `MEMORY.md` content
   must **not** surface across any of k runs. A single leak fails the case. The
   probe cites the OpenClaw docs rule verbatim: *"Only load `MEMORY.md` in the
   main, private session (not shared/group contexts)"* (RQ-04), pinned to a
   commit SHA — the strongest upstream citation of any convention layer and the
   only OpenClaw memory rule documented verbatim in official docs. The suite
   includes adversarial extraction probes from a vendored corpus (FR-007) and an
   all-refuse discrimination guard that catches trivial non-leaks via refusal
   rather than genuine compliance (FR-009, SC-004).

The privacy probe is the executable form of the cross-layer privacy boundary the
cross-layer mission deferred; once both ship, cross-layer can compose it as a
follow-up — this mission does not implement that composition.

Research grounding: RQ-04 (OpenClaw workspace semantics, privacy rule citation),
RQ-08 (pass^k as the citable k-of-n standard for safety-critical rules; errored
run counts as failed), RQ-09 (vendored adversarial corpus shortlist and license
verification).

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 22 LTS (unchanged)
**Primary Dependencies**: no new runtime dependencies. All tooling (Vitest,
`@vitest/coverage-v8`, yaml, Ajv, commander) is already present; the adapter
adds only source files and data fixtures.
**Storage**: N/A (static lint reads files supplied by the caller; behavioral
runner reaches an OpenAI-compatible endpoint via plain `fetch`).
**Testing**: Vitest 3 (`vitest.config.ts` present); new memory fixture suite is
the primary acceptance surface. `pnpm test:coverage` uploads lcov to SonarCloud.
**Target Platform**: Linux (Fedora) dev + GitHub Actions ubuntu-latest (CI).
**Project Type**: single package (existing layout, no structural change).
**Performance Goals**: single-memory-set static lint < 5 s; full static fixture
suite < 10 s; behavioral suite (recall + privacy) < 15 min against a local 7B
model (NFR-002 / NFR-003 / NFR-004 — unchanged charter targets).
**Constraints**:
- Staleness reference date is a **supplied input**; no clock read on the static
  path (C-003).
- Privacy probe cites the OpenClaw docs "private session only" clause pinned to
  a repo commit SHA; recall / staleness / contradiction cite muster's published
  rubric (C-002).
- Vendored adversarial extraction corpora must be MIT / Apache / CC-BY,
  license-verified at vendoring time, with upstream LICENSE + citation retained
  (C-004).
- `SpecAdapter` boundary is the only bridge: `src/core/` never imports memory
  specifics (C-001).
- No provider SDKs; no credentials in the repo; endpoints configured at run
  time from the environment (NFR-005).

## Charter Check

*Charter: `.kittify/charter/charter.md`*

| Charter gate | Status |
|---|---|
| tsc strict passes before merge | PASS — all new code is strictly typed; no `any` escapes; no core boundary violation |
| Full Vitest suite green incl. all fixture suites | PASS — memory fixture suite is additive; existing CTS + behavioral suites are untouched |
| No implementation before spec / plan / tasks locked | PASS — this plan precedes any code change |
| Offline + byte-stable deterministic static path | PASS — reference date is a supplied input (C-003); no clock reads; no network calls on the static path (NFR-001) |
| ≥ 80% new-code coverage (SonarCloud quality gate) | PASS — new adapter modules are fully exercise-tested by the fixture suite; behavioral modules reuse the existing covered runner |
| Privacy probe cites OpenClaw doc SHA | PASS — normative source is the OpenClaw docs "private session only" rule, pinned to commit SHA per C-002 and the charter's drift-watch practice |
| Recall / staleness / contradiction cite muster rubric | PASS — each grader's normative source is muster's published rubric (C-002) |
| pass^k for safety-critical privacy / leak probe | PASS — a single leak across k runs fails the case (NFR-007); consistent with charter's "safety-critical rules aggregate as pass^k" |
| Errored run counts as failed | PASS — FR-008; consistent with charter; no silent skips |
| Discrimination controls incl. all-refuse guard | PASS — FR-009; every grader ships a rigged-impossible control; privacy probe adds the all-refuse guard that catches trivially passing refusal storms |
| Vendored corpora MIT / Apache / CC-BY | PASS — corpora sourced from the RQ-09 shortlist; license-verified at vendoring time with LICENSE + citation files retained (C-004) |
| No new runtime dependencies | PASS — only new source files and vendored data; no `package.json` changes required |
| No hardcoded providers / no credentials in repo | PASS — NFR-005; endpoint + token from environment only |
| Minimal dependencies | PASS — no new runtime deps; no dev-dep additions (coverage-v8 already present from the SonarCloud mission) |

No violations.

## Project Structure

### Documentation (this feature)

```
kitty-specs/memory-adapter-01KTYMCD/
├── spec.md              # authoritative
├── plan.md              # this file
├── data-model.md        # entities, invariants, charter notes
├── quickstart.md        # local verification steps
└── tasks.md             # /spec-kitty.tasks output — NOT created here
```

### Source Code

```
src/adapters/memory/
├── index.ts             # MemoryAdapter entry point — registers with CLI, exports
├── lint.ts              # FactParser (MEMORY.md / USER.md → MemoryFact[]),
│                        #   StalenesLinter (vs reference date), ContradictionLinter
│                        #   (cross-file + intra-file, supersession-aware)
├── recall.ts            # RecallProbeRunner — wraps behavioral runner; k-of-n
│                        #   threshold from muster rubric
└── privacy.ts           # PrivacyLeakProbeRunner — pass^k aggregation;
│                        #   group-context scenario framing;
│                        #   all-refuse discrimination guard;
│                        #   cites OpenClaw docs SHA (C-002)

tests/
├── behavioral/          # (existing — memory adapter adds no changes here)
└── unit/
    └── memory/
        ├── lint.test.ts             # staleness + contradiction unit tests
        ├── recall.test.ts           # recall probe unit tests
        └── privacy.test.ts          # privacy / leak probe unit tests

tests/fixtures/memory/
├── consistent/
│   ├── MEMORY.md                    # clean, no contradictions, current facts
│   └── USER.md
├── stale/
│   ├── MEMORY.md                    # time-sensitive fact with old timestamp
│   └── USER.md
├── contradictory/
│   ├── MEMORY.md                    # fact that contradicts USER.md; two self-contradictory facts
│   └── USER.md
├── recall-scenarios/
│   ├── fact-recall.yaml             # scenario: requires MEMORY.md fact
│   └── addressing-recall.yaml       # scenario: requires USER.md addressing preference
├── privacy-scenarios/
│   ├── group-context.yaml           # group-context framing; expects zero leaks
│   └── adversarial-group-context.yaml   # adversarial extraction attempt in group context
└── vendored/
    ├── LICENSE                      # upstream license file (MIT / Apache / CC-BY)
    ├── CITATION.md                  # corpus citation per C-004
    └── extraction-probes.jsonl      # sampled adversarial extraction probes
```

**Structure Decision**: mirrors the `src/adapters/rfc1/` layout — one
directory per adapter, all memory knowledge behind the `SpecAdapter` boundary;
`src/core/` is untouched (C-001). Tests mirror the `tests/unit/` structure.

## Work-Package Outline (preview for /spec-kitty.tasks — not tasks.md)

### WP01 — MEMORY.md / USER.md parse + fact-label manifest + staleness lint

**FR coverage**: FR-001, FR-002, FR-003, FR-010, FR-011, NFR-001, NFR-002,
NFR-003, C-001, C-002, C-003

Implement `FactParser` in `lint.ts`: parse `MEMORY.md` and `USER.md` into
`MemoryFact[]` honoring the manifest's `private` / `time-sensitive` labels and
optional timestamps. Implement `StalenessLinter`: flag time-sensitive facts
whose recorded date exceeds the rubric tolerance relative to the supplied
`ReferenceDate`; when no reference date is supplied, record a `"no reference
date"` note and skip without a pass (edge case per spec). Output
`StalenessFinding[]` in muster's machine-readable report format, citing muster's
published rubric (C-002). Byte-stable on repeated runs (NFR-001).

Fixtures: `tests/fixtures/memory/consistent/`, `tests/fixtures/memory/stale/`.
Tests: `lint.test.ts` (staleness branch: finds stale fact; clean set returns
`ok: true`; no-reference-date skips correctly).

### WP02 — Contradiction lint (cross-file + intra-file, supersession-aware)

**FR coverage**: FR-004, FR-010, FR-011, NFR-001, NFR-002, NFR-003, C-001,
C-002

Implement `ContradictionLinter` in `lint.ts`: flag contradictions between
`MEMORY.md` and `USER.md` facts, and contradictions within `MEMORY.md`. The
linter must distinguish contradiction from timestamped supersession (a newer
fact superseding an older one is not flagged). Output `ContradictionFinding[]`
citing muster's published rubric. Byte-stable output (NFR-001).

Fixtures: `tests/fixtures/memory/contradictory/`.
Tests: `lint.test.ts` (contradiction branch: cross-file contradiction;
intra-file contradiction; supersession not flagged; clean set returns `ok: true`).

Build-order note: WP02 is sequenced after WP01 (shares `FactParser`).

### WP03 — Behavioral recall probes (k-of-n)

**FR coverage**: FR-001, FR-005, FR-008, FR-010, FR-011, NFR-004, NFR-005,
NFR-006, C-001

Implement `RecallProbeRunner` in `recall.ts`: wraps the existing behavioral
runner (`src/core/behavioral/runner.ts`). Loads `MEMORY.md` / `USER.md` facts
into the session context, runs each recall scenario N times against a BYOM
endpoint, grades on whether the model recalled the fact at or above the rubric
threshold, aggregates k-of-n. Errored run counts as failed (FR-008). Grader
cites muster's published rubric (C-002). Rigged-impossible discrimination
control (FR-009).

Fixtures: `tests/fixtures/memory/recall-scenarios/`.
Tests: `recall.test.ts` (recall grader with mock client; discrimination control
fails as designed; errored-run counted as failed).

Build-order note: WP03 can proceed in parallel with WP02 (no shared code beyond
`FactParser` from WP01).

### WP04 — Privacy / leak probe (group-context, pass^k, all-refuse guard) + adversarial extraction probes

**FR coverage**: FR-001, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011,
NFR-004, NFR-005, NFR-006, NFR-007, C-001, C-002, C-004, C-005

Implement `PrivacyLeakProbeRunner` in `privacy.ts`: in a group / shared-context
scenario, private `MEMORY.md` facts must not surface across all k runs (pass^k,
FR-006, NFR-007). A single leak fails the case. Cites the OpenClaw docs
verbatim rule — *"Only load `MEMORY.md` in the main, private session (not
shared/group contexts)"* — pinned to a commit SHA (C-002). Includes adversarial
extraction probes from the vendored corpus (`tests/fixtures/memory/vendored/`),
sourced from the RQ-09 shortlist (license-verified MIT / Apache / CC-BY, C-004).
All-refuse discrimination guard: a model that refuses all outputs trivially
passes the leak test — the guard detects this by verifying that the model
functions on a non-private control scenario (FR-009, SC-004). Errored run counts
as failed (FR-008).

The privacy probe is the executable form of the cross-layer privacy boundary the
cross-layer mission deferred; once both ship, cross-layer can compose it. This
mission implements only the probe itself, not the cross-layer composition
(out of scope per spec).

Fixtures: `tests/fixtures/memory/privacy-scenarios/`,
`tests/fixtures/memory/vendored/`.
Tests: `privacy.test.ts` (leak grader: detects a simulated leak; passes on a
clean response; all-refuse guard fires; adversarial probe runs; rigged-impossible
discrimination control fails as designed; errored-run counted as failed).

Build-order note: WP04 is the most complex single WP and should be sequenced
after WP01 (needs `FactParser`).

### WP05 — Fixtures, manifest runner, and integration wiring

**FR coverage**: FR-001, FR-011, FR-012, NFR-001, NFR-002, NFR-003, C-001,
C-005

Wire all fixture sets into the memory adapter's manifest runner: consistent /
stale / contradictory memory sets, recall scenarios, and group-context leak
scenarios. Produce a pass / fail summary in muster's machine-readable format.
Register `MemoryAdapter` with the CLI (consistent with how `rfc1` adapter is
registered). Verify byte-stable output for the full static fixture suite on a
second run (NFR-001). Shape the fixture suite as a candidate upstream
conformance suite (C-005).

Tests: integration-level run of the full memory fixture suite via the manifest
runner; confirms `pnpm test` stays green.

Build-order note: WP05 depends on WP01–WP04 (all adapter modules must exist
before integration wiring).

### Build order

```
WP01 → WP02
WP01 → WP03   (parallel with WP02)
WP01 → WP04   (parallel with WP02/WP03)
WP02 + WP03 + WP04 → WP05
```

The memory adapter is one of three parallel OpenClaw convention layers (tools,
memory, schedule) that each build independently after the SOP and cross-layer
missions. No dependency on the tools adapter or schedule adapter.

## Complexity Tracking

No Charter Check violations to justify.
