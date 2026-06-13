/**
 * Tick-state model and scenario-framing helpers for the HEARTBEAT.md adapter.
 *
 * Implements FR-002 (tick-state model), C-002 (interval never assumed),
 * C-004 (ticks are simulated, no real scheduler), and the data-model invariants
 * for SimulatedTick and IntervalConfig.
 *
 * NO real scheduler is ever run. Ticks are simulated via scenario framing and
 * a supplied state — this keeps the suite fast and deterministic (C-004).
 */

import { readFileSync } from "node:fs";
import type { HeartbeatFile } from "./lint.js";

// ---------------------------------------------------------------------------
// Domain types (data-model.md §SimulatedTick, §IntervalConfig)
// ---------------------------------------------------------------------------

/**
 * The supplied heartbeat interval configuration (FR-007, data-model.md).
 *
 * Invariants:
 * - Default when config is absent: 30 minutes (documented OpenClaw default).
 * - Anthropic OAuth mode default: 60 minutes — MUST be supplied by the caller,
 *   never assumed by this adapter (C-002, RQ-04).
 * - When assumed === true, the report records that the default was used.
 */
export interface IntervalConfig {
  /** The heartbeat interval in minutes as supplied by the caller. */
  intervalMinutes: number;
  /**
   * True when no config was supplied and the default was assumed.
   * The report records this flag so operators know the default was used.
   */
  assumed: boolean;
}

export type TickState = "due" | "repeat" | "nothing-due";

/**
 * The unit of behavioral testing (data-model.md §SimulatedTick).
 *
 * Invariants (enforced at runtime by loadTickState and buildScenarioFraming):
 * - state === 'repeat' implies priorActionSummary !== null.
 * - state === 'due' or 'nothing-due' implies priorActionSummary === null.
 */
export interface SimulatedTick {
  /** Unique identifier within the test manifest. */
  id: string;
  /**
   * The system-prompt framing injected to simulate the heartbeat prompt.
   * Derived from the documented default OpenClaw heartbeat prompt (C-003,
   * data-model §SimulatedTick.scenarioFraming).
   */
  scenarioFraming: string;
  /** The tick's logical state — determines which grader applies. */
  state: TickState;
  /**
   * For 'repeat' ticks: summary of what the agent did on the previous
   * (due) tick, injected into context for idempotency grading.
   * null for 'due' and 'nothing-due' ticks.
   */
  priorActionSummary: string | null;
  /** The interval configuration for this tick run (FR-007). */
  intervalConfig: IntervalConfig;
}

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

/** Thrown when a tick-state JSON file fails schema or invariant validation. */
export class TickStateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TickStateValidationError";
  }
}

// ---------------------------------------------------------------------------
// T003 — buildIntervalConfig (C-002, FR-007)
// ---------------------------------------------------------------------------

/**
 * Build an IntervalConfig from an optional caller-supplied value.
 *
 * Default 30m per OpenClaw heartbeat docs (content-SHA
 * f32e439dc6248942bc2c10fca2ad2d3a4e9761b2569edb7232006e64d1c92a8d).
 * Anthropic OAuth default is 60m and MUST be supplied by the caller,
 * never defaulted here (C-002).
 *
 * @param supplied Optional caller-supplied interval. When provided,
 *   `assumed` is false. When absent, the 30m OpenClaw default is used
 *   and `assumed` is true.
 */
export function buildIntervalConfig(
  supplied?: { intervalMinutes: number }
): IntervalConfig {
  if (supplied !== undefined) {
    return { intervalMinutes: supplied.intervalMinutes, assumed: false };
  }
  // Default 30m per OpenClaw heartbeat docs. Anthropic OAuth default is
  // 60m and MUST be supplied by the caller, never defaulted here (C-002).
  return { intervalMinutes: 30, assumed: true };
}

// ---------------------------------------------------------------------------
// T003 — buildScenarioFraming (C-003, C-004)
// ---------------------------------------------------------------------------

/**
 * The verbatim OpenClaw-documented default heartbeat prompt.
 * Cited from docs.openclaw.ai/gateway/heartbeat, content-SHA
 * f32e439dc6248942bc2c10fca2ad2d3a4e9761b2569edb7232006e64d1c92a8d (C-003).
 */
export const OPENCLAW_HEARTBEAT_PROMPT =
  "Read HEARTBEAT.md if it exists. Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.";

/**
 * Build the scenario-framing string for a simulated heartbeat tick.
 *
 * The framing injects:
 * 1. The OpenClaw-documented default heartbeat prompt verbatim (C-003).
 * 2. The checklist content from the HeartbeatFile.
 * 3. For 'repeat' ticks: the priorActionSummary from the tick.
 *
 * Ticks are simulated via scenario framing and a supplied state; no real
 * scheduler runs and no wall-clock time is waited (C-004).
 */
export function buildScenarioFraming(
  checklist: HeartbeatFile,
  tick: SimulatedTick
): string {
  const lines: string[] = [];

  // Verbatim OpenClaw documented default heartbeat prompt (C-003).
  lines.push(OPENCLAW_HEARTBEAT_PROMPT);
  lines.push("");

  // Inject checklist content.
  if (checklist.isEmpty) {
    lines.push("HEARTBEAT.md: (empty — run will be skipped)");
  } else {
    lines.push("HEARTBEAT.md contents:");
    lines.push(checklist.raw.trimEnd());
  }

  // For repeat ticks, inject prior action summary for idempotency grading.
  if (tick.state === "repeat" && tick.priorActionSummary !== null) {
    lines.push("");
    lines.push("Prior action summary (repeat tick — do not repeat once-only tasks):");
    lines.push(tick.priorActionSummary);
  }

  lines.push("");
  lines.push(`Tick state: ${tick.state}`);
  lines.push(
    `Interval: ${tick.intervalConfig.intervalMinutes}m${tick.intervalConfig.assumed ? " (assumed default)" : ""}`
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// T003 — loadTickState (C-004)
// ---------------------------------------------------------------------------

/**
 * Parse and validate a JSON tick-state file.
 *
 * Enforces data-model invariants:
 * - state === 'repeat' → priorActionSummary !== null (throws if violated)
 * - state === 'due' || state === 'nothing-due' → priorActionSummary === null
 *   (throws if violated)
 *
 * @throws TickStateValidationError for malformed or invariant-violating input.
 */
export function loadTickState(tickStatePath: string): SimulatedTick {
  let raw: string;
  try {
    raw = readFileSync(tickStatePath, "utf-8");
  } catch (err) {
    throw new TickStateValidationError(
      `Cannot read tick-state file at ${tickStatePath}: ${String(err)}`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    throw new TickStateValidationError(
      `Tick-state file at ${tickStatePath} is not valid JSON`
    );
  }

  return validateTickStateData(data, tickStatePath);
}

/**
 * Validate a plain-object tick state (useful for inline test objects).
 * Exported for testing.
 *
 * @throws TickStateValidationError for malformed or invariant-violating input.
 */
export function validateTickStateData(
  data: unknown,
  sourcePath: string
): SimulatedTick {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new TickStateValidationError(
      `Tick state at ${sourcePath} must be a JSON object`
    );
  }

  const obj = data as Record<string, unknown>;

  // Required string fields.
  if (typeof obj["id"] !== "string" || obj["id"].length === 0) {
    throw new TickStateValidationError(
      `Tick state at ${sourcePath} must have a non-empty string "id"`
    );
  }
  if (obj["state"] !== "due" && obj["state"] !== "repeat" && obj["state"] !== "nothing-due") {
    throw new TickStateValidationError(
      `Tick state at ${sourcePath} "state" must be 'due', 'repeat', or 'nothing-due'`
    );
  }

  const state = obj["state"] as TickState;

  // priorActionSummary: must be string for repeat, null for due/nothing-due.
  let priorActionSummary: string | null = null;
  if (state === "repeat") {
    if (
      obj["priorActionSummary"] === null ||
      obj["priorActionSummary"] === undefined
    ) {
      throw new TickStateValidationError(
        `Tick state at ${sourcePath}: state='repeat' requires a non-null priorActionSummary (data-model invariant)`
      );
    }
    if (typeof obj["priorActionSummary"] !== "string") {
      throw new TickStateValidationError(
        `Tick state at ${sourcePath}: priorActionSummary must be a string for 'repeat' ticks`
      );
    }
    priorActionSummary = obj["priorActionSummary"] as string;
  } else {
    // due or nothing-due: priorActionSummary must be null.
    if (
      obj["priorActionSummary"] !== undefined &&
      obj["priorActionSummary"] !== null
    ) {
      throw new TickStateValidationError(
        `Tick state at ${sourcePath}: state='${state}' requires priorActionSummary === null (data-model invariant)`
      );
    }
  }

  // Optional scenarioFraming string.
  const scenarioFraming =
    typeof obj["scenarioFraming"] === "string"
      ? obj["scenarioFraming"]
      : "";

  // intervalConfig: validate or use defaults.
  let intervalConfig: IntervalConfig;
  if (
    typeof obj["intervalConfig"] === "object" &&
    obj["intervalConfig"] !== null &&
    !Array.isArray(obj["intervalConfig"])
  ) {
    const ic = obj["intervalConfig"] as Record<string, unknown>;
    if (typeof ic["intervalMinutes"] !== "number") {
      throw new TickStateValidationError(
        `Tick state at ${sourcePath}: intervalConfig.intervalMinutes must be a number`
      );
    }
    intervalConfig = {
      intervalMinutes: ic["intervalMinutes"] as number,
      assumed: ic["assumed"] === true,
    };
  } else {
    // Absent intervalConfig — use the buildIntervalConfig default (30m assumed).
    intervalConfig = buildIntervalConfig();
  }

  return {
    id: obj["id"] as string,
    scenarioFraming,
    state,
    priorActionSummary,
    intervalConfig,
  };
}
