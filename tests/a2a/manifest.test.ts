/**
 * WP05 manifest runner integration tests — restructured per must-fix review notes.
 *
 * Tests (FR-012, FR-014, T025, T028, T029):
 *   (a) No endpoint set → static cases run, live cases skipped, failed=0, exit 0.
 *   (b) monitoring manifest.json vs the healthy server → failed:0, all live cases passed, exit 0.
 *   (c) controls manifest.controls.json vs the appropriate misbehaving modes →
 *       EVERY control:true case reports passed:true (control fires) with graderRawPassed:false.
 *   (d) A deliberately-failing live case → failed > 0 (exit 1) — exit-code contract proven.
 *
 * Two manifests:
 *   - tests/fixtures/a2a/manifest.json        — shipping CI-monitoring manifest; no controls.
 *     Offline (no endpoint) → 2 static pass, 3 live skipped → exit 0.
 *     Healthy endpoint → all pass, failed:0 → exit 0.
 *   - tests/fixtures/a2a/manifest.controls.json — harness-only discrimination controls (FR-011).
 *     Every control case must fire (grader fails as designed → case passes after inversion).
 *
 * Exit-code contract (FR-012): failed > 0 → exit 1; else exit 0; IO error → exit 2.
 * Skipped never flips the exit code.
 *
 * Citation: muster A2A adapter spec FR-012 / FR-014; A2A spec v1.0.0 §8.2 / §8.3.1 / §7.
 */

import { describe, it, expect, afterEach } from "vitest";
import { resolve as resolvePath } from "node:path";
import { runManifest } from "../../src/adapters/a2a/index.js";
import {
  startTestServer,
} from "../fixtures/a2a/server/test-server.js";
import type { RunningServer } from "../fixtures/a2a/server/test-server.js";

const MANIFEST_PATH = resolvePath("tests/fixtures/a2a/manifest.json");
const CONTROLS_MANIFEST_PATH = resolvePath("tests/fixtures/a2a/manifest.controls.json");
const PROJECT_ROOT = resolvePath(".");

// ---------------------------------------------------------------------------
// Env cleanup — run after every test to ensure a clean state
// ---------------------------------------------------------------------------

afterEach(() => {
  delete process.env["MUSTER_A2A_ENDPOINT"];
  delete process.env["MUSTER_A2A_TOKEN"];
});

// ---------------------------------------------------------------------------
// (a) No endpoint set: static cases run, live cases skipped → exit 0
// ---------------------------------------------------------------------------

describe("(a) No endpoint: static cases pass, live cases skipped, exit 0", () => {
  it("returns static cases not-skipped and live cases skipped", async () => {
    delete process.env["MUSTER_A2A_ENDPOINT"];

    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);

    const staticResults = summary.results.filter(
      (r) => r.gradingClass === "static-lint"
    );
    expect(staticResults.length).toBeGreaterThan(0);

    for (const r of staticResults) {
      expect(r.skipped).toBe(false);
    }

    const liveCases = summary.results.filter(
      (r) =>
        r.gradingClass === "skill-behavior" ||
        r.gradingClass === "auth-negative" ||
        r.gradingClass === "signed-card-live"
    );
    expect(liveCases.length).toBeGreaterThan(0);

    for (const r of liveCases) {
      expect(r.skipped).toBe(true);
      expect(r.skipReason).toContain("MUSTER_A2A_ENDPOINT not set");
    }
  });

  it("totalCases = passed + failed + skipped", async () => {
    delete process.env["MUSTER_A2A_ENDPOINT"];

    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);

    expect(summary.totalCases).toBe(
      summary.passed + summary.failed + summary.skipped
    );
  });

  it("static-discovery-ok passes (valid card)", async () => {
    delete process.env["MUSTER_A2A_ENDPOINT"];

    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "static-discovery-ok");

    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(true);
  });

  it("static-signed-ok passes (signed card verifies against the JWKS)", async () => {
    delete process.env["MUSTER_A2A_ENDPOINT"];

    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "static-signed-ok");

    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(true);
    expect(result?.detail?.["signature"]).toBe("verified");
  });

  it("offline run → failed:0 → maps to exit 0 (monitoring manifest has no static failures)", async () => {
    delete process.env["MUSTER_A2A_ENDPOINT"];

    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);

    // The monitoring manifest has no tampered-card or control cases — only
    // static passes and live-skipped cases → failed MUST be 0 offline.
    expect(summary.failed).toBe(0);
    const exitCode = summary.failed > 0 ? 1 : 0;
    expect(exitCode).toBe(0);
  });

  it("results are sorted by case id in UTF-16 code-unit order (NFR-001)", async () => {
    delete process.env["MUSTER_A2A_ENDPOINT"];

    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);

    const ids = summary.results.map((r) => r.id);
    const sorted = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(ids).toEqual(sorted);
  });

  it("skipped cases never contribute to failed count (FR-012)", async () => {
    delete process.env["MUSTER_A2A_ENDPOINT"];

    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);

    // Skipped cases must NOT appear in the failed tally.
    const countedFailed = summary.results.filter(
      (r) => !r.skipped && !r.passed
    ).length;
    expect(summary.failed).toBe(countedFailed);
    expect(summary.skipped).toBe(
      summary.results.filter((r) => r.skipped).length
    );
  });
});

// ---------------------------------------------------------------------------
// (b) Healthy server: monitoring manifest.json → failed:0, all live passed, exit 0
// ---------------------------------------------------------------------------

describe("(b) Healthy server: monitoring manifest → failed:0, exit 0", () => {
  let server: RunningServer;

  it("all cases pass (including all live cases), failed:0 → exit 0", async () => {
    server = await startTestServer({ healthy: true });
    try {
      process.env["MUSTER_A2A_ENDPOINT"] = server.url;
      process.env["MUSTER_A2A_TOKEN"] = "muster-test-bearer-token";

      const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);

      // No skipped cases — endpoint is set and healthy
      const skipped = summary.results.filter((r) => r.skipped);
      // signed-card-live may nested-skip only if JWKS unavailable — but healthy serves JWKS
      expect(skipped).toHaveLength(0);

      // All cases must pass
      for (const r of summary.results) {
        expect(r.passed).toBe(true);
        expect(r.skipped).toBe(false);
      }

      // failed:0 → exit 0
      expect(summary.failed).toBe(0);
      const exitCode = summary.failed > 0 ? 1 : 0;
      expect(exitCode).toBe(0);
    } finally {
      await server.close();
      delete process.env["MUSTER_A2A_ENDPOINT"];
      delete process.env["MUSTER_A2A_TOKEN"];
    }
  });

  it("skill-behaves-as-declared passes on the healthy echo server", async () => {
    server = await startTestServer({ healthy: true });
    try {
      process.env["MUSTER_A2A_ENDPOINT"] = server.url;
      process.env["MUSTER_A2A_TOKEN"] = "muster-test-bearer-token";

      const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);

      const result = summary.results.find(
        (r) => r.id === "skill-behaves-as-declared"
      );

      expect(result).toBeDefined();
      expect(result?.skipped).toBe(false);
      expect(result?.passed).toBe(true);
    } finally {
      await server.close();
      delete process.env["MUSTER_A2A_ENDPOINT"];
      delete process.env["MUSTER_A2A_TOKEN"];
    }
  });

  it("auth-enforced passes on the healthy (enforcing) server", async () => {
    server = await startTestServer({ healthy: true });
    try {
      process.env["MUSTER_A2A_ENDPOINT"] = server.url;

      const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);

      const result = summary.results.find((r) => r.id === "auth-enforced");

      expect(result).toBeDefined();
      expect(result?.skipped).toBe(false);
      expect(result?.passed).toBe(true);
    } finally {
      await server.close();
      delete process.env["MUSTER_A2A_ENDPOINT"];
    }
  });

  it("signed-card-live passes on the healthy (ephemerally signed) server", async () => {
    server = await startTestServer({ healthy: true });
    try {
      process.env["MUSTER_A2A_ENDPOINT"] = server.url;

      const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);

      const result = summary.results.find((r) => r.id === "signed-card-live");

      expect(result).toBeDefined();
      // Must not be nested-skipped (healthy server serves JWKS)
      expect(result?.skipped).toBe(false);
      expect(result?.passed).toBe(true);
    } finally {
      await server.close();
      delete process.env["MUSTER_A2A_ENDPOINT"];
    }
  });
});

// ---------------------------------------------------------------------------
// (c) Controls manifest: every control case fires (grader fails → case passes)
// ---------------------------------------------------------------------------

describe("(c) Controls manifest: every control fires (graderRawPassed:false, passed:true)", () => {
  let server: RunningServer;

  afterEach(async () => {
    if (server) {
      try {
        await server.close();
      } catch {
        // ignore
      }
    }
    delete process.env["MUSTER_A2A_ENDPOINT"];
    delete process.env["MUSTER_A2A_TOKEN"];
  });

  it("static-signature-control fires: tampered card fails JWS verification → control passes", async () => {
    delete process.env["MUSTER_A2A_ENDPOINT"];

    const summary = await runManifest(CONTROLS_MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "static-signature-control");

    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(true);
    expect(result?.detail?.["controlInverted"]).toBe(true);
    expect(result?.detail?.["graderRawPassed"]).toBe(false);
  });

  it("static-obsolete-uri-control fires: card at /.well-known/agent.json is flagged → ok:false → control passes", async () => {
    delete process.env["MUSTER_A2A_ENDPOINT"];

    const summary = await runManifest(CONTROLS_MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "static-obsolete-uri-control");

    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    // The §8.2 rule fires because discoveredFrom ends in /.well-known/agent.json
    // → lintCard returns ok:false → graderRawPassed:false → control passes (inverted)
    expect(result?.passed).toBe(true);
    expect(result?.detail?.["controlInverted"]).toBe(true);
    expect(result?.detail?.["graderRawPassed"]).toBe(false);
  });

  it("skill-behavior-control fires: drift response ≠ input → grader fails → control passes", async () => {
    server = await startTestServer({ drift: true });
    process.env["MUSTER_A2A_ENDPOINT"] = server.url;

    const summary = await runManifest(CONTROLS_MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "skill-behavior-control");

    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(true);
    expect(result?.detail?.["controlInverted"]).toBe(true);
    expect(result?.detail?.["graderRawPassed"]).toBe(false);
  });

  it("auth-control fires: server does not enforce auth → grader fails → control passes", async () => {
    server = await startTestServer({ drift: true });
    process.env["MUSTER_A2A_ENDPOINT"] = server.url;

    const summary = await runManifest(CONTROLS_MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "auth-control");

    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(true);
    expect(result?.detail?.["controlInverted"]).toBe(true);
    expect(result?.detail?.["graderRawPassed"]).toBe(false);
  });

  it("signed-card-live-control fires: unsigned (drift) card → grader fails → control passes", async () => {
    server = await startTestServer({ drift: true });
    process.env["MUSTER_A2A_ENDPOINT"] = server.url;

    const summary = await runManifest(CONTROLS_MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "signed-card-live-control");

    expect(result).toBeDefined();
    // The drift server serves an unsigned card; verifyCardJws returns verified:false.
    // The nested-skip only applies when the JWKS endpoint is DOWN. The drift server
    // does serve JWKS (loadJwks()) so there is no nested skip.
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(true);
    expect(result?.detail?.["controlInverted"]).toBe(true);
    expect(result?.detail?.["graderRawPassed"]).toBe(false);
  });

  it("all 5 controls fire in a single run against matching server modes", async () => {
    // Static controls: run offline (no server needed).
    // Live controls: run against the drift server.
    server = await startTestServer({ drift: true });
    process.env["MUSTER_A2A_ENDPOINT"] = server.url;

    const summary = await runManifest(CONTROLS_MANIFEST_PATH, PROJECT_ROOT);

    const controlResults = summary.results.filter(
      (r) => r.detail?.["controlInverted"] === true
    );

    // All 5 controls must have fired (non-skipped controls)
    const nonSkippedControls = summary.results.filter(
      (r) => r.detail?.["controlInverted"] === true && !r.skipped
    );
    expect(nonSkippedControls.length).toBe(5);

    for (const r of controlResults) {
      if (!r.skipped) {
        expect(r.passed).toBe(true);
        expect(r.detail?.["graderRawPassed"]).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// (d) Exit-code contract: a failing (non-control) case → failed > 0 → exit 1
// ---------------------------------------------------------------------------

describe("(d) Exit-code contract: failing case → failed>0 → exit 1 (FR-012)", () => {
  let server: RunningServer;

  afterEach(async () => {
    if (server) {
      try {
        await server.close();
      } catch {
        // ignore
      }
    }
    delete process.env["MUSTER_A2A_ENDPOINT"];
    delete process.env["MUSTER_A2A_TOKEN"];
  });

  it("a static failure in the controls manifest → failed>0 → exit 1 (grader raw failure, no inversion)", async () => {
    delete process.env["MUSTER_A2A_ENDPOINT"];

    // Use a temp manifest with a plain (non-control) static failure (tampered card, no inversion)
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const tmpDir = "/tmp/muster-a2a-exit-test";
    mkdirSync(tmpDir, { recursive: true });
    const tmpManifest = `${tmpDir}/failing.json`;
    writeFileSync(
      tmpManifest,
      JSON.stringify({
        adapter: "a2a",
        cases: [
          {
            id: "tampered-no-control",
            description: "tampered card without control inversion → plain failure",
            cardSource: resolvePath("tests/fixtures/a2a/cards/tampered.json"),
            gradingClass: "static-lint",
            signed: {
              jwksSource: resolvePath("tests/fixtures/a2a/jwks/valid.json"),
              expectVerified: false,
            },
            expectation: { ok: false },
          },
        ],
      })
    );

    const summary = await runManifest(tmpManifest, tmpDir);

    const result = summary.results.find((r) => r.id === "tampered-no-control");
    expect(result?.passed).toBe(false);
    expect(result?.skipped).toBe(false);

    expect(summary.failed).toBeGreaterThan(0);
    const exitCode = summary.failed > 0 ? 1 : 0;
    expect(exitCode).toBe(1);
  });

  it("live skill failure on drift server → failed>0 → exit 1", async () => {
    server = await startTestServer({ drift: true });
    process.env["MUSTER_A2A_ENDPOINT"] = server.url;

    // Use a temp manifest with a live skill-behavior case (no control inversion)
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const tmpDir = "/tmp/muster-a2a-exit-test";
    mkdirSync(tmpDir, { recursive: true });
    const tmpManifest = `${tmpDir}/live-failing.json`;
    writeFileSync(
      tmpManifest,
      JSON.stringify({
        adapter: "a2a",
        cases: [
          {
            id: "skill-drift-no-control",
            description: "skill-behavior on drift server without control → plain failure",
            cardSource: "well-known",
            gradingClass: "skill-behavior",
            skillProbe: {
              skillId: "echo",
              input: "ping",
              expect: "responds as the echo skill declares",
            },
            runs: 3,
            passThreshold: 3,
            expectation: { passed: false },
          },
        ],
      })
    );

    const summary = await runManifest(tmpManifest, tmpDir);

    const result = summary.results.find((r) => r.id === "skill-drift-no-control");
    expect(result?.passed).toBe(false);
    expect(result?.skipped).toBe(false);

    expect(summary.failed).toBeGreaterThan(0);
    const exitCode = summary.failed > 0 ? 1 : 0;
    expect(exitCode).toBe(1);
  });

  it("bad manifest path → throws (exit 2 from CLI)", async () => {
    delete process.env["MUSTER_A2A_ENDPOINT"];

    await expect(
      runManifest("/nonexistent/path/manifest.json", PROJECT_ROOT)
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// A2aAdapter class contract (T024)
// ---------------------------------------------------------------------------

describe("A2aAdapter class (T024)", () => {
  it("A2aAdapter.name === 'a2a'", async () => {
    const { A2aAdapter } = await import("../../src/adapters/a2a/index.js");
    const adapter = new A2aAdapter();
    expect(adapter.name).toBe("a2a");
  });

  it("A2aAdapter implements the SpecAdapter contract (stub methods return correct types)", async () => {
    const { A2aAdapter } = await import("../../src/adapters/a2a/index.js");
    const adapter = new A2aAdapter();

    expect(typeof adapter.specVersion).toBe("string");
    expect(adapter.mergeStrategy.scalars).toBe("replace");
    expect(adapter.mergeStrategy.maps).toBe("deep");
    expect(adapter.mergeStrategy.lists).toBe("replace");
    expect(adapter.mergeStrategy.nullIsValue).toBe(true);

    // Stub parse returns a SoulDocument
    const doc = adapter.parse("content", "path.md", "strict");
    expect(doc).toEqual({ path: "path.md", frontMatter: {}, body: "content", kind: "soul" });

    // Stub validate returns []
    const violations = adapter.validate(
      { path: "p", frontMatter: {}, body: "", kind: "soul" },
      "strict"
    );
    expect(violations).toEqual([]);

    // Stub resolve returns {}
    const resolved = await adapter.resolve(
      { path: "p", frontMatter: {}, body: "", kind: "soul" },
      { mode: "strict" },
      async () => ({ path: "r", frontMatter: {}, body: "", kind: "soul" })
    );
    expect(resolved).toEqual({});

    // Stub evaluateTriggers returns null
    const triggers = adapter.evaluateTriggers({}, {}, "strict");
    expect(triggers).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Public surface re-exports (T024)
// ---------------------------------------------------------------------------

describe("Public surface re-exports", () => {
  it("runManifest is exported from src/adapters/a2a/index.ts", async () => {
    const mod = await import("../../src/adapters/a2a/index.js");
    expect(typeof mod.runManifest).toBe("function");
  });

  it("lintCard is re-exported from src/adapters/a2a/index.ts", async () => {
    const mod = await import("../../src/adapters/a2a/index.js");
    expect(typeof mod.lintCard).toBe("function");
  });

  it("serializeLintReport is re-exported from src/adapters/a2a/index.ts", async () => {
    const mod = await import("../../src/adapters/a2a/index.js");
    expect(typeof mod.serializeLintReport).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// ThresholdMapping stubs coverage (C-001/C-004)
// ---------------------------------------------------------------------------

describe("A2aAdapter ThresholdMapping stubs (C-001)", () => {
  it("thresholds.maxWords returns 10 + verbosity", async () => {
    const { A2aAdapter } = await import("../../src/adapters/a2a/index.js");
    const adapter = new A2aAdapter();
    expect(adapter.thresholds.maxWords(0)).toBe(10);
    expect(adapter.thresholds.maxWords(5)).toBe(15);
  });

  it("thresholds.refusalCap is 25", async () => {
    const { A2aAdapter } = await import("../../src/adapters/a2a/index.js");
    const adapter = new A2aAdapter();
    expect(adapter.thresholds.refusalCap).toBe(25);
  });

  it("thresholds.words counts whitespace-split tokens", async () => {
    const { A2aAdapter } = await import("../../src/adapters/a2a/index.js");
    const adapter = new A2aAdapter();
    expect(adapter.thresholds.words("hello world")).toBe(2);
    expect(adapter.thresholds.words("  one  two  three  ")).toBe(3);
    expect(adapter.thresholds.words("")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Error path coverage: missing skillProbe / auth block via temp manifests
// ---------------------------------------------------------------------------

describe("Error paths: missing skillProbe and auth blocks", () => {
  let server: RunningServer;

  afterEach(async () => {
    if (server) {
      try {
        await server.close();
      } catch {
        // ignore
      }
    }
    delete process.env["MUSTER_A2A_ENDPOINT"];
  });

  it("skill-behavior case with missing skillProbe → passed:false, not skipped", async () => {
    server = await startTestServer();
    process.env["MUSTER_A2A_ENDPOINT"] = server.url;

    const { writeFileSync, mkdirSync } = await import("node:fs");
    const tmpDir = "/tmp/muster-a2a-test";
    mkdirSync(tmpDir, { recursive: true });
    const tmpManifest = `${tmpDir}/no-skillprobe.json`;
    writeFileSync(
      tmpManifest,
      JSON.stringify({
        adapter: "a2a",
        cases: [
          {
            id: "no-skillprobe",
            description: "skill-behavior without skillProbe",
            cardSource: "well-known",
            gradingClass: "skill-behavior",
            expectation: {},
          },
        ],
      })
    );

    const summary = await runManifest(tmpManifest, tmpDir);

    const result = summary.results.find((r) => r.id === "no-skillprobe");
    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(false);
    expect(result?.detail?.["error"]).toContain("missing skillProbe");
  });

  it("auth-negative case with missing auth block → passed:false, not skipped", async () => {
    server = await startTestServer();
    process.env["MUSTER_A2A_ENDPOINT"] = server.url;

    const { writeFileSync, mkdirSync } = await import("node:fs");
    const tmpDir = "/tmp/muster-a2a-test";
    mkdirSync(tmpDir, { recursive: true });
    const tmpManifest = `${tmpDir}/no-auth.json`;
    writeFileSync(
      tmpManifest,
      JSON.stringify({
        adapter: "a2a",
        cases: [
          {
            id: "no-auth",
            description: "auth-negative without auth block",
            cardSource: "well-known",
            gradingClass: "auth-negative",
            expectation: {},
          },
        ],
      })
    );

    const summary = await runManifest(tmpManifest, tmpDir);

    const result = summary.results.find((r) => r.id === "no-auth");
    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(false);
    expect(result?.detail?.["error"]).toContain("missing auth block");
  });

  it("static-lint with unreadable card file → passed:false, not skipped", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const tmpDir = "/tmp/muster-a2a-test";
    mkdirSync(tmpDir, { recursive: true });
    const tmpManifest = `${tmpDir}/bad-card.json`;
    writeFileSync(
      tmpManifest,
      JSON.stringify({
        adapter: "a2a",
        cases: [
          {
            id: "bad-card",
            description: "static-lint with nonexistent card",
            cardSource: "/nonexistent/path/card.json",
            gradingClass: "static-lint",
            expectation: {},
          },
        ],
      })
    );

    const summary = await runManifest(tmpManifest, tmpDir);

    const result = summary.results.find((r) => r.id === "bad-card");
    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(false);
    expect(result?.detail?.["error"]).toContain("Cannot read card fixture");
  });

  it("static-lint with unreadable JWKS file → passed:false, not skipped", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const tmpDir = "/tmp/muster-a2a-test";
    mkdirSync(tmpDir, { recursive: true });
    const tmpManifest = `${tmpDir}/bad-jwks.json`;
    writeFileSync(
      tmpManifest,
      JSON.stringify({
        adapter: "a2a",
        cases: [
          {
            id: "bad-jwks",
            description: "static-lint with nonexistent JWKS",
            cardSource: resolvePath("tests/fixtures/a2a/cards/signed.json"),
            gradingClass: "static-lint",
            signed: {
              jwksSource: "/nonexistent/jwks.json",
              expectVerified: true,
            },
            expectation: {},
          },
        ],
      })
    );

    const summary = await runManifest(tmpManifest, tmpDir);

    const result = summary.results.find((r) => r.id === "bad-jwks");
    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(false);
    expect(result?.detail?.["error"]).toContain("Cannot read JWKS fixture");
  });
});
