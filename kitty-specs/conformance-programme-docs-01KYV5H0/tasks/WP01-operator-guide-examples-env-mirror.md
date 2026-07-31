---
work_package_id: WP01
title: Operator guide, examples/README.md, .env.example, one Starlight mirror
dependencies: []
requirement_refs:
- FR-001
- FR-004
- FR-005
- FR-006
- C-001
- C-005
- C-006
planning_base_branch: kitty/mission-conformance-programme-docs
merge_target_branch: kitty/mission-conformance-programme-docs
branch_strategy: Planning artifacts for this mission were generated on kitty/mission-conformance-programme-docs. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into kitty/mission-conformance-programme-docs unless the human explicitly redirects the landing branch.
subtasks:
- T001
- T002
- T003
- T004
- T005
- T006
- T007
history: []
agent_profile: curator-carla
authoritative_surface: docs/guides/
create_intent:
- docs/guides/spec-kitty-conformance.md
- site/src/content/docs/guides/spec-kitty-conformance.md
execution_mode: code_change
model: ''
owned_files:
- docs/guides/spec-kitty-conformance.md
- site/src/content/docs/guides/spec-kitty-conformance.md
- site/astro.config.mjs
- examples/README.md
- .env.example
role: implementer
tags: []
tracker_refs: []
---

# WP01 — Operator guide, examples/README.md, .env.example, one Starlight mirror

## ⚡ Do This First: Load Agent Profile

Use the `/ad-hoc-profile-load` skill to load the agent profile specified in the frontmatter, and behave according to its guidance before parsing the rest of this prompt.

- **Profile**: `curator-carla`
- **Role**: `implementer`
- **Agent/tool**: `claude`

If no profile is specified, run `spec-kitty agent profile list` and select the best match for this work package's `task_type` and `authoritative_surface`.

---

## Objective

Author the operator guide (`docs/guides/spec-kitty-conformance.md`, FR-001), correct `examples/README.md` (FR-005) and `.env.example` (FR-006), and land one Starlight mirror + its sidebar entry (FR-004, one-third).

## Context

This is the first of two work packages on a single shared lane (`single_branch` topology). It has **no dependencies** — it is the first thing to land. WP02 depends on this WP *solely* because both WPs edit `site/astro.config.mjs`'s `sidebar` array (see plan.md Hazard 2): this WP adds exactly **one** sidebar entry (its own guide mirror); WP02, once this WP is committed, appends its own two entries to the same array rather than re-authoring it. There is no FR-content coupling between the two WPs — do not read anything below as implying one.

Read `spec.md` (FR-001, FR-004, FR-005, FR-006, Correction 1, Correction 6, Decision 2, Decision 3) and `plan.md` (Hazard 2, grounding corrections 1 and 4, the WP01 section, and the "Falsification-evidence discipline" section) in full before starting. Everything below is grounded against those documents plus direct re-verification of the current tree; do not re-derive citations from `#60` or any other issue text — cite the code/doc lines you actually observe.

**A note on file overlap**: `site/astro.config.mjs` also appears in WP02's `owned_files`. This is intentional, not an error — plan.md's Hazard 2 requires both WPs to touch the same `sidebar` array sequentially (this WP adds one entry; WP02, run afterward, appends two more). It is not a parallel-collision risk because WP02 depends on this WP and both share the same lane/worktree (`single_branch`).

---

### Subtask T001: Author the operator guide's runnable sections (a)(b)(c)

**Purpose**: Write `docs/guides/spec-kitty-conformance.md`, numbered-section structure matching the precedent at `docs/guides/memory-utilization-pilot-protocol.md` (sections "1. …" through "N. …", ending in a "Normative sources" section — confirm the precedent's own section list by reading that file directly before writing).

**Steps**:
1. Section covering **every real, currently-shipped CLI suite** (FR-001(a)): `check`, `resolve`, `cts run`, `behave run`, `memory run`, `heartbeat run`, `a2a run`, `crosslayer run`, `skills run`, `sop run`, `tools run` — against each of Ollama/DGX, NIM, and a hosted OpenAI-compatible endpoint. Base the command shapes on `examples/README.md`'s existing table (read it first) and `src/cli/index.ts`'s actual CLI surface — do not invent flags.
2. Section covering the **full env-var matrix** (FR-001(b)): `MUSTER_ENDPOINT` is canonical; `MUSTER_BASE_URL` is a deprecated alias supported through v1.2.x. Cite `src/cli/index.ts`'s `resolveSkillsBehavioralEndpoint` function (currently at `src/cli/index.ts:1367`, deprecation-warning string at `:1378-1379`) — re-verify the exact line numbers against the tree at implementation time, since they drift as the file changes; do not copy this prompt's numbers without checking.
3. Section covering the **per-adapter exit-code table** (FR-001(c)) — NOT one blanket rule. Confirmed current behavior (re-verify at implementation time, cite what you actually see):
   - `doBehaveRun` (`src/cli/index.ts`, currently ~line 487) and `doA2aBehavioralRun` (currently ~line 1161) each `return 2` when every run of every case errored (endpoint unreachable for the entire run) — deliberate, each with a comment citing `contracts/cli.md`'s exit-code contract.
   - `doSkillsRun` (currently ~line 1584, `return ok ? 0 : 1;`) and `doSopRun` (currently ~line 1685, `return report.passed ? 0 : 1;`) have **no total-endpoint-failure special case** — a fully dead endpoint is counted as an ordinary failed case and exits **1**; exit 2 for these two adapters is reserved solely for manifest read/parse errors.
   - The table must show this divergence explicitly, adapter by adapter. Cross-reference RG-007 in the recorded-gaps register (landing in WP02) as the tracked gap this divergence represents — do not silently harmonize the two conventions in prose; document the real, current, different behaviors.

**Files**: `docs/guides/spec-kitty-conformance.md` (new, target 150–300 lines for sections 1–3 plus the eventual Normative-sources close from T002).

**Validation**: Every command block you write in these sections must be copy-paste runnable from repo root. You will execute all of them verbatim in T007's evidence capture — do not write a command you have not personally run.

---

### Subtask T002: Author the planned/pending appendix (d) and close the guide

**Purpose**: Add FR-001(d)'s section-11 test-strategy appendix and the closing "Normative sources" section.

**Steps**:
1. Reproduce the section-11 test-strategy table from `#60` as a clearly labeled **"PLANNED — not yet implemented, tracked at spec-kitty#24/#25"** banner per Decision 2 (`labeled-forward-looking-table`). Attach **zero verification commands** to any row whose `conformance/*` path does not currently exist in `/home/jeroennouws/dev/spec-kitty-conformance` (read-only inspection only — never modify that repo).
2. **One row needs different treatment, per spec.md's corrected Correction 6 and plan.md's grounding correction 4**: `conformance/skills/manifest.yaml` no longer governs "1 fixture skill" — a since-merged sibling mission (`sk-skills-static-conformance-01KYG7GE`, that repo's commit `08930a32b`) added 53 real skill fixtures plus 1 negative control (`control-name-mismatch`), 54 entries total. Label this one row distinctly from the other five — e.g. "exists today in a sibling repo, not a muster-repo example, not yet wired into `examples/**`" — rather than grouping it under the same "planned, pending M4/M6" banner as the genuinely-still-absent rows (`skprofile`, `conformance/doctrine/*.yaml`, `conformance/crosslayer/manifest.yaml`, `conformance/behavioral/profiles|directives/*.yaml`). Re-verify this yourself, read-only, against `/home/jeroennouws/dev/spec-kitty-conformance`'s current tree before writing the row — do not just copy the count from this prompt.
3. Close with a "Normative sources" section (matching the precedent file's own closing section) citing `contracts/cli.md`, `README.md`, `site/src/content/docs/reference/cli.md`, and the FR-002 rubric index (once it exists — a forward reference is fine here since WP02 lands after this WP).

**Files**: same file as T001, continued.

**Validation**: No verification command is attached to any appendix row referencing a nonexistent path (manual read-check). The one relabeled row does not read as either "planned" (it exists) or "runnable today from muster" (it isn't wired into `examples/**`) — it must read as its own, honestly distinct third category.

---

### Subtask T003: Starlight mirror for the operator guide

**Purpose**: Create `site/src/content/docs/guides/spec-kitty-conformance.md` — the Starlight-schema mirror of the guide (FR-004, one-third).

**Steps**:
1. Read `site/src/content/docs/guides/static-conformance.md` first to confirm the exact frontmatter schema (plain `title` + `description`, no custom fields — confirmed at authorship time; re-confirm yourself).
2. Write the mirror with matching frontmatter and content equivalent to `docs/guides/spec-kitty-conformance.md` (T001/T002) — Starlight's own prose conventions (heading levels, admonitions) may differ cosmetically from the plain-Markdown source, but the substance (commands, exit codes, appendix) must match exactly. A drift between the two copies is itself a defect this mission exists to prevent.

**Files**: `site/src/content/docs/guides/spec-kitty-conformance.md` (new).

**Validation**: `cd site && pnpm build` (see T007) must succeed with this page in the built nav.

---

### Subtask T004: Add this WP's one sidebar entry

**Purpose**: Add exactly one entry to `site/astro.config.mjs`'s `sidebar` array (Guides section) — this WP's own guide mirror only.

**Steps**:
1. Open `site/astro.config.mjs`. Locate the `sidebar` array's `Guides` group (currently `static-conformance`, `behavioral-conformance`, `reference-resolution`).
2. Add `{ slug: 'guides/spec-kitty-conformance' }` to that group's `items` array. **Do not** add WP02's rubric-index/recorded-gaps entries here — those land in WP02, which depends on this WP specifically so it can append to an already-committed array instead of racing this edit.

**Files**: `site/astro.config.mjs` (edit, ~1 line added).

**Validation**: `cd site && pnpm build` exits 0 with only this one new page present in the nav (T007).

---

### Subtask T005: Correct `examples/README.md` (FR-005, Decision 3 — adapter-scoped only)

**Purpose**: Fix the skills row's Mode column and line 5's blanket exit-code claim — narrowly, per the resolved decision (`narrow-adapter-specific-correction`). **This is not a blanket rewrite** — do not touch `behave`/`a2a`'s real, deliberately-coded exit-2 behavior.

**Steps**:
1. Read `examples/README.md` as it stands today. Confirm (re-verify, do not trust this prompt) that line 5 currently reads: "Static-path examples exit 0 with no environment set. Examples marked **needs endpoint** skip live grading gracefully and still exit 0, unless every run fails (endpoint unreachable → exit 2)." — this is the blanket claim that is **false** for `skills`/`sop` (per Correction 1: they exit 1, not 2, on total endpoint failure).
2. Rewrite line 5 to reference the operator guide's per-adapter exit-code table (T001, FR-001(c)) instead of restating a single universal rule — e.g., state that the exit code on total endpoint failure differs by adapter and point the reader at the guide's table, rather than asserting one number for all adapters.
3. Fix the `skills` row's Mode column (currently `static-only`) to reflect that the skills adapter has two behavioral cases (per Correction 1 / muster#78) — do not just say "behavioral"; say what actually changed (it has both static and behavioral cases, matching the `skills run` command's real, current mixed-mode behavior).
4. **Sweep the entire file** for every other "exit 2" mention (`command grep -n "exit 2" examples/README.md`) and confirm each remaining hit — if any — is explicitly scoped to `behave`/`a2a` by name, not a restated universal claim. At authorship time only line 5 contained "exit 2"; re-confirm this yourself and if you find any other unscoped hit, fix it under this same subtask (this file's own leaves-siblings-stale risk is exactly what plan.md's falsification-evidence discipline calls out for FR-005).

**Files**: `examples/README.md` (edit).

**Validation** (run in T007, both the passing and the corrected-claim evidence, not just the new text): 
```bash
node dist/cli/index.js skills run examples/skills/manifest.yaml; echo "exit=$?"   # expect 0 (env unset)
MUSTER_ENDPOINT=http://unreachable-host-for-doc-test:1/v1 node dist/cli/index.js skills run examples/skills/manifest.yaml
echo "exit=$?"   # expect 1 — NOT 2, proving the corrected doc matches real behavior
command grep -n "exit 2" examples/README.md   # manual review: every remaining hit must name behave/a2a explicitly
```

---

### Subtask T006: `.env.example` NI-001 caveat (FR-006)

**Purpose**: Add the working-tree-scan caveat without deleting the existing `--env-file` example (that would be a different documentation lie, per FR-006's own framing).

**Steps**:
1. Read `.env.example` as it stands (confirm the `--env-file=.env` line at line 9 and the existing content around it before editing).
2. Add an explicit caveat stating: NI-001 (`tests/unit/invariants.test.ts`'s `walk()` / `BASE_EXCLUDES`) scans the **entire working tree**, including gitignored files, and does **not** consult `.gitignore` — `BASE_EXCLUDES` is `{node_modules, .git, dist, .worktrees, .kittify}` only. A real, repo-local `.env` file will therefore trip the secret-pattern check. Credentials MUST come from shell-exported environment variables, never a committed or even gitignored-but-present `.env` at repo root.
3. **Do not** claim NI-001 "enforces" `.env` safety — that is the exact inversion muster#79 flags as a risk (whether or not the "sibling spec got this backwards" attribution holds up — spec.md's Correction 5 found that specific attribution unverifiable, but the inversion risk itself is real and must not be introduced here).
4. This subtask, and this WP as a whole, MUST NOT create any `.env` file (repo-local or otherwise) at any point (C-005).

**Files**: `.env.example` (edit, add caveat near the existing `--env-file` documentation).

**Validation** (human review is the real check — grep only proves presence, not correctness):
```bash
command grep -c "NI-001" .env.example   # non-zero
# then manually confirm the wording against tests/unit/invariants.test.ts's real BASE_EXCLUDES/walk() behavior —
# specifically that the caveat does NOT claim NI-001 "enforces" .env safety.
```

---

### Subtask T007: Capture WP01 acceptance evidence (falsification-evidence discipline)

**Purpose**: Run and capture — verbatim, not narrated — every verification command this WP's FRs/Cs require, including the rejection/contrast cases. A passing run alone is not sufficient evidence per this mission's own standing lesson (nine vacuous verification commands have shipped in this programme to date).

**Steps**: run each block below from repo root and paste the actual stdout/exit codes into this WP's evidence record (do not summarize as "works as expected"):

```bash
# FR-001(a) — no env set, skills run: expect skipped:true, exit 0
node dist/cli/index.js skills run examples/skills/manifest.yaml; echo "exit=$?"

# FR-001(c) — the actual per-adapter divergence, BOTH sides observed in the same evidence block
MUSTER_ENDPOINT=http://unreachable-host-for-doc-test:1/v1 node dist/cli/index.js skills run examples/skills/manifest.yaml
echo "skills_exit=$?"   # expect 1
MUSTER_ENDPOINT=http://unreachable-host-for-doc-test:1/v1 node dist/cli/index.js behave run examples/behave/manifest.yaml
echo "behave_exit=$?"   # expect 2 — the CONTRAST between skills_exit=1 and behave_exit=2 is the proof, not a restated claim

# FR-001 doc-test discipline — every runnable command block in the published guide, extracted and executed verbatim
# (extract every fenced bash block from docs/guides/spec-kitty-conformance.md's runnable sections, excluding the
# labeled planned/pending appendix, and run each one; every exit code must match what the guide states inline)

# FR-005 — corrected doc matches actual behavior, no stale blanket claim survives
node dist/cli/index.js skills run examples/skills/manifest.yaml; echo "exit=$?"   # expect 0 (unset)
MUSTER_ENDPOINT=http://unreachable-host-for-doc-test:1/v1 node dist/cli/index.js skills run examples/skills/manifest.yaml
echo "exit=$?"   # expect 1
command grep -n "exit 2" examples/README.md   # every remaining hit must be explicitly adapter-scoped to behave/a2a

# FR-006 — presence check only proves presence, not correctness
command grep -c "NI-001" .env.example   # non-zero, plus required manual wording confirmation

# C-005 — no .env created by this WP
git status --porcelain | command grep -x '.. \.env$'; echo "exit=$?"   # expect 1 (no match)

# FR-004 (this WP's slice) — build with only this one new page present
cd site && pnpm build; echo "build_exit=$?"   # expect 0

# C-001 (this WP's slice)
git diff --name-only <base>...HEAD | command grep -Ev '^(docs/|site/)'; echo "exit=$?"   # expect 1 (no output)
```

**Files**: none (evidence capture only — record the transcripts in the WP's review/evidence artifact, e.g. via `spec-kitty agent mission acceptance-verdict`).

**Validation**: every command above is captured with its real output; any mismatch between a stated and observed exit code, or any guide command referencing a nonexistent path, is a blocking defect — fix the source (guide or code understanding), re-run, and recapture. Do not mark this subtask done until the contrast pair (`skills_exit=1` vs `behave_exit=2`) has actually been observed together in one evidence block.

---

## Definition of Done

- `docs/guides/spec-kitty-conformance.md` exists, follows the numbered-section precedent, and every runnable command block in it executes with the exit code stated inline (T001, T002, T007).
- The section-11 appendix is labeled "PLANNED — pending spec-kitty#24/#25" with zero verification commands on nonexistent-path rows, and the one changed row (skills-behavioral-manifest) is labeled distinctly, not grouped with the other five (T002).
- `site/src/content/docs/guides/spec-kitty-conformance.md` exists with matching frontmatter and content (T003).
- `site/astro.config.mjs` has exactly one new sidebar entry from this WP (T004).
- `examples/README.md`'s skills row and line 5 are corrected; no unscoped "exit 2" claim remains anywhere in the file (T005).
- `.env.example` has the NI-001 caveat, does not claim NI-001 "enforces" `.env` safety, and no `.env` file was created during this WP (T006).
- All acceptance evidence in T007 has been captured verbatim, including the `skills_exit=1` vs `behave_exit=2` contrast pair.
- Per-subtask completion is recorded via `spec-kitty agent tasks mark-status <Txxx> --status done` as each subtask finishes — do not batch all seven at the end.
- **`acceptance-matrix.json` is updated as evidence lands, not left at its seeded `"TODO: replace with a real acceptance criterion"` placeholders until accept time** (a sibling mission shipped 6 of 7 FR rows still at that placeholder at accept-gate time, and clearing it after the fact meant re-running every verification command anyway — do it once, at authorship time). For each FR this WP owns (FR-001, FR-005, FR-006; FR-004 is one-third-owned, record it as `pending` here and let WP02 finalize it once its own two-thirds land), run, e.g.:
  ```bash
  spec-kitty agent mission acceptance-verdict --mission conformance-programme-docs-01KYV5H0 \
    --criterion FR-001 --result pass --verification-method automated_test \
    --evidence "T007 doc-test block: docs/guides/spec-kitty-conformance.md, all fenced bash blocks executed verbatim, exit codes matched"
  ```
  Do this for FR-001, FR-005, FR-006 once their respective T007 evidence blocks are captured and green. Do not mark a criterion `pass` from a narrated claim — only from a captured, real command transcript.

## Risks

- **Leaves-siblings-stale risk (FR-005)**: correcting only the skills row's Mode column without sweeping the whole file for other unscoped "exit 2" claims would repeat the exact failure mode this mission exists to catch. T005 requires the sweep explicitly.
- **NI-001 inversion risk (FR-006)**: writing a caveat that claims NI-001 "enforces" `.env` safety would be the exact defect muster#79 flags. T006's validation requires a human to read the wording, not just grep for presence.
- **Sidebar race (Hazard 2)**: do not add WP02's two entries here "to save a step" — that would remove the real reason WP02 depends on this WP and could cause a conflicting edit if WP02 is worked before this WP's commit is fully landed.
- **Guide referencing a path that doesn't exist**: any command in the guide referencing a `conformance/*` path must either be in the clearly-labeled planned appendix with no verification command, or must be a real, currently-runnable muster path. Mixing the two is FR-001(d)'s own falsification condition.

## Reviewer Guidance

- Actually run the doc-test extraction (T007) — do not accept "the guide looks complete" as sufficient. Every command block claims an exit code; verify a sample (ideally all) match.
- Confirm the contrast pair (`skills` exits 1, `behave` exits 2 on the same unreachable-endpoint condition) was captured together, not asserted from spec text.
- Confirm the one relabeled appendix row (skills-behavioral-manifest) reads as neither "planned" nor "runnable today" — it must be its own honest category.
- Confirm `examples/README.md` has zero remaining unscoped "exit 2" mentions — grep for "exit 2" yourself during review, don't trust the WP's own claim.
- Confirm `.env.example`'s caveat wording against `tests/unit/invariants.test.ts`'s real `BASE_EXCLUDES`/`walk()` behavior — read the test file yourself.
- Confirm no `.env` file exists anywhere in the tree at review time (`git status --porcelain`, plus a directory listing at repo root).

**Implementation command**: `spec-kitty agent action implement WP01 --agent claude`
