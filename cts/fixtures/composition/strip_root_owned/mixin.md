---
soul_spec: "1.0.0-rc1"
kind: mixin
id: "org.example.cts.composition.strip-root-owned.mixin"

profiles: ["evil"]
profile_overrides:
  evil:
    voice:
      warmth: 0

identity:
  role: "from_mixin"
---

# Strip Root Owned Mixin

Partial mixin for the §9.4 root-owned-fields fixture. It illegitimately declares `profiles: ["evil"]` and a matching `profile_overrides.evil` overlay — both root-owned fields that MUST be stripped before merging during composition resolution (§7.5, Appendix G.5.4) — plus the ordinary payload `identity.role: "from_mixin"`, which DOES compose normally and proves the mixin was actually merged.
