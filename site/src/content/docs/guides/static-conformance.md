---
title: Static conformance
description: What muster checks when it validates and resolves a SOUL.md file.
---

Static conformance tests the **file**. Given a `SOUL.md`, muster runs a
deterministic pipeline (parse, validate, resolve, report) and emits a
machine-readable §25.1 conformance report. It needs zero network access and is
byte-for-byte reproducible.

## The pipeline

1. **Front-matter parsing (§3.1.1).** Only the first YAML front-matter block is
   configuration. The Markdown body is never interpreted (except few-shot
   examples per the spec).
2. **Soul-YAML enforcement (§4.2).** Anchors, aliases, merge keys, and custom
   tags are detected at the AST level and **refused without being expanded**.
   Expansion would break determinism, so muster never applies it.
3. **Validation (Appendix E + §25).** Two layers: the vendored Appendix E JSON
   Schema via Ajv, then the §25 keyspace and semantic rules the permissive
   schema cannot express (unknown-key handling per mode, percent/`float01`
   ranges, BCP-47 locale, profile rules).
4. **Composition resolution (§7.5 / Appendix G).** `extends`, then `mixins`,
   then local, then profile, then state, merged with Standard Merge (§8):
   scalars replace, maps deep-merge, lists replace entirely, `null` is a value
   (not a deletion). `profiles` / `profile_overrides` are root-owned and
   stripped from bases and mixins. Cycles are detected and fail in strict mode.
5. **Report (§25.1).** `spec`, `soul_id`, `mode`, `profile`, `state`, `ok`, and
   `errors` / `warnings` where every entry carries a `path` and `message`.

## Strict vs permissive

`--mode strict` (default) rejects unknown top-level keys outside the RFC-1
keyspace and fails on cycles, bad ranges, undefined trigger targets, and the
like. `--mode permissive` downgrades those to warnings where the spec allows,
but **never** silently applies a forbidden feature. Forbidden YAML is refused
in both modes.

## Canonical output

```sh
muster resolve souls/voice-frontdesk/Soul.md --output-format canonical-json
```

`canonical-json` is RFC 8785 (JCS), the byte-stable form CTS-1 mandates for
cross-runtime comparison (Appendix F.2). Resolving the same inputs twice yields
identical bytes, and that is what makes the fixture suite's expectations exact.

See [CTS-1 coverage](/muster/reference/cts-1-coverage/) for the full map of
which fixtures exercise which conformance categories.
