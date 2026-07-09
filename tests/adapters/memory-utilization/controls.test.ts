/**
 * Unit tests for src/adapters/memory-utilization/controls.ts.
 *
 * Covers FR-005 (scrambled-memory negative control), FR-010 (cap-of-zero
 * rigged-impossible control + the all-refuse guard).
 */

import { describe, expect, it, vi } from "vitest";
import {
  capOfZeroFailedAsDesigned,
  checkCapOfZeroControl,
  evaluateAllRefuseGuard,
  evaluateScrambledControl,
} from "../../../src/adapters/memory-utilization/controls.js";
import type { LiftMeasurement } from "../../../src/adapters/memory-utilization/verdict.js";
import type { LearningLiftCase } from "../../../src/adapters/memory-utilization/manifest.js";

function measurement(overrides: Partial<LiftMeasurement> = {}): LiftMeasurement {
  return {
    caseId: "c1",
    probeCount: 8,
    passRateWithMemory: 0,
    passRateNoMemory: 0,
    passRateScrambledMemory: 0,
    delta: 0,
    deltaCI: { lower: 0, upper: 0 },
    mcnemarMidP: 1,
    scrambledDelta: 0,
    scrambledMidP: 1,
    mde: 0.2,
    baselineValid: true,
    contaminatedProbeIds: [],
    contaminated: false,
    verdict: "no-lift",
    ...overrides,
  };
}

describe("evaluateScrambledControl (FR-005)", () => {
  it("passes when the scrambled arm shows no significant lift", () => {
    const result = evaluateScrambledControl(
      measurement({ scrambledMidP: 0.8, scrambledDelta: 0.02 }),
      { liftDelta: 0.3 }
    );
    expect(result.passed).toBe(true);
  });

  it("FAILS as designed when the scrambled arm shows a significant lift (proves the discrimination works)", () => {
    const result = evaluateScrambledControl(
      measurement({ scrambledMidP: 0.001, scrambledDelta: 0.75 }),
      { liftDelta: 0.3 }
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/prompt-stuffing|context-stuffing/);
  });

  it("does not fail when significant p-value is paired with a below-threshold delta", () => {
    const result = evaluateScrambledControl(
      measurement({ scrambledMidP: 0.001, scrambledDelta: 0.05 }),
      { liftDelta: 0.3 }
    );
    expect(result.passed).toBe(true);
  });
});

describe("evaluateAllRefuseGuard (FR-010)", () => {
  it("fires when every arm's pass-rate is exactly zero", () => {
    const result = evaluateAllRefuseGuard(
      measurement({ passRateWithMemory: 0, passRateNoMemory: 0, passRateScrambledMemory: 0 })
    );
    expect(result.fired).toBe(true);
  });

  it("does not fire when at least one arm has a nonzero pass-rate", () => {
    const result = evaluateAllRefuseGuard(
      measurement({ passRateWithMemory: 0.4, passRateNoMemory: 0, passRateScrambledMemory: 0 })
    );
    expect(result.fired).toBe(false);
  });
});

function capCase(overrides: Partial<LearningLiftCase> = {}): LearningLiftCase {
  return {
    id: "cap-of-zero",
    fixture: {
      memoryPath: "m.md",
      userPath: "u.md",
      manifestPath: "manifest.json",
    },
    probes: [],
    arms: ["no-memory", "with-memory", "scrambled-memory"],
    runsN: 1,
    thresholds: { liftDelta: 0.3, contaminationThreshold: 0.5, baselineFloor: 0.05, baselineCeiling: 0.95 },
    isCapOfZeroControl: true,
    ...overrides,
  };
}

describe("cap-of-zero control (FR-010)", () => {
  it("capOfZeroFailedAsDesigned is true for a non-control case regardless of verdict", () => {
    expect(capOfZeroFailedAsDesigned(capCase({ isCapOfZeroControl: false }), "lift-confirmed")).toBe(true);
  });

  it("capOfZeroFailedAsDesigned is true when the rigged case correctly does NOT confirm a lift", () => {
    expect(capOfZeroFailedAsDesigned(capCase(), "no-lift")).toBe(true);
    expect(capOfZeroFailedAsDesigned(capCase(), "baseline-invalid")).toBe(true);
  });

  it("capOfZeroFailedAsDesigned is false — a grader bug — if the rigged case confirms a lift", () => {
    expect(capOfZeroFailedAsDesigned(capCase(), "lift-confirmed")).toBe(false);
  });

  it("checkCapOfZeroControl warns only when a control case wrongly confirms a lift", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      checkCapOfZeroControl(capCase(), "no-lift");
      expect(warnSpy).not.toHaveBeenCalled();

      checkCapOfZeroControl(capCase(), "lift-confirmed");
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toMatch(/CAP-OF-ZERO CONTROL PASSED/);

      warnSpy.mockClear();
      checkCapOfZeroControl(capCase({ isCapOfZeroControl: false }), "lift-confirmed");
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
