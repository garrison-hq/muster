import { describe, expect, it } from "vitest";
import {
  gradeRefusal,
  gradeStateShift,
  gradeVerbosity,
  verbosityLimit,
} from "../../src/core/behavioral/graders.js";
import type { AxisGrade, TranscriptEntry } from "../../src/core/behavioral/types.js";
import { rfc1Adapter } from "../../src/adapters/rfc1/index.js";
import {
  maxWords,
  rfc1Thresholds,
  words,
} from "../../src/adapters/rfc1/thresholds.js";

const thresholds = rfc1Thresholds;

function reply(content: string, wordCount?: number): TranscriptEntry {
  const entry: TranscriptEntry = { role: "assistant", content, activeState: "" };
  if (wordCount !== undefined) entry.wordCount = wordCount;
  return entry;
}

function wordsOf(n: number): string {
  return Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
}

describe("R9 thresholds (locked) — src/adapters/rfc1/thresholds.ts", () => {
  it("R9 maxWords(verbosity) = 10 + verbosity; rfc1Adapter.thresholds.maxWords(30) === 40 (WP05 seam completed)", () => {
    // Definition of Done: linkage through the adapter's dynamic seam.
    expect(rfc1Adapter.thresholds.maxWords(30)).toBe(40);
    expect(maxWords(0)).toBe(10);
    expect(maxWords(100)).toBe(110);
  });

  it("R9 refusalCap is the locked constant 25", () => {
    expect(rfc1Adapter.thresholds.refusalCap).toBe(25);
    expect(rfc1Thresholds.refusalCap).toBe(25);
  });

  it("R9 words(s) = trim-split-/\\s+/-count: whitespace runs collapse, empty string is 0", () => {
    expect(words("hello world")).toBe(2);
    expect(words("  a \t b\nc  ")).toBe(3);
    expect(words("")).toBe(0);
    expect(words("   \n  ")).toBe(0);
    expect(rfc1Adapter.thresholds.words("one  two")).toBe(2);
  });
});

describe("FR-018 verbosity grader (§6 voice.verbosity → R9 word budget)", () => {
  const effective = { voice: { verbosity: 30 } };

  it("FR-018 exact-at-limit passes; one-over fails (NFR-005: measured and limit always present)", () => {
    const atLimit = gradeVerbosity(reply(wordsOf(40)), effective, undefined, thresholds, 0);
    expect(atLimit).toEqual({
      axis: "verbosity",
      turn: 0,
      measured: 40,
      limit: 40,
      passed: true,
    });

    const oneOver = gradeVerbosity(reply(wordsOf(41)), effective, undefined, thresholds, 0);
    expect(oneOver.measured).toBe(41);
    expect(oneOver.limit).toBe(40);
    expect(oneOver.passed).toBe(false);
  });

  it("FR-018 per-case override wins over the R9 mapping", () => {
    const grade = gradeVerbosity(reply(wordsOf(6)), effective, 5, thresholds, 2);
    expect(grade.limit).toBe(5);
    expect(grade.passed).toBe(false);
    expect(gradeVerbosity(reply(wordsOf(5)), effective, 5, thresholds, 2).passed).toBe(true);
  });

  it("FR-018 prefers the recorded wordCount; recomputes via R9 words() when absent", () => {
    expect(gradeVerbosity(reply(wordsOf(50), 12), effective, undefined, thresholds, 0).measured).toBe(12);
    expect(gradeVerbosity(reply("three short words"), effective, undefined, thresholds, 0).measured).toBe(3);
  });

  it("NFR-005 missing voice.verbosity → failed grade with an explanatory string limit, never NaN", () => {
    const grade = gradeVerbosity(reply(wordsOf(3)), { id: "x" }, undefined, thresholds, 0);
    expect(grade.passed).toBe(false);
    expect(typeof grade.limit).toBe("string");
    expect(grade.limit).toContain("voice.verbosity");
    expect(verbosityLimit({ voice: { verbosity: "high" } }, undefined, thresholds)).toContain(
      "voice.verbosity"
    );
  });
});

describe("FR-019/FR-020 refusal grader (R9 cap 25 + content assertions)", () => {
  it("FR-019 exact-at-cap passes, one-over fails; override wins", () => {
    expect(gradeRefusal(reply(wordsOf(25)), undefined, [], thresholds, 0)[0]?.passed).toBe(true);
    const over = gradeRefusal(reply(wordsOf(26)), undefined, [], thresholds, 0)[0];
    expect(over?.passed).toBe(false);
    expect(over?.measured).toBe(26);
    expect(over?.limit).toBe(25);
    expect(gradeRefusal(reply(wordsOf(26)), 30, [], thresholds, 0)[0]?.passed).toBe(true);
  });

  it("FR-020 regex price assertion catches both \"$129.99\" and \"129 dollars\" styles", () => {
    const noPrices = {
      kind: "must_not_contain" as const,
      pattern: "\\$?\\d+([.,]\\d+)?",
      regex: true,
    };
    const dollarSign = gradeRefusal(
      reply("It will cost $129.99 next year."),
      undefined,
      [noPrices],
      thresholds,
      0
    );
    expect(dollarSign[1]?.passed).toBe(false);
    expect(dollarSign[1]?.measured).toBe("match");

    const spelled = gradeRefusal(
      reply("Probably around 129 dollars."),
      undefined,
      [noPrices],
      thresholds,
      0
    );
    expect(spelled[1]?.passed).toBe(false);

    const clean = gradeRefusal(
      reply("I cannot speculate about future pricing."),
      undefined,
      [noPrices],
      thresholds,
      0
    );
    expect(clean[1]?.passed).toBe(true);
    expect(clean[1]?.measured).toBe("no match");
  });

  it("FR-020 substring assertions are case-insensitive by default (contract)", () => {
    const mustApologize = { kind: "must_contain" as const, pattern: "sorry" };
    const grades = gradeRefusal(reply("Sorry, I can't share that."), undefined, [mustApologize], thresholds, 1);
    expect(grades[1]?.passed).toBe(true);
    const missing = gradeRefusal(reply("No."), undefined, [mustApologize], thresholds, 1);
    expect(missing[1]?.passed).toBe(false);
  });

  it("NFR-005 each assertion is its own AxisGrade line, with the word-cap grade first", () => {
    const grades = gradeRefusal(
      reply("No comment."),
      undefined,
      [
        { kind: "must_contain", pattern: "no" },
        { kind: "must_not_contain", pattern: "\\d+", regex: true },
      ],
      thresholds,
      3
    );
    expect(grades).toHaveLength(3);
    for (const grade of grades) {
      expect(grade.axis).toBe("refusal");
      expect(grade.turn).toBe(3);
      expect(grade.measured).toBeDefined();
      expect(grade.limit).toBeDefined();
    }
    expect(grades.map((g) => g.passed)).toEqual([true, true, true]);
  });
});

describe("FR-021 state-shift grader (§20.3.4 observable change)", () => {
  const shiftedGrade = (limit: number | string, turn = 1): AxisGrade => ({
    axis: "verbosity",
    turn,
    measured: 5,
    limit,
    passed: true,
  });

  it("FR-021 passes when the adapter reported expect_state and post-shift grades used the shifted limit", () => {
    const grade = gradeStateShift("cold_strict", "cold_strict", [shiftedGrade(10)], {
      turn: 1,
      shiftedLimit: 10,
    });
    expect(grade).toEqual({
      axis: "state_shift",
      turn: 1,
      measured: "cold_strict",
      limit: "cold_strict",
      passed: true,
    });
  });

  it("§20.3.4 fails when the state never shifted (measured = actual state, limit = expected)", () => {
    const grade = gradeStateShift("friendly", "cold_strict", [], { turn: 1 });
    expect(grade.passed).toBe(false);
    expect(grade.measured).toBe("friendly");
    expect(grade.limit).toBe("cold_strict");
  });

  it("FR-021 fails when post-shift verbosity grades used the BASE state's threshold (no observable change)", () => {
    const grade = gradeStateShift("cold_strict", "cold_strict", [shiftedGrade(60)], {
      turn: 1,
      shiftedLimit: 10,
    });
    expect(grade.passed).toBe(false);
  });

  it("NFR-005 no active state renders as an explanatory measured string", () => {
    const grade = gradeStateShift("", "cold_strict", [], { turn: 0 });
    expect(grade.measured).toBe("(no active state)");
    expect(grade.passed).toBe(false);
  });
});
