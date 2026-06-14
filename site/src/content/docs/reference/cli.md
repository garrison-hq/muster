---
title: CLI reference
description: Every muster command, flag, and exit code, across all seven layers.
---

One binary, `muster`. The persona layer has four commands (`check`, `resolve`,
`cts run`, `behave run`); each other layer has one `run` command. The global
flags and exit codes below apply everywhere.

From a source checkout, replace `muster` with `node dist/cli/index.js`.

## Global flags

| Flag | Default | Meaning |
|------|---------|---------|
| `--mode <strict\|permissive>` | `strict` | Conformance mode. |
| `--json` | off | Machine-readable output on stdout; logs on stderr. |

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | conforming, or all cases passed |
| `1` | violations found, or at least one case failed |
| `2` | execution error (unreadable file, bad manifest, endpoint down) |

## Persona (Soul.md)

### `muster check <soul.md>`

Static conformance of one document. Emits a §25.1 report. Never touches the
network.

```sh
muster check examples/soul/Soul.md
muster check examples/soul/Soul.md --json --mode permissive
muster check examples/soul/Soul.md --profile concise --state cold_strict
```

Options: `--profile <name>`, `--state <name>`, `--restrict-refs [dir]` (confine
§7.2 reference loading; see
[Reference resolution](/muster/guides/reference-resolution/)), and
`--adapter <rfc1|heartbeat|a2a>` to statically lint a heartbeat or A2A file
instead of a Soul.md.

### `muster resolve <soul.md>`

Prints the effective configuration after full §7.5 resolution.

```sh
muster resolve examples/soul/Soul.md --output-format canonical-json
```

Options: `--profile`, `--state`, `--restrict-refs [dir]`, and
`--output-format <canonical-json|json|yaml>` (default `canonical-json`, the
byte-stable RFC 8785 form CTS-1 compares against).

### `muster cts run <manifest.yaml>`

Runs a CTS-1 fixture suite (Appendix F manifest). Reports per-case PASS/FAIL and
an aggregate.

```sh
muster cts run examples/cts/manifest.yaml
muster cts run examples/cts/manifest.yaml --filter 'merge_*'
```

Options: `--filter <glob>` (matches case ids).

### `muster behave run <manifest.yaml>`

Behavioral conformance against an OpenAI-compatible endpoint. Emits per-case
verdicts, with full transcripts under `--json`.

```sh
muster behave run examples/behave/manifest.yaml
muster behave run examples/behave/manifest.yaml \
  --base-url https://integrate.api.nvidia.com/v1 \
  --model meta/llama-3.1-8b-instruct --runs 3
```

Options: `--base-url <url>`, `--model <name>`, `--temperature <t>`,
`--runs <n>`. The API key comes only from `MUSTER_API_KEY` (fallback
`OPENAI_API_KEY`). There is deliberately no key flag.

## Adapter layers

Each adapter layer has a single `run` command that takes a manifest. Static
cases always run offline. Behavioral cases run only when the relevant endpoint
variable is set, and are skipped (not failed) otherwise. See
[The layers](/muster/reference/layers/) for what each one checks.

### `muster skills run <manifest.yaml>`

Lints `SKILL.md` front matter, layout, and bundled-file safety; runs
trigger-routing conformance when `MUSTER_ENDPOINT` is set.

```sh
muster skills run examples/skills/manifest.yaml
```

### `muster sop run <manifest.yaml>`

Lints an `AGENTS.md` SOP for rule-text presence, precedence, and tool drift; runs
compliance and adversarial probes when `MUSTER_ENDPOINT` is set. (The adapter is
named `openclaw-sop` internally.)

```sh
muster sop run examples/sop/manifest.yaml
```

### `muster tools run <manifest.json>`

Lints a `TOOLS.md` manifest and checks it against an environment descriptor; runs
tool-selection probes when `MUSTER_ENDPOINT` is set. A case may set
`expect: "fail"` for a negative test.

```sh
muster tools run examples/tools/manifest.json
```

### `muster memory run <manifest.json>`

Lints `MEMORY.md` / `USER.md` for staleness and contradiction. Add `--behavioral`
for recall and privacy probes.

```sh
muster memory run examples/memory/manifest.json
muster memory run examples/memory/manifest.json --behavioral \
  --base-url http://localhost:11434/v1 --model llama3.2
```

Options: `--behavioral`, `--base-url <url>` (default
`http://localhost:11434/v1`), `--model <name>` (default `llama3.2`).

### `muster heartbeat run <manifest.json>`

Lints a `HEARTBEAT.md` and its interval config; runs action-diff, idempotency,
and quiet-ack probes when `MUSTER_ENDPOINT` is set (`MUSTER_MODEL` defaults to
`gpt-4o-mini`).

```sh
muster heartbeat run examples/heartbeat/manifest.json
MUSTER_ENDPOINT=https://api.openai.com/v1 muster heartbeat run examples/heartbeat/manifest.json
```

### `muster a2a run <manifest.json>`

Lints an A2A agent card and verifies signatures offline; runs live skill,
auth-negative, and signed-card checks when `MUSTER_A2A_ENDPOINT` is set.

```sh
muster a2a run examples/a2a/manifest.json
MUSTER_A2A_ENDPOINT=https://my-agent.example.com muster a2a run examples/a2a/manifest.json
```

A2A uses its own environment namespace: `MUSTER_A2A_ENDPOINT`, `MUSTER_A2A_TOKEN`
(authorized leg of the auth probe), and `MUSTER_A2A_TIMEOUT_MS` (default
`10000`). It never reads the variables the other layers use.

### `muster crosslayer run <manifest.yaml>`

Checks composition, precedence, and rule survival across a layer stack. Static
cases always run; behavioral rule-survival cases use `MUSTER_ENDPOINT` or an
endpoint block in the manifest.

```sh
muster crosslayer run examples/crosslayer/manifest.yaml --static-only
MUSTER_ENDPOINT=https://api.openai.com/v1 muster crosslayer run examples/crosslayer/manifest.yaml
```

Options: `--static-only` (skip behavioral cases without an endpoint).

## Environment variables

| Variable | Used by | Meaning |
|----------|---------|---------|
| `MUSTER_API_KEY` (fallback `OPENAI_API_KEY`) | all behavioral layers | API key, read at request time. |
| `MUSTER_ENDPOINT` | skills, sop, tools, heartbeat, crosslayer | OpenAI-compatible base URL. |
| `MUSTER_MODEL` | skills, sop, tools, heartbeat, crosslayer | Model name (default `gpt-4o-mini`). |
| `MUSTER_A2A_ENDPOINT` | a2a | Deployed A2A agent base URL. |
| `MUSTER_A2A_TOKEN` | a2a | Bearer token for the authorized auth probe. |
| `MUSTER_A2A_TIMEOUT_MS` | a2a | Request timeout in ms (default `10000`). |
