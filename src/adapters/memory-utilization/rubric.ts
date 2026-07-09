/**
 * rubric.ts — Published-rubric citation constants + judge arm-order blinding
 * for the `memory-utilization` adapter.
 *
 * FR-011: where an LLM judge is used, the same judge grades both arms on the
 *         same probes, and arm identity/order is blinded/randomized to the
 *         judge (`blindArmOrder`, rubric §5.2).
 * FR-012: every emitted finding cites muster's published rubric
 *         (`docs/rubric/memory-utilization-taxonomy.md`) via a resolvable
 *         clause id (`RUBRIC_CITATIONS`).
 * FR-013: this module is the citation-wiring half of the rubric the mission
 *         ships; `docs/rubric/memory-utilization-taxonomy.md` is the prose
 *         half (learning-lift definition, estimator/CI/test choices,
 *         muster's own conjunctive pass^k derivation, judge-bias reasoning).
 * C-001: this module is deliberately STANDALONE — it imports nothing from
 *        `src/adapters/memory-utilization/{index,manifest,fixture,
 *        contamination,verdict,controls}.ts` (WP03's owned files, which may
 *        not exist in this lane) and nothing from `src/core/`. WP03 is
 *        expected to import `RUBRIC_CITATIONS` and `blindArmOrder` FROM this
 *        module, never the reverse.
 * NFR-001: byte-stable deterministic output — `blindArmOrder` never calls
 *        `Math.random()` or `Date.now()`; its permutation is a pure function
 *        of (seed, arm count) via a deterministic string hash + PRNG.
 */

// ---------------------------------------------------------------------------
// FR-012/FR-013 — Rubric clause citation constants
// ---------------------------------------------------------------------------

/** Path (relative to the project root) to muster's published rubric for this layer. */
export const RUBRIC_DOC_PATH = "docs/rubric/memory-utilization-taxonomy.md";

/**
 * Build one `RUBRIC_CITATIONS` entry in the shared format:
 * `"muster memory-utilization rubric §<clauseId> (<label>) — <docPath>"`.
 * `clauseId` must match a `§X.Y` heading in `RUBRIC_DOC_PATH` verbatim — this
 * is what "resolvable" means for a `rubricCitation` value (see module tests).
 */
function rubricCitation(clauseId: string, label: string): string {
  return `muster memory-utilization rubric §${clauseId} (${label}) — ${RUBRIC_DOC_PATH}`;
}

/**
 * Every citable rubric clause this adapter's checks reference, keyed by a
 * stable identifier. Every emitted `LiftMeasurement`/finding's
 * `rubricCitation` field must be one of these values (FR-012). See
 * `docs/rubric/memory-utilization-taxonomy.md` for the full prose per clause.
 */
export const RUBRIC_CITATIONS = {
  /** §2.1 — the four-part conjunctive learning-lift definition. */
  LIFT_DEFINITION: rubricCitation("2.1", "learning-lift definition"),
  /** §2.2 — the two-sided no-memory baseline-validity guard. */
  BASELINE_VALIDITY: rubricCitation("2.2", "two-sided baseline-validity guard"),
  /** §2.3 — the scrambled-memory negative (prompt-stuffing) control. */
  SCRAMBLED_CONTROL: rubricCitation("2.3", "scrambled-memory negative control"),
  /** §2.4 — the closed-book parametric-knowledge-leakage contamination gate. */
  CONTAMINATION_GATE: rubricCitation("2.4", "closed-book contamination gate"),
  /** §2.5 — declared-unanswerable probes must be refused, not fabricated. */
  ABSTENTION: rubricCitation("2.5", "abstention requirement"),
  /** §3.1 — single-arm continuous pass-rate CI (CLT, Wilson near boundaries). */
  SINGLE_ARM_CI: rubricCitation("3.1", "single-arm pass-rate CI — CLT/Wilson"),
  /** §3.2 — McNemar mid-p paired significance test. */
  PAIRED_SIGNIFICANCE: rubricCitation("3.2", "paired significance — McNemar mid-p"),
  /** §3.3 — Tango/Newcombe confidence interval for the paired lift delta. */
  DELTA_CI: rubricCitation("3.3", "confidence interval for the lift delta — Tango/Newcombe"),
  /** §3.4 — Miller Eq. 9/10 N-sizing / minimum detectable effect. */
  POWER_MDE: rubricCitation("3.4", "N-sizing and minimum detectable effect — Miller Eq. 9/10"),
  /** §4.2 — muster's own conjunctive pass^k beta-binomial posterior derivation. */
  CONJUNCTIVE_PASS_K_DERIVATION: rubricCitation(
    "4.2",
    "conjunctive pass^k — beta-binomial posterior derivation"
  ),
  /** §4.3 — the Jeffreys-prior default for the conjunctive pass^k estimator. */
  CONJUNCTIVE_PASS_K_PRIOR: rubricCitation("4.3", "conjunctive pass^k — Jeffreys-prior default"),
  /** §5.1 — why verbosity/self-enhancement/miscalibration cancel in the paired delta. */
  JUDGE_BIAS_COMMON_MODE: rubricCitation(
    "5.1",
    "judge-bias common-mode cancellation in the paired design"
  ),
  /** §5.2 — why position/order bias does NOT cancel, hence mandatory arm-order blinding. */
  ARM_ORDER_BLINDING: rubricCitation("5.2", "arm-order blinding — position bias does not cancel"),
  /** §6.1 — the four verdict values and their resolution order. */
  VERDICT_SEMANTICS: rubricCitation("6.1", "the four verdicts"),
  /** §6.2 — lift-confirmed requires both the delta CI and McNemar mid-p. */
  DOUBLE_CONFIRMATION: rubricCitation("6.2", "double confirmation — CI and McNemar"),
  /** §6.3 — a lift dependent on contaminated probes is vetoed, not discounted. */
  CONTAMINATION_VETO: rubricCitation("6.3", "contamination flag and veto"),
  /** §6.4 — abstention is graded per-arm; memory-induced fabrication is not outvoted by lift. */
  ABSTENTION_UNDER_MEMORY: rubricCitation("6.4", "abstention under with-memory"),
} as const;

/** The set of `RUBRIC_CITATIONS` keys, e.g. `"LIFT_DEFINITION"`. */
export type RubricClauseKey = keyof typeof RUBRIC_CITATIONS;

/** The set of resolvable rubric citation strings (`RUBRIC_CITATIONS`' values). */
export type RubricCitation = (typeof RUBRIC_CITATIONS)[RubricClauseKey];

const KNOWN_CITATIONS: ReadonlySet<string> = new Set(Object.values(RUBRIC_CITATIONS));

/**
 * True iff `citation` is one of `RUBRIC_CITATIONS`' values — the resolvability
 * check every emitted finding's `rubricCitation` field must pass (FR-012),
 * mirroring `docs/rubric/sop-rule-taxonomy.md`'s `source.normative`
 * enforcement for the SOP adapter.
 */
export function isKnownRubricCitation(citation: string): boolean {
  return KNOWN_CITATIONS.has(citation);
}

// ---------------------------------------------------------------------------
// FR-011 — Deterministic judge arm-order blinding (rubric §5.2)
// ---------------------------------------------------------------------------

/**
 * One condition arm's content as it would be shown to a grading judge,
 * tagged with its real identity. `armId` (e.g. `"with-memory"`) must never
 * reach the judge — see `BlindedArm`.
 */
export interface ArmPayload<T> {
  readonly armId: string;
  readonly content: T;
}

/**
 * One arm's content as actually presented to the judge: an anonymous,
 * position-derived label plus the content — `armId` is deliberately absent
 * from this shape, so a judge prompt built from `BlindedArm` values cannot
 * leak arm identity even by accident (rubric §5.2).
 */
export interface BlindedArm<T> {
  readonly blindLabel: string;
  readonly content: T;
}

/** The result of blinding+ordering a set of arms for one probe/judge call. */
export interface BlindArmOrderResult<T> {
  /**
   * The arms in the (blinded, randomized) order actually presented to the
   * judge. Never includes `armId`.
   */
  readonly presentation: readonly BlindedArm<T>[];
  /**
   * `order[presentationIndex] = originalArmsIndex` — a permutation of
   * `[0, arms.length)`. Retained ONLY for post-hoc unblinding by the caller
   * (e.g. to attribute a judge verdict back to the real arm after grading);
   * must never itself be shown to the judge.
   */
  readonly order: readonly number[];
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a, 32-bit — a standard, non-cryptographic string hash. Used only to
 * turn an arbitrary seed string into a deterministic PRNG seed; never a
 * source of entropy on its own (NFR-001: no `Math.random()`/`Date.now()`
 * anywhere in this module — the permutation is a pure function of `seed`).
 */
function fnv1a32(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/**
 * mulberry32 — a standard, small, fast deterministic PRNG. Given the same
 * 32-bit `seed`, produces the same infinite output stream every time (pure
 * function of `seed`; no external entropy source).
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A deterministic Fisher–Yates permutation of `[0, length)`, seeded from
 * `seed` via `fnv1a32` + `mulberry32`. Same `(length, seed)` always yields
 * the same permutation; different seeds (e.g. distinct probe ids) are
 * expected to yield different permutations, spreading any residual judge
 * position bias across arms rather than attaching it to one arm (rubric
 * §5.2).
 */
function deterministicPermutation(length: number, seed: string): number[] {
  const indices = Array.from({ length }, (_unused, i) => i);
  const nextRandom = mulberry32(fnv1a32(seed));
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom() * (i + 1));
    const swap = indices[i];
    indices[i] = indices[j];
    indices[j] = swap;
  }
  return indices;
}

const BLIND_LABEL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** `"Answer A"`, `"Answer B"`, …; falls back to a 1-based numeric label past `Z`. */
function blindLabelForPosition(position: number): string {
  if (position < BLIND_LABEL_ALPHABET.length) {
    return `Answer ${BLIND_LABEL_ALPHABET[position]}`;
  }
  return `Answer ${position + 1}`;
}

/**
 * Blind and deterministically randomize the presentation order of a set of
 * condition arms for a single judge call (rubric §5.2, FR-011).
 *
 * - **Blinding**: the returned `presentation` entries carry only an anonymous
 *   `blindLabel` ("Answer A", "Answer B", …) and `content` — never `armId`.
 * - **Randomization**: presentation order is a deterministic permutation of
 *   `arms`, derived purely from `seed` (typically `${probeId}:${runIndex}` or
 *   similar caller-chosen deterministic key — never wall-clock time or
 *   `Math.random()`). The same `(arms, seed)` always yields the same
 *   `BlindArmOrderResult`.
 *
 * @throws Error if `arms` is empty — there is nothing to blind or order.
 */
export function blindArmOrder<T>(
  arms: readonly ArmPayload<T>[],
  seed: string
): BlindArmOrderResult<T> {
  if (arms.length === 0) {
    throw new Error("blindArmOrder: arms must be non-empty");
  }
  const order = deterministicPermutation(arms.length, seed);
  const presentation: BlindedArm<T>[] = order.map((originalIndex, position) => ({
    blindLabel: blindLabelForPosition(position),
    content: arms[originalIndex].content,
  }));
  return { presentation, order };
}
