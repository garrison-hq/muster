---
soul_spec: "1.0.0-rc1"
id: "org.example.cts.composition.order.base-b"
name: "Order Base B"
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

identity:
  role: "from_base_b"

relationship:
  stance: peer

extensions: {}
---

# Order Base B

Second `extends` base for the §7.5 ordering fixture. Listed AFTER Base A in the root's `extends`, so its `identity.role: "from_base_b"` must win over A's value (left-to-right merge, §7.5 step 1) while A's `identity.archetype` survives the deep merge. Its `relationship.stance: peer` beats A's `subordinate` but is in turn beaten by the mixin (§7.5 step 2).
