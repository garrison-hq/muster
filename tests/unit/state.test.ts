import { describe, expect, it } from "vitest";
import type { EffectiveConfig } from "../../src/core/adapter.js";
import type { Violation } from "../../src/core/report.js";
import {
  applyStateOverlay,
  compareUtf8Bytes,
  evaluateTriggers,
  lexicographicallySmallestKey,
  selectState,
  validateStateBlock,
} from "../../src/adapters/rfc1/state.js";

function withState(state: Record<string, unknown>): EffectiveConfig {
  return { id: "org.example.test", state };
}

function expectViolations(result: unknown): Violation[] {
  expect(Array.isArray(result)).toBe(true);
  return result as Violation[];
}

describe("§4.4 UTF-8 byte comparator", () => {
  it("§4.4 compares raw UTF-8 bytes, not UTF-16 code units or locale order", () => {
    // "é" encodes as 0xC3 0xA9; "z" as 0x7A → "z" sorts first by bytes,
    // while localeCompare would put "é" before "z".
    expect(compareUtf8Bytes("z", "é")).toBeLessThan(0);
    expect("é".localeCompare("z")).toBeLessThan(0); // the bug this guards against
  });

  it("§4.4 no Unicode normalization: NFC and NFD spellings are distinct keys", () => {
    const nfc = "é"; // é precomposed
    const nfd = "é"; // e + combining acute
    expect(compareUtf8Bytes(nfc, nfd)).not.toBe(0);
  });

  it("§4.4 lexicographicallySmallestKey of an empty set is null", () => {
    expect(lexicographicallySmallestKey([])).toBeNull();
  });
});

describe("§20.1 selectState", () => {
  it("§20.1 no `state` block → null (state ignored entirely)", () => {
    expect(selectState({ id: "x" }, null, "strict")).toBeNull();
  });

  it("§20.1 empty or missing state.states → null (state ignored entirely)", () => {
    expect(selectState(withState({ states: {} }), null, "strict")).toBeNull();
    expect(selectState(withState({ base: "warm" }), null, "strict")).toBeNull();
  });

  it("§25.2(8) §20.1 base omitted, states {warm, cold} → cold (§4.4 lexicographic fallback)", () => {
    expect(selectState(withState({ states: { warm: {}, cold: {} } }), null, "strict")).toBe(
      "cold"
    );
  });

  it('§4.4 UTF-8 byte ordering: keys {"é", "z"} → "z" (0x7A < 0xC3) — catches localeCompare bugs', () => {
    expect(selectState(withState({ states: { "é": {}, z: {} } }), null, "strict")).toBe("z");
  });

  it("§20.1 state.base is used when it references an existing state", () => {
    expect(
      selectState(withState({ base: "warm", states: { warm: {}, cold: {} } }), null, "strict")
    ).toBe("warm");
  });

  it("§20.1 dangling state.base → strict error at state.base", () => {
    const result = selectState(
      withState({ base: "ghost", states: { warm: {} } }),
      null,
      "strict"
    );
    const violations = expectViolations(result);
    expect(violations[0]?.path).toBe("state.base");
    expect(violations[0]?.severity).toBe("error");
    expect(violations[0]?.section).toBe("§20.1");
  });

  it("§20.1 dangling state.base in permissive mode → §4.4 fallback + warning in sink", () => {
    const sink: Violation[] = [];
    const result = selectState(
      withState({ base: "ghost", states: { warm: {}, cold: {} } }),
      null,
      "permissive",
      sink
    );
    expect(result).toBe("cold");
    expect(sink.some((v) => v.path === "state.base" && v.severity === "warning")).toBe(true);
  });

  it("§20.1 requested state exists → used (over base)", () => {
    expect(
      selectState(withState({ base: "warm", states: { warm: {}, cold: {} } }), "cold", "strict")
    ).toBe("cold");
  });

  it("§20.1 requested state missing → strict MUST fail loading", () => {
    const violations = expectViolations(
      selectState(withState({ states: { warm: {} } }), "ghost", "strict")
    );
    expect(violations[0]?.severity).toBe("error");
    expect(violations[0]?.section).toBe("§20.1");
    expect(violations[0]?.message).toContain('"ghost"');
  });

  it("§20.1 requested state missing in permissive mode → warning + fall back to base", () => {
    const sink: Violation[] = [];
    const result = selectState(
      withState({ base: "warm", states: { warm: {}, cold: {} } }),
      "ghost",
      "permissive",
      sink
    );
    expect(result).toBe("warm");
    expect(sink.some((v) => v.severity === "warning" && v.section === "§20.1")).toBe(true);
  });
});

describe("§20.3.7 / §20.1.1 validateStateBlock", () => {
  it("§25.2(8) §20.3.7 trigger shift_to: ghost → strict error at state.triggers[0].shift_to", () => {
    const violations = validateStateBlock(
      withState({
        states: { warm: {} },
        triggers: [{ if: "user.rude", shift_to: "ghost", duration: "session" }],
      }),
      "strict"
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.path).toBe("state.triggers[0].shift_to");
    expect(violations[0]?.severity).toBe("error");
    expect(violations[0]?.section).toBe("§20.3.7");
  });

  it("§20.3.7 trigger shift_to: ghost in permissive mode → warning (trigger ignored)", () => {
    const violations = validateStateBlock(
      withState({
        states: { warm: {} },
        triggers: [{ if: "user.rude", shift_to: "ghost" }],
      }),
      "permissive"
    );
    expect(violations[0]?.severity).toBe("warning");
    expect(violations[0]?.message).toContain("trigger ignored");
  });

  it("§20.3.7 duration: timed without ttl_seconds → strict error / permissive warning", () => {
    const config = withState({
      states: { warm: {} },
      triggers: [{ if: "user.rude", shift_to: "warm", duration: "timed" }],
    });
    const strict = validateStateBlock(config, "strict");
    expect(strict[0]?.path).toBe("state.triggers[0].ttl_seconds");
    expect(strict[0]?.severity).toBe("error");
    const permissive = validateStateBlock(config, "permissive");
    expect(permissive[0]?.severity).toBe("warning");
    expect(permissive[0]?.message).toContain("session");
  });

  it("§20.3.7 timed WITH ttl_seconds is valid", () => {
    expect(
      validateStateBlock(
        withState({
          states: { warm: {} },
          triggers: [{ if: "user.rude", shift_to: "warm", duration: "timed", ttl_seconds: 60 }],
        }),
        "strict"
      )
    ).toEqual([]);
  });

  it('§20.1.1 state overlay containing a "state" key → strict error / permissive warning', () => {
    const config = withState({
      states: { angry: { voice: { warmth: 0 }, state: { base: "angry" } } },
    });
    const strict = validateStateBlock(config, "strict");
    expect(strict[0]?.path).toBe("state.states.angry.state");
    expect(strict[0]?.severity).toBe("error");
    expect(strict[0]?.section).toBe("§20.1.1");
    const permissive = validateStateBlock(config, "permissive");
    expect(permissive[0]?.severity).toBe("warning");
  });

  it("§20 a well-formed state block produces no violations", () => {
    expect(
      validateStateBlock(
        withState({
          base: "warm",
          states: { warm: { voice: { warmth: 90 } }, cold: { voice: { warmth: 5 } } },
          triggers: [{ if: "user.rude", shift_to: "cold", duration: "session" }],
        }),
        "strict"
      )
    ).toEqual([]);
  });
});

describe("§7.5 step 5 / Appendix G.7 applyStateOverlay", () => {
  it("§8.1 overlay deep-merges onto the effective config (Standard Merge)", () => {
    const effective: EffectiveConfig = {
      voice: { warmth: 50, formality: 60 },
      state: { states: { cold: { voice: { warmth: 0 } } } },
    };
    const result = applyStateOverlay(effective, "cold");
    expect(result["voice"]).toEqual({ warmth: 0, formality: 60 });
    // pure: input untouched
    expect(effective["voice"]).toEqual({ warmth: 50, formality: 60 });
  });

  it('§20.1.1 a "state" key inside the overlay is excluded from the merge', () => {
    const effective: EffectiveConfig = {
      voice: { warmth: 50 },
      state: { base: "calm", states: { calm: { state: { base: "loop" }, voice: { warmth: 1 } } } },
    };
    const result = applyStateOverlay(effective, "calm");
    expect((result["state"] as Record<string, unknown>)["base"]).toBe("calm");
    expect((result["voice"] as Record<string, unknown>)["warmth"]).toBe(1);
  });

  it("§20 unknown state name leaves the config unchanged", () => {
    const effective: EffectiveConfig = { voice: { warmth: 50 }, state: { states: { a: {} } } };
    expect(applyStateOverlay(effective, "ghost")).toBe(effective);
  });
});

describe("§20.2 / §20.3 evaluateTriggers (documented RPP-1 subset)", () => {
  const states = { cold: {}, warm: {}, neutral: {} };

  it('§20.2 "user.rude && !user.apologized" with {user.rude: true} → matches', () => {
    const result = evaluateTriggers(
      withState({
        states,
        triggers: [{ if: "user.rude && !user.apologized", shift_to: "cold" }],
      }),
      { "user.rude": true },
      "strict"
    );
    expect(result).toBe("cold");
  });

  it("§20.2 same predicate with both facts true → no match; next trigger considered", () => {
    const result = evaluateTriggers(
      withState({
        states,
        triggers: [
          { if: "user.rude && !user.apologized", shift_to: "cold" },
          { if: "user.apologized", shift_to: "warm" },
        ],
      }),
      { "user.rude": true, "user.apologized": true },
      "strict"
    );
    expect(result).toBe("warm");
  });

  it("§20.3.3 two matching triggers → first one's shift_to returned (first-match-wins)", () => {
    const result = evaluateTriggers(
      withState({
        states,
        triggers: [
          { if: "user.rude", shift_to: "cold" },
          { if: "user.rude", shift_to: "warm" },
        ],
      }),
      { "user.rude": true },
      "strict"
    );
    expect(result).toBe("cold");
  });

  it("§20.3 no matching trigger → null", () => {
    const result = evaluateTriggers(
      withState({ states, triggers: [{ if: "user.rude", shift_to: "cold" }] }),
      { "user.rude": false },
      "strict"
    );
    expect(result).toBeNull();
  });

  it("§20.3 string facts are NOT truthy: only boolean true matches (documented)", () => {
    const result = evaluateTriggers(
      withState({ states, triggers: [{ if: "user.rude", shift_to: "cold" }] }),
      { "user.rude": "yes" },
      "strict"
    );
    expect(result).toBeNull();
  });

  it('§20.2 unsupported predicate ("||") → strict Violation naming the RPP-1 subset', () => {
    const violations = expectViolations(
      evaluateTriggers(
        withState({
          states,
          triggers: [{ if: "user.rude || task.failed", shift_to: "cold" }],
        }),
        { "user.rude": true },
        "strict"
      )
    );
    expect(violations[0]?.path).toBe("state.triggers[0].if");
    expect(violations[0]?.severity).toBe("error");
    expect(violations[0]?.message).toContain("RPP-1 subset");
    expect(violations[0]?.section).toBe("§20.2");
  });

  it("§20.2 unsupported predicate in permissive mode → warning to sink, trigger skipped, later trigger still fires", () => {
    const sink: Violation[] = [];
    const result = evaluateTriggers(
      withState({
        states,
        triggers: [
          { if: 'topic == "security"', shift_to: "cold" },
          { if: "user.rude", shift_to: "warm" },
        ],
      }),
      { "user.rude": true },
      "permissive",
      sink
    );
    expect(result).toBe("warm");
    expect(sink).toHaveLength(1);
    expect(sink[0]?.severity).toBe("warning");
  });

  it("§20.2 permissive, no sink, no transition → warnings returned (never silently dropped)", () => {
    const result = evaluateTriggers(
      withState({ states, triggers: [{ if: "(user.rude)", shift_to: "cold" }] }),
      {},
      "permissive"
    );
    const violations = expectViolations(result);
    expect(violations.every((v) => v.severity === "warning")).toBe(true);
  });

  it("§20.3.7 matching trigger with unknown shift_to: strict → Violation[], permissive → trigger ignored", () => {
    const config = withState({
      states,
      triggers: [
        { if: "user.rude", shift_to: "ghost" },
        { if: "user.rude", shift_to: "cold" },
      ],
    });
    const strict = expectViolations(evaluateTriggers(config, { "user.rude": true }, "strict"));
    expect(strict[0]?.path).toBe("state.triggers[0].shift_to");

    const sink: Violation[] = [];
    const permissive = evaluateTriggers(config, { "user.rude": true }, "permissive", sink);
    expect(permissive).toBe("cold");
    expect(sink[0]?.message).toContain("trigger ignored");
  });

  it("§20.3 no state/triggers → null", () => {
    expect(evaluateTriggers({ id: "x" }, {}, "strict")).toBeNull();
    expect(evaluateTriggers(withState({ states }), {}, "strict")).toBeNull();
  });
});
