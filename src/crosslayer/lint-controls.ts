/**
 * lint-controls.ts — the rigged-impossible discrimination control for the
 * static cross-layer contradiction lint's subject-matter gate.
 *
 * Charter rule: every grader ships a rigged-impossible control case proving it
 * can fail (v1 cap-of-zero pattern; cf. src/adapters/memory-utilization/controls.ts,
 * src/adapters/a2a/lint.ts). This control exists because the gate added for
 * garrison-hq/muster#84 makes the detector LESS sensitive, and a safety lint
 * that silently stops finding real contradictions fails in the direction of
 * green.
 *
 * The control has three arms, all decided by `lintComposition` at call time —
 * no arm's outcome is pinned by fixture construction:
 *
 *   1. `rigged`   — persona and skill conflict on a shared subject
 *                   ("push ... to origin/main"), and the case carries the
 *                   IMPOSSIBLE expectation `ok: true`. A working detector
 *                   reports the contradiction, so the control FAILS as
 *                   designed. If it ever passes, the detector has gone
 *                   vacuous-closed (the gate blocks everything) and every
 *                   downstream suite is green while verifying nothing.
 *   2. `polarityNeutralised` — same subject, no opposing directive. Must be
 *                   clean. Proves arm 1's verdict tracks the polarity axis.
 *   3. `subjectShifted`      — same polarity shapes as arm 1, unrelated
 *                   subjects. Must be clean. Proves arm 1's verdict tracks the
 *                   subject-matter axis — i.e. that the gate itself is live
 *                   and not vacuous-open.
 *
 * Normative citation: docs/rubric/crosslayer-contradiction-gate.md
 * (muster cross-layer rubric, subject-matter gate section); FR-009.
 */

import type { LayerType, ResolvedContext, StackComposition } from "./composition.js";
import { lintComposition } from "./contradiction-lint.js";
import type { CrossLayerFindingType } from "./contradiction-lint.js";

/** The rigged case's declared expectation. Impossible by construction of arm 1. */
const IMPOSSIBLE_EXPECTED_OK = true;

const SOP_TEXT = "Follow the project's documented branch and review policy.";

/** Arm 1 persona: demands the very thing the skill forbids, same subject. */
const RIGGED_PERSONA_CLAUSE =
  "I always push my finished work directly to origin/main without waiting for a review.";
/** Arm 1 skill: forbids it, naming the same subject. */
const RIGGED_SKILL_CLAUSE =
  "Never push to origin/main directly; work is prohibited from landing without a review.";

/** Arm 2 persona: same subject as arm 1, no opposing directive. */
const POLARITY_NEUTRALISED_PERSONA_CLAUSE =
  "I open a pull request for my finished work and wait for a review before it lands on origin/main.";

/** Arm 3 persona: arm 1's polarity shape, an unrelated subject. */
const SUBJECT_SHIFTED_PERSONA_CLAUSE =
  "I always garnish every dessert plate with candied citrus peel.";

function controlComposition(personaClause: string, skillClause: string): StackComposition {
  const layerTexts = new Map<LayerType, string>([
    ["persona", personaClause],
    ["sop", SOP_TEXT],
    ["skill", skillClause],
  ]);
  const resolved: ResolvedContext = {
    composedText: Array.from(layerTexts.values()).join("\n\n"),
    sopAloneText: SOP_TEXT,
    layerTexts,
  };
  return {
    layers: Array.from(layerTexts.keys()).map((layerType) => ({
      layerType,
      fixturePath: `control/${layerType}.md`,
    })),
    precedence: undefined,
    resolved,
  };
}

/** One arm's observed outcome. */
export interface GateControlArm {
  /** true iff the lint reported zero findings for this arm. */
  readonly clean: boolean;
  /** Finding types the lint actually emitted, in report order. */
  readonly findingTypes: readonly CrossLayerFindingType[];
}

/** The observed outcome of the subject-matter gate discrimination control. */
export interface GateControlResult {
  /**
   * Did the rigged case meet its declared (impossible) expectation `ok: true`?
   * MUST be false. `true` means the detector no longer reports an unambiguous
   * same-subject contradiction — a grader bug, never a test pass.
   */
  readonly passed: boolean;
  /**
   * true iff the rigged arm reported a contradiction AND both neutralising
   * arms came back clean — i.e. the control's verdict is decided by the
   * polarity axis and the subject-matter axis independently, not by fixture
   * construction.
   */
  readonly failedAsDesigned: boolean;
  readonly rigged: GateControlArm;
  readonly polarityNeutralised: GateControlArm;
  readonly subjectShifted: GateControlArm;
  readonly reason: string;
}

function runArm(personaClause: string, skillClause: string): GateControlArm {
  const report = lintComposition(controlComposition(personaClause, skillClause));
  return {
    clean: report.ok,
    findingTypes: report.findings.map((f) => f.type),
  };
}

function describeOutcome(result: Omit<GateControlResult, "reason">): string {
  if (result.passed) {
    return (
      "SUBJECT-MATTER GATE CONTROL PASSED — grader bug. The rigged arm " +
      '("always push directly to origin/main" vs "never push to origin/main directly") ' +
      "produced zero findings, so the contradiction lint reports green on an unambiguous " +
      "same-subject conflict. Charter rule: a rigged-impossible control must never pass (FR-009)."
    );
  }
  if (!result.failedAsDesigned) {
    return (
      "SUBJECT-MATTER GATE CONTROL IS NOT DISCRIMINATING — the rigged arm failed, but a " +
      `neutralising arm did not come back clean (polarity-neutralised clean=${String(result.polarityNeutralised.clean)}, ` +
      `subject-shifted clean=${String(result.subjectShifted.clean)}). The rigged arm's failure may be ` +
      "an artefact of fixture construction rather than a real detection (FR-009)."
    );
  }
  return (
    "subject-matter gate control failed as designed: the rigged same-subject conflict is " +
    "reported, and both neutralising arms are clean — the verdict tracks the polarity axis " +
    "and the subject-matter axis independently (FR-009)."
  );
}

/**
 * Runs the three-arm discrimination control and reports what was observed.
 * Every field is computed from a live `lintComposition` call.
 */
export function evaluateSubjectMatterGateControl(): GateControlResult {
  const rigged = runArm(RIGGED_PERSONA_CLAUSE, RIGGED_SKILL_CLAUSE);
  const polarityNeutralised = runArm(POLARITY_NEUTRALISED_PERSONA_CLAUSE, RIGGED_SKILL_CLAUSE);
  const subjectShifted = runArm(SUBJECT_SHIFTED_PERSONA_CLAUSE, RIGGED_SKILL_CLAUSE);

  const riggedReportedContradiction = rigged.findingTypes.includes("cross-layer-contradiction");
  const passed = rigged.clean === IMPOSSIBLE_EXPECTED_OK;
  const failedAsDesigned =
    !passed && riggedReportedContradiction && polarityNeutralised.clean && subjectShifted.clean;

  const partial = { passed, failedAsDesigned, rigged, polarityNeutralised, subjectShifted };
  return { ...partial, reason: describeOutcome(partial) };
}

/**
 * Logs a warning when the control did not fail as designed. Warns rather than
 * throws, mirroring rule-survival's `checkDiscriminationControl`, so a single
 * misbehaving control surfaces without aborting a suite run.
 */
export function checkSubjectMatterGateControl(result: GateControlResult): void {
  if (!result.failedAsDesigned) {
    console.warn(result.reason);
  }
}
