#!/usr/bin/env node
/**
 * FR-003 schema-check: every entry in the recorded-gaps register must have
 * all seven Key-Entities schema fields (`id`, `title`, `evidence`,
 * `what-was-tried`, `why-left`, `closes-when`, `status`) non-empty, and
 * every `` `symbol` (`file:line[-line]`) `` citation inside an entry's
 * `evidence` field must resolve — reusing (not duplicating)
 * `check-rubric-citations.mjs`'s exported anchor-resolution logic.
 *
 * Register format this parser understands: one `### RG-###` heading per
 * entry, followed by exactly one Markdown bullet per field, in the shape
 * `- **field-name**: value` (single logical line per field — this is a
 * fixed-shape convention this WP establishes, not a general Markdown AST
 * need, matching check-rubric-citations.mjs's own design discipline).
 *
 * Asserts `entries.length >= 7` (FR-003's own "containing at minimum the
 * seven entries enumerated below" wording) — NOT a hardcoded `=== 7` or
 * `=== 12` — so this script doesn't silently encode a guess about which of
 * spec.md's two contradictory entry counts (SC-002's literal "exactly 7"
 * vs. the Recorded-Gaps section's explicit RG-008-012 carry-in instruction)
 * is the corrected one. See this WP's own acceptance evidence for the
 * discrepancy write-up.
 *
 * Zero network calls, byte-stable/order-independent output, repo root
 * resolved from `import.meta.url` (never `process.cwd()`) — C-004, same
 * discipline as `check-rubric-citations.mjs`.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  extractCitations,
  repoRootFromScriptUrl,
  resolveCitation,
} from "./check-rubric-citations.mjs";

/** The seven schema fields every register entry must populate, non-empty. */
export const REQUIRED_FIELDS = [
  "id",
  "title",
  "evidence",
  "what-was-tried",
  "why-left",
  "closes-when",
  "status",
];

const ENTRY_HEADING_RE = /^### (RG-\d+)/gm;
const FIELD_RE = /^- \*\*([a-z-]+)\*\*:\s*(.*)$/gm;

/**
 * Parse every `### RG-###` entry out of `registerText`. Each entry is the
 * heading id plus a `fields` map built from every `- **field**: value`
 * bullet found between that heading and the next (or end of file).
 */
export function parseEntries(registerText) {
  const headingMatches = [...registerText.matchAll(ENTRY_HEADING_RE)];
  const entries = [];
  for (let i = 0; i < headingMatches.length; i += 1) {
    const heading = headingMatches[i];
    const nextStart = headingMatches[i + 1]?.index ?? registerText.length;
    const body = registerText.slice(heading.index, nextStart);
    const fields = {};
    for (const fieldMatch of body.matchAll(FIELD_RE)) {
      fields[fieldMatch[1]] = fieldMatch[2].trim();
    }
    entries.push({ id: heading[1], fields });
  }
  return entries;
}

function missingFieldErrors(entry) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    const value = entry.fields[field];
    if (value === undefined || value.length === 0) {
      errors.push(`INCOMPLETE ENTRY: ${entry.id} is missing required field "${field}"`);
    }
  }
  return errors;
}

function unresolvedCitationErrors(entry, repoRoot) {
  const evidence = entry.fields["evidence"];
  if (evidence === undefined) {
    return [];
  }
  const errors = [];
  for (const citation of extractCitations(evidence)) {
    const resolution = resolveCitation(citation, repoRoot);
    if (!resolution.resolved) {
      errors.push(
        `UNRESOLVED EVIDENCE: ${entry.id} cites ${citation.raw} which does not resolve — ${resolution.reason}`
      );
    }
  }
  return errors;
}

/**
 * Run the full FR-003 check against `registerPath` (resolved relative to
 * `repoRoot`). Returns every violation found: missing-field entries and
 * unresolved evidence citations are both surfaced, plus a distinct
 * violation if the register has fewer than 7 entries at all.
 */
export function checkRegisterSchema(registerPath, repoRoot) {
  const text = readFileSync(registerPath, "utf8");
  const entries = parseEntries(text);
  const errors = [];

  if (entries.length < 7) {
    errors.push(
      `TOO FEW ENTRIES: register has ${entries.length} entries, FR-003 requires at least 7`
    );
  }

  for (const entry of entries) {
    errors.push(...missingFieldErrors(entry));
    errors.push(...unresolvedCitationErrors(entry, repoRoot));
  }

  return { ok: errors.length === 0, errors, entryCount: entries.length };
}

function main() {
  const repoRoot = repoRootFromScriptUrl(import.meta.url);
  const registerArg = process.argv[2];
  if (registerArg === undefined) {
    process.stderr.write("usage: check-register-schema.mjs <path-to-register.md>\n");
    process.exitCode = 1;
    return;
  }
  const registerPath = path.isAbsolute(registerArg)
    ? registerArg
    : path.join(repoRoot, registerArg);
  const result = checkRegisterSchema(registerPath, repoRoot);

  for (const error of result.errors) {
    process.stdout.write(`${error}\n`);
  }
  process.stdout.write(
    result.ok
      ? `check-register-schema: OK — ${result.entryCount} entries, all schema fields populated, all citations resolve\n`
      : ""
  );
  process.exitCode = result.ok ? 0 : 1;
}

const isMainModule = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main();
}
