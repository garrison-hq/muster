/**
 * A2A behavioral manifest types (WP02 — T007).
 *
 * Strict YAML format for A2A multi-turn behavioral cases (FR-004, FR-005).
 * Reuses Turn, AxisSpec, CaseOverrides from src/core/behavioral/types.ts by
 * import — core is never modified (C-004).
 *
 * Normative: kitty-specs/a2a-behavioral-conformance-01KVJDWE/contracts/a2a-behavioral-manifest.md
 */

import type { AxisSpec, CaseOverrides, Turn } from "../../core/behavioral/types.js";

export type { AxisSpec, CaseOverrides, ContentAssertion, Turn } from "../../core/behavioral/types.js";

/**
 * Endpoint reference — env-var NAMES only (never literal URLs or tokens).
 * NFR-002: only the name is stored; the value is read from the environment at
 * call time.
 */
export interface A2aEndpointRef {
  /** Env-var name whose value is the base URL of the A2A endpoint. */
  env: string;
  /** Env-var name whose value is the bearer token for the A2A endpoint. */
  token_env: string;
}

/** Optional manifest-wide defaults (overridden per-case). */
export interface BehavioralDefaultsRef {
  runs?: number;
  pass_threshold?: number;
}

/**
 * Explicit threshold block (decision-C source 1 — wins over persona-derived).
 * Normative: a2a-behavioral-manifest.md §Threshold resolution.
 */
export interface A2aThresholds {
  /** Word cap for the base (non-shifted) state. */
  default_max_words?: number;
  /** Per-state word caps (black-box state names → word limit). */
  states?: Record<string, number>;
}

/** One A2A behavioral test case. */
export interface A2aBehavioralCase {
  /** Unique, non-empty case identifier. */
  id: string;
  /**
   * OPTIONAL path to a Soul.md fixture. When present, resolves to an
   * EffectiveConfig whose voice.verbosity drives threshold derivation
   * (decision-C source 2). Resolved against manifest directory.
   */
  soul?: string;
  /**
   * OPTIONAL explicit thresholds (decision-C source 1 — overrides
   * persona-derived when both are present).
   */
  thresholds?: A2aThresholds;
  /** Multi-turn user turns (≥ 1). */
  turns: Turn[];
  /** Grading axes (≥ 1). */
  axes: AxisSpec[];
  /** Per-case field overrides (max_words, refusal_cap). */
  overrides?: CaseOverrides;
  /** n in k-of-n pass verdict. */
  runs: number;
  /** k in k-of-n; an errored run is a failed run. */
  pass_threshold: number;
}

/** Top-level A2A behavioral manifest. */
export interface A2aBehavioralManifest {
  adapter: "a2a";
  kind: "behavioral";
  endpoint: A2aEndpointRef;
  defaults?: BehavioralDefaultsRef;
  cases: A2aBehavioralCase[];
}

/**
 * Resolved per-state word caps — the shape the runner (WP03) consumes.
 * Produced by resolveThresholds() for each case after decision-C precedence.
 *
 * A null wordCap for a state means "no cap configured" — valid only for
 * refusal-only cases where refusalCap covers every axis.
 */
export interface ResolvedThresholds {
  /**
   * Word cap for the base (default) state; null = not configured.
   * Callers must reject undefined when a verbosity axis is present.
   */
  baseMaxWords: number | null;
  /**
   * Per-state word caps (state name → cap). Absent entry = fall back to
   * baseMaxWords (the runner applies this rule).
   */
  stateMaxWords: Record<string, number>;
  /**
   * Refusal-axis word cap (R9: 25 by default, overridden by
   * overrides.refusal_cap).
   */
  refusalCap: number;
}
