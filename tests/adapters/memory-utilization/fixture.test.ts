/**
 * Unit tests for src/adapters/memory-utilization/fixture.ts.
 *
 * Covers: real/none/scrambled staging (FR-002), the deterministic scrambler
 * (NFR-001 — no Math.random/Date.now; same fact id -> same substitute every
 * time), and system-prompt assembly.
 */

import { describe, expect, it } from "vitest";
import {
  buildArmSystemPrompt,
  loadRealFacts,
  scrambleFactText,
  stageAllArms,
  stageFixture,
} from "../../../src/adapters/memory-utilization/fixture.js";
import type { MemoryFixtureRef } from "../../../src/adapters/memory-utilization/manifest.js";
import type { MemoryFact } from "../../../src/adapters/memory/lint.js";

const FIXTURE_REF: MemoryFixtureRef = {
  memoryPath: "tests/fixtures/memory-utilization/basic/MEMORY.md",
  userPath: "tests/fixtures/memory-utilization/basic/USER.md",
  manifestPath: "tests/fixtures/memory-utilization/basic/manifest.json",
};

describe("loadRealFacts", () => {
  it("parses MEMORY.md + USER.md into the expected fact ids/texts", () => {
    const facts = loadRealFacts(FIXTURE_REF);
    const ids = facts.map((f) => f.id);
    expect(ids).toContain("memory-facts-0");
    expect(ids).toContain("user-identity-0");
    const languageFact = facts.find((f) => f.id === "memory-facts-0");
    expect(languageFact?.text).toBe("The user's favorite programming language is Rust.");
  });
});

describe("stageFixture", () => {
  it("'none' variant has no facts and an empty context block", () => {
    const staged = stageFixture(FIXTURE_REF, "none");
    expect(staged.facts).toHaveLength(0);
    expect(staged.contextBlock).toBe("");
  });

  it("'real' variant retains the declared fact text verbatim", () => {
    const staged = stageFixture(FIXTURE_REF, "real");
    expect(staged.facts.length).toBeGreaterThan(0);
    expect(staged.contextBlock).toContain("The user's favorite programming language is Rust.");
    expect(staged.contextBlock.startsWith("[MEMORY]")).toBe(true);
  });

  it("'scrambled' variant preserves fact ids and count but replaces every fact's text", () => {
    const real = stageFixture(FIXTURE_REF, "real");
    const scrambled = stageFixture(FIXTURE_REF, "scrambled");

    expect(scrambled.facts).toHaveLength(real.facts.length);
    expect(scrambled.facts.map((f) => f.id)).toEqual(real.facts.map((f) => f.id));

    for (let i = 0; i < real.facts.length; i++) {
      expect(scrambled.facts[i]!.text).not.toBe(real.facts[i]!.text);
    }
    // None of the real fact texts leak verbatim into the scrambled context block.
    for (const fact of real.facts) {
      expect(scrambled.contextBlock).not.toContain(fact.text);
    }
  });
});

describe("scrambleFactText — determinism (NFR-001)", () => {
  it("is a pure function of the fact id: repeated calls yield the same output", () => {
    const fact: MemoryFact = {
      id: "memory-facts-2",
      source: "MEMORY.md",
      text: "The user's preferred IDE is Neovim.",
      private: false,
      timeSensitive: false,
      timestamp: undefined,
    };
    const first = scrambleFactText(fact);
    const second = scrambleFactText(fact);
    const third = scrambleFactText({ ...fact, text: "a completely different original text" });
    expect(first).toBe(second);
    // Same id, different original text -> the substitute depends only on id.
    expect(first).toBe(third);
  });

  it("never reproduces the fact's own real text", () => {
    const facts = loadRealFacts(FIXTURE_REF);
    for (const fact of facts) {
      expect(scrambleFactText(fact)).not.toBe(fact.text);
    }
  });
});

describe("stageAllArms", () => {
  it("stages exactly the three condition arms with the expected variants", () => {
    const staged = stageAllArms(FIXTURE_REF);
    expect(staged["no-memory"].variant).toBe("none");
    expect(staged["with-memory"].variant).toBe("real");
    expect(staged["scrambled-memory"].variant).toBe("scrambled");
  });
});

describe("buildArmSystemPrompt", () => {
  it("returns the neutral prompt alone when there is no context block", () => {
    const staged = stageFixture(FIXTURE_REF, "none");
    const prompt = buildArmSystemPrompt(staged);
    expect(prompt).not.toContain("[MEMORY]");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("appends the context block after the neutral prompt when present", () => {
    const staged = stageFixture(FIXTURE_REF, "real");
    const prompt = buildArmSystemPrompt(staged);
    expect(prompt).toContain("[MEMORY]");
    expect(prompt).toContain("The user's favorite programming language is Rust.");
  });
});
