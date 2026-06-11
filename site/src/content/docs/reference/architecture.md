---
title: Architecture
description: The spec-agnostic core, the RFC-1 adapter, and the invariants that keep them apart.
---

muster is a single npm package with one load-bearing rule: a **spec-agnostic
core** parameterized by a **`SpecAdapter`**. RFC-1 is the first adapter. A second
spec could be added as a new adapter without touching the core.

## Layout

```
src/
  core/            spec-agnostic engine: merge, pipeline, canonical JSON,
                   CTS runner, behavioral runner / graders / client
  adapters/rfc1/   the RFC-1 adapter: Soul-YAML, keyspace (§25), composition,
                   profiles, state (§20), evaluation (§21), threshold mapping
  cli/             the thin `muster` CLI — the only place core and adapter meet
cts/               the CTS-1 fixture corpus (Appendix F layout)
souls/             the voice-frontdesk example soul
behave/            behavioral manifests + committed acceptance evidence
tests/             vitest suites (unit, cts, behavioral) — fully offline
```

## The invariants

These are enforced by tests, not convention:

- **The core never imports an adapter.** `src/core/` has zero imports from
  `src/adapters/`; the CLI wires an adapter into the core. This is the
  extensibility boundary — a new spec is a new directory under `src/adapters/`,
  nothing else.
- **Determinism.** Static resolution is byte-for-byte reproducible (RFC 8785).
  No wall-clock, no randomness, no map-iteration-order dependence in resolution
  or grading.
- **No baked-in providers or credentials.** The behavioral client talks to any
  OpenAI-compatible endpoint; the API key is read from the environment at
  request time. A test guards against any committed secret.
- **Minimal dependencies.** Runtime deps are `ajv`, `commander`, `yaml`.

## Built spec-first

muster was built with a spec-driven workflow. The complete trail —
specification, plan, work-package tasks, acceptance matrices, and a post-merge
mission review — is preserved under
[`kitty-specs/`](https://github.com/garrison-hq/muster/tree/main/kitty-specs)
in the repository, and doubles as a worked example of the methodology. The
vendored Soul.md RFC-1 spec text is the single normative source for every check;
each test cites the section it enforces.
