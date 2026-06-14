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
import type {
  CaseVerdict,
  ChatClient,
  EndpointConfig,
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
  type ManifestSummary as A2aManifestSummary,
} from "../adapters/a2a/index.js";
import { parseAgentCard } from "../adapters/a2a/card.js";
import {
  formatBehaveHuman,
  formatCtsHuman,
  formatReportHuman,
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
import type { SkillProfile } from "../adapters/skills/types.js";
// SOP adapter imports (C-001: only adapter boundary imported here).
import { runManifestSuite as runSopManifestSuite } from "../adapters/openclaw-sop/runner.js";
import type { SOPSuiteReport } from "../adapters/openclaw-sop/index.js";
// Tools adapter imports (C-001: only adapter boundary imported here).
import {
  runManifest as runToolsManifest,
  type ToolsManifestCase,
  type ToolsManifestResult,
} from "../adapters/tools/index.js";

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
  opts: GlobalOpts & { adapter?: string; profile?: string; state?: string; restrictRefs?: RestrictRefsFlag },
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
    restrictRefs?: RestrictRefsFlag;
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
  opts: GlobalOpts & { filter?: string; restrictRefs?: RestrictRefsFlag },
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
  restrictRefs?: RestrictRefsFlag;
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

async function doBehaveRun(
  manifestPath: string,
  opts: BehaveOpts,
  io: Io,
  clientFactory: (endpoint: EndpointConfig) => ChatClient
): Promise<number> {
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
    if (!check.report.ok || check.effective === null) {
      io.errLine(`case "${kase.id}": soul "${kase.soul}" is not conforming — static report:`);
      io.errLine(
        opts.json === true
          ? JSON.stringify(check.report, null, 2)
          : formatReportHuman(check.report)
      );
      throw new ExecutionError(
        `behavioral run aborted: non-conforming soul for case "${kase.id}"`
      );
    }

    // --runs overrides the manifest-resolved n; k clamps so k ≤ n holds.
    const applied =
      opts.runs === undefined
        ? kase
        : {
            ...kase,
            runs: opts.runs,
            pass_threshold: Math.min(kase.pass_threshold, opts.runs),
          };
    verdicts.push(await runCase(rfc1Adapter, check, applied, client, runnerOpts));
  }

  // The verdicts are the artifact — emit them before deciding the exit code.
  io.outLine(
    opts.json === true ? JSON.stringify(verdicts, null, 2) : formatBehaveHuman(verdicts)
  );

  // Exit discipline: mid-suite endpoint errors fail cases and exit 1; an
  // endpoint unreachable for the ENTIRE run (every run of every case errored)
  // is an execution failure → 2 (contracts/cli.md exit codes).
  const allRuns = verdicts.flatMap((verdict) => verdict.runs);
  if (allRuns.length > 0 && allRuns.every((run) => run.error !== undefined)) {
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
  let manifest: AdapterManifest;
  try {
    const raw = await readFileOrThrow(toAbsolute(manifestPath), "memory manifest");
    manifest = JSON.parse(raw) as AdapterManifest;
  } catch (error) {
    throw new ExecutionError(
      `memory manifest read/parse error: ${errorMessage(error)}`
    );
  }

  const adapterOptions: AdapterOptions = {
    behavioral: opts.behavioral === true,
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
    // projectRoot defaults to cwd so that relative checklist/fixture paths in
    // the manifest resolve from the working directory (the conventional root).
    summary = await runHeartbeatManifest(toAbsolute(manifestPath), process.cwd());
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
 * Run the A2A adapter manifest runner (FR-001, FR-012, T025).
 *
 * The manifest is a JSON file listing static-lint cases (always run, offline,
 * deterministic) and optionally live conformance probe cases (skill-behavior,
 * auth-negative, signed-card-live). Live cases require MUSTER_A2A_ENDPOINT and
 * are skipped gracefully when it is absent.
 *
 * Exit-code contract (FR-012): summary.failed > 0 → 1; else → 0.
 * Skipped cases never fail the run. IO/manifest errors → exit 2 (ExecutionError).
 *
 * This function mirrors doHeartbeatRun exactly (C-004 boundary pattern).
 */
async function doA2aRun(
  manifestPath: string,
  opts: GlobalOpts,
  io: Io
): Promise<number> {
  let summary: A2aManifestSummary;
  try {
    // projectRoot defaults to cwd so that relative fixture paths in
    // the manifest resolve from the working directory (conventional root).
    summary = await runA2aManifest(toAbsolute(manifestPath), process.cwd());
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
    // Parse failure = not ok; if expectation was ok: false it still passes expectation.
    const expectOk = c.expectations.ok;
    return {
      id: c.id,
      type: "static",
      passed: !expectOk,
      violations: [
        { path: "(document)", message: errorMessage(error), severity: "error" },
      ],
    };
  }
}

/**
 * Run the skills manifest (FR-013, FR-014).
 *
 * Static cases always run (offline, deterministic, byte-stable — NFR-001, C-003).
 * Behavioral cases require MUSTER_ENDPOINT and are skipped gracefully when absent.
 */
async function doSkillsRun(
  manifestPath: string,
  opts: GlobalOpts,
  io: Io
): Promise<number> {
  let cases: SkillsManifestCase[];
  const absManifestPath = toAbsolute(manifestPath);
  // Skills manifest paths (skillDir, querySetPath) are relative to cwd
  // (repo root convention), not to the manifest file location.
  const baseDir = process.cwd();
  try {
    const raw = await readFileOrThrow(absManifestPath, "skills manifest");
    const parsed = parseYaml(raw) as { cases: SkillsManifestCase[] };
    cases = parsed.cases;
  } catch (error) {
    throw new ExecutionError(`skills manifest read/parse error: ${errorMessage(error)}`);
  }

  const results: SkillsCaseResult[] = [];

  for (const c of cases) {
    if (c.type === "static") {
      results.push(runStaticSkillCase(c, baseDir));
    } else {
      // Behavioral trigger-routing cases require MUSTER_ENDPOINT.
      // They are recorded as skipped (not failed) when absent (graceful skip).
      results.push({ id: c.id, type: "behavioral", passed: true, skipped: true });
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
 * Build a minimal ChatClient from env vars for SOP behavioral probes.
 *
 * When MUSTER_ENDPOINT is present, creates an OpenAI-compatible client.
 * Returns undefined when the env var is absent (callers skip behavioral).
 *
 * NFR-005: API key read from process.env at call time; never stored.
 */
function buildSopClient(): import("../core/behavioral/types.js").ChatClient | undefined {
  const baseUrl = process.env["MUSTER_ENDPOINT"];
  if (baseUrl === undefined || baseUrl === "") {
    return undefined;
  }
  const model = process.env["MUSTER_MODEL"] ?? "gpt-4o-mini";
  const apiKeyEnv: "MUSTER_API_KEY" | "OPENAI_API_KEY" =
    (process.env["MUSTER_API_KEY"] ?? "") === "" ? "OPENAI_API_KEY" : "MUSTER_API_KEY";
  const endpoint: import("../core/behavioral/types.js").EndpointConfig = {
    baseUrl,
    model,
    apiKeyEnv,
  };
  return makeClient(endpoint);
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
const SOP_NOOP_CLIENT: import("../core/behavioral/types.js").ChatClient = {
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
  io: Io
): Promise<number> {
  const absManifestPath = toAbsolute(manifestPath);
  // Pre-check: verify the manifest is readable before invoking runManifestSuite.
  // runManifestSuite handles unreadable manifests internally (returns passed: false),
  // but the CLI contract requires exit 2 for execution errors (unreadable manifest).
  await readFileOrThrow(absManifestPath, "sop manifest");
  const client = buildSopClient() ?? SOP_NOOP_CLIENT;

  let report: SOPSuiteReport;
  try {
    report = await runSopManifestSuite(absManifestPath, { client });
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

// ─── program assembly ───────────────────────────────────────────────────────

function buildProgram(
  io: Io,
  setExit: (code: number) => void,
  clientFactory: (endpoint: EndpointConfig) => ChatClient
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
      "\nBehavioral trigger cases: set MUSTER_ENDPOINT (and optionally MUSTER_MODEL,\n" +
        "MUSTER_API_KEY) to run them. Omit MUSTER_ENDPOINT for static-only.\n" +
        "\nExit-code contract:\n" +
        "  0  all non-skipped cases passed (or all cases were skipped)\n" +
        "  1  at least one non-skipped case failed\n" +
        "  2  manifest could not be read or was structurally invalid\n" +
        "\nCredentials never appear in argv — only env-var names are used (NFR-005)."
    )
    .action(async (manifest: string, _local, cmd: Command) => {
      setExit(await doSkillsRun(manifest, cmd.optsWithGlobals(), io));
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
      setExit(await doSopRun(manifest, cmd.optsWithGlobals(), io));
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
    options.clientFactory ?? makeClient
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
