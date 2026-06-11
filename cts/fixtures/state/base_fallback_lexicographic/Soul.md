---
soul_spec: "1.0.0-rc1"
id: "org.example.cts.state.base-fallback-lexicographic"
name: "State Base Fallback Lexicographic"
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

state:
  states:
    zeta:
      voice:
        formality: 90
    alpha:
      voice:
        formality: 10

extensions: {}
---

# State Base Fallback Lexicographic

Fixture for §25.2 category 8 / §20.1 + §4.4 (lexicographic fallback): `state.base` is OMITTED, so the runtime MUST behave as if it were the lexicographically smallest key of `state.states` — compared as raw UTF-8 bytes, ascending, with no Unicode normalization (§4.4). The states map deliberately lists `zeta` FIRST in document order; a runtime that picks "the first authored state" instead of the §4.4 smallest key applies the wrong overlay. The correct fallback is `alpha`, so the effective `voice.formality` is `10` (alpha's overlay), not `90` (zeta's) and not the base document's `60`. `expected.json` proves `alpha` was applied.
