/**
 * The subject-matter gate's rigged-impossible discrimination control
 * (garrison-hq/muster#84, charter FR-009).
 *
 * This suite exists to OBSERVE the control failing. The control declares the
 * impossible expectation `ok: true` over a composition that unambiguously
 * contradicts itself on a shared subject; a working detector reports the
 * contradiction, so the control's `passed` is false. If it ever flips to true,
 * the contradiction lint has gone vacuous-closed and every downstream suite is
 * green while verifying nothing.
 *
 * Both neutralising arms are asserted too: they are what makes the rigged
 * arm's failure a real detection rather than an artefact of how the fixture
 * was written.
 *
 * Normative citation: docs/rubric/crosslayer-contradiction-gate.md; FR-009.
 */

import { describe, expect, it, vi } from "vitest";
import {
  checkSubjectMatterGateControl,
  describeGateControlOutcome,
  evaluateSubjectMatterGateControl,
} from "../../../src/crosslayer/lint-controls.js";
import type { GateControlResult } from "../../../src/crosslayer/lint-controls.js";

const CLEAN_ARM = { clean: true, findingTypes: [] } as const;
const DIRTY_ARM = {
  clean: false,
  findingTypes: ["cross-layer-contradiction", "undefined-precedence"],
} as const;

describe("subject-matter gate discrimination control (FR-009)", () => {
  it("the rigged arm does NOT meet its impossible expectation — observed failing", () => {
    const result = evaluateSubjectMatterGateControl();
    expect(result.passed).toBe(false);
    expect(result.rigged.clean).toBe(false);
    expect(result.rigged.findingTypes).toContain("cross-layer-contradiction");
    expect(result.rigged.findingTypes).toContain("undefined-precedence");
  });

  it("the polarity-neutralised arm is clean — the verdict tracks the polarity axis", () => {
    const result = evaluateSubjectMatterGateControl();
    expect(result.polarityNeutralised.clean).toBe(true);
    expect(result.polarityNeutralised.findingTypes).toHaveLength(0);
  });

  it("the subject-shifted arm is clean — the verdict tracks the subject-matter axis", () => {
    const result = evaluateSubjectMatterGateControl();
    expect(result.subjectShifted.clean).toBe(true);
    expect(result.subjectShifted.findingTypes).toHaveLength(0);
  });

  it("reports failedAsDesigned with a reason naming both axes", () => {
    const result = evaluateSubjectMatterGateControl();
    expect(result.failedAsDesigned).toBe(true);
    expect(result.reason).toContain("failed as designed");
  });

  it("is deterministic — two evaluations serialise identically (NFR-001)", () => {
    const first = JSON.stringify(evaluateSubjectMatterGateControl());
    const second = JSON.stringify(evaluateSubjectMatterGateControl());
    expect(first).toBe(second);
  });
});

describe("describeGateControlOutcome — the two failure messages", () => {
  it("names the grader bug when the rigged arm met its impossible expectation", () => {
    // Vacuous-closed detector: nothing is ever reported, so the rigged arm's
    // ok: true expectation is satisfied and every downstream suite goes green.
    const reason = describeGateControlOutcome({
      passed: true,
      failedAsDesigned: false,
      rigged: CLEAN_ARM,
      polarityNeutralised: CLEAN_ARM,
      subjectShifted: CLEAN_ARM,
    });
    expect(reason).toContain("CONTROL PASSED");
    expect(reason).toContain("grader bug");
  });

  it("names the non-discriminating case when a neutralising arm is dirty", () => {
    // Vacuous-open gate: the subject-shifted arm reports too, so the rigged
    // arm's failure proves nothing about the gate.
    const reason = describeGateControlOutcome({
      passed: false,
      failedAsDesigned: false,
      rigged: DIRTY_ARM,
      polarityNeutralised: CLEAN_ARM,
      subjectShifted: DIRTY_ARM,
    });
    expect(reason).toContain("NOT DISCRIMINATING");
    expect(reason).toContain("subject-shifted clean=false");
  });
});

describe("checkSubjectMatterGateControl — the guard fires on a non-discriminating control", () => {
  it("stays silent when the control failed as designed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      checkSubjectMatterGateControl(evaluateSubjectMatterGateControl());
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("warns when the rigged arm met its impossible expectation", () => {
    const vacuousClosed: GateControlResult = {
      passed: true,
      failedAsDesigned: false,
      rigged: { clean: true, findingTypes: [] },
      polarityNeutralised: { clean: true, findingTypes: [] },
      subjectShifted: { clean: true, findingTypes: [] },
      reason: "SUBJECT-MATTER GATE CONTROL PASSED — grader bug.",
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      checkSubjectMatterGateControl(vacuousClosed);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});
