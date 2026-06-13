/**
 * Skills adapter — adapter-private types for the Agent Skills (SKILL.md)
 * conformance adapter.
 *
 * All types are adapter-private. Nothing here modifies or extends src/core/.
 * C-001: core boundary is enforced by the tsc _contractCheck in index.ts.
 */

import type { EndpointConfig } from "../../core/behavioral/types.js";

// ─── Document layer ────────────────────────────────────────────────────────

/**
 * In-memory representation of a parsed SKILL.md — output of frontmatter.ts
 * extraction, before validation. (data-model.md §SkillDocument)
 */
export interface SkillDocument {
  /** Absolute path to SKILL.md. */
  path: string;
  /** Absolute path of the enclosing skill directory (dirname of path). */
  skillDir: string;
  /**
   * Parsed frontmatter object from the first YAML block.
   * `unknown` pre-validation; `SkillFrontmatter` post-schema-check.
   */
  frontmatter: unknown;
  /**
   * Everything after the closing `---` delimiter.
   * Used only for bundled-file reference extraction (FR-006).
   * Never interpreted as configuration.
   */
  body: string;
}

/**
 * Typed, validated frontmatter after schema + semantic checks pass.
 * (data-model.md §SkillFrontmatter)
 */
export interface SkillFrontmatter {
  /** Required. 1–64 chars, [a-z0-9-], no leading/trailing/consecutive hyphens,
   *  equals the parent directory basename (FR-003). */
  name: string;
  /** Required. Non-empty, at most 1024 chars (FR-004). */
  description: string;
  /** Optional. Arbitrary string (FR-005). */
  license?: string;
  /** Optional. 1–500 chars (FR-005). */
  compatibility?: string;
  /** Optional. String→string map; non-string values are rejected (FR-005). */
  metadata?: Record<string, string>;
  /**
   * Optional. Space-separated tool tokens (FR-005).
   * Presence emits an "experimental" warning regardless of content —
   * this warning is normative per the agentskills.io spec's own marking.
   */
  "allowed-tools"?: string;
}

/**
 * Which set of checks applies to a given run.
 * (data-model.md §SkillProfile)
 *
 * - `"base"`: only agentskills.io spec rules apply.
 * - `"anthropic"`: base rules plus Anthropic-platform constraints.
 */
export type SkillProfile = "base" | "anthropic";

/**
 * Conceptual type for the rule definition that drives each static check.
 * The adapter produces a Violation[] (core type) for static findings;
 * SkillStaticCheck represents the rule definition shape.
 * (data-model.md §StaticCheck)
 */
export interface SkillStaticCheck {
  /** Frontmatter path of the violation, e.g. `name`, `description`,
   *  `metadata.count`, or `(document)` for whole-file failures. */
  path: string;
  /** Human-readable explanation naming the violated rule. */
  message: string;
  /** `error` means `ok: false`; `warning` survives next to `ok: true`. */
  severity: "error" | "warning";
  /** agentskills.io clause identifier pinned to the commit SHA. */
  section?: string;
}

// ─── Trigger grader types ──────────────────────────────────────────────────

/**
 * A labeled set of queries used to test whether a model routes correctly to a
 * skill. (data-model.md §TriggerQuerySet)
 */
export interface TriggerQuerySet {
  /** Identifier matching the manifest entry. */
  id: string;
  /**
   * Normative source citation: agentskills.io trigger-testing methodology
   * (agentskills.io/specification#trigger-testing, pinned commit SHA).
   */
  source: string;
  /**
   * Queries the model SHOULD invoke the target skill on.
   * Rubric: at least 8, varied in phrasing (RQ-02 [as-opt-desc]).
   */
  shouldTrigger: string[];
  /**
   * Queries the model SHOULD NOT invoke the target skill on.
   * Near-misses: share surface keywords with the skill but are clearly
   * out-of-scope. At least 8 required (rubric minimum).
   */
  nearMiss: string[];
  /**
   * Trigger-rate threshold published as a muster rubric, citing
   * agentskills.io methodology as prior art (C-003, RQ-02 [as-opt-desc]).
   * shouldTrigger axis: trigger rate MUST be >= threshold to pass.
   * nearMiss axis: trigger rate MUST be < threshold to pass.
   * Default: 0.5 (per spec site's documented guidance).
   */
  threshold: number;
}

/**
 * Local tool definition shape for trigger case tool payloads.
 * (data-model.md §TriggerCase)
 */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
  };
}

/**
 * One behavioral test: a skill paired with a query set and run N times per
 * query against an endpoint. (data-model.md §TriggerCase)
 */
export interface TriggerCase {
  id: string;
  /** Absolute path to the skill directory. */
  skillDir: string;
  profile: SkillProfile;
  querySet: TriggerQuerySet;
  /**
   * n in k-of-n: how many times each query is run against the endpoint.
   * Charter minimum is 3 (per agentskills.io methodology); manifest default.
   */
  runsPerQuery: number;
  /**
   * Tool payload sent to the endpoint for every query:
   * [{type: "function", function: {name: skill.name, description: skill.description}}]
   * plus a second "decoy" tool to test discrimination (FR-012).
   */
  tools: ToolDefinition[];
  endpoint: EndpointConfig;
}

/**
 * Per-query breakdown: how many of the N runs triggered.
 * (data-model.md §QueryRunResult)
 */
export interface QueryRunResult {
  query: string;
  runsTotal: number;
  runsTriggered: number;
  /** Errored runs counted as non-trigger (FR-011). */
  runsErrored: number;
}

/**
 * Verdict for one axis of a TriggerCase.
 * (data-model.md §AxisVerdict)
 */
export interface AxisVerdict {
  axis: "should-trigger" | "near-miss";
  /** Measured trigger rate across all queries x runs on this axis. */
  triggerRate: number;
  threshold: number;
  /** should-trigger: rate >= threshold; near-miss: rate < threshold */
  passed: boolean;
  /** Per-query breakdown: how many of the N runs triggered. */
  queryBreakdown: QueryRunResult[];
}

/**
 * The aggregated outcome for one TriggerCase.
 * (data-model.md §TriggerVerdict)
 */
export interface TriggerVerdict {
  id: string;
  /** true only if BOTH axes pass */
  passed: boolean;
  shouldTriggerAxis: AxisVerdict;
  nearMissAxis: AxisVerdict;
  /** true for discrimination control cases */
  isControl: boolean;
}
