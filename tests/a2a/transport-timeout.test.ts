/**
 * Transport timeout tests — FIX 1 / RISK-1.
 *
 * Proves that a hung endpoint becomes a thrown error (failed run, FR-010)
 * rather than blocking forever. All four transport functions are tested:
 * discoverCard, invokeSkill, probeAuth, fetchJwks.
 *
 * Mechanism: start an in-process test-server with `delayMs` set to a value
 * larger than the timeout, then set MUSTER_A2A_TIMEOUT_MS to a small value
 * (30 ms) so the AbortSignal fires before the server replies.
 *
 * FR-010 contract: a transport error (including abort/timeout) must THROW —
 * the caller records a failed run. The test asserts rejection, proving that
 * a hung endpoint no longer blocks indefinitely.
 *
 * Note: probeAuth must still treat a clean 401/403 as rejected (not a timeout);
 * this is verified in the auth-negative / skill-behavior test suites which rely
 * on the enforceAuth server. Here we only test the hang-becomes-abort path.
 *
 * Citation: muster rubric FR-010 (errored run = failed run); RISK-1 mission-review
 * finding (unbounded HTTP — transport.ts); A2A spec v1.0.0.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  discoverCard,
  invokeSkill,
  probeAuth,
  fetchJwks,
} from "../../src/adapters/a2a/transport.js";
import { startTestServer } from "../fixtures/a2a/server/test-server.js";
import type { RunningServer } from "../fixtures/a2a/server/test-server.js";

// ---------------------------------------------------------------------------
// Env management — restore MUSTER_A2A_TIMEOUT_MS after each test
// ---------------------------------------------------------------------------

const ORIGINAL_TIMEOUT = process.env["MUSTER_A2A_TIMEOUT_MS"];

afterEach(() => {
  if (ORIGINAL_TIMEOUT === undefined) {
    delete process.env["MUSTER_A2A_TIMEOUT_MS"];
  } else {
    process.env["MUSTER_A2A_TIMEOUT_MS"] = ORIGINAL_TIMEOUT;
  }
});

// ---------------------------------------------------------------------------
// Timeout constant: server delays 300 ms, client times out after 30 ms.
// This is a 10× safety margin so the test does not flake on slow CI.
// ---------------------------------------------------------------------------

const SERVER_DELAY_MS = 300;
const CLIENT_TIMEOUT_MS = "30";

// ---------------------------------------------------------------------------
// Helper: start a hang server and configure the transport timeout
// ---------------------------------------------------------------------------

async function startHangServer(): Promise<RunningServer> {
  return startTestServer({ delayMs: SERVER_DELAY_MS });
}

// ---------------------------------------------------------------------------
// discoverCard — hung GET /.well-known/agent-card.json → throws (FR-010)
// ---------------------------------------------------------------------------

describe("transport timeout: discoverCard", () => {
  it("rejects when the server hangs beyond MUSTER_A2A_TIMEOUT_MS", async () => {
    process.env["MUSTER_A2A_TIMEOUT_MS"] = CLIENT_TIMEOUT_MS;
    const server = await startHangServer();
    try {
      await expect(discoverCard(server.url)).rejects.toThrow();
    } finally {
      await server.close();
    }
  });

  it("error message mentions timeout-or-network (diagnosable)", async () => {
    process.env["MUSTER_A2A_TIMEOUT_MS"] = CLIENT_TIMEOUT_MS;
    const server = await startHangServer();
    try {
      await expect(discoverCard(server.url)).rejects.toThrow(/timeout-or-network/);
    } finally {
      await server.close();
    }
  });
});

// ---------------------------------------------------------------------------
// invokeSkill — hung POST / → throws (FR-010)
// ---------------------------------------------------------------------------

describe("transport timeout: invokeSkill", () => {
  it("rejects when the server hangs beyond MUSTER_A2A_TIMEOUT_MS", async () => {
    process.env["MUSTER_A2A_TIMEOUT_MS"] = CLIENT_TIMEOUT_MS;
    const server = await startHangServer();
    try {
      await expect(invokeSkill(server.url, "echo", "ping")).rejects.toThrow();
    } finally {
      await server.close();
    }
  });

  it("error message mentions timeout-or-network", async () => {
    process.env["MUSTER_A2A_TIMEOUT_MS"] = CLIENT_TIMEOUT_MS;
    const server = await startHangServer();
    try {
      await expect(invokeSkill(server.url, "echo", "ping")).rejects.toThrow(/timeout-or-network/);
    } finally {
      await server.close();
    }
  });
});

// ---------------------------------------------------------------------------
// probeAuth — hung POST / → throws (FR-010)
// A clean 401/403 is NOT affected: the delay is 300 ms vs 30 ms timeout.
// The server delays before ANY response, so a hung server always aborts.
// ---------------------------------------------------------------------------

describe("transport timeout: probeAuth", () => {
  it("rejects when the server hangs beyond MUSTER_A2A_TIMEOUT_MS", async () => {
    process.env["MUSTER_A2A_TIMEOUT_MS"] = CLIENT_TIMEOUT_MS;
    const server = await startHangServer();
    try {
      await expect(probeAuth(server.url, "message/send", null)).rejects.toThrow();
    } finally {
      await server.close();
    }
  });

  it("error message mentions timeout-or-network", async () => {
    process.env["MUSTER_A2A_TIMEOUT_MS"] = CLIENT_TIMEOUT_MS;
    const server = await startHangServer();
    try {
      await expect(probeAuth(server.url, "message/send", null)).rejects.toThrow(/timeout-or-network/);
    } finally {
      await server.close();
    }
  });
});

// ---------------------------------------------------------------------------
// fetchJwks — hung GET /.well-known/jwks.json → throws (FR-010)
// ---------------------------------------------------------------------------

describe("transport timeout: fetchJwks", () => {
  it("rejects when the server hangs beyond MUSTER_A2A_TIMEOUT_MS", async () => {
    process.env["MUSTER_A2A_TIMEOUT_MS"] = CLIENT_TIMEOUT_MS;
    const server = await startHangServer();
    try {
      await expect(fetchJwks(server.url)).rejects.toThrow();
    } finally {
      await server.close();
    }
  });

  it("error message mentions timeout-or-network", async () => {
    process.env["MUSTER_A2A_TIMEOUT_MS"] = CLIENT_TIMEOUT_MS;
    const server = await startHangServer();
    try {
      await expect(fetchJwks(server.url)).rejects.toThrow(/timeout-or-network/);
    } finally {
      await server.close();
    }
  });
});
