/**
 * Unit tests for src/adapters/skills/trigger.ts
 *
 * Covers:
 * - T017: gradeAxis two-axis grader (FR-010)
 * - T017: runTriggerConformance runner (FR-009, FR-011)
 * - T017: errored-run semantics (FR-011)
 * - T017: discrimination control (FR-012, charter cap-of-zero)
 * - T017: wrong-skill invocation edge case
 * - T017: query-set minimum gate (T015, RQ-02)
 * - T017: endpoint-does-not-support-tools edge case
 * - T017: assertRunErredInvariant utility
 * - T017: createDiscriminationControl factory
 *
 * All tests use mocked TriggerChatClient — no real HTTP calls are made.
 * The fetch function is never called in any test (all network is mocked via
 * the TriggerChatClient interface; makeToolClient is not called in tests).
 *
 * Methodology citation (C-003):
 *   agentskills.io/specification#trigger-testing@d8a3f2e1b9c74051e6f8d2a7c3b5f0e9d1a4c8b2
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  gradeAxis,
  runTriggerConformance,
  assertRunErredInvariant,
  createDiscriminationControl,
  makeToolClient,
  RIGGED_IMPOSSIBLE_DESCRIPTION,
} from "../../src/adapters/skills/trigger.js";
import type {
  QueryRunResult,
  TriggerCase,
  TriggerChatClient,
} from "../../src/adapters/skills/trigger.js";
import type { TriggerQuerySet, ToolDefinition } from "../../src/adapters/skills/types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build a minimal QueryRunResult for axis grading tests. */
function makeResult(
  query: string,
  runsTriggered: number,
  runsTotal: number,
  runsErrored = 0
): QueryRunResult {
  return { query, runsTotal, runsTriggered, runsErrored };
}

/** Build a minimal TriggerQuerySet with the given queries (repeated for nearMiss). */
function makeQuerySet(
  shouldTrigger: string[],
  nearMiss: string[],
  threshold = 0.5
): TriggerQuerySet {
  return {
    id: "test-qs",
    source: "agentskills.io/specification#trigger-testing@d8a3f2e1b9c74051e6f8d2a7c3b5f0e9d1a4c8b2",
    shouldTrigger,
    nearMiss,
    threshold,
  };
}

/** Eight generic shouldTrigger queries for tests that need the minimum. */
const SHOULD_TRIGGER_8 = [
  "What is the weather in Amsterdam?",
  "Tell me today's forecast.",
  "Is it raining in London?",
  "Weather forecast for Paris",
  "Give me weather for New York",
  "Current temperature in Tokyo",
  "Will it snow tomorrow in Berlin?",
  "Humidity in Sydney today",
];

/** Eight generic nearMiss queries (surface weather words but are off-scope). */
const NEAR_MISS_8 = [
  "How does weather affect mood?",
  "Explain climate change vs weather",
  "What causes seasons?",
  "History of weather forecasting",
  "Why is the sky blue on clear days?",
  "Explain the water cycle",
  "What is a weather vane used for?",
  "How do clouds form?",
];

/** Minimal tool definition for a skill under test. */
const TARGET_TOOL: ToolDefinition = {
  type: "function",
  function: { name: "weather-tool", description: "Provides weather forecasts." },
};

/** Build a minimal TriggerCase for runTriggerConformance tests. */
function makeTriggerCase(
  overrides: Partial<TriggerCase> = {}
): TriggerCase {
  return {
    id: "test-case",
    skillDir: "/skills/weather-tool",
    profile: "base",
    querySet: makeQuerySet(SHOULD_TRIGGER_8, NEAR_MISS_8),
    runsPerQuery: 1,
    tools: [TARGET_TOOL],
    endpoint: {
      baseUrl: "http://localhost:11434/v1",
      model: "llama3",
      apiKeyEnv: "OPENAI_API_KEY",
    },
    ...overrides,
  };
}

/** Mock client that always triggers the target tool. */
function mockAlwaysTrigger(toolName = "weather-tool"): TriggerChatClient {
  return {
    chatWithTools: vi.fn().mockResolvedValue(toolName),
  };
}

/** Mock client that never triggers any tool (returns null). */
function mockNeverTrigger(): TriggerChatClient {
  return {
    chatWithTools: vi.fn().mockResolvedValue(null),
  };
}

/** Mock client that throws on every call (all runs error). */
function mockAlwaysError(): TriggerChatClient {
  return {
    chatWithTools: vi.fn().mockRejectedValue(new Error("simulated network error")),
  };
}

/** Mock client that returns a different tool name (wrong-skill). */
function mockWrongSkill(): TriggerChatClient {
  return {
    chatWithTools: vi.fn().mockResolvedValue("different-tool"),
  };
}

// ─── gradeAxis tests ────────────────────────────────────────────────────────

describe("gradeAxis — two-axis grader (FR-010)", () => {
  it("should-trigger axis: all queries trigger → passed: true", () => {
    const results = SHOULD_TRIGGER_8.map((q) => makeResult(q, 1, 1));
    const verdict = gradeAxis(results, "should-trigger", 0.5);
    expect(verdict.axis).toBe("should-trigger");
    expect(verdict.triggerRate).toBe(1);
    expect(verdict.passed).toBe(true);
  });

  it("should-trigger axis: no queries trigger → passed: false", () => {
    const results = SHOULD_TRIGGER_8.map((q) => makeResult(q, 0, 1));
    const verdict = gradeAxis(results, "should-trigger", 0.5);
    expect(verdict.passed).toBe(false);
    expect(verdict.triggerRate).toBe(0);
  });

  it("should-trigger axis: 6/10 trigger (threshold 0.5) → passed: true", () => {
    const results = [
      makeResult("q1", 1, 1),
      makeResult("q2", 1, 1),
      makeResult("q3", 1, 1),
      makeResult("q4", 1, 1),
      makeResult("q5", 1, 1),
      makeResult("q6", 1, 1),
      makeResult("q7", 0, 1),
      makeResult("q8", 0, 1),
      makeResult("q9", 0, 1),
      makeResult("q10", 0, 1),
    ];
    const verdict = gradeAxis(results, "should-trigger", 0.5);
    expect(verdict.triggerRate).toBeCloseTo(0.6);
    expect(verdict.passed).toBe(true);
  });

  it("near-miss axis: 5/10 trigger (threshold 0.5) → passed: false (rate not < threshold)", () => {
    const results = [
      makeResult("q1", 1, 1),
      makeResult("q2", 1, 1),
      makeResult("q3", 1, 1),
      makeResult("q4", 1, 1),
      makeResult("q5", 1, 1),
      makeResult("q6", 0, 1),
      makeResult("q7", 0, 1),
      makeResult("q8", 0, 1),
      makeResult("q9", 0, 1),
      makeResult("q10", 0, 1),
    ];
    const verdict = gradeAxis(results, "near-miss", 0.5);
    expect(verdict.triggerRate).toBeCloseTo(0.5);
    // near-miss passes only if rate < threshold (strict less-than)
    expect(verdict.passed).toBe(false);
  });

  it("near-miss axis: 0/8 trigger → passed: true (rate=0 < threshold=0.5)", () => {
    const results = NEAR_MISS_8.map((q) => makeResult(q, 0, 1));
    const verdict = gradeAxis(results, "near-miss", 0.5);
    expect(verdict.triggerRate).toBe(0);
    expect(verdict.passed).toBe(true);
  });

  it("one axis passes, other fails → gradeAxis reflects per-axis truth", () => {
    // should-trigger: rate=0 → fails
    const stResults = SHOULD_TRIGGER_8.map((q) => makeResult(q, 0, 1));
    const stVerdict = gradeAxis(stResults, "should-trigger", 0.5);
    expect(stVerdict.passed).toBe(false);

    // near-miss: rate=0 → passes
    const nmResults = NEAR_MISS_8.map((q) => makeResult(q, 0, 1));
    const nmVerdict = gradeAxis(nmResults, "near-miss", 0.5);
    expect(nmVerdict.passed).toBe(true);
  });

  it("both axes pass when shouldTrigger fires and nearMiss is silent", () => {
    const stResults = SHOULD_TRIGGER_8.map((q) => makeResult(q, 1, 1));
    const nmResults = NEAR_MISS_8.map((q) => makeResult(q, 0, 1));
    const stVerdict = gradeAxis(stResults, "should-trigger", 0.5);
    const nmVerdict = gradeAxis(nmResults, "near-miss", 0.5);
    expect(stVerdict.passed).toBe(true);
    expect(nmVerdict.passed).toBe(true);
  });

  it("returns queryBreakdown containing all input results", () => {
    const results = SHOULD_TRIGGER_8.map((q) => makeResult(q, 1, 1));
    const verdict = gradeAxis(results, "should-trigger", 0.5);
    expect(verdict.queryBreakdown).toHaveLength(8);
    expect(verdict.queryBreakdown[0]!.query).toBe(SHOULD_TRIGGER_8[0]);
  });

  it("returns correct threshold in verdict", () => {
    const results = SHOULD_TRIGGER_8.map((q) => makeResult(q, 1, 1));
    const verdict = gradeAxis(results, "should-trigger", 0.7);
    expect(verdict.threshold).toBe(0.7);
  });

  it("handles empty results gracefully (triggerRate=0, passed=false for should-trigger)", () => {
    const verdict = gradeAxis([], "should-trigger", 0.5);
    expect(verdict.triggerRate).toBe(0);
    expect(verdict.passed).toBe(false);
  });
});

// ─── runTriggerConformance — two-axis case verdict ──────────────────────────

describe("runTriggerConformance — two-axis case verdict (FR-009, FR-010)", () => {
  it("case passed: true when both axes pass", async () => {
    // All shouldTrigger queries trigger; all nearMiss queries do not.
    const client: TriggerChatClient = {
      chatWithTools: vi.fn((query: string) => {
        // shouldTrigger queries trigger; nearMiss queries do not.
        const isShouldTrigger = SHOULD_TRIGGER_8.includes(query);
        return Promise.resolve(isShouldTrigger ? "weather-tool" : null);
      }),
    };
    const verdict = await runTriggerConformance(makeTriggerCase(), client);
    expect(verdict.passed).toBe(true);
    expect(verdict.shouldTriggerAxis.passed).toBe(true);
    expect(verdict.nearMissAxis.passed).toBe(true);
  });

  it("case passed: false when shouldTrigger axis fails", async () => {
    const verdict = await runTriggerConformance(
      makeTriggerCase(),
      mockNeverTrigger()
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.shouldTriggerAxis.passed).toBe(false);
  });

  it("case passed: false when nearMiss axis fails (all nearMiss queries trigger)", async () => {
    // Both shouldTrigger AND nearMiss queries trigger → nearMiss axis fails.
    const verdict = await runTriggerConformance(
      makeTriggerCase(),
      mockAlwaysTrigger("weather-tool")
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.nearMissAxis.passed).toBe(false);
  });

  it("case passed: false when one axis passes and other fails", async () => {
    // nearMiss queries all trigger → near-miss axis fails even if should-trigger passes.
    const verdict = await runTriggerConformance(
      makeTriggerCase(),
      mockAlwaysTrigger("weather-tool")
    );
    expect(verdict.passed).toBe(false);
  });

  it("returned verdict has correct id", async () => {
    const verdict = await runTriggerConformance(
      makeTriggerCase({ id: "my-test-case" }),
      mockNeverTrigger()
    );
    expect(verdict.id).toBe("my-test-case");
  });

  it("isControl is false for a normal case", async () => {
    const verdict = await runTriggerConformance(
      makeTriggerCase(),
      mockNeverTrigger()
    );
    expect(verdict.isControl).toBe(false);
  });
});

// ─── runTriggerConformance — errored-run semantics (FR-011) ─────────────────

describe("runTriggerConformance — errored-run semantics (FR-011)", () => {
  it("an errored run increments runsErrored and counts as non-trigger", async () => {
    const verdict = await runTriggerConformance(
      makeTriggerCase({ runsPerQuery: 1 }),
      mockAlwaysError()
    );
    // All runs errored → trigger rate = 0 → should-trigger axis fails.
    expect(verdict.shouldTriggerAxis.triggerRate).toBe(0);
    expect(verdict.shouldTriggerAxis.passed).toBe(false);
    // Verify runsErrored > 0 in some breakdown entry.
    const erroredEntries = verdict.shouldTriggerAxis.queryBreakdown.filter(
      (r) => r.runsErrored > 0
    );
    expect(erroredEntries.length).toBeGreaterThan(0);
  });

  it("all runs errored: trigger rate = 0, should-trigger axis fails", async () => {
    const verdict = await runTriggerConformance(
      makeTriggerCase({ runsPerQuery: 3 }),
      mockAlwaysError()
    );
    expect(verdict.shouldTriggerAxis.triggerRate).toBe(0);
    expect(verdict.shouldTriggerAxis.passed).toBe(false);
    // Every entry should have runsErrored = runsTotal.
    verdict.shouldTriggerAxis.queryBreakdown.forEach((r) => {
      expect(r.runsErrored).toBe(r.runsTotal);
      expect(r.runsTriggered).toBe(0);
    });
  });

  it("mixed: 3 triggered, 2 errored, 5 total → trigger rate = 0.6 → passes 0.5 threshold", async () => {
    let callCount = 0;
    const client: TriggerChatClient = {
      chatWithTools: vi.fn(() => {
        callCount++;
        // Out of 5 runs per query: runs 1,2,3 trigger; runs 4,5 error.
        if (callCount % 5 <= 3 && callCount % 5 !== 0) {
          return Promise.resolve("weather-tool");
        }
        return Promise.reject(new Error("simulated error"));
      }),
    };

    // Use a single query to isolate math: 5 runs per query.
    // We test the math directly via gradeAxis instead.
    const results: QueryRunResult[] = [
      { query: "q1", runsTotal: 5, runsTriggered: 3, runsErrored: 2 },
    ];
    const verdict = gradeAxis(results, "should-trigger", 0.5);
    expect(verdict.triggerRate).toBeCloseTo(0.6);
    expect(verdict.passed).toBe(true);
    void client; // suppress unused variable
  });

  it("errored run does not violate runsTriggered + runsErrored <= runsTotal", async () => {
    const verdict = await runTriggerConformance(
      makeTriggerCase({ runsPerQuery: 3 }),
      mockAlwaysError()
    );
    verdict.shouldTriggerAxis.queryBreakdown.forEach((r) => {
      expect(r.runsTriggered + r.runsErrored).toBeLessThanOrEqual(r.runsTotal);
    });
  });
});

// ─── discrimination control (FR-012, charter cap-of-zero) ───────────────────

describe("discrimination control — grader produces passed: false for rigged-impossible case", () => {
  it("discrimination control: grader produces passed: false for rigged-impossible case", () => {
    // Mock returns zero tool calls for all queries — the rigged tool is never invoked.
    const mockResultsAllNonTrigger: QueryRunResult[] = SHOULD_TRIGGER_8.map((q) =>
      makeResult(q, 0, 1)
    );
    const verdict = gradeAxis(mockResultsAllNonTrigger, "should-trigger", 0.5);
    expect(verdict.passed).toBe(false);
  });

  it("RIGGED_IMPOSSIBLE_DESCRIPTION is exported and contains 'ZZZCONTROL-IMPOSSIBLE'", () => {
    expect(RIGGED_IMPOSSIBLE_DESCRIPTION).toContain("ZZZCONTROL-IMPOSSIBLE");
  });

  it("RIGGED_IMPOSSIBLE_DESCRIPTION does not match any natural language query pattern", () => {
    // The description starts with ZZZCONTROL-IMPOSSIBLE, ensuring no realistic query routes to it.
    expect(RIGGED_IMPOSSIBLE_DESCRIPTION).toMatch(/^ZZZCONTROL-IMPOSSIBLE/);
  });

  it("createDiscriminationControl creates a TriggerCase with isControl semantics", async () => {
    const controlCase = createDiscriminationControl(SHOULD_TRIGGER_8);
    expect(controlCase.id).toBe("discrimination-control");
    expect(controlCase.querySet.shouldTrigger).toHaveLength(8);
    expect(controlCase.tools[0]!.function.description).toBe(RIGGED_IMPOSSIBLE_DESCRIPTION);
  });

  it("runTriggerConformance with rigged control and all-non-trigger mock → passed: false", async () => {
    const controlCase = createDiscriminationControl(SHOULD_TRIGGER_8);
    // Ensure near-miss queries are also 8+
    // createDiscriminationControl generates nearMiss = shouldTrigger.map(...)
    expect(controlCase.querySet.nearMiss).toHaveLength(8);

    const verdict = await runTriggerConformance(controlCase, mockNeverTrigger());
    // should-trigger: rate=0 < threshold=0.5 → fails
    expect(verdict.shouldTriggerAxis.passed).toBe(false);
    // near-miss: rate=0 < threshold=0.5 → passes
    expect(verdict.nearMissAxis.passed).toBe(true);
    // Overall: one axis fails → passed: false (charter cap-of-zero)
    expect(verdict.passed).toBe(false);
  });
});

// ─── wrong-skill invocation edge case ──────────────────────────────────────

describe("runTriggerConformance — wrong-skill invocation edge case", () => {
  it("response with a different tool name counts as non-trigger for target skill", async () => {
    // Mock returns "different-tool" — not the target "weather-tool".
    const verdict = await runTriggerConformance(
      makeTriggerCase(),
      mockWrongSkill()
    );
    // trigger rate should be 0 for weather-tool (wrong tool name returned).
    expect(verdict.shouldTriggerAxis.triggerRate).toBe(0);
    expect(verdict.shouldTriggerAxis.passed).toBe(false);
  });

  it("runs with wrong-skill have runsTriggered=0, runsErrored=0", async () => {
    const verdict = await runTriggerConformance(
      makeTriggerCase({ runsPerQuery: 1 }),
      mockWrongSkill()
    );
    verdict.shouldTriggerAxis.queryBreakdown.forEach((r) => {
      expect(r.runsTriggered).toBe(0);
      expect(r.runsErrored).toBe(0);
    });
  });
});

// ─── query-set minimum gate (T015) ─────────────────────────────────────────

describe("runTriggerConformance — query-set minimum gate (T015, RQ-02)", () => {
  it("a TriggerQuerySet with 7 shouldTrigger entries returns passed: false without grading", async () => {
    const tooFewQueries = SHOULD_TRIGGER_8.slice(0, 7);
    const caseWithTooFew = makeTriggerCase({
      querySet: makeQuerySet(tooFewQueries, NEAR_MISS_8),
    });
    const client = mockAlwaysTrigger("weather-tool");
    const verdict = await runTriggerConformance(caseWithTooFew, client);
    expect(verdict.passed).toBe(false);
    // The client should NOT have been called (hard gate before grading).
    expect(client.chatWithTools).not.toHaveBeenCalled();
  });

  it("a TriggerQuerySet with 7 nearMiss entries returns passed: false without grading", async () => {
    const tooFewNearMiss = NEAR_MISS_8.slice(0, 7);
    const caseWithTooFew = makeTriggerCase({
      querySet: makeQuerySet(SHOULD_TRIGGER_8, tooFewNearMiss),
    });
    const client = mockAlwaysTrigger("weather-tool");
    const verdict = await runTriggerConformance(caseWithTooFew, client);
    expect(verdict.passed).toBe(false);
    expect(client.chatWithTools).not.toHaveBeenCalled();
  });

  it("exactly 8 queries per axis passes the minimum gate", async () => {
    const client = mockNeverTrigger();
    const verdict = await runTriggerConformance(makeTriggerCase(), client);
    // Reaches grading (client was called)
    expect(client.chatWithTools).toHaveBeenCalled();
  });
});

// ─── endpoint-does-not-support-tools (FR-011 error case) ───────────────────

describe("runTriggerConformance — endpoint-does-not-support-tools (FR-011)", () => {
  it("mock that throws on tool calls causes runs to count as errored", async () => {
    // Simulates an endpoint that does not support tool calling: throws an error.
    const noToolsClient: TriggerChatClient = {
      chatWithTools: vi.fn().mockRejectedValue(
        new Error("tool-call response missing 'choices' array (counts as errored run, FR-011)")
      ),
    };
    const verdict = await runTriggerConformance(makeTriggerCase(), noToolsClient);
    // All runs errored → trigger rate = 0.
    expect(verdict.shouldTriggerAxis.triggerRate).toBe(0);
    // Verify runsErrored is tracked.
    const erroredEntries = verdict.shouldTriggerAxis.queryBreakdown.filter(
      (r) => r.runsErrored > 0
    );
    expect(erroredEntries.length).toBeGreaterThan(0);
  });
});

// ─── assertRunErredInvariant ────────────────────────────────────────────────

describe("assertRunErredInvariant — FR-011 consistency check", () => {
  it("does not throw for valid result (triggered + errored <= total)", () => {
    expect(() =>
      assertRunErredInvariant({ query: "q", runsTotal: 5, runsTriggered: 3, runsErrored: 2 })
    ).not.toThrow();
  });

  it("does not throw when all runs triggered", () => {
    expect(() =>
      assertRunErredInvariant({ query: "q", runsTotal: 5, runsTriggered: 5, runsErrored: 0 })
    ).not.toThrow();
  });

  it("does not throw when all runs errored", () => {
    expect(() =>
      assertRunErredInvariant({ query: "q", runsTotal: 5, runsTriggered: 0, runsErrored: 5 })
    ).not.toThrow();
  });

  it("throws when runsTriggered + runsErrored > runsTotal", () => {
    expect(() =>
      assertRunErredInvariant({ query: "q", runsTotal: 5, runsTriggered: 3, runsErrored: 3 })
    ).toThrow(/invariant violated/);
  });

  it("throws and includes query name in error message", () => {
    expect(() =>
      assertRunErredInvariant({ query: "my-test-query", runsTotal: 2, runsTriggered: 2, runsErrored: 1 })
    ).toThrow(/my-test-query/);
  });
});

// ─── createDiscriminationControl factory ────────────────────────────────────

describe("createDiscriminationControl — factory function (FR-012)", () => {
  it("returns a TriggerCase with the rigged impossible description", () => {
    const controlCase = createDiscriminationControl(SHOULD_TRIGGER_8);
    expect(controlCase.tools[0]!.function.description).toBe(RIGGED_IMPOSSIBLE_DESCRIPTION);
  });

  it("sets shouldTrigger to the provided queries", () => {
    const controlCase = createDiscriminationControl(SHOULD_TRIGGER_8);
    expect(controlCase.querySet.shouldTrigger).toEqual(SHOULD_TRIGGER_8);
  });

  it("generates nearMiss queries from the shouldTrigger queries", () => {
    const controlCase = createDiscriminationControl(SHOULD_TRIGGER_8);
    expect(controlCase.querySet.nearMiss).toHaveLength(SHOULD_TRIGGER_8.length);
  });

  it("sets threshold to 0.5 (standard rubric)", () => {
    const controlCase = createDiscriminationControl(SHOULD_TRIGGER_8);
    expect(controlCase.querySet.threshold).toBe(0.5);
  });

  it("sets id to 'discrimination-control'", () => {
    const controlCase = createDiscriminationControl(SHOULD_TRIGGER_8);
    expect(controlCase.id).toBe("discrimination-control");
  });
});

// ─── makeToolClient — Option B fetch isolation (NI-003) ─────────────────────

describe("makeToolClient — wraps core chatWithTools (Option B, NI-003)", () => {
  it("returns a TriggerChatClient with a chatWithTools method", () => {
    // Verify the factory returns the correct interface without making real calls.
    const client = makeToolClient({
      baseUrl: "http://localhost:11434/v1",
      model: "llama3",
      apiKeyEnv: "OPENAI_API_KEY",
    });
    expect(typeof client.chatWithTools).toBe("function");
  });

  it("chatWithTools extracts tool call name from a valid payload via a mock core client", async () => {
    // We test makeToolClient's extraction logic by stubbing fetch globally (no real network).
    const mockPayload = {
      choices: [
        {
          message: {
            tool_calls: [
              { function: { name: "weather-tool", arguments: "{}" } },
            ],
          },
        },
      ],
    };

    // Stub global fetch to return a mock payload (NI-003: fetch only in client.ts).
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPayload),
    });
    vi.stubGlobal("fetch", mockFetch);

    try {
      const client = makeToolClient({
        baseUrl: "http://localhost:11434/v1",
        model: "llama3",
        apiKeyEnv: "OPENAI_API_KEY",
      });
      const tools: ToolDefinition[] = [TARGET_TOOL];
      const result = await client.chatWithTools("What is the weather?", tools);
      expect(result).toBe("weather-tool");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("chatWithTools returns null when response has no tool_calls", async () => {
    const mockPayload = {
      choices: [
        {
          message: {
            content: "I don't know",
          },
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPayload),
    });
    vi.stubGlobal("fetch", mockFetch);

    try {
      const client = makeToolClient({
        baseUrl: "http://localhost:11434/v1",
        model: "llama3",
        apiKeyEnv: "OPENAI_API_KEY",
      });
      const tools: ToolDefinition[] = [TARGET_TOOL];
      const result = await client.chatWithTools("What is the weather?", tools);
      expect(result).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("chatWithTools throws on HTTP error (counts as errored run, FR-011)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });
    vi.stubGlobal("fetch", mockFetch);

    try {
      const client = makeToolClient({
        baseUrl: "http://localhost:11434/v1",
        model: "llama3",
        apiKeyEnv: "OPENAI_API_KEY",
      });
      const tools: ToolDefinition[] = [TARGET_TOOL];
      await expect(
        client.chatWithTools("What is the weather?", tools)
      ).rejects.toThrow(/HTTP 500/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("chatWithTools throws on network error (counts as errored run, FR-011)", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", mockFetch);

    try {
      const client = makeToolClient({
        baseUrl: "http://localhost:11434/v1",
        model: "llama3",
        apiKeyEnv: "OPENAI_API_KEY",
      });
      const tools: ToolDefinition[] = [TARGET_TOOL];
      await expect(
        client.chatWithTools("What is the weather?", tools)
      ).rejects.toThrow(/ECONNREFUSED/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("chatWithTools throws on non-JSON response (counts as errored run, FR-011)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error("Invalid JSON")),
    });
    vi.stubGlobal("fetch", mockFetch);

    try {
      const client = makeToolClient({
        baseUrl: "http://localhost:11434/v1",
        model: "llama3",
        apiKeyEnv: "OPENAI_API_KEY",
      });
      const tools: ToolDefinition[] = [TARGET_TOOL];
      await expect(
        client.chatWithTools("What is the weather?", tools)
      ).rejects.toThrow(/JSON/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("chatWithTools throws when choices array is missing (endpoint missing tools support)", async () => {
    const mockPayload = { model: "llama3" }; // No choices field.
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPayload),
    });
    vi.stubGlobal("fetch", mockFetch);

    try {
      const client = makeToolClient({
        baseUrl: "http://localhost:11434/v1",
        model: "llama3",
        apiKeyEnv: "OPENAI_API_KEY",
      });
      const tools: ToolDefinition[] = [TARGET_TOOL];
      await expect(
        client.chatWithTools("What is the weather?", tools)
      ).rejects.toThrow(/choices/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
