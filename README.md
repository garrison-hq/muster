# muster

**muster** (`@garrison-hq/muster`) is a reference **CTS-1 conformance harness**
for [Soul.md RFC-1](https://github.com/rokoss21/soul.md) (`1.0.0-rc1`) — the
portable persona-definition format. It validates Soul documents statically
(parsing, composition, profiles, dynamic state, evaluation references),
resolves their effective configuration to a byte-stable canonical form, runs
the CTS-1 fixture suite, and grades live model behavior against a soul's
declared thresholds.

The normative spec text is vendored at `.kittify/reference/soul-spec.md`
(RFC-1 `1.0.0-rc1`); it is the single source of truth for all conformance
behavior, and tests cite its section numbers in their names.

## Quickstart

Requires Node ≥ 22 and pnpm.

```bash
pnpm install
pnpm build          # tsc (strict) + schema copy → dist/
pnpm test           # vitest: unit tests + the full CTS fixture suite, fully offline
```

The CLI is one binary with four subcommands. Global flags: `--mode
<strict|permissive>` (default `strict`) and `--json` (machine output on
stdout, logs on stderr). Exit codes are uniform: `0` conforming / all passed,
`1` violations / ≥ 1 case failed, `2` execution error.

```bash
# 1. Static conformance of one document (§25.1 report; never touches the network)
muster check souls/voice-frontdesk/Soul.md --json

# 2. Effective configuration after full §7.5 resolution
#    (canonical-json = byte-stable RFC 8785, the CTS-1 comparison form — Appendix F.2)
muster resolve souls/voice-frontdesk/Soul.md --profile default --output-format canonical-json

# 3. The CTS-1 static fixture suite (Appendix F manifest)
muster cts run cts/manifest.yaml --filter 'merge_*'

# 4. Behavioral conformance against a live OpenAI-compatible endpoint
muster behave run behave/voice-frontdesk.yaml
```

(Without a global install, run `node dist/cli/index.js …` or `pnpm dev …`.)

## Endpoint setup

`behave run` talks to any OpenAI-compatible `/chat/completions` endpoint. The
manifest's `endpoint` block holds the defaults; `--base-url` / `--model`
override them — **nothing else changes between endpoints** (SC-005).

**Local — Ollama** (needs the NVIDIA driver installed for GPU inference):

```bash
ollama pull qwen2.5:7b-instruct
muster behave run behave/voice-frontdesk.yaml     # defaults: http://localhost:11434/v1
```

**Hosted — NVIDIA NIM** (or any OpenAI-compatible provider):

```bash
export MUSTER_API_KEY="nvapi-..."                 # env only — see below
muster behave run behave/voice-frontdesk.yaml \
  --base-url https://integrate.api.nvidia.com/v1 \
  --model meta/llama-3.1-8b-instruct
```

**API keys are environment-only.** The key is read from `MUSTER_API_KEY`
(fallback: `OPENAI_API_KEY`) at request time. There is deliberately no key
flag, no key file, and no key field in manifests; keys never appear in argv,
transcripts, or committed results — and must never be committed to this
repository.

## Repository layout

```
src/
  core/            spec-agnostic engine: merge, pipeline, canonical JSON,
                   CTS runner, behavioral runner/graders/client
  adapters/rfc1/   the RFC-1 adapter: Soul-YAML, keyspace (§25), composition,
                   profiles, state (§20), evaluation (§21), R9 thresholds
  cli/             the thin `muster` CLI (the only core↔adapter meeting point)
cts/
  manifest.yaml    Appendix F.1 CTS manifest — header documents the full
                   §25.2 category → case-id map
  fixtures/        minimal/ merge/ composition/ profiles/ state/ evaluation/
souls/
  voice-frontdesk/ example soul: a spoken-channel front-desk persona
behave/
  voice-frontdesk.yaml   behavioral manifest (3 real cases + 1 expected-fail)
  results/               committed acceptance-run evidence (SC-005/SC-006)
tests/             vitest suites (unit, cts, behavioral) — fully offline
```

### CTS-1 fixture coverage (§25.2)

The fixture suite covers all nine CTS-1 categories; the authoritative
category → case-id map lives in the header of [`cts/manifest.yaml`](cts/manifest.yaml).

| § | Category | Valid + broken fixtures |
|---|----------|-------------------------|
| 1 | Soul-YAML enforcement (§4.2) | `minimal_valid`; forbidden anchors/aliases refused in both modes |
| 2 | Mandatory core presence (§5.1) | `minimal_missing_mandatory` |
| 3 | Type/range checks (§4.3, §4.3.1) | `minimal_bad_types` (percent range, BCP-47 locale) |
| 4 | Standard Merge (§8) | `merge_scalar_replace`, `merge_map_deep`, `merge_list_replace`, `merge_null_value`, `merge_type_mismatch` |
| 5 | Composition order (§7.5, §9.4) | `composition_order`, `composition_local_wins`, `composition_strip_root_owned` |
| 6 | Cycle detection (§7.3) | `composition_cycle` |
| 7 | Profiles (§9) | `profiles_overlay_concise`, `profiles_missing_default`, `profiles_override_not_subset` |
| 8 | State semantics (§20, §4.4) | explicit base, lexicographic fallback, bad base, unknown trigger target, timed-without-ttl |
| 9 | Evaluation rule references (§21.1) | `evaluation_rule_id_ok`, `evaluation_rule_id_unresolved`, `evaluation_literal_whitespace_mismatch` |

### Upstream contribution

The `cts/` tree (manifest + fixtures) is layout-compatible with RFC-1
**Appendix F** and intentionally free-standing: it is offered upstream as a
seed for the official CTS-1 fixture repository (SC-008). Each fixture's
Markdown body explains exactly which normative clause it exercises.

## Behavioral thresholds (R9 mapping)

RFC-1 defines `voice.verbosity` as a 0–100 scalar but deliberately maps no
word counts. So that behavioral grades are objective and reproducible, muster
applies a documented, deterministic mapping (locked planning decision R9):

| Quantity | Rule |
|----------|------|
| Verbosity word cap | `maxWords(verbosity) = 10 + verbosity` (e.g. verbosity 25 → 35 words) |
| Refusal word cap | constant `25` |
| Word counting | `s.trim().split(/\s+/).filter(Boolean).length` |

Grading is **k-of-n**: each case runs `runs` times (default 3) and passes iff
≥ `pass_threshold` (default 2) runs pass; an errored run counts as failed.
Every grade records `measured` and `limit`, so a failure is always
explainable.

**Overrides:** a case may carry `overrides: {max_words: N, refusal_cap: N}` in
the behavioral manifest — per-case authored intent that wins over the R9
mapping. The thresholds themselves are locked: overrides exist to express
deliberate test design (including the intentionally-impossible
`xfail_discrimination_overly_verbose` case), never to launder a failing
result into a pass.
