/**
 * Scenario 16 (spec.md, "Decorator coverage") / FR-007 / FR-011: a
 * `ToolChatClient` (not routed through any CLI command in this mission)
 * decorated by `makeCassetteClient` in `record` mode, then replayed by a
 * second decorator instance constructed in `replay` mode after the
 * resulting cassette file is written to disk and reloaded — zero network
 * I/O on replay, own request-hash keying independent of any `chat`
 * exchange in the same case.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeCassetteClient } from "../../src/core/cassette/client.js";
import { writeCassetteCase, readCassetteCase } from "../../src/core/cassette/store.js";
import { SCHEMA_VERSION, type CassetteCaseFile, type CassetteExchange } from "../../src/core/cassette/types.js";
import type { ToolChatClient } from "../../src/core/behavioral/client.js";
import type { ChatMessage } from "../../src/core/behavioral/types.js";

/** A fake ToolChatClient tracking chat/chatWithTools invocations separately. */
function fakeToolChatClient(): ToolChatClient & { chatCalls: number; toolCalls: number } {
  return {
    chatCalls: 0,
    toolCalls: 0,
    async chat(this: { chatCalls: number }, _messages: ChatMessage[]): Promise<string> {
      this.chatCalls += 1;
      return `chat-response-${this.chatCalls}`;
    },
    async chatWithTools(this: { toolCalls: number }, _messages: ChatMessage[], _tools: unknown[]): Promise<unknown> {
      this.toolCalls += 1;
      return { choices: [{ message: { content: null, tool_calls: [{ id: `call-${this.toolCalls}` }] } }] };
    },
  };
}

const OPTS = {} as const;

let tmpDirs: string[] = [];
async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cassette-client-tools-test-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
  tmpDirs = [];
});

describe("makeCassetteClient — chatWithTools decorator coverage (Scenario 16, FR-007/011)", () => {
  it("record → write → read → replay round trip returns the exact structured record with zero network I/O", async () => {
    const dir = await makeTmpDir();
    const recorder = fakeToolChatClient();
    const recordSink: CassetteExchange[] = [];
    const recordingClient = makeCassetteClient(recorder, {
      mode: "record",
      caseId: "tools-case",
      recordSink,
      endpoint: { model: "tool-model", baseUrl: "https://api.example.com/v1" },
    });

    const messages: ChatMessage[] = [{ role: "user", content: "call a tool" }];
    const tools: unknown[] = [{ type: "function", function: { name: "lookup" } }];
    const liveResult = await recordingClient.chatWithTools(messages, tools);

    expect(recorder.toolCalls).toBe(1);
    expect(recordSink).toHaveLength(1);
    expect(recordSink[0]?.kind).toBe("chatWithTools");
    expect(recordSink[0]?.response).toEqual(liveResult);

    writeCassetteCase(dir, { schemaVersion: SCHEMA_VERSION, caseId: "tools-case", exchanges: recordSink });

    // Second decorator instance, constructed fresh from the reloaded file,
    // against a DIFFERENT fake client instance — proving replay never
    // reaches into any live client at all.
    const loaded = readCassetteCase(dir, "tools-case") as CassetteCaseFile;
    const untouchedClient = fakeToolChatClient();
    const replayingClient = makeCassetteClient(untouchedClient, {
      mode: "replay",
      caseId: "tools-case",
      replaySource: loaded.exchanges,
    });

    const replayedResult = await replayingClient.chatWithTools(messages, tools);
    expect(replayedResult).toEqual(liveResult);
    expect(untouchedClient.toolCalls).toBe(0);
    expect(untouchedClient.chatCalls).toBe(0);
  });

  it("keys chatWithTools independently of chat: interleaved calls over the same messages never collide, and each replays its own kind correctly", async () => {
    const recorder = fakeToolChatClient();
    const recordSink: CassetteExchange[] = [];
    const recordingClient = makeCassetteClient(recorder, {
      mode: "record",
      caseId: "interleaved-case",
      recordSink,
      endpoint: { model: "m", baseUrl: "https://api.example.com" },
    });

    const messages: ChatMessage[] = [{ role: "user", content: "same content, both call shapes" }];
    const tools: unknown[] = [{ type: "function", function: { name: "lookup" } }];

    const chatResult = await recordingClient.chat(messages, OPTS);
    const toolResult = await recordingClient.chatWithTools(messages, tools);

    expect(recordSink).toHaveLength(2);
    const chatEntry = recordSink.find((e) => e.kind === "chat");
    const toolEntry = recordSink.find((e) => e.kind === "chatWithTools");
    expect(chatEntry).toBeDefined();
    expect(toolEntry).toBeDefined();
    // Own request-hash keying: chat's request has an `opts` key,
    // chatWithTools's has a `tools` key — the canonical-JSON forms differ,
    // so the hashes differ even over "the same messages" (FR-011).
    expect(chatEntry?.requestHash).not.toBe(toolEntry?.requestHash);
    // Each starts its own ordinal at 1 despite sharing one counter map
    // instance, because their hash keys differ.
    expect(chatEntry?.ordinal).toBe(1);
    expect(toolEntry?.ordinal).toBe(1);

    const untouchedClient = fakeToolChatClient();
    const replayingClient = makeCassetteClient(untouchedClient, {
      mode: "replay",
      caseId: "interleaved-case",
      replaySource: recordSink,
    });
    await expect(replayingClient.chat(messages, OPTS)).resolves.toBe(chatResult);
    await expect(replayingClient.chatWithTools(messages, tools)).resolves.toEqual(toolResult);
    expect(untouchedClient.chatCalls).toBe(0);
    expect(untouchedClient.toolCalls).toBe(0);
  });

  it("a chatWithTools replay miss throws CassetteMissError naming kind chatWithTools, distinct from a chat miss", async () => {
    const untouchedClient = fakeToolChatClient();
    const client = makeCassetteClient(untouchedClient, {
      mode: "replay",
      caseId: "empty-case",
      replaySource: [],
    });
    const messages: ChatMessage[] = [{ role: "user", content: "unrecorded" }];
    try {
      await client.chatWithTools(messages, []);
      expect.unreachable();
    } catch (error) {
      expect((error as { kind?: string }).kind).toBe("chatWithTools");
    }
  });
});
