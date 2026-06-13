/**
 * Memory adapter: RecallProbeRunner
 *
 * FR-005: behavioral k-of-n recall grading.
 * FR-008: errored run counts as failed run — never retried or skipped.
 * FR-009: every grader ships a rigged-impossible discrimination control.
 * C-001: adapter boundary — wraps src/core/behavioral/runner.ts, no reimplementation.
 * C-002: every RecallVerdict carries a normative rubricCitation.
 * NFR-005: no provider SDKs; endpoint config via EndpointConfig argument only.
 */

import { readFileSync } from "node:fs";
import { FactParser } from "./lint.js";
import { makeClient } from "../../core/behavioral/client.js";
import type { ChatClient, EndpointConfig } from "../../core/behavioral/types.js";

// Re-export EndpointConfig for callers (no redefinition).
export type { EndpointConfig } from "../../core/behavioral/types.js";

// ---------------------------------------------------------------------------
// C-002: normative rubric citation used in every RecallVerdict.
// ---------------------------------------------------------------------------
export const RECALL_RUBRIC_CITATION =
  "muster memory-adapter rubric §recall-probe — https://github.com/garrison-hq/muster/blob/main/BRIEF.md#recall-probe";

// ---------------------------------------------------------------------------
// ConversationScenario: a scripted multi-turn scenario for recall probing.
// ---------------------------------------------------------------------------
export interface ConversationTurn {
  role: "user";
  content: string;
}

export interface ConversationScenario {
  turns: ConversationTurn[];
}

// ---------------------------------------------------------------------------
// RecallProbe: input configuration for one recall probe run.
// ---------------------------------------------------------------------------
export interface RecallProbe {
  id: string;
  description: string;
  requiredFactId: string;
  memoryPath: string;
  userPath: string;
  manifestPath: string;
  scenario: ConversationScenario;
  runsN: number;
  passThresholdK: number;
  rubricCitation: string;
}

// ---------------------------------------------------------------------------
// RecallVerdict: output from one recall probe run.
// ---------------------------------------------------------------------------
export interface RecallVerdict {
  probeId: string;
  pass: boolean;
  passCount: number;
  totalRuns: number;
  rubricCitation: string;
}

// ---------------------------------------------------------------------------
// RecallGrader: checks if required fact text appears in a response.
// ---------------------------------------------------------------------------
export class RecallGrader {
  /**
   * Grade whether the required fact text appears (verbatim substring) in the
   * model's response. C-002: returns rubricCitation in verdict.
   */
  grade(response: string, requiredFactText: string, rubricCitation: string): { pass: boolean; rubricCitation: string } {
    const normalizedResponse = response.toLowerCase();
    const normalizedFact = requiredFactText.toLowerCase();
    const pass = normalizedFact.length > 0 && normalizedResponse.includes(normalizedFact);
    return { pass, rubricCitation };
  }
}

// ---------------------------------------------------------------------------
// RecallProbeRunner: k-of-n behavioral recall grading (FR-005).
// ---------------------------------------------------------------------------
export class RecallProbeRunner {
  private readonly grader = new RecallGrader();

  /**
   * Run a recall probe: load memory facts, inject them into the scenario,
   * execute N runs via the behavioral client, and aggregate k-of-n.
   *
   * FR-008: errored run counts as failed run — totalRuns always equals runsN.
   * NFR-005: no provider SDK; endpoint config from argument only.
   */
  async run(probe: RecallProbe, endpoint: EndpointConfig): Promise<RecallVerdict>;
  /**
   * Overload for tests: accepts a pre-built ChatClient instead of an
   * EndpointConfig, so tests can inject a mock without touching the network.
   */
  async run(probe: RecallProbe, endpointOrClient: EndpointConfig | ChatClient): Promise<RecallVerdict> {
    const rubricCitation = probe.rubricCitation || RECALL_RUBRIC_CITATION;

    // Resolve the required fact from memory files.
    const parser = new FactParser();
    const manifest = JSON.parse(readFileSync(probe.manifestPath, "utf8")) as { labels: Record<string, { private: boolean; timeSensitive: boolean }> };
    const memoryFacts = parser.parse(probe.memoryPath, manifest);
    const userFacts = parser.parse(probe.userPath, manifest);
    const allFacts = [...memoryFacts, ...userFacts];

    const requiredFact = allFacts.find((f) => f.id === probe.requiredFactId);
    const requiredFactText = requiredFact?.text ?? "";

    // Inject memory context into the first user turn as a [MEMORY] prefix block.
    const memoryPrefix = requiredFactText ? `[MEMORY]\n${requiredFactText}\n\n` : "";
    const augmentedTurns = probe.scenario.turns.map((turn, index) => {
      if (index === 0 && memoryPrefix) {
        return { ...turn, content: memoryPrefix + turn.content };
      }
      return turn;
    });

    // Build the ChatClient — either use the provided one or create from endpoint.
    let client: ChatClient;
    if (typeof (endpointOrClient as ChatClient).chat === "function") {
      client = endpointOrClient as ChatClient;
    } else {
      client = makeClient(endpointOrClient as EndpointConfig);
    }

    // k-of-n loop (FR-005, FR-008).
    let passCount = 0;

    for (let i = 0; i < probe.runsN; i++) {
      try {
        // Build message list for this run.
        const messages: { role: "system" | "user" | "assistant"; content: string }[] = [];

        for (const turn of augmentedTurns) {
          messages.push({ role: "user", content: turn.content });
          const response = await client.chat(messages, {});
          messages.push({ role: "assistant", content: response });

          // Grade the last assistant turn for recall of required fact.
          const gradeResult = this.grader.grade(response, requiredFactText, rubricCitation);
          if (gradeResult.pass) {
            passCount++;
            break; // Fact recalled — this run passes.
          }
        }
      } catch {
        // FR-008: errored run counts as failed run — do not retry or skip.
        // passCount is not incremented; totalRuns will equal runsN.
      }
    }

    return {
      probeId: probe.id,
      pass: passCount >= probe.passThresholdK,
      passCount,
      totalRuns: probe.runsN,
      rubricCitation,
    };
  }
}
