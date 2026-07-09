/**
 * Unit tests for src/adapters/memory-utilization/verdict.ts.
 *
 * Covers FR-004 (verdict precedence: baseline-invalid > contaminated >
 * lift-confirmed/no-lift), the asymmetric baseline-validity guard (ceiling on
 * the no-memory baseline, floor on the with-memory treatment arm), and the
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
  it("is valid when the no-memory baseline has headroom and the treatment can answer", () => {
    expect(isBaselineValid(0.5, 0.9, 0.05, 0.95)).toBe(true);
  });

  it("a floored NO-MEMORY baseline is VALID — the ideal setup for memory-utilization", () => {
    // A contamination-clean fixture supplies facts the model cannot know without
    // the memory, so the no-memory arm SHOULD floor while the with-memory arm lifts.
    expect(isBaselineValid(0, 1.0, 0.05, 0.95)).toBe(true);
    expect(isBaselineValid(0, 0.5, 0.05, 0.95)).toBe(true);
  });

  it("rejects when the TREATMENT (with-memory) arm floors — even memory can't answer, probes are broken", () => {
    expect(isBaselineValid(0, 0.05, 0.05, 0.95)).toBe(false);
    expect(isBaselineValid(0, 0.0, 0.05, 0.95)).toBe(false);
  });

  it("rejects when the no-memory baseline is saturated at/above the ceiling (no headroom for a lift)", () => {
    expect(isBaselineValid(0.95, 1.0, 0.05, 0.95)).toBe(false);
    expect(isBaselineValid(0.98, 1.0, 0.05, 0.95)).toBe(false);
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

  it("floored no-memory baseline is VALID (the ideal case) — a strong lift reads lift-confirmed, not baseline-invalid", () => {
    const measurement = computeLiftMeasurement({
      caseId: "case-baseline-floored-ideal",
      liftPairs: STRONG_LIFT_PAIRS,
      scrambledPairs: NO_DISCORDANCE_PAIRS,
      passRateWithMemory: 1.0,
      passRateNoMemory: 0, // floored no-memory baseline — the contamination-clean ideal
      passRateScrambledMemory: 0,
      contaminatedIds: [],
      thresholds: THRESHOLDS,
      runsN: 3,
    });
    expect(measurement.baselineValid).toBe(true);
    expect(measurement.verdict).toBe("lift-confirmed");
  });

  it("baseline-invalid when the TREATMENT arm also floors — probes unanswerable even with memory", () => {
    const measurement = computeLiftMeasurement({
      caseId: "case-treatment-floored",
      liftPairs: Array.from({ length: 4 }, () => ({ armA: false, armB: false })),
      scrambledPairs: Array.from({ length: 4 }, () => ({ armA: false, armB: false })),
      passRateWithMemory: 0, // even with memory nothing is answerable -> broken probes
      passRateNoMemory: 0,
      passRateScrambledMemory: 0,
      contaminatedIds: [],
      thresholds: THRESHOLDS,
      runsN: 3,
    });
    expect(measurement.verdict).toBe("baseline-invalid");
    expect(measurement.baselineValid).toBe(false);
  });
});
