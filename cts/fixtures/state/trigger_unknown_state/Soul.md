---
soul_spec: "1.0.0-rc1"
id: "org.example.cts.state.trigger-unknown-state"
name: "Trigger Unknown State"
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
  triggers:
    - if: "user.rude"
      shift_to: ghost
      duration: session

extensions: {}
---

# Trigger Unknown State

Mode-discrimination fixture for §25.2 category 8 / §20.3.7 (invalid triggers): the single trigger's `shift_to: ghost` references a state that does not exist in `state.states` (only `warm` is defined). §20.3.7: "strict mode MUST fail loading; permissive mode MUST ignore that trigger and emit a warning." The manifest therefore carries TWO cases over this one fixture: a strict case expecting an error at `state.triggers[0].shift_to`, and a permissive twin with `expect_ok: true` where the trigger is ignored (warning) and loading proceeds — the `warm` base overlay still applies (§20.1), so the effective `voice.warmth` is `90` in the permissive `expected.json`.
