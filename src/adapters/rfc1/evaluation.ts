/**
 * RFC-1 §21.1 evaluation rule references (FR-011).
 *
 * `expected_rules` entries are either ID references (`@<rule_id>`, matched
 * against `evaluation.rule_catalog[*].id`) or literal rule text (matched
 * against `critical_criteria` then `secondary_criteria`).
 *
 * All matching uses exact Unicode code point equality: case-sensitive, NO
 * whitespace trimming, NO Unicode normalization (§21.1 — the spec explicitly
 * warns this brittleness is intentional). JS `===` on strings compares UTF-16
 * code units, which is identical to code point equality for well-formed
 * strings, so no extra machinery is needed.
 *
 * Pure module: zero fs/network imports (Definition of Done).
 */

import type { EffectiveConfig, Mode } from "../../core/adapter.js";
import type { Violation } from "../../core/report.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Where a rule reference resolved (§21.1). */
export interface RuleMatch {
  source: "rule_catalog" | "critical_criteria" | "secondary_criteria";
  /** Index within the matched list. */
  index: number;
}

/**
 * Resolve one rule reference against an `evaluation` block (§21.1).
 *
 * - `@id` form: resolved against `rule_catalog[*].id` ONLY. When both a
 *   catalog and literal criteria exist, ID references MUST resolve to catalog
 *   entries first (§21.1) — an `@...` string is therefore never matched as
 *   literal criteria text, and an `@id` with no catalog resolves to nothing.
 * - literal form: exact code-point match against `critical_criteria` first,
 *   then `secondary_criteria`; the first occurrence wins (§21.1).
 *
 * Returns the match location or null.
 */
export function matchExpectedRule(
  ref: string,
  evaluation: Record<string, unknown>
): RuleMatch | null {
  if (ref.startsWith("@")) {
    const id = ref.slice(1);
    const catalog = evaluation["rule_catalog"];
    if (!Array.isArray(catalog)) return null;
    const index = catalog.findIndex((entry) => isRecord(entry) && entry["id"] === id);
    return index >= 0 ? { source: "rule_catalog", index } : null;
  }
  // Literal text: critical_criteria first, then secondary_criteria (§21.1
  // "first occurrence wins" when the same rule appears in both lists).
  for (const source of ["critical_criteria", "secondary_criteria"] as const) {
    const list = evaluation[source];
    if (Array.isArray(list)) {
      const index = list.findIndex((entry) => entry === ref);
      if (index >= 0) return { source, index };
    }
  }
  return null;
}

/**
 * Validate every `evaluation.test_prompts[*].expected_rules` reference of an
 * effective config (§21.1, FR-011). Unresolvable references are errors in
 * strict mode and warnings in permissive mode — never silently dropped.
 */
export function resolveRuleRefs(effective: EffectiveConfig, mode: Mode): Violation[] {
  const violations: Violation[] = [];
  const severity = mode === "strict" ? ("error" as const) : ("warning" as const);
  const evaluation = effective["evaluation"];
  if (!isRecord(evaluation)) return violations;
  const prompts = evaluation["test_prompts"];
  if (!Array.isArray(prompts)) return violations;

  prompts.forEach((prompt, promptIndex) => {
    if (!isRecord(prompt)) return; // shape is the schema layer's concern
    const rules = prompt["expected_rules"];
    if (!Array.isArray(rules)) return;
    rules.forEach((ref, ruleIndex) => {
      const path = `evaluation.test_prompts[${promptIndex}].expected_rules[${ruleIndex}]`;
      if (typeof ref !== "string") {
        violations.push({
          path,
          message: "expected_rules entries must be strings",
          severity,
          section: "§21.1",
        });
        return;
      }
      if (matchExpectedRule(ref, evaluation) !== null) return;
      const message = ref.startsWith("@")
        ? Array.isArray(evaluation["rule_catalog"])
          ? `ID reference "${ref}" does not match any rule_catalog entry id`
          : `ID reference "${ref}" cannot resolve: no rule_catalog is defined`
        : `literal rule text ${JSON.stringify(ref)} matches no entry in ` +
          "critical_criteria or secondary_criteria (exact code-point match; no trimming)";
      violations.push({ path, message, severity, section: "§21.1" });
    });
  });
  return violations;
}
