# muster

[![CI](https://github.com/garrison-hq/muster/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/garrison-hq/muster/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Node ≥ 22](https://img.shields.io/badge/node-%E2%89%A522-339933.svg)](https://nodejs.org/)
[![Soul.md RFC-1](https://img.shields.io/badge/Soul.md-RFC--1%20(1.0.0--rc1)-8a2be2.svg)](https://github.com/rokoss21/soul.md)
[![Docs](https://img.shields.io/badge/docs-garrison--hq.github.io%2Fmuster-blue.svg)](https://garrison-hq.github.io/muster)

**muster** (`@garrison-hq/muster`) is a reference **CTS-1 conformance harness**
for [Soul.md RFC-1](https://github.com/rokoss21/soul.md) (`1.0.0-rc1`), the
portable persona-definition format. It checks two things:

- **The file** — parses a `SOUL.md`, validates it against the RFC-1 schema and
  the §25 conformance rules, resolves composition (extends / mixins / profiles /
  dynamic state) to a byte-stable canonical form, and reports every violation by
  path and section. Fully offline and deterministic.
- **The model** — grades a bring-your-own model against a soul's declared axes
  (verbosity, brief refusals, dynamic state shifts) over multi-turn
  conversations, against any OpenAI-compatible endpoint.

📖 **Full documentation: [garrison-hq.github.io/muster](https://garrison-hq.github.io/muster)**

## Quickstart

Requires Node ≥ 22 and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm build          # tsc (strict) + schema copy → dist/
pnpm test           # vitest: unit tests + the full CTS fixture suite, fully offline
```

The CLI is one binary with four subcommands. Global flags: `--mode
<strict|permissive>` (default `strict`) and `--json`. Exit codes are uniform:
`0` conforming / all passed, `1` violations / ≥ 1 case failed, `2` execution
error.

```bash
# Static conformance of one document (§25.1 report; never touches the network)
muster check souls/voice-frontdesk/Soul.md --json

# Effective configuration after full §7.5 resolution
# (canonical-json = byte-stable RFC 8785, the CTS-1 comparison form)
muster resolve souls/voice-frontdesk/Soul.md --output-format canonical-json

# The CTS-1 static fixture suite (Appendix F manifest)
muster cts run cts/manifest.yaml

# Behavioral conformance against a live OpenAI-compatible endpoint
muster behave run behave/voice-frontdesk.yaml
```

Without a global install, run `node dist/cli/index.js …` or `pnpm dev …`.

`behave run` talks to any OpenAI-compatible `/chat/completions` endpoint —
local Ollama, NVIDIA NIM, OpenAI, anything. Only `--base-url` / `--model`
change between providers. The API key is read from `MUSTER_API_KEY` (fallback
`OPENAI_API_KEY`) at request time: there is deliberately no key flag, no key
file, and no key field in manifests, and keys must never be committed.

## Documentation

The deep material lives on the docs site:

- **[Getting started](https://garrison-hq.github.io/muster/getting-started/)** — install and first checks.
- **[Static conformance](https://garrison-hq.github.io/muster/guides/static-conformance/)** — the parse → validate → resolve → report pipeline.
- **[Behavioral conformance](https://garrison-hq.github.io/muster/guides/behavioral-conformance/)** — the three axes, k-of-n grading, and BYOM endpoints.
- **[Reference resolution](https://garrison-hq.github.io/muster/guides/reference-resolution/)** — supported schemes, the `--restrict-refs` flag, and the trust model (RFC-1 §7.2).
- **[CLI reference](https://garrison-hq.github.io/muster/reference/cli/)** — every command and flag.
- **[CTS-1 coverage](https://garrison-hq.github.io/muster/reference/cts-1-coverage/)** — how the fixtures map onto the nine §25.2 categories.
- **[Behavioral thresholds](https://garrison-hq.github.io/muster/reference/thresholds/)** — the word-count mapping and overrides.
- **[Architecture](https://garrison-hq.github.io/muster/reference/architecture/)** — the spec-agnostic core and the RFC-1 adapter.

## Repository layout

```
src/
  core/            spec-agnostic engine: merge, pipeline, canonical JSON,
                   CTS runner, behavioral runner/graders/client
  adapters/rfc1/   the RFC-1 adapter: Soul-YAML, keyspace (§25), composition,
                   profiles, state (§20), evaluation (§21), thresholds
  cli/             the thin `muster` CLI (the only core↔adapter meeting point)
cts/               the CTS-1 fixture corpus (Appendix F layout: manifest + fixtures)
souls/             the voice-frontdesk example soul
behave/            behavioral manifests + committed acceptance evidence
site/              the documentation site (Astro + Starlight; standalone package)
tests/             vitest suites (unit, cts, behavioral) — fully offline
```

The `cts/` tree is laid out per RFC-1 **Appendix F**; each fixture's Markdown
body explains the normative clause it exercises.

## How it was built

muster was built with a spec-driven workflow; the complete trail —
specification, plan, work-package tasks, acceptance matrices, and a post-merge
mission review — is preserved under [`kitty-specs/`](./kitty-specs) as a worked
example of the methodology. The normative Soul.md RFC-1 text is vendored at
`.kittify/reference/soul-spec.md` (see [`NOTICE`](./NOTICE) for its attribution;
it remains the property of its upstream author) and is the single source of
truth for every check — each test cites the section it enforces.

## Contributing

Issues and PRs are welcome. The one rule that matters most: **every conformance
behavior traces to a section of the vendored spec**, cited in the code and the
test name. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the architecture
invariants (spec-agnostic core, determinism, no baked-in providers, minimal
dependencies) and the PR checklist. By participating you agree to the
[Code of Conduct](./CODE_OF_CONDUCT.md).

Security-sensitive reports go through the private channel in
[`SECURITY.md`](./SECURITY.md), not public issues.

## License

[Apache-2.0](./LICENSE) © 2026 Jeroen Nouws and muster contributors. The
vendored Soul.md specification text is excluded from this license and remains
the property of its upstream author(s); see [`NOTICE`](./NOTICE).
