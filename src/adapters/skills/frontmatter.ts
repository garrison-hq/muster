/**
 * Skills adapter — frontmatter extraction from SKILL.md content.
 *
 * Pure text extraction: no filesystem I/O; takes already-read content as a
 * string. Returns a SkillDocument on success or a SkillStaticCheck error that
 * halts further checks on failure.
 *
 * NFR-001: zero network I/O; zero filesystem reads.
 * FR-002: handles all edge cases (BOM, absent, unterminated, empty block).
 */

import { parse as parseYaml } from "yaml";
import type { SkillDocument, SkillStaticCheck } from "./types.js";

const UTF8_BOM = "﻿";

/**
 * Extract YAML frontmatter from SKILL.md content.
 *
 * @param content - Raw file content (string, not Buffer).
 * @param skillMdPath - Absolute path to SKILL.md (stored on the returned doc).
 * @param skillDir - Absolute path of the enclosing skill directory.
 * @returns SkillDocument on success; SkillStaticCheck error on failure.
 *
 * FR-002: agentskills.io §frontmatter
 */
export function extractFrontmatter(
  content: string,
  skillMdPath: string,
  skillDir: string
): SkillDocument | SkillStaticCheck {
  // Strip leading UTF-8 BOM before delimiter detection.
  const stripped = content.startsWith(UTF8_BOM)
    ? content.slice(UTF8_BOM.length)
    : content;

  // Content must begin with `---` immediately (no leading whitespace or prose).
  if (!stripped.startsWith("---")) {
    return {
      path: "(document)",
      message:
        "frontmatter must be the first content in SKILL.md — file must begin with `---`",
      severity: "error",
      section: "agentskills.io §frontmatter",
    };
  }

  // Find the closing `---` after the opening delimiter.
  // The opening `---` occupies index 0–2 (plus optional newline at index 3).
  // We search for the SECOND occurrence of `---` at the start of a line.
  const afterOpening = stripped.slice(3); // everything after opening `---`
  // Normalize: skip a single trailing newline on the opening line.
  let searchIn: string;
  if (afterOpening.startsWith("\r\n")) {
    searchIn = afterOpening.slice(2);
  } else if (afterOpening.startsWith("\n")) {
    searchIn = afterOpening.slice(1);
  } else {
    searchIn = afterOpening;
  }

  const closingIdx = findClosingDelimiter(searchIn);
  if (closingIdx === -1) {
    return {
      path: "(document)",
      message: "unterminated frontmatter block — no closing `---` found",
      severity: "error",
      section: "agentskills.io §frontmatter",
    };
  }

  const yamlText = searchIn.slice(0, closingIdx);

  // Everything after the closing `---` (skip the `---` itself plus its newline).
  const afterClosing = searchIn.slice(closingIdx + 3);
  let body: string;
  if (afterClosing.startsWith("\r\n")) {
    body = afterClosing.slice(2);
  } else if (afterClosing.startsWith("\n")) {
    body = afterClosing.slice(1);
  } else {
    body = afterClosing;
  }

  // Parse the YAML block. Use strict:false to avoid parser throws; null → {}.
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText, { strict: false });
  } catch {
    parsed = {};
  }
  parsed ??= {};

  return {
    path: skillMdPath,
    skillDir,
    frontmatter: parsed,
    body,
  };
}

/**
 * Find the index of the closing `---` delimiter within the YAML block text.
 * The delimiter must appear at the start of a line (preceded by newline or
 * be at position 0).
 *
 * Returns the index within `text` where `---` begins, or -1 if not found.
 */
function findClosingDelimiter(text: string): number {
  // Check start of text (empty frontmatter: `---\n---`).
  if (text.startsWith("---")) {
    return 0;
  }

  // Search for `\n---` anywhere in the text.
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const newlineIdx = text.indexOf("\n", searchFrom);
    if (newlineIdx === -1) break;
    const afterNewline = newlineIdx + 1;
    if (text.startsWith("---", afterNewline)) {
      return afterNewline;
    }
    searchFrom = afterNewline;
  }

  return -1;
}
