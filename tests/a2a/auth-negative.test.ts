/**
 * Tests for WP04 T019/T020/T023: auth-enforcement negative grader.
 *
 * Tests:
 *   T019 — checkAuthEnforcement with enforceAuth:true → passed:true
 *   T020 — DISCRIMINATION CONTROL: enforceAuth:false (declared-but-unenforced) → passed:false
 *   T023 — both modes covered against the in-process test-server
 *
 * These checks are DETERMINISTIC — a single result per case, NOT k-of-n.
 * A clean 401/403 is the expected pass (rejectedUnauthorized:true), not an error.
 *
 * Skip taxonomy:
 * - This grader has NO nested skip path. The only skip is runner-level (WP05,
 *   MUSTER_A2A_ENDPOINT unset). Transport errors within the grader → passed:false (FR-010).
 *
 * Citation: A2A spec v1.0.0 protobuf a2a.proto §7; muster rubric FR-007, FR-010, FR-011.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { checkAuthEnforcement } from "../../src/adapters/a2a/graders/auth-negative.js";
import { parseAgentCard } from "../../src/adapters/a2a/card.js";
import {
  startTestServer,
  TEST_BEARER_TOKEN,
} from "../fixtures/a2a/server/test-server.js";
import type { RunningServer } from "../fixtures/a2a/server/test-server.js";

const FIXTURE_DIR = resolvePath("tests/fixtures/a2a");

// ---------------------------------------------------------------------------
// T019 — enforceAuth:true server → auth check passes
// ---------------------------------------------------------------------------

describe("checkAuthEnforcement: enforceAuth:true server (T019)", () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await startTestServer({ enforceAuth: true });
  });

  afterAll(async () => {
    await server.close();
  });

  it("returns rejectedUnauthorized:true when no token is sent to a protected endpoint", async () => {
    const card = parseAgentCard(
      readFileSync(resolvePath(FIXTURE_DIR, "cards/valid.json"), "utf-8"),
      `${server.url}/.well-known/agent-card.json`
    );
    const scheme = card.securitySchemes[0] ?? { id: "bearer-auth", type: "bearer", protectedMethods: ["message/send"] };

    const result = await checkAuthEnforcement(server.url, scheme, "message/send", null);

    expect(result.rejectedUnauthorized).toBe(true);
    // No token supplied → acceptedAuthorized is not-applicable (true)
    expect(result.acceptedAuthorized).toBe(true);
    expect(result.passed).toBe(true);
  });

  it("returns rejectedUnauthorized:true and acceptedAuthorized:true with valid token", async () => {
    const scheme = { id: "bearer-auth", type: "bearer", protectedMethods: ["message/send"] };

    const result = await checkAuthEnforcement(
      server.url,
      scheme,
      "message/send",
      TEST_BEARER_TOKEN
    );

    expect(result.rejectedUnauthorized).toBe(true);
    expect(result.acceptedAuthorized).toBe(true);
    expect(result.passed).toBe(true);
  });

  it("returns passed:false when correct scheme is declared but wrong token supplied", async () => {
    const scheme = { id: "bearer-auth", type: "bearer", protectedMethods: ["message/send"] };

    const result = await checkAuthEnforcement(
      server.url,
      scheme,
      "message/send",
      "wrong-invalid-token"
    );

    // Unauthenticated (null) probe: rejected → true
    expect(result.rejectedUnauthorized).toBe(true);
    // Wrong-token probe: also rejected → acceptedAuthorized:false
    expect(result.acceptedAuthorized).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("detail includes schemeId, schemeType, method, and citation", async () => {
    const scheme = { id: "bearer-auth", type: "bearer", protectedMethods: ["message/send"] };

    const result = await checkAuthEnforcement(server.url, scheme, "message/send", null);

    expect(result.detail).toBeDefined();
    expect(result.detail?.["schemeId"]).toBe("bearer-auth");
    expect(result.detail?.["schemeType"]).toBe("bearer");
    expect(result.detail?.["method"]).toBe("message/send");
    expect(typeof result.detail?.["citation"]).toBe("string");
  });

  it("not-applicable note is present in detail when no authorizedToken supplied", async () => {
    const scheme = { id: "bearer-auth", type: "bearer", protectedMethods: ["message/send"] };

    const result = await checkAuthEnforcement(server.url, scheme, "message/send", null);

    expect(result.detail?.["acceptedAuthorizedApplicable"]).toBe(false);
    expect(typeof result.detail?.["acceptedAuthorizedNote"]).toBe("string");
  });

  it("detail includes applicable:true when authorizedToken is supplied", async () => {
    const scheme = { id: "bearer-auth", type: "bearer", protectedMethods: ["message/send"] };

    const result = await checkAuthEnforcement(
      server.url,
      scheme,
      "message/send",
      TEST_BEARER_TOKEN
    );

    expect(result.detail?.["acceptedAuthorizedApplicable"]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T020 — DISCRIMINATION CONTROL: enforceAuth:false → grader fails (FR-011)
// ---------------------------------------------------------------------------

/**
 * DISCRIMINATION CONTROL (T020, FR-011):
 *
 * This control proves that checkAuthEnforcement can fail.
 *
 * Setup: the test-server runs with enforceAuth:false, so it accepts unauthenticated
 * requests. But the card (declared-unenforced.json) declares a bearer scheme on
 * message/send. This is the "declared-but-unenforced" scenario.
 *
 * Expected result:
 * - probeAuth(endpoint, "message/send", null) → rejected:false (server does NOT enforce)
 * - rejectedUnauthorized = false → passed:false
 *
 * This MUST fail. If it passes, the grader is broken.
 */
describe("DISCRIMINATION CONTROL: declared-but-unenforced server → passed:false (T020, FR-011)", () => {
  let server: RunningServer;

  beforeAll(async () => {
    // enforceAuth:false: the server does NOT reject unauthenticated requests
    server = await startTestServer({ enforceAuth: false });
  });

  afterAll(async () => {
    await server.close();
  });

  it("CONTROL: grader returns passed:false when the server does not enforce auth (declared-but-unenforced)", async () => {
    // Card declares bearer scheme on message/send — but server doesn't enforce it
    const declaredUnenforced = parseAgentCard(
      readFileSync(
        resolvePath(FIXTURE_DIR, "cards/declared-unenforced.json"),
        "utf-8"
      ),
      `${server.url}/.well-known/agent-card.json`
    );

    const scheme = declaredUnenforced.securitySchemes[0] ?? {
      id: "bearer-auth",
      type: "bearer",
      protectedMethods: ["message/send"],
    };

    const result = await checkAuthEnforcement(server.url, scheme, "message/send", null);

    // Control must fail: server does not reject unauthenticated requests
    expect(result.rejectedUnauthorized).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("CONTROL: declared-unenforced fixture is a valid parseable card with bearer scheme", () => {
    const raw = readFileSync(
      resolvePath(FIXTURE_DIR, "cards/declared-unenforced.json"),
      "utf-8"
    );
    const card = parseAgentCard(raw, "tests/fixtures/a2a/cards/declared-unenforced.json");

    expect(card.name).toBe("Declared-Unenforced Test Agent");
    expect(card.securitySchemes).toHaveLength(1);
    expect(card.securitySchemes[0]?.type).toBe("bearer");
    expect(card.securitySchemes[0]?.protectedMethods).toContain("message/send");
  });
});

// ---------------------------------------------------------------------------
// Transport error → failed run (FR-010)
// ---------------------------------------------------------------------------

describe("checkAuthEnforcement: transport error → passed:false (FR-010)", () => {
  it("returns passed:false (not skip) when the endpoint is unreachable on the unauth probe", async () => {
    const scheme = { id: "bearer-auth", type: "bearer", protectedMethods: ["message/send"] };

    // Port 1 is connection-refused — transport error
    const result = await checkAuthEnforcement(
      "http://127.0.0.1:1",
      scheme,
      "message/send",
      null
    );

    expect(result.passed).toBe(false);
    expect(result.rejectedUnauthorized).toBe(false);
    expect(result.acceptedAuthorized).toBe(false);
    expect(result.detail?.["unauthProbeError"]).toBeDefined();
  });

  it("returns passed:false (not skip) when the authorized probe fails mid-check", async () => {
    // Start a server that only handles the first request, then use a refused port.
    // We simulate this by using a mini server that accepts the unauth probe (returns 401)
    // but then we stop it before the auth probe.
    const { createServer } = await import("node:http");

    await new Promise<void>((resolveTest) => {
      let requestCount = 0;
      const srv = createServer((_req, res) => {
        requestCount++;
        if (requestCount === 1) {
          // First call (unauth probe): return 401
          res.writeHead(401);
          res.end("Unauthorized");
        } else {
          // Second call (auth probe): abruptly destroy the connection
          res.socket?.destroy();
        }
      });

      srv.listen(0, "127.0.0.1", async () => {
        const addr = srv.address() as { port: number };
        const url = `http://127.0.0.1:${addr.port}`;
        const scheme = { id: "bearer-auth", type: "bearer", protectedMethods: ["message/send"] };
        try {
          const result = await checkAuthEnforcement(url, scheme, "message/send", "some-token");
          // Unauth probe succeeded (rejected:true), auth probe failed
          expect(result.rejectedUnauthorized).toBe(true);
          expect(result.acceptedAuthorized).toBe(false);
          expect(result.passed).toBe(false);
          expect(result.detail?.["authProbeError"]).toBeDefined();
        } finally {
          srv.close(() => resolveTest());
        }
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Unit: interface shape and exports
// ---------------------------------------------------------------------------

describe("auth-negative: interface shape", () => {
  it("checkAuthEnforcement returns an AuthCheck-shaped object", async () => {
    const server = await startTestServer({ enforceAuth: true });
    try {
      const scheme = { id: "bearer-auth", type: "bearer", protectedMethods: ["message/send"] };
      const result = await checkAuthEnforcement(server.url, scheme, "message/send", null);

      expect(typeof result.rejectedUnauthorized).toBe("boolean");
      expect(typeof result.acceptedAuthorized).toBe("boolean");
      expect(typeof result.passed).toBe("boolean");
    } finally {
      await server.close();
    }
  });
});
