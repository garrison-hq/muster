/**
 * A2A transport client for JSON-RPC 2.0 over HTTP.
 *
 * Implements T013 (env read/skip + discoverCard) and T014 (invokeSkill /
 * probeAuth / fetchJwks).
 *
 * Hard rules (FR-009, FR-010, D-02/D-04):
 * - envEndpoint() returns null when MUSTER_A2A_ENDPOINT is unset → live class skips.
 * - Env is read at call time; the token value is NEVER stored or logged.
 * - A reachable-endpoint error (timeout/malformed/refused) THROWS → caller records a
 *   failed run. Only absent MUSTER_A2A_ENDPOINT produces a skip (FR-010).
 * - Uses the built-in fetch and no new dependencies.
 *
 * This module is a sanctioned network surface: the NI-003 invariant guard
 * (tests/unit/invariants.test.ts) allowlists it alongside the behavioral chat
 * client. A real A2A endpoint is a distinct protocol from the OpenAI-compatible
 * chat model (research D-02), so the A2A adapter owns its own HTTP client. The
 * network access here is intentional and auditable — not hidden.
 *
 * Citation: A2A spec v1.0.0 (protobuf a2a.proto), §8.2 (well-known URI),
 * §8.3.1 (skill interface accuracy), §7 (security schemes).
 */

import type { AgentCard } from "./card.js";
import { parseAgentCard } from "./card.js";
import type { Jwks } from "./signature.js";

// ---------------------------------------------------------------------------
// Timeout helper — read at call time so tests can override MUSTER_A2A_TIMEOUT_MS
// ---------------------------------------------------------------------------

/**
 * Returns the HTTP timeout in milliseconds for each fetch call.
 *
 * Reads MUSTER_A2A_TIMEOUT_MS at call time (not module-load time) so that
 * tests can set the env var after import and it will take effect immediately.
 * Default: 10 000 ms (10 s). A hung endpoint will abort after this duration
 * and the transport caller records a failed run (FR-010).
 */
function timeoutMs(): number {
  return Number(process.env["MUSTER_A2A_TIMEOUT_MS"]) || 10000;
}

// ---------------------------------------------------------------------------
// Env access — read at call time, never stored
// ---------------------------------------------------------------------------

/**
 * Returns the A2A endpoint from MUSTER_A2A_ENDPOINT, or null when unset.
 *
 * Null signals the live class should be SKIPPED (not failed) — FR-009/010.
 * Never logs or retains the value.
 */
export function envEndpoint(): string | null {
  return process.env["MUSTER_A2A_ENDPOINT"] ?? null;
}

/**
 * Returns the A2A bearer token from MUSTER_A2A_TOKEN, or null when unset.
 *
 * Read at call time only. Never stored, never logged.
 */
export function envToken(): string | null {
  return process.env["MUSTER_A2A_TOKEN"] ?? null;
}

// ---------------------------------------------------------------------------
// T013 — discoverCard
// ---------------------------------------------------------------------------

/**
 * Fetch and parse the Agent Card at the well-known URI (A2A §8.2).
 *
 * GETs <endpoint>/.well-known/agent-card.json and parses via parseAgentCard
 * so the returned card carries the correct `discoveredFrom` URL for downstream
 * §8.2 checks.
 *
 * Throws on:
 * - Non-200 HTTP status (failed run, FR-010).
 * - Malformed / non-JSON response (failed run, FR-010).
 * - Network error / timeout (failed run, FR-010).
 *
 * @param endpoint - Base URL of the A2A agent (e.g. "http://localhost:8080").
 */
export async function discoverCard(endpoint: string): Promise<AgentCard> {
  const url = `${endpoint}/.well-known/agent-card.json`;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs()) });
  } catch (err) {
    throw new Error(`A2A discoverCard: timeout-or-network error fetching ${url}: ${String(err)}`);
  }

  if (!response.ok) {
    throw new Error(
      `A2A discoverCard: server returned HTTP ${response.status} for ${url}`
    );
  }

  let body: string;
  try {
    body = await response.text();
  } catch (err) {
    throw new Error(`A2A discoverCard: failed to read response body from ${url}: ${String(err)}`);
  }

  return parseAgentCard(body, url);
}

// ---------------------------------------------------------------------------
// T014 — invokeSkill
// ---------------------------------------------------------------------------

/** JSON-RPC 2.0 request shape for A2A message/send. */
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: Record<string, unknown>;
}

/** JSON-RPC 2.0 response shape (minimal typing for what we inspect). */
interface JsonRpcResponse {
  jsonrpc?: string;
  id?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string };
}

/**
 * Invoke a declared skill via the A2A JSON-RPC 2.0 `message/send` method.
 *
 * POSTs to the endpoint root with JSON-RPC 2.0 payload:
 *   { jsonrpc: "2.0", id: 1, method: "message/send",
 *     params: { skill: skillId, message: input } }
 *
 * Adds `Authorization: Bearer <auth>` when auth is provided.
 *
 * Returns the response body as a string on success.
 *
 * Throws on:
 * - Network/transport errors.
 * - Non-2xx HTTP status.
 * - JSON-RPC `error` in the response body.
 *
 * An errored invocation counts as a failed run (FR-010).
 *
 * @param endpoint - Base URL of the A2A agent.
 * @param skillId  - The declared skill to invoke.
 * @param input    - The message payload string.
 * @param auth     - Optional bearer token (null or omitted = unauthenticated).
 */
export async function invokeSkill(
  endpoint: string,
  skillId: string,
  input: string,
  auth?: string | null
): Promise<string> {
  const rpcRequest: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "message/send",
    params: { skill: skillId, message: input },
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (auth != null && auth.length > 0) {
    headers["Authorization"] = `Bearer ${auth}`;
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(rpcRequest),
      signal: AbortSignal.timeout(timeoutMs()),
    });
  } catch (err) {
    throw new Error(`A2A invokeSkill: timeout-or-network error posting to ${endpoint}: ${String(err)}`);
  }

  if (!response.ok) {
    throw new Error(
      `A2A invokeSkill: server returned HTTP ${response.status} for ${endpoint}`
    );
  }

  let body: string;
  try {
    body = await response.text();
  } catch (err) {
    throw new Error(`A2A invokeSkill: failed to read response body: ${String(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw new Error(`A2A invokeSkill: response is not valid JSON: ${body.slice(0, 200)}`);
  }

  const rpc = parsed as JsonRpcResponse;
  if (rpc.error !== undefined) {
    throw new Error(
      `A2A invokeSkill: JSON-RPC error ${rpc.error.code ?? "unknown"}: ${rpc.error.message ?? "(no message)"}`
    );
  }

  return body;
}

// ---------------------------------------------------------------------------
// T014 — probeAuth
// ---------------------------------------------------------------------------

/**
 * Probe the auth-enforcement behavior of a protected A2A method.
 *
 * Sends a JSON-RPC `method` call with the given auth credential (null = unauthenticated)
 * and reports whether the request was rejected.
 *
 * `rejected` is true when:
 * - The server responds HTTP 401 or 403 (clean auth rejection).
 * - The server responds 200 but includes a JSON-RPC error with an auth-related code
 *   (codes -32001, -32002 or message containing "auth"/"unauthorized"/"forbidden").
 *
 * Does NOT throw on a clean rejection — that is the expected outcome for the negative case.
 * Only throws on a genuine transport/connection error (which is a failed run, FR-010).
 *
 * @param endpoint - Base URL of the A2A agent.
 * @param method   - JSON-RPC method to call (e.g. "message/send").
 * @param auth     - Bearer token string, or null for unauthenticated.
 */
export async function probeAuth(
  endpoint: string,
  method: string,
  auth: string | null
): Promise<{ rejected: boolean; status: number }> {
  const rpcRequest: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: 1,
    method,
    params: {},
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (auth !== null && auth.length > 0) {
    headers["Authorization"] = `Bearer ${auth}`;
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(rpcRequest),
      signal: AbortSignal.timeout(timeoutMs()),
    });
  } catch (err) {
    throw new Error(`A2A probeAuth: timeout-or-network error posting to ${endpoint}: ${String(err)}`);
  }

  const status = response.status;

  // HTTP-level auth rejection (clean rejection path, does NOT throw)
  if (status === 401 || status === 403) {
    return { rejected: true, status };
  }

  // For 2xx responses, check for JSON-RPC auth error in the body
  if (response.ok) {
    let body: string;
    try {
      body = await response.text();
    } catch {
      return { rejected: false, status };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body) as unknown;
    } catch {
      return { rejected: false, status };
    }

    const rpc = parsed as JsonRpcResponse;
    if (rpc.error !== undefined) {
      const msg = (rpc.error.message ?? "").toLowerCase();
      const isAuthError =
        msg.includes("auth") ||
        msg.includes("unauthorized") ||
        msg.includes("forbidden");
      if (isAuthError) {
        return { rejected: true, status };
      }
    }
  }

  return { rejected: false, status };
}

// ---------------------------------------------------------------------------
// Multi-turn A2A transport — WP01 (B1)
//
// Adds a conformant `message/send` path that:
//   1. Builds a proper A2A Message per spec v0.3.0 §6.4 / §6.5.1 / §7.1.1.
//   2. Threads server-owned `contextId` / `taskId` across turns (D1).
//   3. Extracts the assistant reply from Message and Task response shapes (Q1).
//   4. Maps every failure (non-2xx, timeout, JSON-RPC error, empty reply) to a
//      thrown error — errored run = failed run, never retried (D5, FR-010).
//   5. Never stores or logs the bearer token (NFR-002).
//
// This is a purely additive extension; `invokeSkill` is unchanged (NFR-003).
// The only new network surface is `sendMessage`, which routes through the
// already allow-listed `fetch` site in this file (NI-003).
// ---------------------------------------------------------------------------

/**
 * Carry server-owned `contextId` and `taskId` across turns.
 *
 * The runtime (WP03) holds the handle lifetime for one multi-turn case.
 * Transport reads / returns the handle; it never stores state itself.
 *
 * Citation: A2A spec v0.3.0 §7.1.1 (MessageSendParams), D1 (threading rationale).
 */
export interface ConversationHandle {
  /** Server-generated context identifier — echoed on every turn after turn 1. */
  contextId?: string;
  /** Server-generated task identifier — echoed when the agent created a task. */
  taskId?: string;
}

/** Minimal A2A JSON-RPC request body for `message/send`. */
interface SendRequestBody {
  jsonrpc: "2.0";
  id: number;
  method: "message/send";
  params: {
    message: {
      kind: "message";
      role: "user";
      parts: Array<{ kind: "text"; text: string }>;
      messageId: string;
      contextId?: string;
      taskId?: string;
    };
  };
}

/**
 * Build the JSON-RPC 2.0 `message/send` request body for one user turn.
 *
 * - First turn (empty handle): omits `contextId` and `taskId` entirely.
 * - Subsequent turns: includes whichever ids the handle carries.
 * - `messageId` is deterministic from `idSeq` (no Math.random / Date.now).
 *
 * Citation: A2A spec v0.3.0 §6.4 (Message), §6.5.1 (TextPart), §7.1.1 (MessageSendParams).
 *
 * @param turnText - The user-turn text content.
 * @param handle   - Conversation handle (empty on turn 1; updated handle on turn 2+).
 * @param idSeq    - Monotonically increasing counter for the call (≥ 1); used for
 *                   both the JSON-RPC `id` and the deterministic `messageId`.
 */
export function buildSendRequest(
  turnText: string,
  handle: ConversationHandle,
  idSeq: number
): SendRequestBody {
  const message: SendRequestBody["params"]["message"] = {
    kind: "message",
    role: "user",
    parts: [{ kind: "text", text: turnText }],
    messageId: `muster-msg-${idSeq}`,
  };

  if (handle.contextId !== undefined) {
    message.contextId = handle.contextId;
  }
  if (handle.taskId !== undefined) {
    message.taskId = handle.taskId;
  }

  return {
    jsonrpc: "2.0",
    id: idSeq,
    method: "message/send",
    params: { message },
  };
}

// ---------------------------------------------------------------------------
// T004 — Reply extraction (Q1: tolerant of Message and Task response shapes)
// ---------------------------------------------------------------------------

/** Intermediate extraction result — pure, no network or env access. */
interface ExtractedReply {
  reply: string;
  contextId?: string;
  taskId?: string;
}

/** Guard: an object with a string `kind` field. */
function hasKind(val: unknown): val is { kind: string } {
  return typeof val === "object" && val !== null && typeof (val as Record<string, unknown>)["kind"] === "string";
}

/** Join text parts from a parts array, skipping non-text entries. */
function joinTextParts(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts
    .filter((p): p is { kind: string; text: string } =>
      typeof p === "object" && p !== null &&
      (p as Record<string, unknown>)["kind"] === "text" &&
      typeof (p as Record<string, unknown>)["text"] === "string"
    )
    .map((p) => p.text)
    .join("");
}

/** Extract text from Task artifacts array. */
function extractFromArtifacts(artifacts: unknown): string {
  if (!Array.isArray(artifacts)) {
    return "";
  }
  return artifacts
    .map((a: unknown) => {
      if (typeof a !== "object" || a === null) {
        return "";
      }
      return joinTextParts((a as Record<string, unknown>)["parts"]);
    })
    .join("");
}

/** Resolve taskId from a Task result object (taskId field, or id field). */
function resolveTaskId(obj: Record<string, unknown>): string | undefined {
  if (typeof obj["taskId"] === "string") return obj["taskId"];
  if (typeof obj["id"] === "string") return obj["id"];
  return undefined;
}

/** Extract reply text from a Task status message (if present and non-empty). */
function extractStatusMessageText(obj: Record<string, unknown>): string | null {
  const status = obj["status"];
  if (typeof status !== "object" || status === null) return null;
  const statusObj = status as Record<string, unknown>;
  const statusMsg = statusObj["message"];
  if (!hasKind(statusMsg) || (statusMsg as Record<string, unknown>)["kind"] !== "message") {
    return null;
  }
  const msgObj = statusMsg as Record<string, unknown>;
  const text = joinTextParts(msgObj["parts"]);
  return text.length > 0 ? text : null;
}

/** Extract reply from a Task-shaped result (Q1 tolerance). */
function extractTaskReply(obj: Record<string, unknown>, contextId: string | undefined): ExtractedReply {
  const taskId = resolveTaskId(obj);
  const statusText = extractStatusMessageText(obj);
  if (statusText !== null) {
    return { reply: statusText, contextId, taskId };
  }
  const artifactText = extractFromArtifacts(obj["artifacts"]);
  return { reply: artifactText, contextId, taskId };
}

/**
 * Extract the assistant reply text and threading ids from a JSON-RPC `result` object.
 *
 * Tries in order:
 * 1. Message result (`result.kind === "message"`) → join `result.parts[].text`.
 * 2. Task result (`result.kind === "task"`) → prefer `result.status.message.parts[].text`;
 *    else concatenate `result.artifacts[].parts[].text`.
 * 3. Returns `{ reply: "" }` (empty sentinel) when neither shape yields text.
 *    The caller (`sendMessage`) treats the empty sentinel as an errored run.
 *
 * `contextId` is read from `result.contextId`; `taskId` from `result.taskId`
 * or `result.id` (Task shape) — whichever is present.
 *
 * This function is pure (no fetch, no env) so it is testable offline.
 *
 * Citation: A2A spec v0.3.0 §6.4 (Message), research Q1 (response shape tolerance).
 *
 * @param resultObj - The `result` field from a JSON-RPC 2.0 success response.
 */
export function extractReply(resultObj: unknown): ExtractedReply {
  if (!hasKind(resultObj)) {
    return { reply: "" };
  }

  const obj = resultObj as Record<string, unknown>;
  const contextId = typeof obj["contextId"] === "string" ? obj["contextId"] : undefined;

  if (obj["kind"] === "message") {
    return { reply: joinTextParts(obj["parts"]), contextId };
  }

  if (obj["kind"] === "task") {
    return extractTaskReply(obj, contextId);
  }

  return { reply: "" };
}

// ---------------------------------------------------------------------------
// T003 / T005 — sendMessage
// ---------------------------------------------------------------------------

/** Options for `sendMessage`. */
export interface SendMessageOptions {
  /** Bearer token for `Authorization` header; omitted when null/undefined. */
  token?: string | null;
  /** HTTP timeout in ms; defaults to `timeoutMs()` from env. */
  timeoutMs?: number;
  /** Monotonically increasing sequence number for request/message ids (≥ 1). */
  idSeq: number;
}

/**
 * Send one user turn to an A2A agent via the conformant `message/send` path.
 *
 * Builds a proper A2A `Message` (T001), POSTs it, extracts the reply (T004),
 * and returns the updated `ConversationHandle` (T002) for the next turn.
 *
 * Error contract (T005, D5, FR-010):
 * - Network / timeout → throws with "timeout-or-network" in the message.
 * - Non-2xx HTTP → throws with host + HTTP status only (no token, no headers).
 * - JSON-RPC `error` in body → throws with code + agent error message.
 * - Empty/unextractable reply → throws with "empty reply".
 * All failures are errored runs; callers must NOT retry.
 *
 * NFR-002: `opts.token` is never stored or logged; error messages carry
 * endpoint host + HTTP status only.
 *
 * NI-003: this is the only new `fetch` call; it lives in the already
 * allow-listed `src/adapters/a2a/transport.ts`.
 *
 * Citation: A2A spec v0.3.0 §7.1.1 (MessageSendParams); muster rubric FR-001,
 *   FR-010, NFR-002; research D1 (threading), D5 (errored = failed).
 *
 * @param endpoint  - Base URL of the A2A agent (no path suffix).
 * @param turnText  - The user-turn content to send.
 * @param handle    - Current conversation handle (empty `{}` on the first turn).
 * @param opts      - Token, timeout, and sequence number options.
 * @returns `{ reply, handle }` — reply text and updated handle for the next turn.
 */
export async function sendMessage(
  endpoint: string,
  turnText: string,
  handle: ConversationHandle,
  opts: SendMessageOptions
): Promise<{ reply: string; handle: ConversationHandle }> {
  const requestBody = buildSendRequest(turnText, handle, opts.idSeq);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token = opts.token ?? null;
  if (token !== null && token.length > 0) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const effectiveTimeout = opts.timeoutMs ?? timeoutMs();

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(effectiveTimeout),
    });
  } catch (err) {
    throw new Error(
      `A2A sendMessage: timeout-or-network error posting to ${endpoint}: ${String(err)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `A2A sendMessage: server returned HTTP ${response.status} for ${endpoint}`
    );
  }

  let body: string;
  try {
    body = await response.text();
  } catch (err) {
    throw new Error(
      `A2A sendMessage: failed to read response body from ${endpoint}: ${String(err)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw new Error(
      `A2A sendMessage: response is not valid JSON from ${endpoint}: ${body.slice(0, 200)}`
    );
  }

  const rpc = parsed as { result?: unknown; error?: { code?: number; message?: string } };

  if (rpc.error !== undefined) {
    throw new Error(
      `A2A sendMessage: JSON-RPC error ${rpc.error.code ?? "unknown"}: ${rpc.error.message ?? "(no message)"}`
    );
  }

  const extracted = extractReply(rpc.result);

  if (extracted.reply.length === 0) {
    throw new Error(
      `A2A sendMessage: empty reply from ${endpoint} — unrecognized response shape`
    );
  }

  const updatedHandle: ConversationHandle = {
    contextId: extracted.contextId ?? handle.contextId,
    taskId: extracted.taskId ?? handle.taskId,
  };

  return { reply: extracted.reply, handle: updatedHandle };
}

// ---------------------------------------------------------------------------
// T014 — fetchJwks
// ---------------------------------------------------------------------------

/**
 * Fetch the live JWKS from the A2A agent's well-known JWKS endpoint.
 *
 * GETs <endpoint>/.well-known/jwks.json.
 * Used by WP04's live signed-card check (FR-008).
 *
 * Throws on network error or non-200 response (failed run, FR-010).
 *
 * @param endpoint - Base URL of the A2A agent.
 */
export async function fetchJwks(endpoint: string): Promise<Jwks> {
  const url = `${endpoint}/.well-known/jwks.json`;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs()) });
  } catch (err) {
    throw new Error(`A2A fetchJwks: timeout-or-network error fetching ${url}: ${String(err)}`);
  }

  if (!response.ok) {
    throw new Error(`A2A fetchJwks: server returned HTTP ${response.status} for ${url}`);
  }

  let body: string;
  try {
    body = await response.text();
  } catch (err) {
    throw new Error(`A2A fetchJwks: failed to read response body: ${String(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw new Error(`A2A fetchJwks: response is not valid JSON: ${body.slice(0, 200)}`);
  }

  const jwks = parsed as Record<string, unknown>;
  if (!Array.isArray(jwks["keys"])) {
    throw new TypeError(`A2A fetchJwks: JWKS response missing "keys" array`);
  }

  return { keys: jwks["keys"] as Array<Record<string, unknown>> };
}
