/**
 * In-process A2A test-server fixture for CI (D-03, FR-014, T015).
 *
 * Builds a minimal `node:http` server that speaks A2A JSON-RPC 2.0 over HTTP.
 * Deterministic (no random, no Date.now() on the response path), ephemeral port
 * (`listen(0)`), dependency-free.
 *
 * Routes:
 *   GET  /.well-known/agent-card.json  — Agent Card with an "echo" skill and
 *        a "bearer" scheme guarding message/send. Optionally signed (opts.signed)
 *        using the Ed25519 key from tests/fixtures/a2a/jwks/valid.json (WP02
 *        fixture keypair). opts.drift causes the declared skill to differ from
 *        what the server actually honors, producing a drifted card.
 *        opts.healthy causes the server to generate an EPHEMERAL in-process
 *        Ed25519 keypair, sign its honest echo+bearer card with it, and serve
 *        the matching JWKS at /.well-known/jwks.json — all without committing
 *        any private key to the repository.
 *
 *   GET  /.well-known/jwks.json        — The JWKS for live signature verification (WP04).
 *
 *   POST /                             — JSON-RPC 2.0 message/send handler.
 *        Honest mode: echoes input as { result: { response: input } }.
 *        Drift mode: returns an off-spec { result: { response: "DRIFT_RESPONSE" } }
 *        that should NOT satisfy an honest echo-skill expect.
 *        enforceAuth mode: returns 401 when the Authorization header is absent or
 *        not a valid "Bearer <token>" for the fixed TEST_BEARER_TOKEN.
 *
 * The server is a test-only fixture: never shipped in the product files surface.
 *
 * Citation: A2A spec v1.0.0 protobuf a2a.proto §8.2 (well-known URI),
 * §8.3.1 (skill behavior), §7 (security schemes); muster rubric FR-014.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { canonicalJson } from "../../../../src/core/canonical-json.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TestServerOptions {
  /** When true, serve the signed card fixture (uses WP02 Ed25519 keypair). */
  signed?: boolean;
  /**
   * When true, the server's actual message/send response drifts from what the
   * declared skill advertises — used as the discrimination control (FR-011).
   * Also: no auth enforcement and no signing (unhealthy control mode).
   */
  drift?: boolean;
  /**
   * When true, message/send rejects requests without a valid bearer token.
   * The accepted token is the constant TEST_BEARER_TOKEN below.
   */
  enforceAuth?: boolean;
  /**
   * When true, the server generates an EPHEMERAL in-process Ed25519 keypair,
   * signs its honest echo+bearer card, serves the signed card at the well-known
   * URI, serves the matching JWKS at /.well-known/jwks.json, and enforces bearer
   * auth on message/send. Implies honest + enforcing + signed.
   *
   * No private key is ever written to disk. The keypair is ephemeral and
   * scoped to the lifetime of this server instance.
   *
   * The signing scheme exactly matches verifyCardJws in signature.ts:
   *   signingInput = <protected_b64url> + "." + <payload_b64url>
   *   where payload_b64url = base64url(canonicalJson(card_without_signatures_without_discoveredFrom))
   *
   * Citation: muster FR-014; A2A spec v1.0.0 §8.x (signed cards).
   */
  healthy?: boolean;
  /**
   * When set to a positive number, ALL routes delay their response by this many
   * milliseconds before sending any data. Used by transport-timeout tests to
   * verify that AbortSignal.timeout(...) in the transport converts a hung
   * endpoint into a thrown error (failed run, FR-010).
   *
   * The delay is implemented with a simple setTimeout — no external dependency.
   */
  delayMs?: number;
}

export interface RunningServer {
  /** The base URL of the listening server, e.g. "http://127.0.0.1:54321". */
  url: string;
  /** Resolves when the server is fully closed. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Fixed test token for enforceAuth mode (not a real credential)
// ---------------------------------------------------------------------------

/** The fixed bearer token accepted by the server when enforceAuth is enabled. */
export const TEST_BEARER_TOKEN = "muster-test-bearer-token";

// ---------------------------------------------------------------------------
// Fixture paths
// ---------------------------------------------------------------------------

const FIXTURE_DIR = resolvePath(
  new URL(import.meta.url).pathname,
  "../../"
);

const JWKS_PATH = resolvePath(FIXTURE_DIR, "jwks/valid.json");
const SIGNED_CARD_PATH = resolvePath(FIXTURE_DIR, "cards/signed.json");

// ---------------------------------------------------------------------------
// Static fixture data (loaded once; deterministic)
// ---------------------------------------------------------------------------

/** The JWKS fixture (WP02 Ed25519 public key). Loaded once for all instances. */
function loadJwks(): string {
  return readFileSync(JWKS_PATH, "utf-8");
}

/** The signed card fixture (WP02). Loaded once. */
function loadSignedCard(): string {
  return readFileSync(SIGNED_CARD_PATH, "utf-8");
}

// ---------------------------------------------------------------------------
// Ephemeral keypair generation for healthy mode
// ---------------------------------------------------------------------------

/** Result of generating an ephemeral signing keypair for healthy mode. */
interface EphemeralKeyPair {
  /** The signed card JSON string (signed with the ephemeral key). */
  signedCardJson: string;
  /** The JWKS JSON string containing only the public key. */
  jwksJson: string;
}

/**
 * Generate an ephemeral Ed25519 keypair, sign an honest echo+bearer card,
 * and return both the signed card JSON and the matching JWKS JSON.
 *
 * The signing scheme matches verifyCardJws (signature.ts) exactly:
 *   signingInput = <protected_b64url> + "." + base64url(canonicalJson(payload))
 *   where payload = card without "signatures" and without "discoveredFrom" fields.
 *
 * The private key never leaves this function's scope. No I/O.
 *
 * @param serverUrl - The base URL of the server (used in the card's discoveredFrom field).
 */
function buildEphemeralSignedCard(serverUrl: string): EphemeralKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  const kid = "muster-ephemeral-key-healthy-test";

  // Build the unsigned card payload (what will be signed).
  // discoveredFrom is NOT included in the signed payload (stripped by buildSigningInput).
  const cardPayload: Record<string, unknown> = {
    name: "Muster Healthy Test Agent",
    version: "1.0.0",
    skills: [
      {
        description: "Returns the input message verbatim.",
        expectedBehavior: "Agent responds with the exact text of the input message.",
        id: "echo",
      },
    ],
    securitySchemes: [
      {
        id: "bearer-auth",
        protectedMethods: ["message/send"],
        type: "bearer",
      },
    ],
  };

  // Protected JWS header: { alg: "EdDSA", kid }
  const protectedHeader = { alg: "EdDSA", kid };
  const protectedB64 = Buffer.from(JSON.stringify(protectedHeader)).toString("base64url");

  // Payload: canonicalJson of card without "signatures" and without "discoveredFrom"
  const canonicalPayload = canonicalJson(cardPayload);
  const payloadB64 = Buffer.from(canonicalPayload).toString("base64url");

  // signing input = protected_b64 + "." + payload_b64  (matches buildSigningInput in signature.ts)
  const signingInput = `${protectedB64}.${payloadB64}`;

  // Sign with Ed25519 (null digest for EdDSA)
  const sigBuf = cryptoSign(null, Buffer.from(signingInput), privateKey);
  const signatureB64 = sigBuf.toString("base64url");

  // Build the full signed card (includes discoveredFrom for discoverCard transport)
  const signedCard: Record<string, unknown> = {
    ...cardPayload,
    discoveredFrom: `${serverUrl}/.well-known/agent-card.json`,
    signatures: [
      {
        protected: protectedB64,
        signature: signatureB64,
      },
    ],
  };

  // Export the public key as JWK
  const publicJwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
  publicJwk["kid"] = kid;

  const jwks = { keys: [publicJwk] };

  return {
    signedCardJson: JSON.stringify(signedCard),
    jwksJson: JSON.stringify(jwks),
  };
}

// ---------------------------------------------------------------------------
// Card body builders
// ---------------------------------------------------------------------------

/** Build the honest unsigned card JSON (declares the echo skill + bearer scheme). */
function buildHonestCard(serverUrl: string): string {
  return JSON.stringify({
    name: "Muster Test Echo Agent",
    version: "1.0.0",
    skills: [
      {
        id: "echo",
        description: "Returns the input message verbatim.",
        expectedBehavior: "Agent responds with the exact text of the input message.",
      },
    ],
    securitySchemes: [
      {
        id: "bearer-auth",
        type: "bearer",
        protectedMethods: ["message/send"],
      },
    ],
    discoveredFrom: `${serverUrl}/.well-known/agent-card.json`,
  });
}

/** Build the drifted card JSON: declares echo but the server won't honor it. */
function buildDriftedCard(serverUrl: string): string {
  return JSON.stringify({
    name: "Muster Test Drifted Agent",
    version: "1.0.0",
    skills: [
      {
        id: "echo",
        description: "Returns the input message verbatim.",
        expectedBehavior: "Agent responds with the exact text of the input message.",
      },
    ],
    securitySchemes: [
      {
        id: "bearer-auth",
        type: "bearer",
        protectedMethods: ["message/send"],
      },
    ],
    discoveredFrom: `${serverUrl}/.well-known/agent-card.json`,
  });
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

/** Returns true when the request carries a valid bearer token. */
function isAuthorized(req: IncomingMessage): boolean {
  const authHeader = req.headers["authorization"];
  if (typeof authHeader !== "string") return false;
  const parts = authHeader.split(" ");
  return parts[0] === "Bearer" && parts[1] === TEST_BEARER_TOKEN;
}

// ---------------------------------------------------------------------------
// Request body helper
// ---------------------------------------------------------------------------

/** Delay helper for delayMs mode — resolves after the given number of ms. */
function delayFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

interface JsonRpcErrorBody {
  jsonrpc: "2.0";
  id: unknown;
  error: { code: number; message: string };
}

interface JsonRpcSuccessBody {
  jsonrpc: "2.0";
  id: unknown;
  result: Record<string, unknown>;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

function rpcError(id: unknown, code: number, message: string): JsonRpcErrorBody {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function rpcSuccess(id: unknown, result: Record<string, unknown>): JsonRpcSuccessBody {
  return { jsonrpc: "2.0", id, result };
}

// ---------------------------------------------------------------------------
// Server state for healthy mode (ephemeral keypair, built once per server)
// ---------------------------------------------------------------------------

interface HealthyState {
  signedCardJson: string;
  jwksJson: string;
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: TestServerOptions,
  serverUrl: string,
  healthyState: HealthyState | null
): Promise<void> {
  // delayMs mode: simulate a hung endpoint for transport-timeout tests (FR-010).
  if (opts.delayMs !== undefined && opts.delayMs > 0) {
    await delayFor(opts.delayMs);
  }

  const method = req.method ?? "GET";
  const url = req.url ?? "/";

  // GET /.well-known/agent-card.json
  if (method === "GET" && url === "/.well-known/agent-card.json") {
    if (opts.healthy && healthyState !== null) {
      sendJson(res, 200, JSON.parse(healthyState.signedCardJson) as unknown);
    } else if (opts.signed) {
      const cardJson = loadSignedCard();
      sendJson(res, 200, JSON.parse(cardJson) as unknown);
    } else if (opts.drift) {
      sendJson(res, 200, JSON.parse(buildDriftedCard(serverUrl)) as unknown);
    } else {
      sendJson(res, 200, JSON.parse(buildHonestCard(serverUrl)) as unknown);
    }
    return;
  }

  // GET /.well-known/jwks.json
  if (method === "GET" && url === "/.well-known/jwks.json") {
    if (opts.healthy && healthyState !== null) {
      sendJson(res, 200, JSON.parse(healthyState.jwksJson) as unknown);
    } else {
      const jwksJson = loadJwks();
      sendJson(res, 200, JSON.parse(jwksJson) as unknown);
    }
    return;
  }

  // POST / — JSON-RPC 2.0 message/send
  if (method === "POST" && url === "/") {
    // Auth enforcement for healthy and enforceAuth modes
    const shouldEnforceAuth = opts.healthy === true || opts.enforceAuth === true;
    if (shouldEnforceAuth && !isAuthorized(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    let body: string;
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 400, rpcError(null, -32700, "Parse error: cannot read body"));
      return;
    }

    let rpc: Record<string, unknown>;
    try {
      rpc = JSON.parse(body) as Record<string, unknown>;
    } catch {
      sendJson(res, 200, rpcError(null, -32700, "Parse error: invalid JSON"));
      return;
    }

    const id = rpc["id"] ?? null;
    const rpcMethod = typeof rpc["method"] === "string" ? rpc["method"] : "";

    if (rpcMethod !== "message/send") {
      sendJson(res, 200, rpcError(id, -32601, `Method not found: ${rpcMethod}`));
      return;
    }

    const params = (rpc["params"] ?? {}) as Record<string, unknown>;
    const message = typeof params["message"] === "string" ? params["message"] : "";

    if (opts.drift) {
      // Drift mode: return an off-spec response that does NOT echo the input.
      // The discrimination control relies on this to make aggregateSkillBehavior return false.
      sendJson(res, 200, rpcSuccess(id, { response: "DRIFT_RESPONSE_UNRELATED_TO_INPUT" }));
      return;
    }

    // Honest mode (including healthy): echo the input verbatim
    sendJson(res, 200, rpcSuccess(id, { response: message }));
    return;
  }

  // 404 for anything else
  res.writeHead(404);
  res.end("Not Found");
}

// ---------------------------------------------------------------------------
// startTestServer (T015)
// ---------------------------------------------------------------------------

/**
 * Start an in-process A2A test-server on an ephemeral port.
 *
 * The server is deterministic: no random data, no time-dependent values.
 * Uses `listen(0)` for port assignment by the OS (ephemeral).
 *
 * Modes (mutually exclusive; first match wins):
 * - `healthy`     — Generates an EPHEMERAL in-process Ed25519 keypair, signs an
 *                   honest echo+bearer card, enforces bearer auth, and serves the
 *                   matching JWKS. A single server instance satisfies all three live
 *                   conformance checks simultaneously. No key is written to disk.
 * - `signed`      — Serves the committed signed-card fixture (WP02 keypair).
 * - `drift`       — Serves a drifted card with no auth enforcement and no signing.
 * - `enforceAuth` — Honest card + bearer auth enforcement.
 * - (none)        — Honest card, no auth enforcement, no signing.
 *
 * @param opts - Toggle flags: `healthy`, `signed`, `drift`, `enforceAuth`.
 * @returns    A `RunningServer` with `url` and a `close()` that resolves on shutdown.
 */
export function startTestServer(opts?: TestServerOptions): Promise<RunningServer> {
  const serverOpts: TestServerOptions = opts ?? {};

  return new Promise((resolveStart, rejectStart) => {
    let serverUrl = "";
    // healthyState is populated after listen() when we know the URL.
    let healthyState: HealthyState | null = null;

    const server = createServer((req, res) => {
      handleRequest(req, res, serverOpts, serverUrl, healthyState).catch(() => {
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("Internal Server Error");
        }
      });
    });

    server.on("error", rejectStart);

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") {
        server.close();
        rejectStart(new Error("startTestServer: unexpected address type"));
        return;
      }
      serverUrl = `http://127.0.0.1:${addr.port}`;

      // Build the ephemeral signed card now that we know the server URL.
      if (serverOpts.healthy) {
        healthyState = buildEphemeralSignedCard(serverUrl);
      }

      const running: RunningServer = {
        url: serverUrl,
        close(): Promise<void> {
          return new Promise((res, rej) => {
            server.close((err) => {
              if (err != null) {
                rej(err);
              } else {
                res();
              }
            });
          });
        },
      };

      resolveStart(running);
    });
  });
}
