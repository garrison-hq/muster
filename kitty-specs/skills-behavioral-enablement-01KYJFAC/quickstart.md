# Quickstart: Skills Behavioral Enablement

**Mission**: `skills-behavioral-enablement-01KYJFAC`
**Purpose of this file**: local verification steps for this mission's plumbing (FR-001–FR-007),
and the checked-in recording target for the mission's **hard acceptance precondition** — the
live-model verification run against `gpt-4o-mini` (spec §"Live-Model Verification Plan").

This file is written during the **plan** phase as a skeleton. The results table at the bottom is
filled in once, at the pre-accept gate, after WP01, WP02, WP03, and WP04 have all merged into the
mission coordination branch — not by any single WP, per `plan.md`'s ownership note.

## Offline verification (any WP, any time)

```bash
pnpm build
echo "build_exit=$?"
pnpm test
echo "test_exit=$?"
pnpm vitest run tests/unit/invariants.test.ts
echo "invariants_exit=$?"   # NI-002/NI-003 must stay green throughout this mission
```

Expected: all three exit `0`, zero network calls, before any live-model step below is attempted.

## Live-model verification (pre-accept gate — run once, after WP01–WP04 all merge)

**Pinned, not negotiable** (per spec, Live-Model Verification Plan):

| Parameter | Value |
|---|---|
| Model | `gpt-4o-mini` |
| Endpoint | `https://api.openai.com/v1` |
| `runsPerQuery` | `3` |
| Threshold | `0.5` |
| Credential source | local, gitignored `.env`, loaded via `node --env-file=.env`; never argv, never logged |
| Manifest | `fixtures/skills/skills-manifest.yaml` (existing `behavioral-weather-skill` + `behavioral-rigged-control` cases, both already checked in with `runsPerQuery: 3`/`threshold: 0.5`) |

**Failure policy** (verbatim from spec — no silent model-swapping, ever):

- Should-trigger case (`behavioral-weather-skill`) fails first attempt → retry **exactly once**,
  unmodified. Second consecutive failure → mission completion is **blocked**; record the exact
  manifest/model/endpoint/observed trigger rate below as an open defect, do not proceed to
  accept/merge.
- Control case (`behavioral-rigged-control`) reports `passed:true` even once → **immediately
  mission-blocking, non-retryable**. Investigate (grader regression, or `gpt-4o-mini` anomaly);
  do not retry away.

### Procedure

```bash
pnpm test   # offline baseline, must be green first
node --env-file=.env dist/cli/index.js skills run fixtures/skills/skills-manifest.yaml --json \
  | tee /tmp/skills-live-run.json
echo "exit=$?"
jq '.results[] | select(.id=="behavioral-weather-skill" or .id=="behavioral-rigged-control")' \
  /tmp/skills-live-run.json
```

Then, for the portability check (step 4 of the spec's plan — not a second acceptance gate):

```bash
# same manifest, same fixtures, ONLY env vars differ (e.g. local Ollama)
MUSTER_ENDPOINT=http://localhost:11434/v1 MUSTER_MODEL=<local-model> \
  node dist/cli/index.js skills run fixtures/skills/skills-manifest.yaml --json
```

### Results (fill in at the pre-accept gate — do not leave placeholders at merge time)

| Field | Value |
|---|---|
| Date/time run | 2026-07-27T23:17:28Z (two independent live runs within the same session, WP04 T021, lane-a pre-merge tree; model `gpt-4o-mini`, endpoint `https://api.openai.com/v1`) |
| Attempt # (1 or 2, per failure policy) | 1 (both should-trigger and control passed the required condition on the first attempt — no retry needed) |
| `behavioral-weather-skill` — `passed` | `true` |
| `behavioral-weather-skill` — observed trigger rate | should-trigger axis: `0.9667` (29/30 runs); near-miss axis: `0.2` (6/30 runs) |
| `behavioral-rigged-control` — `passed` (must be `false`) | `false` (confirmed on two independent live runs; `errored` field is `null`, i.e. not `true` — the control genuinely failed the discrimination check, it did not merely error out) |
| `behavioral-rigged-control` — observed trigger rate | should-trigger axis: `0` (0/24 runs); near-miss axis: `1` (24/24 runs) |
| Overall exit code | `1` (full manifest: 17 cases, 16 passed, 1 failed — the 1 failure is the discrimination control correctly failing as designed; C-004 correctly makes this contribute to a non-zero exit code) |
| Portability check endpoint used | `http://localhost:11434/v1` (local Ollama, `MUSTER_MODEL=llama3`) |
| Portability check result | No local Ollama instance was reachable in this environment (`curl` to `/v1/models` returned connection-refused). The `skills run` command itself still exited `1` (never a bare skip) and both behavioral cases reported `passed:false` with `errored` still `null` — every run's `chatWithTools` call threw (connection refused), and each was individually counted as `runsErrored` inside its axis (FR-011: errored run = failed run, non-retried), which is the correct fail-closed behavior for an unreachable endpoint. This confirms the env-var-only endpoint switch (SC-005) is mechanically wired to a second endpoint, but does not constitute a full "passing" portability run against a live local model — no live local endpoint was available to complete that half of the check in this environment. |
| Blocking findings (if any) | None against the four mission-required gates: `control_gate_exit=0`, `control_not_errored_gate_exit=0`, `weather_gate_exit=0`, `pending_gate_exit=0` (this table, once filled). Non-blocking note: this task file's own literal `ps_leak_gate_exit` check (`ps aux \| grep -c "MUSTER_API_KEY=\|OPENAI_API_KEY=\|sk-"`) returned a non-zero count (investigated, not a real leak) — the sandboxed execution tool used to run these commands wraps every invocation in its own `bash -c 'eval "<literal command text>"'` process, so a command that assigns `OPENAI_API_KEY=$(...)` inline surfaces that *variable-name* substring (never the resolved value, which was only ever obtained via command substitution and never written into any command's literal source text) transiently in `ps aux` as part of the wrapper's own argv; the pattern `sk-` additionally self-matches ordinary system process names unrelated to credentials (e.g. `disk-utility`). No node process argv, no output file, and no committed file ever contained the literal secret value — confirmed by a live empirical check (`env SECRET=... sh -c 'sleep' &`) showing the invoked child process's own argv never carries the parent's env-assignment prefix, and by `output_leak_gate_exit=0` against the recorded JSON. |

**This table must be filled with real observed values before this mission is accepted or
merged** — an unfilled or partially-filled table at accept time means the gate was skipped, not
passed.
