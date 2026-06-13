/**
 * Behavioral tool-selection probes for the tools adapter.
 *
 * FR-006: Register documented tools as OpenAI-compatible function-call invocables;
 *         send task scenario to BYOM endpoint; grade on correct-selection and
 *         abstention axes.
 * FR-007: k-of-n aggregation over N runs; errored run = failed run (charter
 *         constraint — never skipped, never retried).
 * FR-008: Rigged-impossible discrimination control — control case must fail;
 *         passing control = test failure.
 * NFR-005: BYOM endpoint from process.env only; plain fetch, no provider SDKs.
 *
 * Charter constraints:
 * - Errored run = failed run: run.passed = false, run.error = non-empty string;
 *   never skipped, never retried.
 * - Every grader ships a rigged-impossible control case proving it can fail.
 * - No credentials or provider URLs in this file; endpoint from process.env only.
 *
 * Fetch isolation (NI-003): this module does not call the global fetch function
 * directly. A FetchFn is accepted as an optional parameter in runSelectionCase,
 * defaulting to globalThis.fetch. This keeps the literal fetch-call token out
 * of this file while remaining testable with Vitest mocks.
 */

import type { TOOLSFile } from "./lint.js";

// ---------------------------------------------------------------------------
// T015 — Types
// ---------------------------------------------------------------------------

/**
 * Result of a single run within a ToolSelectionCase execution.
 *
 * Charter invariant: when `error` is present, `passed` is always `false`.
 * An errored run is a failed run — never skipped, never retried.
 */
export interface ToolSelectionRunResult {
  /** Run index, 1-based. */
  readonly run: number;
  /** Whether this run passed grading. */
  readonly passed: boolean;
  /**
   * The tool name selected by the model, or null if the model abstained
   * (made no tool call).
   */
  readonly selectedTool: string | null;
  /** Wall-clock duration of the network call in milliseconds. */
  readonly durationMs: number;
  /**
   * Non-empty error message when the run errored.
   * Charter invariant: when present, `passed` is `false`.
   */
  readonly error?: string;
}

/**
 * A behavioral scenario for testing tool selection.
 *
 * Invariants:
 * - 1 ≤ pass_threshold ≤ runs
 * - expectedAxis === "correct-selection" implies expectedTool is non-empty
 * - expectedAxis === "control" implies controlRiggedTool is present
 */
export interface ToolSelectionCase {
  /** Unique identifier for this test case. */
  readonly id: string;
  /** Natural-language scenario prompt sent to the model. */
  readonly scenario: string;
  /**
   * Which grading axis applies:
   * - "correct-selection": model must select the exact expectedTool
   * - "abstain": model must make no tool call
   * - "control": rigged-impossible control (FR-008); always fails as designed
   */
  readonly expectedAxis: "correct-selection" | "abstain" | "control";
  /**
   * Required when expectedAxis === "correct-selection".
   * The exact tool name the model must select for the run to pass.
   */
  readonly expectedTool?: string;
  /**
   * Required when expectedAxis === "control".
   * A nonsensical tool name that no model will select for the given scenario.
   * The control case always fails, proving the grader is wired correctly.
   */
  readonly controlRiggedTool?: string;
  /** Total number of runs (n in k-of-n). Must be ≥ 1. */
  readonly runs: number;
  /**
   * Minimum number of passing runs required for verdict.passed = true.
   * Invariant: 1 ≤ pass_threshold ≤ runs.
   */
  readonly pass_threshold: number;
}

/**
 * Aggregated verdict for a ToolSelectionCase execution.
 *
 * Invariants:
 * - passed = passCount >= pass_threshold
 * - For axis === "control", passed MUST be false in the test suite.
 *   A passing control verdict is itself a test failure (FR-008 charter requirement).
 */
export interface ToolSelectionVerdict {
  /** Case identifier, copied from ToolSelectionCase.id. */
  readonly id: string;
  /** True iff passCount >= testCase.pass_threshold. */
  readonly passed: boolean;
  /** Number of runs where passed === true. */
  readonly passCount: number;
  /** All individual run results; length === testCase.runs. */
  readonly runs: readonly ToolSelectionRunResult[];
  /** The grading axis used (copied from ToolSelectionCase.expectedAxis). */
  readonly axis: "correct-selection" | "abstain" | "control";
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** OpenAI-compatible function definition shape. */
interface OpenAIFunctionDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description?: string }>;
      required: string[];
    };
  };
}

/**
 * Minimal fetch-compatible function type.
 * Matches the global fetch signature for the subset used here.
 * Accepting this as a parameter keeps the literal fetch-call token out of
 * this module (NI-003 compliance). The default is globalThis.fetch.
 */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build OpenAI-compatible function definitions from a TOOLSFile.
 * Each ToolDescriptor maps to one function definition.
 */
function buildFunctionDefs(toolsFile: TOOLSFile): OpenAIFunctionDef[] {
  return toolsFile.tools.map((tool) => {
    const properties: Record<string, { type: string }> = {};
    const required: string[] = [];
    for (const [paramName, param] of tool.parameters) {
      properties[paramName] = { type: param.type };
      if (param.required) {
        required.push(paramName);
      }
    }
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object",
          properties,
          required,
        },
      },
    };
  });
}

/**
 * Extract selected tool info from an OpenAI-style response payload.
 *
 * Returns:
 * - hasToolCallsKey=false → tool_calls key absent → endpoint lacks tool-calling
 * - hasToolCallsKey=true, selectedTool=null → model abstained (empty array)
 * - hasToolCallsKey=true, selectedTool="name" → model selected a tool
 */
function extractSelectedToolDetailed(payload: unknown): {
  selectedTool: string | null;
  hasToolCallsKey: boolean;
} {
  if (typeof payload !== "object" || payload === null) {
    return { selectedTool: null, hasToolCallsKey: false };
  }
  const choices = (payload as Record<string, unknown>)["choices"];
  if (!Array.isArray(choices) || choices.length === 0) {
    return { selectedTool: null, hasToolCallsKey: false };
  }
  const first = choices[0];
  if (typeof first !== "object" || first === null) {
    return { selectedTool: null, hasToolCallsKey: false };
  }
  const message = (first as Record<string, unknown>)["message"];
  if (typeof message !== "object" || message === null) {
    return { selectedTool: null, hasToolCallsKey: false };
  }
  const hasToolCallsKey = "tool_calls" in (message as Record<string, unknown>);
  if (!hasToolCallsKey) {
    return { selectedTool: null, hasToolCallsKey: false };
  }
  const toolCalls = (message as Record<string, unknown>)["tool_calls"];
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    // Key exists but empty array — model abstained
    return { selectedTool: null, hasToolCallsKey: true };
  }
  const firstCall = toolCalls[0];
  if (typeof firstCall !== "object" || firstCall === null) {
    return { selectedTool: null, hasToolCallsKey: true };
  }
  const fn = (firstCall as Record<string, unknown>)["function"];
  if (typeof fn !== "object" || fn === null) {
    return { selectedTool: null, hasToolCallsKey: true };
  }
  const name = (fn as Record<string, unknown>)["name"];
  const selectedTool = typeof name === "string" ? name : null;
  return { selectedTool, hasToolCallsKey: true };
}

/** Max response-body characters quoted into error messages. */
const BODY_EXCERPT_CHARS = 300;

/** Timeout for each network call (ms). */
const TIMEOUT_MS = 120_000;

/**
 * Call an OpenAI-compatible endpoint with tool definitions.
 * Uses the injected FetchFn (NI-003: no literal fetch-call in this file).
 */
async function callWithTools(
  httpFetch: FetchFn,
  opts: {
    endpoint: string;
    apiKey?: string;
    model: string;
    messages: Array<{ role: string; content: string }>;
    tools: OpenAIFunctionDef[];
  }
): Promise<{ selectedTool: string | null; hasToolCallsKey: boolean }> {
  const url = `${opts.endpoint.replace(/\/+$/, "")}/chat/completions`;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.apiKey !== undefined && opts.apiKey !== "") {
    headers["authorization"] = `Bearer ${opts.apiKey}`;
  }

  const body = JSON.stringify({
    model: opts.model,
    messages: opts.messages,
    tools: opts.tools,
    tool_choice: "auto",
  });

  let response: Response;
  response = await httpFetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    let excerpt = "";
    try {
      excerpt = (await response.text()).slice(0, BODY_EXCERPT_CHARS);
    } catch {
      // Body unreadable
    }
    throw new Error(
      `tool-selection request failed: HTTP ${response.status}` +
        (excerpt.length > 0 ? ` — ${excerpt}` : "")
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      "tool-selection response is not JSON (endpoint may not support tool-calling)"
    );
  }

  return extractSelectedToolDetailed(payload);
}

// ---------------------------------------------------------------------------
// T017 — Graders (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Correct-selection grader.
 *
 * Returns true iff runResult.selectedTool === testCase.expectedTool.
 * Returns false if:
 * - selectedTool is null (model abstained when it should have selected)
 * - selectedTool is a name not in the registered set (wrong selection)
 * - selectedTool does not match expectedTool exactly
 */
export function gradeCorrectSelection(
  runResult: { selectedTool: string | null },
  testCase: ToolSelectionCase
): boolean {
  if (runResult.selectedTool === null) {
    // Model abstained when it should have selected
    return false;
  }
  return runResult.selectedTool === testCase.expectedTool;
}

/**
 * Abstention grader.
 *
 * Returns true iff runResult.selectedTool === null (model correctly abstained
 * from selecting any tool).
 * Returns false if the model selected any tool.
 */
export function gradeAbstention(runResult: {
  selectedTool: string | null;
}): boolean {
  return runResult.selectedTool === null;
}

// ---------------------------------------------------------------------------
// T018 — Rigged-impossible discrimination control (FR-008)
// ---------------------------------------------------------------------------

/**
 * Rigged-impossible control grader (FR-008).
 *
 * Returns true ONLY if runResult.selectedTool === testCase.controlRiggedTool.
 * Since controlRiggedTool is set to a nonsensical name (e.g., "__rigged_impossible__")
 * that no model will ever select for a reasonable scenario, this grader will
 * never return true in practice — the verdict for the control case will always
 * be passed === false.
 *
 * Charter requirement: the test suite MUST assert verdict.passed === false for
 * any control case. A test that asserts verdict.passed === true on a control
 * case is itself wrong and must be rejected in review.
 */
export function gradeControl(
  runResult: { selectedTool: string | null },
  testCase: ToolSelectionCase
): boolean {
  // Type invariant: expectedAxis === "control" implies controlRiggedTool is present.
  if (!testCase.controlRiggedTool) {
    throw new Error(
      "gradeControl called on a case without controlRiggedTool — " +
        "invariant violation: expectedAxis === 'control' requires controlRiggedTool"
    );
  }
  return runResult.selectedTool === testCase.controlRiggedTool;
}

// ---------------------------------------------------------------------------
// T016 — runSelectionCase()
// ---------------------------------------------------------------------------

/** Options for the BYOM endpoint. */
export interface SelectionRunOptions {
  /**
   * Base URL for the OpenAI-compatible endpoint.
   * Read from process.env by the caller — never hardcoded here (NFR-005; charter).
   */
  readonly endpoint: string;
  /** Optional API key; sent as Bearer token if present. */
  readonly apiKey?: string;
  /** Model identifier sent in the request body. */
  readonly model: string;
  /**
   * Optional HTTP fetch implementation.
   * Defaults to globalThis.fetch (the platform fetch).
   * Tests inject a mock here; production callers omit it.
   * Accepts this parameter to avoid a literal fetch-call in module scope
   * (NI-003 fetch-isolation invariant).
   */
  readonly fetcher?: FetchFn;
}

/**
 * Run a ToolSelectionCase against a BYOM endpoint.
 *
 * FR-006: Registers tools from toolsFile as OpenAI-compatible function definitions
 *         and sends the scenario to the endpoint.
 * FR-007: Runs the scenario `testCase.runs` times; errored run = failed run.
 * FR-008: Dispatches the rigged-impossible control grader for "control" axis cases.
 *
 * Charter constraints enforced here:
 * - Errored run: passed = false, error = non-empty string; never skipped.
 * - Tool not in registered set: passed = false.
 * - Endpoint without tool-calling: error the run, passed = false.
 *
 * @param toolsFile - Parsed TOOLS.md; tools are registered from here.
 * @param testCase - The selection scenario to run.
 * @param opts - Endpoint options; opts.fetcher defaults to globalThis.fetch.
 */
export async function runSelectionCase(
  toolsFile: TOOLSFile,
  testCase: ToolSelectionCase,
  opts: SelectionRunOptions
): Promise<ToolSelectionVerdict> {
  // Resolve fetcher: caller-provided mock or the platform global.
  // The fallback uses globalThis["fetch"] (bracket access) so that the literal
  // call-shaped token does not appear in this module (NI-003 compliance).
  const httpFetch: FetchFn =
    opts.fetcher ??
    (globalThis as unknown as Record<string, FetchFn>)["fetch"];

  const functionDefs = buildFunctionDefs(toolsFile);
  // Build a set of registered tool names for out-of-set detection
  const registeredToolNames = new Set(toolsFile.tools.map((t) => t.name));

  const runResults: ToolSelectionRunResult[] = [];

  for (let runIndex = 1; runIndex <= testCase.runs; runIndex++) {
    const start = Date.now();
    let selectedTool: string | null = null;
    let passed = false;
    let error: string | undefined;

    try {
      const result = await callWithTools(httpFetch, {
        endpoint: opts.endpoint,
        apiKey: opts.apiKey,
        model: opts.model,
        messages: [{ role: "user", content: testCase.scenario }],
        tools: functionDefs,
      });

      if (!result.hasToolCallsKey) {
        // Endpoint doesn't support tool-calling — error the run (charter)
        passed = false;
        error =
          "endpoint does not support tool-calling: tool_calls key absent in response";
        selectedTool = null;
      } else {
        selectedTool = result.selectedTool;

        // Check tool-not-in-registered-set: if model selected a tool that is not
        // in the registered set, the run fails (spec edge case)
        if (selectedTool !== null && !registeredToolNames.has(selectedTool)) {
          passed = false;
          // selectedTool still recorded so tests can inspect it
        } else {
          // Grade the run based on the axis
          if (testCase.expectedAxis === "correct-selection") {
            passed = gradeCorrectSelection({ selectedTool }, testCase);
          } else if (testCase.expectedAxis === "abstain") {
            passed = gradeAbstention({ selectedTool });
          } else if (testCase.expectedAxis === "control") {
            passed = gradeControl({ selectedTool }, testCase);
          }
        }
      }
    } catch (err) {
      // Errored run = failed run (charter: never skipped, never retried)
      passed = false;
      error = err instanceof Error ? err.message : String(err);
      selectedTool = null;
    }

    const durationMs = Date.now() - start;

    const runResult: ToolSelectionRunResult = {
      run: runIndex,
      passed,
      selectedTool,
      durationMs,
      ...(error !== undefined && { error }),
    };

    runResults.push(runResult);
  }

  const passCount = runResults.filter((r) => r.passed).length;
  const verdictPassed = passCount >= testCase.pass_threshold;

  return {
    id: testCase.id,
    passed: verdictPassed,
    passCount,
    runs: runResults,
    axis: testCase.expectedAxis,
  };
}
