---
work_package_id: WP03
title: A2A transport client + skill-behavior probe + test-server
dependencies:
- WP01
requirement_refs:
- FR-006
- FR-009
- FR-010
- FR-011
- FR-014
planning_base_branch: feat/a2a-adapter
merge_target_branch: feat/a2a-adapter
branch_strategy: Planning artifacts for this feature were generated on feat/a2a-adapter. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/a2a-adapter unless the human explicitly redirects the landing branch.
created_at: '2026-06-14T09:11:11Z'
subtasks:
- T013
- T014
- T015
- T016
- T017
- T018
assignee: claude
agent: claude:sonnet:implementer:implementer
history: []
authoritative_surface: src/adapters/a2a/
execution_mode: code_change
owned_files:
- src/adapters/a2a/transport.ts
- src/adapters/a2a/graders/skill-behavior.ts
- tests/a2a/skill-behavior.test.ts
- tests/fixtures/a2a/server/test-server.ts
- tests/fixtures/a2a/cards/drifted-skill.json
tags: []
---

# WP03 — A2A transport client + skill-behavior probe + test-server

## Objective

Build the live-class machinery and the first live grader:

1. **`src/adapters/a2a/transport.ts`** — an A2A client over **JSON-RPC/HTTP** using
   built-in `fetch`: discover the well-known card, invoke a skill, probe auth, fetch
   live JWKS. Reads `MUSTER_A2A_ENDPOINT` / `MUSTER_A2A_TOKEN` from env at call time;
   signals **skip** when the endpoint is unset (FR-009/010).
2. **`tests/fixtures/a2a/server/test-server.ts`** — a minimal **in-process A2A server**
   (`node:http`) serving the well-known card, a JWKS endpoint, and a `message/send`
   handler, with toggles for honest-vs-drifted skill responses and enforced-vs-unenforced
   auth (the latter consumed by WP04). Deterministic, ephemeral port (FR-014).
3. **`src/adapters/a2a/graders/skill-behavior.ts`** — grade a live response against the
   declared skill, aggregate **k-of-n** via `conjunctivePassK`; ship the discrimination
   control (FR-006, FR-011). An errored run counts as a failed run (FR-010).
4. Tests against the in-process server.

No `src/core/` change. The core OpenAI `ChatClient` is NOT used. No `index.ts`/CLI (WP05).

## Context

- Spec: `spec.md` (FR-006, FR-009, FR-010, FR-011, FR-014); Plan research D-02/D-03/D-04.
- Contracts: `contracts/manifest-and-report.md` §3 (transport signatures).
- Reuse: `conjunctivePassK` from `src/core/behavioral/pass-k.ts` (import unmodified).
- Depends on WP01: `AgentCard`, `DeclaredSkill`, `CaseResult` types.
- Charter: live suite < 5 min vs the fixture server (NFR-004); no credentials in repo; no
  external dependency in CI (NFR-005).

**Hard rules**:
1. Touch only `owned_files`. Transport uses built-in `fetch`; server uses `node:http`. No new deps.
2. **Skip vs fail (FR-010)**: `MUSTER_A2A_ENDPOINT` UNSET → skip (recorded, not failed). Endpoint
   SET but a probe errors (refused/timeout/malformed) → **failed run**, never skipped, never retried.
3. Read env at call time; never store or log the token value.
4. The test-server is a test-only fixture (never shipped in the product `files` surface).

## Subtasks

### T013 — Transport: env read/skip + discoverCard
**Purpose**: Endpoint resolution + well-known discovery.

**Steps**:
1. In `transport.ts`:
   ```ts
   export function envEndpoint(): string | null;     // process.env.MUSTER_A2A_ENDPOINT || null
   export function envToken(): string | null;        // process.env.MUSTER_A2A_TOKEN || null
   export async function discoverCard(endpoint: string): Promise<AgentCard>;  // GET <endpoint>/.well-known/agent-card.json
   ```
2. `discoverCard` GETs the well-known URI, parses via WP01 `parseAgentCard(body, url)` so the
   discovered card carries the correct `discoveredFrom` for §8.2 checks. A non-200 / malformed
   response throws (caller records a failed run).

**Files**: `transport.ts`
**Validation** (T018): vs test-server, `discoverCard` returns the served card; `envEndpoint()` null when unset.

### T014 — Transport: invokeSkill / probeAuth / fetchJwks
**Purpose**: The JSON-RPC calls the live graders need.

**Steps**:
1. Add:
   ```ts
   export async function invokeSkill(endpoint: string, skillId: string, input: string, auth?: string | null): Promise<string>;
   export async function probeAuth(endpoint: string, method: string, auth: string | null): Promise<{ rejected: boolean; status: number }>;
   export async function fetchJwks(endpoint: string): Promise<Jwks>;
   ```
2. `invokeSkill` POSTs JSON-RPC 2.0 `{ method: "message/send", params: { skill: skillId, message: input } }`
   with `Authorization: Bearer <auth>` when provided; returns the response text. Throws on
   transport/JSON-RPC error (→ failed run).
3. `probeAuth` sends `method` with the given `auth` (null = unauthenticated); `rejected` is
   true when the server responds 401/403 or a JSON-RPC auth error. Never throws on a clean
   rejection (that is the expected outcome for the negative case).
4. `fetchJwks` GETs the server's JWKS endpoint; used by WP04's live signature check.

**Files**: `transport.ts`
**Validation** (T018): skill invocation returns the canned response; unauthorized probe → rejected:true.

### T015 — In-process A2A test-server fixture
**Purpose**: Deterministic live target for CI.

**Steps**:
1. In `tests/fixtures/a2a/server/test-server.ts` build a `node:http` server:
   ```ts
   export interface TestServerOptions { signed?: boolean; drift?: boolean; enforceAuth?: boolean; }
   export interface RunningServer { url: string; close(): Promise<void>; }
   export async function startTestServer(opts?: TestServerOptions): Promise<RunningServer>;
   ```
2. Routes:
   - `GET /.well-known/agent-card.json` → a card declaring an `echo` skill + a `bearer` scheme
     guarding `message/send` (signed when `opts.signed`, reusing WP02 fixtures’ public key/JWKS).
   - `GET /.well-known/jwks.json` → the JWKS (for WP04 live signature check).
   - `POST /` JSON-RPC `message/send` → echoes the input as the `echo` skill **unless**
     `opts.drift` (then returns an off-spec response, for the drifted-skill negative).
     When `opts.enforceAuth` and the request lacks a valid bearer token → respond 401.
3. Bind to an ephemeral port (`listen(0)`); expose the resolved `url`. `close()` resolves when shut.
4. Keep it tiny and dependency-free; deterministic responses (no random, no time).

**Files**: `tests/fixtures/a2a/server/test-server.ts`
**Validation**: started/closed cleanly by T018 and WP04 tests.

### T016 — Skill-behavior grader (k-of-n)
**Purpose**: Grade declared-skill-vs-actual-response over N runs (§8.3.1).

**Steps**:
1. In `graders/skill-behavior.ts`:
   ```ts
   export interface SkillProbeResult { run: number; response: string; consistent: boolean; error?: string; }
   export async function probeSkill(endpoint: string, skill: DeclaredSkill, input: string, expect: string, runs: number, auth?: string | null): Promise<SkillProbeResult[]>;
   export function aggregateSkillBehavior(results: SkillProbeResult[], passThreshold: number): boolean;
   ```
2. `probeSkill` calls `invokeSkill` `runs` times; `consistent` is true when the response
   satisfies `expect` (a non-leaky consistency check vs the declared skill — substring/shape
   match documented in JSDoc; do NOT leak the expected answer into the request). A thrown
   transport error sets `consistent:false, error` (FR-010 — errored run = failed run).
3. `aggregateSkillBehavior` returns `conjunctivePassK(...)`-style k-of-n:
   `results.filter(r => r.consistent).length >= passThreshold`. (Reuse `conjunctivePassK` for
   the per-run conjunction where a run has multiple sub-checks.)

**Files**: `graders/skill-behavior.ts`
**Validation** (T018): honest server → k-of-n passes; drifted server → fails; thrown error counts as a failed run.

### T017 — Skill-behavior discrimination control
**Purpose**: Prove the grader can fail (FR-011).

**Steps**:
1. The control points `probeSkill` at the **drifted** server (or an impossible `expect`); the
   test asserts `aggregateSkillBehavior` returns false. Document as the discrimination control.

**Files**: `graders/skill-behavior.ts` (+ assertion in T018)
**Validation**: control fails as designed.

### T018 — drifted-skill fixture + tests
**Purpose**: Cover the live skill path end-to-end against the in-process server.

**Steps**:
1. `tests/fixtures/a2a/cards/drifted-skill.json` — a card whose declared skill the drift-mode
   server does not honor.
2. `tests/a2a/skill-behavior.test.ts` — start the test-server (honest + drift modes), point at
   its url, run `probeSkill`/`aggregateSkillBehavior`; assert pass (honest), fail (drift +
   control); assert env-unset → skip path (via `envEndpoint()` null). Tear the server down.

**Files**: `tests/a2a/skill-behavior.test.ts`, `tests/fixtures/a2a/cards/drifted-skill.json`

## Branch Strategy
Single mission lane atop WP01 on `feat/a2a-adapter`; merges to `main` via one PR.

## Definition of Done
- [ ] `transport.ts` (fetch-based) implements discover/invoke/probeAuth/fetchJwks + env read/skip.
- [ ] In-process test-server with signed/drift/enforceAuth toggles; ephemeral port; clean shutdown.
- [ ] `skill-behavior.ts` k-of-n via `conjunctivePassK`; errored run = failed run; control fails.
- [ ] Tests green vs the in-process server; ≥80% new-code coverage; no new deps.
- [ ] Only `owned_files` touched; `src/core/` untouched; token never logged.

## Reviewer guidance
Confirm skip(env-unset) vs fail(live-error) is correct (FR-010); confirm the test-server is
deterministic and dependency-free; confirm `conjunctivePassK` is reused, not reimplemented;
confirm the skill consistency check is non-leaky (request contains no answer-revealing phrase).
