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

`muster skills run <manifest>` is the CLI entry point for the Agent Skills (agentskills.io) conformance adapter. It supports two case types: `static` (offline SKILL.md lint, always runs) and `behavioral` (trigger-routing conformance against a BYOM chat endpoint). The **behavioral grader already exists, is fully implemented, and is tested** — `runTriggerConformance` (`src/adapters/skills/trigger.ts:353`) runs should-trigger and near-miss query axes against an injected `TriggerChatClient`, aggregates k-of-n, and ships a rigged-impossible discrimination control (`createDiscriminationControl`, `trigger.ts:282`). A full, working reference call site for exactly this grader already exists in `tests/cts/skills-suite.test.ts:310-393`.

None of that is reachable from the shipped CLI. `doSkillsRun` (`src/cli/index.ts:1306`) unconditionally records every `type: "behavioral"` case as `{ passed: true, skipped: true }` (`index.ts:1333`) and never constructs a client — confirmed by direct code read on `main@65490f6`, matching issue #59's correction #4 exactly. This mission wires the CLI to the grader that already exists, and fixes three seams found around it:

1. **Env-var inconsistency** (issue #59 correction #3, confirmed): the grader's own endpoint construction reads `process.env["MUSTER_BASE_URL"]` (`trigger.ts:314`), and every fixture, test, and even `.env.example` itself (`MUSTER_BASE_URL=https://api.openai.com/v1`, line 16) documents `MUSTER_BASE_URL` as the skills convention — while the CLI's own `skills run --help` text tells users to set `MUSTER_ENDPOINT` (`index.ts:1867-1868`), and every *other* adapter (`heartbeat`, `crosslayer`, `a2a` excepted) canonically reads `MUSTER_ENDPOINT` (`endpointFromEnv`, `index.ts:859`). Confirmed: this is a real, live inconsistency, not a documentation nit — the two names are read in different files for the same purpose.
2. **Unvalidated manifest** (confirmed): `doSkillsRun` parses the manifest with a bare cast, `parseYaml(raw) as { cases: SkillsManifestCase[] }` (`index.ts:1319`), no schema, no runtime shape check. A malformed manifest fails wherever the first bad field is dereferenced, not at a well-formed `exit 2` boundary.
3. **A fabricated-looking normative citation** (issue #59 correction #5, refined by this mission's own verification — see "Normative Citations" and the OQ-1 resolution below): `trigger.ts` cites `agentskills.io/specification#trigger-testing@d8a3f2e1b9c74051e6f8d2a7c3b5f0e9d1a4c8b2`. That exact anchor does not exist. A real, substantively matching upstream source *does* exist, at a different URL, with no commit-SHA scheme of its own — this mission repoints the citation to it via a new muster-published rubric, `docs/rubric/skills-trigger-taxonomy.md` (issue #59 correction #5's own remedy), which did not exist before this mission (`docs/rubric/` has exactly two files today: `sop-rule-taxonomy.md`, `memory-utilization-taxonomy.md`).

This is deliberately **plumbing, not new grading logic** — every FR below wires, fixes an env seam, validates a shape, or documents a citation. No new discrimination-control design is introduced; the existing rigged-impossible control (`RIGGED_IMPOSSIBLE_DESCRIPTION`, `trigger.ts:56-58`) becomes reachable and this mission proves it fails through the CLI, not just through `tests/cts/skills-suite.test.ts`.

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

# AC-2c: both set — MUSTER_ENDPOINT wins (canonical takes priority), no warning for the winning var.
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
# logged to stderr, per existing trigger.ts:436-ish behavior) -- the CLI must
# surface the same verdict runTriggerConformance already computes, unmodified.
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
- A behavioral case whose `querySetPath` file is missing or its query set is below the 8-per-axis minimum: `runTriggerConformance`'s existing hard gate (`trigger.ts:373-390`) returns `passed:false` with zeroed axes — the CLI wiring must not swallow or reinterpret this as a parse error or a skip.
- A control case (`isControl: true`) whose query set is empty or malformed: same hard-gate path as above — the control fails closed (`passed:false`), which for a control means the run reports the fixture-authoring bug loudly rather than the control silently vanishing into `skipped`.

## Requirements

### Functional Requirements

| ID | Requirement | Verification | Expected Exit | Status |
|----|-------------|---------------|----------------|--------|
| FR-001 | `doSkillsRun` (`index.ts:1306`) executes `type: "behavioral"` cases via `runTriggerConformance` when a chat endpoint is configured (FR-002 env resolution); when no endpoint is configured, cases are reported `skipped:true, passed:true` (unchanged from today's default-skip shape, now reached via an explicit env check rather than unconditionally). | `MUSTER_ENDPOINT=<endpoint> muster skills run <manifest-with-behavioral-case> --json` shows `skipped:false` and a populated `shouldTriggerAxis`/`nearMissAxis`; the same command with the env unset shows `skipped:true`. | 0 or 1 (endpoint set); 0 (endpoint unset, all skip/pass) | Proposed |
| FR-002 | Trigger transport resolution reads `MUSTER_ENDPOINT` (canonical, matching every other adapter's `endpointFromEnv` convention, `index.ts:859-870`); `MUSTER_BASE_URL` is honored as a **deprecated alias** for at least one minor release, emitting a one-line deprecation warning on stderr when it is the var that supplied the value. `.env.example` and `skills run --help` text are updated to name `MUSTER_ENDPOINT` as canonical. | `MUSTER_ENDPOINT=<endpoint> muster skills run <manifest>` runs with no warning; `MUSTER_BASE_URL=<endpoint> muster skills run <manifest> 2>&1` emits a deprecation line; both set → `MUSTER_ENDPOINT` wins silently. | 0/1 (both paths); never 2 for env resolution alone | Proposed |
| FR-003 | The skills manifest gains an Ajv JSON Schema (Draft 2020-12, matching the `openclaw-sop` precedent at `src/adapters/openclaw-sop/manifest.ts:199-236`) covering the case-shape union (`static` vs `behavioral` discriminated by `type`), required fields per branch, and the `expectations` shape. A schema violation is a **structural** error → `exit 2` with a message naming the offending field(s), raised before any case executes. | `muster skills run <manifest-missing-required-field>` | 2 | Proposed |
| FR-004 | `docs/rubric/skills-trigger-taxonomy.md` is published (new file; `docs/rubric/` holds exactly `sop-rule-taxonomy.md` and `memory-utilization-taxonomy.md` today — confirmed by `git ls-tree`). It documents the 8-minimum-per-axis rule, should-trigger vs. near-miss query semantics, the 0.5 default threshold, the k-of-n aggregation rationale, and the discrimination-control requirement — citing the **real** upstream source resolved by this mission (see Normative Citations) rather than the fabricated `#trigger-testing` anchor. Citation strings in `trigger.ts` doc comments and in `fixtures/skills/skills-manifest.yaml` are repointed to this rubric (which in turn cites the real upstream page + pinned commit). | Two separate, explicit assertions (an absence check must never be a single `grep -qv`-shaped command, per this programme's own lesson): (a) `test -f docs/rubric/skills-trigger-taxonomy.md` — file exists; (b) `grep -rln "agentskills.io/specification#trigger-testing" src/ fixtures/ examples/ docs/ \| wc -l` — count must equal `0` (asserted as a number, not as grep's own exit code, since grep's "no match" exit status of 1 must never be read as this check's pass/fail signal). | (a) 0 (file exists); (b) the printed count is the literal string `0` | Proposed |
| FR-005 | The behavioral path honors the existing discrimination-control flow unmodified: a case with `isControl: true` is passed through to `runTriggerConformance` exactly as today's tests already exercise it (`tests/cts/skills-suite.test.ts:344-393`); its verdict (`passed`, `isControl`) is reported in the CLI's JSON and human output with no reinterpretation. This FR makes the control **reachable from the CLI** — it does not change grading semantics. | `MUSTER_ENDPOINT=<endpoint> muster skills run fixtures/skills/skills-manifest.yaml --json`, control case entry has `isControl:true`; against a real model, `passed:false` (SC-004 cap-of-zero, existing). | 1 whenever the control's own verdict is `passed:false` and it is the only non-skipped result | Proposed |
| FR-006 | `examples/skills/manifest.yaml` gains one `type: behavioral` case (a real, realistic skill) and one `isControl: true` case, each with a companion query-set file, exercised in `tests/skills/cli.test.ts` (new/extended) against a mock `TriggerChatClient` — offline, deterministic, no live model dependency for this fixture's test coverage. | `pnpm vitest run tests/skills/cli.test.ts` | 0 (vitest process exit) | Proposed |

### Constraints

| ID | Constraint | Verification | Expected Exit | Status |
|----|------------|---------------|----------------|--------|
| C-001 | An errored trigger run counts as a failed run — never retried, never silently skipped (already enforced at `trigger.ts:245-249`; this mission adds a **regression test at the CLI-wiring layer**, since FR-001 is the first time this code path is reachable end-to-end from `doSkillsRun`). | New test: mock client throws on every call for a should-trigger query → `runsErrored` increments, trigger rate is 0, axis fails; asserted via the CLI's `doSkillsRun` entry point, not only via `trigger.ts`'s own unit tests. | n/a (unit-test assertion, vitest exit 0) | Proposed |
| C-002 | k-of-n aggregation for trigger axes is unchanged (declared stylistic per charter behavioral-grading tiers, `trigger.ts:26-31`); this mission introduces no pass^k semantics for trigger axes. | Code review / diff: no change to `gradeAxis` (`trigger.ts:195`) aggregation logic. | n/a | Proposed |
| C-003 | No credential appears in argv; the chat endpoint is resolved from environment variables only (`MUSTER_ENDPOINT`/`MUSTER_BASE_URL` for the base URL, `MUSTER_MODEL`, `MUSTER_API_KEY` falling back to `OPENAI_API_KEY` — never the key *value*, only the env-var *name*, matching `EndpointConfig.apiKeyEnv`). The NI-003 fetch-isolation invariant (`tests/unit/invariants.test.ts`) stays green: FR-001's wiring reuses `makeToolClient`/`makeClientWithTools` (`trigger.ts:133`, `core/behavioral/client.ts`) — **no new literal `fetch` call is added to `src/cli/index.ts` or `src/adapters/skills/**`.** | `pnpm vitest run tests/unit/invariants.test.ts` | 0 | Proposed |
| C-004 | Exit-code contract unchanged: `0` all non-skipped cases passed (or all skipped); `1` at least one non-skipped case failed; `2` manifest could not be read or was structurally invalid (now including Ajv schema failures, FR-003). | `muster skills run <manifest>; echo $?` across the three manifest states above. | 0 / 1 / 2 respectively | Proposed |

### Key Entities

- **SkillsManifestBehavioralCase**: existing type (`index.ts:1226-1234`) — already carries `skillDir`, `profile`, `querySetPath`, `runsPerQuery`, `threshold`, `isControl`. No new fields are required for FR-001/FR-005/FR-006; the manifest shape already anticipated this wiring (this is why the mission is low-risk plumbing, not new design).
- **TriggerQuerySet file** (referenced by `querySetPath`): a YAML file with `id`, `source`, `shouldTrigger[]`, `nearMiss[]`, `threshold` — shape already exercised in `tests/cts/skills-suite.test.ts:328-334`; FR-003's Ajv schema covers the manifest, not this referenced file (out of scope — see Scope Guard).
- **TriggerVerdict**: existing type (`types.ts` §TriggerVerdict) — `passed`, `shouldTriggerAxis`, `nearMissAxis`, `isControl`. FR-005 reports this verdict through the CLI unmodified.

## Discrimination Controls

| Grader | Control | Falsification condition (what makes it fail) | Proof of failure required by this mission |
|--------|---------|-----------------------------------------------|---------------------------------------------|
| `runTriggerConformance` should-trigger / near-miss axes | `createDiscriminationControl` (`trigger.ts:282`) — a skill tool named `rigged-impossible-control` with `RIGGED_IMPOSSIBLE_DESCRIPTION` (`trigger.ts:56-58`), which "cannot plausibly match any realistic query." | The should-trigger axis trigger rate must be ≈0 (< 0.5 threshold) against realistic queries. **This control was already observed failing correctly** in `tests/cts/skills-suite.test.ts:378-384` (`SC-004`, asserted `passed === false`) — pre-existing evidence, not new. What was *never* true before this mission: the control was **unreachable from the shipped CLI** (FR-001's defect). FR-006 adds the **CLI-level** proof: the same control, run through `muster skills run` against a mock client that never selects the rigged tool, must report `passed:false` and — per C-004 — contribute to a non-zero exit code when it is the only non-skipped case. |
| FR-003's Ajv manifest schema | A manifest missing a required field, or with `type` outside the `static`/`behavioral` enum. | The schema validator must reject it — `exit 2`, not a downstream `TypeError` from dereferencing an absent field. | The WP that implements FR-003 must include a fixture manifest that is deliberately malformed (missing `skillDir`, wrong `type` value, `expectations.ok` as a string) and assert `exit 2` for each — the **delete-direction** test this programme has repeatedly missed elsewhere (a fixture that is entirely *absent* is a distinct case, already covered structurally: a missing manifest file hits the existing `readFileOrThrow` → `ExecutionError` → exit 2 path, unchanged by this mission, verified by existing behavior at `index.ts:1316-1322`). |

**Explicitly not this mission's discrimination-control debt** (see "a2a control-inversion" decision below): the a2a adapter's `applyControlInversion` (`src/adapters/a2a/index.ts:356-369`) has a structurally related but distinct defect — it inverts *any* non-skipped `passed:false` result for a `control:true` case, without distinguishing "the grader ran and correctly found non-conformance" from "the grader could not run at all" (e.g. its fixture was deleted). This is real (per issue #62's code-reading, not yet live-reproduced) but lives in a different adapter, a different file, and is explicitly out of scope for this mission — see Scope Guard.

## Normative Citations

| Check | Cites | Pin |
|-------|-------|-----|
| FR-001, FR-005 (behavioral wiring reuses the existing grader unmodified) | `runTriggerConformance`, `createDiscriminationControl` — `src/adapters/skills/trigger.ts` | `garrison-hq/muster@65490f6b8561899394f5f046a5d93c53ef51d12c` (current `main` at mission branch point) |
| FR-002 (env convention) | `endpointFromEnv` precedent — `src/cli/index.ts:859-870` | `garrison-hq/muster@65490f6b8561899394f5f046a5d93c53ef51d12c` |
| FR-003 (Ajv manifest schema pattern) | `SOP_RULE_MANIFEST_SCHEMA` / `loadAndValidateManifest` — `src/adapters/openclaw-sop/manifest.ts:199-260` | `garrison-hq/muster@65490f6b8561899394f5f046a5d93c53ef51d12c` |
| FR-004 (trigger-testing methodology: 8-10 queries/axis, 3-run default, 0.5 threshold, near-miss framing) | **Resolved OQ-1** (see below): `agentskills.io/skill-creation/optimizing-descriptions` ("Designing trigger eval queries" / "Running multiple times" sections) — verified live on 2026-07-27; **not** `agentskills.io/specification#trigger-testing`, which does not exist (verified live: the `/specification` page has no `trigger-testing` anchor and covers only the `SKILL.md` format). | `github.com/agentskills/agentskills@b8d2613ac050aa4aa8bfb2cf28380d81cdfcd1ca`, path `docs/skill-creation/optimizing-descriptions.mdx` (latest commit touching that file as of 2026-07-27) |
| Muster's own hard-minimum enforcement (8 exactly, as a gate rather than a "aim for about 20" recommendation) | `[MUSTER-OWN]` — the upstream page frames "8-10 per axis" and "3 runs" as authoring guidance, not an enforced minimum; muster's `MIN_QUERIES_PER_AXIS = 8` (`trigger.ts:61`) and the hard gate (`trigger.ts:373-390`) are muster's own tightening into a machine-checked requirement. The rubric (FR-004) must say this plainly, not present the hard gate as itself upstream-mandated. | N/A (muster's own repo, this mission's commit once merged) |

### OQ-1 resolution (was open in issue #59; resolved during this specify pass)

Verified live against `agentskills.io` on 2026-07-27:

- `agentskills.io/specification` has **no** `#trigger-testing` section or anchor. The page covers only the `SKILL.md` frontmatter format, directory structure, progressive disclosure, and the `skills-ref` validator. Issue #59's cited anchor does not exist at that path — **confirmed defect**, not merely "unverified."
- A real, substantively matching page **does** exist: `agentskills.io/skill-creation/optimizing-descriptions` ("How to improve your skill's description so it triggers reliably"). It documents: ~20 queries total, 8-10 per axis; should-trigger vs. near-miss (its own term) query design; running each query 3 times as "a reasonable starting point"; a 0.5 default trigger-rate threshold. These numbers **substantively match** muster's implementation (`MIN_QUERIES_PER_AXIS = 8`, `runsPerQuery` charter minimum 3, threshold default 0.5) — this is not a coincidence to paper over; it is real prior art, wrongly cited.
- The page's source lives in a public GitHub repo, `agentskills/agentskills`, at `docs/skill-creation/optimizing-descriptions.mdx`, giving a legitimate, immutable commit SHA to pin (`b8d2613ac050aa4aa8bfb2cf28380d81cdfcd1ca`) — unlike the fabricated `d8a3f2e1b9c74051e6f8d2a7c3b5f0e9d1a4c8b2` suffix on the current citation, which does not correspond to any real commit on that repo (spot-checked: not a prefix of any commit touching the specification or skill-creation docs).

**Decision (recorded, resolved)**: cite the real upstream page + commit SHA as prior art for the *numbers*; mark muster's own hard-gate *enforcement* of those numbers as `[MUSTER-OWN]`. This is the more honest and more defensible position than either "no upstream exists" or "silently keep the fabricated anchor."

## Live-Model Verification Plan

- **Target**: any OpenAI-compatible endpoint reachable via `MUSTER_ENDPOINT` (post-FR-002; `MUSTER_BASE_URL` pre-FR-002 / during the deprecation window). Recommended for this mission's live check: OpenAI (`https://api.openai.com/v1`, `gpt-4o-mini`) or NVIDIA NIM (`https://integrate.api.nvidia.com/v1`), matching the pattern already used across sibling missions (`kitty-specs/heartbeat-adapter-01KTYMCG/quickstart.md`, `kitty-specs/cross-layer-conformance-01KTYKP2/quickstart.md`).
- **Credentials**: loaded from a local, gitignored `.env` via `node --env-file=.env`, never passed on argv, never logged — enforced by the existing repo-wide invariant test (`tests/unit/invariants.test.ts`, NI-003 and the credential-hygiene checks) plus a new assertion specific to this mission: `MUSTER_ENDPOINT`/`MUSTER_BASE_URL`/`MUSTER_MODEL`/`MUSTER_API_KEY` are read only via `process.env[...]` in the skills adapter and CLI wiring — no new `--endpoint`/`--api-key`-shaped CLI flag is introduced.
- **Plan**:
  1. Run `pnpm test` fully offline first (static-only + mocked-client behavioral tests) — must be green with zero network calls (NFR/C-003).
  2. `node --env-file=.env dist/cli/index.js skills run fixtures/skills/skills-manifest.yaml --json` against the live endpoint once wired: assert the discrimination control (`isControl:true` case) reports `passed:false` (SC-004 cap-of-zero) and at least one realistic should-trigger case reports `passed:true` at the configured threshold.
  3. Record the exact manifest, model, and endpoint used for this run in the mission's `quickstart.md` (a checked-in artifact), so the reported pass/fail is reproducible — per this programme's lesson about headline figures that survive review while being unreproducible.
  4. Re-run step 2 against a second, different endpoint (e.g. local Ollama) changing **only** the env vars, to demonstrate SC-005-style endpoint-agnosticism (the suite code and fixtures are unchanged; only `MUSTER_ENDPOINT`/`MUSTER_MODEL`/`MUSTER_API_KEY` differ) — this is the existing pattern from `tests/cts/skills-suite.test.ts`'s own doc comment (SC-005) applied at the CLI layer for the first time.

## Scope Guard — what this mission will not do

- **No new grader logic.** `runTriggerConformance` and its aggregation/discrimination-control semantics are unchanged; this mission wires an existing, tested grader into the CLI and fixes the seams around it.
- **No SK-side query-set authoring** (that is M6, `MOES-Media/spec-kitty#25`, per issue #59's own dependency note — this mission is M6's sole blocker, not its content).
- **No change to the 8-minimum or threshold semantics.** FR-004 documents the existing numbers honestly; it does not change `MIN_QUERIES_PER_AXIS`, `runsPerQuery` defaults, or the 0.5 threshold.
- **No comparison of `expectations.violations` in static cases.** Confirmed still true on `main@65490f6`: `runStaticSkillCase` (`index.ts:1266-1301`) computes `passed = ok === c.expectations.ok`, comparing only `.ok`; the `violations` array declared in the type (`index.ts:1223`, `expectations: { ok: boolean; violations: unknown[] }`) and populated in every manifest fixture (`examples/skills/manifest.yaml`, `fixtures/skills/skills-manifest.yaml`) is parsed but **never compared**. This is a real latent defect (distinct from issue #62's catch-block bug) but is not trivially safe to fix in this mission — an exact-match, subset-match, or rule-ID-only comparison semantics would need its own design decision. **Recorded as a follow-up**, matching issue #59's own scope guard; not fixed here.
- **No fix to the a2a adapter's `applyControlInversion`.** See the decision below — tracked separately, not in this mission's `write_scope`.
- **No muster-action changes** (M8, `garrison-hq/muster-action#2`).
- **No new environment variable beyond the `MUSTER_ENDPOINT`/`MUSTER_BASE_URL` alias relationship** — no new credential-shaped flag or env var is introduced.

### Decision: the a2a `applyControlInversion` instance is **out of scope** for M5

Issue #62's own "Blast radius" section explicitly separates what it verified end-to-end (the skills adapter's catch-block bug — reproduced twice, against two refs, via a real CLI run) from what it found by code-reading only, not executed (the a2a `applyControlInversion` instance, `src/adapters/a2a/index.ts:356-369`, offered as "worth a maintainer look," explicitly not a verified live repro). The two defects are real, structurally related (both let a discrimination control's fixture-absence read as a pass), but they:

- live in different adapters, different files, with **no import coupling** between `src/adapters/skills/**`/`src/cli/index.ts` (this mission's `write_scope`) and `src/adapters/a2a/**`;
- would require a distinct fix shape (a2a's bug is in the *inversion* step applied after grading, not in a *catch block that derives `passed` from an expectation* — the skills bug's shape); a single mission trying to fix both dilutes the "single lane, import-coupled" write_scope rationale issue #59 itself gives for keeping M5 to one lane;
- are not both named by issue #59, M5's own mission brief — only the `MUSTER_BASE_URL`/env and the CLI-unreachability defects are. Issue #62 surfaces the a2a instance as new information discovered by this specify pass's own verification step, not as part of M5's original charter.

**Decision**: fix the skills adapter (this mission) only. File a separate, explicitly-scoped follow-up mission/issue for the a2a `applyControlInversion` defect, referencing `#62`'s blast-radius section directly, so the finding is not lost. (Tracking issue: see report.)

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | A `type: behavioral` case in a skills manifest, with `MUSTER_ENDPOINT` configured, produces a real `TriggerVerdict` through `muster skills run` — not a hardcoded `skipped:true`. |
| SC-002 | The same manifest run with no endpoint configured still skips behavioral cases gracefully and still runs static cases (no regression). |
| SC-003 | `MUSTER_ENDPOINT` and the deprecated `MUSTER_BASE_URL` alias both work; only the alias path emits a stderr deprecation notice. |
| SC-004 | A structurally invalid manifest fails at `exit 2` with a message naming the offending field, before any case executes. |
| SC-005 | The rigged-impossible discrimination control is reachable from `muster skills run` and is observed failing (`passed:false`) both in the offline mock-client test suite (FR-006) and in the live-model verification plan. |
| SC-006 | Every trigger-methodology number cited by muster's rubric/code traces to a real, commit-pinned source; `agentskills.io/specification#trigger-testing` no longer appears anywhere in the repo. |
| SC-007 | `pnpm test` and the SonarCloud quality gate stay green; `tests/unit/invariants.test.ts` (NI-002, NI-003) stays green with no new `fetch` call sites. |

## Dependencies & Assumptions

- **Depends on**: M2 (`garrison-hq/muster#58`, merged as `65490f6`), which this mission branches from — both missions touch `src/cli/index.ts`; M2 is fully merged to `main` before this mission's branch point, so no rebase-through-flight is needed (confirmed: `origin/main` HEAD is `65490f6`, the M2 merge commit, and this mission's branch is cut directly from it).
- **Unblocks**: M6 (`MOES-Media/spec-kitty#25`) — the CLI cannot run behavioral skill cases before this mission (issue #59 correction #4).
- **Assumption**: the manifest shape (`SkillsManifestBehavioralCase`) already anticipated this wiring — no new manifest fields are required for FR-001/FR-005/FR-006, only new schema validation (FR-003) and new fixture content (FR-006).
- **Assumption**: `NI-003` (fetch-isolation) is enforced by `tests/unit/invariants.test.ts`, a file **outside this mission's `write_scope`**. This mission's implementation must satisfy that invariant without editing it — by reusing `makeToolClient`/`makeClientWithTools` (the sanctioned Option-B call site already built for exactly this purpose, per `trigger.ts:9-22`'s own work-log comment) rather than adding any new literal `fetch`/`http` call in `src/cli/index.ts` or `src/adapters/skills/**`. Flagged explicitly because a sibling mission was blocked by exactly this shape of hazard (an in-scope edit enforced by an out-of-scope file).

## Anticipated Lanes

Single lane, per issue #59's own house precedent for this mission (CLI + adapter + tests are import-coupled — `doSkillsRun` in `src/cli/index.ts` directly imports from `src/adapters/skills/**`, so splitting them across lanes would require one lane to read the other's uncommitted files, which lane isolation forbids):

`write_scope: ["src/cli/index.ts", "src/adapters/skills/**", "tests/skills/**", "tests/cts/skills-suite.test.ts", "examples/skills/**", "fixtures/skills/**", "docs/rubric/skills-trigger-taxonomy.md", ".env.example"]`

- **WP01 — CLI wiring + env alias** (FR-001, FR-002, C-001, C-003, C-004): the highest-risk WP, since it is the first time this code path runs end-to-end through the CLI rather than only through `tests/cts/skills-suite.test.ts`.
- **WP02 — manifest schema** (FR-003): Ajv schema + exit-2 wiring, following `openclaw-sop/manifest.ts`'s precedent exactly.
- **WP03 — rubric doc + citation repoint** (FR-004, OQ-1 resolution): publishes `docs/rubric/skills-trigger-taxonomy.md` and removes every occurrence of the fabricated anchor string from the tree.
- **WP04 — examples + tests** (FR-005, FR-006): new manifest cases + companion query-set fixtures + mock-client tests; the live-model verification pass (see Live-Model Verification Plan) is run manually against this WP's fixtures once WP01-WP03 land, and its transcript is recorded in `quickstart.md`.

Since this is a single lane, there is no cross-lane content-visibility hazard for this mission. The out-of-lane hazard that **does** apply is the NI-003 invariant noted above (`tests/unit/invariants.test.ts`, not in `write_scope`) — WP01's implementer must not attempt to "fix" a red NI-003 by editing that file; the fix is always to route through the existing sanctioned client factory instead.
