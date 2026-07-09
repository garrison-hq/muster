/**
 * judge.ts — FR-011 blinded LLM-judge grader for `expected.kind: "judge"`
 * probes (mission-review remediation M-1: wires `blindArmOrder` into a REAL
 * grading path — previously shipped and unit-tested but never called).
 *
 * The SAME judge grades every condition arm's response to the SAME probe
 * sample in ONE call, with arm identity/order blinded via `blindArmOrder`
 * (rubric.ts §5.2): the judge prompt never contains "with-memory",
 * "no-memory", "scrambled-memory", or any other arm identifier — only
 * anonymous, per-call-randomized labels ("Answer A", "Answer B", …).
 * Grading every arm with the SAME judge in the SAME call is what makes
 * verbosity/self-enhancement/miscalibration bias common-mode and cancel in
 * the paired delta (rubric §5.1); only position/order bias survives blinding
 * alone, and `blindArmOrder`'s per-probe-per-sample deterministic
 * permutation spreads that across probes rather than attaching it to one arm
 * (§5.2).
 *
 * FR-009: an errored judge call, or a judge reply that never mentions a
 * given label, grades that arm FAILED — never skipped, never retried, never
 * silently defaulted to a pass.
 *
 * C-001 (adapter-only knowledge): imports only the generic `ChatClient` from
 * `core/behavioral/types.ts` and `blindArmOrder`/`ArmPayload` from
 * `rubric.ts` (rubric.ts is deliberately standalone — WP03/this module
 * imports FROM it, never the reverse).
 * NFR-001: no `Math.random()`/`Date.now()` here — `blindArmOrder`'s
 * permutation is the only source of ordering, and it is a pure function of
 * the caller-supplied `seed`.
 */

import type { ChatClient } from "../../core/behavioral/types.js";
import { blindArmOrder, type ArmPayload } from "./rubric.js";

/** One arm's raw (unblinded) response text, tagged with its real arm id. */
export interface ArmResponse {
  readonly armId: string;
  readonly response: string;
}

/** The judge's PASS/FAIL verdict for one arm, unblinded back via `blindArmOrder`'s `order`. */
export interface JudgeVerdict {
  readonly armId: string;
  readonly passed: boolean;
}

/** `"Answer A: PASS"`, `"Answer B - FAIL"`, etc. — colon/dash separator, case-insensitive verdict token. */
const VERDICT_LINE_RE = /Answer\s+([A-Za-z0-9]+)\s*[:\-]?\s*(PASS|FAIL)\b/gi;

interface JudgePromptParts {
  readonly system: string;
  readonly user: string;
}

/**
 * Build the blinded judge prompt. Deliberately generic: the system prompt
 * never references "memory", "arm", or any of this adapter's condition-arm
 * vocabulary, so there is nothing for the judge to infer arm identity from
 * beyond the (blinded, randomized) labels themselves.
 */
function buildJudgePrompt(
  criterion: string,
  presentation: readonly { readonly blindLabel: string; readonly content: string }[]
): JudgePromptParts {
  const system =
    "You are an impartial grading judge. You will be shown several candidate responses to the same " +
    "question, each under an anonymous label. Judge EACH response independently against the stated " +
    "criterion — do not compare the responses to each other, and do not assume any relationship " +
    "between them.";
  const blocks = presentation.map((entry) => `${entry.blindLabel}:\n${entry.content}`).join("\n\n");
  const labels = presentation.map((entry) => entry.blindLabel).join(", ");
  const user =
    `Criterion: ${criterion}\n\n${blocks}\n\n` +
    `For each of ${labels}, does the response satisfy the criterion? Reply with exactly one line per ` +
    'label, in the exact form "<Label>: PASS" or "<Label>: FAIL" (e.g. "Answer A: PASS").';
  return { system, user };
}

/**
 * Parse per-label PASS/FAIL verdicts out of the judge's free-text reply. A
 * label never mentioned is absent (defaults to FAIL at the call site —
 * FR-009). Label matching is case-insensitive (an LLM judge is not
 * guaranteed to echo "Answer A"'s exact casing back verbatim) but always
 * resolves to the canonical `labels` entry, so downstream lookups by the
 * original label string always hit.
 */
function parseVerdicts(response: string, labels: readonly string[]): ReadonlyMap<string, boolean> {
  const canonicalByLower = new Map(labels.map((label) => [label.toLowerCase(), label]));
  const verdicts = new Map<string, boolean>();
  for (const match of response.matchAll(VERDICT_LINE_RE)) {
    const canonical = canonicalByLower.get(`answer ${match[1]}`.toLowerCase());
    if (canonical !== undefined) {
      verdicts.set(canonical, match[2]!.toUpperCase() === "PASS");
    }
  }
  return verdicts;
}

/**
 * Grade every supplied arm's response to one probe sample in a SINGLE
 * blinded judge call (FR-011). `seed` must be a deterministic, caller-chosen
 * key (e.g. `` `${probeId}:${sampleIndex}` `` — never wall-clock time,
 * NFR-001); the same `(arms, seed)` always yields the same presentation
 * order.
 *
 * Returns `[]` when `arms` is empty (nothing to grade — no judge call made).
 * A judge call that throws, or a reply that never mentions a given label,
 * grades that arm's verdict FAILED (FR-009: an errored/unparseable run
 * counts as failed, never skipped, never silently passed).
 */
export async function gradeArmsWithJudge(
  client: ChatClient,
  criterion: string,
  arms: readonly ArmResponse[],
  seed: string
): Promise<JudgeVerdict[]> {
  if (arms.length === 0) return [];

  const payloads: ArmPayload<string>[] = arms.map((arm) => ({ armId: arm.armId, content: arm.response }));
  const { presentation, order } = blindArmOrder(payloads, seed);
  const { system, user } = buildJudgePrompt(criterion, presentation);
  const labels = presentation.map((entry) => entry.blindLabel);

  let verdictsByLabel: ReadonlyMap<string, boolean>;
  try {
    const response = await client.chat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {}
    );
    verdictsByLabel = parseVerdicts(response, labels);
  } catch {
    // FR-009: an errored judge call counts as a failed grade for every arm
    // in this call — never skipped, never retried.
    verdictsByLabel = new Map();
  }

  return order.map((originalIndex, position) => ({
    armId: arms[originalIndex]!.armId,
    passed: verdictsByLabel.get(labels[position]!) === true,
  }));
}
