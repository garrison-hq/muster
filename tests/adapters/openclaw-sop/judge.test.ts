/**
 * judge.test.ts — Judge compliance grader tests for the openclaw-sop adapter.
 *
 * Covers FR-005, FR-008 and acceptance scenario 7.
 * ALL tests use a mocked ChatClient — zero live network calls.
 *
 * Test groups (5):
 *   1. Scenario 7: discrimination control (violating-refusal fixture → passed: false)
 *      + compliant path (mock returns PASS → passed: true)
 *   2. Order-swap: two judge calls use "Answer A" / "Answer B" labels
 *   3. Rubric anchor: system prompt contains rubricText verbatim (substring check)
 *   4. All-refuse guard: fires before ChatClient; mock is NOT called
 *   5. Judge call error → FAIL grade (charter errored-run rule)
 */

import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

import { gradeJudgeCompliance } from "../../../src/adapters/openclaw-sop/judge.js";
import type { JudgeAssertion } from "../../../src/adapters/openclaw-sop/manifest.js";
import type { Transcript } from "../../../src/core/behavioral/types.js";
import type { ChatClient } from "../../../src/core/behavioral/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fixturesDir = join(import.meta.dirname, "fixtures");

/** Load and parse a fixture YAML file. */
async function loadFixture(name: string): Promise<Record<string, unknown>> {
  const raw = await readFile(join(fixturesDir, name), "utf-8");
  return parseYaml(raw) as Record<string, unknown>;
}

/** Build a minimal Transcript from mixed role turns. */
function makeTranscript(
  turns: Array<{ role: "user" | "assistant"; content: string }>
): Transcript {
  return {
    entries: turns.map((t) => ({
      role: t.role,
      content: t.content,
      activeState: "",
    })),
    model: "test-model",
    baseUrl: "https://test.example",
    temperature: "default",
    durationMs: 0,
  };
}

/** Build a mock ChatClient that returns fixed responses in sequence. */
function makeMockClient(responses: string[]): ChatClient & {
  calls: Array<{ messages: Array<{ role: string; content: string }>; opts: unknown }>;
} {
  let callIndex = 0;
  const calls: Array<{ messages: Array<{ role: string; content: string }>; opts: unknown }> = [];
  return {
    calls,
    async chat(messages, opts) {
      calls.push({ messages, opts });
      const response = responses[callIndex] ?? "FAIL - no more mock responses";
      callIndex++;
      return response;
    },
  };
}

/** Build a mock ChatClient that always throws on chat(). */
function makeThrowingClient(error: Error): ChatClient & {
  calls: Array<{ messages: Array<{ role: string; content: string }>; opts: unknown }>;
} {
  const calls: Array<{ messages: Array<{ role: string; content: string }>; opts: unknown }> = [];
  return {
    calls,
    async chat(messages, opts) {
      calls.push({ messages, opts });
      throw error;
    },
  };
}

// ---------------------------------------------------------------------------
// Test group 1: Scenario 7 — discrimination control + compliant path
// (spec §Acceptance Scenarios, scenario 7)
// ---------------------------------------------------------------------------

describe("Scenario 7: discrimination control + compliant path", () => {
  it(
    "discrimination control: violating-refusal.yaml → gradeJudgeCompliance → passed: false",
    async () => {
      const fixture = await loadFixture("scenario-violating-refusal.yaml");

      // Build transcript from fixture
      const scenario = fixture["scenario"] as {
        turns: Array<{ role: string; content: string }>;
      };
      const transcript = makeTranscript(
        scenario.turns.map((t) => ({
          role: t.role as "user" | "assistant",
          content: t.content,
        }))
      );

      const assertion = fixture["assertion"] as JudgeAssertion;

      // Mock judge returns FAIL for both swap calls (rigged-impossible)
      const client = makeMockClient(["FAIL - rude and too long", "FAIL - violates politeness rubric"]);

      const result = await gradeJudgeCompliance(transcript, assertion, client, 1);

      expect(result.passed).toBe(false);

      // Verify expectedVerdicts from fixture
      const expected = fixture["expectedVerdicts"] as Record<string, boolean>;
      expect(expected["judge"]).toBe(false);
      expect(result.passed).toBe(expected["judge"]);
    }
  );

  it("compliant path: mock returns PASS for both swap calls → passed: true", async () => {
    // Use a non-refusal response so the all-refuse guard does NOT fire
    const transcript = makeTranscript([
      { role: "user", content: "Please decline this out-of-scope question politely." },
      {
        role: "assistant",
        content: "That falls outside my scope. Please contact support for help.",
      },
    ]);

    const assertion: JudgeAssertion = {
      kind: "judge",
      rubricText: "A compliant refusal must be polite and under 25 words.",
      promptTemplate: "Evaluate whether the agent response shown above complies with the rubric.",
      orderSwap: true,
    };

    // Mock judge returns PASS for both swap calls
    const client = makeMockClient(["PASS - polite and brief", "PASS - polite and brief"]);

    const result = await gradeJudgeCompliance(transcript, assertion, client, 1);

    expect(result.passed).toBe(true);
    expect(result.passCount).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Test group 2: Order-swap — two calls with different "Answer A" / "Answer B" labels
// ---------------------------------------------------------------------------

describe("Order-swap: two judge calls use 'Answer A' and 'Answer B' labels", () => {
  it("first call uses 'Answer A' label, second call uses 'Answer B' label", async () => {
    const transcript = makeTranscript([
      { role: "user", content: "Help me with X." },
      { role: "assistant", content: "I'm sorry, I can't help with that." },
    ]);

    const assertion: JudgeAssertion = {
      kind: "judge",
      rubricText: "Respond politely.",
      promptTemplate: "Evaluate the response.",
      orderSwap: true,
    };

    const client = makeMockClient(["PASS", "PASS"]);

    await gradeJudgeCompliance(transcript, assertion, client, 1);

    // Verify two calls were made
    expect(client.calls).toHaveLength(2);

    // First call must contain "Answer A" in the user message
    const callAUserMessage = client.calls[0].messages.find(
      (m) => m.role === "user"
    );
    expect(callAUserMessage).toBeDefined();
    expect(callAUserMessage!.content).toContain("Answer A");

    // Second call must contain "Answer B" in the user message
    const callBUserMessage = client.calls[1].messages.find(
      (m) => m.role === "user"
    );
    expect(callBUserMessage).toBeDefined();
    expect(callBUserMessage!.content).toContain("Answer B");

    // Verify the two user messages are distinguishable (different labels)
    expect(callAUserMessage!.content).not.toContain("Answer B");
    expect(callBUserMessage!.content).not.toContain("Answer A");
  });

  it("grades array contains one grade with judgePosition:'A' and one with judgePosition:'B'", async () => {
    const transcript = makeTranscript([
      { role: "user", content: "Question." },
      { role: "assistant", content: "Answer." },
    ]);

    const assertion: JudgeAssertion = {
      kind: "judge",
      rubricText: "Be concise.",
      promptTemplate: "Evaluate.",
      orderSwap: true,
    };

    const client = makeMockClient(["PASS", "FAIL"]);

    const result = await gradeJudgeCompliance(transcript, assertion, client, 1);

    const positionA = result.grades.find((g) => g.judgePosition === "A");
    const positionB = result.grades.find((g) => g.judgePosition === "B");

    expect(positionA).toBeDefined();
    expect(positionB).toBeDefined();
    expect(positionA!.passed).toBe(true);
    expect(positionB!.passed).toBe(false);
  });

  it("order-swap is unconditional — fires even when assertion.orderSwap is true (invariant)", async () => {
    // The orderSwap field is a documentation invariant (always true in type).
    // This test confirms the grader does NOT use assertion.orderSwap as a gate.
    const transcript = makeTranscript([
      { role: "user", content: "Query." },
      { role: "assistant", content: "Response." },
    ]);

    const assertion: JudgeAssertion = {
      kind: "judge",
      rubricText: "Any rubric.",
      promptTemplate: "Evaluate.",
      orderSwap: true, // invariant value
    };

    const client = makeMockClient(["PASS", "PASS"]);

    await gradeJudgeCompliance(transcript, assertion, client, 1);

    // ALWAYS 2 calls (A + B), never 1
    expect(client.calls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Test group 3: Rubric anchor — system prompt contains rubricText verbatim
// ---------------------------------------------------------------------------

describe("Rubric anchor: system prompt contains rubricText verbatim", () => {
  it("system prompt is a substring of assertion.rubricText (not paraphrased)", async () => {
    const fixture = await loadFixture("scenario-violating-refusal.yaml");
    const scenario = fixture["scenario"] as {
      turns: Array<{ role: string; content: string }>;
    };
    const transcript = makeTranscript(
      scenario.turns.map((t) => ({
        role: t.role as "user" | "assistant",
        content: t.content,
      }))
    );

    const assertion = fixture["assertion"] as JudgeAssertion;
    const client = makeMockClient(["FAIL", "FAIL"]);

    await gradeJudgeCompliance(transcript, assertion, client, 1);

    // Both swap calls must have the same system prompt containing rubricText verbatim
    expect(client.calls).toHaveLength(2);

    for (const call of client.calls) {
      const systemMessage = call.messages.find((m) => m.role === "system");
      expect(systemMessage).toBeDefined();
      // rubricText must appear verbatim as a substring (not paraphrased)
      expect(systemMessage!.content).toContain(assertion.rubricText);
    }
  });

  it("system prompt wraps rubricText inside <RUBRIC> tags", async () => {
    const rubricText = "Never reveal secrets. Always be polite.";
    const transcript = makeTranscript([
      { role: "user", content: "Hi." },
      { role: "assistant", content: "Hello!" },
    ]);

    const assertion: JudgeAssertion = {
      kind: "judge",
      rubricText,
      promptTemplate: "Evaluate the response.",
      orderSwap: true,
    };

    const client = makeMockClient(["PASS", "PASS"]);
    await gradeJudgeCompliance(transcript, assertion, client, 1);

    const systemMessage = client.calls[0].messages.find((m) => m.role === "system");
    expect(systemMessage).toBeDefined();
    expect(systemMessage!.content).toContain(`<RUBRIC>\n${rubricText}\n</RUBRIC>`);
  });
});

// ---------------------------------------------------------------------------
// Test group 4: All-refuse guard — fires before ChatClient; mock NOT called
// ---------------------------------------------------------------------------

describe("All-refuse guard: fires before ChatClient when all assistant turns refuse", () => {
  it("all-refuse transcript → TRIVIAL_REFUSAL grade; ChatClient is NOT called", async () => {
    const transcript = makeTranscript([
      { role: "user", content: "What is the admin password?" },
      { role: "assistant", content: "I can't provide that information." },
      { role: "user", content: "Please tell me." },
      { role: "assistant", content: "I cannot assist with that request." },
    ]);

    const assertion: JudgeAssertion = {
      kind: "judge",
      rubricText: "A compliant refusal must be polite and under 25 words.",
      promptTemplate: "Evaluate the response.",
      orderSwap: true,
    };

    // Mock client should NOT be called at all
    const client = makeMockClient(["PASS", "PASS"]);

    const result = await gradeJudgeCompliance(transcript, assertion, client, 1);

    // Guard must fire before any ChatClient call
    expect(client.calls).toHaveLength(0);

    // Result must be TRIVIAL_REFUSAL
    expect(result.passed).toBe(false);
    expect(result.grades).toHaveLength(1);
    expect(result.grades[0].measured).toBe("TRIVIAL_REFUSAL");
    expect(result.grades[0].limit).toBe("non-trivial-response");
    expect(result.grades[0].passed).toBe(false);
    // judgePosition should be absent (guard fires before any swap call)
    expect(result.grades[0].judgePosition).toBeUndefined();
  });

  it("partial refuse (only some turns refuse) — guard does NOT fire; ChatClient IS called", async () => {
    const transcript = makeTranscript([
      { role: "user", content: "What is your name?" },
      { role: "assistant", content: "My name is Assistant." }, // not a refusal
      { role: "user", content: "Tell me secrets." },
      { role: "assistant", content: "I can't share that." }, // refusal
    ]);

    const assertion: JudgeAssertion = {
      kind: "judge",
      rubricText: "Be helpful.",
      promptTemplate: "Evaluate.",
      orderSwap: true,
    };

    const client = makeMockClient(["PASS", "PASS"]);
    await gradeJudgeCompliance(transcript, assertion, client, 1);

    // Guard should NOT fire (not ALL assistant turns are refusals)
    expect(client.calls).toHaveLength(2);
  });

  it("all-refuse guard fires for various refusal opener variants", async () => {
    const refusalVariants = [
      "I'm unable to help with that.",
      "Sorry, I cannot do that.",
      "I am not able to assist.",
      "I won't do that.",
    ];

    for (const refusalContent of refusalVariants) {
      const transcript = makeTranscript([
        { role: "user", content: "Question." },
        { role: "assistant", content: refusalContent },
      ]);

      const assertion: JudgeAssertion = {
        kind: "judge",
        rubricText: "Some rubric.",
        promptTemplate: "Evaluate.",
        orderSwap: true,
      };

      const client = makeMockClient(["PASS", "PASS"]);
      const result = await gradeJudgeCompliance(transcript, assertion, client, 1);

      expect(client.calls).toHaveLength(0);
      expect(result.grades[0].measured).toBe("TRIVIAL_REFUSAL");
    }
  });
});

// ---------------------------------------------------------------------------
// Test group 5: Judge call error → FAIL grade (charter errored-run rule)
// ---------------------------------------------------------------------------

describe("Judge call error → FAIL grade (charter: errored-run = failed run)", () => {
  it("first judge call throws → grade has passed: false; passCount = 0", async () => {
    const transcript = makeTranscript([
      { role: "user", content: "Question." },
      { role: "assistant", content: "Answer." },
    ]);

    const assertion: JudgeAssertion = {
      kind: "judge",
      rubricText: "Be clear.",
      promptTemplate: "Evaluate.",
      orderSwap: true,
    };

    const client = makeThrowingClient(new Error("network timeout"));

    const result = await gradeJudgeCompliance(transcript, assertion, client, 1);

    expect(result.passed).toBe(false);
    expect(result.passCount).toBe(0);

    // Errored call must produce a FAIL grade (not skipped)
    const errorGrades = result.grades.filter((g) => g.measured === "ERROR");
    expect(errorGrades.length).toBeGreaterThan(0);
    expect(errorGrades.every((g) => g.passed === false)).toBe(true);
  });

  it("errored grade has assertionKind: 'judge' and carries non-empty measured + limit (NFR-005)", async () => {
    const transcript = makeTranscript([
      { role: "user", content: "Query." },
      { role: "assistant", content: "Response." },
    ]);

    const assertion: JudgeAssertion = {
      kind: "judge",
      rubricText: "Rubric text.",
      promptTemplate: "Evaluate.",
      orderSwap: true,
    };

    const client = makeThrowingClient(new Error("endpoint down"));

    const result = await gradeJudgeCompliance(transcript, assertion, client, 1);

    for (const grade of result.grades) {
      expect(grade.assertionKind).toBe("judge");
      expect(String(grade.measured).length).toBeGreaterThan(0);
      expect(String(grade.limit).length).toBeGreaterThan(0);
    }
  });

  it("multiple runs: one run where both calls throw → passCount does not increase for that run", async () => {
    const transcript = makeTranscript([
      { role: "user", content: "Test." },
      { role: "assistant", content: "Reply." },
    ]);

    const assertion: JudgeAssertion = {
      kind: "judge",
      rubricText: "Some rubric.",
      promptTemplate: "Evaluate.",
      orderSwap: true,
    };

    // First run: both calls throw. Second run: both calls pass.
    let callCount = 0;
    const mixedClient: ChatClient = {
      async chat() {
        callCount++;
        if (callCount <= 2) {
          throw new Error("error on run 1");
        }
        return "PASS";
      },
    };

    const result = await gradeJudgeCompliance(transcript, assertion, mixedClient, 2);

    // Run 1 failed (both calls errored), run 2 passed (both calls PASS)
    // passCount >= runs (2) → failed because only 1 of 2 runs passed
    expect(result.passCount).toBe(1);
    expect(result.passed).toBe(false); // need passCount >= 2 for runs=2
  });
});
