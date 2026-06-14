/**
 * Invariant guards (FR-005) — Node-implemented codifications of the parent
 * mission's acceptance-matrix negative invariants
 * (kitty-specs/cts1-conformance-harness-01KTS86B/acceptance-matrix.json):
 *
 *   - NI-001: no API keys / credentials committed anywhere in the repository.
 *   - NI-002: no file under src/core/ imports from src/adapters/ (C-004,
 *     spec-agnostic core).
 *   - NI-003: zero network access in tests — call-shaped `fetch` tokens occur
 *     only in src/core/behavioral/client.ts.
 *
 * Why Node and not grep (mission-review RISK-3): the source files cite the
 * spec with `§` section characters. GNU grep classifies such files as binary
 * and *silently suppresses matches* unless `-a` is passed, so a grep-based
 * guard can report "confirmed absent" while the pattern is actually present.
 * Reading files as UTF-8 strings in Node and matching with RegExp has no such
 * binary-classification failure mode, and runs inside every `pnpm test`
 * instead of being a manual verification step.
 *
 * Walking strategy (plan decision R3): recursive `readdirSync` with an
 * exclusion set — no `git ls-files` subprocess (subprocesses in tests add
 * flake surface). Symlinks are never followed (`.worktrees` lane workspaces
 * may reappear during parallel execution).
 *
 * Performance budget (NFR-002): all three guards combined complete in under
 * two seconds; the scan work runs once at module load and is timed.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/** Repo root resolved from this file's location — never from cwd. */
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

/** Directories never entered, in any guard. */
const BASE_EXCLUDES = new Set([
  "node_modules",
  ".git",
  "dist",
  ".worktrees",
  ".kittify",
]);

/**
 * Recursively collect file paths under `dir`. Entries whose *name* is in the
 * exclusion set are skipped entirely; symlinks are never followed (neither
 * symlinked directories nor symlinked files are visited).
 */
function walk(dir: string, opts: { exclude: ReadonlySet<string> }): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (opts.exclude.has(entry.name)) continue;
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full, opts));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

/** Repo-relative path with forward slashes, for stable assertion messages. */
function rel(file: string): string {
  return relative(repoRoot, file).split(sep).join("/");
}

// ---------------------------------------------------------------------------
// All scan work happens once, here, so a single timing measurement covers the
// three guards combined (NFR-002: < 2000 ms).
// ---------------------------------------------------------------------------

const startMs = performance.now();

// --- NI-001 scan: secret patterns across the whole repo ---------------------
// `kitty-specs/` is additionally excluded: historical planning text
// legitimately *names* the secret patterns when describing the guards.
const secretPatterns: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "nvapi key", re: /nvapi-[A-Za-z0-9]{8}/ },
  { name: "sk- key", re: /\bsk-[A-Za-z0-9_-]{20}/ },
];

/** Location of a hit: repo-relative file + character index. NEVER the text. */
const secretHits: Array<{ file: string; index: number; pattern: string }> = [];
{
  const exclude = new Set([...BASE_EXCLUDES, "kitty-specs"]);
  for (const file of walk(repoRoot, { exclude })) {
    const content = readFileSync(file, "utf8");
    for (const { name, re } of secretPatterns) {
      const match = re.exec(content);
      if (match !== null) {
        // Leak-safety: report file + index + pattern name only — a failing
        // guard must not itself become the leak.
        secretHits.push({ file: rel(file), index: match.index, pattern: name });
      }
    }
  }
}

// --- NI-002 scan: src/core/ never imports adapters ---------------------------
const coreImportViolations: Array<{ file: string; line: number }> = [];
{
  const coreFiles = walk(join(repoRoot, "src", "core"), {
    exclude: BASE_EXCLUDES,
  }).filter((f) => f.endsWith(".ts"));
  for (const file of coreFiles) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      // Import-statement heuristic (not comments): lines starting with
      // `import` or containing a `from "..."` / `from '...'` clause.
      const trimmed = line.trimStart();
      const isImportLine =
        trimmed.startsWith("import") ||
        line.includes('from "') ||
        line.includes("from '");
      if (isImportLine && line.includes("adapters")) {
        coreImportViolations.push({ file: rel(file), line: i + 1 });
      }
    });
  }
}

// --- NI-003 scan: call-shaped fetch only in the behavioral client -----------
// The needle is built by concatenation so this file's own source never
// contains the literal call-shaped token it scans for.
const FETCH_CALL = "fetch" + "(";
// Sanctioned network surfaces. Each entry is a deliberate, auditable place where
// the codebase reaches the network. Adding one is an architectural decision, not
// a convenience: src/core/behavioral/client.ts is the OpenAI-compatible chat
// client; src/adapters/a2a/transport.ts is the A2A adapter's JSON-RPC/HTTP client
// (a real A2A endpoint is a distinct protocol from the chat model — see the A2A
// mission research D-02). The "guard the guard" tests below assert each one still
// actually contains a call-shaped fetch, so a stale allowlist entry fails loudly.
const FETCH_ALLOWED = [
  "src/core/behavioral/client.ts",
  "src/adapters/a2a/transport.ts",
];

const fetchViolations: Array<{ file: string; index: number }> = [];
{
  const tsFiles = [
    ...walk(join(repoRoot, "src"), { exclude: BASE_EXCLUDES }),
    ...walk(join(repoRoot, "tests"), { exclude: BASE_EXCLUDES }),
  ].filter((f) => f.endsWith(".ts"));
  for (const file of tsFiles) {
    const relFile = rel(file);
    if (FETCH_ALLOWED.includes(relFile)) continue;
    const content = readFileSync(file, "utf8");
    const index = content.indexOf(FETCH_CALL);
    if (index !== -1) {
      fetchViolations.push({ file: relFile, index });
    }
  }
}

const elapsedMs = performance.now() - startMs;

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

describe("NI-001 no committed secrets", () => {
  it("finds no secret-pattern matches in any tracked file", () => {
    // On failure the message names file + index + pattern name only; the
    // matched text is deliberately never captured into the report.
    const locations = secretHits.map(
      (h) => `${h.file} @ index ${h.index} (${h.pattern})`
    );
    expect(locations, "secret-shaped content at (location only)").toEqual([]);
  });
});

describe("NI-002 / C-004 core never imports adapters", () => {
  it("no src/core/**/*.ts import statement references adapters", () => {
    // Widens the single-file gate in tests/unit/pipeline.test.ts to every
    // core module.
    const locations = coreImportViolations.map((v) => `${v.file}:${v.line}`);
    expect(locations, "core files importing adapters").toEqual([]);
  });

  it("actually scanned the core modules", () => {
    // Guard the guard: an empty scan set would vacuously pass.
    const coreFiles = walk(join(repoRoot, "src", "core"), {
      exclude: BASE_EXCLUDES,
    }).filter((f) => f.endsWith(".ts"));
    expect(coreFiles.length).toBeGreaterThan(0);
  });
});

describe("NI-003 fetch isolation", () => {
  it(`call-shaped fetch occurs only in the sanctioned surfaces`, () => {
    // Note: test stubs install fakes via vi.stubGlobal("fetch", ...) — the
    // quoted-name form does not contain the call-shaped token scanned for
    // here (verified: tests/behavioral/runner.test.ts stubs survive this
    // guard), so stub setups are naturally exempt without an allowlist.
    const locations = fetchViolations.map((v) => `${v.file} @ index ${v.index}`);
    expect(locations, "files containing a direct fetch call").toEqual([]);
  });

  it("every allowed network surface still exists and uses fetch directly", () => {
    // Guard the guard: if a sanctioned module moves or stops using fetch, the
    // allowlist must move with it — a stale entry must fail loudly rather than
    // silently widening the guard.
    for (const allowed of FETCH_ALLOWED) {
      const content = readFileSync(join(repoRoot, allowed), "utf8");
      expect(content.includes(FETCH_CALL), `${allowed} must contain a call-shaped fetch`).toBe(true);
    }
  });
});

describe("NFR-002 guard performance", () => {
  it("all three guards combined complete in under 2 seconds", () => {
    expect(elapsedMs).toBeLessThan(2000);
  });
});
