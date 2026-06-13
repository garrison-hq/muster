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
// T008 — gradeActionDiff
// ---------------------------------------------------------------------------

/**
 * Compare intended actions against observed actions and produce an ActionDiff.
 *
 * Uses exact string match for set membership. No fuzzy matching is applied.
 * The manifest extension point for observation strategies is noted but not
 * implemented in this WP — this version remains exact and deterministic.
 *
 * passed === true iff missingActions and extraActions are both empty.
 */
export function gradeActionDiff(
  intended: string[],
  observed: string[]
): ActionDiff {
  const observedSet = new Set(observed);
  const intendedSet = new Set(intended);

  const missingActions = intended.filter((a) => !observedSet.has(a));
  const extraActions = observed.filter((a) => !intendedSet.has(a));
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
 * Extract action items from a raw agent response string.
 *
 * Extraction strategy (deterministic, no randomness):
 * 1. Markdown list items: lines beginning with "- " or "* " or "N. " (numbered).
 * 2. Tool call summaries: lines matching "tool_call:" or "called:" patterns.
 * 3. The extracted text is trimmed and de-duplicated while preserving order
 *    of first occurrence.
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
    let text: string | null = null;

    // Markdown unordered list items: "- text" or "* text"
    if (trimmed.startsWith("- ")) {
      text = trimmed.slice(2).trim();
    } else if (trimmed.startsWith("* ")) {
      text = trimmed.slice(2).trim();
    }
    // Numbered list items: "1. text", "2. text", etc.
    else {
      const numberedMatch = /^\d+\.\s+(.+)$/.exec(trimmed);
      if (numberedMatch) {
        text = numberedMatch[1].trim();
      }
    }
    // Tool call summaries: "tool_call: <text>" or "called: <text>"
    if (text === null) {
      const toolCallMatch = /^(?:tool_call|called):\s+(.+)$/i.exec(trimmed);
      if (toolCallMatch) {
        text = toolCallMatch[1].trim();
      }
    }

    if (text && text.length > 0 && !seen.has(text)) {
      seen.add(text);
      actions.push(text);
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
