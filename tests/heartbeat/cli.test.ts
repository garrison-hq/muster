/**
 * CLI-level tests for `muster heartbeat run <manifest>` (WP04 deliverable #4).
 *
 * Runs in-process via the exported `runCli(argv, options)` — no subprocess
 * spawn. Exercises the static-only path (no MUSTER_ENDPOINT), --json output,
 * exit-code contract, and error paths.
 *
 * Normative sources:
 * - contracts/cli.md exit codes: 0 = all pass/skip, 1 = ≥1 failed, 2 = execution error
 * - NFR-001: static path is offline and deterministic
 * - FR-011: manifest runner returns ManifestSummary
 */

import { writeFileSync, unlinkSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCli, type RunCliOptions } from "../../src/cli/index.js";
import type { ManifestSummary as HeartbeatManifestSummary } from "../../src/adapters/heartbeat/index.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const heartbeatManifest = resolvePath(
  repoRoot,
  "tests/fixtures/heartbeat/manifest.json"
);

/** In-process invocation capturing stdout/stderr bytes exactly. */
async function run(
  argv: string[],
  extra: Pick<RunCliOptions, "clientFactory"> = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await runCli(argv, {
    out: (text) => {
      stdout += text;
    },
    err: (text) => {
      stderr += text;
    },
    ...extra,
  });
  return { code, stdout, stderr };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("muster heartbeat run (WP04 CLI wiring, FR-011)", () => {
  it("static-only: exit 0 with human summary when no MUSTER_ENDPOINT is set", async () => {
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    try {
      const { code, stdout, stderr } = await run([
        "heartbeat",
        "run",
        heartbeatManifest,
      ]);
      expect(code).toBe(0);
      expect(stderr).toBe("");
      // Human summary line
      expect(stdout).toContain("heartbeat: PASS");
      // Static cases pass
      expect(stdout).toContain("PASS hb-static-001");
      expect(stdout).toContain("PASS hb-static-002");
      expect(stdout).toContain("PASS hb-static-003");
      expect(stdout).toContain("PASS hb-static-004");
      expect(stdout).toContain("PASS hb-config-001");
      // Behavioral cases are skipped (no endpoint)
      expect(stdout).toContain("SKIP hb-behavioral-001");
      expect(stdout).toContain("SKIP hb-behavioral-002");
      expect(stdout).toContain("SKIP hb-behavioral-003");
    } finally {
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      }
    }
  });

  it("static-only: summary line contains pass/fail/skip counts", async () => {
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    try {
      const { stdout } = await run(["heartbeat", "run", heartbeatManifest]);
      // 5 passed (4 static + 1 config), 0 failed, 3 skipped (behavioral)
      expect(stdout).toMatch(/5 passed, 0 failed, 3 skipped of 8/);
    } finally {
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      }
    }
  });

  it("--json: exit 0 and emits ManifestSummary JSON on stdout (static-only)", async () => {
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    try {
      const { code, stdout, stderr } = await run([
        "heartbeat",
        "run",
        heartbeatManifest,
        "--json",
      ]);
      expect(code).toBe(0);
      expect(stderr).toBe("");
      const summary = JSON.parse(stdout) as HeartbeatManifestSummary;
      expect(summary.totalCases).toBe(8);
      expect(summary.passed).toBe(5);
      expect(summary.failed).toBe(0);
      expect(summary.skipped).toBe(3);
      expect(Array.isArray(summary.results)).toBe(true);
    } finally {
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      }
    }
  });

  it("--json: stdout is pure parseable JSON (stdout purity)", async () => {
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    try {
      const { code, stdout } = await run([
        "heartbeat",
        "run",
        heartbeatManifest,
        "--json",
      ]);
      expect(code).toBe(0);
      expect(() => JSON.parse(stdout)).not.toThrow();
      expect(stdout.trimStart().startsWith("{")).toBe(true);
    } finally {
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      }
    }
  });

  it("exit 1 when a case fails (rigged manifest)", async () => {
    // Create a manifest with an expectation that cannot match (discrimination control).
    const riggedManifest = {
      cases: [
        {
          id: "hb-static-001",
          description: "valid-concise passes",
          checklistPath: "tests/fixtures/heartbeat/checklists/valid-concise.md",
          itemRecurrence: [],
          tickState: null,
          intervalConfig:
            "tests/fixtures/heartbeat/interval-configs/default-30m.json",
          gradingClass: "static-lint",
          // Rigged: expects ok: false for a valid file — must fail.
          expectation: { ok: false },
        },
      ],
    };
    const tmpPath = "/tmp/hb-cli-rigged.json";
    writeFileSync(tmpPath, JSON.stringify(riggedManifest));
    try {
      const { code, stdout } = await run(["heartbeat", "run", tmpPath]);
      expect(code).toBe(1);
      expect(stdout).toContain("FAIL");
    } finally {
      unlinkSync(tmpPath);
    }
  });

  it("exit 2 for unreadable/missing manifest path", async () => {
    const { code, stdout, stderr } = await run([
      "heartbeat",
      "run",
      "/tmp/does-not-exist-heartbeat-manifest.json",
    ]);
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("heartbeat manifest run failed");
  });

  it("help text documents MUSTER_ENDPOINT env var contract", async () => {
    const { code, stdout } = await run(["heartbeat", "run", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("MUSTER_ENDPOINT");
  });

  it("NFR-001 byte-identity: two static-only runs produce identical output", async () => {
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    try {
      const first = await run(["heartbeat", "run", heartbeatManifest, "--json"]);
      const second = await run(["heartbeat", "run", heartbeatManifest, "--json"]);
      expect(first.code).toBe(0);
      expect(first.stdout).toBe(second.stdout);
    } finally {
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      }
    }
  });
});
