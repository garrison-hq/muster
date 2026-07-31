---
work_package_id: WP02
title: Rubric index, drift-check, eight-anchor repair, recorded-gaps register, schema-check, remaining Starlight mirrors, sidebar completion
dependencies:
- WP01
requirement_refs:
- FR-002
- FR-003
- FR-004
- C-001
- C-002
- C-003
- C-004
- C-006
planning_base_branch: kitty/mission-conformance-programme-docs
merge_target_branch: kitty/mission-conformance-programme-docs
branch_strategy: Planning artifacts for this mission were generated on kitty/mission-conformance-programme-docs. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into kitty/mission-conformance-programme-docs unless the human explicitly redirects the landing branch.
subtasks:
- T008
- T009
- T010
- T011
- T012
- T013
- T014
- T015
- T016
history: []
agent_profile: curator-carla
authoritative_surface: docs/rubric/
create_intent:
- scripts/check-rubric-citations.mjs
- scripts/check-register-schema.mjs
- docs/rubric/index.md
- docs/rubric/recorded-gaps.md
- site/src/content/docs/rubric/index.md
- site/src/content/docs/rubric/recorded-gaps.md
- tests/scripts/check-rubric-citations.test.ts
- tests/scripts/check-register-schema.test.ts
- tests/fixtures/recorded-gaps-missing-field.md
execution_mode: code_change
model: ''
owned_files:
- scripts/check-rubric-citations.mjs
- scripts/check-register-schema.mjs
- docs/rubric/skills-trigger-taxonomy.md
- docs/rubric/index.md
- docs/rubric/recorded-gaps.md
- site/src/content/docs/rubric/index.md
- site/src/content/docs/rubric/recorded-gaps.md
- site/astro.config.mjs
- tests/scripts/check-rubric-citations.test.ts
- tests/scripts/check-register-schema.test.ts
- tests/fixtures/recorded-gaps-missing-field.md
- tests/fixtures/unindexed-rubric-dir/**
role: implementer
tags: []
tracker_refs: []
---

# WP02 — Rubric index, drift-check, eight-anchor repair, recorded-gaps register, schema-check, remaining Starlight mirrors, sidebar completion

## ⚡ Do This First: Load Agent Profile

Use the `/ad-hoc-profile-load` skill to load the agent profile specified in the frontmatter, and behave according to its guidance before parsing the rest of this prompt.

- **Profile**: `curator-carla`
- **Role**: `implementer`
- **Agent/tool**: `claude`

If no profile is specified, run `spec-kitty agent profile list` and select the best match for this work package's `task_type` and `authoritative_surface`.

---

## Objective

Build the rubric index and its mechanical drift-check script (FR-002), repair `docs/rubric/skills-trigger-taxonomy.md`'s eight stale/wrong citation anchors as a byproduct, author the 12-entry recorded-gaps register and its schema-check script (FR-003), mirror both into Starlight, and complete the sidebar (FR-004, remaining two-thirds).

## Context

**Depends on WP01** — the sole, real reason is a shared edit to `site/astro.config.mjs`'s `sidebar` array (plan.md Hazard 2). WP01 must already be committed with its one sidebar entry before this WP appends its own two. There is no FR-content dependency: FR-001/FR-005/FR-006 (WP01) and FR-002/FR-003 (this WP) describe entirely separate subject matter.

Read `spec.md` (FR-002, FR-003, FR-004, Key Entities, the "Recorded-Gaps Register — Initial Content" section, SC-001–SC-005, Decision 1) and `plan.md` (grounding corrections 2 and 5, Hazard 2, the "Falsification-evidence discipline" section, the "Drift-check falsification sequencing" section, and the WP02 section) in full before starting.

**This WP's centerpiece is a three-commit sequence that MUST NOT be squashed, reordered, or combined — at any point before merge:**

1. **Commit A** — `scripts/check-rubric-citations.mjs` + its test suite, alone. Do **not** touch `docs/rubric/skills-trigger-taxonomy.md` in this commit.
2. **Commit B** — the eight-anchor repair + three-line grammar normalization to `docs/rubric/skills-trigger-taxonomy.md`, alone. Nothing else changes in this commit.
3. **Commit C** — everything else (register, index, schema-check script, both remaining Starlight mirrors, sidebar completion).

**Why this matters, stated once so every implementer and reviewer sees it**: `docs/rubric/skills-trigger-taxonomy.md`'s eight stale/wrong anchors are the file's real, live, current, unrepaired state in this tree right now (independently re-verified — do not assume they were fixed by an unrelated sibling mission that touched the same underlying source files; they were not). This means Commit A's pre-repair run against the still-broken file is not a constructed hypothetical — it is a real falsification demonstration, available exactly once, at exactly this point in the mission's history. **If Commit A and Commit B are squashed together (or reordered) before merge, this evidence is destroyed — a reviewer would only ever see a green checker with no proof it can ever fail.** Preserve these as separate commits through to merge. Do not squash locally "for tidiness." This instruction is deliberately repeated in the Definition of Done and the Reviewer Guidance below — it is the single most important constraint in this WP.

---

### Subtask T008: Write `scripts/check-rubric-citations.mjs` and its tests — Commit A

**Purpose**: Build the mechanical drift-check script FR-002 requires, and capture its pre-repair failure as verbatim evidence, before touching the file it will repair.

**Steps**:
1. Write `scripts/check-rubric-citations.mjs` (plain Node, no new `package.json` dependency — confirm at implementation time that no YAML/Markdown parser is silently pulled in; this is fixed-shape regex extraction over plain text, not a general Markdown AST need). It must:
   - Parse every canonical-grammar citation — `` `symbolName` (`file:line[-line]`) `` — from every file under `docs/rubric/*.md`.
   - Resolve the cited file, confirm the line range is in-bounds, confirm the named symbol/string literally appears within that range in the current tree.
   - Fail (exit 1) if any file under `docs/rubric/*.md` has zero index entries pointing at it (this is a distinct code path from per-file anchor resolution — do not conflate the two; the edge case in `spec.md`'s own Edge Cases section requires this to be independently testable).
   - Export its anchor-resolution logic as a reusable function (not CLI-entry-only) — `scripts/check-register-schema.mjs` (T012) reuses this exact logic for its own evidence-citation resolution; do not duplicate the parsing logic between the two scripts.
   - Header comment must state explicitly that the parser only understands the canonical `` `symbol` (`file:line`) `` grammar and that pre-existing bare-style citations elsewhere in the corpus (e.g. `docs/rubric/spec-kitty-behavioral-axes.md:21`, a single incidental "(lines 62-67 of that file)" reference) are a **known, undocumented-by-design blind spot** — invisible to this parser, not silently passed as clean. Do not edit `spec-kitty-behavioral-axes.md` in this WP — no FR names it, and touching it would be an unlicensed content edit under C-002.
   - Make zero network calls (C-004, NI-003 regression surface) — confirm no literal `fetch(` call anywhere in the script.
2. Write `tests/scripts/check-rubric-citations.test.ts` (new test directory — no existing convention for testing standalone repo-maintenance scripts; this WP establishes it). Include a synthetic fixture at `tests/fixtures/unindexed-rubric-dir/` proving the index-completeness edge case fires independently of citation-resolution failures: a rubric file with zero index entries must make the checker exit 1 and name that file specifically.
3. **Do not modify `docs/rubric/skills-trigger-taxonomy.md` in this step.** Run the script against the tree as it stands (still containing all eight stale/wrong anchors from the repair inventory in T009). Expect exit `1`, naming all eight anchors.
4. **Commit A**: stage and commit only `scripts/check-rubric-citations.mjs` and `tests/scripts/check-rubric-citations.test.ts` (+ its fixture). Capture the script's stdout from step 3 **verbatim** — paste the actual transcript, not a summary — as this WP's first piece of acceptance evidence (T016).

**Files**: `scripts/check-rubric-citations.mjs` (new), `tests/scripts/check-rubric-citations.test.ts` (new), `tests/fixtures/unindexed-rubric-dir/` (new, fixture only).

**Validation**: `node scripts/check-rubric-citations.mjs` exits 1 and names all eight anchors described in T009's repair inventory, run and captured *before* Commit A is made, against the tree with `docs/rubric/skills-trigger-taxonomy.md` untouched.

---

### Subtask T009: Eight-anchor repair + grammar normalization — Commit B

**Purpose**: Apply the mechanical repair to `docs/rubric/skills-trigger-taxonomy.md` that FR-002 licenses as a byproduct of building the checker — pointer correction and grammar normalization only, no rubric judgment/severity content change (C-002).

**Steps**: re-verify every one of the eight corrections below directly against the current tree before writing — do not copy this prompt's line numbers without checking; the underlying source files may have shifted slightly since this prompt was authored, though a direct re-check at authorship time confirmed all eight were still current and unrepaired.

1. `` `gradeAxis` (`trigger.ts:200-206`) `` → real location `trigger.ts:237` (confirmed: `export function gradeAxis(` at that line at authorship time).
2. `` `console.warn` (`trigger.ts:430-435`) `` → real location `trigger.ts:~472-473` (confirmed: the `console.warn(` call inside the discrimination-control-warning block).
3. "returned unmutated, `trigger.ts:438-440`" → real location `trigger.ts:~481-482` (confirmed: the `return {` statement closing `runTriggerConformance`).
4. "mocked analog... `tests/cts/skills-suite.test.ts:231-307`" → the real static-mode `describe` block starts at line **244**, not 231 — line 231 is the unrelated `describe("SC-006 byte-stable static output"...)` block (confirmed at authorship time); real block extends to ~line 321.
5. "asserts `verdict.passed` is `false` (line 297-300)" → real assertions: `.toBe(false)` for `verdict.passed` and `.toBe(false)` for `verdict.shouldTriggerAxis.passed`, both inside the block starting at line 244 (confirmed at authorship time — re-verify the exact line numbers yourself, they were observed close to but not necessarily identical to any single previously-cited number).
6. "live-model block... `tests/cts/skills-suite.test.ts:312-403`" → real `describe("Skills CTS — behavioral suite (require MUSTER_ENDPOINT)"...)` block starts at line **325** (confirmed at authorship time), closing at end-of-file.
7. "repeats the same `passed:false` assertion (lines 386-391)" → real assertion is inside the live-model block's `isControl` branch (confirmed near line ~421-424 at authorship time — re-verify exact line).
8. "Both assertions carry the label `SC-004`... (lines 231, 297, 390)" → **factually wrong as currently written, not just stale**: line 231 is the `SC-006` block; neither of the other two cited lines currently contains the string `"SC-004"` (confirmed at authorship time: the real `"SC-004"` string occurrences are at lines 10, 244, 312, 421, 424 — re-verify this exact set yourself with `command grep -n "SC-004" tests/cts/skills-suite.test.ts`). This sentence must be **rewritten** to cite the real lines, not merely re-pointed.

Also rewrite the three bare-style citations (currently at doc lines ~175, ~182, ~186 — re-verify) from the path-less `"(line N)"` / `"(lines N, M, P)"` style into the canonical `` `symbol` (`file:line[-line]`) `` grammar so the drift-check parser (T008) can see them at all.

**Nothing else in this file changes in this commit** — no prose, threshold, or severity-judgment text beyond the citation-line rewrites (this is the literal, checkable form of C-002's constraint).

**Commit B**: stage and commit only `docs/rubric/skills-trigger-taxonomy.md`. Re-run `node scripts/check-rubric-citations.mjs`: expect exit `0`. Run `git diff HEAD~1..HEAD -- docs/rubric/skills-trigger-taxonomy.md` and confirm — as literal, captured evidence, not a claim — that only citation-line changes appear (the eight pointer corrections plus the three bare-to-canonical grammar rewrites), nothing else.

**Files**: `docs/rubric/skills-trigger-taxonomy.md` (edit only — no other file in this commit).

**Validation**: `node scripts/check-rubric-citations.mjs` exits 0 after this commit; the `git diff HEAD~1..HEAD` for this file shows only citation-line changes, captured as evidence, not asserted clean.

---

### Subtask T010: Author `docs/rubric/index.md` (FR-002)

**Purpose**: List all six current rubric documents with their citing adapters/checks, per the Key Entities schema (`rubric-file`, `cited-by`, `citation-count`, `drift-check-status`).

**Steps**:
1. List all six: `crosslayer-contradiction-gate.md`, `memory-utilization-taxonomy.md`, `skills-trigger-taxonomy.md`, `sop-rule-taxonomy.md`, `spec-kitty-behavioral-axes.md`, `spec-kitty-profile-taxonomy.md`.
2. For each, state which adapter(s)/check(s) cite it — read each file to determine this rather than guessing from the filename.
3. `citation-count` is informational (how many `file:line` anchors the file currently makes) and `drift-check-status` is populated by the script (T008), not hand-maintained — say so explicitly in the index's own text so a future reader doesn't hand-edit a field the tooling owns.

**Files**: `docs/rubric/index.md` (new).

**Validation**: covered by T008's checker requiring every `docs/rubric/*.md` file to have at least one index entry pointing at it — this file's own completeness is what makes that check pass rather than fail.

---

### Subtask T011: Author `docs/rubric/recorded-gaps.md` — 12 entries (FR-003)

**Purpose**: Populate the recorded-gaps register with **12 entries**, not 7 — `spec.md`'s SC-002 and its "Recorded-Gaps Register — Initial Content" section both require this (RG-001 through RG-007 enumerated in full there, plus RG-008 through RG-012 which that section's closing paragraph explicitly requires "carrying into the register verbatim… at authoring time"). This is not optional scope — a 7-entry register would satisfy neither FR-003's substantive intent nor the mission's own "7 initial + 5 carried" framing, and would fail SC-002 as corrected.

**Steps**:
1. Author RG-001 through RG-007 from spec.md's "Recorded-Gaps Register — Initial Content" section, expanding each into full six-field entries (`id`, `title`, `evidence`, `what-was-tried`, `why-left`, `closes-when`, `status`) — the spec's own text is already abbreviated-but-complete for each field; expand, do not invent.
2. Author RG-008 through RG-012 from the same section's closing paragraph: judge OR-of-two-positions leniency (`src/adapters/openclaw-sop/judge.ts:264-266` — re-verify the exact lines, the OR-logic corrected range per spec.md is "264-266," not "265-267"), xfail-mechanism decision (`examples/behave/manifest.yaml:34-45`), skills `expectations.violations` non-comparison (`src/cli/index.ts:1323` — re-verify), `MUSTER_BASE_URL` deprecation (the deprecation-warning code path — `src/cli/index.ts`'s `resolveSkillsBehavioralEndpoint`, currently ~line 1367-1379, re-verify), SOP static-drift severity (`src/adapters/openclaw-sop/manifest.ts:422-441` + `src/adapters/openclaw-sop/index.ts:156` — re-verify). Every one of these needs the same full six-field treatment as RG-001–007 — no bare titles.
3. Every entry's evidence citation must resolve under T008's anchor-resolution logic (reused by T012's schema-check) — do not cite a line range you have not personally confirmed.

**Files**: `docs/rubric/recorded-gaps.md` (new, 12 entries).

**Validation**: covered by T012's schema-check script — every entry has all six fields non-empty and every evidence citation resolves.

---

### Subtask T012: Write `scripts/check-register-schema.mjs` and its tests (FR-003)

**Purpose**: Make FR-003's register mechanically self-checking, reusing T008's anchor-resolution logic rather than re-implementing citation parsing.

**Steps**:
1. Write `scripts/check-register-schema.mjs docs/rubric/recorded-gaps.md` — validates every entry has all six required fields (`id`, `evidence`, `what-was-tried`, `why-left`, `closes-when`, `status`) non-empty, and every evidence citation resolves (import/reuse T008's exported anchor-resolution function).
2. **Assert `entries.length >= 7`, not a hardcoded `=== 7` or `=== 12`.** `spec.md`'s FR-003 body itself says "containing at minimum the seven entries enumerated…" — matching that wording keeps the script honest about what FR-003 actually requires rather than baking in a guess about the corrected SC-002 count. The register you author (T011) will in fact contain 12; the script does not need to assert that specific number to be correct.
3. Write `tests/scripts/check-register-schema.test.ts` with a synthetic fixture at `tests/fixtures/recorded-gaps-missing-field.md` — one entry missing a required field (e.g. no `closes-when`) — and confirm the script exits 1 and names that specific entry/field. Run against the real, complete 12-entry register too: exit 0 alone is not sufficient evidence (per this mission's own standing lesson about vacuous-looking green checks) — the rejection-case run is mandatory.
4. Zero network calls; byte-stable, order-independent output (C-004) — same discipline as T008.

**Files**: `scripts/check-register-schema.mjs` (new), `tests/scripts/check-register-schema.test.ts` (new), `tests/fixtures/recorded-gaps-missing-field.md` (new fixture).

**Validation**:
```bash
node scripts/check-register-schema.mjs docs/rubric/recorded-gaps.md; echo "exit=$?"   # expect 0
node scripts/check-register-schema.mjs tests/fixtures/recorded-gaps-missing-field.md
echo "exit=$?"   # expect 1, naming the specific incomplete entry/field
```

---

### Subtask T013: Two remaining Starlight mirrors (FR-004)

**Purpose**: Mirror `docs/rubric/index.md` and `docs/rubric/recorded-gaps.md` into Starlight-schema pages.

**Steps**:
1. Write `site/src/content/docs/rubric/index.md` and `site/src/content/docs/rubric/recorded-gaps.md`, same `title`/`description` frontmatter schema as WP01's mirror (confirm the exact schema against `site/src/content/docs/guides/static-conformance.md` again — do not assume it is unchanged from WP01's authorship).
2. Content must match the `docs/` originals in substance; cosmetic Starlight conventions may differ.

**Files**: `site/src/content/docs/rubric/index.md` (new), `site/src/content/docs/rubric/recorded-gaps.md` (new).

**Validation**: covered by T014's build check.

---

### Subtask T014: Sidebar completion + phantom-entry falsification (FR-004, Hazard 2)

**Purpose**: Append this WP's two sidebar entries to the array WP01 already extended, and prove the build gate actually catches a missing-page defect rather than trusting untested tooling.

**Steps**:
1. Confirm WP01's one sidebar entry (`guides/spec-kitty-conformance`) is already present and committed in `site/astro.config.mjs` before editing.
2. Append two entries for this WP's new pages (rubric index, recorded-gaps) — likely as a new sidebar group (e.g. "Rubric") since no existing group fits; do not force them into "Guides" or "Reference" if the fit is poor. Use your judgment on grouping, but do not silently drop either page from the sidebar.
3. **Falsification, required as literal evidence, not asserted**: temporarily add one phantom sidebar entry pointing at a slug with no backing content file, run `cd site && pnpm build`, and confirm it fails (non-zero exit, Starlight's link checker naming the missing page) — capture this output. Then remove the phantom entry and re-run to confirm a clean exit 0. Both states (failing and passing) must be captured; this is FR-004's own stated falsification condition ("a sidebar entry with no backing content file… is itself this FR's own falsification condition") made real rather than assumed.

**Files**: `site/astro.config.mjs` (edit — append only, do not re-author WP01's entry).

**Validation**: both build outcomes (phantom-entry failure, clean pass after removal) captured verbatim in T016's evidence.

---

### Subtask T015: Commit C — everything else, together

**Purpose**: Land the remaining WP02 content in one commit, deliberately separate from Commits A and B so `git show HEAD~1:docs/rubric/skills-trigger-taxonomy.md` (run against Commit C) still isolates exactly the repair from T009, uncontaminated by unrelated additions.

**Steps**:
1. Stage and commit together: `docs/rubric/index.md` (T010), `docs/rubric/recorded-gaps.md` (T011), `scripts/check-register-schema.mjs` + its tests/fixture (T012), both remaining Starlight mirror pages (T013), and `site/astro.config.mjs`'s two new sidebar entries (T014, with the phantom-entry test already reverted — the phantom entry itself must never land in this commit).
2. Do not fold any part of Commit A or Commit B's content into this commit, and do not split this commit further — the discipline is exactly three commits for this WP, no more, no fewer.

**Files**: all of T010–T014's outputs, committed together.

**Validation**: `git log` shows exactly three commits for this WP in order (script, repair, everything-else); `git show HEAD~1:docs/rubric/skills-trigger-taxonomy.md` run against this commit still returns only the repair's content, not contaminated by this commit's changes.

---

### Subtask T016: Capture WP02 acceptance evidence (commit-by-commit)

**Purpose**: Run and capture — verbatim — every verification command this WP's FRs/Cs require, including every rejection case, matching the sequencing above exactly.

**Steps**: capture each block's real output, in commit order:

```bash
# Commit A — script exists, repair not yet applied. Captured verbatim, not narrated.
node scripts/check-rubric-citations.mjs; echo "exit=$?"
# expect exit=1, output naming all eight stale/wrong anchors in skills-trigger-taxonomy.md

# Commit B — repair applied, nothing else changed in this commit
node scripts/check-rubric-citations.mjs; echo "exit=$?"   # expect 0
git diff HEAD~1..HEAD -- docs/rubric/skills-trigger-taxonomy.md
# manual confirmation: only citation-line changes, no prose/threshold/severity content touched (C-002)

# Commit C — register, schema-check, mirrors, sidebar completion
node scripts/check-register-schema.mjs docs/rubric/recorded-gaps.md; echo "exit=$?"   # expect 0
node scripts/check-register-schema.mjs tests/fixtures/recorded-gaps-missing-field.md
echo "exit=$?"   # expect 1, naming the specific incomplete entry/field

# FR-002 edge case — rubric file with zero index entries (test fixture, not the real corpus)
node scripts/check-rubric-citations.mjs --root tests/fixtures/unindexed-rubric-dir/
echo "exit=$?"   # expect 1, naming the unindexed file specifically

# C-004 — byte stability, order-independence (not just repeat-run-in-place)
node scripts/check-rubric-citations.mjs > /tmp/run1.txt; node scripts/check-rubric-citations.mjs > /tmp/run2.txt
diff /tmp/run1.txt /tmp/run2.txt; echo "diff_exit=$?"   # expect 0
(cd / && node /path/to/repo/scripts/check-rubric-citations.mjs) > /tmp/run3.txt
diff /tmp/run1.txt /tmp/run3.txt; echo "diff_exit=$?"   # expect 0 — proves no CWD/iteration-order dependency

# FR-004 — full build, three pages present, plus the phantom-entry falsification (Hazard 2)
cd site && pnpm build; echo "build_exit=$?"   # expect 0, all three new pages in nav
# then, temporarily: add one phantom sidebar entry with no backing file, re-run, expect non-zero,
# then remove the phantom entry and re-run once more, expect 0 again — evidence for BOTH states required

# C-001 — full mission diff, both WPs combined
git diff --name-only <base>...HEAD | command grep -Ev '^(docs/|site/|scripts/check-(rubric-citations|register-schema)\.mjs|tests/)'
echo "exit=$?"   # expect 1 (no output)
# rejection case: stage a scratch out-of-scope touch (never committed), confirm the same command
# emits output for that state, then discard the scratch change

# C-003 — re-verify NI-002, unaffected by this mission
command grep -rn "from ['\"].*adapters" src/core/; echo "exit=$?"   # expect 1 (no matches)
```

**Files**: none (evidence capture only).

**Validation**: every command above captured with its real output; the three-commit sequence's evidence (Commit A's exit=1 transcript, Commit B's exit=0 + clean diff, Commit C's schema-check pass + rejection-case) must all be present. Do not mark this WP done with only Commit C's evidence captured — Commits A and B's evidence is the entire point of the sequencing discipline.

---

## Definition of Done

- **The three-commit sequence (script → repair → everything-else) is present in the mission's git history, in that order, uncombined, through to merge. This is load-bearing: if it is squashed or reordered at any point before merge, the falsification demonstration this WP exists to provide is destroyed, and the WP must be reworked, not merged as-is.**
- `scripts/check-rubric-citations.mjs` exits 1 (pre-repair, Commit A) then 0 (post-repair, Commit B), both captured verbatim.
- `docs/rubric/skills-trigger-taxonomy.md`'s Commit B diff contains only citation-line changes (captured, not asserted).
- `docs/rubric/index.md` lists all six rubric docs with citing adapters; every `docs/rubric/*.md` file has at least one index entry (enforced by the checker).
- `docs/rubric/recorded-gaps.md` contains exactly 12 entries (RG-001–012), all six schema fields populated per entry, no bare titles.
- `scripts/check-register-schema.mjs` exits 0 against the real register and 1 against the missing-field fixture, both captured.
- Both remaining Starlight mirrors exist; the sidebar contains all three new pages (WP01's + this WP's two); the phantom-entry falsification (both failing and passing states) is captured.
- C-001, C-003, C-004 all re-verified with their own rejection/contrast cases captured, not asserted.
- Per-subtask completion recorded via `spec-kitty agent tasks mark-status <Txxx> --status done` as each subtask finishes.
- `docs/rubric/spec-kitty-behavioral-axes.md` is **not** edited by this WP (its one incidental bare-style citation is a documented, known blind spot in the checker's header comment, not a licensed edit target).

## Risks

- **Squash risk (this WP's primary risk)**: any tooling, rebase, or "cleanup" step that combines Commits A/B/C destroys the falsification evidence. If your workflow auto-squashes commits on merge, flag this explicitly to the reviewer before merge and request a squash-exempt merge, or the WP must be reworked.
- **Anchor drift between authorship and implementation**: this prompt's cited line numbers were verified at authorship time but the repo is a moving target; re-verify every citation yourself before writing it into either the repair (T009) or the register (T011) — do not copy a number from this prompt without checking.
- **Register count regression**: do not ship 7 entries. `spec.md`'s SC-002 (as corrected) and the register's own closing paragraph both require 12.
- **Reusing vs. duplicating anchor logic**: if `check-register-schema.mjs` re-implements citation parsing instead of importing T008's function, a future change to the canonical grammar would silently desync the two scripts. Import, don't duplicate.
- **Unlicensed scope creep into `spec-kitty-behavioral-axes.md`**: tempting to "fix" its one bare-style citation while already touching citation grammar elsewhere — do not; no FR licenses that edit in this mission.

## Reviewer Guidance

- **Verify the three commits actually exist, in order, unsquashed, before approving.** `git log --oneline` for this WP's range must show the script-only commit, then the repair-only commit, then everything-else — in that order. If you only see one or two commits covering this WP's scope, reject and ask for the sequencing to be restored.
- Actually run `node scripts/check-rubric-citations.mjs` against Commit A's tree state (e.g. `git show <commitA>:` or a scratch checkout) yourself if there is any doubt the exit=1 evidence is real, rather than trusting the pasted transcript alone.
- Confirm Commit B's diff for `skills-trigger-taxonomy.md` truly contains only citation-line changes — read the diff yourself, do not accept "only citations changed" as an unverified claim.
- Count the register entries yourself: 12, not 7. Confirm each has all six schema fields non-empty — spot-check at least RG-008 through RG-012, since those are the ones most likely to have been shortchanged if an implementer defaulted to the "7 initial" framing.
- Confirm `check-register-schema.mjs` asserts `>= 7`, not `=== 7` or `=== 12` — re-read the script.
- Confirm the phantom-sidebar-entry falsification was actually run (both the failing and the passing state), not merely described.
- Confirm `docs/rubric/spec-kitty-behavioral-axes.md` was not touched.

**Implementation command**: `spec-kitty agent action implement WP02 --agent claude`
