/**
 * Unit tests for src/adapters/skills/frontmatter.ts
 * Exercises all edge cases for SKILL.md frontmatter extraction.
 * FR-002: parse edge cases (absent, BOM, unterminated, empty block).
 */

import { describe, it, expect } from "vitest";
import { extractFrontmatter } from "../../src/adapters/skills/frontmatter.js";
import type { SkillDocument, SkillStaticCheck } from "../../src/adapters/skills/types.js";

const SKILL_MD_PATH = "/skills/foo/SKILL.md";
const SKILL_DIR = "/skills/foo";

function isDoc(result: SkillDocument | SkillStaticCheck): result is SkillDocument {
  return "frontmatter" in result && "skillDir" in result;
}

function isError(result: SkillDocument | SkillStaticCheck): result is SkillStaticCheck {
  return "severity" in result;
}

describe("extractFrontmatter", () => {
  it("returns a SkillDocument for valid minimal frontmatter", () => {
    const content = `---\nname: foo\ndescription: A test skill\n---\nBody here\n`;
    const result = extractFrontmatter(content, SKILL_MD_PATH, SKILL_DIR);
    expect(isDoc(result)).toBe(true);
    if (isDoc(result)) {
      expect(result.path).toBe(SKILL_MD_PATH);
      expect(result.skillDir).toBe(SKILL_DIR);
      expect((result.frontmatter as Record<string, unknown>)["name"]).toBe("foo");
      expect((result.frontmatter as Record<string, unknown>)["description"]).toBe("A test skill");
    }
  });

  it("returns an error when frontmatter is absent (file starts with prose)", () => {
    const content = `This is a skill description without frontmatter.\n`;
    const result = extractFrontmatter(content, SKILL_MD_PATH, SKILL_DIR);
    expect(isError(result)).toBe(true);
    if (isError(result)) {
      expect(result.severity).toBe("error");
      expect(result.path).toBe("(document)");
      expect(result.message).toMatch(/frontmatter must be the first content/i);
    }
  });

  it("returns an error when there is a leading blank line before ---", () => {
    const content = `\n---\nname: foo\ndescription: A test skill\n---\n`;
    const result = extractFrontmatter(content, SKILL_MD_PATH, SKILL_DIR);
    expect(isError(result)).toBe(true);
    if (isError(result)) {
      expect(result.severity).toBe("error");
      expect(result.path).toBe("(document)");
    }
  });

  it("returns an error when frontmatter is unterminated (no closing ---)", () => {
    const content = `---\nname: foo\ndescription: A test skill\n`;
    const result = extractFrontmatter(content, SKILL_MD_PATH, SKILL_DIR);
    expect(isError(result)).toBe(true);
    if (isError(result)) {
      expect(result.severity).toBe("error");
      expect(result.path).toBe("(document)");
      expect(result.message).toMatch(/unterminated/i);
    }
  });

  it("strips a leading UTF-8 BOM and returns a valid SkillDocument", () => {
    const BOM = "﻿";
    const content = `${BOM}---\nname: foo\ndescription: A test skill\n---\nBody\n`;
    const result = extractFrontmatter(content, SKILL_MD_PATH, SKILL_DIR);
    expect(isDoc(result)).toBe(true);
    if (isDoc(result)) {
      expect((result.frontmatter as Record<string, unknown>)["name"]).toBe("foo");
    }
  });

  it("returns a SkillDocument with frontmatter: {} for an empty frontmatter block", () => {
    const content = `---\n---\nBody after empty frontmatter\n`;
    const result = extractFrontmatter(content, SKILL_MD_PATH, SKILL_DIR);
    expect(isDoc(result)).toBe(true);
    if (isDoc(result)) {
      expect(result.frontmatter).toEqual({});
    }
  });

  it("sets body to everything after the closing ---", () => {
    const content = `---\nname: foo\ndescription: A test skill\n---\nThis is the body.\n`;
    const result = extractFrontmatter(content, SKILL_MD_PATH, SKILL_DIR);
    expect(isDoc(result)).toBe(true);
    if (isDoc(result)) {
      expect(result.body).toContain("This is the body.");
    }
  });

  it("handles frontmatter with no body", () => {
    const content = `---\nname: foo\ndescription: A test skill\n---`;
    const result = extractFrontmatter(content, SKILL_MD_PATH, SKILL_DIR);
    expect(isDoc(result)).toBe(true);
    if (isDoc(result)) {
      expect(result.body).toBe("");
    }
  });
});
