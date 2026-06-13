/**
 * Unit tests for src/adapters/tools/selection.ts
 *
 * Covers:
 * - Scenario 7 (correct-selection, 3 runs, 2-of-3 threshold) → passed=true
 * - Scenario 8 (abstention, 3 runs, 2-of-3 threshold) → passed=true
 * - Scenario 9 (control discrimination, 1 run) → passed=false (FR-008 charter)
 * - Errored-run-is-failed charter invariant
 * - Tool-not-in-registered-set edge case
 * - Endpoint-without-tool-calling edge case
 * - Direct grader unit tests (gradeCorrectSelection, gradeAbstention, gradeControl)
 *
 * All tests use mock fetch — no live endpoint required.
 * The fetcher is passed via opts.fetcher (dependency injection) to comply with
 * the NI-003 fetch-isolation invariant (call-shaped token restricted to one module).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runSelectionCase,
  gradeCorrectSelection,
  gradeAbstention,
  gradeControl,
  type ToolSelectionCase,
  type FetchFn,
} from "../../../src/adapters/tools/selection.js";
import { parseTOOLSFile } from "../../../src/adapters/tools/lint.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../fixtures");
const wellFormedToolsPath = path.join(fixturesDir, "tools-md", "well-formed.md");
const scenariosDir = path.join(fixturesDir, "selection-scenarios");

// ---------------------------------------------------------------------------
// Helpers for building mock fetch implementations
// ---------------------------------------------------------------------------

/** Build a mock Response with tool_calls selecting the given tool name. */
function makeToolCallResponse(toolName: string): Response {
  const body = JSON.stringify({
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            {
              id: "call_001",
              type: "function",
              function: {
                name: toolName,
                arguments: "{}",
              },
            },
          ],
        },
      },
    ],
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Build a mock Response with no tool calls (model abstained — empty tool_calls array). */
function makeAbstainResponse(): Response {
  const body = JSON.stringify({
    choices: [
      {
        message: {
          content: "Paris",
          tool_calls: [],
        },
      },
    ],
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Build a mock Response with no tool_calls key at all (endpoint lacks tool-calling). */
function makeNoToolCallsKeyResponse(): Response {
  const body = JSON.stringify({
    choices: [
      {
        message: {
          content: "Some response without tool calls support",
        },
      },
    ],
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Create a FetchFn mock that always resolves with a fresh Response built
 * from the given factory. A factory (not a single Response instance) is used
 * because Response bodies are streams and can only be consumed once — calling
 * the same Response multiple times would fail on the 2nd read.
 */
function alwaysReturn(factory: () => Response): FetchFn {
  return vi.fn(async () => factory());
}

/** Create a FetchFn mock that always rejects with the given error. */
function alwaysReject(err: Error): FetchFn {
  return vi.fn(async () => {
    throw err;
  });
}

// ---------------------------------------------------------------------------
// Shared test opts (endpoint from env variable convention; never hardcoded)
// ---------------------------------------------------------------------------
const BASE_OPTS = {
  endpoint: process.env["MUSTER_ENDPOINT"] ?? "http://localhost:11434/v1",
  model: process.env["MUSTER_MODEL"] ?? "test-model",
};

// ---------------------------------------------------------------------------
// Main test suite
// ---------------------------------------------------------------------------

describe("runSelectionCase", () => {
  let toolsFile: Awaited<ReturnType<typeof parseTOOLSFile>>;

  beforeEach(async () => {
    // Parse the well-formed TOOLS.md fixture (tools: send_email, list_files)
    toolsFile = await parseTOOLSFile(wellFormedToolsPath);
  });

  // -------------------------------------------------------------------------
  // Scenario 7: correct-selection axis (FR-006, FR-007)
  // -------------------------------------------------------------------------
  describe("Scenario 7 — correct-selection axis (mock send_email)", () => {
    it("returns passed=true when 3 runs all select the expected tool (2-of-3 threshold)", async () => {
      const testCase: ToolSelectionCase = {
        id: "tools-select-correct-001",
        scenario: "Send an email to alice@example.com with subject 'Hello' and body 'Hi there'.",
        expectedAxis: "correct-selection",
        expectedTool: "send_email",
        runs: 3,
        pass_threshold: 2,
      };

      const verdict = await runSelectionCase(toolsFile, testCase, {
        ...BASE_OPTS,
        fetcher: alwaysReturn(() => makeToolCallResponse("send_email")),
      });

      expect(verdict.passed).toBe(true);
      expect(verdict.passCount).toBeGreaterThanOrEqual(2);
      expect(verdict.axis).toBe("correct-selection");
      expect(verdict.id).toBe("tools-select-correct-001");
      expect(verdict.runs).toHaveLength(3);
    });

    it("loads scenario from fixture JSON and passes", async () => {
      const { default: scenario } = await import(
        `${scenariosDir}/correct-tool.json`,
        { assert: { type: "json" } }
      );

      const verdict = await runSelectionCase(
        toolsFile,
        scenario as ToolSelectionCase,
        {
          ...BASE_OPTS,
          fetcher: alwaysReturn(() => makeToolCallResponse("send_email")),
        }
      );
      expect(verdict.passed).toBe(true);
      expect(verdict.axis).toBe("correct-selection");
    });

    it("returns passed=false when model selects a wrong tool", async () => {
      const testCase: ToolSelectionCase = {
        id: "tools-select-wrong-001",
        scenario: "Send an email.",
        expectedAxis: "correct-selection",
        expectedTool: "send_email",
        runs: 3,
        pass_threshold: 2,
      };

      const verdict = await runSelectionCase(toolsFile, testCase, {
        ...BASE_OPTS,
        fetcher: alwaysReturn(() => makeToolCallResponse("list_files")),
      });

      expect(verdict.passed).toBe(false);
      expect(verdict.runs.every((r) => !r.passed)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 8: abstention axis (FR-006, FR-007)
  // -------------------------------------------------------------------------
  describe("Scenario 8 — abstention axis (mock no tool call)", () => {
    it("returns passed=true when 3 runs all abstain (2-of-3 threshold)", async () => {
      const testCase: ToolSelectionCase = {
        id: "tools-select-abstain-001",
        scenario: "What is the capital of France?",
        expectedAxis: "abstain",
        runs: 3,
        pass_threshold: 2,
      };

      const verdict = await runSelectionCase(toolsFile, testCase, {
        ...BASE_OPTS,
        fetcher: alwaysReturn(() => makeAbstainResponse()),
      });

      expect(verdict.passed).toBe(true);
      expect(verdict.axis).toBe("abstain");
      expect(verdict.runs).toHaveLength(3);
      expect(verdict.runs.every((r) => r.passed)).toBe(true);
    });

    it("loads scenario from fixture JSON and passes", async () => {
      const { default: scenario } = await import(
        `${scenariosDir}/abstain.json`,
        { assert: { type: "json" } }
      );

      const verdict = await runSelectionCase(
        toolsFile,
        scenario as ToolSelectionCase,
        {
          ...BASE_OPTS,
          fetcher: alwaysReturn(() => makeAbstainResponse()),
        }
      );
      expect(verdict.passed).toBe(true);
      expect(verdict.axis).toBe("abstain");
    });

    it("returns passed=false when model selects a tool instead of abstaining", async () => {
      const testCase: ToolSelectionCase = {
        id: "tools-select-abstain-fail-001",
        scenario: "What is the capital of France?",
        expectedAxis: "abstain",
        runs: 1,
        pass_threshold: 1,
      };

      const verdict = await runSelectionCase(toolsFile, testCase, {
        ...BASE_OPTS,
        fetcher: alwaysReturn(() => makeToolCallResponse("send_email")),
      });

      expect(verdict.passed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 9: control discrimination (FR-008 charter requirement)
  // -------------------------------------------------------------------------
  describe("Scenario 9 — control discrimination (FR-008)", () => {
    it("MUST return passed=false for control case (charter invariant)", async () => {
      // Mock list_files selection — correct for the scenario but NOT the rigged tool
      const testCase: ToolSelectionCase = {
        id: "tools-select-control-001",
        scenario: "List the files in the /tmp directory.",
        expectedAxis: "control",
        controlRiggedTool: "__rigged_impossible__",
        runs: 1,
        pass_threshold: 1,
      };

      const verdict = await runSelectionCase(toolsFile, testCase, {
        ...BASE_OPTS,
        fetcher: alwaysReturn(() => makeToolCallResponse("list_files")),
      });

      // Charter FR-008: control verdict MUST be false.
      // A passing control is itself a test failure.
      expect(verdict.passed).toBe(false);
      expect(verdict.axis).toBe("control");
    });

    it("loads control scenario from fixture JSON and MUST fail", async () => {
      // Any real tool selection — even the "right" one — is not the rigged impossible tool
      const { default: scenario } = await import(
        `${scenariosDir}/control.json`,
        { assert: { type: "json" } }
      );

      const verdict = await runSelectionCase(
        toolsFile,
        scenario as ToolSelectionCase,
        {
          ...BASE_OPTS,
          fetcher: alwaysReturn(() => makeToolCallResponse("list_files")),
        }
      );

      // FR-008: control case must always fail
      expect(verdict.passed).toBe(false);
      expect(verdict.axis).toBe("control");
    });

    it("also fails when model abstains on control case", async () => {
      const testCase: ToolSelectionCase = {
        id: "tools-select-control-abstain-001",
        scenario: "List the files in the /tmp directory.",
        expectedAxis: "control",
        controlRiggedTool: "__rigged_impossible__",
        runs: 1,
        pass_threshold: 1,
      };

      const verdict = await runSelectionCase(toolsFile, testCase, {
        ...BASE_OPTS,
        fetcher: alwaysReturn(() => makeAbstainResponse()),
      });
      expect(verdict.passed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Errored run = failed run (charter invariant)
  // -------------------------------------------------------------------------
  describe("Errored-run-is-failed (charter constraint)", () => {
    it("sets passed=false and error non-empty when fetch rejects", async () => {
      const testCase: ToolSelectionCase = {
        id: "tools-error-001",
        scenario: "Send an email.",
        expectedAxis: "correct-selection",
        expectedTool: "send_email",
        runs: 2,
        pass_threshold: 1,
      };

      const verdict = await runSelectionCase(toolsFile, testCase, {
        ...BASE_OPTS,
        fetcher: alwaysReject(new Error("ECONNREFUSED")),
      });

      expect(verdict.passed).toBe(false);
      expect(verdict.runs).toHaveLength(2);
      for (const run of verdict.runs) {
        expect(run.passed).toBe(false);
        expect(run.error).toBeTruthy();
        expect(typeof run.error).toBe("string");
        expect(run.error!.length).toBeGreaterThan(0);
      }
    });

    it("errored first run is failed but passing subsequent runs still count", async () => {
      let callCount = 0;
      const mixedFetcher: FetchFn = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Network timeout");
        }
        return makeToolCallResponse("send_email");
      });

      const testCase: ToolSelectionCase = {
        id: "tools-error-partial-001",
        scenario: "Send an email.",
        expectedAxis: "correct-selection",
        expectedTool: "send_email",
        runs: 3,
        pass_threshold: 2,
      };

      const verdict = await runSelectionCase(toolsFile, testCase, {
        ...BASE_OPTS,
        fetcher: mixedFetcher,
      });

      // Run 1 errored → failed; runs 2+3 passed → 2 passes ≥ threshold 2
      expect(verdict.runs[0]!.passed).toBe(false);
      expect(verdict.runs[0]!.error).toBeTruthy();
      expect(verdict.passCount).toBe(2);
      expect(verdict.passed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Tool-not-in-registered-set edge case
  // -------------------------------------------------------------------------
  describe("Tool-not-in-registered-set edge case", () => {
    it("sets passed=false when model selects an unknown tool name", async () => {
      // Model selects "__unknown_tool__" which is not in the TOOLSFile
      const testCase: ToolSelectionCase = {
        id: "tools-unknown-tool-001",
        scenario: "Send an email.",
        expectedAxis: "correct-selection",
        expectedTool: "send_email",
        runs: 1,
        pass_threshold: 1,
      };

      const verdict = await runSelectionCase(toolsFile, testCase, {
        ...BASE_OPTS,
        fetcher: alwaysReturn(() => makeToolCallResponse("__unknown_tool__")),
      });

      expect(verdict.passed).toBe(false);
      expect(verdict.runs[0]!.passed).toBe(false);
      // selectedTool should still be recorded for diagnostics
      expect(verdict.runs[0]!.selectedTool).toBe("__unknown_tool__");
    });
  });

  // -------------------------------------------------------------------------
  // Endpoint-without-tool-calling edge case
  // -------------------------------------------------------------------------
  describe("Endpoint-without-tool-calling edge case", () => {
    it("errors the run when response has no tool_calls key", async () => {
      const testCase: ToolSelectionCase = {
        id: "tools-no-tool-calling-001",
        scenario: "Send an email.",
        expectedAxis: "correct-selection",
        expectedTool: "send_email",
        runs: 1,
        pass_threshold: 1,
      };

      const verdict = await runSelectionCase(toolsFile, testCase, {
        ...BASE_OPTS,
        fetcher: alwaysReturn(() => makeNoToolCallsKeyResponse()),
      });

      expect(verdict.passed).toBe(false);
      expect(verdict.runs[0]!.passed).toBe(false);
      expect(verdict.runs[0]!.error).toMatch(/tool-calling/i);
    });

    it("errors the run when endpoint returns HTTP 503", async () => {
      const errorFetcher: FetchFn = vi.fn(async () => {
        return new Response("model overloaded", { status: 503 });
      });

      const testCase: ToolSelectionCase = {
        id: "tools-http-error-001",
        scenario: "Send an email.",
        expectedAxis: "correct-selection",
        expectedTool: "send_email",
        runs: 1,
        pass_threshold: 1,
      };

      const verdict = await runSelectionCase(toolsFile, testCase, {
        ...BASE_OPTS,
        fetcher: errorFetcher,
      });

      expect(verdict.passed).toBe(false);
      expect(verdict.runs[0]!.passed).toBe(false);
      expect(verdict.runs[0]!.error).toMatch(/503/);
    });

    it("errors the run when endpoint returns non-JSON body", async () => {
      const badJsonFetcher: FetchFn = vi.fn(async () => {
        return new Response("not json at all", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      });

      const testCase: ToolSelectionCase = {
        id: "tools-bad-json-001",
        scenario: "Send an email.",
        expectedAxis: "correct-selection",
        expectedTool: "send_email",
        runs: 1,
        pass_threshold: 1,
      };

      const verdict = await runSelectionCase(toolsFile, testCase, {
        ...BASE_OPTS,
        fetcher: badJsonFetcher,
      });

      expect(verdict.passed).toBe(false);
      expect(verdict.runs[0]!.passed).toBe(false);
      expect(verdict.runs[0]!.error).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Direct grader unit tests (T020 steps 9–10)
// ---------------------------------------------------------------------------

describe("gradeCorrectSelection", () => {
  const baseCase: ToolSelectionCase = {
    id: "grade-test-001",
    scenario: "Test scenario",
    expectedAxis: "correct-selection",
    expectedTool: "send_email",
    runs: 1,
    pass_threshold: 1,
  };

  it("returns true when selectedTool matches expectedTool", () => {
    expect(gradeCorrectSelection({ selectedTool: "send_email" }, baseCase)).toBe(true);
  });

  it("returns false when selectedTool is null (model abstained)", () => {
    expect(gradeCorrectSelection({ selectedTool: null }, baseCase)).toBe(false);
  });

  it("returns false when selectedTool is a different tool name", () => {
    expect(gradeCorrectSelection({ selectedTool: "list_files" }, baseCase)).toBe(false);
  });

  it("returns false when selectedTool is empty string", () => {
    expect(gradeCorrectSelection({ selectedTool: "" }, baseCase)).toBe(false);
  });
});

describe("gradeAbstention", () => {
  it("returns true when selectedTool is null (model abstained)", () => {
    expect(gradeAbstention({ selectedTool: null })).toBe(true);
  });

  it("returns false when model selected any tool", () => {
    expect(gradeAbstention({ selectedTool: "send_email" })).toBe(false);
    expect(gradeAbstention({ selectedTool: "list_files" })).toBe(false);
    expect(gradeAbstention({ selectedTool: "__unknown__" })).toBe(false);
  });
});

describe("gradeControl", () => {
  const controlCase: ToolSelectionCase = {
    id: "control-grade-001",
    scenario: "List files in /tmp.",
    expectedAxis: "control",
    controlRiggedTool: "__rigged_impossible__",
    runs: 1,
    pass_threshold: 1,
  };

  it("returns false when selectedTool is a real tool (not the rigged tool)", () => {
    expect(gradeControl({ selectedTool: "list_files" }, controlCase)).toBe(false);
    expect(gradeControl({ selectedTool: "send_email" }, controlCase)).toBe(false);
  });

  it("returns false when selectedTool is null (abstain)", () => {
    expect(gradeControl({ selectedTool: null }, controlCase)).toBe(false);
  });

  it("returns true ONLY when selectedTool exactly equals controlRiggedTool", () => {
    // This only happens in the hypothetical (impossible in practice) case
    // where the model selects the rigged tool name.
    expect(gradeControl({ selectedTool: "__rigged_impossible__" }, controlCase)).toBe(true);
  });

  it("throws when controlRiggedTool is absent", () => {
    const invalidCase: ToolSelectionCase = {
      id: "invalid-control",
      scenario: "Test",
      expectedAxis: "control",
      // Missing controlRiggedTool
      runs: 1,
      pass_threshold: 1,
    };
    expect(() => gradeControl({ selectedTool: null }, invalidCase)).toThrow(
      /controlRiggedTool/
    );
  });
});
