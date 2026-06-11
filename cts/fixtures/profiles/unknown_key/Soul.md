---
soul_spec: "1.0.0-rc1"
id: "org.example.cts.keyspace.unknown-key"
name: "Unknown Key"
locale: "en"

composition:
  extends: []
  mixins: []
  merge_policy: standard

profiles: ["default"]
profile_overrides: {}

values:
  priorities: ["accuracy", "clarity", "safety", "speed"]

voice:
  formality: 60
  warmth: 30
  verbosity: 50
  jargon: 40
  formatting: minimal

interaction:
  clarifying_questions: when_ambiguous
  uncertainty: explicit
  disagreement: neutral
  confirmations: implicit

safety:
  refusal_style: brief
  privacy: strict
  speculation: mark

extensions: {}

mood_engine:
  enabled: true
---

# Unknown Key

Mode-discrimination fixture for §25 / §5.2.1 (unknown top-level keys): the valid Appendix A minimal soul plus one top-level key, `mood_engine`, that is outside the RFC-1 keyspace and not under `extensions`. Per §25 and the §5.2.1 mode table, strict mode MUST reject the document (error at `mood_engine`), while permissive mode MUST ignore the key and MAY emit a warning — the document loads OK. The manifest carries a strict case and a permissive twin (ids `keyspace_unknown_key_*`).

Note on placement: this is a §25 keyspace fixture, supplementary to the nine §25.2 categories (it belongs to no single category). It lives under `fixtures/profiles/` only because of work-package file ownership; the manifest header map lists it under a separate "supplementary" line so the category table stays honest.
