# Phase 0 Research: A2A Agent Cards Adapter

This mission inherits its scope decision from the v2 agent-stack research round
(`kitty-specs/v2-agent-stack-research-01KTYA4C/research.md`, RQ-05). The four
items below resolve the *implementation* unknowns surfaced during planning; the
*scope* (residual-gap only) was already locked with the user.

## D-01 — JWS signature verification approach

**Decision**: Verify card JWS signatures with Node 22's built-in `node:crypto`
— import the JWK/JWKS public key via `crypto.createPublicKey({ key: jwk, format:
'jwk' })` and verify the detached/compact JWS with `crypto.verify(...)` (or
`crypto.createVerify` for RSA). **No new dependency** (not `jose`, not
`jsonwebtoken`).

**Rationale**: A2A signed cards use JWS (the card carries a `signatures` array of
JWS objects, A2A §8.x). Node 22 `crypto` supports JWK import and
RSASSA/ECDSA/EdDSA verification natively, which covers the algorithms A2A cards
use in practice (RS256/ES256/EdDSA). Staying on built-ins preserves the charter
minimal-dependency gate (current deps: `ajv`, `commander`, `yaml` only) and the
"no provider SDKs / byte-stable offline" NFRs. Verification is pure and
deterministic — perfect for the offline static-lint class.

**Alternatives considered**: `jose` (clean API, but a new runtime dep for
something built-ins already do); `jsonwebtoken` (JWT-centric, not the right shape
for detached card JWS). Both rejected on the dependency gate.

**Implication**: `signature.ts` exposes a small pure surface — `verifyCardJws(card,
jwks) → { verified: boolean, reason?, alg?, kid? }` — usable both offline (fixture
JWKS) and live (fetched JWKS), with tamper detection falling straight out of a
failed verify.

## D-02 — Live probe transport

**Decision**: The transport client speaks **A2A JSON-RPC 2.0 over HTTP** (one of
A2A's three normative transports), using built-in `fetch`. Discovery fetches
`<endpoint>/.well-known/agent-card.json` (§8.2); skill probes call the A2A
`message/send` JSON-RPC method; auth negatives send the same call with a
missing/wrong credential.

**Rationale**: As of A2A v1.0 the protobuf `a2a.proto` is the single normative
definition, but the protocol defines three equivalent transports (gRPC,
JSON-RPC/HTTP, HTTP+SSE). JSON-RPC-over-HTTP is the lowest-friction faithful
choice: no protobuf toolchain, no codegen, built-in `fetch` only, and it is what
the residual-gap probes need (send a message to a declared skill, observe the
response; send an unauthorized request, observe rejection). The adapter does NOT
re-implement cross-transport testing — that is `a2a-tck`'s job (C-002).

**Alternatives considered**: gRPC via `a2a.proto` (normative but needs a protobuf
runtime + codegen — a heavy new dependency for no residual-gap benefit);
HTTP+SSE streaming (only needed for streaming skills, out of residual-gap scope).

**Implication**: `transport.ts` exposes `discoverCard(endpoint)`,
`invokeSkill(endpoint, skillId, input, auth?)`, and `probeAuth(endpoint, method,
auth)`; all read `MUSTER_A2A_ENDPOINT` / `MUSTER_A2A_TOKEN` from `process.env` at
call time (never stored), mirroring how the core client reads its env.

## D-03 — Deterministic live testing without an external A2A server

**Decision**: Ship a **minimal in-process A2A test-server fixture**
(`tests/fixtures/a2a/server/test-server.ts`) built on `node:http`, bound to an
ephemeral port. It serves the well-known card, a JWKS endpoint, and a JSON-RPC
`message/send` handler with a toggle for (a) honest-vs-drifted skill responses
and (b) enforced-vs-unenforced auth. Tests start it, point `MUSTER_A2A_ENDPOINT`
at it, run the live class, and tear it down. The live smoke run can point at the
same fixture (or a user-supplied real endpoint).

**Rationale**: The live class must be exercised in CI (NFR-004/006) without a
hosted dependency (NFR-005) and deterministically. An in-process fixture server
makes the live path fully reproducible — honest and adversarial cases
(drifted-skill, declared-but-unenforced) are produced by the toggle, which also
backs the rigged-impossible discrimination controls (FR-011).

**Alternatives considered**: mocking `fetch` (tests the mock, not the transport —
weaker); requiring an external A2A server in CI (violates NFR-005 + non-determinism).

**Implication**: the test-server is a test-only fixture, never shipped in the
product `files` surface; it is the deterministic stand-in for "a deployed card."

## D-04 — Skip-vs-fail semantics for the live class

**Decision**: Mirror the heartbeat adapter exactly. When `MUSTER_A2A_ENDPOINT`
is **unset**, every live case is recorded `skipped: true` with a `skipReason`
and does **not** flip the exit code (the static lint still runs and reports).
When the endpoint **is set** but a probe **errors** (unreachable, malformed
response, timeout), that run counts as a **failed** run — never skipped, never
retried (FR-010). The optional live signed-card check is the one nested skip:
skipped only when the **live JWKS** is unavailable while the endpoint itself is
reachable.

**Rationale**: Preserves the established "env-unset → skip, live-failure → fail"
contract that the six adapters and the CLI exit-code logic already implement
(`summary.failed > 0 ? 1 : 0`; skipped does not fail). Distinguishing "you
didn't configure an endpoint" (skip) from "the deployed agent is broken" (fail)
is the whole point of a CI monitoring contract (FR-012).

**Alternatives considered**: treating unset env as a failure (would make CI red
for anyone running static-only — wrong); retrying errored probes (hides
flakiness, violates errored-run-=-failed-run charter rule).

## Carried scope decision (from RQ-05, not re-litigated)

muster does **not** re-implement a generic A2A card validator. Card-schema
validation, discovery breadth, and capability-conditional behavioral testing
across the three transports are owned by `a2aproject/a2a-tck` (active, v1.0.0).
muster covers only the residual gap: signed-card verification, skill-level
behavioral probing, auth-enforcement negatives, and a CI monitoring posture
(C-002). The static lint records that deep schema validation is delegated to the
TCK (FR-005), so users are pointed at the right tool rather than given a false
sense of full coverage.
