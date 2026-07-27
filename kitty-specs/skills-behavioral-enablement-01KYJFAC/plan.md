# Implementation Plan: Skills Behavioral Enablement

**Branch**: `kitty/mission-skills-behavioral-enablement` | **Date**: 2026-07-27 | **Spec**: `kitty-specs/skills-behavioral-enablement-01KYJFAC/spec.md`
**Input**: Feature specification from `kitty-specs/skills-behavioral-enablement-01KYJFAC/spec.md` (post-review, remediated at `e3bd1434f`)
**Grounded against**: `garrison-hq/muster` @ `e3bd1434f` (this mission's branch tip), verified directly (not re-derived from the spec's own citations, several of which are noted stale below)

## Summary

`doSkillsRun` (`src/cli/index.ts:1320-1361`) unconditionally records every `type: "behavioral"`
case as `{ passed: true, skipped: true }` and never builds a client — confirmed still true at
this mission's current HEAD. This plan wires `runTriggerConformance`
(`src/adapters/skills/trigger.ts:353`) into `doSkillsRun`, resolves the `MUSTER_ENDPOINT` /
`MUSTER_BASE_URL` env-var split (confirmed live in two directions: the CLI's own
`endpointFromEnv`/help text/tests all read `MUSTER_ENDPOINT`; `trigger.ts:314` and the entire
`tests/cts/skills-suite.test.ts` reference suite read `MUSTER_BASE_URL`), adds an Ajv manifest
schema (`exit 2` on structural violations), publishes `docs/rubric/skills-trigger-taxonomy.md`
repointing the fabricated citation, and fixes `runStaticSkillCase`'s catch-block bug
(`garrison-hq/muster#62`) where a missing fixture reads as a correctly-detected violation.

This is plumbing, not new grader design (FR-001–FR-006); FR-007 is the one real bug fix.

## Grounding corrections relative to the spec (read this before assigning WPs)

Direct verification against current HEAD turned up four things the spec did not have exactly
right. None of these change what the FRs require; they change what the WPs must actually touch
to satisfy those FRs honestly. Reported here rather than silently absorbed, per this
programme's citation-discipline standard applied to itself.

1. **FR-004's occurrence count is incomplete.** The spec names 4 files / "four real
   occurrences" of `agentskills.io/specification#trigger-testing`. Direct `command grep` at
   current HEAD finds **9 occurrences across 6 files**: `trigger.ts` (lines 34, 188, 290, 346 —
   4, matches spec), `types.ts` (line 97 — 1, matches spec), `fixtures/skills/trigger-queries/
   rigged-impossible-queries.yaml` (line 2 — 1, matches spec), `fixtures/skills/trigger-queries/
   weather-skill-queries.yaml` (line 2 — 1, matches spec) — **and, not named anywhere in the
   spec, `tests/unit/skills-trigger.test.ts` (lines 20 and 59 — 2 more)**. FR-004's own
   verification command greps only `src/ fixtures/ examples/ docs/` (deliberately excluding
   `tests/`), so its literal exit criterion (count `0`) is satisfiable without touching
   `tests/unit/skills-trigger.test.ts`. But SC-006 says the fabricated anchor must "no longer
   appear **anywhere in the repo**" — broader than FR-004's own check. That is a real
   contradiction between FR-004's verification command and SC-006's success criterion, not a
   planning artifact. **Resolution taken in this plan**: WP03's `write_scope` is extended by
   one file, `tests/unit/skills-trigger.test.ts`, beyond the spec's literal list, so SC-006 is
   actually satisfied and not just FR-004's narrower grep. This file is a plain unit test for
   code already inside this mission's `write_scope` (`src/adapters/skills/trigger.ts`) — no
   hazard-1 conflict, it enforces nothing outside this lane's own power to fix. Flagging this
   explicitly for the operator rather than deciding it silently: if the narrower FR-004 check
   is intentional and `tests/` really should stay untouched, drop this file from WP03 and accept
   that SC-006's "anywhere in the repo" claim is then over-broad.

2. **FR-001's own acceptance example cites a manifest that cannot satisfy it yet.** FR-001's AC-1a
   runs `muster skills run examples/skills/manifest.yaml --json` and expects a populated
   behavioral result. Confirmed at HEAD: `examples/skills/manifest.yaml` has exactly one case
   (`example-valid-minimal`, `type: static`) — **no behavioral case exists in that file until
   FR-006 (WP04) adds one.** WP01 cannot demonstrate FR-001 against `examples/skills/manifest.yaml`
   standalone; it must use `fixtures/skills/skills-manifest.yaml`, which already has
   `behavioral-weather-skill`/`behavioral-rigged-control` checked in. WP01's acceptance evidence
   below uses the fixture manifest for this reason. A regression assertion against
   `examples/skills/manifest.yaml` (the spec's literal AC-1a command) is added as a mission-level
   check once WP04 lands, not as one of WP01's own gates.

3. **`SkillsCaseResult` (`index.ts:1254-1260`) has no fields for a `TriggerVerdict` today** —
   no `shouldTriggerAxis`, `nearMissAxis`, or `isControl`. FR-001/FR-005 require extending this
   interface. FR-007 separately requires a new field to distinguish "execution error" from
   "correctly-judged non-conformant" (e.g. `errored?: boolean`) on the *same* interface. Both
   edits land in the same ~7-line type declaration — a real, unavoidable overlap between WP01
   and WP02, resolved below by serializing WP02 after WP01 (not by pretending the files don't
   overlap).

4. **The FR-007 delete-direction test, taken literally from the spec's AC-5 shell block, would
   destroy checked-in fixture content if run as an automated test.** AC-5 shows `rm -rf
   fixtures/skills/broken/name-dir-mismatch` as a manual verification step. WP02's *automated*
   regression test must not do this against the real checked-in path — it must operate against a
   temporary copy (e.g., copy the fixture tree to `os.tmpdir()`, point a temp manifest at the
   copy, delete the copy, assert on the temp manifest run), or CI runs would permanently delete a
   committed fixture the first time the suite executes. Called out explicitly in WP02 below.

## Charter Check

*Gate source: `.kittify/charter/charter.md`; six carried-over constraints per `BRIEF.md:83-96`*

| Charter gate | Status | Note |
|---|---|---|
| Spec-agnostic core untouched | PASS | No `src/core/**` file is in this mission's `write_scope`; NI-002 (no adapter-shaped import inside `src/core/`) is unaffected by construction |
| Static path offline + byte-stable | PASS | FR-003's schema check and FR-007's catch-block fix are both pre-execution / static-path changes; no new network dependency on the static path |
| BYOM, no baked-in providers, key via env only | PASS | FR-002's env-alias resolution and C-003 both keep credential resolution to `process.env[...]` reads only; no new CLI flag |
| k-of-n grading; errored run = failed run | PASS (unchanged) | C-002 explicitly forbids changing `gradeAxis`; C-001 adds a **regression test** at the CLI-wiring layer, since this is the first time that path is reachable end-to-end |
| Every check traces to a cited normative source | PASS, with one known repointing in flight | FR-004 repoints the fabricated `#trigger-testing` anchor to a real, SHA-pinned upstream page (`b8d2613`) plus a muster-published rubric; see grounding correction #1 above for the one file the spec's own check omits |
| Discrimination control per grader | PASS (already exists) | `createDiscriminationControl`/`RIGGED_IMPOSSIBLE_DESCRIPTION` already exist and are already unit-tested; this mission's job is making the control **CLI-reachable** and proving it fails through the CLI (FR-005/FR-006), not designing a new one |

No charter violations. No new runtime dependency: `ajv@^8.17.1` is already a `dependencies` entry
(`package.json:81`), already used by both `src/adapters/skills/schema.ts` (`Ajv2020`) and
`src/adapters/openclaw-sop/manifest.ts` (bare `Ajv`) — WP02 reuses the existing package, no
`package.json` edit needed anywhere in this mission.

## Hazard 1 — enforcement outside every lane's write scope

The one out-of-`write_scope` enforcement file that touches this mission is
`tests/unit/invariants.test.ts` (NI-002/NI-003), already flagged by the spec's own
Dependencies & Assumptions section. Confirmed directly:

- **NI-002** (import-shaped scan of `src/core/**`): not implicated — this mission edits no file
  under `src/core/`.
- **NI-003** (fetch-isolation allowlist: only `src/core/behavioral/client.ts` and
  `src/adapters/a2a/transport.ts` may contain a call-shaped `fetch(`): implicated in principle,
  since WP01 is the first WP to build a live network-reachable client from `src/cli/index.ts`.
  **The lane design handles this by construction, not by restructuring**: WP01's endpoint/client
  construction reuses `makeToolClient`/`makeClientWithTools` (`trigger.ts:133-150`) exclusively —
  the same sanctioned Option-B call site the existing CTS suite already uses — and adds no new
  literal `fetch(` call anywhere in `src/cli/index.ts` or `src/adapters/skills/**`. WP01's
  acceptance evidence includes running `tests/unit/invariants.test.ts` directly (expected exit
  0) as proof, without ever touching the enforcing file. Every downstream WP re-runs the same
  check as a standing regression gate, since any WP could in principle introduce a stray
  `fetch(` in a test helper.

No other file this mission touches is enforced by a file outside its own `write_scope`.

## Work Packages

Four WPs, matching the spec's own "Anticipated Lanes" FR groupings, but with `write_scope`
narrowed to be non-overlapping per WP wherever the underlying files allow it, and an explicit
`depends_on` graph where a real same-file/same-interface coupling exists (found in grounding
corrections #2 and #3 above) — this is a genuine low-parallelism mission (the spec's own
"single lane" framing was directionally right about the coupling), but the coupling is narrower
than "everything in one lane": one real independent lane (WP03) exists alongside a
WP01→WP02→WP04 chain.

---

### WP01 — CLI wiring + env alias (no dependencies)

**FR/C coverage**: FR-001, FR-002, C-001, C-003, C-004 (regression only — pre-existing exit
contract must stay green)

**`write_scope`**:
- `src/cli/index.ts` — `doSkillsRun`'s behavioral-case branch (currently lines 1341-1348);
  `SkillsCaseResult` interface (currently lines 1254-1260, add `shouldTriggerAxis`,
  `nearMissAxis`, `isControl` fields); a new small env-alias-resolution helper (canonical
  `MUSTER_ENDPOINT` wins, `MUSTER_BASE_URL` accepted with a one-line stderr deprecation notice
  only when it is the var that supplied the value, matching FR-002's exact three-way AC-2a/b/c
  behavior); `skills run --help` text (currently lines 1961-1970) — confirm/keep `MUSTER_ENDPOINT`
  as canonical, add one line noting the deprecated alias. **Does not touch**
  `runStaticSkillCase` (lines 1280-1312) — that function is WP02's.
- `src/adapters/skills/trigger.ts` — `createDiscriminationControl`'s hardcoded endpoint default
  (currently line 314, reads `process.env["MUSTER_BASE_URL"]` directly) — repoint to the same
  canonical/alias precedence as the CLI helper, for consistency (this is the second of the two
  live inconsistent sites the spec's Overview names). While this file is already open for that
  edit, also repoint its 4 fabricated-citation occurrences (lines 34, 188, 290, 346) to the new
  rubric path — kept in WP01 specifically to avoid a same-file overlap with WP03 (see below).
  Exact replacement text (carried here so WP01 does not need to read WP03's uncommitted rubric
  file): cite `docs/rubric/skills-trigger-taxonomy.md` for the muster-specific 8-minimum/3-run/
  0.5-threshold enforcement, and `github.com/agentskills/agentskills@b8d2613ac050aa4aa8bfb2cf28380d81cdfcd1ca`,
  path `docs/skill-creation/optimizing-descriptions.mdx`, for the upstream prior-art numbers —
  both strings are already fully decided in the spec's Normative Citations table / OQ-1
  resolution, nothing here is invented mid-implementation.
- `.env.example` — add `MUSTER_ENDPOINT` as the canonical var (currently absent entirely, per
  direct check); keep `MUSTER_BASE_URL` documented as a deprecated alias; fix the stale header
  comment claiming these are "passed as CLI flags, not env vars."
- `fixtures/skills/skills-manifest.yaml` — comment-only fix at the "Behavioral cases (require
  MUSTER_BASE_URL...)" header (currently lines 198-201) to say `MUSTER_ENDPOINT` canonical /
  `MUSTER_BASE_URL` deprecated alias. No case data changes.
- `tests/skills/cli.test.ts` — update the existing skip-assertions (currently asserting
  `[SKIP] behavioral-weather-skill`/`[SKIP] behavioral-rigged-control` unconditionally) to branch
  on `MUSTER_ENDPOINT` presence; add AC-1a/AC-1b, AC-2a/b/c coverage; add the C-001 regression
  test (mock client that throws on every call for a should-trigger query, asserted through
  `doSkillsRun`, not only through `trigger.ts`'s own unit tests, since this is the first time
  that path is CLI-reachable).
- `tests/cts/skills-suite.test.ts` — update the env-var gate (currently `it.skipIf(!process.env["MUSTER_BASE_URL"])`
  at line 324, and the endpoint construction at line 354) to the same canonical/alias precedence,
  so the reference suite this mission "lifts into the CLI" does not itself keep being the one
  place in the tree that still hard-requires the deprecated name.

**Depends on**: none (first WP).

**Acceptance evidence**:
```bash
# FR-001, using the fixture manifest (grounding correction #2 — NOT examples/skills/manifest.yaml, which has no behavioral case until WP04)
MUSTER_ENDPOINT=http://localhost:11434/v1 muster skills run fixtures/skills/skills-manifest.yaml --json
echo "exit=$?"   # expect 0 or 1, never bare-skip; jq '.results[] | select(.type=="behavioral") | .skipped' must show false for both behavioral cases
unset MUSTER_ENDPOINT MUSTER_BASE_URL
muster skills run fixtures/skills/skills-manifest.yaml --json
echo "exit=$?"   # expect 0; both behavioral cases show skipped:true, passed:true; static cases unaffected

# FR-002 — falsification: MUSTER_BASE_URL alone must still work, with a warning; both set, canonical wins with NO warning
MUSTER_BASE_URL=http://localhost:11434/v1 muster skills run fixtures/skills/skills-manifest.yaml 2>&1 | command grep -ic deprecat
# expect: printed count exactly 1 (a count read as a number, never grep's own exit status)
MUSTER_ENDPOINT=http://localhost:11434/v1 MUSTER_BASE_URL=http://unreachable-should-not-be-used:1/v1 \
  muster skills run fixtures/skills/skills-manifest.yaml 2>&1 | command grep -ic deprecat
# expect: printed count exactly 0

# C-001 regression (new test, run via vitest, not shell)
pnpm vitest run tests/skills/cli.test.ts -t "errored trigger run"
echo "exit=$?"   # expect 0; assertion inside: runsErrored increments, axis fails, contributes to overall failed run

# C-003 / hazard-1 proof
pnpm vitest run tests/unit/invariants.test.ts
echo "exit=$?"   # expect 0

# Pre-existing exit contract, must stay green (C-004 regression, unchanged path)
muster skills run /nonexistent-manifest.yaml; echo "exit=$?"   # expect 2

# Whole-tree gates (hazard 2 — paste verbatim, not summarized)
pnpm build; echo "build_exit=$?"
pnpm test; echo "test_exit=$?"
```

---

### WP02 — Manifest schema + static catch-block fix

**FR/C coverage**: FR-003, FR-007

**Depends on**: WP01 (real dependency, not merge-convenience only — grounding corrections #2/#3:
`SkillsCaseResult` and `doSkillsRun`'s manifest-read prologue are edited by both WPs; WP02's
lane must start from a base that already has WP01's interface extension merged in, or the two
lanes would race on the same ~7-line type declaration blind to each other).

**`write_scope`**:
- `src/adapters/skills/schema.ts` — add `SKILLS_MANIFEST_SCHEMA` (Ajv Draft 2020-12, following
  the file's own existing `Ajv2020` import already used for `FRONTMATTER_SCHEMA`, and the
  `openclaw-sop/manifest.ts:200-238` precedent for shape): case-shape union discriminated by
  `type` (`static` | `behavioral`), required fields per branch, `expectations.ok: boolean`. Add a
  `validateManifest`/`loadAndValidateManifest`-shaped export that throws a plain `Error` naming
  the offending field(s) on failure (mirrors the SOP precedent's own throw-then-CLI-rewraps
  pattern).
- `src/cli/index.ts` — `doSkillsRun`'s manifest-read block (currently lines 1332-1337): call the
  new validator before the case loop starts; wrap a validation failure in `ExecutionError` (the
  existing exit-2 path, unchanged mechanism, `readFileOrThrow`/`ExecutionError` already at lines
  154, 164-170, 2107-2110). `runStaticSkillCase`'s catch block (currently lines 1300-1311): stop
  deriving `passed` from `c.expectations.ok`; force `passed: false` and set a new distinguishing
  field (`errored: true`) on the `SkillsCaseResult` extension WP01 already added.
- `tests/skills/cli.test.ts` — add the AC-3 malformed-manifest exit-2 test using an **in-test
  temp file** (`os.tmpdir()`), not a new checked-in fixture (avoids an unnecessary fixture per
  the hazard-3 over-creation correction); add the FR-007 delete-direction regression test
  operating on a **copy** of `fixtures/skills/broken/name-dir-mismatch` under a temp directory
  with its own temp manifest — never `rm -rf` the checked-in path directly inside an automated
  test (grounding correction #4).

**Acceptance evidence**:
```bash
# FR-003 — falsification: missing required field
cat > "$(mktemp -d)/bad-skills-manifest.yaml" <<'EOF'
cases:
  - id: broken
    type: static
EOF
muster skills run /tmp/.../bad-skills-manifest.yaml; echo "exit=$?"   # expect 2, message names the missing field(s)

# also: type outside the static|behavioral enum, and expectations.ok as a string — both exit 2
pnpm vitest run tests/skills/cli.test.ts -t "manifest schema"
echo "exit=$?"   # expect 0

# FR-007 — delete-direction test, against a temp copy (grounding correction #4)
pnpm vitest run tests/skills/cli.test.ts -t "delete-direction"
echo "exit=$?"   # expect 0; assertion inside: passed must NOT be true after the copy's fixture dir is removed;
                 # a dedicated errored:true (or passed:false) outcome is required, exit contribution is 1

# Whole-tree gates
pnpm build; echo "build_exit=$?"
pnpm test; echo "test_exit=$?"
```

---

### WP03 — Rubric doc + citation repoint (no dependencies — genuinely parallel to WP01/WP02)

**FR/C coverage**: FR-004 (OQ-1 resolution)

**`write_scope`**:
- `docs/rubric/skills-trigger-taxonomy.md` — new file. Documents the 8-minimum-per-axis rule,
  should-trigger vs. near-miss semantics, the 0.5 default threshold, k-of-n aggregation
  rationale, and the discrimination-control requirement; cites
  `github.com/agentskills/agentskills@b8d2613ac050aa4aa8bfb2cf28380d81cdfcd1ca`
  (`docs/skill-creation/optimizing-descriptions.mdx`) as prior art for the *numbers*, and marks
  muster's own hard-gate *enforcement* of those numbers `[MUSTER-OWN]` — per the spec's own
  resolved OQ-1 decision, not a new decision made here.
- `src/adapters/skills/types.ts` — 1 citation occurrence (line 97).
- `fixtures/skills/trigger-queries/rigged-impossible-queries.yaml` — 1 occurrence (line 2).
- `fixtures/skills/trigger-queries/weather-skill-queries.yaml` — 1 occurrence (line 2).
- `tests/unit/skills-trigger.test.ts` — 2 occurrences (lines 20, 59). **Added to `write_scope`
  beyond the spec's literal file list** — see grounding correction #1. Flagged for operator
  confirmation; if rejected, SC-006's "anywhere in the repo" claim should be narrowed to match
  FR-004's own grep scope instead.

**Depends on**: none. Confirmed no file in this WP's scope is touched by WP01, WP02, or WP04 —
this is the one real independent lane in this mission.

**Acceptance evidence**:
```bash
test -f docs/rubric/skills-trigger-taxonomy.md; echo "exit=$?"   # expect 0 (file exists)

# absence check as a COUNT, never a grep exit code (this programme's own standing lesson)
command grep -rl "agentskills.io/specification#trigger-testing" src/ fixtures/ examples/ docs/ | wc -l
# expect the printed count to be the literal string 0

# broadened per grounding correction #1 — if WP03's tests/ addition is accepted:
command grep -rl "agentskills.io/specification#trigger-testing" src/ fixtures/ examples/ docs/ tests/ | wc -l
# expect the printed count to be the literal string 0 (repo-wide, matching SC-006's literal claim)

pnpm vitest run tests/unit/skills-trigger.test.ts
echo "exit=$?"   # expect 0

pnpm build; echo "build_exit=$?"
pnpm test; echo "test_exit=$?"
```

---

### WP04 — Examples + tests

**FR/C coverage**: FR-005 (verification-only — see note below), FR-006

**Depends on**: WP01, WP02 (real dependency: FR-006's new mock-client tests exercise the
behavioral-execution wiring WP01 built and are validated against the schema WP02 added; both
land in `tests/skills/cli.test.ts`, the same file WP01/WP02 already extend, so this WP's lane
must start from their merged base per grounding correction #3's same-file reasoning). Does not
depend on WP03: the exact citation string FR-006's new fixture files must use is already fully
decided in the spec's Normative Citations table (carried into WP01's entry above), so WP04 does
not need to read WP03's uncommitted rubric file — per hazard 3's corrected lesson, the needed
content is carried in this task description rather than creating a cross-lane read dependency.

**Note on FR-005**: this FR has no incremental code of its own. `runTriggerConformance` already
passes an `isControl: true` case through its hard-gate/grading path unmodified (`trigger.ts:377`
computes `isControl` structurally, not from a manifest flag alone); once WP01's wiring calls it
for every behavioral case, a control case is automatically handled identically to a
non-control case. FR-005 is satisfied by WP01's wiring and **proven** by this WP's tests — it is
listed here because that is where its acceptance evidence lives, not because it has its own
`write_scope`.

**`write_scope`**:
- `examples/skills/manifest.yaml` — add one `type: behavioral` case (reuse the existing
  `valid/minimal` skill as the target — no new skill fixture needed) and one `isControl: true`
  case (reuse `valid/minimal` as the placeholder `skillDir` too, matching the exact precedent
  already checked into `fixtures/skills/skills-manifest.yaml:214-226`'s own comment: "skillDir is
  a placeholder; the runner replaces the description at runtime" — avoids creating a parallel
  `broken/` tree under `examples/skills/` that nothing else needs, per the hazard-3 correction
  about unnecessary pre-created content).
- `examples/skills/trigger-queries/` (new directory, mirroring the existing
  `fixtures/skills/trigger-queries/` convention) — two new companion query-set YAML files (one
  per new case), each with ≥8 should-trigger and ≥8 near-miss queries, `runsPerQuery: 3`,
  `threshold: 0.5` (both pinned values, matching the Live-Model Verification Plan's pinned
  numbers so these fixtures stay usable for that gate too), citing
  `docs/rubric/skills-trigger-taxonomy.md` directly (the exact string, carried here, not read
  from WP03's file).
- `tests/skills/cli.test.ts` — new/extended tests against a mock `TriggerChatClient`: offline,
  deterministic, no live model dependency for this fixture's own test coverage (FR-006's own
  requirement).

**Acceptance evidence**:
```bash
pnpm vitest run tests/skills/cli.test.ts
echo "exit=$?"   # expect 0 (vitest process exit; FR-006's own stated verification command)

# Mission-level regression, now finally satisfiable: FR-001's own literal AC-1a command,
# against examples/skills/manifest.yaml (grounding correction #2 — deferred here because this
# is the first point in the mission where that file actually has a behavioral case)
MUSTER_ENDPOINT=http://localhost:11434/v1 muster skills run examples/skills/manifest.yaml --json
echo "exit=$?"   # expect 0 or 1, never bare-skip

pnpm build; echo "build_exit=$?"
pnpm test; echo "test_exit=$?"
```

---

## Dependency graph

```
WP01 (CLI wiring + env alias)  ──┐
                                  ├──> WP02 (schema + catch-block fix) ──> WP04 (examples + tests)
WP03 (rubric + citation repoint) ┘        (independent; no edge in)
```

- `WP02.depends_on = [WP01]`
- `WP04.depends_on = [WP01, WP02]`
- `WP03.depends_on = []`, and nothing depends on WP03.

**Parallel**: WP01 and WP03 can start simultaneously — confirmed no file overlap.
**Serialized**: WP02 must not start (or at least must not have its lane's merge-base cut) before
WP01 merges into the mission branch; WP04 must not start before both WP01 and WP02 merge.
WP03 can merge at any point relative to the WP01→WP02→WP04 chain — before, between, or after —
with no reordering risk, since it shares no file with any of them.

**Merge order**: WP01 → WP02 → WP04, with WP03 merged in whenever it finishes (no ordering
constraint against the other three). `merge_gates.mode` defaults to `warn`, not a hard block —
this `depends_on` declaration must still be verified at accept time, not assumed enforced.

## Live-Model Verification — ownership and execution point

**No single WP owns the live run.** The spec's own Live-Model Verification Plan ties it to "once
WP01-WP03 land" — i.e., it requires the mission branch's fully merged state (behavioral wiring +
schema validation + catch-block fix + citation repoint all present), not any one WP's isolated
tree. This plan designates it as a **mission-level pre-accept gate**, executed after WP01, WP02,
WP03, and WP04 have all merged into the mission coordination branch, before that branch is
squash-merged into `main` (`integrate_mission_into_target`):

1. `pnpm test` fully offline first — zero network calls, must be green (baseline before the live
   run touches anything).
2. `node --env-file=.env dist/cli/index.js skills run fixtures/skills/skills-manifest.yaml --json`
   against the pinned model (`gpt-4o-mini`, `https://api.openai.com/v1`, `runsPerQuery: 3`,
   `threshold: 0.5` — already checked into this fixture's two behavioral cases, confirmed
   unchanged at HEAD). Assert `behavioral-rigged-control` reports `passed:false` and
   `behavioral-weather-skill` reports `passed:true`. Apply the spec's failure policy verbatim on
   a first-attempt failure of the should-trigger case (retry exactly once, block on a second
   failure); the control's `passed:true` outcome is immediately mission-blocking and
   non-retryable, no exceptions.
3. Record the exact manifest, model, endpoint, `runsPerQuery`, and threshold in
   `kitty-specs/skills-behavioral-enablement-01KYJFAC/quickstart.md` (created now, see below, as
   a skeleton the pre-accept step fills in — this is a mission-level artifact, not any WP's
   `write_scope`, matching how `plan.md` itself is mission-level rather than lane-owned).
4. Re-run step 2 against a second, different endpoint (env vars only, no code/fixture change) to
   demonstrate portability — not a second acceptance gate, per the spec's own framing.

`quickstart.md` is written now as a skeleton (procedure + pinned values + a placeholder results
table) so the pre-accept step has a checked-in target to fill in rather than inventing the
recording format under time pressure at merge time.

## Pre-merge action item — coordination-branch reconciliation (hazard 4)

Checked directly: `origin/main` is currently **one commit ahead** of this mission's own branch
point (`65490f6`) — commit `2b1a7f9` ("distinguishable collision findings + document skprofile",
#68), touching `README.md`, `package.json`, `src/adapters/spec-kitty-profile/identity.ts`,
`tests/skprofile/identity.test.ts`. None of these files intersect this mission's `write_scope`.

**Named action item, required before the final `integrate_mission_into_target` squash**: merge
(not rebase — preserve the mission branch's own WP merge commits) `origin/main` into the mission
coordination branch, and run `git diff` between the reconciled coordination branch and
`origin/main` to confirm the only remaining delta is this mission's own file set. This is
mechanical here (zero file overlap, so a plain merge should be conflict-free) — the action item
is to actually **do and verify** the merge, not to skip it because it looks safe. The `-X theirs`
squash at final integration only protects mission-branch content that was actually merged into
the mission branch first; it silently discards anything left on `origin/main` that the mission
branch never incorporated. If `main` moves again before this mission reaches accept (plausible,
given this repo's concurrency pattern noted in the mission brief), re-run this reconciliation
immediately before the squash, not once, early, and then forgotten.

## Complexity Tracking

No new runtime dependency (ajv already present). No new environment variable beyond the
`MUSTER_ENDPOINT`/`MUSTER_BASE_URL` alias relationship (per Scope Guard). No structural
exception to the charter. The one open item requiring operator confirmation, not silently
resolved, is grounding correction #1 (WP03's `write_scope` addition of
`tests/unit/skills-trigger.test.ts`, beyond the spec's literal file list, to make SC-006's
"anywhere in the repo" claim actually true).
