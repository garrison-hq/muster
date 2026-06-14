# Tasks: A2A Agent Cards (Manifests) Conformance Adapter

**Mission**: `a2a-adapter-01KV2NZM` | **Spec**: `spec.md` | **Plan**: `plan.md`
**Branch**: planning on `feat/a2a-adapter`; merges to `main` via one PR (`main` protected).

5 work packages, single lane, dependency order. The adapter mirrors the
`heartbeat` shape (own `runManifest` + grading classes, stubbed `SpecAdapter`
methods). Ownership is partitioned so no two WPs touch the same file: the
foundational pieces (card, signature/lint, transport, graders) are built first;
the final WP assembles `index.ts` + the manifest runner + CLI wiring.

## Subtask Index

| ID | Description | WP | Parallel |
|----|-------------|----|----------|
| T001 | `card.ts` — parse AgentCard (skills, schemes, signatures, discoveredFrom) | WP01 | |
| T002 | `card.ts` — discovery URI check, flag obsolete `agent.json` (§8.2) | WP01 | |
| T003 | `card.ts` — structural sanity of schemes/skills + `a2a-tck` delegation note | WP01 | |
| T004 | `types.ts` — ManifestCase / CaseResult / ManifestSummary + `loadManifest` | WP01 | [P] |
| T005 | Card fixtures: `valid.json`, `obsolete-uri.json` | WP01 | [P] |
| T006 | `card.test.ts` unit tests | WP01 | |
| T007 | `signature.ts` — offline JWS verify via `node:crypto` JWK import | WP02 | |
| T008 | `signature.ts` — tamper detection + reason codes | WP02 | |
| T009 | `lint.ts` — static-lint class assembling card+signature → byte-stable report | WP02 | |
| T010 | `lint.ts` — rigged-impossible signature discrimination control | WP02 | |
| T011 | Signed/tampered card + JWKS fixtures | WP02 | [P] |
| T012 | `signature.test.ts` + `lint.test.ts` (byte-stable) | WP02 | |
| T013 | `transport.ts` — env read/skip + `discoverCard` | WP03 | |
| T014 | `transport.ts` — `invokeSkill` / `probeAuth` / `fetchJwks` (JSON-RPC over HTTP) | WP03 | |
| T015 | `test-server.ts` — in-process A2A server (card, JWKS, message/send, toggles) | WP03 | |
| T016 | `graders/skill-behavior.ts` — k-of-n vs declared skill via `conjunctivePassK` | WP03 | |
| T017 | `graders/skill-behavior.ts` — rigged-impossible control | WP03 | |
| T018 | `drifted-skill.json` fixture + `skill-behavior.test.ts` (vs test-server) | WP03 | |
| T019 | `graders/auth-negative.ts` — reject unauth / accept authorized (§7) | WP04 | |
| T020 | `graders/auth-negative.ts` — rigged-impossible control | WP04 | |
| T021 | `graders/signed-card.ts` — live signature vs live JWKS + nested skip | WP04 | |
| T022 | `graders/signed-card.ts` — rigged-impossible control | WP04 | |
| T023 | `declared-unenforced.json` fixture + `auth-negative.test.ts` + `signed-card.test.ts` | WP04 | |
| T024 | `index.ts` — `A2aAdapter` class (SpecAdapter stubs) + re-exports | WP05 | |
| T025 | `index.ts` — `runManifest` iterating grading classes → `ManifestSummary` | WP05 | |
| T026 | CLI — `muster a2a run <manifest>` + `doA2aRun` (JSON/human, exit code) | WP05 | |
| T027 | CLI — registry `a2a` entry + `--adapter a2a` choice + `muster check --adapter a2a` | WP05 | |
| T028 | `manifest.json` — full manifest, all grading classes + control cases | WP05 | [P] |
| T029 | `manifest.test.ts` — runner integration; controls fail; exit/skip semantics | WP05 | |
| T030 | CLI help/env docs + quickstart CI-recipe verification | WP05 | |

---

## WP01 — Card parse + discovery lint + manifest types
**Goal**: Parse an Agent Card, flag the obsolete well-known URI (§8.2), do
residual-gap structural sanity (delegating deep schema validation to `a2a-tck`),
and define the manifest/summary types every later WP consumes.
**Priority**: P1 (foundation). **Independent test**: `card.test.ts` green; valid
card → ok, `agent.json`-sourced card → flagged.
**Dependencies**: none. **Prompt**: `WP01-card-parse-discovery-types.md` (~330 lines)

- [ ] T001 `card.ts` parse AgentCard (WP01)
- [ ] T002 `card.ts` discovery URI check, flag obsolete `agent.json` (WP01)
- [ ] T003 `card.ts` structural sanity + `a2a-tck` delegation note (WP01)
- [ ] T004 `types.ts` ManifestCase/CaseResult/ManifestSummary + `loadManifest` (WP01)
- [ ] T005 Card fixtures valid/obsolete-uri (WP01)
- [ ] T006 `card.test.ts` (WP01)

## WP02 — Offline JWS signed-card verification (static lint)
**Goal**: Verify a signed card's JWS offline against a JWKS fixture (tamper-
detecting) and assemble the byte-stable static-lint report; ship the signature
discrimination control.
**Priority**: P1. **Independent test**: signed card verifies; tampered card fails;
lint report byte-identical across runs.
**Dependencies**: WP01. **Prompt**: `WP02-offline-jws-static-lint.md` (~320 lines)

- [ ] T007 `signature.ts` offline JWS verify via `node:crypto` (WP02)
- [ ] T008 `signature.ts` tamper detection + reason codes (WP02)
- [ ] T009 `lint.ts` static-lint class → byte-stable report (WP02)
- [ ] T010 `lint.ts` rigged-impossible signature control (WP02)
- [ ] T011 Signed/tampered card + JWKS fixtures (WP02)
- [ ] T012 `signature.test.ts` + `lint.test.ts` (WP02)

## WP03 — A2A transport client + skill-behavior probe + test-server
**Goal**: Build the A2A JSON-RPC/HTTP client (env-driven, skip-on-unset), the
in-process A2A test-server fixture, and the k-of-n skill-behavior grader + control.
**Priority**: P1. **Independent test**: skill-behavior probe passes vs honest
test-server; control fails; env-unset → skipped.
**Dependencies**: WP01. **Prompt**: `WP03-transport-skill-behavior-server.md` (~390 lines)

- [ ] T013 `transport.ts` env read/skip + `discoverCard` (WP03)
- [ ] T014 `transport.ts` `invokeSkill`/`probeAuth`/`fetchJwks` (WP03)
- [ ] T015 `test-server.ts` in-process A2A server + toggles (WP03)
- [ ] T016 `graders/skill-behavior.ts` k-of-n via `conjunctivePassK` (WP03)
- [ ] T017 `graders/skill-behavior.ts` rigged-impossible control (WP03)
- [ ] T018 `drifted-skill.json` + `skill-behavior.test.ts` (WP03)

## WP04 — Auth-enforcement negatives + live signed-card check
**Goal**: Deterministic live checks — auth enforcement (§7) and live signature
verification against the live JWKS — each with a discrimination control.
**Priority**: P1. **Independent test**: unauth rejected/authorized accepted vs
test-server; live signature verifies; controls fail; live JWKS down → nested skip.
**Dependencies**: WP02, WP03. **Prompt**: `WP04-auth-negatives-live-signed-card.md` (~320 lines)

- [ ] T019 `graders/auth-negative.ts` reject unauth / accept authorized (WP04)
- [ ] T020 `graders/auth-negative.ts` rigged-impossible control (WP04)
- [ ] T021 `graders/signed-card.ts` live signature + nested skip (WP04)
- [ ] T022 `graders/signed-card.ts` rigged-impossible control (WP04)
- [ ] T023 `declared-unenforced.json` + auth/signed-card tests (WP04)

## WP05 — Manifest runner + CLI wiring + CI contract + docs
**Goal**: Assemble `A2aAdapter` + `runManifest`, wire `muster a2a run` and the
static `--adapter a2a` path, enforce the exit-code/JSON CI contract, and ship the
full manifest + integration test.
**Priority**: P1 (integration). **Independent test**: `muster a2a run manifest.json`
exits non-zero iff a non-skipped case failed; `--json` emits the summary; controls fail.
**Dependencies**: WP01, WP02, WP03, WP04. **Prompt**: `WP05-runner-cli-ci-contract.md` (~430 lines)

- [ ] T024 `index.ts` `A2aAdapter` class + re-exports (WP05)
- [ ] T025 `index.ts` `runManifest` → `ManifestSummary` (WP05)
- [ ] T026 CLI `muster a2a run` + `doA2aRun` (WP05)
- [ ] T027 CLI registry + `--adapter a2a` + `muster check --adapter a2a` (WP05)
- [ ] T028 `manifest.json` full manifest + control cases (WP05)
- [ ] T029 `manifest.test.ts` runner integration (WP05)
- [ ] T030 CLI help/env docs + quickstart CI-recipe verification (WP05)

---

## Dependencies & Build Order

```
WP01 ─┬─► WP02 ─┐
      └─► WP03 ─┴─► WP04 ─► WP05
```

Build on **one lane** in this order (cross-imports: WP02 imports WP01; WP03
imports WP01; WP04 imports WP02+WP03; WP05 imports all). Per the adapter-mission
playbook, do NOT use separate per-WP worktrees — collapse to a single lane.

## MVP scope
WP01+WP02 alone deliver a useful **offline** static-lint tool (discovery + signed-
card verification) with zero endpoint needed. WP03–WP05 add the live class and CLI.
