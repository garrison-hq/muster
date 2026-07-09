/**
 * Unit tests for src/adapters/memory-utilization/manifest.ts (validateCase).
 */

import { describe, expect, it } from "vitest";
import { CONDITION_ARMS, validateCase, type LearningLiftCase } from "../../../src/adapters/memory-utilization/manifest.js";

function baseCase(overrides: Partial<LearningLiftCase> = {}): LearningLiftCase {
  return {
    id: "case-1",
    fixture: {
      memoryPath: "tests/fixtures/memory-utilization/basic/MEMORY.md",
      userPath: "tests/fixtures/memory-utilization/basic/USER.md",
      manifestPath: "tests/fixtures/memory-utilization/basic/manifest.json",
    },
    probes: [
      {
        id: "probe-1",
        turns: [{ role: "user", content: "What is my favorite language?" }],
        expected: { kind: "fact-substring", requiredFactId: "memory-facts-0" },
        requiresMemory: true,
        kind: "lift",
      },
    ],
    arms: [...CONDITION_ARMS],
    runsN: 3,
    thresholds: {
      liftDelta: 0.3,
      contaminationThreshold: 0.5,
      baselineFloor: 0.05,
      baselineCeiling: 0.95,
    },
    ...overrides,
  };
}

describe("validateCase", () => {
  it("accepts a well-formed case", () => {
    expect(() => validateCase(baseCase())).not.toThrow();
  });

  it("rejects an arms list that omits an arm", () => {
    expect(() => validateCase(baseCase({ arms: ["no-memory", "with-memory"] }))).toThrow(/arms/);
  });

  it("rejects an arms list with a duplicate instead of the missing arm", () => {
    expect(() =>
      validateCase(baseCase({ arms: ["no-memory", "no-memory", "with-memory"] }))
    ).toThrow(/arms/);
  });

  it("rejects an empty probe set", () => {
    expect(() => validateCase(baseCase({ probes: [] }))).toThrow(/at least one probe/);
  });

  it("rejects a probe set with only abstention probes (no lift probe)", () => {
    expect(() =>
      validateCase(
        baseCase({
          probes: [
            {
              id: "abstain-1",
              turns: [{ role: "user", content: "What is my mother's maiden name?" }],
              expected: { kind: "abstain" },
              requiresMemory: false,
              kind: "abstention",
            },
          ],
        })
      )
    ).toThrow(/at least one "lift" probe/);
  });

  it("rejects a non-integer runsN", () => {
    expect(() => validateCase(baseCase({ runsN: 2.5 }))).toThrow(/runsN/);
  });

  it("rejects runsN < 1", () => {
    expect(() => validateCase(baseCase({ runsN: 0 }))).toThrow(/runsN/);
  });

  it("rejects liftDelta <= 0", () => {
    expect(() =>
      validateCase(
        baseCase({
          thresholds: { liftDelta: 0, contaminationThreshold: 0.5, baselineFloor: 0.05, baselineCeiling: 0.95 },
        })
      )
    ).toThrow(/liftDelta/);
  });

  it("rejects contaminationThreshold outside (0, 1]", () => {
    expect(() =>
      validateCase(
        baseCase({
          thresholds: { liftDelta: 0.3, contaminationThreshold: 0, baselineFloor: 0.05, baselineCeiling: 0.95 },
        })
      )
    ).toThrow(/contaminationThreshold/);
  });

  it("rejects baselineFloor >= baselineCeiling", () => {
    expect(() =>
      validateCase(
        baseCase({
          thresholds: { liftDelta: 0.3, contaminationThreshold: 0.5, baselineFloor: 0.9, baselineCeiling: 0.5 },
        })
      )
    ).toThrow(/baselineFloor/);
  });
});
