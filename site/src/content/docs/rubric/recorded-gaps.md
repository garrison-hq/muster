---
title: Recorded gaps
description: Twelve known, reasoned-about gaps in muster's current behavioral and static checks — what was tried, why each was left, and what closes it.
---

Twelve known, reasoned-about gaps in muster's current behavioral/static
checks, each with the schema `id` / `title` / `evidence` / `what-was-tried`
/ `why-left` / `closes-when` / `status`. An entry missing any of these seven
fields is incomplete — that is exactly what `scripts/check-register-schema.mjs`
mechanically enforces, so this register cannot silently decay into a
bare-titles TODO list.

`status` is one of `tracked-defect` (has, or should have, an open issue; not
yet resolved) or `accepted-tradeoff` (a deliberate, possibly-permanent
design choice — closing the underlying GitHub issue does not mean the entry
should be deleted).

---

### RG-001 — Live control gate satisfiable by a dead endpoint

- **id**: RG-001
- **evidence**: `verdict.passed` (`tests/cts/skills-suite.test.ts:422-425`) — the live-model discrimination-control assertion only checks `passed === false`; garrison-hq/muster#76.
- **what-was-tried**: none yet — filed as an issue, not fixed.
- **why-left**: fixing it is a code change to a test file, out of this docs-only mission's write scope.
- **closes-when**: the assertion additionally requires `runsErrored === 0` — the field already exists (`runsErrored`, `src/adapters/skills/types.ts:170`) and is asserted elsewhere, just not in this file.
- **status**: tracked-defect

### RG-002 — `isControl` exit-code semantics diverge between `skills` and `a2a`

- **id**: RG-002
- **evidence**: `applyControlInversion` (`src/adapters/a2a/index.ts:356-371`) flips a firing control to `passed: true` so a healthy `a2a` run exits 0; `skills`' healthy run exits 1 instead (the control is designed to fail and is never inverted); garrison-hq/muster#77.
- **what-was-tried**: none — this is a by-design difference between the two adapters, not yet reconciled.
- **why-left**: reconciling requires a behavior decision (which adapter's convention is canonical) that is out of scope here.
- **closes-when**: a muster FR picks one convention and the other adapter is migrated to match it.
- **status**: tracked-defect

### RG-003 — Single-tool bias in the should-trigger axis

- **id**: RG-003
- **evidence**: `gradeAxis` (`src/adapters/skills/trigger.ts:237`) — the aggregate-rate calculation that produces the same 1.0 rate for a placeholder-description skill (10/10) as for a purpose-built weather skill (30/30); garrison-hq/muster#82. Not literally identical raw scores — the shared quantity is the normalized rate, not the count.
- **what-was-tried**: none.
- **why-left**: fixing requires a richer discriminative axis design sensitive to description quality, independent of tool-set cardinality.
- **closes-when**: a should-trigger axis exists that discriminates by description quality rather than only by aggregate trigger rate.
- **status**: tracked-defect

### RG-004 — Crosslayer contradiction detector's accepted false-negative surface

- **id**: RG-004
- **evidence**: `stripHtmlComments` (`src/crosslayer/contradiction-lint.ts:374`) — one of PR#85's two fixes; `docs/rubric/crosslayer-contradiction-gate.md`'s own "Accepted false-negative surface" section documents the deliberately-accepted remaining gap; garrison-hq/muster#84 (closed), PR#85 (merged).
- **what-was-tried**: HTML-comment-body-leakage stripping and a subject-matter gate; a broader semantic-similarity gate was considered and rejected as out of scope.
- **why-left**: the tradeoff is accepted by design.
- **closes-when**: never, by design, unless a semantic (non-lexical) similarity check is added as new scope.
- **status**: accepted-tradeoff

### RG-005 — Heartbeat behavioral cases time out once an endpoint is configured

- **id**: RG-005
- **evidence**: `runManifest` (`src/adapters/heartbeat/index.ts:489`) — with `MUSTER_ENDPOINT` set, 10 of 118 tests time out at vitest's default because behavioral cases run whenever an endpoint is configured, including fixtures that look static; garrison-hq/muster#75.
- **what-was-tried**: none.
- **why-left**: needs either a per-test timeout override or a static/behavioral split in the fixture suite.
- **closes-when**: one of those two fixes ships.
- **status**: tracked-defect

### RG-006 — No published rubric for four adapters

- **id**: RG-006
- **evidence**: `MUSTER_RUBRIC_CITATION` (`src/crosslayer/contradiction-lint.ts:36`) — crosslayer's findings cite an in-code string constant rather than a published rubric document.
- **what-was-tried**: none — "every check cites a rubric" is currently aspirational for tools, memory, heartbeat, and crosslayer.
- **why-left**: publishing a rubric for these layers is not this docs-only mission's job.
- **closes-when**: each adapter publishes its own rubric document and the [rubric index](/muster/rubric/) is updated to list it.
- **status**: accepted-tradeoff (for now)

### RG-007 — `behave`/`a2a` and `skills`/`sop` disagree on what a dead endpoint means for the exit code

- **id**: RG-007
- **evidence**: endpoint-fatal exit 2 in `doBehaveRun` (`src/cli/index.ts:479-489`) and `doA2aBehavioralRun` (`src/cli/index.ts:1157-1162`) vs. exit 1 on any failure in `doSkillsRun` (`src/cli/index.ts:1580-1584`) and `doSopRun` (`src/cli/index.ts:1684-1686`); garrison-hq/muster#78.
- **what-was-tried**: none — discovered during this mission's own verification pass.
- **why-left**: **this is not two valid per-adapter designs left as an intentional divergence.** `contracts/cli.md` specifies one uniform rule: an endpoint unreachable for the entire run is an execution fault, exit 2. `behave` and `a2a` implement that contract; `skills` and `sop` do not. This is an **open product question**: either the contract should be amended to bless a documented per-adapter divergence, or `skills`/`sop` should be fixed to match the contract they already claim to implement.
- **closes-when**: a muster FR either amends `contracts/cli.md` to document a per-adapter exception, or migrates `skills`/`sop` to exit 2 on total-endpoint-failure.
- **status**: tracked-defect

### RG-008 — Judge OR-of-two-positions leniency

- **id**: RG-008
- **evidence**: `verdictA || verdictB` (`src/adapters/openclaw-sop/judge.ts:264-266`) — a k-of-n run passes if either the "Answer A" or "Answer B" order-swap call voted PASS, not requiring both to agree.
- **what-was-tried**: none — this is the judge's current, shipped design.
- **why-left**: requiring both swap positions to agree would materially change the judge's leniency/strictness balance.
- **closes-when**: a muster FR either affirms OR-of-two as intentional or requires both positions to agree and migrates the implementation.
- **status**: tracked-defect

### RG-009 — `xfail` mechanism is a fixture convention, not a manifest-level feature

- **id**: RG-009
- **evidence**: `xfail_discrimination_control` (`examples/behave/manifest.yaml:34-45`) — the shipped discrimination-control case is named with an `xfail_` prefix and a comment, but nothing in the manifest schema or runner recognizes `xfail_` as special.
- **what-was-tried**: none — the naming convention has been sufficient so far.
- **why-left**: a first-class `xfail` manifest field is a schema/runner change.
- **closes-when**: the manifest schema gains an explicit `xfail` field and the runner reports xfail cases distinctly from ordinary failures.
- **status**: tracked-defect

### RG-010 — Skills static cases never compare `expectations.violations`

- **id**: RG-010
- **evidence**: `c.expectations.ok` (`src/cli/index.ts:1323`) — a static skills case's `passed` field is derived solely from `ok === c.expectations.ok`; any `expectations.violations` a manifest author writes is never compared against the actual lint findings.
- **what-was-tried**: none.
- **why-left**: adding a violations-shape comparison is a behavioral change to the static skills runner.
- **closes-when**: `runStaticSkillCase` additionally compares `c.expectations.violations` (when present) and fails the case on a mismatch.
- **status**: tracked-defect

### RG-011 — `MUSTER_BASE_URL` deprecation is skills-only

- **id**: RG-011
- **evidence**: `usedDeprecatedAlias` (`src/cli/index.ts:1376-1380`) — only the skills adapter's endpoint resolver emits the deprecation warning; every other adapter reading `MUSTER_BASE_URL` does so silently.
- **what-was-tried**: none.
- **why-left**: adding the same warning to every other adapter is a behavioral change.
- **closes-when**: the deprecation warning is emitted from one shared helper every adapter's endpoint-resolution path calls.
- **status**: tracked-defect

### RG-012 — SOP static-drift findings are always `severity: "warning"`, never `"error"`

- **id**: RG-012
- **evidence**: `checkRuleTextPresence` (`src/adapters/openclaw-sop/manifest.ts:422-441`) hard-codes `severity: "warning"`; `f.severity !== "error"` (`src/adapters/openclaw-sop/index.ts:156`) means static drift can never by itself make a manifest run fail.
- **what-was-tried**: none — this is the current, shipped severity classification.
- **why-left**: promoting static drift to `error` is a severity-policy decision that would need its own justification.
- **closes-when**: a muster FR either affirms `warning`-only as intentional or promotes drift findings to `error` severity.
- **status**: tracked-defect
