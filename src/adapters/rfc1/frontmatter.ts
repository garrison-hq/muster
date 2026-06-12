/**
 * RFC-1 §3.1.1 front-matter extraction.
 *
 * Pure text splitting — NO YAML parsing happens here, so soul-yaml.ts is the
 * single place that controls all YAML handling (§4.1–§4.2).
 *
 * Rules (§3.1.1, normative):
 * - The document MUST begin with a line that is exactly `---` (a leading
 *   UTF-8 BOM is allowed and stripped — §3.2).
 * - Front matter is everything until the next line that is exactly `---`;
 *   the body is everything after that closing delimiter.
 * - Only the FIRST block is configuration; later `---` lines in the body are
 *   ignored (§3, §3.1.1).
 * - Missing opening delimiter or an unterminated block is a refusal in both
 *   modes; permissive mode gets an actionable message.
 *
 * Whole-document errors carry an empty `path` (documented-empty: there is no
 * config path to point at when the front matter itself is absent).
 */

import type { Mode } from "../../core/adapter.js";
import type { Violation } from "../../core/report.js";

/** Strip a single leading UTF-8 BOM (U+FEFF) — §3.2 (UTF-8 encoding). */
function stripBom(raw: string): string {
  return raw.codePointAt(0) === 0xfeff ? raw.slice(1) : raw;
}

/** True iff the line is exactly `---` (tolerating a trailing CR from CRLF files). */
function isDelimiter(line: string): boolean {
  return line === "---" || line === "---\r";
}

function refusal(mode: Mode): Violation[] {
  return [
    {
      path: "",
      message:
        mode === "strict"
          ? "missing or malformed front matter"
          : "front matter must be the first content, delimited by ---",
      severity: "error",
      section: "§3.1.1",
    },
  ];
}

/**
 * Extract the first YAML front-matter block (§3.1.1).
 *
 * Returns `{ yamlText, body }` on success (yamlText may be the empty string —
 * the validation layer decides what an empty block means), or a Violation
 * refusal when the opening delimiter is missing or the block is unterminated.
 */
export function extractFrontMatter(
  raw: string,
  mode: Mode
): { yamlText: string; body: string } | Violation[] {
  const text = stripBom(raw);
  const lines = text.split("\n");

  // The document MUST begin with a line that is exactly `---`.
  if (lines.length === 0 || !isDelimiter(lines[0] ?? "")) {
    return refusal(mode);
  }

  // Front matter runs until the next line that is exactly `---`.
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (isDelimiter(lines[i] ?? "")) {
      close = i;
      break;
    }
  }

  // Unterminated block → refusal in both modes.
  if (close === -1) {
    return refusal(mode);
  }

  return {
    yamlText: lines.slice(1, close).join("\n"),
    // Everything after the closing delimiter is body; later `---` lines in
    // the body are ignored (only the FIRST block is configuration).
    body: lines.slice(close + 1).join("\n"),
  };
}
