---
title: The layers
description: The seven conformance layers muster checks, plus cross-layer composition. What each one validates statically, what it grades behaviorally, and the command and environment variables for each.
---

muster checks seven layers of the agent-file stack, plus how those layers
compose. Every layer has a static mode that runs offline and produces the same
result every time. Most layers also have a behavioral mode that grades a live
model, and that mode runs only when you give it an endpoint. When no endpoint is
set, the behavioral cases are skipped and recorded as skipped, not counted as
failures.

Every command shares two global flags, `--mode <strict|permissive>` (default
`strict`) and `--json`, and the same exit codes: `0` conforming or all passed,
`1` violations or at least one failure, `2` execution error such as an
unreadable or invalid manifest.

The examples below assume a source checkout. Replace `node dist/cli/index.js`
with `muster` if you installed the package globally.

## Persona (Soul.md)

The original layer. A `Soul.md` file defines an agent's voice, values,
interaction style, safety posture, composition from reusable mixins, and
reactive state. This is the [Soul.md RFC-1](https://github.com/rokoss21/soul.md)
format, and muster is its reference CTS-1 harness.

Static checking parses the front matter, enforces the Soul-YAML subset (anchors,
aliases, merge keys, and tags are refused rather than expanded), validates
against the Appendix E JSON Schema and the §25 keyspace rules, and resolves
composition to a byte-stable canonical form. Behavioral grading scores a model
on three axes: verbosity, brief refusals, and dynamic state shifts.

```sh
# Validate one document and print a §25.1 report
node dist/cli/index.js check examples/soul/Soul.md --json

# Print the effective config after full §7.5 resolution
node dist/cli/index.js resolve examples/soul/Soul.md --output-format canonical-json

# Run the CTS-1 static fixture suite
node dist/cli/index.js cts run examples/cts/manifest.yaml

# Grade a live model against the soul's axes
node dist/cli/index.js behave run examples/behave/manifest.yaml --base-url https://api.openai.com/v1 --model gpt-4o
```

`check` also accepts `--adapter rfc1|heartbeat|a2a` for a static lint of those
file types, plus `--profile`, `--state`, and `--restrict-refs [dir]` to confine
reference loading. `behave run` reads the API key from `MUSTER_API_KEY`, falling
back to `OPENAI_API_KEY`.

## Skills (SKILL.md)

A skill is a directory with a `SKILL.md` and optional bundled files, following
the [agentskills.io](https://agentskills.io) spec. Static checking validates the
front matter, the directory layout, and bundled-file safety, so a skill cannot
reference a file outside its own directory or collide with a reserved name.
Behavioral checking sends trigger queries to a model and confirms it routes to
the skill when it should and stays away when it should not.

```sh
node dist/cli/index.js skills run examples/skills/manifest.yaml
```

The manifest lists skill directories and the cases to run against each. Trigger
conformance runs when `MUSTER_ENDPOINT` is set.

## SOP (AGENTS.md)

An `AGENTS.md` file is a standard operating procedure: the rules an agent must
follow and the order they take precedence in. Static checking confirms each rule
in the manifest has matching text in the document, flags precedence that is left
undefined, and detects drift between the tools the SOP names and the tools the
environment actually offers. Behavioral checking runs compliance probes (does
the model follow the rule) and adversarial probes (can a crafted message get it
to break the rule).

```sh
node dist/cli/index.js sop run examples/sop/manifest.yaml
```

The probe cases run when `MUSTER_ENDPOINT` is set. The CLI command is `sop`; the
adapter is named `openclaw-sop` internally.

## Tools (TOOLS.md)

A `TOOLS.md` manifest declares the functions an agent may call and their
parameters. Static checking lints the manifest for missing sections, duplicate
tool names, and parameter problems, and can compare it against an environment
descriptor to catch drift. Behavioral checking presents the model with a
scenario and confirms it selects the right tool.

```sh
node dist/cli/index.js tools run examples/tools/manifest.json
```

A case may set `expect: "fail"` for a negative test, where the case passes only
when the lint, drift, or selection check produces at least one failure.

## Memory (MEMORY.md / USER.md)

Memory files hold what an agent should remember: `MEMORY.md` for facts it has
learned and `USER.md` for facts about the person it serves. Static checking
finds stale facts and contradictions between the two files. It reads no clock;
the reference date comes from the manifest, so the same input always produces
the same findings. Behavioral checking runs recall probes (does the model use a
fact it should know) and privacy probes (does it leak a fact it should keep
private).

```sh
# Static lint
node dist/cli/index.js memory run examples/memory/manifest.json

# Add behavioral recall and privacy probes
node dist/cli/index.js memory run examples/memory/manifest.json --behavioral --base-url http://localhost:11434/v1 --model llama3.2
```

The behavioral endpoint defaults to a local Ollama instance
(`http://localhost:11434/v1`, model `llama3.2`) and is overridable with
`--base-url` and `--model`.

## Heartbeat (HEARTBEAT.md)

A `HEARTBEAT.md` is the checklist an agent works through on a schedule. Static
checking lints the document and its interval configuration. Behavioral checking
covers three cases: action-diff (does the model take the right action for the
current tick), idempotency (does a repeated tick avoid repeating work already
done), and quiet-ack (does it stay silent when there is nothing to do).

```sh
# Static lint and interval checks
node dist/cli/index.js heartbeat run examples/heartbeat/manifest.json

# Add behavioral probes
MUSTER_ENDPOINT=https://api.openai.com/v1 node dist/cli/index.js heartbeat run examples/heartbeat/manifest.json
```

Behavioral cases run when `MUSTER_ENDPOINT` is set, with `MUSTER_MODEL`
defaulting to `gpt-4o-mini`.

## A2A (Agent Card)

An A2A agent card is the JSON document an agent publishes to describe itself to
other agents: its skills, its authentication, and an optional signature. Static
checking validates the card schema and verifies signatures offline when the JWKS
is a local file. Live checking calls a deployed agent to confirm a skill behaves
as advertised, that unauthorized requests are rejected, and that a signed card
verifies against its live key set.

```sh
# Static card lint
node dist/cli/index.js a2a run examples/a2a/manifest.json

# Live conformance against a deployed agent
MUSTER_A2A_ENDPOINT=https://my-agent.example.com node dist/cli/index.js a2a run examples/a2a/manifest.json
```

A2A uses its own environment namespace and never touches the variables the other
layers use. Set `MUSTER_A2A_ENDPOINT` to enable the live cases,
`MUSTER_A2A_TOKEN` for the authorized leg of the auth probe, and
`MUSTER_A2A_TIMEOUT_MS` to change the request timeout (default `10000`).

## Cross-layer composition

Layers do not run in isolation. A persona, an SOP, and a skill stack on top of
each other, and the combination can behave differently than any single layer
predicts. The cross-layer checks assemble a layer stack, lint it for
composition problems such as contradictions and undefined precedence, and run
rule-survival cases that confirm a rule declared in one layer still holds once
the others are applied.

```sh
# Static composition checks only
node dist/cli/index.js crosslayer run examples/crosslayer/manifest.yaml --static-only

# Add behavioral rule-survival cases
MUSTER_ENDPOINT=https://api.openai.com/v1 node dist/cli/index.js crosslayer run examples/crosslayer/manifest.yaml
```

Behavioral cases use `MUSTER_ENDPOINT` or an endpoint block in the manifest. Use
`--static-only` to skip them without setting up an endpoint.

## A note on credentials

No command takes an API key as a flag, reads one from a manifest, or writes one
to disk. A manifest names the environment variable to read; muster resolves the
value from the environment at request time. A repository invariant test fails
the build if a secret-shaped string is ever committed.
