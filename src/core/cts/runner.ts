/**
 * CTS runner — executes Appendix F manifest cases through the spec-agnostic
 * `checkSoul` pipeline and compares outcomes (FR-014; contracts/cts-manifest.md).
 *
 * Pass/fail semantics (contract):
 * - a case passes iff report `ok` equals `expect_ok`, every `expect_errors`
 *   entry matches ≥1 actual error, and any declared `expect_effective_*`
 *   comparison holds byte-for-byte in canonical JSON (Appendix F.2);
 * - the discrimination rule is symmetric (SC-002/SC-006): an expected-failure
 *   fixture that validates clean is a FAILURE, exactly like an expected-pass
 *   fixture that errors;
 * - cases run independently; one case's crash fails that case with the
 *   exception message and the suite continues.
 *
 * F.2 honesty: `expect_effective_json` files are compared as RAW BYTES against
 * `canonicalJson(effective)` — never re-canonicalized and never deep-equal —
 * so a malformed (non-canonical) fixture file fails loudly instead of being
 * silently repaired.
 *
 * Spec-agnostic: parameterized over `SpecAdapter`; nothing here names a
 * concrete spec (C-004).
 */

import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import type { EffectiveConfig, SpecAdapter } from "../adapter.js";
import { canonicalJson } from "../canonical-json.js";
import { checkSoul, makeFsLoadRef } from "../pipeline.js";
import { buildReport, type ConformanceReport } from "../report.js";
import type { CtsCase } from "./manifest.js";

/** Outcome of one manifest case (data-model: CtsCaseResult). */
export interface CtsCaseResult {
  id: string;
  passed: boolean;
  report: ConformanceReport;
  /** Human-readable expectation failures; empty iff `passed`. */
  mismatches: string[];
}

export interface CtsSummary {
  total: number;
  passed: number;
  failed: number;
}

export interface RunCtsOptions {
  /** Run only cases whose id satisfies the predicate. */
  filter?: (id: string) => boolean;
  /**
   * FR-002/FR-003 (`--restrict-refs`): confine §7.2 reference loading.
   * `true` → each case's root soul directory; a string → that fixed base
   * directory. Absent → unrestricted (shipped behavior, NFR-001).
   */
  restrictRefs?: string | true;
}

/** ±40-byte debug window around a byte difference (SC-007 debuggability). */
const CONTEXT_BYTES = 40;

/** First differing byte offset between two buffers, or -1 when equal. */
function firstByteDifference(expected: Buffer, actual: Buffer): number {
  const shared = Math.min(expected.length, actual.length);
  for (let i = 0; i < shared; i++) {
    if (expected[i] !== actual[i]) {
      return i;
    }
  }
  return expected.length === actual.length ? -1 : shared;
}

/** A printable (JSON-escaped) window of ±CONTEXT_BYTES around `offset`. */
function contextWindow(bytes: Buffer, offset: number): string {
  const start = Math.max(0, offset - CONTEXT_BYTES);
  const end = Math.min(bytes.length, offset + CONTEXT_BYTES);
  return JSON.stringify(bytes.subarray(start, end).toString("utf8"));
}

/**
 * Byte-for-byte canonical-JSON comparison (Appendix F.2). Returns null on
 * equality, otherwise a mismatch message carrying the first differing byte
 * offset and a ±40-char context window from BOTH sides.
 */
function compareCanonicalBytes(
  label: string,
  expected: Buffer,
  actual: Buffer
): string | null {
  const offset = firstByteDifference(expected, actual);
  if (offset === -1) {
    return null;
  }
  return (
    `effective config bytes differ from ${label} at byte offset ${offset} ` +
    `(expected ${expected.length} bytes, actual ${actual.length} bytes); ` +
    `expected context ${contextWindow(expected, offset)} vs ` +
    `actual context ${contextWindow(actual, offset)}`
  );
}

/** Synthetic §25.1 report for a case whose execution threw. */
function crashReport(adapter: SpecAdapter, ctsCase: CtsCase, message: string): ConformanceReport {
  return buildReport({
    spec: adapter.specVersion,
    soulId: "",
    mode: ctsCase.mode,
    profile: ctsCase.profile ?? "default",
    state: null,
    violations: [
      { path: "(runner)", message: `case execution threw: ${message}`, severity: "error" },
    ],
  });
}

function checkExpectOk(ctsCase: CtsCase, report: ConformanceReport, mismatches: string[]): void {
  if (report.ok === ctsCase.expect_ok) {
    return;
  }
  if (ctsCase.expect_ok) {
    const detail = report.errors
      .map((e) => `${e.path}: ${e.message}`)
      .join("; ");
    mismatches.push(
      `expected ok report but got ${report.errors.length} error(s): ${detail}`
    );
  } else {
    // Appendix F discrimination (SC-002/SC-006): a fixture expected to fail
    // that validates clean is itself a suite failure.
    mismatches.push(
      "Appendix F discrimination: expected a failing report (expect_ok: false) but the document validated clean (ok: true)"
    );
  }
}

function checkExpectedErrors(
  ctsCase: CtsCase,
  report: ConformanceReport,
  mismatches: string[]
): void {
  for (const expectation of ctsCase.expect_errors ?? []) {
    const matched = report.errors.some(
      (actual) =>
        actual.path === expectation.path && actual.message.includes(expectation.message)
    );
    if (!matched) {
      const actualPaths =
        report.errors.length === 0
          ? "no errors reported"
          : `actual error paths: ${report.errors.map((e) => e.path).join(", ")}`;
      mismatches.push(
        `expected error at ${expectation.path} matching "${expectation.message}" not found (${actualPaths})`
      );
    }
  }
}

async function checkEffective(
  ctsCase: CtsCase,
  effective: EffectiveConfig | null,
  mismatches: string[]
): Promise<void> {
  const expectationPath = ctsCase.expect_effective_json ?? ctsCase.expect_effective_yaml;
  if (expectationPath === undefined) {
    return;
  }
  const which = ctsCase.expect_effective_json !== undefined
    ? "expect_effective_json"
    : "expect_effective_yaml";

  if (!ctsCase.expect_ok) {
    // Manifest authoring error: F.2 comparison only applies to passing cases.
    mismatches.push(
      `manifest authoring error: ${which} declared on an expect_ok: false case — effective comparison applies to passing cases only`
    );
    return;
  }
  if (effective === null) {
    mismatches.push(
      `cannot compare ${which}: the pipeline produced no effective config`
    );
    return;
  }

  const actual = Buffer.from(canonicalJson(effective), "utf8");

  if (ctsCase.expect_effective_json !== undefined) {
    // Raw fixture bytes, deliberately NOT re-canonicalized: the fixture file
    // must already be canonical JSON (Appendix F.2 byte-for-byte path).
    const expected = await readFile(ctsCase.expect_effective_json);
    const mismatch = compareCanonicalBytes(
      `expect_effective_json file "${ctsCase.expect_effective_json}"`,
      expected,
      actual
    );
    if (mismatch !== null) {
      mismatches.push(mismatch);
    }
    return;
  }

  // expect_effective_yaml (R8 fidelity path): YAML-load, canonicalize BOTH
  // sides, then still compare bytes — never deep-equal (number-formatting
  // drift must surface).
  const rawYaml = await readFile(expectationPath, "utf8");
  let parsed: unknown;
  try {
    parsed = parseYaml(rawYaml);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    mismatches.push(
      `cannot compare expect_effective_yaml: file "${expectationPath}" is not valid YAML: ${reason}`
    );
    return;
  }
  const expected = Buffer.from(canonicalJson(parsed), "utf8");
  const mismatch = compareCanonicalBytes(
    `canonicalized expect_effective_yaml file "${expectationPath}"`,
    expected,
    actual
  );
  if (mismatch !== null) {
    mismatches.push(mismatch);
  }
}

async function runCase(
  adapter: SpecAdapter,
  ctsCase: CtsCase,
  restrictRefs?: string | true
): Promise<CtsCaseResult> {
  try {
    const raw = await readFile(ctsCase.root, "utf8");
    // --restrict-refs (FR-003): bare flag → per-case root soul directory;
    // a string → fixed base directory; absent → unrestricted (NFR-001).
    const restrictTo =
      restrictRefs === undefined
        ? undefined
        : restrictRefs === true
          ? dirname(ctsCase.root)
          : restrictRefs;
    const loadRef = makeFsLoadRef(
      (refRaw, refPath) => adapter.parse(refRaw, refPath, ctsCase.mode),
      restrictTo === undefined ? undefined : { restrictTo }
    );
    const opts: { profile?: string; state?: string; mode: CtsCase["mode"] } = {
      mode: ctsCase.mode,
    };
    if (ctsCase.profile !== undefined) opts.profile = ctsCase.profile;
    if (ctsCase.state !== undefined) opts.state = ctsCase.state;

    const { report, effective } = await checkSoul(adapter, raw, ctsCase.root, opts, loadRef);

    const mismatches: string[] = [];
    checkExpectOk(ctsCase, report, mismatches);
    checkExpectedErrors(ctsCase, report, mismatches);
    await checkEffective(ctsCase, effective, mismatches);

    return { id: ctsCase.id, passed: mismatches.length === 0, report, mismatches };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: ctsCase.id,
      passed: false,
      report: crashReport(adapter, ctsCase, message),
      mismatches: [`case execution threw: ${message}`],
    };
  }
}

/**
 * Run manifest cases through `adapter` (FR-014). Cases run independently and
 * in manifest order; `opts.filter` selects a subset by id.
 */
export async function runCts(
  adapter: SpecAdapter,
  cases: readonly CtsCase[],
  opts?: RunCtsOptions
): Promise<CtsCaseResult[]> {
  const selected = opts?.filter !== undefined ? cases.filter((c) => opts.filter!(c.id)) : cases;
  const results: CtsCaseResult[] = [];
  for (const ctsCase of selected) {
    results.push(await runCase(adapter, ctsCase, opts?.restrictRefs));
  }
  return results;
}

/** Aggregate counts for suite gating (WP08) and CLI reporting (WP10). */
export function summarize(results: readonly CtsCaseResult[]): CtsSummary {
  const passed = results.filter((r) => r.passed).length;
  return { total: results.length, passed, failed: results.length - passed };
}
