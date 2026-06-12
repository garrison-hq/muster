/**
 * WP06 — CTS manifest loader + runner tests (Appendix F.1/F.2, FR-014).
 *
 * Fixtures are written inline into tmp dirs (no dependence on WP07/08
 * content), and the runner is exercised through a MOCK adapter whose document
 * format is plain YAML — compiling and passing against it proves the
 * `src/core/cts/` surface is spec-agnostic (C-004, Definition of Done).
 *
 * cwd note (WP06 risk): vitest runs from the repo root while every manifest
 * lives in an OS tmp dir, so any cwd-anchored path resolution would fail —
 * the absolute-path assertions below prove resolution anchors to the
 * manifest's directory.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  EffectiveConfig,
  Mode,
  SoulDocument,
  SpecAdapter,
} from "../../src/core/adapter.js";
import { canonicalJson } from "../../src/core/canonical-json.js";
import type { Violation } from "../../src/core/report.js";
import {
  isManifestError,
  loadManifest,
  type CtsCase,
} from "../../src/core/cts/manifest.js";
import { runCts, summarize } from "../../src/core/cts/runner.js";

// ---------------------------------------------------------------------------
// Mock adapter: a fictional "mockspec" whose documents are plain YAML files.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const mockAdapter: SpecAdapter = {
  name: "mockspec",
  specVersion: "0.0.1-mock",

  parse(raw: string, path: string, _mode: Mode): SoulDocument | Violation[] {
    let frontMatter: unknown;
    try {
      frontMatter = parseYaml(raw);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return [{ path: "(document)", message: `mock parse failure: ${reason}`, severity: "error" }];
    }
    if (!isRecord(frontMatter)) {
      return [{ path: "(document)", message: "mock document must be a YAML mapping", severity: "error" }];
    }
    return { path, frontMatter, body: "", kind: "soul" };
  },

  validate(doc: SoulDocument, _mode: Mode): Violation[] {
    if (isRecord(doc.frontMatter) && doc.frontMatter["bad"] === true) {
      return [
        {
          path: "bad",
          message: "bad flag set: mock spec forbids bad documents",
          severity: "error",
          section: "§1",
        },
      ];
    }
    return [];
  },

  async resolve(doc: SoulDocument): Promise<EffectiveConfig | Violation[]> {
    return { ...(doc.frontMatter as Record<string, unknown>) };
  },

  mergeStrategy: {
    scalars: "replace",
    maps: "deep",
    lists: "replace",
    typeMismatch: "replace",
    nullIsValue: true,
  },

  thresholds: {
    maxWords: (verbosity: number) => 10 + verbosity,
    refusalCap: 25,
    words: (s: string) => (s.trim() === "" ? 0 : s.trim().split(/\s+/).length),
  },

  evaluateTriggers(): string | Violation[] | null {
    return null;
  },
};

// ---------------------------------------------------------------------------
// Tmp-dir fixture helpers.
// ---------------------------------------------------------------------------

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "muster-cts-runner-"));
});

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

async function caseDir(): Promise<string> {
  return mkdtemp(join(tmpRoot, "case-"));
}

/** Write a manifest (YAML list of entries) and return its absolute path. */
async function writeManifest(dir: string, entries: unknown[]): Promise<string> {
  const manifestPath = join(dir, "manifest.yaml");
  await writeFile(manifestPath, stringifyYaml(entries), "utf8");
  return manifestPath;
}

/** Load a manifest and assert it validated; returns the cases. */
async function loadCases(manifestPath: string): Promise<CtsCase[]> {
  const result = await loadManifest(manifestPath);
  if (isManifestError(result)) {
    throw new Error(`manifest unexpectedly invalid: ${result.map((v) => v.message).join("; ")}`);
  }
  return result;
}

/** Load a manifest and assert it failed; returns the violations. */
async function loadErrors(manifestPath: string): Promise<Violation[]> {
  const result = await loadManifest(manifestPath);
  expect(isManifestError(result)).toBe(true);
  return result as Violation[];
}

const GOOD_DOC = "name: hello\nvalue: 1\n";
const GOOD_EFFECTIVE = { name: "hello", value: 1 };

// ---------------------------------------------------------------------------
// T021 — manifest loader
// ---------------------------------------------------------------------------

describe("loadManifest (Appendix F.1 + R8 extension)", () => {
  it("Appendix F.1: resolves root and expectation paths relative to the MANIFEST directory, stored absolute (cwd differs from the manifest dir)", async () => {
    const dir = await caseDir();
    await writeFile(join(dir, "Soul.yaml"), GOOD_DOC, "utf8");
    await writeFile(join(dir, "expected.json"), canonicalJson(GOOD_EFFECTIVE), "utf8");
    const manifestPath = await writeManifest(dir, [
      {
        id: "ok",
        root: "Soul.yaml",
        mode: "strict",
        expect_ok: true,
        expect_effective_json: "expected.json",
      },
    ]);

    // The risk note in WP06: resolution must anchor to the manifest dir, not
    // process cwd. vitest's cwd is the repo root, which is NOT `dir`.
    expect(process.cwd()).not.toBe(dir);

    const cases = await loadCases(manifestPath);
    expect(cases).toHaveLength(1);
    expect(cases[0]?.root).toBe(join(dir, "Soul.yaml"));
    expect(isAbsolute(cases[0]?.root ?? "")).toBe(true);
    expect(cases[0]?.expect_effective_json).toBe(join(dir, "expected.json"));
  });

  it("Appendix F.1: duplicate ids → error naming both occurrences", async () => {
    const dir = await caseDir();
    const manifestPath = await writeManifest(dir, [
      { id: "dup", root: "a.yaml", mode: "strict", expect_ok: true },
      { id: "dup", root: "b.yaml", mode: "strict", expect_ok: true },
    ]);
    const errors = await loadErrors(manifestPath);
    const dupError = errors.find((v) => v.message.includes('duplicate case id "dup"'));
    expect(dupError).toBeDefined();
    expect(dupError?.message).toContain("manifest[0]");
    expect(dupError?.message).toContain("manifest[1]");
  });

  it("Appendix F.1: unknown field → error (manifests are ours; strict always)", async () => {
    const dir = await caseDir();
    const manifestPath = await writeManifest(dir, [
      { id: "x", root: "a.yaml", mode: "strict", expect_ok: true, bogus_field: 1 },
    ]);
    const errors = await loadErrors(manifestPath);
    expect(errors.some((v) => v.message.includes('unknown manifest field "bogus_field"'))).toBe(true);
    expect(errors[0]?.path).toBe("manifest[0].bogus_field");
  });

  it("R8: both expect_effective_yaml and expect_effective_json present → \"declare one comparison form\"", async () => {
    const dir = await caseDir();
    const manifestPath = await writeManifest(dir, [
      {
        id: "x",
        root: "a.yaml",
        mode: "strict",
        expect_ok: true,
        expect_effective_yaml: "e.yaml",
        expect_effective_json: "e.json",
      },
    ]);
    const errors = await loadErrors(manifestPath);
    expect(errors.some((v) => v.message.includes("declare one comparison form"))).toBe(true);
  });

  it("Appendix F.1: required-field and mode-enum validation", async () => {
    const dir = await caseDir();
    const manifestPath = await writeManifest(dir, [
      { id: "x", mode: "lenient", expect_ok: "yes" },
    ]);
    const errors = await loadErrors(manifestPath);
    expect(errors.some((v) => v.path === "manifest[0].root")).toBe(true);
    expect(errors.some((v) => v.path === "manifest[0].mode")).toBe(true);
    expect(errors.some((v) => v.path === "manifest[0].expect_ok")).toBe(true);
  });

  it("Appendix F.1: manifest must be a YAML list", async () => {
    const dir = await caseDir();
    const manifestPath = join(dir, "manifest.yaml");
    await writeFile(manifestPath, "not: a list\n", "utf8");
    const errors = await loadErrors(manifestPath);
    expect(errors[0]?.message).toContain("must be a YAML list");
  });
});

// ---------------------------------------------------------------------------
// T022 — runner
// ---------------------------------------------------------------------------

describe("runCts (Appendix F.2, §25.1 comparison; FR-014)", () => {
  it("Appendix F.2: passing case — expect_ok true and expected.json matching canonical-JSON bytes", async () => {
    const dir = await caseDir();
    await writeFile(join(dir, "Soul.yaml"), GOOD_DOC, "utf8");
    await writeFile(join(dir, "expected.json"), canonicalJson(GOOD_EFFECTIVE), "utf8");
    const cases = await loadCases(
      await writeManifest(dir, [
        {
          id: "ok_case",
          root: "Soul.yaml",
          mode: "strict",
          expect_ok: true,
          expect_effective_json: "expected.json",
        },
      ])
    );

    const results = await runCts(mockAdapter, cases);
    expect(results).toHaveLength(1);
    expect(results[0]?.passed).toBe(true);
    expect(results[0]?.mismatches).toEqual([]);
    expect(results[0]?.report.ok).toBe(true);
    expect(results[0]?.report.spec).toBe("0.0.1-mock");
  });

  it("Appendix F.1 expect_errors: path exact + message substring matches; near-miss path → human-readable mismatch", async () => {
    const dir = await caseDir();
    await writeFile(join(dir, "Bad.yaml"), "bad: true\n", "utf8");
    const cases = await loadCases(
      await writeManifest(dir, [
        {
          id: "matched",
          root: "Bad.yaml",
          mode: "strict",
          expect_ok: false,
          expect_errors: [{ path: "bad", message: "bad flag" }],
        },
        {
          id: "near_miss_path",
          root: "Bad.yaml",
          mode: "strict",
          expect_ok: false,
          expect_errors: [{ path: "bad.flag", message: "bad flag" }],
        },
        {
          id: "near_miss_message_case",
          root: "Bad.yaml",
          mode: "strict",
          expect_ok: false,
          expect_errors: [{ path: "bad", message: "BAD FLAG" }],
        },
      ])
    );

    const results = await runCts(mockAdapter, cases);

    expect(results[0]?.passed).toBe(true);

    // Path is exact string equality — "bad.flag" must NOT match "bad".
    expect(results[1]?.passed).toBe(false);
    expect(results[1]?.mismatches[0]).toContain(
      'expected error at bad.flag matching "bad flag" not found'
    );
    // Debuggability: the mismatch names the actual error paths.
    expect(results[1]?.mismatches[0]).toContain("bad");

    // Message matching is a CASE-SENSITIVE substring (contract).
    expect(results[2]?.passed).toBe(false);
    expect(results[2]?.mismatches[0]).toContain(
      'expected error at bad matching "BAD FLAG" not found'
    );
  });

  it("Appendix F.2: byte-difference report includes the first differing offset and ±40-char context from both sides; expected.json is NOT re-canonicalized", async () => {
    const dir = await caseDir();
    await writeFile(join(dir, "Soul.yaml"), GOOD_DOC, "utf8");
    // Deep-equal to the effective config but NOT canonical bytes (extra
    // whitespace). A deep-equal or re-canonicalizing comparison would pass
    // this malformed fixture — byte comparison must fail it.
    await writeFile(join(dir, "expected.json"), '{ "name": "hello", "value": 1 }', "utf8");
    const cases = await loadCases(
      await writeManifest(dir, [
        {
          id: "byte_diff",
          root: "Soul.yaml",
          mode: "strict",
          expect_ok: true,
          expect_effective_json: "expected.json",
        },
      ])
    );

    const results = await runCts(mockAdapter, cases);
    expect(results[0]?.passed).toBe(false);
    const mismatch = results[0]?.mismatches[0] ?? "";
    // First difference: byte 1 is " " in the fixture vs "\"" in canonical form.
    expect(mismatch).toContain("byte offset 1");
    expect(mismatch).toContain("expected context");
    expect(mismatch).toContain("actual context");
    expect(mismatch).toContain(String.raw`{ \"name\"`); // fixture side window
    expect(mismatch).toContain(String.raw`{\"name\"`); // canonical side window
  });

  it("R8 expect_effective_yaml: YAML expectation is canonicalized on BOTH sides, then byte-compared", async () => {
    const dir = await caseDir();
    await writeFile(join(dir, "Soul.yaml"), GOOD_DOC, "utf8");
    // Different key order and YAML formatting; canonicalization makes it equal.
    await writeFile(join(dir, "expected.yaml"), "value: 1\nname: hello\n", "utf8");
    await writeFile(join(dir, "wrong.yaml"), "value: 2\nname: hello\n", "utf8");
    const cases = await loadCases(
      await writeManifest(dir, [
        {
          id: "yaml_equal",
          root: "Soul.yaml",
          mode: "strict",
          expect_ok: true,
          expect_effective_yaml: "expected.yaml",
        },
        {
          id: "yaml_diff",
          root: "Soul.yaml",
          mode: "strict",
          expect_ok: true,
          expect_effective_yaml: "wrong.yaml",
        },
      ])
    );

    const results = await runCts(mockAdapter, cases);
    expect(results[0]?.passed).toBe(true);
    expect(results[1]?.passed).toBe(false);
    expect(results[1]?.mismatches[0]).toMatch(/byte offset \d+/);
  });

  it("Appendix F discrimination (SC-002/SC-006): expect_ok false but the document validates clean → case FAILS", async () => {
    const dir = await caseDir();
    await writeFile(join(dir, "Soul.yaml"), GOOD_DOC, "utf8");
    const cases = await loadCases(
      await writeManifest(dir, [
        { id: "should_fail_but_ok", root: "Soul.yaml", mode: "strict", expect_ok: false },
      ])
    );

    const results = await runCts(mockAdapter, cases);
    expect(results[0]?.passed).toBe(false);
    expect(results[0]?.report.ok).toBe(true);
    expect(results[0]?.mismatches[0]).toContain("Appendix F discrimination");
  });

  it("Appendix F discrimination is symmetric: expect_ok true but the document errors → case FAILS with the actual errors named", async () => {
    const dir = await caseDir();
    await writeFile(join(dir, "Bad.yaml"), "bad: true\n", "utf8");
    const cases = await loadCases(
      await writeManifest(dir, [
        { id: "should_pass_but_errors", root: "Bad.yaml", mode: "strict", expect_ok: true },
      ])
    );

    const results = await runCts(mockAdapter, cases);
    expect(results[0]?.passed).toBe(false);
    expect(results[0]?.mismatches[0]).toContain("expected ok report but got 1 error(s)");
    expect(results[0]?.mismatches[0]).toContain("bad: bad flag set");
  });

  it("Appendix F.2: expect_effective_* on an expect_ok: false case → manifest authoring error mismatch", async () => {
    const dir = await caseDir();
    await writeFile(join(dir, "Bad.yaml"), "bad: true\n", "utf8");
    await writeFile(join(dir, "expected.json"), "{}", "utf8");
    const cases = await loadCases(
      await writeManifest(dir, [
        {
          id: "authoring_error",
          root: "Bad.yaml",
          mode: "strict",
          expect_ok: false,
          expect_effective_json: "expected.json",
        },
      ])
    );

    const results = await runCts(mockAdapter, cases);
    expect(results[0]?.passed).toBe(false);
    expect(
      results[0]?.mismatches.some((m) => m.includes("manifest authoring error"))
    ).toBe(true);
  });

  it("FR-014 case isolation: one case throwing (unreadable root) fails with the exception message and the suite continues", async () => {
    const dir = await caseDir();
    await writeFile(join(dir, "Soul.yaml"), GOOD_DOC, "utf8");
    const cases = await loadCases(
      await writeManifest(dir, [
        { id: "crash", root: "does-not-exist.yaml", mode: "strict", expect_ok: true },
        { id: "survives", root: "Soul.yaml", mode: "strict", expect_ok: true },
      ])
    );

    const results = await runCts(mockAdapter, cases);
    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe("crash");
    expect(results[0]?.passed).toBe(false);
    expect(results[0]?.mismatches[0]).toContain("case execution threw");
    expect(results[0]?.mismatches[0]).toContain("does-not-exist.yaml");
    expect(results[0]?.report.ok).toBe(false);
    expect(results[1]?.id).toBe("survives");
    expect(results[1]?.passed).toBe(true);
  });

  it("FR-014 filter option: runs only the selected subset, in manifest order", async () => {
    const dir = await caseDir();
    await writeFile(join(dir, "Soul.yaml"), GOOD_DOC, "utf8");
    const cases = await loadCases(
      await writeManifest(dir, [
        { id: "a", root: "Soul.yaml", mode: "strict", expect_ok: true },
        { id: "b", root: "Soul.yaml", mode: "strict", expect_ok: true },
        { id: "c", root: "Soul.yaml", mode: "strict", expect_ok: true },
      ])
    );

    const results = await runCts(mockAdapter, cases, {
      filter: (id) => id === "a" || id === "c",
    });
    expect(results.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("summarize aggregates {total, passed, failed}", async () => {
    const dir = await caseDir();
    await writeFile(join(dir, "Soul.yaml"), GOOD_DOC, "utf8");
    const cases = await loadCases(
      await writeManifest(dir, [
        { id: "pass", root: "Soul.yaml", mode: "strict", expect_ok: true },
        { id: "fail", root: "Soul.yaml", mode: "strict", expect_ok: false },
        { id: "crash", root: "missing.yaml", mode: "strict", expect_ok: true },
      ])
    );

    const summary = summarize(await runCts(mockAdapter, cases));
    expect(summary).toEqual({ total: 3, passed: 1, failed: 2 });
  });
});
