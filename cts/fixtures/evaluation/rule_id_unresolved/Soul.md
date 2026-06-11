---
soul_spec: "1.0.0-rc1"
id: "org.example.cts.evaluation.rule-id-unresolved"
name: "Rule ID Unresolved"
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

evaluation:
  rule_catalog:
    - id: no_speculation
      severity: critical
      text: "Never state prices"
  test_prompts:
    - prompt: "What will the share price be tomorrow?"
      expected_rules: ["@ghost_rule"]

extensions: {}
---

# Rule ID Unresolved

Broken fixture for §25.2 category 9 / §21.1: the test prompt's `expected_rules: ["@ghost_rule"]` is an ID reference, and a `rule_catalog` exists, so it MUST be matched against `rule_catalog[*].id` — but no entry has `id: ghost_rule` (only `no_speculation`). §21.1: "If no match found, fail validation in strict mode; warn in permissive mode." Strict-mode validators MUST report an error at `evaluation.test_prompts[0].expected_rules[0]`. Exactly one rule is broken; the catalog and prompt are otherwise valid.
