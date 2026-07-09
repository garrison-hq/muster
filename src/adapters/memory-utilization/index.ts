/**
 * index.ts — MemoryUtilizationAdapter entry point: the 3-arm learning-lift
 * orchestrator (FR-001, FR-002, FR-004 wiring).
 *
 * Reuse map (research.md §3 "Internal fit"):
 *   - Structural shape reused from `src/crosslayer/rule-survival.ts`:
 *     baseline-vs-condition N-sampling, sequential runs (no `Promise.all`,
 *     rate-kindness to local endpoints), "an errored run counts as a failed
 *     run" (FR-009), and the baseline-validity guard pattern (re-parameterized
 *     two-sided in verdict.ts — see its docstring). `runRuleSurvival` itself
 *     is not called directly: it is coupled to `StackComposition` (persona +
 *     SOP text assembly) and single-condition refusal grading, neither of
 *     which fits 3-arm memory-fixture staging with fact-substring grading.
 *   - `gradeRefusalResponse` IS imported and reused directly for abstention
 *     probes (FR-007): "the model must abstain, not fabricate" is exactly
 *     what that function already grades.
 *   - `conjunctivePassK` (core) aggregates abstention probes: safety-critical
 *     ("never fabricate"), so a single failure across N runs fails the probe.
 *   - WP01's `PairedOutcome` (core/behavioral/types.ts) is the retained
 *     per-probe cross-arm record (C-005); WP02's `stats/paired.ts` /
 *     `stats/power.ts` compute the McNemar/Tango/MDE apparatus from a
 *     dichotomized view of the same retained rates (verdict.ts).
 *
 * C-002 (non-runtime): this module never operates the agent — it stages
 * fixtures as system-prompt text and grades transcripts via the injected
 * `ChatClient`, exactly as rule-survival and the Memory adapter's behavioral
 * probes already do.
 */

import { makeClient } from "../../core/behavioral/client.js";
import { conjunctivePassK } from "../../core/behavioral/pass-k.js";
import type { PairedOutcome as RetainedPairedOutcome } from "../../core/behavioral/types.js";
import type { ChatClient, ChatMessage, EndpointConfig } from "../../core/behavioral/types.js";
import type { PairedOutcome as StatsPairedOutcome } from "../../core/behavioral/stats/paired.js";
import { gradeRefusalResponse } from "../../crosslayer/rule-survival.js";
import type { MemoryFact } from "../memory/lint.js";

import {
  CONDITION_ARMS,
  validateCase,
  type ConditionArmName,
  type LearningLiftCase,
  type LearningLiftManifest,
  type LearningLiftProbe,
} from "./manifest.js";
import { buildArmSystemPrompt, stageAllArms, type StagedFixture } from "./fixture.js";
import {
  contaminatedProbeIds,
  evaluateContamination,
  type ContaminationResult,
} from "./contamination.js";
import { computeLiftMeasurement, type LiftMeasurement } from "./verdict.js";
import {
  capOfZeroFailedAsDesigned,
  checkCapOfZeroControl,
  evaluateAllRefuseGuard,
  evaluateScrambledControl,
  type AllRefuseGuardResult,
  type ScrambledControlResult,
} from "./controls.js";

export type {
  MemoryFixtureRef,
  ProbeExpectation,
  LearningLiftProbe,
  ConditionArmName,
  LiftThresholds,
  LearningLiftCase,
  LearningLiftManifest,
  Turn,
} from "./manifest.js";
export { CONDITION_ARMS, validateCase } from "./manifest.js";
export type { FixtureVariant, StagedFixture } from "./fixture.js";
export { loadRealFacts, scrambleFactText, stageAllArms, stageFixture, buildArmSystemPrompt } from "./fixture.js";
export type { ContaminationResult } from "./contamination.js";
export { anyContaminated, contaminatedProbeIds, evaluateContamination } from "./contamination.js";
export type { LiftMeasurement, LiftVerdict } from "./verdict.js";
export { computeLiftMeasurement, isBaselineValid } from "./verdict.js";
export type { AllRefuseGuardResult, ScrambledControlResult } from "./controls.js";
export {
  capOfZeroFailedAsDesigned,
  checkCapOfZeroControl,
  evaluateAllRefuseGuard,
  evaluateScrambledControl,
} from "./controls.js";

// ---------------------------------------------------------------------------
// Run options — the injected ChatClient overload mirrors the Memory
// adapter's RecallProbeRunner/PrivacyLeakProbeRunner test-injection pattern.
// ---------------------------------------------------------------------------

export interface RunOptions {
  readonly endpoint?: EndpointConfig;
  /** Test injection: bypass the network entirely with a scripted client. */
  readonly client?: ChatClient;
}

function resolveClient(options: RunOptions): ChatClient {
  if (options.client !== undefined) return options.client;
  if (options.endpoint !== undefined) return makeClient(options.endpoint);
  throw new Error(
    "memory-utilization adapter: run() requires either options.client or options.endpoint"
  );
}

// ---------------------------------------------------------------------------
// Probe execution — one run, N runs. Errored run = failed run (FR-009),
// never skipped, never retried. Sequential, mirroring rule-survival's
// runProbeNTimes (rate-kindness to local endpoints).
// ---------------------------------------------------------------------------

interface RunResult {
  readonly passed: boolean;
  readonly errorMessage?: string;
}

interface ProbeRunContext {
  readonly client: ChatClient;
  readonly temperature: number | undefined;
  readonly realFactsById: ReadonlyMap<string, string>;
}

/** Mechanical grading (FR-011/judge-blinding is WP04 scope; WP03 is judge-free). */
function gradeProbeResponse(
  probe: LearningLiftProbe,
  response: string,
  realFactsById: ReadonlyMap<string, string>
): boolean {
  if (probe.expected.kind === "abstain") {
    // FR-007 reuse: "must abstain, not fabricate" is exactly what this grades.
    return gradeRefusalResponse(response);
  }
  const requiredText = realFactsById.get(probe.expected.requiredFactId) ?? "";
  return requiredText.length > 0 && response.toLowerCase().includes(requiredText.toLowerCase());
}

async function runProbeOnce(
  probe: LearningLiftProbe,
  systemPrompt: string,
  ctx: ProbeRunContext
): Promise<RunResult> {
  try {
    const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];
    let lastResponse = "";
    for (const turn of probe.turns) {
      messages.push({ role: "user", content: turn.content });
      const response = await ctx.client.chat(
        messages,
        ctx.temperature === undefined ? {} : { temperature: ctx.temperature }
      );
      messages.push({ role: "assistant", content: response });
      lastResponse = response;
    }
    return { passed: gradeProbeResponse(probe, lastResponse, ctx.realFactsById) };
  } catch (error) {
    // FR-009: an errored run counts as a failed run — never skipped, never retried.
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { passed: false, errorMessage };
  }
}

async function runProbeNTimes(
  probe: LearningLiftProbe,
  systemPrompt: string,
  n: number,
  ctx: ProbeRunContext
): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (let i = 0; i < n; i++) {
    results.push(await runProbeOnce(probe, systemPrompt, ctx));
  }
  return results;
}

function passRateOf(results: readonly RunResult[]): number {
  if (results.length === 0) return 0;
  return results.filter((r) => r.passed).length / results.length;
}

function meanOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** rate >= 0.5 dichotomizes the N-sampled continuous rate into a McNemar-shaped boolean (muster judgment call). */
function dichotomize(rate: number): boolean {
  return rate >= 0.5;
}

function buildRealFactIndex(facts: readonly MemoryFact[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const fact of facts) index.set(fact.id, fact.text);
  return index;
}

// ---------------------------------------------------------------------------
// Per-probe, all-arms sampling (the 3-arm orchestration, FR-002).
// ---------------------------------------------------------------------------

interface ProbeArmSample {
  readonly results: readonly RunResult[];
  readonly passRate: number;
}

async function sampleProbeAcrossArms(
  probe: LearningLiftProbe,
  armPrompts: Readonly<Record<ConditionArmName, string>>,
  n: number,
  ctx: ProbeRunContext
): Promise<Record<ConditionArmName, ProbeArmSample>> {
  const out = {} as Record<ConditionArmName, ProbeArmSample>;
  for (const arm of CONDITION_ARMS) {
    const results = await runProbeNTimes(probe, armPrompts[arm], n, ctx);
    out[arm] = { results, passRate: passRateOf(results) };
  }
  return out;
}

interface LiftAccumulator {
  readonly pairedOutcomes: RetainedPairedOutcome[];
  readonly contamination: ContaminationResult[];
  readonly liftPairs: StatsPairedOutcome[];
  readonly scrambledPairs: StatsPairedOutcome[];
}

async function accumulateLiftProbes(
  liftProbes: readonly LearningLiftProbe[],
  armPrompts: Readonly<Record<ConditionArmName, string>>,
  kase: LearningLiftCase,
  ctx: ProbeRunContext
): Promise<LiftAccumulator> {
  const acc: LiftAccumulator = { pairedOutcomes: [], contamination: [], liftPairs: [], scrambledPairs: [] };
  for (const probe of liftProbes) {
    const armSamples = await sampleProbeAcrossArms(probe, armPrompts, kase.runsN, ctx);
    const withRate = armSamples["with-memory"].passRate;
    const withoutRate = armSamples["no-memory"].passRate;
    const scrambledRate = armSamples["scrambled-memory"].passRate;

    // C-005 / FR-003: retain the per-probe paired outcome across arms.
    acc.pairedOutcomes.push({
      probeId: probe.id,
      perArmScore: {
        "no-memory": withoutRate,
        "with-memory": withRate,
        "scrambled-memory": scrambledRate,
      },
    });

    acc.contamination.push(
      evaluateContamination(probe, withoutRate, kase.thresholds.contaminationThreshold)
    );

    acc.liftPairs.push({ armA: dichotomize(withRate), armB: dichotomize(withoutRate) });
    acc.scrambledPairs.push({ armA: dichotomize(scrambledRate), armB: dichotomize(withoutRate) });
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Abstention probes (FR-007) — run only under the with-memory arm; pass^k
// (safety-critical: any single fabrication across N runs fails the probe).
// ---------------------------------------------------------------------------

export interface AbstentionProbeResult {
  readonly probeId: string;
  readonly passed: boolean;
  readonly passCount: number;
  readonly totalRuns: number;
}

export interface AbstentionResult {
  readonly passed: boolean;
  readonly perProbe: readonly AbstentionProbeResult[];
}

async function runAbstentionProbes(
  probes: readonly LearningLiftProbe[],
  withMemorySystemPrompt: string,
  n: number,
  ctx: ProbeRunContext
): Promise<AbstentionResult> {
  const perProbe: AbstentionProbeResult[] = [];
  for (const probe of probes) {
    const results = await runProbeNTimes(probe, withMemorySystemPrompt, n, ctx);
    const passCount = results.filter((r) => r.passed).length;
    const passed = conjunctivePassK(results.map((r) => r.passed));
    perProbe.push({ probeId: probe.id, passed, passCount, totalRuns: results.length });
  }
  const passed = perProbe.every((p) => p.passed);
  return { passed, perProbe };
}

// ---------------------------------------------------------------------------
// Case-level orchestration.
// ---------------------------------------------------------------------------

export interface CaseResult {
  readonly caseId: string;
  readonly measurement: LiftMeasurement;
  /** WP01's retained per-probe paired outcome (C-005), one entry per "lift" probe. */
  readonly pairedOutcomes: readonly RetainedPairedOutcome[];
  readonly contamination: readonly ContaminationResult[];
  readonly scrambledControl: ScrambledControlResult;
  readonly allRefuseGuard: AllRefuseGuardResult;
  readonly abstention: AbstentionResult;
  readonly capOfZeroFailedAsDesigned: boolean;
  /** Case-level pass/fail: a lift-confirmed verdict AND every control/guard consistent. */
  readonly ok: boolean;
}

function buildArmPrompts(staged: Record<ConditionArmName, StagedFixture>): Record<ConditionArmName, string> {
  return {
    "no-memory": buildArmSystemPrompt(staged["no-memory"]),
    "with-memory": buildArmSystemPrompt(staged["with-memory"]),
    "scrambled-memory": buildArmSystemPrompt(staged["scrambled-memory"]),
  };
}

async function runCase(kase: LearningLiftCase, client: ChatClient): Promise<CaseResult> {
  validateCase(kase);

  const staged = stageAllArms(kase.fixture);
  const armPrompts = buildArmPrompts(staged);
  const realFactsById = buildRealFactIndex(staged["with-memory"].facts);
  const ctx: ProbeRunContext = { client, temperature: kase.temperature, realFactsById };

  const liftProbes = kase.probes.filter((p) => p.kind === "lift");
  const abstentionProbes = kase.probes.filter((p) => p.kind === "abstention");

  const acc = await accumulateLiftProbes(liftProbes, armPrompts, kase, ctx);

  const passRateWithMemory = meanOf(acc.pairedOutcomes.map((o) => o.perArmScore["with-memory"] ?? 0));
  const passRateNoMemory = meanOf(acc.pairedOutcomes.map((o) => o.perArmScore["no-memory"] ?? 0));
  const passRateScrambledMemory = meanOf(
    acc.pairedOutcomes.map((o) => o.perArmScore["scrambled-memory"] ?? 0)
  );

  const measurement = computeLiftMeasurement({
    caseId: kase.id,
    liftPairs: acc.liftPairs,
    scrambledPairs: acc.scrambledPairs,
    passRateWithMemory,
    passRateNoMemory,
    passRateScrambledMemory,
    contaminatedIds: contaminatedProbeIds(acc.contamination),
    thresholds: kase.thresholds,
    runsN: kase.runsN,
  });

  const scrambledControl = evaluateScrambledControl(measurement, kase.thresholds);
  const allRefuseGuard = evaluateAllRefuseGuard(measurement);
  checkCapOfZeroControl(kase, measurement.verdict);
  const capPassed = capOfZeroFailedAsDesigned(kase, measurement.verdict);

  const abstention = await runAbstentionProbes(
    abstentionProbes,
    armPrompts["with-memory"],
    kase.runsN,
    ctx
  );

  const ok =
    measurement.verdict === "lift-confirmed" &&
    scrambledControl.passed &&
    !allRefuseGuard.fired &&
    abstention.passed &&
    capPassed;

  return {
    caseId: kase.id,
    measurement,
    pairedOutcomes: acc.pairedOutcomes,
    contamination: acc.contamination,
    scrambledControl,
    allRefuseGuard,
    abstention,
    capOfZeroFailedAsDesigned: capPassed,
    ok,
  };
}

// ---------------------------------------------------------------------------
// AdapterResult + MemoryUtilizationAdapter — the manifest-level entry point.
// ---------------------------------------------------------------------------

export interface AdapterResult {
  readonly ok: boolean;
  readonly summary: string;
  readonly cases: readonly CaseResult[];
}

function summarize(cases: readonly CaseResult[]): string {
  const passCount = cases.filter((c) => c.ok).length;
  return passCount === cases.length
    ? `memory-utilization adapter: all ${cases.length} case(s) conform`
    : `memory-utilization adapter: ${cases.length - passCount} of ${cases.length} case(s) failed`;
}

/**
 * MemoryUtilizationAdapter — entry point for the memory-utilization /
 * learning-lift conformance adapter (FR-001).
 *
 * Does not implement the full `SpecAdapter` interface from `src/core/
 * adapter.ts` — that contract is Soul.md/RFC-1-specific and does not apply
 * to this domain (mirrors `MemoryAdapter`/`SOPAdapter`: a named adapter with
 * a `run()` entry-point).
 */
export class MemoryUtilizationAdapter {
  readonly name = "memory-utilization";
  readonly adapterVersion = "1.0.0";

  async run(manifest: LearningLiftManifest, options: RunOptions): Promise<AdapterResult> {
    if (manifest.cases.length === 0) {
      throw new Error("memory-utilization adapter: manifest.cases must be non-empty");
    }
    const client = resolveClient(options);
    const cases: CaseResult[] = [];
    for (const kase of manifest.cases) {
      cases.push(await runCase(kase, client));
    }
    return { ok: cases.every((c) => c.ok), summary: summarize(cases), cases };
  }
}

export function createMemoryUtilizationAdapter(): MemoryUtilizationAdapter {
  return new MemoryUtilizationAdapter();
}
