# Tasks: Agent Skills (SKILL.md) Conformance Adapter

**Mission**: `skills-adapter-01KTYKNX`
**Input**: `spec.md`, `plan.md`, `data-model.md`
**Branch contract**: planned on `main`; WPs execute in lanes; completed changes merge back into `main`.

**Ownership note**: WPs are sliced by functional layer so `owned_files` never
overlap. WP01 owns the adapter scaffold and frontmatter/naming static
validation. WP02 owns directory layout drift checks and the Anthropic optional
profile extension. WP03 owns the behavioral trigger conformance runner (two-axis
grader, k-of-n, discrimination control). WP04 owns all fixtures, the
skills-manifest, and the CTS-style manifest runner that ties the suite together.

## Subtask Index

| ID | Description | WP | Parallel |
|---|---|---|---|
| T001 | Define skills-specific types: SkillDocument, SkillFrontmatter, SkillStaticCheck, SkillProfile, TriggerQuerySet, TriggerCase, TriggerVerdict, AxisVerdict, QueryRunResult | WP01 | [P] |
| T002 | Implement frontmatter extraction (frontmatter.ts): first-block YAML parse, edge-case handling (absent/unterminated/not-first, BOM strip) | WP01 | [P] |
| T003 | Implement Ajv-backed frontmatter schema (schema.ts): required name/description, optional fields typed | WP01 | [P] |
| T004 | Implement name + description static validation (validate.ts): charset, length, dir-name identity, agentskills.io clause citations at pinned SHA | WP01 | |
| T005 | Assemble SkillsAdapter (index.ts): implement SpecAdapter contract; wire parse + validate; stub resolveConfig, thresholds, evaluateTriggers | WP01 | |
| T006 | Unit tests: skills-frontmatter.test.ts (edge cases) + skills-validate.test.ts (per-rule: name/description rules, dir-name match) | WP01 | |
| T007 | WP01 verification: tsc strict, full suite green, SpecAdapter contract check | WP01 | |
| T008 | Implement bundled-file layout drift check (layout.ts): scan body for scripts/references/assets references, resolve against skill root, path-traversal guard, cite agentskills.io layout clause | WP02 | [P] |
| T009 | Extend validate.ts: optional-field rules (license, compatibility, metadata, allowed-tools) + experimental warning for allowed-tools | WP02 | [P] |
| T010 | Add Anthropic profile gate to validate.ts: reserved-word (anthropic/claude) + XML-tag checks, cite Anthropic docs URL; profile=base skips gate | WP02 | |
| T011 | Unit tests: skills-layout.test.ts (missing file, path traversal, nested SKILL.md) + extend skills-validate.test.ts (optional fields, Anthropic profile) | WP02 | |
| T012 | WP02 verification: tsc strict, all tests green, byte-stability assertion for static path | WP02 | |
| T013 | Implement trigger runner (trigger.ts): build tools[] payload, drive ChatClient (chatWithTools approach), record tool_calls per run, document chosen ChatClient extension approach in work log | WP03 | [P] |
| T014 | Implement two-axis grader in trigger.ts: should-trigger axis (rate >= threshold), near-miss axis (rate < threshold); case passes iff both axes pass | WP03 | [P] |
| T015 | Implement k-of-n aggregation in trigger.ts: errored run = failed run (never skipped/retried); TriggerVerdict assembly | WP03 | |
| T016 | Implement rigged-impossible discrimination control: control case with unrealistic description; assert grader produces passed: false | WP03 | |
| T017 | Unit tests: skills-trigger.test.ts — two-axis grader logic, errored-run-counts-as-failed, discrimination control asserts passed: false, wrong-skill invocation edge case | WP03 | |
| T018 | WP03 verification: tsc strict, all tests green, discrimination control test confirms passed: false | WP03 | |
| T019 | Create all static fixture skill directories: fixtures/skills/valid/ (minimal, full-optional, anthropic-profile-clean) and fixtures/skills/broken/ (11 broken cases per spec rules) | WP04 | [P] |
| T020 | Create trigger query fixtures: fixtures/skills/trigger-queries/weather-skill-queries.yaml (>=8 should-trigger + >=8 near-miss) + rigged-impossible-queries.yaml (discrimination control) | WP04 | [P] |
| T021 | Author fixtures/skills/skills-manifest.yaml: one static entry per fixture (id, skill dir, profile, expectations); one behavioral entry per trigger-query set | WP04 | |
| T022 | Extend tests/cts/suite.test.ts (or new tests/cts/skills-suite.test.ts): load skills-manifest.yaml, run full fixture suite, verify SC-002 rule coverage, verify SC-004 control failure, byte-stability assertion | WP04 | |
| T023 | WP04 final verification: full Vitest suite green, byte-stability assertion passes, tsc strict, SonarCloud gate passes (>=80% new-code coverage) | WP04 | |

## WP01 — Adapter scaffold + frontmatter/naming static validation — prompt: `tasks/WP01-adapter-scaffold.md`

**Goal**: Stand up the `SkillsAdapter` behind muster's `SpecAdapter` boundary.
Deliver all skills-specific types, YAML frontmatter extraction with full edge-case
handling, the Ajv-backed schema, and the name/description static validation
rules citing the agentskills.io spec at a pinned commit SHA.
**Priority**: P1 · **Estimated prompt size**: ~380 lines
**Independent test**: `pnpm build` (strict tsc) passes; `tests/unit/skills-frontmatter.test.ts`
and `tests/unit/skills-validate.test.ts` green; all existing tests remain green;
`SpecAdapter` contract check (`const _: SpecAdapter = skillsAdapter`) compiles.

- [ ] T001 Define skills-specific types in types.ts (WP01)
- [ ] T002 Implement frontmatter extraction in frontmatter.ts (WP01)
- [ ] T003 Implement Ajv frontmatter schema in schema.ts (WP01)
- [ ] T004 Implement name + description validation in validate.ts (WP01)
- [ ] T005 Assemble SkillsAdapter in index.ts (WP01)
- [ ] T006 Unit tests: skills-frontmatter.test.ts + skills-validate.test.ts (WP01)
- [ ] T007 WP01 verification (WP01)

**Dependencies**: none.
**Parallel**: T001/T002/T003 touch disjoint new files and can be drafted in parallel; T004 depends on T001+T003; T005 depends on T001+T004.
**Risks**: agentskills.io spec is unversioned — the implementing agent must verify the pinned SHA before coding begins and record any drift as a blocker; `SpecAdapter` tsc enforcement is the primary guard for the C-001 boundary.

---

## WP02 — Directory layout + bundled-file drift checks + Anthropic optional profile — prompt: `tasks/WP02-layout-and-profile.md`

**Goal**: Complete the static conformance surface. Add directory-layout drift
checking (bundled files under `scripts/`, `references/`, `assets/`), extend
optional-field rules, and implement the Anthropic profile gate (reserved words +
XML tags) — all citing normative sources. Static path remains fully offline and
byte-stable.
**Priority**: P1 · **Estimated prompt size**: ~360 lines
**Independent test**: `pnpm build` passes; `tests/unit/skills-layout.test.ts` green;
extended `tests/unit/skills-validate.test.ts` green; byte-stability assertion
(run twice, compare output) passes; all existing tests remain green.

- [ ] T008 Implement bundled-file layout drift check in layout.ts (WP02)
- [ ] T009 Extend validate.ts: optional-field rules + allowed-tools experimental warning (WP02)
- [ ] T010 Add Anthropic profile gate to validate.ts (WP02)
- [ ] T011 Unit tests: skills-layout.test.ts + extend skills-validate.test.ts (WP02)
- [ ] T012 WP02 verification incl. byte-stability assertion (WP02)

**Dependencies**: WP01 (validate.ts and types.ts must exist before extension).
**Parallel**: T008 (layout.ts is a new file) can be drafted independently of T009/T010 after WP01 merges; T009 and T010 both extend validate.ts so must be sequential.
**Risks**: path-traversal guard must be lexical (no filesystem resolution for escaping paths) — never call `fs.exists` on a path that escapes the skill root; byte-stability assertion must catch any locale-dependent output regression introduced accidentally.

---

## WP03 — Behavioral trigger conformance (two-axis grader, k-of-n, discrimination control) — prompt: `tasks/WP03-behavioral-trigger.md`

**Goal**: Deliver the full behavioral trigger conformance surface in `trigger.ts`:
OpenAI-compatible tool-call payload, ChatClient extension (document chosen approach
before coding), two-axis grader, k-of-n aggregation with errored-run-is-failed
semantics, and a rigged-impossible discrimination control proving the grader can
fail (charter cap-of-zero pattern).
**Priority**: P1 · **Estimated prompt size**: ~420 lines
**Independent test**: `pnpm build` passes; `tests/unit/skills-trigger.test.ts` green;
discrimination control test asserts `passed: false`; all existing behavioral runner
tests remain green.

- [ ] T013 Implement trigger runner + ChatClient extension in trigger.ts (WP03)
- [ ] T014 Implement two-axis grader in trigger.ts (WP03)
- [ ] T015 Implement k-of-n aggregation in trigger.ts (WP03)
- [ ] T016 Implement rigged-impossible discrimination control (WP03)
- [ ] T017 Unit tests: skills-trigger.test.ts (WP03)
- [ ] T018 WP03 verification (WP03)

**Dependencies**: WP01 (types.ts, index.ts SpecAdapter stub for evaluateTriggers must exist).
**Parallel**: T013/T014/T015/T016 are all within trigger.ts — sequential within WP; T017 can be drafted while T013-T016 are reviewed.
**Risks**: ChatClient extension (chatWithTools) must add no skill-specific knowledge to core (C-001) — the implementing agent documents the chosen approach (local fetch wrapper vs core extension) in the WP03 work log before any code; errored-run-is-failed semantics must be unit-tested explicitly (charter requirement); model invokes wrong skill → must count as non-trigger for target.

---

## WP04 — Fixture set + CTS-style manifest runner — prompt: `tasks/WP04-fixtures-and-runner.md`

**Goal**: Deliver all fixtures and the skills-manifest runner that ties the suite
together. Create every static fixture (valid + broken), trigger query sets
(weather skill + rigged-impossible control), the `skills-manifest.yaml`, and the
extended CTS suite test that verifies SC-002 through SC-006 including byte-stability.
**Priority**: P1 (merges last) · **Estimated prompt size**: ~440 lines
**Independent test**: full Vitest suite green including the skills fixture suite;
byte-stability assertion passes (two runs, compare); `pnpm build` (strict tsc)
passes; SonarCloud gate passes (≥80% new-code coverage).

- [ ] T019 Create all static fixture directories (WP04)
- [ ] T020 Create trigger query fixture YAML files (WP04)
- [ ] T021 Author skills-manifest.yaml (WP04)
- [ ] T022 Extend CTS suite runner for skills fixtures (WP04)
- [ ] T023 WP04 final verification (WP04)

**Dependencies**: WP01, WP02, WP03 (all adapter code must be merged before the fixture runner can import and exercise it).
**Parallel**: T019 and T020 are authoring tasks that produce YAML/fixture files; they can be drafted in parallel. T021 depends on T019+T020. T022 depends on T021.
**Risks**: SC-002 coverage audit (every static rule has a passing fixture AND a broken fixture) must be verified explicitly — a missing broken fixture silently fails to exercise a rule; SC-004 requires the discrimination control in the manifest to produce `passed: false` from the actual grader (not a stub); byte-stability assertion must use the canonical-JSON output path, not any locale-dependent log ordering.

---

## Dependency summary

```
WP01 ──▶ WP02 ──┐
     └──▶ WP03 ──┴──▶ WP04 (merges last; requires WP01, WP02, WP03 approved)
```

WP02 and WP03 both depend on WP01 and can proceed once WP01 is approved.
WP04 depends on WP01, WP02, and WP03 — all adapter code must be merged before
the fixture runner can import and exercise it.

## Acceptance traceability

| Acceptance / FR | WP delivering it |
|---|---|
| FR-001 (SpecAdapter contract, no core modification) | WP01 (T005 — tsc-enforced contract check) |
| FR-002 (parse SKILL.md: frontmatter extraction + directory layout) | WP01 (T002), WP02 (T008) |
| FR-003 (name validation: present, 1–64, charset, dir-name match) | WP01 (T004, T006) |
| FR-004 (description validation: present, 1–1024 chars) | WP01 (T004, T006) |
| FR-005 (optional fields: license, compatibility, metadata, allowed-tools + experimental warning) | WP02 (T009, T011) |
| FR-006 (bundled-file drift check: missing/escaping references) | WP02 (T008, T011) |
| FR-007 (Anthropic profile: reserved words, XML tags, profile gate) | WP02 (T010, T011) |
| FR-008 (machine-readable report; every check cites a normative source) | WP01 (T004), WP02 (T008–T010) |
| FR-009 (behavioral trigger: tools[] payload, BYOM endpoint, record invocations) | WP03 (T013) |
| FR-010 (two-axis grader: should-trigger ≥ threshold, near-miss < threshold) | WP03 (T014, T017) |
| FR-011 (k-of-n; errored run = failed run, never skipped) | WP03 (T015, T017) |
| FR-012 (discrimination control: rigged-impossible case asserts passed: false) | WP03 (T016, T017) |
| FR-013 (manifest-driven suite: id, skill dir, profile, expectations) | WP04 (T021, T022) |
| FR-014 (fixture set: valid skills, broken skills, trigger query sets) | WP04 (T019, T020) |
| SC-001 (per-field pass/fail report without reading spec) | WP01–WP02 |
| SC-002 (every static rule: ≥1 passing + ≥1 broken fixture) | WP04 (T019, T022) |
| SC-003 (behavioral trigger measurement: should-trigger + near-miss per axis) | WP03 (T014), WP04 (T020) |
| SC-004 (discrimination control fails as designed) | WP03 (T016), WP04 (T022) |
| SC-005 (suite runs unchanged against two endpoints via env vars only) | WP03 (T013) |
| SC-006 (byte-stable static output across runs) | WP02 (T012 byte-stability assertion), WP04 (T022–T023) |
| NFR-001 (offline + byte-stable static path) | WP01 (T004), WP02 (T012) |
| NFR-006 (tsc strict + Vitest green + SonarCloud ≥80% coverage) | WP04 (T023) |
| C-001 (core untouched) | WP01 (T005), WP03 (T013 work-log decision) |
| C-002 (agentskills.io SHA pinning + drift-watch) | WP01 (T004 header comment), WP02 (T008) |
| C-003 (every check cites normative source) | WP01 (T004), WP02 (T008–T010) |
