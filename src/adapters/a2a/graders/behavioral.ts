/**
 * A2A behavioral runner (WP03 — T013..T018).
 *
 * Drives a multi-turn A2A conversation per behavioral case, builds a
 * system-prompt-free transcript, and grades it with the core axis graders.
 *
 * Black-box state-shift (B4 / FR-011 / decision-D3):
 *   Muster tracks the *expected* active state locally from case facts and
 *   trigger_turn metadata. The agent is NEVER told about state — no system
 *   message, no persona prompt. The agent must reveal any state shift through
 *   observable behavior (word count, content assertions). The expected state is
 *   muster-internal only and drives threshold selection + gradeStateShift.
 *
 * Charter constraints honoured here:
 *   - C-004: imports core (graders, pass-k, types) + WP01/WP02; core NEVER
 *     imports this module.
 *   - NI-003: no new fetch site — all HTTP goes through transport.sendMessage.
 *   - NFR-001: grading is a pure function of the scripted transcript; same
 *     inputs → identical verdict.
 *   - NFR-002: token read from env at call time; never stored or logged.
 *   - FR-010: an errored run is a failed run; no retry.
 *
 * Normative: kitty-specs/a2a-behavioral-conformance-01KVJDWE/contracts/
 *   a2a-behavioral-manifest.md; FR-001/002/003/007/011; research D2/D3.
 */

import {
  gradeVerbosity,
  gradeRefusal,
  gradeStateShift,
} from "../../../core/behavioral/graders.js";
import { conjunctivePassK } from "../../../core/behavioral/pass-k.js";
import type {
  AxisGrade,
  AxisSpec,
  CaseVerdict,
  RunVerdict,
  Transcript,
  TranscriptEntry,
} from "../../../core/behavioral/types.js";
import type { ThresholdMapping } from "../../../core/adapter.js";
import type { A2aBehavioralCase, A2aBehavioralManifest, ResolvedThresholds } from "../behavioral-manifest.js";
import { sendMessage } from "../transport.js";
import type { ConversationHandle } from "../transport.js";

// ---------------------------------------------------------------------------
// Public re-exports for WP04
// ---------------------------------------------------------------------------

export type { CaseVerdict, RunVerdict };

// ---------------------------------------------------------------------------
// T016 — Threshold adapter: ResolvedThresholds → ThresholdMapping
//
// The core graders consume a ThresholdMapping (adapter.ts R9 contract). WP02
// resolves per-case thresholds into ResolvedThresholds. This function bridges
// the two: builds a ThresholdMapping that returns the resolved caps for
// whichever state is currently active, honouring overrides already folded into
// ResolvedThresholds by resolveThresholds().
//
// Normative: adapter.ts ThresholdMapping; a2a-behavioral-manifest.md
//   §Threshold resolution (decision-C); FR-018.
// ---------------------------------------------------------------------------

const DEFAULT_REFUSAL_CAP = 25;

/** Count whitespace-delimited tokens in a string (R9 words() contract). */
function countWords(s: string): number {
  const trimmed = s.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Build a ThresholdMapping from ResolvedThresholds and the per-state active
 * state name so gradeVerbosity receives the right word cap.
 *
 * `activeState` = the expected state at the graded turn (black-box local).
 * Falls back to baseMaxWords when the state has no explicit cap.
 */
function makeThresholdMapping(
  resolved: ResolvedThresholds,
  activeState: string
): ThresholdMapping {
  const effectiveCap =
    activeState !== "" && resolved.stateMaxWords[activeState] !== undefined
      ? resolved.stateMaxWords[activeState]
      : (resolved.baseMaxWords ?? 0);

  return {
    maxWords(_verbosity: number): number {
      return effectiveCap;
    },
    refusalCap: resolved.refusalCap,
    words: countWords,
  };
}

// ---------------------------------------------------------------------------
// T015 — Black-box expected-state tracking
//
// We compute the expected active state muster-internally from the case axes:
// only `state_shift` axes carry `trigger_turn` and `expect_state`. After the
// trigger turn fires, all subsequent turns carry the shifted expected state.
//
// NOTE: We do NOT send any system/persona message. The agent must exhibit the
// shift through observable behavior (shorter replies, content changes). This is
// the black-box constraint (B4, FR-011, D3).
//
// Citation: a2a-behavioral-manifest.md §state_shift axis; FR-011.
// ---------------------------------------------------------------------------

interface StateShiftSpec {
  triggerTurn: number;
  expectState: string;
}

/** Extract state_shift specs from the case axes (may be empty). */
function extractStateShifts(axes: AxisSpec[]): StateShiftSpec[] {
  const shifts: StateShiftSpec[] = [];
  for (const axis of axes) {
    if (axis.axis === "state_shift") {
      shifts.push({ triggerTurn: axis.trigger_turn, expectState: axis.expect_state });
    }
  }
  return shifts;
}

/**
 * Compute the expected active state at the given 0-indexed turn index.
 *
 * State shifts at `trigger_turn` are effective FROM that turn onward (the
 * trigger fires before the agent reply for that turn — §20.3.4 timing).
 * First state_shift that has trigger_turn ≤ current turn wins.
 */
function expectedStateAtTurn(shifts: StateShiftSpec[], turnIndex: number): string {
  // Walk shifts in order; last one whose trigger_turn <= turnIndex wins.
  let activeState = "";
  for (const shift of shifts) {
    if (shift.triggerTurn <= turnIndex) {
      activeState = shift.expectState;
    }
  }
  return activeState;
}

// ---------------------------------------------------------------------------
// T017 — Grade axis helpers
// ---------------------------------------------------------------------------

interface TurnRecord {
  turnIndex: number;
  reply: string;
  wordCount: number;
  activeState: string;
}

/** Grade verbosity axis turns and accumulate into grades + verbosityGrades. */
function gradeVerbosityAxis(
  axis: Extract<AxisSpec, { axis: "verbosity" }>,
  records: TurnRecord[],
  resolved: ResolvedThresholds,
  overrideMaxWords: number | undefined,
  grades: AxisGrade[],
  verbosityGrades: AxisGrade[]
): void {
  const targets =
    axis.turns === "all" ? records.map((_, i) => i) : axis.turns;

  for (const turnIndex of targets) {
    const record = records[turnIndex];
    if (record === undefined) continue;

    const thresholds = makeThresholdMapping(resolved, record.activeState);
    const entry: TranscriptEntry = {
      role: "assistant",
      content: record.reply,
      activeState: record.activeState,
      wordCount: record.wordCount,
    };
    const grade = gradeVerbosity(
      entry,
      // EffectiveConfig not needed — we pass verbosity via thresholds.maxWords()
      // which returns the resolved cap directly. Pass a dummy effective that has
      // voice.verbosity=0 so verbosityLimit reads the thresholds.maxWords path.
      { voice: { verbosity: 0 } },
      overrideMaxWords,
      thresholds,
      turnIndex
    );
    grades.push(grade);
    verbosityGrades.push(grade);
  }
}

/** Grade refusal axis for one turn. */
function gradeRefusalAxis(
  axis: Extract<AxisSpec, { axis: "refusal" }>,
  records: TurnRecord[],
  resolved: ResolvedThresholds,
  overrideRefusalCap: number | undefined,
  grades: AxisGrade[]
): void {
  const record = records[axis.turn];
  if (record === undefined) return;

  const thresholds = makeThresholdMapping(resolved, record.activeState);
  const entry: TranscriptEntry = {
    role: "assistant",
    content: record.reply,
    activeState: record.activeState,
    wordCount: record.wordCount,
  };
  grades.push(
    ...gradeRefusal(
      entry,
      overrideRefusalCap,
      axis.assertions ?? [],
      thresholds,
      axis.turn
    )
  );
}

/** Grade state_shift axis using post-shift verbosity evidence. */
function gradeStateShiftAxis(
  axis: Extract<AxisSpec, { axis: "state_shift" }>,
  records: TurnRecord[],
  resolved: ResolvedThresholds,
  overrideMaxWords: number | undefined,
  verbosityGrades: AxisGrade[],
  grades: AxisGrade[]
): void {
  const record = records[axis.trigger_turn];
  const runState = record?.activeState ?? "";

  // Expected post-shift verbosity limit: the shifted state's word cap.
  const shiftedThresholds = makeThresholdMapping(resolved, axis.expect_state);
  const shiftedCap = overrideMaxWords ?? shiftedThresholds.maxWords(0);

  const postShift = verbosityGrades.filter((g) => g.turn >= axis.trigger_turn);

  grades.push(
    gradeStateShift(runState, axis.expect_state, postShift, {
      turn: axis.trigger_turn,
      shiftedLimit: shiftedCap,
    })
  );
}

/** Grade all axes for one run's records. */
function gradeRun(
  kase: A2aBehavioralCase,
  records: TurnRecord[],
  resolved: ResolvedThresholds
): AxisGrade[] {
  const grades: AxisGrade[] = [];
  const verbosityGrades: AxisGrade[] = [];
  const overrideMaxWords = kase.overrides?.max_words;
  const overrideRefusalCap = kase.overrides?.refusal_cap;

  // Pass 1: verbosity + refusal (state_shift consumes verbosity grades).
  for (const axis of kase.axes) {
    if (axis.axis === "verbosity") {
      gradeVerbosityAxis(axis, records, resolved, overrideMaxWords, grades, verbosityGrades);
    } else if (axis.axis === "refusal") {
      gradeRefusalAxis(axis, records, resolved, overrideRefusalCap, grades);
    }
  }

  // Pass 2: state_shift (FR-021 observable change).
  for (const axis of kase.axes) {
    if (axis.axis === "state_shift") {
      gradeStateShiftAxis(axis, records, resolved, overrideMaxWords, verbosityGrades, grades);
    }
  }

  return grades;
}

// ---------------------------------------------------------------------------
// T013 / T014 — Per-case run (one run = one multi-turn conversation)
// ---------------------------------------------------------------------------

/**
 * Run one behavioral case one time: walk all turns, send via A2A sendMessage,
 * build a system-prompt-free TranscriptEntry[], grade, and return RunVerdict.
 *
 * Error contract (T013 step 3, FR-010):
 *   Any sendMessage error aborts the run immediately. The partial transcript is
 *   recorded; the run is marked passed:false with the error message.
 *   Callers MUST NOT retry.
 *
 * T014 — TranscriptEntry construction:
 *   Only role:"user" (from the case) and role:"assistant" (from the reply) are
 *   pushed. No system/persona entry is ever created (B4 black-box constraint).
 *   activeState on each entry is muster's expected state (never the agent's).
 *
 * T015 — black-box state tracking:
 *   Expected state is derived locally from `state_shift` axes; the agent is
 *   never informed about it.
 *
 * @param runNumber - 1-indexed run counter for the RunVerdict record.
 * @param kase      - Validated A2A behavioral case.
 * @param endpoint  - Base URL of the A2A agent (resolved from env outside).
 * @param token     - Bearer token (may be null); read at call time, never stored.
 * @param resolved  - Pre-resolved thresholds (from resolveThresholds, WP02).
 * @param idSeqBase - Starting idSeq counter so multi-run calls don't collide.
 * @param sender    - sendMessage function (injectable for testing).
 */
export async function runA2aCaseOnce(
  runNumber: number,
  kase: A2aBehavioralCase,
  endpoint: string,
  token: string | null,
  resolved: ResolvedThresholds,
  idSeqBase: number,
  sender: typeof sendMessage = sendMessage
): Promise<RunVerdict> {
  const entries: TranscriptEntry[] = [];
  const records: TurnRecord[] = [];
  const started = Date.now();
  const shifts = extractStateShifts(kase.axes);

  let handle: ConversationHandle = {};
  let idSeq = idSeqBase;
  let errorMessage: string | undefined;

  for (let i = 0; i < kase.turns.length; i++) {
    const turn = kase.turns[i];
    // Expected state at this turn (black-box local — agent never sees this).
    const activeState = expectedStateAtTurn(shifts, i);

    entries.push({ role: "user", content: turn.content, activeState });

    let reply: string;
    let updatedHandle: ConversationHandle;
    try {
      const result = await sender(endpoint, turn.content, handle, { token, idSeq });
      reply = result.reply;
      updatedHandle = result.handle;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      break;
    }

    handle = updatedHandle;
    idSeq += 1;

    const wordCount = countWords(reply);
    entries.push({ role: "assistant", content: reply, activeState, wordCount });
    records.push({ turnIndex: i, reply, wordCount, activeState });
  }

  const transcript: Transcript = {
    entries,
    model: "a2a",
    baseUrl: endpoint,
    temperature: "default",
    durationMs: Date.now() - started,
  };

  if (errorMessage !== undefined) {
    return { run: runNumber, passed: false, axes: [], transcript, error: errorMessage };
  }

  const axes = gradeRun(kase, records, resolved);
  // conjunctivePassK: all axes must pass for the run to pass (FR-003).
  const passed = conjunctivePassK(axes.map((g) => g.passed));

  return { run: runNumber, passed, axes, transcript };
}

// ---------------------------------------------------------------------------
// T018 — Aggregate runs → CaseVerdict + exit classification
// ---------------------------------------------------------------------------

/**
 * Run one A2A behavioral case `kase.runs` times (sequential; no retry).
 *
 * k-of-n semantics: `passed = passCount >= kase.pass_threshold`.
 * An errored run counts as a failed run (FR-022; charter non-negotiable).
 *
 * `conjunctivePassK` is the all-must-pass aggregator for the inner
 * pass^k rule; the case-level decision uses `passCount >= pass_threshold`
 * to match the chat runner's aggregation exactly (T018).
 *
 * @param kase      - Validated A2A behavioral case.
 * @param endpoint  - Base URL of the A2A agent.
 * @param token     - Bearer token (may be null); read at call time.
 * @param resolved  - Pre-resolved per-case thresholds.
 * @param sender    - sendMessage function (injectable for testing; defaults to
 *                    the real transport).
 */
export async function runA2aCase(
  kase: A2aBehavioralCase,
  endpoint: string,
  token: string | null,
  resolved: ResolvedThresholds,
  sender: typeof sendMessage = sendMessage
): Promise<CaseVerdict> {
  const runs: RunVerdict[] = [];
  let passCount = 0;

  for (let run = 1; run <= kase.runs; run++) {
    // Each run uses a distinct idSeq block so message IDs are unique across runs.
    const idSeqBase = (run - 1) * kase.turns.length + 1;
    const verdict = await runA2aCaseOnce(run, kase, endpoint, token, resolved, idSeqBase, sender);
    runs.push(verdict);
    if (verdict.passed) passCount++;
  }

  return {
    id: kase.id,
    passed: passCount >= kase.pass_threshold,
    passCount,
    runs,
  };
}

/**
 * Exit classification result for the CLI (WP04).
 *
 * - exitCode 0: all cases passed.
 * - exitCode 1: ≥1 case failed (including cases where some runs errored).
 * - exitCode 2: every run of every case errored (all-errored sentinel).
 *
 * Citation: FR-007 (report pass/fail); WP03 T018; WP04 CLI contract.
 */
export interface BehavioralRunResult {
  verdicts: CaseVerdict[];
  /** Recommended exit code for WP04 CLI: 0 = all pass, 1 = ≥1 fail, 2 = all errored. */
  exitCode: 0 | 1 | 2;
  /** True when EVERY run of EVERY case errored (distinguishes exit 2 from exit 1). */
  allErrored: boolean;
}

/**
 * Run all behavioral cases from a manifest against the configured endpoint.
 *
 * Resolves endpoint URL and token from the environment at call time (NFR-002).
 * `resolveThresholdsFor` is injected so the caller can perform async threshold
 * resolution (from WP02 resolveThresholds) per case.
 *
 * @param manifest            - Loaded A2A behavioral manifest.
 * @param resolveThresholdsFor - Async fn: (kase) → ResolvedThresholds or throws.
 * @param sender              - sendMessage function (injectable for testing).
 */
export async function runBehavioralCases(
  manifest: A2aBehavioralManifest,
  resolveThresholdsFor: (kase: A2aBehavioralCase) => Promise<ResolvedThresholds>,
  sender: typeof sendMessage = sendMessage
): Promise<BehavioralRunResult> {
  // NFR-002: env-var values read at call time, never stored.
  const endpoint = process.env[manifest.endpoint.env] ?? "";
  const token = process.env[manifest.endpoint.token_env] ?? null;

  const verdicts: CaseVerdict[] = [];

  for (const kase of manifest.cases) {
    const resolved = await resolveThresholdsFor(kase);
    const verdict = await runA2aCase(kase, endpoint, token, resolved, sender);
    verdicts.push(verdict);
  }

  const allErrored = verdicts.length > 0 && verdicts.every((v) =>
    v.runs.length > 0 && v.runs.every((r) => r.error !== undefined)
  );

  const anyFailed = verdicts.some((v) => !v.passed);
  let exitCode: 0 | 1 | 2;
  if (allErrored) {
    exitCode = 2;
  } else if (anyFailed) {
    exitCode = 1;
  } else {
    exitCode = 0;
  }

  return { verdicts, exitCode, allErrored };
}

