---
soul_spec: "1.0.0-rc1"
id: "org.example.cts.state.bad-base"
name: "State Bad Base"
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
  base: ghost
  states:
    warm:
      voice:
        warmth: 90

extensions: {}
---

# State Bad Base

Broken fixture for §25.2 category 8 / §20.1: `state.base: ghost` does not reference a key in `state.states` (which only defines `warm`). §20.1 is explicit: "If `state.base` is provided, it MUST reference a key in `state.states`." Strict-mode validators MUST report an error at `state.base`. Everything else is the valid Appendix A minimal soul plus a well-formed `warm` state — exactly one rule is broken.
