---
work_package_id: WP02
title: Offline JWS signed-card verification (static lint)
dependencies:
- WP01
requirement_refs:
- FR-004
- FR-011
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts were generated on feat/a2a-adapter (main is protected). During implementation this WP builds on the single mission lane atop WP01; completed changes merge into main via one PR unless the human redirects the landing branch.
created_at: '2026-06-14T09:11:11Z'
subtasks:
- T007
- T008
- T009
- T010
- T011
- T012
assignee: claude
agent: claude:sonnet:implementer:implementer
history: []
authoritative_surface: src/adapters/a2a/
execution_mode: code_change
owned_files:
- src/adapters/a2a/signature.ts
- src/adapters/a2a/lint.ts
- tests/a2a/signature.test.ts
- tests/a2a/lint.test.ts
- tests/fixtures/a2a/cards/signed.json
- tests/fixtures/a2a/cards/tampered.json
- tests/fixtures/a2a/jwks/valid.json
- tests/fixtures/a2a/jwks/wrong-key.json
tags: []
---

# WP02 — Offline JWS signed-card verification (static lint)

## Objective

Add the deterministic, **offline** half of signed-card verification and assemble
the static-lint report:

1. **`src/adapters/a2a/signature.ts`** — verify a card's JWS signature against a
   supplied JWKS using **Node 22 built-in `node:crypto`** (no new dependency);
   detect tampering (FR-004).
2. **`src/adapters/a2a/lint.ts`** — the static-lint class: assemble `card.ts`
   discovery/structure findings + the offline signature result into a **byte-stable**
   `LintReport`, plus a `serializeLintReport`; ship the rigged-impossible signature
   discrimination control (FR-011).
3. Unit + integration tests; byte-stable output asserted.

No `src/core/` change. No transport/live code (WP03/04). No `index.ts`/CLI (WP05).

## Context

- Spec: `spec.md` (FR-004, FR-011, NFR-001); Plan research D-01 (JWS via `node:crypto`).
- Data model: `data-model.md` — `JwsSignature`, `Jwks`, offline invariants (tamper → fail).
- Depends on WP01: imports `AgentCard`, `LintFinding`, `checkDiscoveryUri`, `checkStructure`,
  `delegationNote` from `src/adapters/a2a/card.ts`.
- Peer reference: `src/adapters/heartbeat/lint.ts` + `serializeLintReport` (byte-stable pattern).
- Charter: byte-stable deterministic offline output (NFR-001); minimal deps (Node built-ins only).

**Hard rules**:
1. Touch only `owned_files`. JWS verification uses `node:crypto` ONLY — do NOT add `jose`,
   `jsonwebtoken`, or any dependency.
2. The whole path is offline: zero network calls. Output bytes are identical across repeated
   runs and machines (NFR-001).
3. An errored/unsupported-algorithm verification is a **failure** (verified=false with a
   reason), never a silent pass.

## Subtasks

### T007 — Offline JWS verification via `node:crypto`
**Purpose**: Verify a signed card against a JWKS deterministically, offline.

**Steps**:
1. In `signature.ts` define:
   ```ts
   export interface Jwks { keys: Array<Record<string, unknown>>; }   // JWK set
   export interface SignatureResult { verified: boolean; reason?: string; alg?: string; kid?: string; }
   export function verifyCardJws(card: AgentCard, jwks: Jwks): SignatureResult;
   ```
2. Implementation:
   - If `card.signatures` is absent/empty → `{ verified: false, reason: "card is unsigned" }`
     (callers decide whether that is expected; see lint T009).
   - Decode the JWS `protected` header (base64url JSON) to read `alg` + `kid`.
   - Select the JWK from `jwks.keys` by `kid` (or the sole key when no `kid`).
   - Import the key with `crypto.createPublicKey({ key: jwk, format: "jwk" })`.
   - Reconstruct the signing input over the card payload per A2A's signed-card scheme
     (`<protected>.<base64url(canonical card payload)>`); verify with `crypto.verify(...)`
     for RSA/EC/EdDSA (`RS256`→`sha256`+RSA, `ES256`→`sha256`+P-256, `EdDSA`→ed25519).
   - Return `{ verified: true, alg, kid }` on success; `{ verified: false, reason, alg, kid }`
     on any failure (bad key, unsupported alg, signature mismatch).
3. Use the WP01-retained `card.raw` payload for the signing input; canonicalization must be
   byte-stable (reuse `src/core/canonical-json.ts` `canonicalJson` if the scheme signs the
   canonical JSON form — confirm against the fixture you generate in T011).

**Files**: `signature.ts`
**Validation** (T012): `signed.json` + `jwks/valid.json` → verified:true; + `jwks/wrong-key.json` → false.

### T008 — Tamper detection + reason codes
**Purpose**: A card mutated after signing must fail verification with a clear reason.

**Steps**:
1. Ensure `verifyCardJws` returns `verified:false, reason:"signature mismatch"` for
   `tampered.json` (payload changed, signature stale).
2. Distinct reason strings for: unsigned, unknown-kid, unsupported-alg, key-import-failure,
   signature-mismatch — so the lint report and tests can assert the cause.

**Files**: `signature.ts`
**Validation** (T012): `tampered.json` + `jwks/valid.json` → verified:false, reason "signature mismatch".

### T009 — Static-lint class (byte-stable report)
**Purpose**: Assemble discovery + structure + signature into one deterministic report.

**Steps**:
1. In `lint.ts` define:
   ```ts
   export interface LintReport {
     path: string; ok: boolean;
     discoveredFrom: string;
     findings: LintFinding[];          // from card.ts + a signature finding when applicable
     signature: "verified" | "invalid" | "unsigned" | "not-checked";
     detail: { schemaValidation: "delegated:a2a-tck" };
   }
   export function lintCard(card: AgentCard, opts?: { jwks?: Jwks; expectSigned?: boolean }): LintReport;
   export function serializeLintReport(report: LintReport): string;
   ```
2. `lintCard` runs `checkDiscoveryUri` + `checkStructure` (WP01), and — when `opts.jwks`
   is provided — `verifyCardJws`. Map result to `signature`. `ok` is `false` iff any finding
   has error severity OR (`expectSigned` && signature !== "verified").
3. `serializeLintReport` emits canonical/byte-stable JSON (stable key order; reuse
   `canonicalJson`). No timestamps.

**Files**: `lint.ts`
**Validation** (T012): valid card → ok:true; obsolete-uri → ok:false; signed+valid jwks →
signature:"verified"; tampered → signature:"invalid", ok:false; serialize byte-identical twice.

### T010 — Rigged-impossible signature discrimination control
**Purpose**: Prove the signature grader can fail (FR-011).

**Steps**:
1. Add `signatureControl()` (or a clearly-named exported helper) that constructs a case where
   verification MUST fail — e.g. `tampered.json` asserted as `expectVerified:true`. The test
   asserts the grader reports failure, proving it discriminates.
2. Document in a JSDoc that this is the discrimination control for the signature check.

**Files**: `lint.ts` (+ assertion in T012)
**Validation**: control asserts `verified:false` where the rigged expectation wanted true → fails as designed.

### T011 — Fixtures (signed/tampered cards + JWKS) [P]
**Purpose**: Real JWS fixtures the offline verifier checks against.

**Steps**:
1. Generate a keypair (e.g. Ed25519 or P-256) **once, locally**, and produce:
   - `tests/fixtures/a2a/jwks/valid.json` — JWKS with the public key (+ `kid`).
   - `tests/fixtures/a2a/jwks/wrong-key.json` — JWKS with a different public key.
   - `tests/fixtures/a2a/cards/signed.json` — a valid card signed with the private key.
   - `tests/fixtures/a2a/cards/tampered.json` — `signed.json` with a mutated field, stale signature.
2. Commit ONLY public keys + signed cards. Do NOT commit the private key (charter: no
   credentials in repo). Record the generation command in a comment/README note so the
   fixtures are reproducible.

**Files**: the four fixtures.
**Validation**: consumed by T012; private key absent from the repo.

### T012 — Tests (signature + lint, byte-stable)
**Purpose**: Cover verification, tamper detection, lint assembly, control, and determinism.

**Steps**: `tests/a2a/signature.test.ts` (verify matrix: valid/wrong-key/tampered/unsigned/
unsupported-alg) + `tests/a2a/lint.test.ts` (report assembly + byte-stable serialization +
control). ≥80% new-code coverage of `signature.ts` + `lint.ts`.

**Files**: `tests/a2a/signature.test.ts`, `tests/a2a/lint.test.ts`

## Branch Strategy
Single mission lane atop WP01 on `feat/a2a-adapter`; merges to `main` via one PR.

## Definition of Done
- [ ] `signature.ts` verifies JWS via `node:crypto` only (no new dep); tamper-detecting.
- [ ] `lint.ts` assembles a byte-stable report with discovery+structure+signature+delegation note.
- [ ] Signature discrimination control present and failing as designed (FR-011).
- [ ] Fixtures committed (public keys + signed/tampered cards); private key NOT in repo.
- [ ] Tests green; ≥80% new-code coverage; serialization byte-identical across runs.
- [ ] Only `owned_files` touched; `src/core/` untouched.

## Reviewer guidance
Verify zero new dependencies (`package.json` unchanged); verify no network in the offline
path; verify the private key is absent; verify byte-stable serialization (run the serializer
twice in a test and compare).
