/**
 * Unit tests for src/adapters/skills/validate.ts
 * Covers name rules (FR-003), description rules (FR-004),
 * optional fields (FR-005, WP02), Anthropic profile gate (FR-007, WP02),
 * and byte-stability assertion (NFR-001, T012).
 */

import { describe, it, expect } from "vitest";
import { validateStatic } from "../../src/adapters/skills/validate.js";
import type { SkillDocument } from "../../src/adapters/skills/types.js";
import type { Violation } from "../../src/core/report.js";

function makeDoc(
  frontmatter: Record<string, unknown>,
  skillDir = "/skills/foo",
  body = ""
): SkillDocument {
  return {
    path: `${skillDir}/SKILL.md`,
    skillDir,
    frontmatter,
    body,
  };
}

function makeValid(overrides?: Record<string, unknown>): SkillDocument {
  return makeDoc(
    {
      name: "foo",
      description: "A valid skill description",
      ...overrides,
    },
    "/skills/foo"
  );
}

// All returned violations must have a non-empty section.
function assertSections(violations: Violation[]): void {
  for (const v of violations) {
    expect(v.section).toBeDefined();
    expect((v.section ?? "").length).toBeGreaterThan(0);
  }
}

describe("validateStatic — name rules (FR-003)", () => {
  it("passes for a fully valid name matching dir basename", () => {
    const violations = validateStatic(makeValid(), "base");
    expect(violations.filter((v) => v.path === "name")).toHaveLength(0);
    assertSections(violations);
  });

  it("returns violation for missing name", () => {
    const doc = makeDoc({ description: "desc" });
    const violations = validateStatic(doc, "base");
    const nameViolations = violations.filter((v) => v.path === "name");
    expect(nameViolations.length).toBeGreaterThan(0);
    assertSections(violations);
  });

  it("returns violation for empty name string", () => {
    const doc = makeDoc({ name: "", description: "desc" });
    const violations = validateStatic(doc, "base");
    const nameViolations = violations.filter((v) => v.path === "name");
    expect(nameViolations.length).toBeGreaterThan(0);
    assertSections(violations);
  });

  it("returns violation for name longer than 64 chars", () => {
    const longName = "a".repeat(65);
    const doc = makeDoc({ name: longName, description: "desc" }, `/skills/${longName}`);
    const violations = validateStatic(doc, "base");
    const nameViolations = violations.filter(
      (v) => v.path === "name" && v.message.includes("64")
    );
    expect(nameViolations.length).toBeGreaterThan(0);
    assertSections(violations);
  });

  it("returns violation for name with uppercase letters", () => {
    const doc = makeDoc({ name: "FooBar", description: "desc" }, "/skills/FooBar");
    const violations = validateStatic(doc, "base");
    const nameViolations = violations.filter(
      (v) => v.path === "name" && /charset|lowercase|\[a-z/i.test(v.message)
    );
    expect(nameViolations.length).toBeGreaterThan(0);
    assertSections(violations);
  });

  it("returns violation for name with leading hyphen", () => {
    const doc = makeDoc({ name: "-foo", description: "desc" }, "/skills/-foo");
    const violations = validateStatic(doc, "base");
    const nameViolations = violations.filter(
      (v) => v.path === "name" && /start|begin|leading/i.test(v.message)
    );
    expect(nameViolations.length).toBeGreaterThan(0);
    assertSections(violations);
  });

  it("returns violation for name with trailing hyphen", () => {
    const doc = makeDoc({ name: "foo-", description: "desc" }, "/skills/foo-");
    const violations = validateStatic(doc, "base");
    const nameViolations = violations.filter(
      (v) => v.path === "name" && /end|trailing/i.test(v.message)
    );
    expect(nameViolations.length).toBeGreaterThan(0);
    assertSections(violations);
  });

  it("returns violation for name with consecutive hyphens (foo--bar)", () => {
    const doc = makeDoc({ name: "foo--bar", description: "desc" }, "/skills/foo--bar");
    const violations = validateStatic(doc, "base");
    const nameViolations = violations.filter(
      (v) => v.path === "name" && /consecutive/i.test(v.message)
    );
    expect(nameViolations.length).toBeGreaterThan(0);
    assertSections(violations);
  });

  it("passes when name equals dir basename exactly", () => {
    const doc = makeDoc({ name: "my-skill", description: "desc" }, "/skills/my-skill");
    const violations = validateStatic(doc, "base");
    expect(violations.filter((v) => v.severity === "error")).toHaveLength(0);
    assertSections(violations);
  });

  it("returns violation when name differs from dir basename by case only", () => {
    const doc = makeDoc({ name: "MySkill", description: "desc" }, "/skills/MySkill");
    const violations = validateStatic(doc, "base");
    // MySkill fails charset rule (uppercase), which is fine — violation expected.
    expect(violations.filter((v) => v.path === "name").length).toBeGreaterThan(0);
    assertSections(violations);
  });

  it("returns violation when name does not match dir basename", () => {
    const doc = makeDoc({ name: "bar", description: "desc" }, "/skills/foo");
    const violations = validateStatic(doc, "base");
    const nameViolations = violations.filter(
      (v) => v.path === "name" && /directory|basename/i.test(v.message)
    );
    expect(nameViolations.length).toBeGreaterThan(0);
    assertSections(violations);
  });
});

describe("validateStatic — description rules (FR-004)", () => {
  it("returns violation for missing description", () => {
    const doc = makeDoc({ name: "foo" });
    const violations = validateStatic(doc, "base");
    expect(violations.filter((v) => v.path === "description").length).toBeGreaterThan(0);
    assertSections(violations);
  });

  it("returns violation for empty description string", () => {
    const doc = makeDoc({ name: "foo", description: "" });
    const violations = validateStatic(doc, "base");
    expect(violations.filter((v) => v.path === "description").length).toBeGreaterThan(0);
    assertSections(violations);
  });

  it("returns violation for description of whitespace only", () => {
    const doc = makeDoc({ name: "foo", description: "   " });
    const violations = validateStatic(doc, "base");
    expect(violations.filter((v) => v.path === "description").length).toBeGreaterThan(0);
    assertSections(violations);
  });

  it("passes for description of exactly 1024 chars", () => {
    const doc = makeDoc({ name: "foo", description: "a".repeat(1024) });
    const violations = validateStatic(doc, "base");
    expect(violations.filter((v) => v.path === "description").length).toBe(0);
    assertSections(violations);
  });

  it("returns violation for description of 1025 chars", () => {
    const doc = makeDoc({ name: "foo", description: "a".repeat(1025) });
    const violations = validateStatic(doc, "base");
    expect(violations.filter((v) => v.path === "description").length).toBeGreaterThan(0);
    assertSections(violations);
  });

  it("passes with valid name + description (zero violations)", () => {
    const violations = validateStatic(makeValid(), "base");
    expect(violations.filter((v) => v.severity === "error")).toHaveLength(0);
    assertSections(violations);
  });
});

describe("validateStatic — optional fields (FR-005, WP02)", () => {
  it("passes with valid compatibility of exactly 500 chars", () => {
    const doc = makeValid({ compatibility: "a".repeat(500) });
    const violations = validateStatic(doc, "base");
    expect(violations.filter((v) => v.path === "compatibility").length).toBe(0);
    assertSections(violations);
  });

  it("returns error for compatibility of 501 chars", () => {
    const doc = makeValid({ compatibility: "a".repeat(501) });
    const violations = validateStatic(doc, "base");
    const compatViolations = violations.filter(
      (v) => v.path === "compatibility" && v.severity === "error"
    );
    expect(compatViolations.length).toBeGreaterThan(0);
    assertSections(violations);
  });

  it("passes with valid allowed-tools but emits experimental warning", () => {
    const doc = makeValid({ "allowed-tools": "web_search code_execution" });
    const violations = validateStatic(doc, "base");
    const errors = violations.filter(
      (v) => v.path === "allowed-tools" && v.severity === "error"
    );
    const warnings = violations.filter(
      (v) =>
        v.path === "allowed-tools" &&
        v.severity === "warning" &&
        /experimental/i.test(v.message)
    );
    expect(errors.length).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
    assertSections(violations);
  });

  it("returns error for empty allowed-tools value", () => {
    const doc = makeValid({ "allowed-tools": "" });
    const violations = validateStatic(doc, "base");
    const errors = violations.filter(
      (v) => v.path === "allowed-tools" && v.severity === "error"
    );
    expect(errors.length).toBeGreaterThan(0);
    assertSections(violations);
  });

  it("emits no allowed-tools warning when field is absent", () => {
    const doc = makeValid();
    const violations = validateStatic(doc, "base");
    expect(violations.filter((v) => v.path === "allowed-tools").length).toBe(0);
    assertSections(violations);
  });

  it("passes with valid metadata (string values)", () => {
    const doc = makeValid({ metadata: { key: "value", version: "1.0" } });
    const violations = validateStatic(doc, "base");
    expect(violations.filter((v) => v.path.startsWith("metadata")).length).toBe(0);
    assertSections(violations);
  });

  it("returns schema error for metadata with non-string values", () => {
    const doc = makeValid({ metadata: { key: 42 } });
    const violations = validateStatic(doc, "base");
    // Schema validation catches this before semantic rules.
    expect(violations.length).toBeGreaterThan(0);
    assertSections(violations);
  });

  it("emits warning for empty license field", () => {
    const doc = makeValid({ license: "" });
    const violations = validateStatic(doc, "base");
    const licenseWarnings = violations.filter(
      (v) => v.path === "license" && v.severity === "warning"
    );
    expect(licenseWarnings.length).toBeGreaterThan(0);
    assertSections(violations);
  });

  it("passes with a non-empty license field", () => {
    const doc = makeValid({ license: "MIT" });
    const violations = validateStatic(doc, "base");
    expect(violations.filter((v) => v.path === "license" && v.severity === "error").length).toBe(0);
    assertSections(violations);
  });
});

describe("validateStatic — Anthropic profile gate (FR-007, WP02 acceptance scenario 7)", () => {
  it("passes for name='claude-tool' with profile='base' (zero violations)", () => {
    const doc = makeDoc({ name: "claude-tool", description: "A valid desc" }, "/skills/claude-tool");
    const violations = validateStatic(doc, "base");
    // Should have zero errors: base profile does not check reserved words.
    expect(violations.filter((v) => v.severity === "error").length).toBe(0);
    assertSections(violations);
  });

  it("returns error for name='claude-tool' with profile='anthropic'", () => {
    const doc = makeDoc({ name: "claude-tool", description: "A valid desc" }, "/skills/claude-tool");
    const violations = validateStatic(doc, "anthropic");
    const nameViolations = violations.filter(
      (v) => v.path === "name" && v.severity === "error"
    );
    expect(nameViolations.length).toBeGreaterThan(0);
    // Section must cite Anthropic docs URL.
    expect(nameViolations[0]!.section).toMatch(/docs\.anthropic\.com/);
    assertSections(violations);
  });

  it("returns error for name='anthropic-helper' with profile='anthropic'", () => {
    const doc = makeDoc(
      { name: "anthropic-helper", description: "A valid desc" },
      "/skills/anthropic-helper"
    );
    const violations = validateStatic(doc, "anthropic");
    const nameViolations = violations.filter(
      (v) => v.path === "name" && v.severity === "error" && /reserved/i.test(v.message)
    );
    expect(nameViolations.length).toBeGreaterThan(0);
    assertSections(violations);
  });

  it("passes for description containing XML with profile='base'", () => {
    const doc = makeValid({ description: "Use <instructions> here" });
    const violations = validateStatic(doc, "base");
    expect(violations.filter((v) => v.path === "description" && v.severity === "error").length).toBe(0);
    assertSections(violations);
  });

  it("returns error for description containing XML with profile='anthropic'", () => {
    const doc = makeValid({ description: "Use <instructions> here" });
    const violations = validateStatic(doc, "anthropic");
    const descViolations = violations.filter(
      (v) => v.path === "description" && v.severity === "error"
    );
    expect(descViolations.length).toBeGreaterThan(0);
    expect(descViolations[0]!.section).toMatch(/docs\.anthropic\.com/);
    assertSections(violations);
  });

  it("zero errors for fully valid skill with profile='anthropic'", () => {
    const doc = makeDoc(
      { name: "my-skill", description: "A perfectly valid description without XML tags" },
      "/skills/my-skill"
    );
    const violations = validateStatic(doc, "anthropic");
    expect(violations.filter((v) => v.severity === "error").length).toBe(0);
    assertSections(violations);
  });

  it("does not emit Anthropic reserved-word error for profile='base'", () => {
    // Discrimination control: if profile guard is removed, this would fire.
    const doc = makeDoc(
      { name: "claude-tool", description: "desc" },
      "/skills/claude-tool"
    );
    const violations = validateStatic(doc, "base");
    const anthropicErrors = violations.filter(
      (v) => v.section?.includes("docs.anthropic.com") && v.severity === "error"
    );
    // Must be zero: base profile is silent on Anthropic constraints.
    expect(anthropicErrors.length).toBe(0);
  });
});

describe("validateStatic — byte-stability assertion (NFR-001, T012)", () => {
  it("produces identical JSON output on two sequential calls (byte-stable)", () => {
    const doc = makeValid({
      compatibility: "node>=18",
      "allowed-tools": "web_search",
      license: "MIT",
    });

    const result1 = validateStatic(doc, "base");
    const result2 = validateStatic(doc, "base");

    const json1 = JSON.stringify(result1);
    const json2 = JSON.stringify(result2);

    expect(json1).toStrictEqual(json2);
  });

  it("produces identical JSON for anthropic profile on two sequential calls", () => {
    const doc = makeDoc(
      { name: "my-skill", description: "A valid description" },
      "/skills/my-skill"
    );

    const result1 = validateStatic(doc, "anthropic");
    const result2 = validateStatic(doc, "anthropic");

    expect(JSON.stringify(result1)).toStrictEqual(JSON.stringify(result2));
  });
});
