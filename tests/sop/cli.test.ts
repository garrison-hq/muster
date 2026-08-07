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
import type { ChatClient } from "../../src/core/behavioral/types.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
// A manifest whose SOP file passes static lint and has no inline probes
// (pure static-only path: no ChatClient required).
const sopValidManifest = resolvePath(
  repoRoot,
  "tests/adapters/openclaw-sop/fixtures/rule-manifest-valid.yaml"
);
// A manifest with exactly one inline probe (single rule, single compliance
// probe, k=1) — used by the "endpoint configured" provenance test below.
const sopProbeManifest = resolvePath(
  repoRoot,
  "tests/adapters/openclaw-sop/fixtures/rule-manifest-runner-sc001.yaml"
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

  it("FR-001/WP01-C1-001: endpoint configured — injected clientFactory's real model/baseUrl reach transcript provenance (not the mock literal)", async () => {
    // Regression test for cycle-1 finding WP01-C1-001: buildSopClient's
    // "endpoint configured" branch (src/cli/index.ts buildSopClient/doSopRun)
    // was previously unreachable by any test — MUSTER_ENDPOINT was always
    // deleted before invoking `sop run`, and doSopRun had no clientFactory
    // seam, so the real makeClient(endpoint) call could only be exercised
    // with live network I/O. This test sets MUSTER_ENDPOINT/MUSTER_MODEL and
    // injects a stub ChatClient via runCli's clientFactory seam (mirroring
    // doBehaveRun/doMemoryUtilizationRun), then asserts the JSON output's
    // transcript carries the injected identity end-to-end — closing the gap
    // the mock-literal bug (#90) lived in.
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    const savedModel = process.env["MUSTER_MODEL"];
    process.env["MUSTER_ENDPOINT"] = "https://injected-endpoint.example.com/v1";
    process.env["MUSTER_MODEL"] = "injected-model-x1";
    let factoryCalled = false;
    const stubClient: ChatClient = {
      async chat(): Promise<string> {
        // Response contains none of the manifest's forbidden strings, so the
        // single probe (rule-manifest-runner-sc001.yaml) passes.
        return "The weather today is calm and clear.";
      },
    };
    try {
      const { code, stdout, stderr } = await run(
        ["sop", "run", sopProbeManifest, "--json"],
        {
          clientFactory: (endpoint) => {
            factoryCalled = true;
            // The endpoint passed to the factory must be the real configured
            // one — not a stray sentinel. A field-swap bug (e.g. `model:
            // baseUrl, baseUrl: model` in buildSopClient's returned bundle)
            // would not corrupt this argument, but WOULD corrupt what ends
            // up in the transcript assertions below.
            expect(endpoint.baseUrl).toBe("https://injected-endpoint.example.com/v1");
            expect(endpoint.model).toBe("injected-model-x1");
            return stubClient;
          },
        }
      );
      expect(stderr).toBe("");
      expect(code).toBe(0);
      expect(factoryCalled).toBe(true);

      const parsed = JSON.parse(stdout) as {
        verdicts: Array<{ runs: Array<{ transcript: { model: string; baseUrl: string } }> }>;
      };
      expect(parsed.verdicts.length).toBeGreaterThanOrEqual(1);
      expect(parsed.verdicts[0]?.runs.length).toBeGreaterThanOrEqual(1);
      const transcript = parsed.verdicts[0]?.runs[0]?.transcript;
      // The exact swap the reviewer flagged as undetectable
      // (`return { client: makeClient(endpoint), model: baseUrl, baseUrl:
      // model }`) would make these two assertions fail against each other:
      // model would come back as the URL, baseUrl as the model string.
      expect(transcript?.model).toBe("injected-model-x1");
      expect(transcript?.baseUrl).toBe("injected-endpoint.example.com");
      expect(transcript?.model).not.toBe("mock");
      expect(transcript?.baseUrl).not.toBe("mock://test");
      expect(transcript?.model).not.toBe("unconfigured");
      expect(transcript?.baseUrl).not.toBe("unconfigured://no-endpoint");
    } finally {
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      } else {
        delete process.env["MUSTER_ENDPOINT"];
      }
      if (savedModel !== undefined) {
        process.env["MUSTER_MODEL"] = savedModel;
      } else {
        delete process.env["MUSTER_MODEL"];
      }
    }
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
