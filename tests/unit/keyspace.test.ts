import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Violation } from "../../src/core/report.js";
import {
  KNOWN_OPTIONAL,
  MANDATORY,
  checkFloat01,
  checkPercent,
  dedupeViolations,
  validate,
  validateKeyspace,
  validateProfiles,
  validateScalars,
  validateSchema,
} from "../../src/adapters/rfc1/keyspace.js";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Appendix A minimal valid soul, transcribed from the vendored spec.
 * Includes `profile_overrides: {}` — Appendix E requires it for kind:soul
 * even though §25's mandatory list omits it (documented WP03 risk).
 */
function minimalSoul(): Record<string, unknown> {
  return {
    soul_spec: "1.0.0-rc1",
    id: "org.example.minimal",
    name: "Minimal",
    locale: "ru-RU",
    composition: { extends: [], mixins: [], merge_policy: "standard" },
    profiles: ["default"],
    profile_overrides: {},
    values: { priorities: ["accuracy", "clarity", "safety", "speed"] },
    voice: { formality: 60, warmth: 30, verbosity: 50, jargon: 40, formatting: "minimal" },
    interaction: {
      clarifying_questions: "when_ambiguous",
      uncertainty: "explicit",
      disagreement: "neutral",
      confirmations: "implicit",
    },
    safety: { refusal_style: "brief", privacy: "strict", speculation: "mark" },
    extensions: {},
  };
}

function minimalMixin(): Record<string, unknown> {
  return { soul_spec: "1.0.0-rc1", id: "org.example.trait", kind: "mixin" };
}

function expectAllWellFormed(violations: readonly Violation[]): void {
  for (const v of violations) {
    expect(v.path).not.toBe("");
    expect(v.message).not.toBe("");
    expect(v.section).toBeTruthy();
  }
}

describe("Appendix E schema layer (validateSchema)", () => {
  it("schema.json is byte-faithful to the vendored Appendix E (lines 2025–2159)", () => {
    const spec = readFileSync(
      join(here, "../../.kittify/reference/soul-spec.md"),
      "utf8"
    );
    // Appendix E code fence: lines 2024 (```json) … 2160 (```); body 2025–2159.
    const expected = spec.split("\n").slice(2024, 2159).join("\n") + "\n";
    const actual = readFileSync(
      join(here, "../../src/adapters/rfc1/schema.json"),
      "utf8"
    );
    expect(actual).toBe(expected);
  });

  it("Appendix A minimal soul → zero violations", () => {
    expect(validateSchema(minimalSoul())).toEqual([]);
  });

  it("Appendix E: missing voice → one violation at path voice mentioning required", () => {
    const doc = minimalSoul();
    delete doc["voice"];
    const violations = validateSchema(doc);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.path).toBe("voice");
    expect(violations[0]?.message).toMatch(/required/);
    expect(violations[0]?.section).toBe("Appendix E");
    expect(violations[0]?.severity).toBe("error");
  });

  it("Appendix E oneOf filtering: soul errors are not doubled with mixin-branch noise", () => {
    const doc = minimalSoul();
    delete doc["voice"];
    const violations = validateSchema(doc);
    // Unfiltered Ajv output would also include the mixin branch's missing
    // `kind` and the oneOf summary — exactly one violation proves filtering.
    expect(violations).toHaveLength(1);
    expect(violations.some((v) => /kind/.test(v.message))).toBe(false);
  });

  it("Appendix E: kind mixin with only soul_spec+id+kind → zero violations", () => {
    expect(validateSchema(minimalMixin())).toEqual([]);
  });

  it("Appendix E: mixin branch errors reported for kind: mixin documents", () => {
    const violations = validateSchema({ soul_spec: "1.0.0-rc1", kind: "mixin" });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.path).toBe("id");
    expect(violations[0]?.message).toMatch(/required/);
  });

  it("Appendix E: nested instancePath converts /a/b/0 → a.b[0]", () => {
    const doc = minimalSoul();
    (doc["composition"] as Record<string, unknown>)["extends"] = [123];
    const violations = validateSchema(doc);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.path).toBe("composition.extends[0]");
  });

  it("Appendix E: voice.formality out of schema bounds → path voice.formality", () => {
    const doc = minimalSoul();
    (doc["voice"] as Record<string, unknown>)["formality"] = 101;
    const violations = validateSchema(doc);
    expect(violations.some((v) => v.path === "voice.formality")).toBe(true);
  });
});

describe("§25 keyspace layer (validateKeyspace)", () => {
  it("§25 keyspace constants match the normative lists", () => {
    expect(MANDATORY).toContain("soul_spec");
    expect(MANDATORY).toContain("extensions");
    expect(MANDATORY).not.toContain("profile_overrides");
    expect(KNOWN_OPTIONAL).toContain("profile_overrides");
    expect(KNOWN_OPTIONAL).toContain("memory");
    expect(KNOWN_OPTIONAL).toContain("version"); // §6.4 metadata
  });

  it("§25 unknown key strict-rejected", () => {
    const doc = { ...minimalSoul(), favorite_color: "blue" };
    const violations = validateKeyspace(doc, "strict");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      path: "favorite_color",
      message: "unknown top-level key outside RFC-1 keyspace",
      severity: "error",
      section: "§25",
    });
  });

  it("§25 unknown key permissive-warned (never silently dropped)", () => {
    const doc = { ...minimalSoul(), favorite_color: "blue" };
    const violations = validateKeyspace(doc, "permissive");
    expect(violations).toHaveLength(1);
    expect(violations[0]?.severity).toBe("warning");
    expect(violations[0]?.path).toBe("favorite_color");
  });

  it("§25 unimplemented known-optional key (memory) accepted in both modes", () => {
    const doc = { ...minimalSoul(), memory: { retention: "session" } };
    expect(validateKeyspace(doc, "strict")).toEqual([]);
    expect(validateKeyspace(doc, "permissive")).toEqual([]);
    expect(validate(doc, "strict")).toEqual([]);
    expect(validate(doc, "permissive")).toEqual([]);
  });

  it("§25 every known-optional key accepted in strict mode", () => {
    for (const key of KNOWN_OPTIONAL) {
      const doc = { ...minimalSoul(), [key]: {} };
      expect(validateKeyspace(doc, "strict")).toEqual([]);
    }
  });

  it("§25 extensions content is not subject to the keyspace check", () => {
    const doc = { ...minimalSoul(), extensions: { "com.example.anything": { x: 1 } } };
    expect(validate(doc, "strict")).toEqual([]);
  });

  it("§25 mixin without name/locale → no mandatory-key errors", () => {
    expect(validate(minimalMixin(), "strict")).toEqual([]);
  });

  it("§25 keyspace check still applies to mixin documents", () => {
    const doc = { ...minimalMixin(), favorite_color: "blue" };
    const violations = validate(doc, "strict");
    expect(violations).toHaveLength(1);
    expect(violations[0]?.path).toBe("favorite_color");
    expect(violations[0]?.section).toBe("§25");
  });
});

describe("§4.3 scalar typing (validateScalars)", () => {
  it("§4.3 voice.verbosity: 101 → error at path voice.verbosity", () => {
    const doc = minimalSoul();
    (doc["voice"] as Record<string, unknown>)["verbosity"] = 101;
    const violations = validateScalars(doc, "strict");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      path: "voice.verbosity",
      severity: "error",
      section: "§4.3",
    });
  });

  it("§4.3 percent on optional domain Appendix E cannot bound (evaluation.scoring.pass_threshold)", () => {
    const doc = { ...minimalSoul(), evaluation: { scoring: { pass_threshold: 150 } } };
    // The schema only types `evaluation` as object — this is layer 2's job.
    expect(validateSchema(doc)).toEqual([]);
    const violations = validateScalars(doc, "strict");
    expect(violations).toHaveLength(1);
    expect(violations[0]?.path).toBe("evaluation.scoring.pass_threshold");
    expect(violations[0]?.section).toBe("§4.3");
  });

  it("§4.3 percent must be an integer (non-integer rejected)", () => {
    const doc = { ...minimalSoul(), interaction: { ...(minimalSoul()["interaction"] as object), ask_threshold: 49.5 } };
    const violations = validateScalars(doc, "strict");
    expect(violations.some((v) => v.path === "interaction.ask_threshold")).toBe(true);
  });

  it("§4.3 checkPercent helper accepts bounds 0 and 100", () => {
    expect(checkPercent("voice.warmth", 0)).toEqual([]);
    expect(checkPercent("voice.warmth", 100)).toEqual([]);
    expect(checkPercent("voice.warmth", -1)).toHaveLength(1);
    expect(checkPercent("voice.warmth", "50")).toHaveLength(1);
  });

  it("§4.3 checkFloat01 helper enforces 0.0..1.0 inclusive", () => {
    expect(checkFloat01("presentation.tts.stability", 0)).toEqual([]);
    expect(checkFloat01("presentation.tts.stability", 1)).toEqual([]);
    expect(checkFloat01("presentation.tts.stability", 0.5)).toEqual([]);
    const violations = checkFloat01("presentation.tts.stability", 1.5);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      path: "presentation.tts.stability",
      severity: "error",
      section: "§4.3",
    });
  });

  it("§4.3 float01 applied at documented §19 locations", () => {
    const doc = { ...minimalSoul(), presentation: { tts: { expressiveness: 2 } } };
    const violations = validateScalars(doc, "strict");
    expect(violations).toHaveLength(1);
    expect(violations[0]?.path).toBe("presentation.tts.expressiveness");
  });

  it("§21 evaluation.scoring.method enum membership", () => {
    const bad = { ...minimalSoul(), evaluation: { scoring: { method: "vibes" } } };
    const violations = validateScalars(bad, "strict");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      path: "evaluation.scoring.method",
      severity: "error",
      section: "§21",
    });
    for (const method of ["rule_based", "llm_judge", "hybrid"]) {
      const good = { ...minimalSoul(), evaluation: { scoring: { method } } };
      expect(validateScalars(good, "strict")).toEqual([]);
    }
  });
});

describe("§4.3.1 BCP-47 locale", () => {
  it("§4.3.1 valid tags pass in both modes", () => {
    for (const locale of ["en", "en-US", "ru-RU", "zh-Hans-CN", "sr-Latn"]) {
      const doc = { ...minimalSoul(), locale };
      expect(validateScalars(doc, "strict")).toEqual([]);
      expect(validateScalars(doc, "permissive")).toEqual([]);
    }
  });

  it("§4.3.1 locale en_US → strict error", () => {
    const doc = { ...minimalSoul(), locale: "en_US" };
    const violations = validateScalars(doc, "strict");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      path: "locale",
      severity: "error",
      section: "§4.3.1",
    });
  });

  it("§4.3.1 locale en_US → permissive warning citing the normalization en-US", () => {
    const doc = { ...minimalSoul(), locale: "en_US" };
    const violations = validateScalars(doc, "permissive");
    expect(violations).toHaveLength(1);
    expect(violations[0]?.severity).toBe("warning");
    expect(violations[0]?.message).toContain("en-US");
  });

  it("§4.3.1 locale english → error in both modes", () => {
    for (const mode of ["strict", "permissive"] as const) {
      const violations = validateScalars({ ...minimalSoul(), locale: "english" }, mode);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.severity).toBe("error");
      expect(violations[0]?.path).toBe("locale");
    }
  });
});

describe("§9 profile rules (validateProfiles)", () => {
  it('§9 profiles without "default" → error at path profiles', () => {
    const doc = { ...minimalSoul(), profiles: ["concise"] };
    const violations = validateProfiles(doc);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      path: "profiles",
      severity: "error",
      section: "§9",
    });
    expect(violations[0]?.message).toMatch(/default/);
  });

  it("§9 profile_overrides key not in profiles → error at profile_overrides.<key>", () => {
    const doc = {
      ...minimalSoul(),
      profiles: ["default"],
      profile_overrides: { ghost: { voice: { warmth: 10 } } },
    };
    const violations = validateProfiles(doc);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      path: "profile_overrides.ghost",
      severity: "error",
      section: "§9",
    });
  });

  it("§9 profile_overrides keys that are listed in profiles are accepted", () => {
    const doc = {
      ...minimalSoul(),
      profiles: ["default", "concise"],
      profile_overrides: { concise: { voice: { verbosity: 10 } } },
    };
    expect(validateProfiles(doc)).toEqual([]);
  });

  it("§9 profile rules apply only to kind: soul documents", () => {
    const doc = { ...minimalMixin(), profiles: ["concise"] };
    expect(validateProfiles(doc)).toEqual([]);
  });
});

describe("validate() composition (§25, FR-003/004/005/009)", () => {
  it("§25.2 category 2: mandatory core presence — missing required key fails strict", () => {
    for (const key of ["soul_spec", "id", "name", "locale", "safety", "extensions"]) {
      const doc = minimalSoul();
      delete doc[key];
      const violations = validate(doc, "strict");
      expect(violations.some((v) => v.path === key && v.severity === "error")).toBe(true);
    }
  });

  it("§25.2 category 3: type/range checks — percent, float01, enum membership", () => {
    const doc = {
      ...minimalSoul(),
      voice: { formality: 60, warmth: 30, verbosity: 101, jargon: 40, formatting: "minimal" },
      presentation: { tts: { stability: 7 } },
      evaluation: { scoring: { method: "vibes", pass_threshold: 200 } },
    };
    const violations = validate(doc, "strict");
    const paths = violations.map((v) => v.path);
    expect(paths).toContain("voice.verbosity");
    expect(paths).toContain("presentation.tts.stability");
    expect(paths).toContain("evaluation.scoring.method");
    expect(paths).toContain("evaluation.scoring.pass_threshold");
    expect(violations.every((v) => v.severity === "error")).toBe(true);
  });

  it("schema then keyspace: violations from both layers are concatenated", () => {
    const doc = { ...minimalSoul(), favorite_color: "blue" };
    delete doc["voice"];
    const violations = validate(doc, "strict");
    const sections = violations.map((v) => v.section);
    expect(sections).toContain("Appendix E"); // layer 1: missing voice
    expect(sections).toContain("§25"); // layer 2: unknown key
    // Layer 1 violations precede layer 2 violations.
    expect(sections.indexOf("Appendix E")).toBeLessThan(sections.indexOf("§25"));
  });

  it("violations are deduplicated by (path, message)", () => {
    const duplicated: Violation[] = [
      { path: "voice.verbosity", message: "must be <= 100", severity: "error", section: "Appendix E" },
      { path: "voice.verbosity", message: "must be <= 100", severity: "error", section: "Appendix E" },
      { path: "voice.verbosity", message: "different message", severity: "error", section: "§4.3" },
    ];
    expect(dedupeViolations(duplicated)).toHaveLength(2);

    const doc = minimalSoul();
    (doc["voice"] as Record<string, unknown>)["verbosity"] = 101;
    const violations = validate(doc, "strict");
    const keys = violations.map((v) => `${v.path} ${v.message}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every violation has non-empty path, message, and section (NFR-005)", () => {
    const invalidDocs: unknown[] = [
      (() => {
        const d = minimalSoul();
        delete d["voice"];
        return d;
      })(),
      { ...minimalSoul(), favorite_color: "blue", locale: "en_US" },
      { ...minimalSoul(), profiles: ["concise"], profile_overrides: { ghost: {} } },
      { ...minimalSoul(), evaluation: { scoring: { method: "vibes", pass_threshold: -1 } } },
      { ...minimalMixin(), junk_key: 1 },
    ];
    for (const doc of invalidDocs) {
      for (const mode of ["strict", "permissive"] as const) {
        const violations = validate(doc, mode);
        expect(violations.length).toBeGreaterThan(0);
        expectAllWellFormed(violations);
      }
    }
  });

  it("§25 permissive mode never silently drops a problem (downgrades to warning)", () => {
    const doc = { ...minimalSoul(), favorite_color: "blue", locale: "en_US" };
    const strict = validate(doc, "strict");
    const permissive = validate(doc, "permissive");
    expect(strict.every((v) => v.severity === "error")).toBe(true);
    expect(permissive).toHaveLength(strict.length);
    expect(permissive.every((v) => v.severity === "warning")).toBe(true);
  });

  it("Appendix A minimal soul and A.1 metadata variant fully validate in strict mode", () => {
    expect(validate(minimalSoul(), "strict")).toEqual([]);
    const withMetadata = {
      ...minimalSoul(),
      locale: "en-US",
      version: "1.0.0",
      author: "Your Name",
      description: "A minimal neutral agent with balanced settings",
      tags: ["minimal", "neutral", "example"],
      license: "MIT",
      created: "2026-02-11",
      updated: "2026-02-11",
    };
    expect(validate(withMetadata, "strict")).toEqual([]);
  });
});
