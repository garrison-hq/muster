/**
 * CLI output formatting — pure string builders, no I/O and no business logic
 * (contracts/cli.md; FR-012/FR-013/FR-023 presentation surface).
 *
 * Every function here turns an already-computed core result into human text.
 * Machine output (--json) never passes through this module: the CLI prints
 * core data structures verbatim via JSON.stringify so the §25.1 report,
 * CtsCaseResult[] and CaseVerdict[] shapes stay byte-honest.
 */

import type { ConformanceReport } from "../core/report.js";
import type { CtsCaseResult } from "../core/cts/runner.js";
import type { CaseVerdict, RunVerdict } from "../core/behavioral/types.js";

/** `[§x.y]` suffix only when the violation carries a section citation. */
function sectionSuffix(section: string | undefined): string {
  return section !== undefined ? ` [${section}]` : "";
}

/**
 * Human rendering of a §25.1 conformance report: `OK`/`FAIL` headline, then
 * one indented line per error and warning (`  ERROR <path>: <message> [<§>]`).
 */
export function formatReportHuman(report: ConformanceReport): string {
  const lines: string[] = [report.ok ? "OK" : "FAIL"];
  for (const error of report.errors) {
    lines.push(`  ERROR ${error.path}: ${error.message}${sectionSuffix(error.section)}`);
  }
  for (const warning of report.warnings) {
    lines.push(`  WARNING ${warning.path}: ${warning.message}${sectionSuffix(warning.section)}`);
  }
  return lines.join("\n");
}

/**
 * Human rendering of a CTS run: `PASS <id>` / `FAIL <id>` per case (failures
 * followed by indented mismatches), then the aggregate summary line
 * `N passed, M failed of T`.
 */
export function formatCtsHuman(results: readonly CtsCaseResult[]): string {
  const lines: string[] = [];
  for (const result of results) {
    lines.push(`${result.passed ? "PASS" : "FAIL"} ${result.id}`);
    for (const mismatch of result.mismatches) {
      lines.push(`    ${mismatch}`);
    }
  }
  const passed = results.filter((r) => r.passed).length;
  lines.push(`${passed} passed, ${results.length - passed} failed of ${results.length}`);
  return lines.join("\n");
}

/** Indented per-axis measured-vs-limit lines for one failing run (NFR-005). */
function formatRunFailure(run: RunVerdict): string[] {
  const lines: string[] = [`  run ${run.run} FAIL`];
  if (run.error !== undefined) {
    lines.push(`    error: ${run.error}`);
  }
  for (const grade of run.axes) {
    if (grade.passed) continue;
    lines.push(
      `    ${grade.axis} turn ${grade.turn}: measured ${grade.measured}, limit ${grade.limit}`
    );
  }
  return lines;
}

/**
 * Human rendering of behavioral verdicts: `PASS/FAIL <id> (k/n runs)` per
 * case; failing cases list each failed run's error and per-axis
 * measured-vs-limit detail. Summary line mirrors the CTS format.
 */
export function formatBehaveHuman(verdicts: readonly CaseVerdict[]): string {
  const lines: string[] = [];
  for (const verdict of verdicts) {
    lines.push(
      `${verdict.passed ? "PASS" : "FAIL"} ${verdict.id} ` +
        `(${verdict.passCount}/${verdict.runs.length} runs)`
    );
    if (!verdict.passed) {
      for (const run of verdict.runs) {
        if (!run.passed) lines.push(...formatRunFailure(run));
      }
    }
  }
  const passed = verdicts.filter((v) => v.passed).length;
  lines.push(`${passed} passed, ${verdicts.length - passed} failed of ${verdicts.length}`);
  return lines.join("\n");
}

/**
 * `--filter` glob → anchored RegExp: `*` is the only wildcard (matches any
 * run of characters, including none); everything else is literal.
 */
export function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`);
}
