/**
 * WP01 unit tests: staleness branch of FactParser + StalenessLinter.
 *
 * Six test cases per spec (T004):
 *   1. Stale-fact test (acceptance scenario 1, FR-003)
 *   2. Clean-set test (acceptance scenario 4, FR-003)
 *   3. No-reference-date test (edge case, FR-003)
 *   4. Byte-stability test (NFR-001)
 *   5. Rigged-impossible discrimination control (FR-009)
 *   6. Coverage — id determinism (two parse calls yield identical ids)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FactParser,
  StalenessLinter,
  serializeLintReport,
  type ReferenceDate,
  type FactManifest,
  type MemoryFact,
} from "../../../src/adapters/memory/lint.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURES = join(process.cwd(), "tests/fixtures/memory");

function loadManifest(dir: string): FactManifest {
  return JSON.parse(
    readFileSync(join(FIXTURES, dir, "manifest.json"), "utf8")
  ) as FactManifest;
}

const REFERENCE_DATE: ReferenceDate = {
  value: new Date("2026-01-01T00:00:00Z"),
};

// ---------------------------------------------------------------------------
// Test 1 — Stale-fact test (FR-003, acceptance scenario 1)
// ---------------------------------------------------------------------------

describe("StalenessLinter — stale fixture", () => {
  it("produces a staleness finding for a time-sensitive fact dated >90 days before reference", () => {
    const parser = new FactParser();
    const manifest = loadManifest("stale");
    const facts = parser.parse(
      join(FIXTURES, "stale/MEMORY.md"),
      manifest
    );

    const linter = new StalenessLinter();
    const report = linter.lint(facts, REFERENCE_DATE);

    // ok must be false — at least one stale finding
    expect(report.ok).toBe(false);

    // At least one finding
    expect(report.stalenessFindings.length).toBeGreaterThanOrEqual(1);

    const finding = report.stalenessFindings[0];

    // Finding names the correct fact
    expect(finding.factId).toBe("memory-last-session-0");

    // Age must be >90 days
    // 2025-05-01 to 2026-01-01 = 245 days
    expect(finding.ageInDays).toBeGreaterThan(90);

    // rubricCitation must be a non-empty string (C-002)
    expect(finding.rubricCitation).toBeTruthy();
    expect(typeof finding.rubricCitation).toBe("string");
    expect(finding.rubricCitation.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Clean-set test (FR-003, acceptance scenario 4)
// ---------------------------------------------------------------------------

describe("StalenessLinter — consistent (clean) fixture", () => {
  it("returns ok: true with empty stalenessFindings for consistent non-time-sensitive facts", () => {
    const parser = new FactParser();
    const manifest = loadManifest("consistent");
    const facts = parser.parse(
      join(FIXTURES, "consistent/MEMORY.md"),
      manifest
    );

    const linter = new StalenessLinter();
    const report = linter.lint(facts, REFERENCE_DATE);

    expect(report.ok).toBe(true);
    expect(report.stalenessFindings).toHaveLength(0);
    expect(report.stalenessSkip).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test 3 — No-reference-date test (edge case, FR-003)
// ---------------------------------------------------------------------------

describe("StalenessLinter — no reference date", () => {
  it("returns StalenessSkipNote with ok: false and zero findings when referenceDate is undefined", () => {
    const parser = new FactParser();
    const manifest = loadManifest("stale");
    const facts = parser.parse(
      join(FIXTURES, "stale/MEMORY.md"),
      manifest
    );

    const linter = new StalenessLinter();
    const report = linter.lint(facts, undefined);

    // Must be ok: false — this is not a pass
    expect(report.ok).toBe(false);

    // Must carry a StalenessSkipNote with the correct reason
    expect(report.stalenessSkip).toBeDefined();
    expect(report.stalenessSkip?.kind).toBe("staleness-skip");
    expect(report.stalenessSkip?.reason).toBe("no-reference-date");

    // No staleness findings — just the skip note
    expect(report.stalenessFindings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — Byte-stability test (NFR-001)
// ---------------------------------------------------------------------------

describe("StalenessLinter — byte stability", () => {
  it("produces identical JSON.stringify output across two runs with the same inputs", () => {
    const parser = new FactParser();
    const manifest = loadManifest("stale");
    const facts = parser.parse(
      join(FIXTURES, "stale/MEMORY.md"),
      manifest
    );

    const linter = new StalenessLinter();

    const report1 = linter.lint(facts, REFERENCE_DATE);
    const report2 = linter.lint(facts, REFERENCE_DATE);

    // Byte-stable via serializeLintReport (canonical-JSON, RFC 8785)
    const s1 = serializeLintReport(report1);
    const s2 = serializeLintReport(report2);

    expect(s1).toBe(s2);
    expect(s1.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test 5 — Rigged-impossible discrimination control (FR-009)
// ---------------------------------------------------------------------------

describe("StalenessLinter — discrimination control", () => {
  it("returns ok: true and zero findings when ALL facts are non-time-sensitive (control cannot produce false positive)", () => {
    // Build a fact set where every fact is timeSensitive: false
    const nonSensitiveFacts: MemoryFact[] = [
      {
        id: "memory-root-0",
        source: "MEMORY.md",
        text: "The sky is blue.",
        private: false,
        timeSensitive: false,
        timestamp: undefined,
      },
      {
        id: "memory-root-1",
        source: "MEMORY.md",
        text: "Node.js version: 22",
        private: false,
        timeSensitive: false,
        timestamp: undefined,
      },
    ];

    const linter = new StalenessLinter();
    const report = linter.lint(nonSensitiveFacts, REFERENCE_DATE);

    // Control: no time-sensitive facts → zero findings
    expect(report.ok).toBe(true);
    expect(report.stalenessFindings).toHaveLength(0);
  });

  it("confirms the stale-fact test still produces ok: false, proving the linter can fail (contradiction of always-pass)", () => {
    // If the linter always returned ok: true, the control above would pass
    // but the stale-fact test below MUST fail — proving the linter is live.
    const parser = new FactParser();
    const manifest = loadManifest("stale");
    const staleFacts = parser.parse(
      join(FIXTURES, "stale/MEMORY.md"),
      manifest
    );

    const linter = new StalenessLinter();
    const report = linter.lint(staleFacts, REFERENCE_DATE);

    // Must be ok: false — the linter is NOT always returning true
    expect(report.ok).toBe(false);
    expect(report.stalenessFindings.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Test 6 — Id determinism (NFR-001 byte-stability)
// ---------------------------------------------------------------------------

describe("FactParser — id determinism", () => {
  it("returns identical ids across two parse calls on the same file content", () => {
    const parser = new FactParser();
    const manifest = loadManifest("stale");
    const filePath = join(FIXTURES, "stale/MEMORY.md");

    const facts1 = parser.parse(filePath, manifest);
    const facts2 = parser.parse(filePath, manifest);

    // Same number of facts
    expect(facts1).toHaveLength(facts2.length);

    // Every id is identical
    for (let i = 0; i < facts1.length; i++) {
      expect(facts1[i].id).toBe(facts2[i].id);
    }
  });

  it("ids are non-empty strings without any localeCompare/Intl dependency", () => {
    const parser = new FactParser();
    const manifest = loadManifest("consistent");
    const filePath = join(FIXTURES, "consistent/MEMORY.md");

    const facts = parser.parse(filePath, manifest);

    expect(facts.length).toBeGreaterThan(0);
    for (const fact of facts) {
      expect(typeof fact.id).toBe("string");
      expect(fact.id.length).toBeGreaterThan(0);
      // ids must not contain any whitespace
      expect(fact.id).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 7 — heading-detection regex boundary cases (S8786 ReDoS remediation
// characterization: the heading regex was rewritten from `\s+(.+)$` to
// `\s(.+)$` to remove overlapping-quantifier backtracking; this pins the
// exact heading/non-heading decision at the boundary the old regex produced
// so the rewrite cannot silently change which lines start a new section).
// ---------------------------------------------------------------------------

describe("FactParser — heading regex boundary cases", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "muster-memory-lint-heading-test-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("does not treat a hash followed by exactly one trailing space as a heading", async () => {
    // "# " (hash + single space, nothing else) has only 1 char after the
    // hashes — too short to satisfy the original `\s+(.+)$` (needs >= 2
    // chars total after the hashes). It must remain ordinary paragraph text.
    const content = "# \nplain paragraph text\n";
    const filePath = join(tempDir, "MEMORY.md");
    await writeFile(filePath, content, "utf8");

    const parser = new FactParser();
    const manifest: FactManifest = { labels: {} };
    const facts = parser.parse(filePath, manifest);

    expect(facts).toHaveLength(1);
    // Section stays "root" — the "# " line was never recognised as a heading.
    expect(facts[0]?.id).toMatch(/^memory-root-0$/);
    expect(facts[0]?.text).toBe("# \nplain paragraph text");
  });

  it("treats a hash run followed by only whitespace (length >= 2) as a heading with an empty trimmed title", async () => {
    // "##   " (2 hashes + 3 spaces) has 3 chars after the hashes (all
    // whitespace) — this DOES satisfy the original regex via backtracking,
    // producing an (untrimmed) capture that trims down to "".
    const content = "##   \nunder the blank-titled section\n";
    const filePath = join(tempDir, "MEMORY.md");
    await writeFile(filePath, content, "utf8");

    const parser = new FactParser();
    const manifest: FactManifest = { labels: {} };
    const facts = parser.parse(filePath, manifest);

    expect(facts).toHaveLength(1);
    // slugify("") === "" — section slug segment is empty, not "root".
    expect(facts[0]?.id).toMatch(/^memory--0$/);
    expect(facts[0]?.text).toBe("under the blank-titled section");
  });

  it("still parses an ordinary heading with multiple leading spaces correctly", async () => {
    const content = "##    Real Heading\nbody text\n";
    const filePath = join(tempDir, "MEMORY.md");
    await writeFile(filePath, content, "utf8");

    const parser = new FactParser();
    const manifest: FactManifest = { labels: {} };
    const facts = parser.parse(filePath, manifest);

    expect(facts).toHaveLength(1);
    expect(facts[0]?.id).toMatch(/^memory-real-heading-0$/);
    expect(facts[0]?.text).toBe("body text");
  });
});
