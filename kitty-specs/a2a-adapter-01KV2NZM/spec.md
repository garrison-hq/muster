# Feature Specification: A2A Agent Cards (Manifests) Conformance Adapter

**Mission**: `a2a-adapter-01KV2NZM` (mission_id `01KV2NZMSYZKM7B3AYH8QW13QP`)
**Created**: 2026-06-14
**Status**: Draft
**Mission Type**: software-dev
**Milestone**: v1-extended (agent-file stack) — Manifests layer (7th layer)
**Input**: Add an A2A Agent Cards adapter scoped to the **residual gap** the official A2A conformance suite does not cover: signed-card verification, skill-level behavioral probing (declared skills vs. actual responses), auth-enforcement negative tests, and a continuous-CI monitoring posture for deployed cards. Two-class adapter behind muster's `SpecAdapter` boundary, wired into the CLI as `muster a2a run <manifest>`.
**Seeds**: `kitty-specs/v2-agent-stack-research-01KTYA4C/research.md` (RQ-05, lines 137–161); the six merged adapters (`skills`, `openclaw-sop`, `tools`, `memory`, `heartbeat`, `cross-layer`) as the two-class precedent; the project charter.

---

## Overview

A2A (Agent-to-Agent) is a Linux Foundation protocol at spec **v1.0.0**
(2026-03-12). An agent advertises itself with an **Agent Card** served at the
well-known URI `/.well-known/agent-card.json` (A2A §8.2 — **not** the obsolete
`agent.json`). As of v1.0 the protobuf `specification/a2a.proto` is the single
**normative** definition; the published JSON Schema is explicitly
**non-normative**. The card declares the agent's skills, capabilities, and
security schemes, and the spec mandates concrete card-accuracy MUSTs: interface
accuracy (§8.3.1), capability-conditional error behavior (§3.3.4), and
authentication per the declared schemes (§7).

The research (RQ-05) established that an **official conformance suite already
exists** — `a2aproject/a2a-tck` (active, v1.0.0) — and owns the center of this
layer: card-schema validation, discovery, and capability-conditional behavioral
testing across three transports. **muster MUST NOT re-implement a generic card
validator.** This mission takes only the **residual gap** the TCK does not
cover, which is also exactly muster's wedge — verifying that a *deployed* card
tells the truth, end to end:

1. **signed-card verification** — the card's JWS signature is valid (offline,
   against a supplied JWKS) and, optionally, valid on the live deployment;
2. **skill-level behavioral probing** — the agent's *actual responses* are
   consistent with the *skills it declares* (interface accuracy, §8.3.1);
3. **auth-enforcement negatives** — the declared security schemes (§7) are
   actually enforced: unauthorized / wrong-scheme requests are rejected;
4. **continuous-CI monitoring posture** — a deterministic exit-code + JSON
   report contract so a scheduled CI job can monitor a deployed card over time.

This mission adds an **A2A adapter** behind muster's `SpecAdapter` boundary,
delivering two test classes against an Agent Card:

1. **Static lint** (offline, deterministic): the minimal residual-gap structural
   checks — well-known URI correctness (`agent-card.json`, not `agent.json`),
   **offline JWS signature verification** of a card fixture against a supplied
   JWKS/public-key fixture, and presence/structural sanity of declared security
   schemes and skills. Deep schema validation is **explicitly ceded to
   `a2a-tck`**; the lint parses only what the residual-gap probes need and
   records that full schema conformance is out of scope.
2. **Live conformance probes** (against a real A2A endpoint): skill-behavior
   probes (stochastic, k-of-n — declared skill vs. actual response), and
   deterministic live checks — auth-enforcement negatives and an optional live
   signed-card check against the deployed card and its JWKS.

Unlike the other six adapters, the behavioral class does **not** talk to an
OpenAI-compatible chat model. It talks to a **real A2A server** discovered at
the well-known URI and addressed over A2A's transport. The endpoint is supplied
via a new environment variable (`MUSTER_A2A_ENDPOINT`, with an optional
authorized credential in `MUSTER_A2A_TOKEN`); the live class is **skipped
gracefully** when `MUSTER_A2A_ENDPOINT` is unset, exactly as the other adapters
skip behavioral probes when their model env is absent. The static lint always
runs offline. Checks cite muster's published rubric, with the A2A spec v1.0.0
(pinned: protobuf `a2a.proto`, §8.2 / §8.3.1 / §3.3.4 / §7) cited directly for
the normative MUSTs.

## User Scenarios & Testing

### Primary User Stories

1. **Card publisher (truth-in-advertising)**: As someone deploying an A2A agent,
   I confirm my agent actually *does* what its card declares — its skills behave
   as advertised — before I publish the card, so other agents can trust it.
2. **Security owner (auth enforcement)**: As a security owner, I confirm that the
   security schemes my card declares are actually enforced — unauthenticated or
   wrong-scheme requests are rejected — not merely declared.
3. **Card publisher (signed cards)**: As a publisher of a signed card, I confirm
   the signature verifies (offline in CI, and optionally against the live
   deployment) so consumers can trust the card's authenticity.
4. **Platform operator (CI monitoring)**: As an operator, I run muster on a
   schedule against a deployed card and get a deterministic pass/fail exit code
   plus a machine-readable report, so drift between the card and the live agent
   is caught continuously.

### Acceptance Scenarios

#### Static lint (offline, deterministic)

1. **Given** a well-formed Agent Card served at `/.well-known/agent-card.json`,
   **When** muster lints it, **Then** the report says `ok: true` and records that
   deep schema validation is delegated to `a2a-tck`.
2. **Given** a card discovered at the obsolete `/.well-known/agent.json`, **When**
   linted, **Then** an error finding cites §8.2 (wrong well-known URI).
3. **Given** a **signed** card fixture plus a supplied JWKS, **When** linted,
   **Then** the JWS signature is verified offline and the report records
   `signature: verified`; **Given** a card whose payload was tampered after
   signing, the offline verification fails with a clear finding.
4. **Given** a card declaring security schemes, **When** linted, **Then** the
   declared schemes are structurally validated and surfaced for the auth-negative
   probes; a card declaring no schemes records that auth probes are not
   applicable.

#### Live conformance probes (against `MUSTER_A2A_ENDPOINT`)

5. **Given** a deployed agent whose card declares a skill and a manifest case
   that invokes that skill, **When** muster probes the live endpoint N times,
   **Then** the actual responses are consistent with the declared skill at or
   above the rubric threshold (k-of-n), citing §8.3.1 interface accuracy.
6. **Given** a card declaring a security scheme on a protected method, **When**
   muster sends an unauthenticated / wrong-scheme request, **Then** the request
   is rejected (auth-enforcement negative passes), citing §7; **and Given** a
   correctly-authorized request, **Then** it is accepted.
7. **Given** a deployed **signed** card and its live JWKS, **When** the optional
   live signature check runs, **Then** the deployed card's signature verifies
   against the live keys.
8. **Given** `MUSTER_A2A_ENDPOINT` is unset, **When** the suite runs, **Then**
   the live class is skipped gracefully (recorded as skipped, not failed) and the
   static lint still runs and reports.
9. **Given** a rigged-impossible discrimination control per grader (a
   skill-behavior grader forced to pass an off-spec response; an auth-negative
   grader pointed at an endpoint that does not reject; a signature grader fed a
   tampered card), **When** the suite runs, **Then** the controls fail as
   designed.

#### CI monitoring contract

10. **Given** any run, **When** it completes, **Then** muster exits non-zero iff
    any non-skipped check failed and emits a machine-readable JSON report, so a
    scheduled CI job can gate on the exit code and diff the report over time.

### Edge Cases

- Card declares a skill the deployed agent no longer serves — skill-behavior
  probe fails (card/behavior drift; cf. field evidence A2A issue #1755).
- Card declares an auth scheme but the endpoint accepts unauthenticated requests
  anyway — auth-negative probe fails (declared-but-unenforced).
- Unsigned card where the manifest expects a signature — recorded as a finding;
  unsigned card where no signature is expected — not applicable, not a failure.
- `MUSTER_A2A_ENDPOINT` set but unreachable / errors mid-suite — an errored probe
  counts as a **failed** run (never skipped, never retried); skip applies only to
  the *unset* env, not to a live endpoint that fails.
- Live JWKS unreachable while an offline JWKS fixture is supplied — the offline
  signature check still runs; only the optional live signature check is skipped.
- Card at well-known URI redirects or is served with the wrong content type —
  discovery finding citing §8.2.

## Requirements

### Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-001 | The A2A adapter implements muster's `SpecAdapter` contract and reuses the core pipeline, canonical-JSON, report, CTS runner, and shared behavioral `pass^k` primitive without modifying the spec-agnostic core. | Proposed |
| FR-002 | The adapter parses an Agent Card and a companion manifest declaring, per case: the card source, the skill(s) to probe with expected-response framing, the security scheme(s) and protected method(s) for auth negatives, signed-card expectations, and the grading class. | Proposed |
| FR-003 | The static lint verifies the well-known URI is `/.well-known/agent-card.json` (flagging the obsolete `agent.json`), citing A2A §8.2. | Proposed |
| FR-004 | The static lint performs **offline JWS signature verification** of a card against a supplied JWKS/public-key fixture, with deterministic pass/fail and a tamper-detection finding. | Proposed |
| FR-005 | The static lint structurally validates declared security schemes and declared skills only to the extent the residual-gap probes require, and **explicitly delegates full card-schema validation to `a2a-tck`**, recording that delegation in the report. | Proposed |
| FR-006 | The adapter provides a **skill-behavior** live probe: invoke each declared skill against `MUSTER_A2A_ENDPOINT` and grade the actual response for consistency with the declared skill over N runs, k-of-n, citing §8.3.1. | Proposed |
| FR-007 | The adapter provides an **auth-enforcement negative** live check: unauthenticated / wrong-scheme requests to a protected method must be rejected, and a correctly-authorized request must be accepted, citing §7. | Proposed |
| FR-008 | The adapter provides an **optional live signed-card** check: fetch the deployed card at the well-known URI and verify its signature against the live JWKS; skipped (not failed) when the live JWKS is unavailable. | Proposed |
| FR-009 | The live class talks to a real A2A endpoint via `MUSTER_A2A_ENDPOINT` (authorized credential via `MUSTER_A2A_TOKEN`); it is **skipped gracefully** when `MUSTER_A2A_ENDPOINT` is unset, while the static lint always runs. The adapter does not use the chat-model env (`MUSTER_ENDPOINT`/`MUSTER_MODEL`/`MUSTER_API_KEY`). | Proposed |
| FR-010 | An errored live probe counts as a failed run everywhere (never skipped, never retried); env-unset skipping is distinct from a live failure. | Proposed |
| FR-011 | Every grader (skill-behavior, auth-negative, signature) ships a rigged-impossible discrimination control proving it can fail. | Proposed |
| FR-012 | `muster a2a run <manifest>` exits non-zero iff any non-skipped check failed and emits muster's machine-readable JSON report, supporting a scheduled-CI monitoring posture; the exit-code/JSON contract and a CI recipe are documented. | Proposed |
| FR-013 | The adapter reports findings in muster's machine-readable format; checks cite muster's published rubric, with A2A spec v1.0.0 (protobuf `a2a.proto`; §8.2 / §8.3.1 / §3.3.4 / §7, pinned) cited directly for the normative MUSTs. | Proposed |
| FR-014 | The mission ships a fixture set: a minimal local A2A test-server serving a card at the well-known URI with declared skills and security schemes; signed/tampered card fixtures + JWKS; and obsolete-URI / drifted-skill / declared-but-unenforced negatives — shaped as a candidate upstream conformance suite for the residual gap. | Proposed |

### Non-Functional Requirements

| ID | Requirement | Threshold | Status |
|----|-------------|-----------|--------|
| NFR-001 | The static lint path (including offline JWS verification) runs fully offline with byte-stable deterministic output. | Zero network calls; identical bytes across repeated runs and machines. | Proposed |
| NFR-002 | Single-card static lint latency. | < 5 seconds. | Proposed |
| NFR-003 | Full static fixture suite latency. | < 10 seconds. | Proposed |
| NFR-004 | Live conformance suite latency against the local A2A test-server fixture. | < 5 minutes. | Proposed |
| NFR-005 | A2A endpoint access is bring-your-own via `MUSTER_A2A_ENDPOINT`; credentials from the environment only. | No hosted dependencies; no credentials in the repo. | Proposed |
| NFR-006 | Type-check and test gates. | `tsc` strict passes; full Vitest suite green incl. the A2A fixture suite; SonarCloud quality gate passes. | Proposed |

### Constraints

| ID | Constraint | Status |
|----|------------|--------|
| C-001 | The spec-agnostic core never learns A2A specifics; all A2A knowledge lives in the adapter behind the `SpecAdapter` boundary. | Proposed |
| C-002 | **Residual-gap only.** The adapter does not re-implement a generic A2A card validator; card-schema validation, discovery breadth, and capability-conditional behavioral testing across transports are ceded to `a2aproject/a2a-tck` (research RQ-05). | Proposed |
| C-003 | Discovery uses the well-known URI `/.well-known/agent-card.json` (§8.2); the protobuf `a2a.proto` is treated as the single normative definition and the published JSON Schema as non-normative (A2A v1.0.0). | Proposed |
| C-004 | The live class targets a real A2A endpoint (`MUSTER_A2A_ENDPOINT`), not an OpenAI-compatible chat model; it skips on unset env but never silently passes a live failure. | Proposed |
| C-005 | The work is shaped to be upstreamable as a residual-gap conformance suite for the manifests layer. | Proposed |

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | A publisher can confirm a deployed agent's actual responses are consistent with the skills its card declares (k-of-n). |
| SC-002 | A security owner can confirm declared security schemes are enforced — unauthorized requests are rejected and authorized requests accepted. |
| SC-003 | A publisher can confirm a signed card's signature verifies offline in CI, and optionally against the live deployment. |
| SC-004 | The static lint flags the obsolete `agent.json` well-known URI and delegates deep schema validation to `a2a-tck` rather than duplicating it. |
| SC-005 | Every grader fails its rigged-impossible control. |
| SC-006 | The static lint produces byte-identical output across repeated runs and machines; `muster a2a run` exits non-zero iff a non-skipped check failed and emits a machine-readable report usable by a scheduled CI job. |

## Key Entities

- **Agent Card**: the manifest an A2A agent serves at `/.well-known/agent-card.json`.
- **Declared skill**: a skill advertised on the card, probed against the live agent.
- **Security scheme**: a declared auth scheme (§7), exercised by auth-negative probes.
- **Signed card / JWKS**: a JWS-signed card and the key set used to verify it (offline fixture and/or live).
- **Skill-behavior probe**: the k-of-n comparison of a live response against the declared skill.
- **Auth-negative check**: asserts unauthorized/wrong-scheme requests are rejected.
- **CI monitoring contract**: the exit-code + JSON-report behavior enabling scheduled monitoring of a deployed card.

## Dependencies & Assumptions

- **Depends on**: muster v1 core (`SpecAdapter`, pipeline, canonical JSON, report,
  CTS runner, shared `pass^k` primitive in `src/core/behavioral/pass-k.ts`).
- **Assumption**: the live class addresses a real A2A endpoint over A2A's
  transport; the adapter ships its own A2A transport client for probes (the
  core's OpenAI-compatible BYOM client is for chat models and is not used here).
- **Assumption**: a minimal local A2A test-server fixture stands in for a
  deployed agent in CI, so the live class is exercised deterministically without
  an external dependency.
- **Out of scope**: re-implementing card-schema validation, discovery breadth, or
  cross-transport capability testing (owned by `a2a-tck`); the skills, SOP,
  tools, memory, schedule layers; cross-layer composition; a hosted monitoring
  daemon (CI monitoring is an exit-code/JSON contract, not a service).

## Scope Guard (carried from BRIEF.md)

Not an agent framework or runtime; not a prompt optimizer or generator; not a
registry; not a hosted service; not a re-implementation of `a2a-tck`. CLI + CI
exit codes only.
