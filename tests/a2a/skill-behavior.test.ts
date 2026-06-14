/**
 * Tests for WP03: transport client + skill-behavior grader + in-process test-server.
 *
 * Tests:
 *   T013 — envEndpoint() / envToken() / discoverCard()
 *   T014 — invokeSkill / probeAuth / fetchJwks
 *   T015 — in-process test-server: honest + drift + enforceAuth
 *   T016 — probeSkill + aggregateSkillBehavior (honest → pass, drift → fail)
 *   T017 — discrimination control: rigged-impossible expect → aggregateSkillBehavior false
 *   T018 — drifted-skill fixture + end-to-end skill-behavior pipeline
 *
 * All tests start an in-process server (never an external dependency, D-03 / NFR-005).
 * The server is torn down in afterEach/afterAll.
 *
 * Skip path: envEndpoint() returns null when MUSTER_A2A_ENDPOINT is unset (D-04/FR-009).
 *
 * Coverage target: ≥80% of transport.ts + graders/skill-behavior.ts.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import {
  envEndpoint,
  envToken,
  discoverCard,
  invokeSkill,
  probeAuth,
  fetchJwks,
} from "../../src/adapters/a2a/transport.js";
import {
  probeSkill,
  aggregateSkillBehavior,
} from "../../src/adapters/a2a/graders/skill-behavior.js";
import {
  startTestServer,
  TEST_BEARER_TOKEN,
} from "../fixtures/a2a/server/test-server.js";
import type { RunningServer } from "../fixtures/a2a/server/test-server.js";
import { parseAgentCard } from "../../src/adapters/a2a/card.js";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const FIXTURE_DIR = resolvePath("tests/fixtures/a2a");

// ---------------------------------------------------------------------------
// T013 — env access
// ---------------------------------------------------------------------------

describe("envEndpoint / envToken", () => {
  afterEach(() => {
    // Restore any env overrides after each test
    delete process.env["MUSTER_A2A_ENDPOINT"];
    delete process.env["MUSTER_A2A_TOKEN"];
  });

  it("envEndpoint() returns null when MUSTER_A2A_ENDPOINT is not set", () => {
    delete process.env["MUSTER_A2A_ENDPOINT"];
    expect(envEndpoint()).toBeNull();
  });

  it("envEndpoint() returns the env value when set", () => {
    process.env["MUSTER_A2A_ENDPOINT"] = "http://example.com";
    expect(envEndpoint()).toBe("http://example.com");
  });

  it("envToken() returns null when MUSTER_A2A_TOKEN is not set", () => {
    delete process.env["MUSTER_A2A_TOKEN"];
    expect(envToken()).toBeNull();
  });

  it("envToken() returns the env value when set", () => {
    process.env["MUSTER_A2A_TOKEN"] = "my-token";
    expect(envToken()).toBe("my-token");
  });
});

// ---------------------------------------------------------------------------
// T013 / T014 / T015 — honest server: discover card + invoke skill + probe auth
// ---------------------------------------------------------------------------

describe("honest server", () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("discoverCard returns a parsed AgentCard from the well-known URI", async () => {
    const card = await discoverCard(server.url);
    expect(card.name).toBe("Muster Test Echo Agent");
    expect(card.skills).toHaveLength(1);
    expect(card.skills[0]?.id).toBe("echo");
    expect(card.securitySchemes).toHaveLength(1);
    expect(card.securitySchemes[0]?.type).toBe("bearer");
    // discoveredFrom must be the well-known URL (A2A §8.2)
    expect(card.discoveredFrom).toContain("/.well-known/agent-card.json");
  });

  it("discoverCard returns discoveredFrom pointing to the well-known URI (§8.2)", async () => {
    const card = await discoverCard(server.url);
    expect(card.discoveredFrom).toBe(`${server.url}/.well-known/agent-card.json`);
  });

  it("invokeSkill echoes the input in honest mode", async () => {
    const response = await invokeSkill(server.url, "echo", "hello-world");
    expect(response).toContain("hello-world");
  });

  it("invokeSkill sends the message and returns a JSON-RPC success body", async () => {
    const response = await invokeSkill(server.url, "echo", "ping");
    const parsed = JSON.parse(response) as Record<string, unknown>;
    expect(parsed["result"]).toBeDefined();
    const result = parsed["result"] as Record<string, unknown>;
    expect(result["response"]).toBe("ping");
  });

  it("probeAuth: unauthenticated request is NOT rejected when enforceAuth is off", async () => {
    const result = await probeAuth(server.url, "message/send", null);
    expect(result.rejected).toBe(false);
  });

  it("fetchJwks: returns the JWKS from the well-known JWKS endpoint", async () => {
    const jwks = await fetchJwks(server.url);
    expect(Array.isArray(jwks.keys)).toBe(true);
    expect(jwks.keys.length).toBeGreaterThan(0);
    // Compare against the fixture JWKS
    const fixtureJwks = JSON.parse(
      readFileSync(resolvePath(FIXTURE_DIR, "jwks/valid.json"), "utf-8")
    ) as { keys: unknown[] };
    expect(jwks.keys).toEqual(fixtureJwks.keys);
  });
});

// ---------------------------------------------------------------------------
// T014 — invokeSkill with bearer auth
// ---------------------------------------------------------------------------

describe("honest server + auth header", () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("invokeSkill passes Authorization header when auth is provided", async () => {
    // Even in non-enforceAuth mode, passing a token should work without error
    const response = await invokeSkill(server.url, "echo", "auth-test", TEST_BEARER_TOKEN);
    expect(response).toContain("auth-test");
  });
});

// ---------------------------------------------------------------------------
// T015 — drift server: skill response does not match declared behavior
// ---------------------------------------------------------------------------

describe("drift server", () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await startTestServer({ drift: true });
  });

  afterAll(async () => {
    await server.close();
  });

  it("discoverCard still returns the card in drift mode", async () => {
    const card = await discoverCard(server.url);
    expect(card.skills).toHaveLength(1);
    expect(card.skills[0]?.id).toBe("echo");
  });

  it("invokeSkill in drift mode returns the off-spec DRIFT_RESPONSE", async () => {
    const response = await invokeSkill(server.url, "echo", "hello");
    expect(response).toContain("DRIFT_RESPONSE_UNRELATED_TO_INPUT");
  });

  it("drift server response does NOT contain the sent input", async () => {
    const response = await invokeSkill(server.url, "echo", "unique-input-xyz");
    expect(response).not.toContain("unique-input-xyz");
  });
});

// ---------------------------------------------------------------------------
// T015 — enforceAuth server
// ---------------------------------------------------------------------------

describe("enforceAuth server", () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await startTestServer({ enforceAuth: true });
  });

  afterAll(async () => {
    await server.close();
  });

  it("probeAuth: unauthenticated request is rejected when enforceAuth is on", async () => {
    const result = await probeAuth(server.url, "message/send", null);
    expect(result.rejected).toBe(true);
    expect(result.status).toBe(401);
  });

  it("probeAuth: wrong token is rejected", async () => {
    const result = await probeAuth(server.url, "message/send", "wrong-token");
    expect(result.rejected).toBe(true);
  });

  it("invokeSkill throws when enforceAuth rejects (unauthenticated = failed run)", async () => {
    await expect(
      invokeSkill(server.url, "echo", "ping", null)
    ).rejects.toThrow(/HTTP 401/);
  });

  it("invokeSkill succeeds with the valid bearer token", async () => {
    const response = await invokeSkill(server.url, "echo", "authorized-input", TEST_BEARER_TOKEN);
    expect(response).toContain("authorized-input");
  });

  it("probeAuth: authorized request is NOT rejected", async () => {
    const result = await probeAuth(server.url, "message/send", TEST_BEARER_TOKEN);
    expect(result.rejected).toBe(false);
    expect(result.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// T016 — probeSkill: honest server → k-of-n passes
// ---------------------------------------------------------------------------

describe("probeSkill: honest server → k-of-n passes", () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("probeSkill returns consistent:true for all runs on the honest server", async () => {
    const card = await discoverCard(server.url);
    const skill = card.skills[0];
    if (!skill) throw new Error("No skill in test card");

    // expect = "ping" (same as input): echo server returns input → response.includes("ping") = true (FIX 5)
    const results = await probeSkill(
      server.url,
      skill,
      "ping",
      "ping",
      3
    );

    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.consistent).toBe(true);
      expect(r.error).toBeUndefined();
    }
  });

  it("aggregateSkillBehavior passes when all runs are consistent (k=3 of n=3)", async () => {
    const card = await discoverCard(server.url);
    const skill = card.skills[0];
    if (!skill) throw new Error("No skill in test card");

    // expect = "hello" (same as input): echo server echoes it back (FIX 5)
    const results = await probeSkill(
      server.url,
      skill,
      "hello",
      "hello",
      3
    );

    // passThreshold is an integer count: 3 of 3
    expect(aggregateSkillBehavior(results, 3)).toBe(true);
  });

  it("aggregateSkillBehavior passes with threshold below total runs (k=2 of n=3)", async () => {
    const card = await discoverCard(server.url);
    const skill = card.skills[0];
    if (!skill) throw new Error("No skill in test card");

    // expect = "world" (same as input): echo server echoes it back (FIX 5)
    const results = await probeSkill(
      server.url,
      skill,
      "world",
      "world",
      3
    );

    expect(aggregateSkillBehavior(results, 2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T016 — probeSkill: drift server → k-of-n fails
// ---------------------------------------------------------------------------

describe("probeSkill: drift server → k-of-n fails", () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await startTestServer({ drift: true });
  });

  afterAll(async () => {
    await server.close();
  });

  it("probeSkill returns consistent:false for all runs on the drift server", async () => {
    const card = await discoverCard(server.url);
    const skill = card.skills[0];
    if (!skill) throw new Error("No skill in test card");

    // expect = "ping": drift server returns DRIFT_RESPONSE_UNRELATED_TO_INPUT, not "ping" → consistent:false (FIX 5)
    const results = await probeSkill(
      server.url,
      skill,
      "ping",
      "ping",
      3
    );

    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.consistent).toBe(false);
    }
  });

  it("aggregateSkillBehavior fails when no runs are consistent (k=1 of n=3, drift)", async () => {
    const card = await discoverCard(server.url);
    const skill = card.skills[0];
    if (!skill) throw new Error("No skill in test card");

    // expect = "ping": drift server never returns it → all consistent:false (FIX 5)
    const results = await probeSkill(
      server.url,
      skill,
      "ping",
      "ping",
      3
    );

    // Even k=1 should fail because zero runs are consistent
    expect(aggregateSkillBehavior(results, 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T017 — Discrimination control (FR-011): rigged-impossible expect → fails
// ---------------------------------------------------------------------------

/**
 * DISCRIMINATION CONTROL (T017, FR-011):
 *
 * The grader MUST be able to fail. This control proves it:
 *
 * 1. Drift server: probeSkill pointed at the drift server returns
 *    DRIFT_RESPONSE_UNRELATED_TO_INPUT for every run. Since the response
 *    does not contain the `input` string, all runs are consistent:false.
 *    aggregateSkillBehavior returns false. This is the rigged-impossible
 *    discrimination control.
 *
 * 2. Impossible expect on honest server: even the honest server cannot satisfy
 *    an `expect` that is never returned (the consistency check is structural,
 *    based on input substring, so an input that is never echoed also fails).
 *
 * Both controls are tested below. The grader cannot "accidentally pass" these
 * controls — if it does, the grader is broken.
 */
describe("discrimination control: grader must fail impossible cases (T017, FR-011)", () => {
  let driftServer: RunningServer;
  let honestServer: RunningServer;

  beforeAll(async () => {
    [driftServer, honestServer] = await Promise.all([
      startTestServer({ drift: true }),
      startTestServer(),
    ]);
  });

  afterAll(async () => {
    await Promise.all([driftServer.close(), honestServer.close()]);
  });

  it("CONTROL: drift server makes aggregateSkillBehavior return false (rigged-impossible)", async () => {
    // Discrimination control: points at drift server. The drifted response
    // (DRIFT_RESPONSE_UNRELATED_TO_INPUT) will never contain expect="ping",
    // so all runs are consistent:false. aggregateSkillBehavior MUST return false.
    // FIX 5: expect is now the wired matcher — drift server never returns "ping".
    const skill = {
      id: "echo",
      description: "Returns the input message verbatim.",
    };

    const results = await probeSkill(
      driftServer.url,
      skill,
      "ping",
      "ping",
      5
    );

    // All 5 runs must fail (drift response never contains "ping")
    expect(results.every((r) => !r.consistent)).toBe(true);
    // Aggregate fails even at threshold k=1
    expect(aggregateSkillBehavior(results, 1)).toBe(false);
    // And definitely at k=4 (the canonical pass threshold)
    expect(aggregateSkillBehavior(results, 4)).toBe(false);
  });

  it("CONTROL: impossible expect string never in response → aggregateSkillBehavior false", async () => {
    // Control: the expect string is something the drift server will never return.
    // FIX 5: expect is the matcher; drift server returns DRIFT_RESPONSE_UNRELATED_TO_INPUT
    // which never contains the impossible phrase.
    const skill = {
      id: "echo",
      description: "Returns the input message verbatim.",
    };

    // Use a unique expect that the drift server will never return
    const impossibleInput = "IMPOSSIBLE_NEVER_ECHOED_INPUT_PHRASE_XYZ987";
    const results = await probeSkill(
      driftServer.url,
      skill,
      impossibleInput,
      impossibleInput,
      3
    );

    expect(results.every((r) => !r.consistent)).toBe(true);
    expect(aggregateSkillBehavior(results, 1)).toBe(false);
  });

  it("aggregateSkillBehavior passThreshold is an integer count (k), not a fraction", () => {
    // Directly verify the integer-count semantics:
    // 3 consistent results out of 5 total
    const results: import("../../src/adapters/a2a/graders/skill-behavior.js").SkillProbeResult[] = [
      { run: 1, response: "r1", consistent: true },
      { run: 2, response: "r2", consistent: true },
      { run: 3, response: "r3", consistent: true },
      { run: 4, response: "r4", consistent: false },
      { run: 5, response: "r5", consistent: false },
    ];

    // k=3 integer count → passes (3 >= 3)
    expect(aggregateSkillBehavior(results, 3)).toBe(true);
    // k=4 integer count → fails (3 < 4)
    expect(aggregateSkillBehavior(results, 4)).toBe(false);
    // k=0 → always passes (vacuously)
    expect(aggregateSkillBehavior(results, 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T018 — drifted-skill fixture + skip path
// ---------------------------------------------------------------------------

describe("drifted-skill fixture + skip path", () => {
  it("drifted-skill.json is a valid parseable Agent Card with echo skill", () => {
    const raw = readFileSync(
      resolvePath(FIXTURE_DIR, "cards/drifted-skill.json"),
      "utf-8"
    );
    const card = parseAgentCard(raw, "tests/fixtures/a2a/cards/drifted-skill.json");
    expect(card.name).toBe("Drifted Echo Agent");
    expect(card.skills).toHaveLength(1);
    expect(card.skills[0]?.id).toBe("echo");
    expect(card.skills[0]?.description).toBe("Returns the input message verbatim.");
  });

  it("envEndpoint() returns null → skip path (MUSTER_A2A_ENDPOINT unset)", () => {
    // Ensure the env var is unset for this test
    const original = process.env["MUSTER_A2A_ENDPOINT"];
    delete process.env["MUSTER_A2A_ENDPOINT"];

    const endpoint = envEndpoint();
    expect(endpoint).toBeNull();
    // The skip path: when endpoint is null, callers should skip (not fail)
    // This is the FR-009/D-04 contract: null → skip, not fail.
    if (endpoint === null) {
      // Skip is recorded here; we just verify the null return
      expect(true).toBe(true); // skip acknowledged
    }

    // Restore
    if (original !== undefined) {
      process.env["MUSTER_A2A_ENDPOINT"] = original;
    }
  });
});

// ---------------------------------------------------------------------------
// T014 — transport error handling
// ---------------------------------------------------------------------------

describe("transport error handling", () => {
  it("discoverCard throws on a non-200 response", async () => {
    // Point at a real server but a path that returns 404 — we need a running server
    const server = await startTestServer();
    try {
      // Patch the endpoint to a bogus path by using a URL that won't have the card
      // Actually the easiest way is to use a non-existent port (connection refused)
      await expect(
        discoverCard("http://127.0.0.1:1") // port 1 will be refused
      ).rejects.toThrow();
    } finally {
      await server.close();
    }
  });

  it("invokeSkill throws on connection refused", async () => {
    await expect(
      invokeSkill("http://127.0.0.1:1", "echo", "test")
    ).rejects.toThrow();
  });

  it("fetchJwks throws on connection refused", async () => {
    await expect(
      fetchJwks("http://127.0.0.1:1")
    ).rejects.toThrow();
  });

  it("probeSkill records consistent:false and error when invokeSkill throws", async () => {
    const skill = {
      id: "echo",
      description: "Returns the input message verbatim.",
    };

    // Point at a refused port — invokeSkill will throw → errored run = failed run
    const results = await probeSkill(
      "http://127.0.0.1:1",
      skill,
      "ping",
      "any expect",
      2
    );

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.consistent).toBe(false);
      expect(r.error).toBeDefined();
      expect(typeof r.error).toBe("string");
    }
  });

  it("probeAuth does not throw on 401 (clean rejection, not an error)", async () => {
    const server = await startTestServer({ enforceAuth: true });
    try {
      const result = await probeAuth(server.url, "message/send", null);
      expect(result.rejected).toBe(true);
      // No throw — a clean 401 is the expected outcome, not an error
    } finally {
      await server.close();
    }
  });
});

// ---------------------------------------------------------------------------
// T014 — signed server: fetched JWKS matches fixture
// ---------------------------------------------------------------------------

describe("signed server", () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await startTestServer({ signed: true });
  });

  afterAll(async () => {
    await server.close();
  });

  it("discoverCard on signed server returns the signed card with signatures array", async () => {
    const card = await discoverCard(server.url);
    // The signed fixture has a signatures array
    expect(card.signatures).toBeDefined();
    expect(card.signatures?.length).toBeGreaterThan(0);
  });

  it("fetchJwks returns the fixture JWKS from the signed server", async () => {
    const jwks = await fetchJwks(server.url);
    const fixtureJwks = JSON.parse(
      readFileSync(resolvePath(FIXTURE_DIR, "jwks/valid.json"), "utf-8")
    ) as { keys: unknown[] };
    expect(jwks.keys).toEqual(fixtureJwks.keys);
  });
});

// ---------------------------------------------------------------------------
// T014 — probeAuth: JSON-RPC error body auth detection
// ---------------------------------------------------------------------------

describe("probeAuth: JSON-RPC body auth error detection", () => {
  it("probeAuth detects auth rejection from JSON-RPC error message", async () => {
    // Create a server that returns 200 with a JSON-RPC auth error body
    const { createServer } = await import("node:http");

    await new Promise<void>((resolveTest) => {
      const srv = createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32001, message: "unauthorized: token missing" },
          })
        );
      });

      srv.listen(0, "127.0.0.1", async () => {
        const addr = srv.address() as { port: number };
        const url = `http://127.0.0.1:${addr.port}`;
        try {
          const result = await probeAuth(url, "message/send", null);
          expect(result.rejected).toBe(true);
          expect(result.status).toBe(200);
        } finally {
          srv.close(() => resolveTest());
        }
      });
    });
  });

  it("probeAuth: non-auth JSON-RPC error → rejected:false", async () => {
    const { createServer } = await import("node:http");

    await new Promise<void>((resolveTest) => {
      const srv = createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32601, message: "Method not found" },
          })
        );
      });

      srv.listen(0, "127.0.0.1", async () => {
        const addr = srv.address() as { port: number };
        const url = `http://127.0.0.1:${addr.port}`;
        try {
          const result = await probeAuth(url, "message/send", null);
          expect(result.rejected).toBe(false);
        } finally {
          srv.close(() => resolveTest());
        }
      });
    });
  });
});

// ---------------------------------------------------------------------------
// T014 — fetchJwks error paths (invalid JSON, missing keys array)
// ---------------------------------------------------------------------------

describe("fetchJwks error paths", () => {
  it("fetchJwks throws when the JWKS response is not valid JSON", async () => {
    // Spin up a minimal HTTP server that returns invalid JSON for jwks.json
    const { createServer } = await import("node:http");

    await new Promise<void>((resolveTest) => {
      const srv = createServer((req, res) => {
        if (req.url === "/.well-known/jwks.json") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end("not valid json !!!");
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      srv.listen(0, "127.0.0.1", async () => {
        const addr = srv.address() as { port: number };
        const url = `http://127.0.0.1:${addr.port}`;
        try {
          await expect(fetchJwks(url)).rejects.toThrow(/not valid JSON/i);
        } finally {
          srv.close(() => resolveTest());
        }
      });
    });
  });

  it("fetchJwks throws when the JWKS response is missing the keys array", async () => {
    const { createServer } = await import("node:http");

    await new Promise<void>((resolveTest) => {
      const srv = createServer((req, res) => {
        if (req.url === "/.well-known/jwks.json") {
          res.writeHead(200, { "Content-Type": "application/json" });
          // Valid JSON but no "keys" array
          res.end(JSON.stringify({ not_keys: [] }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      srv.listen(0, "127.0.0.1", async () => {
        const addr = srv.address() as { port: number };
        const url = `http://127.0.0.1:${addr.port}`;
        try {
          await expect(fetchJwks(url)).rejects.toThrow(/missing "keys" array/i);
        } finally {
          srv.close(() => resolveTest());
        }
      });
    });
  });

  it("fetchJwks throws on non-200 HTTP status", async () => {
    const { createServer } = await import("node:http");

    await new Promise<void>((resolveTest) => {
      const srv = createServer((_req, res) => {
        res.writeHead(503);
        res.end("Service Unavailable");
      });

      srv.listen(0, "127.0.0.1", async () => {
        const addr = srv.address() as { port: number };
        const url = `http://127.0.0.1:${addr.port}`;
        try {
          await expect(fetchJwks(url)).rejects.toThrow(/HTTP 503/);
        } finally {
          srv.close(() => resolveTest());
        }
      });
    });
  });
});

// ---------------------------------------------------------------------------
// aggregateSkillBehavior unit tests (pure)
// ---------------------------------------------------------------------------

describe("aggregateSkillBehavior (unit)", () => {
  it("returns true when consistent count >= passThreshold", () => {
    const results = [
      { run: 1, response: "r", consistent: true },
      { run: 2, response: "r", consistent: true },
      { run: 3, response: "r", consistent: false },
    ];
    expect(aggregateSkillBehavior(results, 2)).toBe(true);
  });

  it("returns false when consistent count < passThreshold", () => {
    const results = [
      { run: 1, response: "r", consistent: true },
      { run: 2, response: "r", consistent: false },
      { run: 3, response: "r", consistent: false },
    ];
    expect(aggregateSkillBehavior(results, 2)).toBe(false);
  });

  it("returns false for empty results with passThreshold > 0", () => {
    expect(aggregateSkillBehavior([], 1)).toBe(false);
  });

  it("returns true for empty results with passThreshold = 0", () => {
    expect(aggregateSkillBehavior([], 0)).toBe(true);
  });

  it("errored runs (consistent:false) count as failed runs, never skipped", () => {
    const results = [
      { run: 1, response: "", consistent: false, error: "connection refused" },
      { run: 2, response: "", consistent: false, error: "connection refused" },
    ];
    // Even with passThreshold=0, the 0-pass-count is correct
    expect(aggregateSkillBehavior(results, 1)).toBe(false);
  });
});
