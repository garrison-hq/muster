# Mission Review: cross-layer-conformance-01KTYKP2

**Reviewer**: principal-engineer (spec-kitty-mission-review)
**Date**: 2026-06-13
**Lane**: `.worktrees/cross-layer-conformance-01KTYKP2-lane-a` (4 commits vs main)
**Verdict**: **PASS-WITH-NOTES** — `reviewPass = true`. No CRITICAL/HIGH blocking finding.

## Build + test (run by reviewer)
- `pnpm install --frozen-lockfile` OK
- `pnpm build` (tsc strict) OK — 0 type errors
- `pnpm test`: **1583 passed, 2 skipped (1585 total)**, 78 files, Type Errors: none. Matches the expected baseline.
- crosslayer coverage (v8): composition.ts 85.86% / contradiction-lint.ts 93.43% / manifest-runner.ts 92.01% / rule-survival.ts 100% lines; all files ≥ 80% (new-code gate met).
- Determinism spot-check: ran the static manifest twice through the built `runManifest` — `JSON.stringify` byte-identical; all five static families produce the documented findings.

## 1. FR coverage trace
| FR | Implemented | Tested | Status |
|----|-------------|--------|--------|
| FR-001 (core boundary, reuse pipeline) | `composition.ts` reuses `resolveCompositionDetailed`; `rule-survival.ts` reuses core `makeClient` | boundary grep + build | MET |
| FR-002 (stack composition input) | `StackComposition`/`LayerEntry`/`assembleComposedContext` | composition.test.ts | MET |
| FR-003 (contradiction + refinement distinction) | `contradiction-lint.ts` `isRefinement`/`analyseLayerPair` | scenarios 1,4,5 + refinement distinguisher tests | MET |
| FR-004 (undefined / resolved-by-precedence / circular) | `resolveWinner`, `detectCircularPrecedence` | scenarios 2,3 + circular + resolveWinner tests | MET |
| FR-005 (baseline + composed + baseline-failure) | `runRuleSurvival`, BASELINE_THRESHOLD guard | baseline-failure guard tests | MET |
| FR-006 (pass^k / k-of-n; errored=failed) | `aggregateVerdict`; try/catch records `passed:false` | pass-k single-violation, k-of-n, errored-run, non-2xx tests | MET |
| FR-007 (adversarial probe in composed ctx) | `runAdversarialProbe` + SOP attribution | adversarial attribution tests | MET |
| FR-008 (declared-precedence behavioral) | precedence carried on case; survival = declared winner held | precedence-sop-wins integration + second-endpoint + endpoint-error | MET (see Note 1) |
| FR-009 (discrimination controls) | benign→ok:true (static); erosion control→eroded; warn path | scenario 5 + erosion-control eroded test + warn-path test | MET |
| FR-010 (machine-readable + cited source) | `citedSource`/`severity` fields; MUSTER_RUBRIC / stack-declared citations | FR-010 citation tests | MET |
| FR-011 (manifest runner pass/fail summary) | `runManifest`, `$ref` includes, dry-run, filters | manifest validation + dry-run + completeness tests | MET |
| FR-012 (fixture set) | benign / contradictory(±prec) / circular / erosion / rule-survival / precedence-behavioral + master manifest | integration completeness tests | MET |

Precedence acceptance scenarios specifically checked: **sop-wins** (integration, persona "Flex/refuse no request" + SOP refusal, precedence [sop,persona], refusal mock → survived), **second-endpoint portability** (same case run against two mock base_urls; identical pass/fail structure; each fetch hits its own baseUrl), **endpoint-error** (calls 7-12 throw → case 2 failed, cases 1 and 3 still run; errored=failed). **Erosion discrimination control** genuinely fails: composed mock returns accommodation → verdict `eroded`; a separate test exercises the "control unexpectedly survived" warn path.

## 2. Drift findings
- **Note 1 (MEDIUM, non-blocking) — FR-005 "reuse the SOP adapter's probes/graders/rule manifest" is not literally honored.** Plan.md and FR-005 state the key design decision: reuse `src/adapters/openclaw-sop/` probes, graders, and rule manifest "not new graders from scratch." `src/crosslayer/rule-survival.ts` imports nothing from the SOP adapter; it ships its own keyword `gradeRefusalResponse` and its own pass^k aggregation, while the SOP adapter already exports reusable `gradeExactStringNonLeakage`, `gradeConfirmBeforeDestructive`, `aggregatePassK`, `selectProbesForRule`, etc. The spec FR text is satisfied behaviorally (baseline-vs-composed, pass^k, errored=failed all present and tested), but the stated reuse decision was reimplemented. Not a spec-acceptance failure; flag for the upstreaming step so the conformance suite does not carry a second divergent refusal grader.
- **Note 2 (LOW) — FR-008 precedence is informational on the behavioral path.** `runRuleSurvival` does not consume `composition.precedence`; the declared-winner check is expressed as "the safety rule survived," which for SOP-outranks-persona is the correct observable. Defensible, but the runner never asserts the transcript followed the *declared* layer beyond rule survival. Acceptable given muster reports, never reconciles (C-006).

## 3. Risk + security findings
- **Static determinism**: confirmed. No `localeCompare` (only comments warning against it), no `Date`/`Math.random`/`performance.now` in `src/crosslayer/`. Sort comparator uses raw `<`/`>` (UTF-16 code-unit). Double-run byte-identical.
- **Endpoint/transport errors (FR-008 errored=failed)**: `runProbeNTimes` try/catch records `{passed:false,errorMessage}`; non-2xx surfaces as a throw from the core client and is also counted failed (tested). Manifest per-case catch records `passed:false` and continues. Missing credentials throw a *configuration* error before any fetch (tested, fetch never called) — correct (not a silently-passed run).
- **Injection / path-traversal in fixture/manifest loading**: `$ref` and `fixturePath` are resolved with `pathResolve` against the manifest dir / cwd with no traversal guard. Manifests are author-controlled local conformance fixtures, not untrusted network input, so risk is LOW; worth a containment note if the runner is ever exposed to third-party manifests.
- **Credential safety**: NFR-005 met — only `api_key_env` (a name) lives in manifests; the value is read from `process.env` at call time via core `makeClient`. The `apiKeyEnv as "MUSTER_API_KEY" | "OPENAI_API_KEY"` cast in `buildChatClient` is a type smell (core union is narrower than the manifest's free-form name) but runtime behavior `process.env[name]` is correct and safe. LOW.
- **Contradiction-lint heuristic posture**: token-set negation×accommodation polarity-inversion with a refinement escape hatch; documented bias toward false positives over false negatives (safety-appropriate). Cross-product over clause lines is O(linesA×linesB) — fine at fixture scale and well under NFR-002/003. The heuristic is coarse (keyword-based) and could miss paraphrased contradictions, but the rubric is cited as the normative source (C-002) and the tested boundary cases (warm-tone+formal-for-legal = refinement; always-help vs refuse-X = contradiction; never-reveal vs summarize-prompt = contradiction) are correct.

## 4. Charter compliance
- **C-001 / C-004 boundary**: `grep -rn crosslayer src/core/` empty; `git diff main...HEAD -- src/core src/adapters` empty. All new code under `src/crosslayer/`, tests under `tests/crosslayer/`, fixtures under `fixtures/crosslayer/`. No files touched outside scope. PASS.
- **Reuse of rfc1 resolve + core runner**: `resolveCompositionDetailed` reused for the persona layer (strict mode, error violations propagated); HTTP delegated to core `makeClient`. The SOP-grader reuse is the exception in Note 1. PASS (with Note 1).
- **pass^k conjunctive where safety-critical**: `gradingClass: "pass-k"` → `every(r=>r.passed)`; single violation → eroded; errored run counts as a failure inside the conjunction. PASS.
- **Discrimination controls genuinely fail**: static benign → ok:true zero findings; behavioral erosion persona → eroded; warn emitted if a control unexpectedly survives. PASS.
- **Cite-a-source**: every finding carries a non-empty `citedSource` (rubric or stack-declared-precedence); tested. PASS.
- **New-code coverage ≥ 80%**: all four modules ≥ 80% lines. PASS.
- **No tests weakened/skipped**: the 2 skips are pre-existing; full suite green. PASS.

## 5. Verdict
**PASS-WITH-NOTES** (`reviewPass = true`). All 12 FRs and the precedence + erosion scenarios are implemented and tested; build/test/coverage/determinism gates pass; the core boundary is clean and scope is respected. Two non-blocking notes for the upstreaming follow-up: (1) reconcile FR-005's "reuse SOP adapter graders" decision — the runner reimplemented a refusal grader instead of importing the SOP adapter's; (2) the behavioral precedence check is expressed as rule-survival rather than an explicit declared-winner transcript assertion. Neither affects acceptance.
