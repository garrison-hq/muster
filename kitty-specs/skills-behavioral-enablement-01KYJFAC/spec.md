# Feature Specification: Skills Behavioral Enablement

**Mission**: `skills-behavioral-enablement-01KYJFAC` (mission_id `01KYJFACZ1SH8YKA3M2AGDMF8P`)
**Created**: 2026-07-27
**Status**: Draft
**Mission Type**: software-dev
**Milestone**: muster conformance programme, wave 1 — M5
**Input**: GitHub issue `garrison-hq/muster#59` ("[M5] skills-behavioral-enablement — make `muster skills run` execute behavioral trigger cases; fix env + manifest seams"), verified line-by-line against `garrison-hq/muster@65490f6` (current `main`, M2 merge commit) before this spec was written.
**Seeds**: `garrison-hq/muster#59` (mission brief); `garrison-hq/muster#62` (discrimination-control defect family); `src/adapters/skills/trigger.ts` (the grader this mission wires up, already implemented and tested); `tests/cts/skills-suite.test.ts` (the reference wiring this mission lifts into the CLI); the project charter (`BRIEF.md:83-96`, six carried-over constraints).

---

## Overview

`muster skills run <manifest>` is the CLI entry point for the Agent Skills (agentskills.io) conformance adapter. It supports two case types: `static` (offline SKILL.md lint, always runs) and `behavioral` (trigger-routing conformance against a BYOM chat endpoint). The **behavioral grader already exists, is fully implemented, and is tested** — `runTriggerConformance` (`src/adapters/skills/trigger.ts:353`) runs should-trigger and near-miss query axes against an injected `TriggerChatClient`, aggregates k-of-n, and ships a rigged-impossible discrimination control (`createDiscriminationControl`, `trigger.ts:282`). A full, working reference call site for exactly this grader already exists in `tests/cts/skills-suite.test.ts:312-396`.

None of that is reachable from the shipped CLI. `doSkillsRun` (`src/cli/index.ts:1320`) unconditionally records every `type: "behavioral"` case as `{ passed: true, skipped: true }` (`index.ts:1347`) and never constructs a client — confirmed by direct code read against `garrison-hq/muster@65490f6b8561899394f5f046a5d93c53ef51d12c` (this mission's own branch point; **not** the commit issue #62 cites, `8953ee844dd03859e6c3f3809ae811595f6bc8b4` — `src/cli/index.ts` grew 128 lines between those two commits, so line numbers differ from both issue #59 and issue #62's own citations; every citation in this spec was re-verified directly against the branch-point commit, see the correction in Normative Citations). This matches issue #59's correction #4 exactly. This mission wires the CLI to the grader that already exists, and fixes four seams found around it:

1. **Env-var inconsistency** (issue #59 correction #3, confirmed): the grader's own endpoint construction reads `process.env["MUSTER_BASE_URL"]` (`trigger.ts:314`), and every fixture, test, and even `.env.example` itself (`MUSTER_BASE_URL=https://api.openai.com/v1`, line 16) documents `MUSTER_BASE_URL` as the skills convention — while the CLI's own `skills run --help` text tells users to set `MUSTER_ENDPOINT` (`index.ts:1963-1964`), and every *other* adapter (`heartbeat`, `crosslayer`; `a2a` excepted — a2a resolves its endpoint dynamically via `process.env[loaded.endpoint.env]` rather than a hardcoded `MUSTER_ENDPOINT` read, see FR-002's requirement text) canonically reads `MUSTER_ENDPOINT` (`endpointFromEnv`, `index.ts:873`). Confirmed: this is a real, live inconsistency, not a documentation nit — the two names are read in different files for the same purpose.
2. **Unvalidated manifest** (confirmed): `doSkillsRun` parses the manifest with a bare cast, `parseYaml(raw) as { cases: SkillsManifestCase[] }` (`index.ts:1333`), no schema, no runtime shape check. A malformed manifest fails wherever the first bad field is dereferenced, not at a well-formed `exit 2` boundary.
3. **A fabricated-looking normative citation** (issue #59 correction #5, refined by this mission's own verification — see "Normative Citations" and the OQ-1 resolution below): `trigger.ts` cites `agentskills.io/specification#trigger-testing@d8a3f2e1b9c74051e6f8d2a7c3b5f0e9d1a4c8b2`. That exact anchor does not exist. A real, substantively matching upstream source *does* exist, at a different URL, with no commit-SHA scheme of its own — this mission repoints the citation to it via a new muster-published rubric, `docs/rubric/skills-trigger-taxonomy.md` (issue #59 correction #5's own remedy), which does not exist yet — `docs/rubric/skills-trigger-taxonomy.md` is not among the four files `git ls-tree -r --name-only 65490f6 -- docs/rubric/` reports at this mission's branch point (`sop-rule-taxonomy.md`, `memory-utilization-taxonomy.md`, `spec-kitty-behavioral-axes.md`, `spec-kitty-profile-taxonomy.md` — the latter two landed via `65490f6` itself, M2's merge commit, so they are not drift relative to this citation, they were simply never two files to begin with).
4. **The skills adapter's own discrimination-control-defeat bug** (`garrison-hq/muster#62`, live-reproduced by that issue against both `v1.1.0` and `main@8953ee8`; re-confirmed by this spec against `main@65490f6` — the bug is present, unchanged, at the corrected line numbers below): `runStaticSkillCase` (`index.ts:1280-1312`)'s `catch` block derives `passed` from `!c.expectations.ok` (`index.ts:1306`) whenever `parseSkill` throws — so a **missing or unreadable fixture** (a deleted control-skill directory, a typo'd `skillDir`) is scored identically to "the checker read the fixture and correctly judged it non-conformant." A `control: true`-shaped static case (declaring `expectations.ok: false`) keeps reporting `PASS`/exit 0 even after its fixture directory is deleted entirely. This is the family of defect this programme has repeatedly hit — a control that still passes when its own fixture is deleted — and it is the **primary, live-reproduced** finding of issue #62, structurally related to but distinct from the a2a instance discussed under Scope Guard.

This mission is **mostly plumbing** — FR-001 through FR-006 wire an existing grader, fix an env seam, validate a shape, or document a citation, with no new discrimination-control design. FR-007 is the one genuine bug fix: it closes the skills adapter's reproduced catch-block defect (item 4 above), following the exact fail-closed pattern issue #62 itself catalogued as already correct everywhere else in the codebase (`crosslayer/manifest-runner.ts`, `core/cts/runner.ts`, `core/behavioral/runner.ts`, `heartbeat`, `tools`). The existing rigged-impossible behavioral control (`RIGGED_IMPOSSIBLE_DESCRIPTION`, `trigger.ts:56-58`) becomes CLI-reachable and this mission proves it fails through the CLI, not just through `tests/cts/skills-suite.test.ts`.

## User Scenarios & Testing

Acceptance scenarios are stated as commands with observed exit codes, per this mission's verification discipline — not prose Given/When/Then.

### Primary User Stories

1. **Suite author (behavioral cases actually run)**: As a skills-manifest author, when I declare a `type: behavioral` case and `MUSTER_ENDPOINT` is set, I get a real trigger-conformance verdict — not a silent `skipped: true` that looks identical to "ran and passed."
2. **CI operator (env consistency)**: As an operator wiring CI, I set the same `MUSTER_ENDPOINT` / `MUSTER_MODEL` / `MUSTER_API_KEY` triple that every other muster adapter reads, and the skills adapter honors it — with a deprecation path, not a silent breakage, for anyone already using `MUSTER_BASE_URL`.
3. **Suite author (malformed manifest is loud)**: As an author, a manifest with a typo'd field or wrong shape fails at `exit 2` with a pointed message, at parse time — not partway through case execution with a stack trace.
4. **Auditor (honest citation)**: As someone auditing muster's constraint-5 compliance, every trigger-methodology number (8-minimum, 3-run default, 0.5 threshold) traces to a real, commit-pinned source — not a citation string that resolves to nothing.

### Acceptance Scenarios

#### FR-001 — behavioral cases execute

```bash
# AC-1a: behavioral case runs against a mock/live client when endpoint is configured.
MUSTER_ENDPOINT=http://localhost:11434/v1 muster skills run examples/skills/manifest.yaml --json
# Expect: exit 0 or 1 (never silently "skipped"); JSON result for the behavioral
# case has skipped:false and a real shouldTriggerAxis/nearMissAxis breakdown.

# AC-1b: absent endpoint still skips gracefully (regression: must not become a hard failure).
unset MUSTER_ENDPOINT MUSTER_BASE_URL
muster skills run examples/skills/manifest.yaml --json
echo "exit=$?"
# Expect: exit 0; behavioral case result has skipped:true, passed:true; static
# cases in the same manifest still ran and are reflected in `total`/`passed`.
```

#### FR-002 — env alias

```bash
# AC-2a: canonical var works.
MUSTER_ENDPOINT=http://localhost:11434/v1 muster skills run examples/skills/manifest.yaml
echo "exit=$?"  # Expect: 0 or 1, never 2; no stderr deprecation warning.

# AC-2b: deprecated alias still works, with a warning, for >=1 minor release.
MUSTER_BASE_URL=http://localhost:11434/v1 muster skills run examples/skills/manifest.yaml 2>&1 | grep -i "deprecat"
echo "exit=$?"  # Expect: 0 (grep found the deprecation line on stderr); the run itself still executes.

# AC-2c: both set — MUSTER_ENDPOINT wins (canonical takes priority); no deprecation
# warning is emitted, since the alias did not supply the value.
MUSTER_ENDPOINT=http://localhost:11434/v1 MUSTER_BASE_URL=http://unreachable-should-not-be-used:1/v1 \
  muster skills run examples/skills/manifest.yaml 2>&1 | grep -ic deprecat
# Expect: printed count is exactly 0 (not grep's own exit code — see FR-004's
# verification for why an absence check must read a count, never a grep exit status).
```

#### FR-003 — manifest schema validation

```bash
# AC-3: malformed manifest -> exit 2 with a pointed message.
cat > /tmp/bad-skills-manifest.yaml <<'EOF'
cases:
  - id: broken
    type: static
    # missing skillDir, profile, expectations -> schema violation
EOF
muster skills run /tmp/bad-skills-manifest.yaml
echo "exit=$?"  # Expect: 2, with a message naming the missing/invalid field(s).
```

#### FR-005 — control-case verdict, honestly reported, CLI-reachable

```bash
# AC-4: the rigged-impossible control (now reachable from the CLI) fails, and the
# overall run reflects that failure honestly.
MUSTER_ENDPOINT=<endpoint> muster skills run fixtures/skills/skills-manifest.yaml --json | \
  jq '.results[] | select(.type=="behavioral")' # find the control case's isControl-equivalent entry
# Expect: the control case is NOT silently reported passed:true unless the model
# genuinely never invoked the rigged-impossible tool (a model-quality signal
# logged to stderr, per existing trigger.ts:431 behavior) -- the CLI must
# surface the same verdict runTriggerConformance already computes, unmodified.
```

#### FR-007 — static-path negative-expectation case fails closed on fixture absence (issue #62)

```bash
# AC-5: this mission's own instance of the delete-direction test — the fixture is
# deleted, not flipped. `broken-name-dir-mismatch` is a real, checked-in
# expectations.ok:false case (fixtures/skills/skills-manifest.yaml:92-101,
# skillDir: broken/name-dir-mismatch) -- structurally the same shape issue #62
# demonstrated with its own scratch fixture (a name/directory mismatch).

# Before the fixture is touched: the case fires as designed (a real lint violation
# — the declared name really does not match the directory).
muster skills run fixtures/skills/skills-manifest.yaml --json | jq '.results[] | select(.id=="broken-name-dir-mismatch")'
echo "exit=$?"   # case-level passed:true (the mismatch IS the violation); overall run exit 0

# Delete the case's own fixture directory entirely.
rm -rf fixtures/skills/broken/name-dir-mismatch
muster skills run fixtures/skills/skills-manifest.yaml --json | jq '.results[] | select(.id=="broken-name-dir-mismatch")'
echo "exit=$?"
# Before this mission's fix: passed:true, exit 0 -- the ENOENT is captured only in
# violations[].message, with no effect on the verdict (issue #62's defect; the
# catch-block logic at this location is byte-identical between the commit issue
# #62 examined and this mission's branch point, confirmed by `git diff` showing no
# change to runStaticSkillCase between them).
# After this mission's fix: the case must NOT report passed:true. It must report a
# distinguishable execution-error outcome (e.g. passed:false, or a dedicated
# errored:true field) so the overall run's exit code reflects the loss of the
# fixture rather than silently agreeing with the missing-file error.
```

#### C-004 — exit contract unchanged

```bash
muster skills run examples/skills/manifest.yaml; echo $?    # all pass/skip -> 0
# (inject one failing static case)                          # any non-skipped fail -> 1
muster skills run /nonexistent-manifest.yaml; echo $?        # read/parse error -> 2
```

### Edge Cases

- `MUSTER_ENDPOINT` set but unreachable mid-run: an errored trigger call counts as a non-trigger for that run (`trigger.ts:240-249`, existing, unmodified) — never skipped, never retried. This mission adds a **regression test** (C-001) proving the CLI wiring does not accidentally introduce a retry or a skip-on-error path.
- Both `MUSTER_ENDPOINT` and `MUSTER_BASE_URL` unset: behavioral cases skip; static cases still run; overall exit reflects only the static results (unchanged from today).
- A manifest with zero behavioral cases: FR-001/FR-002 are inert no-ops; existing static-only behavior is unaffected (regression coverage, not new behavior).
- A behavioral case whose `querySetPath` file is missing or its query set is below the 8-per-axis minimum: `runTriggerConformance`'s existing hard gate (`trigger.ts:359-378`) returns `passed:false` with zeroed axes — the CLI wiring must not swallow or reinterpret this as a parse error or a skip.
- A control case (`isControl: true`) whose query set is empty or malformed: same hard-gate path as above — the control fails closed (`passed:false`), which for a control means the run reports the fixture-authoring bug loudly rather than the control silently vanishing into `skipped`.

## Requirements

### Functional Requirements

| ID | Requirement | Verification | Expected Exit | Status |
|----|-------------|---------------|----------------|--------|
| FR-001 | `doSkillsRun` (`index.ts:1320`) executes `type: "behavioral"` cases via `runTriggerConformance` when a chat endpoint is configured (FR-002 env resolution); when no endpoint is configured, cases are reported `skipped:true, passed:true` (unchanged from today's default-skip shape, now reached via an explicit env check rather than unconditionally). | `MUSTER_ENDPOINT=<endpoint> muster skills run <manifest-with-behavioral-case> --json` shows `skipped:false` and a populated `shouldTriggerAxis`/`nearMissAxis`; the same command with the env unset shows `skipped:true`. | 0 or 1 (endpoint set); 0 (endpoint unset, all skip/pass) | Proposed |
| FR-002 | Trigger transport resolution reads `MUSTER_ENDPOINT` (canonical, matching every other adapter's `endpointFromEnv` convention, `index.ts:873-883` — **except `a2a`**, which does not use `endpointFromEnv` at all: it resolves its endpoint dynamically per-manifest via `process.env[loaded.endpoint.env]` (`src/adapters/a2a/index.ts:531`), reading whatever env-var name the manifest itself names rather than a hardcoded `MUSTER_ENDPOINT` read; this is a different, deliberate design for a2a and is not a seam this mission touches); `MUSTER_BASE_URL` is honored as a **deprecated alias** starting with the release that ships this mission's merged commit — concretely, no earlier than `v1.2.0` (the next minor release after the currently-tagged `v1.1.0`: two unreleased `feat` commits already sit on `main` above `v1.1.0` as of this mission's branch point, which forces a minor bump under this repo's semantic-release/Conventional-Commits setup before this mission's own changes are even considered) — and remains supported for at least that release plus the following minor release (i.e., not removable before `v1.3.0` or later). Removal is **not** implicit in this mission: it requires its own follow-up issue, filed at merge time by whoever merges this mission (mirroring the `#69` pattern used elsewhere in this spec), naming the alias explicitly rather than leaving it to silently linger. Until removed, a one-line deprecation warning is emitted on stderr when `MUSTER_BASE_URL` is the var that supplied the value. `.env.example` and `skills run --help` text are updated to name `MUSTER_ENDPOINT` as canonical. | `MUSTER_ENDPOINT=<endpoint> muster skills run <manifest>` runs with no warning; `MUSTER_BASE_URL=<endpoint> muster skills run <manifest> 2>&1` emits a deprecation line; both set → `MUSTER_ENDPOINT` wins silently and emits no warning; verified with `MUSTER_ENDPOINT=X MUSTER_BASE_URL=Y muster skills run <manifest> 2>&1 \| grep -ic deprecat` → printed count `0`. | 0/1 (both paths); never 2 for env resolution alone | Proposed |
| FR-003 | The skills manifest gains an Ajv JSON Schema (Draft 2020-12, matching the `openclaw-sop` precedent at `src/adapters/openclaw-sop/manifest.ts:200-238`) covering the case-shape union (`static` vs `behavioral` discriminated by `type`), required fields per branch, and the `expectations` shape. A schema violation is a **structural** error → `exit 2` with a message naming the offending field(s), raised before any case executes. | `muster skills run <manifest-missing-required-field>` | 2 | Proposed |
| FR-004 | `docs/rubric/skills-trigger-taxonomy.md` is published (new file; `docs/rubric/` does not contain it today — confirmed by `git ls-tree -r --name-only 65490f6 -- docs/rubric/`, which lists `sop-rule-taxonomy.md`, `memory-utilization-taxonomy.md`, `spec-kitty-behavioral-axes.md`, `spec-kitty-profile-taxonomy.md`). It documents the 8-minimum-per-axis rule, should-trigger vs. near-miss query semantics, the 0.5 default threshold, the k-of-n aggregation rationale, and the discrimination-control requirement — citing the **real** upstream source resolved by this mission (see Normative Citations) rather than the fabricated `#trigger-testing` anchor. The fabricated anchor's four real occurrences (re-derived directly against `65490f6` with `command grep`, not copied from any prior report) are repointed to this rubric: `src/adapters/skills/trigger.ts` (4 occurrences, in doc comments and the discrimination-control's own source string), `src/adapters/skills/types.ts` (1 occurrence, not previously named in this spec), `fixtures/skills/trigger-queries/rigged-impossible-queries.yaml` (1 occurrence), and `fixtures/skills/trigger-queries/weather-skill-queries.yaml` (1 occurrence). `fixtures/skills/skills-manifest.yaml` does **not** contain the anchor — it is not one of the four sites and is removed from this requirement's file list. | Two separate, explicit assertions (an absence check must never be a single `grep -qv`-shaped command, per this programme's own lesson): (a) `test -f docs/rubric/skills-trigger-taxonomy.md` — file exists; (b) `grep -rln "agentskills.io/specification#trigger-testing" src/ fixtures/ examples/ docs/ \| wc -l` — count must equal `0` (asserted as a number, not as grep's own exit code, since grep's "no match" exit status of 1 must never be read as this check's pass/fail signal; at `65490f6` this same command returns `4`, matching the four files just named, so the gate itself is already sound — only the prose file list was wrong). | (a) 0 (file exists); (b) the printed count is the literal string `0` | Proposed |
| FR-005 | The behavioral path honors the existing discrimination-control flow unmodified: a case with `isControl: true` is passed through to `runTriggerConformance` exactly as today's tests already exercise it (`tests/cts/skills-suite.test.ts:334-396`); its verdict (`passed`, `isControl`) is reported in the CLI's JSON and human output with no reinterpretation. This FR makes the control **reachable from the CLI** — it does not change grading semantics. | `MUSTER_ENDPOINT=<endpoint> muster skills run fixtures/skills/skills-manifest.yaml --json`, control case entry has `isControl:true`; against a real model, `passed:false` (SC-004 cap-of-zero, existing). | 1 whenever the control's own verdict is `passed:false` and it is the only non-skipped result | Proposed |
| FR-006 | `examples/skills/manifest.yaml` gains one `type: behavioral` case (a real, realistic skill) and one `isControl: true` case, each with a companion query-set file, exercised in `tests/skills/cli.test.ts` (new/extended) against a mock `TriggerChatClient` — offline, deterministic, no live model dependency for this fixture's test coverage. | `pnpm vitest run tests/skills/cli.test.ts` | 0 (vitest process exit) | Proposed |
| FR-007 | **Fixes `garrison-hq/muster#62`'s primary, live-reproduced defect.** `runStaticSkillCase`'s (`index.ts:1280-1312`) `catch` block no longer derives `passed` from `c.expectations.ok` (`index.ts:1306`) when `parseSkill`/`validateSkill`/`checkLayout` throw. An execution error (missing `SKILL.md`, missing skill directory, unparseable frontmatter) is distinguished from "the checker read the fixture and correctly judged it non-conformant" and forces a fail-closed outcome, matching the pattern issue #62 itself verified as already correct in `crosslayer/manifest-runner.ts`'s `runManifest`/`runStaticCase`, `core/cts/runner.ts`'s `runCase`, `core/behavioral/runner.ts`, `heartbeat`'s `gradeStaticLintCase`, and `tools`'s uncaught-propagation path. | `rm -rf` a static case's fixture directory referenced by an `expectations.ok: false` manifest entry; re-run `muster skills run <manifest>` — the case must not report `passed:true`; the **delete-direction** test (fixture entirely absent), not just the flip-direction test (fixture present but its content changed). | 1 (the case's failure to execute contributes to a non-zero run, distinct from the old silent `exit 0`) | Proposed |

### Constraints

| ID | Constraint | Verification | Expected Exit | Status |
|----|------------|---------------|----------------|--------|
| C-001 | An errored trigger run counts as a failed run — never retried, never silently skipped (already enforced at `trigger.ts:245-249`; this mission adds a **regression test at the CLI-wiring layer**, since FR-001 is the first time this code path is reachable end-to-end from `doSkillsRun`). | New test: mock client throws on every call for a should-trigger query → `runsErrored` increments, trigger rate is 0, axis fails; asserted via the CLI's `doSkillsRun` entry point, not only via `trigger.ts`'s own unit tests. | n/a (unit-test assertion, vitest exit 0) | Proposed |
| C-002 | k-of-n aggregation for trigger axes is unchanged (declared stylistic per charter behavioral-grading tiers, `trigger.ts:26-31`); this mission introduces no pass^k semantics for trigger axes. | Code review / diff: no change to `gradeAxis` (`trigger.ts:195`) aggregation logic. | n/a | Proposed |
| C-003 | No credential appears in argv; the chat endpoint is resolved from environment variables only (`MUSTER_ENDPOINT`/`MUSTER_BASE_URL` for the base URL, `MUSTER_MODEL`, `MUSTER_API_KEY` falling back to `OPENAI_API_KEY` — never the key *value*, only the env-var *name*, matching `EndpointConfig.apiKeyEnv`). The NI-003 fetch-isolation invariant (`tests/unit/invariants.test.ts`) stays green: FR-001's wiring reuses `makeToolClient`/`makeClientWithTools` (`trigger.ts:133`, `core/behavioral/client.ts`) — **no new literal `fetch` call is added to `src/cli/index.ts` or `src/adapters/skills/**`.** | `pnpm vitest run tests/unit/invariants.test.ts` | 0 | Proposed |
| C-004 | Exit-code contract unchanged: `0` all non-skipped cases passed (or all skipped); `1` at least one non-skipped case failed; `2` manifest could not be read or was structurally invalid (now including Ajv schema failures, FR-003). | `muster skills run <manifest>; echo $?` across the three manifest states above. | 0 / 1 / 2 respectively | Proposed |

### Key Entities

- **SkillsManifestBehavioralCase**: existing type (`index.ts:1240-1249`) — already carries `skillDir`, `profile`, `querySetPath`, `runsPerQuery`, `threshold`, `isControl`. No new fields are required for FR-001/FR-005/FR-006; the manifest shape already anticipated this wiring (this is why the mission is low-risk plumbing, not new design).
- **TriggerQuerySet file** (referenced by `querySetPath`): a YAML file with `id`, `source`, `shouldTrigger[]`, `nearMiss[]`, `threshold` — shape already exercised in `tests/cts/skills-suite.test.ts:334-341`; FR-003's Ajv schema covers the manifest, not this referenced file (out of scope — see Scope Guard).
- **TriggerVerdict**: existing type (`types.ts` §TriggerVerdict) — `passed`, `shouldTriggerAxis`, `nearMissAxis`, `isControl`. FR-005 reports this verdict through the CLI unmodified.

## Discrimination Controls

| Grader | Control | Falsification condition (what makes it fail) | Proof of failure required by this mission |
|--------|---------|-----------------------------------------------|---------------------------------------------|
| `runTriggerConformance` should-trigger / near-miss axes | `createDiscriminationControl` (`trigger.ts:282`) — a skill tool named `rigged-impossible-control` with `RIGGED_IMPOSSIBLE_DESCRIPTION` (`trigger.ts:56-58`), which "cannot plausibly match any realistic query." | The should-trigger axis trigger rate must be ≈0 (< 0.5 threshold) against realistic queries. **This control was already observed failing correctly** in `tests/cts/skills-suite.test.ts:384-387` (`SC-004`, asserted `passed === false`) — pre-existing evidence, not new. What was *never* true before this mission: the control was **unreachable from the shipped CLI** (FR-001's defect). FR-006 adds the **CLI-level** proof: the same control, run through `muster skills run` against a mock client that never selects the rigged tool, must report `passed:false` and — per C-004 — contribute to a non-zero exit code when it is the only non-skipped case. |
| `runStaticSkillCase`'s negative-expectation cases (FR-007, `garrison-hq/muster#62`) | Any static case declaring `expectations.ok: false` — e.g. `broken-name-dir-mismatch` (`fixtures/skills/skills-manifest.yaml:92-101`, `skillDir: broken/name-dir-mismatch`), whose fixture's declared `name` deliberately mismatches its directory — structurally the same shape as issue #62's own illustrative scratch fixture. | **The delete-direction test**, not the flip-direction test: `rm -rf fixtures/skills/broken/name-dir-mismatch` and re-run. Before FR-007: `passed:true`, exit 0 — issue #62's exact defect (the catch-block logic at this location is confirmed byte-identical between the commit issue #62 examined and this mission's branch point, via `git diff`, so the defect is still live, not merely historical). After FR-007: the case must not report `passed:true`; the run must reflect the fixture's absence as an execution problem, distinct from "correctly detected non-conformance." | The WP implementing FR-007 must include this exact delete-direction test — not only a fixture-content flip — since issue #62's own point is that every *flip*-direction test already passed while the *delete*-direction case silently didn't. |
| FR-003's Ajv manifest schema | A manifest missing a required field, or with `type` outside the `static`/`behavioral` enum. | The schema validator must reject it — `exit 2`, not a downstream `TypeError` from dereferencing an absent field. | The WP that implements FR-003 must include a fixture manifest that is deliberately malformed (missing `skillDir`, wrong `type` value, `expectations.ok` as a string) and assert `exit 2` for each — the delete-direction analog here is already covered structurally: a missing *manifest file* (as opposed to a missing case fixture) hits the existing `readFileOrThrow` → `ExecutionError` → exit 2 path, unchanged by this mission, verified by existing behavior at `index.ts:1330-1336`. |

**Explicitly not this mission's discrimination-control debt** (see "a2a control-inversion" decision below): the a2a adapter's `applyControlInversion` (`src/adapters/a2a/index.ts:356-371`) has a **structurally related but distinct** defect from the one FR-007 fixes above — a2a's bug is in the *inversion* step applied uniformly after grading (it flips any non-skipped `passed:false`, whether that came from a correctly-detected violation or from a read failure), not in a *catch block that derives `passed` from an expectation* (the skills bug FR-007 fixes). Both let a discrimination control's fixture-absence read as a pass, but the fix shapes differ, and the a2a instance was found by issue #62's own code-reading only — not yet live-reproduced, unlike the skills instance FR-007 fixes. It lives in a different adapter, a different file, and is explicitly out of scope for this mission — see Scope Guard.

## Normative Citations

| Check | Cites | Pin |
|-------|-------|-----|
| FR-001, FR-005 (behavioral wiring reuses the existing grader unmodified) | `runTriggerConformance`, `createDiscriminationControl` — `src/adapters/skills/trigger.ts` | `garrison-hq/muster@65490f6b8561899394f5f046a5d93c53ef51d12c` (current `main` at mission branch point) |
| FR-002 (env convention) | `endpointFromEnv` precedent — `src/cli/index.ts:873-883` | `garrison-hq/muster@65490f6b8561899394f5f046a5d93c53ef51d12c` |
| FR-003 (Ajv manifest schema pattern) | `SOP_RULE_MANIFEST_SCHEMA` (`src/adapters/openclaw-sop/manifest.ts:200-238`) / `loadAndValidateManifest` (starts `manifest.ts:260`) | `garrison-hq/muster@65490f6b8561899394f5f046a5d93c53ef51d12c` |
| FR-007 (fail-closed-on-execution-error pattern; the fix this mission applies) | `garrison-hq/muster#62`'s own catalogue of the already-correct pattern: `crosslayer/manifest-runner.ts` (`runManifest`/`runStaticCase`), `core/cts/runner.ts` (`runCase`), `core/behavioral/runner.ts`, `heartbeat`'s `gradeStaticLintCase`, `tools`'s uncaught-propagation path — all force `passed:false` (or propagate as a run-level error) unconditionally on a caught execution error, never deriving `passed` from the case's own expectation. | `garrison-hq/muster@65490f6b8561899394f5f046a5d93c53ef51d12c`; issue text itself cites `v1.1.0` and `8953ee844dd03859e6c3f3809ae811595f6bc8b4` for its own live repro |
| FR-004 (trigger-testing methodology: 8-10 queries/axis, 3-run default, 0.5 threshold, near-miss framing) | **Resolved OQ-1** (see below): `agentskills.io/skill-creation/optimizing-descriptions` ("Designing trigger eval queries" / "Running multiple times" sections) — verified live on 2026-07-27; **not** `agentskills.io/specification#trigger-testing`, which does not exist (verified live: the `/specification` page has no `trigger-testing` anchor and covers only the `SKILL.md` format). | `github.com/agentskills/agentskills@b8d2613ac050aa4aa8bfb2cf28380d81cdfcd1ca`, path `docs/skill-creation/optimizing-descriptions.mdx` (latest commit touching that file as of 2026-07-27) |
| Muster's own hard-minimum enforcement (8 exactly, as a gate rather than a "aim for about 20" recommendation) | `[MUSTER-OWN]` — the upstream page frames "8-10 per axis" and "3 runs" as authoring guidance, not an enforced minimum; muster's `MIN_QUERIES_PER_AXIS = 8` (`trigger.ts:61`) and the hard gate (`trigger.ts:359-378`) are muster's own tightening into a machine-checked requirement. The rubric (FR-004) must say this plainly, not present the hard gate as itself upstream-mandated. | N/A (muster's own repo, this mission's commit once merged) |

### OQ-1 resolution (was open in issue #59; resolved during this specify pass)

Verified live against `agentskills.io` on 2026-07-27:

- `agentskills.io/specification` has **no** `#trigger-testing` section or anchor. The page covers only the `SKILL.md` frontmatter format, directory structure, progressive disclosure, and the `skills-ref` validator. Issue #59's cited anchor does not exist at that path — **confirmed defect**, not merely "unverified."
- A real, substantively matching page **does** exist: `agentskills.io/skill-creation/optimizing-descriptions` ("How to improve your skill's description so it triggers reliably"). It documents: ~20 queries total, 8-10 per axis; should-trigger vs. near-miss (its own term) query design; running each query 3 times as "a reasonable starting point"; a 0.5 default trigger-rate threshold. These numbers **substantively match** muster's implementation (`MIN_QUERIES_PER_AXIS = 8`, `runsPerQuery` charter minimum 3, threshold default 0.5) — this is not a coincidence to paper over; it is real prior art, wrongly cited.
- The page's source lives in a public GitHub repo, `agentskills/agentskills`, at `docs/skill-creation/optimizing-descriptions.mdx`, giving a legitimate, immutable commit SHA to pin (`b8d2613ac050aa4aa8bfb2cf28380d81cdfcd1ca`) — unlike the fabricated `d8a3f2e1b9c74051e6f8d2a7c3b5f0e9d1a4c8b2` suffix on the current citation, which does not correspond to any real commit on that repo (spot-checked: not a prefix of any commit touching the specification or skill-creation docs).

**Decision (recorded, resolved)**: cite the real upstream page + commit SHA as prior art for the *numbers*; mark muster's own hard-gate *enforcement* of those numbers as `[MUSTER-OWN]`. This is the more honest and more defensible position than either "no upstream exists" or "silently keep the fabricated anchor."

## Live-Model Verification Plan

This plan is a **hard acceptance precondition for this mission, not an aspiration**: per the operator's standing directive, no mission is complete without real CLI execution against a live endpoint, and step 2 below — observing the rigged-impossible discrimination control actually fail through the CLI — must be executed and its transcript recorded before this mission can be accepted or merged. C-002 (no new pass^k/aggregation semantics) is a diff-review check; it does not discharge this plan. SC-005 is the numeric gate this plan exists to satisfy.

- **Pinned model (required, not "recommended")**: OpenAI `gpt-4o-mini` via `https://api.openai.com/v1`. This is the specific endpoint/model this mission's acceptance run must use — chosen because it is the same model sibling missions already use for their own live checks (`kitty-specs/heartbeat-adapter-01KTYMCG/quickstart.md:31`), it is broadly reachable (no local server dependency), and pinning one concrete model makes the required run reproducible rather than "any OpenAI-compatible endpoint will do." This does not weaken constraint 3 (BYOM, no baked-in providers, `BRIEF.md:83-96`): the product still accepts any OpenAI-compatible endpoint via `MUSTER_ENDPOINT`/`MUSTER_MODEL`; this pin applies only to the one live run this mission's own acceptance depends on. A second, different endpoint (e.g. local Ollama) is still run per step 4 below to demonstrate portability — that step is not pinned to a specific second model, since its purpose is only to show the suite is endpoint-agnostic, not to gate acceptance.
- **Pinned `runsPerQuery`**: `3`. This is not a new choice — it is already checked into `fixtures/skills/skills-manifest.yaml`'s two existing behavioral cases (`behavioral-weather-skill:210`, `behavioral-rigged-control:224`, both `runsPerQuery: 3`, confirmed at `65490f6`) and matches the upstream page's own "running each query 3 times" starting-point guidance (Normative Citations, OQ-1). FR-006's new fixture cases must use the same value for consistency with the acceptance run.
- **Pinned threshold**: `0.5`. Also already checked into both existing query-set files (`fixtures/skills/trigger-queries/{weather-skill,rigged-impossible}-queries.yaml`, both `threshold: 0.5`, confirmed at `65490f6`) and matching `createDiscriminationControl`'s own default (`trigger.ts:293`) and the upstream page's default. FR-006's new query-set files must use the same value.
- **Failure policy (what happens when the live run fails)**:
  - If the required should-trigger case (`behavioral-weather-skill` or FR-006's equivalent) reports `passed:false` against `gpt-4o-mini` on the first attempt, the run is retried **exactly once**, unmodified (same model, same manifest, same env vars) — to rule out transient endpoint flakiness, not to give the criterion multiple chances. If it fails a second consecutive time, **mission completion is blocked**: the WP covering FR-005/FR-006 must not be marked done/approved, and the failure — exact manifest, model, endpoint, and observed trigger rate — is recorded in `quickstart.md` as an open defect for triage (fixture query wording vs. grader threshold vs. model choice) before this mission proceeds to accept/merge.
  - **No silent model substitution is permitted** as a workaround for a failing should-trigger case. Swapping to a different model until one happens to pass would launder "a real, falsifiable trigger-conformance verdict" into "some model can be found that makes this pass" — exactly the failure mode this finding exists to close.
  - The discrimination control's expected outcome is the **opposite** of the should-trigger case's: SC-005 requires it to be observed `passed:false` (the control correctly failing to trigger). If instead the control reports `passed:true` against `gpt-4o-mini` — the rigged-impossible tool was actually invoked — that is an immediate, **non-retryable**, mission-blocking finding: it means either the grader's discrimination control has stopped discriminating, or `gpt-4o-mini` is behaving anomalously, and either cause must be investigated (not retried away) before merge.
- **Target**: the pinned model above for the required acceptance run; any OpenAI-compatible endpoint reachable via `MUSTER_ENDPOINT` (post-FR-002; `MUSTER_BASE_URL` pre-FR-002 / during the deprecation window) for the portability check in step 4.
- **Credentials**: sourced via an environment variable injected inline at invocation time (e.g. command substitution from a credential store outside this working tree), never passed on argv, never logged, and **never via a `.env` file inside this repository** (HIGH-2 remediation — corrected; the previous draft of this bullet inverted the relationship below). `tests/unit/invariants.test.ts`'s NI-001 secret scan walks the entire working tree (excluding only `node_modules`/`.git`/`dist`/`.worktrees`/`.kittify`/`kitty-specs`) and does **not** exempt gitignored files, so a `.env` file containing a real key trips NI-001 red rather than being safely tolerated by it — that test is what a `.env`-based credential flow breaks, it does not "enforce" the `.env` pattern (confirmed live during this mission's own WP04 execution: an `.env` present in the primary checkout tripped NI-001 red on an otherwise-unrelated tree). NI-003 and the credential-hygiene checks still apply: `MUSTER_ENDPOINT`/`MUSTER_BASE_URL`/`MUSTER_MODEL`/`MUSTER_API_KEY` are read only via `process.env[...]` in the skills adapter and CLI wiring — no new `--endpoint`/`--api-key`-shaped CLI flag is introduced.
- **Plan**:
  1. Run `pnpm test` fully offline first (static-only + mocked-client behavioral tests) — must be green with zero network calls (NFR/C-003).
  2. `OPENAI_API_KEY=$(your-credential-lookup-command-here) MUSTER_ENDPOINT=https://api.openai.com/v1 MUSTER_MODEL=gpt-4o-mini node dist/cli/index.js skills run fixtures/skills/skills-manifest.yaml --json` against `gpt-4o-mini` (the pinned model, above; credentials injected inline, never via a `.env` file inside the repo — see the corrected Credentials bullet above): assert the discrimination control (`isControl:true` case) reports `passed:false` (SC-004 cap-of-zero) and the should-trigger case reports `passed:true` at `runsPerQuery: 3`, `threshold: 0.5`. Apply the failure policy above if either assertion does not hold on the first attempt.
  3. Record the exact manifest, model, endpoint, `runsPerQuery`, and threshold used for this run in the mission's `quickstart.md` (a checked-in artifact), so the reported pass/fail is reproducible — per this programme's lesson about headline figures that survive review while being unreproducible.
  4. Re-run step 2 against a second, different endpoint (e.g. local Ollama) changing **only** the env vars, to demonstrate SC-005-style endpoint-agnosticism (the suite code and fixtures are unchanged; only `MUSTER_ENDPOINT`/`MUSTER_MODEL`/`MUSTER_API_KEY` differ) — this is the existing pattern from `tests/cts/skills-suite.test.ts`'s own doc comment (SC-005) applied at the CLI layer for the first time. The failure policy above applies only to the pinned-model run in step 2; step 4 is a portability demonstration, not a second acceptance gate.

## Scope Guard — what this mission will not do

- **No new grader logic.** `runTriggerConformance` and its aggregation/discrimination-control semantics are unchanged; this mission wires an existing, tested grader into the CLI and fixes the seams around it.
- **No SK-side query-set authoring** (that is M6, `MOES-Media/spec-kitty#25`, per issue #59's own dependency note — this mission is M6's sole blocker, not its content).
- **No change to the 8-minimum or threshold semantics.** FR-004 documents the existing numbers honestly; it does not change `MIN_QUERIES_PER_AXIS`, `runsPerQuery` defaults, or the 0.5 threshold.
- **No comparison of `expectations.violations` in static cases.** Confirmed still true on `main@65490f6`: `runStaticSkillCase` (`index.ts:1280-1312`) computes `passed = ok === c.expectations.ok` (`index.ts:1293`), comparing only `.ok`; the `violations` array declared in the type (`index.ts:1237`, `expectations: { ok: boolean; violations: unknown[] }`) and populated in every manifest fixture (`examples/skills/manifest.yaml`, `fixtures/skills/skills-manifest.yaml`) is parsed but **never compared**. This is a real latent defect, and it is **distinct from the FR-007 fix**: FR-007 makes execution errors fail closed regardless of `expectations.ok`; it does not make the `.ok`-comparison path also check that the *specific* violations produced match the ones declared in `expectations.violations`. Not trivially safe to fix in this mission — an exact-match, subset-match, or rule-ID-only comparison semantics would need its own design decision. **Recorded as a follow-up**, matching issue #59's own scope guard; not fixed here.
- **No fix to the a2a adapter's `applyControlInversion`.** This is the one piece of issue #62 that stays out of scope — see the decision below, tracked separately, not in this mission's `write_scope`. (The *skills*-adapter instance of this defect family — issue #62's primary, headline finding — **is** fixed in this mission, by FR-007.)
- **No muster-action changes** (M8, `garrison-hq/muster-action#2`).
- **No new environment variable beyond the `MUSTER_ENDPOINT`/`MUSTER_BASE_URL` alias relationship** — no new credential-shaped flag or env var is introduced.

### Decision: the a2a `applyControlInversion` instance is **out of scope** for M5 (the skills-adapter instance is in scope, fixed by FR-007)

Issue #62 describes **two** instances of the same defect family. This mission fixes one and defers the other — the two are not treated symmetrically, and that asymmetry is deliberate:

- The **skills adapter's** `runStaticSkillCase` catch-block bug is issue #62's primary, headline finding — its title, its live reproduction (against both `v1.1.0` and `main@8953ee8`), and its "why it matters" section are all about this instance. It lives in `src/cli/index.ts` and `src/adapters/skills/**`, both already inside this mission's `write_scope`. **This mission fixes it, via FR-007.**
- The **a2a adapter's** `applyControlInversion` instance is different. Issue #62's own "Blast radius" section explicitly separates what it verified end-to-end (the skills bug above — reproduced twice, against two refs, via a real CLI run) from what it found by code-reading only, not executed (the a2a instance, `src/adapters/a2a/index.ts:356-371`, offered as "worth a maintainer look," explicitly not a verified live repro). The two defects are real and structurally related (both let a discrimination control's fixture-absence read as a pass), but they:

- live in different adapters, different files, with **no import coupling** between `src/adapters/skills/**`/`src/cli/index.ts` (this mission's `write_scope`) and `src/adapters/a2a/**` — fixing a2a would require adding an entirely new, unrelated `write_scope` entry to a mission named and branched for the skills adapter;
- would require a distinct fix shape (a2a's bug is in the *inversion* step applied after grading, not in a *catch block that derives `passed` from an expectation* — the skills bug's shape); a single mission trying to fix both dilutes the "single lane, import-coupled" write_scope rationale issue #59 itself gives for keeping M5 to one lane;
- is not named by issue #59, M5's own mission brief, at all — issue #62 surfaces the a2a instance as new information discovered by this specify pass's own verification step (and by issue #62's own author), not as part of M5's original charter. The skills-adapter instance, by contrast, is squarely "a discrimination-control defect in the skills runner" — the exact phrase this mission's own directive used to describe what is believed in scope.

**Decision**: fix the skills-adapter instance in this mission (FR-007). The a2a `applyControlInversion` defect is tracked separately as `garrison-hq/muster#69`, filed during this specify pass, referencing `#62`'s blast-radius section directly, so the finding is not lost.

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | A `type: behavioral` case in a skills manifest, with `MUSTER_ENDPOINT` configured, produces a real `TriggerVerdict` through `muster skills run` — not a hardcoded `skipped:true`. |
| SC-002 | The same manifest run with no endpoint configured still skips behavioral cases gracefully and still runs static cases (no regression). |
| SC-003 | `MUSTER_ENDPOINT` and the deprecated `MUSTER_BASE_URL` alias both work; only the alias path emits a stderr deprecation notice. |
| SC-004 | A structurally invalid manifest fails at `exit 2` with a message naming the offending field, before any case executes. |
| SC-005 | The rigged-impossible discrimination control is reachable from `muster skills run` and is observed failing (`passed:false`) both in the offline mock-client test suite (FR-006) and — as a **hard acceptance precondition**, per the Live-Model Verification Plan's pinned model (`gpt-4o-mini`), `runsPerQuery` (3), threshold (0.5), and failure policy — in a real, recorded live run against that endpoint. |
| SC-006 | Every trigger-methodology number cited by muster's rubric/code traces to a real, commit-pinned source; `agentskills.io/specification#trigger-testing` no longer appears anywhere in the repo. |
| SC-007 | `pnpm test` and the SonarCloud quality gate stay green; `tests/unit/invariants.test.ts` (NI-002, NI-003) stays green with no new `fetch` call sites. |
| SC-008 | `garrison-hq/muster#62`'s primary, headline finding is closed for the skills adapter: a negative-expectation static case whose fixture directory is deleted no longer reports `passed:true`/exit 0 — verified by the delete-direction test, not merely a fixture-content flip. |

## Dependencies & Assumptions

- **Depends on**: M2 (`garrison-hq/muster#58`, merged as `65490f6`), which this mission branches from — both missions touch `src/cli/index.ts`; M2 is fully merged to `main` before this mission's branch point, so no rebase-through-flight is needed (confirmed: `origin/main` HEAD is `65490f6`, the M2 merge commit, and this mission's branch is cut directly from it).
- **Unblocks**: M6 (`MOES-Media/spec-kitty#25`) — the CLI cannot run behavioral skill cases before this mission (issue #59 correction #4).
- **Assumption**: the manifest shape (`SkillsManifestBehavioralCase`) already anticipated this wiring — no new manifest fields are required for FR-001/FR-005/FR-006, only new schema validation (FR-003) and new fixture content (FR-006).
- **Assumption**: `NI-003` (fetch-isolation) is enforced by `tests/unit/invariants.test.ts`, a file **outside this mission's `write_scope`**. This mission's implementation must satisfy that invariant without editing it — by reusing `makeToolClient`/`makeClientWithTools` (the sanctioned Option-B call site already built for exactly this purpose, per `trigger.ts:9-22`'s own work-log comment) rather than adding any new literal `fetch`/`http` call in `src/cli/index.ts` or `src/adapters/skills/**`. Flagged explicitly because a sibling mission was blocked by exactly this shape of hazard (an in-scope edit enforced by an out-of-scope file).

## Anticipated Lanes

Single lane, per issue #59's own house precedent for this mission (CLI + adapter + tests are import-coupled — `doSkillsRun` in `src/cli/index.ts` directly imports from `src/adapters/skills/**`, so splitting them across lanes would require one lane to read the other's uncommitted files, which lane isolation forbids):

`write_scope: ["src/cli/index.ts", "src/adapters/skills/**", "tests/skills/**", "tests/cts/skills-suite.test.ts", "examples/skills/**", "fixtures/skills/**", "docs/rubric/skills-trigger-taxonomy.md", ".env.example"]`

- **WP01 — CLI wiring + env alias** (FR-001, FR-002, C-001, C-003, C-004): the highest-risk WP, since it is the first time this code path runs end-to-end through the CLI rather than only through `tests/cts/skills-suite.test.ts`.
- **WP02 — manifest schema + static catch-block fix** (FR-003, FR-007): Ajv schema + exit-2 wiring, following `openclaw-sop/manifest.ts`'s precedent exactly, plus the `runStaticSkillCase` fail-closed fix (issue #62) — grouped together because both touch manifest-shape/case-execution correctness in the same function neighborhood of `index.ts`, and both need the same kind of malformed/absent-fixture negative test.
- **WP03 — rubric doc + citation repoint** (FR-004, OQ-1 resolution): publishes `docs/rubric/skills-trigger-taxonomy.md` and removes every occurrence of the fabricated anchor string from the tree.
- **WP04 — examples + tests** (FR-005, FR-006): new manifest cases + companion query-set fixtures + mock-client tests; the live-model verification pass (see Live-Model Verification Plan) is run manually against this WP's fixtures once WP01-WP03 land, and its transcript is recorded in `quickstart.md`.

Since this is a single lane, there is no cross-lane content-visibility hazard for this mission. The out-of-lane hazard that **does** apply is the NI-003 invariant noted above (`tests/unit/invariants.test.ts`, not in `write_scope`) — WP01's implementer must not attempt to "fix" a red NI-003 by editing that file; the fix is always to route through the existing sanctioned client factory instead.
