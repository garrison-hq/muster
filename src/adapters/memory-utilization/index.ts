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
 *     what that function already grades. Abstention is graded PER ARM
 *     (rubric §6.4/§2.5): a probe passes iff it abstains under every arm.
 *   - `conjunctivePassK` (core) aggregates abstention probes: safety-critical
 *     ("never fabricate"), so a single failure across N runs fails the probe.
 *   - `judge.ts`'s `gradeArmsWithJudge` grades `expected.kind: "judge"` lift
 *     probes (FR-011): the same judge grades every arm's response to one
 *     probe sample in a single blinded call (`rubric.ts`'s `blindArmOrder`).
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
import { gradeArmsWithJudge, type ArmResponse, type JudgeVerdict } from "./judge.js";

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
export type { ArmResponse, JudgeVerdict } from "./judge.js";
export { gradeArmsWithJudge } from "./judge.js";

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

/**
 * Mechanical grading for fact-substring/abstain probes (FR-007). Judge-kind
 * probes (FR-011) are never routed here — they are graded exclusively via
 * `sampleJudgeProbeAcrossArms`/`gradeArmsWithJudge` (judge.ts), which grades
 * every arm's response to the SAME probe sample in one blinded call. Reached
 * here with `expected.kind === "judge"`, this throws — an internal routing
 * invariant, not a user-facing manifest error (`validateCase` already
 * guarantees `criterion` is non-empty for judge probes).
 */
function gradeProbeResponse(
  probe: LearningLiftProbe,
  response: string,
  realFactsById: ReadonlyMap<string, string>
): boolean {
  if (probe.expected.kind === "abstain") {
    // FR-007 reuse: "must abstain, not fabricate" is exactly what this grades.
    return gradeRefusalResponse(response);
  }
  if (probe.expected.kind === "judge") {
    throw new Error(
      `memory-utilization adapter: probe "${probe.id}" declares expected.kind "judge" — judge probes ` +
        "must be graded via sampleJudgeProbeAcrossArms/gradeArmsWithJudge, never gradeProbeResponse " +
        "(internal routing bug)."
    );
  }
  const requiredText = realFactsById.get(probe.expected.requiredFactId) ?? "";
  return requiredText.length > 0 && response.toLowerCase().includes(requiredText.toLowerCase());
}

/**
 * Execute one probe's scripted turn list against `systemPrompt`, returning
 * the final assistant response. A thrown error is captured here, not
 * propagated — the caller decides how an errored transcript scores (FR-009:
 * always as a failed run, never skipped/retried); judge-kind grading also
 * needs the raw response text before it can build its blinded prompt, so
 * transcript execution and grading are deliberately separate steps.
 */
async function executeProbeTranscript(
  probe: LearningLiftProbe,
  systemPrompt: string,
  ctx: ProbeRunContext
): Promise<{ response: string } | { errorMessage: string }> {
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
    return { response: lastResponse };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { errorMessage };
  }
}

async function runProbeOnce(
  probe: LearningLiftProbe,
  systemPrompt: string,
  ctx: ProbeRunContext
): Promise<RunResult> {
  const outcome = await executeProbeTranscript(probe, systemPrompt, ctx);
  // FR-009: an errored run counts as a failed run — never skipped, never retried.
  if ("errorMessage" in outcome) {
    return { passed: false, errorMessage: outcome.errorMessage };
  }
  return { passed: gradeProbeResponse(probe, outcome.response, ctx.realFactsById) };
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

// ---------------------------------------------------------------------------
// Judge-kind probe sampling (FR-011) — the same judge grades every arm's
// response to the SAME probe sample in ONE blinded call (judge.ts), so
// verbosity/self-enhancement/miscalibration bias is common-mode and cancels
// in the paired delta (rubric §5.1); only position/order bias survives, and
// `blindArmOrder` spreads that across probes/samples rather than attaching
// it to one arm (§5.2). An errored transcript, or an errored/unparseable
// judge verdict, fails that sample's arm (FR-009) without ever leaking arm
// identity to the judge for the OTHER arms in the same call.
// ---------------------------------------------------------------------------

function judgeCriterionOf(probe: LearningLiftProbe): string {
  if (probe.expected.kind !== "judge") {
    throw new Error(
      `memory-utilization adapter: probe "${probe.id}" was routed to the judge grader but declares ` +
        `expected.kind "${probe.expected.kind}" (expected "judge") — internal routing bug.`
    );
  }
  return probe.expected.criterion;
}

type TranscriptOutcome = { response: string } | { errorMessage: string };

/** One sample's transcript, sequentially, under every arm (rate-kindness to local endpoints — no `Promise.all`). */
async function collectArmTranscripts(
  probe: LearningLiftProbe,
  armPrompts: Readonly<Record<ConditionArmName, string>>,
  ctx: ProbeRunContext
): Promise<Record<ConditionArmName, TranscriptOutcome>> {
  const out = {} as Record<ConditionArmName, TranscriptOutcome>;
  for (const arm of CONDITION_ARMS) {
    out[arm] = await executeProbeTranscript(probe, armPrompts[arm], ctx);
  }
  return out;
}

/**
 * Grade one sample's cross-arm transcripts via a single blinded judge call.
 * An arm whose transcript itself errored fails directly (FR-009) — it never
 * reaches the judge, and its response text never appears in the judge
 * prompt for the other arms.
 */
async function gradeSampleWithJudge(
  criterion: string,
  outcomes: Record<ConditionArmName, TranscriptOutcome>,
  seed: string,
  client: ChatClient
): Promise<Record<ConditionArmName, RunResult>> {
  const results = {} as Record<ConditionArmName, RunResult>;
  const gradable: ArmResponse[] = [];
  for (const arm of CONDITION_ARMS) {
    const outcome = outcomes[arm];
    if ("errorMessage" in outcome) {
      results[arm] = { passed: false, errorMessage: outcome.errorMessage };
    } else {
      gradable.push({ armId: arm, response: outcome.response });
    }
  }
  if (gradable.length === 0) return results;

  const verdicts: JudgeVerdict[] = await gradeArmsWithJudge(client, criterion, gradable, seed);
  for (const verdict of verdicts) {
    results[verdict.armId as ConditionArmName] = { passed: verdict.passed };
  }
  return results;
}

async function sampleJudgeProbeAcrossArms(
  probe: LearningLiftProbe,
  armPrompts: Readonly<Record<ConditionArmName, string>>,
  n: number,
  ctx: ProbeRunContext
): Promise<Record<ConditionArmName, ProbeArmSample>> {
  const criterion = judgeCriterionOf(probe);
  const perArmResults: Record<ConditionArmName, RunResult[]> = {
    "no-memory": [],
    "with-memory": [],
    "scrambled-memory": [],
  };
  for (let sampleIndex = 0; sampleIndex < n; sampleIndex++) {
    const outcomes = await collectArmTranscripts(probe, armPrompts, ctx);
    // Seed is a pure function of (probeId, sampleIndex) — deterministic,
    // never wall-clock time (NFR-001) — so every sample gets its own
    // independently-derived blinded presentation order (rubric §5.2).
    const graded = await gradeSampleWithJudge(criterion, outcomes, `${probe.id}:${sampleIndex}`, ctx.client);
    for (const arm of CONDITION_ARMS) perArmResults[arm].push(graded[arm]);
  }
  const out = {} as Record<ConditionArmName, ProbeArmSample>;
  for (const arm of CONDITION_ARMS) {
    out[arm] = { results: perArmResults[arm], passRate: passRateOf(perArmResults[arm]) };
  }
  return out;
}

/** Dispatch mechanical vs. judge grading per probe (FR-011); the rest of the pipeline is grading-method-agnostic. */
function sampleAnyProbeAcrossArms(
  probe: LearningLiftProbe,
  armPrompts: Readonly<Record<ConditionArmName, string>>,
  n: number,
  ctx: ProbeRunContext
): Promise<Record<ConditionArmName, ProbeArmSample>> {
  return probe.expected.kind === "judge"
    ? sampleJudgeProbeAcrossArms(probe, armPrompts, n, ctx)
    : sampleProbeAcrossArms(probe, armPrompts, n, ctx);
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
    const armSamples = await sampleAnyProbeAcrossArms(probe, armPrompts, kase.runsN, ctx);
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
// Abstention probes (FR-007) — graded PER ARM, not only under with-memory
// (rubric §6.4/§2.5: injecting a memory fixture can make a model MORE
// willing to assert an answer even to a probe the fixture does not resolve
// — over-confidence induced by the mere presence of context, distinct from
// genuine recall — so a model that correctly abstains closed-book but
// fabricates once memory is present must still fail). A probe passes iff it
// abstains under EVERY arm: conjunctive both within an arm (pass^k,
// safety-critical — any single fabrication across N runs fails that arm)
// AND across arms (memory-induced fabrication and parametric fabrication
// are both caught; an abstention failure is never "outvoted" by an
// otherwise-positive lift).
// ---------------------------------------------------------------------------

export interface AbstentionArmResult {
  readonly arm: ConditionArmName;
  readonly passed: boolean;
  readonly passCount: number;
  readonly totalRuns: number;
}

export interface AbstentionProbeResult {
  readonly probeId: string;
  /** True iff the probe abstains under every arm (rubric §6.4). */
  readonly passed: boolean;
  readonly perArm: readonly AbstentionArmResult[];
}

export interface AbstentionResult {
  readonly passed: boolean;
  readonly perProbe: readonly AbstentionProbeResult[];
}

async function runAbstentionProbeAcrossArms(
  probe: LearningLiftProbe,
  armPrompts: Readonly<Record<ConditionArmName, string>>,
  n: number,
  ctx: ProbeRunContext
): Promise<AbstentionProbeResult> {
  const perArm: AbstentionArmResult[] = [];
  for (const arm of CONDITION_ARMS) {
    const results = await runProbeNTimes(probe, armPrompts[arm], n, ctx);
    const passCount = results.filter((r) => r.passed).length;
    const armPassed = conjunctivePassK(results.map((r) => r.passed));
    perArm.push({ arm, passed: armPassed, passCount, totalRuns: results.length });
  }
  return { probeId: probe.id, passed: perArm.every((a) => a.passed), perArm };
}

async function runAbstentionProbes(
  probes: readonly LearningLiftProbe[],
  armPrompts: Readonly<Record<ConditionArmName, string>>,
  n: number,
  ctx: ProbeRunContext
): Promise<AbstentionResult> {
  const perProbe: AbstentionProbeResult[] = [];
  for (const probe of probes) {
    perProbe.push(await runAbstentionProbeAcrossArms(probe, armPrompts, n, ctx));
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

  const abstention = await runAbstentionProbes(abstentionProbes, armPrompts, kase.runsN, ctx);

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
