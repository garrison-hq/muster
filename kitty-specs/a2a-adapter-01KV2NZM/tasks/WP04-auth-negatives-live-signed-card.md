---
work_package_id: WP04
title: Auth-enforcement negatives + live signed-card check
dependencies:
- WP02
- WP03
requirement_refs:
- FR-007
- FR-008
- FR-010
- FR-011
- FR-014
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts were generated on feat/a2a-adapter (main is protected). During implementation this WP builds on the single mission lane atop WP02 and WP03; completed changes merge into main via one PR unless the human redirects the landing branch.
created_at: '2026-06-14T09:11:11Z'
subtasks:
- T019
- T020
- T021
- T022
- T023
assignee: claude
agent: claude:sonnet:implementer:implementer
history: []
authoritative_surface: src/adapters/a2a/graders/
execution_mode: code_change
owned_files:
- src/adapters/a2a/graders/auth-negative.ts
- src/adapters/a2a/graders/signed-card.ts
- tests/a2a/auth-negative.test.ts
- tests/a2a/signed-card.test.ts
- tests/fixtures/a2a/cards/declared-unenforced.json
tags: []
---

# WP04 — Auth-enforcement negatives + live signed-card check

## Objective

The two **deterministic live** graders (a server either enforces/verifies or it
does not — no k-of-n):

1. **`src/adapters/a2a/graders/auth-negative.ts`** — unauthenticated / wrong-scheme
   requests to a protected method are **rejected**, and a correctly-authorized request
   is **accepted** (A2A §7); ship the discrimination control (FR-007, FR-011).
2. **`src/adapters/a2a/graders/signed-card.ts`** — fetch the deployed card + live JWKS
   and verify the signature (reusing WP02 `verifyCardJws`); **nested skip** when the live
   JWKS is unavailable but the endpoint is reachable; ship the discrimination control
   (FR-008, FR-011).
3. Tests against the WP03 in-process test-server.

No `src/core/` change. No `index.ts`/CLI (WP05). Reuses WP02 `signature.ts` and WP03
`transport.ts` — does not modify them.

## Context

- Spec: `spec.md` (FR-007, FR-008, FR-010, FR-011, FR-014); Plan research D-04 (skip/fail).
- Depends on WP02 (`verifyCardJws`, `Jwks`) and WP03 (`probeAuth`, `discoverCard`,
  `fetchJwks`, the in-process `startTestServer`).
- Data model: `data-model.md` — SecurityScheme + signed-card invariants (declared-but-
  unenforced → fail; tamper → fail; live JWKS down → nested skip).
- Charter: errored run = failed run; no credentials in repo.

**Hard rules**:
1. Touch only `owned_files`. Reuse WP02/WP03 modules by import; do NOT edit them.
2. These graders are deterministic — a single authoritative result per case, NOT k-of-n.
3. Skip/fail (FR-010): endpoint UNSET is handled by the runner (WP05); within these graders,
   a reachable-endpoint error = **failed**. The ONE nested skip is `signed-card` when the live
   JWKS is unreachable while the endpoint itself is reachable.

## Subtasks

### T019 — Auth-enforcement negative grader (§7)
**Purpose**: Prove declared schemes are actually enforced.

**Steps**:
1. In `auth-negative.ts`:
   ```ts
   export interface AuthCheck { rejectedUnauthorized: boolean; acceptedAuthorized: boolean; passed: boolean; detail?: Record<string, unknown>; }
   export async function checkAuthEnforcement(endpoint: string, scheme: SecurityScheme, method: string, authorizedToken: string | null): Promise<AuthCheck>;
   ```
2. Implementation:
   - Call `probeAuth(endpoint, method, null)` (unauthenticated) → expect `rejected:true`.
   - If `authorizedToken` provided, call `probeAuth(endpoint, method, authorizedToken)` →
     expect `rejected:false` (accepted). When no token is supplied, record
     `acceptedAuthorized: true` as not-applicable and note it in `detail`.
   - `passed = rejectedUnauthorized && acceptedAuthorized`. A thrown transport error → `passed:false` (failed run).

**Files**: `auth-negative.ts`
**Validation** (T023): vs test-server `enforceAuth:true` → passed; `enforceAuth:false` (declared-unenforced) → failed.

### T020 — Auth discrimination control
**Purpose**: Prove the auth grader can fail (FR-011).

**Steps**:
1. Control points `checkAuthEnforcement` at the test-server with `enforceAuth:false` and the
   `declared-unenforced.json` card; the test asserts `passed:false`. Document as the control.

**Files**: `auth-negative.ts` (+ assertion in T023)
**Validation**: control fails as designed.

### T021 — Live signed-card grader + nested skip
**Purpose**: Verify a deployed card's signature against the live JWKS (FR-008).

**Steps**:
1. In `signed-card.ts`:
   ```ts
   export interface LiveSignatureResult { passed: boolean; skipped: boolean; skipReason?: string; signature: SignatureResult; }
   export async function checkLiveSignedCard(endpoint: string): Promise<LiveSignatureResult>;
   ```
2. Implementation:
   - `discoverCard(endpoint)` (WP03) to fetch the deployed card.
   - `fetchJwks(endpoint)` (WP03); if it errors/404s while the endpoint is reachable →
     `{ passed:false→ skipped:true, skipReason:"live JWKS unavailable" }` (the nested skip — NOT a failure).
   - Else `verifyCardJws(card, jwks)` (WP02); `passed = signature.verified`. A discovery error
     (endpoint itself unreachable) throws → runner records a failed run.

**Files**: `signed-card.ts`
**Validation** (T023): vs `signed:true` server → passed; vs a server without a JWKS route → skipped (nested).

### T022 — Signed-card discrimination control
**Purpose**: Prove the live signature grader can fail (FR-011).

**Steps**:
1. Control: serve a tampered/mismatched card (or point at `wrong-key` JWKS) so verification
   fails; assert `passed:false, skipped:false`. Document as the control.

**Files**: `signed-card.ts` (+ assertion in T023)
**Validation**: control fails as designed (not skipped).

### T023 — declared-unenforced fixture + tests
**Purpose**: Cover both deterministic live graders against the in-process server.

**Steps**:
1. `tests/fixtures/a2a/cards/declared-unenforced.json` — a card declaring a `bearer` scheme on
   `message/send` that the `enforceAuth:false` server does not actually enforce.
2. `tests/a2a/auth-negative.test.ts` — start server in `enforceAuth:true` and `false` modes;
   assert pass/fail + control.
3. `tests/a2a/signed-card.test.ts` — start server in `signed:true` mode; assert pass; start a
   mode without a JWKS route to assert the nested skip; assert the tamper/wrong-key control fails.

**Files**: `tests/a2a/auth-negative.test.ts`, `tests/a2a/signed-card.test.ts`, `tests/fixtures/a2a/cards/declared-unenforced.json`

## Branch Strategy
Single mission lane atop WP02+WP03 on `feat/a2a-adapter`; merges to `main` via one PR.

## Definition of Done
- [ ] `auth-negative.ts`: unauth rejected + authorized accepted (§7); errored = failed; control fails.
- [ ] `signed-card.ts`: live signature via reused `verifyCardJws`; nested skip when live JWKS down; control fails.
- [ ] Both graders are deterministic (no k-of-n); results flow as `CaseResult`-compatible shapes.
- [ ] Tests green vs the in-process server; ≥80% new-code coverage; no new deps.
- [ ] Only `owned_files` touched; WP02/WP03 modules imported, not modified.

## Reviewer guidance
Confirm the nested skip (live JWKS down) is distinct from a failure and from the runner-level
env-unset skip; confirm auth grader treats a clean 401/403 as the expected pass, not an error;
confirm `verifyCardJws` is reused (no second JWS implementation).
