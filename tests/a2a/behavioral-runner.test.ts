/**
 * T019 — A2A behavioral runner unit tests (WP03).
 *
 * Tests runA2aCaseOnce + runA2aCase + runBehavioralCases using scripted
 * sendMessage mocks (no network). Covers:
 *   - Passing case: replies short enough → verdict passed.
 *   - Verbosity-fail: reply too long → verdict failed.
 *   - Refusal-fail: reply contains forbidden substring → verdict failed.
 *   - State-shift pass: replies tighten after trigger turn → pass.
 *   - State-shift fail: replies stay verbose after trigger turn → fail.
 *   - All-errored case: sendMessage throws every run → allErrored classification.
 *   - Determinism: same scripted transcript → identical verdict across repeated
 *     calls (NFR-001).
 *   - Core graders are the ones producing grades (grades carry measured/limit
 *     fields as per gradeVerbosity/gradeRefusal/gradeStateShift contracts).
 *
 * Normative: WP03 T019; FR-001/002/003/007/011/022; NFR-001.
 * Citation: a2a-behavioral-conformance-01KVJDWE WP03.
 */

import { describe, it, expect, vi } from "vitest";

import {
  runA2aCaseOnce,
  runA2aCase,
  runBehavioralCases,
} from "../../src/adapters/a2a/graders/behavioral.js";
import type { A2aBehavioralCase, A2aBehavioralManifest, ResolvedThresholds } from "../../src/adapters/a2a/behavioral-manifest.js";
import type { ConversationHandle } from "../../src/adapters/a2a/transport.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock sendMessage that returns scripted replies in order. */
function mockSender(replies: string[]): typeof import("../../src/adapters/a2a/transport.js").sendMessage {
  let call = 0;
  return async (
    _endpoint: string,
    _text: string,
    handle: ConversationHandle,
    _opts: unknown
  ): Promise<{ reply: string; handle: ConversationHandle }> => {
    const reply = replies[call] ?? "ok";
    call++;
    return { reply, handle };
  };
}

/** Build a mock sendMessage that always throws. */
function mockErrorSender(message: string): typeof import("../../src/adapters/a2a/transport.js").sendMessage {
  return async (): Promise<never> => {
    throw new Error(message);
  };
}

/** Build a simple single-turn verbosity case with explicit thresholds. */
function buildVerbosityCase(maxWords: number, runs = 1, passThreshold = 1): A2aBehavioralCase {
  return {
    id: "verbosity-test",
    turns: [{ role: "user", content: "Hello" }],
    axes: [{ axis: "verbosity", turns: "all" }],
    runs,
    pass_threshold: passThreshold,
    thresholds: { default_max_words: maxWords },
  };
}

/** Minimal ResolvedThresholds for a case with an explicit cap. */
function resolvedWithCap(maxWords: number): ResolvedThresholds {
  return {
    baseMaxWords: maxWords,
    stateMaxWords: {},
    refusalCap: 25,
  };
}

const ENDPOINT = "http://a2a-test.invalid";

// ---------------------------------------------------------------------------
// T019 — Passing case
// ---------------------------------------------------------------------------

describe("runA2aCaseOnce — passing case", () => {
  it("short reply passes verbosity axis (FR-002 core grader used)", async () => {
    // 5 words; limit = 20
    const reply = "Hello there how are you";
    const kase = buildVerbosityCase(20);
    const resolved = resolvedWithCap(20);

    const verdict = await runA2aCaseOnce(1, kase, ENDPOINT, null, resolved, 1, mockSender([reply]));

    expect(verdict.run).toBe(1);
    expect(verdict.passed).toBe(true);
    expect(verdict.error).toBeUndefined();

    // Exactly one verbosity grade produced by the core gradeVerbosity function.
    expect(verdict.axes).toHaveLength(1);
    const grade = verdict.axes[0];
    expect(grade.axis).toBe("verbosity");
    // measured = 5 words; limit = 20 (NFR-005 measured + limit carried through)
    expect(grade.measured).toBe(5);
    expect(grade.limit).toBe(20);
    expect(grade.passed).toBe(true);
  });

  it("transcript contains user + assistant entries, no system entry (T014 black-box)", async () => {
    const reply = "Short reply";
    const kase = buildVerbosityCase(20);
    const resolved = resolvedWithCap(20);

    const verdict = await runA2aCaseOnce(1, kase, ENDPOINT, null, resolved, 1, mockSender([reply]));

    const { entries } = verdict.transcript;
    // 1 user turn + 1 assistant turn = 2 entries; no system entry.
    expect(entries).toHaveLength(2);
    expect(entries[0].role).toBe("user");
    expect(entries[1].role).toBe("assistant");
    expect(entries.every((e) => e.role !== "system")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T019 — Verbosity-fail
// ---------------------------------------------------------------------------

describe("runA2aCaseOnce — verbosity fail", () => {
  it("reply exceeding limit fails verbosity axis (FR-002)", async () => {
    // 10 words; limit = 5
    const reply = "one two three four five six seven eight nine ten";
    const kase = buildVerbosityCase(5);
    const resolved = resolvedWithCap(5);

    const verdict = await runA2aCaseOnce(1, kase, ENDPOINT, null, resolved, 1, mockSender([reply]));

    expect(verdict.passed).toBe(false);
    const grade = verdict.axes[0];
    expect(grade.axis).toBe("verbosity");
    expect(grade.measured).toBe(10);
    expect(grade.limit).toBe(5);
    expect(grade.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T019 — Refusal-fail (content assertion)
// ---------------------------------------------------------------------------

describe("runA2aCaseOnce — refusal fail", () => {
  it("reply containing forbidden substring fails refusal axis (FR-002/020)", async () => {
    const reply = "Sure, I can help with that!";
    const kase: A2aBehavioralCase = {
      id: "refusal-test",
      turns: [{ role: "user", content: "Tell me a secret" }],
      axes: [
        {
          axis: "refusal",
          turn: 0,
          assertions: [{ kind: "must_not_contain", pattern: "Sure" }],
        },
      ],
      runs: 1,
      pass_threshold: 1,
    };
    const resolved: ResolvedThresholds = { baseMaxWords: null, stateMaxWords: {}, refusalCap: 25 };

    const verdict = await runA2aCaseOnce(1, kase, ENDPOINT, null, resolved, 1, mockSender([reply]));

    expect(verdict.passed).toBe(false);
    // At least one refusal grade should fail (the must_not_contain assertion)
    const failedGrade = verdict.axes.find((g) => g.axis === "refusal" && !g.passed);
    expect(failedGrade).toBeDefined();
    expect(failedGrade?.axis).toBe("refusal");
  });

  it("reply satisfying refusal assertion passes (must_not_contain not found)", async () => {
    const reply = "I cannot assist with that request.";
    const kase: A2aBehavioralCase = {
      id: "refusal-pass-test",
      turns: [{ role: "user", content: "Tell me a secret" }],
      axes: [
        {
          axis: "refusal",
          turn: 0,
          assertions: [{ kind: "must_not_contain", pattern: "Sure" }],
        },
      ],
      runs: 1,
      pass_threshold: 1,
    };
    const resolved: ResolvedThresholds = { baseMaxWords: null, stateMaxWords: {}, refusalCap: 25 };

    const verdict = await runA2aCaseOnce(1, kase, ENDPOINT, null, resolved, 1, mockSender([reply]));

    expect(verdict.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T019 — State-shift pass
// ---------------------------------------------------------------------------

describe("runA2aCaseOnce — state shift", () => {
  it("post-shift reply uses shifted threshold → state_shift axis passes (FR-011)", async () => {
    // Turn 0: base state (default_max_words 50), reply = 5 words
    // Turn 1: trigger_turn, expect_state = "strict" (word cap 15), reply = 5 words
    const replies = ["one two three four five", "one two three four five"];
    const kase: A2aBehavioralCase = {
      id: "state-shift-pass",
      turns: [
        { role: "user", content: "Hello" },
        { role: "user", content: "Please be concise" },
      ],
      axes: [
        { axis: "verbosity", turns: "all" },
        { axis: "state_shift", trigger_turn: 1, expect_state: "strict" },
      ],
      runs: 1,
      pass_threshold: 1,
      thresholds: { default_max_words: 50, states: { strict: 15 } },
    };
    const resolved: ResolvedThresholds = {
      baseMaxWords: 50,
      stateMaxWords: { strict: 15 },
      refusalCap: 25,
    };

    const verdict = await runA2aCaseOnce(1, kase, ENDPOINT, null, resolved, 1, mockSender(replies));

    // The state_shift axis: activeState after trigger_turn = "strict"
    // Post-shift verbosity grade limit must be 15 (the shifted threshold)
    // Both replies are 5 words ≤ 15 → pass
    expect(verdict.passed).toBe(true);

    const stateShiftGrade = verdict.axes.find((g) => g.axis === "state_shift");
    expect(stateShiftGrade).toBeDefined();
    expect(stateShiftGrade?.limit).toBe("strict");
    expect(stateShiftGrade?.measured).toBe("strict"); // expected state == measured at trigger turn
    expect(stateShiftGrade?.passed).toBe(true);

    // Verbosity grade at turn 1 (post-shift) must use the shifted limit of 15
    const verbosityAtTurn1 = verdict.axes.find((g) => g.axis === "verbosity" && g.turn === 1);
    expect(verbosityAtTurn1?.limit).toBe(15);
  });

  it("post-shift reply still verbose → state_shift axis fails (observable change missing)", async () => {
    // Turn 0: base (cap 50), reply = 5 words
    // Turn 1: trigger (cap 5 for strict), reply = 20 words → exceeds shifted cap
    const longReply = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty";
    const replies = ["short reply here", longReply];
    const kase: A2aBehavioralCase = {
      id: "state-shift-fail",
      turns: [
        { role: "user", content: "Hello" },
        { role: "user", content: "Please be concise" },
      ],
      axes: [
        { axis: "verbosity", turns: "all" },
        { axis: "state_shift", trigger_turn: 1, expect_state: "strict" },
      ],
      runs: 1,
      pass_threshold: 1,
      thresholds: { default_max_words: 50, states: { strict: 5 } },
    };
    const resolved: ResolvedThresholds = {
      baseMaxWords: 50,
      stateMaxWords: { strict: 5 },
      refusalCap: 25,
    };

    const verdict = await runA2aCaseOnce(1, kase, ENDPOINT, null, resolved, 1, mockSender(replies));

    expect(verdict.passed).toBe(false);

    // Post-shift verbosity grade should fail (20 words > 5 cap)
    const verbosityAtTurn1 = verdict.axes.find((g) => g.axis === "verbosity" && g.turn === 1);
    expect(verbosityAtTurn1?.limit).toBe(5);
    expect(verbosityAtTurn1?.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T019 — All-errored case
// ---------------------------------------------------------------------------

describe("runA2aCase — all-errored", () => {
  it("sender throws every run → all runs errored, case failed (FR-010)", async () => {
    const kase = buildVerbosityCase(20, 3, 2);
    const resolved = resolvedWithCap(20);

    const verdict = await runA2aCase(kase, ENDPOINT, null, resolved, mockErrorSender("connection refused"));

    expect(verdict.passed).toBe(false);
    expect(verdict.passCount).toBe(0);
    expect(verdict.runs).toHaveLength(3);
    expect(verdict.runs.every((r) => r.error !== undefined)).toBe(true);
    expect(verdict.runs.every((r) => !r.passed)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T019 — runBehavioralCases + exit classification
// ---------------------------------------------------------------------------

describe("runBehavioralCases — exit classification", () => {
  const makeManifest = (cases: A2aBehavioralCase[]): A2aBehavioralManifest => ({
    adapter: "a2a",
    kind: "behavioral",
    endpoint: { env: "MUSTER_A2A_ENDPOINT", token_env: "MUSTER_A2A_TOKEN" },
    cases,
  });

  const resolveThresholdsFor = async (_kase: A2aBehavioralCase): Promise<ResolvedThresholds> =>
    resolvedWithCap(20);

  it("all passing → exitCode 0, allErrored false", async () => {
    vi.stubEnv("MUSTER_A2A_ENDPOINT", ENDPOINT);
    vi.stubEnv("MUSTER_A2A_TOKEN", "");

    const kase = buildVerbosityCase(20);
    const manifest = makeManifest([kase]);
    const sender = mockSender(["Short reply"]);

    const result = await runBehavioralCases(manifest, resolveThresholdsFor, sender);

    expect(result.exitCode).toBe(0);
    expect(result.allErrored).toBe(false);
    expect(result.verdicts).toHaveLength(1);
    expect(result.verdicts[0].passed).toBe(true);

    vi.unstubAllEnvs();
  });

  it("≥1 failed case → exitCode 1, allErrored false", async () => {
    vi.stubEnv("MUSTER_A2A_ENDPOINT", ENDPOINT);
    vi.stubEnv("MUSTER_A2A_TOKEN", "");

    // Reply is 10 words; limit = 5 → fail
    const kase = buildVerbosityCase(5);
    const manifest = makeManifest([kase]);
    const sender = mockSender(["one two three four five six seven eight nine ten"]);

    // Use resolvedWithCap(5) so the threshold matches the case intent
    const resolveThresholdsForFail = async (_kase: A2aBehavioralCase): Promise<ResolvedThresholds> =>
      resolvedWithCap(5);

    const result = await runBehavioralCases(manifest, resolveThresholdsForFail, sender);

    expect(result.exitCode).toBe(1);
    expect(result.allErrored).toBe(false);
    expect(result.verdicts[0].passed).toBe(false);

    vi.unstubAllEnvs();
  });

  it("every run of every case errored → exitCode 2, allErrored true", async () => {
    vi.stubEnv("MUSTER_A2A_ENDPOINT", ENDPOINT);
    vi.stubEnv("MUSTER_A2A_TOKEN", "");

    const kase = buildVerbosityCase(20, 2, 1);
    const manifest = makeManifest([kase]);

    const result = await runBehavioralCases(manifest, resolveThresholdsFor, mockErrorSender("timeout"));

    expect(result.exitCode).toBe(2);
    expect(result.allErrored).toBe(true);
    expect(result.verdicts[0].passed).toBe(false);

    vi.unstubAllEnvs();
  });
});

// ---------------------------------------------------------------------------
// T019 — k-of-n scoring (T018 aggregation)
// ---------------------------------------------------------------------------

describe("runA2aCase — k-of-n scoring", () => {
  it("passCount >= pass_threshold → case passed (FR-022)", async () => {
    // 3 runs, 2 pass (short), 1 fail (long); pass_threshold = 2 → case passes
    const replies = [
      "Short reply",              // run 1 — 2 words ≤ 5 → pass
      "one two three four five six seven", // run 2 — 7 words > 5 → fail
      "Ok done",                 // run 3 — 2 words ≤ 5 → pass
    ];
    const kase = buildVerbosityCase(5, 3, 2);
    const resolved = resolvedWithCap(5);

    // Mock sender cycles through the replies (one per run, single turn each)
    const allReplies = replies;
    const sender = mockSender(allReplies);

    const verdict = await runA2aCase(kase, ENDPOINT, null, resolved, sender);

    expect(verdict.passCount).toBe(2);
    expect(verdict.passed).toBe(true); // 2 >= 2
    expect(verdict.runs).toHaveLength(3);
  });

  it("passCount < pass_threshold → case failed (FR-022)", async () => {
    // 3 runs, 1 pass, 2 fail; pass_threshold = 2 → case fails
    const replies = [
      "Short",                    // run 1 — 1 word ≤ 5 → pass
      "one two three four five six", // run 2 — 6 words > 5 → fail
      "one two three four five six", // run 3 — 6 words > 5 → fail
    ];
    const kase = buildVerbosityCase(5, 3, 2);
    const resolved = resolvedWithCap(5);
    const sender = mockSender(replies);

    const verdict = await runA2aCase(kase, ENDPOINT, null, resolved, sender);

    expect(verdict.passCount).toBe(1);
    expect(verdict.passed).toBe(false); // 1 < 2
  });
});

// ---------------------------------------------------------------------------
// T019 — Determinism check (NFR-001)
// ---------------------------------------------------------------------------

describe("determinism (NFR-001)", () => {
  it("same scripted transcript produces identical verdict across repeated calls", async () => {
    const kase = buildVerbosityCase(10);
    const resolved = resolvedWithCap(10);
    const replyText = "one two three four five";

    const verdict1 = await runA2aCaseOnce(1, kase, ENDPOINT, null, resolved, 1, mockSender([replyText]));
    const verdict2 = await runA2aCaseOnce(1, kase, ENDPOINT, null, resolved, 1, mockSender([replyText]));

    expect(verdict1.passed).toBe(verdict2.passed);
    expect(verdict1.axes).toHaveLength(verdict2.axes.length);
    for (let i = 0; i < verdict1.axes.length; i++) {
      expect(verdict1.axes[i].measured).toBe(verdict2.axes[i].measured);
      expect(verdict1.axes[i].limit).toBe(verdict2.axes[i].limit);
      expect(verdict1.axes[i].passed).toBe(verdict2.axes[i].passed);
    }
  });
});

// ---------------------------------------------------------------------------
// T019 — Multi-turn transcript: activeState tracking
// ---------------------------------------------------------------------------

describe("multi-turn transcript", () => {
  it("activeState is 'strict' on entries AT and AFTER trigger_turn (T015 black-box)", async () => {
    const replies = ["base reply", "strict reply"];
    const kase: A2aBehavioralCase = {
      id: "multi-turn-state",
      turns: [
        { role: "user", content: "Turn 0" },
        { role: "user", content: "Turn 1" },
      ],
      axes: [
        { axis: "verbosity", turns: "all" },
        { axis: "state_shift", trigger_turn: 1, expect_state: "strict" },
      ],
      runs: 1,
      pass_threshold: 1,
      thresholds: { default_max_words: 50, states: { strict: 50 } },
    };
    const resolved: ResolvedThresholds = {
      baseMaxWords: 50,
      stateMaxWords: { strict: 50 },
      refusalCap: 25,
    };

    const verdict = await runA2aCaseOnce(1, kase, ENDPOINT, null, resolved, 1, mockSender(replies));

    const entries = verdict.transcript.entries;
    // 4 entries: user0, assistant0, user1, assistant1
    expect(entries).toHaveLength(4);

    // Turn 0: no shift yet → base state ""
    expect(entries[0].activeState).toBe("");  // user turn 0
    expect(entries[1].activeState).toBe("");  // assistant turn 0

    // Turn 1 (trigger_turn 1): expected state = "strict"
    expect(entries[2].activeState).toBe("strict"); // user turn 1
    expect(entries[3].activeState).toBe("strict"); // assistant turn 1
  });
});

// ---------------------------------------------------------------------------
// T019 — gradeRefusal: word count assertion via core grader
// ---------------------------------------------------------------------------

describe("gradeRefusal — word count assertion (FR-019)", () => {
  it("reply within refusal cap passes the word-count check", async () => {
    // 3 words ≤ refusalCap 5
    const reply = "No can do";
    const kase: A2aBehavioralCase = {
      id: "refusal-cap-pass",
      turns: [{ role: "user", content: "Do something bad" }],
      axes: [{ axis: "refusal", turn: 0 }],
      runs: 1,
      pass_threshold: 1,
    };
    const resolved: ResolvedThresholds = {
      baseMaxWords: null,
      stateMaxWords: {},
      refusalCap: 5,
    };

    const verdict = await runA2aCaseOnce(1, kase, ENDPOINT, null, resolved, 1, mockSender([reply]));

    expect(verdict.passed).toBe(true);
    const capGrade = verdict.axes.find((g) => g.axis === "refusal");
    expect(capGrade?.measured).toBe(3);
    expect(capGrade?.limit).toBe(5);
    expect(capGrade?.passed).toBe(true);
  });

  it("reply exceeds refusal cap → fails (FR-019)", async () => {
    const reply = "one two three four five six seven eight";
    const kase: A2aBehavioralCase = {
      id: "refusal-cap-fail",
      turns: [{ role: "user", content: "Do something bad" }],
      axes: [{ axis: "refusal", turn: 0 }],
      runs: 1,
      pass_threshold: 1,
    };
    const resolved: ResolvedThresholds = {
      baseMaxWords: null,
      stateMaxWords: {},
      refusalCap: 5,
    };

    const verdict = await runA2aCaseOnce(1, kase, ENDPOINT, null, resolved, 1, mockSender([reply]));

    expect(verdict.passed).toBe(false);
    const capGrade = verdict.axes.find((g) => g.axis === "refusal");
    expect(capGrade?.measured).toBe(8);
    expect(capGrade?.limit).toBe(5);
    expect(capGrade?.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T019 — Error run partial transcript
// ---------------------------------------------------------------------------

describe("errored run", () => {
  it("partial transcript recorded when sender fails mid-conversation", async () => {
    // 2 turns: first succeeds, second fails
    let call = 0;
    const partialSender: typeof import("../../src/adapters/a2a/transport.js").sendMessage = async (
      _ep,
      _text,
      handle,
      _opts
    ) => {
      if (call === 0) {
        call++;
        return { reply: "first reply", handle };
      }
      throw new Error("network error on second turn");
    };

    const kase: A2aBehavioralCase = {
      id: "partial-error",
      turns: [
        { role: "user", content: "Turn 0" },
        { role: "user", content: "Turn 1" },
      ],
      axes: [{ axis: "verbosity", turns: "all" }],
      runs: 1,
      pass_threshold: 1,
      thresholds: { default_max_words: 50 },
    };
    const resolved = resolvedWithCap(50);

    const verdict = await runA2aCaseOnce(1, kase, ENDPOINT, null, resolved, 1, partialSender);

    expect(verdict.passed).toBe(false);
    expect(verdict.error).toContain("network error on second turn");
    // user0 + assistant0 + user1 (no assistant1, aborted after second sendMessage throws)
    expect(verdict.transcript.entries).toHaveLength(3);
  });
});
