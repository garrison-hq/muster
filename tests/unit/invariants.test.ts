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
 *   - NI-004 (FR-024/C-006, cassette-core-engine-01KZCWFE): no `Promise.all`
 *     call wraps a `.chat(`/`.chatWithTools(` call site anywhere under
 *     src/adapters/, src/core/behavioral/, or src/crosslayer/ — the
 *     sequential-only model-call execution invariant FR-006's ordinal keying
 *     depends on. See "NI-004 helpers" below for the quote-aware comment
 *     stripper + paren-balanced enclosure walk this guard is built on.
 *
 * Plus a size lint (FR-021) over fixtures/cassettes/ — not a negative
 * invariant, but folded into the same module-load scan/timer for NFR-007.
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
 * Performance budget (NFR-002 parent / NFR-007 this mission): all four
 * guards plus the size lint combined complete in under two seconds; the scan
 * work runs once at module load and is timed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
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
// NI-004 helpers (FR-024/C-006) — quote/template-literal-aware comment
// stripping + paren-balanced enclosure detection, per plan.md's "NI-004
// design" section. Both the stripper (step 1) and the enclosure walk
// (step 3) share ONE quote-tracking rule so they can never drift apart:
// a `"`/`'`/`` ` `` not already inside a string opens that quote state; the
// same character closes it (unless immediately preceded by an unescaped
// `\`, which escapes it); no interpolation-aware (`${...}`) parsing is
// needed — an entire backtick span is treated as opaque, open-to-matching-
// close, exactly like `"`/`'`.
//
// These are exported at module scope (not nested in a describe/it) so
// T029's direct fixture assertions call them without going through the
// filesystem walk, exactly mirroring how NI-002/NI-003's `walk()` and
// `FETCH_ALLOWED` are both used inside their own scan AND asserted against
// directly.
// ---------------------------------------------------------------------------

type QuoteChar = '"' | "'" | "`";

/** True when `ch` is one of the three quote characters this file tracks. */
function isQuoteChar(ch: string | undefined): ch is QuoteChar {
  return ch === '"' || ch === "'" || ch === "`";
}

/**
 * Strip `//` line comments and `/* *\/` block comments from `text`, but only
 * when they occur OUTSIDE a string/template-literal span — a single-pass
 * quote/escape state machine (none / `"` / `'` / `` ` ``) tracks that. A
 * non-quote-aware stripper would misread an in-string `//` (e.g.
 * `"mock://test"`, a `https://...` citation URL) as a comment start and
 * delete real code following it on the line — the false-negative risk this
 * function exists to avoid, symmetric to NI-004's false-positive risk on
 * `memory-utilization/index.ts` / `rule-survival.ts`'s real `// ...
 * Promise.all ...` comments.
 */
function stripComments(text: string): string {
  let out = "";
  let quote: QuoteChar | null = null;
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (quote !== null) {
      out += ch;
      if (ch === "\\") {
        // Escape: copy the next character verbatim too, without
        // re-inspecting it as a potential closing quote.
        if (i + 1 < text.length) {
          out += text[i + 1];
          i += 2;
          continue;
        }
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (isQuoteChar(ch)) {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue; // newline itself (if any) is copied on the next iteration
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 2; // skip the closing "*/" itself
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Walk `text` from `openIndex` (which MUST be the index of a `(`), tracking
 * paren depth AND the same quote state machine `stripComments` uses, and
 * return the index of the matching closing `)` — or -1 if `text` ends before
 * one is found. Depth changes only while quote state is "none": a `(`/`)`
 * inside a string/template-literal argument (e.g. an error message like
 * `"forgot to close ("`) never affects the count. `text` is expected to
 * already be comment-stripped (only string/template state remains to
 * track), matching plan.md step 3.
 */
function findMatchingParenClose(text: string, openIndex: number): number {
  let depth = 0;
  let quote: QuoteChar | null = null;
  let i = openIndex;
  while (i < text.length) {
    const ch = text[i] as string;
    if (quote !== null) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (isQuoteChar(ch)) {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
      i += 1;
      continue;
    }
    i += 1;
  }
  return -1;
}

/** `Promise.all(` built by concatenation, matching NI-003's `FETCH_CALL`
 *  token style (stylistic consistency — not functional necessity, since
 *  NI-004's scan scope structurally excludes this test file). */
const PROMISE_ALL_CALL = "Promise" + "." + "all" + "(";
const CHAT_CALL = ".chat(";
const CHAT_WITH_TOOLS_CALL = ".chatWithTools(";

/**
 * Return the character index of every `Promise.all(...)` span in `content`
 * whose balanced enclosure contains a `.chat(` or `.chatWithTools(` token —
 * an enclosure/"wrapping" check (FR-024's own word), not a same-file or
 * nearby-line co-occurrence check the way NI-002/NI-003 are. Comments are
 * stripped first (quote-aware), then the enclosure walk runs over that
 * already-stripped text (quote-aware again, same shared rule).
 */
function findPromiseAllChatViolations(content: string): number[] {
  const stripped = stripComments(content);
  const violations: number[] = [];
  let searchFrom = 0;
  for (;;) {
    const idx = stripped.indexOf(PROMISE_ALL_CALL, searchFrom);
    if (idx === -1) break;
    const openParenIndex = idx + PROMISE_ALL_CALL.length - 1;
    const closeParenIndex = findMatchingParenClose(stripped, openParenIndex);
    const end = closeParenIndex === -1 ? stripped.length : closeParenIndex;
    const enclosed = stripped.slice(openParenIndex, end);
    if (enclosed.includes(CHAT_CALL) || enclosed.includes(CHAT_WITH_TOOLS_CALL)) {
      violations.push(idx);
    }
    searchFrom = idx + PROMISE_ALL_CALL.length;
  }
  return violations;
}

// ---------------------------------------------------------------------------
// All scan work happens once, here, so a single timing measurement covers
// every guard plus the size lint combined (NFR-002 parent / NFR-007 this
// mission: < 2000 ms).
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

// --- NI-004 scan: no Promise.all wrapping a .chat(/.chatWithTools( site ----
// Scope is DERIVED by directory walk, not a hand-maintained file list — an
// earlier version of this plan enumerated eight specific files and silently
// dropped two real call sites one review round later (plan.md "NI-004
// design"). Walking src/adapters/, src/core/behavioral/, and src/crosslayer/
// wholesale means a new runner/judge module is automatically in-scope the
// moment it lands, with no companion edit to this test ever required.
const ni004ScannedFiles: string[] = [
  ...walk(join(repoRoot, "src", "adapters"), { exclude: BASE_EXCLUDES }),
  ...walk(join(repoRoot, "src", "core", "behavioral"), { exclude: BASE_EXCLUDES }),
  ...walk(join(repoRoot, "src", "crosslayer"), { exclude: BASE_EXCLUDES }),
].filter((f) => f.endsWith(".ts"));

const ni004Violations: Array<{ file: string; index: number }> = [];
for (const file of ni004ScannedFiles) {
  const content = readFileSync(file, "utf8");
  for (const index of findPromiseAllChatViolations(content)) {
    ni004Violations.push({ file: rel(file), index });
  }
}

// --- FR-021 size lint: fixtures/cassettes/ stays under a 2 MiB budget -----
const FIXTURE_CASSETTES_MAX_BYTES = 2 * 1024 * 1024;
let fixtureCassettesTotalBytes = 0;
const fixtureCassettesDir = join(repoRoot, "fixtures", "cassettes");
try {
  for (const file of walk(fixtureCassettesDir, { exclude: BASE_EXCLUDES })) {
    fixtureCassettesTotalBytes += statSync(file).size;
  }
} catch {
  // fixtures/cassettes/ absent — nothing to lint (0 bytes); the "actually
  // scanned" guard-the-guard test below fails loudly if this ever happens
  // instead of the size assertion vacuously passing.
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

describe("NI-004 / FR-024 / C-006 no Promise.all wrapping a chat call site", () => {
  it("no Promise.all(...) enclosure under src/adapters/, src/core/behavioral/, or src/crosslayer/ contains a .chat( or .chatWithTools( token", () => {
    const locations = ni004Violations.map((v) => `${v.file} @ index ${v.index}`);
    expect(locations, "Promise.all(...) spans wrapping a chat call").toEqual([]);
  });

  it("actually scanned a non-trivial file set (guard the guard)", () => {
    // Guard the guard: an empty scan set would vacuously pass. plan.md's
    // "NI-004 design" measured 83 .ts files at db80a42 — assert comfortably
    // below that so the guard doesn't need updating on every new file, while
    // still catching an accidentally-empty walk.
    expect(ni004ScannedFiles.length).toBeGreaterThan(50);
  });

  it("src/crosslayer/manifest-runner.ts's real Promise.all(...) (a plain arr.map(...) shape, no chat call inside) does not false-positive", () => {
    // The one real Promise.all( call site in scan scope that is NOT a
    // violation — plan.md "NI-004 design" names it explicitly as the
    // positive-control check for the enclosure walk.
    const content = readFileSync(
      join(repoRoot, "src", "crosslayer", "manifest-runner.ts"),
      "utf8"
    );
    expect(content).toContain(PROMISE_ALL_CALL); // guard the guard: the site still exists
    expect(findPromiseAllChatViolations(content)).toEqual([]);
  });
});

describe("NI-004 fixture coverage — must-not-false-positive (T029)", () => {
  // Both files contain a "Promise.all" substring inside a comment,
  // documenting the pattern's ABSENCE, near a real .chat( call site — a
  // same-file/co-occurrence scan (NI-002/NI-003's own simpler style) would
  // false-positive on these today. Verified directly here, not merely
  // inferred from the aggregate scan staying empty above.
  it("src/adapters/memory-utilization/index.ts: zero violations", () => {
    const content = readFileSync(
      join(repoRoot, "src", "adapters", "memory-utilization", "index.ts"),
      "utf8"
    );
    expect(content).toContain(PROMISE_ALL_CALL.slice(0, -1)); // "Promise.all" substring present (in a comment)
    expect(findPromiseAllChatViolations(content)).toEqual([]);
  });

  it("src/crosslayer/rule-survival.ts: zero violations", () => {
    const content = readFileSync(join(repoRoot, "src", "crosslayer", "rule-survival.ts"), "utf8");
    expect(content).toContain(PROMISE_ALL_CALL.slice(0, -1)); // "Promise.all" substring present (in a comment)
    expect(findPromiseAllChatViolations(content)).toEqual([]);
  });
});

describe("NI-004 quote-aware helper unit coverage (T029)", () => {
  it("comment stripper leaves real code intact after an in-string '://' — does not misread it as a line comment", () => {
    // Mirrors src/adapters/openclaw-sop/runner.ts's real `baseUrl:
    // "mock://test",` shape. A non-quote-aware stripper reads from the `//`
    // inside the string to end-of-line as a comment and deletes the
    // trailing `Promise.all(x.chat())` — exactly the false-negative risk
    // symmetric to the false-positive risk the fixture-coverage tests above
    // guard against.
    const input = `baseUrl: "mock://test", Promise.all(x.chat())`;
    expect(stripComments(input)).toBe(input); // nothing here IS a comment
  });

  it("paren-balance enclosure walk is not desynced by an unbalanced '(' inside a string argument", () => {
    // The string argument's own "(" (inside "forgot to close (") must not
    // be counted toward paren depth — a non-quote-aware walk would either
    // truncate the enclosure early (false negative) or run past the real
    // close (false positive sweeping in an unrelated later call).
    const input = 'Promise.all(["forgot to close (", x.chat()])';
    const openParenIndex = input.indexOf(PROMISE_ALL_CALL) + PROMISE_ALL_CALL.length - 1;
    expect(findMatchingParenClose(input, openParenIndex)).toBe(input.length - 1);
    expect(findPromiseAllChatViolations(input)).toEqual([0]);
  });
});

describe("FR-021 fixtures/cassettes/ size lint", () => {
  it("total size stays under the 2 MiB budget (D7)", () => {
    expect(fixtureCassettesTotalBytes).toBeLessThan(FIXTURE_CASSETTES_MAX_BYTES);
  });

  it("actually found fixture cassette content to lint (guard the guard)", () => {
    // Guard the guard: an absent/empty fixtures/cassettes/ would let the
    // size assertion above pass vacuously (0 < budget is always true).
    expect(fixtureCassettesTotalBytes).toBeGreaterThan(0);
  });
});

describe("NFR-002 guard performance", () => {
  it("all four guards (NI-001..004) plus the FR-021 size lint combined complete in under 2 seconds (NFR-002 parent / NFR-007 this mission)", () => {
    expect(elapsedMs).toBeLessThan(2000);
  });
});
