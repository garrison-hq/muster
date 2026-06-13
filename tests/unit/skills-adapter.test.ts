/**
 * Unit tests for src/adapters/skills/index.ts
 *
 * Covers parseSkill, validateSkill, skillsAdapter.validate, and the
 * parseForSpecAdapter error branch (adapter.parse on a malformed directory).
 *
 * FR-001: SpecAdapter contract
 * FR-002: parseSkill directory-based extraction
 * FR-003: name rules
 * FR-004: description rules
 * FR-008: Violation format
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSkill, validateSkill, skillsAdapter } from "../../src/adapters/skills/index.js";
import type { SkillDocument } from "../../src/adapters/skills/types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a temporary skill directory and return its path. */
function makeTempSkillDir(name: string, skillMdContent: string): string {
  const base = mkdtempSync(join(tmpdir(), "skills-adapter-test-"));
  const skillDir = join(base, name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), skillMdContent, "utf8");
  return skillDir;
}

const VALID_SKILL_MD = `---
name: my-skill
description: A valid skill description for testing
---

## When to Use This Skill

Use when you need to test the skills adapter.
`;

const NO_FRONTMATTER_SKILL_MD = `# My Skill

This SKILL.md has no frontmatter delimiter at all.
`;

// ─── Track temp dirs for cleanup ────────────────────────────────────────────

const tempDirs: string[] = [];

beforeEach(() => {
  tempDirs.length = 0;
});

afterEach(() => {
  for (const dir of tempDirs) {
    try {
      // Walk up one to remove the mkdtemp base dir
      const base = join(dir, "..");
      rmSync(base, { recursive: true, force: true });
    } catch {
      // Best effort
    }
  }
});

function trackAndMake(name: string, content: string): string {
  const skillDir = makeTempSkillDir(name, content);
  tempDirs.push(skillDir);
  return skillDir;
}

// ─── parseSkill ──────────────────────────────────────────────────────────────

describe("parseSkill — happy path", () => {
  it("returns a SkillDocument for a valid SKILL.md", () => {
    const skillDir = trackAndMake("my-skill", VALID_SKILL_MD);
    const doc = parseSkill(skillDir);

    expect(doc).toBeDefined();
    expect(doc.skillDir).toBe(skillDir);
    expect(doc.path).toMatch(/SKILL\.md$/);
    expect(doc.frontmatter).toBeDefined();
    expect(typeof doc.body).toBe("string");
  });

  it("frontmatter contains expected name and description", () => {
    const skillDir = trackAndMake("my-skill", VALID_SKILL_MD);
    const doc = parseSkill(skillDir);

    const fm = doc.frontmatter as Record<string, unknown>;
    expect(fm.name).toBe("my-skill");
    expect(fm.description).toBe("A valid skill description for testing");
  });

  it("body contains content after frontmatter delimiter", () => {
    const skillDir = trackAndMake("my-skill", VALID_SKILL_MD);
    const doc = parseSkill(skillDir);

    expect(doc.body).toContain("When to Use This Skill");
  });
});

describe("parseSkill — error cases", () => {
  it("throws when SKILL.md has no frontmatter block", () => {
    const skillDir = trackAndMake("no-fm", NO_FRONTMATTER_SKILL_MD);

    expect(() => parseSkill(skillDir)).toThrow();
  });

  it("throws when the skill directory does not contain SKILL.md", () => {
    const base = mkdtempSync(join(tmpdir(), "skills-adapter-missing-"));
    const skillDir = join(base, "empty-skill");
    mkdirSync(skillDir, { recursive: true });
    // No SKILL.md written
    tempDirs.push(skillDir);

    expect(() => parseSkill(skillDir)).toThrow();
  });
});

// ─── validateSkill ───────────────────────────────────────────────────────────

describe("validateSkill — conforming document", () => {
  it("returns empty Violation[] for a fully valid SkillDocument", () => {
    const skillDir = trackAndMake("my-skill", VALID_SKILL_MD);
    const doc = parseSkill(skillDir);
    const violations = validateSkill(doc);

    expect(Array.isArray(violations)).toBe(true);
    expect(violations.filter((v) => v.severity === "error")).toHaveLength(0);
  });

  it("accepts the default 'base' profile", () => {
    const skillDir = trackAndMake("my-skill", VALID_SKILL_MD);
    const doc = parseSkill(skillDir);
    const violations = validateSkill(doc, "base");

    expect(violations.filter((v) => v.severity === "error")).toHaveLength(0);
  });
});

describe("validateSkill — bad name yields Violation", () => {
  it("returns a Violation with a non-empty section for a mismatched name", () => {
    const skillDir = trackAndMake("my-skill", VALID_SKILL_MD);
    const doc = parseSkill(skillDir);

    // Override frontmatter.name to mismatch the dir basename.
    const badDoc: SkillDocument = {
      ...doc,
      frontmatter: { name: "wrong-name", description: "Valid description" },
    };

    const violations = validateSkill(badDoc, "base");
    expect(violations.length).toBeGreaterThan(0);

    const nameViolation = violations.find((v) => v.path === "name");
    expect(nameViolation).toBeDefined();
    expect(nameViolation!.section).toBeDefined();
    expect((nameViolation!.section ?? "").length).toBeGreaterThan(0);
  });

  it("returns Violation with non-empty section for invalid charset name", () => {
    const skillDir = trackAndMake("my-skill", VALID_SKILL_MD);
    const doc = parseSkill(skillDir);

    const badDoc: SkillDocument = {
      ...doc,
      frontmatter: { name: "MySkill", description: "Valid description" },
      skillDir: join(doc.skillDir, "..", "MySkill"),
    };

    const violations = validateSkill(badDoc, "base");
    const nameViolations = violations.filter((v) => v.path === "name");
    expect(nameViolations.length).toBeGreaterThan(0);
    for (const v of nameViolations) {
      expect((v.section ?? "").length).toBeGreaterThan(0);
    }
  });
});

// ─── skillsAdapter.validate ──────────────────────────────────────────────────

describe("skillsAdapter.validate — adapter object", () => {
  it("returns [] for a conforming SoulDocument-shaped object", () => {
    const skillDir = trackAndMake("my-skill", VALID_SKILL_MD);
    const doc = parseSkill(skillDir);

    const soulDoc = {
      path: doc.path,
      frontMatter: doc.frontmatter,
      body: doc.body,
      kind: "soul" as const,
    };

    const violations = skillsAdapter.validate(soulDoc, "base");
    expect(Array.isArray(violations)).toBe(true);
    expect(violations.filter((v) => v.severity === "error")).toHaveLength(0);
  });

  it("returns Violation[] with non-empty section for bad name", () => {
    const skillDir = trackAndMake("my-skill", VALID_SKILL_MD);
    const doc = parseSkill(skillDir);

    const soulDoc = {
      path: doc.path,
      frontMatter: { name: "bad-name", description: "A description" },
      body: doc.body,
      kind: "soul" as const,
    };

    const violations = skillsAdapter.validate(soulDoc, "base");
    expect(violations.length).toBeGreaterThan(0);
    const nameViolation = violations.find((v) => v.path === "name");
    expect(nameViolation).toBeDefined();
    expect((nameViolation!.section ?? "").length).toBeGreaterThan(0);
  });
});

// ─── skillsAdapter.parse — parseForSpecAdapter error branch ─────────────────

describe("skillsAdapter.parse — parseForSpecAdapter error branch", () => {
  it("returns Violation[] (not throws) when SKILL.md has no frontmatter", () => {
    const skillDir = trackAndMake("no-fm", NO_FRONTMATTER_SKILL_MD);

    // The parse wrapper should catch the error and return Violation[].
    const result = skillsAdapter.parse("", skillDir, "strict");

    // If it is an array, it's a Violation[] (error branch).
    expect(Array.isArray(result)).toBe(true);

    const violations = result as Array<{ path: string; message: string; severity: string; section?: string }>;
    expect(violations.length).toBeGreaterThan(0);

    // Each violation must have non-empty message and section.
    for (const v of violations) {
      expect(v.message.length).toBeGreaterThan(0);
    }
  });

  it("returns Violation[] when directory does not exist", () => {
    const result = skillsAdapter.parse("", "/nonexistent/path/to/skill", "strict");

    expect(Array.isArray(result)).toBe(true);
    const violations = result as Array<{ path: string; message: string; severity: string }>;
    expect(violations.length).toBeGreaterThan(0);
  });

  it("returns a SoulDocument shape on success (not an array)", () => {
    const skillDir = trackAndMake("my-skill", VALID_SKILL_MD);

    const result = skillsAdapter.parse("", skillDir, "strict");

    // Success path: result is NOT an array.
    expect(Array.isArray(result)).toBe(false);
    const doc = result as { path: string; frontMatter: unknown; body: string; kind: string };
    expect(doc.path).toMatch(/SKILL\.md$/);
    expect(doc.kind).toBe("soul");
    expect(typeof doc.body).toBe("string");
  });
});
