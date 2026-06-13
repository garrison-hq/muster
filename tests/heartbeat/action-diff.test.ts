/**
 * Unit tests for src/adapters/heartbeat/graders/action-diff.ts
 *
 * Covers T008 (gradeActionDiff, extractObservedActions, gradeRun,
 * aggregateActionDiff, HEARTBEAT_OK guard) and T010 (discrimination controls,
 * FR-009).
 */

import { describe, it, expect } from "vitest";
import {
  gradeActionDiff,
  extractObservedActions,
  gradeRun,
  aggregateActionDiff,
  buildDueTick,
} from "../../src/adapters/heartbeat/graders/action-diff.js";
import type { ActionDiff } from "../../src/adapters/heartbeat/graders/action-diff.js";
import { parseHeartbeat } from "../../src/adapters/heartbeat/lint.js";
import { buildIntervalConfig } from "../../src/adapters/heartbeat/tick.js";
import type { SimulatedTick } from "../../src/adapters/heartbeat/tick.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDueTick(): SimulatedTick {
  return {
    id: "tick-due-1",
    scenarioFraming: "",
    state: "due",
    priorActionSummary: null,
    intervalConfig: buildIntervalConfig(),
  };
}

// ---------------------------------------------------------------------------
// gradeActionDiff
// ---------------------------------------------------------------------------

describe("gradeActionDiff", () => {
  it("exact match → passed: true, empty missing/extra", () => {
    const result = gradeActionDiff(
      ["check-error-log", "summarise-prs"],
      ["check-error-log", "summarise-prs"]
    );
    expect(result.passed).toBe(true);
    expect(result.missingActions).toHaveLength(0);
    expect(result.extraActions).toHaveLength(0);
    expect(result.intendedActions).toEqual(["check-error-log", "summarise-prs"]);
    expect(result.observedActions).toEqual(["check-error-log", "summarise-prs"]);
  });

  it("missing action → passed: false, correct missingActions", () => {
    const result = gradeActionDiff(
      ["check-error-log", "summarise-prs"],
      ["check-error-log"]
    );
    expect(result.passed).toBe(false);
    expect(result.missingActions).toEqual(["summarise-prs"]);
    expect(result.extraActions).toHaveLength(0);
  });

  it("extra action → passed: false, correct extraActions", () => {
    const result = gradeActionDiff(
      ["check-error-log"],
      ["check-error-log", "update-calendar"]
    );
    expect(result.passed).toBe(false);
    expect(result.missingActions).toHaveLength(0);
    expect(result.extraActions).toEqual(["update-calendar"]);
  });

  it("both missing and extra → passed: false, both non-empty", () => {
    const result = gradeActionDiff(
      ["check-error-log", "summarise-prs"],
      ["summarise-prs", "update-calendar"]
    );
    expect(result.passed).toBe(false);
    expect(result.missingActions).toEqual(["check-error-log"]);
    expect(result.extraActions).toEqual(["update-calendar"]);
  });

  it("empty intended, empty observed → passed: true", () => {
    const result = gradeActionDiff([], []);
    expect(result.passed).toBe(true);
    expect(result.missingActions).toHaveLength(0);
    expect(result.extraActions).toHaveLength(0);
  });

  it("empty intended, non-empty observed → passed: false, all extra", () => {
    const result = gradeActionDiff([], ["check-error-log"]);
    expect(result.passed).toBe(false);
    expect(result.extraActions).toEqual(["check-error-log"]);
  });

  it("non-empty intended, empty observed → passed: false, all missing", () => {
    const result = gradeActionDiff(["check-error-log"], []);
    expect(result.passed).toBe(false);
    expect(result.missingActions).toEqual(["check-error-log"]);
  });

  it("normalized label comparison: case-insensitive match → passed: true (FR-004)", () => {
    // The model may emit label in different casing; normalization handles this.
    const result = gradeActionDiff(
      ["check-error-log"],
      ["CHECK-ERROR-LOG"] // different casing — normalizes to same
    );
    expect(result.passed).toBe(true);
    expect(result.missingActions).toHaveLength(0);
    expect(result.extraActions).toHaveLength(0);
  });

  it("normalized label comparison: whitespace collapse → passed: true (FR-004)", () => {
    const result = gradeActionDiff(
      ["check error log"],
      ["check  error  log"] // extra internal spaces — collapsed by normalization
    );
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractObservedActions
// ---------------------------------------------------------------------------

describe("extractObservedActions", () => {
  it("extracts ACTION: lines (happy path)", () => {
    const response = "I reviewed the checklist.\nACTION: check-error-log\nACTION: summarise-prs";
    const actions = extractObservedActions(response);
    expect(actions).toEqual(["check-error-log", "summarise-prs"]);
  });

  it("ACTION: prefix is case-insensitive (action: lowercase)", () => {
    const response = "action: check-error-log\naction: summarise-prs";
    const actions = extractObservedActions(response);
    expect(actions).toContain("check-error-log");
    expect(actions).toContain("summarise-prs");
  });

  it("ACTION: prefix is case-insensitive (mixed case)", () => {
    const response = "Action: check-error-log";
    const actions = extractObservedActions(response);
    expect(actions).toContain("check-error-log");
  });

  it("trims label whitespace", () => {
    const response = "ACTION:   check-error-log  ";
    const actions = extractObservedActions(response);
    expect(actions).toEqual(["check-error-log"]);
  });

  it("collapses internal whitespace in label", () => {
    const response = "ACTION: check  error  log";
    const actions = extractObservedActions(response);
    expect(actions).toEqual(["check error log"]);
  });

  it("deduplicates by normalized key (case-insensitive)", () => {
    const response = "ACTION: check-error-log\nACTION: CHECK-ERROR-LOG\nACTION: summarise-prs";
    const actions = extractObservedActions(response);
    // Only one entry for check-error-log (first occurrence preserved)
    expect(actions.filter((a) => a.toLowerCase() === "check-error-log")).toHaveLength(1);
    expect(actions).toHaveLength(2);
  });

  it("deduplicates while preserving first-occurrence order", () => {
    const response = "ACTION: summarise-prs\nACTION: check-error-log\nACTION: summarise-prs";
    const actions = extractObservedActions(response);
    expect(actions).toEqual(["summarise-prs", "check-error-log"]);
  });

  it("empty response → empty array", () => {
    expect(extractObservedActions("")).toHaveLength(0);
  });

  it("prose response with no ACTION: lines → empty array", () => {
    const response = "I have completed the tasks as requested. Everything looks good.";
    const actions = extractObservedActions(response);
    expect(actions).toHaveLength(0);
  });

  it("markdown list without ACTION: prefix → not extracted", () => {
    // Old extraction format no longer recognized — model must use ACTION: lines.
    const response = "- check-error-log\n- summarise-prs";
    const actions = extractObservedActions(response);
    expect(actions).toHaveLength(0);
  });

  it("single ACTION: line", () => {
    const response = "ACTION: check-error-log";
    const actions = extractObservedActions(response);
    expect(actions).toEqual(["check-error-log"]);
  });
});

// ---------------------------------------------------------------------------
// gradeRun
// ---------------------------------------------------------------------------

describe("gradeRun", () => {
  it("HEARTBEAT_OK on due tick → passed: false, missingActions = intended", () => {
    const intended = ["check-error-log", "summarise-prs"];
    const result = gradeRun("HEARTBEAT_OK", intended);
    expect(result.passed).toBe(false);
    expect(result.missingActions).toEqual(intended);
    expect(result.observedActions).toEqual([]);
    expect(result.extraActions).toEqual([]);
  });

  it("HEARTBEAT_OK prefix (with trailing content) → passed: false (guard triggers)", () => {
    const intended = ["check-error-log"];
    const result = gradeRun("HEARTBEAT_OK — nothing to do", intended);
    expect(result.passed).toBe(false);
    expect(result.missingActions).toEqual(intended);
  });

  it("ACTION: lines matching intended → passed: true", () => {
    const intended = ["check-error-log"];
    const response = "ACTION: check-error-log";
    const result = gradeRun(response, intended);
    expect(result.passed).toBe(true);
  });

  it("ACTION: lines matching all intended → passed: true", () => {
    const intended = ["check-error-log", "summarise-prs"];
    const response = "ACTION: check-error-log\nACTION: summarise-prs";
    const result = gradeRun(response, intended);
    expect(result.passed).toBe(true);
  });

  it("ACTION: line missing one intended → passed: false", () => {
    const intended = ["check-error-log", "summarise-prs"];
    const response = "ACTION: check-error-log";
    const result = gradeRun(response, intended);
    expect(result.passed).toBe(false);
    expect(result.missingActions).toContain("summarise-prs");
  });

  it("case-insensitive label match via normalization → passed: true", () => {
    const intended = ["check-error-log"];
    const response = "ACTION: CHECK-ERROR-LOG";
    const result = gradeRun(response, intended);
    expect(result.passed).toBe(true);
  });

  it("empty response (errored run) → passed: false (FR-008)", () => {
    // Errored run = empty/malformed response counts as failed, not skipped.
    const intended = ["check-error-log"];
    const result = gradeRun("", intended);
    expect(result.passed).toBe(false);
    expect(result.missingActions).toEqual(intended);
  });

  it("prose response with no ACTION: lines → passed: false (FR-008)", () => {
    const intended = ["check-error-log"];
    const result = gradeRun("I have reviewed the logs and found nothing.", intended);
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// aggregateActionDiff
// ---------------------------------------------------------------------------

describe("aggregateActionDiff", () => {
  function makePass(): ActionDiff {
    return {
      intendedActions: ["check-error-log"],
      observedActions: ["check-error-log"],
      missingActions: [],
      extraActions: [],
      passed: true,
    };
  }

  function makeFail(): ActionDiff {
    return {
      intendedActions: ["check-error-log"],
      observedActions: [],
      missingActions: ["check-error-log"],
      extraActions: [],
      passed: false,
    };
  }

  it("k=3 of 5 passing → true", () => {
    const runs = [makePass(), makePass(), makePass(), makeFail(), makeFail()];
    expect(aggregateActionDiff(runs, 3)).toBe(true);
  });

  it("k=3 of 5 but only 2 passing → false", () => {
    const runs = [makePass(), makePass(), makeFail(), makeFail(), makeFail()];
    expect(aggregateActionDiff(runs, 3)).toBe(false);
  });

  it("k=1: any one passing → true", () => {
    const runs = [makeFail(), makeFail(), makePass()];
    expect(aggregateActionDiff(runs, 1)).toBe(true);
  });

  it("k=n: all must pass → true when all pass", () => {
    const runs = [makePass(), makePass(), makePass()];
    expect(aggregateActionDiff(runs, 3)).toBe(true);
  });

  it("k=n: all must pass → false when one fails", () => {
    const runs = [makePass(), makePass(), makeFail()];
    expect(aggregateActionDiff(runs, 3)).toBe(false);
  });

  it("uses >= not > (k equals passing count is true)", () => {
    const runs = [makePass(), makePass()];
    // exactly 2 of 2 pass; k=2 → should be true (>= not >)
    expect(aggregateActionDiff(runs, 2)).toBe(true);
  });

  it("errored run (passed: false) counts as failure in aggregation (FR-008)", () => {
    // Simulate errored run with passed: false
    const erroredRun: ActionDiff = {
      intendedActions: ["check-error-log"],
      observedActions: [],
      missingActions: ["check-error-log"],
      extraActions: [],
      passed: false,
    };
    const runs = [makePass(), makePass(), erroredRun, erroredRun, erroredRun];
    // k=3: only 2 pass → false
    expect(aggregateActionDiff(runs, 3)).toBe(false);
  });

  it("empty runs array: k=0 → true (vacuous)", () => {
    expect(aggregateActionDiff([], 0)).toBe(true);
  });

  it("empty runs array: k=1 → false", () => {
    expect(aggregateActionDiff([], 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildDueTick
// ---------------------------------------------------------------------------

describe("buildDueTick", () => {
  it("returns scenario framing string containing checklist content", () => {
    const checklist = parseHeartbeat(
      "/tmp/HEARTBEAT.md",
      "- check-error-log"
    );
    const tick = makeDueTick();
    const framing = buildDueTick(checklist, tick);
    expect(typeof framing).toBe("string");
    expect(framing).toContain("check-error-log");
  });

  it("framing includes tick state 'due'", () => {
    const checklist = parseHeartbeat("/tmp/HEARTBEAT.md", "- check-error-log");
    const tick = makeDueTick();
    const framing = buildDueTick(checklist, tick);
    expect(framing).toContain("due");
  });

  it("framing includes the verbatim OpenClaw heartbeat prompt (C-003)", () => {
    const checklist = parseHeartbeat("/tmp/HEARTBEAT.md", "- check-error-log");
    const tick = makeDueTick();
    const framing = buildDueTick(checklist, tick);
    // The verbatim OpenClaw prompt must be byte-identical in the framing.
    expect(framing).toContain(
      "Read HEARTBEAT.md if it exists. Follow it strictly."
    );
  });

  it("framing includes the ACTION: observation convention (FR-004)", () => {
    const checklist = parseHeartbeat("/tmp/HEARTBEAT.md", "- check-error-log");
    const tick = makeDueTick();
    const framing = buildDueTick(checklist, tick);
    // The muster scenario convention must appear after the OpenClaw prompt.
    expect(framing).toContain("ACTION: <label>");
    expect(framing).toContain("MUSTER SCENARIO CONVENTION");
  });
});

// ---------------------------------------------------------------------------
// discrimination control (FR-009)
// ---------------------------------------------------------------------------

describe("discrimination control", () => {
  // Rigged-impossible discrimination control (FR-009). These inputs are designed
  // to fail the grader. If either of these tests fails (i.e. the grader passes
  // them), the grader has a bug.

  it("irrelevant action label → gradeActionDiff passed: false, extraActions non-empty (FR-009)", () => {
    // Rigged-impossible: the observed action "update-calendar" has nothing
    // to do with the intended "check-error-log". The grader must fail this.
    const result = gradeActionDiff(
      ["check-error-log"],
      ["update-calendar"]
    );
    // The grader must detect mismatch — any pass here is a bug.
    expect(result.passed).toBe(false);
    expect(result.extraActions).toContain("update-calendar");
    expect(result.missingActions).toContain("check-error-log");
  });

  it("HEARTBEAT_OK response on due tick → gradeRun passed: false (FR-009)", () => {
    // Rigged-impossible: sending HEARTBEAT_OK when actions are due is an
    // action-diff miss by spec definition. The guard must fire and return false.
    const intended = ["check-error-log", "summarise-prs"];
    const result = gradeRun("HEARTBEAT_OK", intended);
    // The grader must detect this as a failure — any pass here is a bug.
    expect(result.passed).toBe(false);
    expect(result.missingActions).toEqual(intended);
  });

  it("prose response (no ACTION: lines) → gradeRun passed: false (FR-009)", () => {
    // Rigged-impossible: a real model replying in prose without ACTION: lines
    // must score 0/3 — the grader must extract nothing and fail.
    const intended = ["check-error-log", "summarise-prs"];
    const result = gradeRun(
      "I checked the error logs. I summarised the open pull requests.",
      intended
    );
    expect(result.passed).toBe(false);
    expect(result.observedActions).toHaveLength(0);
    expect(result.missingActions).toEqual(intended);
  });
});
