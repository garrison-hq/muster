---
title: Behavioral thresholds
description: The deterministic word-count mapping behavioral grading uses, and how overrides work.
---

RFC-1 defines `voice.verbosity` as a 0 to 100 scalar but deliberately maps no
word counts. So that behavioral grades are objective and reproducible, muster
applies a documented, deterministic mapping (a locked design decision).

## The mapping

| Quantity | Rule |
|----------|------|
| Verbosity word cap | `maxWords(verbosity) = 10 + verbosity` (e.g. verbosity 25 → 35 words) |
| Refusal word cap | constant `25` |
| Word counting | `s.trim().split(/\s+/).filter(Boolean).length` |

The mapping is owned by the RFC-1 adapter, so a future adapter for a different
spec could map thresholds its own way without touching the core grader.

## k-of-n grading

Each case runs `runs` times (default 3) and passes iff at least `pass_threshold`
(default 2) runs pass; an errored run counts as failed. Every grade records
`measured` and `limit`, so a failure always says exactly what it measured and
what it expected.

## Overrides

A case may carry per-case overrides in the behavioral manifest:

```yaml
overrides:
  max_words: 30
  refusal_cap: 20
```

Overrides express **deliberate test design**: they win over the default
mapping for that case. The canonical example is the intentionally-impossible
`xfail_discrimination_overly_verbose` case, which sets an unreachable cap to
prove the grader actually fails non-conforming output rather than rubber-stamping
it.

:::note
The thresholds themselves are locked. Overrides exist to author intent, never to
launder a failing result into a pass.
:::
