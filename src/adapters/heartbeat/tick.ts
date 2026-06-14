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
  /**
   * Maximum characters allowed in a quiet-ack reply (FR-006, FR-007).
   * When absent, the quiet-ack grader defaults to DEFAULT_ACK_MAX_CHARS (300)
   * per OpenClaw heartbeat docs.
   */
  ackMaxChars?: number;
}

export type TickState = "due" | "repeat" | "nothing-due";

/** Narrows an unknown value to a TickState (positive type guard, no assertion needed downstream). */
function isTickState(value: unknown): value is TickState {
  return value === "due" || value === "repeat" || value === "nothing-due";
}

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
/**
 * Muster-imposed action observation convention appended after the verbatim
 * OpenClaw prompt. This text defines OUTPUT FORMAT only — it does NOT tell
 * the model which items are due or leak the expected answer. The model still
 * decides what to do from the checklist + tick state.
 *
 * Cited: muster heartbeat adapter spec (FR-004) — "the manifest declares how
 * each action is observed … text-action assertions require the agent to emit
 * ACTION: lines for each action it performs."
 */
export const ACTION_OBSERVATION_CONVENTION =
  "--- MUSTER SCENARIO CONVENTION (output format only) ---\n" +
  "For every action you decide to perform on this tick, emit exactly one line of the form:\n" +
  "  ACTION: <label>\n" +
  "where <label> is the action label from the checklist item you are acting on.\n" +
  "Do not emit an ACTION: line for checklist items you decide not to act on.\n" +
  "--- END MUSTER SCENARIO CONVENTION ---";

/**
 * Returns a concise, non-leaky scenario-condition explanation for each tick
 * state. The explanation conveys WHAT SITUATION the tick represents so the
 * model understands the context — it does NOT dictate which items to act on,
 * how many to act on, or enumerate the checklist items.
 *
 * - "due": the heartbeat interval has elapsed; the model must review
 *   HEARTBEAT.md and determine what it currently calls for.
 * - "nothing-due": nothing currently needs attention; HEARTBEAT_OK is the
 *   documented OpenClaw quiet-ack response.
 * - "repeat": this tick repeats a prior one; recurring items may need action
 *   again, but items already completed that are once-only must not be repeated.
 */
function tickStateExplanation(state: TickState): string {
  if (state === "due") {
    return (
      "Tick state: due — the heartbeat interval has elapsed. " +
      "Review HEARTBEAT.md and take the actions it currently calls for."
    );
  }
  if (state === "nothing-due") {
    return (
      "Tick state: nothing-due — nothing currently needs attention. " +
      "The documented OpenClaw behavior is to reply HEARTBEAT_OK (quiet-ack)."
    );
  }
  // state === "repeat"
  return (
    "Tick state: repeat — this tick repeats a prior one. " +
    "Recurring items may need action again, but once-only items already " +
    "completed (see prior action summary above) must not be repeated."
  );
}

export function buildScenarioFraming(
  checklist: HeartbeatFile,
  tick: SimulatedTick
): string {
  const lines: string[] = [];

  // Verbatim OpenClaw documented default heartbeat prompt (C-003).
  // MUST remain byte-identical — do NOT alter this text.
  // Muster-imposed action observation convention (FR-004). Appended AFTER
  // the verbatim OpenClaw text, clearly delimited (C-003). Defines output
  // format only — does not tell the model which items are due.
  lines.push(OPENCLAW_HEARTBEAT_PROMPT, "", ACTION_OBSERVATION_CONVENTION, "");

  // Inject checklist content.
  if (checklist.isEmpty) {
    lines.push("HEARTBEAT.md: (empty — run will be skipped)");
  } else {
    lines.push("HEARTBEAT.md contents:", checklist.raw.trimEnd());
  }

  // For repeat ticks, inject prior action summary for idempotency grading.
  if (tick.state === "repeat" && tick.priorActionSummary !== null) {
    lines.push("", "Prior action summary (repeat tick — do not repeat once-only tasks):", tick.priorActionSummary);
  }

  lines.push(
    "",
    tickStateExplanation(tick.state),
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
 * Validate and extract the priorActionSummary field from a tick-state object.
 * Enforces the data-model invariant: repeat → non-null string; others → null.
 *
 * @throws TickStateValidationError when the invariant is violated.
 */
function validatePriorActionSummary(
  obj: Record<string, unknown>,
  state: TickState,
  sourcePath: string
): string | null {
  if (state === "repeat") {
    if (obj["priorActionSummary"] === null || obj["priorActionSummary"] === undefined) {
      throw new TickStateValidationError(
        `Tick state at ${sourcePath}: state='repeat' requires a non-null priorActionSummary (data-model invariant)`
      );
    }
    if (typeof obj["priorActionSummary"] !== "string") {
      throw new TickStateValidationError(
        `Tick state at ${sourcePath}: priorActionSummary must be a string for 'repeat' ticks`
      );
    }
    return obj["priorActionSummary"];
  }
  // due or nothing-due: priorActionSummary must be null.
  if (obj["priorActionSummary"] !== undefined && obj["priorActionSummary"] !== null) {
    throw new TickStateValidationError(
      `Tick state at ${sourcePath}: state='${state}' requires priorActionSummary === null (data-model invariant)`
    );
  }
  return null;
}

/**
 * Parse the intervalConfig field from a tick-state object.
 * Returns the supplied config when valid, or the buildIntervalConfig default.
 *
 * @throws TickStateValidationError when intervalConfig is present but malformed.
 */
function parseIntervalConfig(
  obj: Record<string, unknown>,
  sourcePath: string
): IntervalConfig {
  if (
    typeof obj["intervalConfig"] !== "object" ||
    obj["intervalConfig"] === null ||
    Array.isArray(obj["intervalConfig"])
  ) {
    // Absent intervalConfig — use the buildIntervalConfig default (30m assumed).
    return buildIntervalConfig();
  }
  const ic = obj["intervalConfig"] as Record<string, unknown>;
  if (typeof ic["intervalMinutes"] !== "number") {
    throw new TickStateValidationError(
      `Tick state at ${sourcePath}: intervalConfig.intervalMinutes must be a number`
    );
  }
  return {
    intervalMinutes: ic["intervalMinutes"],
    assumed: ic["assumed"] === true,
  };
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
  if (!isTickState(obj["state"])) {
    throw new TickStateValidationError(
      `Tick state at ${sourcePath} "state" must be 'due', 'repeat', or 'nothing-due'`
    );
  }

  const state = obj["state"];
  const priorActionSummary = validatePriorActionSummary(obj, state, sourcePath);

  // Optional scenarioFraming string.
  const scenarioFraming =
    typeof obj["scenarioFraming"] === "string" ? obj["scenarioFraming"] : "";

  const intervalConfig = parseIntervalConfig(obj, sourcePath);

  return {
    id: obj["id"],
    scenarioFraming,
    state,
    priorActionSummary,
    intervalConfig,
  };
}
