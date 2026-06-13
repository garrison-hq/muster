/**
 * CLI assembly tests (WP10 T041; contracts/cli.md).
 *
 * The program runs IN-PROCESS via the exported `runCli(argv, options)` —
 * no subprocess spawn. Output sinks and the behave chat-client factory are
 * injected through `RunCliOptions`, so stdout purity and endpoint wiring are
 * observable directly. Offline by construction (NFR-003): mocked clients only.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli, type RunCliOptions } from "../../src/cli/index.js";
import type {
  CaseVerdict,
  ChatClient,
  EndpointConfig,
} from "../../src/core/behavioral/types.js";
import type { CtsCaseResult } from "../../src/core/cts/runner.js";
import type { ConformanceReport } from "../../src/core/report.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const validSoul = join(repoRoot, "cts/fixtures/minimal/valid/Soul.md");
const validExpectedJson = join(repoRoot, "cts/fixtures/minimal/valid/expected.json");
const brokenSoul = join(repoRoot, "cts/fixtures/minimal/missing_mandatory/Soul.md");
const missingFile = join(repoRoot, "cts/fixtures/does-not-exist.md");
const ctsManifest = join(repoRoot, "cts/manifest.yaml");

const reportSchema = JSON.parse(
  await readFile(
    join(
      repoRoot,
      "kitty-specs/cts1-conformance-harness-01KTS86B/contracts/conformance-report.schema.json"
    ),
    "utf8"
  )
) as Record<string, unknown>;
const ajv = new Ajv2020({ allErrors: true });
const validateReport = ajv.compile(reportSchema);

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

/** Chat-client factory returning a fixed reply; records endpoints it saw. */
function mockFactory(
  reply: string | (() => Promise<string>),
  seen: EndpointConfig[] = []
): (endpoint: EndpointConfig) => ChatClient {
  return (endpoint) => {
    seen.push(endpoint);
    return {
      chat: typeof reply === "string" ? async () => reply : reply,
    };
  };
}

// ── temp manifests (built once; absolute soul paths embedded) ───────────────

const tempDir = await mkdtemp(join(tmpdir(), "muster-cli-test-"));
afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// An expected-to-fail CTS case over a VALID fixture: the Appendix F
// discrimination rule makes the suite fail → exit 1.
const failingCtsManifest = join(tempDir, "failing-cts.yaml");
await writeFile(
  failingCtsManifest,
  [
    `- id: "should_report_errors"`,
    `  root: ${JSON.stringify(validSoul)}`,
    `  mode: "strict"`,
    `  expect_ok: false`,
    "",
  ].join("\n"),
  "utf8"
);

// Behavioral manifest: one verbosity case on the minimal valid soul
// (voice.verbosity 50 → R9 maxWords 10 + 50 = 60).
const behaveManifest = join(tempDir, "behave.yaml");
await writeFile(
  behaveManifest,
  [
    "endpoint:",
    `  base_url: "http://127.0.0.1:9/v1"`,
    `  model: "mock-model"`,
    "defaults:",
    "  runs: 2",
    "  pass_threshold: 2",
    "cases:",
    `  - id: "verbosity_minimal"`,
    `    soul: ${JSON.stringify(validSoul)}`,
    "    turns:",
    `      - content: "Hello there"`,
    "    axes:",
    `      - axis: "verbosity"`,
    `        turns: "all"`,
    "",
  ].join("\n"),
  "utf8"
);

// Behavioral manifest whose soul is non-conforming → static gate, exit 2.
const behaveBrokenSoulManifest = join(tempDir, "behave-broken.yaml");
await writeFile(
  behaveBrokenSoulManifest,
  [
    "endpoint:",
    `  base_url: "http://127.0.0.1:9/v1"`,
    `  model: "mock-model"`,
    "cases:",
    `  - id: "broken_persona"`,
    `    soul: ${JSON.stringify(brokenSoul)}`,
    "    turns:",
    `      - content: "Hello"`,
    "    axes:",
    `      - axis: "verbosity"`,
    `        turns: "all"`,
    "",
  ].join("\n"),
  "utf8"
);

// ── --restrict-refs fixtures (WP01: FR-001..FR-003, RFC-1 §7.2) ─────────────
//
// Layout: restrict/nested/Soul.md extends "../shared.md" — a reference that
// escapes the root soul's own directory but stays inside restrict/.

/** A minimal valid soul document; `extendsList` populates composition.extends. */
function fixtureSoul(id: string, extendsList: string[]): string {
  return [
    "---",
    'soul_spec: "1.0.0-rc1"',
    `id: ${JSON.stringify(id)}`,
    'name: "WP01 Restrict Fixture"',
    'locale: "en"',
    "composition:",
    `  extends: [${extendsList.map((entry) => JSON.stringify(entry)).join(", ")}]`,
    "  mixins: []",
    "  merge_policy: standard",
    'profiles: ["default"]',
    "profile_overrides: {}",
    "values:",
    '  priorities: ["accuracy", "clarity", "safety", "speed"]',
    "voice:",
    "  formality: 60",
    "  warmth: 30",
    "  verbosity: 50",
    "  jargon: 40",
    "  formatting: minimal",
    "interaction:",
    "  clarifying_questions: when_ambiguous",
    "  uncertainty: explicit",
    "  disagreement: neutral",
    "  confirmations: implicit",
    "safety:",
    "  refusal_style: brief",
    "  privacy: strict",
    "  speculation: mark",
    "extensions: {}",
    "---",
    "",
    "Body prose.",
    "",
  ].join("\n");
}

const restrictRoot = join(tempDir, "restrict");
const escapingSoul = join(restrictRoot, "nested", "Soul.md");
const uriSoul = join(restrictRoot, "uri.md");
await mkdir(join(restrictRoot, "nested"), { recursive: true });
await writeFile(escapingSoul, fixtureSoul("org.example.wp01.escaping", ["../shared.md"]));
await writeFile(
  join(restrictRoot, "shared.md"),
  fixtureSoul("org.example.wp01.shared", [])
);
await writeFile(
  uriSoul,
  fixtureSoul("org.example.wp01.uri", ["https://example.com/evil.md"])
);

// CTS manifest over the escaping soul: passes unrestricted, fails under
// bare --restrict-refs (each case confined to its root soul's directory).
const restrictCtsManifest = join(tempDir, "restrict-cts.yaml");
await writeFile(
  restrictCtsManifest,
  [
    `- id: "escaping_ref_case"`,
    `  root: ${JSON.stringify(escapingSoul)}`,
    `  mode: "strict"`,
    `  expect_ok: true`,
    "",
  ].join("\n"),
  "utf8"
);

const SHORT_REPLY = "Concise answer."; // 2 words ≤ 60
const LONG_REPLY = new Array(70).fill("word").join(" "); // 70 words > 60

// ─────────────────────────────────────────────────────────────────────────────

describe("muster check (RFC-1 §25.1 report; FR-012)", () => {
  it("§25.1: valid soul → exit 0 with OK headline", async () => {
    const { code, stdout, stderr } = await run(["check", validSoul]);
    expect(code).toBe(0);
    expect(stdout.startsWith("OK")).toBe(true);
    expect(stderr).toBe("");
  });

  it("§5.1: soul missing a mandatory key → exit 1 with FAIL + per-error lines", async () => {
    const { code, stdout } = await run(["check", brokenSoul]);
    expect(code).toBe(1);
    expect(stdout.startsWith("FAIL")).toBe(true);
    expect(stdout).toMatch(/^ {2}ERROR \S+: .+/m);
  });

  it("§25.1: unreadable file → exit 2, message on stderr, stdout empty", async () => {
    const { code, stdout, stderr } = await run(["check", missingFile]);
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("cannot read");
  });

  it("§25.1: --json output validates against the conformance-report contract schema", async () => {
    for (const [soul, expectedOk] of [
      [validSoul, true],
      [brokenSoul, false],
    ] as const) {
      const { stdout } = await run(["check", soul, "--json"]);
      const report = JSON.parse(stdout) as ConformanceReport;
      expect(validateReport(report), JSON.stringify(validateReport.errors)).toBe(true);
      expect(report.ok).toBe(expectedOk);
    }
  });

  it("§25.1: stdout purity — --json stdout is pure JSON even on failure", async () => {
    const { code, stdout } = await run(["check", brokenSoul, "--json"]);
    expect(code).toBe(1);
    // Human diagnostics (FAIL headline, indented ERROR lines) must be absent.
    expect(() => JSON.parse(stdout)).not.toThrow();
    expect(stdout.startsWith("{")).toBe(true);
  });

  it("§25: --mode permissive is accepted and echoed in the report (FR-024)", async () => {
    const { code, stdout } = await run(["check", validSoul, "--json", "--mode", "permissive"]);
    expect(code).toBe(0);
    expect((JSON.parse(stdout) as ConformanceReport).mode).toBe("permissive");
  });

  it("CLI contract: unknown option → exit 2 (execution error)", async () => {
    const { code } = await run(["check", validSoul, "--bogus"]);
    expect(code).toBe(2);
  });
});

describe("muster resolve (RFC-1 §7.5 / Appendix F.2; FR-013)", () => {
  it("Appendix F.2: default output is canonical-json, byte-identical across invocations (SC-004)", async () => {
    const first = await run(["resolve", validSoul]);
    const second = await run(["resolve", validSoul]);
    expect(first.code).toBe(0);
    expect(first.stdout).toBe(second.stdout);
    // Raw RFC 8785 bytes: no pretty-printing, no trailing newline.
    expect(first.stdout.endsWith("}")).toBe(true);
    expect(first.stdout).not.toContain("\n");
  });

  it("Appendix F.2: canonical-json bytes equal the CTS expected.json fixture", async () => {
    const { stdout } = await run(["resolve", validSoul, "--output-format", "canonical-json"]);
    const expected = await readFile(validExpectedJson, "utf8");
    expect(stdout).toBe(expected);
  });

  it("§7.5: --output-format json pretty-prints the effective configuration", async () => {
    const { code, stdout } = await run(["resolve", validSoul, "--output-format", "json"]);
    expect(code).toBe(0);
    const effective = JSON.parse(stdout) as Record<string, unknown>;
    expect(effective["id"]).toBe("org.example.minimal");
    expect(stdout).toContain("\n  ");
  });

  it("§7.5: --output-format yaml emits the effective configuration as YAML", async () => {
    const { code, stdout } = await run(["resolve", validSoul, "--output-format", "yaml"]);
    expect(code).toBe(0);
    expect(stdout).toContain("soul_spec: 1.0.0-rc1");
  });

  it("§25.1: resolution errors → report on stderr, exit 1, stdout empty", async () => {
    const { code, stdout, stderr } = await run(["resolve", brokenSoul]);
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderr.startsWith("FAIL")).toBe(true);
  });

  it("§25.1: --json resolution errors put a schema-valid report on stderr", async () => {
    const { code, stdout, stderr } = await run(["resolve", brokenSoul, "--json"]);
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(validateReport(JSON.parse(stderr))).toBe(true);
  });

  it("CLI contract: unreadable file → exit 2", async () => {
    const { code } = await run(["resolve", missingFile]);
    expect(code).toBe(2);
  });
});

describe("muster cts run (RFC-1 Appendix F; FR-014/FR-015)", () => {
  it("Appendix F: the full CTS-1 manifest passes → exit 0 with summary line", async () => {
    const { code, stdout } = await run(["cts", "run", ctsManifest]);
    expect(code).toBe(0);
    const summary = stdout.trimEnd().split("\n").at(-1) ?? "";
    expect(summary).toMatch(/^\d+ passed, 0 failed of \d+$/);
    expect(stdout.endsWith("\n")).toBe(true);
  });

  it("Appendix F.1: --filter 'merge_*' selects only the §8 merge cases", async () => {
    const { code, stdout } = await run([
      "cts",
      "run",
      ctsManifest,
      "--filter",
      "merge_*",
      "--json",
    ]);
    expect(code).toBe(0);
    const results = JSON.parse(stdout) as CtsCaseResult[];
    expect(results.length).toBe(5);
    for (const result of results) {
      expect(result.id.startsWith("merge_")).toBe(true);
    }
  });

  it("Appendix F discrimination: expected-to-fail fixture that passes → exit 1 (SC-002)", async () => {
    const { code, stdout } = await run(["cts", "run", failingCtsManifest]);
    expect(code).toBe(1);
    expect(stdout).toContain("FAIL should_report_errors");
    expect(stdout).toMatch(/^ {4}\S.*discrimination/m); // indented mismatch line
    expect(stdout).toContain("0 passed, 1 failed of 1");
  });

  it("Appendix F.1: unreadable/invalid manifest → exit 2, stdout empty", async () => {
    const missing = await run(["cts", "run", join(tempDir, "no-manifest.yaml")]);
    expect(missing.code).toBe(2);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toContain("Appendix F.1");
  });

  it("Appendix F: --json stdout is a parseable CtsCaseResult[] (stdout purity)", async () => {
    const { stdout } = await run(["cts", "run", failingCtsManifest, "--json"]);
    const results = JSON.parse(stdout) as CtsCaseResult[];
    expect(Array.isArray(results)).toBe(true);
    expect(results[0]?.passed).toBe(false);
    expect(results[0]?.report.ok).toBe(true);
  });
});

describe("muster behave run (RFC-1 §20/§21 behavioral surface; FR-016..FR-023)", () => {
  it("FR-022: all cases pass k-of-n with a conforming mock → exit 0", async () => {
    const { code, stdout } = await run(["behave", "run", behaveManifest], {
      clientFactory: mockFactory(SHORT_REPLY),
    });
    expect(code).toBe(0);
    expect(stdout).toContain("PASS verbosity_minimal (2/2 runs)");
  });

  it("FR-018: over-budget replies fail the verbosity axis → exit 1 with measured-vs-limit", async () => {
    const { code, stdout } = await run(["behave", "run", behaveManifest], {
      clientFactory: mockFactory(LONG_REPLY),
    });
    expect(code).toBe(1);
    expect(stdout).toContain("FAIL verbosity_minimal (0/2 runs)");
    expect(stdout).toContain("verbosity turn 0: measured 70, limit 60");
  });

  it("FR-023: --json emits CaseVerdict[] with full transcripts", async () => {
    const { code, stdout } = await run(["behave", "run", behaveManifest, "--json"], {
      clientFactory: mockFactory(SHORT_REPLY),
    });
    expect(code).toBe(0);
    const verdicts = JSON.parse(stdout) as CaseVerdict[];
    expect(verdicts.length).toBe(1);
    const verdict = verdicts[0];
    expect(verdict.runs.length).toBe(2);
    for (const runVerdict of verdict.runs) {
      expect(runVerdict.transcript.entries.length).toBe(2); // user + assistant
      expect(runVerdict.transcript.model).toBe("mock-model");
      expect(runVerdict.transcript.temperature).toBe("default"); // C-009
    }
  });

  it("CLI contract: --base-url/--model/--runs flags override the manifest", async () => {
    const seen: EndpointConfig[] = [];
    const { code, stdout } = await run(
      [
        "behave",
        "run",
        behaveManifest,
        "--json",
        "--base-url",
        "https://override.local/v1",
        "--model",
        "other-model",
        "--runs",
        "1",
      ],
      { clientFactory: mockFactory(SHORT_REPLY, seen) }
    );
    expect(code).toBe(0);
    expect(seen.length).toBe(1);
    expect(seen[0].baseUrl).toBe("https://override.local/v1");
    expect(seen[0].model).toBe("other-model");
    const verdicts = JSON.parse(stdout) as CaseVerdict[];
    expect(verdicts[0].runs.length).toBe(1);
  });

  it("§25.1: a non-conforming soul aborts before grading → exit 2 with the static report on stderr", async () => {
    const seen: EndpointConfig[] = [];
    const { code, stderr } = await run(["behave", "run", behaveBrokenSoulManifest], {
      clientFactory: mockFactory(SHORT_REPLY, seen),
    });
    expect(code).toBe(2);
    expect(stderr).toContain("not conforming");
    expect(stderr).toContain("FAIL");
  });

  it("CLI contract: unreadable manifest → exit 2", async () => {
    const { code, stdout } = await run(["behave", "run", join(tempDir, "nope.yaml")]);
    expect(code).toBe(2);
    expect(stdout).toBe("");
  });

  it("CLI contract: endpoint unreachable for the ENTIRE run → exit 2", async () => {
    const { code } = await run(["behave", "run", behaveManifest], {
      clientFactory: mockFactory(async () => {
        throw new Error("chat request to 127.0.0.1:9 failed: connect ECONNREFUSED");
      }),
    });
    expect(code).toBe(2);
  });
});

describe("--restrict-refs reference hardening (WP01: FR-001..FR-003; RFC-1 §7.2)", () => {
  it("FR-003 §7.2 absent: escaping reference loads unrestricted (shipped behavior) → exit 0", async () => {
    const { code, stdout } = await run(["check", escapingSoul]);
    expect(code).toBe(0);
    expect(stdout.startsWith("OK")).toBe(true);
  });

  it("FR-003 §7.2 bare: confined to the root soul's directory → exit 1 with the escape violation in the §25.1 report", async () => {
    const { code, stdout } = await run(["check", escapingSoul, "--json", "--restrict-refs"]);
    expect(code).toBe(1);
    const report = JSON.parse(stdout) as ConformanceReport;
    expect(report.ok).toBe(false);
    expect(
      report.errors.some((e) =>
        e.message.includes('reference "../shared.md" escapes the restricted base directory')
      )
    ).toBe(true);

    // resolve honors the same flag: report on stderr, exit 1, stdout empty.
    const resolved = await run(["resolve", escapingSoul, "--restrict-refs"]);
    expect(resolved.code).toBe(1);
    expect(resolved.stdout).toBe("");
    expect(resolved.stderr).toContain("escapes the restricted base directory");
  });

  it("FR-003 §7.2 with value: --restrict-refs <dir> spanning both documents → exit 0", async () => {
    const { code } = await run(["check", escapingSoul, "--restrict-refs", restrictRoot]);
    expect(code).toBe(0);
  });

  it("FR-001 §7.2: a URI-scheme reference is rejected with a §7.2-cited violation → exit 1 (no flag required)", async () => {
    const { code, stdout } = await run(["check", uriSoul, "--json"]);
    expect(code).toBe(1);
    const report = JSON.parse(stdout) as ConformanceReport;
    expect(
      report.errors.some(
        (e) =>
          e.section === "§7.2" &&
          e.message.includes("URI reference schemes are not supported by muster")
      )
    ).toBe(true);
  });

  it("FR-003 §7.2: cts run bare --restrict-refs confines each case to its root soul's directory → exit flips 0 → 1", async () => {
    const unrestricted = await run(["cts", "run", restrictCtsManifest]);
    expect(unrestricted.code).toBe(0);

    const restricted = await run(["cts", "run", restrictCtsManifest, "--json", "--restrict-refs"]);
    expect(restricted.code).toBe(1);
    const results = JSON.parse(restricted.stdout) as CtsCaseResult[];
    expect(results[0]?.passed).toBe(false);
    expect(
      results[0]?.report.errors.some((e) =>
        e.message.includes("escapes the restricted base directory")
      )
    ).toBe(true);
  });

  it("FR-003: check, resolve, cts run, and behave run all document --restrict-refs [dir]", async () => {
    for (const argv of [
      ["check", "--help"],
      ["resolve", "--help"],
      ["cts", "run", "--help"],
      ["behave", "run", "--help"],
    ]) {
      const { code, stdout } = await run(argv);
      expect(code, argv.join(" ")).toBe(0);
      expect(stdout, argv.join(" ")).toContain("--restrict-refs [dir]");
    }
  });

  it("NFR-001 byte-identity: default-path resolve (NO flag) emits bytes equal to the pre-change expected.json fixtures", async () => {
    // expected.json fixtures encode the shipped release's canonical bytes;
    // minimal valid AND a composition fixture (reference loading exercised).
    for (const fixture of ["minimal/valid", "composition/local_wins"]) {
      const soul = join(repoRoot, "cts/fixtures", fixture, "Soul.md");
      const expected = await readFile(
        join(repoRoot, "cts/fixtures", fixture, "expected.json"),
        "utf8"
      );
      const { code, stdout } = await run(["resolve", soul, "--output-format", "canonical-json"]);
      expect(code, fixture).toBe(0);
      expect(stdout, fixture).toBe(expected);
    }
  });
});

describe("muster program (contracts/cli.md global behavior)", () => {
  it("CLI contract: --help and --version exit 0", async () => {
    const help = await run(["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Usage: muster");
    const version = await run(["--version"]);
    expect(version.code).toBe(0);
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("FR-024: an invalid --mode value is rejected with exit 2", async () => {
    const { code, stderr } = await run(["check", validSoul, "--mode", "lenient"]);
    expect(code).toBe(2);
    expect(stderr).toContain("--mode");
  });

  it("charter directive 5: behave help documents env-var keys, no key flag exists", async () => {
    const { code, stdout } = await run(["behave", "run", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("MUSTER_API_KEY");
    expect(stdout).toContain("OPENAI_API_KEY");
    expect(stdout).not.toMatch(/--api[-_]?key/i);
  });
});

// ─── muster crosslayer run CLI tests ─────────────────────────────────────────

/**
 * CLI-level tests for `muster crosslayer run <manifest>`.
 *
 * Tests run IN-PROCESS via runCli — no subprocess spawn.
 * Static cases run fully offline (NFR-003). Behavioral cases are NOT exercised
 * here — that coverage lives in tests/crosslayer/integration/.
 *
 * Normative citation: muster cross-layer conformance rubric
 * (cross-layer-conformance-01KTYKP2), FR-011; C-001, C-004.
 */
describe("muster crosslayer run (WP04, FR-011, C-004)", () => {
  const crosslayerManifest = join(repoRoot, "fixtures/crosslayer/manifest.yaml");

  it("--static-only: runs 5/5 static cases, exit 0, human summary", async () => {
    const { code, stdout, stderr } = await run([
      "crosslayer",
      "run",
      crosslayerManifest,
      "--static-only",
    ]);

    expect(code).toBe(0);
    // Human summary header line.
    expect(stdout).toContain("crosslayer: PASS");
    expect(stdout).toContain("5/5 cases passed");
    expect(stdout).toContain("0 failed");
    // All 5 static case IDs present in output.
    expect(stdout).toContain("benign-persona-sop");
    expect(stdout).toContain("benign-persona-sop-skill");
    expect(stdout).toContain("contradictory-no-precedence");
    expect(stdout).toContain("contradictory-with-precedence");
    expect(stdout).toContain("circular-precedence");
    // No noise on stderr.
    expect(stderr).toBe("");
  });

  it("--static-only --json: exits 0, emits machine-readable JSON with correct shape", async () => {
    const { code, stdout } = await run([
      "crosslayer",
      "run",
      crosslayerManifest,
      "--static-only",
      "--json",
    ]);

    expect(code).toBe(0);
    const summary = JSON.parse(stdout) as {
      total: number;
      passed: number;
      failed: number;
      results: Array<{ id: string; passed: boolean }>;
    };
    expect(summary.total).toBe(5);
    expect(summary.passed).toBe(5);
    expect(summary.failed).toBe(0);
    expect(summary.results).toHaveLength(5);
    // Every result is a pass.
    for (const result of summary.results) {
      expect(result.passed).toBe(true);
    }
  });

  it("non-existent manifest path → exit 2 (execution error), stdout empty", async () => {
    const { code, stdout, stderr } = await run([
      "crosslayer",
      "run",
      join(repoRoot, "fixtures/crosslayer/does-not-exist.yaml"),
      "--static-only",
    ]);

    expect(code).toBe(2);
    expect(stdout).toBe("");
    // Error message must appear on stderr.
    expect(stderr).toContain("crosslayer manifest run failed");
  });

  it("--help exits 0 and documents --static-only flag", async () => {
    const { code, stdout } = await run(["crosslayer", "run", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("--static-only");
  });

  it("human output: findings are listed in the per-case detail line", async () => {
    const { code, stdout } = await run([
      "crosslayer",
      "run",
      crosslayerManifest,
      "--static-only",
    ]);

    expect(code).toBe(0);
    // The contradictory-no-precedence case emits cross-layer-contradiction and undefined-precedence.
    expect(stdout).toContain("cross-layer-contradiction");
    expect(stdout).toContain("undefined-precedence");
    // The circular-precedence case emits circular-precedence-error.
    expect(stdout).toContain("circular-precedence-error");
  });

  /**
   * BUG-A regression: cwd-independence for layer fixture paths.
   *
   * Before the fix, `resolveLayerPaths` resolved relative paths against
   * process.cwd(). Running from any directory other than the project root
   * caused all 5 static cases to ENOENT (exit 1, 0/5). This test changes cwd
   * to a tmpdir and passes an absolute manifest path — asserts that 5/5 static
   * cases still pass and the command exits 0, so the regression cannot return.
   *
   * NFR-001 / BUG-A: layer fixturePaths must be resolved against the manifest
   * directory, not process.cwd().
   */
  it("BUG-A regression: --static-only 5/5 regardless of cwd (cwd-independence)", async () => {
    const originalCwd = process.cwd();
    try {
      // Change to a directory that has NO fixtures sub-tree.
      process.chdir(tmpdir());

      // Use an ABSOLUTE manifest path — so the manifest is found regardless of cwd.
      const { code, stdout, stderr } = await run([
        "crosslayer",
        "run",
        crosslayerManifest,   // already absolute (join(repoRoot, ...))
        "--static-only",
      ]);

      expect(stderr).toBe("");
      expect(code).toBe(0);
      expect(stdout).toContain("crosslayer: PASS");
      expect(stdout).toContain("5/5 cases passed");
    } finally {
      // Restore cwd so other tests are unaffected.
      process.chdir(originalCwd);
    }
  });

  /**
   * BUG-B: behavioral via CLI uses MUSTER_ENDPOINT env var.
   *
   * Before the fix, `crosslayer run <manifest>` with no manifest endpoint
   * hard-errored with "endpoint is required". After the fix, setting
   * MUSTER_ENDPOINT in the environment wires up the behavioral endpoint and
   * cases run (or skip gracefully if the key is missing).
   *
   * This test mocks fetch and verifies that when MUSTER_ENDPOINT is set the
   * command runs behavioral cases from the manifest (rather than erroring with
   * exit 2 about a missing endpoint).
   */
  it("BUG-B: MUSTER_ENDPOINT env var enables behavioral run without manifest endpoint block", async () => {
    // Mock fetch so behavioral cases return refusal responses without a live endpoint.
    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      const payload = JSON.stringify({
        choices: [{ message: { content: "I can't help with that.", role: "assistant" } }],
      });
      return Promise.resolve(new Response(payload, {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    });

    const origEndpoint = process.env["MUSTER_ENDPOINT"];
    const origModel = process.env["MUSTER_MODEL"];
    const origKey = process.env["MUSTER_API_KEY"];
    try {
      process.env["MUSTER_ENDPOINT"] = "http://mock-endpoint.local/v1";
      process.env["MUSTER_MODEL"] = "test-model";
      process.env["MUSTER_API_KEY"] = "test-key-stub";

      // manifest.yaml has no endpoint block — pre-fix this was exit 2
      const { code, stdout, stderr } = await run([
        "crosslayer",
        "run",
        crosslayerManifest,
      ]);

      // Must NOT hard-error on missing manifest endpoint.
      // The command runs; static cases pass; behavioral cases may pass or fail
      // depending on mock responses — but exit code must be 0 or 1 (not 2).
      expect(code).not.toBe(2);
      // Human summary must appear on stdout.
      expect(stdout).toContain("crosslayer:");
      // No "endpoint is required" crash on stderr.
      expect(stderr).not.toContain("endpoint is required");
    } finally {
      if (origEndpoint === undefined) {
        delete process.env["MUSTER_ENDPOINT"];
      } else {
        process.env["MUSTER_ENDPOINT"] = origEndpoint;
      }
      if (origModel === undefined) {
        delete process.env["MUSTER_MODEL"];
      } else {
        process.env["MUSTER_MODEL"] = origModel;
      }
      if (origKey === undefined) {
        delete process.env["MUSTER_API_KEY"];
      } else {
        process.env["MUSTER_API_KEY"] = origKey;
      }
      vi.restoreAllMocks();
    }
  });

  /**
   * BUG-B graceful skip: without MUSTER_ENDPOINT and no manifest endpoint,
   * behavioral cases skip gracefully; static cases still run (exit 0 or 1
   * from static results, not exit 2 from a hard endpoint validation error).
   */
  it("BUG-B graceful skip: no endpoint anywhere → behavioral cases skipped, static still runs", async () => {
    const origEndpoint = process.env["MUSTER_ENDPOINT"];
    try {
      delete process.env["MUSTER_ENDPOINT"];

      // manifest.yaml has no endpoint block; MUSTER_ENDPOINT is unset.
      // Pre-fix: exit 2, "endpoint is required".
      // Post-fix: static cases run, behavioral cases skipped gracefully.
      const { code, stdout, stderr } = await run([
        "crosslayer",
        "run",
        crosslayerManifest,
      ]);

      // Must NOT be an execution error.
      expect(code).not.toBe(2);
      // Static cases appear in output.
      expect(stdout).toContain("crosslayer:");
      expect(stdout).toContain("benign-persona-sop");
      // A notice on stderr about skipping behavioral cases.
      expect(stderr).toContain("behavioral cases skipped");
    } finally {
      if (origEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = origEndpoint;
      }
    }
  });
});
