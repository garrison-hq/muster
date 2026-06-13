/**
 * Unit tests for src/adapters/tools/lint.ts
 *
 * Covers:
 * - T006: acceptance scenario 1 (well-formed.md → ok: true, zero findings)
 * - T006: acceptance scenario 2 (missing-section.md → missing-required-section finding)
 * - T006: duplicate-name edge case (duplicate-tool.md → duplicate-tool-name finding)
 * - T006: canonical-JSON stability (NFR-001)
 * - T006: empty-description edge case
 * - T006: section key normalisation (lower-case, locale-independent)
 */

import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseTOOLSFile,
  lintTOOLSFile,
  toCanonicalJson,
  type TOOLSFile,
} from "../../../src/adapters/tools/lint.js";

// Resolve fixture paths relative to this test file's location.
// This test lives at tests/tools/unit/lint.test.ts
// Fixtures live at tests/tools/fixtures/tools-md/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../fixtures/tools-md");

const wellFormedPath = path.join(fixturesDir, "well-formed.md");
const missingSectionPath = path.join(fixturesDir, "missing-section.md");
const duplicateToolPath = path.join(fixturesDir, "duplicate-tool.md");

describe("parseTOOLSFile + lintTOOLSFile", () => {
  // ---------------------------------------------------------------------------
  // Scenario 1: well-formed.md (FR-003 acceptance)
  // ---------------------------------------------------------------------------
  describe("Scenario 1 — well-formed.md", () => {
    it("parses correctly: two tools, correct names and sections", async () => {
      const parsed = await parseTOOLSFile(wellFormedPath);
      expect(parsed.tools.length).toBe(2);
      expect(parsed.tools[0]!.name).toBe("send_email");
      expect(parsed.tools[1]!.name).toBe("list_files");
    });

    it("parses send_email parameters correctly", async () => {
      const parsed = await parseTOOLSFile(wellFormedPath);
      const sendEmail = parsed.tools[0]!;
      expect(sendEmail.parameters.get("recipient")?.required).toBe(true);
      expect(sendEmail.parameters.get("recipient")?.type).toBe("string");
      expect(sendEmail.parameters.get("subject")?.required).toBe(true);
      expect(sendEmail.parameters.get("body")?.required).toBe(false);
    });

    it("parses list_files parameters correctly", async () => {
      const parsed = await parseTOOLSFile(wellFormedPath);
      const listFiles = parsed.tools[1]!;
      expect(listFiles.parameters.get("directory")?.required).toBe(true);
      expect(listFiles.parameters.get("extension")?.required).toBe(false);
    });

    it("lints to ok: true with zero findings", async () => {
      const parsed = await parseTOOLSFile(wellFormedPath);
      const report = lintTOOLSFile(parsed);
      expect(report.ok).toBe(true);
      expect(report.findings.length).toBe(0);
    });

    it("section keys are lower-case (normalised, locale-independent)", async () => {
      const parsed = await parseTOOLSFile(wellFormedPath);
      // The fixture has '## Overview' and '## Tools' — keys must be normalised
      expect(parsed.sections.has("tools")).toBe(true);
      expect(parsed.sections.has("overview")).toBe(true);
      // Must NOT have Title-cased keys
      expect(parsed.sections.has("Tools")).toBe(false);
      expect(parsed.sections.has("Overview")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: missing-section.md (FR-003 acceptance)
  // ---------------------------------------------------------------------------
  describe("Scenario 2 — missing-section.md", () => {
    it("lints to ok: false", async () => {
      const parsed = await parseTOOLSFile(missingSectionPath);
      const report = lintTOOLSFile(parsed);
      expect(report.ok).toBe(false);
    });

    it("emits missing-required-section finding for 'overview'", async () => {
      const parsed = await parseTOOLSFile(missingSectionPath);
      const report = lintTOOLSFile(parsed);
      const overviewFinding = report.findings.find(
        (f) => f.kind === "missing-required-section" && f.sectionName === "overview"
      );
      expect(overviewFinding).toBeDefined();
    });

    it("every finding carries a non-empty citedRubric (charter invariant)", async () => {
      const parsed = await parseTOOLSFile(missingSectionPath);
      const report = lintTOOLSFile(parsed);
      for (const finding of report.findings) {
        expect(finding.citedRubric).toBeTruthy();
        expect(finding.citedRubric.length).toBeGreaterThan(0);
      }
    });

    it("missing-required-section finding cites muster-rubric:tools/required-sections/v1", async () => {
      const parsed = await parseTOOLSFile(missingSectionPath);
      const report = lintTOOLSFile(parsed);
      const overviewFinding = report.findings.find(
        (f) => f.kind === "missing-required-section" && f.sectionName === "overview"
      );
      expect(overviewFinding?.citedRubric).toBe("muster-rubric:tools/required-sections/v1");
    });
  });

  // ---------------------------------------------------------------------------
  // Edge case: duplicate-tool.md
  // ---------------------------------------------------------------------------
  describe("Edge case — duplicate-tool.md", () => {
    it("lints to ok: false", async () => {
      const parsed = await parseTOOLSFile(duplicateToolPath);
      const report = lintTOOLSFile(parsed);
      expect(report.ok).toBe(false);
    });

    it("emits duplicate-tool-name finding for 'send_email'", async () => {
      const parsed = await parseTOOLSFile(duplicateToolPath);
      const report = lintTOOLSFile(parsed);
      const duplicateFinding = report.findings.find(
        (f) => f.kind === "duplicate-tool-name" && f.toolName === "send_email"
      );
      expect(duplicateFinding).toBeDefined();
    });

    it("duplicate-tool-name finding cites muster-rubric:tools/unique-names/v1", async () => {
      const parsed = await parseTOOLSFile(duplicateToolPath);
      const report = lintTOOLSFile(parsed);
      const duplicateFinding = report.findings.find(
        (f) => f.kind === "duplicate-tool-name" && f.toolName === "send_email"
      );
      expect(duplicateFinding?.citedRubric).toBe("muster-rubric:tools/unique-names/v1");
    });

    it("parser does NOT deduplicate: both send_email entries appear in tools array", async () => {
      const parsed = await parseTOOLSFile(duplicateToolPath);
      const sendEmailTools = parsed.tools.filter((t) => t.name === "send_email");
      expect(sendEmailTools.length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge case: empty description
  // ---------------------------------------------------------------------------
  describe("Edge case — empty-description", () => {
    it("emits empty-description finding for a tool with no description", () => {
      const file: TOOLSFile = {
        path: "/fake/TOOLS.md",
        tools: [
          {
            name: "no_desc_tool",
            description: "",
            parameters: new Map(),
          },
        ],
        sections: new Map([["overview", "x"], ["tools", "y"]]),
      };
      const report = lintTOOLSFile(file);
      const emptyDescFinding = report.findings.find(
        (f) => f.kind === "empty-description" && f.toolName === "no_desc_tool"
      );
      expect(emptyDescFinding).toBeDefined();
    });

    it("empty-description finding cites muster-rubric:tools/non-empty-description/v1", () => {
      const file: TOOLSFile = {
        path: "/fake/TOOLS.md",
        tools: [
          {
            name: "whitespace_tool",
            description: "   ",
            parameters: new Map(),
          },
        ],
        sections: new Map([["overview", "x"], ["tools", "y"]]),
      };
      const report = lintTOOLSFile(file);
      const emptyDescFinding = report.findings.find(
        (f) => f.kind === "empty-description"
      );
      expect(emptyDescFinding?.citedRubric).toBe("muster-rubric:tools/non-empty-description/v1");
    });

    it("whitespace-only description is treated as empty", () => {
      const file: TOOLSFile = {
        path: "/fake/TOOLS.md",
        tools: [
          {
            name: "spaces_only",
            description: "   \t\n  ",
            parameters: new Map(),
          },
        ],
        sections: new Map([["overview", "x"], ["tools", "y"]]),
      };
      const report = lintTOOLSFile(file);
      expect(report.findings.some((f) => f.kind === "empty-description")).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Canonical-JSON stability (NFR-001)
  // ---------------------------------------------------------------------------
  describe("toCanonicalJson — canonical-JSON stability (NFR-001)", () => {
    it("produces identical bytes on repeated calls with the same TOOLSFile", async () => {
      const parsed = await parseTOOLSFile(wellFormedPath);
      const first = toCanonicalJson(parsed);
      const second = toCanonicalJson(parsed);
      expect(first).toBe(second);
    });

    it("produces valid JSON string", async () => {
      const parsed = await parseTOOLSFile(wellFormedPath);
      const json = toCanonicalJson(parsed);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("round-trips: parsed data survives serialisation", async () => {
      const parsed = await parseTOOLSFile(wellFormedPath);
      const json = toCanonicalJson(parsed);
      const plain = JSON.parse(json) as {
        path: string;
        tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
        sections: Record<string, string>;
      };
      expect(plain.tools.length).toBe(2);
      expect(plain.tools[0]!.name).toBe("send_email");
      expect(plain.sections["tools"]).toBeDefined();
      expect(plain.sections["overview"]).toBeDefined();
    });

    it("byte-stable output: Buffer comparison confirms identical bytes", async () => {
      const parsed = await parseTOOLSFile(wellFormedPath);
      const first = toCanonicalJson(parsed);
      const second = toCanonicalJson(parsed);
      const buf1 = Buffer.from(first, "utf8");
      const buf2 = Buffer.from(second, "utf8");
      expect(buf1.equals(buf2)).toBe(true);
    });
  });
});
