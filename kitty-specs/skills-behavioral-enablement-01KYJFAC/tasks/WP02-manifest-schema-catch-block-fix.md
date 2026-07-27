---
work_package_id: WP02
title: Manifest schema + static catch-block fix
dependencies:
- WP01
requirement_refs:
- FR-003
- FR-007
planning_base_branch: kitty/mission-skills-behavioral-enablement
merge_target_branch: kitty/mission-skills-behavioral-enablement
branch_strategy: Planning artifacts for this mission were generated on kitty/mission-skills-behavioral-enablement. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into kitty/mission-skills-behavioral-enablement unless the human explicitly redirects the landing branch.
subtasks:
- T008
- T009
- T010
- T011
- T012
phase: Phase 2 - Schema + fail-closed fix (depends on WP01)
history:
- timestamp: '2026-07-27T00:00:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks-packages
agent_profile: node-norris
authoritative_surface: src/adapters/skills/schema.ts
create_intent: []
execution_mode: code_change
model: ''
owned_files:
- src/adapters/skills/schema.ts
- src/cli/index.ts
- tests/skills/cli.test.ts
role: implementer
tags: []
task_type: implement
tracker_refs:
- garrison-hq/muster#62
---

# Work Package Prompt: WP02 — Manifest schema + static catch-block fix

## ⚡ Do This First: Load Agent Profile

Use the `/ad-hoc-profile-load` skill to load the agent profile specified in the
frontmatter, and behave according to its guidance before parsing the rest of
this prompt.

- **Profile**: `node-norris`
- **Role**: `implementer`
- **Agent/tool**: `claude`

If no profile is specified, run `spec-kitty agent profile list` and select the
best match for this work package's `task_type` (implement) and
`authoritative_surface` (`src/adapters/skills/schema.ts`).

---

## Objective

Add an Ajv Draft 2020-12 schema for the skills manifest (structural violations
→ `exit 2`, before any case executes), and fix `garrison-hq/muster#62`'s
primary, live-reproduced defect: `runStaticSkillCase`'s catch block currently
derives `passed` from `c.expectations.ok` on an execution error, so a missing
or unreadable fixture reads as a correctly-detected violation instead of a
distinct failure.

## Context

**Real dependency on WP01, not merge-convenience only.** `SkillsCaseResult`
and `doSkillsRun`'s manifest-read prologue are edited by both WP01 and this
WP — this WP's lane must start from a base that already has WP01's interface
extension (`shouldTriggerAxis`/`nearMissAxis`/`isControl`) merged in, or the
two lanes would race on the same ~7-line type declaration blind to each
other. **Do not start this WP's implementation until WP01 has merged into the
mission coordination branch.**

`ajv@^8.17.1` is already a `dependencies` entry (`package.json:81`), already
used by both `src/adapters/skills/schema.ts` (`Ajv2020`) and
`src/adapters/openclaw-sop/manifest.ts` (bare `Ajv`) — this WP reuses the
existing package; **no `package.json` edit** is needed.

**Grounding correction #4 (from `plan.md`) — read before writing T012**: the
FR-007 delete-direction test, taken literally from the spec's AC-5 shell
block, shows `rm -rf fixtures/skills/broken/name-dir-mismatch` as a *manual*
verification step. The **automated** regression test must not do this against
the real checked-in path — it must operate against a **temporary copy**
(copy the fixture tree to `os.tmpdir()`, point a temp manifest at the copy,
delete the copy, assert on the temp manifest run). `doSkillsRun` resolves
`skillDir` relative to the manifest's own directory, so a temp manifest
pointing at a temp copy of `fixtures/skills/broken/name-dir-mismatch`
exercises the real delete direction without ever touching the tracked path.
If this test skips the case instead of genuinely deleting the temp copy and
asserting the post-delete verdict, it has not tested the direction issue #62
actually found — do not let it degrade into a no-op.

## Subtask T008: Ajv manifest schema

**Purpose**: Add `SKILLS_MANIFEST_SCHEMA` covering the case-shape union
(`static` | `behavioral`), required fields per branch, and
`expectations.ok: boolean`.

**Steps**:
1. In `src/adapters/skills/schema.ts`, add `SKILLS_MANIFEST_SCHEMA` (Ajv
   Draft 2020-12), following the file's own existing `Ajv2020` import already
   used for `FRONTMATTER_SCHEMA`, and the `openclaw-sop/manifest.ts:200-238`
   precedent for shape.
2. Add a `validateManifest`/`loadAndValidateManifest`-shaped export that
   throws a plain `Error` naming the offending field(s) on failure (mirrors
   the SOP precedent's own throw-then-CLI-rewraps pattern).

**Files**: `src/adapters/skills/schema.ts` (~40-70 lines added)
**Validation**: this subtask has no independent test of its own in this WP —
the only mechanical check on `SKILLS_MANIFEST_SCHEMA`/`validateManifest` is
T011's malformed-manifest test, exercised through the wired CLI path
(`doSkillsRun` → `exit 2`), not an isolated unit test against the schema
module directly. The design goal (small, dependency-free, easy to unit-test
later) is met structurally, but no such test exists yet — treat T011 as this
WP's sole mechanical coverage for the schema validator.

## Subtask T009: Wire schema validation into `doSkillsRun`

**Purpose**: A malformed manifest must fail at a well-formed `exit 2`
boundary, not wherever the first bad field happens to be dereferenced.

**Steps**:
1. In `src/cli/index.ts`, `doSkillsRun`'s manifest-read block (currently
   lines 1332-1337): call T008's validator before the case loop starts.
2. Wrap a validation failure in `ExecutionError` (the existing exit-2 path,
   unchanged mechanism, `readFileOrThrow`/`ExecutionError` already at lines
   154, 164-170, 2107-2110) — do not invent a new exit-code path.

**Files**: `src/cli/index.ts` (~10-20 lines changed)
**Validation**: see WP02 Acceptance Evidence's FR-003 block below.

## Subtask T010: Fix `runStaticSkillCase`'s catch-block fail-open bug

**Purpose**: This is FR-007, the mission's one genuine bug fix — closes
`garrison-hq/muster#62`'s primary finding.

**Steps**:
1. In `src/cli/index.ts`, `runStaticSkillCase`'s catch block (currently lines
   1300-1311): stop deriving `passed` from `c.expectations.ok`.
2. Force `passed: false` and set a new distinguishing field (`errored: true`)
   on `SkillsCaseResult` — **add this field now**, appended to the group
   WP01 already added (`shouldTriggerAxis`/`nearMissAxis`/`isControl`), not
   interleaved with it.
3. This must match the fail-closed pattern already correct elsewhere in the
   codebase (`crosslayer/manifest-runner.ts`, `core/cts/runner.ts`,
   `core/behavioral/runner.ts`, `heartbeat`, `tools`) — an execution error is
   never derived from the case's own expectation.

**Files**: `src/cli/index.ts` (~10-15 lines changed)
**Validation**: see WP02 Acceptance Evidence's FR-007 block below.

## Subtask T011: FR-003 malformed-manifest test (in-test temp file)

**Purpose**: Prove the schema validator actually rejects malformed input at
`exit 2`, using an in-test temp file, not a new checked-in fixture (avoids an
unnecessary fixture per the hazard-3 over-creation correction).

**Steps**:
1. In `tests/skills/cli.test.ts`, add the AC-3 malformed-manifest exit-2 test
   using an **in-test temp file** (`os.tmpdir()`).
2. Cover: a missing required field, `type` outside the `static`/`behavioral`
   enum, and `expectations.ok` as a string — all three must exit `2`.
3. Name at least one of these tests to include the literal substring
   `"manifest schema"` — WP02's acceptance evidence filters on that string.

**Files**: `tests/skills/cli.test.ts` (~40-60 lines added)
**Validation**: see WP02 Acceptance Evidence's FR-003 block below.

## Subtask T012: FR-007 delete-direction regression test (temp copy)

**Purpose**: The delete-direction test, not just the flip-direction test —
issue #62's own point is that every *flip*-direction test already passed
while the *delete*-direction case silently didn't.

**Steps**:
1. In `tests/skills/cli.test.ts`, add a test that copies
   `fixtures/skills/broken/name-dir-mismatch` to a temp directory
   (`os.tmpdir()`), points a temp manifest at the copy, deletes the copy
   entirely, and re-runs against the temp manifest.
2. Assert the case does **not** report `passed: true` after the copy is
   deleted — it must report a distinguishable execution-error outcome
   (`errored: true` from T010, or `passed: false`).
3. **Never `rm -rf` the checked-in `fixtures/skills/broken/name-dir-mismatch`
   path directly inside this automated test** — that would permanently
   delete a committed fixture the first time the suite runs in CI.
4. Name this test to include the literal substring `"delete-direction"` —
   WP02's acceptance evidence filters on that string.

**Files**: `tests/skills/cli.test.ts` (~30-50 lines added)
**Validation**: see WP02 Acceptance Evidence's FR-007 block below.

## Definition of Done

```bash
# FR-003 — falsification: missing required field
TMPDIR_BAD="$(mktemp -d)"
cat > "$TMPDIR_BAD/bad-skills-manifest.yaml" <<'EOF'
cases:
  - id: broken
    type: static
EOF
muster skills run "$TMPDIR_BAD/bad-skills-manifest.yaml"; echo "exit=$?"   # expect 2, message names the missing field(s)

# also: type outside the static|behavioral enum, and expectations.ok as a string — both exit 2
# Verified with the JSON reporter's overall success flag, not a bare exit code (same vitest
# quirk as WP01's C-001 check: "-t" matching nothing still exits 0).
# NOTE: `numPassedTests >= 1` was tried first and is INSUFFICIENT — vitest.config.ts sets
# `typecheck.enabled: true`, which runs a parallel type-check pseudo-suite per file whose entries
# report passed independently of the real runtime assertions, so numPassedTests can be >= 1 on a
# fully red run (proven live against a real implementer's RED artifact for this exact case:
# numPassedTests=3, numFailedTests=3, success=false — the old guard would have said PASS).
# `.success` (equivalently `.numFailedTests == 0`) is not fooled by the duplicates.
pnpm vitest run tests/skills/cli.test.ts -t "manifest schema" --reporter=json > /tmp/fr003.json
echo "exit=$?"   # expect 0
test "$(jq '.success' /tmp/fr003.json)" = "true"; echo "match_exit=$?"   # MUST be 0

# FR-007 — delete-direction test, against a temp copy (grounding correction #4). Same
# success-flag fix applied.
pnpm vitest run tests/skills/cli.test.ts -t "delete-direction" --reporter=json > /tmp/fr007.json
echo "exit=$?"   # expect 0
test "$(jq '.success' /tmp/fr007.json)" = "true"; echo "match_exit=$?"
# MUST be 0; assertion inside the passing test: passed must NOT be true after the copy's
# fixture dir is removed; a dedicated errored:true (or passed:false) outcome is required, exit
# contribution is 1

# Regression: WP01's tests still pass after this WP's edits to the same interface/file
pnpm vitest run tests/skills/cli.test.ts -t "errored trigger run" --reporter=json > /tmp/c001-regress.json
echo "exit=$?"
test "$(jq '.success' /tmp/c001-regress.json)" = "true"; echo "match_exit=$?"   # MUST be 0

pnpm vitest run tests/unit/invariants.test.ts
echo "invariants_exit=$?"   # see WP01's caveat: may be 1 for the pre-existing, unrelated
                             # .env/NI-001 reason in this checkout — confirm before assuming regression

# Whole-tree gates
pnpm build; echo "build_exit=$?"
pnpm test; echo "test_exit=$?"
```

This WP is not `done`/`approved` until every command above has been run for
real on this WP's own tree (based on WP01's merged tip), with its actual
output pasted into review evidence, **and** again after merge to the mission
coordination branch.

## Risks

- **Started before WP01 merged**: if this WP's lane is cut before WP01
  merges, the two lanes race on `SkillsCaseResult` and
  `tests/skills/cli.test.ts` blind to each other. **`depends_on_lanes` cannot
  be used to verify this** — WP01/WP02/WP04 are collapsed into a single lane
  (`lane-a`), so this dependency is intra-lane; `lane-a.depends_on_lanes` is
  `[]` and always will be. Instead, confirm `lanes.json`'s
  `collapse_report.events` includes a `write_scope_overlap` event whose
  evidence cites "WP02 depends on WP01" (it does, as of this remediation
  pass). What actually enforces WP01 → WP02 ordering is this file's
  `dependencies:` frontmatter (`WP01`) plus this Context/Risks prose — not a
  mechanical lane-level gate; there is no automated check that blocks this
  WP's implementation from starting before WP01 merges.
- **Delete-direction test degraded to a no-op**: the most likely way to get
  this subtly wrong is writing a test that never actually deletes anything
  (e.g. asserting against the fixture's *presence* rather than genuinely
  removing a temp copy and re-running). Reviewer must confirm the test
  actually calls a delete operation on the temp copy before the second run.
- **`errored` field naming collision**: confirm this field is appended to,
  not interleaved with, WP01's `shouldTriggerAxis`/`nearMissAxis`/`isControl`
  group in `SkillsCaseResult`.

## Reviewer Guidance

- Confirm the FR-007 test genuinely deletes a **temporary copy** and never
  touches the checked-in `fixtures/skills/broken/name-dir-mismatch` path.
- Confirm FR-003's malformed manifest fixture is an in-test temp file, not a
  new file added to `fixtures/skills/` (avoids unnecessary fixture sprawl).
- Confirm the schema validator's error path routes through the existing
  `ExecutionError` → exit 2 mechanism, not a new ad hoc exit path.
- Re-run WP01's own `-t "errored trigger run"` check as a regression gate —
  this WP edits the same file WP01 added that test to.

**Implementation command**: `spec-kitty agent action implement WP02 --agent claude`

## Activity Log

- 2026-07-27T22:54:02Z – claude (coordinator) – Test-first reconstruction note
  (directive 034-test-first-development, `.kittify/config.yaml:30`,
  enforcement: required). This WP's five commits —
  `53cf25e` (T008, schema), `ea20e91` (T009, wiring), `ac746b8` (T011, FR-003
  tests), `5d9170d` (T010, catch-block fix), `5eb1712` (T012, FR-007 test) —
  were staged retroactively from a single working-tree implementation pass,
  all landing within a 3-minute span (00:18:54–00:21:57 local, 2026-07-28).
  The commit order reads implementation-first (schema → wiring → test), and
  only `5d9170d`'s own message records a red→green claim. **This entry states
  plainly that the commit sequence is reconstruction of what happened in the
  working tree, not a claim that the git history's commit order demonstrates
  red-then-green compliance — it does not, by itself.** WP01 was already
  remediated for a recording gap of exactly this shape (see WP01's own
  Activity Log entry).

  What the working-tree cycle actually showed, reconstructed from ephemeral
  `--reporter=json` artifacts captured during implementation (a session
  scratchpad, itself never committed and subject to evaporate):
  - `red-fr003.json` (2026-07-28T00:11:59+02:00, ~6m55s before the first
    commit; run against the lane worktree,
    `.worktrees/skills-behavioral-enablement-01KYJFAC-lane-a`, pre-fix):
    `numPassedTests=3, numFailedTests=3, success=false`. Failing for the
    right reasons — the missing-required-field case failed because the
    CLI's pre-existing unexpected-error path doesn't name `skillDir`; the
    enum/type-mismatch cases failed because, pre-validator, the malformed
    manifest was still accepted and produced a 0/0 or 1-case PASS/FAIL
    summary instead of exiting 2 with empty stdout.
  - `red-fr007.json` (2026-07-28T00:12:34+02:00, ~6m20s before the first
    commit; same worktree, pre-fix): `numPassedTests=1, numFailedTests=1,
    success=false`. Failing for the right reason — the delete-direction
    case reported `passed:true` (expected `false`), the exact muster#62
    catch-block bug T010 fixes.
  - `green-fr003.json`, `green-fr007.json`, `c001-regress.json`
    (00:13:15–00:13:53, after the fix was applied in the working tree but
    before any of the five commits existed): all `success=true`, confirming
    the fix flips the result.
  - This same second-pass audit is also why the acceptance-evidence checks
    above were changed from `numPassedTests >= 1` to `.success == true` —
    `numPassedTests` alone does not distinguish a red run from a green one
    when `vitest.config.ts`'s `typecheck.enabled: true` pseudo-suite is
    counted (see `red-fr003.json` above: `numPassedTests=3` on a run that
    was, in fact, fully red).
