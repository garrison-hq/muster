# Contracts: A2A Adapter Manifest, Report, and Transport

These contracts pin the wire/file shapes the WPs implement. They mirror the
heartbeat adapter's manifest/summary contract so the CLI and report machinery
compose unchanged.

## 1. Test manifest (input) — `manifest.json`

```jsonc
{
  "adapter": "a2a",
  "cases": [
    {
      "id": "static-discovery-ok",
      "description": "valid card at the well-known URI passes discovery lint",
      "cardSource": "tests/fixtures/a2a/cards/valid.json",
      "gradingClass": "static-lint",
      "expectation": { "ok": true }
    },
    {
      "id": "static-obsolete-uri",
      "description": "card served at agent.json is flagged (§8.2)",
      "cardSource": "tests/fixtures/a2a/cards/obsolete-uri.json",
      "gradingClass": "static-lint",
      "expectation": { "ok": false, "rule": "well-known-uri" }
    },
    {
      "id": "static-signed-ok",
      "description": "signed card verifies offline against the supplied JWKS",
      "cardSource": "tests/fixtures/a2a/cards/signed.json",
      "gradingClass": "static-lint",
      "signed": { "jwksSource": "tests/fixtures/a2a/jwks/valid.json", "expectVerified": true },
      "expectation": { "ok": true, "signature": "verified" }
    },
    {
      "id": "static-tampered-fails",
      "description": "card mutated after signing fails offline verification",
      "cardSource": "tests/fixtures/a2a/cards/tampered.json",
      "gradingClass": "static-lint",
      "signed": { "jwksSource": "tests/fixtures/a2a/jwks/valid.json", "expectVerified": false },
      "expectation": { "ok": false, "signature": "invalid" }
    },
    {
      "id": "skill-behaves-as-declared",
      "description": "declared skill's live response is consistent with the card (§8.3.1)",
      "cardSource": "well-known",
      "gradingClass": "skill-behavior",
      "skillProbe": { "skillId": "echo", "input": "ping", "expect": "responds as the echo skill declares" },
      "runs": 5,
      "passThreshold": 4,
      "expectation": { "passed": true }
    },
    {
      "id": "skill-behavior-control",
      "description": "rigged-impossible control: grader must reject an off-spec response",
      "cardSource": "well-known",
      "gradingClass": "skill-behavior",
      "skillProbe": { "skillId": "drifted", "input": "ping", "expect": "an impossible exact phrase" },
      "runs": 5, "passThreshold": 4, "control": true,
      "expectation": { "passed": false }
    },
    {
      "id": "auth-enforced",
      "description": "unauthorized request rejected; authorized accepted (§7)",
      "cardSource": "well-known",
      "gradingClass": "auth-negative",
      "auth": { "scheme": "bearer", "method": "message/send", "authorized": false },
      "expectation": { "rejected": true }
    },
    {
      "id": "signed-card-live",
      "description": "optional: deployed card signature verifies against the live JWKS",
      "cardSource": "well-known",
      "gradingClass": "signed-card-live",
      "signed": { "jwksSource": "live", "expectVerified": true },
      "expectation": { "passed": true }
    }
  ]
}
```

**Notes**: `cardSource: "well-known"` ⇒ fetch from `MUSTER_A2A_ENDPOINT`. Every
grader ships at least one `control: true` case (FR-011). `runs`/`passThreshold`
apply to `skill-behavior` only (k-of-n).

## 2. Report (output) — `ManifestSummary` (also the `--json` payload)

```jsonc
{
  "totalCases": 8,
  "passed": 6,
  "failed": 1,
  "skipped": 1,
  "results": [
    {
      "id": "static-discovery-ok",
      "description": "valid card at the well-known URI passes discovery lint",
      "gradingClass": "static-lint",
      "passed": true,
      "skipped": false,
      "detail": { "discoveredFrom": "/.well-known/agent-card.json", "schemaValidation": "delegated:a2a-tck" }
    },
    {
      "id": "skill-behaves-as-declared",
      "gradingClass": "skill-behavior",
      "passed": false,
      "skipped": true,
      "skipReason": "MUSTER_A2A_ENDPOINT not set — live A2A case requires an endpoint"
    }
  ]
}
```

**Exit-code contract (FR-012)**: `failed > 0 → exit 1`; otherwise `exit 0`
(skipped does not fail). Unreadable manifest / IO error → `exit 2`. Byte-stable:
no timestamps, no random ordering — a scheduled CI job can diff two reports.

## 3. Transport contract (`transport.ts`, internal)

```typescript
// All read process.env.MUSTER_A2A_ENDPOINT / MUSTER_A2A_TOKEN at call time.
discoverCard(endpoint: string): Promise<AgentCard>;            // GET <endpoint>/.well-known/agent-card.json (§8.2)
invokeSkill(endpoint: string, skillId: string, input: string,
            auth?: string): Promise<string>;                  // JSON-RPC message/send
probeAuth(endpoint: string, method: string,
          auth: string | null): Promise<{ rejected: boolean }>; // unauth/wrong-scheme → expect rejection (§7)
fetchJwks(endpoint: string): Promise<Jwks>;                    // live JWKS for signed-card-live

// envEndpoint(): string | null  — returns null when MUSTER_A2A_ENDPOINT unset ⇒ live class skips (FR-009/010)
```

A reachable-endpoint error (timeout/malformed/refused) **throws** and the case
records `passed: false` (a failed run, never a skip). Only an absent
`MUSTER_A2A_ENDPOINT` produces a skip.
