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
| Date/time run | _pending — filled at pre-accept gate_ |
| Attempt # (1 or 2, per failure policy) | _pending_ |
| `behavioral-weather-skill` — `passed` | _pending_ |
| `behavioral-weather-skill` — observed trigger rate | _pending_ |
| `behavioral-rigged-control` — `passed` (must be `false`) | _pending_ |
| `behavioral-rigged-control` — observed trigger rate | _pending_ |
| Overall exit code | _pending_ |
| Portability check endpoint used | _pending_ |
| Portability check result | _pending_ |
| Blocking findings (if any) | _pending_ |

**This table must be filled with real observed values before this mission is accepted or
merged** — an unfilled or partially-filled table at accept time means the gate was skipped, not
passed.
