---
work_package_id: WP03
title: Behavioral recall probes (k-of-n)
dependencies:
- WP01
requirement_refs:
- FR-005
- FR-008
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-13T01:30:00Z'
subtasks:
- T010
- T011
- T012
- T013
history:
- timestamp: '2026-06-13T01:30:00Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/adapters/memory/
execution_mode: code_change
owned_files:
- src/adapters/memory/recall.ts
- tests/unit/memory/recall.test.ts
- tests/fixtures/memory/recall-scenarios/fact-recall.yaml
- tests/fixtures/memory/recall-scenarios/addressing-recall.yaml
tags: []
---

# WP03 — Behavioral recall probes (k-of-n)

## Objective

Implement `RecallProbeRunner` in `src/adapters/memory/recall.ts`. With
`MEMORY.md`/`USER.md` facts loaded into session context, the runner sends each
recall scenario to a BYOM endpoint N times, grades whether the model recalled
the required fact at or above the rubric threshold, and aggregates k-of-n. An
errored run counts as a failed run; no run is skipped or retried (FR-008). Every
grader ships a rigged-impossible discrimination control (FR-009). The normative
source cited in findings is muster's published rubric (C-002). No provider SDKs;
endpoint and token from the environment only (NFR-005).

## Context (read first)

- Spec: `kitty-specs/memory-adapter-01KTYMCD/spec.md` — FR-005, FR-008, FR-009,
  FR-010; acceptance scenarios 5, 6; edge cases (errored run; empty transcript).
- Data model: `kitty-specs/memory-adapter-01KTYMCD/data-model.md` — `RecallProbe`
  entity; invariants on k-of-n aggregation and discrimination controls.
- Plan: `kitty-specs/memory-adapter-01KTYMCD/plan.md` — WP03 outline; `recall.ts`
  wraps `src/core/behavioral/runner.ts` — do not reimplement the runner.
- Charter: `.kittify/charter/charter.md` — errored run = failed run; k-of-n
  threshold for stylistic axes; rigged-impossible control in every grader; ≥ 80%
  new-code coverage.

**Hard rules for this WP**:
1. `RecallProbeRunner` must wrap `src/core/behavioral/runner.ts` — no
   reimplementation of the behavioral runner loop (FR-001, C-001).
2. An errored run counts as a failed run — never skipped, never retried (FR-008,
   charter).
3. Every grader includes a rigged-impossible discrimination control: supply an
   obviously non-recalled response and assert the grader returns `pass: false`
   (FR-009).
4. No provider SDKs; model access via plain `fetch` to an OpenAI-compatible
   endpoint; credentials from `process.env` only (NFR-005).
5. Touch only files in `owned_files`. WP01's `lint.ts` is read-only here.

## Subtasks

### T010 — Implement `RecallProbeRunner` in `src/adapters/memory/recall.ts`

**Purpose**: wrap the behavioral runner with memory-specific loading and k-of-n
recall grading.

**Steps**:
1. Create `src/adapters/memory/recall.ts`. Import `FactParser` from
   `./lint.ts` (WP01). Import the behavioral runner from
   `src/core/behavioral/runner.ts`.
2. Export `RecallProbeRunner` class with method:
   ```ts
   run(probe: RecallProbe, endpoint: EndpointConfig): Promise<RecallVerdict>
   ```
   `RecallProbe` and `RecallVerdict` interfaces are defined in this file:
   ```ts
   export interface RecallProbe {
     id: string;
     description: string;
     requiredFactId: string;
     memoryPath: string;
     userPath: string;
     manifestPath: string;
     scenario: ConversationScenario;
     runsN: number;
     passThresholdK: number;
     rubricCitation: string;
   }
   export interface RecallVerdict {
     probeId: string;
     pass: boolean;
     passCount: number;
     totalRuns: number;
     rubricCitation: string;
   }
   ```
   `ConversationScenario` and `EndpointConfig` are re-exported from
   `src/core/behavioral/runner.ts` (no redefinition).
3. **Memory loading**: before running, call `FactParser.parse` on both
   `probe.memoryPath` and `probe.userPath` with the manifest at
   `probe.manifestPath`. Locate the `MemoryFact` with `id === probe.requiredFactId`.
   Inject the fact's text into the first system message of the scenario as a
   `[MEMORY]` prefix block (e.g., `"[MEMORY]\n" + fact.text + "\n\n" + originalSystem`).
4. **k-of-n loop**: run the scenario `probe.runsN` times via the behavioral
   runner. For each run:
   - If the run throws / the endpoint returns an error: record as `pass: false`
     for that run (FR-008). Do not retry or skip.
   - Otherwise, pass the transcript to the recall grader: check if the
     `requiredFactId`'s text appears verbatim or in paraphrased form in the last
     assistant turn. Use a simple string-contains check for verbatim; flag the
     case as `pass` if the fact content is present.
5. `RecallVerdict.pass = passCount >= probe.passThresholdK`.
6. Cite `RUBRIC_CITATION` (imported from `./lint.ts` or re-declared in
   `recall.ts`) in every verdict (C-002).
7. No hardcoded endpoint, model name, or API key anywhere in `recall.ts`
   (NFR-005). All endpoint config comes from the `EndpointConfig` argument.

**Files**: `src/adapters/memory/recall.ts` (new)

**Validation (FR-005, FR-008)**:
- `RecallProbeRunner.run` with a mock that always returns the fact text produces
  `pass: true` when `passThresholdK === 1`.
- Mock returning an error on all runs produces `pass: false` with
  `passCount === 0` (errored run counted as failure).
- Partial failures: 2/3 runs pass → `pass: true` when threshold is 2.

---

### T011 — Fixtures: `tests/fixtures/memory/recall-scenarios/`

**Purpose**: provide two YAML scenario files for recall testing.

**Steps**:
1. Create `tests/fixtures/memory/recall-scenarios/fact-recall.yaml`. Define a
   scenario where the model is asked a question whose correct answer requires
   recalling a specific `MEMORY.md` fact (e.g., "What is my preferred
   programming language?" when MEMORY.md says "preferred-language: Rust").
   Fields:
   ```yaml
   id: recall-fact-01
   description: Model must recall stored MEMORY.md fact
   requiredFactId: memory-preferences-0    # must match the consistent/ fixture
   memoryPath: tests/fixtures/memory/consistent/MEMORY.md
   userPath: tests/fixtures/memory/consistent/USER.md
   manifestPath: tests/fixtures/memory/consistent/manifest.json
   runsN: 3
   passThresholdK: 2
   rubricCitation: "muster rubric §recall-probe"
   scenario:
     turns:
       - role: user
         content: "What is my preferred programming language?"
   ```
2. Create `tests/fixtures/memory/recall-scenarios/addressing-recall.yaml`.
   Define a scenario where the correct answer requires honouring a `USER.md`
   addressing preference (e.g., "How should I address the user in greetings?"
   when USER.md says "address as: Dr. Smith"). Fields follow the same shape as
   above, pointing to the `USER.md` fact's `requiredFactId`.
3. Ensure both `requiredFactId` values match ids that `FactParser` will produce
   when parsing the `consistent/` fixtures from WP01. Verify this in T012 tests.

**Files**:
- `tests/fixtures/memory/recall-scenarios/fact-recall.yaml` (new)
- `tests/fixtures/memory/recall-scenarios/addressing-recall.yaml` (new)

**Validation**: `FactParser.parse` on the consistent fixtures produces ids that
include the `requiredFactId` values referenced in both YAML files.

---

### T012 — Unit tests: `tests/unit/memory/recall.test.ts`

**Purpose**: exercise `RecallProbeRunner` with mock behavioral client; verify
k-of-n aggregation, errored-run handling, and discrimination control.

**Steps**:
1. Create `tests/unit/memory/recall.test.ts`. Import `RecallProbeRunner` from
   `src/adapters/memory/recall.ts`.
2. Build a minimal mock behavioral client (`mockClient`) that can be configured
   to return preset responses or throw errors. Use Vitest's `vi.fn()` / `vi.mock`.
3. **Recall pass test** (acceptance scenario 5, FR-005):
   - Configure `mockClient` to return the fact text in its response on all runs.
   - Run `RecallProbeRunner.run` with `runsN: 3`, `passThresholdK: 2`.
   - Assert `verdict.pass === true` and `verdict.passCount >= 2`.
   - Assert `verdict.rubricCitation` is a non-empty string (C-002).
4. **Recall fail test** (FR-005):
   - Configure `mockClient` to return responses that do not contain the fact
     text.
   - Assert `verdict.pass === false`.
5. **Errored run test** (FR-008):
   - Configure `mockClient` to throw on every call.
   - Assert `verdict.pass === false` and `verdict.passCount === 0`.
   - Assert `verdict.totalRuns === probe.runsN` — errored runs are counted, not
     silently dropped.
6. **Partial failure test** (FR-005):
   - Configure `mockClient` to return the fact text on 2 out of 3 runs, and to
     return an empty string on the third.
   - With `passThresholdK: 2`, assert `verdict.pass === true` (`passCount === 2`).
7. **Rigged-impossible discrimination control** (FR-009):
   - Build a `RecallGrader` that is forced to grade a response that obviously
     does NOT contain the required fact text.
   - Assert the grader returns `pass: false` — proving the grader can fail.
   - This proves the grader is not trivially returning `pass: true`.
8. **USER.md addressing scenario** (acceptance scenario 6, FR-005):
   - Load `tests/fixtures/memory/recall-scenarios/addressing-recall.yaml`.
   - Configure `mockClient` to return the addressing preference text.
   - Assert `verdict.pass === true`.
9. **Coverage target**: ≥ 80% of `recall.ts` lines covered (NFR-006).

**Files**: `tests/unit/memory/recall.test.ts` (new)

**Validation**: `pnpm test -- tests/unit/memory/recall.test.ts` green; all seven
cases pass; no skips; discrimination control returns `pass: false`.

---

### T013 — WP03 verification

**Purpose**: gate the Definition of Done.

**Steps**:
```bash
pnpm build                   # strict tsc — zero errors
pnpm test                    # full suite — zero failures, zero new skips
pnpm test -- tests/unit/memory/recall.test.ts
git diff --stat HEAD         # only owned_files changed; src/core/ unmodified
```
Confirm no SDK imports:
`grep -n 'openai\|anthropic\|langchain\|@google' src/adapters/memory/recall.ts || echo OK` → expect `OK`.
Confirm credentials not hardcoded:
`grep -n 'sk-\|Bearer [a-zA-Z0-9]' src/adapters/memory/recall.ts || echo OK` → expect `OK`.

**Validation**: all commands exit 0; no SDK imports; no hardcoded credentials.

---

## Definition of Done

- [ ] `RecallProbeRunner.run` correctly aggregates k-of-n pass/fail with the mock client
- [ ] Errored run is counted as a failed run — `totalRuns === runsN` always (FR-008)
- [ ] Discrimination control test (T012 step 7) passes: grader returns `pass: false` on an obvious non-recall
- [ ] Every `RecallVerdict` carries a non-empty `rubricCitation` (C-002)
- [ ] No provider SDK imports; endpoint config from `EndpointConfig` argument only (NFR-005)
- [ ] `pnpm build` (strict tsc) + `pnpm test` green; WP01 + WP02 tests unaffected
- [ ] No `src/core/` modification; adapter boundary intact (C-001)
- [ ] SonarCloud coverage gate condition: ≥ 80% line coverage on new code (NFR-006)

## Reviewer guidance

- **Reject if** `RecallProbeRunner` reimplements the behavioral runner loop
  instead of wrapping `src/core/behavioral/runner.ts`.
- Verify errored-run handling: `grep -n 'catch\|reject\|error' src/adapters/memory/recall.ts`
  and confirm the catch path sets `pass: false` for that run.
- Check the discrimination control test: assert on `pass: false`, not `pass: true`.
- Confirm no `import … from 'openai'` or any other provider SDK.
- `rubricCitation` must be a non-empty string constant in every returned verdict.
