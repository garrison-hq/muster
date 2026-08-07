/**
 * SC-006 — cross-boundary public-API smoke test.
 *
 * This file lives in `tests/cassette/`, outside `src/core/`, and imports
 * `makeCassetteClient` (WP03) through the cassette module's public barrel
 * (`src/core/cassette/index.js`, not an internal file like `client.js`) and
 * `resolveExecutionSource` (WP02) from its own module — exactly the way a
 * wave-2 adapter (#100/#101/#102) would consume both without ever reaching
 * into `src/core/`'s internals. The goal is to prove the exported surface is
 * genuinely *usable* end-to-end (record → persist → replay, and a realistic
 * precedence decision), not merely that the two names resolve.
 *
 * Every import below other than `ChatMessage` (a plain data type, not part
 * of what SC-006 asks this test to prove) comes from one of the two public
 * entry points under test.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  makeCassetteClient,
  writeCassetteCase,
  readCassetteCase,
  writeCassetteSuiteIndex,
  readCassetteSuiteIndex,
  computeRequestHash,
  CassetteMissError,
  SCHEMA_VERSION,
  type CassetteExchange,
} from "../../src/core/cassette/index.js";
import { resolveExecutionSource } from "../../src/core/execution-source.js";
import type { ChatClient, ChatMessage } from "../../src/core/behavioral/types.js";

let tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cassette-public-api-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
  tmpDirs = [];
});

/** A fake live ChatClient that counts real invocations, so this test can
 *  prove replay never touches it (the whole point of the cassette). */
function fakeLiveClient(): ChatClient & { calls: number } {
  const state = { calls: 0 };
  return {
    get calls(): number {
      return state.calls;
    },
    async chat(_messages: ChatMessage[]): Promise<string> {
      state.calls += 1;
      return "the live answer";
    },
  };
}

const MESSAGES: ChatMessage[] = [{ role: "user", content: "what is the plan?" }];

describe("SC-006 — public-API cross-boundary smoke test", () => {
  it("resolveExecutionSource, consumed the way a wave-2 caller would, drives a real precedence decision", () => {
    // Branch 1: a replay-configured cassette always wins, regardless of env.
    const withCassette = resolveExecutionSource({
      cassetteReplayConfigured: true,
      env: { MUSTER_ENDPOINT: "https://example.test" },
    });
    expect(withCassette).toEqual({
      configured: true,
      source: "cassette",
      usedDeprecatedAlias: false,
    });

    // Branch 2: no cassette, but MUSTER_ENDPOINT is set — env wins.
    const withEnv = resolveExecutionSource({ env: { MUSTER_ENDPOINT: "https://example.test" } });
    expect(withEnv).toEqual({ configured: true, source: "env", usedDeprecatedAlias: false });

    // Branch 5: nothing configured at all.
    const withNothing = resolveExecutionSource({ env: {} });
    expect(withNothing).toEqual({ configured: false, source: "none", usedDeprecatedAlias: false });
  });

  it("makeCassetteClient (via the barrel) round-trips record -> disk -> replay with zero network I/O on replay", async () => {
    const dir = await makeTmpDir();
    const live = fakeLiveClient();

    // A wave-2 caller would gate this on resolveExecutionSource's verdict;
    // simulate that here to prove the two exports compose naturally.
    const source = resolveExecutionSource({ cassetteReplayConfigured: false, env: {} });
    expect(source.configured).toBe(false);

    // --- record ---------------------------------------------------------
    const recordSink: CassetteExchange[] = [];
    const recorder = makeCassetteClient(live, {
      mode: "record",
      caseId: "public-api-case",
      recordSink,
      endpoint: { model: "test-model", baseUrl: "https://api.example.test/v1" },
    });
    const recordedAnswer = await recorder.chat(MESSAGES, {});
    expect(recordedAnswer).toBe("the live answer");
    expect(live.calls).toBe(1);
    expect(recordSink).toHaveLength(1);

    writeCassetteCase(dir, {
      schemaVersion: SCHEMA_VERSION,
      caseId: "public-api-case",
      exchanges: recordSink,
    });
    writeCassetteSuiteIndex(dir, {
      schemaVersion: SCHEMA_VERSION,
      suiteId: "public-api-suite",
      cases: [{ id: "public-api-case", runs: 1 }],
      recordedAt: new Date().toISOString(),
    });

    // --- replay -----------------------------------------------------------
    const caseFile = readCassetteCase(dir, "public-api-case");
    const suiteIndex = readCassetteSuiteIndex(dir);
    expect(caseFile?.exchanges).toHaveLength(1);
    expect(suiteIndex?.cases).toEqual([{ id: "public-api-case", runs: 1 }]);

    const replayer = makeCassetteClient(live, {
      mode: "replay",
      caseId: "public-api-case",
      replaySource: caseFile?.exchanges ?? [],
    });
    const replayedAnswer = await replayer.chat(MESSAGES, {});
    expect(replayedAnswer).toBe("the live answer");
    // The load-bearing assertion: replay must never call the inner client.
    expect(live.calls).toBe(1);

    // The request hash the decorator computed internally is independently
    // reproducible from the barrel's own computeRequestHash — proving the
    // keying scheme, not just the pass-through, is part of the public
    // surface a consumer can rely on.
    const expectedHash = computeRequestHash({ messages: MESSAGES, opts: {} });
    expect(caseFile?.exchanges[0]?.requestHash).toBe(expectedHash);
  });

  it("a genuine replay miss surfaces as CassetteMissError, imported from the same barrel", async () => {
    const live = fakeLiveClient();
    const replayer = makeCassetteClient(live, {
      mode: "replay",
      caseId: "empty-case",
      replaySource: [],
    });
    await expect(replayer.chat(MESSAGES, {})).rejects.toBeInstanceOf(CassetteMissError);
    expect(live.calls).toBe(0);
  });
});
