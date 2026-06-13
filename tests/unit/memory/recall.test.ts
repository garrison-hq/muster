/**
 * WP03 unit tests: RecallProbeRunner behavioral recall probes (k-of-n).
 *
 * Test cases per spec (T012):
 *   1. Recall pass test (acceptance scenario 5, FR-005)
 *   2. Recall fail test (FR-005)
 *   3. Errored run test (FR-008) — errored run = failed run, totalRuns === runsN
 *   4. Partial failure test (FR-005) — 2/3 pass with passThresholdK === 2
 *   5. Rigged-impossible discrimination control (FR-009) — grader returns pass: false
 *   6. USER.md addressing scenario (acceptance scenario 6, FR-005)
 *   7. Fixture fact ID verification — FactParser produces required fact IDs
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  RecallProbeRunner,
  RecallGrader,
  type RecallProbe,
  type ConversationScenario,
} from "../../../src/adapters/memory/recall.js";
import { FactParser, type FactManifest } from "../../../src/adapters/memory/lint.js";
import type { ChatClient } from "../../../src/core/behavioral/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURES = join(process.cwd(), "tests/fixtures/memory");

function makeMockClient(responses: Array<string | Error>): ChatClient {
  let callIndex = 0;
  return {
    chat: vi.fn(async () => {
      const response = responses[callIndex % responses.length];
      callIndex++;
      if (response instanceof Error) throw response;
      return response;
    }),
  };
}

/** Minimal EndpointConfig — never used when client is injected directly. */
const DUMMY_ENDPOINT = {
  baseUrl: "http://localhost:11434/v1",
  model: "llama3",
  apiKeyEnv: "MUSTER_API_KEY" as const,
};

function makeProbe(overrides: Partial<RecallProbe> = {}): RecallProbe {
  return {
    id: "test-probe-01",
    description: "Test recall probe",
    requiredFactId: "memory-project-preferences-0",
    memoryPath: join(FIXTURES, "consistent/MEMORY.md"),
    userPath: join(FIXTURES, "consistent/USER.md"),
    manifestPath: join(FIXTURES, "consistent/manifest.json"),
    scenario: {
      turns: [{ role: "user", content: "What is my preferred programming language?" }],
    },
    runsN: 3,
    passThresholdK: 2,
    rubricCitation: "muster rubric §recall-probe",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1 — Recall pass test (FR-005, acceptance scenario 5)
// ---------------------------------------------------------------------------

describe("RecallProbeRunner — recall pass test", () => {
  it("returns pass: true when model returns fact text on all runs", async () => {
    // MEMORY.md fact text for memory-project-preferences-0:
    // "The user prefers TypeScript for all new projects."
    const factText = "The user prefers TypeScript for all new projects.";
    const client = makeMockClient([factText, factText, factText]);

    const runner = new RecallProbeRunner();
    const probe = makeProbe({ runsN: 3, passThresholdK: 2 });
    const verdict = await runner.run(probe, client as unknown as Parameters<typeof runner.run>[1]);

    expect(verdict.pass).toBe(true);
    expect(verdict.passCount).toBeGreaterThanOrEqual(2);
    expect(verdict.totalRuns).toBe(3);
    // C-002: rubricCitation must be a non-empty string
    expect(verdict.rubricCitation).toBeTruthy();
    expect(typeof verdict.rubricCitation).toBe("string");
    expect(verdict.rubricCitation.length).toBeGreaterThan(0);
    expect(verdict.probeId).toBe(probe.id);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Recall fail test (FR-005)
// ---------------------------------------------------------------------------

describe("RecallProbeRunner — recall fail test", () => {
  it("returns pass: false when model never returns the required fact text", async () => {
    const client = makeMockClient([
      "I don't have information about your preferences.",
      "I cannot recall that.",
      "Sorry, I don't know.",
    ]);

    const runner = new RecallProbeRunner();
    const probe = makeProbe({ runsN: 3, passThresholdK: 2 });
    const verdict = await runner.run(probe, client as unknown as Parameters<typeof runner.run>[1]);

    expect(verdict.pass).toBe(false);
    expect(verdict.totalRuns).toBe(3);
    expect(verdict.rubricCitation).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Errored run test (FR-008)
// ---------------------------------------------------------------------------

describe("RecallProbeRunner — errored run test", () => {
  it("counts errored runs as failed: passCount === 0, totalRuns === runsN", async () => {
    const error = new Error("Network error: connection refused");
    const client = makeMockClient([error, error, error]);

    const runner = new RecallProbeRunner();
    const probe = makeProbe({ runsN: 3, passThresholdK: 2 });
    const verdict = await runner.run(probe, client as unknown as Parameters<typeof runner.run>[1]);

    // FR-008: errored run = failed run
    expect(verdict.pass).toBe(false);
    expect(verdict.passCount).toBe(0);
    // FR-008: totalRuns always equals runsN — errored runs are counted, not silently dropped
    expect(verdict.totalRuns).toBe(3);
    expect(verdict.totalRuns).toBe(probe.runsN);
    expect(verdict.rubricCitation).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Test 4 — Partial failure test (FR-005)
// ---------------------------------------------------------------------------

describe("RecallProbeRunner — partial failure test", () => {
  it("passes when exactly k runs contain the required fact text (2/3 pass)", async () => {
    const factText = "The user prefers TypeScript for all new projects.";
    // 2 out of 3 runs return the fact; third returns empty
    const client = makeMockClient([factText, factText, ""]);

    const runner = new RecallProbeRunner();
    const probe = makeProbe({ runsN: 3, passThresholdK: 2 });
    const verdict = await runner.run(probe, client as unknown as Parameters<typeof runner.run>[1]);

    expect(verdict.pass).toBe(true);
    expect(verdict.passCount).toBe(2);
    expect(verdict.totalRuns).toBe(3);
  });

  it("fails when fewer than k runs contain the required fact text (1/3 with threshold 2)", async () => {
    const factText = "The user prefers TypeScript for all new projects.";
    // Only 1 run returns the fact
    const client = makeMockClient([factText, "", ""]);

    const runner = new RecallProbeRunner();
    const probe = makeProbe({ runsN: 3, passThresholdK: 2 });
    const verdict = await runner.run(probe, client as unknown as Parameters<typeof runner.run>[1]);

    expect(verdict.pass).toBe(false);
    expect(verdict.passCount).toBe(1);
    expect(verdict.totalRuns).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Test 5 — Rigged-impossible discrimination control (FR-009)
// ---------------------------------------------------------------------------

describe("RecallGrader — rigged-impossible discrimination control", () => {
  it("returns pass: false when response obviously does not contain the required fact", () => {
    // FR-009: supply a non-recalled response and assert grader returns pass: false
    const grader = new RecallGrader();

    const obviousNonRecall = "The sky is blue and clouds are white.";
    const requiredFactText = "The user prefers TypeScript for all new projects.";
    const rubricCitation = "muster rubric §recall-probe";

    const result = grader.grade(obviousNonRecall, requiredFactText, rubricCitation);

    // Discrimination control: grader MUST return pass: false for obvious non-recall
    expect(result.pass).toBe(false);
    // Grader is not trivially returning pass: true
    expect(result.rubricCitation).toBe(rubricCitation);
  });

  it("returns pass: true when response contains the required fact", () => {
    const grader = new RecallGrader();

    const factText = "The user prefers TypeScript for all new projects.";
    const response = `Based on your memory, ${factText}`;
    const rubricCitation = "muster rubric §recall-probe";

    const result = grader.grade(response, factText, rubricCitation);

    expect(result.pass).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 6 — USER.md addressing scenario (FR-005, acceptance scenario 6)
// ---------------------------------------------------------------------------

describe("RecallProbeRunner — USER.md addressing scenario", () => {
  it("passes when model recalls the USER.md addressing preference", async () => {
    // Load fixture from addressing-recall.yaml
    const fixtureYaml = readFileSync(
      join(process.cwd(), "tests/fixtures/memory/recall-scenarios/addressing-recall.yaml"),
      "utf8"
    );
    const fixture = parseYaml(fixtureYaml) as {
      requiredFactId: string;
      runsN: number;
      passThresholdK: number;
      rubricCitation: string;
      scenario: ConversationScenario;
    };

    // USER.md addressing fact text: "Address the user as Alex. They prefer informal but professional tone."
    const addressingFactText = "Address the user as Alex. They prefer informal but professional tone.";
    const client = makeMockClient([addressingFactText, addressingFactText, addressingFactText]);

    const runner = new RecallProbeRunner();
    const probe = makeProbe({
      requiredFactId: fixture.requiredFactId,
      runsN: fixture.runsN,
      passThresholdK: fixture.passThresholdK,
      rubricCitation: fixture.rubricCitation,
      scenario: fixture.scenario,
    });

    const verdict = await runner.run(probe, client as unknown as Parameters<typeof runner.run>[1]);

    expect(verdict.pass).toBe(true);
    expect(verdict.passCount).toBeGreaterThanOrEqual(fixture.passThresholdK);
    expect(verdict.totalRuns).toBe(fixture.runsN);
    expect(verdict.rubricCitation).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Test 7 — Fixture fact ID verification
// ---------------------------------------------------------------------------

describe("FactParser — fixture fact ID verification", () => {
  it("produces fact IDs that match the requiredFactId values in recall scenario fixtures", () => {
    const parser = new FactParser();
    const manifest = JSON.parse(
      readFileSync(join(FIXTURES, "consistent/manifest.json"), "utf8")
    ) as FactManifest;

    const memoryFacts = parser.parse(join(FIXTURES, "consistent/MEMORY.md"), manifest);
    const userFacts = parser.parse(join(FIXTURES, "consistent/USER.md"), manifest);
    const allFactIds = [...memoryFacts, ...userFacts].map((f) => f.id);

    // fact-recall.yaml uses memory-project-preferences-0
    expect(allFactIds).toContain("memory-project-preferences-0");

    // addressing-recall.yaml uses user-addressing-0
    expect(allFactIds).toContain("user-addressing-0");

    // Verify fact text for memory-project-preferences-0
    const memoryFact = memoryFacts.find((f) => f.id === "memory-project-preferences-0");
    expect(memoryFact).toBeDefined();
    expect(memoryFact?.text).toContain("TypeScript");

    // Verify fact text for user-addressing-0
    const userFact = userFacts.find((f) => f.id === "user-addressing-0");
    expect(userFact).toBeDefined();
    expect(userFact?.text).toContain("Alex");
  });
});
