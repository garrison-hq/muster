/**
 * Integration test: memory adapter fixture suite (WP05 T021).
 *
 * FR-011: manifest runner produces AdapterResult for consistent/stale/contradictory
 *         fixture sets; correct ok/findings shape.
 * FR-012: fixture suite shaped as candidate upstream conformance suite (C-005).
 * NFR-001: byte-stability — two identical runs with the same fixed reference
 *          date produce byte-identical JSON output.
 * C-003: no new Date() / Date.now(); reference date supplied as a fixed string.
 *
 * Five sub-tests (all must pass; no skips):
 *   1. Consistent fixture — static lint pass (ok: true, findings.length === 0)
 *   2. Stale fixture — staleness finding (ok: false, kind === 'staleness')
 *   3. Contradictory fixture — contradiction finding (ok: false, kind === 'contradiction')
 *   4. Byte-stability check (consistent + stale: two runs → byte-identical JSON)
 *   5. Conformance suite shape (case IDs stable, fixture paths exist)
 */

import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MemoryAdapter, type AdapterManifest } from "../../../src/adapters/memory/index.js";
import type { ChatClient } from "../../../src/core/behavioral/types.js";
import { RecallProbeRunner } from "../../../src/adapters/memory/recall.js";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { RecallProbe, RecallVerdict } from "../../../src/adapters/memory/recall.js";

// ---------------------------------------------------------------------------
// Fixture paths (relative to the repo root, resolved at test run time).
// ---------------------------------------------------------------------------

const repoRoot = resolvePath(fileURLToPath(new URL("../../..", import.meta.url)));

function fixturePath(...segments: string[]): string {
  return resolvePath(repoRoot, "tests", "fixtures", "memory", ...segments);
}

// ---------------------------------------------------------------------------
// Fixed reference date (C-003, NFR-001): must not be the system clock.
// Two runs with this date produce byte-identical output.
// ---------------------------------------------------------------------------

const FIXED_REFERENCE_DATE = "2026-01-01T00:00:00Z";

// ---------------------------------------------------------------------------
// Consistent manifest
// ---------------------------------------------------------------------------

const consistentManifest: AdapterManifest = {
  cases: [
    {
      id: "consistent-static-01",
      memoryPath: fixturePath("consistent", "MEMORY.md"),
      userPath: fixturePath("consistent", "USER.md"),
      manifestPath: fixturePath("consistent", "manifest.json"),
      referenceDate: FIXED_REFERENCE_DATE,
    },
  ],
};

// ---------------------------------------------------------------------------
// Stale manifest
// ---------------------------------------------------------------------------

const staleManifest: AdapterManifest = {
  cases: [
    {
      id: "stale-static-01",
      memoryPath: fixturePath("stale", "MEMORY.md"),
      userPath: fixturePath("stale", "USER.md"),
      manifestPath: fixturePath("stale", "manifest.json"),
      referenceDate: FIXED_REFERENCE_DATE,
    },
  ],
};

// ---------------------------------------------------------------------------
// Contradictory manifest
// ---------------------------------------------------------------------------

const contradictoryManifest: AdapterManifest = {
  cases: [
    {
      id: "contradictory-static-01",
      memoryPath: fixturePath("contradictory", "MEMORY.md"),
      userPath: fixturePath("contradictory", "USER.md"),
      manifestPath: fixturePath("contradictory", "manifest.json"),
      referenceDate: FIXED_REFERENCE_DATE,
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("memory adapter fixture suite (WP05 T021)", () => {
  const adapter = new MemoryAdapter();

  // ── Sub-test 1: Consistent fixture — static lint pass ────────────────────

  it("1. consistent fixture: ok=true, no findings", async () => {
    const result = await adapter.run(consistentManifest, { behavioral: false });

    expect(result.ok).toBe(true);
    expect(result.findings.length).toBe(0);
    expect(result.lintReports.length).toBe(1);
    expect(result.lintReports[0]!.ok).toBe(true);
    expect(result.lintReports[0]!.stalenessFindings).toHaveLength(0);
    expect(result.lintReports[0]!.contradictionFindings).toHaveLength(0);
  });

  // ── Sub-test 2: Stale fixture — staleness finding ────────────────────────

  it("2. stale fixture: ok=false, at least one staleness finding", async () => {
    const result = await adapter.run(staleManifest, { behavioral: false });

    expect(result.ok).toBe(false);
    const stalenessFindings = result.findings.filter((f) => f.kind === "staleness");
    expect(stalenessFindings.length).toBeGreaterThanOrEqual(1);
    expect(result.lintReports[0]!.ok).toBe(false);
    expect(result.lintReports[0]!.stalenessFindings.length).toBeGreaterThanOrEqual(1);
  });

  // ── Sub-test 3: Contradictory fixture — contradiction finding ────────────

  it("3. contradictory fixture: ok=false, at least one contradiction finding", async () => {
    const result = await adapter.run(contradictoryManifest, { behavioral: false });

    expect(result.ok).toBe(false);
    const contradictionFindings = result.findings.filter((f) => f.kind === "contradiction");
    expect(contradictionFindings.length).toBeGreaterThanOrEqual(1);
    expect(result.lintReports[0]!.ok).toBe(false);
    expect(result.lintReports[0]!.contradictionFindings.length).toBeGreaterThanOrEqual(1);
  });

  // ── Sub-test 4: Byte-stability check (NFR-001, SC-006) ───────────────────

  it("4. byte-stability: two runs of consistent fixture → identical JSON", async () => {
    const [result1, result2] = await Promise.all([
      adapter.run(consistentManifest, { behavioral: false }),
      adapter.run(consistentManifest, { behavioral: false }),
    ]);

    // Byte-identical JSON serialization (NFR-001).
    // JSON.stringify is deterministic for plain objects with string/number/boolean values.
    // The adapter sorts findings by factId (UTF-16) and uses canonicalJson internally.
    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });

  it("4b. byte-stability: two runs of stale fixture → identical JSON", async () => {
    const [result1, result2] = await Promise.all([
      adapter.run(staleManifest, { behavioral: false }),
      adapter.run(staleManifest, { behavioral: false }),
    ]);

    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });

  // ── Sub-test 5: Conformance suite shape (C-005, FR-012) ──────────────────

  it("5. conformance suite shape: case IDs are stable non-empty strings, fixture paths exist", async () => {
    // All manifests used in this suite.
    const allManifests = [consistentManifest, staleManifest, contradictoryManifest];

    for (const manifest of allManifests) {
      for (const lintCase of manifest.cases) {
        // Case id must be a non-empty stable human-readable string (no UUIDs generated at run time).
        expect(lintCase.id).toBeTruthy();
        expect(typeof lintCase.id).toBe("string");
        // Verify stable format: human-readable words with dashes and digits only
        // (no UUID pattern e.g. xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx).
        expect(lintCase.id).toMatch(/^[a-z][a-z0-9-]*[a-z0-9]$/);

        // Fixture paths must resolve to existing files.
        expect(existsSync(lintCase.memoryPath)).toBe(true);
        expect(existsSync(lintCase.userPath)).toBe(true);
        expect(existsSync(lintCase.manifestPath)).toBe(true);
      }
    }

    // Verify the fixture directory README exists (C-005).
    const readmePath = fixturePath("README.md");
    expect(existsSync(readmePath)).toBe(true);
  });

  // ── Coverage: behavioral path — recall probe with mock client ─────────────

  it("6. behavioral recall probe: RecallProbeRunner executes recall with mock ChatClient", async () => {
    // Create a mock ChatClient that always returns text containing the required fact
    // (TypeScript programming language preference).
    const mockClient: ChatClient = {
      chat: async (_messages, _opts) => "The user prefers TypeScript for all new projects.",
    };

    // Load the recall probe YAML fixture directly.
    const probeYaml = readFileSync(fixturePath("recall-scenarios", "fact-recall.yaml"), "utf8");
    const probe = parseYaml(probeYaml) as RecallProbe;

    // Drive the behavioral recall path by calling RecallProbeRunner.run() directly
    // with the mock ChatClient (implementation overload that bypasses endpoint + network).
    // The public TypeScript overload only exposes EndpointConfig; the implementation
    // accepts EndpointConfig | ChatClient — we cast via `as Parameters` to reach the
    // implementation-level union overload without network access.
    // This exercises the behavioral recall path (RecallProbeRunner.run body, k-of-n loop).
    const runner = new RecallProbeRunner();
    const verdict = await (runner.run as unknown as (probe: RecallProbe, client: ChatClient) => Promise<RecallVerdict>).call(runner, probe, mockClient);

    // The mock always returns the required fact text, so passCount should equal runsN
    // and the verdict must pass (passCount >= passThresholdK).
    expect(verdict.probeId).toBe(probe.id);
    expect(verdict.pass).toBe(true);
    expect(verdict.passCount).toBeGreaterThanOrEqual(probe.passThresholdK);
    expect(verdict.totalRuns).toBe(probe.runsN);
    expect(verdict.rubricCitation).toBeTruthy();
  });

  it("7. behavioral path entry: manifest without behavioral flag skips probe cases", async () => {
    // Verify that a manifest with recallCases + privacyCases but behavioral=false
    // skips all behavioral probes — covers the `if (options.behavioral === true)` guard.
    const manifestWithProbes: AdapterManifest = {
      cases: [
        {
          id: "consistent-static-02",
          memoryPath: fixturePath("consistent", "MEMORY.md"),
          userPath: fixturePath("consistent", "USER.md"),
          manifestPath: fixturePath("consistent", "manifest.json"),
          referenceDate: FIXED_REFERENCE_DATE,
        },
      ],
      recallCases: [
        { id: "recall-01", probePath: fixturePath("recall-scenarios", "fact-recall.yaml") },
      ],
      privacyCases: [
        { id: "privacy-01", probePath: fixturePath("privacy-scenarios", "group-context.yaml") },
      ],
    };

    const result = await adapter.run(manifestWithProbes, { behavioral: false });
    // No recall or privacy findings — behavioral path was bypassed.
    expect(result.findings.every((f) => f.kind === "staleness" || f.kind === "contradiction")).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("8. multiple static cases in one manifest: all cases run", async () => {
    // Verifies the for-loop over cases (covers more lines in the run() method).
    const multiCaseManifest: AdapterManifest = {
      cases: [
        {
          id: "multi-case-consistent",
          memoryPath: fixturePath("consistent", "MEMORY.md"),
          userPath: fixturePath("consistent", "USER.md"),
          manifestPath: fixturePath("consistent", "manifest.json"),
          referenceDate: FIXED_REFERENCE_DATE,
        },
        {
          id: "multi-case-stale",
          memoryPath: fixturePath("stale", "MEMORY.md"),
          userPath: fixturePath("stale", "USER.md"),
          manifestPath: fixturePath("stale", "manifest.json"),
          referenceDate: FIXED_REFERENCE_DATE,
        },
      ],
    };

    const result = await adapter.run(multiCaseManifest, { behavioral: false });
    // First case passes, second fails — overall ok is false.
    expect(result.ok).toBe(false);
    expect(result.lintReports.length).toBe(2);
    expect(result.lintReports[0]!.ok).toBe(true);
    expect(result.lintReports[1]!.ok).toBe(false);
  });

  it("9.b behavioral recall error path: throws when endpoint missing for recall probe", async () => {
    // Exercises the behavioral path entry (lines 263-285) and the error throw (line 273-276).
    const manifestWithRecall: AdapterManifest = {
      cases: [
        {
          id: "for-recall-error",
          memoryPath: fixturePath("consistent", "MEMORY.md"),
          userPath: fixturePath("consistent", "USER.md"),
          manifestPath: fixturePath("consistent", "manifest.json"),
          referenceDate: FIXED_REFERENCE_DATE,
        },
      ],
      recallCases: [
        { id: "recall-err", probePath: fixturePath("recall-scenarios", "fact-recall.yaml") },
      ],
    };

    // behavioral=true without endpoint → should throw on the recall probe.
    await expect(
      adapter.run(manifestWithRecall, { behavioral: true })
    ).rejects.toThrow("requires endpoint config");
  });

  it("9.c behavioral privacy error path: throws when endpoint missing for privacy probe", async () => {
    // Exercises the privacy probe error throw path (lines 289-306).
    const manifestWithPrivacy: AdapterManifest = {
      cases: [
        {
          id: "for-privacy-error",
          memoryPath: fixturePath("consistent", "MEMORY.md"),
          userPath: fixturePath("consistent", "USER.md"),
          manifestPath: fixturePath("consistent", "manifest.json"),
          referenceDate: FIXED_REFERENCE_DATE,
        },
      ],
      privacyCases: [
        { id: "privacy-err", probePath: fixturePath("privacy-scenarios", "group-context.yaml") },
      ],
    };

    // behavioral=true without endpoint → should throw on the privacy probe.
    await expect(
      adapter.run(manifestWithPrivacy, { behavioral: true })
    ).rejects.toThrow("requires endpoint config");
  });

  it("9. no reference date: staleness check skipped with skip note", async () => {
    // Covers the StalenessSkipNote path (referenceDate omitted from manifest case).
    const noDateManifest: AdapterManifest = {
      cases: [
        {
          id: "no-ref-date-case",
          memoryPath: fixturePath("stale", "MEMORY.md"),
          userPath: fixturePath("stale", "USER.md"),
          manifestPath: fixturePath("stale", "manifest.json"),
          // referenceDate intentionally omitted
        },
      ],
    };

    const result = await adapter.run(noDateManifest, { behavioral: false });
    // No staleness findings because referenceDate is undefined → skip note.
    // ok may be false if stalenessSkip is set (depends on StalenessLinter.lint behaviour).
    expect(result.lintReports.length).toBe(1);
    // stalenessSkip should be set.
    expect(result.lintReports[0]!.stalenessSkip).toBeDefined();
    expect(result.lintReports[0]!.stalenessSkip?.kind).toBe("staleness-skip");
  });
});
