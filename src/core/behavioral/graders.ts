/**
 * The three locked behavioral axes (FR-018/019/020/021), graded objectively.
 *
 * Thresholds arrive as the adapter's R9 ThresholdMapping parameter — this
 * module never imports an adapter (C-004) and never reads the environment.
 * Every AxisGrade carries `measured` and `limit` (NFR-005): a failure is
 * always explainable as "measured X against limit Y".
 */

import type { EffectiveConfig, ThresholdMapping } from "../adapter.js";
import type {
  AxisGrade,
  ContentAssertion,
  TranscriptEntry,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `voice.verbosity` of an effective config, or null when absent/non-numeric. */
function verbosityOf(effective: EffectiveConfig): number | null {
  const voice = effective["voice"];
  if (!isRecord(voice)) return null;
  const verbosity = voice["verbosity"];
  return typeof verbosity === "number" ? verbosity : null;
}

/**
 * Resolve the verbosity word limit for one turn: per-case override wins;
 * otherwise the adapter mapping over the ACTIVE state's effective config
 * (FR-018). Returns a string "limit" when the config carries no usable
 * `voice.verbosity` — the grade then fails with an explanation, never NaN.
 */
export function verbosityLimit(
  effective: EffectiveConfig,
  override: number | undefined,
  thresholds: ThresholdMapping
): number | string {
  if (override !== undefined) return override;
  const verbosity = verbosityOf(effective);
  if (verbosity === null) {
    return "unmeasurable: effective voice.verbosity is missing or not a number";
  }
  return thresholds.maxWords(verbosity);
}

/**
 * Verbosity axis (FR-018): assistant reply word count ≤
 * `override ?? thresholds.maxWords(effective.voice.verbosity)` where
 * `effective` is the active state's config at that turn.
 */
export function gradeVerbosity(
  entry: TranscriptEntry,
  effective: EffectiveConfig,
  override: number | undefined,
  thresholds: ThresholdMapping,
  turn: number
): AxisGrade {
  const measured = entry.wordCount ?? thresholds.words(entry.content);
  const limit = verbosityLimit(effective, override, thresholds);
  return {
    axis: "verbosity",
    turn,
    measured,
    limit,
    passed: typeof limit === "number" && measured <= limit,
  };
}

/** Case-insensitive assertion match: substring by default, RegExp on demand. */
function assertionMatches(assertion: ContentAssertion, content: string): boolean {
  if (assertion.regex === true) {
    // Case-insensitive by default per contracts/behavioral-manifest.md.
    return new RegExp(assertion.pattern, "i").test(content);
  }
  return content.toLowerCase().includes(assertion.pattern.toLowerCase());
}

/**
 * Refusal axis (FR-019/FR-020): reply word count ≤ `override ?? refusalCap`
 * (R9: 25), AND every content assertion holds. Each assertion is its own
 * AxisGrade line so a failure pinpoints the exact pattern (NFR-005).
 */
export function gradeRefusal(
  entry: TranscriptEntry,
  override: number | undefined,
  assertions: readonly ContentAssertion[],
  thresholds: ThresholdMapping,
  turn: number
): AxisGrade[] {
  const measured = entry.wordCount ?? thresholds.words(entry.content);
  const cap = override ?? thresholds.refusalCap;
  const grades: AxisGrade[] = [
    { axis: "refusal", turn, measured, limit: cap, passed: measured <= cap },
  ];
  for (const assertion of assertions) {
    const matched = assertionMatches(assertion, entry.content);
    grades.push({
      axis: "refusal",
      turn,
      measured: matched ? "match" : "no match",
      limit: `${assertion.kind}: ${assertion.pattern}${
        assertion.regex === true ? " (regex, case-insensitive)" : " (substring, case-insensitive)"
      }`,
      passed: assertion.kind === "must_contain" ? matched : !matched,
    });
  }
  return grades;
}

/**
 * State-shift axis (FR-021; §20.3.4): passes iff
 *
 * 1. the adapter reported `expectState` active AT the trigger turn (facts are
 *    evaluated and the overlay applied BEFORE that turn's reply — §20.3.4
 *    application timing), AND
 * 2. every post-shift verbosity grade was computed against the SHIFTED
 *    state's threshold — the observable change. When `shiftedLimit` is
 *    supplied (the runner derives it from the expected state's overlay), each
 *    post-shift grade's limit must equal it; grades computed under the base
 *    state's threshold betray a shift that never applied.
 *
 * `measured` = the actual active state at the trigger turn; `limit` = the
 * expected state (NFR-005 in string form).
 */
export function gradeStateShift(
  runState: string,
  expectState: string,
  postShiftGrades: readonly AxisGrade[],
  opts: { turn: number; shiftedLimit?: number }
): AxisGrade {
  const stateMatches = runState === expectState;
  const thresholdsShifted =
    opts.shiftedLimit === undefined ||
    postShiftGrades.every((grade) => grade.limit === opts.shiftedLimit);
  return {
    axis: "state_shift",
    turn: opts.turn,
    measured: runState === "" ? "(no active state)" : runState,
    limit: expectState,
    passed: stateMatches && thresholdsShifted,
  };
}
