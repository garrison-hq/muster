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

**Upstream prior art for the number**: `agentskills.io/skill-creation/
optimizing-descriptions` recommends roughly 20 queries total, 8-10 per axis,
as authoring guidance — not an enforced minimum. Muster's `8` sits at the
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
own terminology ("near-miss") come directly from `agentskills.io/
skill-creation/optimizing-descriptions`'s query-design guidance.

## The 0.5 Default Threshold

**[MUSTER-OWN] tightening of an upstream default.** `createDiscriminationControl`
(`trigger.ts`) and both existing query-set fixtures
(`fixtures/skills/trigger-queries/{weather-skill,rigged-impossible}-queries.yaml`)
pin `threshold: 0.5`. This value is also the upstream page's own stated
default trigger-rate threshold — not a muster invention on this one number —
but muster additionally makes it the fixture-level convention checked into
every shipped query set, rather than leaving it as a per-author choice.

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

**[MUSTER-OWN]**, applying the charter's existing two-tier behavioral-grading
posture (safety-critical rules aggregate as pass^k, requiring every run to
pass; stylistic axes keep k-of-n thresholds) to trigger conformance by
classification, not by upstream mandate — the upstream page does not specify
an aggregation model at all. Trigger-routing conformance is classified
**stylistic**, not safety-critical: a model's routing quality is a k-of-n
threshold question (`triggerRate >= threshold` or `< threshold`, per axis),
not an "any single failure fails the whole suite" question. An **errored**
run is still counted as a non-trigger and contributes to the denominator
(`runsTotal`) without contributing to the numerator (`runsTriggered`) —
errored runs are never skipped and never retried, matching the charter's
repo-wide rule that an errored run counts as a failed run everywhere.

## Discrimination-Control Requirement

**[MUSTER-OWN]**, applying the charter's "every judge-backed grader ships a
rigged-impossible control case proving it can fail" requirement to this
grader specifically. `createDiscriminationControl` (`trigger.ts`) builds a
case around `RIGGED_IMPOSSIBLE_DESCRIPTION` — a tool description engineered
so that "this tool is never invoked by any realistic query." The control's
`shouldTrigger` axis is expected to fail (trigger rate below threshold)
against a correctly functioning model and correctly functioning grader; a
control that reports `passed: true` (the rigged tool was actually invoked) is
a mission-blocking finding about the grader or the model, not a result to
retry past. This control is not itself sourced from the upstream page — it
is muster's own falsification mechanism for the grader as a whole.

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
