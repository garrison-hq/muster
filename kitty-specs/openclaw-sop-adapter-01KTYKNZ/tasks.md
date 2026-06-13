# Tasks: OpenClaw SOP (AGENTS.md) Conformance Adapter

**Mission**: `openclaw-sop-adapter-01KTYKNZ`
**Input**: `spec.md`, `plan.md`, `data-model.md` (FR-001..FR-013, NFRs, Cs)
**Branch contract**: planned on `main`; WPs execute in lanes; completed changes merge back into `main`.

**Ownership note**: WPs are sliced by adapter concern (parse/lint → binary graders →
judge grader → adversarial corpus → fixture runner + docs) so `owned_files` never
overlap. Every new source file is assigned to exactly one WP:
- WP01: `manifest.ts`, `index.ts`
- WP02: `graders.ts`
- WP03: `judge.ts`
- WP04: `probes.ts`
- WP05: `runner.ts`

WP01 is a hard prerequisite (schema/types gate) for WP02–WP04; WP02 is a hard
prerequisite for WP03 and WP04 (`aggregatePassK`); WP05 depends on WP01–WP04 being
complete (the rubric doc finalises citations already stubbed in WP01).

## Subtask Index

| ID | Description | WP | Parallel |
|---|---|---|---|
| T001 | `manifest.ts`: `SOPFile` reader, `SOPRuleManifest` schema + Ajv validator, undefined-precedence detector, tool-reference drift detector | WP01 | [P] |
| T002 | `index.ts`: `SOPAdapter` entry-point + static lint orchestration (`SOPLintReport`) | WP01 | [D] |
| T003 | Static lint fixtures: `agents-wellformed.md`, `agents-undefined-precedence.md`, `agents-tool-drift.md`, `rule-manifest-valid.yaml`, `rule-manifest-drift.yaml` | WP01 | [P] |
| T004 | `manifest.test.ts`: static lint acceptance scenarios SC-001/SC-006, manifest drift edge case, ambiguous-confirmation manifest error | WP01 | [D] |
| T005 | WP01 verification: `tsc` strict, `pnpm test` green, static suite ≤10 s | WP01 | [D] |
| T006 | `graders.ts` binary functions: `gradeToolCallPresence`, `gradeToolOrder`, `gradeConfirmBeforeDestructive`, `gradeExactStringNonLeakage`, `gradeOutputFormat` + `aggregatePassK` | WP02 | [P] |
| T007 | Binary compliance fixtures: `scenario-compliant.yaml`, `scenario-violating-tool.yaml`, `scenario-violating-leak.yaml`, `scenario-violating-format.yaml` | WP02 | [P] |
| T008 | `graders.test.ts` (binary): acceptance scenarios 4/5/6/12 from spec; all binary discrimination controls; errored-run-fails scenario | WP02 | [D] |
| T009 | WP02 verification: `tsc` strict, `pnpm test` green, binary control cases fail as designed | WP02 | [D] |
| T010 | `judge.ts`: `gradeJudgeCompliance` — order-swap + rubric-anchoring, k-of-n aggregation, all-refuse guard, `TRIVIAL_REFUSAL` control | WP03 | [P] |
| T011 | Judge fixture: `scenario-violating-refusal.yaml` | WP03 | [P] |
| T012 | `judge.test.ts`: acceptance scenario 7; order-swap produces different orderings; rubric anchor in judge prompt; all-refuse guard triggers | WP03 | [D] |
| T013 | WP03 verification: judge discrimination control fails as designed; all-refuse guard test passes | WP03 | [D] |
| T014 | `probes.ts`: `ProbeCorpus` loader (LICENSE-present guard), `AdversarialProbe` type, probe selector (matches probe to manifest rule by `probeIds`) | WP04 | [P] |
| T015 | Vendored corpora: `vendored/openclaw-sop/injecagent/`, `agentdojo/`, `gandalf/`, `deepset/` — curated subsets + LICENSE + CITATION.md per corpus | WP04 | [P] |
| T016 | `probes.test.ts`: adversarial suite acceptance scenarios 8/9/10/11; corpus loader rejects missing LICENSE; BYOM endpoint-swap scenario | WP04 | [D] |
| T017 | Adversarial fixture: `scenario-adversarial.yaml` | WP04 | [P] |
| T018 | WP04 verification: corpus loaders green, pass^k enforcement verified | WP04 | [D] |
| T019 | `docs/rubric/sop-rule-taxonomy.md`: versioned normative SOP rule-class taxonomy + trigger/grading rubric (FR-013) | WP05 | [P] |
| T020 | `runner.ts` manifest runner: load test manifest → dispatch compliance + adversarial probes → aggregate verdicts → emit `SOPSuiteReport` | WP05 | [D] |
| T021 | End-to-end manifest runner test (fixtures only, no live endpoint): SC-001/SC-002/SC-003/SC-004 coverage | WP05 | [D] |
| T022 | WP05 verification: `pnpm build && pnpm test` fully green; static fixture suite ≤10 s; docs page present | WP05 | [D] |

## Phase 1 — Foundation (WP01)

### WP01 — SOP parse + rule-manifest schema + static lint — prompt: `tasks/WP01-sop-parse-manifest-lint.md`

**Goal**: Ship `manifest.ts` (SOPFile reader, SOPRuleManifest schema, Ajv validator,
undefined-precedence and tool-drift detectors) and `index.ts` (SOPAdapter entry-point
+ static lint orchestration). This is the schema gate for all downstream WPs.
**Priority**: P1 · **Estimated prompt size**: ~380 lines
**Independent test**: `pnpm build && pnpm test` green; static lint fixture suite ≤10 s;
acceptance scenarios SC-001/SC-006 pass; manifest-drift edge case emits correct finding.

- [ ] T001 `manifest.ts`: SOPFile reader + SOPRuleManifest schema + validator (WP01)
- [ ] T002 `index.ts`: SOPAdapter entry-point + static lint orchestration (WP01)
- [ ] T003 Static lint fixtures (agents-wellformed, agents-undefined-precedence, agents-tool-drift, rule-manifest-valid, rule-manifest-drift) (WP01)
- [ ] T004 `manifest.test.ts`: static lint acceptance scenarios + edge cases (WP01)
- [ ] T005 WP01 verification: build + test green, suite ≤10 s (WP01)

**Dependencies**: none.
**Parallel**: T001 and T003 can start in parallel (types then fixtures); T002/T004
wait for T001 types.
**Risks**: The manifest validator must reject a missing `source.normative` as a hard
error (charter: every check cites a source); silent pass is forbidden and reviewers
must verify this. Undefined-precedence detection must not fire on non-contradictory
rules — define "contradictory" precisely in the manifest schema (e.g., rule pairs that
declare the same trigger condition and conflicting `gradingClass` or `aggregation`).

## Phase 2 — Graders + Adversarial corpus (WP02, WP03, WP04)

### WP02 — Binary compliance graders + pass^k aggregation — prompt: `tasks/WP02-binary-graders.md`

**Goal**: Ship the five binary grader functions and `aggregatePassK` in
`src/adapters/openclaw-sop/graders.ts`, with discrimination controls (rigged-impossible
fixtures) for each grader class. Covers FR-004, FR-007, FR-008 (binary half).
**Priority**: P1 · **Estimated prompt size**: ~350 lines
**Independent test**: `pnpm build && pnpm test` green; every binary discrimination
control returns `passed: false`; errored-run-fails scenario passes; acceptance scenarios
4, 5, 6, 12 pass.

- [ ] T006 `graders.ts` binary functions + `aggregatePassK` (WP02)
- [ ] T007 Binary compliance fixtures (scenario-compliant, scenario-violating-tool, scenario-violating-leak, scenario-violating-format) (WP02)
- [ ] T008 `graders.test.ts` (binary section): acceptance scenarios + controls (WP02)
- [ ] T009 WP02 verification: build + test green, all controls fail as designed (WP02)

**Dependencies**: WP01 (types from `manifest.ts`; `SOPRuleManifestEntry` type used in
grader signatures).
**Parallel**: T006 and T007 can start in parallel (types in T006, fixtures in T007);
T008 waits for both.
**Risks**: `aggregatePassK` must treat `error !== undefined` as `passed = false` (charter
errored-run rule); reviewer must check the errored-run-fails scenario explicitly.
`gradeConfirmBeforeDestructive` has an ambiguity risk: if `confirmationKind` is absent
from the manifest entry, the grader must throw a manifest error (not silently pass).
All-refuse guard: a scenario where the model refuses every turn trivially satisfies
`exact-string-non-leakage` and `never-call-tool` — each binary grader that can be
trivially-passed by a total refuser must be paired with a non-refusal compliance probe
in its fixtures.

### WP03 — Judge compliance grader + bias mitigations + controls — prompt: `tasks/WP03-judge-grader.md`

**Goal**: Ship `gradeJudgeCompliance` in `src/adapters/openclaw-sop/judge.ts` (new file
owned by WP03): order-swap (two judge calls with answer positions swapped),
rubric-anchoring (system prompt cites muster rubric verbatim), k-of-n aggregation for
stylistic rules, and the all-refuse guard (`TRIVIAL_REFUSAL` control). Covers FR-005,
FR-008 (judge half). `graders.ts` is NOT modified by this WP.
**Priority**: P1 · **Estimated prompt size**: ~310 lines
**Independent test**: `pnpm build && pnpm test` green; acceptance scenario 7 passes;
order-swap test produces both orderings; rubric anchor visible in judge prompt; all-refuse
guard triggers correctly; rigged-impossible discrimination control returns `passed: false`.

- [ ] T010 `judge.ts`: `gradeJudgeCompliance` + all bias mitigations + `TRIVIAL_REFUSAL` guard (WP03)
- [ ] T011 Judge fixture: `scenario-violating-refusal.yaml` (WP03)
- [ ] T012 `judge.test.ts`: scenario 7 + order-swap + rubric-anchor + all-refuse tests (WP03)
- [ ] T013 WP03 verification: judge discrimination control fails; all-refuse guard test passes (WP03)

**Dependencies**: WP01, WP02 (manifest types; `aggregatePassK` imported by `judge.ts` for the judge k-of-n path).
**Parallel**: T010 and T011 can start in parallel; T012 waits for both.
**Risks**: `orderSwap: true` is not configurable — reviewers must reject any PR that
makes this optional. Judge system prompt must include `rubricText` verbatim (not
paraphrased) for rubric-anchoring; reviewer checks prompt template in the test spy.
BYOM endpoint for judge calls shares the same `ChatClient` used in behavioral runner —
no new credential surface introduced.

### WP04 — Adversarial probe vendoring + injection/scope-escape probes — prompt: `tasks/WP04-adversarial-probes.md`

**Goal**: Ship `probes.ts` (ProbeCorpus loader with LICENSE-present guard, AdversarialProbe
type, probe selector) and vendor the four approved corpora (InjecAgent MIT, AgentDojo MIT,
Gandalf MIT, deepset Apache-2.0) with retained LICENSE + CITATION.md files. Covers
FR-006, FR-007 (adversarial pass^k), FR-010.
**Priority**: P1 · **Estimated prompt size**: ~340 lines
**Independent test**: `pnpm build && pnpm test` green; corpus loader throws on missing
LICENSE; adversarial acceptance scenarios 8, 9, 10, 11 pass; BYOM endpoint-swap test
passes; pass^k enforcement: single failing run fails the case.

- [ ] T014 `probes.ts`: ProbeCorpus loader + AdversarialProbe type + probe selector (WP04)
- [ ] T015 Vendored corpora: injecagent/, agentdojo/, gandalf/, deepset/ with LICENSE + CITATION.md (WP04)
- [ ] T016 `probes.test.ts`: adversarial suite scenarios 8/9/10/11 + missing-LICENSE rejection + BYOM swap (WP04)
- [ ] T017 `scenario-adversarial.yaml` fixture (WP04)
- [ ] T018 WP04 verification: corpus loaders green; pass^k enforced (WP04)

**Dependencies**: WP01, WP02 (manifest types; `ruleId` lookup; `aggregatePassK` imported by `probes.ts` for adversarial aggregation).
**Parallel**: T014, T015, T017 can start in parallel; T016 waits for T014 + T015.
**Risks**: Corpus loader must fail at load time (not at test time) if LICENSE file is
absent — reviewers check this is a thrown error, not a test failure.
Adversarial probes always use `aggregation: "pass-k"` — a manifest entry that sets
`aggregation: "k-of-n"` for an adversarial probe must be a validator error (not
silently degraded).
Vendored data subsets must be minimal (curated, not full corpora) to keep the repo
size bounded; each CITATION.md must include the upstream URL pinned to a commit SHA
(C-002 pattern applied to corpora).

## Phase 3 — Runner + docs (WP05)

### WP05 — Fixtures + rubric/taxonomy docs + manifest runner — prompt: `tasks/WP05-runner-rubric-docs.md`

**Goal**: Publish `docs/rubric/sop-rule-taxonomy.md` (the versioned normative source
all graders cite), create `runner.ts` (the SOP test-manifest runner: load YAML manifest →
dispatch compliance + adversarial probes → aggregate verdicts → emit `SOPSuiteReport`),
and ship the full fixture set. Covers FR-011, FR-012, FR-013.
**Priority**: P1 · **Estimated prompt size**: ~390 lines
**Independent test**: `pnpm build && pnpm test` fully green; static fixture suite ≤10 s;
end-to-end manifest runner test passes (fixtures only, no live endpoint); SC-001/SC-002/
SC-003/SC-004 covered; docs page present.

- [ ] T019 `docs/rubric/sop-rule-taxonomy.md`: versioned normative taxonomy + rubric (WP05)
- [ ] T020 `runner.ts` manifest runner: load → dispatch → aggregate → emit `SOPSuiteReport` (WP05)
- [ ] T021 End-to-end manifest runner test: SC-001/SC-002/SC-003/SC-004 coverage (WP05)
- [ ] T022 WP05 verification: full `pnpm build && pnpm test` green; suite ≤10 s; docs present (WP05)

**Dependencies**: WP01, WP02, WP03, WP04 (parser/lint, binary graders, judge grader, adversarial loader). WP05 assembles all parts; the rubric doc (T019) retroactively validates all `source.normative` references used in WP01–WP04 fixtures.
**Parallel**: T019 can be written in parallel with T020 (docs vs. code); T021 waits
for T019 + T020.
**Risks**: The rubric doc is the normative source every manifest entry cites — if any
WP01–WP04 fixture cites a rubric URL that doesn't match the doc's canonical URL,
that is a citation drift bug. T022 must check that at least one fixture's
`source.normative` resolves to the published path.
End-to-end test must not make live endpoint calls — all behavioral calls must be
mocked or use fixture transcripts (offline, byte-stable determinism, NFR-001).

## Dependency summary

```
WP01 ──┬──▶ WP02 ──┬──▶ WP03 ──┬──▶ WP05 (runner + docs, merges last)
       │           │            │
       │           └──▶ WP04 ──┘
       │                  ▲
       └──────────────────┘
```

WP01 is the prerequisite for all subsequent WPs (schema/types gate).
WP02 is a prerequisite for WP03 (judge grader imports `aggregatePassK`) and WP04
(adversarial aggregation uses `aggregatePassK`). WP03 and WP04 are parallel with
each other after WP02 lands (disjoint owned_files: `judge.ts` vs `probes.ts`).
WP05 assembles all parts and must merge last.

## Acceptance traceability

- FR-001 (SpecAdapter contract, core reuse) → WP01 T002 (`index.ts` adapter entry-point)
- FR-002 (SOPFile parser + rule manifest loader) → WP01 T001 (`manifest.ts`)
- FR-003 (static lint: structural checks + undefined-precedence) → WP01 T001/T002 + T004
- FR-004 (binary compliance probes: tool-call, order, confirm, non-leakage, format) → WP02 T006/T007/T008
- FR-005 (judge-graded probes + bias mitigations) → WP03 T010/T011/T012
- FR-006 (adversarial probes from vendored corpora) → WP04 T014/T015/T016
- FR-007 (pass^k aggregation; errored run = failed run) → WP02 T006 (`aggregatePassK`) + WP04 T016
- FR-008 (discrimination controls + all-refuse guard) → WP02 T007/T008 + WP03 T010/T012
- FR-009 (machine-readable report + every check cites source) → WP01 T001 (validator) + WP05 T020
- FR-010 (MIT/Apache/CC-BY corpora, license-verified, LICENSE+citation retained) → WP04 T015
- FR-011 (manifest runner: test manifest → pass/fail summary) → WP05 T020/T021
- FR-012 (fixture set: example SOPs, rule manifest, scenarios, vendored probe sets) → WP01 T003 + WP02 T007 + WP03 T011 + WP04 T015/T017
- FR-013 (SOP rule-class taxonomy + rubric as versioned doc) → WP05 T019
- SC-001 (per-rule pass/fail verdict) → WP05 T020/T021
- SC-002 (passing + violating scenario per binary rule class) → WP02 T007/T008
- SC-003 (pass^k: single violation across k fails the case) → WP02 T006 + WP04 T016
- SC-004 (adversarial suite catches eroded rule + every grader fails its control) → WP04 T016 + WP02/WP03 controls
- SC-005 (same suite runs unchanged vs two differently-hosted endpoints) → WP04 T016 (BYOM swap test)
- SC-006 (byte-stable static lint + undefined-precedence flagged) → WP01 T001/T004
- SC-007 (all vendored corpora carry verified permissive licenses) → WP04 T015
