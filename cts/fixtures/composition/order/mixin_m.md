---
soul_spec: "1.0.0-rc1"
kind: mixin
id: "org.example.cts.composition.order.mixin-m"

relationship:
  stance: authoritative
---

# Order Mixin M

Partial mixin (§7.4: `kind: mixin` with only `soul_spec`, `id`, and payload) for the §7.5 ordering fixture. It sets `relationship.stance: authoritative`, which must override the values from BOTH extends bases because mixins merge after the entire extends chain (§7.5 step 2), while Base A's `relationship.user_model_default` survives the deep merge.
