---
soul_spec: "1.0.0-rc1"
id: "org.example.cts.profiles.override-not-subset"
name: "Override Not Subset"
locale: "en"

composition:
  extends: []
  mixins: []
  merge_policy: standard

profiles: ["default"]
profile_overrides:
  ghost: {}

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
---

# Override Not Subset

Broken fixture for §25.2 category 7 / §9.2: `profile_overrides` declares the key `ghost`, but `profiles` is only `["default"]`. §9.2 requires every `profile_overrides` key to be "a name present in `profiles`" (and §25 restates it: "profile_overrides keys are subset of profiles"). Conforming validators MUST report an error at `profile_overrides.ghost`. Everything else is the valid Appendix A minimal soul — exactly one rule is broken.
