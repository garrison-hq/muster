/**
 * Live signed-card grader: fetch the deployed card and verify its JWS signature
 * against the live JWKS.
 *
 * Implements T021 (live signed-card check + nested skip) and T022 (discrimination
 * control).
 *
 * Hard rules (FR-008, FR-010, FR-011):
 * - DETERMINISTIC — a single authoritative result, not k-of-n.
 * - discoverCard(endpoint): fetch the deployed card from the well-known URI.
 *   A discovery error (endpoint itself unreachable) THROWS — the runner records
 *   a failed run (FR-010). This grader does NOT catch a discovery error.
 * - fetchJwks(endpoint): if it throws or the endpoint 404s while the endpoint
 *   is reachable, return NESTED SKIP: { skipped:true, skipReason:"live JWKS unavailable" }.
 *   This is NOT a failure — it is the one defined nested skip within the live class.
 * - verifyCardJws(card, jwks): reused from WP02 (signature.ts). NEVER reimplemented here.
 * - passed = signature.verified. skipped:false on a completed verification.
 *
 * Skip taxonomy (FR-010, data-model.md):
 * - RUNNER-LEVEL ENV-UNSET SKIP: MUSTER_A2A_ENDPOINT not set → WP05 runner returns
 *   skipped:true for the entire live class. This grader never sees that path.
 * - NESTED SKIP (here): endpoint IS reachable, but the live JWKS is unavailable.
 *   → skipped:true, skipReason:"live JWKS unavailable". NOT a failure.
 * - FAILED RUN: endpoint unreachable / discoverCard throws → NOT caught here → throws
 *   to caller → caller records passed:false (failed run, FR-010).
 *
 * Discrimination control (T022, FR-011):
 * Pointing this grader at a server that serves a tampered card (wrong name/payload
 * but same signature) or returns a JWKS with a wrong key causes verifyCardJws to
 * return verified:false → passed:false, skipped:false. This is the rigged-impossible
 * control proving the grader can fail (not skip).
 *
 * Citation: A2A spec v1.0.0 protobuf a2a.proto §8.x (signed cards); muster rubric FR-008, FR-010, FR-011.
 */

import { verifyCardJws } from "../signature.js";
import type { SignatureResult } from "../signature.js";
import { discoverCard, fetchJwks } from "../transport.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The result of a live signed-card check.
 *
 * - `passed`     — true iff the card's JWS signature was verified against the
 *                  live JWKS. false when verification fails or on a transport error
 *                  that is not the nested-skip path.
 * - `skipped`    — true ONLY for the nested skip: endpoint reachable but live JWKS
 *                  unavailable. This is NOT a failure. When skipped:true, passed:false
 *                  is a placeholder value (the check did not run).
 * - `skipReason` — populated when skipped:true ("live JWKS unavailable").
 * - `signature`  — the SignatureResult from verifyCardJws. When skipped:true,
 *                  this is a placeholder { verified:false, reason:"skipped" }.
 */
export interface LiveSignatureResult {
  passed: boolean;
  skipped: boolean;
  skipReason?: string;
  signature: SignatureResult;
}

// ---------------------------------------------------------------------------
// Internal: placeholder for the skipped path
// ---------------------------------------------------------------------------

const SKIPPED_SIGNATURE: SignatureResult = {
  verified: false,
  reason: "skipped",
};

// ---------------------------------------------------------------------------
// T021 — checkLiveSignedCard
// ---------------------------------------------------------------------------

/**
 * Fetch and verify the deployed card's JWS signature against the live JWKS.
 *
 * Nested skip (FR-008, data-model.md):
 * If fetchJwks throws (JWKS endpoint 404s or errors) while the card endpoint
 * itself is reachable, the check is SKIPPED (not failed). This is distinct from:
 * - The runner-level env-unset skip (MUSTER_A2A_ENDPOINT not set → WP05 handles this).
 * - A failed run (discoverCard throws → endpoint unreachable → caller records failed).
 *
 * DISCRIMINATION CONTROL (T022, FR-011):
 * When the live JWKS contains a wrong key, or the served card has been tampered
 * (name changed but signature unchanged), verifyCardJws returns verified:false.
 * The result is { passed:false, skipped:false } — the grader fails, NOT skips.
 * This is the rigged-impossible control.
 *
 * @param endpoint - Base URL of the A2A agent.
 *
 * Citation: A2A spec v1.0.0 protobuf a2a.proto §8.x (signed cards);
 * muster rubric FR-008, FR-010, FR-011.
 */
export async function checkLiveSignedCard(endpoint: string): Promise<LiveSignatureResult> {
  // Step 1: fetch the deployed card — throws if endpoint unreachable (failed run)
  // We deliberately do NOT catch this: a discovery error is a failed run (FR-010).
  const card = await discoverCard(endpoint);

  // Step 2: fetch the live JWKS — throws if the JWKS endpoint is down.
  // If it throws while the card was reachable → NESTED SKIP (not a failure).
  let jwks: Awaited<ReturnType<typeof fetchJwks>>;
  try {
    jwks = await fetchJwks(endpoint);
  } catch {
    // Nested skip: the JWKS is unavailable but the endpoint itself is reachable.
    // NOT a failure — the card was discovered successfully.
    return {
      passed: false,
      skipped: true,
      skipReason: "live JWKS unavailable",
      signature: SKIPPED_SIGNATURE,
    };
  }

  // Step 3: verify the card's JWS signature against the fetched JWKS.
  // Uses verifyCardJws from WP02 (signature.ts) — NOT reimplemented here.
  const signature = verifyCardJws(card, jwks);
  const passed = signature.verified;

  return {
    passed,
    skipped: false,
    signature,
  };
}
