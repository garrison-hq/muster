/**
 * CLI-level tests for `muster sop run <manifest>` (openclaw-sop adapter CLI wiring).
 *
 * Runs in-process via the exported `runCli(argv, options)` — no subprocess
 * spawn. Exercises the static-only (lint) path when MUSTER_ENDPOINT is absent,
 * --json output, exit-code contract, and error paths.
 *
 * Normative sources:
 * - contracts/cli.md exit codes: 0 = all pass, 1 = ≥1 failed, 2 = execution error
 * - NFR-001: static path is offline and deterministic
 * - FR-003: runStaticLint orchestrates static lint detectors
 *
 * Fixture used: tests/adapters/openclaw-sop/fixtures/rule-manifest-valid.yaml
 * This manifest has NO inline probes section, so only static lint runs.
 * The SOP file it references (agents-wellformed.md) is well-formed → lint passes.
 */

import { writeFileSync, unlinkSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCli, type RunCliOptions } from "../../src/cli/index.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
// A manifest whose SOP file passes static lint and has no inline probes
// (pure static-only path: no ChatClient required).
const sopValidManifest = resolvePath(
  repoRoot,
  "tests/adapters/openclaw-sop/fixtures/rule-manifest-valid.yaml"
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

describe("muster sop run (CLI wiring, FR-003, FR-011)", () => {
  it("static-only: exit 0 with human summary for a well-formed SOP manifest", async () => {
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    try {
      const { code, stdout, stderr } = await run([
        "sop",
        "run",
        sopValidManifest,
      ]);
      expect(code).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("sop: PASS");
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
        "sop",
        "run",
        sopValidManifest,
        "--json",
      ]);
      expect(code).toBe(0);
      expect(stderr).toBe("");
      expect(() => JSON.parse(stdout)).not.toThrow();
      const parsed = JSON.parse(stdout) as { passed: boolean; adapter: string };
      expect(parsed.passed).toBe(true);
      expect(parsed.adapter).toBe("openclaw-sop");
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
      const { stdout } = await run(["sop", "run", sopValidManifest, "--json"]);
      expect(() => JSON.parse(stdout)).not.toThrow();
      expect(stdout.trimStart().startsWith("{")).toBe(true);
    } finally {
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      }
    }
  });

  it("exit 1 when SOP manifest references a non-existent SOP file (lint error)", async () => {
    // A minimal manifest pointing at a non-existent SOP file triggers a
    // STRUCTURAL_ABSENCE error finding → passed: false → exit 1.
    // No probes section: the probe dispatcher produces no verdicts.
    const tmpPath = "/tmp/sop-cli-rigged-manifest.yaml";
    const riggedManifest = [
      `version: "1.0.0"`,
      `sopFile: "does-not-exist-sop.md"`,
      `rules: []`,
    ].join("\n");
    writeFileSync(tmpPath, riggedManifest);
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    try {
      const { code, stdout } = await run(["sop", "run", tmpPath]);
      expect(code).toBe(1);
      expect(stdout).toContain("FAIL");
    } finally {
      unlinkSync(tmpPath);
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      }
    }
  });

  it("exit 2 for unreadable/missing manifest path", async () => {
    const { code, stdout, stderr } = await run([
      "sop",
      "run",
      "/tmp/does-not-exist-sop-manifest.yaml",
    ]);
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("sop manifest");
  });

  it("help text documents MUSTER_ENDPOINT env var contract", async () => {
    const { code, stdout } = await run(["sop", "run", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("MUSTER_ENDPOINT");
  });

  it("NFR-001 byte-stability: two static-only runs produce identical JSON output", async () => {
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    try {
      const first = await run(["sop", "run", sopValidManifest, "--json"]);
      const second = await run(["sop", "run", sopValidManifest, "--json"]);
      expect(first.code).toBe(0);
      // ranAt is a timestamp — exclude from byte-stability check
      const parse = (s: string): unknown => {
        const obj = JSON.parse(s) as Record<string, unknown>;
        delete obj["ranAt"];
        return obj;
      };
      expect(JSON.stringify(parse(first.stdout))).toBe(
        JSON.stringify(parse(second.stdout))
      );
    } finally {
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      }
    }
  });
});
