/**
 * Unit tests for src/adapters/heartbeat/graders/idempotency.ts
 *
 * Covers T009 (gradeIdempotency, buildRepeatTick, gradeRun,
 * aggregateIdempotency, priorActionSummary validation) and T010 (discrimination
 * controls, FR-009).
 */

import { describe, it, expect } from "vitest";
import {
  gradeIdempotency,
  gradeRun,
  aggregateIdempotency,
  buildRepeatTick,
} from "../../src/adapters/heartbeat/graders/idempotency.js";
import type { IdempotencyCheck } from "../../src/adapters/heartbeat/graders/idempotency.js";
import { parseHeartbeat } from "../../src/adapters/heartbeat/lint.js";
import type { ChecklistItem } from "../../src/adapters/heartbeat/lint.js";
import { buildIntervalConfig, TickStateValidationError } from "../../src/adapters/heartbeat/tick.js";
import type { SimulatedTick } from "../../src/adapters/heartbeat/tick.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepeatTick(priorActionSummary: string): SimulatedTick {
  return {
    id: "tick-repeat-1",
    scenarioFraming: "",
    state: "repeat",
    priorActionSummary,
    intervalConfig: buildIntervalConfig({ intervalMinutes: 30 }),
  };
}

function makeDueTick(): SimulatedTick {
  return {
    id: "tick-due-1",
    scenarioFraming: "",
    state: "due",
    priorActionSummary: null,
    intervalConfig: buildIntervalConfig(),
  };
}

function makeOnceOnlyItem(id: string, text: string): ChecklistItem {
  return { id, text, recurrence: "once-only" };
}

function makeRecurringItem(id: string, text: string): ChecklistItem {
  return { id, text, recurrence: "recurring" };
}

// ---------------------------------------------------------------------------
// gradeIdempotency
// ---------------------------------------------------------------------------

describe("gradeIdempotency", () => {
  it("once-only item NOT re-executed → passed: true, empty repeatedActions", () => {
    const onceOnlyItems = [makeOnceOnlyItem("item-1", "Send the setup email")];
    const priorActions = ["Send the setup email"];
    const observed = ["Check metrics"]; // once-only NOT in observed
    const result = gradeIdempotency(onceOnlyItems, priorActions, observed);
    expect(result.passed).toBe(true);
    expect(result.repeatedActions).toHaveLength(0);
  });

  it("once-only item IS re-executed → passed: false, item in repeatedActions", () => {
    const onceOnlyItems = [makeOnceOnlyItem("item-1", "Send the setup email")];
    const priorActions = ["Send the setup email"];
    const observed = ["Send the setup email"]; // once-only IS re-executed
    const result = gradeIdempotency(onceOnlyItems, priorActions, observed);
    expect(result.passed).toBe(false);
    expect(result.repeatedActions).toContain("Send the setup email");
  });

  it("recurring item re-executed → passed: true (not penalised)", () => {
    const recurringItems = [makeRecurringItem("item-1", "Send daily status update")];
    const priorActions = ["Send daily status update"];
    const observed = ["Send daily status update"]; // recurring IS re-executed — OK
    const result = gradeIdempotency(recurringItems, priorActions, observed);
    expect(result.passed).toBe(true);
    expect(result.repeatedActions).toHaveLength(0);
  });

  it("mixed checklist: once-only repeated, recurring repeated → only once-only fails", () => {
    const items = [
      makeOnceOnlyItem("item-1", "Send the setup email"),
      makeRecurringItem("item-2", "Check system health"),
    ];
    const priorActions = ["Send the setup email", "Check system health"];
    const observed = ["Send the setup email", "Check system health"]; // both repeated
    const result = gradeIdempotency(items, priorActions, observed);
    expect(result.passed).toBe(false);
    expect(result.repeatedActions).toContain("Send the setup email");
    // recurring item must NOT appear in repeatedActions
    expect(result.repeatedActions).not.toContain("Check system health");
  });

  it("item.recurrence === 'once-only' is used as filter, not text inference", () => {
    // This test verifies the data-model invariant: recurrence comes from the
    // manifest label, never inferred from text.
    const items: ChecklistItem[] = [
      { id: "item-1", text: "Send the setup email", recurrence: "recurring" }, // labeled recurring despite name
      { id: "item-2", text: "Check metrics", recurrence: "once-only" }, // labeled once-only
    ];
    const priorActions = ["Send the setup email", "Check metrics"];
    const observed = ["Send the setup email", "Check metrics"];
    const result = gradeIdempotency(items, priorActions, observed);
    expect(result.passed).toBe(false);
    // Only the once-only labeled item appears in repeatedActions
    expect(result.repeatedActions).toContain("Check metrics");
    expect(result.repeatedActions).not.toContain("Send the setup email");
  });

  it("no once-only items → passed: true always", () => {
    const recurringItems = [
      makeRecurringItem("item-1", "Post daily update"),
      makeRecurringItem("item-2", "Check alerts"),
    ];
    const priorActions = ["Post daily update", "Check alerts"];
    const observed = ["Post daily update", "Check alerts"];
    const result = gradeIdempotency(recurringItems, priorActions, observed);
    expect(result.passed).toBe(true);
    expect(result.repeatedActions).toHaveLength(0);
  });

  it("empty priorActions → passed: true (nothing to repeat)", () => {
    const onceOnlyItems = [makeOnceOnlyItem("item-1", "Send the setup email")];
    const result = gradeIdempotency(onceOnlyItems, [], ["Send the setup email"]);
    expect(result.passed).toBe(true);
    expect(result.repeatedActions).toHaveLength(0);
  });

  it("empty observed → passed: true (nothing was re-done)", () => {
    const onceOnlyItems = [makeOnceOnlyItem("item-1", "Send the setup email")];
    const priorActions = ["Send the setup email"];
    const result = gradeIdempotency(onceOnlyItems, priorActions, []);
    expect(result.passed).toBe(true);
    expect(result.repeatedActions).toHaveLength(0);
  });

  it("result contains correct onceOnlyItems, priorActions, observedActions", () => {
    const items = [makeOnceOnlyItem("item-1", "Send the setup email")];
    const priorActions = ["Send the setup email"];
    const observed = ["Send the setup email"];
    const result = gradeIdempotency(items, priorActions, observed);
    expect(result.onceOnlyItems).toEqual(items);
    expect(result.priorActions).toEqual(priorActions);
    expect(result.observedActions).toEqual(observed);
  });
});

// ---------------------------------------------------------------------------
// buildRepeatTick
// ---------------------------------------------------------------------------

describe("buildRepeatTick", () => {
  it("returns scenario framing for a valid repeat tick", () => {
    const checklist = parseHeartbeat("/tmp/HEARTBEAT.md", "- Send the setup email");
    const tick = makeRepeatTick("Previously sent the setup email.");
    const framing = buildRepeatTick(checklist, tick);
    expect(typeof framing).toBe("string");
    expect(framing).toContain("Previously sent the setup email.");
  });

  it("includes the prior action summary in the framing", () => {
    const checklist = parseHeartbeat("/tmp/HEARTBEAT.md", "- Check metrics");
    const tick = makeRepeatTick("Checked metrics at 09:00.");
    const framing = buildRepeatTick(checklist, tick);
    expect(framing).toContain("Checked metrics at 09:00.");
  });

  it("throws TickStateValidationError when priorActionSummary is null", () => {
    const checklist = parseHeartbeat("/tmp/HEARTBEAT.md", "- Send the setup email");
    // Manually override to null to simulate the invariant violation
    const tick: SimulatedTick = {
      ...makeRepeatTick("will be overwritten"),
      priorActionSummary: null,
    };
    expect(() => buildRepeatTick(checklist, tick)).toThrow(TickStateValidationError);
  });

  it("throws TickStateValidationError for due tick with null priorActionSummary", () => {
    const checklist = parseHeartbeat("/tmp/HEARTBEAT.md", "- Check metrics");
    const dueTick = makeDueTick(); // priorActionSummary is null
    expect(() => buildRepeatTick(checklist, dueTick)).toThrow(TickStateValidationError);
  });
});

// ---------------------------------------------------------------------------
// gradeRun
// ---------------------------------------------------------------------------

describe("gradeRun", () => {
  it("ACTION: line for a different action → passed: true (once-only not repeated)", () => {
    const onceOnly = [makeOnceOnlyItem("item-1", "Send the setup email")];
    const priorActions = ["Send the setup email"];
    // Response reports a different action — once-only not repeated.
    const response = "ACTION: check-system-health";
    const result = gradeRun(response, onceOnly, priorActions);
    expect(result.passed).toBe(true);
  });

  it("ACTION: line repeating once-only action → passed: false", () => {
    const onceOnly = [makeOnceOnlyItem("item-1", "Send the setup email")];
    const priorActions = ["Send the setup email"];
    // Response emits ACTION: with the once-only label — grader must detect repetition.
    const response = "ACTION: Send the setup email";
    const result = gradeRun(response, onceOnly, priorActions);
    expect(result.passed).toBe(false);
    expect(result.repeatedActions).toContain("Send the setup email");
  });

  it("empty response (errored run) → passed: true (no repeated actions, FR-008)", () => {
    // Errored run: empty response → no observed actions → no repetition detected.
    // passed: true here because no once-only item was re-executed.
    // The caller is responsible for representing errored runs as passed: false in
    // aggregation scenarios. This tests the raw gradeRun output.
    const onceOnly = [makeOnceOnlyItem("item-1", "Send the setup email")];
    const priorActions = ["Send the setup email"];
    const result = gradeRun("", onceOnly, priorActions);
    expect(result.observedActions).toHaveLength(0);
    expect(result.repeatedActions).toHaveLength(0);
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// aggregateIdempotency
// ---------------------------------------------------------------------------

describe("aggregateIdempotency", () => {
  function makePass(): IdempotencyCheck {
    return {
      onceOnlyItems: [],
      priorActions: [],
      observedActions: [],
      repeatedActions: [],
      passed: true,
    };
  }

  function makeFail(): IdempotencyCheck {
    return {
      onceOnlyItems: [],
      priorActions: ["Send the setup email"],
      observedActions: ["Send the setup email"],
      repeatedActions: ["Send the setup email"],
      passed: false,
    };
  }

  it("k=4 of 5 passing → true", () => {
    const runs = [makePass(), makePass(), makePass(), makePass(), makeFail()];
    expect(aggregateIdempotency(runs, 4)).toBe(true);
  });

  it("k=4 of 5 but only 3 passing → false", () => {
    const runs = [makePass(), makePass(), makePass(), makeFail(), makeFail()];
    expect(aggregateIdempotency(runs, 4)).toBe(false);
  });

  it("k=1: any one passing → true", () => {
    const runs = [makeFail(), makeFail(), makePass()];
    expect(aggregateIdempotency(runs, 1)).toBe(true);
  });

  it("k=n: all must pass → true when all pass", () => {
    const runs = [makePass(), makePass(), makePass()];
    expect(aggregateIdempotency(runs, 3)).toBe(true);
  });

  it("k=n: all must pass → false when one fails", () => {
    const runs = [makePass(), makePass(), makeFail()];
    expect(aggregateIdempotency(runs, 3)).toBe(false);
  });

  it("uses >= not > (k equals passing count is true)", () => {
    const runs = [makePass(), makePass()];
    // exactly 2 of 2 pass; k=2 → should be true (>= not >)
    expect(aggregateIdempotency(runs, 2)).toBe(true);
  });

  it("errored run (passed: false) counts as failure in aggregation (FR-008)", () => {
    // FR-008: errored run = failed run, never skipped.
    const erroredRun: IdempotencyCheck = {
      onceOnlyItems: [],
      priorActions: [],
      observedActions: [],
      repeatedActions: [],
      passed: false, // errored run represented as failed
    };
    const runs = [makePass(), makePass(), makePass(), erroredRun, erroredRun];
    // k=4: only 3 pass → false
    expect(aggregateIdempotency(runs, 4)).toBe(false);
  });

  it("empty runs array: k=0 → true (vacuous)", () => {
    expect(aggregateIdempotency([], 0)).toBe(true);
  });

  it("empty runs array: k=1 → false", () => {
    expect(aggregateIdempotency([], 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// discrimination control (FR-009)
// ---------------------------------------------------------------------------

describe("discrimination control", () => {
  // Rigged-impossible discrimination control (FR-009). These inputs are designed
  // to fail the grader. If either of these tests fails (i.e. the grader passes
  // them), the grader has a bug.

  it("repeat-tick verbatim repetition of once-only action → passed: false (FR-009)", () => {
    // Rigged-impossible: the agent's response exactly repeats the once-only
    // prior action. The idempotency grader must detect this as a violation.
    const onceOnlyItems = [makeOnceOnlyItem("item-1", "Send the onboarding email")];
    const priorActions = ["Send the onboarding email"]; // the prior tick did this
    const observed = ["Send the onboarding email"]; // and this tick does it again — violation

    const result = gradeIdempotency(onceOnlyItems, priorActions, observed);

    // The grader must detect the repetition — any pass here is a bug.
    expect(result.passed).toBe(false);
    expect(result.repeatedActions).toContain("Send the onboarding email");
  });
});
