#!/usr/bin/env node
/**
 * `muster` — the CTS-1 conformance harness CLI (contracts/cli.md, implemented
 * clause-by-clause).
 *
 * This file is deliberately THIN: argument parsing, adapter injection, output
 * formatting. All conformance logic lives in `src/core/` and
 * `src/adapters/rfc1/`; this module is the ONLY place where the spec-agnostic
 * core and the concrete RFC-1 adapter meet (C-004).
 *
 * Uniform exit codes (the contract's spine):
 *   0 — command ran, result conforming / all cases passed
 *   1 — command ran, violations found / ≥1 case failed
 *   2 — execution error (unreadable file, bad manifest, endpoint fatal)
 *
 * Stream discipline: stdout carries ONLY the requested artifact (report,
 * config, results) — logs and diagnostics always go to stderr, so
 * `muster check broken.md --json 2>/dev/null` still emits parseable JSON.
 *
 * Testability: `runCli(argv, options)` is exported and the bin entry merely
 * calls it; Commander runs with `exitOverride()` so parse errors map to
 * exit code 2 instead of killing the process.
 */

import { readFileSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { Command, CommanderError, InvalidArgumentError, Option } from "commander";
import type { Mode } from "../core/adapter.js";
import { canonicalJson } from "../core/canonical-json.js";
import { checkSoul, makeFsLoadRef, type CheckResult } from "../core/pipeline.js";
import {
  isManifestError,
  loadManifest,
} from "../core/cts/manifest.js";
import { runCts, type RunCtsOptions } from "../core/cts/runner.js";
import {
  isBehavioralManifestError,
  loadBehavioralManifest,
} from "../core/behavioral/manifest.js";
import { runCase, type RunnerOptions } from "../core/behavioral/runner.js";
import { makeClient } from "../core/behavioral/client.js";
import {
  makeCassetteClient,
  readCassetteCase,
  writeCassetteCase,
  readCassetteSuiteIndex,
  writeCassetteSuiteIndex,
  SCHEMA_VERSION as CASSETTE_SCHEMA_VERSION,
  type CassetteExchange,
  type CassetteSuiteIndex,
} from "../core/cassette/index.js";
import type {
  BehavioralCase,
  CaseVerdict,
  ChatClient,
  EndpointConfig,
  PairedOutcome as MemoryUtilizationPairedOutcome,
} from "../core/behavioral/types.js";
import type { Violation } from "../core/report.js";
// The single core↔adapter composition point (C-004).
import { rfc1Adapter } from "../adapters/rfc1/index.js";
// Memory adapter registration (FR-001, C-001: only the factory is imported here).
import { createMemoryAdapter, type AdapterManifest, type AdapterOptions } from "../adapters/memory/index.js";
import {
  HeartbeatAdapter,
  checkHeartbeatFile,
  serializeLintReport,
  runManifest as runHeartbeatManifest,
  type ManifestSummary as HeartbeatManifestSummary,
} from "../adapters/heartbeat/index.js";
import {
  A2aAdapter,
  lintCard as a2aLintCard,
  serializeLintReport as a2aSerializeLintReport,
  runManifest as runA2aManifest,
  runA2aBehavioralManifest,
  peekManifestKind,
  type ManifestSummary as A2aManifestSummary,
} from "../adapters/a2a/index.js";
import { parseAgentCard } from "../adapters/a2a/card.js";
import {
  formatBehaveHuman,
  formatCtsHuman,
  formatReportHuman,
  formatA2aBehavioralHuman,
  globToRegExp,
} from "./output.js";
import {
  runManifest as runCrossLayerManifest,
  type EndpointManifestConfig,
  type ManifestRunSummary,
} from "../crosslayer/manifest-runner.js";
// Skills adapter imports (C-001: only adapter boundary imported here).
import {
  parseSkill,
  validateSkill,
} from "../adapters/skills/index.js";
import { checkLayout } from "../adapters/skills/layout.js";
import { validateManifest as validateSkillsManifest } from "../adapters/skills/schema.js";
import type { SkillProfile, AxisVerdict, TriggerCase } from "../adapters/skills/types.js";
import {
  makeToolClient,
  resolveEndpointBaseUrl,
  runTriggerConformance,
  RIGGED_IMPOSSIBLE_DESCRIPTION,
  type TriggerChatClient,
} from "../adapters/skills/trigger.js";
// SOP adapter imports (C-001: only adapter boundary imported here).
import { runManifestSuite as runSopManifestSuite } from "../adapters/openclaw-sop/runner.js";
import type { SOPSuiteReport } from "../adapters/openclaw-sop/index.js";
// Tools adapter imports (C-001: only adapter boundary imported here).
import {
  runManifest as runToolsManifest,
  type ToolsManifestCase,
  type ToolsManifestResult,
} from "../adapters/tools/index.js";
// Memory-utilization / learning-lift adapter imports (C-001: only the
// adapter boundary + its published rubric citations are imported here).
import {
  createMemoryUtilizationAdapter,
  type AbstentionResult as MemoryUtilizationAbstentionResult,
  type AdapterResult as MemoryUtilizationAdapterResult,
  type AllRefuseGuardResult as MemoryUtilizationAllRefuseGuardResult,
  type CaseResult as MemoryUtilizationCaseResult,
  type ContaminationResult as MemoryUtilizationContaminationResult,
  type LearningLiftCase,
  type LearningLiftManifest,
  type LiftMeasurement as MemoryUtilizationLiftMeasurement,
  type MemoryFixtureRef,
  type ScrambledControlResult as MemoryUtilizationScrambledControlResult,
} from "../adapters/memory-utilization/index.js";
import {
  RUBRIC_CITATIONS as MEMORY_UTILIZATION_RUBRIC_CITATIONS,
  RUBRIC_DOC_PATH as MEMORY_UTILIZATION_RUBRIC_DOC_PATH,
} from "../adapters/memory-utilization/rubric.js";
import { evaluateLiftVerdict as evaluateMemoryUtilizationLiftVerdict } from "../core/behavioral/stats/power.js";
// Spec-kitty-profile adapter imports (C-001: only the adapter boundary +
// its manifest/rubric-path helpers are imported here).
import {
  createSpecKittyProfileAdapter,
  type AdapterResult as SkProfileAdapterResult,
  type SkProfileCaseResult,
  type SkProfileFinding,
} from "../adapters/spec-kitty-profile/index.js";
import {
  loadSkProfileManifest,
  resolveSkProfileManifestPaths,
  type SkProfileManifest,
} from "../adapters/spec-kitty-profile/manifest.js";
import { RUBRIC_DOC_PATH as SK_PROFILE_RUBRIC_DOC_PATH } from "../adapters/spec-kitty-profile/rubric.js";

/** Version straight from package.json (works from src/ via tsx and dist/). */
const VERSION = (
  JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8")
  ) as { version: string }
).version;

/** Injection seams for tests: output sinks and the chat-client factory. */
export interface RunCliOptions {
  /** stdout sink — receives EXACT bytes (no newline appended). */
  out?: (text: string) => void;
  /** stderr sink — receives EXACT bytes (no newline appended). */
  err?: (text: string) => void;
  /** Chat-client factory for `behave run` (defaults to the fetch client). */
  clientFactory?: (endpoint: EndpointConfig) => ChatClient;
  /**
   * Trigger-chat-client factory for `skills run`'s behavioral cases (defaults
   * to `makeToolClient`, the sanctioned Option-B call site — FR-001, C-003).
   * Tests inject a mock so behavioral wiring stays offline/deterministic.
   */
  skillsTriggerClientFactory?: (endpoint: EndpointConfig) => TriggerChatClient;
}

/** Internal: an execution error (contract exit code 2). */
class ExecutionError extends Error {}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toAbsolute(path: string): string {
  return isAbsolute(path) ? path : resolvePath(path);
}

async function readFileOrThrow(path: string, what: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new ExecutionError(`cannot read ${what} "${path}": ${errorMessage(error)}`);
  }
}

function violationLines(violations: readonly Violation[]): string {
  return violations.map((v) => `  ${v.path}: ${v.message}`).join("\n");
}

/**
 * `--restrict-refs [dir]` as Commander delivers it: `undefined` (absent),
 * `true` (bare flag), or a string value. `false` never occurs for an
 * optional-value flag but the type keeps optsWithGlobals() honest.
 */
type RestrictRefsFlag = string | boolean | undefined;

/** Normalize the Commander flag to the pipeline/runner option shape. */
function restrictRefsOpt(flag: RestrictRefsFlag): { restrictRefs?: string | true } {
  return flag === undefined || flag === false
    ? {}
    : { restrictRefs: flag === true ? true : flag };
}

/** One-line-per-mode help text for `--restrict-refs` (FR-003). */
const RESTRICT_REFS_HELP =
  "confine §7.2 reference loading (omitted: unrestricted, shipped behavior; " +
  "bare: restrict to the root soul document's directory; " +
  "with <dir>: restrict to that directory, resolved from cwd)";

/** Run the static pipeline on one soul file (FR-012, FR-024). */
async function checkSoulFile(
  soulPath: string,
  opts: { profile?: string; state?: string; mode: Mode; restrictRefs?: string | true }
): Promise<CheckResult> {
  const abs = toAbsolute(soulPath);
  const raw = await readFileOrThrow(abs, "soul document");
  // --restrict-refs mapping (FR-003): absent → unrestricted (NFR-001);
  // bare → the root soul's directory; value → that directory from cwd.
  let restrictTo: string | undefined;
  if (opts.restrictRefs === undefined) {
    restrictTo = undefined;
  } else if (opts.restrictRefs === true) {
    restrictTo = dirname(abs);
  } else {
    restrictTo = resolvePath(opts.restrictRefs);
  }
  const loadRef = makeFsLoadRef(
    (refRaw, refPath) => rfc1Adapter.parse(refRaw, refPath, opts.mode),
    restrictTo === undefined ? undefined : { restrictTo }
  );
  const checkOpts: { profile?: string; state?: string; mode: Mode } = {
    mode: opts.mode,
  };
  if (opts.profile !== undefined) checkOpts.profile = opts.profile;
  if (opts.state !== undefined) checkOpts.state = opts.state;
  return checkSoul(rfc1Adapter, raw, abs, checkOpts, loadRef);
}

/** Global flags every subcommand sees via optsWithGlobals(). */
interface GlobalOpts {
  mode: Mode;
  json?: boolean;
}

interface Io {
  /** Write to stdout WITHOUT a trailing newline (canonical-json needs raw bytes). */
  out: (text: string) => void;
  /** stdout line. */
  outLine: (text: string) => void;
  /** stderr line. */
  errLine: (text: string) => void;
}

/** Positive-integer Commander parser (e.g. --runs). */
function parsePositiveInt(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError("must be an integer ≥ 1");
  }
  return parsed;
}

/** Finite-number Commander parser (e.g. --temperature). */
function parseFiniteNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new InvalidArgumentError("must be a number");
  }
  return parsed;
}

// Adapter registry: maps --adapter values to adapter factory functions (C-004).
const ADAPTER_REGISTRY: Record<string, () => InstanceType<typeof HeartbeatAdapter> | InstanceType<typeof A2aAdapter>> = {
  heartbeat: () => new HeartbeatAdapter(),
  a2a: () => new A2aAdapter(),
};

// ─── muster check ───────────────────────────────────────────────────────────

async function doCheck(
  soul: string,
  opts: GlobalOpts & { adapter?: string; profile?: string; state?: string; restrictRefs?: string | boolean },
  io: Io
): Promise<number> {
  // Heartbeat adapter path: runs the heartbeat lint pipeline (not Soul.md RFC-1).
  if (opts.adapter === "heartbeat") {
    const abs = toAbsolute(soul);
    const report = await checkHeartbeatFile(abs);
    io.outLine(serializeLintReport(report));
    return report.ok ? 0 : 1;
  }
  // A2A adapter path: runs the A2A static-lint pipeline (offline, deterministic).
  if (opts.adapter === "a2a") {
    const abs = toAbsolute(soul);
    const raw = await readFileOrThrow(abs, "agent card");
    const card = parseAgentCard(raw, abs);
    const report = a2aLintCard(card);
    io.outLine(a2aSerializeLintReport(report));
    return report.ok ? 0 : 1;
  }
  const { report } = await checkSoulFile(soul, {
    mode: opts.mode,
    ...(opts.profile !== undefined && { profile: opts.profile }),
    ...(opts.state !== undefined && { state: opts.state }),
    ...restrictRefsOpt(opts.restrictRefs),
  });
  // The §25.1 report IS the requested artifact — stdout in both renderings.
  io.outLine(
    opts.json === true ? JSON.stringify(report, null, 2) : formatReportHuman(report)
  );
  return report.ok ? 0 : 1;
}

// ─── muster resolve ─────────────────────────────────────────────────────────

async function doResolve(
  soul: string,
  opts: GlobalOpts & {
    profile?: string;
    state?: string;
    outputFormat: string;
    restrictRefs?: string | boolean;
  },
  io: Io
): Promise<number> {
  const { report, effective } = await checkSoulFile(soul, {
    mode: opts.mode,
    ...(opts.profile !== undefined && { profile: opts.profile }),
    ...(opts.state !== undefined && { state: opts.state }),
    ...restrictRefsOpt(opts.restrictRefs),
  });
  if (!report.ok || effective === null) {
    // Contract: resolution errors → report on stderr, exit 1.
    io.errLine(
      opts.json === true ? JSON.stringify(report, null, 2) : formatReportHuman(report)
    );
    return 1;
  }
  switch (opts.outputFormat) {
    case "canonical-json":
      // RFC 8785 bytes verbatim — NO trailing newline (Appendix F.2, SC-004).
      io.out(canonicalJson(effective));
      break;
    case "json":
      io.outLine(JSON.stringify(effective, null, 2));
      break;
    case "yaml":
      // yaml.stringify already ends with a newline.
      io.out(stringifyYaml(effective));
      break;
  }
  return 0;
}

// ─── muster cts run ─────────────────────────────────────────────────────────

async function doCtsRun(
  manifest: string,
  opts: GlobalOpts & { filter?: string; restrictRefs?: string | boolean },
  io: Io
): Promise<number> {
  const loaded = await loadManifest(toAbsolute(manifest));
  if (isManifestError(loaded)) {
    throw new ExecutionError(
      `CTS manifest failed Appendix F.1 validation:\n${violationLines(loaded)}`
    );
  }
  const runOpts: RunCtsOptions = {};
  if (opts.filter !== undefined) {
    runOpts.filter = (id: string) => globToRegExp(opts.filter as string).test(id);
  }
  // --restrict-refs (FR-003): bare → each case's root soul directory (the
  // runner resolves it per case); value → one fixed directory from cwd.
  if (opts.restrictRefs !== undefined && opts.restrictRefs !== false) {
    runOpts.restrictRefs =
      opts.restrictRefs === true ? true : resolvePath(opts.restrictRefs);
  }
  const results = await runCts(rfc1Adapter, loaded, runOpts);
  io.outLine(
    opts.json === true ? JSON.stringify(results, null, 2) : formatCtsHuman(results)
  );
  return results.every((result) => result.passed) ? 0 : 1;
}

// ─── muster behave run ──────────────────────────────────────────────────────

interface BehaveOpts extends GlobalOpts {
  baseUrl?: string;
  model?: string;
  temperature?: number;
  runs?: number;
  restrictRefs?: string | boolean;
  /** Cassette directory for --record/--replay (FR-016). */
  cassette?: string;
  /** Record a cassette from a live endpoint into --cassette <dir> (FR-007/008). */
  record?: boolean;
  /** Replay a previously recorded cassette from --cassette <dir> (FR-007/009). */
  replay?: boolean;
}

/**
 * Contract: key only from MUSTER_API_KEY, falling back to OPENAI_API_KEY.
 * Only the env-var NAME is chosen here — the VALUE is read by the client at
 * call time and never stored or logged (charter directive 5).
 */
function effectiveApiKeyEnv(
  configured: EndpointConfig["apiKeyEnv"]
): EndpointConfig["apiKeyEnv"] {
  if (
    configured === "MUSTER_API_KEY" &&
    (process.env["MUSTER_API_KEY"] === undefined || process.env["MUSTER_API_KEY"] === "") &&
    process.env["OPENAI_API_KEY"] !== undefined &&
    process.env["OPENAI_API_KEY"] !== ""
  ) {
    return "OPENAI_API_KEY";
  }
  return configured;
}

/**
 * Append a `(replayed: true)` marker to the summary line of a human-readable
 * behave report — Hazard 2's "spirit" extension of FR-017 to the
 * human-readable output path (only `--json` is named literally by FR-017).
 * Replay-only caller (Hazard 2).
 */
function withReplayedMarker(human: string): string {
  const lines = human.split("\n");
  const lastIndex = lines.length - 1;
  lines[lastIndex] = `${lines[lastIndex]} (replayed: true)`;
  return lines.join("\n");
}

/**
 * Hazard 3 / NFR-002: a replay-only COPY of `verdicts` with every
 * `transcript.durationMs` normalized to 0 — three levels deep
 * (`CaseVerdict[] -> RunVerdict[] -> Transcript`) — so two `--replay`
 * invocations of the same suite emit byte-identical `--json`/human output
 * despite real (non-deterministic) in-process wall-clock jitter
 * (`runCase`'s timing wrapper has zero cassette-mode awareness and stamps a
 * real `Date.now()`-measured duration regardless of mode). A shallow copy
 * would alias and mutate the `RunVerdict`/`Transcript` objects `runCase`
 * returns — which the exit-code logic below still reads from the ORIGINAL
 * `verdicts` — so every level is copied explicitly. Gated strictly on the
 * replay-only call site below (never on non-replay output, NFR-006).
 */
export function normalizeDurationsForReplay(verdicts: readonly CaseVerdict[]): CaseVerdict[] {
  return verdicts.map((verdict) => ({
    ...verdict,
    runs: verdict.runs.map((run) => ({
      ...run,
      transcript: { ...run.transcript, durationMs: 0 },
    })),
  }));
}

// FR-016: --cassette/--record/--replay flag discipline, checked before the
// manifest is even loaded so it never depends on manifest validity.
function validateCassetteFlags(opts: BehaveOpts): void {
  if (opts.record === true && opts.replay === true) {
    throw new ExecutionError("behave run: --record and --replay are mutually exclusive");
  }
  if ((opts.record === true || opts.replay === true) && opts.cassette === undefined) {
    throw new ExecutionError("behave run: --record/--replay requires --cassette <dir>");
  }
  if (opts.cassette !== undefined && opts.record !== true && opts.replay !== true) {
    throw new ExecutionError("behave run: --cassette requires --record or --replay");
  }
}

// FR-014/015: resolve the replay run count from the cassette suite index
// before other resolution; a missing index/case defers to the per-case
// FR-013 stale path (Hazard 1). Conflicting --runs fails first, naming
// both counts (FR-015).
function resolveReplaySuiteIndex(
  opts: BehaveOpts,
  cases: readonly BehavioralCase[]
): CassetteSuiteIndex | undefined {
  if (opts.replay !== true || opts.cassette === undefined) return undefined;
  const suiteIndex = readCassetteSuiteIndex(opts.cassette);
  if (opts.runs === undefined || suiteIndex === undefined) return suiteIndex;
  for (const kase of cases) {
    const recorded = suiteIndex.cases.find((c) => c.id === kase.id);
    if (recorded !== undefined && recorded.runs !== opts.runs) {
      throw new ExecutionError(
        `behave run --replay: --runs ${opts.runs} conflicts with the cassette's recorded run count ${recorded.runs} for case "${kase.id}"`
      );
    }
  }
  return suiteIndex;
}

// Static gate first: never grade against a non-conforming persona.
function assertCaseSoulConforms(
  kase: BehavioralCase,
  check: CheckResult,
  opts: BehaveOpts,
  io: Io
): void {
  if (check.report.ok && check.effective !== null) return;
  io.errLine(`case "${kase.id}": soul "${kase.soul}" is not conforming — static report:`);
  io.errLine(opts.json === true ? JSON.stringify(check.report, null, 2) : formatReportHuman(check.report));
  throw new ExecutionError(`behavioral run aborted: non-conforming soul for case "${kase.id}"`);
}

// --runs overrides the manifest-resolved n; k clamps so k ≤ n holds. In
// replay mode, the recorded per-case count wins over --runs (FR-014).
function resolveCaseRunConfig(
  kase: BehavioralCase,
  opts: BehaveOpts,
  suiteIndex: CassetteSuiteIndex | undefined
): BehavioralCase {
  const recordedRuns = suiteIndex?.cases.find((c) => c.id === kase.id)?.runs;
  const resolvedRuns =
    opts.replay === true && recordedRuns !== undefined ? recordedRuns : opts.runs;
  if (resolvedRuns === undefined) return kase;
  return {
    ...kase,
    runs: resolvedRuns,
    pass_threshold: Math.min(kase.pass_threshold, resolvedRuns),
  };
}

// Per-case cassette decoration (FR-007..010): constructed fresh per case.
function buildCaseClient(
  client: ChatClient,
  opts: BehaveOpts,
  caseId: string,
  endpoint: EndpointConfig
): { caseClient: ChatClient; recordSink: CassetteExchange[] | undefined } {
  if (opts.cassette !== undefined && opts.record === true) {
    const recordSink: CassetteExchange[] = [];
    const caseClient = makeCassetteClient(client, { mode: "record", caseId, recordSink, endpoint });
    return { caseClient, recordSink };
  }
  if (opts.cassette !== undefined && opts.replay === true) {
    const replaySource = readCassetteCase(opts.cassette, caseId)?.exchanges ?? [];
    const caseClient = makeCassetteClient(client, { mode: "replay", caseId, replaySource });
    return { caseClient, recordSink: undefined };
  }
  return { caseClient: client, recordSink: undefined };
}

// Hazard 2 (FR-017): only --replay wraps the array as { replayed, verdicts
// }; every other invocation keeps emitting the bare array (NFR-006).
function emitBehaveOutput(io: Io, opts: BehaveOpts, verdicts: CaseVerdict[]): void {
  if (opts.replay === true) {
    // Hazard 3 (NFR-002): normalize durationMs to 0 in a COPY — originals are untouched.
    const normalized = normalizeDurationsForReplay(verdicts);
    io.outLine(opts.json === true
      ? JSON.stringify({ replayed: true, verdicts: normalized }, null, 2)
      : withReplayedMarker(formatBehaveHuman(normalized)));
    return;
  }
  io.outLine(opts.json === true ? JSON.stringify(verdicts, null, 2) : formatBehaveHuman(verdicts));
}

async function doBehaveRun(
  manifestPath: string,
  opts: BehaveOpts,
  io: Io,
  clientFactory: (endpoint: EndpointConfig) => ChatClient
): Promise<number> {
  validateCassetteFlags(opts);

  const loaded = await loadBehavioralManifest(toAbsolute(manifestPath));
  if (isBehavioralManifestError(loaded)) {
    throw new ExecutionError(
      `behavioral manifest failed validation:\n${violationLines(loaded)}`
    );
  }

  // Contract precedence: flags override the manifest endpoint/defaults.
  const endpoint: EndpointConfig = {
    baseUrl: opts.baseUrl ?? loaded.endpoint.baseUrl,
    model: opts.model ?? loaded.endpoint.model,
    apiKeyEnv: effectiveApiKeyEnv(loaded.endpoint.apiKeyEnv),
  };
  const runnerOpts: RunnerOptions = {
    model: endpoint.model,
    baseUrl: endpoint.baseUrl,
    temperature: opts.temperature ?? loaded.defaults.temperature,
  };
  const client = clientFactory(endpoint);

  const suiteIndex = resolveReplaySuiteIndex(opts, loaded.cases);
  const recordedSuiteCases: { id: string; runs: number }[] = [];
  const verdicts: CaseVerdict[] = [];
  for (const kase of loaded.cases) {
    // Static gate first: never grade against a non-conforming persona.
    // --restrict-refs bare maps to each case's soul directory (FR-003).
    const check = await checkSoulFile(kase.soul, {
      mode: opts.mode,
      ...(kase.profile !== undefined && { profile: kase.profile }),
      ...(kase.state !== undefined && { state: kase.state }),
      ...restrictRefsOpt(opts.restrictRefs),
    });
    assertCaseSoulConforms(kase, check, opts, io);
    const applied = resolveCaseRunConfig(kase, opts, suiteIndex);
    const { caseClient, recordSink } = buildCaseClient(client, opts, kase.id, endpoint);
    verdicts.push(await runCase(rfc1Adapter, check, applied, caseClient, runnerOpts));

    if (recordSink !== undefined && opts.cassette !== undefined) {
      writeCassetteCase(opts.cassette, {
        schemaVersion: CASSETTE_SCHEMA_VERSION,
        caseId: kase.id,
        exchanges: recordSink,
      });
      recordedSuiteCases.push({ id: kase.id, runs: applied.runs });
    }
  }

  if (opts.cassette !== undefined && opts.record === true) {
    writeCassetteSuiteIndex(opts.cassette, {
      schemaVersion: CASSETTE_SCHEMA_VERSION,
      suiteId: toAbsolute(manifestPath),
      cases: recordedSuiteCases,
      recordedAt: new Date().toISOString(),
    });
  }

  emitBehaveOutput(io, opts, verdicts);

  // Exit discipline: mid-suite endpoint errors fail cases and exit 1; an
  // endpoint unreachable for the ENTIRE run (every run of every case errored)
  // is an execution failure → 2 (contracts/cli.md exit codes). Hazard 1:
  // replay never touches a live endpoint (NFR-003) so this heuristic's
  // premise — "maybe the endpoint is down" — never applies in replay mode;
  // gated off entirely so an all-stale replay still exits via the normal
  // pass/fail path below, per FR-013 ("never 0, never a skip code" — never
  // exit 2 either).
  const allRuns = verdicts.flatMap((verdict) => verdict.runs);
  if (
    opts.replay !== true &&
    allRuns.length > 0 &&
    allRuns.every((run) => run.error !== undefined)
  ) {
    io.errLine(
      "endpoint fatal: every run of every case errored — treating as an execution error (exit 2)"
    );
    return 2;
  }
  return verdicts.every((verdict) => verdict.passed) ? 0 : 1;
}

// ─── muster memory run ──────────────────────────────────────────────────────

/**
 * Run the memory adapter manifest runner (FR-001, FR-011).
 *
 * The manifest is a JSON file that lists static lint cases and optionally
 * behavioral recall / privacy probe cases. Only the static path runs by
 * default (offline, deterministic, byte-stable — NFR-001, C-003).
 */
async function doMemoryRun(
  manifestPath: string,
  opts: GlobalOpts & { behavioral?: boolean; baseUrl?: string; model?: string },
  io: Io
): Promise<number> {
  const absManifestPath = toAbsolute(manifestPath);
  let manifest: AdapterManifest;
  try {
    const raw = await readFileOrThrow(absManifestPath, "memory manifest");
    manifest = JSON.parse(raw) as AdapterManifest;
  } catch (error) {
    throw new ExecutionError(
      `memory manifest read/parse error: ${errorMessage(error)}`
    );
  }

  const adapterOptions: AdapterOptions = {
    behavioral: opts.behavioral === true,
    // Relative case paths resolve against the manifest's own directory, so the
    // command works regardless of cwd (matches the other adapters).
    manifestDir: dirname(absManifestPath),
  };

  if (opts.behavioral === true) {
    adapterOptions.endpoint = {
      baseUrl: opts.baseUrl ?? "http://localhost:11434/v1",
      model: opts.model ?? "llama3.2",
      apiKeyEnv: "MUSTER_API_KEY" as const,
    };
  }

  const adapter = createMemoryAdapter();
  let result;
  try {
    result = await adapter.run(manifest, adapterOptions);
  } catch (error) {
    throw new ExecutionError(
      `memory adapter run failed: ${errorMessage(error)}`
    );
  }

  io.outLine(opts.json === true ? JSON.stringify(result, null, 2) : formatMemoryResultHuman(result));
  return result.ok ? 0 : 1;
}

/**
 * Human-readable formatting for memory AdapterResult.
 */
function formatMemoryResultHuman(result: import("../adapters/memory/index.js").AdapterResult): string {
  const lines: string[] = [];
  lines.push(`memory: ${result.ok ? "PASS" : "FAIL"} — ${result.summary}`);
  if (result.findings.length > 0) {
    lines.push(`findings (${result.findings.length}):`);
    for (const f of result.findings) {
      if (f.kind === "staleness") {
        lines.push(
          `  [staleness] ${f.factId}: age=${f.ageInDays}d — ${f.factText.slice(0, 60)}`
        );
      } else if (f.kind === "contradiction") {
        lines.push(
          `  [contradiction] ${f.factAId} ↔ ${f.factBId}`
        );
      } else if (f.kind === "recall" || f.kind === "privacy") {
        lines.push(
          `  [${f.kind}] ${f.probeId}: ${f.pass ? "PASS" : "FAIL"}`
        );
      }
    }
  }
  return lines.join("\n");
}

// ─── muster memory-utilization run ──────────────────────────────────────────

/**
 * Every methodological check the memory-utilization pipeline always performs
 * for a case, cited back to muster's published rubric (FR-012). Attached
 * verbatim to every emitted case in the JSON report — see
 * `docs/rubric/memory-utilization-taxonomy.md` for the prose per clause.
 *
 * Two rubric clauses are deliberately NOT attached here: §4.2/§4.3 (the
 * beta-binomial `pass^k` posterior derivation) describe a statistical
 * machinery (`conjunctivePassKPosterior`, `src/core/behavioral/stats/
 * passk.ts`) that this adapter's abstention aggregation does not yet call
 * (it uses the simpler boolean `conjunctivePassK` conjunction instead) —
 * citing the posterior derivation for a check that does not use it would
 * misrepresent what was actually computed. Likewise §5.1/§5.2 (judge-bias
 * cancellation / arm-order blinding) apply only when an LLM judge grades
 * probes; WP03's grading is mechanical (fact-substring / refusal), so those
 * two clauses are not yet exercised by any check this report emits.
 */
const MEMORY_UTILIZATION_CITATIONS: Readonly<Record<string, string>> = {
  liftDefinition: MEMORY_UTILIZATION_RUBRIC_CITATIONS.LIFT_DEFINITION,
  baselineValidity: MEMORY_UTILIZATION_RUBRIC_CITATIONS.BASELINE_VALIDITY,
  scrambledControl: MEMORY_UTILIZATION_RUBRIC_CITATIONS.SCRAMBLED_CONTROL,
  contaminationGate: MEMORY_UTILIZATION_RUBRIC_CITATIONS.CONTAMINATION_GATE,
  abstention: MEMORY_UTILIZATION_RUBRIC_CITATIONS.ABSTENTION,
  abstentionUnderMemory: MEMORY_UTILIZATION_RUBRIC_CITATIONS.ABSTENTION_UNDER_MEMORY,
  singleArmCI: MEMORY_UTILIZATION_RUBRIC_CITATIONS.SINGLE_ARM_CI,
  pairedSignificance: MEMORY_UTILIZATION_RUBRIC_CITATIONS.PAIRED_SIGNIFICANCE,
  deltaCI: MEMORY_UTILIZATION_RUBRIC_CITATIONS.DELTA_CI,
  powerMde: MEMORY_UTILIZATION_RUBRIC_CITATIONS.POWER_MDE,
  verdictSemantics: MEMORY_UTILIZATION_RUBRIC_CITATIONS.VERDICT_SEMANTICS,
  doubleConfirmation: MEMORY_UTILIZATION_RUBRIC_CITATIONS.DOUBLE_CONFIRMATION,
  contaminationVeto: MEMORY_UTILIZATION_RUBRIC_CITATIONS.CONTAMINATION_VETO,
};

/** FR-008: a `no-lift` verdict rendered as a bounded/powered null, never bare absence of evidence. */
interface MemoryUtilizationNoLiftRendering {
  /** `bounded-powered-null`: the CI clears the threshold from above (a genuine powered null). */
  readonly kind: "bounded-powered-null" | "underpowered-inconclusive";
  readonly mde: number;
  readonly liftThreshold: number;
  readonly ciExcludesLiftThreshold: boolean;
  readonly note: string;
  readonly rubricCitation: string;
}

/** One case's entry in the emitted memory-utilization JSON report. */
interface MemoryUtilizationReportCase {
  readonly caseId: string;
  readonly ok: boolean;
  readonly measurement: MemoryUtilizationLiftMeasurement;
  readonly noLiftRendering?: MemoryUtilizationNoLiftRendering;
  readonly pairedOutcomes: readonly MemoryUtilizationPairedOutcome[];
  readonly contamination: readonly MemoryUtilizationContaminationResult[];
  readonly scrambledControl: MemoryUtilizationScrambledControlResult;
  readonly allRefuseGuard: MemoryUtilizationAllRefuseGuardResult;
  readonly abstention: MemoryUtilizationAbstentionResult;
  readonly capOfZeroFailedAsDesigned: boolean;
  readonly citations: Readonly<Record<string, string>>;
}

/** The machine-readable memory-utilization run report (data-model.md `Report`). */
interface MemoryUtilizationReport {
  readonly ok: boolean;
  readonly summary: string;
  readonly rubricDocPath: string;
  /** 0 conforming | 1 any failed/no-lift/contaminated/baseline-invalid (FR-008/FR-010/FR-012). */
  readonly exitCode: 0 | 1;
  readonly cases: readonly MemoryUtilizationReportCase[];
}

/**
 * Render `measurement`'s `no-lift` verdict as the bounded/powered null FR-008
 * requires: never bare "absence of evidence". Returns `undefined` for every
 * other verdict — the rendering only applies to `no-lift`.
 *
 * `evaluateMemoryUtilizationLiftVerdict` re-derives the CI-vs-threshold
 * comparison the adapter's own `resolveVerdict` (verdict.ts) already made
 * internally, purely to distinguish two DIFFERENT reasons a case can read
 * `no-lift` (spec.md edge cases): a genuine powered null (the CI's upper
 * bound sits entirely below the declared threshold) vs. an under-powered
 * draw (the threshold falls inside the CI) — the achievable MDE is reported
 * either way.
 */
function buildMemoryUtilizationNoLiftRendering(
  measurement: MemoryUtilizationLiftMeasurement,
  liftThreshold: number
): MemoryUtilizationNoLiftRendering | undefined {
  if (measurement.verdict !== "no-lift") return undefined;
  const bounded = evaluateMemoryUtilizationLiftVerdict(measurement.deltaCI, liftThreshold);
  const ciExcludesLiftThreshold = bounded.verdict === "no-lift";
  const mde = measurement.mde.toFixed(4);
  const lower = measurement.deltaCI.lower.toFixed(4);
  const upper = measurement.deltaCI.upper.toFixed(4);
  const note = ciExcludesLiftThreshold
    ? `the lift delta's CI [${lower}, ${upper}] lies entirely below the declared lift threshold ` +
      `(${liftThreshold}) — a bounded/powered null at MDE=${mde} for ${measurement.probeCount} probes ` +
      "(FR-008), never bare absence of evidence."
    : `the probe count (n=${measurement.probeCount}) is underpowered to resolve a lift at the declared ` +
      `threshold (${liftThreshold}) — the CI [${lower}, ${upper}] straddles it; the achievable minimum ` +
      `detectable effect is MDE=${mde} — flagged under-powered, not a bare "no-lift" claim ` +
      "(spec.md edge case).";
  return {
    kind: ciExcludesLiftThreshold ? "bounded-powered-null" : "underpowered-inconclusive",
    mde: measurement.mde,
    liftThreshold,
    ciExcludesLiftThreshold,
    note,
    rubricCitation: MEMORY_UTILIZATION_RUBRIC_CITATIONS.POWER_MDE,
  };
}

/** The case's declared lift threshold — every `AdapterResult` case has a matching manifest case. */
function memoryUtilizationLiftThreshold(
  manifestCases: readonly LearningLiftCase[],
  caseId: string
): number {
  const kase = manifestCases.find((c) => c.id === caseId);
  if (kase === undefined) {
    throw new ExecutionError(
      `memory-utilization: adapter result case "${caseId}" not found in the manifest`
    );
  }
  return kase.thresholds.liftDelta;
}

function buildMemoryUtilizationCaseReport(
  caseResult: MemoryUtilizationCaseResult,
  liftThreshold: number
): MemoryUtilizationReportCase {
  const noLiftRendering = buildMemoryUtilizationNoLiftRendering(caseResult.measurement, liftThreshold);
  return {
    caseId: caseResult.caseId,
    ok: caseResult.ok,
    measurement: caseResult.measurement,
    ...(noLiftRendering !== undefined && { noLiftRendering }),
    pairedOutcomes: caseResult.pairedOutcomes,
    contamination: caseResult.contamination,
    scrambledControl: caseResult.scrambledControl,
    allRefuseGuard: caseResult.allRefuseGuard,
    abstention: caseResult.abstention,
    capOfZeroFailedAsDesigned: caseResult.capOfZeroFailedAsDesigned,
    citations: MEMORY_UTILIZATION_CITATIONS,
  };
}

/** Build the emitted JSON report (FR-008, FR-012) from one adapter run. */
function buildMemoryUtilizationReport(
  manifest: LearningLiftManifest,
  result: MemoryUtilizationAdapterResult
): MemoryUtilizationReport {
  const cases = result.cases.map((caseResult) =>
    buildMemoryUtilizationCaseReport(
      caseResult,
      memoryUtilizationLiftThreshold(manifest.cases, caseResult.caseId)
    )
  );
  return {
    ok: result.ok,
    summary: result.summary,
    rubricDocPath: MEMORY_UTILIZATION_RUBRIC_DOC_PATH,
    exitCode: result.ok ? 0 : 1,
    cases,
  };
}

/** Resolve one case's fixture paths against the manifest's own directory (matches the other adapters). */
function resolveMemoryUtilizationFixtureRef(
  ref: MemoryFixtureRef,
  manifestDir: string
): MemoryFixtureRef {
  return {
    memoryPath: resolvePath(manifestDir, ref.memoryPath),
    userPath: resolvePath(manifestDir, ref.userPath),
    manifestPath: resolvePath(manifestDir, ref.manifestPath),
  };
}

/**
 * Relative `fixture.{memoryPath,userPath,manifestPath}` values resolve
 * against the manifest's own directory, so the command works regardless of
 * cwd (matches memory/heartbeat/skills — path-resolution.test.ts).
 */
function resolveMemoryUtilizationManifestPaths(
  manifest: LearningLiftManifest,
  manifestDir: string
): LearningLiftManifest {
  return {
    cases: manifest.cases.map((kase) => ({
      ...kase,
      fixture: resolveMemoryUtilizationFixtureRef(kase.fixture, manifestDir),
    })),
  };
}

async function loadMemoryUtilizationManifest(absManifestPath: string): Promise<LearningLiftManifest> {
  try {
    const raw = await readFileOrThrow(absManifestPath, "memory-utilization manifest");
    return JSON.parse(raw) as LearningLiftManifest;
  } catch (error) {
    throw new ExecutionError(
      `memory-utilization manifest read/parse error: ${errorMessage(error)}`
    );
  }
}

interface MemoryUtilizationRunOpts extends GlobalOpts {
  baseUrl?: string;
  model?: string;
}

/**
 * Resolve the behavioral endpoint for `memory-utilization run` (NFR-003/
 * NFR-005: BYOM, credentials from the environment only). Precedence:
 * `--base-url`/`--model` flags, then `MUSTER_ENDPOINT`/`MUSTER_MODEL`, then
 * the same local-Ollama default the `memory` adapter's behavioral path uses.
 * Unlike the other adapters this capability has no static-only path (C-002:
 * it IS the behavioral suite) — an endpoint is always constructed so the
 * injected `clientFactory` seam (tests, CI smoke) always has one to build
 * from; a genuinely unreachable endpoint surfaces as per-run errors (FR-009:
 * an errored run counts as a failed run), not a silent skip.
 */
function resolveMemoryUtilizationEndpoint(opts: MemoryUtilizationRunOpts): EndpointConfig {
  const baseUrl = opts.baseUrl ?? process.env["MUSTER_ENDPOINT"] ?? "http://localhost:11434/v1";
  const model = opts.model ?? process.env["MUSTER_MODEL"] ?? "llama3.2";
  return { baseUrl, model, apiKeyEnv: effectiveApiKeyEnv("MUSTER_API_KEY") };
}

/**
 * Run the memory-utilization / learning-lift conformance manifest (FR-001,
 * FR-002, FR-004..FR-010, wired here per FR-008/FR-010/FR-012).
 *
 * Exit-code contract (data-model.md `Report.exitCode`):
 *   0 — every case conforms (lift-confirmed, every control/guard held).
 *   1 — any case failed/no-lift/contaminated/baseline-invalid.
 *   2 — manifest could not be read/parsed, or the adapter run itself errored.
 */
async function doMemoryUtilizationRun(
  manifestPath: string,
  opts: MemoryUtilizationRunOpts,
  io: Io,
  clientFactory: (endpoint: EndpointConfig) => ChatClient
): Promise<number> {
  const absManifestPath = toAbsolute(manifestPath);
  const rawManifest = await loadMemoryUtilizationManifest(absManifestPath);
  const manifest = resolveMemoryUtilizationManifestPaths(rawManifest, dirname(absManifestPath));

  const client = clientFactory(resolveMemoryUtilizationEndpoint(opts));
  const adapter = createMemoryUtilizationAdapter();

  let result: MemoryUtilizationAdapterResult;
  try {
    result = await adapter.run(manifest, { client });
  } catch (error) {
    throw new ExecutionError(`memory-utilization adapter run failed: ${errorMessage(error)}`);
  }

  const report = buildMemoryUtilizationReport(manifest, result);
  io.outLine(
    opts.json === true
      ? JSON.stringify(report, null, 2)
      : formatMemoryUtilizationResultHuman(report)
  );
  return report.exitCode;
}

/** Per-case detail lines (bounded null, controls, contamination, abstention) for the human summary. */
function memoryUtilizationCaseDetailLines(c: MemoryUtilizationReportCase): string[] {
  const lines: string[] = [];
  if (c.noLiftRendering !== undefined) {
    lines.push(`      bounded-null: ${c.noLiftRendering.note}`);
  }
  if (!c.scrambledControl.passed) {
    lines.push(`      scrambled-control: ${c.scrambledControl.reason}`);
  }
  if (c.allRefuseGuard.fired) {
    lines.push(`      all-refuse-guard: ${c.allRefuseGuard.reason}`);
  }
  if (c.measurement.contaminated) {
    lines.push(`      contaminated probes: ${c.measurement.contaminatedProbeIds.join(", ")}`);
  }
  if (!c.abstention.passed) {
    lines.push("      abstention: FAILED — a probe fabricated instead of abstaining (FR-007)");
  }
  return lines;
}

/** Human-readable formatting for the memory-utilization report. */
function formatMemoryUtilizationResultHuman(report: MemoryUtilizationReport): string {
  const statusWord = report.ok ? "PASS" : "FAIL";
  const lines: string[] = [`memory-utilization: ${statusWord} — ${report.summary}`];
  for (const c of report.cases) {
    const icon = c.ok ? "PASS" : "FAIL";
    lines.push(
      `  [${icon}] ${c.caseId}: verdict=${c.measurement.verdict} delta=${c.measurement.delta.toFixed(4)} ` +
        `mcnemarMidP=${c.measurement.mcnemarMidP.toFixed(4)} mde=${c.measurement.mde.toFixed(4)}`,
      ...memoryUtilizationCaseDetailLines(c)
    );
  }
  return lines.join("\n");
}

// ─── muster crosslayer run ──────────────────────────────────────────────────

/**
 * Resolve an endpoint config from environment variables for crosslayer run.
 *
 * Reads MUSTER_ENDPOINT (base URL), MUSTER_MODEL (model name), and
 * MUSTER_API_KEY / OPENAI_API_KEY (the env-var name, not the key value) from
 * the process environment. Returns undefined when MUSTER_ENDPOINT is not set.
 *
 * NFR-005: never stores the key value — only the env-var name is captured so
 * the manifest-runner can resolve it from process.env at call time.
 */
function endpointFromEnv(): EndpointManifestConfig | undefined {
  const baseUrl = process.env["MUSTER_ENDPOINT"];
  if (baseUrl === undefined || baseUrl === "") {
    return undefined;
  }
  const model = process.env["MUSTER_MODEL"] ?? "gpt-4o-mini";
  const apiKeyEnv =
    process.env["MUSTER_API_KEY"] !== undefined && process.env["MUSTER_API_KEY"] !== ""
      ? "MUSTER_API_KEY"
      : "OPENAI_API_KEY";
  return { base_url: baseUrl, model, api_key_env: apiKeyEnv };
}

/** Emit a crosslayer summary to the output sink and return the exit code. */
function emitCrossLayerSummary(summary: ManifestRunSummary, opts: GlobalOpts, io: Io): number {
  io.outLine(opts.json === true ? JSON.stringify(summary, null, 2) : formatCrossLayerResultHuman(summary));
  return summary.failed > 0 ? 1 : 0;
}

/**
 * Run crosslayer with --static-only (no endpoint required).
 * Extracted to reduce cognitive complexity of doCrossLayerRun (S3776).
 */
async function doCrossLayerStaticOnly(
  absManifestPath: string,
  opts: GlobalOpts,
  io: Io
): Promise<number> {
  let summary: ManifestRunSummary;
  try {
    summary = await runCrossLayerManifest(absManifestPath, { testClassFilter: "static" });
  } catch (error) {
    throw new ExecutionError(`crosslayer manifest run failed: ${errorMessage(error)}`);
  }
  return emitCrossLayerSummary(summary, opts, io);
}

/**
 * Run crosslayer without an env-supplied endpoint: attempt a full run, then
 * gracefully fall back to static-only when the manifest has no endpoint either.
 * Extracted to reduce cognitive complexity of doCrossLayerRun (S3776).
 */
async function doCrossLayerNoEnvEndpoint(
  absManifestPath: string,
  opts: GlobalOpts,
  io: Io
): Promise<number> {
  let summary: ManifestRunSummary;
  try {
    summary = await runCrossLayerManifest(absManifestPath);
  } catch (error) {
    const msg = errorMessage(error);
    if (msg.includes("endpoint") && msg.includes("required")) {
      // No endpoint configured anywhere — skip behavioral gracefully.
      io.errLine(
        "muster crosslayer: no endpoint configured (MUSTER_ENDPOINT not set, manifest has no endpoint block); " +
          "behavioral cases skipped — running static cases only"
      );
      try {
        summary = await runCrossLayerManifest(absManifestPath, { testClassFilter: "static" });
      } catch (staticError) {
        throw new ExecutionError(`crosslayer manifest run failed: ${errorMessage(staticError)}`);
      }
    } else {
      throw new ExecutionError(`crosslayer manifest run failed: ${msg}`);
    }
  }
  return emitCrossLayerSummary(summary, opts, io);
}

/**
 * Run the cross-layer manifest runner (FR-011, C-004).
 *
 * The manifest is a YAML file listing static composition/lint cases and
 * optionally behavioral rule-survival cases. Only the static path runs when
 * --static-only is specified (offline, deterministic — NFR-001, C-003).
 *
 * Behavioral endpoint resolution (NFR-005: credentials from env only):
 *   1. --static-only: only static cases run; no endpoint needed.
 *   2. MUSTER_ENDPOINT env var set: used as endpoint base URL; MUSTER_MODEL
 *      overrides the model (default: gpt-4o-mini); MUSTER_API_KEY or
 *      OPENAI_API_KEY supplies the credential name.
 *   3. Manifest has an endpoint block: used directly (api_key_env names the
 *      env var; the manifest runner resolves the value at call time).
 *   4. Neither env nor manifest endpoint: behavioral cases are skipped
 *      gracefully (static cases still run); no crash, no validation error.
 *
 * The manifest path is resolved to an absolute path before being passed to
 * runManifest so that $ref includes and layer fixturePaths resolve correctly
 * regardless of cwd (BUG-A fix: layer paths resolved against manifest dir).
 *
 * Normative citation: muster cross-layer conformance rubric
 * (cross-layer-conformance-01KTYKP2), FR-011; C-001, C-004; NFR-005.
 */
async function doCrossLayerRun(
  manifestPath: string,
  opts: GlobalOpts & { staticOnly?: boolean },
  io: Io
): Promise<number> {
  const absManifestPath = toAbsolute(manifestPath);

  if (opts.staticOnly === true) {
    return doCrossLayerStaticOnly(absManifestPath, opts, io);
  }

  // Behavioral run: source endpoint from env (priority) or manifest.
  const envEndpoint = endpointFromEnv();

  if (envEndpoint === undefined) {
    return doCrossLayerNoEnvEndpoint(absManifestPath, opts, io);
  }

  // Env endpoint present: pass as override so behavioral cases use it even
  // when the manifest carries no endpoint block.
  let summary: ManifestRunSummary;
  try {
    summary = await runCrossLayerManifest(absManifestPath, { endpointOverride: envEndpoint });
  } catch (error) {
    throw new ExecutionError(`crosslayer manifest run failed: ${errorMessage(error)}`);
  }
  return emitCrossLayerSummary(summary, opts, io);
}

// ─── muster heartbeat run ───────────────────────────────────────────────────

/**
 * Run the heartbeat adapter manifest runner (FR-011, T019).
 *
 * The manifest is a JSON file that lists static lint cases, interval-config
 * cases, and optionally behavioral cases (action-diff, idempotency, quiet-ack).
 * Static and interval-config cases always run (offline, deterministic,
 * byte-stable — NFR-001, C-003). Behavioral cases require MUSTER_ENDPOINT and
 * are skipped gracefully when it is absent.
 */
async function doHeartbeatRun(
  manifestPath: string,
  opts: GlobalOpts,
  io: Io
): Promise<number> {
  let summary: HeartbeatManifestSummary;
  try {
    // projectRoot omitted so relative checklist/fixture paths in the manifest
    // resolve against the manifest's own directory (the adapter's default),
    // making the command work regardless of cwd (matches the other adapters).
    summary = await runHeartbeatManifest(toAbsolute(manifestPath));
  } catch (error) {
    throw new ExecutionError(
      `heartbeat manifest run failed: ${errorMessage(error)}`
    );
  }

  io.outLine(
    opts.json === true
      ? JSON.stringify(summary, null, 2)
      : formatHeartbeatSummaryHuman(summary)
  );
  return summary.failed > 0 ? 1 : 0;
}

/** Map a case's skip/pass flags to a display icon (S3358: no nested ternary). */
function caseIcon(skipped: boolean, passed: boolean): string {
  if (skipped) return "SKIP";
  if (passed) return "PASS";
  return "FAIL";
}

/**
 * Human-readable formatting for cross-layer ManifestRunSummary.
 *
 * Normative citation: muster cross-layer conformance rubric, FR-011.
 */
function formatCrossLayerResultHuman(summary: ManifestRunSummary): string {
  const status = summary.failed === 0 ? "PASS" : "FAIL";
  const skippedSuffix = summary.skipped > 0 ? `, ${summary.skipped} skipped` : "";
  const lines: string[] = [
    `crosslayer: ${status} — ${summary.passed}/${summary.total} cases passed, ${summary.failed} failed${skippedSuffix}`,
  ];
  for (const result of summary.results) {
    const icon = caseIcon(result.skipped === true, result.passed);
    const detail = buildCaseDetail(result);
    lines.push(`  [${icon}] ${result.id}${detail}`);
  }
  return lines.join("\n");
}

/**
 * Human-readable formatting for heartbeat ManifestSummary.
 */
function formatHeartbeatSummaryHuman(summary: HeartbeatManifestSummary): string {
  const lines: string[] = [];
  const statusWord = summary.failed > 0 ? "FAIL" : "PASS";
  lines.push(
    `heartbeat: ${statusWord} — ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped of ${summary.totalCases}`
  );
  for (const result of summary.results) {
    if (result.skipped) {
      lines.push(`  SKIP ${result.id}: ${result.skipReason ?? "skipped"}`);
    } else if (result.passed) {
      lines.push(`  PASS ${result.id}: ${result.description}`);
    } else {
      lines.push(`  FAIL ${result.id}: ${result.description}`);
    }
  }
  return lines.join("\n");
}

/** Build the detail suffix for one case result line. */
function buildCaseDetail(result: ManifestRunSummary["results"][number]): string {
  if (result.error !== undefined) {
    return `: error — ${result.error}`;
  }
  if (result.verdict !== undefined) {
    return `: verdict=${result.verdict}`;
  }
  if (result.findings !== undefined && result.findings.length > 0) {
    return `: findings=[${result.findings.join(", ")}]`;
  }
  return "";
}

// ─── muster a2a run ─────────────────────────────────────────────────────────

/**
 * Handle the behavioral path for `muster a2a run <behavioral.yaml>` (WP04).
 *
 * Exit-code contract (FR-008):
 *   0 — all cases passed, or endpoint absent (all skipped).
 *   1 — ≥1 case failed.
 *   2 — every run of every case errored (execution failure).
 *
 * NFR-002: no secret ever printed; `--json` emits CaseVerdict[] only.
 *
 * Extracted from doA2aRun to keep cognitive complexity below 15.
 */
async function doA2aBehavioralRun(
  absManifestPath: string,
  opts: GlobalOpts,
  io: Io
): Promise<number> {
  const outcome = await runA2aBehavioralManifest(absManifestPath, rfc1Adapter);

  if (outcome.violations.length > 0) {
    const lines = outcome.violations.map((v) => `  ${v.path}: ${v.message}`).join("\n");
    throw new ExecutionError(
      `a2a behavioral manifest failed validation:\n${lines}`
    );
  }

  if (outcome.skipped) {
    // No endpoint configured — all cases skipped, exit 0 (FR-009).
    if (opts.json === true) {
      io.outLine("[]");
    } else {
      io.outLine(formatA2aBehavioralHuman([], true));
    }
    return 0;
  }

  const { result } = outcome;
  if (result === null) {
    // Should not happen when skipped=false and violations=[]; guard for type safety.
    throw new ExecutionError("a2a behavioral run: unexpected null result");
  }

  if (opts.json === true) {
    io.outLine(JSON.stringify(result.verdicts, null, 2));
  } else {
    io.outLine(formatA2aBehavioralHuman(result.verdicts, false));
  }

  if (result.allErrored) {
    io.errLine(
      "a2a-behavioral: endpoint fatal — every run of every case errored (exit 2)"
    );
    return 2;
  }

  return result.exitCode;
}

/**
 * Run the A2A adapter manifest runner (FR-001, FR-012).
 *
 * Routes by manifest `kind` (WP04, T020/FR-006):
 *   kind: behavioral → behavioral path (loadBehavioralManifest + runBehavioralCases).
 *   anything else    → static/skill/auth/signed path (runA2aManifest), byte-unchanged.
 *
 * Static path: JSON manifest listing static-lint, skill-behavior, auth-negative,
 * or signed-card-live cases. Static-lint always runs (offline, deterministic).
 * Live cases require MUSTER_A2A_ENDPOINT and are skipped gracefully when absent.
 *
 * Exit-code contract (FR-008/FR-012): summary.failed > 0 → 1; else → 0.
 * Skipped cases never fail the run. IO/manifest errors → exit 2 (ExecutionError).
 *
 * NFR-002: no credential ever printed; `--json` to stdout; human summary to stdout.
 */
async function doA2aRun(
  manifestPath: string,
  opts: GlobalOpts,
  io: Io
): Promise<number> {
  const absManifestPath = toAbsolute(manifestPath);

  // T020: peek at the `kind` field to route behavioral vs static (FR-006).
  // peekManifestKind lives in the adapter (adapter knowledge stays in adapters).
  // A JSON manifest (static path) will not have kind:"behavioral", so routing
  // is additive — the static path is byte-identical to before (NFR-001).
  const manifestKind = await peekManifestKind(absManifestPath);

  if (manifestKind === "behavioral") {
    return doA2aBehavioralRun(absManifestPath, opts, io);
  }

  // Static path (byte-identical behavior — additive routing only).
  let summary: A2aManifestSummary;
  try {
    // projectRoot defaults to cwd so that relative fixture paths in
    // the manifest resolve from the working directory (conventional root).
    summary = await runA2aManifest(absManifestPath, process.cwd());
  } catch (error) {
    throw new ExecutionError(
      `a2a manifest run failed: ${errorMessage(error)}`
    );
  }

  io.outLine(
    opts.json === true
      ? JSON.stringify(summary, null, 2)
      : formatA2aSummaryHuman(summary)
  );
  return summary.failed > 0 ? 1 : 0;
}

/**
 * Human-readable formatting for A2A ManifestSummary.
 *
 * Mirrors formatHeartbeatSummaryHuman — consistent output style across adapters.
 */
function formatA2aSummaryHuman(summary: A2aManifestSummary): string {
  const lines: string[] = [];
  const statusWord = summary.failed > 0 ? "FAIL" : "PASS";
  lines.push(
    `a2a: ${statusWord} — ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped of ${summary.totalCases}`
  );
  for (const result of summary.results) {
    if (result.skipped) {
      lines.push(`  SKIP ${result.id}: ${result.skipReason ?? "skipped"}`);
    } else if (result.passed) {
      lines.push(`  PASS ${result.id}: ${result.description}`);
    } else {
      lines.push(`  FAIL ${result.id}: ${result.description}`);
    }
  }
  return lines.join("\n");
}

// ─── muster skills run ──────────────────────────────────────────────────────

/** Shape of one case from skills-manifest.yaml. */
interface SkillsManifestStaticCase {
  id: string;
  type: "static";
  skillDir: string;
  profile: SkillProfile;
  expectations: { ok: boolean; violations: unknown[] };
}

interface SkillsManifestBehavioralCase {
  id: string;
  type: "behavioral";
  skillDir: string;
  profile: SkillProfile;
  querySetPath: string;
  runsPerQuery: number;
  threshold: number;
  isControl: boolean;
}

type SkillsManifestCase = SkillsManifestStaticCase | SkillsManifestBehavioralCase;

/** Structured result for a single skills case (for JSON output). */
interface SkillsCaseResult {
  id: string;
  type: "static" | "behavioral";
  passed: boolean;
  skipped?: boolean;
  violations?: { path: string; message: string; severity: string }[];
  // TriggerVerdict fields (FR-001, FR-005) — populated for non-skipped
  // behavioral cases; left undefined for static cases and skipped behavioral
  // cases. Kept as its own appendable group (not interleaved with the fields
  // above) so a later WP's own field addition to this interface is a clean,
  // low-conflict append rather than an interleaved diff.
  shouldTriggerAxis?: AxisVerdict;
  nearMissAxis?: AxisVerdict;
  isControl?: boolean;
  // FR-007 (muster#62): set when this case's own execution threw (a missing
  // or unreadable fixture, a parse/layout-check crash, ...) rather than
  // completing and being scored against its declared expectation. Kept
  // appended after WP01's own group above, never interleaved with it.
  // Distinguishes "execution error" (never derived from
  // `c.expectations.ok`) from "correctly detected non-conformance" — the
  // two were conflated by the pre-fix bug this field closes.
  errored?: boolean;
}

/** Structured result for the full skills manifest run. */
interface SkillsRunResult {
  ok: boolean;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  results: SkillsCaseResult[];
}

/**
 * Run one static skills case: parse + validate + layout check.
 * Returns a structured per-case result.
 *
 * @param c - The static case descriptor from the manifest.
 * @param baseDir - Directory used to resolve relative skillDir paths (cwd for
 *   skills manifests that use repo-root-relative paths; manifest dir for others).
 */
function runStaticSkillCase(
  c: SkillsManifestStaticCase,
  baseDir: string
): SkillsCaseResult {
  try {
    const absoluteSkillDir = resolvePath(baseDir, c.skillDir);
    const doc = parseSkill(absoluteSkillDir);
    const semanticViolations = validateSkill(doc, c.profile);
    const layoutViolations = checkLayout(doc);
    const allViolations = [...semanticViolations, ...layoutViolations];
    const hasError = allViolations.some((v) => v.severity === "error");
    const ok = !hasError;
    // A case "passes" when the actual lint outcome matches the expectation.
    const passed = ok === c.expectations.ok;
    return {
      id: c.id,
      type: "static",
      passed,
      violations: allViolations,
    };
  } catch (error) {
    // FR-007 (muster#62) fail-closed fix: an execution error (missing or
    // unreadable fixture, malformed frontmatter that crashes the parser,
    // ...) is never derived from the case's own declared expectation —
    // `c.expectations.ok` describes what a *completed* lint run should
    // find, not what should happen when the run never completes at all.
    // The pre-fix `passed: !expectOk` scored a missing fixture as a
    // correctly-detected non-conformance whenever the case happened to
    // expect `ok: false` — matching the fail-closed pattern already correct
    // elsewhere (crosslayer/manifest-runner.ts, core/cts/runner.ts,
    // core/behavioral/runner.ts, heartbeat's gradeStaticLintCase, tools'
    // uncaught-propagation path): errored = failed, always.
    return {
      id: c.id,
      type: "static",
      passed: false,
      errored: true,
      violations: [
        { path: "(document)", message: errorMessage(error), severity: "error" },
      ],
    };
  }
}

/**
 * Resolve the behavioral-case endpoint for `skills run` (FR-001, FR-002).
 *
 * Emits the MUSTER_BASE_URL deprecation notice on `io` (stderr) at most once
 * per run, and only when the manifest actually contains a behavioral case —
 * a manifest with zero behavioral cases never reaches this resolution at
 * all, so it never warns even if the deprecated alias happens to be set
 * (matches the current default-skip shape's own reachability).
 *
 * Returns `undefined` when no endpoint is configured (or the manifest has no
 * behavioral case) — callers fall back to today's `{ passed: true, skipped:
 * true }` shape unchanged (FR-001's AC-1b).
 */
function resolveSkillsBehavioralEndpoint(
  cases: readonly SkillsManifestCase[],
  io: Io
): EndpointConfig | undefined {
  const hasBehavioralCase = cases.some((c) => c.type === "behavioral");
  if (!hasBehavioralCase) {
    return undefined;
  }
  const { baseUrl, usedDeprecatedAlias } = resolveEndpointBaseUrl();
  if (usedDeprecatedAlias) {
    io.errLine(
      "muster: MUSTER_BASE_URL is deprecated — use MUSTER_ENDPOINT instead " +
        "(MUSTER_BASE_URL remains supported through v1.2.x; see FR-002)."
    );
  }
  if (baseUrl === undefined) {
    return undefined;
  }
  return {
    baseUrl,
    model: process.env["MUSTER_MODEL"] ?? "gpt-4o-mini",
    apiKeyEnv: effectiveApiKeyEnv("MUSTER_API_KEY"),
  };
}

/**
 * Read a skill frontmatter field as a string, or fall back. Guards against
 * SonarCloud typescript:S6551 (`String(x ?? fallback)` stringifies a
 * non-string object to "[object Object]" instead of using `fallback`) by
 * narrowing with `typeof` first, matching the existing idiom in
 * `src/adapters/skills/validate.ts`.
 */
function frontmatterStringField(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Run one behavioral skills case through the real `runTriggerConformance`
 * grader (FR-001, FR-005). Extracted from `doSkillsRun` to keep its own
 * cognitive complexity low (S3776).
 *
 * Mirrors the sanctioned reference call site (`tests/cts/skills-suite.test.ts`)
 * exactly: parses the target skill for its name/description, overrides the
 * description with the rigged-impossible control string for `isControl`
 * cases, loads the query set referenced by `querySetPath`, and reports the
 * real `TriggerVerdict` — never a hardcoded skip — through the CLI.
 */
async function runBehavioralSkillCase(
  c: SkillsManifestBehavioralCase,
  baseDir: string,
  endpoint: EndpointConfig,
  triggerClientFactory: (endpoint: EndpointConfig) => TriggerChatClient
): Promise<SkillsCaseResult> {
  const absoluteSkillDir = resolvePath(baseDir, c.skillDir);
  const querySetAbsPath = resolvePath(baseDir, c.querySetPath);
  const querySetRaw = parseYaml(readFileSync(querySetAbsPath, "utf8")) as {
    id: string;
    source: string;
    shouldTrigger: string[];
    nearMiss: string[];
  };
  const doc = parseSkill(absoluteSkillDir);
  const fm = doc.frontmatter as Record<string, unknown>;
  const description = c.isControl
    ? RIGGED_IMPOSSIBLE_DESCRIPTION
    : frontmatterStringField(fm["description"], "");
  // HIGH-1 fix: the tool name fed to `runTriggerConformance` must be
  // "rigged-impossible-control" for `isControl` cases — `trigger.ts` itself
  // derives its own `isControl` verdict from this exact tool name
  // (trigger.ts:420/467). Reporting `isControl: c.isControl` directly here
  // instead would paper over that: trigger.ts's own model-quality warning
  // (`if (isControl && passed)`) is keyed off its *internally* derived
  // isControl, so it would still never fire even if the CLI's reported
  // field looked correct. Setting the name here keeps trigger.ts's own
  // logic honest instead of masking its blind spot.
  const toolName = c.isControl
    ? "rigged-impossible-control"
    : frontmatterStringField(fm["name"], "skill");

  const triggerCase: TriggerCase = {
    id: c.id,
    skillDir: absoluteSkillDir,
    profile: c.profile,
    querySet: {
      id: querySetRaw.id,
      source: querySetRaw.source,
      shouldTrigger: querySetRaw.shouldTrigger,
      nearMiss: querySetRaw.nearMiss,
      threshold: c.threshold,
    },
    runsPerQuery: c.runsPerQuery,
    tools: [
      {
        type: "function",
        function: { name: toolName, description },
      },
    ],
    endpoint,
  };

  const client = triggerClientFactory(endpoint);
  const verdict = await runTriggerConformance(triggerCase, client);

  return {
    id: c.id,
    type: "behavioral",
    passed: verdict.passed,
    // Explicit false (not omitted): FR-001's AC-1a requires `skipped:false`
    // to appear literally in JSON output for an executed behavioral case,
    // distinguishing it from the omitted/absent field on static cases.
    skipped: false,
    shouldTriggerAxis: verdict.shouldTriggerAxis,
    nearMissAxis: verdict.nearMissAxis,
    isControl: verdict.isControl,
  };
}

/**
 * Wraps `runBehavioralSkillCase` so a case-level execution error (a missing
 * `skillDir` or `querySetPath`, or a malformed query-set/skill fixture) is
 * fail-closed for that one case — `{passed:false, skipped:false}` — instead
 * of an uncaught throw that aborts the entire manifest run (HIGH-2
 * remediation). Mirrors `runStaticSkillCase`'s own try/catch pattern
 * (FR-007): a case-level dependency read failure is never swallowed and
 * never reinterpreted as a skip, but it also never discards every other
 * case's already-computed result.
 *
 * An unreadable *manifest* itself is unaffected by this wrapper and still
 * exits 2 (C-004) — that failure is caught separately, before this function
 * is ever reached, in `doSkillsRun`'s own manifest-read try/catch.
 */
async function runBehavioralSkillCaseSafe(
  c: SkillsManifestBehavioralCase,
  baseDir: string,
  endpoint: EndpointConfig,
  triggerClientFactory: (endpoint: EndpointConfig) => TriggerChatClient
): Promise<SkillsCaseResult> {
  try {
    return await runBehavioralSkillCase(c, baseDir, endpoint, triggerClientFactory);
  } catch (error) {
    // FR-007 follow-through: this is the same class of failure the static
    // path's `errored` field now names (a case-level dependency read never
    // reaching a graded verdict at all) — set it here too so `errored` is a
    // uniform discriminator across both case types, not a static-only
    // artifact a JSON consumer would have to special-case.
    return {
      id: c.id,
      type: "behavioral",
      passed: false,
      errored: true,
      skipped: false,
      violations: [
        { path: "(execution)", message: errorMessage(error), severity: "error" },
      ],
    };
  }
}

/**
 * Run the skills manifest (FR-013, FR-014).
 *
 * Static cases always run (offline, deterministic, byte-stable — NFR-001, C-003).
 * Behavioral cases require MUSTER_ENDPOINT (MUSTER_BASE_URL deprecated alias,
 * FR-002) and are skipped gracefully when no endpoint is configured.
 */
async function doSkillsRun(
  manifestPath: string,
  opts: GlobalOpts,
  io: Io,
  triggerClientFactory: (endpoint: EndpointConfig) => TriggerChatClient
): Promise<number> {
  let cases: SkillsManifestCase[];
  const absManifestPath = toAbsolute(manifestPath);
  // Skills manifest paths (skillDir, querySetPath) resolve against the
  // manifest's own directory, so the command works regardless of cwd
  // (matches the other adapters).
  const baseDir = dirname(absManifestPath);
  try {
    const raw = await readFileOrThrow(absManifestPath, "skills manifest");
    const parsed = parseYaml(raw);
    // FR-003: structural schema validation before any case executes — a
    // malformed manifest (missing required field, bad `type` enum value,
    // non-boolean `expectations.ok`, ...) fails at a well-formed exit-2
    // boundary, never wherever the first bad field happens to be
    // dereferenced deep inside a case runner.
    validateSkillsManifest(parsed);
    cases = (parsed as { cases: SkillsManifestCase[] }).cases;
  } catch (error) {
    throw new ExecutionError(`skills manifest read/parse error: ${errorMessage(error)}`);
  }

  const behavioralEndpoint = resolveSkillsBehavioralEndpoint(cases, io);
  const results: SkillsCaseResult[] = [];

  for (const c of cases) {
    if (c.type === "static") {
      results.push(runStaticSkillCase(c, baseDir));
    } else if (behavioralEndpoint === undefined) {
      // No endpoint configured (or manifest has no behavioral case at all):
      // recorded as skipped (not failed) — graceful skip, unchanged shape.
      results.push({ id: c.id, type: "behavioral", passed: true, skipped: true });
    } else {
      results.push(
        await runBehavioralSkillCaseSafe(c, baseDir, behavioralEndpoint, triggerClientFactory)
      );
    }
  }

  const total = results.length;
  const skipped = results.filter((r) => r.skipped === true).length;
  const nonSkipped = results.filter((r) => r.skipped !== true);
  const passed = nonSkipped.filter((r) => r.passed).length;
  const failed = nonSkipped.filter((r) => !r.passed).length;
  const ok = failed === 0;

  const runResult: SkillsRunResult = { ok, total, passed, failed, skipped, results };
  io.outLine(opts.json === true ? JSON.stringify(runResult, null, 2) : formatSkillsResultHuman(runResult));
  return ok ? 0 : 1;
}

/**
 * Human-readable formatting for skills SkillsRunResult.
 *
 * Normative citation: agentskills.io conformance rubric FR-013.
 */
function formatSkillsResultHuman(result: SkillsRunResult): string {
  const statusWord = result.ok ? "PASS" : "FAIL";
  const skippedSuffix = result.skipped > 0 ? `, ${result.skipped} skipped` : "";
  const lines: string[] = [
    `skills: ${statusWord} — ${result.passed}/${result.total - result.skipped} cases passed, ${result.failed} failed${skippedSuffix}`,
  ];
  for (const r of result.results) {
    const icon = caseIcon(r.skipped === true, r.passed);
    lines.push(`  [${icon}] ${r.id}`);
  }
  return lines.join("\n");
}

// ─── muster sop run ─────────────────────────────────────────────────────────

/**
 * A configured ChatClient plus the real endpoint identity it was built
 * from (FR-001) — callers thread `model`/`baseUrl` alongside `client` so
 * `Transcript` provenance reflects the actual endpoint, not a literal.
 */
interface SopClientBundle {
  client: ChatClient;
  model: string;
  baseUrl: string;
}

/**
 * Build a minimal ChatClient from env vars for SOP behavioral probes.
 *
 * When MUSTER_ENDPOINT is present, creates an OpenAI-compatible client via
 * the injected `clientFactory` (defaults to the real fetch client, mirroring
 * doBehaveRun/doMemoryUtilizationRun's seam — tests inject a stub so the
 * "endpoint configured" path is exercised without live network I/O).
 * Returns undefined when the env var is absent (callers skip behavioral).
 *
 * NFR-005: API key read from process.env at call time; never stored.
 */
function buildSopClient(
  clientFactory: (endpoint: EndpointConfig) => ChatClient
): SopClientBundle | undefined {
  const baseUrl = process.env["MUSTER_ENDPOINT"];
  if (baseUrl === undefined || baseUrl === "") {
    return undefined;
  }
  const model = process.env["MUSTER_MODEL"] ?? "gpt-4o-mini";
  const apiKeyEnv: "MUSTER_API_KEY" | "OPENAI_API_KEY" =
    (process.env["MUSTER_API_KEY"] ?? "") === "" ? "OPENAI_API_KEY" : "MUSTER_API_KEY";
  const endpoint: EndpointConfig = {
    baseUrl,
    model,
    apiKeyEnv,
  };
  return { client: clientFactory(endpoint), model, baseUrl };
}

/**
 * A no-op ChatClient used when no endpoint is configured.
 *
 * When SOP manifests have inline probes but MUSTER_ENDPOINT is absent,
 * this client is passed to runManifestSuite so that lint still runs.
 * Probe execution will throw (error containment per FR-012) and probe
 * verdicts will be recorded as errored — they won't affect `passed`
 * for manifests where lint is the primary gate.
 *
 * For manifests with no inline probes (static-only), this client is
 * never called at all.
 */
const SOP_NOOP_CLIENT: ChatClient = {
  async chat(): Promise<string> {
    throw new Error(
      "muster sop: MUSTER_ENDPOINT not set — behavioral probes skipped (no-op client)"
    );
  },
};

/**
 * Run the SOP manifest suite (FR-003, FR-011).
 *
 * The manifest is a YAML file describing a SOP file and its conformance rules.
 * Static lint always runs (offline, deterministic — NFR-001, C-003).
 * Behavioral probe cases require MUSTER_ENDPOINT and are skipped gracefully
 * when it is absent (the no-op client causes each probe run to error, which
 * is contained per FR-012 error containment; verdicts show errored runs).
 *
 * For manifests with no inline probes section (static-only manifests),
 * the client is never called and the run is fully offline.
 *
 * Normative citation: muster SOP rubric FR-003, FR-011; C-001, C-004; NFR-005.
 */
async function doSopRun(
  manifestPath: string,
  opts: GlobalOpts,
  io: Io,
  clientFactory: (endpoint: EndpointConfig) => ChatClient
): Promise<number> {
  const absManifestPath = toAbsolute(manifestPath);
  // Pre-check: verify the manifest is readable before invoking runManifestSuite.
  // runManifestSuite handles unreadable manifests internally (returns passed: false),
  // but the CLI contract requires exit 2 for execution errors (unreadable manifest).
  await readFileOrThrow(absManifestPath, "sop manifest");
  // FR-001: the "unconfigured"/"unconfigured://no-endpoint" sentinel is used
  // ONLY when no endpoint is configured (SOP_NOOP_CLIENT path below) — never
  // unconditionally. When an endpoint IS configured, its real model/baseUrl
  // are threaded through so Transcript provenance reflects it.
  const sopClient = buildSopClient(clientFactory);
  const client = sopClient?.client ?? SOP_NOOP_CLIENT;
  const model = sopClient?.model ?? "unconfigured";
  const baseUrl = sopClient?.baseUrl ?? "unconfigured://no-endpoint";

  let report: SOPSuiteReport;
  try {
    report = await runSopManifestSuite(absManifestPath, { client, model, baseUrl });
  } catch (error) {
    throw new ExecutionError(`sop manifest run failed: ${errorMessage(error)}`);
  }

  io.outLine(opts.json === true ? JSON.stringify(report, null, 2) : formatSopResultHuman(report));
  return report.passed ? 0 : 1;
}

/**
 * Human-readable formatting for SOP SOPSuiteReport.
 *
 * Normative citation: muster SOP rubric FR-011.
 */
function formatSopResultHuman(report: SOPSuiteReport): string {
  const statusWord = report.passed ? "PASS" : "FAIL";
  const lines: string[] = [
    `sop: ${statusWord} — ${report.verdicts.length} probes, ${report.lintFindings.length} lint findings`,
  ];
  for (const finding of report.lintFindings) {
    const icon = finding.severity === "error" ? "ERROR" : "WARN";
    lines.push(`  [${icon}] ${finding.kind}: ${finding.message}`);
  }
  for (const verdict of report.verdicts) {
    const icon = verdict.passed ? "PASS" : "FAIL";
    lines.push(`  [${icon}] ${verdict.probeId} (rule: ${verdict.ruleId})`);
  }
  return lines.join("\n");
}

// ─── muster tools run ───────────────────────────────────────────────────────

/** Shape of the tools CLI manifest file (JSON or YAML). */
interface ToolsCliManifest {
  cases: Array<{
    id: string;
    toolsFilePath: string;
    envDescriptorPath?: string;
    selectionScenarioPaths?: string[];
    expect?: "pass" | "fail";
  }>;
}

/**
 * Load a tools CLI manifest file and resolve its paths relative to the
 * manifest directory (so that relative `toolsFilePath` / `envDescriptorPath`
 * fields resolve correctly regardless of cwd).
 */
async function loadToolsManifest(
  absManifestPath: string
): Promise<readonly ToolsManifestCase[]> {
  const raw = await readFileOrThrow(absManifestPath, "tools manifest");
  let parsed: ToolsCliManifest;
  try {
    parsed = JSON.parse(raw) as ToolsCliManifest;
  } catch {
    parsed = parseYaml(raw) as ToolsCliManifest;
  }
  const manifestDir = dirname(absManifestPath);
  return parsed.cases.map((c) => ({
    id: c.id,
    toolsFilePath: resolvePath(manifestDir, c.toolsFilePath),
    ...(c.envDescriptorPath !== undefined && {
      envDescriptorPath: resolvePath(manifestDir, c.envDescriptorPath),
    }),
    ...(c.selectionScenarioPaths !== undefined && {
      selectionScenarioPaths: c.selectionScenarioPaths.map((p) =>
        resolvePath(manifestDir, p)
      ),
    }),
    ...(c.expect !== undefined && { expect: c.expect }),
  }));
}

/**
 * Run the tools manifest (FR-010).
 *
 * The manifest is a JSON or YAML file listing TOOLS.md cases with optional
 * environment descriptor paths and selection scenario paths.
 *
 * Static lint and drift checks always run (offline, deterministic — NFR-001, C-003).
 * Selection probes require MUSTER_ENDPOINT and are skipped gracefully when absent
 * (the tools adapter writes a warning to stderr and omits selectionVerdicts).
 *
 * Normative citation: muster tools rubric FR-010; C-001, C-004; NFR-005.
 */
async function doToolsRun(
  manifestPath: string,
  opts: GlobalOpts,
  io: Io
): Promise<number> {
  const absManifestPath = toAbsolute(manifestPath);
  let cases: readonly ToolsManifestCase[];
  try {
    cases = await loadToolsManifest(absManifestPath);
  } catch (error) {
    throw new ExecutionError(`tools manifest read/parse error: ${errorMessage(error)}`);
  }

  const endpointUrl = process.env["MUSTER_ENDPOINT"];
  const manifestOpts =
    endpointUrl !== undefined && endpointUrl !== ""
      ? {
          endpoint: endpointUrl,
          model: process.env["MUSTER_MODEL"] ?? "gpt-4o",
          apiKey: process.env["MUSTER_API_KEY"] ?? process.env["OPENAI_API_KEY"],
        }
      : undefined;

  let results: readonly ToolsManifestResult[];
  try {
    results = await runToolsManifest(cases, manifestOpts);
  } catch (error) {
    throw new ExecutionError(`tools manifest run failed: ${errorMessage(error)}`);
  }

  const allPassed = results.every((r) => r.passed);
  const runResult = { ok: allPassed, results };
  io.outLine(opts.json === true ? JSON.stringify(runResult, null, 2) : formatToolsResultHuman(results));
  return allPassed ? 0 : 1;
}

/**
 * Human-readable formatting for tools manifest results.
 *
 * Normative citation: muster tools rubric FR-010.
 */
function formatToolsResultHuman(results: readonly ToolsManifestResult[]): string {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const statusWord = failed === 0 ? "PASS" : "FAIL";
  const lines: string[] = [
    `tools: ${statusWord} — ${passed}/${results.length} cases passed, ${failed} failed`,
  ];
  for (const r of results) {
    const icon = r.passed ? "PASS" : "FAIL";
    lines.push(`  [${icon}] ${r.id}`);
  }
  return lines.join("\n");
}

// ─── muster skprofile run ───────────────────────────────────────────────────

/** The machine-readable spec-kitty-profile run report (data-model.md `SkProfileReport`). */
interface SkProfileReport {
  readonly ok: boolean;
  readonly summary: string;
  readonly rubricDocPath: string;
  readonly exitCode: 0 | 1 | 2;
  readonly findings: readonly SkProfileFinding[];
  readonly cases: readonly SkProfileCaseResult[];
}

/** Build the emitted JSON report (data-model.md `Report`) from one adapter run. */
function buildSkProfileReport(result: SkProfileAdapterResult): SkProfileReport {
  return {
    ok: result.ok,
    summary: result.summary,
    rubricDocPath: SK_PROFILE_RUBRIC_DOC_PATH,
    exitCode: result.ok ? 0 : 1,
    findings: result.findings,
    cases: result.cases,
  };
}

/**
 * Run the spec-kitty-profile static conformance manifest (FR-001..FR-010).
 * Fully static and offline — no endpoint, no ChatClient (research.md R8).
 *
 * Exit-code contract (data-model.md):
 *   0 — `adapterResult.ok === true` (no error-severity finding anywhere).
 *   1 — `adapterResult.ok === false` (at least one error-severity finding).
 *   2 — the manifest (or `projectionManifestPath`, when supplied) could not
 *       be read/parsed, or a required manifest path is declared but
 *       structurally missing (`ExecutionError`, mapped by the top-level
 *       dispatcher, same as every other hand-wired `run` subcommand).
 */
async function doSkProfileRun(manifestPath: string, opts: GlobalOpts, io: Io): Promise<number> {
  const absManifestPath = toAbsolute(manifestPath);
  let raw: unknown;
  try {
    raw = await loadSkProfileManifest(absManifestPath);
  } catch (error) {
    throw new ExecutionError(`cannot read spec-kitty-profile manifest: ${errorMessage(error)}`);
  }
  const manifest = resolveSkProfileManifestPaths(raw as SkProfileManifest, dirname(absManifestPath));

  const adapter = createSpecKittyProfileAdapter();
  let result: SkProfileAdapterResult;
  try {
    result = await adapter.run(manifest);
  } catch (error) {
    throw new ExecutionError(`spec-kitty-profile adapter run failed: ${errorMessage(error)}`);
  }

  const report = buildSkProfileReport(result);
  io.outLine(opts.json === true ? JSON.stringify(report, null, 2) : formatSkProfileResultHuman(report));
  return report.exitCode;
}

/** One case's findings, human-readable (empty cases print no finding lines). */
function skProfileCaseLines(c: SkProfileCaseResult): string[] {
  const header =
    c.profileId === undefined ? `  case ${c.caseId}:` : `  case ${c.caseId} (profileId=${c.profileId}):`;
  const findingLines = c.findings.map((f) => `    [${f.severity}] ${f.profileId} ${f.path}: ${f.message}`);
  return [header, ...findingLines];
}

/**
 * Human-readable formatting for the spec-kitty-profile report: one line per
 * finding, grouped by case (data-model.md `Report`).
 *
 * Normative citation: `docs/rubric/spec-kitty-profile-taxonomy.md` (FR-009).
 */
function formatSkProfileResultHuman(report: SkProfileReport): string {
  const statusWord = report.ok ? "PASS" : "FAIL";
  const lines: string[] = [`spec-kitty-profile: ${statusWord} — ${report.summary}`];
  for (const c of report.cases) {
    lines.push(...skProfileCaseLines(c));
  }
  return lines.join("\n");
}

// ─── program assembly ───────────────────────────────────────────────────────

function buildProgram(
  io: Io,
  setExit: (code: number) => void,
  clientFactory: (endpoint: EndpointConfig) => ChatClient,
  triggerClientFactory: (endpoint: EndpointConfig) => TriggerChatClient
): Command {
  const program = new Command("muster")
    .description("CTS-1 conformance harness for Soul.md RFC-1 (1.0.0-rc1)")
    .version(VERSION)
    .addOption(
      new Option("--mode <mode>", "conformance mode (FR-024)")
        .choices(["strict", "permissive"])
        .default("strict")
    )
    .option("--json", "machine-readable output on stdout; logs stay on stderr")
    .exitOverride()
    .configureOutput({
      writeOut: (text) => io.out(text),
      writeErr: (text) => io.errLine(text.replace(/\n$/, "")),
    });

  program
    .command("check")
    .description(
      "Static conformance of one Soul.md document (§25.1 report). Never touches the network."
    )
    .argument("<soul>", "path to the Soul.md document")
    .addOption(new Option("--adapter <name>", "adapter to use (default: rfc1)").choices(["rfc1", "heartbeat", "a2a"]))
    .option("--profile <p>", "profile to apply (default: default)")
    .option("--state <s>", "runtime-requested state (§20.1)")
    .option("--restrict-refs [dir]", RESTRICT_REFS_HELP)
    .action(async (soul: string, _local, cmd: Command) => {
      setExit(await doCheck(soul, cmd.optsWithGlobals(), io));
    });

  program
    .command("resolve")
    .description("Print the effective configuration after full §7.5 resolution.")
    .argument("<soul>", "path to the Soul.md document")
    .option("--profile <p>", "profile to apply (default: default)")
    .option("--state <s>", "runtime-requested state (§20.1)")
    .addOption(
      new Option(
        "--output-format <format>",
        "canonical-json is the byte-stable CTS-1-normative form (RFC 8785, " +
          "Appendix F.2); json is pretty-printed; yaml is a convenience and " +
          "non-normative per F.2"
      )
        .choices(["canonical-json", "json", "yaml"])
        .default("canonical-json")
    )
    .option("--restrict-refs [dir]", RESTRICT_REFS_HELP)
    .action(async (soul: string, _local, cmd: Command) => {
      setExit(await doResolve(soul, cmd.optsWithGlobals(), io));
    });

  const cts = program
    .command("cts")
    .description("CTS-1 static fixture suite (RFC-1 Appendix F)");
  cts
    .command("run")
    .description("Run the fixture suite described by a CTS manifest (Appendix F.1).")
    .argument("<manifest>", "path to cts/manifest.yaml")
    .option("--filter <glob>", "run only case ids matching the glob (* wildcard)")
    .option(
      "--restrict-refs [dir]",
      "confine §7.2 reference loading (omitted: unrestricted, shipped behavior; " +
        "bare: restrict each case to its root soul document's directory; " +
        "with <dir>: restrict every case to that directory, resolved from cwd)"
    )
    .action(async (manifest: string, _local, cmd: Command) => {
      setExit(await doCtsRun(manifest, cmd.optsWithGlobals(), io));
    });

  const behave = program
    .command("behave")
    .description("Behavioral conformance against a live OpenAI-compatible endpoint");
  behave
    .command("run")
    .description(
      "Run behavioral cases: multi-turn conversations graded k-of-n on the " +
        "verbosity/refusal/state-shift axes (FR-016..FR-022)."
    )
    .argument("<manifest>", "path to the behavioral manifest")
    .option("--base-url <url>", "override the manifest endpoint base_url")
    .option("--model <m>", "override the manifest endpoint model")
    .option(
      "--temperature <t>",
      "override the sampling temperature (omitted by default: provider default applies)",
      parseFiniteNumber
    )
    .option("--runs <n>", "override runs-per-case (n in k-of-n)", parsePositiveInt)
    .option(
      "--restrict-refs [dir]",
      "confine §7.2 reference loading during the static gate (omitted: " +
        "unrestricted, shipped behavior; bare: restrict each case to its soul " +
        "document's directory; with <dir>: restrict every case to that " +
        "directory, resolved from cwd)"
    )
    .option(
      "--cassette <dir>",
      "cassette directory for --record/--replay (FR-016); requires exactly " +
        "one of --record or --replay"
    )
    .option(
      "--record",
      "record a cassette into --cassette <dir> from a live endpoint (FR-007/008)"
    )
    .option(
      "--replay",
      "replay a previously recorded cassette from --cassette <dir> — zero " +
        "network I/O (FR-007/009)"
    )
    .addHelpText(
      "after",
      "\nAPI key: read from the MUSTER_API_KEY environment variable " +
        "(fallback: OPENAI_API_KEY). There is deliberately no key flag and no " +
        "key file — credentials never appear in argv, manifests, or transcripts."
    )
    .action(async (manifest: string, _local, cmd: Command) => {
      setExit(await doBehaveRun(manifest, cmd.optsWithGlobals(), io, clientFactory));
    });

  // ─── muster memory ──────────────────────────────────────────────────────
  const memory = program
    .command("memory")
    .description(
      "Memory adapter: static lint (staleness/contradiction) and behavioral probes " +
      "for MEMORY.md / USER.md conformance (FR-001, FR-011, FR-012)"
    );
  memory
    .command("run")
    .description(
      "Run the memory conformance manifest (static lint by default; " +
        "--behavioral adds recall and privacy probe cases)."
    )
    .argument("<manifest>", "path to memory adapter manifest JSON")
    .option(
      "--behavioral",
      "also run behavioral recall and privacy/leak probe cases (requires endpoint)"
    )
    .option("--base-url <url>", "behavioral endpoint base URL (default: http://localhost:11434/v1)")
    .option("--model <m>", "behavioral endpoint model (default: llama3.2)")
    .action(async (manifest: string, _local, cmd: Command) => {
      setExit(await doMemoryRun(manifest, cmd.optsWithGlobals(), io));
    });

  // ─── muster memory-utilization ────────────────────────────────────────────
  const memoryUtilization = program
    .command("memory-utilization")
    .description(
      "Memory-utilization / learning-lift adapter: stages a declared memory fixture under " +
      "no-memory / with-memory / scrambled-memory arms and measures a statistically real " +
      "behavior lift — paired McNemar mid-p, Tango/Newcombe delta CI, Miller MDE (FR-001..FR-015)"
    );
  memoryUtilization
    .command("run")
    .description(
      "Run a memory-utilization LearningLiftManifest against an OpenAI-compatible endpoint. " +
        "Every case runs all three condition arms and reports the paired lift delta, its CI, " +
        "McNemar mid-p, and the minimum detectable effect (MDE); a no-lift verdict is always " +
        "rendered as a bounded/powered null, never bare absence of evidence (FR-008)."
    )
    .argument("<manifest>", "path to a memory-utilization LearningLiftManifest JSON")
    .option(
      "--base-url <url>",
      "behavioral endpoint base URL (default: MUSTER_ENDPOINT env var, else http://localhost:11434/v1)"
    )
    .option("--model <m>", "behavioral endpoint model (default: MUSTER_MODEL env var, else llama3.2)")
    .addHelpText(
      "after",
      "\nThis capability has no static-only path — every case is a behavioral 3-arm suite " +
        "(C-002: non-runtime, but still requires a ChatClient to grade transcripts).\n" +
        "\nEndpoint env vars: MUSTER_ENDPOINT (base URL), MUSTER_MODEL (model name).\n" +
        "API key: read from the MUSTER_API_KEY environment variable (fallback: OPENAI_API_KEY). " +
        "There is deliberately no key flag and no key file — credentials never appear in argv, " +
        "manifests, or transcripts.\n" +
        "\nEvery methodological check cites muster's published rubric " +
        "(docs/rubric/memory-utilization-taxonomy.md, FR-012).\n" +
        "\nExit-code contract:\n" +
        "  0  every case conforms (lift-confirmed, every control/guard held)\n" +
        "  1  any case failed / no-lift / contaminated / baseline-invalid\n" +
        "  2  manifest could not be read/parsed, or the adapter run itself errored"
    )
    .action(async (manifest: string, _local, cmd: Command) => {
      setExit(await doMemoryUtilizationRun(manifest, cmd.optsWithGlobals(), io, clientFactory));
    });

  // ─── muster crosslayer ────────────────────────────────────────────────────
  const crosslayer = program
    .command("crosslayer")
    .description(
      "Cross-layer conformance: static composition/lint and behavioral rule-survival " +
      "cases across persona/SOP layer stacks (FR-011, C-004, cross-layer-conformance-01KTYKP2)"
    );
  crosslayer
    .command("run")
    .description(
      "Run the cross-layer conformance manifest. Static cases run offline. " +
        "Behavioral cases use MUSTER_ENDPOINT / MUSTER_API_KEY env vars or " +
        "the manifest's endpoint block; skipped gracefully when neither is set. " +
        "Use --static-only to run only static cases explicitly."
    )
    .argument("<manifest>", "path to the cross-layer manifest YAML")
    .option(
      "--static-only",
      "run only static composition/lint cases (no endpoint required)"
    )
    .addHelpText(
      "after",
      "\nEndpoint env vars (behavioral cases):\n" +
        "  MUSTER_ENDPOINT   base URL of an OpenAI-compatible API\n" +
        "  MUSTER_MODEL      model name (default: gpt-4o-mini)\n" +
        "  MUSTER_API_KEY    API key (fallback: OPENAI_API_KEY)\n" +
        "\nWhen MUSTER_ENDPOINT is not set and the manifest has no endpoint block,\n" +
        "behavioral cases are skipped gracefully; static cases still run.\n" +
        "Credentials never appear in argv or the manifest value field."
    )
    .action(async (manifest: string, _local, cmd: Command) => {
      setExit(await doCrossLayerRun(manifest, cmd.optsWithGlobals(), io));
    });

  // ─── muster a2a ──────────────────────────────────────────────────────────
  const a2a = program
    .command("a2a")
    .description(
      "A2A adapter: static card lint + live conformance probes " +
      "(skill-behavior, auth-negatives, signed cards) for A2A Agent Card conformance"
    );
  a2a
    .command("run")
    .description(
      "Run the A2A conformance manifest. Static-lint cases always run (offline, deterministic, " +
        "byte-stable). Live cases (skill-behavior, auth-negative, signed-card-live) run only when " +
        "MUSTER_A2A_ENDPOINT is set; they are skipped gracefully when it is absent."
    )
    .argument("<manifest>", "path to a2a adapter manifest JSON")
    .addHelpText(
      "after",
      "\nA2A endpoint env vars (live conformance cases):\n" +
        "  MUSTER_A2A_ENDPOINT   base URL of a deployed A2A agent (e.g. https://my-agent.example.com)\n" +
        "  MUSTER_A2A_TOKEN      optional bearer token for auth-negative authorized-probe leg\n" +
        "\nWhen MUSTER_A2A_ENDPOINT is not set, live cases (skill-behavior, auth-negative,\n" +
        "signed-card-live) are skipped gracefully — recorded as 'skipped' in the summary,\n" +
        "not counted as failures. Static-lint cases always run offline.\n" +
        "\nExit-code contract (FR-012):\n" +
        "  0  all non-skipped cases passed (or all cases were skipped)\n" +
        "  1  at least one non-skipped case failed\n" +
        "  2  manifest could not be read or was structurally invalid\n" +
        "\nCredentials never appear in argv — only the env-var name is used (NFR-005).\n" +
        "The adapter never uses MUSTER_ENDPOINT / MUSTER_MODEL / MUSTER_API_KEY."
    )
    .action(async (manifest: string, _local, cmd: Command) => {
      setExit(await doA2aRun(manifest, cmd.optsWithGlobals(), io));
    });

  // ─── muster heartbeat ─────────────────────────────────────────────────────
  const heartbeat = program
    .command("heartbeat")
    .description(
      "Heartbeat adapter: static lint, interval-config checks, and behavioral " +
      "probes (action-diff / idempotency / quiet-ack) for HEARTBEAT.md conformance"
    );
  heartbeat
    .command("run")
    .description(
      "Run the heartbeat conformance manifest. Static-lint and interval-config " +
        "cases always run (offline, deterministic). Behavioral cases " +
        "(action-diff, idempotency, quiet-ack) run only when MUSTER_ENDPOINT is set; " +
        "they are skipped gracefully when it is absent."
    )
    .argument("<manifest>", "path to heartbeat adapter manifest JSON")
    .addHelpText(
      "after",
      "\nBehavioral cases: set MUSTER_ENDPOINT (and optionally MUSTER_MODEL, " +
        "MUSTER_API_KEY) to run them. Omit MUSTER_ENDPOINT for static-only."
    )
    .action(async (manifest: string, _local, cmd: Command) => {
      setExit(await doHeartbeatRun(manifest, cmd.optsWithGlobals(), io));
    });

  // ─── muster skills ────────────────────────────────────────────────────────
  const skills = program
    .command("skills")
    .description(
      "Skills adapter: static SKILL.md lint and behavioral trigger-routing " +
      "conformance for Agent Skills (agentskills.io spec) — FR-013, FR-014"
    );
  skills
    .command("run")
    .description(
      "Run the skills conformance manifest. Static lint cases always run " +
        "(offline, deterministic). Behavioral trigger-routing cases run only " +
        "when MUSTER_ENDPOINT is set; they are skipped gracefully when absent."
    )
    .argument("<manifest>", "path to skills manifest YAML")
    .addHelpText(
      "after",
      "\nBehavioral trigger cases: set MUSTER_ENDPOINT (canonical; and optionally\n" +
        "MUSTER_MODEL, MUSTER_API_KEY) to run them. MUSTER_BASE_URL is accepted as a\n" +
        "deprecated alias — a one-line stderr notice is emitted when it supplies the\n" +
        "value; MUSTER_ENDPOINT wins silently when both are set. Omit MUSTER_ENDPOINT\n" +
        "(and MUSTER_BASE_URL) for static-only.\n" +
        "\nExit-code contract:\n" +
        "  0  all non-skipped cases passed (or all cases were skipped)\n" +
        "  1  at least one non-skipped case failed\n" +
        "  2  manifest could not be read or was structurally invalid\n" +
        "\nCredentials never appear in argv — only env-var names are used (NFR-005)."
    )
    .action(async (manifest: string, _local, cmd: Command) => {
      setExit(await doSkillsRun(manifest, cmd.optsWithGlobals(), io, triggerClientFactory));
    });

  // ─── muster sop ──────────────────────────────────────────────────────────
  const sop = program
    .command("sop")
    .description(
      "SOP adapter (openclaw-sop): static AGENTS.md rule-text lint and behavioral " +
      "compliance/adversarial probe suite for OpenClaw SOP conformance — FR-003, FR-011"
    );
  sop
    .command("run")
    .description(
      "Run the SOP conformance manifest. Static lint always runs (offline, " +
        "deterministic). Behavioral probe cases run only when MUSTER_ENDPOINT " +
        "is set; they are skipped gracefully when absent."
    )
    .argument("<manifest>", "path to SOP rule manifest YAML")
    .addHelpText(
      "after",
      "\nBehavioral probe cases: set MUSTER_ENDPOINT (and optionally MUSTER_MODEL,\n" +
        "MUSTER_API_KEY) to run them. Omit MUSTER_ENDPOINT for static lint only.\n" +
        "\nExit-code contract:\n" +
        "  0  all lint checks passed and all probe cases passed (or no probes)\n" +
        "  1  at least one lint error or probe case failed\n" +
        "  2  manifest could not be read or was structurally invalid\n" +
        "\nCredentials never appear in argv — only env-var names are used (NFR-005).\n" +
        "The adapter name is 'openclaw-sop'; the CLI command is 'sop' (short form)."
    )
    .action(async (manifest: string, _local, cmd: Command) => {
      setExit(await doSopRun(manifest, cmd.optsWithGlobals(), io, clientFactory));
    });

  // ─── muster tools ─────────────────────────────────────────────────────────
  const tools = program
    .command("tools")
    .description(
      "Tools adapter: static TOOLS.md lint, environment descriptor drift checks, " +
      "and optional behavioral tool-selection probes — FR-010"
    );
  tools
    .command("run")
    .description(
      "Run the tools conformance manifest. Static lint and drift checks always " +
        "run (offline, deterministic). Behavioral selection probes run only when " +
        "MUSTER_ENDPOINT is set; they are skipped gracefully when absent."
    )
    .argument("<manifest>", "path to tools manifest JSON or YAML")
    .addHelpText(
      "after",
      "\nThe manifest is a JSON or YAML file with a 'cases' array. Each case " +
        "specifies a TOOLS.md file path, an optional environment descriptor path " +
        "(for drift checks), and optional selection scenario paths (for behavioral probes).\n" +
        "\nBehavioral selection probes: set MUSTER_ENDPOINT (and optionally MUSTER_MODEL,\n" +
        "MUSTER_API_KEY) to run them. Omit MUSTER_ENDPOINT for static lint + drift only.\n" +
        "\nExit-code contract:\n" +
        "  0  all cases passed (lint ok, drift clean, all selections passed if run)\n" +
        "  1  at least one case failed\n" +
        "  2  manifest could not be read or was structurally invalid\n" +
        "\nCredentials never appear in argv — only env-var names are used (NFR-005)."
    )
    .action(async (manifest: string, _local, cmd: Command) => {
      setExit(await doToolsRun(manifest, cmd.optsWithGlobals(), io));
    });

  // ─── muster skprofile ─────────────────────────────────────────────────────
  const skProfile = program
    .command("skprofile")
    .description(
      "Spec-Kitty agent-profile static conformance adapter: schema " +
      "conformance, handoff-graph resolution, doctrine-reference " +
      "resolution, context-sources integrity, profile-id legality, and " +
      "projection-drift re-verification (FR-001..FR-010)."
    );
  skProfile
    .command("run")
    .description(
      "Run a spec-kitty-profile manifest against a *.agent.yaml profile " +
      "set. Fully static and offline — no endpoint, no ChatClient."
    )
    .argument("<manifest>", "path to a spec-kitty-profile manifest (YAML)")
    .addHelpText(
      "after",
      "\nThis capability is entirely static and offline — no endpoint, no ChatClient, no credentials.\n" +
        "\nEvery non-schema finding cites muster's published rubric " +
        "(docs/rubric/spec-kitty-profile-taxonomy.md, FR-009); schema findings cite the pinned upstream " +
        "agent-profile.schema.yaml + commit SHA.\n" +
        "\nExit-code contract:\n" +
        "  0  no error-severity finding anywhere in the graph\n" +
        "  1  at least one error-severity finding\n" +
        "  2  manifest (or projectionManifestPath) could not be read/parsed, or a required manifest path " +
        "is declared but structurally missing"
    )
    .action(async (manifest: string, _local, cmd: Command) => {
      setExit(await doSkProfileRun(manifest, cmd.optsWithGlobals(), io));
    });

  return program;
}

/**
 * Run the muster CLI in-process. Returns the contract exit code (0/1/2)
 * instead of calling process.exit, so tests invoke it directly.
 */
export async function runCli(
  argv: string[],
  options: RunCliOptions = {}
): Promise<number> {
  const out = options.out ?? ((text: string) => { process.stdout.write(text); });
  const err = options.err ?? ((text: string) => { process.stderr.write(text); });
  const io: Io = {
    out,
    outLine: (text) => out(`${text}\n`),
    errLine: (text) => err(`${text}\n`),
  };

  let exitCode = 0;
  const program = buildProgram(
    io,
    (code) => {
      exitCode = code;
    },
    options.clientFactory ?? makeClient,
    options.skillsTriggerClientFactory ?? makeToolClient
  );

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      // Help/version displays are successful runs; every other parse problem
      // (unknown option, bad choice, missing argument) is an execution error.
      return error.code === "commander.helpDisplayed" || error.code === "commander.version"
        ? 0
        : 2;
    }
    if (error instanceof ExecutionError) {
      io.errLine(`muster: ${error.message}`);
      return 2;
    }
    io.errLine(`muster: unexpected error: ${errorMessage(error)}`);
    return 2;
  }
  return exitCode;
}

// Bin entry: run only when this module IS the executed entry point (the
// `muster` bin or `node dist/cli/index.js`), never when imported by tests.
const entryPath = process.argv[1];
let isMain = false;
if (entryPath !== undefined) {
  try {
    isMain = import.meta.url === pathToFileURL(realpathSync(entryPath)).href;
  } catch {
    isMain = false;
  }
}
if (isMain) {
  try {
    process.exitCode = await runCli(process.argv.slice(2));
  } catch (error: unknown) {
    process.stderr.write(`muster: ${errorMessage(error)}\n`);
    process.exitCode = 2;
  }
}
