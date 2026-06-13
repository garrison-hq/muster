/**
 * Action-diff behavioral grader for the HEARTBEAT.md adapter.
 *
 * Implements FR-004 (action-diff probe): on a due tick, the agent's observed
 * action set must match the checklist's intended actions exactly — no missing,
 * no extra. Uses k-of-n aggregation.
 *
 * Also implements FR-008 (errored runs): an errored run is represented as an
 * ActionDiff with passed: false. It counts as a failed run and is never skipped
 * or retried in aggregation.
 *
 * No src/core/ files are modified or imported. This grader is entirely contained
 * within the SpecAdapter boundary (src/adapters/heartbeat/).
 */

import type { HeartbeatFile } from "../lint.js";
import type { SimulatedTick } from "../tick.js";
import { buildScenarioFraming } from "../tick.js";

// ---------------------------------------------------------------------------
// Data model (data-model.md §ActionDiff)
// ---------------------------------------------------------------------------

/** Result of comparing intended vs observed actions on a due tick (FR-004). */
export interface ActionDiff {
  intendedActions: string[];
  observedActions: string[];
  missingActions: string[];
  extraActions: string[];
  passed: boolean;
}

// ---------------------------------------------------------------------------
// T008 — normalizeActionLabel
// ---------------------------------------------------------------------------

/**
 * Normalize an action label for case-insensitive, whitespace-collapsed comparison.
 *
 * Normalization rules (deterministic, no randomness):
 * 1. Trim leading and trailing whitespace.
 * 2. Collapse internal whitespace runs to a single space.
 * 3. Lowercase the result.
 *
 * Used by gradeActionDiff for set membership so that the same label
 * expressed with different casing or internal spacing still matches.
 */
function normalizeActionLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

// ---------------------------------------------------------------------------
// T008 — gradeActionDiff
// ---------------------------------------------------------------------------

/**
 * Compare intended actions against observed actions and produce an ActionDiff.
 *
 * Uses normalized label comparison (trim + collapse whitespace + lowercase)
 * for set membership — set semantics: no missing, no extra per FR-004.
 * The original (un-normalized) labels are preserved in the diff output.
 *
 * passed === true iff missingActions and extraActions are both empty.
 */
export function gradeActionDiff(
  intended: string[],
  observed: string[]
): ActionDiff {
  const normalizedObserved = new Map<string, string>();
  for (const obs of observed) {
    const key = normalizeActionLabel(obs);
    if (!normalizedObserved.has(key)) {
      normalizedObserved.set(key, obs);
    }
  }

  const normalizedIntended = new Map<string, string>();
  for (const int of intended) {
    const key = normalizeActionLabel(int);
    if (!normalizedIntended.has(key)) {
      normalizedIntended.set(key, int);
    }
  }

  const missingActions = intended.filter(
    (a) => !normalizedObserved.has(normalizeActionLabel(a))
  );
  const extraActions = observed.filter(
    (a) => !normalizedIntended.has(normalizeActionLabel(a))
  );
  const passed = missingActions.length === 0 && extraActions.length === 0;

  return {
    intendedActions: intended,
    observedActions: observed,
    missingActions,
    extraActions,
    passed,
  };
}

// ---------------------------------------------------------------------------
// T008 — extractObservedActions
// ---------------------------------------------------------------------------

/**
 * Extract observed action labels from a raw agent response string.
 *
 * Extraction strategy (deterministic, no randomness):
 * - Lines matching "ACTION: <label>" (case-insensitive prefix match).
 * - The label is trimmed and internal whitespace collapsed (normalized).
 * - De-duplicated by normalized key while preserving first-occurrence order.
 *
 * This is the primary extraction path for the action observation contract
 * (FR-004, spec ~line 184). The framing convention (buildScenarioFraming)
 * instructs the model to emit exactly one ACTION: line per action taken.
 *
 * This strategy is intentionally simple and deterministic — the same input
 * always produces the same output on any machine.
 */
export function extractObservedActions(agentResponse: string): string[] {
  const lines = agentResponse.split("\n");
  const seen = new Set<string>();
  const actions: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Match "ACTION: <label>" lines (case-insensitive prefix).
    const actionMatch = /^ACTION:\s+(.+)$/i.exec(trimmed);
    if (!actionMatch) {
      continue;
    }

    const rawLabel = actionMatch[1].trim().replace(/\s+/g, " ");
    const key = rawLabel.toLowerCase();

    if (rawLabel.length > 0 && !seen.has(key)) {
      seen.add(key);
      actions.push(rawLabel);
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// T008 — buildDueTick
// ---------------------------------------------------------------------------

/**
 * Assemble the scenario-framing string for a 'due' tick.
 * Delegates to buildScenarioFraming from tick.ts.
 */
export function buildDueTick(
  checklist: HeartbeatFile,
  tick: SimulatedTick
): string {
  return buildScenarioFraming(checklist, tick);
}

// ---------------------------------------------------------------------------
// T008 — gradeRun
// ---------------------------------------------------------------------------

/**
 * Grade a single agent run for action-diff compliance.
 *
 * Spec edge case guard: An agent that replies HEARTBEAT_OK on a due tick is an
 * action-diff miss, not a quiet-ack pass (data-model invariant, spec edge case).
 * If the response starts with HEARTBEAT_OK, immediately return passed: false
 * with missingActions = intendedActions — no extraction is attempted.
 */
export function gradeRun(
  agentResponse: string,
  intendedActions: string[]
): ActionDiff {
  // An agent that replies HEARTBEAT_OK on a due tick is an action-diff miss,
  // not a quiet-ack pass (data-model invariant, spec edge case).
  if (agentResponse.startsWith("HEARTBEAT_OK")) {
    return {
      intendedActions,
      observedActions: [],
      missingActions: [...intendedActions],
      extraActions: [],
      passed: false,
    };
  }

  const observedActions = extractObservedActions(agentResponse);
  return gradeActionDiff(intendedActions, observedActions);
}

// ---------------------------------------------------------------------------
// T008 — aggregateActionDiff
// ---------------------------------------------------------------------------

/**
 * k-of-n aggregation for action-diff runs (FR-004, charter pass^k).
 *
 * Returns true if at least k out of n runs passed. Uses >= not > for
 * boundary correctness (k=n means all must pass; k=1 means any one suffices).
 *
 * Errored runs (represented as ActionDiff with passed: false) count as
 * failures — they are never skipped or treated as abstentions (FR-008).
 */
export function aggregateActionDiff(runs: ActionDiff[], k: number): boolean {
  return runs.filter((r) => r.passed).length >= k;
}
