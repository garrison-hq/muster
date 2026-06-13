/**
 * Unit tests for src/adapters/skills/validate.ts
 * Covers name rules (FR-003) and description rules (FR-004).
 *
 * WP01 scope: name + description validation only.
 * TODO WP02: optional fields (FR-005), Anthropic profile gate (FR-007)
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

describe("validateStatic — combined valid case", () => {
  it("zero violations for fully conforming document", () => {
    const doc = makeDoc(
      {
        name: "my-skill",
        description: "A well-formed skill description under 1024 chars.",
      },
      "/skills/my-skill"
    );
    const violations = validateStatic(doc, "base");
    expect(violations.filter((v) => v.severity === "error")).toHaveLength(0);
    assertSections(violations);
  });
});
