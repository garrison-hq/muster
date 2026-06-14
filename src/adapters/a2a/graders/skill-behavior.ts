/**
 * Skill-behavior grader: k-of-n live probe for declared-skill-vs-actual-response.
 *
 * Implements T016 (probeSkill, aggregateSkillBehavior) and T017 (discrimination
 * control).
 *
 * Hard rules (FR-006, FR-010, FR-011):
 * - probeSkill calls invokeSkill `runs` times. A transport error → consistent:false
 *   (errored run = failed run, FR-010 — never skipped, never retried).
 * - The consistency check is NON-LEAKY: the request payload sent to the live agent
 *   MUST NOT contain the `expect` string (the answer-revealing phrase). This
 *   prevents the grader from "poisoning" the request with the expected answer,
 *   which would make any compliant model trivially pass (behavioral-grader-vs-
 *   real-model lesson). The check compares the response against `expect` only
 *   AFTER receiving it.
 * - aggregateSkillBehavior: passThreshold is an INTEGER count k (not a fraction).
 *   Pass iff results.filter(r => r.consistent).length >= passThreshold.
 * - conjunctivePassK is IMPORTED from src/core/behavioral/pass-k.ts and REUSED
 *   for per-run multi-check conjunction. Do NOT reimplement k-of-n.
 *
 * Discrimination control (T017, FR-011):
 * - Pointing probeSkill at the drift server (or supplying an impossible `expect`)
 *   and asserting aggregateSkillBehavior returns false proves the grader can fail.
 *   This control is documented here and exercised in tests/a2a/skill-behavior.test.ts.
 *
 * Citation: A2A spec v1.0.0 protobuf a2a.proto §8.3.1 (interface accuracy);
 * muster rubric FR-006, FR-010, FR-011.
 */

import { conjunctivePassK } from "../../../core/behavioral/pass-k.js";
import { invokeSkill } from "../transport.js";
import type { DeclaredSkill } from "../card.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The result of a single probe run against a declared skill.
 *
 * - `run`       — 1-based run index.
 * - `response`  — The raw response body string received from invokeSkill, or ""
 *                 when the run errored.
 * - `consistent`— true when the response satisfies the `expect` framing (see
 *                 probeSkill JSDoc for the non-leaky consistency check).
 * - `error`     — Populated when the run threw (transport/JSON-RPC error). An
 *                 errored run always has consistent:false (FR-010).
 */
export interface SkillProbeResult {
  run: number;
  response: string;
  consistent: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Internal: consistency check (non-leaky)
// ---------------------------------------------------------------------------

/**
 * Check whether a response body satisfies the non-leaky consistency matcher.
 *
 * NON-LEAKY CONTRACT: this check is applied ONLY to the response received from
 * the live agent. The `expect` string is NEVER included in the request sent to
 * the agent (see probeSkill — only `input` is sent). This prevents the grader
 * from revealing the "correct answer" in the request, which would allow any
 * model to trivially pass by repeating back the expect phrase.
 *
 * Consistency rule (FIX 5): if `expect` is non-empty, the response body must
 * contain `expect` as a substring. If `expect` is empty or not provided, fall
 * back to checking that the response contains `input`. This makes `expect` a
 * first-class wired assertion rather than dead-weight documentation.
 *
 * For the echo skill the manifest sets expect = input (e.g. "ping"), so:
 * - honest echo server returns the input → response.includes(expect) = true → pass
 * - drift server returns "DRIFT_RESPONSE_UNRELATED_TO_INPUT" → false → fail
 * - control remains fully discriminating (drift server never fires expect)
 *
 * @param responseBody - The raw JSON-RPC response string from invokeSkill.
 * @param input        - The message that was sent to the skill.
 * @param expect       - The required post-response matcher (non-leaky; never sent).
 *                       Fallback: if empty, use `input` as the matcher.
 */
function isResponseConsistent(responseBody: string, input: string, expect: string): boolean {
  const matcher = expect.length > 0 ? expect : input;
  return responseBody.includes(matcher);
}

// ---------------------------------------------------------------------------
// T016 — probeSkill
// ---------------------------------------------------------------------------

/**
 * Probe a declared skill `runs` times against the live A2A endpoint and grade
 * each response for consistency with the declared skill.
 *
 * NON-LEAKY DESIGN (behavioral-grader-vs-real-model lesson):
 * - The `expect` parameter describes WHAT WE CHECK AFTER receiving the response.
 * - It is NEVER included in the JSON-RPC request sent to the agent.
 * - The request only contains `skillId` and `input`.
 * - This prevents the grader from accidentally "teaching" the agent the correct
 *   answer by leaking the expect phrase into the prompt.
 *
 * Errored runs (transport/JSON-RPC errors) are recorded as consistent:false with
 * an `error` field (FR-010 — errored run = failed run, never skipped/retried).
 *
 * @param endpoint - Base URL of the A2A endpoint.
 * @param skill    - The declared skill being probed (§8.3.1).
 * @param input    - The message to send to the skill (NOT the expect phrase).
 * @param expect   - Description of the expected behavior, checked AFTER receiving
 *                   the response. NEVER sent to the agent (non-leaky).
 * @param runs     - Number of probe runs (for k-of-n aggregation).
 * @param auth     - Optional bearer token for authenticated invocations.
 */
export async function probeSkill(
  endpoint: string,
  skill: DeclaredSkill,
  input: string,
  expect: string,
  runs: number,
  auth?: string | null
): Promise<SkillProbeResult[]> {
  const results: SkillProbeResult[] = [];

  for (let i = 0; i < runs; i++) {
    let responseBody: string;
    try {
      // IMPORTANT: only `skill.id` and `input` are sent — never `expect`.
      // This is the non-leaky consistency check contract.
      responseBody = await invokeSkill(endpoint, skill.id, input, auth);
    } catch (err) {
      // FR-010: transport/JSON-RPC error = failed run, never skipped.
      results.push({
        run: i + 1,
        response: "",
        consistent: false,
        error: String(err),
      });
      continue;
    }

    // Consistency check: applied to the response, never leaks `expect` into request.
    // `expect` is documented for the probe result record only.
    const consistent = checkRunConsistency(responseBody, input, expect);

    results.push({
      run: i + 1,
      response: responseBody,
      consistent,
    });
  }

  return results;
}

/**
 * Per-run consistency conjunction: uses conjunctivePassK for multi-check runs.
 *
 * Each run has a single consistency check (response satisfies the expect matcher).
 * conjunctivePassK is called with the per-run check flags to allow future
 * multi-check extension without changing the aggregation logic.
 *
 * `expect` is the (non-leaky) consistency matcher — checked against the response
 * AFTER receiving it, never sent to the agent in the request. If `expect` is empty,
 * falls back to checking that the response contains `input` (FIX 5).
 *
 * @param responseBody - Raw response string from invokeSkill.
 * @param input        - The sent message (non-leaky fallback matcher).
 * @param expect       - The required post-response matcher (non-leaky; never sent to agent).
 */
function checkRunConsistency(
  responseBody: string,
  input: string,
  expect: string
): boolean {
  // Per-run checks: each flag is one sub-check. conjunctivePassK returns true
  // iff ALL sub-checks pass (pass^k conjunction per run).
  const perRunChecks: boolean[] = [
    isResponseConsistent(responseBody, input, expect),
  ];
  return conjunctivePassK(perRunChecks);
}

// ---------------------------------------------------------------------------
// T016 — aggregateSkillBehavior
// ---------------------------------------------------------------------------

/**
 * Aggregate skill probe results using k-of-n semantics.
 *
 * **passThreshold is an INTEGER COUNT k (not a fraction).**
 * Returns true iff at least `passThreshold` runs have consistent:true.
 *
 * Example: runs=5, passThreshold=4 → pass iff 4 or more runs are consistent.
 *
 * This is the outer k-of-n aggregation. The inner per-run conjunction is
 * handled by conjunctivePassK inside probeSkill → checkRunConsistency.
 *
 * Discrimination control (T017, FR-011):
 * Pointing probeSkill at the drift server returns DRIFT_RESPONSE_UNRELATED_TO_INPUT
 * for every run, so isResponseConsistent returns false for all runs, making
 * results.filter(r => r.consistent).length = 0, which is < any passThreshold > 0.
 * This proves the grader can fail — it is NOT possible to pass with a rigged-impossible
 * control.
 *
 * @param results       - Array of SkillProbeResult from probeSkill.
 * @param passThreshold - INTEGER minimum number of consistent runs required to pass.
 */
export function aggregateSkillBehavior(
  results: SkillProbeResult[],
  passThreshold: number
): boolean {
  const passCount = results.filter((r) => r.consistent).length;
  return passCount >= passThreshold;
}
