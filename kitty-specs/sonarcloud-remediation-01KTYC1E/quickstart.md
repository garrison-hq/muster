# Quickstart: verifying the SonarCloud remediation locally

**Mission**: `sonarcloud-remediation-01KTYC1E`

## Per-WP regression net (run after every change set)

```bash
pnpm build          # tsc strict + schema copy
pnpm test           # full Vitest suite incl. CTS fixtures
# CLI smoke (mirrors ci.yml):
node dist/cli/index.js check souls/voice-frontdesk/Soul.md
node dist/cli/index.js cts run cts/manifest.yaml
```

## Determinism guard (AC-5 — mandatory for WP-2's canonical-json change)

```bash
# BEFORE the change, from clean main:
node dist/cli/index.js cts run cts/manifest.yaml --json > /tmp/cts-before.json 2>/dev/null || \
  node dist/cli/index.js cts run cts/manifest.yaml > /tmp/cts-before.out
# AFTER the change, rebuild then re-run into /tmp/cts-after.* and:
diff /tmp/cts-before.* /tmp/cts-after.*   # MUST be empty
```

## Coverage (WP-1)

```bash
pnpm test:coverage            # writes coverage/lcov.info
ls -la coverage/lcov.info     # must exist, non-empty
```

## Issue-by-issue closure check

Work the checklist in `kitty-specs/sonarcloud-remediation-01KTYC1E/sonar-inventory.md`.
After the mission merges and CI analysis runs on main:

```bash
curl -s "https://sonarcloud.io/api/issues/search?componentKeys=garrison-hq_muster&resolved=false&ps=1" \
  | python3 -c "import json,sys; print('open issues:', json.load(sys.stdin)['total'])"   # expect 0
curl -s "https://sonarcloud.io/api/hotspots/search?projectKey=garrison-hq_muster&status=TO_REVIEW&ps=1" \
  | python3 -c "import json,sys; print('hotspots to review:', json.load(sys.stdin)['paging']['total'])" # expect 0
curl -s "https://sonarcloud.io/api/qualitygates/project_status?projectKey=garrison-hq_muster" \
  | python3 -c "import json,sys; print('gate:', json.load(sys.stdin)['projectStatus']['status'])"       # expect OK
```

## One-time user-side setup (before WP-1 merges)

1. SonarCloud → My Account → Security → generate token → add as `SONAR_TOKEN`
   repo secret in GitHub.
2. SonarCloud project → Administration → Analysis Method → turn **off**
   Automatic Analysis.
