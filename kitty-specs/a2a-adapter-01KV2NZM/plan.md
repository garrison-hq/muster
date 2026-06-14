# Implementation Plan: A2A Agent Cards (Manifests) Conformance Adapter

**Branch**: `feat/a2a-adapter` (planning + implementation accumulate here; merges to `main` via **one PR** — `main` is protected) | **Date**: 2026-06-14 | **Spec**: `kitty-specs/a2a-adapter-01KV2NZM/spec.md`
**Input**: Feature specification from `/home/jeroennouws/dev/garrison-hq/muster/kitty-specs/a2a-adapter-01KV2NZM/spec.md`

## Summary

Add an **A2A adapter** (the 7th, "manifests" layer) behind muster's `SpecAdapter`
boundary, scoped to the **residual gap** the official `a2aproject/a2a-tck` does
not cover (research RQ-05, C-002). Like the `heartbeat` adapter, it stubs the
RFC-1-shaped `SpecAdapter` methods (`parse`/`validate`/`resolve`/
`evaluateTriggers`) and ships its own `runManifest` + `ManifestSummary` with
adapter-specific grading classes. Two test classes:

- **Static lint** (offline, deterministic — FR-003/004/005): well-known URI is
  `/.well-known/agent-card.json` not the obsolete `agent.json` (§8.2); **offline
  JWS signature verification** of a card against a supplied JWKS fixture
  (tamper-detecting); structural sanity of declared security schemes + skills
  only. Deep card-schema validation is **explicitly delegated to `a2a-tck`** and
  that delegation is recorded in the report.
- **Live conformance probes** (against a real A2A endpoint — FR-006/007/008):
  **skill-behavior** (k-of-n: declared skill vs. actual response, §8.3.1),
  **auth-enforcement negatives** (unauth/wrong-scheme rejected, authorized
  accepted, §7), and an **optional live signed-card** check (deployed card vs.
  live JWKS).

The one architectural departure from the six prior adapters: the live class
talks to a **real A2A server**, not an OpenAI-compatible chat model. So the
adapter ships its **own A2A transport client** (`transport.ts`) reading a new
`MUSTER_A2A_ENDPOINT` (+ optional `MUSTER_A2A_TOKEN`), and the mission ships a
**minimal in-process A2A test-server fixture** so the live class is exercised
deterministically in CI. The core OpenAI `ChatClient` is not used; the shared
`conjunctivePassK` primitive (`src/core/behavioral/pass-k.ts`) IS reused for
k-of-n. The live class **skips gracefully** (recorded skipped, not failed) when
`MUSTER_A2A_ENDPOINT` is unset; the static lint always runs (C-004, FR-009/010).
`muster a2a run <manifest>` exits non-zero iff a non-skipped check failed and
emits a machine-readable JSON report — the CI monitoring contract (FR-012).

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 22 LTS (unchanged).
**Primary Dependencies**: **no new runtime deps, no new dev deps.** JWS
verification uses Node 22 built-in `node:crypto` (`createPublicKey` with JWK
import + `verify`); the A2A transport client uses built-in `fetch`; the
test-server fixture uses built-in `node:http`. The shared `conjunctivePassK`
primitive and the CTS/report/canonical-JSON machinery in `src/core/` are reused
as-is (FR-001, C-001).
**Storage**: N/A.
**Testing**: Vitest 3 (existing `vitest.config.ts`); the fixture suite +
in-process A2A test-server are the primary acceptance surface. `pnpm
test:coverage` uploads lcov to SonarCloud; new-code coverage ≥ 80 % (charter
gate).
**Target Platform**: Linux (Fedora) dev + GitHub Actions ubuntu-latest. Static
lint path (incl. offline JWS verification) is fully offline (NFR-001).
**Project Type**: single package (existing layout); new adapter mirrors
`src/adapters/heartbeat/` (manifest-runner shape, not RFC-1 resolve shape).
**Performance Goals**: static lint < 5 s/card (NFR-002), full static fixture
suite < 10 s (NFR-003), live suite against the local test-server fixture < 5 min
(NFR-004).
**Constraints**: byte-stable deterministic static output; no model-provider
SDKs; no credentials in repo; spec-agnostic core boundary untouched (C-001);
residual-gap only — no generic card validator (C-002).
**Scale/Scope**: one new adapter (~5 WPs) + one in-process test-server fixture;
fixture set shaped as a candidate upstream residual-gap conformance suite (C-005).

## Charter Check

*Charter: `.kittify/charter/charter.md` (v1 charter; all engineering constraints
carry forward to this v1-extended mission).*

| Charter gate | Status |
|---|---|
| `tsc` strict passes before merge | PASS — every WP carries a type-check AC |
| Full Vitest suite green incl. CTS + a2a fixture suite + test-server | PASS — static fixture + live test-server suites are the primary AC surface (FR-014) |
| No implementation before spec/plan/tasks locked | PASS — this plan precedes any code change |
| ≥ 80 % new-code coverage (SonarCloud quality gate) | PASS — card parser, JWS verify, graders, transport client are unit-testable; the in-process test-server supplies live-path line coverage |
| Every check cites a normative source | PASS — §8.2 / §8.3.1 / §7 of A2A v1.0.0 (protobuf `a2a.proto` normative) cited directly; other checks cite muster rubric (FR-013) |
| Grading is two-tier; errored run = failed run | PASS — skill-behavior is stylistic k-of-n; auth-negative + signature are deterministic; an errored live probe = failed run, distinct from env-unset skip (FR-010) |
| Every grader ships a rigged-impossible discrimination control | PASS — FR-011 mandates a rigged control per grader (skill-behavior, auth-negative, signature) |
| Residual-gap only; no generic card validator | PASS — C-002; deep schema validation delegated to `a2a-tck` and recorded (FR-005) |
| Discovery uses well-known URI; proto normative | PASS — `/.well-known/agent-card.json` (§8.2); JSON Schema treated non-normative (C-003) |
| Static path offline + byte-stable deterministic | PASS — NFR-001; offline JWS verify uses fixtures, no network |
| No hardcoded providers / no credentials in repo | PASS — NFR-005; `MUSTER_A2A_ENDPOINT` + `MUSTER_A2A_TOKEN` read from env at run time |
| Minimal dependencies | PASS — zero new runtime/dev deps; Node built-ins only (`crypto`, `fetch`, `http`) |
| Scope guard: not a framework, runtime, optimizer, hosted service, or a2a-tck reimpl | PASS — CLI + CI exit codes only; CI monitoring is an exit-code/JSON contract, not a daemon |

No violations. (New pattern — A2A transport client + in-process test-server —
tracked in Complexity Tracking below; it is justified by C-004 and does not
breach the core boundary.)

## Project Structure

### Documentation (this mission)

```
kitty-specs/a2a-adapter-01KV2NZM/
├── spec.md              # done
├── plan.md              # this file
├── research.md          # Phase 0 — JWS approach, transport choice, test-server, skip/fail
├── data-model.md        # Phase 1 — entities, invariants, charter notes
├── contracts/           # Phase 1 — manifest schema + report schema + transport contract
├── quickstart.md        # Phase 1 — local + CI verification steps
└── tasks.md             # Phase 2 (/spec-kitty.tasks — NOT created here)
```

### Source Code (new files only; no existing file is modified except CLI wiring)

```
src/adapters/a2a/
├── index.ts             # A2aAdapter assembly (SpecAdapter stubs) + runManifest + ManifestSummary
├── card.ts              # Agent Card parse + discovery URI checks + scheme/skill structural sanity
├── signature.ts         # JWS verification (offline + live) via node:crypto JWK import
├── transport.ts         # A2A endpoint client: discover well-known card, send JSON-RPC message,
│                         #   send unauth/wrong-scheme request; reads MUSTER_A2A_ENDPOINT/TOKEN; skip-on-unset
├── lint.ts              # static-lint class: assembles card.ts + offline signature.ts, byte-stable report
└── graders/
    ├── skill-behavior.ts   # k-of-n declared-skill-vs-response grader + rigged-impossible control
    ├── auth-negative.ts    # auth-enforcement grader (reject unauth / accept authorized) + rigged control
    └── signed-card.ts      # live signed-card grader (deployed card vs live JWKS) + rigged control

tests/
├── a2a/
│   ├── card.test.ts             # discovery URI + structural sanity unit tests
│   ├── signature.test.ts        # offline JWS verify + tamper detection unit tests
│   ├── lint.test.ts             # static-lint integration (byte-stable)
│   ├── skill-behavior.test.ts   # skill probe + discrimination control (vs test-server)
│   ├── auth-negative.test.ts    # auth enforcement + discrimination control (vs test-server)
│   ├── signed-card.test.ts      # live signature check + discrimination control (vs test-server)
│   └── manifest.test.ts         # full manifest runner integration + exit-code/skip semantics
└── fixtures/a2a/
    ├── cards/
    │   ├── valid.json               # well-formed card at well-known URI
    │   ├── signed.json              # JWS-signed card (verifies vs jwks/valid)
    │   ├── tampered.json            # signed then payload-mutated (offline verify must fail)
    │   ├── obsolete-uri.json        # served at agent.json (flag §8.2)
    │   ├── drifted-skill.json       # declares a skill the server no longer serves
    │   └── declared-unenforced.json # declares an auth scheme the server does not enforce
    ├── jwks/
    │   ├── valid.json               # JWKS verifying signed.json
    │   └── wrong-key.json           # JWKS that must NOT verify signed.json
    ├── server/
    │   └── test-server.ts           # minimal in-process A2A server: serves well-known card,
    │                                 #   JSON-RPC method handler, JWKS endpoint, auth-enforcement toggle
    └── manifest.json                # test manifest (FR-002): per-case card source, skill probes,
                                      #   security schemes + protected methods, signed-card expectations,
                                      #   grading class, expectations
```

**Structure Decision**: single-package layout unchanged; new adapter at
`src/adapters/a2a/` mirrors `src/adapters/heartbeat/` (own `runManifest` +
grading classes, stubbed `SpecAdapter` methods) so the CLI composes it via the
same boundary (C-001, FR-001). The static concerns split into `card.ts`
(discovery + structure) and `signature.ts` (JWS); the live concerns split into
`transport.ts` (the A2A client) and the three graders. `conjunctivePassK` is
imported from `src/core/behavioral/pass-k.ts` unmodified.

**Two distinct "behavioral" sub-shapes**: skill-behavior is **stochastic**
(LLM-backed agent → graded k-of-n via `conjunctivePassK`); auth-negative and
signed-card are **deterministic live** checks (a server either rejects/verifies
or it does not → single authoritative result, still recorded as a live case that
skips on unset env but never silently passes a live failure, FR-010).

## Work-Package Outline (preview for /spec-kitty.tasks — not tasks.md)

| WP | Title | FRs | Description |
|---|---|---|---|
| WP01 | Card parse + discovery lint + adapter skeleton + manifest types | FR-001, FR-002, FR-003, FR-005, FR-013, NFR-001–003 | `A2aAdapter` class (SpecAdapter stubs mirroring heartbeat); `card.ts` Agent Card parse + well-known URI check (flag obsolete `agent.json`, §8.2) + scheme/skill structural sanity with explicit `a2a-tck` delegation note; `ManifestCase`/`ManifestSummary` types; manifest loader. Valid + obsolete-uri card fixtures. |
| WP02 | Offline JWS signed-card verification (static lint) | FR-004, FR-011, NFR-001 | `signature.ts` offline JWS verify via `node:crypto` JWK import; tamper detection; `lint.ts` static-lint class assembling card+signature into a byte-stable report; rigged-impossible signature control. signed / tampered card + valid / wrong-key JWKS fixtures. |
| WP03 | A2A transport client + skill-behavior probe + test-server | FR-006, FR-009, FR-010, FR-011, FR-014, NFR-004 | `transport.ts` A2A JSON-RPC client (discover well-known card, send message; reads `MUSTER_A2A_ENDPOINT`/`MUSTER_A2A_TOKEN`; skip-on-unset); in-process `test-server.ts`; `graders/skill-behavior.ts` k-of-n via `conjunctivePassK` + rigged control; drifted-skill fixture. |
| WP04 | Auth-enforcement negatives + live signed-card check | FR-007, FR-008, FR-010, FR-011, FR-014 | `graders/auth-negative.ts` (unauth/wrong-scheme rejected, authorized accepted, §7) + rigged control; `graders/signed-card.ts` live signature vs live JWKS (skip when live JWKS unavailable) + rigged control; test-server auth-enforcement toggle + JWKS endpoint; declared-unenforced fixture. |
| WP05 | Manifest runner + CLI wiring + CI contract + docs | FR-012, FR-013, FR-014, NFR-005, NFR-006 | `runManifest` iterating all grading classes → `ManifestSummary`; CLI `muster a2a run <manifest>` + `A2aAdapter` registry entry + `--adapter a2a` choice + static `muster check --adapter a2a`; exit non-zero iff non-skipped failure; JSON report; full-suite Vitest integration; `quickstart.md` CI-monitoring recipe; SonarCloud gate green. |

**Build order**: WP01 → WP02 → WP03 → WP04 → WP05, on a **single lane**
(cross-imports: WP02 imports WP01 card types; WP03/04 import the transport +
test-server; WP05 imports all). Per the adapter-mission playbook, multi-WP
missions with cross-imports build on ONE lane worktree in dependency order, not
separate per-WP worktrees.

**Position in v1-extended layer stack**: the 7th and final planned layer
(manifests), landing after the six merged adapters. Per RQ-05 it is intentionally
narrow (residual gap), distinct from the official `a2a-tck`.

## Complexity Tracking

| New element | Why needed | Why it doesn't breach the boundary |
|---|---|---|
| A2A transport client (`transport.ts`) | The residual gap is about a *deployed* A2A server; the core OpenAI `ChatClient` cannot speak A2A JSON-RPC or exercise auth schemes (C-004, user decision) | Lives entirely inside `src/adapters/a2a/`; `src/core/` imports nothing A2A-specific (C-001) |
| In-process A2A test-server fixture (`test-server.ts`) | Exercises the live class deterministically in CI without an external dependency (NFR-004, NFR-005) | Test-only fixture under `tests/fixtures/a2a/server/`; not shipped in the product surface |
| Deterministic-live grading sub-shape (auth-negative, signed-card) | Auth enforcement + signature validity are deterministic, not stochastic — k-of-n would be the wrong model | Still flows through the same `ManifestSummary`/skip/exit-code contract as every other case (FR-010, FR-012) |

No charter violations. JWS verification and the transport/test-server all use
Node built-ins (`crypto`, `fetch`, `http`) — zero new dependencies, preserving
the minimal-dependency charter gate.
