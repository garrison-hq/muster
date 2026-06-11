---
soul_spec: "1.0.0-rc1"
id: "org.example.cts.minimal.missing-mandatory"
name: "Missing Mandatory"
locale: "en"

composition:
  extends: []
  mixins: []
  merge_policy: standard

profiles: ["default"]
profile_overrides: {}

values:
  priorities: ["accuracy", "clarity", "safety", "speed"]

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

# Missing Mandatory

Broken fixture for §25.2 category 2 (mandatory core presence): this is the Appendix A minimal soul with the REQUIRED `voice` block (§5.1, §13.1) deleted and nothing else changed. Missing required keys MUST be rejected in both strict and permissive mode (§5.2.1 — "no permissiveness for mandatory core"). It breaks exactly this one rule; every remaining block is valid.
