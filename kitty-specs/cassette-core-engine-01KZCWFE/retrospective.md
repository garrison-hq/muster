# Retrospective: cassette-core-engine-01KZCWFE (#99)

**Merged**: `af23d149` on `main`, squash of PR #105 (`feat(cassette): cassette core engine — record/replay for behave run (#99) (#105)`)
**Mission branch trail**: `db80a42..491911f`, 87 commits (`git log --oneline db80a42..491911f | wc -l`)
**Accepted**: 2026-08-07T20:35:05Z by `jeroennouws`, `acceptance_mode: pr`, `accept_commit: 89d5cc0` (`status.json`)

This document is built from the mission's own trail — `reviews/*.yaml`, `status.events.jsonl`, `status.json`, git log, and `gh run list`/`gh pr view`/`gh issue view` against `garrison-hq/muster`. Every number below was independently reproduced against a source file or command, cited inline.

---

## 1. Cycle counts

### Design phase (spec → plan → tasks)

| Phase | Raw / Merged / Confirmed / Refuted | Rounds | Source |
|---|---|---|---|
| spec | 13 / 12 / 12 / 0 | 2 (round 1 fix `ab5c213`; round 2 fix `2610d6a` closing `SPEC-GOV-002`/`SPEC-FRESH-001`; `spec-fresh.yaml` round 2 found 0 new) | `reviews/spec.confirmed.yaml`, `reviews/spec-verify.yaml` (round 2, all 14 resolved), `reviews/spec-fresh.yaml` (round 2, empty) |
| plan | 11 / 11 / 11 / 0 | 3 (round 1 fix `1a45eca`; round 2 fix `44db0e6`; round 3 fix `6511c3a`) | `reviews/plan.confirmed.yaml`, `reviews/plan-verify.yaml` (`round: 3, final: true`) |
| tasks | 6 / 5 / 4 / 1 | 3 (fix commits `d65c990`, `1086754`, `e36b2b0`) | `reviews/tasks.confirmed.yaml`, `reviews/tasks-verify.yaml` (`round: 3, final: true`), `reviews/tasks-refute-2.yaml` (`TASKS-DECOMP-002: refuted`) |

The one refuted tasks finding (`TASKS-DECOMP-002`) is the sole case in the whole trail where the adversarial-refutation step actually threw out a raised finding rather than confirming it — every other confirm/refute batch in the mission (spec, plan, pr) confirmed 100% of what it was handed.

### Per-WP implementation review

Every WP visible in `reviews/wp-WP0*-cycle*.yaml` except WP06 needed exactly one rejection before approval:

| WP | Cycle 1 | Cycle 2 | Rejection reason (severity) |
|---|---|---|---|
| WP01 | rejected | approved | sev-3: `buildSopClient`'s "endpoint configured" branch had zero test coverage |
| WP02 | rejected | approved | sev-3: resolver contract didn't cover crosslayer's `doCrossLayerNoEnvEndpoint` fallback |
| WP03 | rejected | approved | sev-2: FR-012's chat/chatWithTools fidelity-asymmetry doc requirement only half-written |
| WP04 | rejected | approved | sev-2: implementer's coverage claim wrong — 4 branch arms in its own new FR-014/015 logic uncovered, misattributed to pre-existing code |
| WP05 | rejected | approved | sev-3: NI-004's own test suite never proved the directory *walk* reaches all 3 scanned roots, only that the shared helper functions work |
| WP06 | approved (cycle 1) | — | none — only WP with a clean first pass |

11 total WP review cycles across 6 WPs (`ls reviews/wp-WP0*.yaml` = 11 files: 5 WPs × 2 cycles + WP06 × 1). All final verdicts: `approved`.

---

## 2. Pre-merge squad

The squad follows the `must-review` doctrine's R1–R6 protocol (lens sessions → merge/dedup → refutation → fix → verify+fresh-sweep → gate), confirmed by commit `5ec50a9`'s own message: *"pre-merge adversarial squad artifacts for #99 (R1-R6, 3 fix rounds)"*.

**Findings raised, by wave** (reconstructed from file mtimes and content — `ls -la --time-style=full-iso reviews/pr-*`):

| Wave | Source | Findings | Highest severity |
|---|---|---|---|
| Lens sessions (boundary/Alphonso, contract/Renata, tests/Debbie) | `pr-boundary.findings.yaml` (0), `pr-contract.findings.yaml` (2), `pr-tests.findings.yaml` (2) → merged `pr.merged.yaml` | 4 | 4 (`PR-TESTS-001`, the aliasing bug) |
| Refute batch 1 (`pr-refute-1.yaml`) | confirmed 4/4, refuted 0 | — | — |
| Fix round 1 (`ca5d777`, marker `pr.fix-1.done`) | addresses the 4 | — | — |
| Fresh sweep round 1 (`pr-fresh-r1-1..7.yaml`, 7 per-artifact sessions) | 7 new findings merged as `pr-fresh.yaml.r2` | 4 | 4 (`PR-FRESH-001`, citation drift) |
| Fix round 2 (`d5f7750`, marker `pr.fix-2.done`) | addresses the 7 | — | — |
| Fresh sweep round 2 (`pr-fresh-r2-1..5.yaml`, 5 per-artifact sessions) | 3 new findings merged as `pr.confirmed.yaml`/`pr-fresh.yaml` | 4 | 4 (`PR-FRESH-R2-003`) |
| Fix round 3 (`029b2ac`, no marker file — see HALT below) | addresses the 3 | — | — |
| Final verify (`pr-verify.yaml`) | all 3 resolved | — | — |

Total findings raised across the whole pre-merge squad: **4 + 7 + 3 = 14**, all eventually confirmed and fixed, 0 refuted at the pr phase. Three fix rounds total, matching the commit message exactly.

### The one HALT

The squad driver (`~/.hermes/skills/must/scripts/muster-review`) runs `max_fix_rounds=2` by default (`ap.add_argument("--max-fix-rounds", type=int, default=2)`) and raises `Halt("R6: findings > severity 3 remain after max fix rounds")` if, after the loop's normal rounds, the worst remaining severity exceeds 3 (`muster-review:814`). Per `must-review/SKILL.md`: *"`RESULT: HALT` → surface the surviving findings verbatim and wait ... an operator ruling on a contested finding is authoritative and overrides the reviewer's own remediation."*

Rounds 1 and 2 are the normal loop rounds (markers `pr.fix-1.done`, `pr.fix-2.done` exist for exactly these two). Fresh sweep round 2 left **`PR-FRESH-R2-003`** (severity 4) unresolved going into what should have been the final round — and severity 4 > 3, so the driver's own gate logic would raise HALT at this point rather than silently auto-passing. `PR-FRESH-R2-003`'s claim: a code comment asserted that renaming `CaseVerdict.stale` would "break this file at compile time," but empirically `pnpm typecheck` (excludes `tests/`) and `vitest run --typecheck` (points at the same excluding tsconfig) both reported zero errors under the exact rename — the claimed compile-time safety net was not actually armed by anything CI runs.

This is the one HALT: a confirmed severity-4 finding survived past the driver's normal round budget, and the fix that followed (round 3, `029b2ac`) did **not** implement the reviewer's own suggested remediation (wiring `tests/` into a type-checked project) — it softened the overclaiming comment instead, and a follow-up issue was filed at operator direction: **Issue #106**, *"tests/ are never type-checked by any command CI runs,"* whose body states explicitly *"Filed at operator direction so PR #105 stays in scope."* This is exactly the "operator ruling overrides the reviewer's own remediation" behavior the doctrine describes — the operator chose scope containment (soften the claim + file a tracked follow-up) over blocking the merge on wiring a real fix.

No trace of the literal word "HALT" survives in the mission's committed artifacts (checked recursively across `kitty-specs/`, PR comments, PR reviews, issue comments, and CI logs) — the driver prints `RESULT: HALT` to its own process stdout, which is not a persisted mission artifact. The reconstruction above is from the driver's own gate logic plus the artifact/marker-file trail it left behind (2 fix markers instead of 3, `PR-FRESH-R2-003`'s severity, and issue #106's "filed at operator direction" note), not from a stored HALT record.

---

## 3. What the pipeline got wrong

### 3.1 A severity-4 data-corruption bug shipped in the mission's own fixture, survived 6 WP reviews + integration review

`PR-TESTS-001` (confirmed, `reviews/pr.confirmed.yaml` history / `reviews/pr-tests.findings.yaml`, severity 4): `makeCassetteClient`'s record-mode `chat`/`chatWithTools` (`src/core/cassette/client.ts`) stored `request: { messages, opts }` **by reference**, not by copy. The only real caller, `executeRun` (`src/core/behavioral/runner.ts:382-386`), pushes the assistant's reply onto that *same* array object immediately after `client.chat()` returns — after the decorator had already stashed a reference to it. By the time the case file was serialized, every persisted `request.messages` reflected the array's **final mutated state**, not the request actually sent.

This wasn't theoretical: it was live in the mission's own committed `fixtures/cassettes/discrimination-control/rigged-case.json` — a 1-turn case whose persisted `request.messages` had 3 entries (system, user, *and the assistant's own reply*). The refuter reimplemented `computeRequestHash`/`canonicalJson` independently and proved it by hash arithmetic: hashing the full persisted 3-message request produced `d681270e...`, which does **not** match the persisted `requestHash` (`88b2147c...`); truncating to the real 2-message request reproduces `88b2147c...` exactly (`reviews/pr-refute-1.yaml`).

This bug passed WP03's two review cycles (the WP that wrote `client.ts`), WP03's own 100%-branch-coverage verification, the integration review (`reviews/integration.findings.yaml`: `round: 2, findings: []` — clean), and every other WP review that touched adjacent code. Only the pre-merge squad's "would these tests catch it" lens caught it — and its own root-cause note is blunt: *"No test in `tests/cassette/{client,client-tools,store,public-api}.test.ts` calls `chat`/`chatWithTools` with a `messages` array that the test... mutates after the call returns... A regression here... would pass the entire test suite unchanged."*

### 3.2 Citation-drift doc fix that left 3 of 4 stale citations in the very line it "fixed" — three times over

Commit `d33d866` ("re-point commit citations after clean-history compression") rewrote one table row in `docs/guides/spec-kitty-conformance.md` to fix `doBehaveRun`'s stale `:479-489` citation → `:634-653`. The pre-merge squad's fresh sweep round 1 (`PR-FRESH-001`, severity 4, `reviews/pr-fresh-r1-1.yaml`) caught that the **same rewritten line** still carried three other citations that had drifted by the identical cause and were never touched: `doSkillsRun` (stale `:1584`, real `:1748`), `doSopRun` (stale `:1685`, real `:1873`), `doA2aBehavioralRun` (stale `:1157-1161`, real `:1321-1325`, and the stale range now pointed inside an *unrelated function*, `doCrossLayerRun`).

This is the same defect class the fix was supposedly eliminating (the guide's own Status banner claims a full re-check). The pattern recurred across all three pre-merge rounds:
- Round 1 fix (`ca5d777`) left the above.
- Round 2 fresh sweep found more of the same doc: `PR-FRESH-002` (mislabeled Situation cell), `PR-FRESH-003` (chatWithTools comment overclaim).
- Round 2's own fix (`d5f7750`) then had its own citation checked in round 3: `PR-FRESH-R2-001` (severity 3, `reviews/pr-fresh-r2-1.yaml`) found the *new* A2A env-var row citing `behavioral-manifest.ts:142-143` (env-var name constants) for a `kind === "behavioral"` gate actually implemented 950+ lines away at line 1096.

Three rounds, three separate citation-accuracy misses in the same file, each caught only by a dedicated fresh-eyes pass, never by the author's own re-check.

### 3.3 A flaky wall-clock assertion reached CI, and the squad's own determinism lens reviewed that file and missed it

`tests/adapters/openclaw-sop/runner.test.ts`'s Scenario 15 test asserted `durationMs >= 5` behind a `makeDelayedClient` with a 5ms delay — zero margin against timer granularity, clock rounding, and scheduler jitter. It failed in CI: run `31215765443` (2026-08-07T20:25:03Z, `gh run list --repo garrison-hq/muster --branch kitty/mission-cassette-core-engine-01KZCWFE`) failed with `runProbeOnce's Transcript carries real model, hostname-only baseUrl, and measured durationMs` — measured 4ms against an asserted `>= 5`.

Fixed in `94913e1` ("fix(tests): widen zero-margin timing assertion in Scenario 15 durationMs test") by widening the delay to 50ms and the assertion to `>= 20`. The plan-phase determinism review (`PLAN-VERIFY-004` etc., `reviews/plan-verify.yaml`) explicitly re-verified this same test's *existence and shape* ("Technical Context, Test Strategy row 15... require the Scenario-15 mock client to introduce a >=5ms async delay and assert durationMs >= 5") across all 3 plan rounds without ever flagging the margin as flake-prone — determinism review confirmed the mechanism was *present*, not that its threshold was *robust*.

Total CI runs on the PR branch: 11 (`gh run list`), 8 success / 3 failure. Of the 3 failures, 2 were SonarCloud Quality Gate failures (fixed by `9184be9`/`28e3150`, cognitive-complexity and duplicate-import refactors) and 1 was this flaky test.

### 3.4 The implement phase emitted zero lane transitions; retroactive reconstruction required `--force` on all 30 transitions

`status.events.jsonl` shows the mission's 6 WPs created and bootstrapped to `planned` at `2026-08-07T13:07:...Z`, then **nothing** until `2026-08-07T20:22:42Z`, when actor `orry-reconstruction` began replaying `planned → claimed → in_progress → for_review → in_review → approved` for each WP, every single transition stamped `"force": true` and `"reason": "Retroactive reconstruction authorized by operator; implement phase never emitted lane events."`

`status.json`'s `work_packages` block confirms `force_count: 5` for every one of the 6 WPs — 5 forced transitions × 6 WPs = **30 forced transitions**, all under a single retroactive-reconstruction pass, none of them a normal (non-forced) lane event. The implement phase did the real work (code landed, WP reviews ran and produced `wp-WP0*-cycle*.yaml` verdicts, CI went green) but never told the mission's own event log any of it happened until the operator manually replayed history from the review artifacts as evidence.

### 3.5 The accept gate failed strictly and was passed with `--lenient` by operator ruling

All six WP frontmatter files (`kitty-specs/cassette-core-engine-01KZCWFE/tasks/WP0*.md`) carry `agent: ''` — the field is present but empty, not populated with an actual agent identity. No `contracts/` directory exists anywhere under the mission (`find kitty-specs/cassette-core-engine-01KZCWFE -iname contracts` returns nothing). A strict accept gate run against these WPs would fail on both grounds; the mission's own `acceptance_mode: "pr"` / `accepted_by: "jeroennouws"` record in `status.json` is consistent with a human-authorized, non-strict acceptance path rather than a fully mechanical gate pass.

### 3.6 Orchestration defect: concurrent revert-capable review sessions against one shared checkout

The pre-merge squad driver dispatches lens sessions and fresh-sweep sessions via `ThreadPoolExecutor` (`muster-review:566` for R1 lens sessions, `muster-review:731` for R5 verify+fresh-sweep) — genuinely concurrent sessions, not serialized. Unlike per-WP implementation (which uses isolated git worktrees), the pr-phase squad has no worktree-isolation mechanism in the driver script; sessions operate against the same checkout. The verification methodology used throughout this squad's findings (e.g. `PR-TESTS-001`, `PR-FRESH-004`, `PR-FRESH-005`, `PR-FRESH-R2-003`) is itself revert-then-restore: apply the pre-fix code, run the test, confirm it fails red, then `git status --porcelain -uno` to confirm a clean restore — a pattern repeated in nearly every finding's verification text. With multiple such sessions running concurrently against one shared tree, one session's transient revert is visible to another mid-flight. The mission's operators report that at least two sessions observed and restored files another session had transiently modified — nothing was lost, and no commit captured a mid-revert state, but a badly-timed commit during a concurrent revert window could have. This is not evidenced by a persisted incident log in the mission's committed artifacts (none was found); it is a structural risk confirmed by the driver's own concurrency design and reported by the mission's operators.

### 3.7 Issue #106: tests/ are never type-checked by any command CI runs

Filed 2026-08-07T20:11:18Z, sourced directly from `PR-FRESH-R2-003` (§3.0/HALT above). `tsconfig.json` excludes `tests/`; `vitest.config.ts`'s `typecheck.tsconfig` points at that same excluding config, so `vitest run --typecheck` evaluates nothing under `tests/`; CI's `pnpm build`/`pnpm test` steps do neither. Verified empirically in the issue: renaming `CaseVerdict.stale` produced zero errors from either `pnpm typecheck` or `vitest run --typecheck`; planting an unrelated, blatant type error directly in a test file was also silently ignored; a control tsconfig that actually includes `tests/**/*.test.ts` correctly caught both. Any type-derived test guard in this codebase (the mission's own `Pick<CaseVerdict, "id" | "passed" | "stale">` discrimination-control guard among them) can silently degrade to a no-op under a production type change, with CI staying green throughout. Scoped out of #105 and tracked as a follow-up at operator direction, per §2 above.

---

## 4. What worked

- **Revert-testing as a verification technique.** Nearly every confirmed pre-merge finding was verified by literally reverting the fix (or reverting to the pre-fix/buggy state), running the relevant test, confirming a red failure, and restoring (`git status --porcelain -uno` empty afterward). Examples: `WP01-cycle2`'s field-swap revert on `buildSopClient` (falsified the cycle-1 "no test could catch this" claim), `PR-FRESH-004`/`PR-FRESH-005` (reverting the `chatWithTools`/`chat` deep-copy fixes independently fails their respective new tests), `PR-FRESH-006` (renaming `CaseVerdict.stale` breaks compilation as claimed, in isolation). This is what makes a "the tests would catch a regression" claim in these review files load-bearing rather than assumed.
- **Hash-arithmetic proof of the aliasing bug.** Rather than reasoning about the aliasing bug narratively, the refuter reimplemented `computeRequestHash`/`canonicalJson` independently and ran it against the shipped fixture, producing a concrete mismatched hash (`d681270e...` vs. persisted `88b2147c...`) and a matching one when truncated to the real request — an unambiguous, reproducible proof rather than a plausible-sounding claim.
- **Per-artifact fresh sweeps caught gaps the lens pass missed, twice.** The boundary/contract/tests lens sessions (round 1) found only 4 issues and missed the citation-drift and doc-wording problems entirely; the 7-session fresh sweep (`pr-fresh-r1-1..7`, one session per touched artifact) found those, including two severity-4 findings the lenses never touched. The second fresh sweep (5 sessions) then caught 3 more issues in the round-1 fresh sweep's own fix, including the unenforced-typecheck-claim finding that became issue #106. Each pass caught what the previous pass's own remediation introduced or left behind.
- **Adversarial refutation genuinely refuted things, not just rubber-stamped.** `TASKS-DECOMP-002` was raised and then refuted in a dedicated batch (`reviews/tasks-refute-2.yaml`) — the only finding across the entire design phase that didn't survive refutation, which is evidence the refute step isn't a formality.
- **The determinism/coverage discipline in WP review caught real misattribution.** WP04's implementer claimed a coverage miss was "pre-existing untouched static-gate code"; the reviewer recomputed coverage directly from `coverage-final.json`'s branch map and proved the 4 uncovered arms were inside the WP's *own* new code, not pre-existing — catching a wrong root-cause claim, not just a raw number.

---

## 5. Concrete process recommendations

1. **Add a mutation-after-return regression test class to the cassette/decorator review checklist.** §3.1's aliasing bug is a general category (a decorator storing a reference into caller-owned mutable state) that six independent review passes (2 WP03 cycles, integration review) all missed because none of their tests exercised the "caller mutates its own array after the call returns" pattern that the real caller (`executeRun`) actually uses. Any future WP wrapping a chat/tool-call seam should require at least one test that mimics the real caller's post-call mutation pattern, not just literal/untouched fixtures. `pr-tests.findings.yaml`'s own remediation for `PR-TESTS-001` — add a fixture-integrity assertion that `computeRequestHash(exchange.request) === exchange.requestHash` for every committed cassette fixture — should be made a standing store-level test in the module, not a one-off in this PR.
2. **Doc-citation fixes should re-verify the whole edited line/row, not just the one citation that motivated the edit.** §3.2 shows the same failure three times: touching one citation in a multi-citation line while leaving siblings stale. A cheap, mechanical guard (grep every `:NNN` / `:NNN-NNN` line-number citation in a changed doc line against the file it cites, on every PR that touches that doc) would have caught all three rounds' worth of drift without needing a dedicated review session.
3. **Ban bare wall-clock threshold assertions without an explicit margin budget.** §3.3's flake (`durationMs >= 5` behind a 5ms delay) is a known-bad pattern — the fix itself (50ms delay, `>= 20` assertion) shows the fix is cheap once flagged. Plan-review's determinism lens should explicitly check the *margin*, not just the *presence*, of any wall-clock-derived assertion; "the test asserts something is measured" and "the test asserts something is measured reliably" are different claims and were conflated across all 3 plan-review rounds.
4. **Lane-event emission needs to be load-bearing, not best-effort.** §3.4's zero-transitions-then-30-forced-transitions gap means the mission's own state machine was blind to six WPs' worth of real work for roughly 7 hours (13:07Z bootstrap to 20:22Z reconstruction), and the only reason the reconstruction was trustworthy is that the WP review YAMLs happened to exist as independent evidence. If the implement phase's lane-event emission is allowed to silently no-op, the audit trail depends entirely on artifacts that happen to be reconstructible after the fact — that should be a hard failure at implement time, not a retroactive `--force` repair at accept time.
5. **Decide, in doctrine, whether `agent: ''` and absent `contracts/` are actually required for this mission type — and if so, enforce it before implementation starts, not at the accept gate.** §3.5's strict-gate failure was discovered after all six WPs were already built and reviewed; failing this at WP-creation time (when the frontmatter is first written) would have been far cheaper than needing an operator's `--lenient` ruling after the fact.
6. **Give the pr-phase squad the same worktree isolation the WP-implement phase already has.** §3.6: implement-phase WPs get isolated worktrees precisely because concurrent mutation of a shared tree is unsafe; the pr-phase squad's lens and fresh-sweep sessions are dispatched with the same `ThreadPoolExecutor` concurrency but no equivalent isolation. Given the squad's own verification methodology is revert-then-restore, running multiple such sessions against one shared checkout is a directly foreseeable collision, not a remote edge case.
7. **Wire `tests/` into a type-checked project (issue #106) instead of re-discovering the gap per-mission.** The gap is structural (tsconfig excludes `tests/`; vitest's typecheck config points at that same tsconfig) and any future mission that ships a type-derived test guard is exposed to the same silent no-op `PR-FRESH-R2-003` found here. This was correctly scoped out of #105 to keep the PR contained, but it should be prioritized rather than left as a standing latent gap — it directly undermines confidence in any "this is a compile-time guarantee" claim made in this codebase's tests going forward.
