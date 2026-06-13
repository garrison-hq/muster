/**
 * Idempotency behavioral grader for the HEARTBEAT.md adapter.
 *
 * Implements FR-005 (idempotency probe): on a repeat tick with no new state,
 * once-only checklist items must not be repeated or duplicated. Uses k-of-n
 * aggregation.
 *
 * Also implements FR-008 (errored runs): an errored run is represented as an
 * IdempotencyCheck with passed: false. It counts as a failed run, never skipped.
 *
 * Hard rule: the grader MUST use item.recurrence === 'once-only' to filter
 * idempotency-relevant items. Recurrence must NEVER be inferred from item text
 * (data-model invariant).
 *
 * No src/core/ files are modified or imported. This grader is entirely contained
 * within the SpecAdapter boundary (src/adapters/heartbeat/).
 */

import type { ChecklistItem, HeartbeatFile } from "../lint.js";
import type { SimulatedTick } from "../tick.js";
import { buildScenarioFraming, TickStateValidationError } from "../tick.js";
import { extractObservedActions } from "./action-diff.js";

// ---------------------------------------------------------------------------
// Data model (data-model.md §IdempotencyCheck)
// ---------------------------------------------------------------------------

/** Result of checking once-only item idempotency on a repeat tick (FR-005). */
export interface IdempotencyCheck {
  onceOnlyItems: ChecklistItem[];
  priorActions: string[];
  observedActions: string[];
  repeatedActions: string[];
  passed: boolean;
}

// ---------------------------------------------------------------------------
// T009 — gradeIdempotency
// ---------------------------------------------------------------------------

/**
 * Grade a repeat tick for idempotency compliance.
 *
 * Recurring items are expected on every tick; only once-only items drive
 * idempotency grading (FR-005, data-model invariant).
 *
 * repeatedActions = intersection of priorActions and observed, restricted to
 * once-only item texts. Uses exact string match.
 * passed === true iff repeatedActions is empty.
 */
export function gradeIdempotency(
  onceOnlyItems: ChecklistItem[],
  priorActions: string[],
  observed: string[]
): IdempotencyCheck {
  // Recurring items are expected on every tick; only once-only items drive
  // idempotency grading (FR-005, data-model invariant).
  const onceOnlyTexts = new Set(
    onceOnlyItems
      .filter((item) => item.recurrence === "once-only")
      .map((item) => item.text)
  );

  const priorSet = new Set(priorActions);
  const observedSet = new Set(observed);

  // repeatedActions: once-only items that appear in both prior and observed.
  const repeatedActions = [...onceOnlyTexts].filter(
    (text) => priorSet.has(text) && observedSet.has(text)
  );

  const passed = repeatedActions.length === 0;

  return {
    onceOnlyItems,
    priorActions,
    observedActions: observed,
    repeatedActions,
    passed,
  };
}

// ---------------------------------------------------------------------------
// T009 — buildRepeatTick
// ---------------------------------------------------------------------------

/**
 * Assemble the scenario-framing string for a 'repeat' tick.
 * Delegates to buildScenarioFraming from tick.ts.
 *
 * Validates that priorActionSummary is not null — this is required for repeat
 * ticks per the data-model SimulatedTick.priorActionSummary invariant.
 *
 * @throws TickStateValidationError if tick.priorActionSummary is null.
 */
export function buildRepeatTick(
  checklist: HeartbeatFile,
  tick: SimulatedTick
): string {
  if (tick.priorActionSummary === null) {
    throw new TickStateValidationError(
      `buildRepeatTick: tick '${tick.id}' is a repeat tick but priorActionSummary is null (data-model invariant)`
    );
  }
  return buildScenarioFraming(checklist, tick);
}

// ---------------------------------------------------------------------------
// T009 — gradeRun
// ---------------------------------------------------------------------------

/**
 * Grade a single agent run for idempotency compliance.
 *
 * Extracts observed actions from the raw response using the shared
 * extractObservedActions strategy from action-diff.ts (deterministic
 * Markdown list + tool call extraction).
 */
export function gradeRun(
  agentResponse: string,
  onceOnlyItems: ChecklistItem[],
  priorActions: string[]
): IdempotencyCheck {
  const observedActions = extractObservedActions(agentResponse);
  return gradeIdempotency(onceOnlyItems, priorActions, observedActions);
}

// ---------------------------------------------------------------------------
// T009 — aggregateIdempotency
// ---------------------------------------------------------------------------

/**
 * k-of-n aggregation for idempotency runs (FR-005, charter pass^k).
 *
 * Returns true if at least k out of n runs passed. Uses >= not > for
 * boundary correctness (k=n means all must pass; k=1 means any one suffices).
 *
 * Errored runs (represented as IdempotencyCheck with passed: false) count as
 * failures — they are never skipped or treated as abstentions (FR-008).
 */
export function aggregateIdempotency(
  runs: IdempotencyCheck[],
  k: number
): boolean {
  return runs.filter((r) => r.passed).length >= k;
}
