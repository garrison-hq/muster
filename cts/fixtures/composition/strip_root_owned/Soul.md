---
soul_spec: "1.0.0-rc1"
kind: soul
id: "org.example.cts.composition.strip-root-owned.root"
name: "Strip Root Owned Root"
locale: "en"

composition:
  extends: []
  mixins: ["./mixin.md"]
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

extensions: {}
---

# Strip Root Owned Root

Fixture for §25.2 category 5 / §9.4 (profiles are root-owned): the included mixin declares `profiles: ["evil"]` and `profile_overrides: {evil: ...}`, but those fields MUST be stripped before the composition merge (§7.5, Appendix G.5.4). The effective config carries the ROOT's `profiles: ["default"]` and empty `profile_overrides` only — no `evil` anywhere — while the mixin's ordinary `identity.role: "from_mixin"` payload composes through, proving the merge happened and only the root-owned fields were excluded. The root pins `kind: soul` explicitly because G.5.4 strips only `profiles`/`profile_overrides`, so the mixin's `kind: mixin` would otherwise merge into the effective config.
