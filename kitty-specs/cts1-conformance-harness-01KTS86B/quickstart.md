# Quickstart: muster (@garrison-hq/muster)

## Install & build

```bash
pnpm install
pnpm build          # tsc
pnpm test           # vitest: unit + full CTS fixture suite (offline)
```

## Check a soul statically

```bash
muster check souls/voice-frontdesk/Soul.md                 # human summary, exit 0/1
muster check souls/voice-frontdesk/Soul.md --json          # §25.1 report JSON
muster check broken.md --mode permissive                   # warnings instead of unknown-key errors
```

## Resolve effective configuration

```bash
muster resolve souls/voice-frontdesk/Soul.md --profile default --output-format canonical-json
# byte-stable RFC 8785 output — the CTS-1 comparison form (Appendix F.2)
```

## Run the CTS fixture suite

```bash
muster cts run cts/manifest.yaml            # all six categories, valid + broken fixtures
muster cts run cts/manifest.yaml --filter 'merge_*'
```

## Run the behavioral slice

Local (Ollama, after NVIDIA driver install):

```bash
ollama pull qwen2.5:7b-instruct
muster behave run behave/voice-frontdesk.yaml   # endpoint defaults target localhost:11434/v1
```

Hosted (NVIDIA NIM — same harness, only configuration changes; SC-005):

```bash
export MUSTER_API_KEY="nvapi-..."               # env only, never committed (directive 5)
muster behave run behave/voice-frontdesk.yaml \
  --base-url https://integrate.api.nvidia.com/v1 \
  --model meta/llama-3.1-8b-instruct
```

Each case runs 3× (k-of-n, ≥2 must pass); the JSON report carries every transcript,
measured word counts vs limits, the active state per turn, model, endpoint, and temperature.

## Acceptance walk (maps to spec Success Criteria)

1. `pnpm test` green → SC-001..SC-004 (categories covered, broken fixtures rejected with paths, Appendix A/D souls pass, byte-determinism).
2. `behave run` against Ollama AND one hosted endpoint → SC-005.
3. Flip the discrimination case (deliberately verbose system prompt) → harness fails it → SC-006.
4. `muster check` on a fresh soul completes < 5 s with path+message diagnostics → SC-007.
5. `cts/` tree + manifest stands alone → SC-008 (upstream contribution).
