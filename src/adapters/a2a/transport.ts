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
    response = await fetch(url);
  } catch (err) {
    throw new Error(`A2A discoverCard: network error fetching ${url}: ${String(err)}`);
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
    });
  } catch (err) {
    throw new Error(`A2A invokeSkill: network error posting to ${endpoint}: ${String(err)}`);
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
    });
  } catch (err) {
    throw new Error(`A2A probeAuth: network error posting to ${endpoint}: ${String(err)}`);
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
    response = await fetch(url);
  } catch (err) {
    throw new Error(`A2A fetchJwks: network error fetching ${url}: ${String(err)}`);
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
    throw new Error(`A2A fetchJwks: JWKS response missing "keys" array`);
  }

  return { keys: jwks["keys"] as Array<Record<string, unknown>> };
}
