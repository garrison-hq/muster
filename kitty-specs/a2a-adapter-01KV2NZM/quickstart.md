# Quickstart: A2A Agent Cards Adapter

Local verification steps for the A2A (manifests) adapter. The static lint runs
fully offline; the live conformance probes need an A2A endpoint (or the bundled
in-process test-server fixture).

## Build

```bash
pnpm install
pnpm build          # tsc strict
```

## Static lint only (offline, deterministic)

Lint a single Agent Card — no endpoint required:

```bash
muster check --adapter a2a tests/fixtures/a2a/cards/signed.json
# verifies the well-known URI, structure, and (with a JWKS) the offline JWS signature
```

Run only the static-lint cases of a manifest (live cases skip when
`MUSTER_A2A_ENDPOINT` is unset):

```bash
muster a2a run tests/fixtures/a2a/manifest.json
# static-lint cases run; skill-behavior / auth-negative / signed-card-live cases
# are recorded "skipped" with a reason; exit 0 if no static case failed
```

## Live conformance probes (needs an A2A endpoint)

Point at the bundled in-process test-server fixture (deterministic), or any real
A2A deployment:

```bash
export MUSTER_A2A_ENDPOINT="http://127.0.0.1:8731"   # base URL serving /.well-known/agent-card.json
export MUSTER_A2A_TOKEN="…"                           # optional authorized credential for auth-negative
muster a2a run tests/fixtures/a2a/manifest.json --json
```

- **skill-behavior**: invokes each declared skill N times, grades the response
  against the declared skill k-of-n (§8.3.1).
- **auth-negative**: sends unauthorized / wrong-scheme requests; expects
  rejection, and an authorized request to be accepted (§7).
- **signed-card-live**: fetches the deployed card and verifies its signature
  against the live JWKS (skipped if the live JWKS is unavailable).

The adapter never uses the chat-model env (`MUSTER_ENDPOINT` / `MUSTER_MODEL` /
`MUSTER_API_KEY`) — those are for the other adapters.

## CI monitoring recipe (FR-012)

`muster a2a run` exits non-zero iff a non-skipped check failed and emits a
machine-readable JSON report — so a scheduled job can monitor a deployed card.
Point CI at `manifest.json` (the shipping conformance manifest — no control cases,
exits 0 on a healthy agent):

```yaml
# .github/workflows/a2a-monitor.yml (illustrative)
on:
  schedule: [{ cron: "0 * * * *" }]   # hourly
jobs:
  monitor:
    runs-on: ubuntu-latest
    env:
      MUSTER_A2A_ENDPOINT: ${{ secrets.A2A_ENDPOINT }}
      MUSTER_A2A_TOKEN: ${{ secrets.A2A_TOKEN }}
    steps:
      - run: npx @garrison-hq/muster a2a run tests/fixtures/a2a/manifest.json --json > report.json
      # non-zero exit fails the job → drift between the card and the live agent is caught
      # offline (no endpoint): 2 static cases pass, 3 live cases skip → exit 0
      # healthy endpoint: all 5 cases pass → exit 0
```

`manifest.controls.json` is the harness self-test proving the graders discriminate (FR-011).
Run it against misbehaving fixtures/server modes in `pnpm test` — never against your real deployment.

## Tests

```bash
pnpm test                # full Vitest suite incl. the a2a fixture suite + in-process test-server
pnpm test:coverage       # uploads lcov to SonarCloud; new-code coverage must be ≥ 80%
```

The in-process test-server (`tests/fixtures/a2a/server/test-server.ts`) is
started/stopped by the live-class tests on an ephemeral port — no external
dependency, fully reproducible.

## Verify discrimination controls

`manifest.controls.json` contains five rigged-impossible control cases (`control: true`).
`manifest.test.ts` asserts every control case reports `passed: true` after inversion
(grader raw result is `false` — the grader failed as designed, proving it can discriminate).
Controls are exercised against local fixtures and the drift/unsigned server modes — never
against a real deployment.
