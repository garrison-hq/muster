---
soul_spec: "1.0.0-rc1"
id: "org.example.cts.merge.map-deep.root"
name: "Map Deep Root"
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
  formality: 80
  warmth: 95
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

# Map Deep Root

Fixture for §25.2 category 4 / §8.1 (maps deep-merge): the base `voice` map has `formality` and `warmth`; this root overrides `warmth` only (`95` over `10`) and keeps every other required voice value identical. Both keys are present in the effective config with `warmth` taken from the root. Because Appendix E requires a root soul to carry the full required voice block (§13.1), the root cannot literally omit `formality`; the deep-merge discriminator is the base-only optional key `voice.punctuation: sparse`, which MUST survive into the effective config — map *replacement* would drop it.
