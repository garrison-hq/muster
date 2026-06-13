/**
 * Quiet-ack behavioral grader for the HEARTBEAT.md adapter.
 *
 * Implements FR-006 (quiet-ack probe): on a nothing-due tick, the agent must
 * reply HEARTBEAT_OK within ackMaxChars (default 300). Uses k-of-n aggregation.
 *
 * Also implements FR-007 (interval-config read path): ackMaxChars is read from
 * IntervalConfig; when absent the default 300 is used and recorded.
 *
 * Also implements FR-008 (errored runs): null/undefined/empty reply is treated
 * as an errored run — passed: false, never skipped.
 *
 * Hard rule: this grader applies ONLY to nothing-due ticks. An agent that replies
 * HEARTBEAT_OK on a due tick is an action-diff miss, not a quiet-ack pass (spec
 * edge case, data-model invariant). The assertNothingDueTick guard enforces this.
 *
 * No src/core/ files are modified or imported. This grader is entirely contained
 * within the SpecAdapter boundary (src/adapters/heartbeat/).
 */

import { readFileSync } from "node:fs";
import type { IntervalConfig, SimulatedTick } from "../tick.js";
import { buildIntervalConfig } from "../tick.js";

// ---------------------------------------------------------------------------
// Citation constants (C-003, FR-010)
//
// The SHA below is the x-amz-meta-openclaw-sha256 content hash returned by
// https://docs.openclaw.ai/gateway/heartbeat on 2026-06-13 (the canonical
// CloudFront/R2 content-hash; the private repository does not publish commit
// SHAs publicly). This hash pins the exact doc revision cited.
//   x-amz-meta-openclaw-sha256: f32e439dc6248942bc2c10fca2ad2d3a4e9761b2569edb7232006e64d1c92a8d
//
// Drift-watch practice: when this module is updated, re-verify the SHA by
// fetching https://docs.openclaw.ai/gateway/heartbeat and checking the
// x-amz-meta-openclaw-sha256 response header. If the SHA changes, update both
// this module and tick.ts to keep citations consistent.
// ---------------------------------------------------------------------------

export const CITATIONS = {
  "heartbeat/quiet-ack": `OpenClaw heartbeat docs, content-SHA f32e439dc6248942bc2c10fca2ad2d3a4e9761b2569edb7232006e64d1c92a8d — "HEARTBEAT_OK suppresses delivery; reply must be within ackMaxChars (default 300)"`,
} as const;

// ---------------------------------------------------------------------------
// Default ackMaxChars constant (C-002, C-003)
//
// Default 300 per OpenClaw heartbeat docs (CITATIONS['heartbeat/quiet-ack']).
// Anthropic OAuth interval is 60m — this constant is for reply length only, NOT
// for interval. Never hardcode 60 as a default interval (C-002).
// ---------------------------------------------------------------------------

/** Default ackMaxChars per OpenClaw heartbeat docs (CITATIONS['heartbeat/quiet-ack']). */
export const DEFAULT_ACK_MAX_CHARS = 300;

// ---------------------------------------------------------------------------
// Data model (data-model.md §QuietAckCheck)
// ---------------------------------------------------------------------------

/** Result of the quiet-ack behavioral probe on a nothing-due tick (FR-006). */
export interface QuietAckCheck {
  ackToken: "HEARTBEAT_OK";
  ackMaxChars: number;
  observedReply: string;
  startsWithAck: boolean;
  withinCharLimit: boolean;
  passed: boolean;
}

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

/** Thrown when assertNothingDueTick is called with a non-nothing-due tick. */
export class QuietAckTickStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuietAckTickStateError";
  }
}

// ---------------------------------------------------------------------------
// T013 — assertNothingDueTick (spec edge case guard)
// ---------------------------------------------------------------------------

/**
 * Assert that a tick is in the nothing-due state.
 *
 * This grader applies only to nothing-due ticks. An agent that replies
 * HEARTBEAT_OK on a due tick is an action-diff miss, not a quiet-ack pass
 * (data-model invariant, spec edge case).
 *
 * @throws QuietAckTickStateError if tick.state !== 'nothing-due'.
 */
export function assertNothingDueTick(tick: SimulatedTick): void {
  if (tick.state !== "nothing-due") {
    throw new QuietAckTickStateError(
      `assertNothingDueTick: tick '${tick.id}' has state '${tick.state}', expected 'nothing-due'. ` +
        `This grader applies only to nothing-due ticks. An agent that replies HEARTBEAT_OK on a ` +
        `due tick is an action-diff miss, not a quiet-ack pass (data-model invariant, spec edge case).`
    );
  }
}

// ---------------------------------------------------------------------------
// T013 — gradeQuietAck (FR-006, C-002, C-003)
// ---------------------------------------------------------------------------

/**
 * Grade a quiet-ack check on a nothing-due tick.
 *
 * ackMaxChars is read from intervalConfig.ackMaxChars or defaults to
 * DEFAULT_ACK_MAX_CHARS (300 per OpenClaw docs). Never hardcoded as a bare
 * literal (C-002, C-003).
 *
 * passed === true iff startsWithAck AND withinCharLimit.
 */
export function gradeQuietAck(
  observedReply: string,
  intervalConfig: IntervalConfig
): QuietAckCheck {
  const ackMaxChars = intervalConfig.ackMaxChars ?? DEFAULT_ACK_MAX_CHARS;
  const startsWithAck = observedReply.startsWith("HEARTBEAT_OK");
  const withinCharLimit = observedReply.length <= ackMaxChars;
  const passed = startsWithAck && withinCharLimit;

  return {
    ackToken: "HEARTBEAT_OK",
    ackMaxChars,
    observedReply,
    startsWithAck,
    withinCharLimit,
    passed,
  };
}

// ---------------------------------------------------------------------------
// T013 — gradeRun (FR-006, FR-008)
// ---------------------------------------------------------------------------

/**
 * Grade a single agent run for quiet-ack compliance.
 *
 * A null/undefined/empty observedReply is treated as an errored run: returns
 * passed: false. Errored runs count as failed runs, never skipped (FR-008).
 *
 * Also calls assertNothingDueTick to guard against misapplication of this
 * grader to non-nothing-due ticks (spec edge case guard).
 *
 * @throws QuietAckTickStateError if tick.state !== 'nothing-due'.
 */
export function gradeRun(
  observedReply: string | null | undefined,
  intervalConfig: IntervalConfig,
  tick: SimulatedTick
): QuietAckCheck {
  // Guard: this grader applies only to nothing-due ticks.
  assertNothingDueTick(tick);

  // Null/undefined/empty reply is an errored run → passed: false (FR-008).
  if (observedReply === null || observedReply === undefined || observedReply === "") {
    const ackMaxChars = intervalConfig.ackMaxChars ?? DEFAULT_ACK_MAX_CHARS;
    return {
      ackToken: "HEARTBEAT_OK",
      ackMaxChars,
      observedReply: "",
      startsWithAck: false,
      withinCharLimit: false,
      passed: false,
    };
  }

  return gradeQuietAck(observedReply, intervalConfig);
}

// ---------------------------------------------------------------------------
// T013 — aggregateQuietAck (FR-006, charter k-of-n)
// ---------------------------------------------------------------------------

/**
 * k-of-n aggregation for quiet-ack runs (FR-006, charter pass^k).
 *
 * Returns true if at least k out of n runs passed. Uses >= not > for boundary
 * correctness (k=n means all must pass; k=1 means any one suffices).
 *
 * Errored runs (represented as QuietAckCheck with passed: false) count as
 * failures — they are never skipped or treated as abstentions (FR-008).
 */
export function aggregateQuietAck(runs: QuietAckCheck[], k: number): boolean {
  return runs.filter((r) => r.passed).length >= k;
}

// ---------------------------------------------------------------------------
// T014 — buildAssumedIntervalNote (FR-007)
// ---------------------------------------------------------------------------

/**
 * Build a report note string for when the interval default was assumed.
 *
 * Per FR-007 and C-002: when no interval config was supplied, the default 30m
 * is assumed. This must be recorded in the report so operators know.
 * The 30m default is per OpenClaw heartbeat docs (CITATIONS['heartbeat/quiet-ack']).
 */
export function buildAssumedIntervalNote(): string {
  return (
    `interval-config assumed: no config was supplied; defaulting to 30m ` +
    `per OpenClaw heartbeat docs (${CITATIONS["heartbeat/quiet-ack"]}). ` +
    `Anthropic OAuth mode uses 60m — supply that value explicitly (C-002).`
  );
}

// ---------------------------------------------------------------------------
// T014 — loadIntervalConfig (FR-007, C-002)
// ---------------------------------------------------------------------------

/**
 * Load an IntervalConfig from a JSON file path, or use the default.
 *
 * Decision: implemented directly in quiet-ack.ts rather than a shared
 * interval.ts file because the read path is simple and WP02 graders do not
 * require interval-config loading. A shared file would add indirection without
 * benefit for the current WP scope.
 *
 * Behaviour:
 * - If configPath is undefined or the file is absent/unreadable, returns the
 *   buildIntervalConfig() default: { intervalMinutes: 30, assumed: true }.
 * - If the file exists and is valid JSON with a numeric intervalMinutes, returns
 *   buildIntervalConfig({ intervalMinutes }): { intervalMinutes, assumed: false }.
 * - Optional ackMaxChars field is passed through if present.
 *
 * C-002: This function never defaults intervalMinutes to 60. The Anthropic OAuth
 * 60m default MUST be supplied by the caller, not assumed here.
 */
export function loadIntervalConfig(
  configPath: string | undefined
): IntervalConfig {
  if (configPath === undefined) {
    return buildIntervalConfig();
  }

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    // File absent or unreadable — use the assumed default (30m).
    return buildIntervalConfig();
  }

  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    // Not valid JSON — use the assumed default (30m).
    return buildIntervalConfig();
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return buildIntervalConfig();
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj["intervalMinutes"] !== "number") {
    return buildIntervalConfig();
  }

  const base = buildIntervalConfig({ intervalMinutes: obj["intervalMinutes"] as number });

  // Pass through optional ackMaxChars field if present and a number.
  if (typeof obj["ackMaxChars"] === "number") {
    return { ...base, ackMaxChars: obj["ackMaxChars"] as number };
  }

  return base;
}
