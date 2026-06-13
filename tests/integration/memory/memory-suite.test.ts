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
});
