/**
 * Skills adapter — SkillsAdapter assembly.
 *
 * Implements the SpecAdapter contract for Agent Skills (SKILL.md) conformance.
 * Wires frontmatter extraction, schema validation, and static semantic checks
 * into the spec-agnostic muster core pipeline.
 *
 * C-001: no src/core/ file is modified. The _contractCheck enforces this.
 * FR-001: SpecAdapter contract satisfied at compile time.
 *
 * agentskills.io specification pinned to agentskills/agentskills@5d4c1fda3f786fff826c7f56b6cb3341e7f3a911
 */

import { readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import type {
  EffectiveConfig,
  MergeStrategy,
  Mode,
  SpecAdapter,
  ThresholdMapping,
} from "../../core/adapter.js";
import type { Violation } from "../../core/report.js";
import { extractFrontmatter } from "./frontmatter.js";
import { checkLayout } from "./layout.js";
import { validateStatic } from "./validate.js";
import type { SkillDocument, SkillProfile } from "./types.js";

/** Skills adapter merge strategy — standard overlay semantics. */
const SKILLS_MERGE_STRATEGY: MergeStrategy = {
  scalars: "replace",
  maps: "deep",
  lists: "replace",
  typeMismatch: "replace",
  nullIsValue: true,
};

/** Skills adapter threshold mapping — R9 locked constants. */
const SKILLS_THRESHOLDS: ThresholdMapping = {
  maxWords(verbosity: number): number {
    return 10 + verbosity;
  },
  refusalCap: 25,
  words(s: string): number {
    return s.trim().split(/\s+/).filter(Boolean).length;
  },
};

/**
 * Parse a SKILL.md from a skill directory.
 *
 * @param skillDir - Absolute path to the skill directory (NOT the SKILL.md path).
 * @returns SkillDocument on success; throws on document-level errors.
 *
 * FR-002: first YAML block extracted, remainder is body.
 *
 * Note: this method signature differs from the SpecAdapter.parse contract
 * (which takes raw: string, path: string, mode: Mode) because skills
 * parsing is fundamentally directory-based. The SpecAdapter contract is
 * satisfied for the core pipeline via the parse wrapper below.
 */
export function parseSkill(skillDir: string): SkillDocument {
  const absoluteSkillDir = resolvePath(skillDir);
  const skillMdPath = resolvePath(absoluteSkillDir, "SKILL.md");

  const content = readFileSync(skillMdPath, "utf8");
  const result = extractFrontmatter(content, skillMdPath, absoluteSkillDir);

  if ("severity" in result) {
    // Extraction returned a SkillStaticCheck error — throw it.
    throw new Error(`${result.path}: ${result.message}`);
  }

  return result;
}

/**
 * Validate a parsed SkillDocument.
 *
 * @param doc - The parsed SkillDocument.
 * @param profile - "base" or "anthropic".
 * @returns Array of Violation findings; empty = conforming document.
 *
 * FR-003, FR-004
 */
export function validateSkill(
  doc: SkillDocument,
  profile: SkillProfile = "base"
): Violation[] {
  const violations: Violation[] = [];

  // Static semantic checks (name, description, optional fields, Anthropic profile).
  // Layout drift check: bundled file references, path-traversal guard (FR-006).
  violations.push(...validateStatic(doc, profile), ...checkLayout(doc));

  return violations;
}

/**
 * SpecAdapter-compatible parse wrapper.
 *
 * The SpecAdapter contract takes (raw: string, path: string, mode: Mode).
 * For skills, `path` is the skill directory. We parse the directory, not raw content.
 *
 * This allows the skillsAdapter to satisfy the SpecAdapter interface while
 * using the skills-specific parse path.
 */
function parseForSpecAdapter(
  _raw: string,
  path: string,
  _mode: Mode
): ReturnType<SpecAdapter["parse"]> {
  // For skills, `path` is the skill directory.
  // We ignore `raw` and `mode` because skills parsing is directory-based.
  try {
    const doc = parseSkill(path);
    // Map SkillDocument to SoulDocument shape for core compatibility.
    return {
      path: doc.path,
      frontMatter: doc.frontmatter,
      body: doc.body,
      kind: "soul" as const,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [
      {
        path: "(document)",
        message,
        severity: "error" as const,
        section: "agentskills.io §frontmatter",
      },
    ];
  }
}

/** The SkillsAdapter exported for use in the manifest runner and CLI. */
export const skillsAdapter = {
  name: "skills" as const,
  specVersion: "agentskills.io@5d4c1fda3f786fff826c7f56b6cb3341e7f3a911",

  /**
   * Parse a skill directory or SKILL.md content.
   * For skills, `path` is the skill directory (not a Soul.md path).
   */
  parse: parseForSpecAdapter,

  /** Validate a SoulDocument-shaped skill document. */
  validate(
    doc: { frontMatter: unknown; path: string; body: string; kind: string },
    _mode: Mode
  ): Violation[] {
    // Convert SoulDocument back to SkillDocument shape for validation.
    const skillDoc: SkillDocument = {
      path: doc.path,
      skillDir: dirname(doc.path),
      frontmatter: doc.frontMatter,
      body: doc.body,
    };
    return validateSkill(skillDoc, "base");
  },

  /** Skills have no cross-file composition; return empty config. */
  async resolve(
    _doc: unknown,
    _opts: unknown,
    _loadRef: unknown
  ): Promise<EffectiveConfig> {
    return {};
  },

  mergeStrategy: SKILLS_MERGE_STRATEGY,

  thresholds: SKILLS_THRESHOLDS,

  /** Skills trigger evaluation runs via the async runTriggerConformance API (trigger.ts), not this sync hook. */
  evaluateTriggers(
    _effective: EffectiveConfig,
    _facts: Record<string, boolean | string>,
    _mode: Mode
  ): null {
    return null;
  },

  // ── Skills-specific API (used by WP04 fixture suite) ──────────────────────

  /**
   * Parse a skill directory into a SkillDocument.
   * This is the canonical API for WP04 fixture suite usage.
   *
   * @param absoluteSkillDir - Absolute path to the skill directory.
   */
  parseSkill,

  /**
   * Validate a SkillDocument with a specific profile.
   * This is the canonical API for WP04 fixture suite usage.
   *
   * @param doc - The parsed SkillDocument.
   * @param profile - "base" or "anthropic".
   */
  validateSkill,
};

// C-001 enforcement: SpecAdapter contract satisfied at compile time.
skillsAdapter satisfies SpecAdapter;
