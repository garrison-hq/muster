/**
 * Tests for WP04 T021/T022/T023: live signed-card grader.
 *
 * Tests:
 *   T021 — checkLiveSignedCard with signed:true server → passed:true
 *   T021 — Nested skip: JWKS unavailable while endpoint reachable → skipped:true
 *   T022 — DISCRIMINATION CONTROL: tampered card or wrong key → passed:false, skipped:false
 *   T023 — all modes covered against in-process servers
 *
 * This check is DETERMINISTIC — a single authoritative result, not k-of-n.
 *
 * Skip taxonomy:
 * - RUNNER-LEVEL ENV-UNSET SKIP: handled by WP05, not this grader.
 * - NESTED SKIP (here): endpoint reachable, live JWKS unavailable → skipped:true.
 *   This is NOT a failure. The card was discovered; only the JWKS is down.
 * - FAILED RUN: discoverCard throws (endpoint unreachable) → throws to caller.
 *
 * Testing the nested skip WITHOUT modifying test-server:
 * The test-server always serves /.well-known/jwks.json. To test the nested skip
 * we spin up a bare node:http server in this test file that serves the signed card
 * at the well-known URI but returns 404 for /.well-known/jwks.json.
 * This is consistent with the pattern used in skill-behavior.test.ts for custom
 * server behaviors (e.g. probeAuth JSON-RPC body detection tests).
 *
 * Citation: A2A spec v1.0.0 protobuf a2a.proto §8.x (signed cards);
 * muster rubric FR-008, FR-010, FR-011.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { checkLiveSignedCard } from "../../src/adapters/a2a/graders/signed-card.js";
import {
  startTestServer,
} from "../fixtures/a2a/server/test-server.js";
import type { RunningServer } from "../fixtures/a2a/server/test-server.js";

const FIXTURE_DIR = resolvePath("tests/fixtures/a2a");

// ---------------------------------------------------------------------------
// T021 — signed server → checkLiveSignedCard passes
// ---------------------------------------------------------------------------

describe("checkLiveSignedCard: signed:true server → passed (T021)", () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await startTestServer({ signed: true });
  });

  afterAll(async () => {
    await server.close();
  });

  it("returns passed:true, skipped:false when card and JWKS both serve correctly", async () => {
    const result = await checkLiveSignedCard(server.url);

    expect(result.skipped).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.signature.verified).toBe(true);
    expect(result.skipReason).toBeUndefined();
  });

  it("signature result has alg and kid populated on success", async () => {
    const result = await checkLiveSignedCard(server.url);

    expect(result.signature.alg).toBeDefined();
    expect(result.signature.kid).toBeDefined();
  });

  it("passed equals signature.verified", async () => {
    const result = await checkLiveSignedCard(server.url);

    expect(result.passed).toBe(result.signature.verified);
  });
});

// ---------------------------------------------------------------------------
// T021 — Nested skip: JWKS unavailable while endpoint is reachable
// ---------------------------------------------------------------------------

/**
 * To test the nested skip WITHOUT modifying the test-server, we spin up a bare
 * node:http server here that:
 *   - GET /.well-known/agent-card.json → serves the signed card fixture (200)
 *   - GET /.well-known/jwks.json       → returns 404 (JWKS unavailable)
 *
 * The signed card is reachable (discoverCard succeeds), but fetchJwks gets a
 * non-200 and throws → nested skip path in checkLiveSignedCard fires.
 */
describe("checkLiveSignedCard: nested skip when live JWKS is unavailable (T021)", () => {
  let serverUrl: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const signedCardJson = readFileSync(
      resolvePath(FIXTURE_DIR, "cards/signed.json"),
      "utf-8"
    );
    const signedCardBody = signedCardJson;

    await new Promise<void>((resolveSetup, rejectSetup) => {
      const srv = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = req.url ?? "/";
        if (req.method === "GET" && url === "/.well-known/agent-card.json") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(signedCardBody);
        } else {
          // All other routes — including /.well-known/jwks.json — return 404
          res.writeHead(404);
          res.end("Not Found");
        }
      });

      srv.on("error", rejectSetup);
      srv.listen(0, "127.0.0.1", () => {
        const addr = srv.address() as { port: number };
        serverUrl = `http://127.0.0.1:${addr.port}`;
        cleanup = () =>
          new Promise((res, rej) => {
            srv.close((err) => {
              if (err != null) rej(err);
              else res();
            });
          });
        resolveSetup();
      });
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it("returns skipped:true and skipReason when the live JWKS endpoint 404s", async () => {
    const result = await checkLiveSignedCard(serverUrl);

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("live JWKS unavailable");
    // passed:false is a placeholder when skipped — the check didn't run
    expect(result.passed).toBe(false);
  });

  it("nested skip does NOT throw — it is a soft skip, not a failure", async () => {
    // The grader must return a result (not throw) when the JWKS is unavailable.
    // A thrown error would cause the runner to record a failed run (FR-010),
    // but the spec says this is a NESTED SKIP, not a failure.
    await expect(checkLiveSignedCard(serverUrl)).resolves.toMatchObject({
      skipped: true,
      skipReason: "live JWKS unavailable",
    });
  });

  it("nested skip is distinct from a runner-level env-unset skip (different code path)", async () => {
    // The nested skip returns skipped:true with a specific reason.
    // The runner-level skip (WP05, MUSTER_A2A_ENDPOINT not set) would never
    // call this function at all — the runner checks envEndpoint() first.
    // Here we verify the nested-skip shape is well-formed.
    const result = await checkLiveSignedCard(serverUrl);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("live JWKS unavailable");
    expect(result.signature).toBeDefined();
    expect(result.signature.reason).toBe("skipped");
  });
});

// ---------------------------------------------------------------------------
// T022 — DISCRIMINATION CONTROL: wrong-key JWKS → passed:false, skipped:false
// ---------------------------------------------------------------------------

/**
 * DISCRIMINATION CONTROL (T022, FR-011):
 *
 * This control proves that checkLiveSignedCard can FAIL (not skip).
 *
 * Setup 1 (wrong key): a custom server serves the signed card at well-known URI
 * and the wrong-key JWKS at /.well-known/jwks.json.
 * verifyCardJws will fail (signature-mismatch or unknown-kid).
 * Expected: { passed:false, skipped:false }
 *
 * Setup 2 (tampered card): serve the tampered card + valid JWKS.
 * verifyCardJws will fail (tamper detected).
 * Expected: { passed:false, skipped:false }
 *
 * These controls MUST fail. If they pass, the grader is broken.
 */
describe("DISCRIMINATION CONTROL: wrong-key JWKS → passed:false, skipped:false (T022, FR-011)", () => {
  let serverUrl: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const signedCardJson = readFileSync(
      resolvePath(FIXTURE_DIR, "cards/signed.json"),
      "utf-8"
    );
    const wrongKeyJwksJson = readFileSync(
      resolvePath(FIXTURE_DIR, "jwks/wrong-key.json"),
      "utf-8"
    );

    await new Promise<void>((resolveSetup, rejectSetup) => {
      const srv = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = req.url ?? "/";
        if (req.method === "GET" && url === "/.well-known/agent-card.json") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(signedCardJson);
        } else if (req.method === "GET" && url === "/.well-known/jwks.json") {
          // Serve the WRONG key — signature verification will fail
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(wrongKeyJwksJson);
        } else {
          res.writeHead(404);
          res.end("Not Found");
        }
      });

      srv.on("error", rejectSetup);
      srv.listen(0, "127.0.0.1", () => {
        const addr = srv.address() as { port: number };
        serverUrl = `http://127.0.0.1:${addr.port}`;
        cleanup = () =>
          new Promise((res, rej) => {
            srv.close((err) => {
              if (err != null) rej(err);
              else res();
            });
          });
        resolveSetup();
      });
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it("CONTROL: wrong-key JWKS causes verification to fail (passed:false, skipped:false)", async () => {
    const result = await checkLiveSignedCard(serverUrl);

    // The grader must FAIL, not skip — the JWKS was reachable (200), just wrong
    expect(result.skipped).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.signature.verified).toBe(false);
    expect(result.skipReason).toBeUndefined();
  });
});

describe("DISCRIMINATION CONTROL: tampered card → passed:false, skipped:false (T022, FR-011)", () => {
  let serverUrl: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const tamperedCardJson = readFileSync(
      resolvePath(FIXTURE_DIR, "cards/tampered.json"),
      "utf-8"
    );
    const validJwksJson = readFileSync(
      resolvePath(FIXTURE_DIR, "jwks/valid.json"),
      "utf-8"
    );

    await new Promise<void>((resolveSetup, rejectSetup) => {
      const srv = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = req.url ?? "/";
        if (req.method === "GET" && url === "/.well-known/agent-card.json") {
          // Serve the TAMPERED card — the signature will not match the payload
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(tamperedCardJson);
        } else if (req.method === "GET" && url === "/.well-known/jwks.json") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(validJwksJson);
        } else {
          res.writeHead(404);
          res.end("Not Found");
        }
      });

      srv.on("error", rejectSetup);
      srv.listen(0, "127.0.0.1", () => {
        const addr = srv.address() as { port: number };
        serverUrl = `http://127.0.0.1:${addr.port}`;
        cleanup = () =>
          new Promise((res, rej) => {
            srv.close((err) => {
              if (err != null) rej(err);
              else res();
            });
          });
        resolveSetup();
      });
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it("CONTROL: tampered card causes verification to fail (passed:false, skipped:false)", async () => {
    const result = await checkLiveSignedCard(serverUrl);

    // Tamper detected — grader must FAIL, not skip
    expect(result.skipped).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.signature.verified).toBe(false);
    expect(result.skipReason).toBeUndefined();
  });

  it("CONTROL: tampered card failure reason is reported in signature.reason", async () => {
    const result = await checkLiveSignedCard(serverUrl);

    // verifyCardJws should produce a non-empty reason for the mismatch
    expect(result.signature.reason).toBeDefined();
    expect(typeof result.signature.reason).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Discovery error → throws (failed run, FR-010)
// ---------------------------------------------------------------------------

describe("checkLiveSignedCard: discovery error → throws (FR-010)", () => {
  it("throws when the endpoint is unreachable (discoverCard fails → failed run)", async () => {
    // Port 1 is connection-refused — discoverCard will throw.
    // The grader does NOT catch discovery errors: they propagate to the caller,
    // which records a failed run (FR-010). This is distinct from the nested skip.
    await expect(
      checkLiveSignedCard("http://127.0.0.1:1")
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Unit: interface shape and exports
// ---------------------------------------------------------------------------

describe("signed-card: LiveSignatureResult interface shape", () => {
  it("skipped result has expected shape", async () => {
    // Use the nested-skip path by creating a minimal server without JWKS
    const signedCardJson = readFileSync(
      resolvePath(FIXTURE_DIR, "cards/signed.json"),
      "utf-8"
    );

    await new Promise<void>((resolveTest) => {
      const srv = createServer((req: IncomingMessage, res: ServerResponse) => {
        if (req.url === "/.well-known/agent-card.json") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(signedCardJson);
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      srv.listen(0, "127.0.0.1", async () => {
        const addr = srv.address() as { port: number };
        const url = `http://127.0.0.1:${addr.port}`;
        try {
          const result = await checkLiveSignedCard(url);
          expect(typeof result.passed).toBe("boolean");
          expect(typeof result.skipped).toBe("boolean");
          expect(result.signature).toBeDefined();
          expect(typeof result.signature.verified).toBe("boolean");
        } finally {
          srv.close(() => resolveTest());
        }
      });
    });
  });
});
