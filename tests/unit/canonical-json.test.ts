import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import { canonicalJson } from "../../src/core/canonical-json.js";
import { buildReport } from "../../src/core/report.js";

describe("canonicalJson — RFC 8785 / RFC-1 Appendix F.2", () => {
  describe("RFC 8785: key ordering (Appendix B-style vectors)", () => {
    it("RFC 8785: reorders keys by UTF-16 code units ({b,a} → {a,b})", () => {
      expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    });

    it("RFC 8785: sorts keys recursively in nested objects", () => {
      expect(canonicalJson({ z: { b: [2, 1], a: true }, a: "x" })).toBe(
        '{"a":"x","z":{"a":true,"b":[2,1]}}'
      );
    });

    it('RFC 8785: unicode keys sort by code units ("z" before "é")', () => {
      // "z" is U+007A, "é" is U+00E9 — code-unit order puts "z" first.
      expect(canonicalJson({ "é": 1, z: 2 })).toBe('{"z":2,"é":1}');
    });

    it("RFC 8785: arrays preserve element order", () => {
      expect(canonicalJson([3, 1, 2, { b: 1, a: 2 }])).toBe('[3,1,2,{"a":2,"b":1}]');
    });
  });

  describe("RFC 8785: number forms (ECMA-262 via JSON.stringify)", () => {
    it("RFC 8785: 1.0 serializes as 1", () => {
      expect(canonicalJson(1.0)).toBe("1");
    });

    it("RFC 8785: 1e+30 serializes as 1e+30", () => {
      expect(canonicalJson(1e30)).toBe("1e+30");
    });

    it("RFC 8785: -0 serializes as 0", () => {
      expect(canonicalJson(-0)).toBe("0");
    });
  });

  describe("RFC 8785: unrepresentable values are rejected", () => {
    it("RFC 8785: throws TypeError for non-finite numbers (never emits null)", () => {
      expect(() => canonicalJson(NaN)).toThrow(TypeError);
      expect(() => canonicalJson(Infinity)).toThrow(TypeError);
      expect(() => canonicalJson(-Infinity)).toThrow(TypeError);
      expect(() => canonicalJson({ a: NaN })).toThrow(TypeError);
    });

    it("RFC 8785: throws TypeError for undefined and functions", () => {
      expect(() => canonicalJson(undefined)).toThrow(TypeError);
      expect(() => canonicalJson(() => 1)).toThrow(TypeError);
      expect(() => canonicalJson({ a: undefined })).toThrow(TypeError);
    });
  });

  describe("RFC 8785: determinism (NFR-001)", () => {
    it("RFC 8785: different key-insertion orders yield identical bytes (NFR-001)", () => {
      const first: Record<string, unknown> = {};
      first["voice"] = { formality: 50, warmth: 60 };
      first["id"] = "soul-1";
      first["values"] = { priorities: ["honesty", "warmth"] };

      const second: Record<string, unknown> = {};
      second["values"] = { priorities: ["honesty", "warmth"] };
      second["id"] = "soul-1";
      second["voice"] = { warmth: 60, formality: 50 };

      const a = canonicalJson(first);
      const b = canonicalJson(second);
      expect(a).toBe(b);
      expect(Buffer.from(a, "utf8").equals(Buffer.from(b, "utf8"))).toBe(true);
    });

    it("RFC 8785: emits no trailing newline (F.2 exact comparison form)", () => {
      expect(canonicalJson({ a: 1 }).endsWith("\n")).toBe(false);
    });
  });
});

describe("ConformanceReport — RFC-1 §25.1 shape", () => {
  const schemaPath = fileURLToPath(
    new URL(
      "../../kitty-specs/cts1-conformance-harness-01KTS86B/contracts/conformance-report.schema.json",
      import.meta.url
    )
  );
  const schema: object = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
  const ajv = new Ajv2020({ allErrors: true });
  const validateReport = ajv.compile(schema);

  it("§25.1: buildReport output validates against the conformance-report schema", () => {
    const report = buildReport({
      spec: "1.0.0-rc1",
      soulId: "soul-1",
      mode: "strict",
      profile: "default",
      state: null,
      violations: [
        { path: "composition.extends[1]", message: "cycle detected", severity: "error", section: "§7.3" },
        { path: "voice.formality", message: "out of range", severity: "warning" },
      ],
    });
    expect(validateReport(report)).toBe(true);
    expect(validateReport.errors ?? []).toEqual([]);
  });

  it("§25.1: ok is true iff zero errors; warnings never flip ok", () => {
    const report = buildReport({
      spec: "1.0.0-rc1",
      soulId: "soul-1",
      mode: "permissive",
      profile: "default",
      state: "focus",
      violations: [{ path: "voice", message: "soft concern", severity: "warning" }],
    });
    expect(report.ok).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.warnings).toHaveLength(1);
    expect(validateReport(report)).toBe(true);
  });

  it("§25.1: violations serialize as {path, message} with section only when set", () => {
    const report = buildReport({
      spec: "1.0.0-rc1",
      soulId: "",
      mode: "strict",
      profile: "default",
      state: null,
      violations: [
        { path: "id", message: "missing", severity: "error", section: "§6.1" },
        { path: "name", message: "missing", severity: "error" },
      ],
    });
    expect(report.ok).toBe(false);
    expect(report.errors[0]).toEqual({ path: "id", message: "missing", section: "§6.1" });
    expect(report.errors[1]).toEqual({ path: "name", message: "missing" });
    expect("section" in report.errors[1]!).toBe(false);
    expect(validateReport(report)).toBe(true);
  });
});
