---
soul_spec: "1.0.0-rc1"
id: "org.example.cts.profiles.missing-default"
name: "Missing Default Profile"
locale: "en"

composition:
  extends: []
  mixins: []
  merge_policy: standard

profiles: ["friendly"]
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

extensions: {}
---

# Missing Default Profile

Broken fixture for §25.2 category 7 / §9.1: `profiles` is `["friendly"]` and does NOT include `default`, which §9.1 makes mandatory ("MUST include `default`"). Conforming validators MUST report an error at `profiles` saying the list must include "default". Everything else is the valid Appendix A minimal soul — this fixture breaks exactly the one rule it names.
