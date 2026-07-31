---
title: Rubric index
description: Which adapter or check cites each of muster's published normative rubric documents, and how the drift-check keeps every citation honest.
---

This page is the index over every normative rubric document muster
publishes under `docs/rubric/`. It exists to satisfy the charter's
cite-a-source rule ("every check cites a normative source, upstream **or
ours**") mechanically rather than aspirationally: a rubric a checker cites
but that isn't listed here, or a citation inside a listed rubric that has
drifted off its real target, is a defect this index and its companion
script (`scripts/check-rubric-citations.mjs`) are built to surface.

`citation-count` below is **informational only** — it counts how many
`` `symbol` (`file:line[-line]`) `` code anchors a rubric file currently
makes. `drift-check-status` is **populated by the script, not
hand-maintained** — do not hand-edit either column expecting it to stay
accurate; run `node scripts/check-rubric-citations.mjs` to get the real,
current answer. This index's own text only records which adapter(s)/check(s)
cite each document, which is the one column the script does not (and
cannot) infer on its own.

| rubric-file | cited-by | citation-count (informational) | drift-check-status |
|---|---|---|---|
| `crosslayer-contradiction-gate.md` | `src/crosslayer/contradiction-lint.ts` (the cross-layer contradiction lint's subject-matter gate; findings carry the in-code constant `MUSTER_RUBRIC_CITATION`, not yet a `file:line` anchor to this document) | 0 | populated by script |
| `memory-utilization-taxonomy.md` | `src/adapters/memory-utilization/` (the `memory-utilization` adapter's `rubricCitation` field on every emitted finding) | 0 | populated by script |
| `skills-trigger-taxonomy.md` | `src/adapters/skills/trigger.ts`, `src/adapters/skills/types.ts` (the Agent Skills adapter's behavioral trigger-conformance grader, `runTriggerConformance`) | 15 | populated by script |
| `sop-rule-taxonomy.md` | `src/adapters/openclaw-sop/` (every SOP manifest entry's `source.normative` field cites this document by path, per FR-009 of the SOP adapter's own spec) | 0 | populated by script |
| `spec-kitty-behavioral-axes.md` | **Not consumed by any muster adapter.** Written to unblock the downstream M4 mission (Spec Kitty issue `MOES-Media/spec-kitty#24`), which pastes this document's `rubricText` blocks verbatim into its own `JudgeAssertion`s — muster's own `spec-kitty-profile` adapter is entirely static and does not use it. Its Integration Contract section cites muster's own SOP judge (`src/adapters/openclaw-sop/judge.ts`) as prior art for one structural detail, in a comma-separated style the checker doesn't parse (see "Known blind spot" below). | 0 | populated by script |
| `spec-kitty-profile-taxonomy.md` | `src/adapters/spec-kitty-profile/` (the Spec Kitty agent-profile static conformance adapter) | 0 | populated by script |

These six documents live under `docs/rubric/` in the repository; this
Starlight page mirrors `docs/rubric/index.md` in substance and does not
duplicate them as separate site pages.

## Known blind spot

`scripts/check-rubric-citations.mjs` only recognizes the canonical
`` `symbolName` (`file:line[-line]`) `` grammar — the symbol and the
`` (`file:line`) `` group must be adjacent, both backtick-quoted. Two
pre-existing citations in `spec-kitty-behavioral-axes.md` predate this index
and are **invisible** to the checker by design, not silently passed as
clean, simply never checked: a fully bare "(lines 62-67 of that file)"
reference (no file path or backticks at all), and a comma-separated
`` `buildJudgeSystemPrompt`, `src/adapters/openclaw-sop/judge.ts:62-67` ``
mention (both halves backtick-quoted, but joined by a comma rather than the
canonical `` symbol (`file:line`) `` adjacency). No FR licenses editing that
document's prose, so both are left as-is; see the [recorded-gaps
register](/muster/rubric/recorded-gaps/) if a future change wants to close
this gap.

## Normative sources

This index itself makes no grading claims — it only points at the six
documents that do. See each document's own "Normative Citation" (or
equivalent) section for its upstream/`[MUSTER-OWN]` provenance.
