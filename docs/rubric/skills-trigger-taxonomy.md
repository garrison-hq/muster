---
version: "1.0.0"
date: "2026-07-27"
status: "normative"
---

# Skills Trigger-Conformance Methodology Rubric

## Introduction

This document is the normative citation target for the Agent Skills
(agentskills.io) adapter's behavioral trigger-conformance grader
(`runTriggerConformance`, `src/adapters/skills/trigger.ts`). It replaces a
previously cited anchor — a `trigger-testing` fragment on the `agentskills.io`
`/specification` page — that does not exist: the `/specification` page covers
only the `SKILL.md` frontmatter format, directory structure, progressive
disclosure, and the `skills-ref` validator, and has no `trigger-testing`
section or anchor at any point in its content (verified live, 2026-07-27).

A real, substantively matching upstream page does exist, at a different URL:
`agentskills.io/skill-creation/optimizing-descriptions` ("How to improve your
skill's description so it triggers reliably"). This document cites that page
for the *numbers* below, and marks muster's own hard-gate *enforcement* of
those numbers `[MUSTER-OWN]` — the upstream page frames its numbers as
authoring guidance ("aim for," "a reasonable starting point"), not as a
machine-checked minimum. Presenting muster's hard gate as itself
upstream-mandated would misrepresent the source; this document does not do
that.

Every manifest entry's methodology citation and every doc comment in
`src/adapters/skills/trigger.ts`/`types.ts` should reference this document by
path (`docs/rubric/skills-trigger-taxonomy.md`), not the old fabricated
anchor.

---

## The 8-Minimum-Per-Axis Rule

**[MUSTER-OWN]** — `runTriggerConformance` enforces a hard gate: a query set
whose `shouldTrigger` or `nearMiss` array has fewer than `MIN_QUERIES_PER_AXIS`
(8, `trigger.ts`) entries fails closed — the case returns `passed: false` with
zeroed axis verdicts, rather than grading an under-sized sample (`trigger.ts`,
hard-gate check ahead of `runSingleQuery` invocation).

**Upstream prior art for the number**:
`agentskills.io/skill-creation/optimizing-descriptions` recommends roughly 20
queries total, 8-10 per axis, as authoring guidance — not an enforced
minimum. Muster's `8` sits at the
lower bound of that recommended range and turns it into a machine-checked
requirement; that tightening (a soft "aim for" becoming a hard gate) is
muster's own decision, not something the upstream page itself mandates.

## Should-Trigger vs. Near-Miss Query Semantics

A trigger query set (`TriggerQuerySet`, `src/adapters/skills/types.ts`) labels
its queries along two axes:

- **`shouldTrigger`**: queries a well-functioning model is expected to route
  to the target skill's tool. The axis passes when the aggregate trigger rate
  (`sum(runsTriggered) / sum(runsTotal)` across all queries in the axis) is
  `>= threshold`.
- **`nearMiss`**: queries that are topically adjacent to the target skill but
  should *not* trigger it — a plausible-sounding distractor, not a realistic
  invocation. The axis passes when the aggregate trigger rate is `< threshold`
  (i.e., the model correctly declines to invoke the tool for most of these).

Both axes use the same aggregation function (`gradeAxis`, `trigger.ts`); only
the pass condition's direction differs, matching the axis's own semantics
(should trigger vs. should not).

**Upstream prior art**: the "should-trigger vs. near-miss" framing and its
own terminology ("near-miss") come directly from
`agentskills.io/skill-creation/optimizing-descriptions`'s query-design
guidance.

## The 0.5 Default Threshold

Upstream states the pass rule directly: "A should-trigger query passes if
its trigger rate is above a threshold (0.5 is a reasonable default). A
should-not-trigger query passes if its trigger rate is below that threshold"
(`optimizing-descriptions.mdx`, "Testing whether a description triggers").
`createDiscriminationControl` (`trigger.ts`) and both existing query-set
fixtures (`fixtures/skills/trigger-queries/{weather-skill,rigged-impossible}-queries.yaml`)
pin `threshold: 0.5` — the numeric value matches upstream's own default.

**[MUSTER-OWN] divergence: the denominator, not just the number.** Upstream's
0.5 is applied *per query*: each query gets its own trigger rate (that
query's triggers / that query's runs) and its own pass/fail verdict against
0.5. Muster's `gradeAxis` (`trigger.ts:200-206`) pools every query's runs
into a single axis-level rate (`sum(runsTriggered) / sum(runsTotal)` across
*all* queries in the axis) before comparing to 0.5 — there is no per-query
verdict anywhere in this codebase (`QueryRunResult`, `types.ts:165-171`,
carries no `passed` field). The same 0.5 number is therefore being checked
against a materially different quantity than the one upstream describes; see
"K-of-N Aggregation Rationale" below for the masking consequence. Muster also
makes 0.5 the fixture-level convention checked into every shipped query set,
rather than leaving it as a per-author choice — that packaging decision is
muster's own, independent of the denominator divergence above.

## `runsPerQuery` — the 3-Run Default

Both existing behavioral manifest cases
(`fixtures/skills/skills-manifest.yaml`, `behavioral-weather-skill` and
`behavioral-rigged-control`) pin `runsPerQuery: 3` — each query is sent to
the endpoint 3 times, and every run (triggered, non-triggered, or errored) is
counted toward the axis's aggregate rate (`runSingleQuery`, `trigger.ts`).

**Upstream prior art**: the upstream page describes running each query
"3 times" as "a reasonable starting point," not a hard requirement. Muster
treats 3 as its own fixture-level convention (checked into both shipped
fixtures) rather than a machine-enforced minimum — unlike the 8-per-axis
rule above, there is no hard gate in `trigger.ts` rejecting a query set for
using a different `runsPerQuery` value.

## K-of-N Aggregation Rationale

Upstream *does* define an aggregation model: "A should-trigger query passes
if its trigger rate is above a threshold... A should-not-trigger query
passes if its trigger rate is below that threshold" (`optimizing-descriptions.mdx`).
That is a **per-query** pass rule — every individual query gets its own
trigger rate and its own verdict.

**[MUSTER-OWN] divergence: axis-level pooling instead of per-query
verdicts.** `gradeAxis` (`trigger.ts:200-206`) does not compute a verdict per
query. It sums `runsTriggered` and `runsTotal` across *every* query in the
axis first, then compares one pooled rate to the threshold.
`QueryRunResult` (`types.ts:165-171`) has no `passed` field to hold a
per-query outcome even if one were computed — there is no per-query verdict
anywhere in this codebase. This pooling is muster's own choice, applying the
charter's existing two-tier behavioral-grading posture (safety-critical
rules aggregate as pass^k, requiring every run to pass; stylistic axes keep
k-of-n thresholds) to trigger conformance by classification. Trigger-routing
conformance is classified **stylistic**, not safety-critical: a model's
routing quality is treated as a k-of-n threshold question
(`triggerRate >= threshold` or `< threshold`, per axis), not an "any single
failure fails the whole suite" question — but the "n" muster chose to pool
over is the whole axis, not the single query upstream pools over.

**Consequence (masking)**: axis-level pooling can pass an axis that
upstream's per-query rule would fail. Example: a `shouldTrigger` axis with
two queries, 3 runs each. Query A triggers 3/3; query B triggers 0/3. Pooled:
3/6 = 0.5, which meets `>= 0.5` and the axis passes under muster's grader.
Under upstream's per-query rule, query B's own rate (0/3 = 0) is below 0.5
and that query individually fails — a real routing gap on query B is
invisible to muster's axis-level result. An **errored** run is still counted
as a non-trigger and contributes to the denominator (`runsTotal`) without
contributing to the numerator (`runsTriggered`) — errored runs are never
skipped and never retried, matching the charter's repo-wide rule that an
errored run counts as a failed run everywhere.

## Discrimination-Control Requirement

**[MUSTER-OWN]**, applying the charter's "every judge-backed grader ships a
rigged-impossible control case proving it can fail" requirement to this
grader specifically. `createDiscriminationControl` (`trigger.ts`) builds a
case around `RIGGED_IMPOSSIBLE_DESCRIPTION` — a tool description engineered
so that "this tool is never invoked by any realistic query." The control's
`shouldTrigger` axis is expected to fail (trigger rate below threshold)
against a correctly functioning model and correctly functioning grader.

**Where this is actually enforced**: `runTriggerConformance` itself
(`trigger.ts`) does not block on an unexpectedly-passing control — it only
emits a `console.warn` (`trigger.ts:429-434`) and still returns
`passed: true` on the resulting `TriggerVerdict` (the `passed` value is
returned unmutated, `trigger.ts:438-440`). The mechanical enforcement lives
one layer up, in `tests/cts/skills-suite.test.ts` — a file owned by WP01, not
WP04, and whose discrimination-control assertions predate this mission
entirely (`git log` on that file shows only two commits, `8ae5c0f` and
`2135429`, both already merged to `main` before this mission existed).

The assertion that actually runs unconditionally in CI is the **static-mode
mocked analog** at `tests/cts/skills-suite.test.ts:231-307`: a
`TriggerChatClient` mock that always returns no tool call is injected into
`runTriggerConformance` with the rigged-impossible query set, and the test
asserts `verdict.passed` is `false` (line 297-300). This is the assertion
that gives the discrimination control its actual enforcement in every
ordinary run of the suite.

A second, **live-model** block exists at `tests/cts/skills-suite.test.ts:312-403`,
gated `it.skipIf(!process.env["MUSTER_BASE_URL"])` — it does not run in
ordinary CI and only executes when a real endpoint is configured. It repeats
the same `passed:false` assertion (lines 386-391) against a live model as an
addition on top of the static-mode analog, not as the primary enforcement.

Both assertions carry the label `SC-004` in the test file's own strings and
`describe` block name (lines 231, 297, 390). That label is **legacy
numbering carried over from the earlier `skills-adapter-01KTYKNX` mission**,
whose `spec.md` defines `SC-004` as "the trigger grader demonstrably fails
its rigged-impossible control." In *this* mission's `spec.md`, `SC-004`
means something unrelated ("a structurally invalid manifest fails at
`exit 2`..."); the discrimination-control criterion here is **`SC-005`**
("the rigged-impossible discrimination control is reachable... and is
observed failing... both in the offline mock-client test suite... and...
in a real, recorded live run"). The `SC-004` string inside the test file is
stale relative to this mission's numbering and should not be read as this
mission's own criterion.

A control reporting `passed: true` is a mission-blocking finding about the
grader or the model — but the blocking happens at the test-suite assertions
above, not inside `trigger.ts` itself. This control is not itself sourced
from the upstream page — it is muster's own falsification mechanism for the
grader as a whole.

---

## Normative Citation

`github.com/agentskills/agentskills@b8d2613ac050aa4aa8bfb2cf28380d81cdfcd1ca`,
path `docs/skill-creation/optimizing-descriptions.mdx` — prior art for the
~20-queries-total / 8-10-per-axis guidance, the should-trigger/near-miss query
framing, the "running each query 3 times" starting point, and the 0.5 default
threshold. This pin resolves OQ-1 (originally raised in issue #59): the page
this SHA points at is the real, substantively matching source for muster's
trigger-testing numbers; the old `/specification`-page `trigger-testing`
fragment was never a real anchor at any commit and should not be cited
anywhere in this repository going forward.

Muster's own tightenings of that upstream guidance into machine-checked gates
— the hard 8-per-axis minimum, the fixture-level 0.5/3-run conventions, the
k-of-n aggregation classification, and the discrimination-control requirement
— are `[MUSTER-OWN]` and cite no upstream source beyond this document.
