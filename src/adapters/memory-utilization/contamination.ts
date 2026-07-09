/**
 * contamination.ts — Closed-book contamination gate (FR-006).
 *
 * research.md §2.4: "Contamination inflates apparent lift... mandatory
 * closed-book / leakage contamination check before attributing any delta to
 * the injected memory." A probe declared `requiresMemory: true` that the
 * model already answers correctly in the `no-memory` arm at or above the
 * rubric's `contaminationThreshold` is flagged `contaminated` — its apparent
 * lift may be parametric-knowledge leakage, not the declared memory.
 *
 * Scope (data-model.md `Probe.requiresMemory`): only `kind: "lift"` probes
 * that declare `requiresMemory: true` are subject to this gate. Abstention
 * probes are *expected* to abstain in every arm including no-memory —
 * "answerable without memory" does not apply to them.
 */

import type { LearningLiftProbe } from "./manifest.js";

export interface ContaminationResult {
  readonly probeId: string;
  readonly contaminated: boolean;
  readonly noMemoryPassRate: number;
  readonly threshold: number;
}

/**
 * Evaluate one probe's no-memory pass-rate against the contamination gate.
 * Probes outside the gate's scope (abstention probes, or `requiresMemory:
 * false` lift probes) always return `contaminated: false`.
 */
export function evaluateContamination(
  probe: LearningLiftProbe,
  noMemoryPassRate: number,
  threshold: number
): ContaminationResult {
  const gateApplies = probe.kind === "lift" && probe.requiresMemory;
  const contaminated = gateApplies && noMemoryPassRate >= threshold;
  return { probeId: probe.id, contaminated, noMemoryPassRate, threshold };
}

/** True iff any probe in the case tripped the contamination gate. */
export function anyContaminated(results: readonly ContaminationResult[]): boolean {
  return results.some((r) => r.contaminated);
}

/** Stable-order (input order) list of contaminated probe ids. */
export function contaminatedProbeIds(results: readonly ContaminationResult[]): string[] {
  return results.filter((r) => r.contaminated).map((r) => r.probeId);
}
