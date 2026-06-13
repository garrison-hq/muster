/**
 * Skills adapter — behavioral trigger conformance.
 *
 * Presents a skill as an OpenAI-compatible tool, runs labeled queries against
 * a BYOM endpoint N times per query, grades two axes (should-trigger and
 * near-miss), aggregates with k-of-n semantics (errored run = failed run),
 * and ships a rigged-impossible discrimination control.
 *
 * FR-009, FR-010, FR-011, FR-012.
 * C-001: core extension — Option B chosen (core chatWithTools extension).
 *
 * Work log — ChatClient extension decision (pre-code, per T013):
 *   Chose OPTION B (core generic extension via makeClientWithTools).
 *   Rationale: The NI-003 invariant (tests/unit/invariants.test.ts) requires
 *   the fetch call to appear ONLY in src/core/behavioral/client.ts. Option A
 *   (local fetch wrapper in trigger.ts) would violate NI-003. Option B adds a
 *   makeClientWithTools factory to client.ts that exposes chatWithTools with
 *   messages and a generic tools parameter — no skill types enter core.
 *   The tools:unknown[] parameter and unknown return type keep core
 *   adapter-agnostic. trigger.ts casts its ToolDefinition[] to unknown[] at
 *   the call site. The NI-002 invariant confirms core isolation at every run.
 *   C-001 is satisfied: core has no skill-specific knowledge.
 *
 * NFR-005: no credentials in code; API key from env vars only.
 *
 * k-of-n vs pass^k distinction (charter behavioral grading tiers):
 *   - k-of-n (this module): trigger axes are STYLISTIC axes. A query passes if
 *     `runsTriggered / runsTotal >= threshold`. The axis trigger rate is the
 *     aggregate sum(triggered)/sum(total) across all queries. No pass^k needed.
 *   - pass^k (not here): safety-critical graders in future layers require ALL
 *     runs to pass (k=n). Trigger axes are NOT safety-critical per the charter.
 *
 * Methodology citation (C-003):
 *   agentskills.io/specification#trigger-testing@d8a3f2e1b9c74051e6f8d2a7c3b5f0e9d1a4c8b2
 */

import { makeClientWithTools } from "../../core/behavioral/client.js";
import type { EndpointConfig } from "../../core/behavioral/types.js";
import type {
  AxisVerdict,
  QueryRunResult,
  ToolDefinition,
  TriggerCase,
  TriggerQuerySet,
  TriggerVerdict,
} from "./types.js";

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * The rigged-impossible control skill description.
 * A skill with this description cannot plausibly match any realistic query.
 * Used in SC-004 discrimination control tests (FR-012).
 * Exported so the test runner and fixture suite can use it for mocked cases.
 */
export const RIGGED_IMPOSSIBLE_DESCRIPTION =
  "ZZZCONTROL-IMPOSSIBLE: This tool is never invoked by any realistic query. " +
  "It exists solely to verify the trigger grader can produce a failed result.";

/** Minimum queries per axis enforced before grading begins (RQ-02, data-model.md). */
const MIN_QUERIES_PER_AXIS = 8;

// ─── TriggerChatClient interface (adapter-private) ─────────────────────────

/**
 * Adapter-private chat client for tool-calling behavioral cases.
 *
 * Defined here in trigger.ts (adapter layer), not in src/core/.
 * Tests inject a mock implementation; the live implementation (makeToolClient)
 * wraps the core `makeClientWithTools` factory (Option B).
 *
 * An errored call MUST throw; the runner catches and counts it as
 * a non-trigger (FR-011).
 */
export interface TriggerChatClient {
  /**
   * Send a chat message with tool definitions and return the name of the
   * called tool, or null if no tool was called.
   */
  chatWithTools(
    userMessage: string,
    tools: ToolDefinition[]
  ): Promise<string | null>;
}

// ─── Tool-call response parser (adapter-private) ───────────────────────────

/**
 * Extract the first tool call function name from an OpenAI-compatible response.
 * Returns null if no tool_calls present (non-trigger run).
 * Throws if the response structure is malformed in a way that indicates
 * an endpoint that does not support tool calling (FR-011 error case).
 */
function extractToolCallName(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("tool-call response is not a JSON object (counts as errored run, FR-011)");
  }
  const p = payload as Record<string, unknown>;
  const choices = p["choices"];
  if (!Array.isArray(choices)) {
    throw new Error("tool-call response missing 'choices' array (counts as errored run, FR-011)");
  }
  if (choices.length === 0) {
    throw new Error("tool-call response has empty 'choices' array (counts as errored run, FR-011)");
  }
  const first = choices[0];
  if (typeof first !== "object" || first === null) return null;
  const message = (first as Record<string, unknown>)["message"];
  if (typeof message !== "object" || message === null) return null;
  const toolCalls = (message as Record<string, unknown>)["tool_calls"];
  // No tool_calls key: the model chose not to use a tool (non-trigger, not an error).
  if (toolCalls === undefined || toolCalls === null) return null;
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null;
  const firstCall = toolCalls[0];
  if (typeof firstCall !== "object" || firstCall === null) return null;
  const fn = (firstCall as Record<string, unknown>)["function"];
  if (typeof fn !== "object" || fn === null) return null;
  const name = (fn as Record<string, unknown>)["name"];
  return typeof name === "string" ? name : null;
}

// ─── Live TriggerChatClient factory (Option B — wraps core makeClientWithTools)

/**
 * Build a TriggerChatClient for an OpenAI-compatible endpoint.
 *
 * Option B: wraps the core `makeClientWithTools` factory (client.ts).
 * The core method returns `unknown` (raw response payload); trigger.ts
 * extracts the tool call name via extractToolCallName (adapter logic).
 * No direct fetch call appears here — all network is isolated in client.ts (NI-003).
 * NFR-005: API key read from process.env[endpoint.apiKeyEnv] at call time.
 */
export function makeToolClient(endpoint: EndpointConfig): TriggerChatClient {
  const coreClient = makeClientWithTools(endpoint);

  return {
    async chatWithTools(
      userMessage: string,
      tools: ToolDefinition[]
    ): Promise<string | null> {
      // Cast ToolDefinition[] to unknown[] — core accepts generic tools (C-001).
      const payload = await coreClient.chatWithTools(
        [{ role: "user" as const, content: userMessage }],
        tools as unknown[]
      );
      // Parse the tool call name from the raw payload (adapter-layer concern).
      return extractToolCallName(payload);
    },
  };
}

// ─── QueryRunResult invariant ───────────────────────────────────────────────

/**
 * Assert the errored-run invariant: runsTriggered + runsErrored must not exceed
 * runsTotal. Throws if violated (internal consistency check, FR-011).
 *
 * k-of-n accounting: each run is one of: triggered, errored (non-trigger), or
 * returned null/wrong-tool (non-trigger). So triggered + errored <= total.
 *
 * Exported so test suites can verify the invariant holds on produced results.
 */
export function assertRunErredInvariant(result: QueryRunResult): void {
  if (result.runsTriggered + result.runsErrored > result.runsTotal) {
    throw new Error(
      `QueryRunResult invariant violated for query "${result.query}": ` +
        `runsTriggered(${result.runsTriggered}) + runsErrored(${result.runsErrored}) ` +
        `> runsTotal(${result.runsTotal})`
    );
  }
}

// ─── Axis grader (T014 — exported, synchronous) ────────────────────────────

/**
 * Grade one axis from pre-computed QueryRunResult array.
 *
 * Two-axis methodology (FR-010):
 * - "should-trigger": passed iff aggregate trigger rate >= threshold.
 * - "near-miss": passed iff aggregate trigger rate < threshold.
 *
 * k-of-n aggregation (charter, C-003):
 * - triggerRate = sum(runsTriggered) / sum(runsTotal) across all queries.
 * - runsPerQuery is N; errored runs are already in runsTotal and NOT in
 *   runsTriggered — so the aggregate naturally penalizes errors (FR-011).
 * - This is k-of-n (stylistic), NOT pass^k (safety-critical).
 *
 * Normative source: agentskills.io/specification#trigger-testing
 * @d8a3f2e1b9c74051e6f8d2a7c3b5f0e9d1a4c8b2 (C-003).
 *
 * @param results Pre-computed QueryRunResult array for this axis.
 * @param axis Which axis is being graded.
 * @param threshold Trigger rate threshold (0–1).
 */
export function gradeAxis(
  results: QueryRunResult[],
  axis: "should-trigger" | "near-miss",
  threshold: number
): AxisVerdict {
  const totalRuns = results.reduce((sum, r) => sum + r.runsTotal, 0);
  const totalTriggered = results.reduce((sum, r) => sum + r.runsTriggered, 0);
  const triggerRate = totalRuns > 0 ? totalTriggered / totalRuns : 0;

  // should-trigger: rate >= threshold passes; near-miss: rate < threshold passes.
  const passed =
    axis === "should-trigger"
      ? triggerRate >= threshold
      : triggerRate < threshold;

  return {
    axis,
    triggerRate,
    threshold,
    passed,
    queryBreakdown: results,
  };
}

// ─── Per-query runner (internal) ────────────────────────────────────────────

/**
 * Run a single query N times against the endpoint, counting triggers.
 *
 * An errored run counts as a non-trigger (FR-011): runsErrored is incremented
 * and the run is NOT added to runsTriggered.
 */
async function runSingleQuery(
  query: string,
  tools: ToolDefinition[],
  targetToolName: string,
  runsPerQuery: number,
  client: TriggerChatClient
): Promise<QueryRunResult> {
  let runsTriggered = 0;
  let runsErrored = 0;

  for (let i = 0; i < runsPerQuery; i++) {
    try {
      const calledTool = await client.chatWithTools(query, tools);
      // A trigger is exactly the target tool being called.
      // Wrong-skill: calledTool is non-null but != targetToolName → non-trigger.
      if (calledTool === targetToolName) {
        runsTriggered++;
      }
    } catch {
      // Errored run = failed run = non-trigger (FR-011).
      // Never skipped, never retried. Remaining queries continue.
      runsErrored++;
    }
  }

  const result: QueryRunResult = {
    query,
    runsTotal: runsPerQuery,
    runsTriggered,
    runsErrored,
  };

  // Internal consistency check.
  assertRunErredInvariant(result);

  return result;
}

// ─── Discrimination control (T016) ─────────────────────────────────────────

/**
 * Build a rigged-impossible discrimination control TriggerCase.
 *
 * The control uses RIGGED_IMPOSSIBLE_DESCRIPTION as the skill description.
 * Any reasonable LLM will NOT invoke a tool with this description for
 * realistic queries, so the should-trigger axis produces rate ≈ 0 and
 * passes: false. This proves the grader can discriminate (FR-012).
 *
 * Charter cap-of-zero: the test in T017 MUST assert passed: false for this
 * control (never mock away the assertion — charter violation if missing).
 *
 * @param queries Query strings for shouldTrigger axis (plausible real-world
 *   queries such as weather, code help, etc. — things a model would route to
 *   a useful tool, NOT to the rigged impossible tool).
 */
export function createDiscriminationControl(queries: string[]): TriggerCase {
  // Near-miss queries: same realistic queries are also near-miss for the rigged
  // tool, since the rigged tool should never be chosen regardless of framing.
  const nearMissQueries = queries.map((q) => `near-miss variant: ${q}`);

  const querySet: TriggerQuerySet = {
    id: "discrimination-control",
    source:
      "agentskills.io/specification#trigger-testing@d8a3f2e1b9c74051e6f8d2a7c3b5f0e9d1a4c8b2",
    shouldTrigger: queries,
    nearMiss: nearMissQueries,
    threshold: 0.5,
  };

  const tools: ToolDefinition[] = [
    {
      type: "function",
      function: {
        name: "rigged-impossible-control",
        description: RIGGED_IMPOSSIBLE_DESCRIPTION,
      },
    },
  ];

  return {
    id: "discrimination-control",
    skillDir: "",
    profile: "base",
    querySet,
    runsPerQuery: 1,
    tools,
    endpoint: {
      baseUrl: process.env["MUSTER_BASE_URL"] ?? "http://localhost:11434/v1",
      model: process.env["MUSTER_MODEL"] ?? "llama3",
      apiKeyEnv:
        process.env["MUSTER_API_KEY"] !== undefined
          ? "MUSTER_API_KEY"
          : "OPENAI_API_KEY",
    },
  };
}

// ─── Main runner (T013 + T015) ──────────────────────────────────────────────

/**
 * Run a behavioral trigger conformance case.
 *
 * This is the primary exported function for WP03. It:
 * 1. Validates the query set minimum (hard gate — 8 per axis).
 * 2. Runs all shouldTrigger queries N times and collects QueryRunResults.
 * 3. Runs all nearMiss queries N times and collects QueryRunResults.
 * 4. Grades both axes via gradeAxis().
 * 5. Returns TriggerVerdict: passed iff BOTH axes pass (FR-010).
 *
 * If the query set does not meet the minimum, returns a TriggerVerdict with
 * passed: false and zeroed axis verdicts (hard gate, T015 step 2).
 *
 * Errored runs: counted as non-triggers, never skipped, never retried (FR-011).
 * Wrong-skill runs: counted as non-triggers for the target skill.
 *
 * Discrimination control: when isControl is true and the verdict passes, a
 * warning is logged (unexpected model behavior — model quality issue, not a
 * grader bug). The verdict accurately reflects what happened.
 *
 * Methodology: agentskills.io/specification#trigger-testing
 * @d8a3f2e1b9c74051e6f8d2a7c3b5f0e9d1a4c8b2 (C-003).
 *
 * @param triggerCase The trigger case configuration.
 * @param client The TriggerChatClient (injected; live or mocked for tests).
 * @returns TriggerVerdict aggregating both axes.
 */
export async function runTriggerConformance(
  triggerCase: TriggerCase,
  client: TriggerChatClient
): Promise<TriggerVerdict> {
  const { querySet, runsPerQuery, id } = triggerCase;

  // T015 step 2: hard gate — return passed: false if minimum not met.
  if (
    querySet.shouldTrigger.length < MIN_QUERIES_PER_AXIS ||
    querySet.nearMiss.length < MIN_QUERIES_PER_AXIS
  ) {
    const zeroResults: QueryRunResult[] = [];
    const zeroAxis = (axis: "should-trigger" | "near-miss"): AxisVerdict => ({
      axis,
      triggerRate: 0,
      threshold: querySet.threshold,
      passed: false,
      queryBreakdown: zeroResults,
    });
    return {
      id,
      passed: false,
      shouldTriggerAxis: zeroAxis("should-trigger"),
      nearMissAxis: zeroAxis("near-miss"),
      isControl: triggerCase.tools[0]?.function.name === "rigged-impossible-control",
    };
  }

  const targetTool = triggerCase.tools[0];
  if (targetTool === undefined) {
    throw new Error(`Trigger case "${id}" has no tools defined`);
  }
  const targetToolName = targetTool.function.name;

  // Run shouldTrigger axis queries.
  const shouldTriggerResults: QueryRunResult[] = [];
  for (const query of querySet.shouldTrigger) {
    const result = await runSingleQuery(
      query,
      triggerCase.tools,
      targetToolName,
      runsPerQuery,
      client
    );
    shouldTriggerResults.push(result);
  }

  // Run nearMiss axis queries.
  const nearMissResults: QueryRunResult[] = [];
  for (const query of querySet.nearMiss) {
    const result = await runSingleQuery(
      query,
      triggerCase.tools,
      targetToolName,
      runsPerQuery,
      client
    );
    nearMissResults.push(result);
  }

  const shouldTriggerAxis = gradeAxis(
    shouldTriggerResults,
    "should-trigger",
    querySet.threshold
  );
  const nearMissAxis = gradeAxis(
    nearMissResults,
    "near-miss",
    querySet.threshold
  );

  const isControl = triggerCase.tools[0]?.function.name === "rigged-impossible-control";
  const passed = shouldTriggerAxis.passed && nearMissAxis.passed;

  // Discrimination control warning: if isControl and grader says passed, the
  // model unexpectedly invoked the rigged tool — model quality issue (FR-012).
  if (isControl && passed) {
    console.warn(
      `[WP03 discrimination control] TriggerCase "${id}" unexpectedly passed. ` +
        `The rigged-impossible tool was invoked for real queries. ` +
        `This indicates a model quality issue, not a grader bug. ` +
        `shouldTriggerRate=${shouldTriggerAxis.triggerRate.toFixed(3)}`
    );
  }

  return {
    id,
    passed,
    shouldTriggerAxis,
    nearMissAxis,
    isControl,
  };
}

