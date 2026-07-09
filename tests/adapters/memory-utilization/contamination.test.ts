/**
 * Unit tests for src/adapters/memory-utilization/contamination.ts (FR-006).
 */

import { describe, expect, it } from "vitest";
import {
  anyContaminated,
  contaminatedProbeIds,
  evaluateContamination,
} from "../../../src/adapters/memory-utilization/contamination.js";
import type { LearningLiftProbe } from "../../../src/adapters/memory-utilization/manifest.js";

function liftProbe(overrides: Partial<LearningLiftProbe> = {}): LearningLiftProbe {
  return {
    id: "p1",
    turns: [{ role: "user", content: "q" }],
    expected: { kind: "fact-substring", requiredFactId: "memory-facts-0" },
    requiresMemory: true,
    kind: "lift",
    ...overrides,
  };
}

describe("evaluateContamination", () => {
  it("flags a requiresMemory lift probe whose no-memory pass-rate meets the threshold", () => {
    const result = evaluateContamination(liftProbe(), 0.75, 0.5);
    expect(result.contaminated).toBe(true);
    expect(result.probeId).toBe("p1");
  });

  it("does not flag a requiresMemory lift probe below the threshold", () => {
    const result = evaluateContamination(liftProbe(), 0.2, 0.5);
    expect(result.contaminated).toBe(false);
  });

  it("never flags a probe that does not declare requiresMemory", () => {
    const result = evaluateContamination(liftProbe({ requiresMemory: false }), 1.0, 0.5);
    expect(result.contaminated).toBe(false);
  });

  it("never flags an abstention probe, even at a 100% no-memory pass-rate", () => {
    const probe = liftProbe({
      kind: "abstention",
      expected: { kind: "abstain" },
      requiresMemory: false,
    });
    const result = evaluateContamination(probe, 1.0, 0.5);
    expect(result.contaminated).toBe(false);
  });

  it("treats the threshold as inclusive (>=)", () => {
    const result = evaluateContamination(liftProbe(), 0.5, 0.5);
    expect(result.contaminated).toBe(true);
  });
});

describe("anyContaminated / contaminatedProbeIds", () => {
  it("aggregates across results in input order", () => {
    const results = [
      evaluateContamination(liftProbe({ id: "p1" }), 0.1, 0.5),
      evaluateContamination(liftProbe({ id: "p2" }), 0.9, 0.5),
      evaluateContamination(liftProbe({ id: "p3" }), 0.6, 0.5),
    ];
    expect(anyContaminated(results)).toBe(true);
    expect(contaminatedProbeIds(results)).toEqual(["p2", "p3"]);
  });

  it("reports false / empty when nothing is contaminated", () => {
    const results = [evaluateContamination(liftProbe({ id: "p1" }), 0.1, 0.5)];
    expect(anyContaminated(results)).toBe(false);
    expect(contaminatedProbeIds(results)).toEqual([]);
  });
});
