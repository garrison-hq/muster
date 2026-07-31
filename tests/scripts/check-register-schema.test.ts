/**
 * Tests for `scripts/check-register-schema.mjs` (FR-003).
 *
 * Mirrors `tests/scripts/check-rubric-citations.test.ts`'s convention: unit
 * assertions against the exported parsing/validation functions, plus
 * CLI-level assertions proving both the passing case (the real, complete
 * 12-entry register) and the rejection case (a synthetic fixture missing a
 * required field) actually fire — exit 0 alone is not sufficient evidence
 * per this mission's own standing lesson about vacuous-looking green checks.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REQUIRED_FIELDS, checkRegisterSchema, parseEntries } from "../../scripts/check-register-schema.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const scriptPath = join(repoRoot, "scripts/check-register-schema.mjs");
const realRegisterPath = join(repoRoot, "docs/rubric/recorded-gaps.md");
const missingFieldFixturePath = join(repoRoot, "tests/fixtures/recorded-gaps-missing-field.md");

function runCli(args: readonly string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("node", [scriptPath, ...args], { cwd: repoRoot, encoding: "utf8" });
    return { stdout, status: 0 };
  } catch (error) {
    const execError = error as { stdout?: string; status?: number };
    return { stdout: execError.stdout ?? "", status: execError.status ?? 1 };
  }
}

describe("REQUIRED_FIELDS", () => {
  it("lists all seven Key-Entities schema fields, including title", () => {
    expect(REQUIRED_FIELDS).toEqual([
      "id",
      "title",
      "evidence",
      "what-was-tried",
      "why-left",
      "closes-when",
      "status",
    ]);
  });
});

describe("parseEntries", () => {
  it("parses one entry's fields from a `### RG-###` block", () => {
    const text = [
      "### RG-001",
      "",
      "- **id**: RG-001",
      "- **title**: Example",
      "- **evidence**: `foo` (`bar.ts:1`)",
      "- **what-was-tried**: nothing",
      "- **why-left**: fixture",
      "- **closes-when**: never",
      "- **status**: tracked-defect",
    ].join("\n");
    const entries = parseEntries(text);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "RG-001",
      fields: {
        id: "RG-001",
        title: "Example",
        evidence: "`foo` (`bar.ts:1`)",
        "what-was-tried": "nothing",
        "why-left": "fixture",
        "closes-when": "never",
        status: "tracked-defect",
      },
    });
  });

  it("parses multiple sibling entries independently", () => {
    const text = "### RG-001\n\n- **id**: RG-001\n\n### RG-002\n\n- **id**: RG-002\n";
    const entries = parseEntries(text);
    expect(entries.map((e) => e.id)).toEqual(["RG-001", "RG-002"]);
  });

  it("returns an empty array when the text has no `### RG-` headings at all", () => {
    expect(parseEntries("# Just a title\n\nSome prose.\n")).toEqual([]);
  });
});

describe("checkRegisterSchema", () => {
  it("exits ok against the real, complete 12-entry register", () => {
    const result = checkRegisterSchema(realRegisterPath, repoRoot);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("has at least 7 entries in the real register (>= 7, not a hardcoded count)", () => {
    const result = checkRegisterSchema(realRegisterPath, repoRoot);
    expect(result.entryCount).toBeGreaterThanOrEqual(7);
  });

  it("contains exactly the 12 entries RG-001 through RG-012", () => {
    const text = readFileSync(realRegisterPath, "utf8");
    const entries = parseEntries(text);
    expect(entries.map((e) => e.id)).toEqual([
      "RG-001", "RG-002", "RG-003", "RG-004", "RG-005", "RG-006",
      "RG-007", "RG-008", "RG-009", "RG-010", "RG-011", "RG-012",
    ]);
  });

  it("fails, naming the specific entry and field, against the missing-field fixture", () => {
    const result = checkRegisterSchema(missingFieldFixturePath, repoRoot);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('RG-001 is missing required field "closes-when"'))).toBe(true);
  });

  it("does not flag a field that IS present on the fixture's own entry", () => {
    const result = checkRegisterSchema(missingFieldFixturePath, repoRoot);
    expect(result.errors.some((e) => e.includes('missing required field "title"'))).toBe(false);
  });
});

describe("check-register-schema CLI", () => {
  it("exits 0 against the real register", () => {
    const { stdout, status } = runCli([realRegisterPath]);
    expect(status).toBe(0);
    expect(stdout).toContain("OK");
  });

  it("exits 1 and names the incomplete entry/field against the fixture", () => {
    const { stdout, status } = runCli([missingFieldFixturePath]);
    expect(status).toBe(1);
    expect(stdout).toContain("RG-001");
    expect(stdout).toContain("closes-when");
  });

  it("exits 1 with a usage message when no register path is given", () => {
    expect(() => execFileSync("node", [scriptPath], { cwd: repoRoot, encoding: "utf8" })).toThrow();
  });
});
