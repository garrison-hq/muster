---
title: Architecture
description: The spec-agnostic core, the seven adapters, and the invariants that keep them apart.
---

muster is a single npm package with one load-bearing rule: a **spec-agnostic
core** parameterized by a **`SpecAdapter`**. RFC-1 was the first adapter. Six
more followed on the same core, and a new spec can be added as a new adapter
without touching the core.

## Layout

```
src/
  core/            spec-agnostic engine: merge, pipeline, canonical JSON,
                   CTS runner, behavioral runner / graders / client, pass^k
  adapters/        the seven adapters, each self-contained:
    rfc1/            Soul.md: Soul-YAML, keyspace (§25), composition, profiles,
                     state (§20), evaluation (§21), threshold mapping
    skills/          SKILL.md: front matter, layout, trigger routing
    openclaw-sop/    AGENTS.md: rule lint, precedence, probes
    tools/           TOOLS.md: manifest lint, drift, selection
    memory/          MEMORY.md / USER.md: staleness, contradiction
    heartbeat/       HEARTBEAT.md: lint, interval config, probes
    a2a/             Agent Card: schema, signatures, live conformance
  crosslayer/      cross-layer composition and rule-survival checks
  cli/             the thin muster CLI, the only place core and adapters meet
examples/          one runnable example per layer
cts/               the CTS-1 fixture corpus (Appendix F layout)
souls/             the voice-frontdesk example soul
behave/            behavioral manifests + committed acceptance evidence
tests/             vitest suites (unit, cts, adapters, behavioral), fully offline
```

## The invariants

These are enforced by tests, not convention:

- **The core never imports an adapter.** `src/core/` has zero imports from
  `src/adapters/`; the CLI wires an adapter into the core. This is the
  extensibility boundary. A new spec is a new directory under `src/adapters/`,
  nothing else.
- **Determinism.** Static resolution is byte-for-byte reproducible (RFC 8785).
  No wall-clock, no randomness, no map-iteration-order dependence in resolution
  or grading.
- **No baked-in providers or credentials.** The behavioral client talks to any
  OpenAI-compatible endpoint; the API key is read from the environment at
  request time. A test guards against any committed secret.
- **Minimal dependencies.** Runtime deps are `ajv`, `commander`, and `yaml`.

## Built spec-first

muster was built with a spec-driven, multi-agent workflow. The complete trail
for every layer (specification, plan, work-package tasks, acceptance matrices,
and a post-merge review) is preserved under
[`kitty-specs/`](https://github.com/garrison-hq/muster/tree/main/kitty-specs)
in the repository, and doubles as a worked example of the methodology. The
vendored Soul.md RFC-1 spec text is the single normative source for every RFC-1
check; each test cites the section it enforces.
