---
version: "1.0.0"
date: "2026-07-31"
status: "normative"
---

# Recorded-Gaps Register

Twelve known, reasoned-about gaps in muster's current behavioral/static
checks, each with the schema `id` / `title` / `evidence` / `what-was-tried`
/ `why-left` / `closes-when` / `status` (FR-003, Key Entities). An entry
missing any of these seven fields is incomplete — that is exactly what
`scripts/check-register-schema.mjs` mechanically enforces, so this register
cannot silently decay into a bare-titles TODO list.

`status` is one of `tracked-defect` (has, or should have, an open issue; not
yet resolved) or `accepted-tradeoff` (a deliberate, possibly-permanent
design choice — closing the underlying GitHub issue does not mean the entry
should be deleted; see the Edge Cases in `spec.md`).

---

### RG-001 — Live control gate satisfiable by a dead endpoint

- **id**: RG-001
- **title**: Live control gate satisfiable by a dead endpoint
- **evidence**: `verdict.passed` (`tests/cts/skills-suite.test.ts:422-425`) — the live-model discrimination-control assertion only checks `passed === false`; garrison-hq/muster#76.
- **what-was-tried**: none yet — filed as an issue, not fixed.
- **why-left**: fixing it is a code change to a test file, out of this docs-only mission's `write_scope`.
- **closes-when**: the assertion additionally requires `runsErrored === 0` — the field already exists (`runsErrored` (`src/adapters/skills/types.ts:170`)) and is asserted elsewhere (e.g. `tests/unit/skills-trigger.test.ts`), just not in this file.
- **status**: tracked-defect

### RG-002 — `isControl` exit-code semantics diverge between `skills` and `a2a`

- **id**: RG-002
- **title**: `isControl` exit-code semantics diverge between `skills` and `a2a`
- **evidence**: `applyControlInversion` (`src/adapters/a2a/index.ts:356-371`) flips a firing control to `passed: true` so a healthy `a2a` run exits 0; `skills`' healthy run exits 1 instead (the control is designed to fail and is never inverted); garrison-hq/muster#77.
- **what-was-tried**: none — this is a by-design difference between the two adapters, not yet reconciled.
- **why-left**: reconciling requires a behavior decision (which adapter's convention is canonical) that is out of this docs-only mission's scope.
- **closes-when**: a muster FR picks one convention and the other adapter is migrated to match it.
- **status**: tracked-defect

### RG-003 — Single-tool bias in the should-trigger axis

- **id**: RG-003
- **title**: Single-tool bias in the should-trigger axis
- **evidence**: `gradeAxis` (`src/adapters/skills/trigger.ts:237`) — the aggregate-rate calculation that produces the same 1.0 rate for a placeholder-description skill (10/10) as for a purpose-built weather skill (30/30); garrison-hq/muster#82 (P3/enhancement). Not literally identical raw scores — muster#82's own "identical" framing overstates this; the shared quantity is the normalized rate, not the count.
- **what-was-tried**: none.
- **why-left**: fixing requires a richer discriminative axis design sensitive to description quality, independent of tool-set cardinality — future work, out of this docs-only mission's scope.
- **closes-when**: a should-trigger axis exists that discriminates by description quality rather than only by aggregate trigger rate.
- **status**: tracked-defect

### RG-004 — Crosslayer contradiction detector's accepted false-negative surface

- **id**: RG-004
- **title**: Crosslayer contradiction detector's accepted false-negative surface
- **evidence**: `stripHtmlComments` (`src/crosslayer/contradiction-lint.ts:374`) — one of PR#85's two fixes (the other being the subject-matter gate); `Accepted false-negative surface` (`docs/rubric/crosslayer-contradiction-gate.md:81`) documents the deliberately-accepted remaining gap: paraphrase conflicts with zero shared word stems are systematically missed; garrison-hq/muster#84 (closed), PR#85 (merged, `16f0d34c3`).
- **what-was-tried**: HTML-comment-body-leakage stripping (3 of 9 bad pairs) and a subject-matter gate; a broader semantic-similarity gate was considered and rejected as out of scope for PR#85.
- **why-left**: the tradeoff is accepted by design — see the rubric document's own "Accepted false-negative surface" reasoning.
- **closes-when**: never, by design, unless a semantic (non-lexical) similarity check is added as new scope.
- **status**: accepted-tradeoff

### RG-005 — Heartbeat behavioral cases time out once an endpoint is configured

- **id**: RG-005
- **title**: Heartbeat behavioral cases time out once an endpoint is configured
- **evidence**: `runManifest` (`src/adapters/heartbeat/index.ts:489`), exercised in `runManifest` (`tests/heartbeat/fixture-suite.test.ts:225`) — with `MUSTER_ENDPOINT` set, 10 (not 13 — muster#75's own count is inaccurate) of 118 tests time out at vitest's default because `runManifest` executes behavioral cases whenever an endpoint is configured, including fixtures that look static; garrison-hq/muster#75 (`108 passed, 10 failed`).
- **what-was-tried**: none.
- **why-left**: needs either a per-test timeout override or a static/behavioral split in the fixture suite — both code changes, out of this docs-only mission's scope.
- **closes-when**: one of those two fixes ships.
- **status**: tracked-defect

### RG-006 — No published rubric for four adapters

- **id**: RG-006
- **title**: No published rubric for the tools, memory, heartbeat, or crosslayer adapters
- **evidence**: `MUSTER_RUBRIC_CITATION` (`src/crosslayer/contradiction-lint.ts:36`) — crosslayer's findings cite an in-code string constant rather than a published rubric document, unlike the six documents indexed at `docs/rubric/index.md`.
- **what-was-tried**: none — "every check cites a rubric" is currently aspirational for these four layers.
- **why-left**: publishing a rubric for non-Spec-Kitty layers is not this docs-only mission's job (per garrison-hq/muster#60 §11).
- **closes-when**: each of the four adapters publishes its own `docs/rubric/*.md` document and this index is updated to list it.
- **status**: accepted-tradeoff (for now)

### RG-007 — `behave`/`a2a` and `skills`/`sop` disagree on what a dead endpoint means for the exit code

- **id**: RG-007
- **title**: `behave`/`a2a` and `skills`/`sop` disagree on what a dead endpoint means for the exit code
- **evidence**: endpoint-fatal exit 2 in `doBehaveRun` (`return 2` (`src/cli/index.ts:479-489`)) and `doA2aBehavioralRun` (`return 2` (`src/cli/index.ts:1157-1162`)) vs. no such special case, exit 1 on any failure in `doSkillsRun` (`return ok ? 0 : 1` (`src/cli/index.ts:1580-1584`)) and `doSopRun` (`report.passed ? 0 : 1` (`src/cli/index.ts:1684-1686`)); garrison-hq/muster#78, reproduced live against `skills run` (`skills: FAIL — 1/3 cases passed, 2 failed`, `$?` = 1).
- **what-was-tried**: none — discovered during this mission's own verification pass; not previously reconciled.
- **why-left**: **this is not "two valid per-adapter designs" left as an intentional divergence.** `contracts/cli.md`'s own uniform exit-code rule (`execution error` (`kitty-specs/cts1-conformance-harness-01KTS86B/contracts/cli.md:8`)) specifies that an endpoint unreachable for the entire run is an execution fault, exit 2. `behave` and `a2a` implement that contract; `skills` and `sop` do not — they exit 1 for the same condition, indistinguishable from an ordinary graded failure. That makes this an **open product question, not a closed design decision**: either the contract should be amended to bless a documented per-adapter divergence, or `skills`/`sop` should be fixed to match the contract they already claim to implement (garrison-hq/muster#78). Reconciling either way is a behavior change to four adapters, out of this docs-only mission's `write_scope` — recorded here, not resolved here.
- **closes-when**: a muster FR either (a) amends `contracts/cli.md` to explicitly document a per-adapter exception for `skills`/`sop`, or (b) migrates `skills`/`sop` to exit 2 on total-endpoint-failure, matching `behave`/`a2a` and the contract's current uniform wording. Either resolution closes this entry; leaving the contract and the code disagreeing does not.
- **status**: tracked-defect

### RG-008 — Judge OR-of-two-positions leniency

- **id**: RG-008
- **title**: Judge OR-of-two-positions leniency
- **evidence**: `verdictA || verdictB` (`src/adapters/openclaw-sop/judge.ts:264-266`) — a k-of-n run passes if *either* the "Answer A" or "Answer B" order-swap call voted PASS, not requiring both to agree.
- **what-was-tried**: none — this is the judge's current, shipped design, not a bug being actively worked.
- **why-left**: requiring both swap positions to agree would materially change the judge's leniency/strictness balance, a grading-semantics decision out of this docs-only mission's scope.
- **closes-when**: a muster FR revisits the order-swap aggregation rule and either affirms OR-of-two as intentional (converting this entry to `accepted-tradeoff`) or requires both positions to agree (AND-of-two) and migrates the implementation.
- **status**: tracked-defect

### RG-009 — `xfail` mechanism is a fixture convention, not a manifest-level feature

- **id**: RG-009
- **title**: `xfail` mechanism is a fixture convention, not a manifest-level feature
- **evidence**: `xfail_discrimination_control` (`examples/behave/manifest.yaml:34-45`) — the shipped discrimination-control case is named with an `xfail_` prefix and a comment ("EXPECTED TO FAIL... Do not \"fix\" it"), but nothing in the manifest schema or runner recognizes `xfail_` as special; it is pure human-readable convention.
- **what-was-tried**: none — the naming convention has been sufficient so far because the case is small and well-commented.
- **why-left**: a first-class `xfail: true` manifest field (distinguishing "this case is supposed to fail" from "this case failed unexpectedly") is a schema/runner change, out of this docs-only mission's scope.
- **closes-when**: the manifest schema gains an explicit `xfail` (or equivalent) field and the runner reports xfail cases distinctly from ordinary failures.
- **status**: tracked-defect

### RG-010 — Skills static cases never compare `expectations.violations`

- **id**: RG-010
- **title**: Skills static cases never compare `expectations.violations`
- **evidence**: `c.expectations.ok` (`src/cli/index.ts:1323`) — a static skills case's `passed` field is derived solely from `ok === c.expectations.ok`; any `expectations.violations` a manifest author writes is never compared against the actual lint findings.
- **what-was-tried**: none.
- **why-left**: adding a violations-shape comparison is a behavioral change to the static skills runner, out of this docs-only mission's scope.
- **closes-when**: `runStaticSkillCase` additionally compares `c.expectations.violations` (when present) against the actual `allViolations` and fails the case on a mismatch.
- **status**: tracked-defect

### RG-011 — `MUSTER_BASE_URL` deprecation is skills-only

- **id**: RG-011
- **title**: `MUSTER_BASE_URL` deprecation is skills-only
- **evidence**: `usedDeprecatedAlias` (`src/cli/index.ts:1376-1380`) — `resolveSkillsBehavioralEndpoint` is the only call site that emits the `MUSTER_BASE_URL is deprecated` warning; every other adapter that reads `MUSTER_BASE_URL` does so silently, with no equivalent warning.
- **what-was-tried**: none.
- **why-left**: adding the same warning to every other adapter reading the deprecated alias is a behavioral change, out of this docs-only mission's scope.
- **closes-when**: the deprecation warning is emitted from one shared helper every adapter's endpoint-resolution path calls, not duplicated (or omitted) per adapter.
- **status**: tracked-defect

### RG-012 — SOP static-drift findings are always `severity: "warning"`, never `"error"`

- **id**: RG-012
- **title**: SOP static-drift findings are always `severity: "warning"`, never `"error"`
- **evidence**: `checkRuleTextPresence` (`src/adapters/openclaw-sop/manifest.ts:422-441`) hard-codes `severity: "warning"` for every `RULE_DRIFT`/`TOOL_DRIFT` finding; `f.severity !== "error"` (`src/adapters/openclaw-sop/index.ts:156`) means static drift can never by itself make `ok: false` for a manifest run.
- **what-was-tried**: none — this is the current, shipped severity classification, not a bug being actively worked.
- **why-left**: promoting static drift to `error` (making it manifest-run-blocking) is a severity-policy decision out of this docs-only mission's scope, and would need its own discrimination-control-style justification per the charter.
- **closes-when**: a muster FR either affirms `warning`-only as intentional (converting this entry to `accepted-tradeoff`) or promotes drift findings to `error` severity and updates `checkRuleTextPresence`/`checkToolDrift` accordingly.
- **status**: tracked-defect
