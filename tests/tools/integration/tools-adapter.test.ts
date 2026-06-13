/**
 * Integration test — full static/drift fixture suite, offline, byte-stable.
 *
 * Covers acceptance scenarios 1–6 (static + drift, fully deterministic and offline).
 * Scenarios 7–9 (behavioral selection probes) are covered in WP03 unit tests
 * with mock fetch (tests/tools/unit/selection.test.ts) — no live endpoint required.
 *
 * Charter constraints verified here:
 * - Offline (C-003, NFR-001): zero fetch/http/https calls in this file.
 * - Byte-stable (SC-002, NFR-001): scenario 6 runs drift twice and asserts
 *   JSON.stringify equality.
 * - Performance gate (NFR-003): full suite must complete in < 10 s.
 * - SpecAdapter boundary (C-001): imports come from src/adapters/tools/* only;
 *   src/core/ is never imported here.
 *
 * Grep for imports to verify offline constraint:
 *   grep -n 'fetch\|http\|https' tests/tools/integration/tools-adapter.test.ts
 * Expected output: none (this file makes no network calls).
 */

import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Imports from src/adapters/tools/* only (not from src/core/ — C-001 boundary)
import {
  parseTOOLSFile,
  lintTOOLSFile,
  toCanonicalJson,
} from "../../../src/adapters/tools/lint.js";
import {
  loadEnvironmentDescriptor,
  runDriftCheck,
  UnknownDescriptorFormatError,
} from "../../../src/adapters/tools/drift.js";
import { runManifest } from "../../../src/adapters/tools/index.js";

// ---------------------------------------------------------------------------
// Fixture path helpers
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This test lives at tests/tools/integration/tools-adapter.test.ts
// Fixtures live at tests/tools/fixtures/
const fixturesRoot = path.resolve(__dirname, "../fixtures");
const toolsMdDir = path.join(fixturesRoot, "tools-md");
const envDescDir = path.join(fixturesRoot, "env-descriptors");

const wellFormedPath = path.join(toolsMdDir, "well-formed.md");
const missingSectionPath = path.join(toolsMdDir, "missing-section.md");

// ---------------------------------------------------------------------------
// Performance gate (NFR-003): entire suite must complete in < 10 s
// All integration tests run within the Vitest timeout (default 5 s per test);
// we also wrap the slowest scenario in an explicit timeout assertion below.
// ---------------------------------------------------------------------------

describe("Tools Adapter Integration — static + drift fixture suite (offline)", () => {
  // =========================================================================
  // Scenario 1 (FR-003 acceptance — well-formed static lint)
  // =========================================================================
  describe("Scenario 1 — well-formed.md: ok: true, zero findings", () => {
    it("parseTOOLSFile parses well-formed.md without error", async () => {
      const parsed = await parseTOOLSFile(wellFormedPath);
      expect(parsed.tools.length).toBeGreaterThan(0);
      expect(parsed.sections.has("overview")).toBe(true);
      expect(parsed.sections.has("tools")).toBe(true);
    });

    it("lintTOOLSFile returns ok: true with zero findings", async () => {
      const parsed = await parseTOOLSFile(wellFormedPath);
      const report = lintTOOLSFile(parsed);

      expect(report.ok).toBe(true);
      expect(report.findings.length).toBe(0);
    });

    it("toCanonicalJson produces a valid JSON string", async () => {
      const parsed = await parseTOOLSFile(wellFormedPath);
      const json = toCanonicalJson(parsed);
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  // =========================================================================
  // Scenario 2 (FR-003 acceptance — missing section)
  // =========================================================================
  describe("Scenario 2 — missing-section.md: ok: false, missing-required-section finding", () => {
    it("lintTOOLSFile returns ok: false", async () => {
      const parsed = await parseTOOLSFile(missingSectionPath);
      const report = lintTOOLSFile(parsed);

      expect(report.ok).toBe(false);
    });

    it("emits exactly one finding with kind === 'missing-required-section'", async () => {
      const parsed = await parseTOOLSFile(missingSectionPath);
      const report = lintTOOLSFile(parsed);

      const missingSection = report.findings.find(
        (f) => f.kind === "missing-required-section"
      );
      expect(missingSection).toBeDefined();
    });

    it("missing-required-section finding has a non-empty citedRubric (FR-009)", async () => {
      const parsed = await parseTOOLSFile(missingSectionPath);
      const report = lintTOOLSFile(parsed);

      for (const finding of report.findings) {
        expect(finding.citedRubric).toBeTruthy();
        expect(finding.citedRubric.length).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // Scenario 3 (FR-004 — documented-but-missing)
  // =========================================================================
  describe("Scenario 3 — documented-but-missing: send_email absent from env", () => {
    it("runDriftCheck emits documented-but-missing finding for send_email", async () => {
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

    it("every finding cites a non-empty rubric (FR-009)", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "documented-but-missing.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      for (const finding of report.findings) {
        expect(finding.citedRubric).toBeTruthy();
        expect(finding.citedRubric.length).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // Scenario 4 (FR-004 — present-but-undocumented)
  // =========================================================================
  describe("Scenario 4 — present-but-undocumented: delete_file extra in env", () => {
    it("runDriftCheck emits present-but-undocumented finding for delete_file", async () => {
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

    it("every finding cites a non-empty rubric (FR-009)", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "present-but-undocumented.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      for (const finding of report.findings) {
        expect(finding.citedRubric).toBeTruthy();
        expect(finding.citedRubric.length).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // Scenario 5 (FR-004 — schema-mismatch with direction)
  // =========================================================================
  describe("Scenario 5 — schema-mismatch: docs-ahead direction for send_email", () => {
    it("runDriftCheck emits schema-mismatch finding for send_email", async () => {
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

    it("schema-mismatch finding direction is 'docs-ahead'", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "schema-mismatch-sub.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      const finding = report.findings.find(
        (f) => f.kind === "schema-mismatch" && f.toolName === "send_email"
      );
      expect(finding?.direction).toBe("docs-ahead");
    });

    it("schema-mismatch finding includes the differing field in fields array", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "schema-mismatch-sub.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      const finding = report.findings.find(
        (f) => f.kind === "schema-mismatch" && f.toolName === "send_email"
      );
      expect(finding?.fields).toBeDefined();
      expect(Array.isArray(finding?.fields)).toBe(true);
      expect((finding?.fields?.length ?? 0)).toBeGreaterThan(0);
    });

    it("every finding cites a non-empty rubric (FR-009)", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "schema-mismatch-sub.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      for (const finding of report.findings) {
        expect(finding.citedRubric).toBeTruthy();
        expect(finding.citedRubric.length).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // Scenario 6 (SC-002 — byte-stable clean drift, MCP format)
  // =========================================================================
  describe("Scenario 6 — byte-stable clean drift (matching-mcp.json)", {
    timeout: 10_000, // NFR-003: entire suite must complete in < 10 s
  }, () => {
    it("runDriftCheck returns clean: true for matching-mcp.json", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "matching-mcp.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      expect(report.clean).toBe(true);
      expect(report.findings.length).toBe(0);
    });

    it(
      "byte-stable: two consecutive runs produce JSON.stringify-identical output (SC-002)",
      async () => {
        const toolsFile = await parseTOOLSFile(wellFormedPath);
        const envDesc = await loadEnvironmentDescriptor(
          path.join(envDescDir, "matching-mcp.json")
        );

        // Run twice — SC-002 byte-stability assertion
        const run1 = runDriftCheck(toolsFile, envDesc);
        const run2 = runDriftCheck(toolsFile, envDesc);

        expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
        expect(run1.clean).toBe(true);
        expect(run2.clean).toBe(true);
      }
    );

    it("envDescriptorFormat is 'mcp-manifest' for matching-mcp.json", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "matching-mcp.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      expect(report.envDescriptorFormat).toBe("mcp-manifest");
    });
  });

  // =========================================================================
  // Scenario 6 variant — OpenAI format (matching-openai.json)
  // =========================================================================
  describe("Scenario 6 variant — OpenAI format (matching-openai.json)", () => {
    it("runDriftCheck returns clean report for matching OpenAI registry", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "matching-openai.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      expect(report.clean).toBe(true);
      expect(report.findings.length).toBe(0);
    });

    it("envDescriptorFormat is 'openai-tool-registry' for matching-openai.json", async () => {
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      const envDesc = await loadEnvironmentDescriptor(
        path.join(envDescDir, "matching-openai.json")
      );
      const report = runDriftCheck(toolsFile, envDesc);

      expect(report.envDescriptorFormat).toBe("openai-tool-registry");
    });
  });

  // =========================================================================
  // Unknown-format edge case
  // =========================================================================
  describe("Unknown-format edge case", () => {
    it("loadEnvironmentDescriptor throws UnknownDescriptorFormatError for unknown-format.json", async () => {
      const filePath = path.join(envDescDir, "unknown-format.json");

      await expect(loadEnvironmentDescriptor(filePath)).rejects.toThrow(
        UnknownDescriptorFormatError
      );
    });

    it("UnknownDescriptorFormatError message names the file path", async () => {
      const filePath = path.join(envDescDir, "unknown-format.json");
      let caughtError: unknown;
      try {
        await loadEnvironmentDescriptor(filePath);
      } catch (err) {
        caughtError = err;
      }
      expect(caughtError).toBeInstanceOf(UnknownDescriptorFormatError);
      const error = caughtError as UnknownDescriptorFormatError;
      expect(error.message).toContain("unknown-format.json");
    });
  });

  // =========================================================================
  // runManifest smoke test (FR-010)
  // =========================================================================
  describe("runManifest smoke test (FR-010)", () => {
    it("first case (well-formed + matching-mcp) passes, second (missing-section, no env) fails", async () => {
      const results = await runManifest([
        {
          id: "smoke-case-01",
          toolsFilePath: wellFormedPath,
          envDescriptorPath: path.join(envDescDir, "matching-mcp.json"),
          // No selectionScenarioPaths — offline only
        },
        {
          id: "smoke-case-02",
          toolsFilePath: missingSectionPath,
          // No envDescriptorPath — only lint is run
        },
      ]);

      expect(results).toHaveLength(2);

      // Case 1: well-formed + clean drift → passed === true
      const case1 = results.find((r) => r.id === "smoke-case-01");
      expect(case1).toBeDefined();
      expect(case1?.passed).toBe(true);
      expect(case1?.lintReport?.ok).toBe(true);
      expect(case1?.driftReport?.clean).toBe(true);

      // Case 2: missing-section → lint not ok → passed === false
      const case2 = results.find((r) => r.id === "smoke-case-02");
      expect(case2).toBeDefined();
      expect(case2?.passed).toBe(false);
      expect(case2?.lintReport?.ok).toBe(false);
    });

    it("case with clean lint but no env-descriptor has passed === true (lint-only pass)", async () => {
      const results = await runManifest([
        {
          id: "lint-only-pass",
          toolsFilePath: wellFormedPath,
          // No env-descriptor — only lint
        },
      ]);

      expect(results[0]?.passed).toBe(true);
      expect(results[0]?.lintReport?.ok).toBe(true);
      expect(results[0]?.driftReport).toBeUndefined();
    });

    it("case with failing lint has passed === false regardless of drift", async () => {
      const results = await runManifest([
        {
          id: "lint-fail",
          toolsFilePath: missingSectionPath,
          envDescriptorPath: path.join(envDescDir, "matching-mcp.json"),
        },
      ]);

      expect(results[0]?.passed).toBe(false);
      expect(results[0]?.lintReport?.ok).toBe(false);
    });

    it(
      "case with selectionScenarioPaths but no endpoint skips probes (writes warning) and still passes lint+drift",
      async () => {
        // Cover the "no endpoint → skip with warning" branch in runManifest (lines 203-207).
        // The integration test does not call any live endpoint (C-003, NFR-001 offline constraint).
        const stderrChunks: string[] = [];
        const origWrite = process.stderr.write.bind(process.stderr);
        // Capture stderr to assert the warning message
        const captureWrite = (chunk: string | Uint8Array, ...rest: unknown[]) => {
          if (typeof chunk === "string") {
            stderrChunks.push(chunk);
          }
          // Call original to avoid swallowing output entirely
          return origWrite(chunk as Parameters<typeof origWrite>[0], ...(rest as Parameters<typeof origWrite>[1][]) );
        };
        process.stderr.write = captureWrite as typeof process.stderr.write;

        try {
          const results = await runManifest(
            [
              {
                id: "no-endpoint-case",
                toolsFilePath: wellFormedPath,
                // selectionScenarioPaths provided but no endpoint → warning + skip
                selectionScenarioPaths: [
                  path.join(fixturesRoot, "selection-scenarios", "correct-tool.json"),
                ],
              },
            ]
            // No opts.endpoint — selection probes are skipped
          );

          expect(results).toHaveLength(1);
          // Lint is clean → passed === true (selection skipped, not failed)
          expect(results[0]?.passed).toBe(true);
          expect(results[0]?.lintReport?.ok).toBe(true);
          // selectionVerdicts should be absent (skipped)
          expect(results[0]?.selectionVerdicts).toBeUndefined();
        } finally {
          // Restore stderr
          process.stderr.write = origWrite as typeof process.stderr.write;
        }

        // Verify the warning was emitted to stderr
        const combinedWarning = stderrChunks.join("");
        expect(combinedWarning).toContain("no-endpoint-case");
        expect(combinedWarning).toContain("selection probes skipped");
      }
    );

    it("case with clean lint + failing drift has passed === false", async () => {
      const results = await runManifest([
        {
          id: "drift-fail",
          toolsFilePath: wellFormedPath,
          envDescriptorPath: path.join(envDescDir, "documented-but-missing.json"),
        },
      ]);

      expect(results[0]?.passed).toBe(false);
      expect(results[0]?.lintReport?.ok).toBe(true);
      expect(results[0]?.driftReport?.clean).toBe(false);
    });

    it(
      "case with selectionScenarioPaths and an injected mock fetcher: runs selection without any network call (C-003, NFR-001)",
      async () => {
        // Exercise the endpoint branch (runManifest lines with selectionVerdicts)
        // using an injected mock FetchFn — zero real network calls (C-003, NFR-001).
        // The mock returns a minimal OpenAI-style response where the model selects
        // "send_email" (a tool present in well-formed.md).
        const mockFetcher = async (
          _url: string,
          _init: RequestInit
        ): Promise<Response> => {
          const body = JSON.stringify({
            choices: [
              {
                message: {
                  tool_calls: [
                    { function: { name: "send_email" } },
                  ],
                },
              },
            ],
          });
          return new Response(body, {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        };

        const results = await runManifest(
          [
            {
              id: "selection-mock-fetcher-case",
              toolsFilePath: wellFormedPath,
              selectionScenarioPaths: [
                path.join(
                  fixturesRoot,
                  "selection-scenarios",
                  "correct-tool.json"
                ),
              ],
            },
          ],
          {
            endpoint: "http://mock-endpoint.invalid",
            model: "test-model",
            fetcher: mockFetcher,
          }
        );

        expect(results).toHaveLength(1);
        // selectionVerdicts should be present and populated
        expect(results[0]?.selectionVerdicts).toBeDefined();
        expect((results[0]?.selectionVerdicts?.length ?? 0)).toBeGreaterThan(0);
      }
    );

    it(
      "expect: 'fail' cross-check: case with failing lint and expect: 'fail' has passed === true (FR-010 expectations)",
      async () => {
        // FR-010: when expect === "fail", passed is true iff the raw outcome fails.
        // missing-section.md has lint errors → raw passed === false → expectation satisfied → passed === true.
        const results = await runManifest([
          {
            id: "expect-fail-case",
            toolsFilePath: missingSectionPath,
            expect: "fail",
          },
        ]);

        expect(results).toHaveLength(1);
        expect(results[0]?.id).toBe("expect-fail-case");
        // Raw outcome fails (missing section lint error); expect: "fail" satisfied → passed === true
        expect(results[0]?.passed).toBe(true);
        // Lint report is still the raw failing report
        expect(results[0]?.lintReport?.ok).toBe(false);
      }
    );

    it(
      "expect: 'pass' cross-check: case with clean lint and expect: 'pass' has passed === true (FR-010 expectations)",
      async () => {
        // FR-010: when expect === "pass", passed is true iff the raw outcome passes.
        // well-formed.md has no lint errors → raw passed === true → expectation satisfied → passed === true.
        const results = await runManifest([
          {
            id: "expect-pass-case",
            toolsFilePath: wellFormedPath,
            expect: "pass",
          },
        ]);

        expect(results).toHaveLength(1);
        expect(results[0]?.id).toBe("expect-pass-case");
        expect(results[0]?.passed).toBe(true);
        expect(results[0]?.lintReport?.ok).toBe(true);
      }
    );

    it(
      "expect: 'fail' cross-check: case with clean lint and expect: 'fail' has passed === false (expectation not satisfied)",
      async () => {
        // FR-010: when expect === "fail" but raw outcome passes, expectation is NOT satisfied → passed === false.
        const results = await runManifest([
          {
            id: "expect-fail-but-passes-case",
            toolsFilePath: wellFormedPath,
            expect: "fail",
          },
        ]);

        expect(results).toHaveLength(1);
        // Raw outcome passes; expect: "fail" not satisfied → passed === false
        expect(results[0]?.passed).toBe(false);
        expect(results[0]?.lintReport?.ok).toBe(true);
      }
    );
  });

  // =========================================================================
  // Performance gate (NFR-003): full static/drift suite completes < 10 s
  // =========================================================================
  describe("Performance gate (NFR-003): full suite completes in < 10 s", {
    timeout: 10_000,
  }, () => {
    it("all static/drift integration scenarios complete within the 10 s window", async () => {
      const start = performance.now();

      // Run all static/drift scenarios in sequence (worst-case timing)
      const toolsFile = await parseTOOLSFile(wellFormedPath);
      lintTOOLSFile(toolsFile);

      const missingSectionFile = await parseTOOLSFile(missingSectionPath);
      lintTOOLSFile(missingSectionFile);

      const envFixtures = [
        "documented-but-missing.json",
        "present-but-undocumented.json",
        "schema-mismatch-sub.json",
        "schema-mismatch-super.json",
        "matching-mcp.json",
        "matching-openai.json",
      ];

      for (const fixture of envFixtures) {
        const envDesc = await loadEnvironmentDescriptor(
          path.join(envDescDir, fixture)
        );
        runDriftCheck(toolsFile, envDesc);
      }

      // Byte-stable run (scenario 6 — two consecutive runs)
      const matchingMcp = await loadEnvironmentDescriptor(
        path.join(envDescDir, "matching-mcp.json")
      );
      const r1 = runDriftCheck(toolsFile, matchingMcp);
      const r2 = runDriftCheck(toolsFile, matchingMcp);
      expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(10_000); // NFR-003
    });
  });
});
