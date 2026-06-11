/**
 * R9 behavioral threshold mapping for the RFC-1 adapter — LOCKED by the
 * planning decision (research R9; WP09 context):
 *
 *   maxWords(verbosity) = 10 + verbosity
 *   refusalCap          = 25
 *   words(s)            = s.trim().split(/\s+/).filter(Boolean).length
 *
 * RFC-1 §6 defines `voice.verbosity` as a 0–100 scalar but deliberately maps
 * no word counts; this mapping is muster's documented, deterministic choice
 * so behavioral grades are objective (FR-018/FR-019). Per-case manifest
 * overrides always win over this mapping.
 *
 * Landing this file completes the WP05 dynamic-linkage seam: the adapter
 * assembly (`./index.ts`) resolves `./thresholds.js` at module load and
 * exposes it as `rfc1Adapter.thresholds` — no change to index.ts is needed.
 */

import type { ThresholdMapping } from "../../core/adapter.js";

/** R9 word counter: trim, split on runs of whitespace, drop empties. */
export function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** R9 verbosity → max reply word count: 10 + verbosity (e.g. 30 → 40). */
export function maxWords(verbosity: number): number {
  return 10 + verbosity;
}

/** The R9 ThresholdMapping consumed via `rfc1Adapter.thresholds`. */
export const rfc1Thresholds: ThresholdMapping = {
  maxWords,
  /** R9 locked constant: a brief refusal is at most 25 words. */
  refusalCap: 25,
  words,
};

export default rfc1Thresholds;
