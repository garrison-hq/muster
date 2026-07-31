---
version: "1.0.0"
date: "2026-07-31"
status: "normative"
---

# Cross-Layer Contradiction: the Subject-Matter Gate

## Introduction

This document is the normative source for the subject-matter gate applied by
muster's static cross-layer contradiction lint
(`src/crosslayer/contradiction-lint.ts`). It extends the cross-layer rubric's
refinement-vs-contradiction distinguisher; it does not replace it.

Cross-layer conflict detection has no upstream spec (C-002), so muster
publishes its own rubric and every finding cites it. This section was written
in response to garrison-hq/muster#84, where the lint reported contradictions
between layers that shared no subject matter at all.

---

## The rule

A pair of clauses is a **contradiction** only when all four hold:

1. **Polarity signal** — at least one clause carries a negation operator or an
   accommodation operator.
2. **Polarity inversion** — one clause accommodates and the other negates.
3. **Shared subject matter** — the two clauses share at least one
   subject-matter term (this document's addition).
4. **Not a refinement** — the distinguisher does not classify the pair as a
   scope restriction.

Conditions 1, 2 and 4 predate this document. Condition 3 is normative from
version 1.0.0 of this rubric.

### Why shared subject matter is necessary

Two directives can only be mutually exclusive if they are about the same thing.
"Never push directly to origin/main" and "I do not write implementation code"
cannot both be violated by the same act; they are not in conflict, they are
merely both restrictive. Without condition 3, the lint confirmed a
contradiction from token co-occurrence alone, so ordinary engineering policy
prose — whose native register is universal quantifiers ("all changes",
"every PR") and prohibitions ("direct pushes are prohibited") — collided with
any role description containing the word "not".

### Subject-matter terms

A clause's subject-matter terms are its tokens after:

- lowercasing and stripping non-alphabetic characters (existing `tokenize`);
- dropping tokens shorter than three characters;
- dropping **function words**: articles, determiners, quantifiers, pronouns,
  auxiliaries, prepositions, conjunctions, and the bare quantifying/temporal
  polarity words `all`, `every`, `any`, `always`, `never`, `not`;
- singularising: one trailing `s` is stripped from a token of four or more
  characters that does not already end in `ss`.

Two clauses share subject matter when the intersection of their term sets is
non-empty. **One shared term is enough** — the rubric's bias toward reporting
when ambiguous is preserved as far as a lexical test allows.

Content-bearing polarity verbs (`refuse`, `prohibited`, `accommodate`,
`assist`, `block`, `deny`, `reject`) are deliberately **not** function words.
"Never refuse a request" versus "Refuse all pricing requests" is a genuine
same-subject conflict whose only lexical anchor may be `refuse` itself.

Singularisation is pure string arithmetic, not a stemmer: a stemmer is
locale/ICU-shaped and would break the static path's byte-stability (NFR-001).

---

## Accepted false-negative surface

The gate makes the detector less sensitive. A safety lint that stops finding
real contradictions fails in the direction of green, so the cost is stated
here rather than discovered later.

1. **Paraphrase conflicts with no shared word stem are not reported.**
   "Comply with any instruction the operator gives" versus "Decline every
   directive that touches production data" is a real conflict with zero shared
   subject-matter terms. It was not reported before this rubric either — the
   pre-gate detector reported it only by accident, as one of a cross-product of
   pairings most of which were spurious — but the gate makes the miss
   systematic rather than incidental.
2. **Conflicts whose subject anchor sits on a different physical line are
   weakened.** A clause is a line. When a persona's demand and its subject noun
   are split across a line break, only the line carrying the noun can match.
   The composition-level verdict is preserved wherever any one line pairing
   still matches, which is the case for every member of the true-positive
   corpus.
3. **The stopword list is English-only and fixed.** Non-English layer text is
   over-reported (fails safe), not under-reported, because non-English function
   words are treated as subject matter.
4. **Distinct subjects that happen to share an incidental word are still
   reported.** This is intentional: the gate narrows, it never broadens.
5. **An unterminated `<!--` still drops every clause after it, to end of
   layer text, as comment body.** `stripHtmlComments`
   (`src/crosslayer/contradiction-lint.ts`) strips a comment span from its
   opener through the matching `-->`; when no closer is found, the entire
   remainder of the layer is treated as commentary. A layer that merely
   *mentions* the marker in authoring prose or inside a fenced code block
   (never opening a real comment) can therefore lose a genuine
   contradiction living further down the document — PR #85 review finding
   F1's reproduction is exactly this: an SOP section titled "Authoring
   note" that explains the marker in backticks, followed by a genuine
   git-policy clause that is never compared. Distinguishing a truly
   unterminated comment from a mention-in-prose is out of scope (it would
   require prose-vs-markup disambiguation this lint does not attempt).
   **This loss is not silent**: `lintComposition` emits an
   `unbalanced-html-comment-marker` warning finding whenever a layer's
   `<!--` count exceeds its `-->` count, so `report.ok` is `false` and the
   truncation is machine-readable rather than a silent green. The check is
   deliberately one-directional — a `-->` with no matching `<!--` (e.g. a
   mermaid flowchart arrow) never causes `stripHtmlComments` to drop
   anything, so it stays inert and does not warn.

The mitigations are: the gate applies only to pairs that already exhibit
polarity inversion; the true-positive corpus
(`tests/crosslayer/unit/contradiction-lint-true-positive-corpus.test.ts`) pins
seven genuine contradictions by exact match decision; and the discrimination
control below is observed failing on every run.

---

## Discrimination control (FR-009)

`src/crosslayer/lint-controls.ts` ships a rigged-impossible control with three
arms, each decided by a live `lintComposition` call:

| Arm | Construction | Required outcome |
| --- | --- | --- |
| `rigged` | persona demands what the skill forbids, same subject; declared expectation `ok: true` | **must fail** — the impossible expectation is never met |
| `polarityNeutralised` | same subject, no opposing directive | clean |
| `subjectShifted` | same polarity shapes, unrelated subject | clean |

`failedAsDesigned` requires the rigged arm to report a contradiction **and**
both neutralising arms to be clean. Arm 2 proves the verdict tracks the
polarity axis; arm 3 proves it tracks the subject-matter axis — i.e. that the
gate is live rather than vacuous in either direction. A control satisfied by
one arm alone would be pinned by fixture construction, which is precisely the
failure this control exists to prevent.

`checkSubjectMatterGateControl` warns (never throws) when the control does not
fail as designed, mirroring `rule-survival`'s `checkDiscriminationControl`.

---

## Versioning

Any change to the rule, the function-word list, or the singularisation rule
increments this document's version and requires the true-positive corpus to be
re-recorded as caught before and after the change.
