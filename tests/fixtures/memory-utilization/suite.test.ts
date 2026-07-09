/**
 * Fixture-driven conformance test for WP05's memory-utilization / learning-
 * lift fixture set (`tests/fixtures/memory-utilization/project/`) and the
 * runnable example (`examples/memory-utilization/`).
 *
 * Fully offline and deterministic (NFR-001): every test injects a scripted
 * mock `ChatClient` — no network, no fetch mocking. This mirrors the WP03
 * adapter's own test-injection pattern
 * (`tests/adapters/memory-utilization/index.test.ts`), but the fixtures
 * exercised here are WP05's owned, durable fixture assets — not inline
 * test-only probes — and the probe question text is realistic natural
 * language (no `[[marker]]` test scaffolding embedded in the fixture data
 * itself, since this corpus is meant to run against a real endpoint via the
 * future `memory-utilization run` CLI, WP06).
 *
 * Proves (WP05 T017/T019 "Verification"):
 *   1. the fixtures load (fact ids/text parse as declared);
 *   2. the probe set is contamination-clean — every "lift" probe fails
 *      closed-book under a scripted, non-fabricating model (FR-006/FR-014);
 *   3. the contamination gate's own configured threshold would in fact catch
 *      a genuinely leaked probe (not merely default to "clean");
 *   4. the example manifest is schema-valid and runnable end-to-end.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MemoryUtilizationAdapter,
  evaluateContamination,
  loadRealFacts,
  validateCase,
  type LearningLiftCase,
  type LearningLiftManifest,
  type MemoryFixtureRef,
} from "../../../src/adapters/memory-utilization/index.js";
import type { ChatClient, ChatMessage } from "../../../src/core/behavioral/types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(HERE, "project");
const EXAMPLE_DIR = join(HERE, "..", "..", "..", "examples", "memory-utilization");

const IDLE_RESPONSE = "I don't know.";
const REFUSAL_RESPONSE = "DECISION: REFUSE\nI'm sorry, but I can't help with that.";

// ---------------------------------------------------------------------------
// Shared helpers.
// ---------------------------------------------------------------------------

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function lastUserContent(messages: readonly ChatMessage[]): string {
  return [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
}

function systemPromptOf(messages: readonly ChatMessage[]): string {
  return messages.find((m) => m.role === "system")?.content ?? "";
}

function abstentionQuestions(kase: LearningLiftCase): ReadonlySet<string> {
  const questions = kase.probes
    .filter((p) => p.kind === "abstention")
    .map((p) => p.turns[0]?.content ?? "");
  return new Set(questions);
}

/**
 * A scripted "faithful, non-fabricating" mock model (NFR-001: deterministic,
 * no network). It:
 *   - refuses declared-unanswerable (abstention) questions, never fabricates;
 *   - otherwise repeats back exactly the `[MEMORY]` block it was given (the
 *     real facts under `with-memory`, the scrambled substitutes under
 *     `scrambled-memory`) and nothing else;
 *   - and says "I don't know" when no `[MEMORY]` block is present
 *     (`no-memory` — the closed-book arm).
 *
 * This models a model with zero parametric knowledge of the fixture's
 * invented facts: it can only ever recite what its context actually
 * contains. Any probe this client fails to pass under `no-memory` is, by
 * construction, unanswerable without the declared memory (FR-006).
 */
function makeFaithfulClient(abstain: ReadonlySet<string>): ChatClient {
  return {
    async chat(messages) {
      const question = lastUserContent(messages);
      if (abstain.has(question)) return REFUSAL_RESPONSE;
      const systemPrompt = systemPromptOf(messages);
      const memoryIndex = systemPrompt.indexOf("[MEMORY]");
      return memoryIndex === -1 ? IDLE_RESPONSE : systemPrompt.slice(memoryIndex);
    },
  };
}

function resolveFixtureRef(ref: MemoryFixtureRef, baseDir: string): MemoryFixtureRef {
  return {
    memoryPath: join(baseDir, ref.memoryPath),
    userPath: join(baseDir, ref.userPath),
    manifestPath: join(baseDir, ref.manifestPath),
  };
}

/** Resolve every case's fixture paths against `baseDir` (mirrors the future CLI's manifestDir join, WP06). */
function resolveManifest(manifest: LearningLiftManifest, baseDir: string): LearningLiftManifest {
  return {
    cases: manifest.cases.map((kase) => ({ ...kase, fixture: resolveFixtureRef(kase.fixture, baseDir) })),
  };
}

// ---------------------------------------------------------------------------
// 1. The project/ fixture loads (fact ids/text parse as declared).
// ---------------------------------------------------------------------------

describe("project/ fixture — loads", () => {
  const REF: MemoryFixtureRef = {
    memoryPath: join(PROJECT_DIR, "MEMORY.md"),
    userPath: join(PROJECT_DIR, "USER.md"),
    manifestPath: join(PROJECT_DIR, "manifest.json"),
  };

  it("parses MEMORY.md + USER.md into the ids referenced by case.json's probes", () => {
    const facts = loadRealFacts(REF);
    const byId = new Map(facts.map((f) => [f.id, f.text]));

    expect(byId.get("memory-project-facts-0")).toBe('The project\'s internal codename is "Kestrel-9".');
    expect(byId.get("memory-project-facts-6")).toBe(
      'The on-call escalation pager rotation is coordinated through the channel "#kestrel-oncall".'
    );
    expect(byId.get("user-identity-0")).toBe("Name: Priya Shah, the on-call engineer for Project Kestrel-9.");
    // 7 MEMORY.md facts + 1 USER.md fact.
    expect(facts).toHaveLength(8);
  });

  it("case.json is schema-valid (validateCase does not throw) and references only real fact ids", () => {
    const manifest = readJson<LearningLiftManifest>(join(PROJECT_DIR, "case.json"));
    expect(manifest.cases).toHaveLength(1);

    const kase = manifest.cases[0]!;
    expect(() => validateCase(kase)).not.toThrow();

    const facts = loadRealFacts(REF);
    const factIds = new Set(facts.map((f) => f.id));
    for (const probe of kase.probes) {
      if (probe.expected.kind === "fact-substring") {
        expect(factIds.has(probe.expected.requiredFactId)).toBe(true);
      }
    }
  });

  it("declares 8 lift probes (all requiresMemory: true) and 2 abstention probes", () => {
    const manifest = readJson<LearningLiftManifest>(join(PROJECT_DIR, "case.json"));
    const kase = manifest.cases[0]!;
    const lift = kase.probes.filter((p) => p.kind === "lift");
    const abstention = kase.probes.filter((p) => p.kind === "abstention");

    expect(lift).toHaveLength(8);
    expect(lift.every((p) => p.requiresMemory)).toBe(true);
    expect(abstention).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 2. The probe set is contamination-clean — every lift probe fails
//    closed-book (FR-006/FR-014).
// ---------------------------------------------------------------------------

describe("project/case.json — contamination-clean (FR-006, FR-014)", () => {
  it("every lift probe scores zero on the no-memory (closed-book) arm under a non-fabricating model", async () => {
    const manifest = readJson<LearningLiftManifest>(join(PROJECT_DIR, "case.json"));
    // case.json's fixture paths are already repo-root-relative (mirroring
    // tests/fixtures/memory-utilization/basic/'s convention) -- vitest runs
    // with cwd = repo root, so they resolve as-is, no join needed.
    const kase = manifest.cases[0]!;
    const client = makeFaithfulClient(abstentionQuestions(kase));

    const adapter = new MemoryUtilizationAdapter();
    const result = await adapter.run({ cases: [kase] }, { client });
    const caseResult = result.cases[0]!;

    // Fails closed-book, exactly as FR-014/T017 requires: no lift probe is
    // answerable without the declared memory.
    for (const outcome of caseResult.pairedOutcomes) {
      expect(outcome.perArmScore["no-memory"]).toBe(0);
    }
    expect(caseResult.measurement.passRateNoMemory).toBe(0);

    // Never flagged contaminated (the gate agrees: nothing leaks parametrically).
    expect(caseResult.measurement.contaminated).toBe(false);
    expect(caseResult.measurement.contaminatedProbeIds).toEqual([]);
    expect(caseResult.contamination.every((c) => !c.contaminated)).toBe(true);

    // The declared memory genuinely helps (with-memory recites every fact).
    expect(caseResult.measurement.passRateWithMemory).toBe(1);
    // The scrambled-memory negative control shows no lift (context-stuffing
    // alone — irrelevant facts — does not help): FR-005.
    expect(caseResult.measurement.passRateScrambledMemory).toBe(0);
    expect(caseResult.scrambledControl.passed).toBe(true);

    // Abstention probes correctly refuse rather than fabricate (FR-007).
    expect(caseResult.abstention.passed).toBe(true);

    // NB: with this fully deterministic, noise-free scripted model the
    // no-memory arm floors to *exactly* zero, which trips the adapter's
    // two-sided baseline-validity guard (verdict.ts `isBaselineValid`) --
    // `baseline-invalid`, not `lift-confirmed`. That is expected and correct
    // here: this simulation exists to prove contamination-cleanliness, not
    // to produce a lift verdict. A real endpoint's grading noise across
    // `runsN` samples (NFR-002: "decisions rest on N-sampled pass-rates ...
    // not single draws") is what keeps a real baseline inside the valid
    // window; spec.md names the all-zero floor explicitly as the
    // "baseline already saturated/floored" edge case.
    expect(caseResult.measurement.baselineValid).toBe(false);
    expect(caseResult.measurement.verdict).toBe("baseline-invalid");
  });

  it("the case's configured contamination threshold (0.5) would flag a genuinely leaked probe", () => {
    const manifest = readJson<LearningLiftManifest>(join(PROJECT_DIR, "case.json"));
    const kase = manifest.cases[0]!;
    const leakedProbe = kase.probes.find((p) => p.id === "codename")!;

    // Simulate a hypothetical leaked probe: answerable 60% of the time on
    // the no-memory arm -- above the 0.5 threshold -- must be flagged.
    const leaked = evaluateContamination(leakedProbe, 0.6, kase.thresholds.contaminationThreshold);
    expect(leaked.contaminated).toBe(true);

    // And a genuinely clean probe (0% no-memory) must not be flagged.
    const clean = evaluateContamination(leakedProbe, 0, kase.thresholds.contaminationThreshold);
    expect(clean.contaminated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. The example manifest (`examples/memory-utilization/`) is valid.
// ---------------------------------------------------------------------------

describe("examples/memory-utilization/manifest.json — valid and runnable", () => {
  it("is schema-valid independent of path resolution (validateCase does not throw)", () => {
    const manifest = readJson<LearningLiftManifest>(join(EXAMPLE_DIR, "manifest.json"));
    expect(manifest.cases).toHaveLength(1);
    for (const kase of manifest.cases) {
      expect(() => validateCase(kase)).not.toThrow();
    }
  });

  it("its fixture (MEMORY.md/USER.md/labels.json) loads and matches every probe's declared fact id", () => {
    const manifest = readJson<LearningLiftManifest>(join(EXAMPLE_DIR, "manifest.json"));
    const kase = manifest.cases[0]!;
    const ref = resolveFixtureRef(kase.fixture, EXAMPLE_DIR);
    const facts = loadRealFacts(ref);
    const factIds = new Set(facts.map((f) => f.id));

    expect(facts.length).toBeGreaterThan(0);
    for (const probe of kase.probes) {
      if (probe.expected.kind === "fact-substring") {
        expect(factIds.has(probe.expected.requiredFactId)).toBe(true);
      }
    }
  });

  it("runs end-to-end via the adapter and is contamination-clean, mirroring project/case.json", async () => {
    const manifest = readJson<LearningLiftManifest>(join(EXAMPLE_DIR, "manifest.json"));
    const resolved = resolveManifest(manifest, EXAMPLE_DIR);
    const kase = resolved.cases[0]!;
    const client = makeFaithfulClient(abstentionQuestions(kase));

    const adapter = new MemoryUtilizationAdapter();
    const result = await adapter.run(resolved, { client });
    const caseResult = result.cases[0]!;

    expect(caseResult.measurement.passRateNoMemory).toBe(0);
    expect(caseResult.measurement.contaminated).toBe(false);
    expect(caseResult.measurement.passRateWithMemory).toBe(1);
    expect(caseResult.measurement.passRateScrambledMemory).toBe(0);
    expect(caseResult.abstention.passed).toBe(true);
  });
});
