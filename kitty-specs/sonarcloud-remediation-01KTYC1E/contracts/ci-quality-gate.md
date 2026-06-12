# Contract: SonarCloud PR quality-gate check

**Mission**: `sonarcloud-remediation-01KTYC1E`

This mission exposes no API; its externally observable contract is the CI
check. Consumers: GitHub branch protection, PR reviewers, future v2 WPs.

## Check behavior

| Condition | `sonar` job result | PR check |
|---|---|---|
| Quality gate passes on the PR analysis | success | green |
| Quality gate fails (new issues, gate conditions) | failure (`sonar.qualitygate.wait=true`) | red — blocking from day one |
| `SONAR_TOKEN` missing/invalid | failure with actionable log line | red |
| Fork PR without secret access | scan skipped via `if:` guard (documented limitation, secrets unavailable to forks) | neutral/skipped |

## Inputs

- `SONAR_TOKEN` — GitHub Actions secret (user-provisioned; never committed).
- `sonar-project.properties` — single source of scanner config.
- `coverage/lcov.info` — produced by `pnpm test:coverage` in the same job.

## Preconditions (one-time, user-side — must be flagged in WP-1's PR)

1. `SONAR_TOKEN` secret created in repo settings.
2. SonarCloud Automatic Analysis **disabled** (Administration → Analysis
   Method) before WP-1 merges, or the first CI analysis errors.

## Postconditions after the mission merges

- Next `main` analysis: 0 open issues (or documented acceptances per D-9),
  0 hotspots TO_REVIEW, quality gate `OK`.
- Every subsequent PR gets a pass/fail SonarCloud check + inline annotations.
