/**
 * Behavioral-side types (data-model.md "Behavioral side"), spec-agnostic.
 *
 * Multi-turn turn-list→transcript execution is first-class (C-005); grading is
 * k-of-n (FR-022) over three locked axes (FR-018/019/020/021). Every grade
 * carries `measured` and `limit` so failures are always explainable (NFR-005).
 *
 * C-004 holds for this whole directory: nothing here imports a concrete
 * adapter implementation — the adapter (and its R9 ThresholdMapping) arrives
 * as a parameter at the runner/grader call sites.
 */

/** One scripted user turn of a behavioral case (C-005). */
export interface Turn {
  /** Turn lists carry user turns only; assistant turns are produced. */
  role: "user";
  content: string;
  /**
   * Runtime facts injected BEFORE this turn's evaluation moment
   * (§21.0.1; §20.3.1 OnUserMessage).
   */
  facts?: Record<string, boolean | string>;
}

/** Content assertion for the refusal axis (FR-020). */
export interface ContentAssertion {
  kind: "must_contain" | "must_not_contain";
  /** Substring (default) or regular expression source when `regex` is true. */
  pattern: string;
  /** Treat `pattern` as a RegExp. Matching is case-insensitive either way. */
  regex?: boolean;
}

/** Which graders run on which turns (discriminated union, data-model). */
export type AxisSpec =
  /** Word count of each targeted assistant reply ≤ mapped/overridden max (FR-018). */
  | { axis: "verbosity"; turns: number[] | "all" }
  /** Reply word count ≤ refusal cap, plus content assertions (FR-019/020). */
  | { axis: "refusal"; turn: number; assertions?: ContentAssertion[] }
  /**
   * After fact injection at `trigger_turn`, the adapter must report
   * `expect_state` active, and post-shift grading must use that state's
   * thresholds — an observable change (FR-021).
   */
  | { axis: "state_shift"; trigger_turn: number; expect_state: string };

/** Per-case threshold overrides — they win over the adapter mapping (FR-018/019). */
export interface CaseOverrides {
  max_words?: number;
  refusal_cap?: number;
}

/** One behavioral test case (data-model BehavioralCase). */
export interface BehavioralCase {
  id: string;
  /** Path to the soul fixture (absolute after manifest loading). */
  soul: string;
  profile?: string;
  /** Initial runtime-requested state (§20.1). */
  state?: string;
  /** Length ≥ 1; multi-turn first-class (C-005). */
  turns: Turn[];
  axes: AxisSpec[];
  /** n in k-of-n (FR-022); manifest defaulting applies before the runner sees this. */
  runs: number;
  /** k in k-of-n; an errored run counts as a failed run (FR-022). */
  pass_threshold: number;
  overrides?: CaseOverrides;
}

/** One conversation entry of a recorded run (FR-023). */
export interface TranscriptEntry {
  role: "user" | "assistant";
  content: string;
  /** Active state when this entry was produced; `""` when the soul has no states. */
  activeState: string;
  /** R9 word count — present on assistant entries. */
  wordCount?: number;
}

/** Full per-run record (FR-023): endpoint identity, temperature, timing. */
export interface Transcript {
  entries: TranscriptEntry[];
  model: string;
  baseUrl: string;
  /** `"default"` = temperature omitted from requests entirely (C-009). */
  temperature: number | "default";
  durationMs: number;
}

/** One axis measurement. NFR-005: always carries `measured` AND `limit`. */
export interface AxisGrade {
  axis: "verbosity" | "refusal" | "state_shift";
  /** 0-indexed turn the grade applies to. */
  turn: number;
  measured: number | string;
  limit: number | string;
  passed: boolean;
}

/** Verdict for a single run (1..n). Errored runs carry `error` and fail (FR-022). */
export interface RunVerdict {
  run: number;
  passed: boolean;
  axes: AxisGrade[];
  transcript: Transcript;
  error?: string;
}

/** Case verdict: `passed = passCount >= pass_threshold` (FR-022). */
export interface CaseVerdict {
  id: string;
  passed: boolean;
  passCount: number;
  runs: RunVerdict[];
}

/**
 * OpenAI-compatible endpoint coordinates. The API key VALUE is never stored —
 * `apiKeyEnv` names the environment variable read at call time (R6,
 * charter directive 5).
 *
 * `apiKeyEnv` is a plain string: callers may use any env-var name (e.g.
 * a custom CORP_API_KEY); the value is read from the environment at call
 * time inside the client. Widened from a narrow union (Note 5, NFR-005).
 */
export interface EndpointConfig {
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
}

/** A chat message in OpenAI wire vocabulary. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Minimal chat abstraction the runner depends on; `makeClient` produces the
 * fetch-backed implementation (C-006), tests script their own.
 *
 * `opts.temperature` omitted ⇒ the request body carries NO temperature key —
 * the provider default applies (C-009).
 */
export interface ChatClient {
  chat(
    messages: { role: "system" | "user" | "assistant"; content: string }[],
    opts: { temperature?: number }
  ): Promise<string>;
}
