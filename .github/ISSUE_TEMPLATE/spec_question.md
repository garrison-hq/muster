---
name: Spec / design question
about: A question about how muster interprets Soul.md RFC-1, or why it's designed the way it is.
title: "[question] "
labels: question
---

## What you're asking

<!-- The question, in one or two sentences. -->

## Where you already looked

muster's behavior is defined by the vendored spec and recorded in its planning
trail. Which did you check?

- [ ] `.kittify/reference/soul-spec.md` — the RFC-1 spec text (the section your
  question is about).
- [ ] [`README.md`](../../README.md) — especially "Reference resolution" and
  "Behavioral thresholds" for the two areas where muster makes documented
  choices the spec leaves open.
- [ ] The relevant `kitty-specs/<mission>/` spec / plan / mission-review — these
  record *why* muster resolves the ambiguities it does (e.g. the verbosity
  word-count mapping, the predicate subset, the Appendix E vs §25 keyspace
  split).

## Is this a spec question or a muster question?

- [ ] **muster question** — "why does muster do X?" Answerable from this repo.
- [ ] **spec question** — "what should *any* conforming runtime do for X?" These
  are often better raised upstream at https://github.com/rokoss21/soul.md; muster
  follows the spec, it doesn't define it.

## Your current understanding

<!-- What do you currently think the answer is? Describing your mental model lets
     the response correct it precisely, rather than re-explaining from scratch. -->

## The specific gap

<!-- What did the spec / docs not make clear? Quoting the section that seems
     ambiguous or contradictory is the most useful form — it can become a docs
     fix or an upstream spec clarification. -->
