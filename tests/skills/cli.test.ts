/**
 * CLI-level tests for `muster skills run <manifest>` (WP04 deliverable).
 *
 * Runs in-process via the exported `runCli(argv, options)` — no subprocess
 * spawn. Exercises the static-only path (no MUSTER_ENDPOINT), --json output,
 * exit-code contract, and error paths.
 *
 * Normative sources:
 * - contracts/cli.md exit codes: 0 = all pass, 1 = ≥1 failed, 2 = execution error
 * - NFR-001: static path is offline and deterministic
 * - FR-013: manifest runner returns structured results
 */

import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCli, type RunCliOptions } from "../../src/cli/index.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const skillsManifest = resolvePath(repoRoot, "fixtures/skills/skills-manifest.yaml");

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

describe("muster skills run (CLI wiring, FR-013)", () => {
  it("static-only: exit 0 with human summary for a passing manifest", async () => {
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    try {
      const { code, stdout, stderr } = await run([
        "skills",
        "run",
        skillsManifest,
      ]);
      expect(code).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("skills: PASS");
    } finally {
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      }
    }
  });

  it("static-only: human summary contains per-case PASS/SKIP lines", async () => {
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    try {
      const { stdout } = await run(["skills", "run", skillsManifest]);
      // Static cases pass when their outcome matches their expectation.
      // valid-minimal expects ok: true → lint passes → [PASS].
      // broken-name-missing expects ok: false → lint fails → outcome matches → [PASS].
      expect(stdout).toContain("[PASS] valid-minimal");
      expect(stdout).toContain("[PASS] broken-name-missing");
      // Behavioral cases are skipped when MUSTER_ENDPOINT absent
      expect(stdout).toContain("[SKIP] behavioral-weather-skill");
      expect(stdout).toContain("[SKIP] behavioral-rigged-control");
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
        "skills",
        "run",
        skillsManifest,
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
      const { stdout } = await run(["skills", "run", skillsManifest, "--json"]);
      expect(() => JSON.parse(stdout)).not.toThrow();
      expect(stdout.trimStart().startsWith("{")).toBe(true);
    } finally {
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      }
    }
  });

  it("exit 1 when a broken skill dir is the only case (rigged manifest)", async () => {
    // A manifest with only a broken skill — should exit 1.
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    try {
      // We point to the skills manifest but rely on the fact that broken cases
      // cause failures. We write a minimal inline manifest to a temp path.
      const { writeFileSync, unlinkSync } = await import("node:fs");
      const tmpPath = "/tmp/skills-cli-rigged-manifest.yaml";
      const brokenCaseManifest = [
        "cases:",
        "  - id: broken-name-missing",
        "    type: static",
        "    skillDir: fixtures/skills/broken/name-missing",
        "    profile: base",
        "    expectations:",
        "      ok: true",
        "      violations: []",
      ].join("\n");
      writeFileSync(tmpPath, brokenCaseManifest);
      try {
        const { code, stdout } = await run(["skills", "run", tmpPath]);
        expect(code).toBe(1);
        expect(stdout).toContain("FAIL");
      } finally {
        unlinkSync(tmpPath);
      }
    } finally {
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      }
    }
  });

  it("exit 2 for unreadable/missing manifest path", async () => {
    const { code, stdout, stderr } = await run([
      "skills",
      "run",
      "/tmp/does-not-exist-skills-manifest.yaml",
    ]);
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("skills manifest");
  });

  it("help text documents MUSTER_ENDPOINT env var contract", async () => {
    const { code, stdout } = await run(["skills", "run", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("MUSTER_ENDPOINT");
  });

  it("NFR-001 byte-identity: two static-only runs produce identical JSON output", async () => {
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    try {
      const first = await run(["skills", "run", skillsManifest, "--json"]);
      const second = await run(["skills", "run", skillsManifest, "--json"]);
      expect(first.code).toBe(0);
      expect(first.stdout).toBe(second.stdout);
    } finally {
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      }
    }
  });
});
