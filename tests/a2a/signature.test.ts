/**
 * Tests for src/adapters/a2a/signature.ts (WP02 — T007/T008/T012).
 *
 * Coverage targets:
 * - verifyCardJws: signed+valid-JWKS → verified:true
 * - verifyCardJws: signed+wrong-key-JWKS → verified:false, reason "signature-mismatch"
 * - verifyCardJws: tampered card → verified:false, reason "signature-mismatch"
 * - verifyCardJws: unsigned card → verified:false, reason "card is unsigned"
 * - verifyCardJws: unsupported alg in header → verified:false, reason "unsupported-alg"
 * - verifyCardJws: unknown kid → verified:false, reason "unknown-kid"
 * - verifyCardJws: key-import-failure (bad JWK) → verified:false, reason "key-import-failure"
 * - verifyCardJws: malformed protected header → verified:false, reason "signature-mismatch"
 *
 * Determinism: same inputs → identical output (offline, no Date, no random).
 *
 * Fixture generation note (T011):
 *   Keypair: Ed25519 generated with node:crypto generateKeyPairSync('ed25519').
 *   kid: "muster-test-key-ed25519-v1"
 *   Signing scheme: sign over "<protected_b64url>.<canonical_payload_b64url>"
 *   where canonical_payload = canonicalJson(card body excluding "signatures" and "discoveredFrom").
 *   Only public keys are committed; the private key is NOT in the repo (charter NFR-005).
 *   Reproducing: run the fixture generation script in WP02 notes with any Ed25519 key.
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { describe, it, expect } from "vitest";

import { parseAgentCard } from "../../src/adapters/a2a/card.js";
import type { Jwks } from "../../src/adapters/a2a/signature.js";
import { verifyCardJws } from "../../src/adapters/a2a/signature.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const CARDS_DIR = resolvePath("tests/fixtures/a2a/cards");
const JWKS_DIR = resolvePath("tests/fixtures/a2a/jwks");

function readCard(name: string): string {
  return readFileSync(resolvePath(CARDS_DIR, name), "utf-8");
}

function readJwks(name: string): Jwks {
  const raw = readFileSync(resolvePath(JWKS_DIR, name), "utf-8");
  return JSON.parse(raw) as Jwks;
}

// ---------------------------------------------------------------------------
// T007 — verifyCardJws: valid signature
// ---------------------------------------------------------------------------

describe("verifyCardJws — valid signature", () => {
  it("returns verified:true for signed.json with the matching public key", () => {
    const card = parseAgentCard(readCard("signed.json"), "tests/fixtures/a2a/cards/signed.json");
    const jwks = readJwks("valid.json");

    const result = verifyCardJws(card, jwks);

    expect(result.verified).toBe(true);
    expect(result.alg).toBe("EdDSA");
    expect(result.kid).toBe("muster-test-key-ed25519-v1");
    expect(result.reason).toBeUndefined();
  });

  it("is deterministic: same card + JWKS → identical result on repeated calls", () => {
    const card = parseAgentCard(readCard("signed.json"), "tests/fixtures/a2a/cards/signed.json");
    const jwks = readJwks("valid.json");

    const a = verifyCardJws(card, jwks);
    const b = verifyCardJws(card, jwks);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// T007 — verifyCardJws: wrong-key JWKS (different public key, no kid match)
// ---------------------------------------------------------------------------

describe("verifyCardJws — wrong key", () => {
  it("returns verified:false with reason 'unknown-kid' when kid does not match any JWK", () => {
    const card = parseAgentCard(readCard("signed.json"), "tests/fixtures/a2a/cards/signed.json");
    const jwks = readJwks("wrong-key.json");

    const result = verifyCardJws(card, jwks);

    expect(result.verified).toBe(false);
    // The signed card's kid ("muster-test-key-ed25519-v1") doesn't match
    // the wrong-key's kid ("muster-wrong-key-ed25519-v1"), so unknown-kid.
    expect(result.reason).toBe("unknown-kid");
    expect(result.alg).toBe("EdDSA");
    expect(result.kid).toBe("muster-test-key-ed25519-v1");
  });
});

// ---------------------------------------------------------------------------
// T008 — verifyCardJws: tampered card (signature-mismatch)
// ---------------------------------------------------------------------------

describe("verifyCardJws — tampered card", () => {
  it("returns verified:false with reason 'signature-mismatch' for tampered.json", () => {
    const card = parseAgentCard(readCard("tampered.json"), "tests/fixtures/a2a/cards/tampered.json");
    const jwks = readJwks("valid.json");

    const result = verifyCardJws(card, jwks);

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("signature-mismatch");
    expect(result.alg).toBe("EdDSA");
    expect(result.kid).toBe("muster-test-key-ed25519-v1");
  });

  it("tampered card is distinguishable from the signed card", () => {
    const signed = parseAgentCard(readCard("signed.json"), "tests/fixtures/a2a/cards/signed.json");
    const tampered = parseAgentCard(readCard("tampered.json"), "tests/fixtures/a2a/cards/tampered.json");
    const jwks = readJwks("valid.json");

    const signedResult = verifyCardJws(signed, jwks);
    const tamperedResult = verifyCardJws(tampered, jwks);

    expect(signedResult.verified).toBe(true);
    expect(tamperedResult.verified).toBe(false);
    expect(tamperedResult.reason).toBe("signature-mismatch");
  });
});

// ---------------------------------------------------------------------------
// T008 — verifyCardJws: distinct reason codes
// ---------------------------------------------------------------------------

describe("verifyCardJws — reason codes", () => {
  it("returns reason 'card is unsigned' for a card with no signatures field", () => {
    const raw = JSON.stringify({ name: "NoSig", version: "1.0.0", skills: [], securitySchemes: [] });
    const card = parseAgentCard(raw, "/some/path/card.json");
    const jwks = readJwks("valid.json");

    const result = verifyCardJws(card, jwks);

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("card is unsigned");
  });

  it("returns reason 'card is unsigned' for a card with an empty signatures array", () => {
    const raw = JSON.stringify({
      name: "EmptySig",
      version: "1.0.0",
      skills: [],
      securitySchemes: [],
      signatures: [],
    });
    const card = parseAgentCard(raw, "/path");
    const jwks = readJwks("valid.json");

    const result = verifyCardJws(card, jwks);

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("card is unsigned");
  });

  it("returns reason 'unsupported-alg' for an unrecognised algorithm", () => {
    // RS512 is not supported (only RS256, ES256, EdDSA are)
    const protectedB64 = Buffer.from(JSON.stringify({ alg: "RS512", kid: "k1" })).toString(
      "base64url"
    );
    const raw = JSON.stringify({
      name: "UnsupportedAlg",
      version: "1.0.0",
      skills: [],
      securitySchemes: [],
      signatures: [{ protected: protectedB64, signature: "fakesig" }],
    });
    const card = parseAgentCard(raw, "/path");
    const jwks = readJwks("valid.json");

    const result = verifyCardJws(card, jwks);

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("unsupported-alg");
    expect(result.alg).toBe("RS512");
  });

  it("returns reason 'unknown-kid' when the kid in the header has no match in JWKS", () => {
    const protectedB64 = Buffer.from(JSON.stringify({ alg: "EdDSA", kid: "no-such-key" })).toString(
      "base64url"
    );
    const raw = JSON.stringify({
      name: "UnknownKid",
      version: "1.0.0",
      skills: [],
      securitySchemes: [],
      signatures: [{ protected: protectedB64, signature: "fakesig" }],
    });
    const card = parseAgentCard(raw, "/path");
    const jwks = readJwks("valid.json");

    const result = verifyCardJws(card, jwks);

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("unknown-kid");
    expect(result.kid).toBe("no-such-key");
  });

  it("returns reason 'key-import-failure' for a malformed JWK", () => {
    const protectedB64 = Buffer.from(JSON.stringify({ alg: "EdDSA" })).toString("base64url");
    const raw = JSON.stringify({
      name: "BadJwk",
      version: "1.0.0",
      skills: [],
      securitySchemes: [],
      signatures: [{ protected: protectedB64, signature: "fakesig" }],
    });
    const card = parseAgentCard(raw, "/path");
    // A JWKS with one key that is not a valid JWK (missing required fields)
    const brokenJwks: Jwks = { keys: [{ kty: "OKP", crv: "Ed25519" }] };

    const result = verifyCardJws(card, brokenJwks);

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("key-import-failure");
  });

  it("returns reason 'signature-mismatch' for a malformed protected header (not valid JSON)", () => {
    const raw = JSON.stringify({
      name: "BadHeader",
      version: "1.0.0",
      skills: [],
      securitySchemes: [],
      // protected is not valid base64url-encoded JSON
      signatures: [{ protected: "!!!notbase64!!!alg", signature: "fakesig" }],
    });
    const card = parseAgentCard(raw, "/path");
    const jwks = readJwks("valid.json");

    const result = verifyCardJws(card, jwks);

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("signature-mismatch");
  });

  it("returns reason 'signature-mismatch' for an array protected header (reviewer guard)", () => {
    // The reviewer nit: guard against a protected header that decodes to an array.
    const protectedB64 = Buffer.from(JSON.stringify(["alg", "EdDSA"])).toString("base64url");
    const raw = JSON.stringify({
      name: "ArrayHeader",
      version: "1.0.0",
      skills: [],
      securitySchemes: [],
      signatures: [{ protected: protectedB64, signature: "fakesig" }],
    });
    const card = parseAgentCard(raw, "/path");
    const jwks = readJwks("valid.json");

    const result = verifyCardJws(card, jwks);

    expect(result.verified).toBe(false);
    // Array header → decodeProtectedHeader returns null → signature-mismatch
    expect(result.reason).toBe("signature-mismatch");
  });

  it("fallback to sole key when JWKS has one entry and no kid in header", () => {
    // Sign-like scenario: header has no kid, JWKS has one key.
    // We can't easily produce a valid sig inline, but we can verify the code
    // reaches the verify step (wrong sig → signature-mismatch, not unknown-kid).
    const protectedB64 = Buffer.from(JSON.stringify({ alg: "EdDSA" })).toString("base64url");
    const raw = JSON.stringify({
      name: "NoKid",
      version: "1.0.0",
      skills: [],
      securitySchemes: [],
      signatures: [{ protected: protectedB64, signature: "bm9wZQ" }],
    });
    const card = parseAgentCard(raw, "/path");
    const jwks = readJwks("valid.json");

    const result = verifyCardJws(card, jwks);

    // Should reach verify step and fail with signature-mismatch (not unknown-kid)
    expect(result.verified).toBe(false);
    expect(result.reason).toBe("signature-mismatch");
  });
});
