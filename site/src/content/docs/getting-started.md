---
title: Getting started
description: Install muster, run the static suite offline, and grade a model against a soul.
---

muster is a reference **CTS-1 conformance harness** for
[Soul.md RFC-1](https://github.com/rokoss21/soul.md) (`1.0.0-rc1`). It validates
Soul documents statically, resolves their effective configuration to a
byte-stable canonical form, runs the CTS-1 fixture suite, and grades live model
behavior against a soul's declared thresholds.

## Prerequisites

- Node ≥ 22 and [pnpm](https://pnpm.io)
- For behavioral checks only: an OpenAI-compatible endpoint (local
  [Ollama](https://ollama.com), NVIDIA NIM, OpenAI, or any compatible provider)

## Install and build

```sh
git clone https://github.com/garrison-hq/muster
cd muster
pnpm install
pnpm build          # tsc (strict) + schema copy → dist/
pnpm test           # vitest: unit tests + the full CTS fixture suite, fully offline
```

The CLI is one binary, `muster`, with four subcommands. Without a global
install, run `node dist/cli/index.js …` or `pnpm dev …`.

Global flags: `--mode <strict|permissive>` (default `strict`) and `--json`
(machine output on stdout, logs on stderr). Exit codes are uniform across
commands:

| Code | Meaning |
|------|---------|
| `0` | conforming / all cases passed |
| `1` | violations found / ≥ 1 case failed |
| `2` | execution error (unreadable file, bad manifest, endpoint down) |

## Your first checks

```sh
# 1. Static conformance of one document (§25.1 report; never touches the network)
muster check souls/voice-frontdesk/Soul.md --json

# 2. Effective configuration after full §7.5 resolution, in the CTS-1
#    comparison form (byte-stable RFC 8785 canonical JSON — Appendix F.2)
muster resolve souls/voice-frontdesk/Soul.md --output-format canonical-json

# 3. The CTS-1 static fixture suite (Appendix F manifest)
muster cts run cts/manifest.yaml

# 4. Behavioral conformance against a live OpenAI-compatible endpoint
muster behave run behave/voice-frontdesk.yaml
```

## Where to next

- [Static conformance](/muster/guides/static-conformance/) — what the static
  spine checks, clause by clause.
- [Behavioral conformance](/muster/guides/behavioral-conformance/) — grading a
  model against a soul's axes.
- [CLI reference](/muster/reference/cli/) — every command and flag.
