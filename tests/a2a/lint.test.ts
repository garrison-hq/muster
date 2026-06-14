/**
 * Tests for src/adapters/a2a/lint.ts (WP02 — T009/T010/T012).
 *
 * Coverage targets:
 * - lintCard: valid card at fixture path → ok:true, signature:"not-checked"
 * - lintCard: card at obsolete well-known URI → ok:false, error finding
 * - lintCard: signed card + valid JWKS → ok:true, signature:"verified"
 * - lintCard: signed card + wrong-key JWKS → ok:false (unknown-kid), signature:"invalid"
 * - lintCard: tampered card + valid JWKS → ok:false, signature:"invalid"
 * - lintCard: unsigned card + expectSigned:true → ok:false, signature:"unsigned"
 * - lintCard: unsigned card (no JWKS) → ok:true, signature:"not-checked"
 * - lintCard: card with structure findings → ok:false
 * - serializeLintReport: byte-stable (identical bytes on two calls with same input)
 * - signatureControl: discrimination control fails as designed (FR-011)
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { describe, it, expect } from "vitest";

import { parseAgentCard } from "../../src/adapters/a2a/card.js";
import type { Jwks } from "../../src/adapters/a2a/signature.js";
import { lintCard, serializeLintReport, signatureControl } from "../../src/adapters/a2a/lint.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const CARDS_DIR = resolvePath("tests/fixtures/a2a/cards");
const JWKS_DIR = resolvePath("tests/fixtures/a2a/jwks");

function readCard(name: string): string {
  return readFileSync(resolvePath(CARDS_DIR, name), "utf-8");
}

function readJwks(name: string): Jwks {
  return JSON.parse(readFileSync(resolvePath(JWKS_DIR, name), "utf-8")) as Jwks;
}

// ---------------------------------------------------------------------------
// T009 — lintCard: basic cases
// ---------------------------------------------------------------------------

describe("lintCard — unsigned card, no JWKS", () => {
  it("returns ok:true and signature:'not-checked' for a valid fixture card", () => {
    const raw = readCard("valid.json");
    const card = parseAgentCard(raw, "tests/fixtures/a2a/cards/valid.json");

    const report = lintCard(card);

    expect(report.ok).toBe(true);
    expect(report.signature).toBe("not-checked");
    expect(report.findings).toHaveLength(0);
    expect(report.detail).toEqual({ schemaValidation: "delegated:a2a-tck" });
    expect(report.discoveredFrom).toBe("tests/fixtures/a2a/cards/valid.json");
  });

  it("returns ok:false for a card discovered at the obsolete agent.json URI", () => {
    const raw = readCard("valid.json");
    const obsoleteUri = "https://example.com/.well-known/agent.json";
    const card = parseAgentCard(raw, obsoleteUri);

    const report = lintCard(card);

    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.rule === "well-known-uri")).toBe(true);
    expect(report.signature).toBe("not-checked");
  });

  it("returns ok:false for a card with structure errors (empty skill id)", () => {
    const raw = JSON.stringify({
      name: "Agent",
      version: "1.0.0",
      skills: [{ id: "", description: "x" }],
      securitySchemes: [],
    });
    const card = parseAgentCard(raw, "/path/card.json");

    const report = lintCard(card);

    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.rule === "skill-structure")).toBe(true);
  });

  it("assembles the delegation note in detail", () => {
    const raw = readCard("valid.json");
    const card = parseAgentCard(raw, "/path/card.json");

    const report = lintCard(card);

    expect(report.detail.schemaValidation).toBe("delegated:a2a-tck");
  });

  it("is deterministic: same card → identical report on repeated calls", () => {
    const raw = readCard("valid.json");
    const card = parseAgentCard(raw, "/path/card.json");

    const a = lintCard(card);
    const b = lintCard(card);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// T009 — lintCard: with JWKS (offline JWS)
// ---------------------------------------------------------------------------

describe("lintCard — signed card with JWKS", () => {
  it("returns ok:true and signature:'verified' for signed card + valid JWKS", () => {
    const raw = readCard("signed.json");
    const card = parseAgentCard(raw, "tests/fixtures/a2a/cards/signed.json");
    const jwks = readJwks("valid.json");

    const report = lintCard(card, { jwks });

    expect(report.ok).toBe(true);
    expect(report.signature).toBe("verified");
    expect(report.findings).toHaveLength(0);
  });

  it("returns ok:false and signature:'invalid' for signed card + wrong-key JWKS", () => {
    const raw = readCard("signed.json");
    const card = parseAgentCard(raw, "tests/fixtures/a2a/cards/signed.json");
    const jwks = readJwks("wrong-key.json");

    const report = lintCard(card, { jwks });

    expect(report.ok).toBe(false);
    expect(report.signature).toBe("invalid");
    expect(report.findings.some((f) => f.rule === "jws-signature" && f.severity === "error")).toBe(true);
  });

  it("returns ok:false and signature:'invalid' for tampered card + valid JWKS", () => {
    const raw = readCard("tampered.json");
    const card = parseAgentCard(raw, "tests/fixtures/a2a/cards/tampered.json");
    const jwks = readJwks("valid.json");

    const report = lintCard(card, { jwks });

    expect(report.ok).toBe(false);
    expect(report.signature).toBe("invalid");
    expect(report.findings.some((f) => f.rule === "jws-signature")).toBe(true);
    // Finding message cites the reason
    const sigFinding = report.findings.find((f) => f.rule === "jws-signature");
    expect(sigFinding?.message).toContain("signature-mismatch");
  });

  it("returns ok:true and signature:'verified' for signed card + valid JWKS + expectSigned:true", () => {
    const raw = readCard("signed.json");
    const card = parseAgentCard(raw, "tests/fixtures/a2a/cards/signed.json");
    const jwks = readJwks("valid.json");

    const report = lintCard(card, { jwks, expectSigned: true });

    expect(report.ok).toBe(true);
    expect(report.signature).toBe("verified");
  });

  it("jws-signature finding message cites FR-004 and the muster rubric", () => {
    const raw = readCard("tampered.json");
    const card = parseAgentCard(raw, "tests/fixtures/a2a/cards/tampered.json");
    const jwks = readJwks("valid.json");

    const report = lintCard(card, { jwks });

    const sigFinding = report.findings.find((f) => f.rule === "jws-signature");
    expect(sigFinding?.message).toContain("FR-004");
    expect(sigFinding?.message).toContain("muster rubric");
  });
});

// ---------------------------------------------------------------------------
// T009 — lintCard: unsigned card with expectSigned
// ---------------------------------------------------------------------------

describe("lintCard — unsigned card with expectSigned", () => {
  it("returns signature:'unsigned' and ok:false when expectSigned:true and card has no signatures", () => {
    const raw = readCard("valid.json");
    const card = parseAgentCard(raw, "/path/card.json");
    const jwks = readJwks("valid.json");

    const report = lintCard(card, { jwks, expectSigned: true });

    expect(report.signature).toBe("unsigned");
    expect(report.ok).toBe(false);
  });

  it("returns ok:true and signature:'unsigned' when expectSigned:false and card is unsigned", () => {
    const raw = readCard("valid.json");
    const card = parseAgentCard(raw, "/path/card.json");
    const jwks = readJwks("valid.json");

    const report = lintCard(card, { jwks, expectSigned: false });

    expect(report.signature).toBe("unsigned");
    // ok is NOT set to false just because card is unsigned and expectSigned is false
    expect(report.ok).toBe(true);
  });

  it("findings are sorted by rule in UTF-16 code-unit order (byte-stable)", () => {
    const raw = JSON.stringify({
      name: "Agent",
      version: "1.0.0",
      skills: [{ id: "", description: "x" }],
      securitySchemes: [{ id: "", type: "", protectedMethods: [] }],
    });
    const card = parseAgentCard(raw, "https://example.com/.well-known/agent.json");

    const report = lintCard(card);

    const rules = report.findings.map((f) => f.rule);
    const sorted = [...rules].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(rules).toEqual(sorted);
  });
});

// ---------------------------------------------------------------------------
// T009 — serializeLintReport: byte-stable serialization
// ---------------------------------------------------------------------------

describe("serializeLintReport", () => {
  it("emits canonical JSON with no timestamps", () => {
    const raw = readCard("valid.json");
    const card = parseAgentCard(raw, "/path/card.json");
    const report = lintCard(card);

    const serialized = serializeLintReport(report);

    // Should be valid JSON
    expect(() => JSON.parse(serialized)).not.toThrow();
    // Should have no Date fields
    expect(serialized).not.toContain("timestamp");
    expect(serialized).not.toContain("date");
  });

  it("is byte-identical on two successive calls with the same report (NFR-001)", () => {
    const raw = readCard("signed.json");
    const card = parseAgentCard(raw, "tests/fixtures/a2a/cards/signed.json");
    const jwks = readJwks("valid.json");
    const report = lintCard(card, { jwks });

    const first = serializeLintReport(report);
    const second = serializeLintReport(report);

    expect(first).toBe(second);
  });

  it("is byte-identical when called with an equivalent report built twice", () => {
    const raw = readCard("valid.json");
    const card = parseAgentCard(raw, "/path/card.json");
    // Build report twice independently
    const reportA = lintCard(card);
    const reportB = lintCard(card);

    expect(serializeLintReport(reportA)).toBe(serializeLintReport(reportB));
  });

  it("outputs keys in UTF-16 sorted order (canonical JSON, RFC 8785)", () => {
    const raw = readCard("valid.json");
    const card = parseAgentCard(raw, "/path/card.json");
    const report = lintCard(card);

    const serialized = serializeLintReport(report);
    const parsed = JSON.parse(serialized) as Record<string, unknown>;

    const keys = Object.keys(parsed);
    const sorted = [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(keys).toEqual(sorted);
  });

  it("includes all required top-level fields in the serialized report", () => {
    const raw = readCard("valid.json");
    const card = parseAgentCard(raw, "/path/card.json");
    const report = lintCard(card);

    const serialized = serializeLintReport(report);
    const parsed = JSON.parse(serialized) as Record<string, unknown>;

    expect(parsed).toHaveProperty("detail");
    expect(parsed).toHaveProperty("discoveredFrom");
    expect(parsed).toHaveProperty("findings");
    expect(parsed).toHaveProperty("ok");
    expect(parsed).toHaveProperty("path");
    expect(parsed).toHaveProperty("signature");
  });

  it("serializes findings with message, path, rule, severity keys (canonical order)", () => {
    const raw = JSON.stringify({
      name: "Agent",
      version: "1.0.0",
      skills: [{ id: "", description: "x" }],
      securitySchemes: [],
    });
    const card = parseAgentCard(raw, "/path/card.json");
    const report = lintCard(card);

    const serialized = serializeLintReport(report);
    const parsed = JSON.parse(serialized) as { findings: Record<string, unknown>[] };

    expect(parsed.findings.length).toBeGreaterThan(0);
    const finding = parsed.findings[0];
    const findingKeys = Object.keys(finding ?? {});
    const sorted = [...findingKeys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(findingKeys).toEqual(sorted);
  });
});

// ---------------------------------------------------------------------------
// T010 — signatureControl: rigged-impossible discrimination control (FR-011)
// ---------------------------------------------------------------------------

describe("signatureControl — FR-011 discrimination control", () => {
  it("proves the signature grader can fail: tampered card + valid JWKS must yield signature:'invalid'", () => {
    const raw = readCard("tampered.json");
    const card = parseAgentCard(raw, "tests/fixtures/a2a/cards/tampered.json");
    const jwks = readJwks("valid.json");

    const { report, expectation } = signatureControl(card, jwks);

    // The rigged expectation wanted verified — but the grader correctly detected tamper.
    expect(expectation.expectVerified).toBe(true);          // rigged expectation (impossible)
    expect(report.signature).toBe("invalid");               // grader found tamper
    expect(report.ok).toBe(false);                         // control fails as designed
  });

  it("signed card with valid JWKS does NOT trigger the discrimination control (control only fires for tampered)", () => {
    const raw = readCard("signed.json");
    const card = parseAgentCard(raw, "tests/fixtures/a2a/cards/signed.json");
    const jwks = readJwks("valid.json");

    const { report } = signatureControl(card, jwks);

    // Signed card actually verifies — the control only demonstrates the grader can fail
    // when given a tampered card; with a valid card it correctly succeeds.
    expect(report.signature).toBe("verified");
  });
});
