---
work_package_id: WP01
title: CLI wiring + env alias
dependencies: []
requirement_refs:
- FR-001
- FR-002
- C-001
- C-003
- C-004
planning_base_branch: kitty/mission-skills-behavioral-enablement
merge_target_branch: kitty/mission-skills-behavioral-enablement
branch_strategy: Planning artifacts for this mission were generated on kitty/mission-skills-behavioral-enablement. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into kitty/mission-skills-behavioral-enablement unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-skills-behavioral-enablement-01KYJFAC
base_commit: 78d582ccea1798380a5da9672e5e9858a57dd3a2
created_at: '2026-07-27T20:50:12.081394+00:00'
subtasks:
- T001
- T002
- T003
- T004
- T005
- T006
- T007
phase: Phase 1 - CLI wiring (first WP, no dependencies)
history:
- timestamp: '2026-07-27T00:00:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks-packages
agent_profile: node-norris
authoritative_surface: src/cli/index.ts
create_intent: []
execution_mode: code_change
model: ''
owned_files:
- src/cli/index.ts
- src/adapters/skills/trigger.ts
- .env.example
- fixtures/skills/skills-manifest.yaml
- tests/skills/cli.test.ts
- tests/cts/skills-suite.test.ts
role: implementer
tags: []
task_type: implement
tracker_refs: []
---

# Work Package Prompt: WP01 — CLI wiring + env alias

## ⚡ Do This First: Load Agent Profile

Use the `/ad-hoc-profile-load` skill to load the agent profile specified in the
frontmatter, and behave according to its guidance before parsing the rest of
this prompt.

- **Profile**: `node-norris`
- **Role**: `implementer`
- **Agent/tool**: `claude`

If no profile is specified, run `spec-kitty agent profile list` and select the
best match for this work package's `task_type` (implement) and
`authoritative_surface` (`src/cli/index.ts`).

---

## Objective

Make `doSkillsRun` actually execute `type: "behavioral"` cases through the
existing, already-tested `runTriggerConformance` grader instead of
unconditionally recording `{ passed: true, skipped: true }`, and resolve the
live `MUSTER_ENDPOINT` vs `MUSTER_BASE_URL` inconsistency with a
canonical-wins / deprecated-alias-with-warning precedence, reused consistently
in both the CLI and the adapter.

## Context

This is the first WP in the mission's real dependency chain
(`WP01 → WP02 → WP04`; `WP03` is independent). **No dependencies** — it is the
first WP to touch `src/cli/index.ts` and `src/adapters/skills/trigger.ts`.

Per `plan.md`'s grounding correction #2, FR-001's own literal acceptance
example (`examples/skills/manifest.yaml`) cannot be used to verify this WP:
that file has exactly one case (`example-valid-minimal`, `type: static`) — no
behavioral case exists there until WP04 lands. **This WP's acceptance evidence
uses `fixtures/skills/skills-manifest.yaml` instead**, which already has
`behavioral-weather-skill`/`behavioral-rigged-control` checked in. The same
substitution applies to FR-002's AC-2a/b/c, for an independent second reason:
the endpoint-resolution/warning code only executes inside the loop's
`behavioral`-case branch (`index.ts:1341-1348`) — against a manifest with zero
behavioral cases, that branch never runs, so a deprecation-warning check would
report `0` even if the alias logic were completely broken. A regression
assertion against the literal `examples/skills/manifest.yaml` command is a
**mission-level check added by WP04** once that file has a behavioral case —
it is not one of this WP's own gates.

`SkillsCaseResult` (`index.ts:1254-1260`) gets three new fields this WP adds:
`shouldTriggerAxis`, `nearMissAxis`, `isControl`. **Do not add an `errored`
field here** — that is WP02's addition to the same interface, landing after
this WP merges (a real, unavoidable same-file overlap, resolved by
serializing WP02 after WP01, not by pretending the files don't overlap).

**Does not touch** `runStaticSkillCase` (`index.ts:1280-1312`) — that function
belongs to WP02.

## Subtask T001: Extend `SkillsCaseResult` with `TriggerVerdict` fields

**Purpose**: `SkillsCaseResult` (`index.ts:1254-1260`) has no fields for a
`TriggerVerdict` today. Add the three fields FR-001/FR-005 need to report a
real trigger-conformance verdict through the CLI.

**Steps**:
1. In `src/cli/index.ts`, extend the `SkillsCaseResult` interface with
   `shouldTriggerAxis`, `nearMissAxis`, and `isControl` (types matching
   `TriggerVerdict` in `src/adapters/skills/types.ts`).
2. Leave room for WP02's own `errored?: boolean` addition to land in the same
   block later without needing to touch this WP's lines again — add the new
   fields as their own group, not interleaved with existing fields, so WP02's
   diff is a clean append.

**Files**: `src/cli/index.ts` (interface only, ~7 lines added)
**Validation**: `pnpm build` type-checks with the new fields present but
unused is acceptable at this point; T002 wires them.

## Subtask T002: Env-alias-resolution helper + wire behavioral-case branch

**Purpose**: Resolve `MUSTER_ENDPOINT` (canonical) vs `MUSTER_BASE_URL`
(deprecated alias, warns on stderr only when the alias is the var that
supplied the value) once, and call `runTriggerConformance` from
`doSkillsRun`'s behavioral-case branch instead of hardcoding
`{ passed: true, skipped: true }`.

**Steps**:
1. Add a small env-alias-resolution helper in `src/cli/index.ts`: canonical
   `MUSTER_ENDPOINT` wins; `MUSTER_BASE_URL` is accepted with a one-line
   stderr deprecation notice **only when it is the var that actually supplied
   the value** (i.e. `MUSTER_ENDPOINT` unset). When both are set,
   `MUSTER_ENDPOINT` wins silently — no warning.
2. Rewrite `doSkillsRun`'s behavioral-case branch (currently `index.ts:1341-1348`):
   when the resolved endpoint is present, build a client via
   `makeToolClient`/`makeClientWithTools` (`trigger.ts:133-150` — the same
   sanctioned Option-B call site `tests/cts/skills-suite.test.ts:312-396`
   already uses) and call `runTriggerConformance`, populating the new
   `shouldTriggerAxis`/`nearMissAxis`/`isControl` fields with the real
   verdict. When absent, keep today's `{ passed: true, skipped: true }`
   shape unchanged (this is not a regression — FR-001's AC-1b requires it).
3. **Do not add any new literal `fetch(` call** in `src/cli/index.ts` or
   `src/adapters/skills/**` — reusing `makeToolClient`/`makeClientWithTools`
   is what keeps `tests/unit/invariants.test.ts`'s NI-003 fetch-isolation
   allowlist green without editing that file (it is outside this mission's
   `write_scope`).

**Files**: `src/cli/index.ts` (~30-50 lines changed/added)
**Validation**: see WP01 Acceptance Evidence below (FR-001 block).

## Subtask T003: Repoint `trigger.ts`'s endpoint default + fabricated citations

**Purpose**: `createDiscriminationControl`'s hardcoded endpoint default
(`trigger.ts:314`) reads `process.env["MUSTER_BASE_URL"]` directly — the
second of the two live inconsistent sites the spec's Overview names. Repoint
it to the same canonical/alias precedence as T002's CLI helper. While this
file is already open for that edit, also repoint its 4 fabricated-citation
occurrences to the new rubric path (kept in this WP specifically to avoid a
same-file overlap with WP03, which owns `docs/rubric/skills-trigger-taxonomy.md`
itself but not this file).

**Steps**:
1. In `src/adapters/skills/trigger.ts`, repoint the `trigger.ts:314` endpoint
   default to use (or share logic with) T002's alias-resolution helper.
2. Repoint the 4 occurrences of the fabricated
   `agentskills.io/specification#trigger-testing@d8a3f2e1b9c74051e6f8d2a7c3b5f0e9d1a4c8b2`
   citation (lines 34, 188, 290, 346) to:
   - `docs/rubric/skills-trigger-taxonomy.md` for the muster-specific
     8-minimum/3-run/0.5-threshold **enforcement**, and
   - `github.com/agentskills/agentskills@b8d2613ac050aa4aa8bfb2cf28380d81cdfcd1ca`,
     path `docs/skill-creation/optimizing-descriptions.mdx`, for the upstream
     **prior-art numbers**.
   Both strings are fully decided in the spec's Normative Citations table /
   OQ-1 resolution — do not invent new wording here.

**Files**: `src/adapters/skills/trigger.ts` (~10-15 lines changed, doc
comments + one endpoint default + discrimination-control source string)
**Validation**:
```bash
CITATION_COUNT=$(command grep -c "agentskills.io/specification#trigger-testing" src/adapters/skills/trigger.ts)
test "$CITATION_COUNT" -eq 0; echo "citation_repoint_exit=$?"
# MUST be 0 after this subtask. grep -c's own exit code is inverted relative to intent (0
# matches -> exit 1; >=1 match -> exit 0) — assert the count, never grep -c's bare $?.
```

## Subtask T004: `.env.example` + `skills run --help` text

**Purpose**: Document `MUSTER_ENDPOINT` as canonical, `MUSTER_BASE_URL` as a
documented deprecated alias, in both the env-file template and the CLI's own
help text.

**Steps**:
1. In `.env.example`, add `MUSTER_ENDPOINT` as the canonical var (currently
   absent entirely); keep `MUSTER_BASE_URL` documented as a deprecated alias;
   fix the stale header comment claiming these are "passed as CLI flags, not
   env vars."
2. In `src/cli/index.ts`, update `skills run --help` text (currently lines
   1961-1970): confirm/keep `MUSTER_ENDPOINT` as canonical, add one line
   noting the deprecated alias.

**Files**: `.env.example` (~3-5 lines), `src/cli/index.ts` (help text, ~1-2
lines added)
**Validation**: `command grep -n "MUSTER_ENDPOINT" .env.example` shows a
match; help text renders both vars.

## Subtask T005: `fixtures/skills/skills-manifest.yaml` comment fix

**Purpose**: The "Behavioral cases (require MUSTER_BASE_URL...)" header
comment (currently lines 198-201) is now stale relative to the canonical var.

**Steps**:
1. Update the comment to say `MUSTER_ENDPOINT` canonical / `MUSTER_BASE_URL`
   deprecated alias. **No case data changes** — this is a comment-only edit.

**Files**: `fixtures/skills/skills-manifest.yaml` (comment lines only)
**Validation**: `git diff` for this file shows only comment-line changes, no
YAML structure change (confirm with `git diff --stat` showing a small,
comment-only delta, and re-running the existing static-case tests unaffected).

## Subtask T006: `tests/skills/cli.test.ts` — skip-branching, AC coverage, C-001

**Purpose**: The existing tests unconditionally assert
`[SKIP] behavioral-weather-skill`/`[SKIP] behavioral-rigged-control` — this
must branch on `MUSTER_ENDPOINT` presence now that behavioral cases can
actually execute. Add FR-001/FR-002's AC coverage and the C-001 regression
test.

**Steps**:
1. Update the existing skip-assertions to branch on `MUSTER_ENDPOINT`
   presence (mock client injected when present, so the test stays offline —
   do not make this an accidental live-network test).
2. Add AC-1a/AC-1b coverage (behavioral case executes when endpoint
   configured; skips gracefully when not, matching T002).
3. Add AC-2a/b/c coverage (canonical wins no warning; alias works with
   warning; both set → canonical wins, no warning) — a printed match count,
   not grep's own exit status (see WP01 Acceptance Evidence's C-001 note for
   the exact reason).
4. Add the **C-001 regression test**: a mock client that throws on every
   call for a should-trigger query, asserted through `doSkillsRun` itself
   (not only through `trigger.ts`'s own unit tests, since this is the first
   time that path is CLI-reachable) — `runsErrored` increments, the axis
   fails, and this contributes to an overall failed run. Name this test
   `"errored trigger run"` exactly — WP01's acceptance evidence below filters
   on that literal string.

**Files**: `tests/skills/cli.test.ts` (~60-100 lines added/changed)
**Validation**: see WP01 Acceptance Evidence's C-001 block below.

## Subtask T007: `tests/cts/skills-suite.test.ts` — canonical/alias precedence

**Purpose**: This reference suite is the one this mission "lifts into the
CLI" — it must not remain the one place in the tree that still hard-requires
the deprecated env-var name.

**Steps**:
1. Update the env-var gate (currently `it.skipIf(!process.env["MUSTER_BASE_URL"])`
   at line 324) and the endpoint construction (line 354) to the same
   canonical/alias precedence T002/T003 established.

**Files**: `tests/cts/skills-suite.test.ts` (~5-10 lines changed)
**Validation**: `pnpm vitest run tests/cts/skills-suite.test.ts` exits `0`
(offline; this suite already skips its live-dependent cases without an
endpoint set).

## Definition of Done

All of the following commands are run and their output pasted verbatim into
the WP's review evidence — no summarizing, no "should pass":

```bash
# FR-001, using the fixture manifest (grounding correction #2 — NOT examples/skills/manifest.yaml, which has no behavioral case until WP04)
MUSTER_ENDPOINT=http://localhost:11434/v1 muster skills run fixtures/skills/skills-manifest.yaml --json
echo "exit=$?"   # expect 0 or 1, never bare-skip; jq '.results[] | select(.type=="behavioral") | .skipped' must show false for both behavioral cases
unset MUSTER_ENDPOINT MUSTER_BASE_URL
muster skills run fixtures/skills/skills-manifest.yaml --json
echo "exit=$?"   # expect 0; both behavioral cases show skipped:true, passed:true; static cases unaffected

# FR-002 — falsification: MUSTER_BASE_URL alone must still work, with a warning; both set, canonical wins with NO warning
# grep -ic's exit code is inverted relative to intent (0 matches -> exit 1; >=1 match -> exit 0) —
# assert the printed count, never grep's own $?.
DEPRECATION_COUNT_ALIAS_ONLY=$(MUSTER_BASE_URL=http://localhost:11434/v1 muster skills run fixtures/skills/skills-manifest.yaml 2>&1 | command grep -ic deprecat)
test "$DEPRECATION_COUNT_ALIAS_ONLY" -eq 1; echo "ac2a_gate_exit=$?"
# MUST be 0 (alias-only warns exactly once)

DEPRECATION_COUNT_BOTH_SET=$(MUSTER_ENDPOINT=http://localhost:11434/v1 MUSTER_BASE_URL=http://unreachable-should-not-be-used:1/v1 \
  muster skills run fixtures/skills/skills-manifest.yaml 2>&1 | command grep -ic deprecat)
test "$DEPRECATION_COUNT_BOTH_SET" -eq 0; echo "ac2c_gate_exit=$?"
# MUST be 0 (canonical wins silently when both are set — no warning)

# C-001 regression — verified with the JSON reporter's overall success flag, not a bare exit
# code. vitest's "-t" flag exits 0 whether it matches-and-passes OR matches NOTHING at all
# (reproduced live in this checkout pre-implementation: "Tests 16 skipped (16)", exit=0).
# NOTE: `numPassedTests >= 1` was tried first here and is INSUFFICIENT — vitest.config.ts sets
# `typecheck.enabled: true`, which runs a parallel type-check pseudo-suite per file whose entries
# report passed independently of the real runtime assertions, so numPassedTests can be >= 1 on a
# fully red run (proven live: deliberately breaking this exact test's assertion and re-running
# produced numPassedTests=1, numFailedTests=1, success=false — the old guard would have said
# PASS). `.success` (equivalently `.numFailedTests == 0`) is not fooled by the duplicates.
pnpm vitest run tests/skills/cli.test.ts -t "errored trigger run" --reporter=json > /tmp/c001.json
echo "exit=$?"   # expect 0
test "$(jq '.success' /tmp/c001.json)" = "true"; echo "match_exit=$?"
# MUST be 0 (.success == true) — this is the actual pass/fail signal, not the bare exit code above

# C-003 / hazard-1 proof
pnpm vitest run tests/unit/invariants.test.ts
echo "exit=$?"   # expect 0 — CAVEAT: in this checkout, this currently exits 1 for a reason
# UNRELATED to this WP's own changes — NI-001 (no committed secrets) trips on the gitignored,
# untracked local .env file (an "sk-"-shaped key), because the invariant walks the filesystem
# directly rather than `git ls-files`, so it reads .env even though it is gitignored. If you see
# red here, confirm it is this specific, pre-existing failure before assuming your own change
# broke NI-001/NI-002/NI-003 — do NOT touch tests/unit/invariants.test.ts (out of write_scope)
# and do NOT touch .env to "fix" this.

# Pre-existing exit contract, must stay green (C-004 regression, unchanged path)
muster skills run /nonexistent-manifest.yaml; echo "exit=$?"   # expect 2

# Whole-tree gates (paste verbatim, not summarized)
pnpm build; echo "build_exit=$?"
pnpm test; echo "test_exit=$?"
```

This WP is not `done`/`approved` until every command above has been run for
real on this WP's own tree, with its actual output pasted into review
evidence, **and** again after merge to the mission coordination branch
(hazard-2 standard: a lane is not approvable until its own tree and the
merged tree are both green).

## Risks

- **Same-file overlap with WP02**: `SkillsCaseResult` and
  `tests/skills/cli.test.ts` are both edited by WP01 and WP02. Mitigated by
  the `depends_on: [WP01]` edge — WP02's lane must not cut its merge-base
  before WP01 merges into the mission coordination branch.
- **NI-003 fetch-isolation invariant**: this is the first WP to build a
  live-network-reachable client from `src/cli/index.ts`. The mitigation is
  structural (reuse `makeToolClient`/`makeClientWithTools`, add no new
  literal `fetch(` call) — do not "fix" a red `tests/unit/invariants.test.ts`
  by editing that file; it is outside `write_scope`.
- **`.env`-driven false-red on invariants test**: see the C-003 caveat above
  — a red `invariants.test.ts` in this checkout may be the pre-existing,
  unrelated `.env`/NI-001 failure, not a regression from this WP.
- **Mission-level follow-up, recorded not fixed (this WP's surface is the
  only one that can close it): the bare literal `"rigged-impossible-control"`
  is duplicated across 4 files this mission touches** — `trigger.ts` (lines
  341, 420, 467 as of the post-tasks review), `cli/index.ts` (1423, 1432),
  `tests/cts/skills-suite.test.ts` (282, 355, 358), and
  `tests/skills/cli.test.ts` (138) — 8 sites total. The correct fix is
  exporting a `RIGGED_IMPOSSIBLE_TOOL_NAME` constant from `trigger.ts`
  alongside the existing `RIGGED_IMPOSSIBLE_DESCRIPTION` export, then having
  all 8 sites reference it instead of the string literal. **Only this WP's
  `owned_files` covers all four files** (`src/cli/index.ts`,
  `src/adapters/skills/trigger.ts`, `tests/skills/cli.test.ts`,
  `tests/cts/skills-suite.test.ts`) — WP02 correctly declined to take this on
  itself, since a partial fix touching only its own files would leave the
  hazard open while making it look closed. Not fixed as part of this
  remediation pass (out of scope: coordinator-only kitty-specs/ fix, no
  source changes). **Partially unverifiable from the mission/coordination
  branch as checked out here**: `trigger.ts` and
  `tests/cts/skills-suite.test.ts` are present in this checkout and were
  re-grepped for the bare literal `"rigged-impossible-control"` (4 matches
  confirmed, at `trigger.ts:300,377,424` and
  `tests/cts/skills-suite.test.ts:282` in this checkout's current line
  numbering — pre-WP01/WP02 merge, so line numbers will shift once those
  lanes land). `cli/index.ts` and `tests/skills/cli.test.ts` carry no bare
  `"rigged-impossible-control"` literal in this checkout because WP01's own
  wiring (which introduces it there) lives only in the lane-a worktree, not
  yet merged into this branch — confirming the WP02/lane-cited line numbers
  for those two files would require entering `.worktrees/…-lane-a`, which is
  out of bounds for this fix pass. Whoever picks this up next should re-grep
  post-merge before acting on the exact line numbers above.

## Reviewer Guidance

- Confirm no new literal `fetch(` call was added anywhere in
  `src/cli/index.ts` or `src/adapters/skills/**` (grep for it directly; do
  not trust a green `pnpm test` alone, since `invariants.test.ts` is known to
  be red for an unrelated reason in this checkout).
- Confirm the C-001 test is asserted via `doSkillsRun` (CLI-level), not only
  via `trigger.ts`'s own existing unit tests.
- Confirm the AC-2a/b/c warning-emission logic is exercised against
  `fixtures/skills/skills-manifest.yaml`, not `examples/skills/manifest.yaml`
  (the latter has no behavioral case until WP04 — an acceptance command
  written against it here would be silently vacuous, not a real check).
- Confirm `SkillsCaseResult`'s new fields are added as a distinct, appendable
  group (not interleaved with existing fields) so WP02's `errored` field
  addition is a clean, low-conflict diff on top.

**Implementation command**: `spec-kitty agent action implement WP01 --agent claude`

## Activity Log

- 2026-07-27T21:36:02Z – claude – shell_pid=1183665 – Test-first deviation justification (charter Exception Policy / directive 034-test-first-development, enforcement: required): WP01's original T001-T007 tests were written alongside the implementation in a single pass (commit c2966d9), not strictly red-then-green per behavior. Justification: this was CLI-wiring plumbing reusing an already-tested grader (`runTriggerConformance`) via a well-understood existing reference call site (`tests/cts/skills-suite.test.ts`), assessed at the time as low novel-behavior risk; the omission of a written justification was not recorded contemporaneously, which this entry corrects retroactively. This mission's remediation pass (HIGH-1/HIGH-2/MEDIUM-1 fixes, commits 66906f5/38041d9/a58fa0a) DID follow red→green: each new regression test was confirmed failing before its corresponding fix and passing after (see review evidence).
- 2026-07-27T22:54:02Z – claude (coordinator) – Recorded a mission-level
  follow-up on this WP's surface (see Risks above): the bare literal
  `"rigged-impossible-control"` is duplicated 8 times across the 4 files
  this WP's `owned_files` covers (`trigger.ts`, `cli/index.ts`,
  `tests/skills/cli.test.ts`, `tests/cts/skills-suite.test.ts`). Not fixed —
  this pass is a kitty-specs/ planning-artifact correction only, no source
  changes. Correct fix: export `RIGGED_IMPOSSIBLE_TOOL_NAME` from
  `trigger.ts` beside `RIGGED_IMPOSSIBLE_DESCRIPTION` and reference it at all
  8 sites instead of the string literal.
