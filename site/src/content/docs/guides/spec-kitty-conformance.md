---
title: Operator guide to muster's CLI
description: Running every real, shipped muster conformance suite against Ollama/DGX, NIM, or a hosted OpenAI-compatible endpoint, plus the env-var matrix and per-adapter exit codes.
---

muster ships eleven runnable commands today: `check` and `resolve` (single
Soul.md document) plus nine `<layer> run <manifest>` suites (`cts`, `behave`,
`memory`, `heartbeat`, `a2a`, `crosslayer`, `skills`, `sop`, `tools`). Every
one of them is provider-agnostic — the same invocation works unchanged
whether the endpoint is a local Ollama/DGX box, an NVIDIA NIM deployment, or
a hosted OpenAI-compatible API. Only the environment variables you export
beforehand change.

## Bring your own model

```sh
# Local: Ollama / DGX
export MUSTER_ENDPOINT="http://localhost:11434/v1"
export MUSTER_MODEL="qwen2.5:7b-instruct"

# Hosted: NVIDIA NIM (or any OpenAI-compatible provider)
export MUSTER_ENDPOINT="https://integrate.api.nvidia.com/v1"
export MUSTER_MODEL="meta/llama-3.1-8b-instruct"
export MUSTER_API_KEY="nvapi-..."   # env only; never a flag or file

# Hosted: OpenAI
export MUSTER_ENDPOINT="https://api.openai.com/v1"
export MUSTER_MODEL="gpt-4o-mini"
export MUSTER_API_KEY="sk-..."
```

Static-only commands (`check`, `resolve`, `cts run`, `memory run`,
`heartbeat run`, `a2a run` against a static card, `crosslayer run`,
`skills run`, `sop run`, `tools run`) never touch the network at all; their
behavioral cases (where a suite has any) skip gracefully — recorded
`skipped`, never `failed` — when no endpoint is configured. `behave run` is
the one suite with **no static-only mode**.

## The env-var matrix

| Variable | Canonical for | Notes |
|---|---|---|
| `MUSTER_ENDPOINT` | `skills`, `sop`, `crosslayer`, `tools`, `heartbeat` | Read directly from `process.env` by each adapter |
| `MUSTER_BASE_URL` | `skills` **only** — deprecated alias | Honored through v1.2.x, only when `MUSTER_ENDPOINT` is unset; emits a one-line stderr notice when it is the variable that supplies the value. `MUSTER_ENDPOINT` wins silently when both are set. No other adapter accepts this alias |
| `MUSTER_MODEL` | Same readers as `MUSTER_ENDPOINT` | Default `gpt-4o-mini` unless the adapter states otherwise |
| `MUSTER_API_KEY` (fallback `OPENAI_API_KEY`) | Every behavioral/live path, including `behave` | Read at call time only, never logged |
| `--base-url` / `--model` flags | `behave run`, `memory run --behavioral` | These two suites do **not** read `MUSTER_ENDPOINT` at all — `behave` overrides its manifest's own declared endpoint; `memory` defaults to local Ollama |
| `MUSTER_A2A_ENDPOINT` / `MUSTER_A2A_TOKEN` | `a2a run`'s live probes only | A genuinely separate namespace — `a2a` never reads `MUSTER_ENDPOINT` / `MUSTER_MODEL` / `MUSTER_API_KEY` |

## Per-adapter exit codes

There is no single exit-code rule — read this per adapter:

| Situation | Most suites (`check`, `resolve`, `cts`, `memory`, `heartbeat`, `a2a` static, `crosslayer`, `skills`, `sop`, `tools`) | `behave` / `a2a` behavioral |
|---|---|---|
| All cases pass, or all skipped | `0` | `0` |
| At least one case fails | `1` | `1` |
| **Every run of every case errors (endpoint unreachable for the whole run)** | `1` — an ordinary failed run, no special case | `2` — a deliberate execution-fault code |
| Manifest unreadable / invalid | `2` | `2` |
| Unexpected internal error | `2` | `2` |

The muster CLI contract (`contracts/cli.md`) describes the endpoint-fatal
case as a uniform exit-2 rule. `behave` and `a2a` implement it; `skills` and
`sop` do not — that divergence is tracked as a recorded gap (RG-007), not
silently harmonized away here. Demonstrated together against the same
unreachable address:

```sh
MUSTER_ENDPOINT=http://127.0.0.1:9/v1 muster skills run examples/skills/manifest.yaml
echo $?   # 1

MUSTER_ENDPOINT=http://127.0.0.1:9/v1 muster behave run examples/behave/manifest.yaml --base-url http://127.0.0.1:9/v1
echo $?   # 2
```

## Planned, not yet implemented

> **PLANNED — tracked at M4 ([MOES-Media/spec-kitty#24](https://github.com/MOES-Media/spec-kitty/issues/24)) and M6 ([MOES-Media/spec-kitty#25](https://github.com/MOES-Media/spec-kitty/issues/25)).** None of the paths below are runnable from this repo.

`conformance/skprofile/**`, `conformance/crosslayer/manifest.yaml`,
`conformance/behavioral/profiles|directives/*.yaml`, and
`conformance/skills/behavioral-manifest.yaml` do not exist yet in the sibling
`spec-kitty-conformance` repo. Two related paths, `conformance/skills/manifest.yaml`
(54 fixtures) and `conformance/doctrine/*.yaml` (13 directive manifests), **do**
exist there today — but are not muster-repo examples and are not wired into
`examples/**` here, a third category distinct from "planned."

See the full [operator guide](https://github.com/garrison-hq/muster/blob/main/docs/guides/spec-kitty-conformance.md)
in the repository for every command's exact invocation and citation, and
[muster's CLI reference](/muster/reference/cli/) for the flag-level detail.
