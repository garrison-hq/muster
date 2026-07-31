/**
 * Tests for `scripts/check-rubric-citations.mjs` (FR-002).
 *
 * Establishes the `tests/scripts/` convention for standalone repo-maintenance
 * scripts: unit-level assertions against the exported parsing/resolution
 * functions, plus CLI-level (child-process) assertions proving the rejection
 * case actually fires, not just the passing case (this mission's own
 * standing "no vacuous verification command" rule).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkIndexCompleteness,
  checkRubricCorpus,
  extractCitations,
  resolveCitation,
} from "../../scripts/check-rubric-citations.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const scriptPath = join(repoRoot, "scripts/check-rubric-citations.mjs");
const unindexedFixtureRoot = join(repoRoot, "tests/fixtures/unindexed-rubric-dir");

/** Runs the CLI, capturing stdout and exit code regardless of outcome. */
function runCli(args: readonly string[], cwd = repoRoot): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("node", [scriptPath, ...args], { cwd, encoding: "utf8" });
    return { stdout, status: 0 };
  } catch (error) {
    const execError = error as { stdout?: string; status?: number };
    return { stdout: execError.stdout ?? "", status: execError.status ?? 1 };
  }
}

describe("extractCitations", () => {
  it("parses a canonical `symbol` (`file:startLine-endLine`) citation", () => {
    const citations = extractCitations("See `gradeAxis` (`trigger.ts:10-12`) for details.");
    expect(citations).toEqual([
      {
        symbol: "gradeAxis",
        file: "trigger.ts",
        startLine: 10,
        endLine: 12,
        sourceLine: 1,
        raw: "`gradeAxis` (`trigger.ts:10-12`)",
      },
    ]);
  });

  it("parses a single-line citation with no dash range", () => {
    const citations = extractCitations("`foo` (`bar.ts:5`)");
    expect(citations[0]).toMatchObject({ startLine: 5, endLine: 5 });
  });

  it("reports the correct source line number for a citation on line 3", () => {
    const citations = extractCitations("line one\nline two\n`sym` (`f.ts:1`)\n");
    expect(citations[0]?.sourceLine).toBe(3);
  });

  it("does NOT recognize a bare path-less citation (documented blind spot)", () => {
    expect(extractCitations("the test asserts something (line 297-300).")).toEqual([]);
  });

  it("does NOT recognize a bare backtick file:line with no leading symbol group", () => {
    const text = "the block at `tests/cts/skills-suite.test.ts:231-307`: a mock.";
    expect(extractCitations(text)).toEqual([]);
  });
});

describe("resolveCitation", () => {
  let scratchRoot: string;

  beforeEach(() => {
    scratchRoot = mkdtempSync(join(tmpdir(), "check-rubric-citations-"));
    mkdirSync(join(scratchRoot, "src"), { recursive: true });
  });

  afterEach(() => {
    rmSync(scratchRoot, { recursive: true, force: true });
  });

  it("resolves when the symbol literally appears within the cited line range", () => {
    writeFileSync(join(scratchRoot, "src/example.ts"), "line1\nline2\nfunction target() {}\nline4\n");
    const result = resolveCitation(
      { symbol: "target", file: "example.ts", startLine: 3, endLine: 3 },
      scratchRoot
    );
    expect(result).toEqual({ resolved: true, matchedPath: "src/example.ts" });
  });

  it("fails when the symbol is not present in the cited range", () => {
    writeFileSync(join(scratchRoot, "src/example.ts"), "line1\nline2\nline3\nline4\n");
    const result = resolveCitation(
      { symbol: "target", file: "example.ts", startLine: 3, endLine: 3 },
      scratchRoot
    );
    expect(result.resolved).toBe(false);
    expect(result.reason).toContain("not found in lines 3-3");
  });

  it("fails when the cited line range is out of bounds", () => {
    writeFileSync(join(scratchRoot, "src/example.ts"), "line1\nline2\n");
    const result = resolveCitation(
      { symbol: "target", file: "example.ts", startLine: 10, endLine: 12 },
      scratchRoot
    );
    expect(result.resolved).toBe(false);
    expect(result.reason).toContain("out of bounds");
  });

  it("fails when the cited file does not exist anywhere in the tree", () => {
    const result = resolveCitation(
      { symbol: "target", file: "does-not-exist.ts", startLine: 1, endLine: 1 },
      scratchRoot
    );
    expect(result).toEqual({ resolved: false, reason: "file not found: does-not-exist.ts" });
  });

  it("disambiguates between two same-named files by content match, not path order", () => {
    mkdirSync(join(scratchRoot, "src/a"), { recursive: true });
    mkdirSync(join(scratchRoot, "src/b"), { recursive: true });
    writeFileSync(join(scratchRoot, "src/a/types.ts"), "export interface Wrong {}\n");
    writeFileSync(join(scratchRoot, "src/b/types.ts"), "export interface Right {}\n");
    const result = resolveCitation(
      { symbol: "Right", file: "types.ts", startLine: 1, endLine: 1 },
      scratchRoot
    );
    expect(result).toEqual({ resolved: true, matchedPath: "src/b/types.ts" });
  });
});

describe("checkIndexCompleteness", () => {
  it("flags the fixture file with zero index entries pointing at it, by name", () => {
    const result = checkIndexCompleteness(unindexedFixtureRoot);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["orphan.md"]);
  });

  it("does NOT flag the sibling fixture file that IS referenced from index.md", () => {
    const result = checkIndexCompleteness(unindexedFixtureRoot);
    expect(result.missing).not.toContain("indexed.md");
  });

  it("is a no-op (ok, nothing missing) when the root has no index.md at all", () => {
    const scratchRoot = mkdtempSync(join(tmpdir(), "check-rubric-citations-no-index-"));
    try {
      writeFileSync(join(scratchRoot, "lonely.md"), "# Lonely\n");
      expect(checkIndexCompleteness(scratchRoot)).toEqual({ ok: true, missing: [] });
    } finally {
      rmSync(scratchRoot, { recursive: true, force: true });
    }
  });
});

describe("checkRubricCorpus", () => {
  it("reports only the stale citation, not the file with a resolving one, in a mixed corpus", () => {
    const scratchRoot = mkdtempSync(join(tmpdir(), "check-rubric-citations-corpus-"));
    try {
      mkdirSync(join(scratchRoot, "docs"), { recursive: true });
      mkdirSync(join(scratchRoot, "src"), { recursive: true });
      writeFileSync(join(scratchRoot, "src/target.ts"), "line1\nfunction real() {}\n");
      writeFileSync(
        join(scratchRoot, "docs/index.md"),
        "# Index\n\n- `good.md`\n- `bad.md`\n"
      );
      writeFileSync(join(scratchRoot, "docs/good.md"), "See `real` (`target.ts:2`).\n");
      writeFileSync(join(scratchRoot, "docs/bad.md"), "See `ghost` (`target.ts:2`).\n");

      const result = checkRubricCorpus(join(scratchRoot, "docs"), scratchRoot);

      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("docs/bad.md:1");
      expect(result.errors[0]).toContain('"ghost"');
    } finally {
      rmSync(scratchRoot, { recursive: true, force: true });
    }
  });
});

describe("check-rubric-citations CLI", () => {
  it("exits 1 and names the unindexed fixture file (FR-002 index-completeness edge case)", () => {
    const { stdout, status } = runCli(["--root", "tests/fixtures/unindexed-rubric-dir/"]);
    expect(status).toBe(1);
    expect(stdout).toContain("orphan.md");
    expect(stdout).not.toContain("indexed.md has zero index entries");
  });

  it("produces byte-identical stdout across repeated runs and across working directories (C-004)", () => {
    const run1 = runCli([]);
    const run2 = runCli([]);
    const run3 = runCli([], "/");
    expect(run2.stdout).toBe(run1.stdout);
    expect(run3.stdout).toBe(run1.stdout);
    expect(run3.status).toBe(run1.status);
  });

  it("makes zero network calls — no literal fetch( anywhere in the script source", () => {
    const source = execFileSync("node", ["-e", `process.stdout.write(require("node:fs").readFileSync(${JSON.stringify(scriptPath)}, "utf8"))`], {
      encoding: "utf8",
    });
    expect(source.includes("fetch(")).toBe(false);
  });
});
