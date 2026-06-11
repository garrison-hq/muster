---
title: CLI reference
description: Every muster subcommand, flag, and exit code.
---

One binary, `muster`, four subcommands. Global flags apply to all of them.

## Global flags

| Flag | Default | Meaning |
|------|---------|---------|
| `--mode <strict\|permissive>` | `strict` | Conformance mode. |
| `--json` | off | Machine-readable output on stdout; logs on stderr. |
| `--restrict-refs [dir]` | off | Confine §7.2 reference loading (see [Reference resolution](/muster/guides/reference-resolution/)). |

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | conforming / all cases passed |
| `1` | violations found / ≥ 1 case failed |
| `2` | execution error |

## `muster check <soul.md>`

Static conformance of one document. Emits a §25.1 report. Never touches the
network.

```sh
muster check souls/voice-frontdesk/Soul.md
muster check souls/voice-frontdesk/Soul.md --json --mode permissive
muster check souls/voice-frontdesk/Soul.md --profile concise --state cold_strict
```

Options: `--profile <name>`, `--state <name>`.

## `muster resolve <soul.md>`

Prints the effective configuration after full §7.5 resolution.

```sh
muster resolve souls/voice-frontdesk/Soul.md --output-format canonical-json
```

Options: `--profile`, `--state`, `--output-format <canonical-json|json|yaml>`
(default `canonical-json`, the byte-stable RFC 8785 form CTS-1 compares
against).

## `muster cts run <manifest.yaml>`

Runs a CTS-1 fixture suite (Appendix F manifest). Reports per-case PASS/FAIL and
an aggregate.

```sh
muster cts run cts/manifest.yaml
muster cts run cts/manifest.yaml --filter 'merge_*'
```

Options: `--filter <glob>` (matches case ids).

## `muster behave run <manifest.yaml>`

Behavioral conformance against an OpenAI-compatible endpoint. Emits per-case
verdicts with full transcripts under `--json`.

```sh
muster behave run behave/voice-frontdesk.yaml
muster behave run behave/voice-frontdesk.yaml \
  --base-url https://integrate.api.nvidia.com/v1 \
  --model meta/llama-3.1-8b-instruct --runs 3
```

Options: `--base-url <url>`, `--model <name>`, `--temperature <t>`,
`--runs <n>`. The API key comes only from `MUSTER_API_KEY` (fallback
`OPENAI_API_KEY`) — there is deliberately no key flag.
