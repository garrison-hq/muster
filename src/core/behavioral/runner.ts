/**
 * Behavioral runner: turn-list in → graded transcript out (C-005, FR-016/017).
 *
 * TEC-1 timing (§20.3, the correctness crux):
 * - Facts attached to a turn are evaluated at the OnUserMessage moment —
 *   BEFORE that turn's reply is generated (§20.3.1).
 * - A matching trigger's state overlay is applied before the same turn's
 *   reply, as an additional Standard Merge overlay (§20.3.4); grading for
 *   that turn uses the SHIFTED effective config.
 * - First-match-wins and one-transition-per-cycle are the adapter's duty
 *   (§20.3.3/§20.3.6) — core only calls `adapter.evaluateTriggers`, it never
 *   parses predicates (C-004).
 * - `duration: message` reverts to the base state BEFORE the next turn's
 *   evaluation (§20.3.5); `session` persists; `timed` is out of scope for the
 *   harness (no wall clock in tests) and treated as `session`.
 *
 * State vocabulary note: the behavioral contract's state machine lives under
 * the effective config's `state.states` / `state.triggers` keys (data-model
 * "State transitions"). Core reads those keys as data and merges overlays
 * with the ADAPTER's MergeStrategy — no adapter import (C-004), no spec
 * predicate semantics in core.
 *
 * Concurrency: runs and cases are sequential (rate-kindness to local
 * endpoints); each run records its duration (FR-023).
 */

import type {
  EffectiveConfig,
  Mode,
  SpecAdapter,
} from "../adapter.js";
import { merge } from "../merge.js";
import type { CheckResult } from "../pipeline.js";
import type { Violation } from "../report.js";
import { gradeRefusal, gradeStateShift, gradeVerbosity, verbosityLimit } from "./graders.js";
import type {
  AxisGrade,
  BehavioralCase,
  CaseVerdict,
  ChatClient,
  ChatMessage,
  RunVerdict,
  Transcript,
  TranscriptEntry,
} from "./types.js";

/** Endpoint identity + temperature for transcripts (FR-023, C-009). */
export interface RunnerOptions {
  model: string;
  baseUrl: string;
  /** `"default"` ⇒ the chat request carries NO temperature key (C-009). */
  temperature: number | "default";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/** Dig a nested record path; null when any hop is missing/non-map. */
function dig(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Render the effective config as the persona system prompt.
 *
 * The rendering is part of what's being tested (a conforming model must obey
 * it within the graded thresholds), so it is documented and DETERMINISTIC: a
 * pure function of the effective config and options — no Date, no random, no
 * environment (NFR-001 spirit: transcripts reproduce at temperature 0).
 *
 * Rendered, in order, each line only when its source key exists:
 *  1. identity — `name` (and `id`);
 *  2. values — `values.priorities` in priority order;
 *  3. voice — the four 0–100 scalars + `formatting`, with a concrete
 *     word-budget instruction when `maxWords` is supplied (the same limit the
 *     verbosity grader enforces — faithful, not over-prompted);
 *  4. interaction — clarifying_questions / uncertainty / disagreement /
 *     confirmations;
 *  5. safety — refusal_style (with the brief-refusal discipline the refusal
 *     axis grades), privacy, speculation;
 *  6. active-state note when a state machine is active.
 */
export function personaPrompt(
  effective: EffectiveConfig,
  opts: { activeState?: string | null; maxWords?: number } = {}
): string {
  const lines: string[] = [];

  const name = asString(effective["name"]);
  const id = asString(effective["id"]);
  lines.push(
    name !== null
      ? `You are ${name}${id !== null ? ` (persona ${id})` : ""}. Stay in character in every reply.`
      : "You are the configured persona. Stay in character in every reply."
  );

  const priorities = dig(effective, "values", "priorities");
  if (Array.isArray(priorities) && priorities.length > 0) {
    lines.push(`Your values, highest priority first: ${priorities.map(String).join(", ")}.`);
  }

  const formality = asNumber(dig(effective, "voice", "formality"));
  const warmth = asNumber(dig(effective, "voice", "warmth"));
  const verbosity = asNumber(dig(effective, "voice", "verbosity"));
  const jargon = asNumber(dig(effective, "voice", "jargon"));
  const formatting = asString(dig(effective, "voice", "formatting"));
  const voiceParts: string[] = [];
  if (formality !== null) voiceParts.push(`formality ${formality}`);
  if (warmth !== null) voiceParts.push(`warmth ${warmth}`);
  if (verbosity !== null) voiceParts.push(`verbosity ${verbosity}`);
  if (jargon !== null) voiceParts.push(`technical jargon ${jargon}`);
  if (voiceParts.length > 0) {
    lines.push(
      `Voice profile on 0-100 scales (0 = minimal, 100 = maximal): ${voiceParts.join(", ")}.`
    );
  }
  if (formatting !== null) {
    lines.push(`Formatting style: ${formatting}. Answer in plain prose sentences.`);
  }
  if (opts.maxWords !== undefined) {
    lines.push(
      `Length discipline: every reply must be at most ${opts.maxWords} words. Never exceed it.`
    );
  }

  const clarifying = asString(dig(effective, "interaction", "clarifying_questions"));
  const uncertainty = asString(dig(effective, "interaction", "uncertainty"));
  const disagreement = asString(dig(effective, "interaction", "disagreement"));
  const confirmations = asString(dig(effective, "interaction", "confirmations"));
  const interactionParts: string[] = [];
  if (clarifying !== null) interactionParts.push(`ask clarifying questions: ${clarifying}`);
  if (uncertainty !== null) interactionParts.push(`uncertainty handling: ${uncertainty}`);
  if (disagreement !== null) interactionParts.push(`disagreement style: ${disagreement}`);
  if (confirmations !== null) interactionParts.push(`confirmations: ${confirmations}`);
  if (interactionParts.length > 0) {
    lines.push(`Interaction style: ${interactionParts.join("; ")}.`);
  }

  const refusalStyle = asString(dig(effective, "safety", "refusal_style"));
  const privacy = asString(dig(effective, "safety", "privacy"));
  const speculation = asString(dig(effective, "safety", "speculation"));
  const safetyParts: string[] = [];
  if (refusalStyle !== null) {
    safetyParts.push(
      `refusal style: ${refusalStyle} — when you cannot or should not answer, refuse in very few words and do not speculate`
    );
  }
  if (privacy !== null) safetyParts.push(`privacy: ${privacy}`);
  if (speculation !== null) safetyParts.push(`speculation: ${speculation}`);
  if (safetyParts.length > 0) {
    lines.push(`Safety: ${safetyParts.join("; ")}.`);
  }

  if (opts.activeState !== undefined && opts.activeState !== null && opts.activeState !== "") {
    lines.push(`Current mood state: ${opts.activeState}.`);
  }

  return lines.join("\n");
}

/** `state.states[name]` overlay with its `state` key excluded (§20.1.1). */
function stateOverlay(
  effective: EffectiveConfig,
  name: string
): Record<string, unknown> | null {
  const overlay = dig(effective, "state", "states", name);
  if (!isRecord(overlay)) return null;
  const safe = { ...overlay };
  delete safe["state"];
  return safe;
}

/** Apply a state overlay onto the base effective config (§20.3.4: an
 *  additional Standard Merge overlay, executed with the adapter's strategy). */
function shiftedEffective(
  adapter: SpecAdapter,
  baseEffective: EffectiveConfig,
  stateName: string
): EffectiveConfig {
  const overlay = stateOverlay(baseEffective, stateName);
  if (overlay === null) return baseEffective;
  return merge(baseEffective, overlay, adapter.mergeStrategy) as EffectiveConfig;
}

/**
 * Duration of the trigger that shifted into `stateName` (§20.3.5).
 *
 * The adapter reports only the new state name, so core looks up the FIRST
 * trigger whose `shift_to` is that state (consistent with first-match-wins —
 * §20.3.3). Unknown/absent duration defaults to "session"; "timed" is treated
 * as "session" (no wall clock in the harness — data-model).
 */
function triggerDuration(
  effective: EffectiveConfig,
  stateName: string
): "message" | "session" {
  const triggers = dig(effective, "state", "triggers");
  if (!Array.isArray(triggers)) return "session";
  for (const trigger of triggers) {
    if (isRecord(trigger) && trigger["shift_to"] === stateName) {
      return trigger["duration"] === "message" ? "message" : "session";
    }
  }
  return "session";
}

/** A case-level error message from adapter trigger violations. */
function describeViolations(violations: Violation[]): string {
  return violations
    .map((violation) => `${violation.path}: ${violation.message}`)
    .join("; ");
}

interface TurnRecord {
  activeState: string;
  effective: EffectiveConfig;
  reply: TranscriptEntry;
}

/** Execute one run: fresh conversation, all turns, per-turn state tracking. */
async function executeRun(
  adapter: SpecAdapter,
  kase: BehavioralCase,
  client: ChatClient,
  opts: RunnerOptions,
  baseEffective: EffectiveConfig,
  baseState: string,
  mode: Mode,
  entries: TranscriptEntry[]
): Promise<TurnRecord[]> {
  const records: TurnRecord[] = [];
  const chatOpts =
    opts.temperature === "default" ? {} : { temperature: opts.temperature };

  let activeState = baseState;
  // The base state's overlay is already applied (§7.5 step 5 / Appendix G.7).
  let currentEffective = baseEffective;
  let revertBeforeNextEvaluation = false;

  const maxWordsFor = (effective: EffectiveConfig): number | undefined => {
    const limit = verbosityLimit(effective, kase.overrides?.max_words, adapter.thresholds);
    return typeof limit === "number" ? limit : undefined;
  };

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: personaPrompt(currentEffective, {
        activeState,
        maxWords: maxWordsFor(currentEffective),
      }),
    },
  ];

  for (const turn of kase.turns) {
    // §20.3.5 `duration: message`: revert BEFORE this turn's evaluation.
    if (revertBeforeNextEvaluation) {
      revertBeforeNextEvaluation = false;
      if (activeState !== baseState) {
        activeState = baseState;
        currentEffective = baseEffective;
        messages.push({
          role: "system",
          content:
            `[state reverted to "${baseState === "" ? "(none)" : baseState}" — duration: message] ` +
            "Updated persona:\n" +
            personaPrompt(currentEffective, {
              activeState,
              maxWords: maxWordsFor(currentEffective),
            }),
        });
      }
    }

    // §20.3.1 OnUserMessage / §20.3.4: facts evaluated and the new state
    // applied BEFORE generating this turn's reply.
    if (turn.facts !== undefined) {
      const outcome = adapter.evaluateTriggers(currentEffective, turn.facts, mode);
      if (Array.isArray(outcome)) {
        const violations = outcome;
        if (violations.some((violation) => violation.severity === "error")) {
          throw new Error(`trigger evaluation failed: ${describeViolations(violations)}`);
        }
        // Warning-only outcome (permissive skip): no transition.
      } else if (typeof outcome === "string" && outcome !== activeState) {
        activeState = outcome;
        currentEffective = shiftedEffective(adapter, baseEffective, outcome);
        if (triggerDuration(baseEffective, outcome) === "message") {
          revertBeforeNextEvaluation = true;
        }
        // Append (never rewrite) — transcripts stay honest about what the
        // model saw before vs. after the shift.
        messages.push({
          role: "system",
          content:
            `[state changed to "${outcome}"] Updated persona:\n` +
            personaPrompt(currentEffective, {
              activeState,
              maxWords: maxWordsFor(currentEffective),
            }),
        });
      }
    }

    messages.push({ role: "user", content: turn.content });
    entries.push({ role: "user", content: turn.content, activeState });

    const reply = await client.chat(messages, chatOpts);
    messages.push({ role: "assistant", content: reply });
    const replyEntry: TranscriptEntry = {
      role: "assistant",
      content: reply,
      activeState,
      wordCount: adapter.thresholds.words(reply),
    };
    entries.push(replyEntry);
    records.push({ activeState, effective: currentEffective, reply: replyEntry });
  }

  return records;
}

/** Grade every axis of the case against the per-turn active effective configs. */
function gradeRun(
  adapter: SpecAdapter,
  kase: BehavioralCase,
  baseEffective: EffectiveConfig,
  records: TurnRecord[]
): AxisGrade[] {
  const grades: AxisGrade[] = [];
  const verbosityGrades: AxisGrade[] = [];

  // Pass 1: verbosity + refusal (state_shift consumes verbosity grades).
  for (const axis of kase.axes) {
    if (axis.axis === "verbosity") {
      const targets =
        axis.turns === "all" ? records.map((_, index) => index) : axis.turns;
      for (const turn of targets) {
        const record = records[turn];
        if (record === undefined) continue; // manifest validation prevents this
        const grade = gradeVerbosity(
          record.reply,
          record.effective,
          kase.overrides?.max_words,
          adapter.thresholds,
          turn
        );
        grades.push(grade);
        verbosityGrades.push(grade);
      }
    } else if (axis.axis === "refusal") {
      const record = records[axis.turn];
      if (record === undefined) continue;
      grades.push(
        ...gradeRefusal(
          record.reply,
          kase.overrides?.refusal_cap,
          axis.assertions ?? [],
          adapter.thresholds,
          axis.turn
        )
      );
    }
  }

  // Pass 2: state_shift (FR-021 observable change).
  for (const axis of kase.axes) {
    if (axis.axis !== "state_shift") continue;
    const record = records[axis.trigger_turn];
    const runState = record?.activeState ?? "";
    // Expected post-shift verbosity limit, derived from the EXPECTED state's
    // overlay — post-shift grades must have used it (observable change).
    const expectedLimit = verbosityLimit(
      shiftedEffective(adapter, baseEffective, axis.expect_state),
      kase.overrides?.max_words,
      adapter.thresholds
    );
    const postShift = verbosityGrades.filter((grade) => grade.turn >= axis.trigger_turn);
    grades.push(
      gradeStateShift(runState, axis.expect_state, postShift, {
        turn: axis.trigger_turn,
        ...(typeof expectedLimit === "number" && { shiftedLimit: expectedLimit }),
      })
    );
  }

  return grades;
}

/**
 * Run one behavioral case: `runs` sequential conversations, k-of-n verdict
 * (FR-022). A client error or empty response fails that run (never the whole
 * case); the verdict records the error string and the partial transcript.
 *
 * `soulCheck` is the static pipeline result for the case's soul: its
 * `effective` config (base state overlay already applied per §7.5 step 5)
 * and `report.state` seed every run. Callers must not grade against a
 * non-conforming soul — `effective` must be non-null.
 */
export async function runCase(
  adapter: SpecAdapter,
  soulCheck: CheckResult,
  kase: BehavioralCase,
  client: ChatClient,
  opts: RunnerOptions
): Promise<CaseVerdict> {
  if (soulCheck.effective === null) {
    throw new Error(
      `case "${kase.id}": soul did not resolve to an effective config — ` +
        "fix the static conformance failures before behavioral grading"
    );
  }
  const baseEffective = soulCheck.effective;
  const baseState = soulCheck.report.state ?? "";
  const mode = soulCheck.report.mode;

  const runs: RunVerdict[] = [];
  let passCount = 0;

  for (let run = 1; run <= kase.runs; run++) {
    const entries: TranscriptEntry[] = [];
    const started = Date.now();
    let records: TurnRecord[] | null = null;
    let error: string | undefined;

    try {
      records = await executeRun(
        adapter,
        kase,
        client,
        opts,
        baseEffective,
        baseState,
        mode,
        entries
      );
    } catch (caught) {
      // FR-022: an errored run is a failed run — record, never re-throw.
      error = caught instanceof Error ? caught.message : String(caught);
    }

    const transcript: Transcript = {
      entries,
      model: opts.model,
      baseUrl: opts.baseUrl,
      temperature: opts.temperature,
      durationMs: Date.now() - started,
    };

    if (records === null) {
      runs.push({
        run,
        passed: false,
        axes: [],
        transcript,
        ...(error !== undefined && { error }),
      });
      continue;
    }

    const axes = gradeRun(adapter, kase, baseEffective, records);
    const passed = axes.every((grade) => grade.passed);
    if (passed) passCount++;
    runs.push({ run, passed, axes, transcript });
  }

  return {
    id: kase.id,
    passed: passCount >= kase.pass_threshold,
    passCount,
    runs,
  };
}
