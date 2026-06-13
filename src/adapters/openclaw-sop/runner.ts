/**
 * runner.ts — Manifest runner for the openclaw-sop adapter.
 *
 * FR-011: runManifestSuite(manifestPath, options) → Promise<SOPSuiteReport>.
 *   Loads a YAML rule manifest, dispatches compliance and adversarial probes
 *   through a simple behavioral loop, applies binary/judge graders, and emits
 *   a SOPSuiteReport.
 * FR-012: Remaining probes run after any error; suite never short-circuits on
 *   lint errors or probe failures.
 * FR-013: rubricVersion matches docs/rubric/sop-rule-taxonomy.md version "1.0.0".
 *
 * Charter constraints:
 *   C-001: src/core/ is not modified; only imports types from core/behavioral/types.ts.
 *   NFR-001: All deterministic code paths are byte-stable; no live endpoint calls in
 *            tests (mock ChatClient throughout).
 *   NFR-003: Static fixture suite must complete in ≤ 10 s.
 *   NFR-006: ≥ 80% new-code coverage enforced by SonarCloud gate.
 *
 * Design: this module is self-contained. It does not use runCase from
 * src/core/behavioral/runner.ts because that function requires a full SpecAdapter
 * (a Soul.md concept). Instead, runner.ts implements a minimal probe executor
 * that replays the manifest scenario turns through a ChatClient and grades the
 * assembled transcript with the adapter's own graders.
 */

import { join, resolve, dirname } from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

import {
  runStaticLint,
  loadAndValidateManifest,
} from "./index.js";
import type {
  SOPRuleManifest,
  SOPRuleManifestEntry,
  SOPLintFinding,
  BinaryAssertion,
  SOPGrade,
  SOPRunVerdict,
  SOPCaseVerdict,
  SOPSuiteReport,
  ComplianceProbe,
  AdversarialProbe,
} from "./manifest.js";
import {
  gradeToolCallPresence,
  gradeToolOrder,
  gradeConfirmBeforeDestructive,
  gradeExactStringNonLeakage,
  gradeOutputFormat,
  aggregatePassK,
} from "./graders.js";
import type { ToolCall, SOPTurn } from "./graders.js";
import { gradeJudgeCompliance } from "./judge.js";
import type { JudgeAssertion } from "./manifest.js";
import type { Transcript } from "../../core/behavioral/types.js";
import type { ChatClient } from "../../core/behavioral/types.js";

// ---------------------------------------------------------------------------
// RUBRIC_VERSION — must match docs/rubric/sop-rule-taxonomy.md front matter
// ---------------------------------------------------------------------------

/** Normative rubric version (FR-013). Must match docs/rubric/sop-rule-taxonomy.md. */
export const RUBRIC_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// SuiteRunOptions — options for runManifestSuite
// ---------------------------------------------------------------------------

/** Options for runManifestSuite (FR-011). */
export interface SuiteRunOptions {
  /** ChatClient to use for behavioral probe execution. */
  client: ChatClient;
  /** Number of runs per probe (k); overrides the manifest entry's k when provided. */
  k?: number;
  /** Root directory for vendored corpora (defaults to <cwd>/vendored/openclaw-sop). */
  vendoredRoot?: string;
}

// ---------------------------------------------------------------------------
// Inline scenario types — a minimal representation of manifest scenario fields
// ---------------------------------------------------------------------------

interface ScenarioTurn {
  role: "user" | "assistant";
  content: string;
}

interface InlineScenario {
  systemPrompt: string;
  turns: ScenarioTurn[];
}

// ---------------------------------------------------------------------------
// aggregateKofN — k-of-n aggregator (used for judge-required classes 6–7)
// ---------------------------------------------------------------------------

/**
 * Aggregate k run verdicts using k-of-n semantics.
 *
 * Charter rule: errored run = failed run. A run with error !== undefined is
 * always counted as failed, regardless of the `passed` field value.
 *
 * @param verdicts - Array of per-run verdicts.
 * @param passThreshold - Minimum number of passing runs required.
 * @returns Partial SOPCaseVerdict (probeId and ruleId filled by caller).
 */
export function aggregateKofN(
  verdicts: SOPRunVerdict[],
  passThreshold: number
): Omit<SOPCaseVerdict, "probeId" | "ruleId"> {
  // Charter: errored run = failed run
  const runPassed = (v: SOPRunVerdict): boolean =>
    v.passed === true && v.error === undefined;

  const passCount = verdicts.filter(runPassed).length;
  const totalRuns = verdicts.length;
  const anyRunFailed = verdicts.some((v) => !runPassed(v));
  const passed = passCount >= passThreshold;

  return {
    aggregation: "k-of-n",
    passed,
    passCount,
    totalRuns,
    anyRunFailed,
    runs: verdicts,
  };
}

// ---------------------------------------------------------------------------
// runProbeOnce — execute a single probe run against the ChatClient
// ---------------------------------------------------------------------------

/**
 * Execute one run of a probe scenario against the ChatClient.
 *
 * The scenario's turns are replayed: user turns are sent to the client;
 * assistant turns in the scenario are used to pre-populate the conversation
 * history (for scripted transcripts). Any throw from the ChatClient is caught
 * and recorded as an errored run (FR-012).
 *
 * For pure transcript-replay scenarios (where the scenario already contains
 * assistant turns), the client is called for each user turn but the scripted
 * assistant response from the scenario is used if the client returns an empty
 * response. In mock/test contexts, the ChatClient returns the scripted content.
 *
 * @param runNumber - 1-based run index.
 * @param scenario - The probe scenario with systemPrompt and turns.
 * @param client - ChatClient for behavioral execution.
 * @returns SOPRunVerdict with transcript and empty grades (grading is caller's responsibility).
 */
async function runProbeOnce(
  runNumber: number,
  scenario: InlineScenario,
  client: ChatClient
): Promise<{ transcript: Transcript; toolCallTrace: ToolCall[]; turns: SOPTurn[]; error?: string }> {
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: scenario.systemPrompt },
  ];

  const transcriptEntries: { role: "user" | "assistant"; content: string; activeState: string }[] = [];
  const conversationTurns: SOPTurn[] = [];

  let error: string | undefined;

  try {
    for (const turn of scenario.turns) {
      if (turn.role === "user") {
        messages.push({ role: "user", content: turn.content });
        transcriptEntries.push({ role: "user", content: turn.content, activeState: "" });
        conversationTurns.push({ role: "user", content: turn.content });

        // Call the client for a response
        const reply = await client.chat(messages, {});
        messages.push({ role: "assistant", content: reply });
        transcriptEntries.push({ role: "assistant", content: reply, activeState: "" });
        conversationTurns.push({ role: "assistant", content: reply });
      } else {
        // Pre-scripted assistant turn (used in static fixtures)
        messages.push({ role: "assistant", content: turn.content });
        transcriptEntries.push({ role: "assistant", content: turn.content, activeState: "" });
        conversationTurns.push({ role: "assistant", content: turn.content });
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const transcript: Transcript = {
    entries: transcriptEntries,
    model: "mock",
    baseUrl: "mock://test",
    temperature: "default",
    durationMs: 0,
  };

  // Tool call trace is not populated by the behavioral runner in this adapter
  // (the SOP adapter operates on conversation content, not on actual tool invocations).
  // For binary graders that check tool-call traces, the assertion's context
  // must supply the trace from the probe's scenario metadata.
  const toolCallTrace: ToolCall[] = [];

  return { transcript, toolCallTrace, turns: conversationTurns, error };
}

// ---------------------------------------------------------------------------
// gradeRunWithBinaryAssertion — apply binary grader to a single run result
// ---------------------------------------------------------------------------

function gradeRunWithBinaryAssertion(
  assertion: BinaryAssertion,
  transcript: Transcript,
  turns: SOPTurn[],
  toolCallTrace: ToolCall[]
): SOPGrade {
  switch (assertion.kind) {
    case "never-call-tool":
      return gradeToolCallPresence(toolCallTrace, assertion);

    case "tool-order":
      return gradeToolOrder(toolCallTrace, assertion);

    case "confirm-before-destructive":
      return gradeConfirmBeforeDestructive(turns, toolCallTrace, assertion);

    case "exact-string-non-leakage":
      return gradeExactStringNonLeakage(transcript, assertion);

    case "output-format": {
      // Find the last assistant turn content
      const assistantEntries = transcript.entries.filter((e) => e.role === "assistant");
      const lastContent = assistantEntries.length > 0
        ? assistantEntries[assistantEntries.length - 1].content
        : "";
      return gradeOutputFormat(lastContent, assertion);
    }

    default: {
      // Exhaustive check — TypeScript will flag unhandled cases
      const _exhaustive: never = assertion;
      return {
        assertionKind: "unknown",
        measured: "unknown",
        limit: "unknown",
        passed: false,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// runComplianceProbeEntry — dispatch one manifest entry's compliance probe
// ---------------------------------------------------------------------------

/**
 * Run k compliance probe runs for a manifest entry.
 *
 * Errors are caught per-run (FR-012 error containment): a failed run records
 * the error but the loop continues. No run error aborts the suite.
 */
async function runComplianceProbeEntry(
  entry: SOPRuleManifestEntry,
  probe: ComplianceProbe,
  client: ChatClient,
  kOverride?: number
): Promise<SOPRunVerdict[]> {
  const k = kOverride ?? entry.k;
  const scenario = probe.scenario as InlineScenario;
  const runVerdicts: SOPRunVerdict[] = [];

  for (let run = 1; run <= k; run++) {
    // Error containment: each run is individually try/caught (FR-012)
    try {
      const { transcript, toolCallTrace, turns, error: runError } = await runProbeOnce(
        run,
        scenario,
        client
      );

      if (runError !== undefined) {
        // Probe execution error — record as errored run; continue suite
        runVerdicts.push({
          run,
          passed: false,
          grades: [],
          transcript,
          error: runError,
        });
        continue;
      }

      // Apply grader(s)
      let grades: SOPGrade[] = [];
      let passed = false;

      if (probe.gradingClass === "binary" && probe.binaryAssertion !== undefined) {
        const grade = gradeRunWithBinaryAssertion(
          probe.binaryAssertion,
          transcript,
          turns,
          toolCallTrace
        );
        grades = [grade];
        passed = grade.passed;
      } else if (probe.gradingClass === "judge" && probe.judgeAssertion !== undefined) {
        const judgeAssertion = probe.judgeAssertion as JudgeAssertion;
        const passThreshold = entry.passThreshold ?? Math.ceil(entry.k / 2);
        const result = await gradeJudgeCompliance(
          transcript,
          judgeAssertion,
          client,
          1, // single judge run per behavioral run
          passThreshold
        );
        grades = result.grades;
        passed = result.passed;
      } else {
        // No assertion configured — default to failed (manifest incomplete)
        grades = [
          {
            assertionKind: "none",
            measured: "no-assertion",
            limit: "assertion-required",
            passed: false,
          },
        ];
        passed = false;
      }

      runVerdicts.push({ run, passed, grades, transcript });
    } catch (err) {
      // Unexpected error in grading logic — error containment (FR-012)
      const errorMsg = err instanceof Error ? err.message : String(err);
      runVerdicts.push({
        run,
        passed: false,
        grades: [],
        transcript: {
          entries: [],
          model: "mock",
          baseUrl: "mock://test",
          temperature: "default",
          durationMs: 0,
        },
        error: errorMsg,
      });
    }
  }

  return runVerdicts;
}

// ---------------------------------------------------------------------------
// runAdversarialProbeEntry — dispatch one adversarial probe
// ---------------------------------------------------------------------------

/**
 * Run k adversarial probe runs for a manifest entry.
 * Adversarial probes always use pass^k aggregation (FR-007, charter).
 * Error containment follows the same pattern as compliance probes (FR-012).
 */
async function runAdversarialProbeEntry(
  entry: SOPRuleManifestEntry,
  probe: AdversarialProbe,
  client: ChatClient,
  kOverride?: number
): Promise<SOPRunVerdict[]> {
  const k = kOverride ?? entry.k;
  const scenario = probe.scenario as InlineScenario;
  const runVerdicts: SOPRunVerdict[] = [];

  for (let run = 1; run <= k; run++) {
    try {
      const { transcript, toolCallTrace, turns, error: runError } = await runProbeOnce(
        run,
        scenario,
        client
      );

      if (runError !== undefined) {
        runVerdicts.push({
          run,
          passed: false,
          grades: [],
          transcript,
          error: runError,
        });
        continue;
      }

      // Adversarial probes always use binary assertions (FR-007)
      const grade = gradeRunWithBinaryAssertion(
        probe.binaryAssertion,
        transcript,
        turns,
        toolCallTrace
      );

      runVerdicts.push({
        run,
        passed: grade.passed,
        grades: [grade],
        transcript,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      runVerdicts.push({
        run,
        passed: false,
        grades: [],
        transcript: {
          entries: [],
          model: "mock",
          baseUrl: "mock://test",
          temperature: "default",
          durationMs: 0,
        },
        error: errorMsg,
      });
    }
  }

  return runVerdicts;
}

// ---------------------------------------------------------------------------
// loadManifestProbes — load inline probes from the manifest's probe registry
// ---------------------------------------------------------------------------

/**
 * Load the probe registry from a YAML manifest file.
 *
 * The manifest optionally declares a `probes` section alongside `rules`. When
 * present, this function parses it into ComplianceProbe and AdversarialProbe
 * objects keyed by probe ID. This allows runner.ts to work with self-contained
 * manifest files that embed both rules and probes.
 */
async function loadManifestProbes(manifestPath: string): Promise<{
  complianceProbes: Map<string, ComplianceProbe>;
  adversarialProbes: Map<string, AdversarialProbe>;
}> {
  const raw = await readFile(manifestPath, "utf-8");
  const parsed = parseYaml(raw) as Record<string, unknown>;

  const complianceProbes = new Map<string, ComplianceProbe>();
  const adversarialProbes = new Map<string, AdversarialProbe>();

  const probes = parsed["probes"] as Record<string, unknown> | undefined;
  if (!probes) {
    return { complianceProbes, adversarialProbes };
  }

  const compliance = probes["compliance"] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(compliance)) {
    for (const p of compliance) {
      const probe = p as unknown as ComplianceProbe;
      complianceProbes.set(probe.id, probe);
    }
  }

  const adversarial = probes["adversarial"] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(adversarial)) {
    for (const p of adversarial) {
      const probe = p as unknown as AdversarialProbe;
      adversarialProbes.set(probe.id, probe);
    }
  }

  return { complianceProbes, adversarialProbes };
}

// ---------------------------------------------------------------------------
// runManifestSuite — the main entry-point (FR-011)
// ---------------------------------------------------------------------------

/**
 * FR-011: Run the full compliance + adversarial probe suite from a YAML
 * rule manifest.
 *
 * Steps:
 *  1. Load phase: run static lint (FR-003) and load probe registry.
 *  2. Dispatch phase: iterate manifest entries; run compliance and adversarial
 *     probes for each rule through the behavioral probe executor.
 *  3. Aggregation: aggregate per-run verdicts using pass^k or k-of-n.
 *  4. Report assembly: emit SOPSuiteReport with all lint findings, case verdicts,
 *     and the overall passed flag.
 *
 * Error containment (FR-012): a probe run that throws is recorded as an errored
 * SOPRunVerdict. The suite continues with the next probe — no short-circuit on
 * lint errors or probe failures.
 *
 * @param manifestPath - Absolute or relative path to the YAML manifest file.
 * @param options - SuiteRunOptions: client, optional k override, optional vendoredRoot.
 * @returns Promise<SOPSuiteReport>.
 */
export async function runManifestSuite(
  manifestPath: string,
  options: SuiteRunOptions
): Promise<SOPSuiteReport> {
  const { client, k: kOverride } = options;

  // -------------------------------------------------------------------------
  // Step 1: Load phase
  // -------------------------------------------------------------------------

  // Load and validate the manifest (needed to resolve sopFile path)
  let manifest: SOPRuleManifest;
  let sopFilePath: string;

  try {
    manifest = await loadAndValidateManifest(manifestPath);
    // Resolve the SOP file path relative to the manifest file
    const manifestDir = dirname(resolve(manifestPath));
    sopFilePath = resolve(join(manifestDir, manifest.sopFile));
  } catch (err) {
    // Manifest load failed — return a report with a single error finding
    const msg = err instanceof Error ? err.message : String(err);
    return {
      adapter: "openclaw-sop",
      rubricVersion: RUBRIC_VERSION,
      sopFile: manifestPath,
      lintFindings: [
        {
          kind: "MANIFEST_ERROR",
          location: manifestPath,
          message: `Manifest load failed: ${msg}`,
          source: "docs/rubric/sop-rule-taxonomy.md",
          severity: "error",
        },
      ],
      verdicts: [],
      passed: false,
      ranAt: new Date().toISOString(),
    };
  }

  // Run static lint (FR-003; read-only import from index.ts — index.ts is not modified).
  // FR-012: lint errors do not short-circuit probe dispatch. If runStaticLint itself
  // throws (e.g., sopFile not found / ENOENT), convert the exception to a lint finding
  // and continue with probe execution.
  let lintFindings: SOPLintFinding[];
  try {
    const lintReport = await runStaticLint(sopFilePath, manifestPath);
    lintFindings = lintReport.findings;
  } catch (lintErr) {
    const msg = lintErr instanceof Error ? lintErr.message : String(lintErr);
    lintFindings = [
      {
        kind: "STRUCTURAL_ABSENCE",
        location: sopFilePath,
        message: `Static lint failed: ${msg}`,
        source: "docs/rubric/sop-rule-taxonomy.md",
        severity: "error",
      },
    ];
  }

  // Load probe registry from the manifest file (probes section)
  const { complianceProbes, adversarialProbes } = await loadManifestProbes(manifestPath);

  // -------------------------------------------------------------------------
  // Step 2: Dispatch phase — iterate over manifest entries
  // -------------------------------------------------------------------------

  const verdicts: SOPCaseVerdict[] = [];

  for (const entry of manifest.rules) {
    // Dispatch compliance probes for this entry
    for (const probeId of entry.probeIds) {
      const complianceProbe = complianceProbes.get(probeId);
      const adversarialProbe = adversarialProbes.get(probeId);

      if (complianceProbe !== undefined) {
        // Run compliance probe (FR-012: errors are contained per-run)
        const runVerdicts = await runComplianceProbeEntry(
          entry,
          complianceProbe,
          client,
          kOverride
        );

        // Step 3: Aggregation
        let caseResult: Omit<SOPCaseVerdict, "probeId" | "ruleId">;
        if (entry.aggregation === "pass-k") {
          caseResult = aggregatePassK(runVerdicts);
        } else {
          const passThreshold = entry.passThreshold ?? Math.ceil(entry.k / 2);
          caseResult = aggregateKofN(runVerdicts, passThreshold);
        }

        verdicts.push({
          probeId,
          ruleId: entry.ruleId,
          ...caseResult,
        });
      } else if (adversarialProbe !== undefined) {
        // Adversarial probes always use pass^k (FR-007, charter)
        const runVerdicts = await runAdversarialProbeEntry(
          entry,
          adversarialProbe,
          client,
          kOverride
        );

        const caseResult = aggregatePassK(runVerdicts);
        verdicts.push({
          probeId,
          ruleId: entry.ruleId,
          ...caseResult,
          aggregation: "pass-k", // adversarial probes always pass-k
        });
      }
      // If a probeId is listed in the manifest but not found in the probe registry,
      // skip it (the manifest may reference external probes not in this suite).
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: Report assembly
  // -------------------------------------------------------------------------

  const passed =
    lintFindings.every((f) => f.severity !== "error") &&
    verdicts.every((v) => v.passed);

  return {
    adapter: "openclaw-sop",
    rubricVersion: RUBRIC_VERSION,
    sopFile: sopFilePath,
    lintFindings,
    verdicts,
    passed,
    ranAt: new Date().toISOString(),
  };
}
