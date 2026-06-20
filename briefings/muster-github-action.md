# Briefing: a reusable GitHub Action for muster conformance

**Audience:** the user, to drive muster (`garrison-hq/muster`) via spec-kitty.
**Status:** briefing only — defines a **consumer-facing Action** that wraps the muster
CLI so a downstream repo (hey-anton first) gates its CI on `uses: garrison-hq/muster-action@v1`
instead of hand-installing muster from npm.
**Companion:** `briefings/a2a-behavioral-conformance.md` ships the **capability**
(`muster a2a run` can drive a running agent multi-turn). This Action is the **delivery
vehicle** for that capability and for the existing static commands. It is **downstream of
B1–B5** — its input names must match B5's env vars (`MUSTER_A2A_ENDPOINT` /
`MUSTER_A2A_TOKEN`), so co-design the names now to avoid churn.

---

## 1. Problem statement

muster today has only **internal** CI (`.github/workflows/ci.yml`, `release.yml`,
`site.yml`, `devto-crosspost.yml`). There is **no consumer-facing Action**. A downstream
repo that wants to gate PRs on agent-file conformance must hand-roll: install Node, install
`@garrison-hq/muster`, invoke the right `muster <cmd>`, translate exit codes. hey-anton's
`agent-conformance.yml` is exactly that hand-roll. A published Action collapses it to a few
lines and gives every consumer the same readiness-wait / fork-guard / annotation behavior.

What the CLI already gives the Action (verified against `src/cli/index.ts`):
- **CI-ready exit codes:** `runCli` returns `0` pass / `1` conformance failure / `2`
  internal error. The Action can gate purely on exit code with zero glue.
- **`--json` on every command** (check, cts, behave, memory, crosslayer, a2a, heartbeat,
  skills, sop, tools) — machine output to stdout, human to stderr, already pipe-friendly.
- **npm-distributable:** `@garrison-hq/muster`, bin `muster`, `engines.node >=22`, dist
  built on publish (not committed) — so the Action installs from npm at a pinned version.

---

## 2. Design decisions

| # | Decision | Recommendation |
|---|----------|----------------|
| D1 | **Action type:** composite vs Docker vs JS. | **Composite.** `setup-node` + `npx @garrison-hq/muster@<version>` + run the requested command. Cheapest, transparent, no container/GHCR publish, pins to the npm version. Docker buys cold-start speed at the cost of image publishing; a JS action buys tight annotation integration but forces bundling muster as a dep with `ncc`. Start composite; revisit only if node-setup cost bites. |
| D2 | **Home:** in-repo (`action.yml` under `garrison-hq/muster`) vs dedicated `garrison-hq/muster-action` repo. | **Dedicated repo** — Marketplace listing wants `action.yml` at the repo root with its own tag/release flow, and decouples Action versioning from the npm release train (`release.yml` already drives semantic-release for npm). |
| D3 | **PR feedback surface (SARIF / annotations).** muster emits exit-code + `--json` only; **no SARIF anywhere** (`resolve` has canonical-json/json/yaml; nothing emits SARIF). A failed case shows as a red ✗ with no inline "this turn over-verbosed." | Put `--format sarif` **in the muster CLI**, not the Action wrapper — it is a core capability reusable beyond CI, and keeps the Action a thin shell. The Action uploads it via `github/codeql-action/upload-sarif` (or emits `::error file=…::` from `--json` as a fallback before SARIF lands). **This is the one item that may grow B5's scope — flag it.** |
| D4 | **Behavioral readiness wait.** Boot-in-CI (a2a briefing §4) means the endpoint may not be up when the step starts. | Offer optional `health-url` + `health-timeout` inputs; the Action polls until 200 before invoking muster, so consumers don't each re-implement the agent-card wait. |
| D5 | **Fork-PR / missing-secret safety.** Live endpoint + token are absent on fork PRs. | The Action **skips cleanly** when `endpoint` (or its token) is absent, mirroring muster's own "absent `MUSTER_A2A_ENDPOINT` → skip" contract and the `sonar` fork guard in `ci.yml`. Document it as the intended path, not a failure. |

---

## 3. Input / output surface

```yaml
# action.yml (composite)
inputs:
  command:        # 'check' | 'cts run' | 'a2a run' | 'skills run' | … (the muster subcommand)
    required: true
  args:           # positional target(s): manifest path, file glob, etc.
    required: false
  version:        # npm version/range of @garrison-hq/muster to run (default: a pinned, tested version)
    required: false
  endpoint:       # → MUSTER_A2A_ENDPOINT (behavioral a2a only; absent ⇒ skip)
    required: false
  token:          # → MUSTER_A2A_TOKEN, sourced from a secret; never logged
    required: false
  health-url:     # readiness probe (e.g. <endpoint>/.well-known/agent-card.json); poll until 200
    required: false
  health-timeout: # seconds to wait for health-url (default e.g. 60)
    required: false
  format:         # 'human' | 'json' | 'sarif' (once D3 lands); drives --json / --format
    required: false
  fail-on:        # 'error' (exit≥1) | 'never' (report-only); maps to whether the step fails the job
    required: false
outputs:
  exit-code:      # raw muster exit code (0/1/2)
  report:         # path to the JSON/SARIF report artifact
  result:         # 'passed' | 'failed' | 'skipped' | 'errored'
```

**Name coupling (must match B5):** `endpoint`/`token` set `MUSTER_A2A_ENDPOINT` /
`MUSTER_A2A_TOKEN` verbatim. Lock these in B5's CLI work so the Action surface never drifts
from the env-var contract.

---

## 4. hey-anton consumption (the first consumer)

hey-anton's `agent-conformance.yml` becomes, conceptually:

```yaml
jobs:
  conformance:
    # fork-PR guard: secrets (incl. Mistral) unavailable ⇒ skip, do not fail
    if: github.event.pull_request.head.repo.full_name == github.repository
    steps:
      - boot the assembled agent server with ${{ secrets.MISTRAL_API_KEY }}  # hey-anton step
      - uses: garrison-hq/muster-action@v1            # static card-lint, every PR
        with: { command: 'a2a run', args: 'conformance/card.yaml' }
      - uses: garrison-hq/muster-action@v1            # multi-turn behavioral, main/nightly
        if: github.ref == 'refs/heads/main'
        with:
          command: 'a2a run'
          args: 'conformance/behavioral.yaml'
          endpoint: http://localhost:8080
          token: ${{ secrets.MUSTER_A2A_TOKEN }}
          health-url: http://localhost:8080/.well-known/agent-card.json
```

This realizes the a2a briefing §4 policy: static + single-turn on every PR; multi-turn
behavioral gated to main/nightly; the readiness wait and fork guard are the Action's job,
the server boot is hey-anton's.

---

## 5. Ordering + acceptance criteria

**Order vs the capability mission:** the Action mission is **downstream of B5**. It can be
built against the *current* CLI for the static commands immediately, but the behavioral
`a2a run` path is only meaningful once B1–B5 land. Lock D3 (SARIF) and the §3 input names
during B5 so they ship together.

**Acceptance criteria:**

1. A composite `action.yml` runs any muster subcommand at a **pinned npm version** and the
   job's pass/fail reflects muster's exit code (0/1/2), with `fail-on: never` allowing a
   report-only run.
2. With `endpoint` absent the Action **skips** (no failure); with `endpoint` present and
   `health-url` set, it **polls until 200 or `health-timeout`** before invoking muster, and
   a never-ready endpoint is a clear timeout failure — not a confusing muster connection
   error.
3. `token` is sourced from a secret and **never appears in logs**; on a fork PR (secret
   absent) the documented path is a **clean skip**.
4. Input names `endpoint`/`token` map to `MUSTER_A2A_ENDPOINT`/`MUSTER_A2A_TOKEN`
   **verbatim**, matching B5.
5. `format: sarif` (once D3 lands in the CLI) produces an uploadable SARIF report and the
   Action wires `upload-sarif`; until then `json` + `::error::` annotations are the
   fallback and the gap is documented.
6. A **Marketplace-ready** listing: `action.yml` at repo root with `branding`, a tag/release
   flow independent of the npm train, a `README` usage example that **SHA-pins** every
   third-party action it references (matching the convention in muster's own workflows).
7. The static-command path (`check`, `cts run`, `skills run`, …) works end-to-end against a
   real consumer repo with **no behavioral/endpoint inputs set**.

---

## 6. Five-bullet summary

- **D1 — composite Action** wrapping `npx @garrison-hq/muster@<version> <command>`; gate on
  exit code.
- **D2 — dedicated `garrison-hq/muster-action` repo** for a clean Marketplace listing and
  independent versioning.
- **D3 — add `--format sarif` to the muster CLI** (may grow B5) so the Action surfaces inline
  PR annotations; `--json`→`::error::` is the interim fallback.
- **D4/D5 — readiness wait (`health-url`) + clean fork-PR/missing-secret skip** baked into the
  Action so every consumer inherits the boot-in-CI safety from the a2a briefing §4.
- **Input names lock to B5's env vars** (`MUSTER_A2A_ENDPOINT`/`MUSTER_A2A_TOKEN`) — co-design
  now, ship together.
