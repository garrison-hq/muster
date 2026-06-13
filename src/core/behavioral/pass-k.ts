/**
 * pass-k.ts — Shared pass^k conjunctive aggregation helper (core module).
 *
 * Provides a single spec-agnostic implementation of pass^k aggregation used
 * by conformance layers (cross-layer, SOP, etc.). Placing this in src/core/
 * ensures dependencies point inward — conformance layers depend on core,
 * never on each other.
 *
 * Charter rule (non-negotiable): an errored run counts as a FAILED run —
 * never skipped, never retried (FR-006, tau-bench pass^k convention).
 *
 * Callers are responsible for mapping their run-result type to a `boolean`
 * (passed/failed); this function only performs the conjunction.
 *
 * Normative citations:
 *   - muster cross-layer conformance rubric, FR-006
 *   - tau-bench: pass^k conjunctive aggregation for safety-critical rules
 *   - Charter testing standards: "An errored run counts as a failed run
 *     everywhere — never skipped, never retried." (FR-006)
 */

/**
 * Aggregate an array of per-run pass flags using pass^k (conjunctive) semantics.
 *
 * Returns `true` iff every run in `passFlags` is `true`. A single `false`
 * (or an empty array) causes the aggregate to be `false` per pass^k rules.
 *
 * Edge case: empty array → `true` (vacuous conjunction; every([] => true)).
 * This matches Array.prototype.every semantics and the tau-bench convention.
 *
 * @param passFlags - One boolean per run: `true` = run passed, `false` = run
 *   failed or errored. Callers must map their run-result type (e.g. RunResult,
 *   SOPRunVerdict) to a boolean before calling this function.
 *
 * @returns `true` iff all flags are `true` (pass^k conjunction).
 */
export function conjunctivePassK(passFlags: readonly boolean[]): boolean {
  return passFlags.every((p) => p);
}
