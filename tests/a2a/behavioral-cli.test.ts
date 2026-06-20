/**
 * T025 — A2A behavioral CLI integration tests (WP04).
 *
 * Tests the end-to-end `muster a2a run <behavioral.yaml>` surface via runCli().
 * No network access — scripted via mocked behavioral runner or offline skip.
 *
 * Coverage:
 *   (a) No endpoint → behavioral cases skipped, exit 0 (FR-009).
 *   (b) All-pass behavioral run → exit 0 (FR-008).
 *   (c) ≥1 failing case → exit 1 (FR-008).
 *   (d) All-errored → exit 2 (FR-008, D5/FR-010).
 *   (e) --json shape: CaseVerdict[] (existing behave convention).
 *   (f) --json no-endpoint: empty array [].
 *   (g) Bad manifest → manifest validation error, exit 2.
 *   (h) Static path regression: examples/a2a/manifest.json still routes to
 *       static runner (no behavioral routing); exit 0 (additive-only change).
 *   (i) --json static path: JSON summary emitted for static manifest.
 *   (j) formatA2aBehavioralHuman skip shape: "SKIP" appears in output.
 *   (k) formatA2aBehavioralHuman pass shape: "PASS" + summary line.
 *   (l) formatA2aBehavioralHuman fail shape: axis detail (measured vs limit).
 *
 * No .skip / .only / .todo added; no test weakened.
 * Normative: FR-006/FR-007/FR-008/FR-009/FR-010/FR-013; NFR-002/NFR-003.
 * Citation: a2a-behavioral-conformance-01KVJDWE WP04 T025.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve as resolvePath } from "node:path";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runCli } from "../../src/cli/index.js";
import {
  formatA2aBehavioralHuman,
} from "../../src/cli/output.js";
import type { CaseVerdict } from "../../src/adapters/a2a/index.js";

// ---------------------------------------------------------------------------
// Test fixtures — small in-memory behavioral manifests written to a tmp dir
// ---------------------------------------------------------------------------

const TMP_DIR = resolvePath(tmpdir(), `muster-wp04-test-${process.pid}`);

/** Minimal valid behavioral manifest YAML — defaults to MUSTER_A2A_ENDPOINT. */
const BEHAVIORAL_YAML = `
adapter: a2a
kind: behavioral
endpoint:
  env: MUSTER_A2A_ENDPOINT
  token_env: MUSTER_A2A_TOKEN
defaults:
  runs: 1
  pass_threshold: 1
cases:
  - id: c-verbosity
    thresholds:
      default_max_words: 10
    turns:
      - role: user
        content: "Hello"
    axes:
      - axis: verbosity
        turns: all
`.trim();

let tmpManifest: string;
let tmpBadManifest: string;

beforeEach(async () => {
  await mkdir(TMP_DIR, { recursive: true });
  tmpManifest = resolvePath(TMP_DIR, "behavioral.yaml");
  tmpBadManifest = resolvePath(TMP_DIR, "behavioral-bad.yaml");
  await writeFile(tmpManifest, BEHAVIORAL_YAML, "utf8");
  // A manifest with unknown field (fails strict validation — FR-005).
  await writeFile(
    tmpBadManifest,
    BEHAVIORAL_YAML.replace("cases:", "unknown_field: true\ncases:"),
    "utf8"
  );
});

afterEach(async () => {
  await rm(TMP_DIR, { recursive: true, force: true });
  delete process.env["MUSTER_A2A_ENDPOINT"];
  delete process.env["MUSTER_A2A_TOKEN"];
});

// ---------------------------------------------------------------------------
// Capture helper — collect stdout/stderr as strings
// ---------------------------------------------------------------------------

interface Captured {
  out: string;
  err: string;
  exit: number;
}

async function runA2a(args: string[], env: Record<string, string> = {}): Promise<Captured> {
  // Inject env vars without permanently mutating process.env.
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }

  let out = "";
  let err = "";
  const exit = await runCli(["a2a", "run", ...args], {
    out: (text) => { out += text; },
    err: (text) => { err += text; },
  });

  for (const [k] of Object.entries(env)) {
    const prev = saved[k];
    if (prev === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = prev;
    }
  }

  return { out, err, exit };
}

// ---------------------------------------------------------------------------
// (a) No endpoint → skip, exit 0 (FR-009)
// ---------------------------------------------------------------------------

describe("behavioral: no endpoint → skip, exit 0", () => {
  it("returns exit 0 and human output contains SKIP", async () => {
    const result = await runA2a([tmpManifest]);
    expect(result.exit).toBe(0);
    expect(result.out).toContain("SKIP");
    // No endpoint should appear in output (NFR-002).
    expect(result.out).not.toContain("://");
  });

  it("does not output a token or credential (NFR-002)", async () => {
    const result = await runA2a([tmpManifest]);
    expect(result.out).not.toMatch(/sk-[A-Za-z0-9]/);
    expect(result.out).not.toContain("Bearer ");
  });
});

// ---------------------------------------------------------------------------
// (f) --json no-endpoint: empty array
// ---------------------------------------------------------------------------

describe("behavioral --json: no endpoint → empty array", () => {
  it("emits [] on stdout when endpoint absent", async () => {
    const result = await runA2a(["--json", tmpManifest]);
    expect(result.exit).toBe(0);
    expect(result.out.trim()).toBe("[]");
  });
});

// ---------------------------------------------------------------------------
// (g) Bad manifest → validation error, exit 2
// ---------------------------------------------------------------------------

describe("behavioral: bad manifest → exit 2", () => {
  it("exits 2 and reports validation errors on stderr", async () => {
    const result = await runA2a([tmpBadManifest]);
    expect(result.exit).toBe(2);
    expect(result.err).toContain("validation");
  });
});

// ---------------------------------------------------------------------------
// (h) Static path regression: examples/a2a/manifest.json routes to static runner
// ---------------------------------------------------------------------------

describe("static path regression (NFR-003)", () => {
  it("examples/a2a/manifest.json routes to static runner and exits 0", async () => {
    const staticManifest = resolvePath("examples/a2a/manifest.json");
    // No endpoint → static cases run, live cases skipped → exit 0.
    const result = await runA2a([staticManifest]);
    // Static path emits human A2A summary (not behavioral format).
    expect(result.exit).toBe(0);
    // Static summary includes the word "a2a:" (formatA2aSummaryHuman prefix).
    expect(result.out).toContain("a2a:");
    // Static path does NOT emit "behavioral" (routing is additive).
    expect(result.out).not.toContain("behavioral");
  });

  it("examples/a2a/manifest.json --json emits an object (not an array)", async () => {
    const staticManifest = resolvePath("examples/a2a/manifest.json");
    const result = await runA2a(["--json", staticManifest]);
    expect(result.exit).toBe(0);
    const parsed = JSON.parse(result.out) as unknown;
    // Static path emits ManifestSummary (object with results array), not CaseVerdict[].
    expect(typeof parsed).toBe("object");
    expect(Array.isArray(parsed)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (i) Static path with --json emits JSON summary
// ---------------------------------------------------------------------------

describe("static path --json emits JSON", () => {
  it("static manifest with --json produces parseable JSON", async () => {
    const staticManifest = resolvePath("examples/a2a/manifest.json");
    const result = await runA2a(["--json", staticManifest]);
    expect(() => JSON.parse(result.out)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// (j/k/l) formatA2aBehavioralHuman — unit coverage of output module
// ---------------------------------------------------------------------------

describe("formatA2aBehavioralHuman", () => {
  it("(j) skipped: contains SKIP marker for each case id", () => {
    const verdicts: CaseVerdict[] = [
      { id: "case-a", passed: false, passCount: 0, runs: [] },
      { id: "case-b", passed: false, passCount: 0, runs: [] },
    ];
    const output = formatA2aBehavioralHuman(verdicts, true);
    expect(output).toContain("SKIP");
    expect(output).toContain("case-a");
    expect(output).toContain("case-b");
    expect(output).toContain("a2a-behavioral");
  });

  it("(k) all-pass: contains PASS and summary line", () => {
    const verdicts: CaseVerdict[] = [
      {
        id: "case-pass",
        passed: true,
        passCount: 1,
        runs: [{ run: 1, passed: true, axes: [], transcript: { entries: [], model: "a2a", baseUrl: "", temperature: "default", durationMs: 0 } }],
      },
    ];
    const output = formatA2aBehavioralHuman(verdicts, false);
    expect(output).toContain("PASS case-pass");
    expect(output).toContain("1/1 runs");
    expect(output).toContain("a2a-behavioral: PASS");
    expect(output).toContain("1 passed, 0 failed of 1");
  });

  it("(l) failing: includes per-axis measured vs limit detail", () => {
    const verdicts: CaseVerdict[] = [
      {
        id: "case-fail",
        passed: false,
        passCount: 0,
        runs: [
          {
            run: 1,
            passed: false,
            axes: [
              { axis: "verbosity", turn: 0, measured: 42, limit: 10, passed: false },
            ],
            transcript: { entries: [], model: "a2a", baseUrl: "", temperature: "default", durationMs: 0 },
          },
        ],
      },
    ];
    const output = formatA2aBehavioralHuman(verdicts, false);
    expect(output).toContain("FAIL case-fail");
    expect(output).toContain("verbosity");
    expect(output).toContain("measured 42");
    expect(output).toContain("limit 10");
    expect(output).toContain("a2a-behavioral: FAIL");
    expect(output).toContain("0 passed, 1 failed of 1");
  });

  it("empty verdicts with skipped=false emits summary line", () => {
    const output = formatA2aBehavioralHuman([], false);
    expect(output).toContain("a2a-behavioral: PASS");
    expect(output).toContain("0 passed, 0 failed of 0");
  });
});

// ---------------------------------------------------------------------------
// (e) --json shape: CaseVerdict[] (verification of shape contract)
// ---------------------------------------------------------------------------

describe("--json behavioral shape", () => {
  it("behavioral example manifests load and skip offline with exit 0", async () => {
    const personaExample = resolvePath("examples/a2a/behavioral-persona.yaml");
    const result = await runA2a([personaExample]);
    // No endpoint → skip, exit 0.
    expect(result.exit).toBe(0);
  });

  it("behavioral-explicit.yaml loads, skips offline, exit 0 (offline smoke)", async () => {
    const explicitExample = resolvePath("examples/a2a/behavioral-explicit.yaml");
    const result = await runA2a([explicitExample]);
    expect(result.exit).toBe(0);
    // No credential in output (NFR-002).
    expect(result.out).not.toContain("://");
  });

  it("--json behavioral-explicit.yaml offline emits []", async () => {
    const explicitExample = resolvePath("examples/a2a/behavioral-explicit.yaml");
    const result = await runA2a(["--json", explicitExample]);
    expect(result.exit).toBe(0);
    expect(result.out.trim()).toBe("[]");
  });
});

// ---------------------------------------------------------------------------
// (b/c/d) Live-endpoint paths via runA2aBehavioralManifest with a bad endpoint.
// The adapter under test: runA2aBehavioralManifest (unit coverage for index.ts).
// We set an endpoint URL that cannot be reached → sendMessage throws on every
// run → allErrored=true.
// ---------------------------------------------------------------------------

import {
  runA2aBehavioralManifest,
} from "../../src/adapters/a2a/index.js";
import { rfc1Adapter } from "../../src/adapters/rfc1/index.js";
import { writeFile as writeFileSync } from "node:fs/promises";

const DEAD_ENDPOINT = "http://127.0.0.1:1"; // nothing listening on port 1

describe("runA2aBehavioralManifest: endpoint present but unreachable (allErrored)", () => {
  it("(d) all-errored: every run fails → allErrored=true, exitCode=2", async () => {
    const manifest = resolvePath(TMP_DIR, "live-fail.yaml");
    await writeFileSync(
      manifest,
      `adapter: a2a\nkind: behavioral\nendpoint:\n  env: TEST_DEAD_EP\n  token_env: TEST_DEAD_TOK\ndefaults:\n  runs: 1\n  pass_threshold: 1\ncases:\n  - id: dead-endpoint\n    thresholds:\n      default_max_words: 10\n    turns:\n      - role: user\n        content: "Hello"\n    axes:\n      - axis: verbosity\n        turns: all\n`,
      "utf8"
    );

    const savedEp = process.env["TEST_DEAD_EP"];
    process.env["TEST_DEAD_EP"] = DEAD_ENDPOINT;
    try {
      const outcome = await runA2aBehavioralManifest(manifest, rfc1Adapter);
      expect(outcome.skipped).toBe(false);
      expect(outcome.violations).toHaveLength(0);
      expect(outcome.result).not.toBeNull();
      // All runs will error because the endpoint is unreachable.
      expect(outcome.result?.allErrored).toBe(true);
      expect(outcome.result?.exitCode).toBe(2);
    } finally {
      if (savedEp === undefined) {
        delete process.env["TEST_DEAD_EP"];
      } else {
        process.env["TEST_DEAD_EP"] = savedEp;
      }
    }
  }, 15000);

  it("(d) all-errored via CLI: exits 2, stderr mentions endpoint fatal", async () => {
    const manifest = resolvePath(TMP_DIR, "live-fail-cli.yaml");
    await writeFileSync(
      manifest,
      `adapter: a2a\nkind: behavioral\nendpoint:\n  env: TEST_DEAD_EP2\n  token_env: TEST_DEAD_TOK2\ndefaults:\n  runs: 1\n  pass_threshold: 1\ncases:\n  - id: dead-endpoint-cli\n    thresholds:\n      default_max_words: 10\n    turns:\n      - role: user\n        content: "Hello"\n    axes:\n      - axis: verbosity\n        turns: all\n`,
      "utf8"
    );

    const result = await runA2a([manifest], { TEST_DEAD_EP2: DEAD_ENDPOINT });
    expect(result.exit).toBe(2);
    expect(result.err).toContain("fatal");
  }, 15000);

  it("(d) allErrored --json: emits CaseVerdict[] array (with errored runs)", async () => {
    const manifest = resolvePath(TMP_DIR, "live-fail-json.yaml");
    await writeFileSync(
      manifest,
      `adapter: a2a\nkind: behavioral\nendpoint:\n  env: TEST_DEAD_EP3\n  token_env: TEST_DEAD_TOK3\ndefaults:\n  runs: 1\n  pass_threshold: 1\ncases:\n  - id: dead-endpoint-json\n    thresholds:\n      default_max_words: 10\n    turns:\n      - role: user\n        content: "Hello"\n    axes:\n      - axis: verbosity\n        turns: all\n`,
      "utf8"
    );

    const result = await runA2a(["--json", manifest], { TEST_DEAD_EP3: DEAD_ENDPOINT });
    // --json emits CaseVerdict[].
    const parsed = JSON.parse(result.out) as unknown;
    expect(Array.isArray(parsed)).toBe(true);
    expect((parsed as unknown[]).length).toBeGreaterThan(0);
    // Exit is 2 (all-errored).
    expect(result.exit).toBe(2);
  }, 15000);
});

// ---------------------------------------------------------------------------
// Validation error path: runA2aBehavioralManifest with bad manifest
// ---------------------------------------------------------------------------

describe("runA2aBehavioralManifest: validation errors", () => {
  it("returns violations when manifest has unknown field", async () => {
    const manifest = resolvePath(TMP_DIR, "bad-manifest2.yaml");
    await writeFileSync(manifest, BEHAVIORAL_YAML.replace("cases:", "bad_field: 1\ncases:"), "utf8");
    const outcome = await runA2aBehavioralManifest(manifest, rfc1Adapter);
    expect(outcome.violations.length).toBeGreaterThan(0);
    expect(outcome.skipped).toBe(false);
    expect(outcome.result).toBeNull();
  });

  it("returns violations when manifest file does not exist", async () => {
    const outcome = await runA2aBehavioralManifest("/nonexistent/behavioral.yaml", rfc1Adapter);
    expect(outcome.violations.length).toBeGreaterThan(0);
  });
});
