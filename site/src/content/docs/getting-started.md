---
title: Getting started
description: Install muster, run a static check offline, and grade a model against a file.
---

muster is a conformance harness for the agent-file stack. It validates each file
an agent is built from against its spec, and it grades a live model against what
those files declare. Static checks run offline and produce the same bytes every
time. Behavioral checks talk to any OpenAI-compatible endpoint.

## Prerequisites

- Node 22 or newer.
- For behavioral checks only: an OpenAI-compatible endpoint, such as local
  [Ollama](https://ollama.com), NVIDIA NIM, or OpenAI.

## Install

Install the published package and use the `muster` binary:

```sh
npm install -g @garrison-hq/muster
muster --help
```

Or work from a source checkout with [pnpm](https://pnpm.io):

```sh
git clone https://github.com/garrison-hq/muster
cd muster
pnpm install
pnpm build          # tsc (strict) + schema copy to dist/
pnpm test           # the full offline suite: unit, CTS, and adapters
```

From a checkout, run the CLI with `node dist/cli/index.js …` or `pnpm dev …`
instead of the global `muster`.

Every command shares two global flags, `--mode <strict|permissive>` (default
`strict`) and `--json` (machine output on stdout, logs on stderr), and the same
exit codes:

| Code | Meaning |
|------|---------|
| `0` | conforming, or all cases passed |
| `1` | violations found, or at least one case failed |
| `2` | execution error: unreadable file, bad manifest, or endpoint down |

## Your first checks

The package ships an `examples/` directory with one runnable example per layer.
The commands below use repo-relative paths, so run them from the repository or
installed-package root. Paths inside a manifest resolve relative to the manifest
file, so a manifest itself runs from any directory.

```sh
# Persona: validate one Soul.md and print a §25.1 report (offline)
muster check examples/soul/Soul.md --json

# Persona: effective config after §7.5 resolution, in the CTS-1 comparison form
muster resolve examples/soul/Soul.md --output-format canonical-json

# Lint the other layers, all offline
muster skills run examples/skills/manifest.yaml
muster sop run examples/sop/manifest.yaml
muster tools run examples/tools/manifest.json
muster memory run examples/memory/manifest.json
muster heartbeat run examples/heartbeat/manifest.json
muster a2a run examples/a2a/manifest.json
muster crosslayer run examples/crosslayer/manifest.yaml
```

To grade a live model, point a layer at an endpoint. The API key comes from
`MUSTER_API_KEY` (or `OPENAI_API_KEY`) in the environment, never a flag or file:

```sh
muster behave run examples/behave/manifest.yaml --base-url https://api.openai.com/v1 --model gpt-4o
```

## Where to next

- [The layers](/muster/reference/layers/): every layer, what it checks, and its
  command and environment variables.
- [Static conformance](/muster/guides/static-conformance/): what the static
  persona checks do, clause by clause.
- [Behavioral conformance](/muster/guides/behavioral-conformance/): grading a
  model against a soul's axes.
- [CLI reference](/muster/reference/cli/): every command and flag.
