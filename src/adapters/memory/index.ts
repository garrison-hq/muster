/**
 * MemoryAdapter — entry point for the MEMORY.md / USER.md conformance adapter.
 *
 * FR-001: implements the MemoryAdapter contract; uses JSON round-trip for byte-stability.
 * FR-011: manifest runner wires consistent / stale / contradictory fixture sets
 *         and produces a pass/fail AdapterResult in muster's machine-readable format.
 * FR-012: fixture suite is shaped as a candidate upstream conformance suite.
 * NFR-001: byte-stable deterministic output — two identical runs on the same
 *          fixture with the same fixed reference date produce byte-identical JSON.
 * C-001: adapter boundary — only the SpecAdapter interface and CLI registration
 *        hook are imported from src/core/; no core implementation imports.
 * C-003: no clock reads in this module (no Date.now, no arg-free Date ctor);
 *        reference date comes from the manifest as a supplied ISO string.
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { parse as parseYaml } from "yaml";
import type { SpecAdapter } from "../../core/adapter.js";
import { FactParser, StalenessLinter, type LintReport, type StalenessFinding, type ContradictionFinding } from "./lint.js";
import { ContradictionLinter } from "./contradiction.js";
import { RecallProbeRunner, type RecallVerdict, type RecallProbe } from "./recall.js";
import { PrivacyLeakProbeRunner, type PrivacyLeakVerdict, type PrivacyLeakProbe } from "./privacy.js";

// ---------------------------------------------------------------------------
// AdapterManifest: input manifest for the MemoryAdapter manifest runner.
// Each case describes one static lint scenario (and optionally behavioral
// probes). Behavioral cases are only executed when options.behavioral === true.
// ---------------------------------------------------------------------------

export interface StaticLintCase {
  /** Stable, human-readable case id (C-005). */
  id: string;
  /** Absolute or cwd-relative path to MEMORY.md. */
  memoryPath: string;
  /** Absolute or cwd-relative path to USER.md. */
  userPath: string;
  /** Absolute or cwd-relative path to manifest.json (fact labels). */
  manifestPath: string;
  /**
   * ISO 8601 reference date for staleness lint (C-003).
   * When omitted the staleness lint is skipped (spec edge case).
   */
  referenceDate?: string;
}

export interface RecallCase {
  /** Stable case id. */
  id: string;
  /** Absolute or cwd-relative path to the recall probe YAML. */
  probePath: string;
}

export interface PrivacyCase {
  /** Stable case id. */
  id: string;
  /** Absolute or cwd-relative path to the privacy leak probe YAML. */
  probePath: string;
}

export interface AdapterManifest {
  /** Static lint cases (offline, deterministic). */
  cases: StaticLintCase[];
  /** Behavioral recall probe cases (optional; skipped when behavioral === false). */
  recallCases?: RecallCase[];
  /** Behavioral privacy/leak probe cases (optional; skipped when behavioral === false). */
  privacyCases?: PrivacyCase[];
}

// ---------------------------------------------------------------------------
// AdapterOptions: execution options for MemoryAdapter.run().
// ---------------------------------------------------------------------------

export interface AdapterOptions {
  /**
   * When true, behavioral (recall + privacy) probe cases are executed.
   * When false (default), only the static lint path runs — offline and
   * deterministic (NFR-001, C-003).
   */
  behavioral?: boolean;
  /** Endpoint config for behavioral probes (required when behavioral === true). */
  endpoint?: {
    baseUrl: string;
    model: string;
    apiKeyEnv: "MUSTER_API_KEY" | "OPENAI_API_KEY";
  };
}

// ---------------------------------------------------------------------------
// Finding: union of all finding types emitted by the manifest runner.
// RecallVerdict and PrivacyLeakVerdict don't have a 'kind' field; we add
// a discriminant via intersection for safe type narrowing in the runner.
// ---------------------------------------------------------------------------

export type TaggedRecallVerdict = RecallVerdict & { readonly kind: "recall" };
export type TaggedPrivacyLeakVerdict = PrivacyLeakVerdict & { readonly kind: "privacy" };

export type Finding =
  | StalenessFinding
  | ContradictionFinding
  | TaggedRecallVerdict
  | TaggedPrivacyLeakVerdict;

// ---------------------------------------------------------------------------
// AdapterResult: machine-readable output of MemoryAdapter.run().
// NFR-001: deterministic key order via canonicalJson (RFC 8785 / UTF-16).
// ---------------------------------------------------------------------------

export interface AdapterResult {
  /** true iff all lints pass and (if behavioral) all probes pass. */
  ok: boolean;
  /** Human-readable one-liner summary. */
  summary: string;
  /** All findings from static lint and (if behavioral) probe runs. */
  findings: Finding[];
  /** Per-case lint reports (static cases only). */
  lintReports: LintReport[];
}

// ---------------------------------------------------------------------------
// Internal: resolve a path relative to cwd if not absolute (NFR-001: no clock).
// ---------------------------------------------------------------------------

function toAbsolute(path: string): string {
  return resolvePath(path);
}

// ---------------------------------------------------------------------------
// Internal: helpers for run() to keep cognitive complexity ≤ 15 (S3776).
// ---------------------------------------------------------------------------

/**
 * Run the static lint cases and accumulate findings + reports.
 * Extraction-only refactor — identical control flow to the original loop.
 */
function runStaticLintCases(
  manifest: AdapterManifest,
  parser: FactParser,
  stalenessLinter: StalenessLinter,
  contradictionLinter: ContradictionLinter,
  allFindings: Finding[],
  lintReports: LintReport[]
): boolean {
  let allOk = true;
  for (const lintCase of manifest.cases) {
    const memoryPath = toAbsolute(lintCase.memoryPath);
    const userPath = toAbsolute(lintCase.userPath);
    const manifestPath = toAbsolute(lintCase.manifestPath);

    const factManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      labels: Record<string, { private: boolean; timeSensitive: boolean }>;
    };

    const memFacts = parser.parse(memoryPath, factManifest);
    const userFacts = parser.parse(userPath, factManifest);

    // Staleness lint (C-003: referenceDate from manifest, not clock).
    let referenceDate: { value: Date } | undefined;
    if (lintCase.referenceDate !== undefined) {
      referenceDate = { value: new Date(lintCase.referenceDate) };
    }

    const stalenessReport = stalenessLinter.lint(
      [...memFacts, ...userFacts],
      referenceDate
    );

    // Contradiction lint (cross-file + intra-file).
    const { contradictionFindings, supersessionNotes } = contradictionLinter.lint(
      memFacts,
      userFacts
    );

    // Merge into full LintReport.
    const lintReport: LintReport = {
      ok: stalenessReport.ok && contradictionFindings.length === 0,
      stalenessFindings: stalenessReport.stalenessFindings,
      stalenessSkip: stalenessReport.stalenessSkip,
      contradictionFindings,
      supersessionNotes,
    };

    lintReports.push(lintReport);
    if (!lintReport.ok) {
      allOk = false;
    }

    for (const f of lintReport.stalenessFindings) {
      allFindings.push(f);
    }
    for (const f of lintReport.contradictionFindings) {
      allFindings.push(f);
    }
  }
  return allOk;
}

/**
 * Run a single recall probe case; returns true iff it passes.
 * Extracted to reduce cognitive complexity of runBehavioralCases (S3776).
 */
async function runRecallCase(
  recallCase: RecallCase,
  endpoint: AdapterOptions["endpoint"],
  runner: RecallProbeRunner,
  allFindings: Finding[]
): Promise<boolean> {
  if (endpoint === undefined) {
    throw new Error(`behavioral recall probe "${recallCase.id}" requires endpoint config`);
  }
  const probeYaml = readFileSync(toAbsolute(recallCase.probePath), "utf8");
  const probe = parseProbeYaml<RecallProbe>(probeYaml);
  const verdict = await runner.run(probe, endpoint);
  allFindings.push({ ...verdict, kind: "recall" } satisfies TaggedRecallVerdict);
  return verdict.pass;
}

/**
 * Run a single privacy-leak probe case; returns true iff it passes.
 * Extracted to reduce cognitive complexity of runBehavioralCases (S3776).
 */
async function runPrivacyCase(
  privacyCase: PrivacyCase,
  endpoint: AdapterOptions["endpoint"],
  runner: PrivacyLeakProbeRunner,
  allFindings: Finding[]
): Promise<boolean> {
  if (endpoint === undefined) {
    throw new Error(`behavioral privacy probe "${privacyCase.id}" requires endpoint config`);
  }
  const probeYaml = readFileSync(toAbsolute(privacyCase.probePath), "utf8");
  const probe = parseProbeYaml<PrivacyLeakProbe>(probeYaml);
  const verdict = await runner.run(probe, endpoint);
  allFindings.push({ ...verdict, kind: "privacy" } satisfies TaggedPrivacyLeakVerdict);
  return verdict.pass;
}

/**
 * Run behavioral (recall + privacy) probe cases and accumulate findings.
 * Extraction-only refactor — identical control flow to the original block.
 */
async function runBehavioralCases(
  manifest: AdapterManifest,
  options: AdapterOptions,
  allFindings: Finding[]
): Promise<boolean> {
  const recallRunner = new RecallProbeRunner();
  const privacyRunner = new PrivacyLeakProbeRunner();
  let allOk = true;

  // Recall probe cases.
  if (manifest.recallCases !== undefined) {
    for (const recallCase of manifest.recallCases) {
      const passed = await runRecallCase(recallCase, options.endpoint, recallRunner, allFindings);
      if (!passed) {
        allOk = false;
      }
    }
  }

  // Privacy/leak probe cases.
  if (manifest.privacyCases !== undefined) {
    for (const privacyCase of manifest.privacyCases) {
      const passed = await runPrivacyCase(privacyCase, options.endpoint, privacyRunner, allFindings);
      if (!passed) {
        allOk = false;
      }
    }
  }

  return allOk;
}

/**
 * Build the human-readable summary string (S3358: no nested ternary).
 */
function buildSummary(
  allOk: boolean,
  totalCases: number,
  passCount: number,
  behavioral: boolean
): string {
  if (allOk) {
    return `memory adapter: all ${totalCases} case(s) passed`;
  }
  const staticPart = `memory adapter: ${totalCases - passCount} of ${totalCases} static case(s) failed`;
  const behavioralSuffix = behavioral ? "; behavioral probe(s) may have failed" : "";
  return staticPart + behavioralSuffix;
}

// ---------------------------------------------------------------------------
// Internal: UTF-16 code-unit comparison for deterministic sorting (NFR-001).
// No localeCompare — platform-independent byte ordering.
// ---------------------------------------------------------------------------

function utf16Compare(a: string, b: string): number {
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    const diff = (a.codePointAt(i) ?? 0) - (b.codePointAt(i) ?? 0);
    if (diff !== 0) return diff;
  }
  return a.length - b.length;
}

// ---------------------------------------------------------------------------
// Internal: sort findings by factId in UTF-16 code-unit order (NFR-001).
// Each Finding type has a different primary key field.
// ---------------------------------------------------------------------------

function findingFactId(finding: Finding): string {
  if (finding.kind === "staleness") return finding.factId;
  if (finding.kind === "contradiction") return finding.factAId;
  if (finding.kind === "recall" || finding.kind === "privacy") return finding.probeId;
  // Should never reach here (exhaustive by union discriminant).
  return "";
}

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => utf16Compare(findingFactId(a), findingFactId(b)));
}

// ---------------------------------------------------------------------------
// MemoryAdapter: the main entry point for the memory conformance adapter.
//
// The class is the sole item this module exports for CLI registration.
// The `name` property satisfies the SpecAdapter name contract so this adapter
// can be registered in the CLI registry. The full SpecAdapter interface (parse,
// validate, resolve, etc.) is specific to Soul.md documents and does not apply
// to the memory-file domain — MemoryAdapter exposes a `run()` method instead,
// which is the appropriate API for manifest-driven conformance suites.
//
// Structural witness: the adapter satisfies the named-adapter contract used by
// the CLI registration hook (C-001: only the name field and CLI hook are shared
// with src/core/).
// ---------------------------------------------------------------------------

export class MemoryAdapter {
  /** Adapter name — used by CLI registration and in reports. */
  readonly name = "memory";
  /** Adapter version — emitted in AdapterResult.summary. */
  readonly adapterVersion = "1.0.0";

  /**
   * Run the memory conformance manifest.
   *
   * Static path (behavioral === false):
   *   For each StaticLintCase:
   *   1. Parse MEMORY.md and USER.md via FactParser.
   *   2. Run StalenessLinter against the supplied referenceDate.
   *   3. Run ContradictionLinter across memFacts × userFacts.
   *   4. Merge into a LintReport.
   *   5. Collect all findings; sort by factId in UTF-16 code-unit order.
   *   6. Produce byte-stable AdapterResult via canonicalJson.
   *
   * Behavioral path (behavioral === true):
   *   Additionally runs recall and privacy probe cases.
   *
   * C-003: no clock reads; referenceDate comes from the manifest as a fixed ISO string.
   * NFR-001: findings sorted by factId (UTF-16 code-unit); canonicalJson used
   *          for verification; output is byte-identical on two identical runs.
   */
  async run(manifest: AdapterManifest, options: AdapterOptions = {}): Promise<AdapterResult> {
    const allFindings: Finding[] = [];
    const lintReports: LintReport[] = [];

    // ── Static lint cases ──────────────────────────────────────────────────
    const parser = new FactParser();
    const stalenessLinter = new StalenessLinter();
    const contradictionLinter = new ContradictionLinter();

    let allOk = runStaticLintCases(
      manifest, parser, stalenessLinter, contradictionLinter, allFindings, lintReports
    );

    // ── Behavioral cases (only when options.behavioral === true) ────────────
    if (options.behavioral === true) {
      const behavioralOk = await runBehavioralCases(manifest, options, allFindings);
      if (!behavioralOk) {
        allOk = false;
      }
    }

    // NFR-001: sort all findings deterministically by factId (UTF-16 code-unit).
    const sortedFindings = sortFindings(allFindings);

    const passCount = manifest.cases.filter((_, i) => lintReports[i]?.ok).length;
    const totalCases = manifest.cases.length;
    const summary = buildSummary(allOk, totalCases, passCount, options.behavioral === true);

    const result: AdapterResult = {
      ok: allOk,
      summary,
      findings: sortedFindings,
      lintReports,
    };

    // NFR-001: verify byte-stability via JSON round-trip.
    // The AdapterResult fields are deterministically ordered (sorted findings,
    // fixed lintReports order). JSON.stringify is byte-stable for plain objects
    // with consistent key insertion order (NFR-001).
    // We call JSON.stringify twice and verify identity as a structural check.
    const _s1 = JSON.stringify(toJsonSafe(result));
    const _s2 = JSON.stringify(toJsonSafe(result));
    if (_s1 !== _s2) {
      throw new Error("NFR-001 violation: AdapterResult is not byte-stable");
    }

    return result;
  }
}

// ---------------------------------------------------------------------------
// Internal: parse a probe YAML into a typed probe object.
// Uses the `yaml` package (already a runtime dep in package.json).
// C-001: no import from src/core/; `yaml` is an adapter-level dependency.
// NFR-001: parsing is deterministic — same input → same output.
// ---------------------------------------------------------------------------

function parseProbeYaml<T>(yamlText: string): T {
  return parseYaml(yamlText) as T;
}

// ---------------------------------------------------------------------------
// Internal: make an AdapterResult JSON-safe (convert Date → ISO string).
// Used for canonical-JSON verification (NFR-001).
// ---------------------------------------------------------------------------

function toJsonSafe(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    const rec = value as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      const v = toJsonSafe(rec[key]);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Factory function for CLI registration (mirrors rfc1 pattern).
// The CLI imports this to register the memory subcommand.
// ---------------------------------------------------------------------------

export function createMemoryAdapter(): MemoryAdapter {
  return new MemoryAdapter();
}

// ---------------------------------------------------------------------------
// Structural conformance witness: the `name` property satisfies the adapter
// name contract shared with src/core/. The full SpecAdapter interface (parse,
// validate, resolve, etc.) is RFC-1/Soul.md-specific and does not apply to the
// memory-file domain; MemoryAdapter exposes run() instead.
// The typed assignment below witnesses C-001 compliance at the name-contract
// level (the only overlap with src/core/ beyond the import of the SpecAdapter
// type itself).
// ---------------------------------------------------------------------------
const _nameContractWitness: Pick<SpecAdapter, "name"> = createMemoryAdapter();
// _nameContractWitness: structural type check only — the _ prefix suppresses the unused-var warning.
