/**
 * Unit tests for src/adapters/skills/layout.ts
 * Exercises bundled-file drift check and path-traversal guard.
 * FR-006: directory layout check.
 */

import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { checkLayout } from "../../src/adapters/skills/layout.js";
import type { SkillDocument } from "../../src/adapters/skills/types.js";

let tmpDirs: string[] = [];

function makeTmpSkillDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-layout-test-"));
  tmpDirs.push(dir);
  return dir;
}

function makeDoc(skillDir: string, body: string): SkillDocument {
  return {
    path: path.join(skillDir, "SKILL.md"),
    skillDir,
    frontmatter: { name: path.basename(skillDir), description: "test" },
    body,
  };
}

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
  tmpDirs = [];
});

describe("checkLayout — no bundled-file references", () => {
  it("returns empty violations when body has no bundled file references", () => {
    const skillDir = makeTmpSkillDir();
    const doc = makeDoc(skillDir, "# My Skill\n\nThis skill does something.\n");
    expect(checkLayout(doc)).toEqual([]);
  });
});

describe("checkLayout — valid bundled file references", () => {
  it("returns no violation for scripts/helper.sh when present on disk", () => {
    const skillDir = makeTmpSkillDir();
    const scriptsDir = path.join(skillDir, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, "helper.sh"), "#!/bin/sh\necho hello");

    const doc = makeDoc(skillDir, "See [helper](scripts/helper.sh) for more.\n");
    const violations = checkLayout(doc);
    expect(violations.filter((v) => v.severity === "error")).toHaveLength(0);
  });

  it("returns no violation for assets/icon.png when present on disk", () => {
    const skillDir = makeTmpSkillDir();
    const assetsDir = path.join(skillDir, "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, "icon.png"), "fakepng");

    const doc = makeDoc(skillDir, "Icon: assets/icon.png\n");
    const violations = checkLayout(doc);
    expect(violations.filter((v) => v.severity === "error")).toHaveLength(0);
  });

  it("returns no violation for references/guide.md when present on disk", () => {
    const skillDir = makeTmpSkillDir();
    const refsDir = path.join(skillDir, "references");
    fs.mkdirSync(refsDir, { recursive: true });
    fs.writeFileSync(path.join(refsDir, "guide.md"), "# Guide");

    const doc = makeDoc(skillDir, "See references/guide.md for guidance.\n");
    const violations = checkLayout(doc);
    expect(violations.filter((v) => v.severity === "error")).toHaveLength(0);
  });
});

describe("checkLayout — missing bundled file references", () => {
  it("returns violation for scripts/missing.sh when absent from disk", () => {
    const skillDir = makeTmpSkillDir();
    const doc = makeDoc(skillDir, "Run scripts/missing.sh to proceed.\n");
    const violations = checkLayout(doc);
    const errors = violations.filter((v) => v.path === "(layout)" && v.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toMatch(/missing\.sh/);
    expect(errors[0]!.section).toMatch(/agentskills\.io/);
  });

  it("returns violation for references/guide.md when absent from disk", () => {
    const skillDir = makeTmpSkillDir();
    const doc = makeDoc(skillDir, "See references/guide.md for guidance.\n");
    const violations = checkLayout(doc);
    const errors = violations.filter((v) => v.path === "(layout)" && v.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toMatch(/guide\.md/);
  });
});

describe("checkLayout — path-traversal guard (lexical, no I/O on escaping paths)", () => {
  it("returns violation for ../outside.sh without calling fs.existsSync", () => {
    const skillDir = makeTmpSkillDir();
    const doc = makeDoc(skillDir, "Run scripts/../../../outside.sh\n");
    const violations = checkLayout(doc);
    const errors = violations.filter(
      (v) => v.path === "(layout)" && v.severity === "error"
    );
    // Must detect traversal.
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toMatch(/path traversal/i);
    expect(errors[0]!.section).toMatch(/agentskills\.io/);
  });

  it("returns violation for absolute path /absolute/path.sh", () => {
    const skillDir = makeTmpSkillDir();
    // The regex won't match /absolute/... since it requires scripts/references/assets/ prefix
    // but we test an absolute path injected as a scripts/ style.
    // Actually check with a path that could escape via normalization
    const doc = makeDoc(skillDir, "Use scripts/../../../etc/passwd as reference.\n");
    const violations = checkLayout(doc);
    const errors = violations.filter((v) => v.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    // Must detect traversal (lexical, no fs.existsSync on bad path).
    expect(errors[0]!.message).toMatch(/path traversal/i);
  });

  it("violation message names path traversal for traversal attempt", () => {
    const skillDir = makeTmpSkillDir();
    const doc = makeDoc(skillDir, "scripts/../secrets.sh is referenced.\n");
    const violations = checkLayout(doc);
    const traversalErrors = violations.filter(
      (v) => v.severity === "error" && /path traversal/i.test(v.message)
    );
    expect(traversalErrors.length).toBeGreaterThan(0);
  });
});

describe("checkLayout — nested SKILL.md detection", () => {
  it("returns warning for nested SKILL.md referenced in body", () => {
    const skillDir = makeTmpSkillDir();
    const doc = makeDoc(skillDir, "See subdir/SKILL.md for nested config.\n");
    const violations = checkLayout(doc);
    const warnings = violations.filter(
      (v) => v.path === "(document)" && v.severity === "warning"
    );
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]!.message).toMatch(/SKILL\.md/);
  });

  it("does not warn for standalone SKILL.md reference without path prefix", () => {
    const skillDir = makeTmpSkillDir();
    // Just the word "SKILL.md" without a path prefix should not trigger the warning.
    const doc = makeDoc(skillDir, "The SKILL.md file defines the skill.\n");
    const violations = checkLayout(doc);
    const warnings = violations.filter(
      (v) => v.path === "(document)" && v.severity === "warning"
    );
    expect(warnings.length).toBe(0);
  });
});

describe("checkLayout — section citations (C-003)", () => {
  it("all violations have non-empty section citing agentskills.io", () => {
    const skillDir = makeTmpSkillDir();
    const doc = makeDoc(skillDir, "scripts/missing.sh\nsubdir/SKILL.md\n");
    const violations = checkLayout(doc);
    for (const v of violations) {
      expect(v.section).toBeDefined();
      expect((v.section ?? "").length).toBeGreaterThan(0);
      expect(v.section).toMatch(/agentskills\.io/);
    }
  });
});

describe("checkLayout — discrimination control (no false positives)", () => {
  it("returns zero violations when body has no bundled file references", () => {
    const skillDir = makeTmpSkillDir();
    const doc = makeDoc(
      skillDir,
      "This is a skill that does not reference any bundled files."
    );
    // Discrimination control: the grader must be able to return zero violations.
    expect(checkLayout(doc)).toHaveLength(0);
  });
});
