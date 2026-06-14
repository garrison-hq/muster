# muster

[![CI](https://github.com/garrison-hq/muster/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/garrison-hq/muster/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@garrison-hq/muster.svg)](https://www.npmjs.com/package/@garrison-hq/muster)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Node 22+](https://img.shields.io/badge/node-22%2B-339933.svg)](https://nodejs.org/)
[![Soul.md RFC-1](https://img.shields.io/badge/Soul.md-RFC--1%20(1.0.0--rc1)-8a2be2.svg)](https://github.com/rokoss21/soul.md)
[![Docs](https://img.shields.io/badge/docs-garrison--hq.github.io%2Fmuster-blue.svg)](https://garrison-hq.github.io/muster)

**muster** (`@garrison-hq/muster`) is a conformance harness for the agent-file
stack, the growing set of plain-text files that define how an AI agent behaves.
A modern agent is not one persona file. It is a persona, a set of skills, a
standard operating procedure, a tool manifest, a memory store, a heartbeat
checklist, and an inter-agent card, each with its own emerging spec. muster
checks every one of them, two ways.

The static check parses each document, validates it against its spec, resolves
composition to a byte-stable canonical form, and reports every violation by path
and section. It runs offline and is deterministic. The behavioral check grades a
bring-your-own model against what each file declares (persona axes, skill
triggers, SOP rules, tool selection, memory recall, heartbeat actions, A2A
skills) over real conversations, against any OpenAI-compatible endpoint.

muster began as the reference **CTS-1** harness for
[Soul.md RFC-1](https://github.com/rokoss21/soul.md) and grew a spec-agnostic
core that now drives seven conformance layers plus cross-layer composition.

Full documentation:
[garrison-hq.github.io/muster](https://garrison-hq.github.io/muster).

## The layers

Each layer has a static mode (offline, deterministic, byte-stable) and most add
a behavioral mode that grades a live model. Static always runs. Behavioral runs
only when an endpoint is configured, and is skipped otherwise.

| Layer | File / spec | What muster checks | Command |
| --- | --- | --- | --- |
| Persona | `Soul.md` ([Soul.md RFC-1](https://github.com/rokoss21/soul.md) / CTS-1) | RFC-1 schema, §25 rules, composition (extends, mixins, profiles, dynamic state) to a canonical form; behavioral verbosity, refusal, and state-shift axes | `check`, `resolve`, `cts run`, `behave run` |
| Skills | `SKILL.md` ([agentskills.io](https://agentskills.io)) | front matter, directory layout, bundled-file safety; behavioral trigger-routing | `skills run` |
| SOP | `AGENTS.md` (OpenClaw SOP) | rule-text presence, precedence definition, tool drift; behavioral compliance and adversarial probes | `sop run` |
| Tools | `TOOLS.md` | manifest lint, environment drift; behavioral tool-selection | `tools run` |
| Memory | `MEMORY.md` / `USER.md` | staleness and contradiction lint; behavioral recall and privacy/leak probes | `memory run` |
| Heartbeat | `HEARTBEAT.md` | static lint and interval-config checks; behavioral action-diff, idempotency, and quiet-ack | `heartbeat run` |
| A2A | Agent Card (JSON) | card schema and offline signature lint; live skill-behavior, auth-negative, and signed-card conformance | `a2a run` |
| Cross-layer | composition of the above | precedence, contradiction, and rule survival across a full layer stack | `crosslayer run` |

## Install

Requires Node 22 or newer.

```bash
# As a CLI tool
npm install -g @garrison-hq/muster
muster --help
```

Or run from source with [pnpm](https://pnpm.io):

```bash
git clone https://github.com/garrison-hq/muster.git && cd muster
pnpm install
pnpm build          # tsc (strict) + schema copy to dist/
pnpm test           # the full offline suite: unit, CTS, and adapters
```

From a source checkout, run the CLI with `node dist/cli/index.js …` or
`pnpm dev …` instead of the global `muster` binary.

## Quickstart

Every command shares two global flags, `--mode <strict|permissive>` (default
`strict`) and `--json`, and the same exit codes: `0` conforming or all passed,
`1` violations or at least one case failed, `2` execution error (unreadable or
invalid manifest).

The package ships a runnable [`examples/`](./examples) directory with one
self-contained example per layer. Run them from the repository (or installed
package) root:

```bash
# Persona: static conformance of one document (§25.1 report; never touches the network)
muster check examples/soul/Soul.md --json

# Persona: effective configuration after full §7.5 resolution
# (canonical-json is the byte-stable RFC 8785 form CTS-1 compares against)
muster resolve examples/soul/Soul.md --output-format canonical-json

# Persona: the CTS-1 static fixture suite (Appendix F manifest)
muster cts run examples/cts/manifest.yaml

# Skills: lint SKILL.md front matter, layout, and bundled-file safety
muster skills run examples/skills/manifest.yaml

# SOP: lint AGENTS.md rule-text presence, precedence, and tool drift
muster sop run examples/sop/manifest.yaml

# Tools: lint a TOOLS.md manifest and check it against the environment
muster tools run examples/tools/manifest.json

# Memory: lint MEMORY.md / USER.md for staleness and contradiction
muster memory run examples/memory/manifest.json

# Heartbeat: lint HEARTBEAT.md and its interval configuration
muster heartbeat run examples/heartbeat/manifest.json

# A2A: lint an Agent Card and verify its signature offline
muster a2a run examples/a2a/manifest.json

# Cross-layer: check composition, precedence, and rule survival across a stack
muster crosslayer run examples/crosslayer/manifest.yaml
```

See [`examples/README.md`](./examples/README.md) for the full table.

### Behavioral mode (bring your own model)

The static commands above are fully offline. To grade a live model, point a
layer at any OpenAI-compatible `/chat/completions` endpoint, such as local
Ollama, NVIDIA NIM, or OpenAI:

```bash
# Persona axes, k-of-n graded over multi-turn conversations
muster behave run examples/behave/manifest.yaml --base-url https://api.openai.com/v1 --model gpt-4o

# Adapter behavioral cases switch on via environment variables
MUSTER_ENDPOINT=https://api.openai.com/v1 muster heartbeat run examples/heartbeat/manifest.json
MUSTER_ENDPOINT=https://api.openai.com/v1 muster crosslayer run examples/crosslayer/manifest.yaml
MUSTER_A2A_ENDPOINT=https://my-agent.example.com muster a2a run examples/a2a/manifest.json
```

| Layer | Endpoint variable(s) | Model variable | Default model |
| --- | --- | --- | --- |
| `behave` | `--base-url` / manifest `base_url` | `--model` / manifest `model` | (manifest) |
| `memory` | `--base-url` (with `--behavioral`) | `--model` | `llama3.2` |
| `heartbeat`, `crosslayer` | `MUSTER_ENDPOINT` | `MUSTER_MODEL` | `gpt-4o-mini` |
| `a2a` | `MUSTER_A2A_ENDPOINT` (+ `MUSTER_A2A_TOKEN`) | n/a | n/a |

The API key is read from `MUSTER_API_KEY` (fallback `OPENAI_API_KEY`) at request
time, and A2A reads from its own isolated namespace. There is deliberately no
key flag, no key file, and no key field in any manifest. A manifest carries only
the name of the environment variable, never the value. Keys must never be
committed, and a repository invariant test enforces that.

## Documentation

The deep material lives on the docs site:

- [Getting started](https://garrison-hq.github.io/muster/getting-started/): install and first checks.
- [The layers](https://garrison-hq.github.io/muster/reference/layers/): every layer, what it checks, and its command and environment variables.
- [Static conformance](https://garrison-hq.github.io/muster/guides/static-conformance/): the parse, validate, resolve, report pipeline.
- [Behavioral conformance](https://garrison-hq.github.io/muster/guides/behavioral-conformance/): the axes, k-of-n grading, and BYOM endpoints.
- [Reference resolution](https://garrison-hq.github.io/muster/guides/reference-resolution/): supported schemes, the `--restrict-refs` flag, and the trust model (RFC-1 §7.2).
- [CLI reference](https://garrison-hq.github.io/muster/reference/cli/): every command and flag.
- [CTS-1 coverage](https://garrison-hq.github.io/muster/reference/cts-1-coverage/): how the fixtures map onto the nine §25.2 categories.
- [Architecture](https://garrison-hq.github.io/muster/reference/architecture/): the spec-agnostic core and the adapters.

## Repository layout

```
src/
  core/            spec-agnostic engine: merge, pipeline, canonical JSON,
                   CTS runner, behavioral runner / graders / client, pass^k
  adapters/        the seven conformance adapters, each self-contained:
    rfc1/            Soul.md: Soul-YAML, keyspace (§25), composition,
                     profiles, state (§20), evaluation (§21), thresholds
    skills/          SKILL.md: front matter, layout, trigger routing
    openclaw-sop/    AGENTS.md: rule lint, precedence, probes
    tools/           TOOLS.md: manifest lint, drift, selection
    memory/          MEMORY.md / USER.md: staleness and contradiction
    heartbeat/       HEARTBEAT.md: lint, interval config, behavioral probes
    a2a/             Agent Card: schema, signatures, live conformance
  crosslayer/      cross-layer composition and rule-survival checks
  cli/             the thin muster CLI (the only place core and adapters meet)
examples/          one runnable example per layer (shipped with the package)
cts/               the CTS-1 fixture corpus (Appendix F layout: manifest + fixtures)
souls/             the voice-frontdesk example soul
behave/            behavioral manifests + committed acceptance evidence
site/              the documentation site (Astro + Starlight; standalone package)
tests/             vitest suites (unit, cts, adapters, behavioral), fully offline
```

## How it was built

muster was built with a spec-driven, multi-agent workflow. The complete trail
for every layer (specification, plan, work-package tasks, acceptance matrices,
and post-merge reviews) is preserved under [`kitty-specs/`](./kitty-specs),
alongside the Claude Code agent definitions and mission orchestration under
[`.claude/`](./.claude), as a worked example of the methodology. The normative
Soul.md RFC-1 text is vendored at `.kittify/reference/soul-spec.md` (see
[`NOTICE`](./NOTICE) for its attribution; it remains the property of its upstream
author) and is the single source of truth for every RFC-1 check. Each test cites
the section it enforces.

## Contributing

Issues and PRs are welcome. The one rule that matters most: every conformance
behavior traces to a section of the spec it enforces, cited in the code and the
test name. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the architecture
invariants (spec-agnostic core, the core-to-adapter boundary, determinism, no
baked-in providers, minimal dependencies) and the PR checklist. By participating
you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).

Security-sensitive reports go through the private channel in
[`SECURITY.md`](./SECURITY.md), not public issues.

## License

[Apache-2.0](./LICENSE) © 2026 Jeroen Nouws and muster contributors. The
vendored Soul.md specification text is excluded from this license and remains
the property of its upstream author(s); see [`NOTICE`](./NOTICE).
