#!/usr/bin/env node
/**
 * FR-002 drift-check: every code citation under `docs/rubric/*.md` MUST
 * resolve against the current tree, and every file under the scanned root
 * MUST be referenced from that root's own `index.md`.
 *
 * Grammar this parser understands — and ONLY this grammar (fixed-shape
 * regex extraction over plain text, deliberately not a general Markdown AST
 * walk):
 *
 *   `symbolName` (`file:line[-line]`)
 *
 * i.e. a backtick-quoted symbol/string immediately followed by a
 * parenthesised, backtick-quoted `file:line` or `file:startLine-endLine`
 * pointer. Both backtick groups must be present, adjacent (only whitespace
 * between the symbol and the opening parenthesis), and on the same
 * normalized (newline-flattened) text.
 *
 * KNOWN, DOCUMENTED BLIND SPOT: this parser does not recognize any other
 * citation shape — a bare `(line N)` / `(lines N, M, P)` reference with no
 * file path at all, a bare backtick-wrapped `file:line` with no leading
 * symbol group, or a comma-separated `` `symbol`, `file:line` `` mention —
 * are all invisible to it. They are silently never checked, not silently
 * passed as clean; this is an accepted, intentional scope limit (not a bug)
 * so this tool stays a small, auditable regex rather than a Markdown AST.
 * `docs/rubric/spec-kitty-behavioral-axes.md`'s one incidental bare-style
 * citation (prose "(lines 62-67 of that file)") is the canonical example.
 *
 * Zero network calls (C-004, NI-003 regression surface). Byte-stable,
 * order-independent output: every directory listing this script produces is
 * explicitly sorted by UTF-16 code-unit order (plain `<`/`>` comparison,
 * never `localeCompare`), and repo root is resolved from this file's own
 * `import.meta.url`, never from `process.cwd()`, so output is identical
 * regardless of the working directory the script is invoked from.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

/** Directories never entered, matching tests/unit/invariants.test.ts's guard. */
export const BASE_EXCLUDES = new Set([
  "node_modules",
  ".git",
  "dist",
  ".worktrees",
  ".kittify",
]);

/** Plain UTF-16 code-unit string comparator — never `localeCompare`. */
export function compareStrings(a, b) {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

/** Repo root resolved from this file's own location, never from cwd. */
export function repoRootFromScriptUrl(scriptUrl) {
  const scriptDir = path.dirname(fileURLToPath(scriptUrl));
  return path.resolve(scriptDir, "..");
}

/**
 * Recursively collect file paths under `dir`, skipping any entry whose name
 * is in `exclude` and never following symlinks. Every directory listing is
 * sorted before recursion/return, so output never depends on the
 * filesystem's own directory-entry order.
 */
export function walk(dir, exclude) {
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true })
    .slice()
    .sort((a, b) => compareStrings(a.name, b.name));
  for (const entry of entries) {
    if (exclude.has(entry.name) || entry.isSymbolicLink()) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full, exclude));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

/** Repo-relative path with forward slashes, for stable messages/matching. */
function toRepoRelative(absPath, repoRoot) {
  return path.relative(repoRoot, absPath).split(path.sep).join("/");
}

/** Recursively list `*.md` files under `root`, relative to `root`, sorted. */
export function listMarkdownFiles(root) {
  const entries = readdirSync(root, { withFileTypes: true })
    .slice()
    .sort((a, b) => compareStrings(a.name, b.name));
  const out = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory()) {
      for (const nested of listMarkdownFiles(path.join(root, entry.name))) {
        out.push(path.join(entry.name, nested).split(path.sep).join("/"));
      }
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(entry.name);
    }
  }
  return out.sort(compareStrings);
}

const CITATION_RE = /`([^`\n]+)`\s*\(`([^`\n]+):(\d+)(?:-(\d+))?`\)/g;

/**
 * Extract every canonical-grammar citation from `markdownText`. Returns one
 * entry per match, including the 1-based source line number (within
 * `markdownText`) for error reporting.
 */
export function extractCitations(markdownText) {
  const citations = [];
  let match = CITATION_RE.exec(markdownText);
  while (match !== null) {
    const [, symbol, file, startLineStr, endLineStr] = match;
    const startLine = Number.parseInt(startLineStr, 10);
    const endLine = endLineStr === undefined ? startLine : Number.parseInt(endLineStr, 10);
    const sourceLine = markdownText.slice(0, match.index).split("\n").length;
    citations.push({ symbol, file, startLine, endLine, sourceLine, raw: match[0] });
    match = CITATION_RE.exec(markdownText);
  }
  return citations;
}

function isPathMatch(candidate, citedFile) {
  return candidate === citedFile || candidate.endsWith(`/${citedFile}`);
}

/**
 * Resolve one citation against `repoRoot`: find every repo file whose path
 * matches `citation.file` (exact repo-relative match, or a path-segment
 * suffix match — the corpus cites both bare basenames like `trigger.ts` and
 * full relative paths like `tests/cts/skills-suite.test.ts`), then confirm
 * at least one candidate has the cited line range in-bounds AND the cited
 * symbol/string literally present within that range.
 */
export function resolveCitation(citation, repoRoot) {
  const allFiles = walk(repoRoot, BASE_EXCLUDES)
    .map((f) => toRepoRelative(f, repoRoot))
    .sort(compareStrings);
  const candidates = allFiles.filter((f) => isPathMatch(f, citation.file));

  if (candidates.length === 0) {
    return { resolved: false, reason: `file not found: ${citation.file}` };
  }

  const attempts = [];
  for (const candidate of candidates) {
    const lines = readFileSync(path.join(repoRoot, candidate), "utf8").split("\n");
    if (citation.endLine > lines.length) {
      attempts.push(
        `${candidate}: line ${citation.startLine}-${citation.endLine} out of bounds ` +
          `(file has ${lines.length} lines)`
      );
      continue;
    }
    const slice = lines.slice(citation.startLine - 1, citation.endLine).join("\n");
    if (!slice.includes(citation.symbol)) {
      attempts.push(
        `${candidate}: "${citation.symbol}" not found in lines ` +
          `${citation.startLine}-${citation.endLine}`
      );
      continue;
    }
    return { resolved: true, matchedPath: candidate };
  }
  return { resolved: false, reason: attempts.join("; ") };
}

/**
 * Index-completeness check: every `*.md` file under `root` (other than
 * `index.md` itself) must have its basename appear literally somewhere in
 * `index.md`'s content.
 *
 * If `root` has no `index.md` at all, this check is a no-op (there is
 * nothing yet to be incomplete against) — this is what keeps this WP's own
 * commit-ordering discipline meaningful: `docs/rubric/index.md` is only
 * added in this WP's final commit, and the anchor-repair commit before it
 * must be checkable purely on citation-resolution grounds.
 */
export function checkIndexCompleteness(root) {
  const files = listMarkdownFiles(root);
  const indexRel = files.find((f) => f === "index.md");
  if (indexRel === undefined) {
    return { ok: true, missing: [] };
  }
  const indexContent = readFileSync(path.join(root, indexRel), "utf8");
  const missing = files
    .filter((f) => f !== indexRel)
    .filter((f) => !indexContent.includes(path.basename(f)))
    .sort(compareStrings);
  return { ok: missing.length === 0, missing };
}

function formatCitationError(rootRelFile, citation, resolution) {
  return (
    `STALE CITATION (FR-002) [${rootRelFile}:${citation.sourceLine}]: ${citation.raw} — ` +
    `${resolution.reason}`
  );
}

/**
 * Run the full FR-002 check against `root` (a directory of rubric `*.md`
 * files, resolved relative to `repoRoot`). Returns every violation found —
 * citation-resolution failures and index-completeness failures are separate
 * code paths, both surfaced here, so a caller (or a test) can assert on
 * either independently.
 */
export function checkRubricCorpus(root, repoRoot) {
  const errors = [];
  const files = listMarkdownFiles(root);

  for (const relFile of files) {
    const rootRelFile = path.join(path.relative(repoRoot, root), relFile).split(path.sep).join("/");
    const text = readFileSync(path.join(root, relFile), "utf8");
    for (const citation of extractCitations(text)) {
      const resolution = resolveCitation(citation, repoRoot);
      if (!resolution.resolved) {
        errors.push(formatCitationError(rootRelFile, citation, resolution));
      }
    }
  }

  const indexResult = checkIndexCompleteness(root);
  for (const missingFile of indexResult.missing) {
    const rootRelFile = path.join(path.relative(repoRoot, root), missingFile).split(path.sep).join("/");
    errors.push(`UNINDEXED FILE (FR-002): ${rootRelFile} has zero index entries pointing at it`);
  }

  return { ok: errors.length === 0, errors };
}

function parseRootArg(argv) {
  const flagIndex = argv.indexOf("--root");
  if (flagIndex === -1 || argv[flagIndex + 1] === undefined) {
    return "docs/rubric";
  }
  return argv[flagIndex + 1];
}

function resolveRoot(repoRoot, rootArg) {
  return path.isAbsolute(rootArg) ? rootArg : path.join(repoRoot, rootArg);
}

function main() {
  const repoRoot = repoRootFromScriptUrl(import.meta.url);
  const root = resolveRoot(repoRoot, parseRootArg(process.argv.slice(2)));
  const result = checkRubricCorpus(root, repoRoot);

  for (const error of result.errors) {
    process.stdout.write(`${error}\n`);
  }
  process.stdout.write(
    result.ok ? "check-rubric-citations: OK — all citations resolve, all files indexed\n" : ""
  );
  process.exitCode = result.ok ? 0 : 1;
}

const isMainModule = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main();
}
