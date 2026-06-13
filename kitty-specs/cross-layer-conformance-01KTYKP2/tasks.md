# Tasks: Cross-Layer Conformance (rule survival, precedence, contradiction lint)

**Mission**: `cross-layer-conformance-01KTYKP2`
**Input**: `spec.md` (FR-001…FR-012, NFRs, Cs), `plan.md` (WP outline, project structure, dependency block), `data-model.md`
**Branch contract**: planned on `main`; WPs execute in lanes; completed changes merge back into `main`.

---

> ## CRITICAL BUILD-ORDER DEPENDENCY
>
> **This mission MUST be implemented LAST (layer 3 of 3).**
>
> Implementation of ANY WP in this mission requires the following missions to be
> **fully merged into `main` before work begins**:
>
> - **Skills adapter** (`skills-adapter-01KTYKNX`) — WP01 cannot assemble a
>   `LayerType: "skill"` stack without the skill layer fixtures being present.
>   FR-002 is unimplementable without this merge.
> - **SOP adapter** (`openclaw-sop-adapter-01KTYKNZ`) — WP03/WP04 reuse the
>   SOP adapter's probes, graders, and rule manifest as the rule-survival probe
>   set. FR-005 explicitly depends on this reuse; writing new graders from
>   scratch would violate the design decision in plan.md.
> - **v1 persona adapter** (`src/adapters/rfc1/`) — already shipped in v1;
>   `resolveCompositionDetailed` is the composition-resolution entry point
>   reused by WP01 context assembly.
>
> Starting any WP before skills + SOP adapters are merged is a spec violation.
> The dependency is the correct build order for a layer-3 feature, not a
> complexity violation (see plan.md §DEPENDENCIES and charter §Policy Summary).

---

**Ownership note**: WPs are sliced by source file ownership so `owned_files`
never overlap. The three source modules (`composition.ts`,
`contradiction-lint.ts`, `rule-survival.ts`) and their associated test and
fixture trees are each owned by exactly one WP. WP04 owns the manifest runner
and the final fixture set assembly; no WP owns a file another owns.

## Subtask Index

| ID | Description | WP | Parallel |
|---|---|---|---|
| T001 | `StackComposition` type + `LayerEntry` / `PrecedenceDeclaration` type defs | WP01 | [P] |
| T002 | Layer-type guard: reject unsupported `LayerType` values (C-005) | WP01 | [P] |
| T003 | `assembleComposedContext()`: persona via `resolveCompositionDetailed`, SOP + skill concat in injection order | WP01 | |
| T004 | `sopAloneText` extraction + `layerTexts` map population for static lint | WP01 | |
| T005 | Unit tests for WP01 logic (`tests/crosslayer/unit/composition.test.ts`) | WP01 | |
| T006 | Benign-composition fixture set (`fixtures/crosslayer/benign/`) | WP01 | |
| T007 | WP01 verification: `pnpm build && pnpm test` green; no files outside `owned_files` | WP01 | |
| T008 | `CrossLayerFinding` + `CrossLayerLintReport` types in `contradiction-lint.ts` | WP02 | [P] |
| T009 | Refinement-vs-contradiction distinguisher (SOP narrowing a persona generality is NOT flagged) | WP02 | |
| T010 | `undefined-precedence` / `resolved-by-precedence` emission path + `winner` field | WP02 | |
| T011 | Circular-precedence detection → `circular-precedence-error` static error, halts further analysis | WP02 | |
| T012 | Byte-stable output: sort findings by (type, layerA, layerB, clauseA) in UTF-16 code-unit order (NFR-001) | WP02 | |
| T013 | Fixture tests: scenarios 1–5 incl. discrimination control (benign → `ok: true`) | WP02 | |
| T014 | WP02 verification: `pnpm build && pnpm test` green; byte-stability confirmed across two runs | WP02 | |
| T015 | `RuleSurvivalCase` / `RuleSurvivalResult` types + `GradingClass` in `rule-survival.ts` | WP03 | [P] |
| T016 | Baseline runner (SOP-alone context, N runs via plain `fetch`, errored run = failed) | WP03 | |
| T017 | Composed runner (persona + SOP context, same probes), baseline-failure guard | WP03 | |
| T018 | `pass^k` aggregation for safety-critical rules; `k-of-n` aggregation for stylistic | WP03 | |
| T019 | Erosion-persona control fixture (`fixtures/crosslayer/erosion-persona-control/`) + discrimination control test | WP03 | |
| T020 | Adversarial probe cases in composed context (spec scenario 10, FR-007) | WP03 | |
| T021 | Unit tests for WP03 logic (`tests/crosslayer/unit/rule-survival.test.ts`) | WP03 | |
| T022 | Rule-survival scenario fixtures (`fixtures/crosslayer/rule-survival-scenarios/`) | WP03 | |
| T023 | WP03 verification: `pnpm build && pnpm test` green; discrimination control yields `eroded` verdict | WP03 | |
| T024 | `CompositionManifest` + `CompositionManifestCase` types in `rule-survival.ts` manifest section | WP04 | [P] |
| T025 | Manifest runner: reads YAML, dispatches static/behavioral cases, emits per-case pass/fail summary | WP04 | |
| T026 | Precedence-resolution behavioral cases: SOP-outranks-persona (spec scenarios 11–13) | WP04 | |
| T027 | Second-endpoint portability test (spec scenario 12: identical suite, only endpoint config changed) | WP04 | |
| T028 | Mid-suite endpoint-error handling: errored run = failed, remaining cases continue | WP04 | |
| T029 | Contradictory fixture sets: `contradictory-no-precedence/`, `contradictory-with-precedence/`, `circular-precedence/` | WP04 | |
| T030 | Integration test suite (`tests/crosslayer/integration/`) end-to-end against all fixture families | WP04 | |
| T031 | WP04 verification: full static suite < 10 s; build + test green; manifest runner produces correct summary | WP04 | |

## WP01 — StackComposition model + resolved-context assembly

**Goal**: Deliver `src/crosslayer/composition.ts` — the `StackComposition` model,
`LayerEntry` / `PrecedenceDeclaration` types, layer-type guard, and
`assembleComposedContext()`. No lint logic, no behavioral runner logic.
**Priority**: P1 · **Estimated prompt size**: ~220 lines
**Independent test**: `pnpm build && pnpm test` green; benign composition fixture
assembles correctly; layer-type guard rejects `"memory"` with a static error.

- [ ] T001 `StackComposition` type + sub-types
- [ ] T002 Layer-type guard rejects unsupported layers (C-005)
- [ ] T003 `assembleComposedContext()`: RFC-1 persona resolve + SOP + skill concat
- [ ] T004 `sopAloneText` + `layerTexts` map
- [ ] T005 Unit tests for composition logic
- [ ] T006 Benign-composition fixture set
- [ ] T007 WP01 verification

**Dependencies**: none within-mission (requires skills + SOP adapters merged — see DEPENDENCY header above).
**Parallel**: T001/T002 are type-only and can be written together before T003.
**Risks**: `resolveCompositionDetailed` is called with `mode: "strict"` — violations
propagate as composition errors; test that path explicitly.

### WP01 prompt: `tasks/WP01-stack-composition.md`

## WP02 — Static cross-layer contradiction/precedence lint

**Goal**: Deliver `src/crosslayer/contradiction-lint.ts` — runs on the resolved
`StackComposition` (C-003), emits `CrossLayerFinding` items, distinguishes
refinements from contradictions, circular-precedence detection, byte-stable output.
Fixture tests covering all five acceptance scenarios.
**Priority**: P1 · **Estimated prompt size**: ~290 lines
**Independent test**: `pnpm build && pnpm test` green; benign composition → `ok: true`
zero findings; byte-stability confirmed by running lint twice and diffing output.

- [ ] T008 `CrossLayerFinding` + `CrossLayerLintReport` types
- [ ] T009 Refinement-vs-contradiction distinguisher
- [ ] T010 `undefined-precedence` / `resolved-by-precedence` emission path
- [ ] T011 Circular-precedence detection
- [ ] T012 Byte-stable output ordering
- [ ] T013 Fixture tests (scenarios 1–5 + discrimination control)
- [ ] T014 WP02 verification

**Dependencies**: WP01 (lint consumes `StackComposition.resolved.layerTexts`).
**Parallel**: T008 (types) is independent of WP01's assembly code; lint logic (T009–T012) requires WP01 complete.
**Risks**: Refinement distinguisher is the most judgment-sensitive path — the rubric's
refinement/contradiction boundary must be explicit in the logic, not implicit;
reviewer must inspect the distinguisher test cases.

### WP02 prompt: `tasks/WP02-contradiction-lint.md`

## WP03 — Behavioral rule-survival + erosion-persona control

**Goal**: Deliver `src/crosslayer/rule-survival.ts` — behavioral runner that
loads the SOP adapter's probes/graders/rule manifest, runs SOP-alone baseline
then persona-composed run, compares pass rates, enforces `pass^k` for
safety-critical rules, ships the erosion-persona discrimination control fixture.
**Priority**: P1 · **Estimated prompt size**: ~350 lines
**Independent test**: `pnpm build && pnpm test` green; erosion-persona control
yields `verdict === "eroded"`; `pass^k` aggregation fails on a single composed
violation.

- [ ] T015 `RuleSurvivalCase` / `RuleSurvivalResult` types
- [ ] T016 Baseline runner (SOP-alone, errored = failed)
- [ ] T017 Composed runner + baseline-failure guard
- [ ] T018 `pass^k` / `k-of-n` aggregation
- [ ] T019 Erosion-persona control fixture + discrimination test
- [ ] T020 Adversarial probe cases in composed context
- [ ] T021 Unit tests for rule-survival logic
- [ ] T022 Rule-survival scenario fixtures
- [ ] T023 WP03 verification

**Dependencies**: WP01 (context assembly for composed runs); SOP adapter merged
(probe set + grader reuse per plan.md key design decision).
**Parallel**: T015 (types) parallel with WP01/WP02; runner logic requires WP01 complete.
**Risks**: Errored-run = failed is a hard charter rule — must be tested explicitly
with a mocked endpoint error; discrimination control must always yield `eroded`,
any other verdict is a grader bug.

### WP03 prompt: `tasks/WP03-rule-survival.md`

## WP04 — Precedence-resolution behavioral cases + manifest runner + fixture suite

**Goal**: Deliver the `CompositionManifest` runner, precedence-resolution
behavioral cases (spec scenarios 11–13), full fixture set (contradictory families,
circular-precedence, erosion-persona, rule-survival scenarios), and integration
test suite. Merges last; full static suite < 10 s verified.
**Priority**: P1 (merge-ordered last) · **Estimated prompt size**: ~310 lines
**Independent test**: `pnpm build && pnpm test` green including integration suite;
static suite completes in < 10 s; manifest runner produces correct pass/fail summary
against the complete fixture set.

- [ ] T024 `CompositionManifest` + `CompositionManifestCase` types
- [ ] T025 Manifest runner (YAML → per-case dispatch → pass/fail summary)
- [ ] T026 Precedence-resolution behavioral cases (scenarios 11–13)
- [ ] T027 Second-endpoint portability test
- [ ] T028 Mid-suite endpoint-error handling
- [ ] T029 Remaining contradictory fixture families
- [ ] T030 Integration test suite
- [ ] T031 WP04 verification

**Dependencies**: WP01, WP02, WP03 (manifest runner dispatches all three modules;
integration suite exercises the complete stack).
**Risks**: Integration suite latency: static cases must stay < 10 s total (NFR-003);
behavioral cases < 15 min total (NFR-004); run with a local 7B model to validate
before merge.

### WP04 prompt: `tasks/WP04-manifest-runner.md`

## Dependency summary

```
[skills-adapter merged] ──┐
[sop-adapter merged]    ──┤
[rfc1 v1 adapter]       ──┘
                           │
                           ▼
                          WP01 (composition model)
                           │
                           ▼
                          WP02 (static lint)  ──┐
                           │                    │
                           ▼                    ▼
                          WP03 (rule-survival)──▶ WP04 (manifest runner, merges last)
```

WP01 must complete before WP02 and WP03 (both consume `StackComposition`).
WP04 depends on WP01 + WP02 + WP03 all complete (integration suite covers all modules).
The three upstream adapters must all be merged before WP01 begins.

## Acceptance traceability

- FR-001 (core boundary) → WP01 (C-001: all new code in `src/crosslayer/`, `src/core/` untouched)
- FR-002 (stack composition input) → WP01 T001–T004 (`StackComposition` + `assembleComposedContext`)
- FR-003 (contradiction finding + refinement distinction) → WP02 T009/T013 (scenarios 1, 4, 5)
- FR-004 (undefined-precedence / resolved-by-precedence / circular error) → WP02 T010–T011/T013 (scenarios 2–3)
- FR-005 (rule-survival baseline + composed + baseline-failure guard) → WP03 T016–T017
- FR-006 (pass^k for safety-critical; k-of-n stylistic; errored = failed) → WP03 T018
- FR-007 (adversarial probes in composed context) → WP03 T020
- FR-008 (declared-precedence behavioral resolution) → WP04 T026
- FR-009 (discrimination controls: static + behavioral) → WP02 T013 (scenario 5) + WP03 T019
- FR-010 (machine-readable findings + cited sources) → WP02 T008 / WP03 T015 (citedSource field)
- FR-011 (composition manifest runner) → WP04 T024–T025
- FR-012 (fixture set as candidate conformance suite) → WP01 T006 + WP04 T029–T030
- NFR-001 (offline + byte-stable) → WP02 T012/T014
- NFR-002 (single-composition lint < 5 s) → WP02 T014 (verified in DoD)
- NFR-003 (static suite < 10 s) → WP04 T031
- NFR-004 (behavioral suite < 15 min) → WP04 T031
- NFR-005 (no credentials in repo) → WP03 T016 (endpoint + key from env only)
- NFR-006 (tsc strict + Vitest green + SonarCloud gate) → T007, T014, T023, T031
- NFR-007 (pass^k resists endpoint flakiness) → WP03 T018
- C-001 (spec-agnostic core boundary) → WP01 T001 (new code under `src/crosslayer/`)
- C-003 (lint runs on resolved composition) → WP02 T008 (lint consumes `layerTexts`)
- C-004 (upstreamable conformance suite) → WP04 T029–T030
- C-005 (unsupported layers rejected) → WP01 T002
- SC-003 (erosion-persona discrimination control detects erosion) → WP03 T019/T023
