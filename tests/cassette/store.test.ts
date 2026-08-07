/**
 * FR-003/004/006 — cassette file format, ordinal persistence, and
 * non-empty-target-directory overwrite semantics (plan design decision #2).
 */
import { mkdtemp, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  writeCassetteCase,
  readCassetteCase,
  writeCassetteSuiteIndex,
  readCassetteSuiteIndex,
} from "../../src/core/cassette/store.js";
import { SCHEMA_VERSION, type CassetteCaseFile, type CassetteExchange, type CassetteSuiteIndex } from "../../src/core/cassette/types.js";
import { canonicalJson } from "../../src/core/canonical-json.js";
import { makeCassetteClient } from "../../src/core/cassette/client.js";
import { computeRequestHash } from "../../src/core/cassette/hash.js";

let tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cassette-store-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
  tmpDirs = [];
});

function chatExchange(overrides: Partial<Extract<CassetteExchange, { kind: "chat" }>> = {}): CassetteExchange {
  return {
    kind: "chat",
    requestHash: "a".repeat(64),
    ordinal: 1,
    request: { messages: [{ role: "user", content: "hi" }], opts: {} },
    response: "hello",
    provenance: { model: "test-model", hostname: "api.example.com" },
    ...overrides,
  };
}

describe("writeCassetteCase / readCassetteCase", () => {
  it("round-trips a case file (FR-003: schemaVersion + exchanges preserved)", async () => {
    const dir = await makeTmpDir();
    const caseFile: CassetteCaseFile = {
      schemaVersion: SCHEMA_VERSION,
      caseId: "case-1",
      exchanges: [chatExchange()],
    };
    writeCassetteCase(dir, caseFile);
    const loaded = readCassetteCase(dir, "case-1");
    expect(loaded).toEqual(caseFile);
  });

  it("serializes via canonicalJson (RFC 8785 canonical form, C-003)", async () => {
    const dir = await makeTmpDir();
    const caseFile: CassetteCaseFile = {
      schemaVersion: SCHEMA_VERSION,
      caseId: "case-1",
      exchanges: [chatExchange()],
    };
    writeCassetteCase(dir, caseFile);
    const raw = await readFile(join(dir, "case-1.json"), "utf8");
    expect(raw).toBe(canonicalJson(caseFile));
  });

  it("returns undefined for a case with no file (whole-case miss)", async () => {
    const dir = await makeTmpDir();
    expect(readCassetteCase(dir, "does-not-exist")).toBeUndefined();
  });

  it("creates the target directory if it does not yet exist", async () => {
    const base = await makeTmpDir();
    const dir = join(base, "nested", "cassette-dir");
    const caseFile: CassetteCaseFile = { schemaVersion: SCHEMA_VERSION, caseId: "c", exchanges: [] };
    writeCassetteCase(dir, caseFile);
    expect(readCassetteCase(dir, "c")).toEqual(caseFile);
  });

  it("FR-006: preserves k-of-n identical-request-key exchanges in recorded order, ordinals 1..n each exactly once", async () => {
    const dir = await makeTmpDir();
    const sharedHash = "b".repeat(64);
    const n = 4;
    const exchanges: CassetteExchange[] = Array.from({ length: n }, (_unused, i) =>
      chatExchange({ requestHash: sharedHash, ordinal: i + 1, response: `response-${i + 1}` })
    );
    const caseFile: CassetteCaseFile = { schemaVersion: SCHEMA_VERSION, caseId: "k-of-n-case", exchanges };
    writeCassetteCase(dir, caseFile);

    const loaded = readCassetteCase(dir, "k-of-n-case");
    expect(loaded?.exchanges).toHaveLength(n);
    // Recorded order preserved (not re-shuffled), each ordinal exactly once.
    loaded?.exchanges.forEach((ex, i) => {
      expect(ex.ordinal).toBe(i + 1);
      expect(ex.requestHash).toBe(sharedHash);
      expect(ex.response).toBe(`response-${i + 1}`);
    });
    const ordinalsSeen = loaded?.exchanges.map((ex) => ex.ordinal);
    expect(new Set(ordinalsSeen).size).toBe(n); // each exactly once
  });

  it("NFR-001: two recordings of the same suite are byte-identical modulo the opt-in durationMs field", async () => {
    const dirA = await makeTmpDir();
    const dirB = await makeTmpDir();
    const caseFileA: CassetteCaseFile = {
      schemaVersion: SCHEMA_VERSION,
      caseId: "case-1",
      exchanges: [chatExchange({ durationMs: 12 })],
    };
    const caseFileB: CassetteCaseFile = {
      schemaVersion: SCHEMA_VERSION,
      caseId: "case-1",
      // Same content, different (simulated) measured wall-clock duration —
      // the only field that is allowed to differ (NFR-001's carve-out).
      exchanges: [chatExchange({ durationMs: 987 })],
    };
    writeCassetteCase(dirA, caseFileA);
    writeCassetteCase(dirB, caseFileB);

    const rawA = await readFile(join(dirA, "case-1.json"), "utf8");
    const rawB = await readFile(join(dirB, "case-1.json"), "utf8");
    expect(rawA).not.toBe(rawB); // durationMs really did differ

    const stripDuration = (json: string): unknown => {
      const parsed = JSON.parse(json) as CassetteCaseFile;
      return {
        ...parsed,
        exchanges: parsed.exchanges.map((ex) => {
          const { durationMs: _drop, ...rest } = ex as CassetteExchange & { durationMs?: number };
          return rest;
        }),
      };
    };
    expect(canonicalJson(stripDuration(rawA))).toBe(canonicalJson(stripDuration(rawB)));
  });

  it("never persists a full URL, apiKeyEnv, or key material — the store layer only ever serializes what it is given, and the given provenance shape structurally has no such fields", async () => {
    const dir = await makeTmpDir();
    const caseFile: CassetteCaseFile = {
      schemaVersion: SCHEMA_VERSION,
      caseId: "case-1",
      exchanges: [chatExchange({ provenance: { model: "m", hostname: "api.example.com" } })],
    };
    writeCassetteCase(dir, caseFile);
    const raw = await readFile(join(dir, "case-1.json"), "utf8");
    expect(raw).not.toMatch(/https?:\/\//);
    expect(raw).not.toContain("apiKeyEnv");
  });
});

describe("writeCassetteSuiteIndex / readCassetteSuiteIndex", () => {
  it("round-trips the suite index (design decision #1 schema)", async () => {
    const dir = await makeTmpDir();
    const index: CassetteSuiteIndex = {
      schemaVersion: SCHEMA_VERSION,
      suiteId: "/abs/path/to/manifest.yaml",
      cases: [{ id: "case-1", runs: 3 }],
      recordedAt: "2026-08-07T00:00:00.000Z",
    };
    writeCassetteSuiteIndex(dir, index);
    expect(readCassetteSuiteIndex(dir)).toEqual(index);
  });

  it("returns undefined when the directory has no suite index", async () => {
    const dir = await makeTmpDir();
    expect(readCassetteSuiteIndex(dir)).toBeUndefined();
  });
});

describe("non-empty-target-directory overwrite semantics (plan design decision #2)", () => {
  it("recording into a non-empty directory overwrites only the files this run produces, never deletes untouched files", async () => {
    const dir = await makeTmpDir();

    // Pre-populate: an unrelated file, plus a stale case file from a
    // different suite that this run does not touch.
    await writeFile(join(dir, "unrelated.txt"), "do not touch me", "utf8");
    const staleCaseFile: CassetteCaseFile = {
      schemaVersion: SCHEMA_VERSION,
      caseId: "stale-case-from-other-suite",
      exchanges: [chatExchange({ response: "stale" })],
    };
    writeCassetteCase(dir, staleCaseFile);
    const staleRawBefore = await readFile(join(dir, "stale-case-from-other-suite.json"), "utf8");

    // This run records only "case-1" plus its own suite index.
    const newCaseFile: CassetteCaseFile = {
      schemaVersion: SCHEMA_VERSION,
      caseId: "case-1",
      exchanges: [chatExchange({ response: "fresh" })],
    };
    writeCassetteCase(dir, newCaseFile);
    writeCassetteSuiteIndex(dir, {
      schemaVersion: SCHEMA_VERSION,
      suiteId: "/abs/path/current-suite.yaml",
      cases: [{ id: "case-1", runs: 1 }],
      recordedAt: "2026-08-07T00:00:00.000Z",
    });

    // Unrelated file: untouched.
    expect(await readFile(join(dir, "unrelated.txt"), "utf8")).toBe("do not touch me");
    // Stale case file from a different suite: untouched (byte-identical).
    const staleRawAfter = await readFile(join(dir, "stale-case-from-other-suite.json"), "utf8");
    expect(staleRawAfter).toBe(staleRawBefore);
    expect(readCassetteCase(dir, "stale-case-from-other-suite")).toEqual(staleCaseFile);
    // This run's own file: written correctly.
    expect(readCassetteCase(dir, "case-1")).toEqual(newCaseFile);

    // Directory listing: nothing was deleted, only added-to.
    const entries = (await readdir(dir)).sort();
    expect(entries).toEqual(
      ["_suite-index.json", "case-1.json", "stale-case-from-other-suite.json", "unrelated.txt"].sort()
    );
  });

  it("re-recording the same case overwrites only that case's own file", async () => {
    const dir = await makeTmpDir();
    writeCassetteCase(dir, { schemaVersion: SCHEMA_VERSION, caseId: "case-1", exchanges: [chatExchange({ response: "v1" })] });
    writeCassetteCase(dir, { schemaVersion: SCHEMA_VERSION, caseId: "case-2", exchanges: [chatExchange({ response: "v1" })] });

    writeCassetteCase(dir, { schemaVersion: SCHEMA_VERSION, caseId: "case-1", exchanges: [chatExchange({ response: "v2" })] });

    expect(readCassetteCase(dir, "case-1")?.exchanges[0]?.response).toBe("v2");
    expect(readCassetteCase(dir, "case-2")?.exchanges[0]?.response).toBe("v1");
  });
});

describe("FR-020 credential-shaped endpoint base URL is never persisted (Scenario 3)", () => {
  it("recording against an endpoint whose base URL embeds a credential-shaped fake token persists no API key value, no apiKeyEnv value, and no full endpoint URL — hostname only", async () => {
    const dir = await makeTmpDir();
    const FAKE_TOKEN = "fake-token-abc123";
    const baseUrl = `https://${FAKE_TOKEN}@api.example.com/v1`;

    // Full record-mode path (makeCassetteClient, not a hand-built
    // provenance object) — the actual seam FR-020/C-004 constrain.
    const recordSink: CassetteExchange[] = [];
    const client = makeCassetteClient(
      { chat: async () => "hello there" },
      {
        mode: "record",
        caseId: "credential-case",
        recordSink,
        endpoint: { model: "test-model", baseUrl },
      }
    );
    await client.chat([{ role: "user", content: "hi" }], {});
    expect(recordSink).toHaveLength(1);

    writeCassetteCase(dir, {
      schemaVersion: SCHEMA_VERSION,
      caseId: "credential-case",
      exchanges: recordSink,
    });

    const raw = await readFile(join(dir, "credential-case.json"), "utf8");
    // No API key value.
    expect(raw).not.toContain(FAKE_TOKEN);
    // No apiKeyEnv value — the store's provenance shape has no such field at
    // all (CassetteRecordOptions.endpoint carries no apiKeyEnv), so this
    // also guards against a future field addition leaking it.
    expect(raw).not.toContain("apiKeyEnv");
    // No full endpoint URL (userinfo, path, or scheme+host together).
    expect(raw).not.toContain(baseUrl);
    expect(raw).not.toContain("/v1");
    expect(raw).not.toMatch(/https?:\/\//);
    // Hostname only, extracted via hostnameOf (C-004) — the credential
    // segment (`fake-token-abc123@`) is stripped, the path is dropped.
    const parsed = JSON.parse(raw) as CassetteCaseFile;
    const exchange = parsed.exchanges[0] as Extract<CassetteExchange, { kind: "chat" }>;
    expect(exchange.provenance.hostname).toBe("api.example.com");
  });
});

/** Recursively collect every `.json` file under `dir`. */
async function collectJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsonFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(full);
    }
  }
  return files;
}

/** Case files carry `exchanges`; the suite index (`_suite-index.json`) does
 *  not — this test only cares about the former. */
function isCassetteCaseFile(value: unknown): value is CassetteCaseFile {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { exchanges?: unknown }).exchanges)
  );
}

describe("fixture integrity: committed fixtures/cassettes/**/*.json (PR-TESTS-001)", () => {
  it(
    "computeRequestHash(exchange.request) === exchange.requestHash for every exchange in " +
      "every committed cassette case file — catches request-content corruption (e.g. the " +
      "caller's `messages` array being aliased and mutated after record-mode `chat()` " +
      "returns) directly against what ships on disk",
    async () => {
      const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
      const cassetteRoot = join(repoRoot, "fixtures", "cassettes");
      const jsonFiles = await collectJsonFiles(cassetteRoot);
      const caseFiles: { path: string; parsed: CassetteCaseFile }[] = [];
      for (const path of jsonFiles) {
        const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
        if (isCassetteCaseFile(parsed)) {
          caseFiles.push({ path, parsed });
        }
      }

      // Guard against a silently-empty glob (a vacuously-passing test).
      expect(caseFiles.length).toBeGreaterThan(0);
      // PR-FRESH-007: guard against a non-empty file set whose exchanges are
      // ALL empty — that would still pass the check above and then run the
      // nested loop below zero times, asserting nothing. Guarding on the
      // total exchange count closes that one-level-down vacuity gap.
      const totalExchanges = caseFiles.reduce((n, cf) => n + cf.parsed.exchanges.length, 0);
      expect(totalExchanges).toBeGreaterThan(0);

      for (const { path, parsed } of caseFiles) {
        for (const exchange of parsed.exchanges) {
          expect(
            computeRequestHash(exchange.request),
            `${path}: exchange (kind=${exchange.kind}, ordinal=${exchange.ordinal}) — ` +
              "persisted request.messages does not hash to the persisted requestHash"
          ).toBe(exchange.requestHash);
        }
      }
    }
  );
});
