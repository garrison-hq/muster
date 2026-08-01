# Mission Specification: Documentation Project - Conformance Programme Docs

**Mission Branch**: `kitty/mission-conformance-programme-docs`
**Created**: 2026-07-31
**Status**: Draft
**Mission**: documentation
**Input**: garrison-hq/muster#60 — "[M9] conformance-programme-docs — operator guide, rubric index, recorded-gaps register"

**Source verification baseline**: all repo-state claims below were checked directly against `garrison-hq/muster` at commit `16f0d34c3126fab5df2ee0b6e1e304a4d9bcb8e3` (current `main`, which is also PR #85's merge commit) and against the primary checkout at `e042d7198c575f4fc2a815cfa7b201aff6948b30` on `fix/crosslayer-contradiction-false-positives` (identical content, already merged). Cross-repo checks against `/home/jeroennouws/dev/spec-kitty-conformance` and `/home/jeroennouws/dev/garrison-hq/muster-action` were read-only; neither repo was modified.

## Corrections to Issue #60 (verified against repo state, not trusted)

Per programme convention ("every agent who checked a brief against reality found a real error in it"), each claim in #60 was checked before being carried into requirements below. Six corrections follow; each changes how a requirement is worded.

1. **Exit-code contract is not universal — it diverges by adapter, and #60's instruction to assert exit 1 everywhere is wrong for two adapters.** `src/cli/index.ts`'s `doBehaveRun` (~L479-489) and `doA2aBehavioralRun` (~L1157-1162) both deliberately return **exit 2** when "every run of every case errored" (endpoint unreachable for the entire run), each with an explicit comment citing `contracts/cli.md`'s exit-code contract, and this is corroborated by `README.md:75-76`, `site/src/content/docs/reference/cli.md:25`, and `kitty-specs/cts1-conformance-harness-01KTS86B/contracts/cli.md:8`. By contrast, `doSkillsRun` (~L1580-1584) and `doSopRun` (~L1684-1686) have **no total-endpoint-failure special case at all** — any failure, including a fully dead endpoint, is counted as a normal failed case and exits 1; exit 2 is reserved solely for manifest read/parse errors. muster#78's own measured reproduction is specifically against `skills run` and is accurate for that adapter (`skills: FAIL — 1/3 cases passed, 2 failed`, `$?` = 1). **Resolution (Decision, resolved `narrow-adapter-specific-correction`)**: the correction is scoped to what #78 actually evidences — the `skills` row and the `examples/README.md:5` blanket statement — and the divergence itself becomes a new recorded-gaps register entry (RG-007 below), not a silent global rewrite that would misdocument `behave`/`a2a`'s real, current, deliberately-coded behavior.
2. **muster#82's "identical" framing overstates precision.** The minimal-skill and weather-lookup skills score 10/10 and 30/30 respectively — the same normalized *rate* (1.0), not the same raw count. FR/register wording below says "normalizes to the same 1.0 rate," not "identical scores."
3. **muster#84 / PR#85's fix is two-part, not solely "a subject-matter gate."** PR#85 (merged, `16f0d34c3`) fixed HTML-comment-body leakage (`stripHtmlComments`, accounting for 3 of the 9 false-positive pairs) *and* added the subject-matter gate. The register entry credits both causes.
4. **muster#75's heartbeat-timeout count is wrong.** The issue reports **10** failing tests (`108 passed, 10 failed` of 118), not 13. Corrected in the register entry.
5. **muster#79's "a sibling spec got this exactly backwards" claim is unverifiable.** Issue #79's body does not contain that sentence or anything matching it; it only cross-references #67 and quotes `spec.md:218` of the M5 mission, which correctly (not backwards) describes the failure mode. This spec does not repeat the claim as fact.
6. **The section-11 test-strategy table in #60 mostly describes paths that do not exist yet.** Checked directly against `/home/jeroennouws/dev/spec-kitty-conformance`: `conformance/skills/manifest.yaml` existed at this spec's pinned commit (`16f0d34c3`) governing **1** fixture skill, not 53 (the 53 `SKILL.md` figure is real but refers to `src/doctrine/skills/*/SKILL.md`, the doctrine library, not a conformance fixture set). **This has since changed and is corrected here**: a sibling mission (`sk-skills-static-conformance-01KYG7GE`, that repo's own commit `08930a32b`) merged into `spec-kitty-conformance` after this spec's pinned reference point, and the file now governs **53 real skill fixtures plus 1 negative control** (`control-name-mismatch`) — 54 manifest entries total, verified directly (read-only) against that repo's current tree. FR-001(d)'s appendix row for this path reflects the corrected, current state rather than the pinned-commit snapshot: it is labeled distinctly from the other five rows below — "exists today in a sibling repo, not a muster-repo example, not yet wired into `examples/**`" — instead of being grouped under the same "planned, pending M4/M6" banner, since it is no longer genuinely nonexistent. This does not reopen Decision 2 (`labeled-forward-looking-table`); the other five rows below remain exactly as aspirational as originally stated. `conformance/skprofile` does not exist (`*.agent.yaml` count is 25, not 18, and lives at `src/doctrine/agent_profiles/built-in/`; `agent_profiles_manifest.json` lives at `.kittify/`, not under `conformance/`); `conformance/doctrine/*.yaml` does not exist (25 directive files live at `src/doctrine/directives/built-in/*.directive.yaml`); `conformance/crosslayer/manifest.yaml` does not exist — the crosslayer conformance suite is an **unimplemented planned mission** (`kitty-specs/crosslayer-composition-suite-01KYJA33`, `status.json` shows `work_packages: {}`); `conformance/behavioral/profiles/*.yaml` and `conformance/behavioral/directives/*.yaml` do not exist anywhere in that repo; `conformance/skills/behavioral-manifest.yaml` does not exist. **Resolution (Decision, resolved `labeled-forward-looking-table`)**: FR-001's operator guide documents only muster's own real, runnable CLI surface (adapters + `examples/*`); the section-11 table is carried into the guide as an explicitly labeled "planned, pending M4 (spec-kitty#24) / M6 (spec-kitty#25)" appendix with no verification commands attached to non-existent rows.

Two secondary observations, not corrections but load-bearing for FR-003: issue tracking state (open/closed) on this programme does not reliably indicate whether the underlying mission merged (per prior programme history — a merged mission's tracking issue can remain open); and muster#80 (rubric citation drift) is **still live today**, not merely "as filed" and **worse than initially counted** — this spec's own adversarial review (post-spec gate) found 8 distinct code-referencing anchors in `docs/rubric/skills-trigger-taxonomy.md`, of which only 1 (`types.ts:165-171`) currently resolves correctly; the other 7 are either stale or, in one case, factually wrong about which test block they name (see FR-002's repair inventory, which itself grew from 5 to 8 items during review — a small, on-the-record demonstration of exactly the citation-drift risk this mission exists to catch).

## Documentation Scope

**Iteration Mode**: gap-filling — the underlying rubrics, adapters, and correction issues already exist; this mission adds the missing index/register/guide layer over them, not new subject matter.
**Target Audience**: operators running conformance suites locally (BYOM against Ollama/DGX, NIM, or a hosted endpoint) and contributors/reviewers who need to find which normative source backs a given check, or whether a gap they just tripped over is already known.
**Selected Divio Types**: how-to (operator guide, FR-001) + reference (rubric index FR-002, recorded-gaps register FR-003).
**Languages Detected**: TypeScript (muster CLI/adapters); Markdown (docs, rubrics); YAML (GitHub Actions, Starlight nav).
**Generators to Use**: none — all three deliverables are hand-authored Markdown under `docs/` and `site/src/content/docs/`.

### Gap Analysis Results

**Existing documentation** (verified present):
- `docs/rubric/crosslayer-contradiction-gate.md`, `sop-rule-taxonomy.md`, `skills-trigger-taxonomy.md`, `memory-utilization-taxonomy.md`, `spec-kitty-behavioral-axes.md`, `spec-kitty-profile-taxonomy.md` — six rubric documents, zero index over them.
- `docs/guides/memory-utilization-pilot-protocol.md` — house precedent for guide structure (numbered sections, ends "Normative sources").
- `examples/README.md` — command-and-mode table; contains the stale exit-code/mode claims from correction #1 (muster#78).
- `.env.example:9` — advertises `node --env-file=.env …` without a scan-safety caveat (muster#79's anchor).
- `BRIEF.md:83-108` — the six carried-over constraints, uncited from any conformance doc.

**Identified gaps**:
- No operator guide exists anywhere documenting the env matrix (`MUSTER_ENDPOINT` canonical vs `MUSTER_BASE_URL` deprecated-through-v1.2.x alias) or a correct, per-adapter exit-code contract.
- No index over the six rubric documents; no mechanism catching citation drift (muster#80: of 8 code anchors identified in `skills-trigger-taxonomy.md` across this spec's authorship and its own adversarial review, only 1 — `types.ts:165-171` — currently resolves correctly; see FR-002's repair inventory).
- No recorded-gaps register; six-plus known, reasoned-about gaps currently live only in GitHub issues, PR descriptions, and doctrine comments (correction items above, plus the design-decision context in #60 §11).

**Coverage Percentage**: 0% (no prior artifact for any of the three deliverables) — this mission is 100% additive.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator runs a suite for the first time (Priority: P1)

An operator with a fresh clone and a local Ollama/DGX endpoint (or NIM, or a hosted key) wants to run every muster conformance suite without reverse-engineering `src/cli/index.ts`.

**Why this priority**: this is the guide's entire reason to exist; every other deliverable assumes commands the reader can actually run.

**Independent Test**: every command block in the published guide is copy-pasted verbatim into a shell from repo root and its observed exit code matches the guide's stated code (AC-1, doc-test discipline).

**Acceptance Scenarios**:
1. **Given** no environment variables set, **When** the operator runs `node dist/cli/index.js skills run examples/skills/manifest.yaml`, **Then** the two behavioral cases are recorded as `skipped: true` (not failed) and the command exits 0.
2. **Given** `MUSTER_ENDPOINT` pointed at an unreachable address, **When** the operator runs the same command, **Then** the command exits 1 (not 2 — corrected per #78) with a `[FAIL]` line per errored case.
3. **Given** `MUSTER_ENDPOINT` pointed at an unreachable address, **When** the operator runs `node dist/cli/index.js behave run examples/behave/manifest.yaml`, **Then** the command exits 2 (endpoint-fatal path, distinct from case 2 — this is the cross-adapter divergence in RG-007).

### User Story 2 - Contributor traces a check back to its normative source (Priority: P1)

A reviewer sees a failing check and needs to know which rubric it cites and whether that citation still points at real code.

**Why this priority**: BRIEF.md's constraint 5 ("every check traces to a cited normative source") is only auditable if the citation resolves; muster#80 shows it silently stops resolving.

**Independent Test**: `node scripts/check-rubric-citations.mjs` runs against the published rubric index and exits non-zero on any stale anchor, zero when all anchors resolve.

**Acceptance Scenarios**:
1. **Given** the rubric index lists all six rubric docs, **When** a reviewer opens the index, **Then** every entry links to a rubric file that exists and states which check(s) cite it.
2. **Given** `docs/rubric/skills-trigger-taxonomy.md` in its current (post-repair, see RG-drift-check) state, **When** the drift-check script runs, **Then** it exits 0.
3. **Given** a scratch copy of the same file with one citation's line range deliberately moved off its real target (the file's own state *before* the repair in this mission — `trigger.ts:200-206` when `gradeAxis` is actually at line 237), **When** the drift-check script runs against that copy, **Then** it exits 1 and names the specific stale anchor.

### User Story 3 - Engineer checks whether a gap is already known before re-discovering it (Priority: P2)

An engineer about to fix "the discrimination control is satisfiable by a dead endpoint" wants to know in 30 seconds whether this is tracked, what was tried, and why it wasn't closed yet.

**Why this priority**: prevents the register from being read as a TODO list nobody trusts — the stated failure mode this mission exists to avoid.

**Independent Test**: every register entry has all six schema fields (FR-003) populated with real evidence; none reads as a bare title.

**Acceptance Scenarios**:
1. **Given** the register, **When** the engineer searches for "dead endpoint" or "runsErrored", **Then** they find RG-001 (muster#76) with the exact test file, the missing assertion, and the field name (`runsErrored`) that would close it.

### Edge Cases

- A rubric doc is added or renamed after this mission merges without updating the index — caught by requiring the drift-check to also fail on a rubric file under `docs/rubric/*.md` that has no index entry (not just stale citations within an indexed file).
- A register entry's underlying GitHub issue is closed after this mission merges but the residual gap it documents (e.g., muster#84's accepted false-negative surface) is not itself resolved — the register's `status` field distinguishes `tracked-defect` (has an open issue) from `accepted-tradeoff` (deliberately permanent, may have a closed/merged issue) so closure of the issue doesn't imply the register entry should be deleted.
- The operator guide's forward-looking appendix (section-11 table) is mistaken for currently-runnable content — mitigated by an explicit "PLANNED — not yet implemented, tracked at spec-kitty#24/#25" banner on that table and the absence of any verification command attached to its rows.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: An operator guide MUST exist at `docs/guides/spec-kitty-conformance.md`, following the section-numbering precedent of `docs/guides/memory-utilization-pilot-protocol.md` (ends in a "Normative sources" section), and MUST cover: (a) how to run every real, currently-shipped muster CLI suite (`check`, `resolve`, `cts run`, `behave run`, `memory run`, `heartbeat run`, `a2a run`, `crosslayer run`, `skills run`, `sop run`, `tools run`) against each of Ollama/DGX, NIM, and a hosted OpenAI-compatible endpoint; (b) the full env-var matrix, explicitly stating `MUSTER_ENDPOINT` is canonical and `MUSTER_BASE_URL` is a deprecated alias supported through v1.2.x (cite `src/cli/index.ts`'s `resolveSkillsBehavioralEndpoint` deprecation warning); (c) a **per-adapter** exit-code table (not one blanket rule) reflecting the confirmed divergence in Correction 1; (d) the section-11 test-strategy table from #60, reproduced as a clearly labeled **planned/pending** appendix per the resolved decision, with zero verification commands attached to rows whose `conformance/*` paths do not currently exist.
  - *Verification*: `bash -c 'for cmd_file in <extracted command blocks>; do bash "$cmd_file"; echo "exit=$?"; done'` run against every command block in the guide from repo root; expected exit codes are the ones stated inline next to each block.
  - *Falsification condition*: any command block whose actual exit code differs from its stated code, or any command in the guide that references a path not present in the repo at review time, fails review (AC-1) and blocks approval — this is the doc-test, not a description of one.
- **FR-002**: A rubric index MUST exist (`docs/rubric/index.md` or equivalent) listing all six current rubric documents (`crosslayer-contradiction-gate.md`, `memory-utilization-taxonomy.md`, `skills-trigger-taxonomy.md`, `sop-rule-taxonomy.md`, `spec-kitty-behavioral-axes.md`, `spec-kitty-profile-taxonomy.md`), each entry stating which adapter/check(s) cite it. All code citations in every file under `docs/rubric/*.md` MUST be normalized to the single canonical grammar already dominant in the corpus — `` `symbolName` (`file:line[-line]`) `` — as part of this FR's repair pass; `skills-trigger-taxonomy.md` currently mixes this grammar with a bare, path-less "(line N)" / "(lines N, M, P)" style (doc lines 175, 182, 186) that a single-pattern parser cannot see, so those three get rewritten into the canonical grammar, not just left for the checker to special-case. A mechanical drift-check script (`scripts/check-rubric-citations.mjs`) MUST then parse every canonical-grammar citation from every file under `docs/rubric/*.md`, resolve the file, confirm the line range is in-bounds, and confirm the named symbol/string literally appears within that line range in the current tree; it MUST also fail if any file under `docs/rubric/*.md` has zero index entries pointing at it. Per the resolved decision, this FR mechanically repairs `skills-trigger-taxonomy.md`'s stale anchors (muster#80) as a byproduct of building the checker — pointer correction and grammar normalization only, no rubric judgment/severity content changes, so it does not breach the "no rubric content changes beyond the index" scope guard.
  - *Repair inventory (verified directly, not from #60)*: eight anchors in `skills-trigger-taxonomy.md` need correction, not five — the original Correction-6-adjacent pass under-counted by missing three malformed-grammar citations caught only by an independent adversarial review of this spec itself (documented here rather than silently fixed, per this programme's own "verify, don't trust" standard):
    - `` `gradeAxis` (`trigger.ts:200-206`) `` → real location `trigger.ts:237`.
    - `` `console.warn` (`trigger.ts:430-435`) `` → real location `trigger.ts:~472-473`.
    - "returned unmutated, `trigger.ts:438-440`" → real location `trigger.ts:~481-482`.
    - "mocked analog... `tests/cts/skills-suite.test.ts:231-307`" → the real static-mode `describe` block starts at line 244, not 231 (line 231 is the unrelated `SC-006 byte-stable static output` block); real block extends to line ~321.
    - "asserts `verdict.passed` is `false` (line 297-300)" → real assertions are `.toBe(false)` at line 313 and `verdict.shouldTriggerAxis.passed).toBe(false)` at line 319; rewrite as canonical-grammar citations at those lines.
    - "live-model block... `tests/cts/skills-suite.test.ts:312-403`" → real `describe("Skills CTS — behavioral suite...")` block starts at line 325 and closes at line 439 (not 438 — 438 is the enclosing `for`-loop's closing brace, 439 is `});` closing `describe`).
    - "repeats the same `passed:false` assertion (lines 386-391)" → real assertion is `.toBe(false)` at line 425.
    - "Both assertions carry the label `SC-004`... (lines 231, 297, 390)" → **factually wrong as currently written**, not just stale: line 231 is the `SC-006` block, and neither line 297 nor 390 currently contains the string `SC-004` at all (the real `SC-004` occurrences are at lines 10, 242, 244, 247, 312, 421, 424 — seven, not five; a WP02 review caught that the initially-repaired sentence still under-counted by omitting two comment-line occurrences at 242 and 247). This sentence must be rewritten to cite the real lines, not merely re-pointed.
  - *Verification*: `node scripts/check-rubric-citations.mjs`.
  - *Expected exit code*: `0` once repaired (post-FR-002). *Falsification*: commit the drift-check script itself in a separate commit BEFORE applying the anchor repair (so `git stash`/`git show HEAD~1:docs/rubric/skills-trigger-taxonomy.md` isolates only the repair, not the script or the register/site changes landing in the same WP) — running the script against that pre-repair commit is expected to exit `1` and name all eight anchors above as stale/unresolvable. This is not a hypothetical: it is the file's real, currently-shipped state at commit `16f0d34c3`, independently re-verified during this spec's own adversarial review.
- **FR-003**: A recorded-gaps register MUST exist (`docs/rubric/recorded-gaps.md` or equivalent) with the schema defined under Key Entities below, containing at minimum the seven entries enumerated in "Recorded-Gaps Register — Initial Content" below, each with file:line evidence.
  - *Verification*: `node scripts/check-register-schema.mjs docs/rubric/recorded-gaps.md` (new script; validates every entry has all six required fields non-empty and every evidence citation resolves, reusing FR-002's anchor-resolution logic).
  - *Expected exit code*: `0`.
  - *Falsification condition*: an entry missing any of `id`/`evidence`/`what-was-tried`/`why-left`/`closes-when`/`status`, or an evidence citation that doesn't resolve, exits `1` and names the incomplete entry — this directly targets the "TODO list nobody reads" and "all six FR rows still say pending" failure modes this programme has hit before.
- **FR-004**: `site/src/content/docs/` and `docs/` are separate, independently-authored content trees today (verified: `docs/guides/memory-utilization-pilot-protocol.md` has no Starlight counterpart or frontmatter and is not in the sidebar; none of the six `docs/rubric/*.md` files exist under `site/`; there is no symlink or build-time include — `site/src/content.config.ts` uses a plain `docsLoader()`). Satisfying this FR therefore requires **authoring three new Starlight-schema pages** (with `title`/`description` frontmatter, matching the house style of `site/src/content/docs/guides/{static-conformance,behavioral-conformance,reference-resolution}.md`) — not merely editing the sidebar array: one mirroring the operator guide (FR-001), one mirroring the rubric index (FR-002), one mirroring the recorded-gaps register (FR-003). `site/astro.config.mjs`'s `sidebar` array MUST reference all three, and `.github/workflows/site.yml` ("Deploy site") MUST build green with them present. This FR is not satisfiable by a sidebar-only edit; a sidebar entry with no backing content file is itself this FR's own falsification condition.
  - *Verification*: `cd site && pnpm build`.
  - *Expected exit code*: `0`.
  - *Falsification condition*: a broken internal link, a sidebar entry with no backing content file, or any other unregistered/dangling page under `site/src/content/docs/` that Starlight's build-time link checker flags — any of these exits non-zero.
- **FR-005**: `examples/README.md` MUST be corrected per Correction 1 — the skills row's Mode column (currently `static-only`) updated to reflect its two behavioral cases, and line 5's blanket exit-code claim replaced by a reference to FR-001(c)'s per-adapter table rather than a single restated rule.
  - *Verification*: `node dist/cli/index.js skills run examples/skills/manifest.yaml` with `MUSTER_ENDPOINT` unset, then with it pointed at an unreachable address; observe exit 0 then exit 1, matching the corrected doc, not the doc's pre-correction claim of exit 2.
  - *Expected exit codes*: `0`, then `1`.
  - *Falsification condition*: `examples/README.md` still stating a universal exit-2 claim after this FR ships.
- **FR-006**: `.env.example` MUST retain a working example (do not delete the `--env-file` line — that would just be a different documentation lie) but MUST add an explicit caveat that NI-001 scans the entire working tree including gitignored files, so a real repo-local `.env` will trip the secret-pattern check (`tests/unit/invariants.test.ts`'s `walk()`, which does not consult `.gitignore`), and that credentials MUST be supplied via shell-exported environment variables, never a committed or even gitignored-but-present `.env` file at repo root. This mission itself MUST NOT create any `.env` file (repo-local or otherwise) at any point, per the same invariant.
  - *Verification*: `command grep -c "NI-001" .env.example` combined with a manual read (grep alone cannot verify prose accuracy — this is itself a "checks that report green while verifying nothing" trap; the real check is human review confirming the caveat text matches `tests/unit/invariants.test.ts`'s actual `BASE_EXCLUDES` behavior).
  - *Expected*: caveat present; reviewer confirms wording against the cited test file.
  - *Falsification condition*: caveat absent, or caveat asserts NI-001 "enforces" `.env` safety (the exact inversion muster#79 flags as a risk, whether or not the "sibling spec" attribution holds up).

### Constraints

- **C-001**: Diff MUST be documentation-only — every changed file MUST be under `docs/**` or `site/**`, except `scripts/check-rubric-citations.mjs`, `scripts/check-register-schema.mjs`, and their `tests/**` counterparts (verification tooling for FR-002/FR-003 is not itself "documentation content," but it is required to make FR-002/FR-003 mechanically true rather than aspirational, per the programme's standing rule against checks that can't fail).
  - *Verification*: `git diff --name-only <base>...<head> | command grep -Ev '^(docs/|site/|scripts/check-(rubric-citations|register-schema)\.mjs|tests/)'`.
  - *Expected exit code*: `1` (grep finds nothing outside the allowed set → no output → grep itself exits 1, meaning the diff is clean). Falsification: any output at all means a file outside scope changed.
- **C-002**: No new conformance checks, no severity changes, no rubric *content* changes beyond FR-002's mechanical anchor repair (scope guard from #60 §4, narrowed per the resolved anchor-repair decision).
- **C-003**: `src/core/**` MUST NOT import from `src/adapters/**` (NI-002) — unaffected by this mission but re-verified as a guard against accidental scope creep, since FR-002/FR-003's scripts touch `src/`-adjacent tooling.
  - *Verification*: `command grep -rn "from ['\"].*adapters" src/core/`.
  - *Expected exit code*: `1` (no matches).
- **C-004**: Static/offline path MUST remain byte-stable — this mission adds no behavioral code paths, but FR-002/FR-003's new scripts MUST themselves run fully offline (no network calls) and produce byte-stable output for a fixed input.
  - *Verification*: run `node scripts/check-rubric-citations.mjs` twice against an unchanged tree; diff the two stdout captures.
  - *Expected exit code (of the diff)*: `0` (no difference).
- **C-005**: No repo-local `.env` file MUST be created at any point during this mission (see FR-006); credentials for any doc-test verification run MUST come from shell-exported environment variables only.
- **C-006**: Every check this mission's own tooling performs MUST cite a normative source: FR-002/FR-003's scripts cite this spec's FR IDs in their own error messages; this spec.md cites `garrison-hq/muster` commit `16f0d34c3126fab5df2ee0b6e1e304a4d9bcb8e3` as the state all "current" claims were verified against — never `HEAD`, never a branch name, so a later reader can `git show 16f0d34c3:<path>` and see exactly what this spec saw.

### Key Entities

- **Recorded-Gap Entry** (schema for FR-003): `id` (RG-### slug), `title`, `evidence` (one or more `path:line` citations resolvable by FR-002's anchor logic, plus a GitHub issue/PR number where one exists), `what-was-tried` (concrete prior attempt or design considered, not "nothing"), `why-left` (the actual tradeoff or constraint that blocked closing it, not "out of scope" alone), `closes-when` (a concrete, checkable condition — a field to start asserting, a manifest to publish, a threshold to cross), `status` (`tracked-defect` | `accepted-tradeoff`). An entry missing any field is incomplete per FR-003's falsification condition.
- **Rubric Index Entry** (schema for FR-002): `rubric-file` (path under `docs/rubric/`), `cited-by` (adapter(s)/check(s) that reference it), `citation-count` (how many `file:line` anchors it currently makes, informational), `drift-check-status` (pass/fail, populated by the script, not hand-maintained).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `node scripts/check-rubric-citations.mjs` exits 0 against the merged tree (100% of sampled anchors resolve — muster#80 closed as a byproduct).
- **SC-002**: `node scripts/check-register-schema.mjs docs/rubric/recorded-gaps.md` exits 0 with exactly 12 entries (RG-001 through RG-012 — the seven entries enumerated in "Recorded-Gaps Register — Initial Content" plus the five, RG-008 through RG-012, that section's closing paragraph requires carrying in at authoring time), all six schema fields populated per entry.
- **SC-003**: Every command block in `docs/guides/spec-kitty-conformance.md`'s runnable sections (excluding the labeled planned/pending appendix) executes verbatim during review with an observed exit code matching its stated code — 100% of blocks, zero exceptions.
- **SC-004**: `cd site && pnpm build` exits 0 with the three new pages present in the built nav.
- **SC-005**: `git diff --name-only <base>...<head>` contains zero paths outside `docs/**`, `site/**`, or the two named `scripts/**` + `tests/**` additions.

### Quality Gates

- No FR/C verification command in this spec is a vacuity trap (per the programme's own catalogue: no bracket-expression `grep -qx`, no unexported inline env vars, no `grep -c`/`-qv` exit-code inversions, no `if`-guarded command exempt from `set -e`) — each command above was run mentally against its own falsification case while drafting, not just written.
- Every FR/C row has a non-empty verification command AND a non-empty falsification condition — no exceptions.
- Citations in this spec pin to commit `16f0d34c3126fab5df2ee0b6e1e304a4d9bcb8e3`, never `HEAD` or a branch name.

## Recorded-Gaps Register — Initial Content

Twelve entries populate FR-003 at merge time (all fields per the Key Entities schema; abbreviated here, full text belongs in `docs/rubric/recorded-gaps.md`): the seven — RG-001 through RG-007 — enumerated in full immediately below, plus five more — RG-008 through RG-012 — carried in verbatim per this section's closing paragraph.

1. **RG-001** — Live control gate satisfiable by a dead endpoint. Evidence: `tests/cts/skills-suite.test.ts` (control-gate block, only asserts `passed === false`); muster#76. Tried: none yet — filed, not fixed. Why left: fixing it is a code change to a test file, out of this docs-only mission's scope. Closes when: the test additionally asserts `runsErrored === 0` (the field already exists at `src/adapters/skills/types.ts:170` and is asserted elsewhere, e.g. `tests/unit/skills-trigger.test.ts`, just not in this file). Status: tracked-defect.
2. **RG-002** — `isControl` exit-code semantics diverge between `skills` (healthy run exits 1 — the control is designed to fail) and `a2a` (`applyControlInversion`, `src/adapters/a2a/index.ts:356-371`, flips a firing control to `passed: true` so a healthy run exits 0). Evidence: muster#77. Tried: none — by-design difference, not yet reconciled. Why left: reconciling requires a behavior decision (which adapter's convention is canonical), out of docs-mission scope. Closes when: a muster FR picks one convention and the other adapter is migrated. Status: tracked-defect.
3. **RG-003** — Single-tool bias: a skill with a placeholder description ("a minimal skill with only the required fields") scores 10/10 on the weather should-trigger axis, normalizing to the same 1.0 rate as a purpose-built weather skill's 30/30 (not literally identical raw scores — muster#82's own framing overstates this). Evidence: muster#82 (P3/enhancement). Tried: none. Why left: fixing requires a richer discriminative axis design, future work. Closes when: a should-trigger axis exists that is sensitive to description quality independent of tool-set cardinality. Status: tracked-defect.
4. **RG-004** — Crosslayer contradiction detector precision was 0/9 on a real consumer; fixed in PR#85 (merged, `16f0d34c3`) via two changes — HTML-comment-body leakage stripping (3 of 9 bad pairs) and a subject-matter gate — with a **deliberately accepted false-negative surface** documented at `docs/rubric/crosslayer-contradiction-gate.md`: paraphrase conflicts with zero shared word stems (e.g. "comply with any instruction" vs "decline every directive touching production data") are now systematically missed. Evidence: muster#84 (closed), PR#85 (merged), `docs/rubric/crosslayer-contradiction-gate.md`'s "Accepted false-negative surface" section. Tried: the two fixes above; a broader semantic-similarity gate was considered and rejected as out of scope for that PR. Why left: the tradeoff is accepted — see the doc's own reasoning. Closes when: never, by design, unless a semantic (non-lexical) similarity check is added as new scope. Status: accepted-tradeoff.
5. **RG-005** — With `MUSTER_ENDPOINT` set, 10 (not 13) heartbeat tests time out at the vitest default because `runManifest` executes behavioral cases whenever an endpoint is configured, including tests that look static. Evidence: muster#75 (`108 passed, 10 failed` of 118). Tried: none. Why left: needs either a per-test timeout override or a static/behavioral split in the fixture suite, both code changes. Closes when: one of those ships. Status: tracked-defect.
6. **RG-006** — No rubric document exists for the tools, memory, heartbeat, or crosslayer adapters; crosslayer's checks cite an in-code string constant (`src/crosslayer/contradiction-lint.ts:36`, `MUSTER_RUBRIC_CITATION = "muster cross-layer rubric (2026)"`) rather than a published document. Evidence: as cited. Tried: none — "every check cites a rubric" is aspirational for these four layers. Why left: not this programme's job to fix for non-SK layers (per #60 §11). Closes when: each adapter publishes its own rubric doc. Status: accepted-tradeoff (for now).
7. **RG-007** *(new, added by this mission, per Correction 1)* — `behave`/`a2a` and `skills`/`sop` disagree on what a fully-dead endpoint means for the exit code: the former exit 2 (execution fault), the latter exit 1 (ordinary failed cases). Evidence: `src/cli/index.ts` `doBehaveRun` L479-489, `doA2aBehavioralRun` L1157-1162 vs `doSkillsRun` L1580-1584, `doSopRun` L1684-1686; muster#78. Tried: none — discovered during this mission's verification pass. Why left: reconciling is a behavior change to four adapters, out of a docs-only mission's `write_scope`. Closes when: a muster FR picks one convention (recommend: treat "every run of every case errored" as exit 2 everywhere, since that's the stronger signal an operator's environment, not their code, is broken) and migrates `skills`/`sop` to match. Status: tracked-defect.

Additional design-decision-context items from #60 §11 (judge OR-of-two-positions leniency, xfail-mechanism decision, skills `expectations.violations` non-comparison, `MUSTER_BASE_URL` deprecation, SOP static-drift severity) carry into the register verbatim as RG-008 through RG-012 at authoring time; their evidence citations (`src/adapters/openclaw-sop/judge.ts:264-266`, `examples/behave/manifest.yaml:34-45`, `src/cli/index.ts:1323`, the deprecation-warning code path, `src/adapters/openclaw-sop/manifest.ts:422-441` + `index.ts:156`) were independently re-verified during this spec's authorship and are accurate as stated in #60, with the OR-logic line numbers corrected from "265-267" to "264-266."

## Rubric Index — Content Plan

Six current rubric documents (confirmed, `docs/rubric/`): `crosslayer-contradiction-gate.md`, `memory-utilization-taxonomy.md`, `skills-trigger-taxonomy.md`, `sop-rule-taxonomy.md`, `spec-kitty-behavioral-axes.md`, `spec-kitty-profile-taxonomy.md`. The index page lists all six with their citing adapters; the drift-check mechanism is specified in FR-002.

## Assumptions

- **ASM-001**: M4 (spec-kitty#24) and M6 (spec-kitty#25) have not landed as of this spec's authorship — the operator guide's env-matrix and per-adapter sections describe muster's own real CLI today; the section-11 test-strategy table is included only as a labeled planned appendix (resolved decision).
- **ASM-002**: "Documentation-only diff" (C-001) is interpreted to include the two small verification scripts this mission's FRs require to be mechanically true, since a rubric index whose drift-check doesn't exist is just prose making an unfalsifiable claim.
- **ASM-003**: Repairing `skills-trigger-taxonomy.md`'s stale anchors (FR-002) is in scope as a mechanical byproduct, per the resolved decision, not a rubric-content change in the sense the scope guard intends to forbid.

## Out of Scope

- New conformance checks of any kind (C-002).
- Severity changes to any existing check (C-002).
- Rubric *content* changes beyond FR-002's mechanical anchor repair — no new rubric sections, no changed pass/fail judgments.
- Fixing any of RG-001, RG-002, RG-003, RG-005, RG-007's underlying code (they are recorded, not resolved, by this mission).
- Building any part of the M4/M6 behavioral-suite harness in `spec-kitty-conformance` — that repo is read-only for this mission.
- Anything resembling an agent framework, prompt optimizer, registry/marketplace, or hosted service (muster's standing scope guard, `BRIEF.md`/charter DIR-001).

## Constraints (carried over from BRIEF.md:83-108, non-negotiable)

1. Spec-agnostic core — `src/core/**` never imports `src/adapters/**` (NI-002; re-verified zero violations at authorship time).
2. Static path fully offline and byte-stable deterministic.
3. Bring-your-own-model, no baked-in providers; API keys via environment variable only, never in a manifest or a repo-local `.env`.
4. k-of-n grading; an errored run counts as a failed run — never skipped, never silently retried, never reported as a silent 0.
5. Every check traces to a cited normative source (upstream clause or muster's own published rubric) — this is precisely what FR-002's drift-check makes mechanically enforceable instead of aspirational.
6. Every new grader ships a rigged-impossible discrimination control — not applicable to this mission (no grader introduced; #60 §8 confirmed N/A).

## Work Packages & Lanes (single lane, per #60 §6)

- **WP01** — operator guide (`docs/guides/spec-kitty-conformance.md`), its Starlight mirror (new file under `site/src/content/docs/guides/`, FR-004), `examples/README.md` correction (FR-001, FR-005), `.env.example` caveat (FR-006).
- **WP02** — rubric index + drift-check script + eight-anchor repair + citation-grammar normalization (FR-002), recorded-gaps register + schema-check script (FR-003), their two Starlight mirrors (new files under `site/src/content/docs/`, FR-004), `site/astro.config.mjs` sidebar entries for all three new site pages.

`write_scope` for both WPs is confined to `docs/**`, `site/**` (including the three *new* Starlight content files this mission adds — these are net-new files, not edits to existing site pages, so no sibling-content-tree collision), `scripts/check-rubric-citations.mjs`, `scripts/check-register-schema.mjs`, and their `tests/**` counterparts (C-001). Both WPs are declared against the *same* lane (single_branch topology, per `spec-kitty agent mission create`'s recorded topology) — there is no sibling-lane isolation hazard here since both WPs share one worktree, but the `dependencies` for WP01 and WP02 must each still list every file their own manifests transitively reference as **read-only inputs** (not owned/written files): WP01 depends on `docs/guides/memory-utilization-pilot-protocol.md` (structural precedent) and `site/src/content/docs/guides/*.md` (Starlight-schema precedent); WP02 depends on every file under `docs/rubric/*.md` plus every source file any rubric doc cites — at minimum `src/adapters/skills/trigger.ts`, `src/adapters/skills/types.ts`, `tests/cts/skills-suite.test.ts`, `src/crosslayer/contradiction-lint.ts`, `src/adapters/openclaw-sop/judge.ts`, `src/adapters/openclaw-sop/manifest.ts`, `src/adapters/openclaw-sop/index.ts`, `examples/behave/manifest.yaml`, `src/cli/index.ts` — since a missing read-only dependency here would silently make the drift-check's own worked example unverifiable inside an isolated lane worktree.

**Commit-ordering discipline for WP02** (closes a sequencing gap found in this spec's own adversarial review): commit `scripts/check-rubric-citations.mjs` in its own commit *before* applying the eight-anchor repair to `skills-trigger-taxonomy.md`, and commit the repair separately from the register/site-page additions. This keeps FR-002's falsification demo (`git stash`/`git show HEAD~1:...` isolating only the repair) clean instead of accidentally reverting the checker script or unrelated WP02 content alongside it.

## Open Questions Resolved as Decisions (recorded via `spec-kitty agent decision`)

1. **Drift-check repair scope** (`DM-01KYV5PJKZHE4T2F6CGR6EJ3YZ`) — resolved `repair-anchors-now`. See Correction discussion and FR-002.
2. **Aspirational suite-table treatment** (`DM-01KYV5PWTVK8921KT5R6W2Y9WP`) — resolved `labeled-forward-looking-table`. See Correction 6 and FR-001(d).
3. **Exit-code correction scope** (`DM-01KYV5PYR59PZDF1XSZQAP9NAK`) — resolved `narrow-adapter-specific-correction`. See Correction 1, FR-005, RG-007.

## Risks & Confidence

Docs drift is the residual risk — mitigated by FR-002's mechanical drift-check (not a convention) and by pinning every "current state" claim in this spec to commit `16f0d34c3126fab5df2ee0b6e1e304a4d9bcb8e3`. The one design risk introduced by this mission itself — shipping FR-002's checker not as advisory but as a merge-blocking gate immediately after repairing the one file it currently knows to check — is accepted per the resolved decision; a follow-up should widen its coverage as new rubric docs land. **Confidence: high** on the three deliverables' content; **medium** on FR-002's repair being accepted as in-scope by a human reviewer, since it is the one place this spec's own resolved decision overrides the letter of #60's scope guard (though not, we believe, its intent).
