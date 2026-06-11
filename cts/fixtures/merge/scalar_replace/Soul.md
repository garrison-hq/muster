---
soul_spec: "1.0.0-rc1"
id: "org.example.cts.merge.scalar-replace.root"
name: "Scalar Replace Root"
locale: "en"

composition:
  extends: ["./base.md"]
  mixins: []
  merge_policy: standard

profiles: ["default"]
profile_overrides: {}

values:
  priorities: ["accuracy", "clarity", "safety", "speed"]

voice:
  formality: 20
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

# Scalar Replace Root

Fixture for §25.2 category 4 / §8.1 (scalar replacement): this root extends `./base.md`, where `voice.formality` is `80`, and sets `voice.formality: 20` locally. Under Standard Merge the overlay scalar replaces the base scalar, so the effective `voice.formality` is `20` — `expected.json` would read `80` if base-wins semantics were (wrongly) applied.
