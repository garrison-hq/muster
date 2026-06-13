/**
 * WP02 unit tests: ContradictionLinter
 *
 * Seven test cases per spec (T008):
 *   1. Cross-file contradiction test (acceptance scenario 2, FR-004)
 *   2. Intra-file contradiction test (acceptance scenario 3, FR-004)
 *   3. Supersession not flagged test (edge case, FR-004, FR-010)
 *   4. Clean set test (acceptance scenario 4, FR-004)
 *   5. Byte-stability test (NFR-001)
 *   6. Rigged-impossible discrimination control (FR-009)
 *   7. rubricCitation is non-empty constant (C-002)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FactParser,
  type FactManifest,
  type MemoryFact,
} from "../../../src/adapters/memory/lint.js";
import { ContradictionLinter } from "../../../src/adapters/memory/contradiction.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURES = join(process.cwd(), "tests/fixtures/memory");

function loadManifest(dir: string): FactManifest {
  return JSON.parse(
    readFileSync(join(FIXTURES, dir, "manifest.json"), "utf8")
  ) as FactManifest;
}

// ---------------------------------------------------------------------------
// Test 1 — Cross-file contradiction test (FR-004, acceptance scenario 2)
// ---------------------------------------------------------------------------

describe("ContradictionLinter — cross-file contradiction", () => {
  it("produces at least one ContradictionFinding where factASource !== factBSource", () => {
    const parser = new FactParser();
    const manifest = loadManifest("contradictory");
    const memoryFacts = parser.parse(
      join(FIXTURES, "contradictory/MEMORY.md"),
      manifest
    );
    const userFacts = parser.parse(
      join(FIXTURES, "contradictory/USER.md"),
      manifest
    );

    const linter = new ContradictionLinter();
    const { contradictionFindings } = linter.lint(memoryFacts, userFacts);

    // At least one cross-file contradiction
    const crossFile = contradictionFindings.filter(
      (f) => f.factASource !== f.factBSource
    );
    expect(crossFile.length).toBeGreaterThanOrEqual(1);

    // Verify structure of the first cross-file finding
    const finding = crossFile[0];
    expect(finding.kind).toBe("contradiction");
    expect(finding.factAId).toBeTruthy();
    expect(finding.factBId).toBeTruthy();
    expect(finding.factAText).toBeTruthy();
    expect(finding.factBText).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Intra-file contradiction test (FR-004, acceptance scenario 3)
// ---------------------------------------------------------------------------

describe("ContradictionLinter — intra-file contradiction", () => {
  it("produces at least one ContradictionFinding where both sources are MEMORY.md", () => {
    const parser = new FactParser();
    const manifest = loadManifest("contradictory");
    const memoryFacts = parser.parse(
      join(FIXTURES, "contradictory/MEMORY.md"),
      manifest
    );
    const userFacts = parser.parse(
      join(FIXTURES, "contradictory/USER.md"),
      manifest
    );

    const linter = new ContradictionLinter();
    const { contradictionFindings } = linter.lint(memoryFacts, userFacts);

    // At least one intra-file contradiction in MEMORY.md
    const intraFile = contradictionFindings.filter(
      (f) => f.factASource === "MEMORY.md" && f.factBSource === "MEMORY.md"
    );
    expect(intraFile.length).toBeGreaterThanOrEqual(1);

    const finding = intraFile[0];
    expect(finding.factAId).toBe("memory-contact-method-0");
    expect(finding.factBId).toBe("memory-contact-method-1");
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Supersession not flagged test (FR-004, FR-010, edge case)
//
// Fixture pair:
//   memory-project-status-0: "The project deadline is 2025-01-15T00:00:00Z..."
//   memory-project-status-1: "The project deadline is 2025-06-01T00:00:00Z..."
//
// factB has a later timestamp → this MUST be a SupersessionNote, NOT a
// ContradictionFinding.
// ---------------------------------------------------------------------------

describe("ContradictionLinter — supersession not flagged", () => {
  it("does NOT emit a ContradictionFinding for the supersession pair", () => {
    const parser = new FactParser();
    const manifest = loadManifest("contradictory");
    const memoryFacts = parser.parse(
      join(FIXTURES, "contradictory/MEMORY.md"),
      manifest
    );
    const userFacts = parser.parse(
      join(FIXTURES, "contradictory/USER.md"),
      manifest
    );

    const linter = new ContradictionLinter();
    const { contradictionFindings, supersessionNotes } = linter.lint(
      memoryFacts,
      userFacts
    );

    // The supersession pair must NOT appear in contradiction findings
    const supersessionAsFinding = contradictionFindings.find(
      (f) =>
        (f.factAId === "memory-project-status-0" &&
          f.factBId === "memory-project-status-1") ||
        (f.factAId === "memory-project-status-1" &&
          f.factBId === "memory-project-status-0")
    );
    expect(supersessionAsFinding).toBeUndefined();

    // The supersession pair MUST appear in supersessionNotes
    expect(supersessionNotes.length).toBeGreaterThanOrEqual(1);
    const note = supersessionNotes.find(
      (n) =>
        (n.supersededFactId === "memory-project-status-0" &&
          n.supersedingFactId === "memory-project-status-1") ||
        (n.supersededFactId === "memory-project-status-1" &&
          n.supersedingFactId === "memory-project-status-0")
    );
    expect(note).toBeDefined();
    expect(note?.kind).toBe("supersession");
    // Older fact is superseded by newer fact
    expect(note?.supersededFactId).toBe("memory-project-status-0");
    expect(note?.supersedingFactId).toBe("memory-project-status-1");
  });
});

// ---------------------------------------------------------------------------
// Test 4 — Clean set test (FR-004, acceptance scenario 4)
// ---------------------------------------------------------------------------

describe("ContradictionLinter — clean fixture", () => {
  it("returns zero contradictionFindings and zero supersessionNotes for the consistent fixture", () => {
    const parser = new FactParser();
    const manifest = loadManifest("consistent");
    const memoryFacts = parser.parse(
      join(FIXTURES, "consistent/MEMORY.md"),
      manifest
    );
    const userFacts = parser.parse(
      join(FIXTURES, "consistent/USER.md"),
      manifest
    );

    const linter = new ContradictionLinter();
    const { contradictionFindings, supersessionNotes } = linter.lint(
      memoryFacts,
      userFacts
    );

    expect(contradictionFindings.length).toBe(0);
    expect(supersessionNotes.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 5 — Byte-stability test (NFR-001)
// ---------------------------------------------------------------------------

describe("ContradictionLinter — byte stability", () => {
  it("produces identical JSON.stringify output across two runs with the same inputs", () => {
    const parser = new FactParser();
    const manifest = loadManifest("contradictory");
    const memoryFacts = parser.parse(
      join(FIXTURES, "contradictory/MEMORY.md"),
      manifest
    );
    const userFacts = parser.parse(
      join(FIXTURES, "contradictory/USER.md"),
      manifest
    );

    const linter = new ContradictionLinter();

    const r1 = linter.lint(memoryFacts, userFacts);
    const r2 = linter.lint(memoryFacts, userFacts);

    expect(JSON.stringify(r1.contradictionFindings)).toBe(
      JSON.stringify(r2.contradictionFindings)
    );
    expect(JSON.stringify(r1.supersessionNotes)).toBe(
      JSON.stringify(r2.supersessionNotes)
    );

    // Findings must exist (non-trivial check)
    expect(r1.contradictionFindings.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test 6 — Rigged-impossible discrimination control (FR-009)
//
// Two fact arrays with DISJOINT subject keywords must produce zero findings.
// The linter CANNOT invent contradictions from unrelated facts.
// ---------------------------------------------------------------------------

describe("ContradictionLinter — discrimination control", () => {
  it("returns zero contradictionFindings when all subjects are disjoint (no shared keywords)", () => {
    // MEMORY facts: all about geography
    const memoryFacts: MemoryFact[] = [
      {
        id: "memory-root-0",
        source: "MEMORY.md",
        text: "The capital of France is Paris.",
        private: false,
        timeSensitive: false,
        timestamp: undefined,
      },
      {
        id: "memory-root-1",
        source: "MEMORY.md",
        text: "Mount Everest is the tallest mountain.",
        private: false,
        timeSensitive: false,
        timestamp: undefined,
      },
    ];

    // USER facts: all about cooking — disjoint subjects from MEMORY
    const userFacts: MemoryFact[] = [
      {
        id: "user-root-0",
        source: "USER.md",
        text: "Boil pasta for eight minutes until tender.",
        private: false,
        timeSensitive: false,
        timestamp: undefined,
      },
      {
        id: "user-root-1",
        source: "USER.md",
        text: "Roast chicken at 180 degrees for ninety minutes.",
        private: false,
        timeSensitive: false,
        timestamp: undefined,
      },
    ];

    const linter = new ContradictionLinter();
    const { contradictionFindings } = linter.lint(memoryFacts, userFacts);

    // Discrimination control: disjoint keywords → zero contradictions
    expect(contradictionFindings.length).toBe(0);
  });

  it("confirms the contradictory fixture DOES produce findings, proving the linter is not always-pass", () => {
    const parser = new FactParser();
    const manifest = loadManifest("contradictory");
    const memoryFacts = parser.parse(
      join(FIXTURES, "contradictory/MEMORY.md"),
      manifest
    );
    const userFacts = parser.parse(
      join(FIXTURES, "contradictory/USER.md"),
      manifest
    );

    const linter = new ContradictionLinter();
    const { contradictionFindings } = linter.lint(memoryFacts, userFacts);

    // Must find contradictions — the linter is NOT always returning zero
    expect(contradictionFindings.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test 7 — rubricCitation is non-empty constant (C-002)
// ---------------------------------------------------------------------------

describe("ContradictionLinter — rubricCitation (C-002)", () => {
  it("all ContradictionFindings carry a non-empty rubricCitation string", () => {
    const parser = new FactParser();
    const manifest = loadManifest("contradictory");
    const memoryFacts = parser.parse(
      join(FIXTURES, "contradictory/MEMORY.md"),
      manifest
    );
    const userFacts = parser.parse(
      join(FIXTURES, "contradictory/USER.md"),
      manifest
    );

    const linter = new ContradictionLinter();
    const { contradictionFindings } = linter.lint(memoryFacts, userFacts);

    expect(contradictionFindings.length).toBeGreaterThan(0);

    for (const finding of contradictionFindings) {
      expect(typeof finding.rubricCitation).toBe("string");
      expect(finding.rubricCitation.length).toBeGreaterThan(0);
      // Must reference muster
      expect(finding.rubricCitation).toContain("muster");
    }
  });

  it("findings are sorted by factAId then factBId in UTF-16 code-unit order (NFR-001)", () => {
    const parser = new FactParser();
    const manifest = loadManifest("contradictory");
    const memoryFacts = parser.parse(
      join(FIXTURES, "contradictory/MEMORY.md"),
      manifest
    );
    const userFacts = parser.parse(
      join(FIXTURES, "contradictory/USER.md"),
      manifest
    );

    const linter = new ContradictionLinter();
    const { contradictionFindings } = linter.lint(memoryFacts, userFacts);

    // Verify ordering is stable and sorted
    for (let i = 1; i < contradictionFindings.length; i++) {
      const prev = contradictionFindings[i - 1];
      const curr = contradictionFindings[i];
      const cmpA = prev.factAId.localeCompare(curr.factAId, undefined, {
        sensitivity: "variant",
      });
      if (cmpA === 0) {
        // Same factAId — factBId must be in order
        const cmpB = prev.factBId.localeCompare(curr.factBId, undefined, {
          sensitivity: "variant",
        });
        expect(cmpB).toBeLessThanOrEqual(0);
      } else {
        expect(cmpA).toBeLessThanOrEqual(0);
      }
    }
  });
});
