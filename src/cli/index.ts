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
import { Command, CommanderError, InvalidArgumentError, Option } from "commander";
import { stringify as stringifyYaml } from "yaml";
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
import { HeartbeatAdapter, checkHeartbeatFile, serializeLintReport } from "../adapters/heartbeat/index.js";
import {
  formatBehaveHuman,
  formatCtsHuman,
  formatReportHuman,
  globToRegExp,
} from "./output.js";

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
const ADAPTER_REGISTRY: Record<string, () => InstanceType<typeof HeartbeatAdapter>> = {
  heartbeat: () => new HeartbeatAdapter(),
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
    .addOption(new Option("--adapter <name>", "adapter to use (default: rfc1)").choices(["rfc1", "heartbeat"]))
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
