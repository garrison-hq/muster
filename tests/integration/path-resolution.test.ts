/**
 * Regression: manifest-internal relative paths resolve against the manifest's
 * own directory, not process.cwd().
 *
 * Previously the memory, heartbeat, and skills CLI commands resolved relative
 * case paths (memoryPath, checklistPath, skillDir, ...) against process.cwd(),
 * so the shipped examples only ran from the repo root. They now resolve against
 * the manifest's directory, matching the other adapters (cts, behave, a2a,
 * crosslayer, sop, tools).
 *
 * How this test proves it: the example manifests use BARE manifest-relative
 * paths (e.g. "MEMORY.md", "checklists/daily-tasks.md", "valid/minimal"). We
 * invoke each command by ABSOLUTE manifest path while the test process cwd is
 * the repo root — a directory where those bare paths do NOT exist. Success can
 * therefore only mean the paths were resolved against the manifest directory.
 * Static cases run offline (no MUSTER_ENDPOINT), so this is deterministic.
 */

import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli, type RunCliOptions } from "../../src/cli/index.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

async function run(argv: string[]): Promise<{ code: number; stdout: string }> {
  let stdout = "";
  const opts: Pick<RunCliOptions, "out" | "err"> = {
    out: (t) => {
      stdout += t;
    },
    err: () => {},
  };
  const code = await runCli(argv, opts);
  return { code, stdout };
}

describe("manifest-relative path resolution (CLI, cwd-independent)", () => {
  let savedEndpoint: string | undefined;

  beforeAll(() => {
    // Force the static-only path so the examples run offline and deterministically.
    savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    // Sanity: the test cwd must NOT be a manifest directory, or the assertion
    // below would be vacuous.
    expect(process.cwd()).not.toBe(resolvePath(repoRoot, "examples/memory"));
  });

  afterAll(() => {
    if (savedEndpoint !== undefined) {
      process.env["MUSTER_ENDPOINT"] = savedEndpoint;
    }
  });

  it("memory: example with bare relative paths resolves against the manifest dir", async () => {
    const manifest = resolvePath(repoRoot, "examples/memory/manifest.json");
    const { code, stdout } = await run(["memory", "run", manifest]);
    expect(code).toBe(0);
    expect(stdout).toContain("PASS");
  });

  it("heartbeat: example with bare relative paths resolves against the manifest dir", async () => {
    const manifest = resolvePath(repoRoot, "examples/heartbeat/manifest.json");
    const { code, stdout } = await run(["heartbeat", "run", manifest]);
    expect(code).toBe(0);
    expect(stdout).toContain("PASS");
  });

  it("skills: example with bare relative skillDir resolves against the manifest dir", async () => {
    const manifest = resolvePath(repoRoot, "examples/skills/manifest.yaml");
    const { code, stdout } = await run(["skills", "run", manifest]);
    expect(code).toBe(0);
    expect(stdout).toContain("PASS");
  });
});
