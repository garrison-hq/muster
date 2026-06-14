/**
 * Tests for src/adapters/a2a/card.ts and src/adapters/a2a/types.ts (WP01).
 *
 * Coverage targets:
 *   - parseAgentCard: valid JSON, missing arrays, malformed JSON, signatures
 *   - checkDiscoveryUri: canonical URI → null, obsolete URI → finding, other path → null
 *   - checkStructure: empty skill id → finding, empty scheme id/type → finding,
 *     no schemes → no finding, valid card → no findings
 *   - delegationNote: returns the exact delegation shape
 *   - loadManifest: valid manifest loads, wrong adapter → throws, missing cases → throws,
 *     relative cardSource resolves against manifest dir
 *
 * Determinism contract: same input → identical output (no Date, no random).
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";

import {
  parseAgentCard,
  checkDiscoveryUri,
  checkStructure,
  delegationNote,
} from "../../src/adapters/a2a/card.js";

import { loadManifest } from "../../src/adapters/a2a/types.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolvePath("tests/fixtures/a2a/cards");

function readFixture(name: string): string {
  return readFileSync(resolvePath(FIXTURES_DIR, name), "utf-8");
}

// ---------------------------------------------------------------------------
// T001 — parseAgentCard
// ---------------------------------------------------------------------------

describe("parseAgentCard", () => {
  it("parses a well-formed card with skills and security schemes", () => {
    const raw = readFixture("valid.json");
    const card = parseAgentCard(raw, "/some/path/valid.json");

    expect(card.name).toBe("Echo Agent");
    expect(card.version).toBe("1.0.0");
    expect(card.skills).toHaveLength(1);
    expect(card.skills[0]?.id).toBe("echo");
    expect(card.skills[0]?.description).toBe("Returns the input message verbatim.");
    expect(card.skills[0]?.expectedBehavior).toBe(
      "Agent responds with the exact text of the input message."
    );
    expect(card.securitySchemes).toHaveLength(1);
    expect(card.securitySchemes[0]?.id).toBe("bearer-auth");
    expect(card.securitySchemes[0]?.type).toBe("bearer");
    expect(card.securitySchemes[0]?.protectedMethods).toEqual(["message/send"]);
    expect(card.discoveredFrom).toBe("/some/path/valid.json");
    expect(card.signatures).toBeUndefined();
  });

  it("retains the raw parsed JSON on the card for WP02 JWS verification", () => {
    const raw = readFixture("valid.json");
    const card = parseAgentCard(raw, "/path/to/card.json");
    // raw must be the parsed object — not null, not the string
    expect(typeof card.raw).toBe("object");
    expect(card.raw).not.toBeNull();
  });

  it("defaults skills to [] when the field is absent", () => {
    const raw = JSON.stringify({ name: "NoSkills", version: "0.1.0", securitySchemes: [] });
    const card = parseAgentCard(raw, "/path");
    expect(card.skills).toEqual([]);
  });

  it("defaults securitySchemes to [] when the field is absent", () => {
    const raw = JSON.stringify({ name: "NoSchemes", version: "0.1.0", skills: [] });
    const card = parseAgentCard(raw, "/path");
    expect(card.securitySchemes).toEqual([]);
  });

  it("does not throw on malformed JSON — returns empty card", () => {
    // MUST NOT throw
    expect(() => parseAgentCard("{bad json!!!", "/path")).not.toThrow();
    const card = parseAgentCard("{bad json!!!", "/path");
    expect(card.skills).toEqual([]);
    expect(card.securitySchemes).toEqual([]);
    expect(card.name).toBe("");
    expect(card.raw).toBeNull();
  });

  it("preserves signatures when present", () => {
    const raw = JSON.stringify({
      name: "Signed",
      version: "1.0.0",
      skills: [],
      securitySchemes: [],
      signatures: [
        { protected: "eyJhbGciOiJFUzI1NiJ9", signature: "abc123" },
      ],
    });
    const card = parseAgentCard(raw, "/path");
    expect(card.signatures).toHaveLength(1);
    expect(card.signatures?.[0]?.protected).toBe("eyJhbGciOiJFUzI1NiJ9");
    expect(card.signatures?.[0]?.signature).toBe("abc123");
  });

  it("preserves signature header when present", () => {
    const raw = JSON.stringify({
      name: "SignedWithHeader",
      version: "1.0.0",
      skills: [],
      securitySchemes: [],
      signatures: [
        { protected: "abc", signature: "def", header: { kid: "key-1" } },
      ],
    });
    const card = parseAgentCard(raw, "/path");
    expect(card.signatures?.[0]?.header).toEqual({ kid: "key-1" });
  });

  it("returns an empty card when the JSON is not an object (e.g. array)", () => {
    const raw = JSON.stringify([1, 2, 3]);
    const card = parseAgentCard(raw, "/path");
    expect(card.skills).toEqual([]);
    expect(card.securitySchemes).toEqual([]);
  });

  it("returns an empty card when the JSON is a primitive (e.g. string)", () => {
    const raw = JSON.stringify("just a string");
    const card = parseAgentCard(raw, "/path");
    expect(card.skills).toEqual([]);
    expect(card.securitySchemes).toEqual([]);
    expect(card.name).toBe("");
  });

  it("returns an empty card when the JSON is a number", () => {
    const card = parseAgentCard("42", "/path");
    expect(card.skills).toEqual([]);
    expect(card.name).toBe("");
  });

  it("sets discoveredFrom correctly", () => {
    const raw = readFixture("valid.json");
    const path = "https://example.com/.well-known/agent-card.json";
    const card = parseAgentCard(raw, path);
    expect(card.discoveredFrom).toBe(path);
  });

  it("produces deterministic output: same input → identical result", () => {
    const raw = readFixture("valid.json");
    const cardA = parseAgentCard(raw, "/path");
    const cardB = parseAgentCard(raw, "/path");
    expect(JSON.stringify(cardA)).toBe(JSON.stringify(cardB));
  });
});

// ---------------------------------------------------------------------------
// T002 — checkDiscoveryUri (FR-003, A2A §8.2)
// ---------------------------------------------------------------------------

describe("checkDiscoveryUri", () => {
  it("returns null for the canonical /.well-known/agent-card.json URI", () => {
    const result = checkDiscoveryUri("https://example.com/.well-known/agent-card.json");
    expect(result).toBeNull();
  });

  it("returns null for a localhost canonical URI", () => {
    expect(
      checkDiscoveryUri("http://localhost:8080/.well-known/agent-card.json")
    ).toBeNull();
  });

  it("returns a LintFinding for the obsolete /.well-known/agent.json URI", () => {
    const finding = checkDiscoveryUri("https://example.com/.well-known/agent.json");
    expect(finding).not.toBeNull();
    expect(finding?.rule).toBe("well-known-uri");
    expect(finding?.path).toBe("https://example.com/.well-known/agent.json");
    expect(finding?.message).toContain("§8.2");
    expect(finding?.message).toContain("agent-card.json");
  });

  it("finding for obsolete URI cites the normative source", () => {
    const finding = checkDiscoveryUri("http://localhost/.well-known/agent.json");
    expect(finding?.message).toContain("a2a.proto");
  });

  it("returns null for a non-well-known fixture file path (not-applicable)", () => {
    // Local fixture paths must not trigger the well-known check so lint works offline
    expect(
      checkDiscoveryUri("tests/fixtures/a2a/cards/valid.json")
    ).toBeNull();
  });

  it("returns null for an absolute fixture file path (not-applicable)", () => {
    expect(
      checkDiscoveryUri("/home/user/project/tests/fixtures/a2a/cards/valid.json")
    ).toBeNull();
  });

  it("produces deterministic output: same URI → identical result", () => {
    const uri = "https://example.com/.well-known/agent.json";
    const a = checkDiscoveryUri(uri);
    const b = checkDiscoveryUri(uri);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// T003 — checkStructure (FR-005, residual-gap checks)
// ---------------------------------------------------------------------------

describe("checkStructure", () => {
  it("returns no findings for a well-formed card", () => {
    const raw = readFixture("valid.json");
    const card = parseAgentCard(raw, "/path/valid.json");
    expect(checkStructure(card)).toEqual([]);
  });

  it("returns a skill-structure finding when a skill has an empty id", () => {
    const raw = JSON.stringify({
      name: "Agent",
      version: "1.0.0",
      skills: [{ id: "", description: "Something" }],
      securitySchemes: [],
    });
    const card = parseAgentCard(raw, "/path");
    const findings = checkStructure(card);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe("skill-structure");
  });

  it("returns a skill-structure finding when a skill has a whitespace-only id", () => {
    const raw = JSON.stringify({
      name: "Agent",
      version: "1.0.0",
      skills: [{ id: "   ", description: "Something" }],
      securitySchemes: [],
    });
    const card = parseAgentCard(raw, "/path");
    const findings = checkStructure(card);
    expect(findings.some((f) => f.rule === "skill-structure")).toBe(true);
  });

  it("returns a scheme-structure finding when a scheme has an empty id", () => {
    const raw = JSON.stringify({
      name: "Agent",
      version: "1.0.0",
      skills: [],
      securitySchemes: [{ id: "", type: "bearer", protectedMethods: [] }],
    });
    const card = parseAgentCard(raw, "/path");
    const findings = checkStructure(card);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe("scheme-structure");
  });

  it("returns a scheme-structure finding when a scheme has an empty type", () => {
    const raw = JSON.stringify({
      name: "Agent",
      version: "1.0.0",
      skills: [],
      securitySchemes: [{ id: "auth", type: "", protectedMethods: [] }],
    });
    const card = parseAgentCard(raw, "/path");
    const findings = checkStructure(card);
    expect(findings.some((f) => f.rule === "scheme-structure")).toBe(true);
  });

  it("does NOT flag a card with no security schemes (auth probes not applicable)", () => {
    const raw = JSON.stringify({
      name: "Agent",
      version: "1.0.0",
      skills: [{ id: "echo", description: "echoes" }],
      securitySchemes: [],
    });
    const card = parseAgentCard(raw, "/path");
    const findings = checkStructure(card);
    // No scheme-structure findings expected — absence of schemes is not an error
    expect(findings.some((f) => f.rule === "scheme-structure")).toBe(false);
  });

  it("findings cite the normative source", () => {
    const raw = JSON.stringify({
      name: "Agent",
      version: "1.0.0",
      skills: [{ id: "", description: "x" }],
      securitySchemes: [],
    });
    const card = parseAgentCard(raw, "/path");
    const findings = checkStructure(card);
    expect(findings[0]?.message).toContain("a2a.proto");
  });

  it("produces deterministic findings: same card → identical findings array", () => {
    const raw = JSON.stringify({
      name: "Agent",
      version: "1.0.0",
      skills: [{ id: "", description: "x" }],
      securitySchemes: [{ id: "", type: "", protectedMethods: [] }],
    });
    const card = parseAgentCard(raw, "/path");
    const a = checkStructure(card);
    const b = checkStructure(card);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// delegationNote
// ---------------------------------------------------------------------------

describe("delegationNote", () => {
  it("returns the exact delegation shape required by FR-005 / C-002", () => {
    expect(delegationNote()).toEqual({ schemaValidation: "delegated:a2a-tck" });
  });

  it("returns an object whose schemaValidation is the literal string 'delegated:a2a-tck'", () => {
    const note = delegationNote();
    expect(note.schemaValidation).toBe("delegated:a2a-tck");
  });

  it("is deterministic: repeated calls return identical value", () => {
    const a = delegationNote();
    const b = delegationNote();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// T004 — loadManifest (FR-002, types.ts)
// ---------------------------------------------------------------------------

describe("loadManifest", () => {
  function writeTempManifest(content: string): string {
    const dir = mkdtempSync(resolvePath(tmpdir(), "muster-a2a-test-"));
    const path = resolvePath(dir, "manifest.json");
    writeFileSync(path, content, "utf-8");
    return path;
  }

  it("loads a valid a2a manifest", () => {
    const manifest = {
      adapter: "a2a",
      cases: [
        {
          id: "test-001",
          description: "Discovery lint passes",
          cardSource: "tests/fixtures/a2a/cards/valid.json",
          gradingClass: "static-lint",
          expectation: { ok: true },
        },
      ],
    };
    const path = writeTempManifest(JSON.stringify(manifest));
    const loaded = loadManifest(path);
    expect(loaded.adapter).toBe("a2a");
    expect(loaded.cases).toHaveLength(1);
    expect(loaded.cases[0]?.id).toBe("test-001");
    expect(loaded.cases[0]?.gradingClass).toBe("static-lint");
  });

  it("throws when the adapter field is not 'a2a'", () => {
    const manifest = { adapter: "heartbeat", cases: [] };
    const path = writeTempManifest(JSON.stringify(manifest));
    expect(() => loadManifest(path)).toThrow(/adapter "a2a"/);
  });

  it("throws when cases array is missing", () => {
    const manifest = { adapter: "a2a" };
    const path = writeTempManifest(JSON.stringify(manifest));
    expect(() => loadManifest(path)).toThrow(/cases/);
  });

  it("throws when cases is not an array", () => {
    const manifest = { adapter: "a2a", cases: "not-an-array" };
    const path = writeTempManifest(JSON.stringify(manifest));
    expect(() => loadManifest(path)).toThrow(/cases/);
  });

  it("throws when the file does not exist", () => {
    expect(() =>
      loadManifest("/absolutely/nonexistent/manifest.json")
    ).toThrow(/cannot read/i);
  });

  it("throws when the file is not valid JSON", () => {
    const path = writeTempManifest("{not valid json");
    expect(() => loadManifest(path)).toThrow(/not valid JSON/i);
  });

  it("resolves relative cardSource paths against the manifest directory", () => {
    const manifest = {
      adapter: "a2a",
      cases: [
        {
          id: "test-relative",
          description: "relative path test",
          cardSource: "cards/valid.json",
          gradingClass: "static-lint",
          expectation: { ok: true },
        },
      ],
    };
    const path = writeTempManifest(JSON.stringify(manifest));
    const loaded = loadManifest(path);
    // The cardSource should be resolved to an absolute path rooted in the manifest dir
    const manifestDir = resolvePath(path, "..");
    expect(loaded.cases[0]?.cardSource).toBe(
      resolvePath(manifestDir, "cards/valid.json")
    );
  });

  it("does not modify a 'well-known' cardSource", () => {
    const manifest = {
      adapter: "a2a",
      cases: [
        {
          id: "live-001",
          description: "live fetch",
          cardSource: "well-known",
          gradingClass: "skill-behavior",
          expectation: { passed: true },
        },
      ],
    };
    const path = writeTempManifest(JSON.stringify(manifest));
    const loaded = loadManifest(path);
    expect(loaded.cases[0]?.cardSource).toBe("well-known");
  });

  it("preserves optional case fields: skillProbe, auth, signed, runs, passThreshold, control", () => {
    const manifest = {
      adapter: "a2a",
      cases: [
        {
          id: "full-case",
          description: "full",
          cardSource: "well-known",
          gradingClass: "skill-behavior",
          skillProbe: { skillId: "echo", input: "ping", expect: "pong" },
          auth: { scheme: "bearer", method: "message/send", authorized: false },
          signed: { jwksSource: "live", expectVerified: true },
          runs: 5,
          passThreshold: 0.8,
          control: true,
          expectation: { passed: false },
        },
      ],
    };
    const path = writeTempManifest(JSON.stringify(manifest));
    const loaded = loadManifest(path);
    const kase = loaded.cases[0];
    expect(kase?.skillProbe).toEqual({ skillId: "echo", input: "ping", expect: "pong" });
    expect(kase?.auth).toEqual({ scheme: "bearer", method: "message/send", authorized: false });
    expect(kase?.signed).toEqual({ jwksSource: "live", expectVerified: true });
    expect(kase?.runs).toBe(5);
    expect(kase?.passThreshold).toBe(0.8);
    expect(kase?.control).toBe(true);
  });

  it("does not resolve absolute cardSource paths", () => {
    const manifest = {
      adapter: "a2a",
      cases: [
        {
          id: "abs-case",
          description: "absolute path",
          cardSource: "/absolute/path/to/card.json",
          gradingClass: "static-lint",
          expectation: { ok: true },
        },
      ],
    };
    const path = writeTempManifest(JSON.stringify(manifest));
    const loaded = loadManifest(path);
    expect(loaded.cases[0]?.cardSource).toBe("/absolute/path/to/card.json");
  });

  it("throws when the JSON parses to a non-object (e.g. array)", () => {
    const path = writeTempManifest(JSON.stringify([1, 2, 3]));
    expect(() => loadManifest(path)).toThrow(/must be a JSON object/i);
  });

  it("throws when the JSON parses to null", () => {
    const path = writeTempManifest("null");
    expect(() => loadManifest(path)).toThrow(/must be a JSON object/i);
  });

  it("throws when a case entry is not an object", () => {
    const manifest = { adapter: "a2a", cases: ["not-an-object"] };
    const path = writeTempManifest(JSON.stringify(manifest));
    expect(() => loadManifest(path)).toThrow(/cases\[0\] must be an object/i);
  });

  it("defaults expectation to {} when missing from case", () => {
    const manifest = {
      adapter: "a2a",
      cases: [
        {
          id: "no-expectation",
          description: "missing expectation",
          cardSource: "well-known",
          gradingClass: "static-lint",
          // expectation is intentionally omitted
        },
      ],
    };
    const path = writeTempManifest(JSON.stringify(manifest));
    const loaded = loadManifest(path);
    expect(loaded.cases[0]?.expectation).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Integration: parse + discovery + structure on fixture files
// ---------------------------------------------------------------------------

describe("integration: fixture files", () => {
  it("valid.json: parses and passes structure checks with no findings", () => {
    const raw = readFixture("valid.json");
    const card = parseAgentCard(raw, "tests/fixtures/a2a/cards/valid.json");
    const discoveryFinding = checkDiscoveryUri(card.discoveredFrom);
    const structureFindings = checkStructure(card);
    expect(discoveryFinding).toBeNull();
    expect(structureFindings).toEqual([]);
  });

  it("obsolete-uri.json: card parses fine; discovery finding fires when passed obsolete URI", () => {
    const raw = readFixture("obsolete-uri.json");
    const obsoleteUri = "https://example.com/.well-known/agent.json";
    const card = parseAgentCard(raw, obsoleteUri);
    const discoveryFinding = checkDiscoveryUri(card.discoveredFrom);
    expect(discoveryFinding).not.toBeNull();
    expect(discoveryFinding?.rule).toBe("well-known-uri");
    // Structure is fine — the body is the same as valid.json
    expect(checkStructure(card)).toEqual([]);
  });
});
