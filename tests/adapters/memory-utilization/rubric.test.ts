/**
 * rubric.test.ts — Tests for the memory-utilization adapter's published
 * rubric citation constants and judge arm-order blinding helper (WP04).
 *
 * Covers FR-011 (arm-order blinding), FR-012 (every citation resolves),
 * FR-013 (the rubric doc exists and defines every cited clause).
 */

import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  RUBRIC_CITATIONS,
  RUBRIC_DOC_PATH,
  isKnownRubricCitation,
  blindArmOrder,
  type ArmPayload,
} from "../../../src/adapters/memory-utilization/rubric.js";

// ---------------------------------------------------------------------------
// FR-012/FR-013 — Citation constants resolve to strings, and every cited
// clause id is actually defined as a heading in the published rubric doc.
// ---------------------------------------------------------------------------

describe("RUBRIC_CITATIONS", () => {
  const repoRoot = join(import.meta.dirname, "../../..");
  const rubricDocAbsolutePath = join(repoRoot, RUBRIC_DOC_PATH);

  it("is a non-empty map of non-empty citation strings", () => {
    const entries = Object.entries(RUBRIC_CITATIONS);
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, citation] of entries) {
      expect(typeof citation).toBe("string");
      expect(citation.length).toBeGreaterThan(0);
      expect(citation, `citation for ${key} must name the rubric doc`).toContain(RUBRIC_DOC_PATH);
    }
  });

  it("every citation embeds a §X.Y clause id", () => {
    for (const [key, citation] of Object.entries(RUBRIC_CITATIONS)) {
      expect(citation, `citation for ${key} must contain a clause id`).toMatch(/§\d+\.\d+/);
    }
  });

  it("every cited clause id resolves to a real heading in the published rubric doc", async () => {
    const rubricDocText = await readFile(rubricDocAbsolutePath, "utf-8");
    const headingClauseIds = new Set(
      [...rubricDocText.matchAll(/^#{2,4}\s+§(\d+\.\d+)\b/gm)].map((match) => match[1])
    );
    expect(headingClauseIds.size).toBeGreaterThan(0);

    for (const [key, citation] of Object.entries(RUBRIC_CITATIONS)) {
      const clauseIdMatch = /§(\d+\.\d+)/.exec(citation);
      expect(clauseIdMatch, `citation for ${key} must contain a clause id`).not.toBeNull();
      const clauseId = clauseIdMatch?.[1] ?? "";
      expect(
        headingClauseIds.has(clauseId),
        `clause §${clauseId} (cited by RUBRIC_CITATIONS.${key}) must be a heading in ${RUBRIC_DOC_PATH}`
      ).toBe(true);
    }
  });

  it("the rubric doc front matter declares a normative, versioned status", async () => {
    const rubricDocText = await readFile(rubricDocAbsolutePath, "utf-8");
    expect(rubricDocText).toMatch(/^---\nversion: "[^"]+"\ndate: "[^"]+"\nstatus: "normative"\n---/);
  });
});

describe("isKnownRubricCitation", () => {
  it("returns true for every RUBRIC_CITATIONS value", () => {
    for (const citation of Object.values(RUBRIC_CITATIONS)) {
      expect(isKnownRubricCitation(citation)).toBe(true);
    }
  });

  it("returns false for an unresolvable / fabricated citation", () => {
    expect(isKnownRubricCitation("muster memory-utilization rubric §99.9 (made up)")).toBe(false);
    expect(isKnownRubricCitation("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FR-011 — blindArmOrder: deterministic, a true permutation, and the judge
// cannot see arm identity or the true order.
// ---------------------------------------------------------------------------

interface Probe {
  readonly transcript: string;
}

function makeArms(): ArmPayload<Probe>[] {
  return [
    { armId: "no-memory", content: { transcript: "Response without memory." } },
    { armId: "with-memory", content: { transcript: "Response with memory." } },
    { armId: "scrambled-memory", content: { transcript: "Response with scrambled memory." } },
  ];
}

describe("blindArmOrder", () => {
  it("throws on an empty arms array", () => {
    expect(() => blindArmOrder([], "probe-1")).toThrow(/non-empty/);
  });

  it("is deterministic: the same (arms, seed) always yields the same result", () => {
    const arms = makeArms();
    const first = blindArmOrder(arms, "probe-42:run-0");
    const second = blindArmOrder(arms, "probe-42:run-0");
    expect(second).toEqual(first);

    // Repeat several times to rule out incidental PRNG-state reuse across calls.
    for (let i = 0; i < 5; i++) {
      expect(blindArmOrder(arms, "probe-42:run-0")).toEqual(first);
    }
  });

  it("order is a permutation of [0, arms.length)", () => {
    const arms = makeArms();
    const { order } = blindArmOrder(arms, "probe-7");
    expect(order.length).toBe(arms.length);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it("presentation content matches arms[order[i]].content, in presentation order", () => {
    const arms = makeArms();
    const { order, presentation } = blindArmOrder(arms, "probe-7");
    for (let position = 0; position < presentation.length; position++) {
      const originalIndex = order[position] as number;
      expect(presentation[position]?.content).toEqual(arms[originalIndex]?.content);
    }
  });

  it("assigns positional blind labels 'Answer A', 'Answer B', 'Answer C', ...", () => {
    const arms = makeArms();
    const { presentation } = blindArmOrder(arms, "probe-7");
    expect(presentation.map((entry) => entry.blindLabel)).toEqual(["Answer A", "Answer B", "Answer C"]);
  });

  it("the judge cannot see arm identity: presentation entries never carry armId", () => {
    const arms = makeArms();
    const { presentation } = blindArmOrder(arms, "probe-99");

    for (const entry of presentation) {
      expect(Object.keys(entry).sort()).toEqual(["blindLabel", "content"]);
      expect(entry).not.toHaveProperty("armId");
    }

    // Even serialized (the shape a judge prompt is built from), the real arm
    // identifiers must not appear anywhere in the presentation payload.
    const serialized = JSON.stringify(presentation);
    for (const arm of arms) {
      expect(serialized).not.toContain(arm.armId);
    }
  });

  it("the judge cannot see arm order: identical content is unlabelled with its source index", () => {
    const arms = makeArms();
    const { presentation } = blindArmOrder(arms, "probe-1");
    // The only "position" information exposed is the blind label itself —
    // there is no field carrying the originating index or arm id.
    for (const entry of presentation) {
      expect(Object.prototype.hasOwnProperty.call(entry, "order")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(entry, "index")).toBe(false);
    }
  });

  it("varies presentation order across distinct seeds (spreads position bias across probes)", () => {
    const arms = makeArms();
    const seeds = Array.from({ length: 20 }, (_unused, i) => `probe-${i}:run-0`);
    const distinctOrders = new Set(seeds.map((seed) => blindArmOrder(arms, seed).order.join(",")));
    expect(distinctOrders.size).toBeGreaterThan(1);
  });

  it("supports the minimal 2-arm case (e.g. no-memory vs with-memory only)", () => {
    const arms = makeArms().slice(0, 2);
    const { order, presentation } = blindArmOrder(arms, "probe-2arm");
    expect(order.length).toBe(2);
    expect(presentation.length).toBe(2);
    expect(presentation.map((entry) => entry.blindLabel)).toEqual(["Answer A", "Answer B"]);
  });

  it("is a pure function: it does not mutate the input arms array", () => {
    const arms = makeArms();
    const before = JSON.stringify(arms);
    blindArmOrder(arms, "probe-purity");
    expect(JSON.stringify(arms)).toEqual(before);
  });

  it("falls back to a numeric blind label past the 26-letter alphabet", () => {
    const manyArms: ArmPayload<{ n: number }>[] = Array.from({ length: 28 }, (_unused, i) => ({
      armId: `arm-${i}`,
      content: { n: i },
    }));
    const { presentation } = blindArmOrder(manyArms, "probe-many-arms");
    expect(presentation.length).toBe(28);
    expect(presentation[0]?.blindLabel).toBe("Answer A");
    expect(presentation[25]?.blindLabel).toBe("Answer Z");
    expect(presentation[26]?.blindLabel).toBe("Answer 27");
    expect(presentation[27]?.blindLabel).toBe("Answer 28");
  });
});
