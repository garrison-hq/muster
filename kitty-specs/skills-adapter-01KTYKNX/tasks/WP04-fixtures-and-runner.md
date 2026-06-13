---
work_package_id: WP04
title: Fixture set + CTS-style manifest runner
dependencies:
- WP01
- WP02
- WP03
requirement_refs:
- FR-013
- FR-014
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-13T01:30:00Z'
subtasks:
- T019
- T020
- T021
- T022
- T023
history:
- timestamp: '2026-06-13T01:30:00Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: tests/cts/
execution_mode: code_change
owned_files:
- fixtures/skills/valid/minimal/SKILL.md
- fixtures/skills/valid/full-optional/SKILL.md
- fixtures/skills/valid/full-optional/scripts/helper.sh
- fixtures/skills/valid/full-optional/assets/icon.png
- fixtures/skills/valid/anthropic-profile-clean/SKILL.md
- fixtures/skills/broken/name-missing/SKILL.md
- fixtures/skills/broken/name-too-long/SKILL.md
- fixtures/skills/broken/name-bad-charset/SKILL.md
- fixtures/skills/broken/name-leading-hyphen/SKILL.md
- fixtures/skills/broken/name-dir-mismatch/SKILL.md
- fixtures/skills/broken/description-missing/SKILL.md
- fixtures/skills/broken/description-too-long/SKILL.md
- fixtures/skills/broken/metadata-bad-value/SKILL.md
- fixtures/skills/broken/bundled-file-missing/SKILL.md
- fixtures/skills/broken/bundled-file-escape/SKILL.md
- fixtures/skills/broken/anthropic-reserved-word/SKILL.md
- fixtures/skills/broken/anthropic-xml-tag/SKILL.md
- fixtures/skills/trigger-queries/weather-skill-queries.yaml
- fixtures/skills/trigger-queries/rigged-impossible-queries.yaml
- fixtures/skills/skills-manifest.yaml
- tests/cts/skills-suite.test.ts
tags: []
---

# WP04 — Fixture set + CTS-style manifest runner

## Objective

Deliver the full fixture set (valid skills, broken skills, trigger query sets)
and the CTS-style manifest runner that exercises the entire skills adapter
end-to-end. This WP is the primary acceptance surface for FR-013, FR-014, and
success criteria SC-001 through SC-006. It must pass fully before the mission
is considered shippable.

All adapter code (WP01–WP03) must be merged and approved before this WP merges.

## Context (read first)

- Spec: `kitty-specs/skills-adapter-01KTYKNX/spec.md`
  — FR-013, FR-014; acceptance scenarios 1–13; SC-001 through SC-006; edge cases
- Plan: `kitty-specs/skills-adapter-01KTYKNX/plan.md`
  — WP04 outline, full Project Structure tree (fixture paths are definitive)
- Data model: `kitty-specs/skills-adapter-01KTYKNX/data-model.md`
  — `TriggerQuerySet` (minimum 8 per axis; threshold default 0.5)
- Charter: `.kittify/charter/charter.md`
  — SonarCloud ≥80% new-code coverage; tsc strict; full Vitest suite green;
  byte-stable static output (SC-006); discrimination control fails (SC-004)
- WP01–WP03 deliverables: all adapter code under `src/adapters/skills/`

**Hard rules for this WP** (from spec + charter):
1. Touch ONLY the files in `owned_files`. No adapter source file is modified.
2. SC-002 must be verified explicitly: for every static rule in the spec, there
   must be at least one passing fixture AND at least one broken fixture that the
   harness catches. A matrix check in T022 enforces this.
3. SC-004 must be verified: the rigged-impossible discrimination control in the
   manifest must produce `passed: false` from the actual grader — not a stub.
4. Byte-stability assertion (SC-006) runs the static manifest twice and compares
   JSON-serialized output — must be identical bytes.
5. The fixture set is shaped to be upstreamable as the official conformance suite
   (C-004) — SKILL.md files should be realistic, not minimal nonsense.

## Subtasks

### T019 — Create all static fixture skill directories

**Purpose**: FR-014 — one valid-case fixture for each acceptance scenario and at
least one broken fixture per static rule, shaped as a candidate upstream suite (C-004).

**Steps**:
1. Create the following fixture directories and `SKILL.md` files. Each `SKILL.md`
   has a realistic (not nonsense) YAML frontmatter and a brief skill body.

   **Valid fixtures**:

   `fixtures/skills/valid/minimal/SKILL.md`
   ```markdown
   ---
   name: minimal
   description: A minimal skill with only the required fields. Demonstrates the smallest conforming SKILL.md.
   ---

   This skill serves as the minimal conformance baseline. It does nothing beyond existing.
   ```

   `fixtures/skills/valid/full-optional/SKILL.md`
   ```markdown
   ---
   name: full-optional
   description: A skill demonstrating all optional fields, including bundled files under scripts/ and assets/.
   license: MIT
   compatibility: Claude 3+, Gemini 1.5+, GPT-4o
   metadata:
     version: "1.0.0"
     author: "muster-test"
   ---

   This skill uses bundled helpers. See scripts/helper.sh for setup.
   Reference icon: assets/icon.png
   ```
   Also create `fixtures/skills/valid/full-optional/scripts/helper.sh`
   (content: `#!/bin/sh\necho "helper"`) and
   `fixtures/skills/valid/full-optional/assets/icon.png`
   (content: a 1-byte placeholder — write a single null byte or any valid PNG header).

   `fixtures/skills/valid/anthropic-profile-clean/SKILL.md`
   ```markdown
   ---
   name: anthropic-profile-clean
   description: A skill that passes both the base agentskills.io spec and the Anthropic platform profile checks.
   ---

   This skill contains no XML tags, no reserved words, and no violations under either profile.
   ```

   **Broken fixtures** (one SKILL.md per rule — directory names are the `name`
   field EXCEPT for `name-dir-mismatch` and `anthropic-*` which need special handling):

   `fixtures/skills/broken/name-missing/SKILL.md`
   — frontmatter with no `name` key, only `description`.

   `fixtures/skills/broken/name-too-long/SKILL.md`
   — `name:` is a valid-charset string of exactly 65 characters (e.g., 65 `a`s).
   Note: because the dir is `name-too-long` and the name must not match the dir,
   use a name that is also a mismatch — or set the dir name to match the long name.
   Simplest approach: the name is a 65-char string; the dir is `name-too-long` (a
   mismatch); two violations will fire (length + dir-name). Document in manifest
   `expectations` that both violations are expected.

   `fixtures/skills/broken/name-bad-charset/SKILL.md`
   — `name: Name-With-Uppercase` (capital letters in name). Dir: `name-bad-charset`.

   `fixtures/skills/broken/name-leading-hyphen/SKILL.md`
   — `name: -leading` (leading hyphen). Dir: `name-leading-hyphen`.

   `fixtures/skills/broken/name-dir-mismatch/SKILL.md`
   — `name: completely-different` (valid charset, valid length, but ≠ dir basename).
   Dir: `name-dir-mismatch`.

   `fixtures/skills/broken/description-missing/SKILL.md`
   — valid `name` matching the dir `description-missing`; no `description` key.

   `fixtures/skills/broken/description-too-long/SKILL.md`
   — valid `name` matching the dir; `description:` is a string of exactly 1025
   characters.

   `fixtures/skills/broken/metadata-bad-value/SKILL.md`
   — valid `name` + `description`; `metadata: { count: 42 }` (numeric value).

   `fixtures/skills/broken/bundled-file-missing/SKILL.md`
   — valid `name` + `description`; body references `scripts/missing.sh` which does
   NOT exist on disk.

   `fixtures/skills/broken/bundled-file-escape/SKILL.md`
   — valid `name` + `description`; body references `../outside.sh`
   (path-traversal attempt).

   `fixtures/skills/broken/anthropic-reserved-word/SKILL.md`
   — `name: claude-helper` (contains reserved word "claude"); valid description.
   Dir: `anthropic-reserved-word`. Name ≠ dir — this produces BOTH a dir-mismatch
   error AND a reserved-word error when profile=anthropic. Document both in manifest.

   `fixtures/skills/broken/anthropic-xml-tag/SKILL.md`
   — valid `name: anthropic-xml-tag` matching the dir; description contains
   `<instructions>Follow these steps</instructions>`.

2. Verify each `SKILL.md` file is syntactically valid YAML frontmatter (the
   parser must not throw). The broken fixtures are semantically broken, not
   syntactically broken (except `name-bad-charset` which is syntactically fine
   but violates the name rule).

**Files**: all fixture `SKILL.md` files and bundled assets listed in `owned_files`

**Validation**: `pnpm build` is unchanged; T022 exercises all fixtures.

---

### T020 — Create trigger query fixture YAML files

**Purpose**: FR-014 — labeled query sets for behavioral trigger conformance tests.
At least 8 should-trigger + 8 near-miss per set (data-model.md rubric minimum).

**Steps**:
1. Create `fixtures/skills/trigger-queries/weather-skill-queries.yaml`:
   ```yaml
   id: weather-skill-queries
   source: "agentskills.io/specification#trigger-testing@<SHA>"
   threshold: 0.5
   shouldTrigger:
     - "What is the weather in Amsterdam today?"
     - "Will it rain tomorrow in London?"
     - "Current temperature in Tokyo please"
     - "Is it going to be sunny this weekend in Paris?"
     - "Weather forecast for New York next week"
     - "Do I need an umbrella in Berlin today?"
     - "High and low temperatures for Sydney on Friday"
     - "What should I wear tomorrow based on the weather in Chicago?"
     - "Is there a storm warning for Miami?"
     - "Weather conditions in Dubai right now"
   nearMiss:
     - "What time is sunset in Amsterdam?"
     - "What is the UV index in London?"
     - "Can you recommend a good weather app?"
     - "How do weather forecasts work?"
     - "What causes thunder and lightning?"
     - "Tell me about the climate in tropical regions"
     - "What is the average rainfall in the Amazon?"
     - "Explain La Niña and El Niño"
     - "What is a cold front?"
     - "History of weather forecasting"
   ```
   Replace `<SHA>` with the actual pinned agentskills.io SHA (same SHA from
   `validate.ts`).

2. Create `fixtures/skills/trigger-queries/rigged-impossible-queries.yaml`:
   ```yaml
   id: rigged-impossible-queries
   source: "agentskills.io/specification#trigger-testing@<SHA>"
   threshold: 0.5
   # These are normal, plausible queries. The rigged skill's description is
   # intentionally nonsensical (ZZZCONTROL-IMPOSSIBLE prefix). A well-functioning
   # model should NEVER invoke the rigged tool for these queries.
   # The discrimination control asserts: shouldTrigger trigger rate < threshold.
   # (The control uses shouldTrigger queries but the rigged skill can't be invoked
   # by them — so the "should-trigger" axis fails as designed, proving the grader
   # can produce passed: false.)
   shouldTrigger:
     - "Help me write a Python function"
     - "What is the capital of France?"
     - "Summarize this article for me"
     - "Translate this sentence to Spanish"
     - "Write a unit test for this code"
     - "Explain how TCP/IP works"
     - "What are the best practices for REST APIs?"
     - "Find a bug in this JavaScript snippet"
   nearMiss:
     - "ZZZCONTROL placeholder near-miss 1"
     - "ZZZCONTROL placeholder near-miss 2"
     - "ZZZCONTROL placeholder near-miss 3"
     - "ZZZCONTROL placeholder near-miss 4"
     - "ZZZCONTROL placeholder near-miss 5"
     - "ZZZCONTROL placeholder near-miss 6"
     - "ZZZCONTROL placeholder near-miss 7"
     - "ZZZCONTROL placeholder near-miss 8"
   ```
   Note: the rigged-impossible control expects the `shouldTrigger` queries to
   NOT trigger the rigged tool (trigger rate ≈ 0), so the should-trigger axis
   fails, making `passed: false`. The near-miss queries use placeholders since
   they would also not trigger the nonsensical tool. Replace `<SHA>` with the
   actual pinned SHA.

**Files**: `fixtures/skills/trigger-queries/weather-skill-queries.yaml`,
`fixtures/skills/trigger-queries/rigged-impossible-queries.yaml`

**Validation**: T021 references these files in the manifest; T022 loads and
validates the minimum query count (≥8 per axis).

---

### T021 — Author `fixtures/skills/skills-manifest.yaml`

**Purpose**: FR-013 — CTS-style manifest driving the full fixture suite. One entry
per static fixture case (with expectations) and one behavioral entry per trigger
query set.

**Steps**:
1. Create `fixtures/skills/skills-manifest.yaml`.
2. Format: top-level `cases` array. Each case has:
   ```yaml
   - id: <string>
     type: static | behavioral
     skillDir: <relative path from repo root>
     profile: base | anthropic
     # for static cases:
     expectations:
       ok: true | false
       violations:           # list of expected violation paths (not exhaustive message match)
         - path: name
           severity: error
     # for behavioral cases:
     querySetPath: <relative path>
     runsPerQuery: 3
     threshold: 0.5
     isControl: false | true
   ```

3. Static entries (one per fixture from T019):
   ```yaml
   - id: valid-minimal
     type: static
     skillDir: fixtures/skills/valid/minimal
     profile: base
     expectations:
       ok: true
       violations: []

   - id: valid-full-optional
     type: static
     skillDir: fixtures/skills/valid/full-optional
     profile: base
     expectations:
       ok: true
       violations:
         - path: allowed-tools
           severity: warning   # experimental warning

   - id: valid-anthropic-profile-clean
     type: static
     skillDir: fixtures/skills/valid/anthropic-profile-clean
     profile: anthropic
     expectations:
       ok: true
       violations: []

   - id: broken-name-missing
     type: static
     skillDir: fixtures/skills/broken/name-missing
     profile: base
     expectations:
       ok: false
       violations:
         - path: name
           severity: error

   - id: broken-name-too-long
     type: static
     skillDir: fixtures/skills/broken/name-too-long
     profile: base
     expectations:
       ok: false
       violations:
         - path: name
           severity: error

   - id: broken-name-bad-charset
     type: static
     skillDir: fixtures/skills/broken/name-bad-charset
     profile: base
     expectations:
       ok: false
       violations:
         - path: name
           severity: error

   - id: broken-name-leading-hyphen
     type: static
     skillDir: fixtures/skills/broken/name-leading-hyphen
     profile: base
     expectations:
       ok: false
       violations:
         - path: name
           severity: error

   - id: broken-name-dir-mismatch
     type: static
     skillDir: fixtures/skills/broken/name-dir-mismatch
     profile: base
     expectations:
       ok: false
       violations:
         - path: name
           severity: error

   - id: broken-description-missing
     type: static
     skillDir: fixtures/skills/broken/description-missing
     profile: base
     expectations:
       ok: false
       violations:
         - path: description
           severity: error

   - id: broken-description-too-long
     type: static
     skillDir: fixtures/skills/broken/description-too-long
     profile: base
     expectations:
       ok: false
       violations:
         - path: description
           severity: error

   - id: broken-metadata-bad-value
     type: static
     skillDir: fixtures/skills/broken/metadata-bad-value
     profile: base
     expectations:
       ok: false
       violations:
         - path: metadata
           severity: error

   - id: broken-bundled-file-missing
     type: static
     skillDir: fixtures/skills/broken/bundled-file-missing
     profile: base
     expectations:
       ok: false
       violations:
         - path: "(layout)"
           severity: error

   - id: broken-bundled-file-escape
     type: static
     skillDir: fixtures/skills/broken/bundled-file-escape
     profile: base
     expectations:
       ok: false
       violations:
         - path: "(layout)"
           severity: error

   - id: broken-anthropic-reserved-word
     type: static
     skillDir: fixtures/skills/broken/anthropic-reserved-word
     profile: anthropic
     expectations:
       ok: false
       violations:
         - path: name
           severity: error

   - id: broken-anthropic-xml-tag
     type: static
     skillDir: fixtures/skills/broken/anthropic-xml-tag
     profile: anthropic
     expectations:
       ok: false
       violations:
         - path: description
           severity: error
   ```

4. Behavioral entries:
   ```yaml
   - id: behavioral-weather-skill
     type: behavioral
     skillDir: fixtures/skills/valid/minimal
     profile: base
     querySetPath: fixtures/skills/trigger-queries/weather-skill-queries.yaml
     runsPerQuery: 3
     threshold: 0.5
     isControl: false

   - id: behavioral-rigged-control
     type: behavioral
     skillDir: fixtures/skills/broken/name-missing
     profile: base
     querySetPath: fixtures/skills/trigger-queries/rigged-impossible-queries.yaml
     runsPerQuery: 3
     threshold: 0.5
     isControl: true
   ```
   Note: the rigged-control behavioral entry uses `name-missing` as its skill
   dir but overrides description in the test runner with the
   `RIGGED_IMPOSSIBLE_DESCRIPTION` constant from `trigger.ts`. Document this
   in the manifest as a comment.

**Files**: `fixtures/skills/skills-manifest.yaml`

**Validation**: T022 loads this file and runs all cases.

---

### T022 — Extend CTS suite runner for skills fixtures (`tests/cts/skills-suite.test.ts`)

**Purpose**: FR-013, FR-014 — CTS-style manifest runner that exercises the complete
fixture suite end-to-end. Verifies SC-002 (rule coverage matrix), SC-004
(discrimination control fails), SC-006 (byte-stable output).

**Steps**:
1. Create `tests/cts/skills-suite.test.ts`.
   (Do NOT modify `tests/cts/suite.test.ts` which is owned by the CTS core —
   create a sibling file instead.)
2. Load `fixtures/skills/skills-manifest.yaml` using the `yaml` package.
   Resolve all `skillDir` and `querySetPath` values to absolute paths from the
   repo root.
3. For each static case in the manifest:
   - Call `skillsAdapter.parse(absoluteSkillDir)` to get the `SkillDocument`.
   - Call `skillsAdapter.validate(doc, profile)` to get violations.
   - Compare actual `ok` (derived from `violations.length === 0 || no-error-severity`)
     against `expectations.ok`.
   - For each expected violation in `expectations.violations`: assert a violation
     exists with the matching `path` and `severity`. Use partial matching (not
     full message match) to keep tests stable across message wording changes.
   - Report each case as pass or fail; collect all results.
4. SC-002 coverage matrix check:
   ```ts
   const staticRules = [
     "name-missing", "name-too-long", "name-bad-charset",
     "name-leading-hyphen", "name-dir-mismatch",
     "description-missing", "description-too-long",
     "metadata-bad-value", "bundled-file-missing",
     "bundled-file-escape", "anthropic-reserved-word",
     "anthropic-xml-tag"
   ];
   // For each rule, assert there is at least one passing fixture
   // and at least one broken fixture that produces ok: false.
   ```
   This matrix must be an explicit test block, not an implicit side effect.
5. For behavioral cases: behavioral tests require a real model endpoint.
   Mark all behavioral suite tests with `it.skipIf(!process.env.MUSTER_BASE_URL)`
   so they are skipped in offline CI but runnable locally and in integration runs
   where `MUSTER_BASE_URL` is set. Do not skip static tests.
6. SC-004 discrimination control: for the `isControl: true` behavioral case,
   when the behavioral test runs, assert `verdict.passed === false`.
   Add a static-mode analog: a test that instantiates the rigged control case
   with a mocked trigger runner (all runs return non-trigger) and asserts
   `passed: false` — this runs in all CI environments without a model endpoint.
7. SC-006 byte-stability assertion:
   ```ts
   it("byte-stable static output: two runs produce identical JSON", () => {
     const run1 = staticCases.map(c => JSON.stringify(runStaticCase(c)));
     const run2 = staticCases.map(c => JSON.stringify(runStaticCase(c)));
     expect(run1).toEqual(run2);
   });
   ```
   `runStaticCase` is a helper that calls `parse` + `validate` and returns a
   deterministic result object. The comparison uses `toEqual` (deep equality)
   to catch any ordering difference.
8. SC-005 (documented, not auto-tested): add a comment block explaining that
   the behavioral suite is endpoint-agnostic by construction — only env vars
   differ between runs against two endpoints. No code change needed.

**Files**: `tests/cts/skills-suite.test.ts`

**Validation**: `pnpm test` green for all static cases; behavioral cases skipped
in offline CI; byte-stability assertion passes.

---

### T023 — WP04 final verification (gate for Definition of Done)

**Steps** (run in order):
```bash
pnpm build              # strict tsc — zero errors
pnpm test               # full suite including skills-suite.test.ts — zero failures
```

SC-002 matrix check confirmation:
```bash
pnpm test -- --reporter=verbose tests/cts/skills-suite.test.ts | grep "SC-002"
# must show the coverage matrix test passing
```

SC-004 discrimination control confirmation:
```bash
pnpm test -- --reporter=verbose tests/cts/skills-suite.test.ts | grep "discrimination"
# must show the discrimination control test passing with passed: false assertion
```

SC-006 byte-stability confirmation:
```bash
pnpm test -- --reporter=verbose tests/cts/skills-suite.test.ts | grep "byte-stable"
# must show the byte-stability test passing
```

Coverage check (SonarCloud gate gate):
```bash
pnpm test:coverage      # must emit coverage/lcov.info; overall new-code >= 80%
```

Confirm no adapter source file was modified:
```bash
git diff --stat src/adapters/skills/   # must show no changes (fixture/test WP only)
```

## Definition of Done

- [ ] All 14 static fixture skill directories exist with well-formed YAML frontmatter
- [ ] Both trigger query fixture files have ≥8 should-trigger + ≥8 near-miss entries
- [ ] `fixtures/skills/skills-manifest.yaml` has one entry per static fixture + both behavioral entries
- [ ] `tests/cts/skills-suite.test.ts` passes all static cases
- [ ] SC-002 coverage matrix test passes (every static rule: ≥1 passing + ≥1 broken fixture)
- [ ] SC-004 discrimination control static-mode analog asserts `passed: false`
- [ ] SC-006 byte-stability assertion passes
- [ ] Behavioral cases are `skipIf(!MUSTER_BASE_URL)` so offline CI stays green
- [ ] `pnpm build` (strict tsc) passes with zero errors
- [ ] `pnpm test` (full suite) green; no test modified outside `owned_files`; no new skips in static tests
- [ ] `pnpm test:coverage` emits `coverage/lcov.info`; new-code coverage ≥80%
- [ ] No file under `src/adapters/skills/` or `src/core/` modified

## Reviewer guidance

- **Reject if** SC-002 matrix check is missing or is a comment only (it must
  be an executable assertion that would fail if a broken fixture were removed).
- Check the discrimination control analog test: it must use a mocked trigger
  runner that returns zero triggers and assert `passed: false` — a test that
  only checks `isControl: true` without asserting the result value is not
  sufficient.
- Verify behavioral tests are gated on `MUSTER_BASE_URL`: run `pnpm test`
  without setting the env var and confirm the test count matches the expected
  offline count (no behavioral test failures, only skips).
- Byte-stability: confirm the assertion calls the actual `parse` + `validate`
  pipeline twice (not a cached result) — the point is to catch non-determinism
  in the pipeline, not to verify a cached result is stable.
- SC-005 documented comment: confirm a comment block in `skills-suite.test.ts`
  references SC-005 and explains the endpoint-agnostic design.
- Coverage: the SonarCloud gate is a blocking PR check. If `pnpm test:coverage`
  produces < 80% new-code coverage, this WP must not merge. The reviewer checks
  the CI SonarCloud status, not just the local report.
