---
soul_spec: "1.0.0-rc1"
id: "org.example.cts.state.base-explicit"
name: "State Base Explicit"
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
  base: warm
  states:
    warm:
      voice:
        warmth: 90
    cold:
      voice:
        warmth: 10

extensions: {}
---

# State Base Explicit

Fixture for §25.2 category 8 / §20.1 + §7.5 step 5 (explicit `state.base` overlay): `state.base: warm` selects the `warm` overlay out of `{warm, cold}`, and the runtime MUST apply `state.states[warm]` as a Standard Merge overlay during materialization (§20.3.1 "Applying base state overlay" — this is deterministic overlay application, not trigger evaluation). The effective `voice.warmth` is therefore `90` (overlay) instead of the base document's `30`, while every other voice key survives the deep merge. `expected.json` proves it; the `state` block itself remains in the materialized output (Appendix G.6 convention, as in the WP07 fixtures).
