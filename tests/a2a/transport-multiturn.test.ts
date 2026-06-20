/**
 * Unit tests for multi-turn A2A transport (WP01).
 *
 * Tests offline with mocked fetch — no live endpoint required.
 * Covers:
 *   T001 — buildSendRequest: turn-1 body (no contextId/taskId), turn-2 body (with contextId)
 *   T002 — ConversationHandle threading across turns
 *   T003 — sendMessage: auth header, timeout (AbortSignal)
 *   T004 — extractReply: Message result, Task result (status.message), Task result (artifacts)
 *   T005 — error handling: timeout, non-2xx, JSON-RPC error, empty reply, no-token leak
 *   Regression: invokeSkill single-turn body unchanged
 *
 * Citation: A2A Protocol Specification v0.3.0 §6.4 (Message), §6.5.1 (TextPart),
 *   §7.1.1 (MessageSendParams); muster rubric FR-001 (multi-turn), FR-010 (errored = failed),
 *   NFR-002 (token never logged/stored).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import {
  buildSendRequest,
  sendMessage,
  extractReply,
} from "../../src/adapters/a2a/transport.js";
import type { ConversationHandle } from "../../src/adapters/a2a/transport.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RESPONSES_DIR = resolvePath("tests/fixtures/a2a/responses");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolvePath(RESPONSES_DIR, name), "utf-8"));
}

const messageResultFixture = loadFixture("message-result.json") as {
  result: unknown;
};
const taskResultFixture = loadFixture("task-result.json") as { result: unknown };
const taskArtifactsFixture = loadFixture("task-artifacts-result.json") as {
  result: unknown;
};
const jsonrpcErrorFixture = loadFixture("jsonrpc-error.json") as {
  error: { code: number; message: string };
};

// ---------------------------------------------------------------------------
// T001 — buildSendRequest: wire body
// ---------------------------------------------------------------------------

describe("buildSendRequest", () => {
  it("turn-1: omits contextId and taskId when handle is empty", () => {
    const handle: ConversationHandle = {};
    const req = buildSendRequest("Hello agent", handle, 1);

    expect(req.jsonrpc).toBe("2.0");
    expect(req.method).toBe("message/send");
    const msg = req.params.message as Record<string, unknown>;
    expect(msg["kind"]).toBe("message");
    expect(msg["role"]).toBe("user");
    expect(Array.isArray(msg["parts"])).toBe(true);
    const parts = msg["parts"] as Array<{ kind: string; text: string }>;
    expect(parts[0]?.kind).toBe("text");
    expect(parts[0]?.text).toBe("Hello agent");
    // First turn: contextId and taskId must NOT be present
    expect(msg).not.toHaveProperty("contextId");
    expect(msg).not.toHaveProperty("taskId");
  });

  it("turn-2: includes contextId when handle carries it", () => {
    const handle: ConversationHandle = { contextId: "ctx-abc123" };
    const req = buildSendRequest("Second turn", handle, 2);

    const msg = req.params.message as Record<string, unknown>;
    expect(msg["contextId"]).toBe("ctx-abc123");
    expect(msg).not.toHaveProperty("taskId");
  });

  it("turn-2: includes both contextId and taskId when handle carries both", () => {
    const handle: ConversationHandle = {
      contextId: "ctx-abc123",
      taskId: "task-xyz789",
    };
    const req = buildSendRequest("Third turn", handle, 3);

    const msg = req.params.message as Record<string, unknown>;
    expect(msg["contextId"]).toBe("ctx-abc123");
    expect(msg["taskId"]).toBe("task-xyz789");
  });

  it("messageId is unique per call (different idSeq values)", () => {
    const handle: ConversationHandle = {};
    const req1 = buildSendRequest("turn 1", handle, 1);
    const req2 = buildSendRequest("turn 2", handle, 2);

    const msg1 = req1.params.message as Record<string, unknown>;
    const msg2 = req2.params.message as Record<string, unknown>;
    expect(msg1["messageId"]).not.toBe(msg2["messageId"]);
  });

  it("JSON-RPC id is present and numeric or string", () => {
    const req = buildSendRequest("test", {}, 1);
    expect(req.id).toBeDefined();
    const idType = typeof req.id;
    expect(idType === "number" || idType === "string").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T004 — extractReply: pure extraction from response result objects
// ---------------------------------------------------------------------------

describe("extractReply", () => {
  it("Message result: joins text parts into reply string", () => {
    const result = extractReply(messageResultFixture.result);
    expect(result.reply).toBe("Hello from the agent! This is a multi-part reply.");
    expect(result.contextId).toBe("ctx-abc123");
    expect(result.taskId).toBeUndefined();
  });

  it("Task result (status.message): extracts text from status.message.parts", () => {
    const result = extractReply(taskResultFixture.result);
    expect(result.reply).toBe("Task completed successfully.");
    expect(result.contextId).toBe("ctx-abc123");
    expect(result.taskId).toBe("task-xyz789");
  });

  it("Task result (artifacts): extracts text from artifacts when status.message absent", () => {
    const result = extractReply(taskArtifactsFixture.result);
    expect(result.reply).toBe("Artifact part one. Artifact part two.");
    expect(result.contextId).toBe("ctx-def456");
    expect(result.taskId).toBe("task-art999");
  });

  it("returns empty reply sentinel when result is null", () => {
    const result = extractReply(null);
    expect(result.reply).toBe("");
  });

  it("returns empty reply sentinel when result shape is unknown", () => {
    const result = extractReply({ kind: "unknown", foo: "bar" });
    expect(result.reply).toBe("");
  });

  it("Task result: uses result.id as taskId when result.taskId absent", () => {
    const taskWithIdOnly = {
      kind: "task",
      id: "task-fallback-id",
      contextId: "ctx-fallback",
      status: {
        state: "completed",
        message: {
          kind: "message",
          role: "agent",
          parts: [{ kind: "text", text: "Reply via id fallback." }],
        },
      },
    };
    const result = extractReply(taskWithIdOnly);
    expect(result.taskId).toBe("task-fallback-id");
    expect(result.reply).toBe("Reply via id fallback.");
  });
});

// ---------------------------------------------------------------------------
// T003 / T005 — sendMessage with mocked fetch
// ---------------------------------------------------------------------------

describe("sendMessage", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockFetch(responseBody: unknown, status = 200): void {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(JSON.stringify(responseBody)),
    } as Response);
  }

  it("T003: sends POST with Content-Type: application/json", async () => {
    mockFetch(messageResultFixture);

    await sendMessage("http://agent.test", "Hello", {}, { idSeq: 1 });

    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(call?.[0]).toBe("http://agent.test");
    const init = call?.[1] as RequestInit;
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers?.["Content-Type"]).toBe("application/json");
  });

  it("T003: adds Authorization header when token is provided", async () => {
    mockFetch(messageResultFixture);

    await sendMessage("http://agent.test", "Hello", {}, {
      token: "secret-bearer",
      idSeq: 1,
    });

    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    const init = call?.[1] as RequestInit;
    const headers = init?.headers as Record<string, string>;
    expect(headers?.["Authorization"]).toBe("Bearer secret-bearer");
  });

  it("T003: does NOT add Authorization header when token is null", async () => {
    mockFetch(messageResultFixture);

    await sendMessage("http://agent.test", "Hello", {}, {
      token: null,
      idSeq: 1,
    });

    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    const init = call?.[1] as RequestInit;
    const headers = init?.headers as Record<string, string>;
    expect(headers?.["Authorization"]).toBeUndefined();
  });

  it("T003: returns reply and updated handle on Message result", async () => {
    mockFetch(messageResultFixture);

    const { reply, handle } = await sendMessage(
      "http://agent.test",
      "Hello",
      {},
      { idSeq: 1 }
    );

    expect(reply).toBe("Hello from the agent! This is a multi-part reply.");
    expect(handle.contextId).toBe("ctx-abc123");
  });

  it("T002: handle from turn-1 is threaded into turn-2 request body", async () => {
    // Use a single mock that returns the same fixture for all calls
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(messageResultFixture)),
    } as Response);

    // Turn 1
    const { handle: handle1 } = await sendMessage(
      "http://agent.test",
      "Turn one",
      {},
      { idSeq: 1 }
    );
    expect(handle1.contextId).toBe("ctx-abc123");

    // Turn 2 — use updated handle
    await sendMessage("http://agent.test", "Turn two", handle1, { idSeq: 2 });

    const secondCall = vi.mocked(globalThis.fetch).mock.calls[1];
    const init = secondCall?.[1] as RequestInit;
    const body = JSON.parse(init?.body as string) as {
      params: { message: Record<string, unknown> };
    };
    expect(body.params.message["contextId"]).toBe("ctx-abc123");
  });

  it("T002: turn-1 request body omits contextId (threading invariant)", async () => {
    mockFetch(messageResultFixture);

    await sendMessage("http://agent.test", "Turn one", {}, { idSeq: 1 });

    const firstCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const init = firstCall?.[1] as RequestInit;
    const body = JSON.parse(init?.body as string) as {
      params: { message: Record<string, unknown> };
    };
    expect(body.params.message).not.toHaveProperty("contextId");
    expect(body.params.message).not.toHaveProperty("taskId");
  });

  // ---------------------------------------------------------------------------
  // T005 — Error handling
  // ---------------------------------------------------------------------------

  it("T005: throws on non-2xx HTTP response", async () => {
    mockFetch({ error: "bad request" }, 400);

    await expect(
      sendMessage("http://agent.test", "Hello", {}, { idSeq: 1 })
    ).rejects.toThrow(/HTTP 400/);
  });

  it("T005: throws on 500 with host in error, not token", async () => {
    mockFetch({}, 500);

    const token = "super-secret-token";
    await expect(
      sendMessage("http://agent.test", "Hello", {}, {
        token,
        idSeq: 1,
      })
    ).rejects.toThrow(/agent\.test/);
  });

  it("T005: token does not appear in non-2xx error string", async () => {
    mockFetch({}, 401);

    const token = "super-secret-token-abc";
    let errorMsg = "";
    try {
      await sendMessage("http://agent.test", "Hello", {}, {
        token,
        idSeq: 1,
      });
    } catch (err) {
      errorMsg = String(err);
    }

    expect(errorMsg).not.toContain(token);
    expect(errorMsg).toContain("401");
  });

  it("T005: throws on JSON-RPC error object in response body", async () => {
    mockFetch(jsonrpcErrorFixture);

    await expect(
      sendMessage("http://agent.test", "Hello", {}, { idSeq: 1 })
    ).rejects.toThrow(/JSON-RPC error/i);
  });

  it("T005: JSON-RPC error message includes the agent error message (safe to surface)", async () => {
    mockFetch(jsonrpcErrorFixture);

    await expect(
      sendMessage("http://agent.test", "Hello", {}, { idSeq: 1 })
    ).rejects.toThrow(/Internal agent error/);
  });

  it("T005: throws on empty/unextractable reply", async () => {
    const emptyReplyBody = {
      jsonrpc: "2.0",
      id: 1,
      result: { kind: "unknown" },
    };
    mockFetch(emptyReplyBody);

    await expect(
      sendMessage("http://agent.test", "Hello", {}, { idSeq: 1 })
    ).rejects.toThrow(/empty reply/i);
  });

  it("T005: timeout causes a thrown error (AbortError → failed run FR-010)", async () => {
    // Simulate an AbortError (as thrown by AbortSignal.timeout)
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    globalThis.fetch = vi.fn().mockRejectedValue(abortError);

    await expect(
      sendMessage("http://agent.test", "Hello", {}, {
        timeoutMs: 1,
        idSeq: 1,
      })
    ).rejects.toThrow(/timeout-or-network/i);
  });

  it("T005: network error causes a thrown error (failed run FR-010)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      sendMessage("http://agent.test", "Hello", {}, { idSeq: 1 })
    ).rejects.toThrow(/timeout-or-network/i);
  });

  it("T005: token does not appear in timeout error string", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    globalThis.fetch = vi.fn().mockRejectedValue(abortError);

    const token = "must-not-leak-token-xyz";
    let errorMsg = "";
    try {
      await sendMessage("http://agent.test", "Hello", {}, {
        token,
        timeoutMs: 1,
        idSeq: 1,
      });
    } catch (err) {
      errorMsg = String(err);
    }

    expect(errorMsg).not.toContain(token);
  });

  it("Task result: sendMessage returns taskId in updated handle", async () => {
    mockFetch(taskResultFixture);

    const { reply, handle } = await sendMessage(
      "http://agent.test",
      "Do task",
      {},
      { idSeq: 1 }
    );

    expect(reply).toBe("Task completed successfully.");
    expect(handle.contextId).toBe("ctx-abc123");
    expect(handle.taskId).toBe("task-xyz789");
  });
});

// ---------------------------------------------------------------------------
// Regression: invokeSkill single-turn body unchanged
// ---------------------------------------------------------------------------

describe("regression: invokeSkill body is unchanged", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("invokeSkill sends the legacy { skill, message } params shape", async () => {
    // The existing invokeSkill must keep its non-conformant params shape
    const { invokeSkill } = await import(
      "../../src/adapters/a2a/transport.js"
    );

    const successBody = {
      jsonrpc: "2.0",
      id: 1,
      result: { response: "pong" },
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(successBody)),
    } as Response);

    await invokeSkill("http://agent.test", "echo", "ping");

    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    const init = call?.[1] as RequestInit;
    const body = JSON.parse(init?.body as string) as {
      method: string;
      params: Record<string, unknown>;
    };

    // Legacy shape: params must have skill + message (NOT a Message object)
    expect(body.method).toBe("message/send");
    expect(body.params["skill"]).toBe("echo");
    expect(body.params["message"]).toBe("ping");
    // Must NOT have a conformant message object with parts
    expect(body.params["message"]).not.toHaveProperty("parts");
  });
});
