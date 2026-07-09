/**
 * verdict.ts — Turn a case's measured arm statistics into a `LiftMeasurement`
 * and its `LiftVerdict` (data-model.md `LiftMeasurement`/`LiftVerdict`).
 *
 * Statistical pipeline (research.md §4A, WP02's `core/behavioral/stats/*`):
 *   paired difference -> McNemar mid-p (significance) -> Tango (delta CI)
 *   -> Miller Eq. 10 (MDE for the declared probe count).
 *
 * FR-004: the verdict is one of `lift-confirmed | no-lift | contaminated |
 * baseline-invalid`, decided in that *precedence* order — a case that fails
 * the baseline-validity guard is `baseline-invalid` regardless of what the
 * paired statistics say; a contaminated case is `contaminated` even if its
 * raw delta/CI/mid-p would otherwise read as a lift (FR-006: "a lift
 * explained by parametric-knowledge leakage is reported contaminated, not
 * lift-confirmed").
 */

import {
  mcnemarMidP,
  tangoScoreCI,
  type PairedOutcome as StatsPairedOutcome,
} from "../../core/behavioral/stats/paired.js";
import { evaluateLiftVerdict, minimumDetectableEffect } from "../../core/behavioral/stats/power.js";

export type LiftVerdict = "lift-confirmed" | "no-lift" | "contaminated" | "baseline-invalid";

export interface LiftMeasurement {
  readonly caseId: string;
  /** Number of "lift" probes the paired statistic was computed over. */
  readonly probeCount: number;
  readonly passRateWithMemory: number;
  readonly passRateNoMemory: number;
  readonly passRateScrambledMemory: number;
  /** delta = passRateWithMemory - passRateNoMemory (paired, Tango estimate). */
  readonly delta: number;
  readonly deltaCI: { readonly lower: number; readonly upper: number };
  /** Paired significance (with vs. no-memory), McNemar mid-p. */
  readonly mcnemarMidP: number;
  /** Negative-control result (scrambled vs. no-memory) — FR-005. */
  readonly scrambledDelta: number;
  readonly scrambledMidP: number;
  /** Minimum detectable effect for `probeCount` (Miller Eq. 10). */
  readonly mde: number;
  readonly baselineValid: boolean;
  readonly contaminatedProbeIds: readonly string[];
  readonly contaminated: boolean;
  readonly verdict: LiftVerdict;
}

/**
 * Baseline-validity guard (spec.md edge case "Baseline already
 * saturated/floored"; research.md §3 prerequisite). Re-parameterizes
 * rule-survival's single-sided `BASELINE_THRESHOLD` guard
 * (`src/crosslayer/rule-survival.ts`: `baselinePassRate < BASELINE_THRESHOLD`
 * -> "baseline-failure") into a TWO-sided guard here: rule-survival asks
 * "is SOP-alone compliance already too LOW to observe erosion?"; this
 * mission asks "is the no-memory arm already too HIGH (aces the probes) OR
 * too LOW (floors them) to observe a lift?" — a different failure mode, so
 * the guard checks both tails, not one.
 */
export function isBaselineValid(noMemoryPassRate: number, floor: number, ceiling: number): boolean {
  return noMemoryPassRate > floor && noMemoryPassRate < ceiling;
}

export interface ComputeLiftMeasurementInput {
  readonly caseId: string;
  /** Dichotomized with-memory-vs-no-memory pairs (armA = with-memory, armB = no-memory). */
  readonly liftPairs: readonly StatsPairedOutcome[];
  /** Dichotomized scrambled-vs-no-memory pairs (armA = scrambled, armB = no-memory). */
  readonly scrambledPairs: readonly StatsPairedOutcome[];
  readonly passRateWithMemory: number;
  readonly passRateNoMemory: number;
  readonly passRateScrambledMemory: number;
  readonly contaminatedIds: readonly string[];
  readonly thresholds: {
    readonly liftDelta: number;
    readonly alpha?: number;
    readonly power?: number;
    readonly baselineFloor: number;
    readonly baselineCeiling: number;
  };
  /** K — samples per probe per arm; the power calc's kA/kB (Miller Eq. 10). */
  readonly runsN: number;
}

/**
 * muster's plug-in variance estimate for the MDE calculation (research.md
 * §4A: "muster must estimate omega2/sigma2 from pilot runs" — no pilot
 * infrastructure exists yet, FR-015/pilot-protocol is future work). Judgment
 * call: treat each arm's per-probe outcome as Bernoulli(p) with its natural
 * sample variance p(1-p), and no additional shared (omega2) noise component
 * beyond the two arms' own binomial variance. Flagged for the WP04 rubric to
 * adopt or override once a pilot-derived estimate exists.
 */
function estimateMDE(input: ComputeLiftMeasurementInput, probeCount: number): number {
  const sigmaWith = input.passRateWithMemory * (1 - input.passRateWithMemory);
  const sigmaWithout = input.passRateNoMemory * (1 - input.passRateNoMemory);
  return minimumDetectableEffect(probeCount, {
    omega2: 0,
    sigmaA2: sigmaWith,
    kA: input.runsN,
    sigmaB2: sigmaWithout,
    kB: input.runsN,
    alpha: input.thresholds.alpha ?? 0.05,
    power: input.thresholds.power ?? 0.8,
  });
}

interface VerdictInputs {
  readonly baselineValid: boolean;
  readonly contaminated: boolean;
  readonly ciLower: number;
  readonly ciUpper: number;
  readonly liftThreshold: number;
  readonly mcnemarPValue: number;
  readonly alpha: number;
}

/**
 * FR-004 precedence: baseline-invalid first (nothing else is assessable
 * without a valid baseline), then contaminated (FR-006 vetoes a
 * lift-confirmed claim regardless of the raw statistics), then the paired
 * decision itself — which requires BOTH a CI that clears the declared
 * threshold from below AND a significant McNemar mid-p (a deliberate
 * double-confirmation: the CI framing alone can call "lift-confirmed" on an
 * underpowered draw that got lucky; requiring significance too is muster's
 * own conservative judgment call for this rubric).
 */
function resolveVerdict(inputs: VerdictInputs): LiftVerdict {
  if (!inputs.baselineValid) return "baseline-invalid";
  if (inputs.contaminated) return "contaminated";
  const bounded = evaluateLiftVerdict({ lower: inputs.ciLower, upper: inputs.ciUpper }, inputs.liftThreshold);
  const significant = inputs.mcnemarPValue < inputs.alpha;
  return bounded.verdict === "lift-confirmed" && significant ? "lift-confirmed" : "no-lift";
}

/** Compute the full `LiftMeasurement` (and its `LiftVerdict`) for one case. */
export function computeLiftMeasurement(input: ComputeLiftMeasurementInput): LiftMeasurement {
  const alpha = input.thresholds.alpha ?? 0.05;

  const mcnemar = mcnemarMidP(input.liftPairs);
  const ci = tangoScoreCI(input.liftPairs);
  const scrambledMcnemar = mcnemarMidP(input.scrambledPairs);
  const scrambledCI = tangoScoreCI(input.scrambledPairs);

  const probeCount = input.liftPairs.length;
  const mde = estimateMDE(input, probeCount);

  const baselineValid = isBaselineValid(
    input.passRateNoMemory,
    input.thresholds.baselineFloor,
    input.thresholds.baselineCeiling
  );
  const contaminated = input.contaminatedIds.length > 0;

  const verdict = resolveVerdict({
    baselineValid,
    contaminated,
    ciLower: ci.lower,
    ciUpper: ci.upper,
    liftThreshold: input.thresholds.liftDelta,
    mcnemarPValue: mcnemar.pValue,
    alpha,
  });

  return {
    caseId: input.caseId,
    probeCount,
    passRateWithMemory: input.passRateWithMemory,
    passRateNoMemory: input.passRateNoMemory,
    passRateScrambledMemory: input.passRateScrambledMemory,
    delta: ci.estimate,
    deltaCI: { lower: ci.lower, upper: ci.upper },
    mcnemarMidP: mcnemar.pValue,
    scrambledDelta: scrambledCI.estimate,
    scrambledMidP: scrambledMcnemar.pValue,
    mde,
    baselineValid,
    contaminatedProbeIds: input.contaminatedIds,
    contaminated,
    verdict,
  };
}
