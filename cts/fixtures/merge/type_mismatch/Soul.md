---
soul_spec: "1.0.0-rc1"
id: "org.example.cts.merge.type-mismatch.root"
name: "Type Mismatch Root"
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

relationship:
  tone: "minimal"

extensions: {}
---

# Type Mismatch Root

Fixture for §25.2 category 4 / §8.1 (type mismatch replaces): the base declares `relationship.tone` as a map (`{register: "warm"}`); this root declares the same key as the scalar `"minimal"`. Under Standard Merge a type mismatch means the overlay replaces the base entirely, so the effective `relationship.tone` is the scalar — the map and its `register` key vanish without error. Note: the spec's prose example replaces the whole `relationship` value with a scalar, but Appendix E types top-level `relationship` as an object, so a scalar there makes the document schema-invalid; the mismatch is therefore exercised one level down at the schema-unconstrained `relationship.tone` key.
