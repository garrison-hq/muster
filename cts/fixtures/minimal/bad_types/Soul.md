---
soul_spec: "1.0.0-rc1"
id: "org.example.cts.minimal.bad-types"
name: "Bad Types"
locale: "en_US"

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
  verbosity: 142
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

# Bad Types

Broken fixture for §25.2 category 3 (type/range checks): the Appendix A minimal soul with exactly two scalar violations — `voice.verbosity: 142` exceeds the percent range 0..100 (§4.3, §13.1) and `locale: en_US` uses an underscore instead of a hyphen, which is not a syntactically valid BCP-47 tag (§4.3.1; the spec names `en_US` explicitly as invalid). Strict mode MUST reject both. Nothing else is broken.
