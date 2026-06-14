# muster examples

Ready-to-run examples for every `muster` conformance layer. All commands are run from the **repo root**.

Static-path examples exit 0 with no environment set. Examples marked **needs endpoint** skip live grading gracefully and still exit 0, unless every run fails (endpoint unreachable → exit 2).

## Commands

| Layer | Command | Description | Mode |
|---|---|---|---|
| soul (check) | `node dist/cli/index.js check examples/soul/Soul.md` | RFC-1 static conformance check on a Soul.md document | static-only |
| soul (resolve) | `node dist/cli/index.js resolve examples/soul/Soul.md --output-format yaml` | Print the effective Soul.md configuration after full resolution | static-only |
| cts | `node dist/cli/index.js cts run examples/cts/manifest.yaml` | CTS-1 fixture suite: Soul.md static validation cases | static-only |
| behave | `node dist/cli/index.js behave run examples/behave/manifest.yaml` | Behavioral grading: multi-turn verbosity and refusal checks | needs endpoint |
| memory | `node dist/cli/index.js memory run examples/memory/manifest.json` | Memory adapter: staleness and contradiction lint on MEMORY.md / USER.md | static-only |
| heartbeat | `node dist/cli/index.js heartbeat run examples/heartbeat/manifest.json` | Heartbeat adapter: static lint on a HEARTBEAT.md checklist | static-only |
| a2a | `node dist/cli/index.js a2a run examples/a2a/manifest.json` | A2A Agent Card adapter: static lint on an agent card JSON | static-only |
| crosslayer | `node dist/cli/index.js crosslayer run examples/crosslayer/manifest.yaml` | Cross-layer composition lint: persona + SOP layer stack | static-only |
| skills | `node dist/cli/index.js skills run examples/skills/manifest.yaml` | Agent Skills adapter: static SKILL.md conformance lint | static-only |
| sop | `node dist/cli/index.js sop run examples/sop/manifest.yaml` | OpenClaw SOP adapter: static AGENTS.md rule-text lint | static-only |
| tools | `node dist/cli/index.js tools run examples/tools/manifest.json` | Tools adapter: static TOOLS.md conformance lint | static-only |

## Endpoint setup (behave, and behavioral cases in other adapters)

Behavioral grading requires an OpenAI-compatible endpoint. Supply credentials via environment variables only — never in manifest files:

```sh
export MUSTER_API_KEY="sk-..."          # or OPENAI_API_KEY as fallback
# then override endpoint via CLI flags:
node dist/cli/index.js behave run examples/behave/manifest.yaml \
  --base-url https://api.openai.com/v1 \
  --model gpt-4o-mini
```

For crosslayer, skills, heartbeat, and SOP behavioral cases:

```sh
export MUSTER_ENDPOINT="https://api.openai.com/v1"
export MUSTER_MODEL="gpt-4o-mini"
export MUSTER_API_KEY="sk-..."
```

## File layout

```
examples/
  soul/           Soul.md                     # RFC-1 Soul.md for check/resolve
  cts/            manifest.yaml + fixtures/   # CTS-1 static fixture suite
  behave/         manifest.yaml + Soul.md     # Behavioral manifest (needs endpoint)
  memory/         manifest.json + MEMORY.md + USER.md + labels.json
  heartbeat/      manifest.json + checklists/ + interval-configs/
  a2a/            manifest.json + cards/
  crosslayer/     manifest.yaml + benign/     # Cross-layer composition
  skills/         manifest.yaml + valid/      # Agent Skills SKILL.md
  sop/            manifest.yaml + AGENTS.md   # OpenClaw SOP rules
  tools/          manifest.json + TOOLS.md    # Tool documentation lint
```
