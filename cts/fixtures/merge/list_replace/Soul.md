---
soul_spec: "1.0.0-rc1"
id: "org.example.cts.merge.list-replace.root"
name: "List Replace Root"
locale: "en"

composition:
  extends: ["./base.md"]
  mixins: []
  merge_policy: standard

profiles: ["default"]
profile_overrides: {}

values:
  priorities: ["speed"]

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
---

# List Replace Root

Fixture for §25.2 category 4 / §8.2 (lists replace, never union): the base declares `values.priorities: ["accuracy", "brevity", "clarity"]`; this root extends it and declares `["speed"]`. Standard Merge replaces lists entirely, so the effective priorities are exactly `["speed"]` — no base element survives. An append or union implementation would leak `accuracy`/`brevity`/`clarity` and fail the byte comparison.
