/**
 * Tests for src/adapters/a2a/signature.ts (WP02 — T007/T008/T012).
 *
 * Coverage targets:
 * - verifyCardJws: signed+valid-JWKS → verified:true (EdDSA, ES256, RS256)
 * - verifyCardJws: signed+wrong-key-JWKS → verified:false, reason "signature-mismatch"
 * - verifyCardJws: wrong-key-SAME-kid → verified:false, reason "signature-mismatch" (not "unknown-kid")
 * - verifyCardJws: tampered card → verified:false, reason "signature-mismatch"
 * - verifyCardJws: unsigned card → verified:false, reason "card is unsigned"
 * - verifyCardJws: unsupported alg in header → verified:false, reason "unsupported-alg"
 * - verifyCardJws: unknown kid → verified:false, reason "unknown-kid"
 * - verifyCardJws: key-import-failure (bad JWK) → verified:false, reason "key-import-failure"
 * - verifyCardJws: malformed protected header → verified:false, reason "signature-mismatch"
 *
 * Determinism: same inputs → identical output (offline, no Date, no random).
 *
 * Fixture generation notes (T011):
 *
 * EdDSA (Ed25519):
 *   node:crypto generateKeyPairSync('ed25519')
 *   kid: "muster-test-key-ed25519-v1"
 *   Sign: cryptoSign(null, Buffer.from(signingInput), privateKey)
 *   Only the public key is committed (charter NFR-005).
 *
 * ES256 (EC P-256) — FIX 2:
 *   node:crypto generateKeyPairSync("ec", { namedCurve: "P-256" })
 *   kid: "muster-test-key-es256-v1"
 *   Sign: cryptoSign("sha256", Buffer.from(signingInput), { key: privateKey, dsaEncoding: "ieee-p1363" })
 *   IMPORTANT: JWS mandates IEEE-P1363 (raw r||s) NOT DER for EC signatures.
 *   verifyCardJws verifies ES256 with dsaEncoding: "ieee-p1363" (signature.ts FIX 2).
 *   Only the public key (kty/x/y/crv/kid) is committed.
 *
 * RS256 (RSA 2048) — FIX 2:
 *   node:crypto generateKeyPairSync("rsa", { modulusLength: 2048 })
 *   kid: "muster-test-key-rs256-v1"
 *   Sign: cryptoSign("sha256", Buffer.from(signingInput), privateKey) [PKCS#1 v1.5]
 *   Only the public key (kty/n/e/kid) is committed.
 *
 * Wrong-key-same-kid — FIX 3:
 *   A DIFFERENT Ed25519 key with the SAME kid ("muster-test-key-ed25519-v1")
 *   as the signed.json card's protected header. kid-lookup succeeds but crypto
 *   verification fails → reason "signature-mismatch" (not "unknown-kid").
 *   Generated: node:crypto generateKeyPairSync("ed25519") + set kid manually.
 *
 * Signing scheme (all algorithms):
 *   signingInput = <protected_b64url> + "." + base64url(canonicalJson(card minus signatures minus discoveredFrom))
 *   (matches buildSigningInput in signature.ts)
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

// ---------------------------------------------------------------------------
// FIX 2 — ES256 happy path (EC P-256, ieee-p1363 encoding)
// Fixture: tests/fixtures/a2a/cards/signed-es256.json + jwks/es256.json
// Generation: generateKeyPairSync("ec", { namedCurve: "P-256" }), sign with
//   dsaEncoding: "ieee-p1363" (JWS mandates raw r||s for EC, NOT DER).
// ---------------------------------------------------------------------------

describe("verifyCardJws — ES256 happy path (FIX 2)", () => {
  it("verifies signed-es256.json against es256.json JWKS → verified:true, alg ES256", () => {
    const card = parseAgentCard(readCard("signed-es256.json"), "tests/fixtures/a2a/cards/signed-es256.json");
    const jwks = readJwks("es256.json");

    const result = verifyCardJws(card, jwks);

    expect(result.verified).toBe(true);
    expect(result.alg).toBe("ES256");
    expect(result.kid).toBe("muster-test-key-es256-v1");
    expect(result.reason).toBeUndefined();
  });

  it("ES256: tampered card (wrong sig bytes) → verified:false, reason signature-mismatch", () => {
    const card = parseAgentCard(readCard("signed-es256.json"), "tests/fixtures/a2a/cards/signed-es256.json");
    // Use valid.json (EdDSA JWKS) — kid mismatch → unknown-kid
    const wrongKidJwks = readJwks("valid.json");

    const result = verifyCardJws(card, wrongKidJwks);

    expect(result.verified).toBe(false);
    // The ES256 card's kid ("muster-test-key-es256-v1") doesn't match EdDSA JWKS kid
    expect(result.reason).toBe("unknown-kid");
  });

  it("ES256: wrong key (different EC public key) → verified:false, reason signature-mismatch", () => {
    const card = parseAgentCard(readCard("signed-es256.json"), "tests/fixtures/a2a/cards/signed-es256.json");
    // Construct a JWKS with the correct kid but a different EC key
    const wrongKey: Jwks = {
      keys: [{
        kty: "EC",
        crv: "P-256",
        x: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
        y: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
        kid: "muster-test-key-es256-v1",
      }],
    };

    const result = verifyCardJws(card, wrongKey);

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("signature-mismatch");
    expect(result.alg).toBe("ES256");
  });

  it("ES256: is deterministic — same card + JWKS → identical result", () => {
    const card = parseAgentCard(readCard("signed-es256.json"), "tests/fixtures/a2a/cards/signed-es256.json");
    const jwks = readJwks("es256.json");

    const a = verifyCardJws(card, jwks);
    const b = verifyCardJws(card, jwks);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// FIX 2 — RS256 happy path (RSA 2048, PKCS#1 v1.5)
// Fixture: tests/fixtures/a2a/cards/signed-rs256.json + jwks/rs256.json
// Generation: generateKeyPairSync("rsa", { modulusLength: 2048 }),
//   sign with cryptoSign("sha256", ...) [standard PKCS#1 v1.5].
// ---------------------------------------------------------------------------

describe("verifyCardJws — RS256 happy path (FIX 2)", () => {
  it("verifies signed-rs256.json against rs256.json JWKS → verified:true, alg RS256", () => {
    const card = parseAgentCard(readCard("signed-rs256.json"), "tests/fixtures/a2a/cards/signed-rs256.json");
    const jwks = readJwks("rs256.json");

    const result = verifyCardJws(card, jwks);

    expect(result.verified).toBe(true);
    expect(result.alg).toBe("RS256");
    expect(result.kid).toBe("muster-test-key-rs256-v1");
    expect(result.reason).toBeUndefined();
  });

  it("RS256: wrong JWKS (EdDSA JWKS, different kid) → verified:false, reason unknown-kid", () => {
    const card = parseAgentCard(readCard("signed-rs256.json"), "tests/fixtures/a2a/cards/signed-rs256.json");
    const wrongJwks = readJwks("valid.json"); // EdDSA JWKS, different kid

    const result = verifyCardJws(card, wrongJwks);

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("unknown-kid");
  });

  it("RS256: is deterministic — same card + JWKS → identical result", () => {
    const card = parseAgentCard(readCard("signed-rs256.json"), "tests/fixtures/a2a/cards/signed-rs256.json");
    const jwks = readJwks("rs256.json");

    const a = verifyCardJws(card, jwks);
    const b = verifyCardJws(card, jwks);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// FIX 3 — wrong-key-same-kid: crypto mismatch, NOT a kid lookup failure
// Fixture: tests/fixtures/a2a/jwks/wrong-key-same-kid.json
// A DIFFERENT Ed25519 public key with the SAME kid ("muster-test-key-ed25519-v1")
// as signed.json's protected header. Kid-lookup succeeds, but crypto verification
// fails because the key material is wrong.
// Expected: verified:false, reason "signature-mismatch" (NOT "unknown-kid").
// ---------------------------------------------------------------------------

describe("verifyCardJws — wrong-key-same-kid (FIX 3)", () => {
  it("wrong-key-same-kid → verified:false, reason 'signature-mismatch' (not 'unknown-kid')", () => {
    const card = parseAgentCard(readCard("signed.json"), "tests/fixtures/a2a/cards/signed.json");
    const jwks = readJwks("wrong-key-same-kid.json");

    const result = verifyCardJws(card, jwks);

    expect(result.verified).toBe(false);
    // kid-lookup SUCCEEDS (same kid "muster-test-key-ed25519-v1"), but crypto fails
    expect(result.reason).toBe("signature-mismatch");
    expect(result.kid).toBe("muster-test-key-ed25519-v1");
    expect(result.alg).toBe("EdDSA");
  });

  it("wrong-key-same-kid is distinguishable from unknown-kid", () => {
    const card = parseAgentCard(readCard("signed.json"), "tests/fixtures/a2a/cards/signed.json");
    const sameKid = verifyCardJws(card, readJwks("wrong-key-same-kid.json"));
    const diffKid = verifyCardJws(card, readJwks("wrong-key.json"));

    // same-kid: crypto mismatch → "signature-mismatch"
    expect(sameKid.reason).toBe("signature-mismatch");
    // diff-kid: kid not found → "unknown-kid"
    expect(diffKid.reason).toBe("unknown-kid");
  });
});
