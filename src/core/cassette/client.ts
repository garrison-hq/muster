/**
 * `makeCassetteClient` — the three-mode (`record`/`replay`/`live`)
 * decorator over `ChatClient`/`ToolChatClient` (FR-007..011).
 *
 * - The decorator wraps an existing client instance; it never calls
 *   `fetch` itself and introduces no new fetch call site (NFR-004 —
 *   `tests/unit/invariants.test.ts`'s NI-003 `FETCH_ALLOWED` list is
 *   unchanged by this module).
 * - Constructed **per-case**, with explicit `recordSink`/`replaySource`
 *   passed in `opts` — not a stateful flush lifecycle. The decorator never
 *   opens a file handle; cassette file I/O (`writeCassetteCase`/
 *   `readCassetteCase`) is the caller's responsibility.
 * - The ordinal counter (`Map<requestHash, number>`) is scoped to one
 *   decorator instance, which is scoped to one case — this is exactly how
 *   FR-006's "resets per case file" requirement is satisfied: a fresh
 *   `makeCassetteClient` call for the next case gets a fresh, empty map.
 * - `chat` and `chatWithTools` share one counter/map per instance: their
 *   request-hash keys never collide in practice (`CassetteChatRequest`'s
 *   second key is `opts`, `CassetteToolRequest`'s is `tools` — the
 *   canonical-JSON forms differ by construction), and replay lookups also
 *   filter on `kind`, so a `chatWithTools` exchange keeps its own
 *   request-hash keying independent of any `chat` exchange in the same case
 *   (FR-011) even in the hypothetical case of a hash collision.
 * - Return type stays exactly `ChatClient`/`ToolChatClient`-shaped — no
 *   extra lifecycle methods a caller would need to remember to invoke.
 */

import type { ChatClient, ChatMessage } from "../behavioral/types.js";
import { hostnameOf, type ToolChatClient } from "../behavioral/client.js";
import { computeRequestHash } from "./hash.js";
import { CassetteMissError } from "./errors.js";
import type { CassetteExchange, CassetteProvenance } from "./types.js";

/** Record-mode options: pass-through + append (FR-008). */
export interface CassetteRecordOptions {
  mode: "record";
  /** Identifies the case for error messages on a later replay miss. */
  caseId: string;
  /** Mutable — the decorator pushes one entry per call. The caller writes
   *  it to disk (via `writeCassetteCase`) once the case's runs complete. */
  recordSink: CassetteExchange[];
  /**
   * The endpoint identity to stamp into provenance. Only the hostname
   * (via `hostnameOf`, C-004) is ever retained in a recorded exchange —
   * `baseUrl` itself is never copied into `CassetteExchange.provenance`
   * (FR-004: never the full URL).
   */
  endpoint: { model: string; baseUrl: string };
}

/** Replay-mode options: never touches network, miss throws
 *  `CassetteMissError` (FR-009). */
export interface CassetteReplayOptions {
  mode: "replay";
  caseId: string;
  /** The loaded case file's exchanges (from `readCassetteCase`). */
  replaySource: readonly CassetteExchange[];
}

/** Live-mode options: fully inert (FR-010) — the default when no cassette
 *  is configured. */
export interface CassetteLiveOptions {
  mode: "live";
}

export type CassetteClientOptions =
  | CassetteRecordOptions
  | CassetteReplayOptions
  | CassetteLiveOptions;

/** Advance and return the 1-based ordinal for `key` within `counter`
 *  (FR-006). */
function nextOrdinal(counter: Map<string, number>, key: string): number {
  const next = (counter.get(key) ?? 0) + 1;
  counter.set(key, next);
  return next;
}

function findChatExchange(
  source: readonly CassetteExchange[],
  requestHash: string,
  ordinal: number
): Extract<CassetteExchange, { kind: "chat" }> | undefined {
  return source.find(
    (ex): ex is Extract<CassetteExchange, { kind: "chat" }> =>
      ex.kind === "chat" && ex.requestHash === requestHash && ex.ordinal === ordinal
  );
}

function findToolExchange(
  source: readonly CassetteExchange[],
  requestHash: string,
  ordinal: number
): Extract<CassetteExchange, { kind: "chatWithTools" }> | undefined {
  return source.find(
    (ex): ex is Extract<CassetteExchange, { kind: "chatWithTools" }> =>
      ex.kind === "chatWithTools" && ex.requestHash === requestHash && ex.ordinal === ordinal
  );
}

export function makeCassetteClient(inner: ChatClient, opts: CassetteClientOptions): ChatClient;
export function makeCassetteClient(
  inner: ToolChatClient,
  opts: CassetteClientOptions
): ToolChatClient;
export function makeCassetteClient(
  inner: ChatClient | ToolChatClient,
  opts: CassetteClientOptions
): ChatClient | ToolChatClient {
  const hasTools = "chatWithTools" in inner;

  // --- live: fully inert pass-through (FR-010) --------------------------
  if (opts.mode === "live") {
    const live: ChatClient & Partial<ToolChatClient> = {
      chat: (messages, chatOpts) => inner.chat(messages, chatOpts),
    };
    if (hasTools) {
      const toolInner = inner as ToolChatClient;
      live.chatWithTools = (messages, tools) => toolInner.chatWithTools(messages, tools);
    }
    return live;
  }

  // Ordinal counter, scoped to this decorator instance — i.e. to one case
  // (FR-006: resets per case file). Shared across chat/chatWithTools.
  const counter = new Map<string, number>();

  // --- record: pass-through + append (FR-008) ----------------------------
  if (opts.mode === "record") {
    const { recordSink, endpoint } = opts;
    const provenance: CassetteProvenance = {
      model: endpoint.model,
      hostname: hostnameOf(endpoint.baseUrl),
    };

    const recorded: ChatClient & Partial<ToolChatClient> = {
      async chat(
        messages: ChatMessage[],
        chatOpts: { temperature?: number }
      ): Promise<string> {
        // Deep-copy at call time (PR-TESTS-001): the caller's `messages`
        // array is mutable and, per `executeRun`
        // (`src/core/behavioral/runner.ts`), gets a reply pushed onto it
        // immediately after this call returns — i.e. AFTER the reference
        // would otherwise have been stored here. Freezing a copy now (not a
        // reference) is what makes the persisted `CassetteExchange.request`
        // match what was actually sent, not the array's later mutated state.
        const request = { messages: messages.map((m) => ({ ...m })), opts: { ...chatOpts } };
        const started = Date.now();
        const response = await inner.chat(messages, chatOpts);
        const durationMs = Date.now() - started;
        const requestHash = computeRequestHash(request);
        const ordinal = nextOrdinal(counter, requestHash);
        recordSink.push({
          kind: "chat",
          requestHash,
          ordinal,
          request,
          response,
          provenance,
          durationMs,
        });
        return response;
      },
    };
    if (hasTools) {
      const toolInner = inner as ToolChatClient;
      recorded.chatWithTools = async (
        messages: ChatMessage[],
        tools: unknown[]
      ): Promise<unknown> => {
        // Copy at call time — same PR-TESTS-001 rationale as `chat` above,
        // but ONE LEVEL SHALLOWER: `tools: [...tools]` freezes the array
        // shell (immune to the caller push/splice-after-return pattern this
        // fix targets), not each tool object's own fields. Unlike `chat`'s
        // `messages` (flat `ChatMessage` — spread-copied per element), the
        // `tools` element type is opaque (`unknown[]`, see
        // `ToolChatClient.chatWithTools` in `../behavioral/client.ts`), so
        // there is no generic way to clone it deeper here. A caller that
        // mutates `tools[i]`'s own fields in place *after* this call returns
        // can still corrupt the persisted request — no known call site does
        // this today (see PR-FRESH-003).
        const request = { messages: messages.map((m) => ({ ...m })), tools: [...tools] };
        const started = Date.now();
        const response = await toolInner.chatWithTools(messages, tools);
        const durationMs = Date.now() - started;
        const requestHash = computeRequestHash(request);
        const ordinal = nextOrdinal(counter, requestHash);
        recordSink.push({
          kind: "chatWithTools",
          requestHash,
          ordinal,
          request,
          response,
          provenance,
          durationMs,
        });
        return response;
      };
    }
    return recorded;
  }

  // --- replay: never touches network, miss throws (FR-009) --------------
  const { caseId, replaySource } = opts;

  const replayed: ChatClient & Partial<ToolChatClient> = {
    async chat(
      messages: ChatMessage[],
      chatOpts: { temperature?: number }
    ): Promise<string> {
      const request = { messages, opts: chatOpts };
      const requestHash = computeRequestHash(request);
      const ordinal = nextOrdinal(counter, requestHash);
      const hit = findChatExchange(replaySource, requestHash, ordinal);
      if (hit === undefined) {
        throw new CassetteMissError(caseId, requestHash, ordinal, "chat");
      }
      return hit.response;
    },
  };
  if (hasTools) {
    replayed.chatWithTools = async (
      messages: ChatMessage[],
      tools: unknown[]
    ): Promise<unknown> => {
      const request = { messages, tools };
      const requestHash = computeRequestHash(request);
      const ordinal = nextOrdinal(counter, requestHash);
      const hit = findToolExchange(replaySource, requestHash, ordinal);
      if (hit === undefined) {
        throw new CassetteMissError(caseId, requestHash, ordinal, "chatWithTools");
      }
      return hit.response;
    };
  }
  return replayed;
}
