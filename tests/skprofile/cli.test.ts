/**
 * cli.test.ts — WP03 T019 step 3: `muster skprofile run <manifest>` driven
 * entirely IN-PROCESS via the exported `runCli(argv, options)` — no
 * subprocess spawn, matching `tests/memory-utilization/cli.test.ts`'s house
 * convention. This adapter is entirely static/offline (research.md R8), so
 * unlike `memory-utilization`'s CLI suite, no scripted `ChatClient` is ever
 * needed here.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/index.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/** In-process invocation capturing stdout/stderr bytes exactly. */
async function run(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await runCli(argv, {
    out: (text) => {
      stdout += text;
    },
    err: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "muster-skprofile-cli-test-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("muster skprofile run <manifest> (WP03 T016/T019)", () => {
  it("exit 0: the clean muster-local fixture manifest, --json", async () => {
    const manifestPath = resolvePath(repoRoot, "fixtures/skprofile/manifest.yaml");
    const { code, stdout, stderr } = await run(["skprofile", "run", manifestPath, "--json"]);

    expect(code).toBe(0);
    expect(stderr).toBe("");
    const report = JSON.parse(stdout) as {
      ok: boolean;
      exitCode: number;
      rubricDocPath: string;
      findings: unknown[];
      cases: Array<{ caseId: string }>;
    };
    expect(report.ok).toBe(true);
    expect(report.exitCode).toBe(0);
    expect(report.rubricDocPath).toBe("docs/rubric/spec-kitty-profile-taxonomy.md");
    expect(report.cases).toHaveLength(1);
  });

  it("exit 0: the shipped runnable example manifest, --json, zero findings", async () => {
    const manifestPath = resolvePath(repoRoot, "examples/skprofile/manifest.yaml");
    const { code, stdout } = await run(["skprofile", "run", manifestPath, "--json"]);

    expect(code).toBe(0);
    const report = JSON.parse(stdout) as { ok: boolean; findings: unknown[] };
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });

  it("exit 1: the rigged-broken discrimination fixture manifest, --json", async () => {
    const manifestPath = resolvePath(repoRoot, "fixtures/skprofile/broken-manifest.yaml");
    const { code, stdout } = await run(["skprofile", "run", manifestPath, "--json"]);

    expect(code).toBe(1);
    const report = JSON.parse(stdout) as { ok: boolean; exitCode: number; findings: unknown[] };
    expect(report.ok).toBe(false);
    expect(report.exitCode).toBe(1);
    expect(report.findings).toHaveLength(13);
  });

  it("exit 2: unreadable/missing manifest path", async () => {
    const { code, stdout, stderr } = await run([
      "skprofile",
      "run",
      join(tempDir, "does-not-exist.yaml"),
    ]);
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("cannot read spec-kitty-profile manifest");
  });

  it("exit 2: projectionManifestPath points at a file containing invalid JSON (Scenario 14)", async () => {
    const badProjectionPath = join(tempDir, "bad-projection-manifest.json");
    await writeFile(badProjectionPath, "{ not valid json", "utf-8");

    const manifestPath = join(tempDir, "bad-projection-skprofile-manifest.yaml");
    await writeFile(
      manifestPath,
      [
        'version: "1.0.0"',
        `profilesDir: ${resolvePath(repoRoot, "fixtures/skprofile/clean")}`,
        `schemaPath: ${resolvePath(repoRoot, "fixtures/skprofile/agent-profile.schema.yaml")}`,
        "schemaSha: ebfbaddd653789417f89b040320ccfe452f15424",
        `doctrineRoot: ${resolvePath(repoRoot, "fixtures/skprofile/doctrine")}`,
        `projectionManifestPath: ${badProjectionPath}`,
        "cases:",
        "  - id: all-profiles",
        "",
      ].join("\n"),
      "utf-8"
    );

    const { code, stderr } = await run(["skprofile", "run", manifestPath]);
    expect(code).toBe(2);
    expect(stderr).toContain("spec-kitty-profile adapter run failed");
  });

  it("exit 1: a malformed *.agent.yaml file surfaces as a profile-parse-error finding, never disappears silently", async () => {
    const profilesDir = join(tempDir, "parse-error-profiles");
    await mkdir(profilesDir, { recursive: true });
    // Genuinely invalid YAML syntax (unterminated flow mapping) — a load/parse
    // failure, distinct from a well-formed-but-schema-invalid document.
    await writeFile(join(profilesDir, "broken-syntax.agent.yaml"), "profile-id: [unterminated\n", "utf-8");

    const manifestPath = join(tempDir, "parse-error-skprofile-manifest.yaml");
    await writeFile(
      manifestPath,
      [
        'version: "1.0.0"',
        `profilesDir: ${profilesDir}`,
        `schemaPath: ${resolvePath(repoRoot, "fixtures/skprofile/agent-profile.schema.yaml")}`,
        "schemaSha: ebfbaddd653789417f89b040320ccfe452f15424",
        `doctrineRoot: ${resolvePath(repoRoot, "fixtures/skprofile/doctrine")}`,
        "cases:",
        "  - id: all-profiles",
        "",
      ].join("\n"),
      "utf-8"
    );

    const { code, stdout } = await run(["skprofile", "run", manifestPath, "--json"]);
    expect(code).toBe(1);
    const report = JSON.parse(stdout) as {
      ok: boolean;
      findings: Array<{ kind: string; profileId: string; path: string; severity: string; source: { normative: string } }>;
    };
    expect(report.ok).toBe(false);
    const parseErrorFindings = report.findings.filter((f) => f.kind === "profile-parse-error");
    expect(parseErrorFindings).toHaveLength(1);
    expect(parseErrorFindings[0]).toMatchObject({
      profileId: "(unknown)",
      path: "(document)",
      severity: "error",
    });
    expect(parseErrorFindings[0]?.source.normative).toBe("structural: malformed *.agent.yaml");
  });

  it("human output: PASS/FAIL word and finding lines appear for the broken fixture", async () => {
    const manifestPath = resolvePath(repoRoot, "fixtures/skprofile/broken-manifest.yaml");
    const { code, stdout } = await run(["skprofile", "run", manifestPath]);

    expect(code).toBe(1);
    expect(stdout).toContain("spec-kitty-profile: FAIL");
    expect(stdout).toContain("case all-profiles:");
    expect(stdout).toMatch(/\[error]/);
  });

  it("human output: PASS for the clean example manifest", async () => {
    const manifestPath = resolvePath(repoRoot, "examples/skprofile/manifest.yaml");
    const { code, stdout } = await run(["skprofile", "run", manifestPath]);

    expect(code).toBe(0);
    expect(stdout).toContain("spec-kitty-profile: PASS");
  });

  it("--help documents the exit-code contract, no endpoint/client language", async () => {
    const { code, stdout } = await run(["skprofile", "run", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/exit-code contract/i);
    expect(stdout).toMatch(/no endpoint, no ChatClient/i);
  });

  // ---------------------------------------------------------------------
  // NFR-001/SC-004: byte-stability against the muster-local fixture
  // manifest ONLY — never a real, machine-specific manifest (research.md R5
  // explicitly scopes the byte-stability guarantee to fixtures/skprofile/).
  // ---------------------------------------------------------------------

  it("byte-stability: two identical offline runs against the fixture manifest produce byte-identical JSON", async () => {
    const manifestPath = resolvePath(repoRoot, "fixtures/skprofile/manifest.yaml");
    const first = await run(["skprofile", "run", manifestPath, "--json"]);
    const second = await run(["skprofile", "run", manifestPath, "--json"]);

    expect(first.code).toBe(0);
    expect(first.stdout).toBe(second.stdout);
  });

  it("byte-stability: two identical offline runs against the broken fixture manifest produce byte-identical JSON", async () => {
    const manifestPath = resolvePath(repoRoot, "fixtures/skprofile/broken-manifest.yaml");
    const first = await run(["skprofile", "run", manifestPath, "--json"]);
    const second = await run(["skprofile", "run", manifestPath, "--json"]);

    expect(first.code).toBe(1);
    expect(first.stdout).toBe(second.stdout);
  });
});
