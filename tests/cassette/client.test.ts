/**
 * FR-007..011 — makeCassetteClient's record/replay/live mode contracts.
 */
import { describe, expect, it, vi } from "vitest";
import { makeCassetteClient } from "../../src/core/cassette/client.js";
import { CassetteMissError } from "../../src/core/cassette/errors.js";
import { computeRequestHash } from "../../src/core/cassette/hash.js";
import type { CassetteExchange } from "../../src/core/cassette/types.js";
import type { ChatClient, ChatMessage } from "../../src/core/behavioral/types.js";
import type { ToolChatClient } from "../../src/core/behavioral/client.js";

/** A fake ChatClient whose `chat` returns a distinct response per call
 *  (call-counter-based), and records how many times it was actually
 *  invoked — so tests can assert "never touched" (replay) vs. "touched
 *  once per call" (record/live). */
function fakeChatClient(): ChatClient & { calls: ChatMessage[][] } {
  const calls: ChatMessage[][] = [];
  return {
    calls,
    async chat(messages: ChatMessage[]): Promise<string> {
      calls.push(messages);
      return `response-${calls.length}`;
    },
  };
}

const OPTS = {} as const;

describe("makeCassetteClient — live mode (FR-010)", () => {
  it("is fully inert: pure pass-through, no recording, no cassette I/O", async () => {
    const inner = fakeChatClient();
    const client = makeCassetteClient(inner, { mode: "live" });
    const result = await client.chat([{ role: "user", content: "hi" }], OPTS);
    expect(result).toBe("response-1");
    expect(inner.calls).toHaveLength(1);
  });

  it("does not expose chatWithTools when the inner client does not have one", () => {
    const inner = fakeChatClient();
    const client = makeCassetteClient(inner, { mode: "live" });
    expect((client as Partial<{ chatWithTools: unknown }>).chatWithTools).toBeUndefined();
  });

  it("passes chatWithTools through unchanged when the inner client is a ToolChatClient (FR-007)", async () => {
    const inner: ToolChatClient & { toolCalls: unknown[][] } = {
      toolCalls: [],
      async chat(messages: ChatMessage[]): Promise<string> {
        return `chat-${messages.length}`;
      },
      async chatWithTools(messages: ChatMessage[], tools: unknown[]): Promise<unknown> {
        inner.toolCalls.push(tools);
        return { toolResult: "unchanged" };
      },
    };
    const client = makeCassetteClient(inner, { mode: "live" });
    const messages: ChatMessage[] = [{ role: "user", content: "hi" }];
    const tools = [{ type: "function", function: { name: "lookup" } }];
    const result = await client.chatWithTools(messages, tools);
    expect(result).toEqual({ toolResult: "unchanged" });
    expect(inner.toolCalls).toEqual([tools]);
  });
});

describe("makeCassetteClient — record mode (FR-008)", () => {
  it("passes every call through unchanged and returns the inner client's exact value", async () => {
    const inner = fakeChatClient();
    const recordSink: CassetteExchange[] = [];
    const client = makeCassetteClient(inner, {
      mode: "record",
      caseId: "case-1",
      recordSink,
      endpoint: { model: "test-model", baseUrl: "https://api.example.com/v1" },
    });
    const messages: ChatMessage[] = [{ role: "user", content: "hi" }];
    const result = await client.chat(messages, OPTS);
    expect(result).toBe("response-1");
    expect(inner.calls).toEqual([messages]);
  });

  it("appends one exchange per call with correct requestHash/ordinal/provenance", async () => {
    const inner = fakeChatClient();
    const recordSink: CassetteExchange[] = [];
    const client = makeCassetteClient(inner, {
      mode: "record",
      caseId: "case-1",
      recordSink,
      endpoint: { model: "test-model", baseUrl: "https://api.example.com/v1" },
    });
    const messages: ChatMessage[] = [{ role: "user", content: "hi" }];
    await client.chat(messages, OPTS);

    expect(recordSink).toHaveLength(1);
    const [exchange] = recordSink;
    expect(exchange?.kind).toBe("chat");
    expect(exchange?.ordinal).toBe(1);
    expect(exchange?.requestHash).toBe(computeRequestHash({ messages, opts: OPTS }));
    expect(exchange?.response).toBe("response-1");
    expect(exchange?.provenance).toEqual({ model: "test-model", hostname: "api.example.com" });
    expect(typeof exchange?.durationMs).toBe("number");
  });

  it("Scenario 3: never persists a full URL, apiKeyEnv, or key material — only hostname (C-004, hostnameOf reuse)", async () => {
    const inner = fakeChatClient();
    const recordSink: CassetteExchange[] = [];
    const client = makeCassetteClient(inner, {
      mode: "record",
      caseId: "case-1",
      recordSink,
      // Credential-shaped fake token embedded in the base URL.
      endpoint: { model: "test-model", baseUrl: "https://fake-token-abc123@api.example.com/v1" },
    });
    await client.chat([{ role: "user", content: "hi" }], OPTS);
    const serialized = JSON.stringify(recordSink);
    expect(serialized).not.toContain("fake-token-abc123");
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(recordSink[0]?.provenance.hostname).toBe("api.example.com");
  });

  it("increments the ordinal per repeated identical request key within the case (FR-006)", async () => {
    const inner = fakeChatClient();
    const recordSink: CassetteExchange[] = [];
    const client = makeCassetteClient(inner, {
      mode: "record",
      caseId: "case-1",
      recordSink,
      endpoint: { model: "test-model", baseUrl: "https://api.example.com/v1" },
    });
    const messages: ChatMessage[] = [{ role: "user", content: "same prompt" }];
    await client.chat(messages, OPTS);
    await client.chat(messages, OPTS);
    await client.chat(messages, OPTS);

    expect(recordSink.map((e) => e.ordinal)).toEqual([1, 2, 3]);
    expect(recordSink.map((e) => e.requestHash)).toEqual([
      recordSink[0]?.requestHash,
      recordSink[0]?.requestHash,
      recordSink[0]?.requestHash,
    ]);
    expect(recordSink.map((e) => e.response)).toEqual(["response-1", "response-2", "response-3"]);
  });

  it(
    "PR-TESTS-001: freezes the persisted request at call time — mutating the caller's " +
      "`messages` array AFTER `chat()` returns (exactly what `executeRun`, " +
      "src/core/behavioral/runner.ts, does by pushing the assistant's reply onto the same " +
      "array) must not corrupt the already-recorded exchange",
    async () => {
      const inner = fakeChatClient();
      const recordSink: CassetteExchange[] = [];
      const client = makeCassetteClient(inner, {
        mode: "record",
        caseId: "case-1",
        recordSink,
        endpoint: { model: "test-model", baseUrl: "https://api.example.com/v1" },
      });
      const messages: ChatMessage[] = [
        { role: "system", content: "system prompt" },
        { role: "user", content: "hi" },
      ];
      const originalLength = messages.length;
      const originalSnapshot = messages.map((m) => ({ ...m }));

      const result = await client.chat(messages, OPTS);
      expect(result).toBe("response-1");

      // Mimic executeRun's real usage pattern: push the reply onto the SAME
      // array the caller passed in, immediately after the call returns.
      messages.push({ role: "assistant", content: result });

      expect(recordSink).toHaveLength(1);
      const persisted = recordSink[0]?.request.messages;
      expect(persisted).toHaveLength(originalLength);
      expect(persisted).toEqual(originalSnapshot);
      // The persisted request is a copy, not the same array reference.
      expect(persisted).not.toBe(messages);
    }
  );

  it(
    "PR-FRESH-005: freezes the persisted request's `opts` at call time — mutating the caller's " +
      "`opts` object AFTER `chat()` returns (the opts-side counterpart of the `messages` " +
      "mutation exercised above) must not corrupt the already-recorded exchange",
    async () => {
      const inner = fakeChatClient();
      const recordSink: CassetteExchange[] = [];
      const client = makeCassetteClient(inner, {
        mode: "record",
        caseId: "case-1",
        recordSink,
        endpoint: { model: "test-model", baseUrl: "https://api.example.com/v1" },
      });
      const messages: ChatMessage[] = [{ role: "user", content: "hi" }];
      const mutableOpts: { temperature?: number } = { temperature: 0.5 };
      const originalOptsSnapshot = { ...mutableOpts };

      await client.chat(messages, mutableOpts);

      // Mutate the same opts object the caller passed in, immediately after
      // the call returns.
      mutableOpts.temperature = 0.9;

      expect(recordSink).toHaveLength(1);
      const persistedOpts = recordSink[0]?.request.opts;
      expect(persistedOpts).toEqual(originalOptsSnapshot);
      // The persisted opts is a copy, not the same object reference.
      expect(persistedOpts).not.toBe(mutableOpts);
    }
  );

  it(
    "PR-FRESH-004: freezes the persisted request at call time for chatWithTools too — mutating " +
      "the caller's `messages` and `tools` arrays AFTER `chatWithTools()` returns must not " +
      "corrupt the already-recorded exchange (ca5d777 fixed the `chat` and `chatWithTools` " +
      "call sites identically; only `chat` had a regression test until now)",
    async () => {
      const inner: ToolChatClient & { toolCalls: unknown[][] } = {
        toolCalls: [],
        async chat(messages: ChatMessage[]): Promise<string> {
          return `chat-${messages.length}`;
        },
        async chatWithTools(_messages: ChatMessage[], tools: unknown[]): Promise<unknown> {
          inner.toolCalls.push(tools);
          return { toolResult: `response-${inner.toolCalls.length}` };
        },
      };
      const recordSink: CassetteExchange[] = [];
      const client = makeCassetteClient(inner, {
        mode: "record",
        caseId: "case-1",
        recordSink,
        endpoint: { model: "test-model", baseUrl: "https://api.example.com/v1" },
      });
      const messages: ChatMessage[] = [
        { role: "system", content: "system prompt" },
        { role: "user", content: "call a tool" },
      ];
      const tools: unknown[] = [{ type: "function", function: { name: "lookup" } }];
      const originalMessagesLength = messages.length;
      const originalMessagesSnapshot = messages.map((m) => ({ ...m }));
      const originalToolsSnapshot = [...tools];

      const result = await client.chatWithTools(messages, tools);
      expect(result).toEqual({ toolResult: "response-1" });

      // Mimic the same after-return mutation pattern PR-TESTS-001 guards
      // against for `chat`: push onto `messages`, and also mutate `tools`
      // (push a new entry — exactly the pattern the array-shell copy in
      // client.ts's chatWithTools protects against; see PR-FRESH-003).
      messages.push({ role: "assistant", content: "tool call" });
      tools.push({ type: "function", function: { name: "extra" } });

      expect(recordSink).toHaveLength(1);
      const exchange = recordSink[0];
      expect(exchange?.kind).toBe("chatWithTools");
      if (exchange?.kind !== "chatWithTools") {
        throw new Error("expected a chatWithTools exchange");
      }
      const persisted = exchange.request;
      expect(persisted.messages).toHaveLength(originalMessagesLength);
      expect(persisted.messages).toEqual(originalMessagesSnapshot);
      // The persisted request is a copy, not the same array references.
      expect(persisted.messages).not.toBe(messages);
      expect(persisted.tools).toEqual(originalToolsSnapshot);
      expect(persisted.tools).not.toBe(tools);
    }
  );

  it("a new decorator instance (new case) starts the ordinal counter over at 1 (resets per case file)", async () => {
    const innerA = fakeChatClient();
    const sinkA: CassetteExchange[] = [];
    const clientA = makeCassetteClient(innerA, {
      mode: "record",
      caseId: "case-a",
      recordSink: sinkA,
      endpoint: { model: "m", baseUrl: "https://api.example.com" },
    });
    const messages: ChatMessage[] = [{ role: "user", content: "same prompt" }];
    await clientA.chat(messages, OPTS);
    await clientA.chat(messages, OPTS);

    const innerB = fakeChatClient();
    const sinkB: CassetteExchange[] = [];
    const clientB = makeCassetteClient(innerB, {
      mode: "record",
      caseId: "case-b",
      recordSink: sinkB,
      endpoint: { model: "m", baseUrl: "https://api.example.com" },
    });
    await clientB.chat(messages, OPTS);

    expect(sinkA.map((e) => e.ordinal)).toEqual([1, 2]);
    expect(sinkB.map((e) => e.ordinal)).toEqual([1]);
  });
});

describe("makeCassetteClient — replay mode (FR-009)", () => {
  it("performs zero network I/O: the inner client's chat is never invoked", async () => {
    const inner = fakeChatClient();
    const messages: ChatMessage[] = [{ role: "user", content: "hi" }];
    const requestHash = computeRequestHash({ messages, opts: OPTS });
    const replaySource: CassetteExchange[] = [
      {
        kind: "chat",
        requestHash,
        ordinal: 1,
        request: { messages, opts: OPTS },
        response: "recorded-response",
        provenance: { model: "m", hostname: "api.example.com" },
      },
    ];
    const client = makeCassetteClient(inner, { mode: "replay", caseId: "case-1", replaySource });
    const result = await client.chat(messages, OPTS);
    expect(result).toBe("recorded-response");
    expect(inner.calls).toHaveLength(0);
  });

  it("returns exact recorded responses, in recorded order, for a k-of-n (n=3) identical-prompt case (Scenario 7)", async () => {
    const inner = fakeChatClient();
    const messages: ChatMessage[] = [{ role: "user", content: "same prompt" }];
    const requestHash = computeRequestHash({ messages, opts: OPTS });
    const replaySource: CassetteExchange[] = [1, 2, 3].map((ordinal) => ({
      kind: "chat" as const,
      requestHash,
      ordinal,
      request: { messages, opts: OPTS },
      response: `recorded-response-${ordinal}`,
      provenance: { model: "m", hostname: "api.example.com" },
    }));
    const client = makeCassetteClient(inner, { mode: "replay", caseId: "case-1", replaySource });

    const r1 = await client.chat(messages, OPTS);
    const r2 = await client.chat(messages, OPTS);
    const r3 = await client.chat(messages, OPTS);

    expect([r1, r2, r3]).toEqual([
      "recorded-response-1",
      "recorded-response-2",
      "recorded-response-3",
    ]);
    expect(inner.calls).toHaveLength(0);
  });

  it("FR-009: a miss throws CassetteMissError naming the case and the missing (requestHash, ordinal) key", async () => {
    const inner = fakeChatClient();
    const client = makeCassetteClient(inner, { mode: "replay", caseId: "case-xyz", replaySource: [] });
    const messages: ChatMessage[] = [{ role: "user", content: "unrecorded prompt" }];

    await expect(client.chat(messages, OPTS)).rejects.toThrow(CassetteMissError);
    try {
      await client.chat(messages, OPTS);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CassetteMissError);
      const miss = error as CassetteMissError;
      expect(miss.caseId).toBe("case-xyz");
      expect(miss.requestHash).toBe(computeRequestHash({ messages, opts: OPTS }));
      expect(miss.message).toContain("case-xyz");
      expect(miss.message).toContain(miss.requestHash);
    }
    expect(inner.calls).toHaveLength(0);
  });

  it("a 4th call past a recorded 3-of-n case misses (ordinal exhaustion) rather than silently reusing the last response", async () => {
    const inner = fakeChatClient();
    const messages: ChatMessage[] = [{ role: "user", content: "same prompt" }];
    const requestHash = computeRequestHash({ messages, opts: OPTS });
    const replaySource: CassetteExchange[] = [1, 2, 3].map((ordinal) => ({
      kind: "chat" as const,
      requestHash,
      ordinal,
      request: { messages, opts: OPTS },
      response: `recorded-response-${ordinal}`,
      provenance: { model: "m", hostname: "api.example.com" },
    }));
    const client = makeCassetteClient(inner, { mode: "replay", caseId: "case-1", replaySource });
    await client.chat(messages, OPTS);
    await client.chat(messages, OPTS);
    await client.chat(messages, OPTS);
    await expect(client.chat(messages, OPTS)).rejects.toThrow(CassetteMissError);
  });

  it("never calls fetch or any network primitive (spy proof)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const inner = fakeChatClient();
      const messages: ChatMessage[] = [{ role: "user", content: "hi" }];
      const requestHash = computeRequestHash({ messages, opts: OPTS });
      const replaySource: CassetteExchange[] = [
        {
          kind: "chat",
          requestHash,
          ordinal: 1,
          request: { messages, opts: OPTS },
          response: "r",
          provenance: { model: "m", hostname: "h" },
        },
      ];
      const client = makeCassetteClient(inner, { mode: "replay", caseId: "case-1", replaySource });
      await client.chat(messages, OPTS);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
