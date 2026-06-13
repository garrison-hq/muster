/**
 * Unit tests for src/adapters/heartbeat/tick.ts
 *
 * Covers T003 (IntervalConfig, SimulatedTick, buildIntervalConfig,
 * buildScenarioFraming, loadTickState).
 */

import { describe, it, expect } from "vitest";
import {
  buildIntervalConfig,
  buildScenarioFraming,
  loadTickState,
  validateTickStateData,
  TickStateValidationError,
  OPENCLAW_HEARTBEAT_PROMPT,
} from "../../src/adapters/heartbeat/tick.js";
import { parseHeartbeat } from "../../src/adapters/heartbeat/lint.js";
import type { SimulatedTick, IntervalConfig } from "../../src/adapters/heartbeat/tick.js";

// ---------------------------------------------------------------------------
// T003 — buildIntervalConfig
// ---------------------------------------------------------------------------

describe("T003 buildIntervalConfig", () => {
  it("with supplied intervalMinutes=30 → assumed: false", () => {
    const config = buildIntervalConfig({ intervalMinutes: 30 });
    expect(config.intervalMinutes).toBe(30);
    expect(config.assumed).toBe(false);
  });

  it("with supplied intervalMinutes=60 (Anthropic OAuth) → assumed: false", () => {
    // C-002: Anthropic OAuth default of 60m MUST be supplied by caller, not defaulted.
    const config = buildIntervalConfig({ intervalMinutes: 60 });
    expect(config.intervalMinutes).toBe(60);
    expect(config.assumed).toBe(false);
  });

  it("with no supplied value → { intervalMinutes: 30, assumed: true }", () => {
    const config = buildIntervalConfig();
    expect(config.intervalMinutes).toBe(30);
    expect(config.assumed).toBe(true);
  });

  it("with undefined → { intervalMinutes: 30, assumed: true }", () => {
    const config = buildIntervalConfig(undefined);
    expect(config.intervalMinutes).toBe(30);
    expect(config.assumed).toBe(true);
  });

  it("never hardcodes 60m: default is 30m, not 60m", () => {
    // C-002: the 60m Anthropic OAuth value must come from the caller.
    const config = buildIntervalConfig();
    expect(config.intervalMinutes).not.toBe(60);
    expect(config.intervalMinutes).toBe(30);
  });

  it("supplied arbitrary value → assumed: false, value preserved", () => {
    const config = buildIntervalConfig({ intervalMinutes: 15 });
    expect(config.intervalMinutes).toBe(15);
    expect(config.assumed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T003 — buildScenarioFraming
// ---------------------------------------------------------------------------

describe("T003 buildScenarioFraming", () => {
  function makeDueTick(): SimulatedTick {
    return {
      id: "tick-due-1",
      scenarioFraming: "",
      state: "due",
      priorActionSummary: null,
      intervalConfig: buildIntervalConfig(),
    };
  }

  function makeRepeatTick(): SimulatedTick {
    return {
      id: "tick-repeat-1",
      scenarioFraming: "",
      state: "repeat",
      priorActionSummary: "Sent the daily report to #reports channel.",
      intervalConfig: buildIntervalConfig({ intervalMinutes: 60 }),
    };
  }

  function makeNothingDueTick(): SimulatedTick {
    return {
      id: "tick-nothing-due-1",
      scenarioFraming: "",
      state: "nothing-due",
      priorActionSummary: null,
      intervalConfig: buildIntervalConfig(),
    };
  }

  it("includes the OpenClaw documented prompt verbatim (C-003)", () => {
    const checklist = parseHeartbeat("/tmp/HEARTBEAT.md", "- Send daily report");
    const tick = makeDueTick();
    const framing = buildScenarioFraming(checklist, tick);
    expect(framing).toContain(OPENCLAW_HEARTBEAT_PROMPT);
  });

  it("documented prompt contains the exact HEARTBEAT_OK text", () => {
    expect(OPENCLAW_HEARTBEAT_PROMPT).toContain("HEARTBEAT_OK");
    expect(OPENCLAW_HEARTBEAT_PROMPT).toContain("Read HEARTBEAT.md if it exists");
    expect(OPENCLAW_HEARTBEAT_PROMPT).toContain("Do not infer or repeat old tasks");
  });

  it("framing for due tick includes checklist content", () => {
    const checklist = parseHeartbeat("/tmp/HEARTBEAT.md", "- Send daily report\n- Check metrics");
    const tick = makeDueTick();
    const framing = buildScenarioFraming(checklist, tick);
    expect(framing).toContain("Send daily report");
    expect(framing).toContain("Check metrics");
  });

  it("framing for repeat tick includes priorActionSummary", () => {
    const checklist = parseHeartbeat("/tmp/HEARTBEAT.md", "- Send daily report");
    const tick = makeRepeatTick();
    const framing = buildScenarioFraming(checklist, tick);
    expect(framing).toContain("Sent the daily report to #reports channel.");
  });

  it("framing for due tick does NOT include prior action summary section", () => {
    const checklist = parseHeartbeat("/tmp/HEARTBEAT.md", "- Send daily report");
    const tick = makeDueTick();
    const framing = buildScenarioFraming(checklist, tick);
    expect(framing).not.toContain("Prior action summary");
  });

  it("framing for nothing-due tick does NOT include prior action summary", () => {
    const checklist = parseHeartbeat("/tmp/HEARTBEAT.md", "- Send daily report");
    const tick = makeNothingDueTick();
    const framing = buildScenarioFraming(checklist, tick);
    expect(framing).not.toContain("Prior action summary");
  });

  it("framing for empty checklist indicates skip", () => {
    const checklist = parseHeartbeat("/tmp/HEARTBEAT.md", "");
    const tick = makeDueTick();
    const framing = buildScenarioFraming(checklist, tick);
    expect(framing).toContain("empty");
  });

  it("framing includes tick state", () => {
    const checklist = parseHeartbeat("/tmp/HEARTBEAT.md", "- Send report");
    const tick = makeDueTick();
    const framing = buildScenarioFraming(checklist, tick);
    expect(framing).toContain("due");
  });

  it("framing includes interval from intervalConfig", () => {
    const checklist = parseHeartbeat("/tmp/HEARTBEAT.md", "- Send report");
    const tick = makeRepeatTick(); // intervalMinutes: 60
    const framing = buildScenarioFraming(checklist, tick);
    expect(framing).toContain("60m");
  });

  it("assumed default interval is noted in framing", () => {
    const checklist = parseHeartbeat("/tmp/HEARTBEAT.md", "- Send report");
    const tick = makeDueTick(); // assumed: true
    const framing = buildScenarioFraming(checklist, tick);
    expect(framing).toContain("assumed default");
  });
});

// ---------------------------------------------------------------------------
// T003 — validateTickStateData / loadTickState invariants
// ---------------------------------------------------------------------------

describe("T003 validateTickStateData", () => {
  function makeDueData(): Record<string, unknown> {
    return {
      id: "tick-due-1",
      state: "due",
      priorActionSummary: null,
      intervalConfig: { intervalMinutes: 30, assumed: false },
    };
  }

  it("valid due.json → correct SimulatedTick", () => {
    const tick = validateTickStateData(makeDueData(), "/tmp/due.json");
    expect(tick.id).toBe("tick-due-1");
    expect(tick.state).toBe("due");
    expect(tick.priorActionSummary).toBeNull();
    expect(tick.intervalConfig.intervalMinutes).toBe(30);
    expect(tick.intervalConfig.assumed).toBe(false);
  });

  it("valid repeat tick with priorActionSummary → correct SimulatedTick", () => {
    const data = {
      id: "tick-repeat-1",
      state: "repeat",
      priorActionSummary: "Sent report.",
      intervalConfig: { intervalMinutes: 60, assumed: false },
    };
    const tick = validateTickStateData(data, "/tmp/repeat.json");
    expect(tick.state).toBe("repeat");
    expect(tick.priorActionSummary).toBe("Sent report.");
  });

  it("valid nothing-due tick → priorActionSummary is null", () => {
    const data = {
      id: "tick-nothing-due-1",
      state: "nothing-due",
      priorActionSummary: null,
    };
    const tick = validateTickStateData(data, "/tmp/nothing-due.json");
    expect(tick.state).toBe("nothing-due");
    expect(tick.priorActionSummary).toBeNull();
  });

  it("repeat tick missing priorActionSummary → throws TickStateValidationError", () => {
    const data = {
      id: "tick-repeat-bad",
      state: "repeat",
      priorActionSummary: null, // null violates the invariant for repeat
    };
    expect(() => validateTickStateData(data, "/tmp/bad.json")).toThrow(
      TickStateValidationError
    );
  });

  it("repeat tick with priorActionSummary undefined → throws TickStateValidationError", () => {
    const data = {
      id: "tick-repeat-bad",
      state: "repeat",
      // priorActionSummary omitted (undefined)
    };
    expect(() => validateTickStateData(data, "/tmp/bad.json")).toThrow(
      TickStateValidationError
    );
  });

  it("due tick with non-null priorActionSummary → throws TickStateValidationError", () => {
    const data = {
      id: "tick-due-bad",
      state: "due",
      priorActionSummary: "some summary", // violates due invariant
    };
    expect(() => validateTickStateData(data, "/tmp/bad.json")).toThrow(
      TickStateValidationError
    );
  });

  it("nothing-due tick with non-null priorActionSummary → throws TickStateValidationError", () => {
    const data = {
      id: "tick-nothing-due-bad",
      state: "nothing-due",
      priorActionSummary: "should be null",
    };
    expect(() => validateTickStateData(data, "/tmp/bad.json")).toThrow(
      TickStateValidationError
    );
  });

  it("invalid state value → throws TickStateValidationError", () => {
    const data = { id: "tick-1", state: "invalid-state" };
    expect(() => validateTickStateData(data, "/tmp/bad.json")).toThrow(
      TickStateValidationError
    );
  });

  it("missing id → throws TickStateValidationError", () => {
    const data = { state: "due", priorActionSummary: null };
    expect(() => validateTickStateData(data, "/tmp/bad.json")).toThrow(
      TickStateValidationError
    );
  });

  it("not an object → throws TickStateValidationError", () => {
    expect(() => validateTickStateData("not-an-object", "/tmp/bad.json")).toThrow(
      TickStateValidationError
    );
  });

  it("absent intervalConfig → uses 30m assumed default", () => {
    const data = {
      id: "tick-due-no-interval",
      state: "due",
      priorActionSummary: null,
      // no intervalConfig
    };
    const tick = validateTickStateData(data, "/tmp/test.json");
    expect(tick.intervalConfig.intervalMinutes).toBe(30);
    expect(tick.intervalConfig.assumed).toBe(true);
  });

  it("intervalConfig.intervalMinutes must be a number", () => {
    const data = {
      id: "tick-due-1",
      state: "due",
      priorActionSummary: null,
      intervalConfig: { intervalMinutes: "30m", assumed: false },
    };
    expect(() => validateTickStateData(data, "/tmp/bad.json")).toThrow(
      TickStateValidationError
    );
  });
});

// ---------------------------------------------------------------------------
// loadTickState file-loading path
// ---------------------------------------------------------------------------

describe("loadTickState file-loading", () => {
  it("throws TickStateValidationError for non-existent file", () => {
    expect(() => loadTickState("/tmp/nonexistent-tick-abc123.json")).toThrow(
      TickStateValidationError
    );
  });
});

// ---------------------------------------------------------------------------
// IntervalConfig type invariant tests (data-model.md)
// ---------------------------------------------------------------------------

describe("IntervalConfig invariants", () => {
  it("assumed flag is always false when caller supplies a value", () => {
    const configs: Array<IntervalConfig> = [
      buildIntervalConfig({ intervalMinutes: 1 }),
      buildIntervalConfig({ intervalMinutes: 30 }),
      buildIntervalConfig({ intervalMinutes: 60 }),
      buildIntervalConfig({ intervalMinutes: 120 }),
    ];
    for (const c of configs) {
      expect(c.assumed).toBe(false);
    }
  });

  it("assumed flag is always true when no value is supplied", () => {
    const c = buildIntervalConfig();
    expect(c.assumed).toBe(true);
  });
});
