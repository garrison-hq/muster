# Phase 1 Data Model: A2A Agent Cards Adapter

All entities live inside `src/adapters/a2a/`; `src/core/` learns nothing
A2A-specific (C-001). Shapes mirror the heartbeat adapter's manifest/summary
model so the CLI and report machinery compose unchanged.

## Entities

### AgentCard (parsed)
The card an A2A agent serves at `/.well-known/agent-card.json`.
- `name: string`, `version: string`
- `skills: DeclaredSkill[]`
- `securitySchemes: SecurityScheme[]` (may be empty)
- `signatures?: JwsSignature[]` (present iff the card is signed)
- `discoveredFrom: string` — the URI the card was loaded from (used to flag the
  obsolete `agent.json`, §8.2)
- **Invariant**: parse never throws on a structurally-odd card — it returns
  findings; deep schema validation is delegated to `a2a-tck` (FR-005) and that
  delegation is recorded in the report.

### DeclaredSkill
A skill advertised on the card and probed against the live agent.
- `id: string`, `description: string`
- `expectedBehavior?: string` — framing used to grade an actual response (§8.3.1)
- **Invariant**: a skill the card declares but the live server no longer serves
  → skill-behavior probe fails (drift; cf. A2A issue #1755).

### SecurityScheme
A declared auth scheme (§7) exercised by the auth-negative probes.
- `id: string`, `type: string` (e.g. `bearer`, `apiKey`, `oauth2`)
- `protectedMethods: string[]` — A2A methods the scheme is meant to guard
- **Invariant**: declared-but-unenforced (server accepts unauthenticated calls)
  → auth-negative probe fails.

### JwsSignature / Jwks
- `JwsSignature`: `{ protected: string; signature: string; header?: object }`
  (compact/detached JWS over the card payload).
- `Jwks`: a JSON Web Key Set used to verify a signature, supplied **offline**
  (fixture) and/or fetched **live**.
- **Invariant (offline)**: byte-stable deterministic verify; a card mutated after
  signing fails verification (tamper detection).
- **Invariant (live)**: the optional live check is skipped (not failed) when the
  live JWKS is unreachable but the endpoint is reachable.

### ManifestCase (FR-002)
One row of the test manifest. Discriminated by `gradingClass`.
- `id: string`, `description: string`
- `cardSource: string` — fixture path or `well-known` (fetch live)
- `gradingClass: "static-lint" | "skill-behavior" | "auth-negative" | "signed-card-live"`
- `skillProbe?: { skillId: string; input: string; expect: string }`
- `auth?: { scheme: string; method: string; authorized: boolean }`
- `signed?: { jwksSource: string; expectVerified: boolean }`
- `runs?: number`, `passThreshold?: number` — k-of-n params for `skill-behavior`
- `control?: boolean` — marks a rigged-impossible discrimination control (FR-011)
- `expectation: Record<string, unknown>` — per-class expected outcome
- **Invariant**: every grader appears at least once with `control: true`; a
  control case is constructed so the grader **must** fail (proves it can fail).

### CaseResult / ManifestSummary
Identical shape to heartbeat's so the CLI/report compose unchanged.
- `CaseResult`: `{ id, description, gradingClass, passed: boolean,
  skipped: boolean, skipReason?: string, detail?: Record<string, unknown> }`
- `ManifestSummary`: `{ totalCases, passed, failed, skipped, results: CaseResult[] }`
- **Invariant (exit code, FR-012)**: `failed > 0 ? exit 1 : exit 0`; `skipped`
  never flips the exit code; execution errors (bad manifest/IO) → exit 2.
- **Invariant (skip vs fail, FR-010)**: `MUSTER_A2A_ENDPOINT` unset → live cases
  `skipped`; endpoint set but probe errors → `passed: false` (failed run).

## State / flow

```
load manifest ──► for each case by gradingClass:
  static-lint        → card.ts (discovery URI, structure) + signature.ts (offline JWS)   [always runs, offline]
  skill-behavior     → transport.invokeSkill × runs → skill-behavior grader (k-of-n)      [skip if env unset]
  auth-negative      → transport.probeAuth (unauth reject + authorized accept)            [skip if env unset]
  signed-card-live   → transport.discoverCard + signature.ts (live JWKS)                  [skip if env unset; nested skip if live JWKS down]
──► aggregate ManifestSummary ──► CLI: JSON report + exit code
```

## Grading classes ↔ FRs ↔ normative citations

| gradingClass | FR | Deterministic? | Citation |
|---|---|---|---|
| static-lint (discovery + structure) | FR-003, FR-005 | yes (offline) | A2A §8.2; delegation note → `a2a-tck` |
| static-lint (offline JWS) | FR-004 | yes (offline) | A2A signed-card §; tamper detection |
| skill-behavior | FR-006 | no (k-of-n) | A2A §8.3.1 interface accuracy |
| auth-negative | FR-007 | yes (live) | A2A §7 auth |
| signed-card-live | FR-008 | yes (live, optional) | A2A signed-card § + live JWKS |

## Charter notes
- `conjunctivePassK` (`src/core/behavioral/pass-k.ts`) is the only behavioral
  primitive reused; an errored run contributes `false` (never skipped) to the
  k-of-n tally (FR-010).
- No A2A type is imported by `src/core/` (C-001); all composition is in
  `src/adapters/a2a/` + the CLI wiring (C-004).
- All report output is canonical/byte-stable (no `Date`, no random); the
  `discoveredFrom`/`detail` fields carry no timestamps.
