/**
 * controls.ts — The mission's three discrimination controls (data-model.md
 * `DiscriminationControl`).
 *
 *   1. `evaluateScrambledControl` — the scrambled-memory NEGATIVE control
 *      (FR-005): a significant lift on plausible-but-irrelevant memory fails
 *      the suite (it proves the probe measures context-stuffing, not
 *      learning).
 *   2. `checkCapOfZeroControl` / `capOfZeroFailedAsDesigned` — the
 *      rigged-impossible cap-of-zero control (FR-010): a case flagged
 *      `isCapOfZeroControl` is constructed so no arm can ever show a real
 *      signal; the harness must never report `lift-confirmed` for it.
 *      Mirrors rule-survival's `checkDiscriminationControl` (warns rather
 *      than throws, so a grader bug surfaces without crashing the run).
 *   3. `evaluateAllRefuseGuard` — the all-refuse guard (FR-010): every arm
 *      scoring exactly zero is indeterminate (the model may have refused
 *      everything), not evidence of "no lift". Mirrors the Memory adapter's
 *      `PrivacyLeakProbeRunner.allRefuseGuard` (`src/adapters/memory/privacy.ts`).
 */

import type { LearningLiftCase } from "./manifest.js";
import type { LiftMeasurement } from "./verdict.js";

export interface ScrambledControlResult {
  readonly passed: boolean;
  readonly reason: string;
}

/**
 * FR-005: the scrambled-memory arm must NOT show a significant lift over
 * no-memory. "Significant" mirrors the primary lift decision exactly
 * (McNemar mid-p < alpha AND the scrambled delta meets the declared lift
 * threshold) — using a looser bar here would let genuine prompt-stuffing
 * slip through as a false discrimination pass.
 */
export function evaluateScrambledControl(
  measurement: LiftMeasurement,
  thresholds: { readonly liftDelta: number; readonly alpha?: number }
): ScrambledControlResult {
  const alpha = thresholds.alpha ?? 0.05;
  const significant =
    measurement.scrambledMidP < alpha && measurement.scrambledDelta >= thresholds.liftDelta;
  if (significant) {
    return {
      passed: false,
      reason:
        `scrambled-memory control FAILED: significant lift (delta=${measurement.scrambledDelta.toFixed(3)}, ` +
        `mid-p=${measurement.scrambledMidP.toFixed(4)}) on plausible-but-irrelevant memory — the measured ` +
        "effect is context-stuffing, not learning (FR-005).",
    };
  }
  return {
    passed: true,
    reason: "no significant lift on scrambled memory — the discrimination control holds (FR-005).",
  };
}

export interface AllRefuseGuardResult {
  readonly fired: boolean;
  readonly reason: string;
}

/**
 * FR-010: when every arm's pass-rate is exactly zero, the harness cannot
 * distinguish "the memory genuinely doesn't help" from "the model refused
 * every probe" — the run is indeterminate, not evidence of `no-lift`.
 */
export function evaluateAllRefuseGuard(measurement: LiftMeasurement): AllRefuseGuardResult {
  const allZero =
    measurement.passRateWithMemory === 0 &&
    measurement.passRateNoMemory === 0 &&
    measurement.passRateScrambledMemory === 0;
  if (allZero) {
    return {
      fired: true,
      reason:
        "all-refuse: every arm scored zero passes — indeterminate (the model may have refused every " +
        "probe rather than the memory genuinely producing no lift). FR-010.",
    };
  }
  return { fired: false, reason: "" };
}

/**
 * FR-010: log a warning when a cap-of-zero control case does not yield a
 * non-`lift-confirmed` verdict — a grader bug, not a test pass. Mirrors
 * rule-survival's `checkDiscriminationControl` (warn, never throw, so a
 * single misbehaving control doesn't abort the whole suite run).
 */
export function checkCapOfZeroControl(kase: LearningLiftCase, verdict: string): void {
  if (kase.isCapOfZeroControl === true && verdict === "lift-confirmed") {
    console.warn(
      `CAP-OF-ZERO CONTROL PASSED — potential grader bug. Case "${kase.id}" is the rigged-impossible ` +
        `discrimination control (isCapOfZeroControl: true) but yielded verdict "lift-confirmed". ` +
        "Charter rule: a zero-signal control must never be confirmed as a lift (FR-010)."
    );
  }
}

/**
 * True iff the case is not a cap-of-zero control, OR it is one and correctly
 * failed to confirm a lift (i.e. the rigged-impossible control "failed as
 * designed" — spec.md scenario 4).
 */
export function capOfZeroFailedAsDesigned(kase: LearningLiftCase, verdict: string): boolean {
  if (kase.isCapOfZeroControl !== true) return true;
  return verdict !== "lift-confirmed";
}
