/**
 * Unit tests for src/adapters/heartbeat/graders/quiet-ack.ts
 *
 * Covers T013 (gradeQuietAck, gradeRun, aggregateQuietAck, assertNothingDueTick,
 * CITATIONS, DEFAULT_ACK_MAX_CHARS), T014 (loadIntervalConfig, buildAssumedIntervalNote),
 * T015 (rigged-impossible discrimination controls, FR-009), and T016 (boundary
 * conditions, ackMaxChars edge cases, spec edge cases).
 */

import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  gradeQuietAck,
  gradeRun,
  aggregateQuietAck,
  assertNothingDueTick,
  loadIntervalConfig,
  buildAssumedIntervalNote,
  CITATIONS,
  DEFAULT_ACK_MAX_CHARS,
  QuietAckTickStateError,
} from "../../src/adapters/heartbeat/graders/quiet-ack.js";
import type { QuietAckCheck } from "../../src/adapters/heartbeat/graders/quiet-ack.js";
import { buildIntervalConfig } from "../../src/adapters/heartbeat/tick.js";
import type { SimulatedTick } from "../../src/adapters/heartbeat/tick.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNothingDueTick(): SimulatedTick {
  return {
    id: "tick-nothing-due-1",
    scenarioFraming: "",
    state: "nothing-due",
    priorActionSummary: null,
    intervalConfig: buildIntervalConfig(),
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

function makeRepeatTick(): SimulatedTick {
  return {
    id: "tick-repeat-1",
    scenarioFraming: "",
    state: "repeat",
    priorActionSummary: "Previous action summary",
    intervalConfig: buildIntervalConfig(),
  };
}

// ---------------------------------------------------------------------------
// gradeQuietAck — T013
// ---------------------------------------------------------------------------

describe("gradeQuietAck", () => {
  it("HEARTBEAT_OK short reply → passed: true", () => {
    const config = buildIntervalConfig();
    const result = gradeQuietAck("HEARTBEAT_OK", config);
    expect(result.passed).toBe(true);
    expect(result.startsWithAck).toBe(true);
    expect(result.withinCharLimit).toBe(true);
    expect(result.ackToken).toBe("HEARTBEAT_OK");
  });

  it("HEARTBEAT_OK with short message → passed: true", () => {
    const config = buildIntervalConfig();
    const reply = "HEARTBEAT_OK — all quiet";
    const result = gradeQuietAck(reply, config);
    expect(result.passed).toBe(true);
    expect(result.startsWithAck).toBe(true);
    expect(result.withinCharLimit).toBe(true);
  });

  it("no HEARTBEAT_OK token → passed: false, startsWithAck: false", () => {
    const config = buildIntervalConfig();
    const result = gradeQuietAck("Nothing to do today.", config);
    expect(result.passed).toBe(false);
    expect(result.startsWithAck).toBe(false);
  });

  it("HEARTBEAT_OK present but reply exceeds ackMaxChars → passed: false, withinCharLimit: false", () => {
    const config = buildIntervalConfig();
    // Build a reply that starts with HEARTBEAT_OK but is over DEFAULT_ACK_MAX_CHARS chars.
    const overflowReply = "HEARTBEAT_OK " + "x".repeat(DEFAULT_ACK_MAX_CHARS);
    expect(overflowReply.length).toBeGreaterThan(DEFAULT_ACK_MAX_CHARS);
    const result = gradeQuietAck(overflowReply, config);
    expect(result.passed).toBe(false);
    expect(result.startsWithAck).toBe(true);
    expect(result.withinCharLimit).toBe(false);
  });

  it("reads ackMaxChars from intervalConfig when supplied", () => {
    const config = { ...buildIntervalConfig(), ackMaxChars: 10 };
    const reply = "HEARTBEAT_OK "; // 13 chars — exceeds the custom 10-char limit
    expect(reply.length).toBeGreaterThan(10);
    const result = gradeQuietAck(reply, config);
    expect(result.ackMaxChars).toBe(10);
    expect(result.withinCharLimit).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("defaults ackMaxChars to DEFAULT_ACK_MAX_CHARS (300) when intervalConfig.ackMaxChars is absent", () => {
    const config = buildIntervalConfig();
    const result = gradeQuietAck("HEARTBEAT_OK", config);
    expect(result.ackMaxChars).toBe(DEFAULT_ACK_MAX_CHARS);
    expect(result.ackMaxChars).toBe(300);
  });

  it("custom ackMaxChars: reply fits → passed: true", () => {
    const config = { ...buildIntervalConfig(), ackMaxChars: 50 };
    const reply = "HEARTBEAT_OK"; // 12 chars, well within 50
    const result = gradeQuietAck(reply, config);
    expect(result.ackMaxChars).toBe(50);
    expect(result.passed).toBe(true);
  });

  it("observedReply is recorded in the result", () => {
    const config = buildIntervalConfig();
    const reply = "HEARTBEAT_OK — silence";
    const result = gradeQuietAck(reply, config);
    expect(result.observedReply).toBe(reply);
  });
});

// ---------------------------------------------------------------------------
// gradeQuietAck boundary conditions — T016
// ---------------------------------------------------------------------------

describe("gradeQuietAck boundary conditions", () => {
  it("reply length exactly 300 (= DEFAULT_ACK_MAX_CHARS) → passed: true", () => {
    const config = buildIntervalConfig();
    // Construct a reply that starts with HEARTBEAT_OK and is exactly 300 chars total.
    const prefix = "HEARTBEAT_OK";
    const padding = "x".repeat(DEFAULT_ACK_MAX_CHARS - prefix.length);
    const reply = prefix + padding;
    expect(reply.length).toBe(DEFAULT_ACK_MAX_CHARS);
    const result = gradeQuietAck(reply, config);
    expect(result.withinCharLimit).toBe(true);
    expect(result.passed).toBe(true);
  });

  it("reply length exactly 301 (DEFAULT_ACK_MAX_CHARS + 1) → passed: false", () => {
    const config = buildIntervalConfig();
    // Construct a reply that starts with HEARTBEAT_OK and is exactly 301 chars total.
    const prefix = "HEARTBEAT_OK";
    const padding = "x".repeat(DEFAULT_ACK_MAX_CHARS - prefix.length + 1);
    const reply = prefix + padding;
    expect(reply.length).toBe(DEFAULT_ACK_MAX_CHARS + 1);
    const result = gradeQuietAck(reply, config);
    expect(result.withinCharLimit).toBe(false);
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// gradeRun — T013, FR-008
// ---------------------------------------------------------------------------

describe("gradeRun", () => {
  it("HEARTBEAT_OK short reply on nothing-due tick → passed: true", () => {
    const tick = makeNothingDueTick();
    const config = buildIntervalConfig();
    const result = gradeRun("HEARTBEAT_OK", config, tick);
    expect(result.passed).toBe(true);
    expect(result.startsWithAck).toBe(true);
  });

  it("empty reply (errored run) → passed: false (FR-008)", () => {
    // Errored run: empty response counts as failed, not skipped.
    const tick = makeNothingDueTick();
    const config = buildIntervalConfig();
    const result = gradeRun("", config, tick);
    expect(result.passed).toBe(false);
    expect(result.startsWithAck).toBe(false);
  });

  it("null reply (errored run) → passed: false (FR-008)", () => {
    const tick = makeNothingDueTick();
    const config = buildIntervalConfig();
    const result = gradeRun(null, config, tick);
    expect(result.passed).toBe(false);
  });

  it("undefined reply (errored run) → passed: false (FR-008)", () => {
    const tick = makeNothingDueTick();
    const config = buildIntervalConfig();
    const result = gradeRun(undefined, config, tick);
    expect(result.passed).toBe(false);
  });

  it("non-ack response on nothing-due tick → passed: false", () => {
    const tick = makeNothingDueTick();
    const config = buildIntervalConfig();
    const result = gradeRun("I processed the tasks.", config, tick);
    expect(result.passed).toBe(false);
    expect(result.startsWithAck).toBe(false);
  });

  it("due tick throws QuietAckTickStateError (spec edge case guard)", () => {
    const tick = makeDueTick();
    const config = buildIntervalConfig();
    expect(() => gradeRun("HEARTBEAT_OK", config, tick)).toThrow(
      QuietAckTickStateError
    );
  });

  it("repeat tick throws QuietAckTickStateError (spec edge case guard)", () => {
    const tick = makeRepeatTick();
    const config = buildIntervalConfig();
    expect(() => gradeRun("HEARTBEAT_OK", config, tick)).toThrow(
      QuietAckTickStateError
    );
  });
});

// ---------------------------------------------------------------------------
// assertNothingDueTick — T013
// ---------------------------------------------------------------------------

describe("assertNothingDueTick", () => {
  it("nothing-due tick → no throw", () => {
    const tick = makeNothingDueTick();
    expect(() => assertNothingDueTick(tick)).not.toThrow();
  });

  it("due tick → throws QuietAckTickStateError", () => {
    const tick = makeDueTick();
    expect(() => assertNothingDueTick(tick)).toThrow(QuietAckTickStateError);
  });

  it("repeat tick → throws QuietAckTickStateError", () => {
    const tick = makeRepeatTick();
    expect(() => assertNothingDueTick(tick)).toThrow(QuietAckTickStateError);
  });

  it("error message includes tick id and state", () => {
    const tick = makeDueTick();
    let errorMessage = "";
    try {
      assertNothingDueTick(tick);
    } catch (err) {
      if (err instanceof QuietAckTickStateError) {
        errorMessage = err.message;
      }
    }
    expect(errorMessage).toContain("tick-due-1");
    expect(errorMessage).toContain("due");
    expect(errorMessage).toContain("nothing-due");
  });
});

// ---------------------------------------------------------------------------
// aggregateQuietAck — T013, charter k-of-n
// ---------------------------------------------------------------------------

describe("aggregateQuietAck", () => {
  function makePass(): QuietAckCheck {
    return {
      ackToken: "HEARTBEAT_OK",
      ackMaxChars: DEFAULT_ACK_MAX_CHARS,
      observedReply: "HEARTBEAT_OK",
      startsWithAck: true,
      withinCharLimit: true,
      passed: true,
    };
  }

  function makeFail(): QuietAckCheck {
    return {
      ackToken: "HEARTBEAT_OK",
      ackMaxChars: DEFAULT_ACK_MAX_CHARS,
      observedReply: "No actions needed",
      startsWithAck: false,
      withinCharLimit: true,
      passed: false,
    };
  }

  it("k=3 of 5 passing → true", () => {
    const runs = [makePass(), makePass(), makePass(), makeFail(), makeFail()];
    expect(aggregateQuietAck(runs, 3)).toBe(true);
  });

  it("k=3 of 5 but only 2 passing → false", () => {
    const runs = [makePass(), makePass(), makeFail(), makeFail(), makeFail()];
    expect(aggregateQuietAck(runs, 3)).toBe(false);
  });

  it("k=1: any one passing → true", () => {
    const runs = [makeFail(), makeFail(), makePass()];
    expect(aggregateQuietAck(runs, 1)).toBe(true);
  });

  it("k=n: all must pass → true when all pass", () => {
    const runs = [makePass(), makePass(), makePass()];
    expect(aggregateQuietAck(runs, 3)).toBe(true);
  });

  it("k=n: all must pass → false when one fails", () => {
    const runs = [makePass(), makePass(), makeFail()];
    expect(aggregateQuietAck(runs, 3)).toBe(false);
  });

  it("uses >= not > (k equals passing count is true)", () => {
    const runs = [makePass(), makePass()];
    // Exactly 2 of 2 pass; k=2 → should be true (>= not >)
    expect(aggregateQuietAck(runs, 2)).toBe(true);
  });

  it("errored run (passed: false) counts as failure in aggregation (FR-008)", () => {
    // Errored run represented as passed: false
    const erroredRun: QuietAckCheck = {
      ackToken: "HEARTBEAT_OK",
      ackMaxChars: DEFAULT_ACK_MAX_CHARS,
      observedReply: "",
      startsWithAck: false,
      withinCharLimit: false,
      passed: false,
    };
    const runs = [makePass(), makePass(), erroredRun, erroredRun, erroredRun];
    // k=3: only 2 pass → false
    expect(aggregateQuietAck(runs, 3)).toBe(false);
  });

  it("empty runs array: k=0 → true (vacuous)", () => {
    expect(aggregateQuietAck([], 0)).toBe(true);
  });

  it("empty runs array: k=1 → false", () => {
    expect(aggregateQuietAck([], 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// interval-config read path — T014
// ---------------------------------------------------------------------------

describe("interval-config read path", () => {
  it("loadIntervalConfig(undefined) → { intervalMinutes: 30, assumed: true }", () => {
    const config = loadIntervalConfig(undefined);
    expect(config.intervalMinutes).toBe(30);
    expect(config.assumed).toBe(true);
  });

  it("loadIntervalConfig with intervalMinutes: 60 (OAuth value supplied by caller) → assumed: false", () => {
    // The adapter does NOT default to 60 — caller supplies it.
    // C-002: adapter never assumes 60m, but it does accept it when explicitly supplied.
    // Default path returns 30m assumed, not 60m.
    const defaultConfig = loadIntervalConfig(undefined);
    expect(defaultConfig.intervalMinutes).toBe(30);
    expect(defaultConfig.assumed).toBe(true);

    // When caller explicitly supplies 60m (OAuth value), assumed is false.
    const oauth60 = buildIntervalConfig({ intervalMinutes: 60 });
    expect(oauth60.intervalMinutes).toBe(60);
    expect(oauth60.assumed).toBe(false);
  });

  it("loadIntervalConfig with a valid JSON file → reads intervalMinutes, assumed: false", () => {
    const dir = mkdtempSync(join(tmpdir(), "quiet-ack-test-"));
    const configFile = join(dir, "interval.json");
    writeFileSync(configFile, JSON.stringify({ intervalMinutes: 45 }), "utf-8");
    try {
      const config = loadIntervalConfig(configFile);
      expect(config.intervalMinutes).toBe(45);
      expect(config.assumed).toBe(false);
    } finally {
      unlinkSync(configFile);
    }
  });

  it("loadIntervalConfig with a valid JSON file including ackMaxChars → passes ackMaxChars through", () => {
    const dir = mkdtempSync(join(tmpdir(), "quiet-ack-test-"));
    const configFile = join(dir, "interval.json");
    writeFileSync(
      configFile,
      JSON.stringify({ intervalMinutes: 30, ackMaxChars: 150 }),
      "utf-8"
    );
    try {
      const config = loadIntervalConfig(configFile);
      expect(config.intervalMinutes).toBe(30);
      expect(config.assumed).toBe(false);
      expect(config.ackMaxChars).toBe(150);
    } finally {
      unlinkSync(configFile);
    }
  });

  it("loadIntervalConfig with non-existent file → returns 30m assumed", () => {
    const config = loadIntervalConfig("/tmp/does-not-exist-quiet-ack-test-abc123.json");
    expect(config.intervalMinutes).toBe(30);
    expect(config.assumed).toBe(true);
  });

  it("loadIntervalConfig with invalid JSON → returns 30m assumed", () => {
    const dir = mkdtempSync(join(tmpdir(), "quiet-ack-test-"));
    const configFile = join(dir, "bad.json");
    writeFileSync(configFile, "not-valid-json", "utf-8");
    try {
      const config = loadIntervalConfig(configFile);
      expect(config.intervalMinutes).toBe(30);
      expect(config.assumed).toBe(true);
    } finally {
      unlinkSync(configFile);
    }
  });

  it("loadIntervalConfig with JSON array (not object) → returns 30m assumed", () => {
    const dir = mkdtempSync(join(tmpdir(), "quiet-ack-test-"));
    const configFile = join(dir, "array.json");
    writeFileSync(configFile, JSON.stringify([{ intervalMinutes: 30 }]), "utf-8");
    try {
      const config = loadIntervalConfig(configFile);
      expect(config.intervalMinutes).toBe(30);
      expect(config.assumed).toBe(true);
    } finally {
      unlinkSync(configFile);
    }
  });

  it("loadIntervalConfig with JSON missing intervalMinutes → returns 30m assumed", () => {
    const dir = mkdtempSync(join(tmpdir(), "quiet-ack-test-"));
    const configFile = join(dir, "no-interval.json");
    writeFileSync(configFile, JSON.stringify({ name: "myconfig" }), "utf-8");
    try {
      const config = loadIntervalConfig(configFile);
      expect(config.intervalMinutes).toBe(30);
      expect(config.assumed).toBe(true);
    } finally {
      unlinkSync(configFile);
    }
  });

  it("when assumed === true, buildAssumedIntervalNote() returns a non-empty message", () => {
    const note = buildAssumedIntervalNote();
    expect(typeof note).toBe("string");
    expect(note.length).toBeGreaterThan(0);
    expect(note).toContain("30m");
    expect(note).toContain("assumed");
  });

  it("buildAssumedIntervalNote mentions OpenClaw docs citation", () => {
    const note = buildAssumedIntervalNote();
    expect(note).toContain("OpenClaw");
  });

  it("buildAssumedIntervalNote warns about Anthropic OAuth 60m (C-002)", () => {
    const note = buildAssumedIntervalNote();
    expect(note).toContain("60m");
  });
});

// ---------------------------------------------------------------------------
// CITATIONS — T013, C-003
// ---------------------------------------------------------------------------

describe("CITATIONS", () => {
  it("CITATIONS['heartbeat/quiet-ack'] contains the real pinned SHA", () => {
    const citation = CITATIONS["heartbeat/quiet-ack"];
    expect(citation).toContain(
      "f32e439dc6248942bc2c10fca2ad2d3a4e9761b2569edb7232006e64d1c92a8d"
    );
    // Ensure the placeholder was NOT left in
    expect(citation).not.toContain("<SHA>");
  });

  it("CITATIONS['heartbeat/quiet-ack'] mentions HEARTBEAT_OK and ackMaxChars", () => {
    const citation = CITATIONS["heartbeat/quiet-ack"];
    expect(citation).toContain("HEARTBEAT_OK");
    expect(citation).toContain("ackMaxChars");
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_ACK_MAX_CHARS — T013, C-003
// ---------------------------------------------------------------------------

describe("DEFAULT_ACK_MAX_CHARS", () => {
  it("is 300 per OpenClaw docs", () => {
    expect(DEFAULT_ACK_MAX_CHARS).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// discrimination control (FR-009) — T015
// ---------------------------------------------------------------------------

describe("discrimination control", () => {
  // Rigged-impossible discrimination control (FR-009). Control A: noisy
  // non-ack must fail. Control B: HEARTBEAT_OK with overflow reply must fail —
  // per OpenClaw docs, delivery is not suppressed when ackMaxChars is exceeded.
  // If either test passes the grader, the grader has a bug.

  it("Control A — noisy non-ack must fail (FR-009)", () => {
    // Rigged-impossible: a verbose prose response that does NOT start with
    // HEARTBEAT_OK. The grader must correctly identify this as a failure.
    const noisyResponse =
      "I have reviewed the HEARTBEAT.md file and determined that there are " +
      "currently no pending tasks requiring immediate attention. All scheduled " +
      "maintenance windows have been completed and the system is operating within " +
      "normal parameters. The monitoring dashboards show green across all services.";
    const config = buildIntervalConfig();
    const result = gradeQuietAck(noisyResponse, config);

    // The grader must detect the missing HEARTBEAT_OK token — any pass here is a bug.
    expect(result.passed).toBe(false);
    expect(result.startsWithAck).toBe(false);
  });

  it("Control B — HEARTBEAT_OK with 400-char overflow reply must fail (FR-009)", () => {
    // Rigged-impossible: a reply that starts with HEARTBEAT_OK but has a
    // 400-character total length — exceeding the 300-char default limit.
    // Per OpenClaw docs, delivery is NOT suppressed when ackMaxChars is exceeded.
    const overflowReply = "HEARTBEAT_OK " + "x".repeat(400 - "HEARTBEAT_OK ".length);
    expect(overflowReply.length).toBe(400);
    expect(overflowReply.length).toBeGreaterThan(DEFAULT_ACK_MAX_CHARS); // 400 > 300

    const config = buildIntervalConfig();
    const result = gradeQuietAck(overflowReply, config);

    // The grader must detect the ackMaxChars overflow — any pass here is a bug.
    expect(result.passed).toBe(false);
    expect(result.startsWithAck).toBe(true); // starts correctly
    expect(result.withinCharLimit).toBe(false); // but exceeds limit
  });
});
