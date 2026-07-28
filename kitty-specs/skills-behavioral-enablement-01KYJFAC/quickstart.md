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
| Credential source | environment variable injected inline at invocation time via command substitution from a credential store outside this working tree (e.g. `OPENAI_API_KEY=$(...)`); never a `.env` file inside the repo, never argv-literal, never logged (HIGH-2 remediation — see the NI-001 hazard note in the Blocking findings row below) |
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
OPENAI_API_KEY=$(your-credential-lookup-command-here) \
MUSTER_ENDPOINT=https://api.openai.com/v1 MUSTER_MODEL=gpt-4o-mini \
  node dist/cli/index.js skills run fixtures/skills/skills-manifest.yaml --json \
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
| Date/time run | 2026-07-27T23:17:28Z (two independent live runs within the same session, WP04 T021, lane-a pre-merge tree; model `gpt-4o-mini`, endpoint `https://api.openai.com/v1`). Re-verified 2026-07-28 during the HIGH-1/MEDIUM-1/HIGH-2/MEDIUM-2/MEDIUM-3 remediation pass (same manifest/model/endpoint, credentials injected inline, no `.env` file) — same result shape reproduced (`control` `passed:false`, `shouldTriggerAxis.triggerRate:0`, `runsErrored:0`; `weather` `passed:true`, `shouldTriggerAxis.triggerRate:0.9667`). |
| Attempt # (1 or 2, per failure policy) | 1 (both should-trigger and control passed the required condition on the first attempt — no retry needed) |
| `behavioral-weather-skill` — `passed` | `true` |
| `behavioral-weather-skill` — observed trigger rate | should-trigger axis: `0.9667` (29/30 runs); near-miss axis: `0.2` (6/30 runs) |
| `behavioral-rigged-control` — `passed` (must be `false`) | `false` on all three independent live runs recorded here (two original + one MEDIUM-1/HIGH-1 remediation re-verification). **Correction (MEDIUM-1)**: the earlier note here — "`errored` field is `null`, i.e. not `true`, so the control genuinely failed rather than merely erroring out" — proves nothing on its own: `errored` is `null`/absent on EVERY case that reaches a graded verdict, including one pointed at a dead endpoint where every single API call failed (confirmed live: `MUSTER_ENDPOINT=http://127.0.0.1:1/v1` produced `errored:null` with `runsErrored` 24/24 on both axes). The assertion that actually distinguishes "correctly failed" from "merely errored out" is `runsErrored == 0` summed across both axes' `queryBreakdown`, which the remediation re-run confirmed: `0` total `runsErrored` across both axes. **Also (HIGH-1)**: `.passed` alone is not a discrimination check on the fixtures near-miss axis (it self-matches the rigged tool's own description text) — the should-trigger axis's raw `triggerRate` (`0`, below) is asserted directly as an independent gate. |
| `behavioral-rigged-control` — observed trigger rate | should-trigger axis: `0` (0/24 runs); near-miss axis: `1` (24/24 runs) — reproduced again on the MEDIUM-1/HIGH-1 remediation re-run (same manifest, same model, same env vars); `control_should_trigger_axis_gate_exit=0` and `control_runs_errored_gate_exit=0` both confirmed |
| Overall exit code | `1` (full manifest: 17 cases, 16 passed, 1 failed — the 1 failure is the discrimination control correctly failing as designed; C-004 correctly makes this contribute to a non-zero exit code) |
| Portability check endpoint used | `http://localhost:11434/v1` (local Ollama, `MUSTER_MODEL=llama3`) |
| Portability check result | No local Ollama instance was reachable in this environment (`curl` to `/v1/models` returned connection-refused). The `skills run` command itself still exited `1` (never a bare skip) and both behavioral cases reported `passed:false` with `errored` still `null` — every run's `chatWithTools` call threw (connection refused), and each was individually counted as `runsErrored` inside its axis (FR-011: errored run = failed run, non-retried), which is the correct fail-closed behavior for an unreachable endpoint. This confirms the env-var-only endpoint switch (SC-005) is mechanically wired to a second endpoint, but does not constitute a full "passing" portability run against a live local model — no live local endpoint was available to complete that half of the check in this environment. |
| Blocking findings (if any) | None against the mission-required gates: `control_gate_exit=0`, `control_should_trigger_axis_gate_exit=0` (HIGH-1), `control_runs_errored_gate_exit=0` (MEDIUM-1, replaces the earlier vacuous `control_not_errored_gate_exit`), `weather_gate_exit=0`, `pending_gate_exit=0` (this table, once filled). Non-blocking note: this task file's own literal `ps_leak_gate_exit` check (`ps aux \| grep -c "MUSTER_API_KEY=\|OPENAI_API_KEY=\|sk-"`) returned a non-zero count (investigated, not a real leak) — the sandboxed execution tool used to run these commands wraps every invocation in its own `bash -c 'eval "<literal command text>"'` process, so a command that assigns `OPENAI_API_KEY=$(...)` inline surfaces that *variable-name* substring (never the resolved value, which was only ever obtained via command substitution and never written into any command's literal source text) transiently in `ps aux` as part of the wrapper's own argv; the pattern `sk-` additionally self-matches ordinary system process names unrelated to credentials (e.g. `disk-utility`). No node process argv, no output file, and no committed file ever contained the literal secret value — confirmed by a live empirical check (`env SECRET=... sh -c 'sleep' &`) showing the invoked child process's own argv never carries the parent's env-assignment prefix, and by `output_leak_gate_exit=0` against the recorded JSON. **This WP's own `ps_leak_gate` has since been rewritten** (HIGH-2/reviewer finding, unrelated to the note above): the old `ps aux \| grep -c "sk-"` form could never return `0` at all — the `grep` process spawned by the pipeline is itself listed in `ps aux` and its own argv contains the literal search pattern `"sk-"`, so it always matched itself, an always-firing hygiene gate people learn to ignore. Rewritten to scan `/proc/<pid>/cmdline` for the resolved key value directly, which does not have this self-match problem (see WP04's task file). **NI-001 hazard (HIGH-2, distinct finding)**: an earlier draft of this WP's own procedure text used `node --env-file=.env` to inject credentials. During this WP's own execution, a local, gitignored `.env` present in the primary checkout tripped `tests/unit/invariants.test.ts`'s NI-001 secret scan red — that scan walks the entire working tree and does **not** exempt gitignored files, so `.env` is not a safe credential mechanism against this repo's own invariant guard. Corrected: this file's procedure (above) now uses inline environment-variable injection via command substitution instead, and no `.env` file was created for the live runs recorded in this table. |

**This table must be filled with real observed values before this mission is accepted or
merged** — an unfilled or partially-filled table at accept time means the gate was skipped, not
passed.
