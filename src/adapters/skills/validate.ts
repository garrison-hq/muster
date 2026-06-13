/**
 * Skills adapter — static validation for SKILL.md frontmatter.
 *
 * Implements all semantic rules for name, description, optional fields,
 * and the Anthropic platform profile gate. Every check cites a normative
 * source in the `section` field.
 *
 * agentskills.io specification pinned to agentskills/agentskills@5d4c1fda3f786fff826c7f56b6cb3341e7f3a911
 * Drift-watch: verify this SHA resolves before any edit to check clauses.
 * Any spec delta is a mission blocker — record in work log before proceeding.
 */

import { basename } from "node:path";
import type { Violation } from "../../core/report.js";
import type { SkillDocument, SkillProfile } from "./types.js";
import { validateSchema } from "./schema.js";

const SHA = "5d4c1fda3f786fff826c7f56b6cb3341e7f3a911";
const BASE_SECTION = `agentskills.io §frontmatter@${SHA}`;
const NAME_SECTION = `agentskills.io §frontmatter.name@${SHA}`;
const DESC_SECTION = `agentskills.io §frontmatter.description@${SHA}`;
const COMPAT_SECTION = `agentskills.io §frontmatter.compatibility@${SHA}`;
const ALLOWED_TOOLS_SECTION = `agentskills.io §frontmatter.allowed-tools@${SHA}`;
const ANTHROPIC_SECTION = "https://docs.anthropic.com/en/docs/build-with-claude/tool-use#best-practices-for-tool-definitions";

function err(path: string, message: string, section: string): Violation {
  return { path, message, severity: "error", section };
}

function warn(path: string, message: string, section: string): Violation {
  return { path, message, severity: "warning", section };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ─── Per-field validators (extracted to reduce cognitive complexity) ──────────

/**
 * Validate name charset and hyphen placement rules (FR-003).
 * Only called when charset test passes (valid [a-z0-9-]).
 */
function validateNameHyphens(name: string): Violation[] {
  const violations: Violation[] = [];
  if (name.startsWith("-")) {
    violations.push(err("name", "name must not start with a hyphen", NAME_SECTION));
  }
  if (name.endsWith("-")) {
    violations.push(err("name", "name must not end with a hyphen", NAME_SECTION));
  }
  if (name.includes("--")) {
    violations.push(err("name", "name must not contain consecutive hyphens", NAME_SECTION));
  }
  return violations;
}

/**
 * Validate the `name` field (FR-003).
 * Returns findings; empty = no name violations.
 */
function validateName(name: unknown, skillDir: string): Violation[] {
  const violations: Violation[] = [];

  if (typeof name !== "string" || name.length === 0) {
    violations.push(err("name", "name is required and must be a non-empty string", NAME_SECTION));
    return violations;
  }

  if (name.length > 64) {
    violations.push(
      err("name", `name must be at most 64 characters (got ${name.length})`, NAME_SECTION)
    );
  }

  if (/^[a-z0-9-]+$/.test(name)) {
    violations.push(...validateNameHyphens(name));
  } else {
    violations.push(
      err("name", "name must contain only lowercase letters, digits, and hyphens ([a-z0-9-])", NAME_SECTION)
    );
  }

  const dirBasename = basename(skillDir);
  if (name !== dirBasename) {
    violations.push(
      err(
        "name",
        `name "${name}" must equal the parent directory name "${dirBasename}"`,
        NAME_SECTION
      )
    );
  }

  return violations;
}

/**
 * Validate the `description` field (FR-004).
 * Returns findings; empty = no description violations.
 */
function validateDescription(description: unknown): Violation[] {
  if (typeof description !== "string" || description.trim().length === 0) {
    return [err("description", "description is required and must be a non-empty string", DESC_SECTION)];
  }
  if (description.length > 1024) {
    return [
      err(
        "description",
        `description must be at most 1024 characters (got ${description.length})`,
        DESC_SECTION
      ),
    ];
  }
  return [];
}

/**
 * Validate optional fields: license, compatibility, allowed-tools (FR-005).
 * Returns findings; empty = no optional-field violations.
 */
function validateOptionalFields(fm: Record<string, unknown>): Violation[] {
  const violations: Violation[] = [];

  const license = fm["license"];
  if (typeof license === "string" && license.length === 0) {
    violations.push(
      warn("license", "license is present but empty — an empty license value is ambiguous", BASE_SECTION)
    );
  }

  const compatibility = fm["compatibility"];
  if (typeof compatibility === "string" && compatibility.length > 500) {
    violations.push(
      err(
        "compatibility",
        `compatibility must be at most 500 characters (got ${compatibility.length})`,
        COMPAT_SECTION
      )
    );
  }

  const allowedTools = fm["allowed-tools"];
  if (typeof allowedTools === "string") {
    const tokens = allowedTools.split(" ").filter((t) => t.length > 0);
    if (tokens.length === 0) {
      violations.push(
        err("allowed-tools", "allowed-tools must contain at least one tool token", ALLOWED_TOOLS_SECTION)
      );
    }
    violations.push(
      warn(
        "allowed-tools",
        "allowed-tools is an experimental field per the agentskills.io specification",
        ALLOWED_TOOLS_SECTION
      )
    );
  }

  return violations;
}

/**
 * Apply the Anthropic platform profile gate (FR-007).
 * Only called when profile === "anthropic".
 * Returns findings; empty = no Anthropic profile violations.
 */
function validateAnthropicProfile(name: unknown, description: unknown): Violation[] {
  const violations: Violation[] = [];
  const nameStr = typeof name === "string" ? name : "";
  const descStr = typeof description === "string" ? description : "";

  if (/anthropic|claude/i.test(nameStr)) {
    violations.push(
      err(
        "name",
        `name must not contain reserved words "anthropic" or "claude" (Anthropic platform profile)`,
        ANTHROPIC_SECTION
      )
    );
  }

  if (/<[^>]+>/.test(descStr)) {
    violations.push(
      err(
        "description",
        "description must not contain XML tags under the Anthropic platform profile",
        ANTHROPIC_SECTION
      )
    );
  }

  return violations;
}

// ─── Main validator ───────────────────────────────────────────────────────────

/**
 * Run all static conformance checks on a parsed SkillDocument.
 *
 * @param doc - The parsed SkillDocument from frontmatter extraction.
 * @param profile - Which profile to apply: "base" or "anthropic".
 * @returns Array of Violation findings; empty array = conforming document.
 *
 * FR-003, FR-004, FR-005, FR-007
 */
export function validateStatic(
  doc: SkillDocument,
  profile: SkillProfile
): Violation[] {
  const violations: Violation[] = [];

  // Schema validation first — catches type mismatches before semantic rules.
  const schemaResult = validateSchema(doc.frontmatter);
  if (!schemaResult.valid) {
    for (const se of schemaResult.errors) {
      violations.push(err(se.path, se.message, BASE_SECTION));
    }
    return violations;
  }

  const fm = isRecord(doc.frontmatter) ? doc.frontmatter : {};

  violations.push(...validateName(fm["name"], doc.skillDir));
  violations.push(...validateDescription(fm["description"]));
  violations.push(...validateOptionalFields(fm));

  if (profile === "anthropic") {
    violations.push(...validateAnthropicProfile(fm["name"], fm["description"]));
  }

  return violations;
}
