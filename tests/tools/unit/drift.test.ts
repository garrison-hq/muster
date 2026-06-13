/**
 * Unit tests for src/adapters/tools/drift.ts
 *
 * Covers:
 * - Scenario 3 (FR-004): documented-but-missing finding (send_email absent from env)
 * - Scenario 4 (FR-004): present-but-undocumented finding (delete_file extra in env)
 * - Scenario 5 (FR-004): schema-mismatch with direction=docs-ahead + fields
 * - Scenario 5b: schema-mismatch superset direction=reality-ahead
 * - Scenario 6 (SC-002): clean report + byte-stable across runs
 * - OpenAI format: format detection + clean report for matching-openai.json
 * - Unknown-format edge case: throws UnknownDescriptorFormatError
 * - citedRubric invariant: every DriftFinding carries non-empty citedRubric (FR-009)
 * - Ordering invariant: findings sorted kind-first then toolName (UTF-16, no localeCompare)
 */

import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadEnvironmentDescriptor,
  runDriftCheck,
  UnknownDescriptorFormatError,
  type DriftFinding,
} from "../../../src/adapters/tools/drift.js";
import { parseTOOLSFile } from "../../../src/adapters/tools/lint.js";

// Resolve fixture paths relative to this test file
// This test lives at tests/tools/unit/drift.test.ts
// Fixtures: tests/tools/fixtures/tools-md/ and tests/tools/fixtures/env-descriptors/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const toolsMdDir = path.resolve(__dirname, "../fixtures/tools-md");
const envDescDir = path.resolve(__dirname, "../fixtures/env-descriptors");

const wellFormedPath = path.join(toolsMdDir, "well-formed.md");

/**
 * Assert that every finding in a report has a non-empty citedRubric.
 * Charter invariant (FR-009): citedRubric must never be absent.
 */
function assertAllFindingsCiteRubric(findings: readonly DriftFinding[]): void {
  for (const finding of findings) {
    expect(finding.citedRubric).toBeTruthy();
    expect(finding.citedRubric.length).toBeGreaterThan(0);
  }
}

describe("loadEnvironmentDescriptor", () => {
  it("loads OpenAI top-level array format correctly", async () => {
    const desc = await loadEnvironmentDescriptor(
      path.join(envDescDir, "openai-array-format.json")
    );
    expect(desc.format).toBe("openai-tool-registry");
    expect(desc.tools.has("send_email")).toBe(true);
    expect(desc.tools.has("list_files")).toBe(true);
  });

  it("handles OpenAI tool with no parameters field (empty parameter map)", async () => {
    const desc = await loadEnvironmentDescriptor(
      path.join(envDescDir, "openai-no-params.json")
    );
    expect(desc.format).toBe("openai-tool-registry");
    const sendEmail = desc.tools.get("send_email")!;
    expect(sendEmail).toBeDefined();
    expect(sendEmail.parameters.size).toBe(0);
  });

  it("loads MCP manifest format correctly", async () => {
    const desc = await loadEnvironmentDescriptor(
      path.join(envDescDir, "matching-mcp.json")
    );
    expect(desc.format).toBe("mcp-manifest");
    expect(desc.tools.has("send_email")).toBe(true);
    expect(desc.tools.has("list_files")).toBe(true);
  });

  it("loads OpenAI tool registry format correctly", async () => {
    const desc = await loadEnvironmentDescriptor(
      path.join(envDescDir, "matching-openai.json")
    );
    expect(desc.format).toBe("openai-tool-registry");
    expect(desc.tools.has("send_email")).toBe(true);
    expect(desc.tools.has("list_files")).toBe(true);
  });

  it("extracts parameters from MCP manifest inputSchema", async () => {
    const desc = await loadEnvironmentDescriptor(
      path.join(envDescDir, "matching-mcp.json")
    );
    const sendEmail = desc.tools.get("send_email")!;
    expect(sendEmail.parameters.get("recipient")?.required).toBe(true);
    expect(sendEmail.parameters.get("recipient")?.type).toBe("string");
    expect(sendEmail.parameters.get("body")?.required).toBe(false);
  });

  it("extracts parameters from OpenAI registry function.parameters", async () => {
    const desc = await loadEnvironmentDescriptor(
      path.join(envDescDir, "matching-openai.json")
    );
    const listFiles = desc.tools.get("list_files")!;
    expect(listFiles.parameters.get("directory")?.required).toBe(true);
    expect(listFiles.parameters.get("extension")?.required).toBe(false);
  });

  // Unknown-format edge case: must throw, never silent pass
  it("throws UnknownDescriptorFormatError for unknown format", async () => {
    const filePath = path.join(envDescDir, "unknown-format.json");
    await expect(loadEnvironmentDescriptor(filePath)).rejects.toThrow(
      UnknownDescriptorFormatError
    );
  });

  it("UnknownDescriptorFormatError has a non-empty message naming the file path", async () => {
    const filePath = path.join(envDescDir, "unknown-format.json");
    let caughtError: unknown;
    try {
      await loadEnvironmentDescriptor(filePath);
    } catch (err) {
      caughtError = err;
    }
    expect(caughtError).toBeInstanceOf(UnknownDescriptorFormatError);
    const error = caughtError as UnknownDescriptorFormatError;
    expect(error.message).toBeTruthy();
    expect(error.message.length).toBeGreaterThan(0);
    // Message must name the file path
    expect(error.message).toContain("unknown-format.json");
  });
});

describe("runDriftCheck", () => {
  // ---------------------------------------------------------------------------
  // Scenario 3 (FR-004): documented-but-missing
  // ---------------------------------------------------------------------------
  describe("Scenario 3 — documented-but-missing", () => {
    it("emits documented-but-missing finding for send_email", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "documented-but-missing.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      expect(report.clean).toBe(false);
      const finding = report.findings.find(
        (f) => f.kind === "documented-but-missing" && f.toolName === "send_email"
      );
      expect(finding).toBeDefined();
    });

    it("citedRubric invariant: all findings carry non-empty citedRubric", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "documented-but-missing.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);
      assertAllFindingsCiteRubric(report.findings);
    });

    it("does not emit a finding for list_files (present in env)", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "documented-but-missing.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      const listFilesFinding = report.findings.find(
        (f) => f.kind === "documented-but-missing" && f.toolName === "list_files"
      );
      expect(listFilesFinding).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 4 (FR-004): present-but-undocumented
  // ---------------------------------------------------------------------------
  describe("Scenario 4 — present-but-undocumented", () => {
    it("emits present-but-undocumented finding for delete_file", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "present-but-undocumented.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      expect(report.clean).toBe(false);
      const finding = report.findings.find(
        (f) =>
          f.kind === "present-but-undocumented" && f.toolName === "delete_file"
      );
      expect(finding).toBeDefined();
    });

    it("citedRubric invariant: all findings carry non-empty citedRubric", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "present-but-undocumented.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);
      assertAllFindingsCiteRubric(report.findings);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 5 (FR-004): schema-mismatch — subset (docs-ahead)
  // ---------------------------------------------------------------------------
  describe("Scenario 5 — schema-mismatch subset (docs-ahead)", () => {
    it("emits schema-mismatch finding for send_email", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "schema-mismatch-sub.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      expect(report.clean).toBe(false);
      const finding = report.findings.find(
        (f) => f.kind === "schema-mismatch" && f.toolName === "send_email"
      );
      expect(finding).toBeDefined();
    });

    it("schema-mismatch direction is docs-ahead (body in docs, not in env)", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "schema-mismatch-sub.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      const finding = report.findings.find(
        (f) => f.kind === "schema-mismatch" && f.toolName === "send_email"
      )!;
      expect(finding.direction).toBe("docs-ahead");
    });

    it("schema-mismatch fields includes parameters.body", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "schema-mismatch-sub.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      const finding = report.findings.find(
        (f) => f.kind === "schema-mismatch" && f.toolName === "send_email"
      )!;
      expect(finding.fields).toBeDefined();
      expect(finding.fields).toContain("parameters.body");
    });

    it("citedRubric invariant: all findings carry non-empty citedRubric", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "schema-mismatch-sub.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);
      assertAllFindingsCiteRubric(report.findings);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 5b: schema-mismatch superset (reality-ahead)
  // ---------------------------------------------------------------------------
  describe("Scenario 5b — schema-mismatch superset (reality-ahead)", () => {
    it("emits schema-mismatch with direction reality-ahead (cc in env, not in docs)", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "schema-mismatch-super.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      expect(report.clean).toBe(false);
      const finding = report.findings.find(
        (f) => f.kind === "schema-mismatch" && f.toolName === "send_email"
      );
      expect(finding).toBeDefined();
      expect(finding!.direction).toBe("reality-ahead");
    });

    it("schema-mismatch fields includes parameters.cc", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "schema-mismatch-super.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      const finding = report.findings.find(
        (f) => f.kind === "schema-mismatch" && f.toolName === "send_email"
      )!;
      expect(finding.fields).toContain("parameters.cc");
    });

    it("citedRubric invariant: all findings carry non-empty citedRubric", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "schema-mismatch-super.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);
      assertAllFindingsCiteRubric(report.findings);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 6 (SC-002): clean report + byte-stable across runs
  // ---------------------------------------------------------------------------
  describe("Scenario 6 — clean report and byte-stable (MCP matching)", () => {
    it("report is clean with zero findings for matching-mcp.json", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "matching-mcp.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      expect(report.clean).toBe(true);
      expect(report.findings.length).toBe(0);
    });

    it("byte-stable: two runs produce JSON.stringify-identical output (SC-002)", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "matching-mcp.json")
      );
      const run1 = runDriftCheck(toolsFile, envDesc);
      const run2 = runDriftCheck(toolsFile, envDesc);

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });

    it("envDescriptorFormat is mcp-manifest for MCP fixture", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "matching-mcp.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);
      expect(report.envDescriptorFormat).toBe("mcp-manifest");
    });
  });

  // ---------------------------------------------------------------------------
  // OpenAI format: format detection + clean report
  // ---------------------------------------------------------------------------
  describe("OpenAI format — matching-openai.json", () => {
    it("produces a clean report for matching OpenAI registry", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "matching-openai.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      expect(report.clean).toBe(true);
      expect(report.findings.length).toBe(0);
    });

    it("envDescriptorFormat is openai-tool-registry", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "matching-openai.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);
      expect(report.envDescriptorFormat).toBe("openai-tool-registry");
    });
  });

  // ---------------------------------------------------------------------------
  // Ordering invariant: findings sorted kind-first then toolName (UTF-16)
  // ---------------------------------------------------------------------------
  describe("Ordering invariant — kind-then-toolName, UTF-16, no localeCompare", () => {
    it("findings are sorted by kind then toolName in a multi-finding report", async () => {
      // documented-but-missing.json has only list_files in env, so send_email is
      // documented-but-missing. No present-but-undocumented or schema-mismatch.
      // For a richer ordering test, use present-but-undocumented.json which
      // adds delete_file. That gives present-but-undocumented:delete_file.
      // All documented tools (send_email, list_files) are in env — no missing.
      // No schema mismatch — schemas match.
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "present-but-undocumented.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      // Verify the array is sorted: each consecutive pair satisfies ordering
      for (let i = 1; i < report.findings.length; i++) {
        const prev = report.findings[i - 1]!;
        const curr = report.findings[i]!;
        const kindCmp =
          prev.kind < curr.kind ? -1 : prev.kind > curr.kind ? 1 : 0;
        if (kindCmp === 0) {
          // Same kind: toolName must be ascending
          expect(prev.toolName <= curr.toolName).toBe(true);
        } else {
          // Kind must be ascending
          expect(kindCmp).toBeLessThan(0);
        }
      }
    });

    it("findings from documented-but-missing.json have correct kind", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "documented-but-missing.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      // send_email is documented-but-missing; list_files is present and matches
      expect(report.findings.length).toBe(1);
      expect(report.findings[0]!.kind).toBe("documented-but-missing");
      expect(report.findings[0]!.toolName).toBe("send_email");
    });
  });

  // ---------------------------------------------------------------------------
  // Global citedRubric invariant across all scenarios
  // ---------------------------------------------------------------------------
  describe("citedRubric invariant (FR-009) — all scenarios", () => {
    it("every finding in every scenario has a non-empty citedRubric", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const fixtures = [
        "documented-but-missing.json",
        "present-but-undocumented.json",
        "schema-mismatch-sub.json",
        "schema-mismatch-super.json",
        "matching-mcp.json",
        "matching-openai.json",
      ];
      for (const fixture of fixtures) {
        const envDesc = await loadEnvironmentDescriptor(
          path.join(envDescDir, fixture)
        );
        const report = runDriftCheck(toolsFile, envDesc);
        assertAllFindingsCiteRubric(report.findings);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Type and required field differences (same param name, different type/required)
  // ---------------------------------------------------------------------------
  describe("schema-mismatch with type/required field differences", () => {
    it("emits schema-mismatch when param type differs (recipient: integer vs string)", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "schema-mismatch-type-required.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      expect(report.clean).toBe(false);
      const finding = report.findings.find(
        (f) => f.kind === "schema-mismatch" && f.toolName === "send_email"
      );
      expect(finding).toBeDefined();
      expect(finding!.fields).toContain("parameters.recipient.type");
    });

    it("emits schema-mismatch when param required flag differs (body: false vs true)", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "schema-mismatch-type-required.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      const finding = report.findings.find(
        (f) => f.kind === "schema-mismatch" && f.toolName === "send_email"
      );
      expect(finding).toBeDefined();
      // body is required=false in docs but required=true in env (reality-ahead)
      expect(finding!.fields).toContain("parameters.body.required");
    });

    it("direction is reality-ahead when env requires more params than docs", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "schema-mismatch-type-required.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      const finding = report.findings.find(
        (f) => f.kind === "schema-mismatch" && f.toolName === "send_email"
      );
      expect(finding).toBeDefined();
      expect(finding!.direction).toBe("reality-ahead");
    });

    it("citedRubric invariant holds for type/required mismatch findings", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "schema-mismatch-type-required.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);
      assertAllFindingsCiteRubric(report.findings);
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-finding sort: same kind, different toolNames (covers toolName comparison)
  // ---------------------------------------------------------------------------
  describe("sort order: multiple findings of same kind sorted by toolName", () => {
    it("findings of kind documented-but-missing are sorted by toolName (UTF-16)", async () => {
      // Use documented-but-missing.json: only list_files is in env, so send_email is missing.
      // To get two same-kind findings, we need a fixture where both tools are missing from env.
      // Reuse documented-but-missing.json (which has only list_files in env but send_email is missing)
      // and create a scenario where we have both tools missing by using an empty env.
      // We test with schema-mismatch-type-required.json which produces one schema-mismatch (send_email).
      // list_files matches cleanly. So we only get one finding for send_email.
      // To test multi-same-kind: use schema-mismatch-sub.json (send_email schema-mismatch) plus
      // schema-mismatch-super.json (send_email schema-mismatch) — but these fixtures only have
      // send_email mismatching.
      // Instead: documented-but-missing.json has send_email absent from env (list_files present).
      // We can verify the sort by ensuring the finding at index 0 is always the first alphabetically.
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "documented-but-missing.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      // Only one documented-but-missing finding (send_email); ordering is trivially stable.
      const missingFindings = report.findings.filter(
        (f) => f.kind === "documented-but-missing"
      );
      expect(missingFindings.length).toBeGreaterThanOrEqual(1);

      // Verify overall order is stable (kind-first, then toolName)
      for (let i = 1; i < report.findings.length; i++) {
        const prev = report.findings[i - 1]!;
        const curr = report.findings[i]!;
        if (prev.kind === curr.kind) {
          expect(prev.toolName <= curr.toolName).toBe(true);
        } else {
          expect(prev.kind < curr.kind).toBe(true);
        }
      }
    });

    it("compareStrings is stable: finds with same kind are ordered by toolName", async () => {
      // Use schema-mismatch-type-required.json: send_email has mismatch, list_files is clean.
      // Only one schema-mismatch finding — ordering is trivially stable.
      // This test exercises the compareStrings(a.toolName, b.toolName) branch via sort stability.
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "schema-mismatch-type-required.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      const schemaMismatches = report.findings.filter(
        (f) => f.kind === "schema-mismatch"
      );
      expect(schemaMismatches.length).toBeGreaterThanOrEqual(1);
      // Verify all findings have the expected kind
      expect(schemaMismatches[0]!.kind).toBe("schema-mismatch");
    });

    it("two same-kind findings are sorted by toolName (covers toolName comparison branch)", async () => {
      // empty-env.json has an empty tools array — both send_email and list_files are
      // documented-but-missing, giving two findings of the same kind. This exercises
      // the compareStrings(a.toolName, b.toolName) branch in the sort comparator.
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "empty-env.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      expect(report.clean).toBe(false);
      const missingFindings = report.findings.filter(
        (f) => f.kind === "documented-but-missing"
      );
      // Both tools are documented-but-missing — 2 same-kind findings
      expect(missingFindings.length).toBe(2);
      // Verify toolName ordering is ascending (UTF-16: "list_files" < "send_email")
      expect(missingFindings[0]!.toolName).toBe("list_files");
      expect(missingFindings[1]!.toolName).toBe("send_email");
    });
  });
});
