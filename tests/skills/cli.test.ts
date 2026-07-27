/**
 * CLI-level tests for `muster skills run <manifest>` (WP01/WP04 deliverable).
 *
 * Runs in-process via the exported `runCli(argv, options)` — no subprocess
 * spawn. Exercises the static-only path (no MUSTER_ENDPOINT), --json output,
 * exit-code contract, error paths, and — since WP01 — the real behavioral
 * trigger-conformance wiring via an injected mock `TriggerChatClient`
 * (`skillsTriggerClientFactory`), the MUSTER_ENDPOINT/MUSTER_BASE_URL
 * env-alias precedence (FR-002), and the C-001 errored-run regression.
 *
 * Normative sources:
 * - contracts/cli.md exit codes: 0 = all pass, 1 = ≥1 failed, 2 = execution error
 * - NFR-001: static path is offline and deterministic
 * - FR-013: manifest runner returns structured results
 * - FR-001, FR-002, C-001 (this mission, skills-behavioral-enablement)
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it, vi } from "vitest";
import { runCli, type RunCliOptions } from "../../src/cli/index.js";
import {
  RIGGED_IMPOSSIBLE_DESCRIPTION,
  type TriggerChatClient,
} from "../../src/adapters/skills/trigger.js";
import type { EndpointConfig } from "../../src/core/behavioral/types.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const skillsManifest = resolvePath(repoRoot, "fixtures/skills/skills-manifest.yaml");

/** In-process invocation capturing stdout/stderr bytes exactly. */
async function run(
  argv: string[],
  extra: Pick<RunCliOptions, "clientFactory" | "skillsTriggerClientFactory"> = {}
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

/**
 * Save/restore MUSTER_ENDPOINT and MUSTER_BASE_URL around a test body
 * (FR-002) — unspecified vars are explicitly cleared, so every test using
 * this helper starts from a known, isolated env-var state regardless of
 * what earlier tests left behind.
 */
async function withSkillsEndpointEnv(
  vars: { MUSTER_ENDPOINT?: string; MUSTER_BASE_URL?: string },
  body: () => Promise<void>
): Promise<void> {
  const keys = ["MUSTER_ENDPOINT", "MUSTER_BASE_URL"] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]])) as Record<
    (typeof keys)[number],
    string | undefined
  >;
  const applyEnv = (source: Partial<Record<(typeof keys)[number], string>>): void => {
    for (const key of keys) {
      const value = source[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
  applyEnv(vars);
  try {
    await body();
  } finally {
    applyEnv(saved);
  }
}

/** The weather query set's shouldTrigger queries, loaded once (mock classifier below). */
const weatherShouldTrigger = new Set(
  (
    parseYaml(
      readFileSync(
        resolvePath(repoRoot, "fixtures/skills/trigger-queries/weather-skill-queries.yaml"),
        "utf8"
      )
    ) as { shouldTrigger: string[] }
  ).shouldTrigger
);

/**
 * A deterministic, offline mock `TriggerChatClient` that behaves like a
 * well-functioning model: never selects the rigged-impossible-control tool
 * (by description, matching every isControl case regardless of manifest),
 * and otherwise selects the target tool only for queries known to be in the
 * weather skill's own shouldTrigger set.
 */
function createSmartMockTriggerClient(): TriggerChatClient {
  return {
    async chatWithTools(userMessage, tools) {
      const tool = tools[0];
      if (tool === undefined) return null;
      if (tool.function.description === RIGGED_IMPOSSIBLE_DESCRIPTION) {
        return null;
      }
      return weatherShouldTrigger.has(userMessage) ? tool.function.name : null;
    },
  };
}

/** A mock `TriggerChatClient` that errors on every call (C-001 regression). */
const throwingTriggerClient: TriggerChatClient = {
  async chatWithTools(): Promise<string | null> {
    throw new Error("simulated transport failure — every call errors");
  },
};

/**
 * A mock `TriggerChatClient` simulating a model-quality bug: it genuinely
 * invokes whatever tool it is offered whenever the target tool's name is
 * `rigged-impossible-control` — but only for the discrimination control's
 * plausible "shouldTrigger" queries, correctly ignoring the "ZZZCONTROL"
 * near-miss placeholders. This produces a genuine control PASS (HIGH-1
 * regression): the CLI wiring must report `isControl:true` for this case
 * (derived from the same tool-name check `trigger.ts` itself uses), not
 * `false`, and `trigger.ts`'s own model-quality warning must fire.
 */
const misbehavingRiggedMockTriggerClient: TriggerChatClient = {
  async chatWithTools(userMessage, tools) {
    const tool = tools[0];
    if (tool === undefined) return null;
    if (tool.function.name !== "rigged-impossible-control") return null;
    return userMessage.includes("ZZZCONTROL") ? null : tool.function.name;
  },
};

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

  it("static-only: human summary contains per-case PASS/SKIP lines (AC-1b)", async () => {
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];
    try {
      const { stdout } = await run(["skills", "run", skillsManifest]);
      // Static cases pass when their outcome matches their expectation.
      // valid-minimal expects ok: true → lint passes → [PASS].
      // broken-name-missing expects ok: false → lint fails → outcome matches → [PASS].
      expect(stdout).toContain("[PASS] valid-minimal");
      expect(stdout).toContain("[PASS] broken-name-missing");
      // AC-1b: behavioral cases skip gracefully (passed:true, skipped:true —
      // unchanged shape) when MUSTER_ENDPOINT is absent.
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
      // skillDir is absolute: the manifest lives in /tmp, and case paths resolve
      // against the manifest's own directory, so a relative path would not find
      // the repo fixture.
      const brokenSkillDir = resolvePath(repoRoot, "fixtures/skills/broken/name-missing");
      const brokenCaseManifest = [
        "cases:",
        "  - id: broken-name-missing",
        "    type: static",
        `    skillDir: ${brokenSkillDir}`,
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

  it("help text documents MUSTER_BASE_URL as a deprecated alias (FR-002)", async () => {
    const { code, stdout } = await run(["skills", "run", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("MUSTER_BASE_URL");
    expect(stdout.toLowerCase()).toContain("deprecated");
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

  it("AC-1a: behavioral cases execute (skipped:false) via a mock trigger client when MUSTER_ENDPOINT is configured", async () => {
    await withSkillsEndpointEnv(
      { MUSTER_ENDPOINT: "http://mock-endpoint.invalid/v1" },
      async () => {
        const { code, stdout } = await run(
          ["skills", "run", skillsManifest, "--json"],
          { skillsTriggerClientFactory: () => createSmartMockTriggerClient() }
        );
        expect([0, 1]).toContain(code);
        const parsed = JSON.parse(stdout) as {
          results: {
            id: string;
            type: string;
            skipped?: boolean;
            passed: boolean;
          }[];
        };
        const behavioral = parsed.results.filter((r) => r.type === "behavioral");
        expect(behavioral).toHaveLength(2);
        for (const r of behavioral) {
          // AC-1a: executed for real, never the hardcoded skip shape.
          // MEDIUM-1: `.not.toBe(true)` alone passes when the key is
          // *absent* (undefined), not just when it is literally `false` —
          // that let a real regression (`skipped: false,` deleted from
          // index.ts) go unnoticed with all 28 tests green. Assert the
          // exact value AND that the key is actually present in the raw
          // parsed JSON (WP04's own acceptance `jq 'has("skipped")'` gate
          // depends on this exact shape).
          expect(r.skipped).toBe(false);
          expect(Object.hasOwn(r, "skipped")).toBe(true);
        }
        const weather = behavioral.find((r) => r.id === "behavioral-weather-skill");
        const control = behavioral.find((r) => r.id === "behavioral-rigged-control");
        expect(weather?.passed).toBe(true);
        // FR-005/SC-004: the discrimination control must fail (cap-of-zero),
        // now proven reachable from the CLI itself, not only from trigger.ts's
        // own unit tests or the CTS reference suite.
        expect(control?.passed).toBe(false);
      }
    );
  });

  it("AC-2a: MUSTER_ENDPOINT alone resolves the endpoint with no deprecation warning", async () => {
    await withSkillsEndpointEnv(
      { MUSTER_ENDPOINT: "http://canonical-endpoint.invalid/v1" },
      async () => {
        const captured: { endpoint?: EndpointConfig } = {};
        const { stderr } = await run(["skills", "run", skillsManifest], {
          skillsTriggerClientFactory: (endpoint) => {
            captured.endpoint = endpoint;
            return createSmartMockTriggerClient();
          },
        });
        expect(stderr.toLowerCase()).not.toContain("deprecat");
        expect(captured.endpoint?.baseUrl).toBe("http://canonical-endpoint.invalid/v1");
      }
    );
  });

  it("AC-2b: MUSTER_BASE_URL alone works, with exactly one deprecation warning", async () => {
    await withSkillsEndpointEnv(
      { MUSTER_BASE_URL: "http://alias-endpoint.invalid/v1" },
      async () => {
        const captured: { endpoint?: EndpointConfig } = {};
        const { stderr } = await run(["skills", "run", skillsManifest], {
          skillsTriggerClientFactory: (endpoint) => {
            captured.endpoint = endpoint;
            return createSmartMockTriggerClient();
          },
        });
        const deprecationLines = stderr
          .split("\n")
          .filter((line) => line.toLowerCase().includes("deprecat"));
        expect(deprecationLines).toHaveLength(1);
        expect(captured.endpoint?.baseUrl).toBe("http://alias-endpoint.invalid/v1");
      }
    );
  });

  it("AC-2c: both set — MUSTER_ENDPOINT wins silently, no warning", async () => {
    await withSkillsEndpointEnv(
      {
        MUSTER_ENDPOINT: "http://canonical-endpoint.invalid/v1",
        MUSTER_BASE_URL: "http://unreachable-should-not-be-used.invalid/v1",
      },
      async () => {
        const captured: { endpoint?: EndpointConfig } = {};
        const { stderr } = await run(["skills", "run", skillsManifest], {
          skillsTriggerClientFactory: (endpoint) => {
            captured.endpoint = endpoint;
            return createSmartMockTriggerClient();
          },
        });
        expect(stderr.toLowerCase()).not.toContain("deprecat");
        expect(captured.endpoint?.baseUrl).toBe("http://canonical-endpoint.invalid/v1");
      }
    );
  });

  it("errored trigger run", async () => {
    await withSkillsEndpointEnv(
      { MUSTER_ENDPOINT: "http://mock-endpoint.invalid/v1" },
      async () => {
        const { code, stdout } = await run(
          ["skills", "run", skillsManifest, "--json"],
          { skillsTriggerClientFactory: () => throwingTriggerClient }
        );
        const parsed = JSON.parse(stdout) as {
          ok: boolean;
          results: {
            id: string;
            type: string;
            passed: boolean;
            shouldTriggerAxis?: {
              triggerRate: number;
              queryBreakdown: { runsErrored: number }[];
            };
          }[];
        };
        const weather = parsed.results.find((r) => r.id === "behavioral-weather-skill");
        expect(weather).toBeDefined();
        // C-001: an errored trigger run counts as a failed run — never
        // retried, never silently skipped — asserted at the CLI-wiring
        // layer (doSkillsRun), not only via trigger.ts's own unit tests.
        expect(weather?.passed).toBe(false);
        expect(weather?.shouldTriggerAxis?.triggerRate).toBe(0);
        const totalErrored = (weather?.shouldTriggerAxis?.queryBreakdown ?? []).reduce(
          (sum, q) => sum + q.runsErrored,
          0
        );
        expect(totalErrored).toBeGreaterThan(0);
        // C-004: this contributes to a non-zero overall exit code.
        expect(parsed.ok).toBe(false);
        expect(code).toBe(1);
      }
    );
  });

  it("HIGH-1 regression: a genuinely-invoked rigged tool is reported as isControl:true with the model-quality warning", async () => {
    await withSkillsEndpointEnv(
      { MUSTER_ENDPOINT: "http://mock-endpoint.invalid/v1" },
      async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
          const { stdout } = await run(
            ["skills", "run", skillsManifest, "--json"],
            { skillsTriggerClientFactory: () => misbehavingRiggedMockTriggerClient }
          );
          const parsed = JSON.parse(stdout) as {
            results: { id: string; type: string; isControl?: boolean; passed: boolean }[];
          };
          const control = parsed.results.find((r) => r.id === "behavioral-rigged-control");
          expect(control).toBeDefined();
          // The rigged tool was genuinely invoked for the control's
          // shouldTrigger queries: the verdict itself must show a pass...
          expect(control?.passed).toBe(true);
          // ...and the CLI-reported isControl must match trigger.ts's own
          // tool-name-derived verdict — true, not the manifest-name mismatch
          // that previously forced this to false unconditionally.
          expect(control?.isControl).toBe(true);
          // trigger.ts's discrimination-control warning (isControl && passed)
          // must actually fire — proving it is not dead code.
          expect(warnSpy).toHaveBeenCalled();
          const warnedAboutControl = warnSpy.mock.calls.some((args) =>
            String(args[0]).includes("discrimination control")
          );
          expect(warnedAboutControl).toBe(true);
        } finally {
          warnSpy.mockRestore();
        }
      }
    );
  });

  it("HIGH-2 regression: a missing behavioral querySetPath fails only that case, never the whole run", async () => {
    await withSkillsEndpointEnv(
      { MUSTER_ENDPOINT: "http://mock-endpoint.invalid/v1" },
      async () => {
        const { writeFileSync, unlinkSync } = await import("node:fs");
        const tmpPath = "/tmp/skills-cli-missing-queryset-manifest.yaml";
        const validSkillDir = resolvePath(repoRoot, "fixtures/skills/valid/minimal");
        const missingQuerySetPath = resolvePath(
          repoRoot,
          "fixtures/skills/trigger-queries/does-not-exist-queries.yaml"
        );
        const manifest = [
          "cases:",
          "  - id: static-still-runs",
          "    type: static",
          `    skillDir: ${validSkillDir}`,
          "    profile: base",
          "    expectations:",
          "      ok: true",
          "      violations: []",
          "  - id: behavioral-missing-queryset",
          "    type: behavioral",
          `    skillDir: ${validSkillDir}`,
          "    profile: base",
          `    querySetPath: ${missingQuerySetPath}`,
          "    runsPerQuery: 3",
          "    threshold: 0.5",
          "    isControl: false",
        ].join("\n");
        writeFileSync(tmpPath, manifest);
        try {
          const { code, stdout, stderr } = await run(
            ["skills", "run", tmpPath, "--json"],
            { skillsTriggerClientFactory: () => createSmartMockTriggerClient() }
          );
          // Must not be the manifest-level exit 2 ("unexpected error"/ENOENT)
          // that previously discarded the whole run, including the
          // already-passing static case.
          expect(code).toBe(1);
          expect(stderr).not.toContain("unexpected error");
          expect(() => JSON.parse(stdout)).not.toThrow();
          const parsed = JSON.parse(stdout) as {
            results: {
              id: string;
              type: string;
              passed: boolean;
              skipped?: boolean;
            }[];
          };
          const staticCase = parsed.results.find((r) => r.id === "static-still-runs");
          const brokenCase = parsed.results.find(
            (r) => r.id === "behavioral-missing-queryset"
          );
          // The unrelated static case must not be discarded.
          expect(staticCase?.passed).toBe(true);
          // Fail-closed for the broken case itself — not swallowed, not
          // reinterpreted as a skip.
          expect(brokenCase?.passed).toBe(false);
          expect(brokenCase?.skipped).toBe(false);
        } finally {
          unlinkSync(tmpPath);
        }
      }
    );
  });

  it("HIGH-2 regression: a missing behavioral skillDir fails only that case, never the whole run", async () => {
    await withSkillsEndpointEnv(
      { MUSTER_ENDPOINT: "http://mock-endpoint.invalid/v1" },
      async () => {
        const { writeFileSync, unlinkSync } = await import("node:fs");
        const tmpPath = "/tmp/skills-cli-missing-skilldir-manifest.yaml";
        const validSkillDir = resolvePath(repoRoot, "fixtures/skills/valid/minimal");
        const missingSkillDir = resolvePath(
          repoRoot,
          "fixtures/skills/valid/does-not-exist"
        );
        const querySetPath = resolvePath(
          repoRoot,
          "fixtures/skills/trigger-queries/weather-skill-queries.yaml"
        );
        const manifest = [
          "cases:",
          "  - id: static-still-runs",
          "    type: static",
          `    skillDir: ${validSkillDir}`,
          "    profile: base",
          "    expectations:",
          "      ok: true",
          "      violations: []",
          "  - id: behavioral-missing-skilldir",
          "    type: behavioral",
          `    skillDir: ${missingSkillDir}`,
          "    profile: base",
          `    querySetPath: ${querySetPath}`,
          "    runsPerQuery: 3",
          "    threshold: 0.5",
          "    isControl: false",
        ].join("\n");
        writeFileSync(tmpPath, manifest);
        try {
          const { code, stdout, stderr } = await run(
            ["skills", "run", tmpPath, "--json"],
            { skillsTriggerClientFactory: () => createSmartMockTriggerClient() }
          );
          expect(code).toBe(1);
          expect(stderr).not.toContain("unexpected error");
          expect(() => JSON.parse(stdout)).not.toThrow();
          const parsed = JSON.parse(stdout) as {
            results: {
              id: string;
              type: string;
              passed: boolean;
              skipped?: boolean;
            }[];
          };
          const staticCase = parsed.results.find((r) => r.id === "static-still-runs");
          const brokenCase = parsed.results.find(
            (r) => r.id === "behavioral-missing-skilldir"
          );
          expect(staticCase?.passed).toBe(true);
          expect(brokenCase?.passed).toBe(false);
          expect(brokenCase?.skipped).toBe(false);
        } finally {
          unlinkSync(tmpPath);
        }
      }
    );
  });

  describe("manifest schema validation (FR-003)", () => {
    async function runMalformedManifest(manifestYaml: string): Promise<{
      code: number;
      stderr: string;
    }> {
      const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const dir = mkdtempSync(join(tmpdir(), "muster-skills-manifest-"));
      const manifestPath = join(dir, "bad-skills-manifest.yaml");
      writeFileSync(manifestPath, manifestYaml);
      try {
        const { code, stdout, stderr } = await run(["skills", "run", manifestPath]);
        expect(stdout).toBe("");
        return { code, stderr };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    it("manifest schema: a case missing a required field exits 2, naming the field", async () => {
      const manifestYaml = ["cases:", "  - id: broken", "    type: static"].join("\n");
      const { code, stderr } = await runMalformedManifest(manifestYaml);
      expect(code).toBe(2);
      expect(stderr).toContain("skillDir");
    });

    it("manifest schema: a case type outside the static|behavioral enum exits 2", async () => {
      const manifestYaml = [
        "cases:",
        "  - id: broken",
        "    type: bogus",
        "    skillDir: valid/minimal",
        "    profile: base",
        "    expectations:",
        "      ok: true",
        "      violations: []",
      ].join("\n");
      const { code, stderr } = await runMalformedManifest(manifestYaml);
      expect(code).toBe(2);
      expect(stderr.length).toBeGreaterThan(0);
    });

    it("manifest schema: expectations.ok as a string exits 2", async () => {
      const manifestYaml = [
        "cases:",
        "  - id: broken",
        "    type: static",
        "    skillDir: valid/minimal",
        "    profile: base",
        "    expectations:",
        '      ok: "yes"',
        "      violations: []",
      ].join("\n");
      const { code, stderr } = await runMalformedManifest(manifestYaml);
      expect(code).toBe(2);
      expect(stderr.length).toBeGreaterThan(0);
    });
  });
});
