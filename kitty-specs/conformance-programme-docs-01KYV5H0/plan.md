# Implementation Plan: Conformance Programme Docs

**Branch**: `kitty/mission-conformance-programme-docs` | **Date**: 2026-07-31 | **Spec**: `kitty-specs/conformance-programme-docs-01KYV5H0/spec.md`
**Input**: Feature specification (checklist complete, zero `[NEEDS CLARIFICATION]` markers, three decisions resolved: `DM-01KYV5PJKZHE4T2F6CGR6EJ3YZ`, `DM-01KYV5PWTVK8921KT5R6W2Y9WP`, `DM-01KYV5PYR59PZDF1XSZQAP9NAK`)
**Grounded against**: `garrison-hq/muster` @ `407860e91` (this mission's own branch tip). `spec.md` pins every "current state" claim to commit `16f0d34c3` — a sibling mission (`skills-behavioral-enablement-01KYJFAC`) merged into `main` between that commit and this branch's tip, touching `src/adapters/skills/trigger.ts`, `src/adapters/skills/types.ts`, `tests/cts/skills-suite.test.ts`, and creating `docs/rubric/skills-trigger-taxonomy.md` — several of the exact files this spec's FR-002 discusses. Every load-bearing factual claim in `spec.md` was independently re-verified against `407860e91`, not re-derived from the spec's own citations. Findings below; only two are worth a reader's attention, the rest confirm the spec is still accurate at the later commit.
**Cross-repo evidence**: `/home/jeroennouws/dev/spec-kitty-conformance` and `/home/jeroennouws/dev/garrison-hq/muster-action` were read-only inspected for this plan (never mutated); `/home/jeroennouws/dev/spec-kitty` was not touched.

## Summary

Three hand-authored Markdown deliverables over already-shipped subject matter (operator guide, rubric index, recorded-gaps register), each mirrored into Starlight, plus two small offline Node scripts that make two of the three deliverables mechanically self-checking instead of aspirational prose. No behavioral code changes. The mission's actual engineering content is the two scripts (`scripts/check-rubric-citations.mjs`, `scripts/check-register-schema.mjs`) and the eight-anchor citation repair they make necessary and possible; everything else is direct, low-risk authoring against material this plan (and the spec before it) already re-verified against real source.

Two work packages, both against the same shared lane/worktree (`single_branch` topology — confirmed via `meta.json`), sequenced WP01 → WP02 because of one genuine same-file coupling (`site/astro.config.mjs`'s sidebar array — see Hazard 2). This is not a parallelism opportunity to force; the coupling is small and the sequencing resolves it cleanly.

## Grounding corrections relative to the spec (read before assigning WPs)

Re-verification found the spec's substantive claims almost entirely intact at `407860e91`. Two findings matter; the rest are here for completeness so nobody re-derives them mid-implementation.

1. **Confirmed, no change**: the exit-code contract (Correction 1) is exactly as the spec states. At `407860e91`: `doBehaveRun` (`src/cli/index.ts:478-487`) and `doA2aBehavioralRun` (`:1157-1161`) both return `2` on "every run of every case errored," each with the cited `contracts/cli.md`-referencing comment intact; `doSkillsRun` ends `:1584` with `return ok ? 0 : 1;` and `doSopRun` ends `:1685` with `return report.passed ? 0 : 1;` — neither has a total-endpoint-failure special case. Line numbers drifted by at most one or two lines from the spec's `16f0d34c3` citations; substance is identical. FR-001(c)'s per-adapter table and RG-007 need no rewording.

2. **Confirmed, no change, and this is good news for sequencing**: FR-002's eight-anchor repair inventory in `docs/rubric/skills-trigger-taxonomy.md` is still the file's live, current, unrepaired state at `407860e91` — it was **not** silently fixed by the sibling mission that touched the same underlying source files. Every one of the spec's eight proposed replacement locations was independently re-verified byte-exact: `gradeAxis` at `trigger.ts:237`; `console.warn` at `trigger.ts:472-473`; the SC-004 static-mode `describe` block at `tests/cts/skills-suite.test.ts:244` (not 231 — 231 is the unrelated `SC-006` block); its assertion at `:311-312`; the live-model `describe` block at `:325`, closing at end-of-file (~438/439); its assertion at `:421`/`:424`; and the literal string `"SC-004"` occurring at lines `10, 244, 312, 421, 424` (not 231/297/390 — the doc's current claim about lines 231/297/390 is not merely stale, it is wrong, exactly as the spec says). **Consequence**: the drift-check's falsification demonstration needs no synthetic reconstruction of a "pre-repair" file — the file sitting in the tree right now *is* the pre-repair state. WP02's commit-ordering discipline (script committed before repair) is what preserves this fact as a demonstrable artifact rather than an assumed one; see "Drift-check falsification sequencing" below.

3. **Minor, flagged for operator confirmation, no FR change recommended**: `docs/rubric/spec-kitty-behavioral-axes.md` also has one incidental bare-style citation (line 21: `"(lines 62-67 of that file)"`, referring to `src/adapters/openclaw-sop/judge.ts`) that the spec's "only `skills-trigger-taxonomy.md` mixes styles" framing doesn't mention. It's a single occurrence in an otherwise prose-only file, not the pervasive three-line mixing pattern `skills-trigger-taxonomy.md` has — so it doesn't change FR-002's repair-inventory scope. But FR-002's drift-check parser only understands the canonical `` `symbol` (`file:line`) `` grammar; this one bare-style line will be **silently invisible** to it (not flagged as an error, just never checked) unless the parser is deliberately documented as citation-grammar-scoped. **Plan decision**: WP02 does **not** edit `spec-kitty-behavioral-axes.md` (touching a rubric file no FR names would be an unlicensed content edit under C-002, even though the edit itself would be as mechanical as the licensed repair) — instead, `check-rubric-citations.mjs`'s own header comment must state explicitly that it only parses the canonical grammar and that pre-existing bare-style citations elsewhere in the corpus are a known, undetected blind spot, not a silent false pass. This keeps the tool honest about its own coverage without expanding this mission's write scope. Flagged for operator override if they'd rather fold the one-line fix into FR-002 formally.

4. **Cross-repo fact reversal since the spec's pinned commit — flagged for operator confirmation, no FR change recommended.** Spec.md's Correction 6 states `conformance/skills/manifest.yaml` (in `/home/jeroennouws/dev/spec-kitty-conformance`) "governs 1 fixture skill, not 53." At `407860e91`'s point in time, that file now governs **53 real skill fixtures plus 1 negative control** (`control-name-mismatch`) — added by a since-merged sibling mission (`sk-skills-static-conformance-01KYG7GE`, that repo's own commit `08930a32b`) that landed after the spec's pinned `16f0d34c3` reference point. The other five `conformance/*` non-existence claims in the same correction (`skprofile`, `doctrine/*.yaml`, `crosslayer/manifest.yaml`, `behavioral/profiles|directives/*.yaml`, `skills/behavioral-manifest.yaml`) are all still confirmed absent — the crosslayer suite itself remains genuinely unimplemented (`crosslayer-composition-suite-01KYJA33/status.json` in that repo still shows empty `work_packages`). This does not reopen Decision 2 (`labeled-forward-looking-table`) — five of six rows in the forward-looking appendix are still exactly as aspirational as the spec says. **Plan decision**: WP01 renders the one changed row (the skills-behavioral-manifest path) with its own distinct label — "exists today in a sibling repo, not a muster-repo example, not yet wired into `examples/**`" — rather than grouping it under the same "planned, pending M4/M6" banner as the other five, which remain genuinely nonexistent. This is a wording precision inside FR-001(d)'s existing scope (the decision already requires the appendix to be honest about what's real), not new scope — flagged because it is the one place where re-verifying at a later HEAD than the spec's pinned commit changes what "accurate" means, and an implementer who trusts the spec's citation without re-checking would write something now-false.

5. **A real defect found in `spec.md` itself, not superseded by anything — this needs an operator decision before WP02 is finalized.** `SC-002` states the register must contain **"exactly 7 entries."** But the "Recorded-Gaps Register — Initial Content" section that SC-002 is checking against explicitly instructs, in its own closing paragraph, that five *additional* entries — "judge OR-of-two-positions leniency, xfail-mechanism decision, skills `expectations.violations` non-comparison, `MUSTER_BASE_URL` deprecation, SOP static-drift severity" — "carry into the register verbatim as **RG-008 through RG-012** at authoring time." That is not optional color; it names concrete IDs, states their evidence citations, and says they must be authored. FR-003's own body text is consistent with the fuller reading ("containing **at minimum** the seven entries enumerated below" — "at minimum" permits more), but SC-002 as literally written ("exactly 7") is unsatisfiable at the same time as the RG-008–012 instruction: a register with 12 entries fails SC-002's literal exit criterion; a register with 7 entries silently drops an explicit, ID'd, evidence-cited authoring instruction. The checklist's own "Success criteria are measurable" pass did not catch this because it checked that each SC *has* a count, not that the counts agree with each other. **Plan decision, taken here rather than silently picking one interpretation**: WP02 authors **12 entries** (RG-001–007 per the initial-content list, RG-008–012 per the explicit carry-in instruction), because that is what FR-003's body text and the register's own content-plan paragraph substantively require, and because the task brief that opened this mission already frames the register as "7 initial entries + 5 carried from #60" — 12, not 7. **`scripts/check-register-schema.mjs` is built to assert `entries.length >= 7` (matching FR-003's own "at minimum" wording) rather than hardcoding `=== 7` or `=== 12`**, so the script's own behavior doesn't silently encode a guess about which of the spec's two contradictory numbers is "right." This is flagged loudly, not fixed silently: **SC-002's wording in `spec.md` needs a follow-up correction to "exactly 12 entries" (or "at least 12")** — out of scope for this plan to edit directly, since `spec.md` is not a plan-phase artifact, but the operator should not let this ship to accept-gate review with SC-002 still literally reading "exactly 7" while the register in fact contains 12, or a literal-minded reviewer will flag it as a failed success criterion when it is actually the spec text that is wrong.

6. **Minor, no action needed**: `.github/workflows/site.yml` ("Deploy site") confirmed real — `working-directory: site`, `run: pnpm build` — FR-004's CI claim is accurate as written.

## Charter Check

*Gate source: `BRIEF.md:83-96` (six carried-over constraints), re-confirmed directly against current text, matching spec.md's own quotation.*

| Charter gate | Status | Note |
|---|---|---|
| Spec-agnostic core untouched | PASS | No file under `src/core/**` is in either WP's `write_scope`; C-003 re-verifies NI-002 as a standing regression guard, not because this mission risks it |
| Static path offline + byte-stable | PASS | This mission adds no runtime code path; C-004 extends the same discipline to the two new scripts (must run offline, byte-stable output) |
| BYOM, no baked-in providers, key via env only | PASS | FR-006's caveat is a direct restatement/reinforcement of this constraint for documentation purposes; no new CLI flag or provider added |
| k-of-n grading; errored run = failed run | PASS, unaffected | No grader code touched; C-002 forbids any severity/judgment change |
| Every check traces to a cited normative source | PASS — this mission **is** the enforcement mechanism | FR-002's drift-check makes this constraint mechanically checkable for the first time instead of aspirational; C-006 self-applies the same discipline to this spec/plan's own citations (pinned to `16f0d34c3`, never `HEAD`) |
| Discrimination control per new grader | N/A | No new grader introduced (spec's own #60 §8 confirmation, re-confirmed here: no grading logic anywhere in this mission's scope) |

No charter violations. No new runtime dependency (both scripts are plain Node/fs/regex, no new `package.json` entry expected — confirm at implementation time that `js-yaml` or similar isn't silently pulled in for parsing `docs/rubric/*.md`; front-matter-free Markdown parsing should not need a YAML parser at all, only plain-text `` `symbol` (`file:line`) `` regex extraction).

## Hazard 1 — enforcement outside every lane's `write_scope`

`tests/unit/invariants.test.ts` (NI-001/002/003) is the one enforcement file outside both WPs' `write_scope` that touches this mission at all:

- **NI-001** (secret-pattern scan, whole-tree walk minus `BASE_EXCLUDES = {node_modules, .git, dist, .worktrees, .kittify}`, confirmed does **not** consult `.gitignore`): this is exactly what FR-006's caveat documents. No special handling needed beyond FR-006 itself — none of this mission's new content should contain secret-shaped strings, and C-005 forbids creating any `.env` file that could trip it.
- **NI-002** (import-shaped scan of `src/core/**`): not implicated, no file under `src/core/` is touched. C-003 re-verifies as a standing regression guard.
- **NI-003** (fetch-isolation allowlist): not implicated — the two new scripts make zero network calls by design (C-004); confirm at implementation time that neither script contains a literal `fetch(` call, so this invariant's regression surface stays at zero regardless.

No enforcement file outside either WP's `write_scope` blocks this mission except **this mission's own new gate** (C-001's diff-scope check) — which is the one enforcement mechanism this mission itself introduces, not a pre-existing one it must dodge.

## Hazard 2 — same-file coupling between WP01 and WP02 (`site/astro.config.mjs`)

FR-004 requires three new Starlight-schema pages, and `site/astro.config.mjs`'s `sidebar` array must reference all three. WP01 owns one new page (the operator-guide mirror); WP02 owns two (rubric-index mirror, recorded-gaps mirror). Both WPs therefore need to edit the same `sidebar` array in the same file. Because `topology: single_branch` means both WPs share one worktree/lineage (confirmed via `meta.json` — no isolated-lane hazard of the "sibling can't see this file" kind), this is **not** a lane-isolation problem — it is an ordinary same-file, same-branch sequencing problem, resolved by declaring a real dependency rather than letting two edits race:

- **WP01 adds exactly one sidebar entry** (its own new guide-mirror page) and confirms `cd site && pnpm build` exits 0 with only that one new page present — this is WP01's own slice of FR-004, verified in isolation before WP02 exists.
- **WP02 depends on WP01** specifically for this file: WP02 starts from a tree where WP01's sidebar entry is already committed, and *appends* its own two entries (rubric index, recorded-gaps) rather than re-authoring the array. WP02's own `pnpm build` check then covers all three pages at once, which is also SC-004's actual acceptance point (the built nav must contain all three).
- **Falsification, required as literal evidence, not asserted**: per FR-004's own falsification condition ("a sidebar entry with no backing content file... is itself this FR's own falsification condition"), WP02 must, at some point before finalizing, deliberately add one phantom sidebar entry pointing at a slug with no backing file, run `pnpm build`, and confirm it fails (non-zero exit, Starlight's link checker naming the missing page) — then remove the phantom entry and re-run to confirm a clean 0. This proves the build gate actually catches the failure mode FR-004 exists to prevent, rather than trusting that "Starlight has a link checker" without ever seeing it fire.

## Falsification-evidence discipline (applies to every WP below)

This programme has shipped nine vacuous verification commands to date, every one caught only by constructing the rejection case and running it. Accordingly, **no FR/C below is considered satisfied by a passing run alone** — each WP's acceptance evidence must include the rejection case actually failing, not merely a claim that it would. Concretely, per requirement:

- **FR-001 / C-001 doc-test discipline**: the guide's own stated verification command (extract every runnable command block, execute each, compare exit codes) is itself the falsification mechanism — there is no separate script. WP01's acceptance evidence must show the **contrast case** literally, not just the passing case: the same "unreachable endpoint" condition run against both `skills run` (expect exit 1) and `behave run` (expect exit 2) in the same evidence block, so the per-adapter table is proven by an actual observed divergence, not asserted from the spec's prose.
- **FR-002**: the pre-repair run of `check-rubric-citations.mjs` against the live, still-broken `skills-trigger-taxonomy.md` (exit 1, naming all eight anchors) is mandatory acceptance evidence, captured verbatim — see "Drift-check falsification sequencing" below. Additionally, the script's own test suite must include a synthetic fixture proving the edge case fires: a rubric file under `docs/rubric/*.md` with zero index entries pointing at it must make the checker exit 1 and name that file specifically (not just a citation-resolution failure) — this edge case is explicit in spec.md's own Edge Cases section and is easy to build a checker that silently never checks (index-completeness is a different code path than per-file anchor resolution).
- **FR-003**: `check-register-schema.mjs`'s test suite must include a synthetic fixture with one entry missing a required field (e.g. no `closes-when`) and confirm the script exits 1 and names that specific entry/field — run against the real, complete 12-entry register, exit 0 alone is not sufficient evidence per this mission's own standing lesson.
- **FR-004**: covered by Hazard 2's phantom-sidebar-entry falsification, required as literal evidence.
- **FR-005**: acceptance evidence must show the corrected `examples/README.md` no longer contains **any** unscoped "exit 2" claim — `command grep -n "exit 2" examples/README.md` must show only occurrences that are explicitly adapter-scoped (i.e., appearing inside prose naming `behave`/`a2a` specifically), with a manual line-by-line confirmation, not just a check that new correct text was added. This directly targets the "leaves siblings stale" failure mode — correcting the skills row's Mode column without checking every other "exit 2" mention in the same file for the same blanket-claim defect would be exactly that failure mode repeating.
- **FR-006**: falsification is a human-review checklist item, stated explicitly rather than left implicit: confirm the added caveat does **not** claim NI-001 "enforces" `.env` safety (the exact inversion muster#79 flags) — the reviewer must read the caveat text against `tests/unit/invariants.test.ts`'s actual behavior and say so explicitly in the WP's evidence, not merely run a grep for the string "NI-001" (grep confirms presence, not correctness — this is the FR's own stated caveat about itself).
- **C-001**: before finalizing, run the diff-scope grep against a tree with one deliberately-staged out-of-scope change (e.g., a scratch touch to `README.md`, never committed) and confirm the check emits output and would exit non-zero for that state, then revert the scratch touch and re-run to confirm the real, in-scope diff exits 1 cleanly. This proves the grep pattern isn't accidentally matching everything or nothing.
- **C-003**: confirm the exact `command grep -rn "from ['\"].*adapters" src/core/` pattern would actually catch a violation — informally test it against a throwaway string in a scratch file outside `src/core/` first if there's any doubt about the regex, before trusting a clean "no matches" result on the real, untouched tree as meaningful.
- **C-004**: run each script twice from the **same** working directory and also once from a **different** working directory (or with `docs/rubric/*.md` file-listing order perturbed, e.g. via a differently-cased filesystem walk) to confirm stdout is identical regardless of directory-iteration order — a script that happens to sort filenames will pass a naive "run twice in a row" check even if it never explicitly sorts, so the plan requires proving order-independence, not just repeat-run stability.

## Drift-check falsification sequencing (FR-002's centerpiece)

The pre-repair state that must be demonstrated failing is not hypothetical and does not need to be constructed — it is the file sitting in the tree at this branch's current HEAD (grounding correction 2 above). The sequencing that keeps this demonstrable, matching spec.md's own commit-ordering instruction:

1. **Commit A** — add `scripts/check-rubric-citations.mjs` and its test suite. Do **not** touch `docs/rubric/skills-trigger-taxonomy.md` in this commit. Run the script against the tree as it stands (still containing all eight stale/wrong anchors): expected exit `1`, output naming all eight anchors described in FR-002's repair inventory. **This run's stdout is captured verbatim as WP02's first piece of acceptance evidence** — not narrated, not summarized as "the script correctly detects the pre-existing issue," but pasted as an actual transcript, per this programme's own "evidence must be executable, not narrated" rule.
2. **Commit B** — apply the eight-anchor repair and the three-line grammar normalization to `docs/rubric/skills-trigger-taxonomy.md` **only**. Nothing else changes in this commit. Re-run the same script: expected exit `0`. `git diff HEAD~1..HEAD -- docs/rubric/skills-trigger-taxonomy.md` must show **only** citation-line changes (the eight pointer corrections plus the three bare-to-canonical grammar rewrites) — no adjacent prose, threshold, or severity-judgment text changed, which is the literal, checkable form of C-002's "no rubric content changes beyond the mechanical anchor repair" constraint. This diff is captured as evidence too, not just claimed clean.
3. **Commit C** — everything else: `docs/rubric/index.md`, `docs/rubric/recorded-gaps.md` (12 entries per grounding correction 5), `check-register-schema.mjs` and its tests, both remaining Starlight mirror pages, and WP02's two sidebar-array entries. Keeping this separate from Commit B means `git show HEAD~1:docs/rubric/skills-trigger-taxonomy.md` (run against Commit C) still isolates exactly the repair, uncontaminated by unrelated additions landing in the same commit — the exact isolation property spec.md's FR-002 falsification note requires.

Reviewer note: if Commit A and Commit B are accidentally squashed together (or reordered) before merge, the falsification demonstration is destroyed — the reviewer would only ever see a green checker with no evidence it can fail. This is worth a standing instruction to whoever implements WP02: preserve these as separate commits through to merge, don't squash locally "for tidiness."

## Work Packages

### WP01 — Operator guide, `examples/README.md`, `.env.example`, one Starlight mirror

**FR/C coverage**: FR-001, FR-005, FR-006, FR-004 (one-third: the operator-guide mirror + its own sidebar entry), C-001 (partial — this WP's own diff slice), C-005 (no `.env` created), C-006 (citations pinned to `16f0d34c3`)

**`write_scope`**:
- `docs/guides/spec-kitty-conformance.md` (new) — mirrors `docs/guides/memory-utilization-pilot-protocol.md`'s section structure (numbered sections 1–N, ending in a "Normative sources" section — confirmed precedent: that file's own sections are "1. Why a pilot is needed" … "7. Normative sources"). Covers: (a) every real, shipped CLI suite (`check`, `resolve`, `cts run`, `behave run`, `memory run`, `heartbeat run`, `a2a run`, `crosslayer run`, `skills run`, `sop run`, `tools run`) against Ollama/DGX, NIM, and a hosted OpenAI-compatible endpoint; (b) the full env-var matrix (`MUSTER_ENDPOINT` canonical, `MUSTER_BASE_URL` deprecated-through-v1.2.x alias, citing the CLI's own deprecation-warning code path); (c) the per-adapter exit-code table (confirmed accurate per grounding correction 1 — no wording change from spec.md needed); (d) the section-11 test-strategy table as a clearly labeled "PLANNED — pending spec-kitty#24/#25" appendix, per Decision 2, with the one row affected by grounding correction 4 (skills-behavioral manifest) labeled distinctly from the other five still-genuinely-absent rows, and zero verification commands attached to any appendix row.
- `site/src/content/docs/guides/spec-kitty-conformance.md` (new) — Starlight mirror, `title`/`description` frontmatter matching the `static-conformance.md` precedent exactly (confirmed schema: plain `title` + `description`, no custom fields).
- `site/astro.config.mjs` — add **one** sidebar entry (this WP's own guide mirror) to the `Guides` section of the `sidebar` array, alongside `static-conformance`/`behavioral-conformance`/`reference-resolution`. Does not add WP02's entries (see Hazard 2).
- `examples/README.md` — correct the skills row's Mode column (currently `static-only` → reflect its two behavioral cases) and rewrite line 5's blanket exit-code claim to reference the per-adapter table in FR-001(c) rather than restating a single rule. Per Decision 3 (narrow-adapter-specific-correction): this is **not** a blanket rewrite — `behave`/`a2a`'s real, deliberately-coded exit-2 behavior on total endpoint failure is preserved and cited, not erased. Sweep the whole file for every other "exit 2" mention per the falsification-evidence discipline above (leaves-siblings-stale risk).
- `.env.example` — add the NI-001 caveat: scanning covers the whole working tree including gitignored files (confirmed: `BASE_EXCLUDES` does not consult `.gitignore`), so a real repo-local `.env` will trip the secret-pattern check; credentials must come from shell-exported env vars, never a committed or gitignored-but-present `.env` at repo root. Keep the existing `--env-file` line (do not delete it — that would be a different documentation lie, per FR-006's own framing).

**Depends on**: none — first WP, per spec.md's own listed order and per Hazard 2's resolution (WP02 depends on this one, not the reverse).

**Acceptance evidence** (rejection cases included per the falsification-evidence discipline section above):
```bash
# FR-001(a) — no env set, skills run: expect skipped:true, exit 0
node dist/cli/index.js skills run examples/skills/manifest.yaml; echo "exit=$?"

# FR-001(c) — the actual per-adapter divergence, both sides observed in the same evidence block
MUSTER_ENDPOINT=http://unreachable-host-for-doc-test:1/v1 node dist/cli/index.js skills run examples/skills/manifest.yaml
echo "skills_exit=$?"   # expect 1
MUSTER_ENDPOINT=http://unreachable-host-for-doc-test:1/v1 node dist/cli/index.js behave run examples/behave/manifest.yaml
echo "behave_exit=$?"   # expect 2 — the contrast against skills_exit=1 IS the proof, not a restated claim

# FR-001 doc-test discipline — every runnable command block in the published guide, extracted and executed verbatim
for cmd_file in $(extract-fenced-bash-blocks docs/guides/spec-kitty-conformance.md); do
  bash "$cmd_file"; echo "block_exit=$?"
done   # each must match its stated inline exit code; any mismatch or reference to a non-existent path fails review

# FR-005 — corrected doc matches actual behavior, and no stale blanket claim survives elsewhere in the file
node dist/cli/index.js skills run examples/skills/manifest.yaml; echo "exit=$?"   # expect 0 (unset)
MUSTER_ENDPOINT=http://unreachable-host-for-doc-test:1/v1 node dist/cli/index.js skills run examples/skills/manifest.yaml
echo "exit=$?"   # expect 1
command grep -n "exit 2" examples/README.md   # manual review: every remaining hit must be explicitly adapter-scoped to behave/a2a

# FR-006 — presence check only proves presence, not correctness (reviewer must read the wording)
command grep -c "NI-001" .env.example   # non-zero; followed by required manual confirmation against
                                          # tests/unit/invariants.test.ts's real BASE_EXCLUDES/walk() behavior

# C-005 — no .env created by this WP
git status --porcelain | command grep -x '.. \.env$'; echo "exit=$?"   # expect 1 (no match)

# FR-004 (this WP's slice) — build with only this one new page present
cd site && pnpm build; echo "build_exit=$?"   # expect 0

# C-001 (this WP's slice)
git diff --name-only <base>...HEAD | command grep -Ev '^(docs/|site/)'; echo "exit=$?"   # expect 1 (no output)
```

---

### WP02 — Rubric index, drift-check, eight-anchor repair, recorded-gaps register, schema-check, remaining Starlight mirrors, sidebar completion

**FR/C coverage**: FR-002, FR-003, FR-004 (remaining two-thirds), C-001 (full diff, both WPs combined), C-002, C-003, C-004, C-006

**Depends on**: WP01 — real dependency, not merge-convenience only (Hazard 2: `site/astro.config.mjs`'s `sidebar` array must already contain WP01's one entry before this WP appends its own two, or the array's edit history races within the shared single-branch lineage).

**`write_scope`**:
- `scripts/check-rubric-citations.mjs` (new) — parses every canonical-grammar `` `symbol` (`file:line[-line]`) `` citation from every file under `docs/rubric/*.md`, resolves the file, confirms the line range is in-bounds, confirms the named symbol/string literally appears within that range, and fails if any file under `docs/rubric/*.md` has zero index entries pointing at it. Exports its anchor-resolution logic as a reusable function (not CLI-entry-only), since `check-register-schema.mjs` is specified to reuse this exact logic for evidence-citation resolution — this module boundary is implicit in spec.md's FR-003 verification note and needs to be made explicit here so the two scripts don't duplicate parsing logic. Header comment documents the one known blind spot from grounding correction 3 (bare-style citations outside `skills-trigger-taxonomy.md` are invisible to this parser, not silently passed).
- `docs/rubric/skills-trigger-taxonomy.md` (edit) — the eight-anchor repair plus the three bare-to-canonical grammar rewrites (lines 175, 182, 186 in the current file), and nothing else. Landed in its own commit, after the checker script's own commit (see "Drift-check falsification sequencing").
- `docs/rubric/index.md` (new) — lists all six current rubric documents, each entry stating citing adapter(s)/check(s), per the Key Entities schema (`rubric-file`, `cited-by`, `citation-count`, `drift-check-status`).
- `docs/rubric/recorded-gaps.md` (new) — **12 entries** (RG-001–007 per the Initial Content list, RG-008–012 per the explicit carry-in instruction — see grounding correction 5). Every entry populated with all six schema fields (`id`, `title`, `evidence`, `what-was-tried`, `why-left`, `closes-when`, `status`), no bare titles.
- `scripts/check-register-schema.mjs` (new) — validates every entry has all six fields non-empty and every evidence citation resolves (reusing the anchor-resolution function above). Asserts `entries.length >= 7` (matching FR-003's "at minimum" wording), not a hardcoded `=== 7` or `=== 12`, per grounding correction 5's reasoning.
- `site/src/content/docs/rubric/index.md` (new) and `site/src/content/docs/rubric/recorded-gaps.md` (new) — Starlight mirrors, same frontmatter schema as WP01's.
- `site/astro.config.mjs` (edit) — append the two remaining sidebar entries (rubric index, recorded-gaps) to the array WP01 already extended.
- `tests/scripts/check-rubric-citations.test.ts` and `tests/scripts/check-register-schema.test.ts` (new directory — confirmed no existing convention for testing standalone repo-maintenance scripts anywhere in the tree; this mission establishes it). Each includes the rejection-case fixtures required by the falsification-evidence discipline section above (a rubric file with zero index entries; a register entry missing a required field).

**Acceptance evidence** (commit-by-commit, per the sequencing above):
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
# rejection case, run against the test-suite fixture, not the real register:
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

# FR-004 (this WP's slice) — full build, three pages present, plus the phantom-entry falsification (Hazard 2)
cd site && pnpm build; echo "build_exit=$?"   # expect 0, all three new pages in nav
# then, temporarily: add one phantom sidebar entry with no backing file, re-run, expect non-zero,
# then remove the phantom entry and re-run once more, expect 0 again — evidence for both states required

# C-001 — full mission diff, both WPs combined
git diff --name-only <base>...HEAD | command grep -Ev '^(docs/|site/|scripts/check-(rubric-citations|register-schema)\.mjs|tests/)'
echo "exit=$?"   # expect 1 (no output)
# rejection case: stage a scratch out-of-scope touch (never committed), confirm the same command
# emits output and would exit 0 for that state, then discard the scratch change

# C-003 — re-verify NI-002, unaffected by this mission
command grep -rn "from ['\"].*adapters" src/core/; echo "exit=$?"   # expect 1 (no matches)
```

## Dependency graph

```
WP01 (guide + examples + env.example + 1 mirror) ──> WP02 (rubric index + drift-check +
                                                              repair + register + schema-check +
                                                              2 mirrors + sidebar completion)
```

- `WP02.depends_on = [WP01]` — sole reason: shared edit to `site/astro.config.mjs`'s `sidebar` array (Hazard 2). No FR-content dependency exists between the two (FR-001/005/006 and FR-002/003 describe entirely separate subject matter); the dependency is purely the one shared file.
- No parallelism opportunity exists worth engineering here — both WPs are small, single-author-shaped units, and forcing a fully-parallel split would either duplicate the sidebar-array edit or require a second, artificial coordination point for no benefit, since `single_branch` topology already means one shared worktree regardless.
- **Merge order**: WP01 fully committed (guide, examples fix, env.example fix, one sidebar entry) before WP02 begins its own sidebar edit. Within WP02 itself, the three-commit sequence (script → repair → everything else) must be preserved through to merge — do not squash.

## Complexity Tracking

No new runtime dependency expected (both scripts are plain Node/fs/regex over Markdown text; confirm at implementation time that no YAML/Markdown parser package needs adding — the canonical citation grammar is a fixed-shape regex, not a general Markdown AST need). No new environment variable. No structural exception to the charter.

**Open items requiring operator confirmation before/while WP02 executes** (flagged here, not silently resolved):

1. **SC-002 vs. the RG-008–012 carry-in instruction is a genuine, unresolved contradiction in `spec.md`** (grounding correction 5). This plan proceeds on the fuller reading (12 entries, `>= 7` in the schema check) because it is what FR-003's body text and the register's own content-plan section substantively require, and matches the task brief's own "7 initial + 5 carried" framing — but `spec.md`'s SC-002 text itself needs a follow-up correction ("exactly 12," not "exactly 7") before this mission reaches its accept gate, or a literal-minded reviewer will flag a correctly-built register as failing a success criterion that is actually the one that's wrong. Recommend routing this back through `spec-kitty agent decision` or a direct `spec.md` edit before accept, not silently absorbing it into the plan the way this document has had to.
2. **`spec-kitty-behavioral-axes.md`'s one incidental bare-style citation** (grounding correction 3): left untouched by design (no FR names this file), with the checker's own header comment documenting the blind spot rather than silently passing it. Confirm or override.
3. **The skills-behavioral-manifest appendix row's changed status** (grounding correction 4): WP01 labels it distinctly from the other five genuinely-absent appendix rows rather than grouping it under the same "planned" banner. Confirm or override.
4. **Mission FSM/event-log lag** (same class of issue previously found and assessed on the `skills-behavioral-enablement` mission, not re-litigated in depth here): `spec-kitty next --mission conformance-programme-docs-01KYV5H0 --json` currently reports `mission_state: "not_started"` / `preview_step: "discover"` despite `spec.md`, the checklist, and all three decisions being complete and committed — `status.events.jsonl` has `SpecifyStarted` but no `SpecifyCompleted`, and now no `PlanStarted`/`PlanCompleted` either once this file lands. `spec-kitty doctor mission-state --audit --mission conformance-programme-docs-01KYV5H0 --json` confirms this mission's own artifacts are healthy (0 errors, 0 warnings, 4 benign `UNKNOWN_SHAPE` info findings on `meta.json` keys the doctor build doesn't recognize yet) — the desync is confined to the event-log/FSM projection, not the artifacts. Recommend the same mission-scoped remedy used before (`spec-kitty migrate normalize-lifecycle --mission conformance-programme-docs-01KYV5H0`, dry-run first), not a repo-wide `spec-kitty upgrade` — left to the operator's go-ahead, not executed here.
