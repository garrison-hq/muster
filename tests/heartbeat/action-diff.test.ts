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
      ["Send the daily summary", "Check metrics"],
      ["Send the daily summary", "Check metrics"]
    );
    expect(result.passed).toBe(true);
    expect(result.missingActions).toHaveLength(0);
    expect(result.extraActions).toHaveLength(0);
    expect(result.intendedActions).toEqual(["Send the daily summary", "Check metrics"]);
    expect(result.observedActions).toEqual(["Send the daily summary", "Check metrics"]);
  });

  it("missing action → passed: false, correct missingActions", () => {
    const result = gradeActionDiff(
      ["Send the daily summary", "Check metrics"],
      ["Send the daily summary"]
    );
    expect(result.passed).toBe(false);
    expect(result.missingActions).toEqual(["Check metrics"]);
    expect(result.extraActions).toHaveLength(0);
  });

  it("extra action → passed: false, correct extraActions", () => {
    const result = gradeActionDiff(
      ["Send the daily summary"],
      ["Send the daily summary", "Update calendar"]
    );
    expect(result.passed).toBe(false);
    expect(result.missingActions).toHaveLength(0);
    expect(result.extraActions).toEqual(["Update calendar"]);
  });

  it("both missing and extra → passed: false, both non-empty", () => {
    const result = gradeActionDiff(
      ["Send the daily summary", "Check metrics"],
      ["Check metrics", "Update calendar"]
    );
    expect(result.passed).toBe(false);
    expect(result.missingActions).toEqual(["Send the daily summary"]);
    expect(result.extraActions).toEqual(["Update calendar"]);
  });

  it("empty intended, empty observed → passed: true", () => {
    const result = gradeActionDiff([], []);
    expect(result.passed).toBe(true);
    expect(result.missingActions).toHaveLength(0);
    expect(result.extraActions).toHaveLength(0);
  });

  it("empty intended, non-empty observed → passed: false, all extra", () => {
    const result = gradeActionDiff([], ["Send daily summary"]);
    expect(result.passed).toBe(false);
    expect(result.extraActions).toEqual(["Send daily summary"]);
  });

  it("non-empty intended, empty observed → passed: false, all missing", () => {
    const result = gradeActionDiff(["Send daily summary"], []);
    expect(result.passed).toBe(false);
    expect(result.missingActions).toEqual(["Send daily summary"]);
  });

  it("exact string match is used (no fuzzy matching)", () => {
    const result = gradeActionDiff(
      ["Send the daily summary"],
      ["send the daily summary"] // different casing
    );
    expect(result.passed).toBe(false);
    expect(result.missingActions).toEqual(["Send the daily summary"]);
    expect(result.extraActions).toEqual(["send the daily summary"]);
  });
});

// ---------------------------------------------------------------------------
// extractObservedActions
// ---------------------------------------------------------------------------

describe("extractObservedActions", () => {
  it("extracts Markdown unordered list items with '-' prefix", () => {
    const response = "I did the following:\n- Send the daily summary\n- Check metrics";
    const actions = extractObservedActions(response);
    expect(actions).toContain("Send the daily summary");
    expect(actions).toContain("Check metrics");
  });

  it("extracts Markdown unordered list items with '*' prefix", () => {
    const response = "* Update the report\n* Alert the team";
    const actions = extractObservedActions(response);
    expect(actions).toContain("Update the report");
    expect(actions).toContain("Alert the team");
  });

  it("extracts numbered list items", () => {
    const response = "1. Send the daily summary\n2. Check metrics";
    const actions = extractObservedActions(response);
    expect(actions).toContain("Send the daily summary");
    expect(actions).toContain("Check metrics");
  });

  it("extracts tool call summaries with 'tool_call:' prefix", () => {
    const response = "tool_call: send_email";
    const actions = extractObservedActions(response);
    expect(actions).toContain("send_email");
  });

  it("extracts tool call summaries with 'called:' prefix", () => {
    const response = "called: update_calendar";
    const actions = extractObservedActions(response);
    expect(actions).toContain("update_calendar");
  });

  it("deduplicates actions while preserving first-occurrence order", () => {
    const response = "- Send the daily summary\n- Check metrics\n- Send the daily summary";
    const actions = extractObservedActions(response);
    expect(actions.filter((a) => a === "Send the daily summary")).toHaveLength(1);
  });

  it("empty response → empty array", () => {
    expect(extractObservedActions("")).toHaveLength(0);
  });

  it("non-list response text → no actions extracted", () => {
    const response = "I have completed the tasks as requested.";
    const actions = extractObservedActions(response);
    expect(actions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// gradeRun
// ---------------------------------------------------------------------------

describe("gradeRun", () => {
  it("HEARTBEAT_OK on due tick → passed: false, missingActions = intended", () => {
    const intended = ["Send the daily summary", "Check metrics"];
    const result = gradeRun("HEARTBEAT_OK", intended);
    expect(result.passed).toBe(false);
    expect(result.missingActions).toEqual(intended);
    expect(result.observedActions).toEqual([]);
    expect(result.extraActions).toEqual([]);
  });

  it("HEARTBEAT_OK prefix (with trailing content) → passed: false (guard triggers)", () => {
    const intended = ["Send the daily summary"];
    const result = gradeRun("HEARTBEAT_OK — nothing to do", intended);
    expect(result.passed).toBe(false);
    expect(result.missingActions).toEqual(intended);
  });

  it("exact match response → passed: true", () => {
    const intended = ["Send the daily summary"];
    const response = "- Send the daily summary";
    const result = gradeRun(response, intended);
    expect(result.passed).toBe(true);
  });

  it("missing action in response → passed: false", () => {
    const intended = ["Send the daily summary", "Check metrics"];
    const response = "- Send the daily summary";
    const result = gradeRun(response, intended);
    expect(result.passed).toBe(false);
    expect(result.missingActions).toContain("Check metrics");
  });

  it("empty response (errored run) → passed: false (FR-008)", () => {
    // Errored run = empty/malformed response counts as failed, not skipped.
    const intended = ["Send the daily summary"];
    const result = gradeRun("", intended);
    expect(result.passed).toBe(false);
    expect(result.missingActions).toEqual(intended);
  });

  it("malformed response (no list items) → passed: false (FR-008)", () => {
    const intended = ["Send the daily summary"];
    const result = gradeRun("Something went wrong.", intended);
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// aggregateActionDiff
// ---------------------------------------------------------------------------

describe("aggregateActionDiff", () => {
  function makePass(): ActionDiff {
    return {
      intendedActions: ["x"],
      observedActions: ["x"],
      missingActions: [],
      extraActions: [],
      passed: true,
    };
  }

  function makeFail(): ActionDiff {
    return {
      intendedActions: ["x"],
      observedActions: [],
      missingActions: ["x"],
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
      intendedActions: ["x"],
      observedActions: [],
      missingActions: ["x"],
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
      "- Send the daily summary"
    );
    const tick = makeDueTick();
    const framing = buildDueTick(checklist, tick);
    expect(typeof framing).toBe("string");
    expect(framing).toContain("Send the daily summary");
  });

  it("framing includes tick state 'due'", () => {
    const checklist = parseHeartbeat("/tmp/HEARTBEAT.md", "- Check metrics");
    const tick = makeDueTick();
    const framing = buildDueTick(checklist, tick);
    expect(framing).toContain("due");
  });
});

// ---------------------------------------------------------------------------
// discrimination control (FR-009)
// ---------------------------------------------------------------------------

describe("discrimination control", () => {
  // Rigged-impossible discrimination control (FR-009). These inputs are designed
  // to fail the grader. If either of these tests fails (i.e. the grader passes
  // them), the grader has a bug.

  it("irrelevant actions → gradeActionDiff passes: false, extraActions non-empty (FR-009)", () => {
    // Rigged-impossible: the observed action "I updated the calendar" has nothing
    // to do with the intended "Send the daily summary". The grader must fail this.
    const result = gradeActionDiff(
      ["Send the daily summary"],
      ["I updated the calendar"]
    );
    // The grader must detect mismatch — any pass here is a bug.
    expect(result.passed).toBe(false);
    expect(result.extraActions).toContain("I updated the calendar");
    expect(result.missingActions).toContain("Send the daily summary");
  });

  it("HEARTBEAT_OK response on due tick → gradeRun passed: false (FR-009)", () => {
    // Rigged-impossible: sending HEARTBEAT_OK when actions are due is an
    // action-diff miss by spec definition. The guard must fire and return false.
    const intended = ["Send the daily summary", "Check metrics"];
    const result = gradeRun("HEARTBEAT_OK", intended);
    // The grader must detect this as a failure — any pass here is a bug.
    expect(result.passed).toBe(false);
    expect(result.missingActions).toEqual(intended);
  });
});
