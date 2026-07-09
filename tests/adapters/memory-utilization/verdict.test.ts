/**
 * Unit tests for src/adapters/memory-utilization/verdict.ts.
 *
 * Covers FR-004 (verdict precedence: baseline-invalid > contaminated >
 * lift-confirmed/no-lift), the two-sided baseline-validity guard, and the
 * bounded/powered MDE the "no-lift" branch always reports (FR-008).
 */

import { describe, expect, it } from "vitest";
import { computeLiftMeasurement, isBaselineValid } from "../../../src/adapters/memory-utilization/verdict.js";
import type { PairedOutcome } from "../../../src/core/behavioral/stats/paired.js";

const THRESHOLDS = { liftDelta: 0.3, baselineFloor: 0.05, baselineCeiling: 0.95 };

/**
 * 16 lift pairs: 4 concordant-pass, 12 discordant favoring "with-memory" —
 * strong enough that BOTH the McNemar mid-p AND the Tango CI's lower bound
 * clear a 0.3 lift threshold (verified against the raw estimators directly).
 */
const STRONG_LIFT_PAIRS: PairedOutcome[] = [
  ...Array.from({ length: 4 }, () => ({ armA: true, armB: true })),
  ...Array.from({ length: 12 }, () => ({ armA: true, armB: false })),
];

/** Matching no-lift shape on the scrambled arm: identical pattern to no-memory -> zero discordance. */
const NO_DISCORDANCE_PAIRS: PairedOutcome[] = [
  ...Array.from({ length: 4 }, () => ({ armA: true, armB: true })),
  ...Array.from({ length: 12 }, () => ({ armA: false, armB: false })),
];

/** 8 fully concordant pairs (4 pass / 4 fail identically in both arms) -> delta = 0, mid-p = 1. */
const CONCORDANT_PAIRS: PairedOutcome[] = [
  ...Array.from({ length: 4 }, () => ({ armA: true, armB: true })),
  ...Array.from({ length: 4 }, () => ({ armA: false, armB: false })),
];

describe("isBaselineValid", () => {
  it("is valid strictly between floor and ceiling", () => {
    expect(isBaselineValid(0.5, 0.05, 0.95)).toBe(true);
  });

  it("rejects at or below the floor (baseline floored)", () => {
    expect(isBaselineValid(0.05, 0.05, 0.95)).toBe(false);
    expect(isBaselineValid(0, 0.05, 0.95)).toBe(false);
  });

  it("rejects at or above the ceiling (baseline saturated)", () => {
    expect(isBaselineValid(0.95, 0.05, 0.95)).toBe(false);
    expect(isBaselineValid(1, 0.05, 0.95)).toBe(false);
  });
});

describe("computeLiftMeasurement — verdict precedence (FR-004)", () => {
  it("lift-confirmed: significant paired delta, CI clears the threshold, baseline valid, no contamination", () => {
    const measurement = computeLiftMeasurement({
      caseId: "case-lift",
      liftPairs: STRONG_LIFT_PAIRS,
      scrambledPairs: NO_DISCORDANCE_PAIRS,
      passRateWithMemory: 1.0,
      passRateNoMemory: 0.25,
      passRateScrambledMemory: 0.25,
      contaminatedIds: [],
      thresholds: THRESHOLDS,
      runsN: 3,
    });
    expect(measurement.verdict).toBe("lift-confirmed");
    expect(measurement.mcnemarMidP).toBeLessThan(0.05);
    expect(measurement.baselineValid).toBe(true);
    expect(measurement.contaminated).toBe(false);
    expect(measurement.mde).toBeGreaterThanOrEqual(0);
  });

  it("no-lift: zero discordance -> a bounded/powered null, not bare absence of evidence", () => {
    const measurement = computeLiftMeasurement({
      caseId: "case-no-lift",
      liftPairs: CONCORDANT_PAIRS,
      scrambledPairs: CONCORDANT_PAIRS,
      passRateWithMemory: 0.5,
      passRateNoMemory: 0.5,
      passRateScrambledMemory: 0.5,
      contaminatedIds: [],
      thresholds: THRESHOLDS,
      runsN: 3,
    });
    expect(measurement.verdict).toBe("no-lift");
    expect(measurement.mcnemarMidP).toBe(1);
    // FR-008: a no-lift verdict always carries a reported MDE (bounded/powered null).
    expect(Number.isFinite(measurement.mde)).toBe(true);
    expect(measurement.mde).toBeGreaterThan(0);
  });

  it("contaminated overrides an otherwise-significant lift (FR-006)", () => {
    const measurement = computeLiftMeasurement({
      caseId: "case-contaminated",
      liftPairs: STRONG_LIFT_PAIRS,
      scrambledPairs: NO_DISCORDANCE_PAIRS,
      passRateWithMemory: 1.0,
      passRateNoMemory: 0.25,
      passRateScrambledMemory: 0.25,
      contaminatedIds: ["leaky-probe"],
      thresholds: THRESHOLDS,
      runsN: 3,
    });
    expect(measurement.verdict).toBe("contaminated");
    expect(measurement.contaminated).toBe(true);
    expect(measurement.contaminatedProbeIds).toEqual(["leaky-probe"]);
  });

  it("baseline-invalid (saturated) takes precedence over contamination and a significant lift", () => {
    const measurement = computeLiftMeasurement({
      caseId: "case-baseline-invalid",
      liftPairs: STRONG_LIFT_PAIRS,
      scrambledPairs: NO_DISCORDANCE_PAIRS,
      passRateWithMemory: 1.0,
      passRateNoMemory: 0.98, // saturated: at/above the default ceiling
      passRateScrambledMemory: 0.98,
      contaminatedIds: ["leaky-probe"],
      thresholds: THRESHOLDS,
      runsN: 3,
    });
    expect(measurement.verdict).toBe("baseline-invalid");
    expect(measurement.baselineValid).toBe(false);
  });

  it("baseline-invalid (floored) also takes precedence — a full 0->1 swing is unmeasurable, not a clean lift", () => {
    const measurement = computeLiftMeasurement({
      caseId: "case-baseline-floored",
      liftPairs: [
        { armA: true, armB: false },
        { armA: true, armB: false },
        { armA: true, armB: false },
        { armA: true, armB: false },
      ],
      scrambledPairs: [
        { armA: false, armB: false },
        { armA: false, armB: false },
        { armA: false, armB: false },
        { armA: false, armB: false },
      ],
      passRateWithMemory: 1.0,
      passRateNoMemory: 0, // floored: at/below the default floor
      passRateScrambledMemory: 0,
      contaminatedIds: [],
      thresholds: THRESHOLDS,
      runsN: 3,
    });
    expect(measurement.verdict).toBe("baseline-invalid");
    expect(measurement.baselineValid).toBe(false);
  });
});
