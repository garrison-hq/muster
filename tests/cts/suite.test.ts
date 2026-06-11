/**
 * CTS-1 suite gate (WP08 T031; FR-014/FR-015, SC-001/SC-002).
 *
 * Runs EVERY case of `cts/manifest.yaml` through the spec-agnostic CTS runner
 * with the RFC-1 adapter as part of `pnpm test`. One `it` per case (named
 * `cts: <case_id>`) so a failing fixture is named individually (SC-007), with
 * the runner's `mismatches` printed verbatim in the assertion message.
 *
 * Offline by construction (NFR-003): imports are node:path/node:url, vitest,
 * and muster's own modules — no network access anywhere under tests/cts/.
 */

import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rfc1Adapter } from "../../src/adapters/rfc1/index.js";
import { canonicalJson } from "../../src/core/canonical-json.js";
import {
  isManifestError,
  loadManifest,
  type CtsCase,
} from "../../src/core/cts/manifest.js";
import { runCts, summarize, type CtsCaseResult } from "../../src/core/cts/runner.js";

// Manifest path resolved from THIS file's location (repo root is two levels
// up from tests/cts/), never from the process cwd (T021/T031 contract).
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const manifestPath = join(repoRoot, "cts", "manifest.yaml");

// Top-level await: cases must exist at collection time for it.each naming.
const loaded = await loadManifest(manifestPath);
if (isManifestError(loaded)) {
  throw new Error(
    `cts/manifest.yaml failed Appendix F.1 validation:\n` +
      loaded.map((v) => `  ${v.path}: ${v.message}`).join("\n")
  );
}
const cases: CtsCase[] = loaded;

const startedAt = performance.now();
const results = await runCts(rfc1Adapter, cases);

// NFR-001/SC-004 determinism guard: re-run every resolution-bearing case
// (those with a declared effective-config expectation). Each run byte-compares
// `canonicalJson(effective)` against the same expected.json file, so two
// passing runs prove byte-identical canonical output; the report comparison
// below additionally pins every violation/profile/state field.
const resolutionBearingIds = new Set(
  cases
    .filter((c) => c.expect_effective_json !== undefined || c.expect_effective_yaml !== undefined)
    .map((c) => c.id)
);
const rerunResults = await runCts(rfc1Adapter, cases, {
  filter: (id) => resolutionBearingIds.has(id),
});
const elapsedMs = performance.now() - startedAt;

const resultById = new Map<string, CtsCaseResult>(results.map((r) => [r.id, r]));

function describeFailure(result: CtsCaseResult): string {
  return (
    `CTS case "${result.id}" failed with ${result.mismatches.length} mismatch(es):\n` +
    result.mismatches.map((m) => `  - ${m}`).join("\n") +
    `\nreport: ${JSON.stringify(result.report, null, 2)}`
  );
}

describe("CTS-1 suite — RFC-1 §25.2 / Appendix F (cts/manifest.yaml)", () => {
  it("manifest covers cases for all nine §25.2 categories across the six Appendix F directories", () => {
    // Coverage floor (contracts/cts-manifest.md): the six fixture directories
    // carry the nine categories — minimal (cats 1–3), merge (4),
    // composition (5–6), profiles (7), state (8), evaluation (9).
    for (const dir of ["minimal", "merge", "composition", "profiles", "state", "evaluation"]) {
      const inDir = cases.filter((c) => c.root.includes(`fixtures/${dir}/`));
      expect(inDir.length, `no manifest cases under fixtures/${dir}/`).toBeGreaterThan(0);
    }
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  // One `it` per manifest case (SC-007 diagnosability): a failure names the
  // fixture and prints the runner's mismatches verbatim.
  it.each(results.map((result) => ({ id: result.id, result })))(
    "cts: $id",
    ({ result }) => {
      expect(result.passed, describeFailure(result)).toBe(true);
    }
  );

  it("every case passed (SC-001/SC-002 aggregate gate)", () => {
    const summary = summarize(results);
    const failures = results.filter((r) => !r.passed);
    expect(
      summary.failed,
      failures.map(describeFailure).join("\n\n")
    ).toBe(0);
    expect(summary.total).toBe(cases.length);
  });

  it("resolution is deterministic across runs — byte-identical canonical output (§4.4; NFR-001/SC-004)", () => {
    expect(rerunResults.length).toBe(resolutionBearingIds.size);
    for (const rerun of rerunResults) {
      const first = resultById.get(rerun.id);
      expect(first, `case "${rerun.id}" missing from the first run`).toBeDefined();
      // Both runs byte-compared canonicalJson(effective) against the same
      // expected.json fixture; equal full results mean byte-identical output.
      expect(rerun.passed, describeFailure(rerun)).toBe(true);
      expect(canonicalJson({ id: rerun.id, passed: rerun.passed, report: rerun.report })).toBe(
        canonicalJson({ id: first!.id, passed: first!.passed, report: first!.report })
      );
    }
  });

  it("full suite (run twice over resolution-bearing cases) stays under 10 s (NFR-002)", () => {
    expect(elapsedMs).toBeLessThan(10_000);
  });
});
