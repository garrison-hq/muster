---
work_package_id: WP04
title: Examples + tests (behavioral wiring proof + live-model gate)
dependencies:
- WP01
- WP02
requirement_refs:
- FR-005
- FR-006
planning_base_branch: kitty/mission-skills-behavioral-enablement
merge_target_branch: kitty/mission-skills-behavioral-enablement
branch_strategy: Planning artifacts for this mission were generated on kitty/mission-skills-behavioral-enablement. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into kitty/mission-skills-behavioral-enablement unless the human explicitly redirects the landing branch.
subtasks:
- T018
- T019
- T020
- T021
phase: Phase 3 - Examples, tests, and the mission's live-model acceptance gate (depends on WP01, WP02)
history:
- timestamp: '2026-07-27T00:00:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks-packages
agent_profile: node-norris
authoritative_surface: examples/skills/
create_intent:
- examples/skills/trigger-queries/weather-skill-queries.yaml
- examples/skills/trigger-queries/rigged-impossible-queries.yaml
execution_mode: code_change
model: ''
owned_files:
- examples/skills/manifest.yaml
- examples/skills/trigger-queries/weather-skill-queries.yaml
- examples/skills/trigger-queries/rigged-impossible-queries.yaml
- tests/skills/cli.test.ts
role: implementer
tags: []
task_type: implement
tracker_refs: []
---

# Work Package Prompt: WP04 — Examples + tests (behavioral wiring proof + live-model gate)

## ⚡ Do This First: Load Agent Profile

Use the `/ad-hoc-profile-load` skill to load the agent profile specified in the
frontmatter, and behave according to its guidance before parsing the rest of
this prompt.

- **Profile**: `node-norris`
- **Role**: `implementer`
- **Agent/tool**: `claude`

If no profile is specified, run `spec-kitty agent profile list` and select the
best match for this work package's `task_type` (implement) and
`authoritative_surface` (`examples/skills/`).

---

## Objective

Give `examples/skills/manifest.yaml` a real behavioral case and a real
`isControl: true` case (proving FR-005/FR-006 offline, via a mock client),
and — as this mission's actual acceptance precondition — run and record the
**live-model gate** against the pinned model before this WP, or the mission,
can be marked done/approved.

## Context

**Real dependency on WP01 and WP02.** FR-006's new mock-client tests exercise
the behavioral-execution wiring WP01 built and are validated against the
schema WP02 added; both land in `tests/skills/cli.test.ts`, the same file
WP01/WP02 already extend, so this WP's lane must start from their merged base
(same same-file reasoning as WP01→WP02). **Does not depend on WP03**: the
exact citation string this WP's new fixture files must use is already fully
decided in the spec's Normative Citations table (carried into WP01's task
file) — this WP does not need to read WP03's uncommitted rubric file.

**Note on FR-005**: this FR has no incremental code of its own.
`runTriggerConformance` already passes an `isControl: true` case through its
hard-gate/grading path unmodified (`trigger.ts:377` computes `isControl`
structurally, not from a manifest flag alone) — once WP01's wiring calls it
for every behavioral case, a control case is automatically handled
identically to a non-control case. FR-005 is satisfied by WP01's wiring and
**proven** by this WP's tests; it has no `owned_files` of its own beyond what
FR-006 already touches.

**This WP owns the mission's live-model gate.** This is the mission's actual
acceptance precondition, not a prose claim living only in `plan.md`'s
"Live-Model Verification" section — `spec-kitty accept --diagnose`/`--mode
checklist` check structure only (artifact presence, WP completion) and never
grep `quickstart.md` for `_pending_` or inspect any recorded verdict. This
WP's own acceptance evidence (below) is the one place the live-model
requirement is mechanically checked.

## Subtask T018: Add behavioral + control cases to `examples/skills/manifest.yaml`

**Purpose**: FR-006 requires `examples/skills/manifest.yaml` to gain a real
`type: behavioral` case and a real `isControl: true` case.

**Steps**:
1. Add one `type: behavioral` case reusing the existing `valid/minimal` skill
   as the target — no new skill fixture needed.
2. Add one `isControl: true` case, also reusing `valid/minimal` as the
   placeholder `skillDir`, matching the exact precedent already checked into
   `fixtures/skills/skills-manifest.yaml:214-226`'s own comment ("skillDir is
   a placeholder; the runner replaces the description at runtime") — this
   avoids creating a parallel `broken/` tree under `examples/skills/` that
   nothing else needs.

**Files**: `examples/skills/manifest.yaml` (~20-30 lines added)
**Validation**: manifest still parses/validates against WP02's schema.

## Subtask T019: Companion query-set files under `examples/skills/trigger-queries/`

**Purpose**: Each new behavioral/control case needs its own query-set file.

**Steps**:
1. Create `examples/skills/trigger-queries/` (new directory, mirroring the
   existing `fixtures/skills/trigger-queries/` convention).
2. Add two companion query-set YAML files (one per new case from T018), each
   with **≥8 should-trigger and ≥8 near-miss queries**, `runsPerQuery: 3`,
   `threshold: 0.5` — both pinned values, matching the Live-Model
   Verification Plan's pinned numbers so these fixtures stay usable for the
   live-model gate too.
3. Cite `docs/rubric/skills-trigger-taxonomy.md` directly (the exact string
   is carried in this task file, not read from WP03's uncommitted file —
   this is the hazard-3-corrected "carry the content, don't create a
   cross-lane read dependency" pattern).

**Files**: `examples/skills/trigger-queries/*.yaml` (2 new files, ~20-30
lines each)
**Validation**: each file has ≥8/≥8 queries; `runsPerQuery: 3`; `threshold: 0.5`.

## Subtask T020: Mock-client tests in `tests/skills/cli.test.ts`

**Purpose**: FR-006 requires offline, deterministic coverage — no live model
dependency for this fixture's own test coverage.

**Steps**:
1. Add new/extended tests against a mock `TriggerChatClient` exercising
   T018's two new cases through `doSkillsRun`.
2. Confirm the control case (`isControl: true`) reports `passed: false` when
   the mock client never selects the rigged tool, and — per C-004 —
   contributes to a non-zero exit code when it is the only non-skipped case.
3. **Also assert `passed: true`, by case id, for the new should-trigger
   (weather) case from T018**, when the mock client does select/route to the
   expected tool. This is the step that actually closes the loop with T019's
   `MIN_QUERIES_PER_AXIS = 8` hard gate (`trigger.ts:61`, `:359-362`): that
   gate only catches an undersized query file if something asserts the
   weather case **passes** — asserting only the control case's
   `passed: false` (step 2) never exercises the passing path at all. Name
   this test to include the literal substring `"should-trigger case"` — WP04's
   Acceptance Evidence below filters on that literal string. Do not rely on
   the whole-file `numPassedTests >= 1` AND `numFailedTests == 0` check
   elsewhere in this WP's DoD to stand in for this — that check is satisfied
   by pre-existing tests regardless of whether this specific assertion
   exists.

**Files**: `tests/skills/cli.test.ts` (~60-100 lines added)
**Validation**: see WP04 Acceptance Evidence's FR-006 block below.

## Subtask T021: Execute and record the live-model gate

**Purpose**: This is the mission's hard acceptance precondition. Run it for
real, against the pinned model, after WP01/WP02/WP03 have all merged into the
mission coordination branch, and record the results in `quickstart.md`.

**Steps**:
1. Run the full "Live-model gate" block below, in order, on the merged
   coordination branch (not this WP's own isolated pre-merge tree — the
   spec's own Live-Model Verification Plan ties this to "once WP01-WP03
   land").
2. Fill in every row of `quickstart.md`'s results table with real observed
   values — date/time, attempt #, both `passed` booleans, both observed
   trigger rates, overall exit code, portability endpoint, portability
   result, blocking findings. **No `_pending_` strings may remain.**
3. Apply the failure policy exactly as written below — no retries beyond
   what is specified, no model substitution, ever.

**Files**: `kitty-specs/skills-behavioral-enablement-01KYJFAC/quickstart.md`
(results table filled in; no structural changes to the rest of the file).
**Out-of-`owned_files` rationale**: `quickstart.md` is a mission-level
artifact, not any WP's `write_scope` — matching how `plan.md` itself is
mission-level rather than lane-owned (`finalize-tasks` also rejects any WP
`owned_files` entry under `kitty-specs/`, confirmed live). This WP fills in
its results table as a small, one-file, well-justified out-of-map edit
recorded here, not a lane-ownership claim.
**Validation**: the live-model gate block below, run for real.

## Definition of Done

```bash
pnpm vitest run tests/skills/cli.test.ts --reporter=json > /tmp/fr006.json
echo "exit=$?"   # expect 0 (vitest process exit; FR-006's own stated verification command)
FR006_PASSED=$(jq '.numPassedTests' /tmp/fr006.json)
FR006_FAILED=$(jq '.numFailedTests' /tmp/fr006.json)
test "$FR006_PASSED" -ge 1 && test "$FR006_FAILED" -eq 0; echo "match_exit=$?"   # MUST be 0 — this
# WP is the one authoring the new mock-client tests this file gains, so a real-pass assertion is
# included here rather than trusting the bare exit code alone. NEITHER guard alone is sufficient:
# `numPassedTests >= 1` alone is insufficient because vitest.config.ts sets
# `typecheck.enabled: true`, whose per-file pseudo-suite entries report passed independently of
# the real assertions, so numPassedTests can be >= 1 on a fully red run. `.success` alone
# (equivalently `.numFailedTests == 0`) is ALSO insufficient on its own (MEDIUM-2 remediation):
# `.success` is `true` whenever zero tests match a `-t` filter too (proven live: `-t
# "zzz-this-test-name-does-not-exist"` on this exact file returns
# `{"success":true,"numTotalTests":44,"numPassedTests":0,"numFailedTests":0}`) — a renamed test or
# a typo'd filter would satisfy `.success == true` while asserting nothing. Both conditions
# together (`numPassedTests >= 1` AND `numFailedTests == 0`) are required and jointly sufficient:
# the first guards against an empty/no-match run, the second against a run with real failures.

# T020's specific weather/should-trigger passing assertion, isolated by name — the whole-file
# check above is satisfied by pre-existing tests regardless of whether this one exists, so it
# cannot stand in for it.
pnpm vitest run tests/skills/cli.test.ts -t "should-trigger case" --reporter=json > /tmp/fr006-weather.json
echo "exit=$?"   # expect 0
FR006_WEATHER_PASSED=$(jq '.numPassedTests' /tmp/fr006-weather.json)
FR006_WEATHER_FAILED=$(jq '.numFailedTests' /tmp/fr006-weather.json)
test "$FR006_WEATHER_PASSED" -ge 1 && test "$FR006_WEATHER_FAILED" -eq 0
echo "weather_case_match_exit=$?"
# MUST be 0 — proves the new should-trigger case actually asserts passed:true by id, closing the
# loop with T019's MIN_QUERIES_PER_AXIS=8 hard gate (an undersized query file only gets caught if
# something asserts the weather case PASSES, not only that the control case fails). Same
# both-guards requirement as above — neither `numPassedTests >= 1` nor `.success` alone suffices.

# Mission-level regression, now finally satisfiable: FR-001's own literal AC-1a command,
# against examples/skills/manifest.yaml (deferred here because this is the first point in the
# mission where that file actually has a behavioral case)
MUSTER_ENDPOINT=http://localhost:11434/v1 muster skills run examples/skills/manifest.yaml --json
echo "exit=$?"   # expect 0 or 1, never bare-skip

pnpm build; echo "build_exit=$?"
pnpm test; echo "test_exit=$?"
```

### Live-model gate — literal, checkable acceptance evidence

**This is the mission's actual acceptance precondition, not a prose claim.
WP04 must not be marked `done`/`approved` until every check in this block
passes**, run against the mission coordination branch after WP01, WP02, and
WP03 have all merged (WP04's own code depends only on WP01+WP02; running
this block also after WP03 merges is what makes SC-006 fully closed at the
point this gate is checked, not a functional dependency of the live run
itself).

```bash
# 1. Offline baseline first (must be green, zero network calls, before the live run touches
#    anything).
pnpm test; echo "test_exit=$?"   # expect 0

# 2. The live run itself. Credentials injected inline as an environment variable, sourced from a
#    credential store OUTSIDE this working tree via command substitution — never a `.env` file
#    inside the repo (HIGH-2 remediation: `tests/unit/invariants.test.ts`'s NI-001 secret scan
#    walks the whole working tree, excluding only node_modules/.git/dist/.worktrees/.kittify/
#    kitty-specs, and does NOT exempt gitignored files, so a `.env` containing a real key trips
#    NI-001 red instead of being safely tolerated by it — this test is what a `.env`-based flow
#    breaks, not what "enforces" the `.env` pattern). Never argv-literal, never logged. Pinned,
#    not negotiable: gpt-4o-mini, https://api.openai.com/v1, runsPerQuery: 3, threshold: 0.5
#    (already checked into fixtures/skills/skills-manifest.yaml's two behavioral cases — this
#    command changes no fixture content).
export OPENAI_API_KEY=$(your-credential-lookup-command-here)   # exported (not a per-command
# prefix) so it persists into this same shell for step 5's leak check below — a per-command
# assignment (`OPENAI_API_KEY=$(...) node ...`) only sets the var for that one child process and
# is gone immediately after, which would make step 5's `RESOLVED_KEY="$OPENAI_API_KEY"` read empty
# (LOW-1 remediation).
MUSTER_ENDPOINT=https://api.openai.com/v1 MUSTER_MODEL=gpt-4o-mini \
  node dist/cli/index.js skills run fixtures/skills/skills-manifest.yaml --json \
  > /tmp/skills-live-run.json
echo "exit=$?"   # expect 0 or 1, never bare-skip (never skipped:true — that would itself be a
                 # mission-blocking finding, since MUSTER_ENDPOINT/credentials are set for this run)

# 3. Assert the EXACT LITERAL boolean values — not "truthy", not "the run didn't crash".
CONTROL_PASSED=$(jq -r '.results[] | select(.id=="behavioral-rigged-control") | .passed' /tmp/skills-live-run.json)
CONTROL_SHOULD_RATE=$(jq -r '.results[] | select(.id=="behavioral-rigged-control") | .shouldTriggerAxis.triggerRate' /tmp/skills-live-run.json)
CONTROL_RUNS_ERRORED=$(jq -r '[.results[] | select(.id=="behavioral-rigged-control") | (.shouldTriggerAxis.queryBreakdown + .nearMissAxis.queryBreakdown)[].runsErrored] | add' /tmp/skills-live-run.json)
WEATHER_PASSED=$(jq -r '.results[] | select(.id=="behavioral-weather-skill") | .passed' /tmp/skills-live-run.json)
echo "control=$CONTROL_PASSED control_should_trigger_rate=$CONTROL_SHOULD_RATE control_runs_errored=$CONTROL_RUNS_ERRORED weather=$WEATHER_PASSED"

test "$CONTROL_PASSED" = "false"; echo "control_gate_exit=$?"
# MUST be 0. The control reporting passed:true even ONCE is immediately mission-blocking and
# NON-RETRYABLE, no exceptions — do not retry, do not swap models, investigate instead.

test -n "$CONTROL_SHOULD_RATE"; echo "control_should_trigger_rate_present_exit=$?"
# MUST be 0 (LOW-3 remediation). `awk -v r="" 'BEGIN{exit !(r<0.5)}'` exits 0 vacuously, because
# an empty `r` is compared to 0.5 as a string, and "" < "0.5" is true lexically — this guard closes
# that specific hole by requiring a non-empty value before the awk gate below is trusted. Confirmed
# empirically (all three, run directly): `r=""` exits 0 (the vacuous-pass bug this guard targets);
# `r="null"` and `r="0.5"` each already exit 1 on the awk gate itself with no guard present — a
# literal "null" string and the exact boundary value 0.5 are both already correctly treated as
# failing the discrimination check (0.5 is not strictly less than 0.5), so this guard does not need
# to special-case them, only the true empty-string case.

awk -v r="$CONTROL_SHOULD_RATE" 'BEGIN{exit !(r<0.5)}'; echo "control_should_trigger_axis_gate_exit=$?"
# MUST be 0 (HIGH-1 remediation). `.passed` alone is NOT a discrimination check on these
# fixtures: fixtures/skills/trigger-queries/rigged-impossible-queries.yaml's near-miss axis uses
# the literal placeholder strings "ZZZCONTROL placeholder near-miss N", which self-match the
# rigged tool's own RIGGED_IMPOSSIBLE_DESCRIPTION text ("ZZZCONTROL-IMPOSSIBLE") by literal
# overlap, so nearMissAxis.triggerRate measures ~1.0 and nearMissAxis.passed is pinned false in
# every live run regardless of model behavior — which pins the overall `.passed` to false
# regardless of what the should-trigger axis actually measured. Proven live (HIGH-1 Probe B): a
# should-trigger axis rigged to self-match the same way (triggerRate 1.0, shouldTriggerAxis.passed
# reported true — `>= threshold` is "passed" under this axis's generic formula) still yielded
# `.passed: false` overall (masked by the pinned near-miss axis), so the OLD
# `control_gate_exit=0` check alone would have reported this gate satisfied even with the
# should-trigger axis completely rigged. This assertion reads the raw `triggerRate` directly and
# is independent of `nearMissAxis.passed`, so it still catches a should-trigger-axis-only rig.
# (The fixtures-side near-miss placeholder defect itself predates this mission and is out of this
# WP's owned_files — tracked as a follow-up against whichever WP owns
# fixtures/skills/trigger-queries/ — but this gate must not depend on that file being fixed.)

CONTROL_RUNS_ERRORED_OK=$([ "$CONTROL_RUNS_ERRORED" = "0" ] && echo yes || echo no)
test "$CONTROL_RUNS_ERRORED_OK" = "yes"; echo "control_runs_errored_gate_exit=$?"
# MUST be 0 (MEDIUM-1 remediation, replaces the old `errored != "true"` check). The `errored`
# field on `SkillsCaseResult` is set ONLY by `runBehavioralSkillCaseSafe`'s catch block
# (fixture/setup failures that never reach a graded verdict at all) — it is ABSENT (jq renders
# `null`) on every case that reaches a graded verdict, including one where every single per-run
# API call failed. Proven live against a dead endpoint (`MUSTER_ENDPOINT=http://127.0.0.1:1/v1`):
# `errored` was `null` and `runsErrored` was 24/24 on BOTH axes (48/48 total) — the old
# `test "$CONTROL_ERRORED" != "true"` check reported `control_not_errored_gate_exit=0` (vacuously
# "fine") in that exact scenario. Summing `runsErrored` across both axes' `queryBreakdown` and
# asserting the total is exactly 0 is what actually distinguishes "the control correctly failed
# the discrimination check" from "the control's calls all errored out and never really ran".

test "$WEATHER_PASSED" = "true"; echo "weather_gate_exit=$?"
# If this is nonzero on the FIRST attempt: retry the step-2 command exactly once, unmodified
# (same model/manifest/env vars). A second consecutive failure BLOCKS this WP from done/approved;
# record the failure in quickstart.md as an open defect. Never retry the control check above.

# 4. quickstart.md's results table must contain NO "_pending_" string once this gate has run for
#    real — an absence check as a COUNT, asserted, never a bare grep exit status. grep -c's exit
#    code is INVERTED relative to intent (0 matches -> exit 1; >=1 match -> exit 0), so checking
#    $? directly would give exactly the wrong answer — the count itself must be compared.
PENDING_COUNT=$(command grep -c "_pending_" kitty-specs/skills-behavioral-enablement-01KYJFAC/quickstart.md)
test "$PENDING_COUNT" -eq 0; echo "pending_gate_exit=$?"
# MUST be 0 (all nine table rows filled with real observed values: date/time, attempt #, both
# passed booleans, both observed trigger rates, overall exit code, portability endpoint,
# portability result, blocking findings)

# 5. Credential hygiene: the key VALUE must never appear in any process's argv, or in the
# recorded output. `ps aux | command grep -c "sk-"` can NEVER return 0 — the grep process
# spawned by the pipeline is itself listed in `ps aux`, and its own argv contains the literal
# search pattern "sk-", so it always matches itself (an always-firing hygiene gate is one people
# learn to ignore; ps_leak_gate rewrite). Rewritten to scan each process's /proc/<pid>/cmdline
# file for the RESOLVED key value directly, instead of `ps aux`: the initial glob below captures
# a snapshot of existing PIDs before any of this check's own grep subprocesses start, so those
# subprocesses' own (later, different) PIDs are never among the files being scanned — no
# self-match is possible.
test -n "$OPENAI_API_KEY"; echo "resolved_key_present_exit=$?"
# MUST be 0 (LOW-1 remediation). Step 2 above now `export`s OPENAI_API_KEY so it persists into
# this same shell; without the export (a per-command `VAR=val cmd` prefix only sets the var for
# that one child process), `RESOLVED_KEY="$OPENAI_API_KEY"` below would silently read empty, and
# `grep -zqF ""` matches every readable cmdline (confirmed live: with the var unset this measured
# PS_LEAK_COUNT=200, a fail-loud but misleading result masking the real bug — an empty needle, not
# an actual leak).
RESOLVED_KEY="$OPENAI_API_KEY"   # the exact value injected into the live run above (step 2)
PS_LEAK_COUNT=0
for f in /proc/[0-9]*/cmdline; do
  # LOW-2 remediation: the pattern is passed via `-f <(...)` (a file/fd), never as a `grep`
  # argument — `grep -zqF "$RESOLVED_KEY" "$f"` (the prior form) put the credential on that grep
  # invocation's own argv, on every one of the ~490 processes scanned, defeating the very
  # property this gate exists to prove. Confirmed live: this form's pattern does not appear
  # anywhere in `ps aux` output while the loop runs, unlike the prior `-F "$RESOLVED_KEY"` form.
  if [ -r "$f" ] && command grep -zqFf <(printf '%s' "$RESOLVED_KEY") "$f" 2>/dev/null; then
    PS_LEAK_COUNT=$((PS_LEAK_COUNT + 1))
  fi
done
test "$PS_LEAK_COUNT" -eq 0; echo "ps_leak_gate_exit=$?"
# MUST be 0 — this is the only mechanical enforcement of the charter constraint that keys never
# appear in argv, and unlike the old `ps aux` form, it is actually satisfiable.

OUTPUT_LEAK_COUNT=$(command grep -c "MUSTER_API_KEY\|OPENAI_API_KEY" /tmp/skills-live-run.json)
test "$OUTPUT_LEAK_COUNT" -eq 0; echo "output_leak_gate_exit=$?"
# MUST be 0 — this is the only mechanical enforcement of the charter constraint that keys never
# appear in recorded output/logs.

# 6. Portability check (step 4 of the Live-Model Verification Plan) — same fixtures, only env
#    vars differ. Not a second acceptance gate; still recorded in quickstart.md.
MUSTER_ENDPOINT=<second-endpoint> MUSTER_MODEL=<local-model> \
  node dist/cli/index.js skills run fixtures/skills/skills-manifest.yaml --json
echo "exit=$?"
```

This WP's `done`/`approved` state requires: `control_gate_exit=0` AND
`control_should_trigger_axis_gate_exit=0` AND `control_runs_errored_gate_exit=0`
AND `weather_gate_exit=0` (after at most one retry) AND `pending_gate_exit=0`
AND `ps_leak_gate_exit=0` AND `output_leak_gate_exit=0`. Any other outcome is
an open defect, recorded in `quickstart.md`, and this WP stays not-done until
resolved — **no exceptions, no model-swapping to force a pass.**

## Risks

- **Started before WP01/WP02 merged**: this WP's lane must not cut its
  merge-base until both WP01 and WP02 are merged. **`depends_on_lanes` cannot
  be used to verify this.** WP01/WP02/WP04 are collapsed into a single lane
  (`lane-a`); their dependency is therefore intra-lane, and `depends_on_lanes`
  only carries cross-lane edges — `lane-a.depends_on_lanes` is `[]` and always
  will be. An implementer checking for it there would find it permanently
  failing. Instead, confirm `lanes.json`'s `collapse_report.events` cites the
  collapse reason: two `write_scope_overlap` events, one whose evidence
  includes "WP02 depends on WP01" and one whose evidence includes "WP04
  depends on WP01" (both present in this mission's `lanes.json` as of this
  remediation pass).
  **What actually enforces WP01 → WP02 → WP04 ordering**: as far as the
  artifacts demonstrate on their own, it is each file's `dependencies:`
  frontmatter (WP02 lists `WP01`; WP04 lists `WP01`/`WP02`) plus the prose in
  each file's Context/Risks sections instructing the implementer not to cut a
  lane's merge-base early — **not a mechanical lane-level gate**. There is no
  automated check in this mission's artifacts that blocks WP02 or WP04's
  implementation from starting before WP01/WP02 merge; correct ordering
  depends on the implementer/orchestrator honoring the stated dependency.
- **Live-model gate run against the wrong tree**: the gate must be run
  against the **mission coordination branch**, after WP01/WP02/WP03 have all
  merged — not against this WP's own isolated pre-merge worktree. Running it
  too early would test an incomplete tree and produce a false signal either
  way.
- **Retry-policy violation**: only the should-trigger case may be retried,
  exactly once, on a first-attempt failure. The control case's `passed:true`
  is immediately mission-blocking and non-retryable — do not let "just try
  again" apply there.
- **Credential leakage**: confirm step 5's `/proc/<pid>/cmdline`/output-grep
  checks are actually run, not skipped as "obviously fine."

## Reviewer Guidance

- Do not approve this WP on the offline mock-client tests alone — the
  live-model gate's seven literal conditions (`control_gate_exit=0`,
  `control_should_trigger_axis_gate_exit=0`,
  `control_runs_errored_gate_exit=0`, `weather_gate_exit=0`,
  `pending_gate_exit=0`, `ps_leak_gate_exit=0`, `output_leak_gate_exit=0`)
  must all be independently verified, with `quickstart.md`'s results table
  shown filled with real values, not placeholders.
- Confirm the control case's `passed:false` and the should-trigger case's
  `passed:true` are the **exact literal values recorded**, not summarized as
  "looks good."
- Confirm `control_should_trigger_axis_gate_exit=0` was computed from the
  raw `shouldTriggerAxis.triggerRate`, not inferred from `.passed` — the
  fixtures near-miss axis self-matches its own rigged tool's description
  text, which pins the overall `.passed` to `false` regardless of what the
  should-trigger axis measured (HIGH-1); `.passed` alone would not have
  caught a should-trigger-axis-only rig (proven live, see this WP's
  remediation record).
- Confirm the control case's aggregate `runsErrored` across both axes'
  `queryBreakdown` was also recorded and is exactly `0` — the `errored`
  field is absent (never `true`) on every case that reaches a graded
  verdict, including one where every per-run API call failed (proven live
  against a dead endpoint), so `errored:null`/absent proves nothing on its
  own (MEDIUM-1).
- Confirm no credential value appears in `/tmp/skills-live-run.json` or in
  any `/proc/<pid>/cmdline` scan attached as evidence — verify
  `ps_leak_gate_exit` and `output_leak_gate_exit` were actually computed
  from a real count, not assumed. `ps aux | grep -c "sk-"` is no longer
  used (it could never return 0 — the grep process matches its own argv).
- Confirm the T020 `"should-trigger case"` test exists and its
  `weather_case_match_exit=0` was actually observed via BOTH
  `numPassedTests >= 1` AND `numFailedTests == 0` — `.success == true` alone
  is also satisfied by a `-t` filter that matches zero tests (proven live:
  `-t "zzz-this-test-name-does-not-exist"` returns
  `{"success":true,"numPassedTests":0,"numFailedTests":0}`), so `.success`
  alone does not prove this specific assertion exists either (MEDIUM-2).

**Implementation command**: `spec-kitty agent action implement WP04 --agent claude`
