# Implementation Plan: Cross-Layer Conformance (rule survival, precedence, contradiction lint)

**Branch**: `main` | **Date**: 2026-06-13 | **Spec**: `kitty-specs/cross-layer-conformance-01KTYKP2/spec.md`
**Input**: Feature specification from `/kitty-specs/cross-layer-conformance-01KTYKP2/spec.md`

## Summary

The headline feature of the v1-extended milestone's third layer: load multiple
agent-file layers (persona soul + SOP, optionally a skill) into one composed
context and verify they don't conflict. The mission delivers two test classes
over a **stack composition**:

1. **Static cross-layer contradiction/precedence lint** (offline, deterministic):
   detects direct contradictions between layers on the *resolved* composition
   and emits `cross-layer-contradiction`, `undefined-precedence`, or
   `resolved-by-precedence` findings, distinguishing refinements from true
   contradictions; circular precedence is a static error. Lint runs on the
   resolved composition — not raw files — so conflicts that only emerge after
   merge are caught (C-003). Methodology cites muster's published cross-layer
   rubric as the normative source, with the 2024–2026 literature as supporting
   evidence: within-context conflict detection from WIRE (rule extraction +
   satisfiability-style conflict witnesses, 35.4% joint compliance) and Arbiter
   (block-decomposition of real agent prompts, found 4 direct contradictions in
   Claude Code's own prompt) ground the static approach (research RQ-07).

2. **Behavioral rule-survival** (stochastic): establishes an SOP-alone
   compliance baseline over N runs, then runs the identical probes with a
   persona layer composed in and asserts the composed pass rate does not degrade
   beyond the rubric's tolerance. A drop means the persona is eroding the rule.
   Justification from the literature: persona assignment raises toxicity up to
   6× (Deshpande et al. 2023) and cuts refusal rates 50–70% (persona jailbreak
   studies); persona drift sets in around 8 turns (RQ-07). The grading model
   follows RQ-08's trace-decidability principle (binary trace-level for
   never-call-tool, tool-sequence, argument constraints; judge-backed for
   refusal quality with StrongREJECT rubric and order-swap mitigation) and
   adopts pass^k (tau-bench) as the citable conjunctive standard for
   safety-critical rules: a single composed violation across k runs fails the
   case. Errored runs count as failed (charter, RQ-08). Stylistic survival uses
   k-of-n.

**Key design decision**: this mission reuses the SOP adapter's probes, graders,
and rule manifest as the rule-survival probe set. It adds the baseline-vs-composed
comparison and the heterogeneous-layer context assembly — not new graders from
scratch. The composition resolution for the persona layer reuses the RFC-1
resolution machinery (`resolveCompositionDetailed`); composing across persona +
SOP + skill is a new context-assembly step, not a new merge algebra.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 22 LTS (unchanged)
**Primary Dependencies**: no new runtime deps; no new dev deps. Reuses:
`yaml` (AST-level parsing, already in package.json), `vitest` (test runner),
`@vitest/coverage-v8` (coverage, added by sonarcloud mission). Models reached
via plain `fetch` against OpenAI-compatible endpoints only (no provider SDKs).
**Storage**: YAML/JSON fixture files on disk; no database
**Testing**: Vitest; new cross-layer fixture suite (static + behavioral) is the
primary acceptance surface. All new code covered at ≥80% (new-code SonarCloud
gate). Static lint suite: < 10 s; behavioral suite: < 15 min against a local
7B model.
**Target Platform**: Linux (Fedora) dev + GitHub Actions ubuntu-latest (CI)
**Project Type**: single package (existing layout)
**Performance Goals**: single-composition lint < 5 s; full static suite < 10 s;
full behavioral suite < 15 min (charter benchmarks, NFR-002/003/004)
**Constraints**: spec-agnostic core never learns cross-layer specifics (C-001);
no credentials in repo (NFR-005); static path offline + byte-stable
deterministic / UTF-16 code-unit canonical ordering (NFR-001); compositions may
only include layers the milestone has built — unsupported layers (memory,
heartbeat, tools, manifests) are rejected, not silently graded (C-005).

## Charter Check

*Charter: `.kittify/charter/charter.md`.*

| Charter gate | Status | Notes |
|---|---|---|
| tsc strict passes before merge | PASS | All new modules strongly typed; no `any`; required per WP AC |
| Full Vitest suite green incl. cross-layer fixture suite | PASS | New fixture suite (static + behavioral) is part of the required gate (FR-012) |
| No implementation before spec/plan/tasks locked | PASS | This plan precedes any code change |
| Minimal dependencies | PASS | Zero new deps; reuses existing yaml, vitest, fetch plumbing |
| Static checks zero network / offline + byte-stable | PASS | NFR-001 enforced; lint path has no live calls; canonical output ordering per charter (UTF-16 code-unit) |
| No hardcoded providers / credentials | PASS | NFR-005; endpoint + key from env only; no SDK imports |
| Safety-critical grading is pass^k | PASS | FR-006 + charter two-tier model; injection resistance, privacy, never-call-tool graded pass^k; stylistic axes k-of-n |
| Errored run = failed run | PASS | FR-006; charter testing standards; no retry, no skip |
| Every grader ships a rigged-impossible discrimination control | PASS | FR-009; erosion-persona control is the rule-survival discrimination control (spec acceptance scenario 8) |
| New-code coverage ≥ 80% | PASS | SonarCloud quality gate on new code; lcov upload already wired |
| Normative source for all checks | PASS with note | Cross-layer conflict and rule-erosion have no upstream spec; checks cite muster's published cross-layer rubric with the 2024–2026 literature (instruction hierarchy, WIRE, Arbiter, persona-erosion studies) as supporting evidence (C-002); precedence-declared cases cite the stack declaration itself |
| Lint runs on resolved composition | PASS | C-003; composition module resolves the stack before linting — raw-file-only conflicts are an edge case the lint catches |
| Discrimination control is meaningful | PASS | Erosion-persona is written to erode a specific known rule; test must detect degradation, not rubber-stamp (SC-003) |

No violations. Re-check after Phase 1 design.

## Project Structure

### Documentation (this feature)

```
kitty-specs/cross-layer-conformance-01KTYKP2/
├── spec.md              # done
├── plan.md              # this file
├── data-model.md        # Phase 1 — key entities and invariants
├── quickstart.md        # Phase 1 — local verification steps
├── contracts/           # Phase 1 — composition-manifest contract, lint-finding schema
└── tasks.md             # Phase 2 (/spec-kitty.tasks — NOT created here)
```

### Source Code (repository root)

```
src/
├── core/                          # UNCHANGED — boundary must hold (C-001)
│   ├── adapter.ts                 # read-only; SpecAdapter contract consumed, not extended
│   ├── behavioral/                # read-only; runner, graders, manifest, types consumed as-is
│   └── ...
├── adapters/
│   └── rfc1/
│       └── resolve.ts             # read-only; resolveCompositionDetailed() reused for persona layer
└── crosslayer/                    # NEW — all cross-layer logic lives here
    ├── composition.ts             # StackComposition model + heterogeneous context assembly
    │                              #   (persona soul via RFC-1 resolve + SOP text + skill text)
    ├── contradiction-lint.ts      # static cross-layer lint on the resolved composition:
    │                              #   cross-layer-contradiction, undefined-precedence,
    │                              #   resolved-by-precedence, circular-precedence error
    └── rule-survival.ts           # behavioral rule-survival runner:
                                   #   baseline (SOP-alone) + composed (persona-in) runs,
                                   #   baseline-failure guard, pass^k / k-of-n aggregation,
                                   #   precedence-resolution behavioral cases

tests/
├── crosslayer/
│   ├── unit/                      # pure-unit tests for composition, lint, rule-survival logic
│   └── integration/               # fixture-driven end-to-end cases (static + behavioral)

fixtures/
└── crosslayer/
    ├── benign/                    # compositions with no conflicts (lint → ok: true)
    ├── contradictory-no-precedence/   # contradictions without declared precedence
    │                                  #   → undefined-precedence findings
    ├── contradictory-with-precedence/ # contradictions with declared precedence
    │                                  #   → resolved-by-precedence findings
    ├── circular-precedence/           # A outranks B outranks A → static error
    ├── erosion-persona-control/       # persona known to erode a specific refusal rule
    │                                  #   (discrimination control for rule-survival)
    └── rule-survival-scenarios/       # SOP rule + probe sets for baseline + composed runs
```

**Structure Decision**: single-package layout; all new cross-layer code goes
under `src/crosslayer/` at the adapter/feature edge, keeping the spec-agnostic
`src/core/` boundary clean (C-001). Mirrors the existing `src/adapters/rfc1/`
pattern (narrow modules, injected I/O, no fs/network in the logic units).

## Work-package outline (preview — NOT tasks.md)

### WP01 — StackComposition model + resolved-context assembly (FR-001, FR-002)

Deliverables: `src/crosslayer/composition.ts` — the `StackComposition` type
(ordered `(layer, fixture)` pairs + optional `PrecedenceDeclaration` + resolved
composed context), the layer-type guard (rejects unsupported layers per C-005),
and the context-assembly function that calls `resolveCompositionDetailed` for
the persona layer and concatenates the SOP + skill text sections in injection
order (AGENTS→SOUL per `CONTEXT_FILE_ORDER`). Unit tests + benign-composition
fixture. No lint logic, no behavioral logic.

FR coverage: FR-001 (core boundary), FR-002 (stack composition input),
FR-011 (composition manifest), C-001, C-005.

### WP02 — Static cross-layer contradiction/precedence lint (FR-003, FR-004)

Deliverables: `src/crosslayer/contradiction-lint.ts` — detector runs on the
resolved `StackComposition` (not raw files, C-003); emits `CrossLayerFinding`
with type `cross-layer-contradiction | undefined-precedence |
resolved-by-precedence`; distinguishes refinements (SOP narrows a persona
generality) from true contradictions; circular-precedence detection is a static
error; `ok: true` for clean compositions; output is byte-stable deterministic
(NFR-001). Fixture tests for all five acceptance scenarios (spec scenarios 1–5).
Discrimination control: benign composition produces zero findings (spec scenario 5).

FR coverage: FR-003, FR-004, FR-009 (static control), FR-010, FR-011, FR-012,
C-002, C-003, NFR-001, NFR-002, NFR-003.

### WP03 — Behavioral rule-survival (baseline + composed) + erosion-persona control (FR-005, FR-006, FR-007, FR-009)

Deliverables: `src/crosslayer/rule-survival.ts` — loads the SOP adapter's
probe set + graders + rule manifest; runs baseline (SOP-alone context, N runs),
then composed run (persona + SOP context, same probes); compares pass rates;
guard for baseline-failure case (cannot measure erosion of a rule the model
never followed); pass^k aggregation for safety-critical rules; k-of-n for
stylistic. Errored run = failed. Erosion-persona control fixture: a persona
written to erode a specific refusal rule — the behavioral run must detect
degradation (spec scenario 8, SC-003). Adversarial probes inside the composed
context (spec scenario 10, FR-007).

FR coverage: FR-005, FR-006, FR-007, FR-009, FR-010, FR-011, FR-012,
NFR-004, NFR-005, NFR-006, NFR-007.

### WP04 — Precedence-resolution behavioral cases + fixture suite + manifest runner (FR-008, FR-011, FR-012)

Deliverables: behavioral cases where the composition declares SOP-outranks-persona
and the expected transcript follows the declared winner (spec scenarios 11–13);
second-endpoint portability (same suite, only endpoint config changed, spec
scenario 12); mid-suite endpoint-error handling (errored run = failed, spec
scenario 13); `CompositionManifest` runner that reads manifest YAML (case id,
layers, precedence, rule, probe set, baseline config, grading class, aggregation,
expectations) and produces a pass/fail summary; final fixture set shaped as a
candidate upstream conformance suite (C-004). Full fixture suite latency
verified < 10 s static / < 15 min behavioral (NFR-003/004).

FR coverage: FR-008, FR-011, FR-012, NFR-003, NFR-004, NFR-005, C-004.

## DEPENDENCIES — build-order critical

> **This mission must be planned and implemented LAST (build-order layer 3).**

It depends on ALL of the following being merged to `main` before this
mission's WPs begin:

- **v1 persona adapter** (`src/adapters/rfc1/`) — already shipped in v1.
  `resolveCompositionDetailed` is the composition resolution entry point reused
  here; no change to that module.
- **Skills adapter** (`skills-adapter-01KTYKNX`) — this mission composes the
  skill layer into the stack context; skill fixture files must be available.
- **SOP adapter** (`openclaw-sop-adapter-01KTYKNZ`) — this mission reuses its
  probes, graders, and rule manifest as the rule-survival probe set. No new
  graders from scratch.

Starting WP01 before the skills + SOP adapters are merged is a spec violation
(FR-002 cannot be implemented without the layer artifacts, FR-005 cannot reuse
the SOP probe set). The dependency is not a complexity violation — it is the
correct build order for a layer-3 feature.

**Out-of-scope follow-up**: the MEMORY privacy-boundary cross-layer probe
(spec §out-of-scope) waits for the memory layer (`memory-adapter`) to ship.
Once the memory adapter merges, that probe can be added as a follow-on mission.

## Complexity Tracking

*No charter violations. The one structural note:*

| Item | Why | Resolution |
|---|---|---|
| Hard dependency on two upstream missions (skills + SOP) | FR-002 composes their layers; FR-005 reuses SOP probes/graders — composition analysis only exists once ≥2 layers do | Correct build order, not a violation; planned/implemented last per charter and research RQ-10 |
