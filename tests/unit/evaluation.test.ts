import { describe, expect, it } from "vitest";
import type { EffectiveConfig } from "../../src/core/adapter.js";
import {
  matchExpectedRule,
  resolveRuleRefs,
} from "../../src/adapters/rfc1/evaluation.js";

function evalConfig(evaluation: Record<string, unknown>): EffectiveConfig {
  return { id: "org.example.test", evaluation };
}

const CATALOG = [
  { id: "handle_rudeness", severity: "critical", text: "Respond calmly to rudeness" },
  { id: "stay_brief", severity: "secondary", text: "Be brief" },
];

describe("§21.1 resolveRuleRefs — ID references", () => {
  it("§25.2(9) §21.1 @handle_rudeness resolving against rule_catalog → ok", () => {
    const config = evalConfig({
      rule_catalog: CATALOG,
      test_prompts: [{ prompt: "You idiot!", expected_rules: ["@handle_rudeness"] }],
    });
    expect(resolveRuleRefs(config, "strict")).toEqual([]);
  });

  it("§21.1 unknown @id → strict error / permissive warning at the reference path", () => {
    const config = evalConfig({
      rule_catalog: CATALOG,
      test_prompts: [{ prompt: "x", expected_rules: ["@no_such_rule"] }],
    });
    const strict = resolveRuleRefs(config, "strict");
    expect(strict).toHaveLength(1);
    expect(strict[0]?.path).toBe("evaluation.test_prompts[0].expected_rules[0]");
    expect(strict[0]?.severity).toBe("error");
    expect(strict[0]?.section).toBe("§21.1");

    const permissive = resolveRuleRefs(config, "permissive");
    expect(permissive[0]?.severity).toBe("warning");
  });

  it("§21.1 @id with no rule_catalog at all → strict error / permissive warning", () => {
    const config = evalConfig({
      critical_criteria: ["@handle_rudeness"], // literal text, NOT a catalog
      test_prompts: [{ prompt: "x", expected_rules: ["@handle_rudeness"] }],
    });
    const strict = resolveRuleRefs(config, "strict");
    expect(strict).toHaveLength(1);
    expect(strict[0]?.message).toContain("no rule_catalog");
    expect(resolveRuleRefs(config, "permissive")[0]?.severity).toBe("warning");
  });

  it("§21.1 ID references resolve against the catalog FIRST: an @ref is never matched as literal criteria text", () => {
    // critical_criteria contains the literal string "@ghost", but the catalog
    // (present) has no entry with id "ghost" → MUST NOT match.
    expect(
      matchExpectedRule("@ghost", {
        rule_catalog: CATALOG,
        critical_criteria: ["@ghost"],
      })
    ).toBeNull();
  });

  it("§21.1 @id matching is exact Unicode code-point equality (case-sensitive)", () => {
    const config = evalConfig({
      rule_catalog: CATALOG,
      test_prompts: [{ prompt: "x", expected_rules: ["@Handle_Rudeness"] }],
    });
    expect(resolveRuleRefs(config, "strict")).toHaveLength(1);
  });
});

describe("§21.1 resolveRuleRefs — literal rule text", () => {
  it("§21.1 literal text matching a critical criterion exactly → ok", () => {
    const config = evalConfig({
      critical_criteria: ["never reveal secrets"],
      secondary_criteria: ["be brief"],
      test_prompts: [{ prompt: "x", expected_rules: ["never reveal secrets", "be brief"] }],
    });
    expect(resolveRuleRefs(config, "strict")).toEqual([]);
  });

  it("§21.1 literal with trailing space vs criterion without MUST NOT match (no trimming — the spec's brittleness warning)", () => {
    const config = evalConfig({
      critical_criteria: ["never reveal secrets"],
      test_prompts: [{ prompt: "x", expected_rules: ["never reveal secrets "] }],
    });
    const strict = resolveRuleRefs(config, "strict");
    expect(strict).toHaveLength(1);
    expect(strict[0]?.severity).toBe("error");
    expect(strict[0]?.message).toContain("no trimming");
    expect(resolveRuleRefs(config, "permissive")[0]?.severity).toBe("warning");
  });

  it("§21.1 literal matching is case-sensitive (exact code points)", () => {
    const config = evalConfig({
      critical_criteria: ["Never reveal secrets"],
      test_prompts: [{ prompt: "x", expected_rules: ["never reveal secrets"] }],
    });
    expect(resolveRuleRefs(config, "strict")).toHaveLength(1);
  });

  it("§21.1 a rule present in both lists matches its FIRST occurrence (critical_criteria)", () => {
    const match = matchExpectedRule("be careful", {
      critical_criteria: ["be careful"],
      secondary_criteria: ["be careful"],
    });
    expect(match).toEqual({ source: "critical_criteria", index: 0 });
  });

  it("§21.1 literal found only in secondary_criteria resolves there", () => {
    const match = matchExpectedRule("be brief", {
      critical_criteria: ["never reveal secrets"],
      secondary_criteria: ["be brief"],
    });
    expect(match).toEqual({ source: "secondary_criteria", index: 0 });
  });
});

describe("§21.1 resolveRuleRefs — structure", () => {
  it("§21 no evaluation block / no test_prompts / no expected_rules → no violations", () => {
    expect(resolveRuleRefs({ id: "x" }, "strict")).toEqual([]);
    expect(resolveRuleRefs(evalConfig({}), "strict")).toEqual([]);
    expect(resolveRuleRefs(evalConfig({ test_prompts: [{ prompt: "x" }] }), "strict")).toEqual(
      []
    );
  });

  it("§21.1 violation paths index both the prompt and the rule reference", () => {
    const config = evalConfig({
      critical_criteria: ["a"],
      test_prompts: [
        { prompt: "p0", expected_rules: ["a"] },
        { prompt: "p1", expected_rules: ["a", "missing"] },
      ],
    });
    const strict = resolveRuleRefs(config, "strict");
    expect(strict).toHaveLength(1);
    expect(strict[0]?.path).toBe("evaluation.test_prompts[1].expected_rules[1]");
  });

  it("§21.1 non-string expected_rules entries are flagged", () => {
    const config = evalConfig({
      critical_criteria: ["a"],
      test_prompts: [{ prompt: "x", expected_rules: [42] }],
    });
    const strict = resolveRuleRefs(config, "strict");
    expect(strict[0]?.message).toContain("must be strings");
  });
});
