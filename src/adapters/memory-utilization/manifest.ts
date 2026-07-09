/**
 * manifest.ts — Case schema for the memory-utilization / learning-lift
 * conformance adapter.
 *
 * data-model.md entities implemented here: `Probe`, `ConditionArm` (as the
 * fixed `CONDITION_ARMS` tuple), and the manifest-level case wrapper that
 * ties a declared `MemoryFixture` (FR-002) to a fixed probe set, sample
 * count, and the rubric thresholds the verdict machinery needs (FR-004,
 * FR-005, FR-006).
 *
 * C-001: adapter-only knowledge. `src/core/` is never imported for anything
 * beyond the generic, spec-agnostic `Turn` shape (behavioral-runner turn
 * list, already spec-agnostic per core/behavioral/types.ts) — muster's
 * memory/learning specifics live entirely in this directory.
 */

import type { Turn } from "../../core/behavioral/types.js";

export type { Turn };

/**
 * Where the declared memory fixture lives on disk (FR-002). Reuses the
 * Memory adapter's `MEMORY.md`/`USER.md` shape and its fact-label manifest
 * (`src/adapters/memory/lint.ts` `FactParser`/`FactManifest`).
 */
export interface MemoryFixtureRef {
  readonly memoryPath: string;
  readonly userPath: string;
  /** Fact-label manifest JSON (private/timeSensitive labels), same shape as the Memory adapter's. */
  readonly manifestPath: string;
}

/**
 * A probe's grading target (data-model.md `Probe.expected`). Only the
 * mechanical (non-judge) targets are implemented in WP03 — LLM-judge grading
 * and its blinding/bias apparatus is FR-011/WP04 scope.
 */
export type ProbeExpectation =
  | { readonly kind: "fact-substring"; readonly requiredFactId: string }
  | { readonly kind: "abstain" };

/**
 * A scenario whose correct answer requires the declared memory
 * (data-model.md `Probe`).
 *
 * `requiresMemory` is the closed-book contamination-gate declaration
 * (FR-006): only `kind: "lift"` probes with `requiresMemory: true` are
 * subject to the gate — abstention probes are expected to abstain in every
 * arm by design, so "answerable without memory" does not apply to them.
 */
export interface LearningLiftProbe {
  readonly id: string;
  readonly turns: readonly Turn[];
  readonly expected: ProbeExpectation;
  readonly requiresMemory: boolean;
  readonly kind: "lift" | "abstention";
}

/**
 * The three condition arms every learning-lift case runs (FR-002, C-002).
 * Fixed and exhaustive for Tier 1 — a Tier-2 learning-curve mission would
 * extend this, not WP03.
 */
export const CONDITION_ARMS = ["no-memory", "with-memory", "scrambled-memory"] as const;
export type ConditionArmName = (typeof CONDITION_ARMS)[number];

/**
 * Rubric thresholds a case carries (data-model.md `LiftMeasurement` inputs).
 * Every field here is a muster judgment call cited back to research.md §4A /
 * spec.md edge cases at the call site (verdict.ts, contamination.ts,
 * controls.ts) — no upstream normative source exists (C-003).
 */
export interface LiftThresholds {
  /** δ — the rubric's minimum meaningful lift (paired-difference proportion units), > 0. */
  readonly liftDelta: number;
  /** Two-sided significance level for McNemar mid-p. Default 0.05. */
  readonly alpha?: number;
  /** Target power for the MDE calculation (Miller Eq. 10). Default 0.8. */
  readonly power?: number;
  /**
   * Closed-book contamination gate (FR-006): a `requiresMemory` probe whose
   * no-memory pass-rate is >= this value is flagged contaminated.
   */
  readonly contaminationThreshold: number;
  /**
   * Baseline-validity guard (spec.md edge case "Baseline already
   * saturated/floored"; re-parameterizes rule-survival's single-sided
   * `BASELINE_THRESHOLD` into a two-sided saturated/floored guard — see
   * verdict.ts `isBaselineValid`). The no-memory arm's mean pass-rate must
   * sit strictly between `baselineFloor` and `baselineCeiling`.
   */
  readonly baselineFloor: number;
  readonly baselineCeiling: number;
}

/** One learning-lift case: a declared fixture, its probe set, and thresholds. */
export interface LearningLiftCase {
  readonly id: string;
  readonly fixture: MemoryFixtureRef;
  readonly probes: readonly LearningLiftProbe[];
  /** Declared arm list — must equal `CONDITION_ARMS` exactly (validated). Self-documenting (FR-002). */
  readonly arms: readonly ConditionArmName[];
  /** N — samples per probe per arm (NFR-002: decisions rest on N-sampled pass-rates, not single draws). */
  readonly runsN: number;
  readonly thresholds: LiftThresholds;
  /** Temperature applied uniformly to every arm (C-006: arms are temperature-pinned). */
  readonly temperature?: number;
  /**
   * Marks this case as the rigged-impossible discrimination control
   * (FR-010): constructed so no arm can ever show a real signal. The
   * harness must never report `lift-confirmed` for it — see controls.ts
   * `checkCapOfZeroControl` / `capOfZeroFailedAsDesigned` (mirrors
   * rule-survival's `isDiscriminationControl` convention).
   */
  readonly isCapOfZeroControl?: boolean;
}

export interface LearningLiftManifest {
  readonly cases: readonly LearningLiftCase[];
}

// ---------------------------------------------------------------------------
// Validation — thrown at run() time so a malformed manifest fails fast and
// loudly rather than producing a silently-meaningless verdict.
// ---------------------------------------------------------------------------

function validateArms(kase: LearningLiftCase): void {
  const declared = [...kase.arms].sort();
  const expected = [...CONDITION_ARMS].sort();
  const matches =
    declared.length === expected.length && declared.every((arm, i) => arm === expected[i]);
  if (!matches) {
    throw new Error(
      `memory-utilization manifest: case "${kase.id}" must declare arms exactly ` +
        `${JSON.stringify(CONDITION_ARMS)}, got ${JSON.stringify(kase.arms)}`
    );
  }
}

function validateProbes(kase: LearningLiftCase): void {
  if (kase.probes.length === 0) {
    throw new Error(`memory-utilization manifest: case "${kase.id}" must declare at least one probe`);
  }
  if (!kase.probes.some((p) => p.kind === "lift")) {
    throw new Error(
      `memory-utilization manifest: case "${kase.id}" must declare at least one "lift" probe ` +
        "(the paired lift statistic requires a non-empty probe set)"
    );
  }
}

function validateRunsN(kase: LearningLiftCase): void {
  if (!Number.isInteger(kase.runsN) || kase.runsN < 1) {
    throw new Error(
      `memory-utilization manifest: case "${kase.id}" runsN must be a positive integer, got ${kase.runsN}`
    );
  }
}

function validateThresholds(kase: LearningLiftCase): void {
  const t = kase.thresholds;
  if (!(t.liftDelta > 0)) {
    throw new Error(`memory-utilization manifest: case "${kase.id}" thresholds.liftDelta must be > 0`);
  }
  if (!(t.contaminationThreshold > 0 && t.contaminationThreshold <= 1)) {
    throw new Error(
      `memory-utilization manifest: case "${kase.id}" thresholds.contaminationThreshold must be in (0, 1]`
    );
  }
  if (!(t.baselineFloor >= 0 && t.baselineCeiling <= 1 && t.baselineFloor < t.baselineCeiling)) {
    throw new Error(
      `memory-utilization manifest: case "${kase.id}" thresholds.baselineFloor/baselineCeiling must ` +
        "satisfy 0 <= baselineFloor < baselineCeiling <= 1"
    );
  }
}

/**
 * Validate a single case before it runs (FR-002/FR-004/FR-006 preconditions).
 * Throws a descriptive `Error` on the first violation found.
 */
export function validateCase(kase: LearningLiftCase): void {
  validateArms(kase);
  validateProbes(kase);
  validateRunsN(kase);
  validateThresholds(kase);
}
