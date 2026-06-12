# Data Model: SonarCloud remediation

**Mission**: `sonarcloud-remediation-01KTYC1E` · **Date**: 2026-06-12

This mission is lint remediation + CI plumbing: it introduces **no domain
entities** and changes **no runtime data structures**. The "model" is the
configuration surface below.

## Configuration entities

### sonar-project.properties (NEW)
| Key | Value | Why |
|---|---|---|
| `sonar.projectKey` | `garrison-hq_muster` | existing SonarCloud project |
| `sonar.organization` | `garrison-hq` | existing org |
| `sonar.sources` | `src` | production code only |
| `sonar.tests` | `tests` | test code analyzed under test rules |
| `sonar.exclusions` | `dist/**, node_modules/**, site/**, kitty-specs/**, .kittify/**, behave/**, cts/**, souls/**` | build output, docs site, mission artifacts, fixtures |
| `sonar.javascript.lcov.reportPaths` | `coverage/lcov.info` | D-2 coverage upload |
| `sonar.coverage.exclusions` | `tests/**` | tests don't count toward coverage |

### CI job `sonar` (ci.yml, NEW job)
| Field | Value |
|---|---|
| trigger | `push: main`, `pull_request` (inherited from workflow) |
| needs | `build-test` (scan a build that is known green; coverage artifact produced there or regenerated) |
| checkout | `fetch-depth: 0` (new-code detection / blame) |
| coverage step | `pnpm test:coverage` → `coverage/lcov.info` |
| scan step | `SonarSource/sonarqube-scan-action@<full-SHA> # vX.Y.Z` |
| gate | `sonar.qualitygate.wait=true` → job failure = failed PR check (user decision #1) |
| secrets | `SONAR_TOKEN` (GitHub repo secret; never in repo) |

### package.json / vitest.config.ts deltas
| Change | Detail |
|---|---|
| devDependency | `@vitest/coverage-v8` (matches vitest ^3.2.4) |
| script | `"test:coverage": "vitest run --coverage"` |
| vitest config | `coverage: { provider: 'v8', reporter: ['text', 'lcov'], include: ['src/**'] }` |

### site.yml permissions (MODIFIED — D-6)
| Job | Permissions |
|---|---|
| workflow level | *(removed)* |
| `build` | `contents: read` |
| `deploy` | `pages: write`, `id-token: write` |

## Invariants (unchanged, verified by AC-4/AC-5)

- Canonical-JSON key ordering: UTF-16 code-unit order, byte-stable (D-3).
- Static CLI path: zero network access, deterministic output.
- Public API surface of `src/` modules: signatures unchanged (D-8; S107 fix
  is internal to `src/core/behavioral/runner.ts`).
