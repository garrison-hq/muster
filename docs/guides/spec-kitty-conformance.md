# Operator Guide: Running muster's Conformance Suites (FR-001)

**Status**: an operator how-to, not a rubric. Everything in sections 1–3
documents muster's own CLI **as it exists today** (verified directly against
`garrison-hq/muster` commit `16f0d34c3126fab5df2ee0b6e1e304a4d9bcb8e3` — every
`src/cli/index.ts` citation below was re-checked against that commit; the file
is byte-identical between `16f0d34c3` and this guide's own commit, so the
cited line numbers are stable). Section 4 is a clearly labeled forward-looking
appendix for suites that do not exist in this repo yet — treat every command
in sections 1–3 as runnable now; treat nothing in section 4 as runnable.

## 1. Running every real, currently-shipped CLI suite

muster ships eleven runnable commands today: two single-document checks
(`check`, `resolve`) and nine `<layer> run <manifest>` suites. All of them are
OpenAI-compatible-endpoint agnostic — the same command works unchanged
whether you point it at a local Ollama/DGX box, an NVIDIA NIM endpoint, or a
hosted OpenAI-compatible API. Only the environment variables you export
before invoking the command change; see §2 for exactly which variable each
suite reads.

### 1.1 Picking a provider

Export one of these three blocks first (all three are equally valid shell
commands — pick the one matching your setup); the CLI invocations later in
this section are identical regardless of which block you used:

```bash
# Ollama / local DGX box (OpenAI-compatible /v1 surface, no key required)
export MUSTER_ENDPOINT="http://localhost:11434/v1"
export MUSTER_MODEL="qwen2.5:7b-instruct"
```

```bash
# NVIDIA NIM (OpenAI-compatible surface; key required)
export MUSTER_ENDPOINT="https://integrate.api.nvidia.com/v1"
export MUSTER_MODEL="meta/llama-3.1-8b-instruct"
export MUSTER_API_KEY="nvapi-..."
```

```bash
# Hosted OpenAI-compatible endpoint
export MUSTER_ENDPOINT="https://api.openai.com/v1"
export MUSTER_MODEL="gpt-4o-mini"
export MUSTER_API_KEY="sk-..."
```

Every command block below was run verbatim from repo root against this
commit; the exit code shown is what was actually observed, not a restated
claim.

### 1.2 The eleven commands

Static-only commands never touch a network, regardless of what you exported
in §1.1:

```bash
node dist/cli/index.js check examples/soul/Soul.md
echo "exit=$?"   # observed: exit=0
```

```bash
node dist/cli/index.js resolve examples/soul/Soul.md --output-format yaml
echo "exit=$?"   # observed: exit=0
```

```bash
node dist/cli/index.js cts run examples/cts/manifest.yaml
echo "exit=$?"   # observed: exit=0
```

```bash
node dist/cli/index.js memory run examples/memory/manifest.json
echo "exit=$?"   # observed: exit=0 (static lint only; add --behavioral for recall/privacy probes)
```

```bash
node dist/cli/index.js heartbeat run examples/heartbeat/manifest.json
echo "exit=$?"   # observed: exit=0 (behavioral action-diff/idempotency/quiet-ack cases skip gracefully without MUSTER_ENDPOINT)
```

```bash
node dist/cli/index.js a2a run examples/a2a/manifest.json
echo "exit=$?"   # observed: exit=0 (static card lint; live probes need MUSTER_A2A_ENDPOINT — a DIFFERENT env var, see §2)
```

```bash
node dist/cli/index.js crosslayer run examples/crosslayer/manifest.yaml
echo "exit=$?"   # observed: exit=0 (static composition/lint; behavioral rule-survival cases need MUSTER_ENDPOINT)
```

```bash
node dist/cli/index.js skills run examples/skills/manifest.yaml
echo "exit=$?"   # observed: exit=0 (1 static case passes; the manifest's 2 behavioral trigger-routing cases are SKIPPED, not failed, when no endpoint is configured)
```

```bash
node dist/cli/index.js sop run examples/sop/manifest.yaml
echo "exit=$?"   # observed: exit=0 (static AGENTS.md rule-text lint; this shipped example manifest declares 0 probes, so MUSTER_ENDPOINT is inert for it)
```

```bash
node dist/cli/index.js tools run examples/tools/manifest.json
echo "exit=$?"   # observed: exit=0 (static lint + drift check; behavioral selection probes need MUSTER_ENDPOINT)
```

```bash
node dist/cli/index.js behave run examples/behave/manifest.yaml
echo "exit=$?"   # exit code depends on whether examples/behave/manifest.yaml's declared
                  # endpoint (http://localhost:11434/v1, a local Ollama default — see §2)
                  # actually answers: 0/1 if it does, 2 if every run errors — behave has
                  # NO static-only mode, unlike every other suite in this list (see §1.3
                  # for a deterministic, verified demonstration of the fatal-endpoint path)
```

### 1.3 The one thing every adapter gets asked: "what if the endpoint is down?"

This is the divergence §3's table exists to document, demonstrated here as a
literal contrast rather than asserted from prose. Both commands below were
run against the identical unreachable address (`http://127.0.0.1:9/v1` —
nothing listens on port 9, so the connection is refused immediately; no DNS
lookup, no timeout wait):

```bash
MUSTER_ENDPOINT=http://127.0.0.1:9/v1 node dist/cli/index.js skills run examples/skills/manifest.yaml
echo "skills_exit=$?"   # observed: skills_exit=1 — an ordinary failed run, no special case
```

```bash
MUSTER_ENDPOINT=http://127.0.0.1:9/v1 node dist/cli/index.js behave run examples/behave/manifest.yaml --base-url http://127.0.0.1:9/v1
echo "behave_exit=$?"   # observed: behave_exit=2 — endpoint-fatal execution error, a deliberately different code
```

Same failure condition, same shape of endpoint, two different, both
intentional, exit codes. §3 explains why.

## 2. The environment-variable matrix

`MUSTER_ENDPOINT` is the **canonical** base-URL variable; `MUSTER_BASE_URL` is
a **deprecated alias supported through v1.2.x** for the one adapter that ever
accepted it. This is not a uniform, repo-wide fallback — read the "Who reads
it" column below before assuming a variable applies to a suite it doesn't.

| Variable | Purpose | Who reads it |
|---|---|---|
| `MUSTER_ENDPOINT` | Canonical OpenAI-compatible base URL | `skills`, `sop`, `crosslayer`, `tools`, `heartbeat` (all read it directly from `process.env`); `memory-utilization run` (not one of this guide's 11 suites, see §4) |
| `MUSTER_BASE_URL` | **Deprecated alias** for `MUSTER_ENDPOINT`, honored only when `MUSTER_ENDPOINT` is unset | **`skills` only** — resolved by the shared `resolveEndpointBaseUrl` helper (`src/adapters/skills/trigger.ts:91-101`), called from `resolveSkillsBehavioralEndpoint` (`src/cli/index.ts:1367-1390`). When `MUSTER_BASE_URL` is the variable that actually supplies the value, `skills run` prints a one-line stderr deprecation notice (`src/cli/index.ts:1377-1380`, observed verbatim above in the deprecated-alias test run); when both are set, `MUSTER_ENDPOINT` wins **silently**, no warning. `sop`, `crosslayer`, `tools`, `heartbeat`, and `behave` do **not** honor `MUSTER_BASE_URL` at all — confirmed by direct source read, not inferred |
| `MUSTER_MODEL` | Model name override | Same set as `MUSTER_ENDPOINT` readers, default `gpt-4o-mini` unless noted |
| `MUSTER_API_KEY` (fallback `OPENAI_API_KEY`) | Bearer credential, read at call time only, never logged | All behavioral/live paths across every adapter, including `behave` (flag-based endpoint, env-based key only) |
| `--base-url` / `--model` (flags, `behave run` and `memory run` only) | Per-invocation override, takes precedence over the manifest/env default | `behave run` overrides the **manifest's own** `endpoint.base_url`/`endpoint.model` (`examples/behave/manifest.yaml:16-17` ships `http://localhost:11434/v1` / `qwen2.5:7b-instruct` as its own default) — `behave` never reads `MUSTER_ENDPOINT` itself, only `--base-url`/`--model` or the manifest. `memory run --behavioral` reads only `--base-url`/`--model` (default `http://localhost:11434/v1` / `llama3.2`) — it does **not** read `MUSTER_ENDPOINT` either |
| `MUSTER_A2A_ENDPOINT` / `MUSTER_A2A_TOKEN` | **A2A's own, separate namespace** — base URL and optional bearer token for A2A's three live conformance probes (skill-behavior, auth-negative, signed-card-live) | `a2a run` **only**, when the manifest's `kind` is `"behavioral"` (`src/adapters/a2a/behavioral-manifest.ts:142-143`). `a2a run` never reads `MUSTER_ENDPOINT`/`MUSTER_MODEL`/`MUSTER_API_KEY` — this is a genuinely different variable pair from every other adapter, not a naming inconsistency to route around |

## 3. Per-adapter exit-code contract

The exit-code contract is not uniformly implemented today, even though
`contracts/cli.md` describes one uniform rule — read the table below
per-adapter, not as one blanket rule. Every command returns to a shell; `$?`
is what your automation should branch on.

| Situation | `check` / `resolve` / `cts` / `memory` / `heartbeat` / `a2a` (static) / `crosslayer` / `skills` / `sop` / `tools` | `behave` / `a2a` (behavioral manifest) |
|---|---|---|
| All cases pass (or all skipped, no endpoint configured) | **0** | **0** |
| At least one case fails, endpoint reachable | **1** | **1** |
| **Endpoint unreachable for every run of every case** | **1** — counted as an ordinary set of failed cases, no special case (`doSkillsRun`, `src/cli/index.ts:1584`, `return ok ? 0 : 1;`; `doSopRun`, `:1685`, `return report.passed ? 0 : 1;`) | **2** — treated as an execution fault, not a grading failure (`doBehaveRun`, `:479-489`; `doA2aBehavioralRun`, `:1157-1161`, both with a comment citing `contracts/cli.md`'s exit-code contract) |
| Manifest cannot be read or fails structural validation | **2**, universally | **2**, universally |
| Unexpected internal exception | **2**, universally (`runCli`'s top-level catch, `src/cli/index.ts:2328-2342`, maps every `ExecutionError` and every uncaught error to exit 2) | **2**, universally |

`contracts/cli.md` itself describes the endpoint-unreachable-for-an-entire-run
case as a **uniform** exit-2 execution error ("`2` — execution error
(unreadable file, bad manifest, endpoint unreachable for an entire run)").
`behave` and `a2a` implement that written contract exactly; `skills` and
`sop` do not — their exit-1 behavior on total endpoint failure is a real
divergence *from the written contract*, not two independently valid designs
that happen to differ. This guide documents that divergence honestly rather
than harmonizing it away or restating the contract as if it were uniformly
followed. It is tracked as its own recorded gap (RG-007, landing in WP02's
recorded-gaps register: "recommend: treat 'every run of every case errored'
as exit 2 everywhere... and migrate `skills`/`sop` to match"), not silently
absorbed into this guide as settled behavior. §1.3 above captured the
divergence live: the identical unreachable-endpoint condition returns `1`
from `skills run` and `2` from `behave run` in the same evidence block.

Do not extrapolate this table to suites not listed in it: `memory-utilization
run` and `skprofile` are real, shipped CLI commands (`node dist/cli/index.js
--help` lists both) but are **not** among this guide's eleven suites (no
`examples/**` fixture ships for either) and are out of this guide's scope —
see §4.

## 4. Appendix: planned/pending test-strategy table

> **PLANNED — not yet implemented, tracked at M4
> (<https://github.com/MOES-Media/spec-kitty/issues/24>) / M6
> (<https://github.com/MOES-Media/spec-kitty/issues/25>).** Nothing below is a
> runnable muster command. No row in this table has a verification command
> attached, by design — attaching one to a path that doesn't exist yet would
> be the exact defect this mission exists to prevent.

The table below reproduces the section-11 test-strategy inventory from the
mission's own seed issue, re-verified read-only against
`/home/jeroennouws/dev/spec-kitty-conformance` rather than trusted from that
issue's text. Two of the six original rows are **not** genuinely absent
today — they exist in that sibling repo already, just not wired into this
repo's `examples/**`. They get their own honest label below, distinct from
the four rows that remain genuinely nonexistent:

| Path (in `spec-kitty-conformance`, a sibling repo) | Status |
|---|---|
| `conformance/skills/manifest.yaml` | **Exists today in a sibling repo, not a muster-repo example, not yet wired into `examples/**`.** Re-verified read-only against that repo's `origin/main` (`c36b727cf`, 2026-07-28): 54 manifest entries — 53 real skill fixtures plus 1 negative control (`control/name-mismatch/SKILL.md`). This is a **since-merged** state (mission `…-skills-static-conformance-01KYG7GE`) — earlier drafts of this mission's own spec, checked against an older commit, said "1 fixture skill." |
| `conformance/doctrine/*.yaml` | **Also exists today in a sibling repo, not yet wired into `examples/**` — the same third category as the row above, not "planned."** Re-verified read-only against `origin/main` (`c36b727cf`): 13 directive-mapped SOP rule manifests plus a `control/045-drifted.yaml` fixture (mission `doctrine-rule-manifests-01KYH7AM`, merged before this guide's own commit `16f0d34c3` reference point in muster's timeline — this mission's own spec/plan text describing this path as "does not exist" was already stale at authorship time, not merely "changed since"). |
| `conformance/skprofile/**` | PLANNED — confirmed absent on `origin/main` at read time. |
| `conformance/crosslayer/manifest.yaml` | PLANNED — confirmed absent on `origin/main` at read time. (A `crosslayer-composition-suite-01KYJA33` mission branch exists in that repo with in-progress work, but it is unmerged and actively being worked by another agent — read-only inspected, not treated as landed.) |
| `conformance/behavioral/profiles/*.yaml`, `conformance/behavioral/directives/*.yaml` | PLANNED — confirmed absent on `origin/main` at read time. |
| `conformance/skills/behavioral-manifest.yaml` | PLANNED — confirmed absent on `origin/main` at read time. |

## 5. Normative sources

- `contracts/cli.md` — the exit-code contract §3's table cites (`0`/`1`/`2`
  semantics); see also `kitty-specs/cts1-conformance-harness-01KTS86B/contracts/cli.md:8`.
- `README.md:73-76` — states the same-shaped `0`/`1`/`2` baseline this
  guide's §3 refines into a per-adapter table (README's own text is the
  general baseline, not a claim that every adapter special-cases total
  endpoint failure the same way).
- `site/src/content/docs/reference/cli.md:25` — the Starlight-published CLI
  reference, stating the same general `0`/`1`/`2` baseline as `README.md`.
- `src/cli/index.ts` (commit `16f0d34c3126fab5df2ee0b6e1e304a4d9bcb8e3`) —
  every command's actual exit-code and env-var resolution logic cited inline
  in §2 and §3 above.
- `examples/README.md` — the fixture-level command/mode table this guide's
  §1 expands on (corrected for the same divergence, FR-005).
- FR-002's rubric index (`docs/rubric/index.md`, landing in WP02) — the
  companion reference document for which rubric backs which check; this
  guide is how-to, that index is reference, per this mission's Divio split.
