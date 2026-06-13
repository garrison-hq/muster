/**
 * Skills adapter — directory layout / bundled-file drift check.
 *
 * Scans the SKILL.md body for file references under `scripts/`, `references/`,
 * and `assets/`; verifies each exists on disk within the skill directory;
 * rejects path-traversal attempts lexically (no I/O on escaping paths).
 *
 * agentskills.io specification pinned to agentskills/agentskills@5d4c1fda3f786fff826c7f56b6cb3341e7f3a911
 * Drift-watch: verify this SHA resolves before any edit to check clauses.
 *
 * FR-006: bundled-file drift check
 * NFR-001: pure lexical traversal guard — no I/O on escaping paths
 */

import fs from "node:fs";
import path from "node:path";
import type { Violation } from "../../core/report.js";
import type { SkillDocument } from "./types.js";

const SHA = "5d4c1fda3f786fff826c7f56b6cb3341e7f3a911";
const LAYOUT_SECTION = `agentskills.io §directory-layout@${SHA}`;

// The three bundled-file prefix directories per the agentskills.io spec.
const BUNDLED_PREFIXES = ["scripts/", "references/", "assets/"];

// Regex to find path tokens that start with one of the bundled prefixes.
// Matches path tokens starting with scripts/, references/, or assets/ and
// continuing until whitespace, quote, parenthesis, angle bracket, or end.
const BUNDLED_REF_PATTERN =
  /(?:^|\s|[(["'])((scripts|references|assets)\/[^\s)"'>]+)/gm;

/**
 * Check directory layout for a skill document.
 *
 * Scans the body for bundled-file references and:
 * 1. Rejects path-traversal references lexically (no I/O).
 * 2. Checks that non-traversal references exist on disk.
 * 3. Warns about nested SKILL.md files.
 *
 * @param doc - Parsed skill document with `body` and `skillDir`.
 * @returns Array of Violation; empty = no layout issues.
 */
export function checkLayout(doc: SkillDocument): Violation[] {
  const violations: Violation[] = [];
  const seen = new Set<string>();

  // ── Extract bundled-file references from body ────────────────────────────
  const refs: string[] = extractBundledRefs(doc.body);

  for (const ref of refs) {
    if (seen.has(ref)) continue;
    seen.add(ref);

    // ── Path-traversal guard (lexical, no I/O on escaping paths) ────────────
    const normalized = path.posix.normalize(ref);

    // Reject if normalized path escapes (starts with `..`) or is absolute.
    if (normalized.startsWith("..") || path.posix.isAbsolute(normalized)) {
      violations.push({
        path: "(layout)",
        message: `path traversal attempt detected in bundled file reference: "${ref}" — references must stay within the skill directory`,
        severity: "error",
        section: LAYOUT_SECTION,
      });
      // Do NOT call fs.existsSync on this path.
      continue;
    }

    // Verify the normalized path still starts with a bundled prefix.
    // (Edge case: normalize could strip a prefix for a path like `scripts/../outside`.)
    const hasBundledPrefix = BUNDLED_PREFIXES.some((p) =>
      normalized.startsWith(p)
    );
    if (!hasBundledPrefix) {
      violations.push({
        path: "(layout)",
        message: `path traversal attempt detected in bundled file reference: "${ref}" — references must stay within the skill directory`,
        severity: "error",
        section: LAYOUT_SECTION,
      });
      continue;
    }

    // ── Existence check (only for safe references) ───────────────────────────
    const resolved = path.resolve(doc.skillDir, normalized);

    // Defense-in-depth: ensure resolved path is still within skillDir.
    const skillDirWithSep = doc.skillDir.endsWith(path.sep)
      ? doc.skillDir
      : doc.skillDir + path.sep;
    if (!resolved.startsWith(skillDirWithSep)) {
      violations.push({
        path: "(layout)",
        message: `path traversal attempt detected in bundled file reference: "${ref}" — references must stay within the skill directory`,
        severity: "error",
        section: LAYOUT_SECTION,
      });
      continue;
    }

    if (!fs.existsSync(resolved)) {
      violations.push({
        path: "(layout)",
        message: `bundled file referenced in SKILL.md body does not exist: "${ref}"`,
        severity: "error",
        section: LAYOUT_SECTION,
      });
    }
  }

  // ── Nested SKILL.md detection ────────────────────────────────────────────
  // Search body for `SKILL.md` appearing at a path depth > 0 (e.g. subdir/SKILL.md).
  if (hasNestedSkillMd(doc.body)) {
    violations.push({
      path: "(document)",
      message:
        "body references a nested SKILL.md file — only the skill-root SKILL.md is authoritative; nested SKILL.md files are ignored",
      severity: "warning",
      section: LAYOUT_SECTION,
    });
  }

  return violations;
}

/**
 * Extract unique bundled file references from the skill body.
 * Matches path tokens starting with scripts/, references/, or assets/.
 */
function extractBundledRefs(body: string): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  BUNDLED_REF_PATTERN.lastIndex = 0;
  while ((match = BUNDLED_REF_PATTERN.exec(body)) !== null) {
    const ref = match[1];
    if (ref && !seen.has(ref)) {
      seen.add(ref);
      refs.push(ref);
    }
  }

  return refs;
}

/**
 * Check if the body references a nested SKILL.md (at path depth > 0).
 */
function hasNestedSkillMd(body: string): boolean {
  // Look for SKILL.md preceded by a path segment (not at line start or after whitespace alone).
  return /[a-zA-Z0-9_.-][/\\]SKILL\.md/.test(body);
}
