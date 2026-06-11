---
title: CTS-1 coverage
description: How muster's fixture suite maps onto the nine §25.2 conformance categories.
---

The fixture suite under `cts/` is laid out per RFC-1 **Appendix F** and covers
all nine §25.2 conformance categories. The authoritative category → case-id map
lives in the header of
[`cts/manifest.yaml`](https://github.com/garrison-hq/muster/blob/main/cts/manifest.yaml);
this page summarizes it.

| § | Category | Valid + broken fixtures |
|---|----------|-------------------------|
| 1 | Soul-YAML enforcement (§4.2) | `minimal_valid`; forbidden anchors/aliases refused in both modes |
| 2 | Mandatory core presence (§5.1) | `minimal_missing_mandatory` |
| 3 | Type/range checks (§4.3, §4.3.1) | `minimal_bad_types` (percent range, BCP-47 locale) |
| 4 | Standard Merge (§8) | `merge_scalar_replace`, `merge_map_deep`, `merge_list_replace`, `merge_null_value`, `merge_type_mismatch` |
| 5 | Composition order (§7.5, §9.4) | `composition_order`, `composition_local_wins`, `composition_strip_root_owned` |
| 6 | Cycle detection (§7.3) | `composition_cycle` |
| 7 | Profiles (§9) | `profiles_overlay_concise`, `profiles_missing_default`, `profiles_override_not_subset` |
| 8 | State semantics (§20, §4.4) | explicit base, lexicographic fallback, bad base, unknown trigger target, timed-without-ttl |
| 9 | Evaluation rule references (§21.1) | `evaluation_rule_id_ok`, `evaluation_rule_id_unresolved`, `evaluation_literal_whitespace_mismatch` |

## Self-describing by design

The `cts/` tree is layout-compatible with Appendix F and intentionally
free-standing: it needs nothing from muster to be useful. The manifest resolves
every path relative to itself, each fixture is a real Soul document with a
hand-computed `expected.json`, and each fixture's Markdown body explains which
normative clause it exercises.

That means any Soul.md runtime — in any language — can point its own harness at
`cts/manifest.yaml` and immediately have a shared conformance target. The corpus
is offered upstream as a seed for the official CTS-1 fixture repository the
Soul.md spec lists as unbuilt.

## Expected-output fixtures are computed by hand

`expected.json` files are canonical JSON authored by applying the spec's rules
manually — never captured from whatever the implementation currently emits. A
fixture that "passes because the code produced it" proves nothing; computing the
expectation by hand is what makes the suite a genuine conformance check.
