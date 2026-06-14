/**
 * CLI-level tests for `muster tools run <manifest>` (tools adapter CLI wiring).
 *
 * Runs in-process via the exported `runCli(argv, options)` — no subprocess
 * spawn. Exercises the static-only (lint + drift) path, --json output,
 * exit-code contract, and error paths.
 *
 * The tools adapter has a static-only default path (lint + optional drift check)
 * and a behavioral path (selection probes, only when opts.endpoint is set in the
 * manifest runner). The CLI skips selection probes gracefully when MUSTER_ENDPOINT
 * is not set.
 *
 * Normative sources:
 * - contracts/cli.md exit codes: 0 = all pass, 1 = ≥1 failed, 2 = execution error
 * - NFR-001: static path is offline and deterministic
 * - FR-010: manifest runner orchestrates lint → drift → selection
 *
 * Fixture used: tests/tools/fixtures/manifest.json
 *   - tools-well-formed: well-formed.md, expect: "pass" → case passes
 *   - tools-missing-section: missing-section.md, expect: "fail" → case passes (expectation met)
 */

import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCli, type RunCliOptions } from "../../src/cli/index.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const toolsManifest = resolvePath(
  repoRoot,
  "tests/tools/fixtures/manifest.json"
);
// A manifest with only a passing case (well-formed tool, expect: pass).
const passingToolsManifest = resolvePath(
  repoRoot,
  "tests/tools/fixtures/manifest-passing.json"
);
// A manifest with only a failing case (missing section, expect: pass → but lint fails → case fails).
const failingToolsManifest = resolvePath(
  repoRoot,
  "tests/tools/fixtures/manifest-failing.json"
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

describe("muster tools run (CLI wiring, FR-010)", () => {
  it("static-only: exit 0 with human summary for a passing tools manifest", async () => {
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    try {
      const { code, stdout, stderr } = await run([
        "tools",
        "run",
        passingToolsManifest,
      ]);
      expect(code).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("tools: PASS");
    } finally {
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      }
    }
  });

  it("static-only: human summary contains per-case [PASS] lines", async () => {
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    try {
      const { stdout } = await run(["tools", "run", passingToolsManifest]);
      expect(stdout).toContain("[PASS] tools-well-formed");
    } finally {
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      }
    }
  });

  it("--json: exit 0 and emits parseable JSON on stdout (static-only)", async () => {
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    try {
      const { code, stdout, stderr } = await run([
        "tools",
        "run",
        passingToolsManifest,
        "--json",
      ]);
      expect(code).toBe(0);
      expect(stderr).toBe("");
      expect(() => JSON.parse(stdout)).not.toThrow();
      const parsed = JSON.parse(stdout) as { ok: boolean; results: unknown[] };
      expect(parsed.ok).toBe(true);
      expect(Array.isArray(parsed.results)).toBe(true);
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
      const { stdout } = await run([
        "tools",
        "run",
        passingToolsManifest,
        "--json",
      ]);
      expect(() => JSON.parse(stdout)).not.toThrow();
      expect(stdout.trimStart().startsWith("{")).toBe(true);
    } finally {
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      }
    }
  });

  it("exit 1 when a case fails (missing-section lint error, expect: pass)", async () => {
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    try {
      const { code, stdout } = await run(["tools", "run", failingToolsManifest]);
      expect(code).toBe(1);
      expect(stdout).toContain("FAIL");
    } finally {
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      }
    }
  });

  it("exit 2 for unreadable/missing manifest path", async () => {
    const { code, stdout, stderr } = await run([
      "tools",
      "run",
      "/tmp/does-not-exist-tools-manifest.json",
    ]);
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("tools manifest");
  });

  it("help text documents static-only behavior", async () => {
    const { code, stdout } = await run(["tools", "run", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("TOOLS.md");
  });

  it("NFR-001 byte-identity: two static-only runs produce identical JSON output", async () => {
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    try {
      const first = await run([
        "tools",
        "run",
        passingToolsManifest,
        "--json",
      ]);
      const second = await run([
        "tools",
        "run",
        passingToolsManifest,
        "--json",
      ]);
      expect(first.code).toBe(0);
      expect(first.stdout).toBe(second.stdout);
    } finally {
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      }
    }
  });
});
