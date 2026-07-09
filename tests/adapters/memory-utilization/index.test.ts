/**
 * Integration tests for src/adapters/memory-utilization/index.ts
 * (MemoryUtilizationAdapter.run) — the 3-arm learning-lift orchestrator.
 *
 * Fully offline and deterministic: every test injects a scripted mock
 * `ChatClient` (mirroring the Memory adapter's RecallProbeRunner/
 * PrivacyLeakProbeRunner test-injection overload) — no network, no fetch
 * mocking. The declared memory fixture is the real `tests/fixtures/
 * memory-utilization/basic/` MEMORY.md/USER.md pair, parsed via the reused
 * Memory adapter `FactParser`.
 *
 * Scenario coverage (WP03 T013):
 *   1. lift-confirmed
 *   2. no-lift (bounded/powered null)
 *   3. contaminated (closed-book gate overrides an otherwise-good delta)
 *   4. baseline-invalid (saturated no-memory baseline)
 *   5. scrambled-memory negative control FAILS the suite as designed (FR-005)
 *   6. cap-of-zero rigged-impossible control fails as designed (FR-010)
 *   7. all-refuse guard fires (FR-010)
 *   8. an errored run counts as a failed run — never skipped, never retried (FR-009)
 */

import { describe, expect, it, vi } from "vitest";
import {
  CONDITION_ARMS,
  MemoryUtilizationAdapter,
  createMemoryUtilizationAdapter,
  type LearningLiftCase,
  type LearningLiftManifest,
  type LearningLiftProbe,
  type MemoryFixtureRef,
} from "../../../src/adapters/memory-utilization/index.js";
import type { ChatClient, ChatMessage } from "../../../src/core/behavioral/types.js";

// ---------------------------------------------------------------------------
// Shared fixture + facts (tests/fixtures/memory-utilization/basic/).
// ---------------------------------------------------------------------------

const FIXTURE_REF: MemoryFixtureRef = {
  memoryPath: "tests/fixtures/memory-utilization/basic/MEMORY.md",
  userPath: "tests/fixtures/memory-utilization/basic/USER.md",
  manifestPath: "tests/fixtures/memory-utilization/basic/manifest.json",
};

const FACT_TEXT: Record<string, string> = {
  "memory-facts-0": "The user's favorite programming language is Rust.",
  "memory-facts-1": "The user's pet is a cat named Whiskers.",
  "memory-facts-2": "The user's preferred IDE is Neovim.",
  "memory-facts-3": "The capital of France is Paris.",
  "memory-facts-4": "The user's favorite color is teal.",
  "memory-facts-5": "The user grew up in Portland.",
  "memory-facts-6": "The user's birthday is in April.",
};
const CLEAN_FACT_IDS = ["memory-facts-0", "memory-facts-1", "memory-facts-2", "memory-facts-4", "memory-facts-5", "memory-facts-6"];

const DEFAULT_THRESHOLDS = {
  liftDelta: 0.3,
  contaminationThreshold: 0.5,
  baselineFloor: 0.05,
  baselineCeiling: 0.95,
};

const IDLE_RESPONSE = "I don't know.";
const REFUSAL_RESPONSE = "DECISION: REFUSE\nI'm sorry, but I can't help with that.";

// ---------------------------------------------------------------------------
// Probe builders — every probe question embeds a `[[probeId|factId]]` marker
// so the scripted mock client can dispatch deterministically without any
// fetch mocking or network I/O.
// ---------------------------------------------------------------------------

function liftProbe(id: string, requiredFactId: string, requiresMemory: boolean): LearningLiftProbe {
  return {
    id,
    turns: [{ role: "user", content: `[[${id}|${requiredFactId}]] Please answer the question.` }],
    expected: { kind: "fact-substring", requiredFactId },
    requiresMemory,
    kind: "lift",
  };
}

function abstentionProbe(id: string): LearningLiftProbe {
  return {
    id,
    turns: [{ role: "user", content: `[[${id}]] What is my mother's maiden name?` }],
    expected: { kind: "abstain" },
    requiresMemory: false,
    kind: "abstention",
  };
}

function judgeProbe(id: string, criterion: string): LearningLiftProbe {
  return {
    id,
    turns: [{ role: "user", content: `[[${id}]] What is the production failover region?` }],
    expected: { kind: "judge", criterion },
    requiresMemory: true,
    kind: "lift",
  };
}

interface ProbeMarker {
  readonly probeId: string;
  readonly factId: string | null;
}

function parseMarker(question: string): ProbeMarker {
  const match = /^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/.exec(question);
  if (!match) {
    throw new Error(`test question missing [[probeId]] marker: ${question}`);
  }
  return { probeId: match[1]!, factId: match[2] ?? null };
}

/**
 * Scripted mock ChatClient: dispatches on the probe marker + the assembled
 * system prompt. `responder` returning an `Error` simulates an endpoint
 * error for that call (FR-009).
 */
function makeMockClient(
  responder: (marker: ProbeMarker, systemPrompt: string, callIndex: number) => string | Error
): ChatClient {
  let callIndex = 0;
  return {
    async chat(messages: ChatMessage[]) {
      const idx = callIndex++;
      const systemPrompt = messages.find((m) => m.role === "system")?.content ?? "";
      const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const marker = parseMarker(lastUser);
      const result = responder(marker, systemPrompt, idx);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

function makeCase(overrides: Partial<LearningLiftCase>): LearningLiftCase {
  return {
    id: "case-1",
    fixture: FIXTURE_REF,
    probes: [],
    arms: [...CONDITION_ARMS],
    runsN: 1,
    thresholds: DEFAULT_THRESHOLDS,
    ...overrides,
  };
}

async function runManifest(manifest: LearningLiftManifest, client: ChatClient) {
  const adapter = new MemoryUtilizationAdapter();
  return adapter.run(manifest, { client });
}

// ---------------------------------------------------------------------------
// 1. lift-confirmed
// ---------------------------------------------------------------------------

describe("MemoryUtilizationAdapter.run — the four verdicts", () => {
  it("lift-confirmed: with-memory decisively and significantly beats no-memory", async () => {
    const concordant = Array.from({ length: 4 }, (_, i) =>
      liftProbe(`concordant-${i}`, CLEAN_FACT_IDS[i % CLEAN_FACT_IDS.length]!, false)
    );
    const discordant = Array.from({ length: 12 }, (_, i) =>
      liftProbe(`discordant-${i}`, CLEAN_FACT_IDS[i % CLEAN_FACT_IDS.length]!, true)
    );

    const client = makeMockClient((marker, systemPrompt) => {
      const factText = FACT_TEXT[marker.factId!]!;
      if (marker.probeId.startsWith("concordant-")) return factText;
      return systemPrompt.includes(factText) ? factText : IDLE_RESPONSE;
    });

    const result = await runManifest(
      { cases: [makeCase({ id: "lift-case", probes: [...concordant, ...discordant] })] },
      client
    );

    const caseResult = result.cases[0]!;
    expect(caseResult.measurement.verdict).toBe("lift-confirmed");
    expect(caseResult.measurement.passRateWithMemory).toBe(1);
    expect(caseResult.measurement.baselineValid).toBe(true);
    expect(caseResult.measurement.contaminated).toBe(false);
    expect(caseResult.scrambledControl.passed).toBe(true);
    expect(caseResult.ok).toBe(true);
    expect(result.ok).toBe(true);

    // C-005/FR-003: per-probe paired outcomes are retained (one per lift probe).
    expect(caseResult.pairedOutcomes).toHaveLength(16);
    for (const outcome of caseResult.pairedOutcomes) {
      expect(outcome.perArmScore["with-memory"]).toBeDefined();
      expect(outcome.perArmScore["no-memory"]).toBeDefined();
      expect(outcome.perArmScore["scrambled-memory"]).toBeDefined();
    }
  });

  // -------------------------------------------------------------------------
  // 2. no-lift
  // -------------------------------------------------------------------------

  it("no-lift: memory makes no measurable difference — a bounded/powered null (FR-008)", async () => {
    const probes = Array.from({ length: 4 }, (_, i) => liftProbe(`p-${i}`, "memory-facts-0", false));

    // Global call-index parity alternates pass/fail identically regardless of
    // arm: any two consecutive calls (this case's N=2 per probe/arm) yield
    // exactly one pass and one fail -> every arm nets exactly 50%.
    const client = makeMockClient((_marker, _systemPrompt, callIndex) =>
      callIndex % 2 === 0 ? FACT_TEXT["memory-facts-0"]! : IDLE_RESPONSE
    );

    const result = await runManifest(
      { cases: [makeCase({ id: "no-lift-case", probes, runsN: 2 })] },
      client
    );

    const caseResult = result.cases[0]!;
    expect(caseResult.measurement.verdict).toBe("no-lift");
    expect(caseResult.measurement.mcnemarMidP).toBe(1);
    expect(caseResult.measurement.baselineValid).toBe(true);
    // FR-008: always a reported MDE, never bare "absence of evidence".
    expect(Number.isFinite(caseResult.measurement.mde)).toBe(true);
    expect(caseResult.ok).toBe(false);
    expect(result.ok).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 3. contaminated
  // -------------------------------------------------------------------------

  it("contaminated: a probe answerable closed-book overrides an otherwise-plausible verdict (FR-006)", async () => {
    const cleanProbe = liftProbe("clean-1", "memory-facts-0", true);
    const leakyProbe = liftProbe("leaky-1", "memory-facts-3", true); // "capital of France" — parametric leakage

    const client = makeMockClient((marker, systemPrompt) => {
      const factText = FACT_TEXT[marker.factId!]!;
      if (marker.probeId === "leaky-1") return factText; // always "knows" it, regardless of arm
      return systemPrompt.includes(factText) ? factText : IDLE_RESPONSE;
    });

    const result = await runManifest(
      { cases: [makeCase({ id: "contaminated-case", probes: [cleanProbe, leakyProbe] })] },
      client
    );

    const caseResult = result.cases[0]!;
    expect(caseResult.measurement.verdict).toBe("contaminated");
    expect(caseResult.measurement.contaminatedProbeIds).toEqual(["leaky-1"]);
    expect(caseResult.contamination.find((c) => c.probeId === "leaky-1")?.contaminated).toBe(true);
    expect(caseResult.contamination.find((c) => c.probeId === "clean-1")?.contaminated).toBe(false);
    expect(caseResult.ok).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 4. baseline-invalid
  // -------------------------------------------------------------------------

  it("baseline-invalid: the no-memory arm already saturates the probes (FR-004 edge case)", async () => {
    const probes = Array.from({ length: 2 }, (_, i) => liftProbe(`p-${i}`, CLEAN_FACT_IDS[i]!, false));

    const client = makeMockClient((marker) => FACT_TEXT[marker.factId!]!); // always correct, every arm

    const result = await runManifest(
      { cases: [makeCase({ id: "baseline-invalid-case", probes })] },
      client
    );

    const caseResult = result.cases[0]!;
    expect(caseResult.measurement.verdict).toBe("baseline-invalid");
    expect(caseResult.measurement.baselineValid).toBe(false);
    expect(caseResult.measurement.passRateNoMemory).toBe(1);
    expect(caseResult.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Scrambled-memory negative control fails the suite as designed (FR-005).
// ---------------------------------------------------------------------------

describe("MemoryUtilizationAdapter.run — controls", () => {
  it("scrambled-memory control FAILS the suite when scrambled memory also produces a significant lift", async () => {
    const concordant = Array.from({ length: 4 }, (_, i) =>
      liftProbe(`concordant-${i}`, CLEAN_FACT_IDS[i % CLEAN_FACT_IDS.length]!, false)
    );
    const discordant = Array.from({ length: 12 }, (_, i) =>
      liftProbe(`discordant-${i}`, CLEAN_FACT_IDS[i % CLEAN_FACT_IDS.length]!, true)
    );

    // A pathological/broken responder: answers correctly whenever ANY
    // "[MEMORY]" block is present, regardless of whether its content is real
    // or scrambled — exactly the context-stuffing artifact FR-005 exists to
    // catch. The primary (with vs. no-memory) statistic looks like a
    // legitimate lift; the scrambled control must still fail the case.
    const client = makeMockClient((marker, systemPrompt) => {
      const factText = FACT_TEXT[marker.factId!]!;
      if (marker.probeId.startsWith("concordant-")) return factText;
      return systemPrompt.includes("[MEMORY]") ? factText : IDLE_RESPONSE;
    });

    const result = await runManifest(
      { cases: [makeCase({ id: "scrambled-control-case", probes: [...concordant, ...discordant] })] },
      client
    );

    const caseResult = result.cases[0]!;
    // The primary lift statistic alone looks confirmed...
    expect(caseResult.measurement.verdict).toBe("lift-confirmed");
    // ...but the discrimination control catches the prompt-stuffing artifact and fails the case.
    expect(caseResult.scrambledControl.passed).toBe(false);
    expect(caseResult.ok).toBe(false);
    expect(result.ok).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 6. Cap-of-zero rigged-impossible control (FR-010).
  // -------------------------------------------------------------------------

  it("cap-of-zero control fails as designed — a structurally zero-signal case is never lift-confirmed", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // requiredFactId does not exist in the fixture -> gradeProbeResponse
      // always returns false (requiredText is "") for every arm/sample.
      const probes = [liftProbe("phantom-1", "memory-facts-does-not-exist", true)];
      const client = makeMockClient(() => IDLE_RESPONSE);

      const result = await runManifest(
        {
          cases: [
            makeCase({ id: "cap-of-zero-case", probes, isCapOfZeroControl: true }),
          ],
        },
        client
      );

      const caseResult = result.cases[0]!;
      expect(caseResult.measurement.verdict).not.toBe("lift-confirmed");
      expect(caseResult.capOfZeroFailedAsDesigned).toBe(true);
      expect(caseResult.ok).toBe(false);
      // The control behaved correctly -> no grader-bug warning was logged.
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  // -------------------------------------------------------------------------
  // 7. All-refuse guard (FR-010).
  // -------------------------------------------------------------------------

  it("all-refuse guard fires when every arm scores zero passes (indeterminate, not evidence of no-lift)", async () => {
    const probes = Array.from({ length: 3 }, (_, i) => liftProbe(`p-${i}`, CLEAN_FACT_IDS[i]!, true));
    const client = makeMockClient(() => REFUSAL_RESPONSE); // never contains any fact substring

    const result = await runManifest(
      { cases: [makeCase({ id: "all-refuse-case", probes })] },
      client
    );

    const caseResult = result.cases[0]!;
    expect(caseResult.allRefuseGuard.fired).toBe(true);
    expect(caseResult.measurement.passRateWithMemory).toBe(0);
    expect(caseResult.measurement.passRateNoMemory).toBe(0);
    expect(caseResult.measurement.passRateScrambledMemory).toBe(0);
    expect(caseResult.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. An errored run counts as a failed run (FR-009) — never skipped, never
// retried, and it does not abort the suite.
// ---------------------------------------------------------------------------

describe("MemoryUtilizationAdapter.run — errored run counts as failed (FR-009)", () => {
  it("an endpoint error mid-arm is counted as a failed sample, not skipped or retried", async () => {
    const probe = liftProbe("only-probe", "memory-facts-0", true);
    const factText = FACT_TEXT["memory-facts-0"]!;

    // Call order (CONDITION_ARMS = [no-memory, with-memory, scrambled-memory],
    // runsN=3, single probe): calls 0-2 = no-memory, 3-5 = with-memory,
    // 6-8 = scrambled-memory. Error exactly one with-memory call (index 4).
    const client = makeMockClient((_marker, systemPrompt, callIndex) => {
      if (callIndex === 4) return new Error("simulated endpoint error");
      return systemPrompt.includes(factText) ? factText : IDLE_RESPONSE;
    });

    const result = await runManifest(
      { cases: [makeCase({ id: "errored-run-case", probes: [probe], runsN: 3 })] },
      client
    );

    const caseResult = result.cases[0]!;
    // 2 of 3 with-memory samples passed; the errored sample counted as
    // failed (not dropped from the denominator: 2/3, never 2/2).
    expect(caseResult.pairedOutcomes[0]!.perArmScore["with-memory"]).toBeCloseTo(2 / 3, 10);
    expect(caseResult.measurement.passRateWithMemory).toBeCloseTo(2 / 3, 10);
    // The suite run itself did not throw or abort on the errored sample.
    expect(result.cases).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Abstention probes (FR-007) — reused gradeRefusalResponse via rule-survival.
// Graded PER ARM (L-2 remediation, rubric §6.4/§2.5): a probe passes iff it
// abstains under EVERY arm — memory-induced fabrication (with-memory) and
// parametric fabrication (no-memory/scrambled-memory) are both caught.
// ---------------------------------------------------------------------------

describe("MemoryUtilizationAdapter.run — abstention probes (FR-007)", () => {
  it("passes when the model abstains on a declared-unanswerable probe under every arm", async () => {
    const lift = liftProbe("lift-1", "memory-facts-0", true);
    const abstain = abstentionProbe("abstain-1");
    const factText = FACT_TEXT["memory-facts-0"]!;

    const client = makeMockClient((marker, systemPrompt) => {
      if (marker.probeId === "abstain-1") return REFUSAL_RESPONSE;
      return systemPrompt.includes(factText) ? factText : IDLE_RESPONSE;
    });

    const result = await runManifest(
      { cases: [makeCase({ id: "abstention-case", probes: [lift, abstain] })] },
      client
    );

    const caseResult = result.cases[0]!;
    expect(caseResult.abstention.passed).toBe(true);
    expect(caseResult.abstention.perProbe).toEqual([
      {
        probeId: "abstain-1",
        passed: true,
        perArm: [
          { arm: "no-memory", passed: true, passCount: 1, totalRuns: 1 },
          { arm: "with-memory", passed: true, passCount: 1, totalRuns: 1 },
          { arm: "scrambled-memory", passed: true, passCount: 1, totalRuns: 1 },
        ],
      },
    ]);
  });

  it("fails when the model fabricates an answer instead of abstaining (with-memory)", async () => {
    const lift = liftProbe("lift-1", "memory-facts-0", true);
    const abstain = abstentionProbe("abstain-1");
    const factText = FACT_TEXT["memory-facts-0"]!;

    const client = makeMockClient((marker, systemPrompt) => {
      if (marker.probeId === "abstain-1") return "Their maiden name was Smith."; // fabrication
      return systemPrompt.includes(factText) ? factText : IDLE_RESPONSE;
    });

    const result = await runManifest(
      { cases: [makeCase({ id: "fabrication-case", probes: [lift, abstain] })] },
      client
    );

    const caseResult = result.cases[0]!;
    expect(caseResult.abstention.passed).toBe(false);
    expect(caseResult.ok).toBe(false);
  });

  it("fails when the model fabricates under no-memory even though it correctly abstains under with-memory (parametric fabrication, per-arm grading L-2/rubric §6.4)", async () => {
    const lift = liftProbe("lift-1", "memory-facts-0", true);
    const abstain = abstentionProbe("abstain-1");
    const factText = FACT_TEXT["memory-facts-0"]!;

    const client = makeMockClient((marker, systemPrompt) => {
      if (marker.probeId === "abstain-1") {
        // Correctly abstains whenever ANY memory context is present
        // (with-memory AND scrambled-memory both stage a "[MEMORY]" block)
        // but fabricates when no memory context is present at all
        // (no-memory) — parametric fabrication a with-memory-only check
        // would never observe.
        return systemPrompt.includes("[MEMORY]") ? REFUSAL_RESPONSE : "Their maiden name was Smith.";
      }
      return systemPrompt.includes(factText) ? factText : IDLE_RESPONSE;
    });

    const result = await runManifest(
      { cases: [makeCase({ id: "no-memory-fabrication-case", probes: [lift, abstain] })] },
      client
    );

    const caseResult = result.cases[0]!;
    const abstainResult = caseResult.abstention.perProbe.find((p) => p.probeId === "abstain-1")!;
    const noMemoryArm = abstainResult.perArm.find((a) => a.arm === "no-memory")!;
    const withMemoryArm = abstainResult.perArm.find((a) => a.arm === "with-memory")!;
    const scrambledArm = abstainResult.perArm.find((a) => a.arm === "scrambled-memory")!;

    expect(withMemoryArm.passed).toBe(true);
    expect(scrambledArm.passed).toBe(true);
    expect(noMemoryArm.passed).toBe(false);
    // Conjunctive across arms: one arm's fabrication fails the whole probe,
    // never outvoted by the other two arms correctly abstaining.
    expect(abstainResult.passed).toBe(false);
    expect(caseResult.abstention.passed).toBe(false);
    expect(caseResult.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Judge-kind probes (FR-011, M-1 mission-review remediation) — the SAME
// judge grades every arm's response to a probe in one blinded call
// (judge.ts). Every test here distinguishes the judge call (system prompt
// starts with judge.ts's fixed preamble) from the probe transcript calls.
// ---------------------------------------------------------------------------

const JUDGE_SYSTEM_PREFIX = "You are an impartial grading judge.";
const CORRECT_FAILOVER_ANSWER = "The production failover region is us-west-2.";
const JUDGE_CRITERION = "The response correctly states the production failover region.";

interface JudgeCall {
  readonly system: string;
  readonly user: string;
}

/** Parses "Answer <L>:\n<content>" blocks out of judge.ts's built user prompt. */
function parseJudgeBlocks(user: string): { label: string; content: string }[] {
  const blockRe = /Answer\s+([A-Za-z0-9]+):\n([\s\S]*?)(?=\n\nAnswer\s+[A-Za-z0-9]+:|\n\nFor each)/g;
  return [...user.matchAll(blockRe)].map((match) => ({ label: match[1]!, content: match[2]! }));
}

/** A judge that grades honestly: PASS iff the presented content contains the known-correct answer. */
function honestJudgeResponder(_system: string, user: string): string {
  return parseJudgeBlocks(user)
    .map((block) => `Answer ${block.label}: ${block.content.includes(CORRECT_FAILOVER_ANSWER) ? "PASS" : "FAIL"}`)
    .join("\n");
}

/** A judge that blindly PASSes every label regardless of content — the rigged/broken-judge control. */
function alwaysPassJudgeResponder(_system: string, user: string): string {
  return parseJudgeBlocks(user)
    .map((block) => `Answer ${block.label}: PASS`)
    .join("\n");
}

/**
 * Dispatches judge calls (system prompt starts with judge.ts's fixed
 * preamble) to `judgeResponder`, and probe-transcript calls (marker-based,
 * mirrors `makeMockClient`) to `answerResponder`. `record`, if supplied,
 * captures every judge call verbatim (system + user prompt).
 */
function makeJudgeIntegrationClient(
  answerResponder: (marker: ProbeMarker, systemPrompt: string) => string,
  judgeResponder: (system: string, user: string) => string,
  record?: JudgeCall[]
): ChatClient {
  return {
    async chat(messages: ChatMessage[]) {
      const systemPrompt = messages.find((m) => m.role === "system")?.content ?? "";
      const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      if (systemPrompt.startsWith(JUDGE_SYSTEM_PREFIX)) {
        record?.push({ system: systemPrompt, user: lastUser });
        return judgeResponder(systemPrompt, lastUser);
      }
      return answerResponder(parseMarker(lastUser), systemPrompt);
    },
  };
}

/** The underlying model answers correctly only when the with-memory arm's real fact text is present (never under no-memory/scrambled-memory). */
function judgeAnswerResponder(marker: ProbeMarker, systemPrompt: string): string {
  if (marker.probeId !== "judge-1") return IDLE_RESPONSE;
  return systemPrompt.includes(FACT_TEXT["memory-facts-0"]!) ? CORRECT_FAILOVER_ANSWER : IDLE_RESPONSE;
}

describe("MemoryUtilizationAdapter.run — judge-kind probes (FR-011)", () => {
  it("a judge-kind probe is graded under every arm via a single blinded judge call per sample", async () => {
    const probe = judgeProbe("judge-1", JUDGE_CRITERION);
    const record: JudgeCall[] = [];
    const client = makeJudgeIntegrationClient(judgeAnswerResponder, honestJudgeResponder, record);

    const result = await runManifest(
      { cases: [makeCase({ id: "judge-case", probes: [probe] })] },
      client
    );

    const caseResult = result.cases[0]!;
    expect(caseResult.pairedOutcomes).toHaveLength(1);
    const outcome = caseResult.pairedOutcomes[0]!;
    expect(outcome.perArmScore["with-memory"]).toBe(1);
    expect(outcome.perArmScore["no-memory"]).toBe(0);
    expect(outcome.perArmScore["scrambled-memory"]).toBe(0);
    // runsN=1, 3 arms all produced a real (non-errored) response -> exactly
    // ONE combined judge call, not one call per arm.
    expect(record).toHaveLength(1);
  });

  it("the judge prompt is genuinely blinded — no arm identifier ever reaches it", async () => {
    const probe = judgeProbe("judge-1", JUDGE_CRITERION);
    const record: JudgeCall[] = [];
    const client = makeJudgeIntegrationClient(judgeAnswerResponder, honestJudgeResponder, record);

    await runManifest({ cases: [makeCase({ id: "judge-blind-case", probes: [probe] })] }, client);

    expect(record.length).toBeGreaterThan(0);
    for (const call of record) {
      const combined = `${call.system}\n${call.user}`;
      for (const arm of CONDITION_ARMS) {
        expect(combined).not.toContain(arm);
      }
      expect(combined).not.toMatch(/with-memory|no-memory|scrambled-memory/i);
      // The criterion itself IS disclosed to the judge (that's the point) —
      // but nothing that would let it infer which labeled block is which arm.
      expect(combined).toContain(JUDGE_CRITERION);
    }
  });

  it("is byte-stable/deterministic: two identical offline runs produce identical results", async () => {
    const probe = judgeProbe("judge-1", JUDGE_CRITERION);
    const manifest: LearningLiftManifest = { cases: [makeCase({ id: "judge-determinism-case", probes: [probe] })] };

    const first = await runManifest(manifest, makeJudgeIntegrationClient(judgeAnswerResponder, honestJudgeResponder));
    const second = await runManifest(manifest, makeJudgeIntegrationClient(judgeAnswerResponder, honestJudgeResponder));

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  // -------------------------------------------------------------------------
  // Rigged-impossible discrimination control (charter: every grader ships
  // one that fails as designed). Even a judge deliberately forced to PASS an
  // obviously-wrong response on every arm must not make this cap-of-zero
  // case read as `lift-confirmed` — every arm ties (100%), so the case-level
  // guards (here: the baseline-validity ceiling) catch it regardless of what
  // the (broken) judge said.
  // -------------------------------------------------------------------------

  it("cap-of-zero control fails as designed even when the judge is rigged to PASS an obviously-wrong response on every arm", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const probe = judgeProbe("judge-1", JUDGE_CRITERION);
      // Every arm produces the SAME obviously-wrong answer -> no discordant
      // signal is even structurally possible (rigged-impossible, mirrors the
      // existing cap-of-zero pattern), regardless of how the judge grades it.
      const client = makeJudgeIntegrationClient(
        () => "I have absolutely no idea.",
        alwaysPassJudgeResponder
      );

      const result = await runManifest(
        { cases: [makeCase({ id: "judge-cap-of-zero-case", probes: [probe], isCapOfZeroControl: true })] },
        client
      );

      const caseResult = result.cases[0]!;
      // The rigged judge blindly passes every arm -> all arms tie at 100%,
      // which the baseline-validity ceiling guard catches (verdict is never
      // `lift-confirmed` regardless of WHICH guard catches it).
      expect(caseResult.measurement.verdict).not.toBe("lift-confirmed");
      expect(caseResult.capOfZeroFailedAsDesigned).toBe(true);
      expect(caseResult.ok).toBe(false);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("an errored judge call fails every arm's sample (FR-009) rather than skipping or crashing the run", async () => {
    const probe = judgeProbe("judge-1", JUDGE_CRITERION);
    const client = makeJudgeIntegrationClient(judgeAnswerResponder, () => {
      throw new Error("simulated judge endpoint error");
    });

    const result = await runManifest(
      { cases: [makeCase({ id: "judge-error-case", probes: [probe] })] },
      client
    );

    const caseResult = result.cases[0]!;
    expect(result.cases).toHaveLength(1);
    const outcome = caseResult.pairedOutcomes[0]!;
    expect(outcome.perArmScore["with-memory"]).toBe(0);
    expect(outcome.perArmScore["no-memory"]).toBe(0);
    expect(outcome.perArmScore["scrambled-memory"]).toBe(0);
  });

  it("an errored transcript (getting the model's answer) fails that arm directly, without ever reaching the judge (FR-009)", async () => {
    const probe = judgeProbe("judge-1", JUDGE_CRITERION);
    const record: JudgeCall[] = [];
    const client = makeJudgeIntegrationClient(
      (marker, systemPrompt) => {
        // The with-memory arm's transcript call itself errors — before any
        // judge call is ever made for this sample.
        if (marker.probeId === "judge-1" && systemPrompt.includes(FACT_TEXT["memory-facts-0"]!)) {
          throw new Error("simulated endpoint error generating the with-memory answer");
        }
        return judgeAnswerResponder(marker, systemPrompt);
      },
      honestJudgeResponder,
      record
    );

    const result = await runManifest(
      { cases: [makeCase({ id: "judge-transcript-error-case", probes: [probe] })] },
      client
    );

    const caseResult = result.cases[0]!;
    const outcome = caseResult.pairedOutcomes[0]!;
    // The errored arm fails directly (never graded PASS by the judge).
    expect(outcome.perArmScore["with-memory"]).toBe(0);
    // Exactly one judge call, grading only the two arms whose transcript
    // succeeded — the errored arm's (nonexistent) response never reaches it.
    expect(record).toHaveLength(1);
    const blocks = parseJudgeBlocks(record[0]!.user);
    expect(blocks).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Manifest-level guards.
// ---------------------------------------------------------------------------

describe("createMemoryUtilizationAdapter", () => {
  it("builds a named adapter instance (CLI registration factory, mirrors MemoryAdapter/SOPAdapter)", () => {
    const adapter = createMemoryUtilizationAdapter();
    expect(adapter.name).toBe("memory-utilization");
    expect(adapter).toBeInstanceOf(MemoryUtilizationAdapter);
  });
});

describe("MemoryUtilizationAdapter.run — manifest guards", () => {
  it("throws when the manifest has no cases", async () => {
    const adapter = new MemoryUtilizationAdapter();
    await expect(adapter.run({ cases: [] }, { client: makeMockClient(() => IDLE_RESPONSE) })).rejects.toThrow(
      /must be non-empty/
    );
  });

  it("throws when neither client nor endpoint is supplied", async () => {
    const adapter = new MemoryUtilizationAdapter();
    const probes = [liftProbe("p-1", "memory-facts-0", true)];
    await expect(adapter.run({ cases: [makeCase({ probes })] }, {})).rejects.toThrow(
      /requires either options\.client or options\.endpoint/
    );
  });
});
