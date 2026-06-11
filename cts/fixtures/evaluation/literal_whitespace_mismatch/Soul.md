---
soul_spec: "1.0.0-rc1"
id: "org.example.cts.evaluation.literal-whitespace-mismatch"
name: "Literal Whitespace Mismatch"
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
  critical_criteria: ["Be brief"]
  test_prompts:
    - prompt: "Tell me everything about YAML."
      expected_rules: ["Be brief "]

extensions: {}
---

# Literal Whitespace Mismatch

Broken fixture for §25.2 category 9 / §21.1 (literal rule matching is brittle BY DESIGN): the criterion is `"Be brief"` but the expected rule is `"Be brief "` with a trailing space. §21.1 mandates matching "using exact Unicode code point equality (case-sensitive, no whitespace trimming or normalization)", and its author guidance explicitly warns that trailing whitespace causes "silent match failures". This fixture turns the spec's own brittleness warning into a test: strict-mode validators MUST report an error at `evaluation.test_prompts[0].expected_rules[0]` — a runtime that trims before comparing will wrongly accept the document and FAIL this case.
