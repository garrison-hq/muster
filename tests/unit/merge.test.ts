import { describe, expect, it } from "vitest";
import type { MergeStrategy } from "../../src/core/adapter.js";
import { merge } from "../../src/core/merge.js";

/** Standard Merge (§8.1) as data — what the RFC-1 adapter will supply (WP05). */
const standardMerge: MergeStrategy = {
  scalars: "replace",
  maps: "deep",
  lists: "replace",
  typeMismatch: "replace",
  nullIsValue: true,
};

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

describe("merge — RFC-1 §8 Standard Merge", () => {
  it("§8.1 scalars replace", () => {
    expect(merge("base", "overlay", standardMerge)).toBe("overlay");
    expect(merge(50, 80, standardMerge)).toBe(80);
    expect(merge(true, false, standardMerge)).toBe(false);
    expect(merge({ a: 1, b: "x" }, { b: "y" }, standardMerge)).toEqual({ a: 1, b: "y" });
  });

  it("§8.1 maps deep-merge", () => {
    const base = { voice: { formality: 50, warmth: 60 }, id: "soul-1" };
    const overlay = { voice: { formality: 80 } };
    expect(merge(base, overlay, standardMerge)).toEqual({
      voice: { formality: 80, warmth: 60 },
      id: "soul-1",
    });
  });

  it("§8.1 lists replace not append", () => {
    const base = { priorities: ["honesty", "warmth"] };
    const overlay = { priorities: ["brevity"] };
    expect(merge(base, overlay, standardMerge)).toEqual({ priorities: ["brevity"] });
  });

  it("§8.2 lists replace entirely even when overlay list is empty (no union)", () => {
    expect(merge({ tags: ["a", "b"] }, { tags: [] }, standardMerge)).toEqual({ tags: [] });
  });

  it("§8.1 type mismatch: overlay replaces (voice: map → null)", () => {
    // Reproduces the spec's exact example from §8.1.
    const base = { voice: { formality: 50, warmth: 60 } };
    const overlay = { voice: null };
    expect(merge(base, overlay, standardMerge)).toEqual({ voice: null });
  });

  it("§8.1 type mismatch: overlay replaces, no recursion (list → map, scalar → map)", () => {
    expect(merge({ a: [1, 2] }, { a: { x: 1 } }, standardMerge)).toEqual({ a: { x: 1 } });
    expect(merge({ a: 5 }, { a: { x: 1 } }, standardMerge)).toEqual({ a: { x: 1 } });
    expect(merge({ a: { x: 1, y: 2 } }, { a: [3] }, standardMerge)).toEqual({ a: [3] });
  });

  it("§8.3 null is a value: key present with null after merge", () => {
    const result = merge({ voice: { formality: 50 } }, { voice: null }, standardMerge) as Record<
      string,
      unknown
    >;
    expect("voice" in result).toBe(true);
    expect(result["voice"]).toBeNull();
  });

  it("§8.1 pure function: never mutates inputs (NFR-001 determinism support)", () => {
    const base = deepFreeze({ voice: { formality: 50, warmth: 60 }, tags: ["a"] });
    const overlay = deepFreeze({ voice: { formality: 80 }, tags: ["b"] });
    // Frozen inputs: any mutation would throw under strict mode.
    const result = merge(base, overlay, standardMerge) as Record<string, unknown>;
    expect(result).toEqual({ voice: { formality: 80, warmth: 60 }, tags: ["b"] });
    // Result must be fresh structures, not aliases of the inputs.
    expect(result["voice"]).not.toBe(overlay.voice);
    expect(result["tags"]).not.toBe(overlay.tags);
    expect(base).toEqual({ voice: { formality: 50, warmth: 60 }, tags: ["a"] });
    expect(overlay).toEqual({ voice: { formality: 80 }, tags: ["b"] });
  });
});
