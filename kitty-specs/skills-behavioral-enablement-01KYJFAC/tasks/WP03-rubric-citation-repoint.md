---
work_package_id: "WP03"
title: "Rubric doc + citation repoint"
dependencies: []
requirement_refs: ["FR-004"]
subtasks: ["T001", "T002", "T003", "T004", "T005"]
owned_files:
  - "docs/rubric/skills-trigger-taxonomy.md"
  - "src/adapters/skills/types.ts"
  - "fixtures/skills/trigger-queries/rigged-impossible-queries.yaml"
  - "fixtures/skills/trigger-queries/weather-skill-queries.yaml"
  - "tests/unit/skills-trigger.test.ts"
authoritative_surface: "docs/rubric/skills-trigger-taxonomy.md"
execution_mode: "code_change"
agent_profile: "node-norris"
role: "implementer"
agent: "claude"
model: ""
planning_base_branch: "kitty/mission-skills-behavioral-enablement"
merge_target_branch: "kitty/mission-skills-behavioral-enablement"
branch_strategy: "Planning artifacts were generated on kitty/mission-skills-behavioral-enablement; completed changes must merge back into kitty/mission-skills-behavioral-enablement."
phase: "Phase 1 - Rubric + citation repoint (no dependencies, independent lane)"
task_type: "implement"
tracker_refs: []
tags: []
history:
  - timestamp: "2026-07-27T00:00:00Z"
    agent: "system"
    action: "Prompt generated via /spec-kitty.tasks-packages"
---

# Work Package Prompt: WP03 — Rubric doc + citation repoint

## ⚡ Do This First: Load Agent Profile

Use the `/ad-hoc-profile-load` skill to load the agent profile specified in the
frontmatter, and behave according to its guidance before parsing the rest of
this prompt.

- **Profile**: `node-norris`
- **Role**: `implementer`
- **Agent/tool**: `claude`

If no profile is specified, run `spec-kitty agent profile list` and select the
best match for this work package's `task_type` (implement) and
`authoritative_surface` (`docs/rubric/skills-trigger-taxonomy.md`).

---

## Objective

Publish `docs/rubric/skills-trigger-taxonomy.md` and repoint every occurrence
of the fabricated `agentskills.io/specification#trigger-testing` anchor
(which does not exist) to this new rubric plus the real, commit-pinned
upstream source resolved during specify (OQ-1).

## Context

**No dependencies — genuinely parallel to WP01/WP02.** Confirmed in
`plan.md`: no file in this WP's scope is touched by WP01, WP02, or WP04. This
is the one real independent lane in this mission; nothing depends on it, and
it can merge before, between, or after the WP01→WP02→WP04 chain with no
reordering risk.

**Grounding correction #1 (from `plan.md`) — read before starting T005.**
The spec names 4 files / 7 occurrences of the fabricated anchor
(`trigger.ts` ×4, `types.ts` ×1, `rigged-impossible-queries.yaml` ×1,
`weather-skill-queries.yaml` ×1). Direct `command grep -n` at this mission's
HEAD finds a **5th file, not named anywhere in the spec**:
`tests/unit/skills-trigger.test.ts` (lines 20 and 59 — 2 more occurrences).
FR-004's own verification command greps only `src/ fixtures/ examples/
docs/` (deliberately excluding `tests/`), so its literal exit criterion is
satisfiable without touching this file. But SC-006 says the anchor must "no
longer appear **anywhere in the repo**" — broader than FR-004's own check.
**This WP's `write_scope` includes `tests/unit/skills-trigger.test.ts`
specifically so SC-006's broader claim is actually true, not just FR-004's
narrower grep.** This is flagged in `plan.md` for operator confirmation; if
the operator rejects this addition, drop T005's edits to this file and accept
that SC-006's "anywhere in the repo" wording is then over-broad (a `spec.md`
wording fix, out of scope for this WP either way).

**Division of labor with WP01**: WP01 owns the 4 occurrences inside
`src/adapters/skills/trigger.ts` (kept there specifically to avoid a
same-file overlap with this WP, since WP01 is already editing that file's
endpoint-default logic). **This WP does not touch `trigger.ts`.**

## Subtask T001: Write `docs/rubric/skills-trigger-taxonomy.md`

**Purpose**: Publish the muster-authored rubric that FR-004 requires — the
citation target every other repoint in this WP points at.

**Steps**:
1. Create `docs/rubric/skills-trigger-taxonomy.md` documenting: the
   8-minimum-per-axis rule, should-trigger vs. near-miss semantics, the 0.5
   default threshold, k-of-n aggregation rationale, and the
   discrimination-control requirement.
2. Cite `github.com/agentskills/agentskills@b8d2613ac050aa4aa8bfb2cf28380d81cdfcd1ca`
   (`docs/skill-creation/optimizing-descriptions.mdx`) as prior art for the
   *numbers* — this is the real, SHA-pinned upstream source resolved by
   OQ-1, not a new decision made here.
3. Mark muster's own hard-gate *enforcement* of those numbers `[MUSTER-OWN]`
   — the upstream page frames "8-10 per axis"/"3 runs" as authoring guidance,
   not an enforced minimum; do not present the hard gate as itself
   upstream-mandated.

**Files**: `docs/rubric/skills-trigger-taxonomy.md` (new file, ~80-150 lines)
**Validation**: `test -f docs/rubric/skills-trigger-taxonomy.md; echo $?` → 0.

## Subtask T002: Repoint citation in `src/adapters/skills/types.ts`

**Steps**:
1. Repoint the 1 occurrence (line 97) to `docs/rubric/skills-trigger-taxonomy.md`.

**Files**: `src/adapters/skills/types.ts` (1 line changed)
**Validation**: `command grep -c "agentskills.io/specification#trigger-testing" src/adapters/skills/types.ts` → `0`.

## Subtask T003: Repoint citation in `rigged-impossible-queries.yaml`

**Steps**:
1. Repoint the 1 occurrence (line 2) to `docs/rubric/skills-trigger-taxonomy.md`.

**Files**: `fixtures/skills/trigger-queries/rigged-impossible-queries.yaml` (1 line changed)
**Validation**: `command grep -c "agentskills.io/specification#trigger-testing" fixtures/skills/trigger-queries/rigged-impossible-queries.yaml` → `0`.

## Subtask T004: Repoint citation in `weather-skill-queries.yaml`

**Steps**:
1. Repoint the 1 occurrence (line 2) to `docs/rubric/skills-trigger-taxonomy.md`.

**Files**: `fixtures/skills/trigger-queries/weather-skill-queries.yaml` (1 line changed)
**Validation**: `command grep -c "agentskills.io/specification#trigger-testing" fixtures/skills/trigger-queries/weather-skill-queries.yaml` → `0`.

## Subtask T005: Repoint citations in `tests/unit/skills-trigger.test.ts`

**Purpose**: Close the gap grounding correction #1 identifies — without this,
SC-006's "anywhere in the repo" claim stays false even after T001-T004.

**Steps**:
1. Repoint the 2 occurrences (lines 20, 59) to `docs/rubric/skills-trigger-taxonomy.md`.
2. This is a plain unit-test edit to citation strings inside existing tests
   already covering `src/adapters/skills/trigger.ts` (already inside this
   mission's `write_scope`) — no test *structure* change, string-only.

**Files**: `tests/unit/skills-trigger.test.ts` (2 lines changed)
**Validation**: see WP03 Acceptance Evidence below (whole-file run, 48
existing tests, unfiltered — confirmed by direct count during plan review).

## Definition of Done

```bash
test -f docs/rubric/skills-trigger-taxonomy.md; echo "exit=$?"   # expect 0 (file exists)

# absence check as a COUNT, never a grep exit code
command grep -rl "agentskills.io/specification#trigger-testing" src/ fixtures/ examples/ docs/ | wc -l
# expect the printed count to be the literal string 0

# broadened per grounding correction #1 — if this WP's tests/ addition is accepted:
command grep -rl "agentskills.io/specification#trigger-testing" src/ fixtures/ examples/ docs/ tests/ | wc -l
# expect the printed count to be the literal string 0 (repo-wide, matching SC-006's literal claim)

pnpm vitest run tests/unit/skills-trigger.test.ts
echo "exit=$?"   # expect 0 (whole-file run, unfiltered — not exposed to the "-t" no-match quirk)

pnpm build; echo "build_exit=$?"
pnpm test; echo "test_exit=$?"
```

This WP is not `done`/`approved` until every command above has been run for
real on this WP's own tree, with its actual output pasted into review
evidence, **and** again after merge to the mission coordination branch.

## Risks

- **`trigger.ts` boundary**: the temptation to "just fix" `trigger.ts`'s
  citations here too must be resisted — those 4 occurrences are WP01's, to
  avoid a same-file overlap. If this WP's implementer finds `trigger.ts`
  still has the fabricated anchor at review time, that is WP01's scope, not
  a gap in this WP.
- **SC-006 scope disagreement**: if the operator rejects the
  `tests/unit/skills-trigger.test.ts` addition (grounding correction #1),
  drop T005 and narrow the acceptance evidence's second `command grep` block
  to the FR-004-only scope (`src/ fixtures/ examples/ docs/`, no `tests/`).

## Reviewer Guidance

- Confirm no edit was made to `src/adapters/skills/trigger.ts` (that is
  WP01's file, not this WP's).
- Confirm the rubric doc actually distinguishes upstream prior art from
  `[MUSTER-OWN]` enforcement — do not accept a version that presents the
  hard 8-minimum gate as itself upstream-mandated.
- Run both `command grep -rl` counts above yourself rather than trusting the
  WP's own reported numbers.

**Implementation command**: `spec-kitty agent action implement WP03 --agent claude`
