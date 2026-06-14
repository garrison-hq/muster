/**
 * Offline JWS signature verification for A2A Agent Cards.
 *
 * Implements FR-004 (offline JWS verification, tamper detection) and
 * NFR-001 (byte-stable deterministic output, zero network calls).
 *
 * Uses Node 22 built-in `node:crypto` ONLY — no new dependencies.
 *
 * Signing scheme (must match fixture generation):
 *   signing_input = <protected_b64url> + "." + <payload_b64url>
 *   where payload_b64url = base64url(canonicalJson(card_without_signatures))
 *
 * Fixture generation command (Ed25519, reproduced from development):
 *   See tests/fixtures/a2a/cards/signed.json header comment and
 *   scripts in the WP02 implementation notes. Key material: only the
 *   public key is committed (tests/fixtures/a2a/jwks/valid.json).
 *   The private key is NEVER committed (charter NFR-005).
 *
 * Citation: A2A spec v1.0.0, §8.x signed cards; muster rubric FR-004.
 */

import { createPublicKey, verify as cryptoVerify, type JsonWebKey as CryptoJsonWebKey } from "node:crypto";
import type { AgentCard } from "./card.js";
import { canonicalJson } from "../../core/canonical-json.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A JSON Web Key Set (JWKS) supplying public key(s) for signature verification. */
export interface Jwks {
  keys: Array<Record<string, unknown>>;
}

/**
 * Result of offline JWS card verification.
 *
 * Distinct reason codes (T008):
 * - "unsigned"             — card has no signatures array or it is empty
 * - "unknown-kid"          — no JWK in the JWKS matches the kid in the header
 * - "unsupported-alg"      — algorithm in the protected header is not supported
 * - "key-import-failure"   — JWK could not be imported as a public key
 * - "signature-mismatch"   — signature did not verify (tamper detected)
 */
export interface SignatureResult {
  verified: boolean;
  reason?: string;
  alg?: string;
  kid?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Supported JWS algorithms and their Node.js `crypto.verify` algorithm names.
 * EdDSA (Ed25519) uses null as the digest (Ed25519 is prehash=false).
 */
const SUPPORTED_ALGS: ReadonlyMap<string, string | null> = new Map([
  ["RS256", "sha256"],
  ["ES256", "sha256"],
  ["EdDSA", null],
]);

/**
 * Decode a base64url-encoded string to a Buffer.
 */
function decodeBase64Url(s: string): Buffer {
  // Replace base64url chars with standard base64 chars and pad
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = padded.length % 4;
  const padded2 = remainder === 0 ? padded : padded + "=".repeat(4 - remainder);
  return Buffer.from(padded2, "base64");
}

/**
 * Decode the JWS protected header from a base64url string.
 * Returns null if the decoded value is not a plain object (never an array).
 * The WP02 reviewer note: do NOT assume the decoded header is non-array — guard accordingly.
 */
function decodeProtectedHeader(protectedB64: string): Record<string, unknown> | null {
  let decoded: unknown;
  try {
    const raw = decodeBase64Url(protectedB64).toString("utf-8");
    decoded = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    return null;
  }
  return decoded as Record<string, unknown>;
}

/**
 * Select a JWK from the JWKS by kid. When the header has no kid, fall back to
 * the sole key in the set. Returns null if no matching key can be selected.
 */
function selectJwk(
  keys: Array<Record<string, unknown>>,
  kid: string | undefined
): Record<string, unknown> | null {
  if (kid !== undefined) {
    const match = keys.find((k) => k["kid"] === kid);
    return match ?? null;
  }
  // No kid: use the sole key if there is exactly one
  return keys.length === 1 ? (keys[0] ?? null) : null;
}

/**
 * Compute the canonical payload for the signing input.
 *
 * The payload is the card body WITHOUT the `signatures` field and WITHOUT the
 * muster-internal `discoveredFrom` field (neither is part of the signed envelope).
 *
 * Byte-stable: uses canonicalJson (UTF-16 key sort, RFC 8785) from core.
 */
function buildSigningInput(protectedB64: string, card: AgentCard): string {
  // card.raw is the original parsed JSON (retained verbatim by parseAgentCard).
  // Strip signatures + discoveredFrom before canonicalising.
  const rawObj =
    typeof card.raw === "object" && card.raw !== null && !Array.isArray(card.raw)
      ? (card.raw as Record<string, unknown>)
      : {};

  const payloadObj: Record<string, unknown> = {};
  for (const key of Object.keys(rawObj)) {
    if (key === "signatures" || key === "discoveredFrom") continue;
    payloadObj[key] = rawObj[key];
  }

  const canonicalPayload = canonicalJson(payloadObj);
  const payloadB64 = Buffer.from(canonicalPayload).toString("base64url");
  return `${protectedB64}.${payloadB64}`;
}

/**
 * Verify a signature for one JWS entry using `crypto.verify` (node:crypto).
 * Returns a reason string on failure, or null on success.
 */
function verifyOneSignature(
  protectedB64: string,
  signatureB64: string,
  card: AgentCard,
  jwks: Jwks
): { ok: boolean; reason?: string; alg?: string; kid?: string } {
  const header = decodeProtectedHeader(protectedB64);
  if (header === null) {
    return { ok: false, reason: "signature-mismatch" };
  }

  const alg = typeof header["alg"] === "string" ? header["alg"] : undefined;
  const kid = typeof header["kid"] === "string" ? header["kid"] : undefined;

  if (alg === undefined || !SUPPORTED_ALGS.has(alg)) {
    return { ok: false, reason: "unsupported-alg", alg, kid };
  }

  const jwk = selectJwk(jwks.keys, kid);
  if (jwk === null) {
    return { ok: false, reason: "unknown-kid", alg, kid };
  }

  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    publicKey = createPublicKey({ key: jwk as CryptoJsonWebKey, format: "jwk" });
  } catch {
    return { ok: false, reason: "key-import-failure", alg, kid };
  }

  const signingInput = buildSigningInput(protectedB64, card);
  const sigBuf = decodeBase64Url(signatureB64);

  let verified: boolean;
  const digest = SUPPORTED_ALGS.get(alg);
  try {
    if (digest === null) {
      // EdDSA (Ed25519): null digest
      verified = cryptoVerify(null, Buffer.from(signingInput), publicKey, sigBuf);
    } else {
      // RS256 / ES256
      verified = cryptoVerify(digest, Buffer.from(signingInput), publicKey, sigBuf);
    }
  } catch {
    return { ok: false, reason: "signature-mismatch", alg, kid };
  }

  if (!verified) {
    return { ok: false, reason: "signature-mismatch", alg, kid };
  }

  return { ok: true, alg, kid };
}

// ---------------------------------------------------------------------------
// Public API — T007/T008
// ---------------------------------------------------------------------------

/**
 * Verify a card's JWS signature against a supplied JWKS, fully offline.
 *
 * Implements FR-004 (offline JWS verification, tamper detection, NFR-001).
 *
 * Supports algorithms: RS256, ES256, EdDSA.
 *
 * Reason codes:
 * - "card is unsigned"     — no signatures or empty array
 * - "unknown-kid"          — no matching key in JWKS
 * - "unsupported-alg"      — alg not in RS256/ES256/EdDSA
 * - "key-import-failure"   — JWK import failed
 * - "signature-mismatch"   — signature did not verify (tamper detected or bad key)
 *
 * @param card  - Parsed AgentCard (card.raw retained for signing input).
 * @param jwks  - The JWK Set containing public key(s) to verify against.
 * @returns     SignatureResult with verified=true/false + optional reason/alg/kid.
 */
export function verifyCardJws(card: AgentCard, jwks: Jwks): SignatureResult {
  if (card.signatures === undefined || card.signatures.length === 0) {
    return { verified: false, reason: "card is unsigned" };
  }

  // Verify the first signature entry (A2A cards typically have one).
  const sig = card.signatures[0];
  if (sig === undefined) {
    return { verified: false, reason: "card is unsigned" };
  }

  const result = verifyOneSignature(sig.protected, sig.signature, card, jwks);

  if (result.ok) {
    return { verified: true, alg: result.alg, kid: result.kid };
  }
  return { verified: false, reason: result.reason, alg: result.alg, kid: result.kid };
}
