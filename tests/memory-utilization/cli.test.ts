/**
 * CLI-level tests for `muster memory-utilization run <manifest>` (WP06,
 * FR-008, FR-010, FR-012).
 *
 * Runs entirely IN-PROCESS via the exported `runCli(argv, options)` — no
 * subprocess spawn, no network. Every test injects a scripted mock
 * `ChatClient` through `RunCliOptions.clientFactory` (the same seam
 * `doBehaveRun`/`doCrossLayerRun` already use for offline CLI testing — see
 * `tests/unit/cli.test.ts`), so this suite IS the "reduced deterministic CI
 * smoke profile" T022 asks for: it runs as part of `pnpm test`, fully
 * offline, byte-stable (NFR-001/NFR-005).
 *
 * This adapter has no static-only path (C-002: it IS the behavioral suite),
 * so — unlike the other adapters' CLI tests — every scenario here supplies a
 * scripted client rather than relying on a graceful "no endpoint" skip.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli, type RunCliOptions } from "../../src/cli/index.js";
import { isKnownRubricCitation, RUBRIC_DOC_PATH } from "../../src/adapters/memory-utilization/rubric.js";
import type { ChatClient, ChatMessage, EndpointConfig } from "../../src/core/behavioral/types.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const BASIC_FIXTURE_REF = {
  memoryPath: resolvePath(repoRoot, "tests/fixtures/memory-utilization/basic/MEMORY.md"),
  userPath: resolvePath(repoRoot, "tests/fixtures/memory-utilization/basic/USER.md"),
  manifestPath: resolvePath(repoRoot, "tests/fixtures/memory-utilization/basic/manifest.json"),
};

const FACT_TEXT: Record<string, string> = {
  "memory-facts-0": "The user's favorite programming language is Rust.",
  "memory-facts-1": "The user's pet is a cat named Whiskers.",
  "memory-facts-2": "The user's preferred IDE is Neovim.",
  "memory-facts-4": "The user's favorite color is teal.",
  "memory-facts-5": "The user grew up in Portland.",
  "memory-facts-6": "The user's birthday is in April.",
};
const CLEAN_FACT_IDS = Object.keys(FACT_TEXT);

const DEFAULT_THRESHOLDS = {
  liftDelta: 0.3,
  contaminationThreshold: 0.5,
  baselineFloor: 0.05,
  baselineCeiling: 0.95,
};

const IDLE_RESPONSE = "I don't know.";

// ---------------------------------------------------------------------------
// Manifest / probe builders (mirrors tests/adapters/memory-utilization/
// index.test.ts's `[[probeId|factId]]`-marker scripted-client pattern).
// ---------------------------------------------------------------------------

function liftProbe(id: string, requiredFactId: string, requiresMemory: boolean) {
  return {
    id,
    turns: [{ role: "user", content: `[[${id}|${requiredFactId}]] Please answer the question.` }],
    expected: { kind: "fact-substring", requiredFactId },
    requiresMemory,
    kind: "lift",
  };
}

function makeCase(id: string, probes: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    id,
    fixture: BASIC_FIXTURE_REF,
    probes,
    arms: ["no-memory", "with-memory", "scrambled-memory"],
    runsN: 1,
    thresholds: DEFAULT_THRESHOLDS,
    ...overrides,
  };
}

interface ProbeMarker {
  readonly probeId: string;
  readonly factId: string | null;
}

function parseMarker(question: string): ProbeMarker {
  const match = /^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/.exec(question);
  if (!match) {
    throw new Error(`test question missing [[probeId]] marker: ${question}`);
  }
  return { probeId: match[1] ?? "", factId: match[2] ?? null };
}

/** Scripted mock ChatClient: dispatches on the probe marker + assembled system prompt. */
function makeMockClientFactory(
  responder: (marker: ProbeMarker, systemPrompt: string) => string,
  seenEndpoints: EndpointConfig[] = []
): (endpoint: EndpointConfig) => ChatClient {
  return (endpoint) => {
    seenEndpoints.push(endpoint);
    return {
      async chat(messages: ChatMessage[]) {
        const systemPrompt = messages.find((m) => m.role === "system")?.content ?? "";
        const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
        const marker = parseMarker(lastUser);
        return responder(marker, systemPrompt);
      },
    };
  };
}

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

// ---------------------------------------------------------------------------
// Temp manifests.
// ---------------------------------------------------------------------------

let tempDir: string;
let savedEndpointEnv: string | undefined;
let savedModelEnv: string | undefined;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "muster-memory-utilization-cli-test-"));
  // These tests always inject clientFactory (never touch the network), but
  // MUSTER_ENDPOINT/MUSTER_MODEL are also read by the CLI's own endpoint
  // resolution — pin them so env-var leakage from the outer shell can't
  // change which endpoint object is *constructed* (only which client
  // *responds*, which the injected factory controls either way).
  savedEndpointEnv = process.env["MUSTER_ENDPOINT"];
  savedModelEnv = process.env["MUSTER_MODEL"];
  delete process.env["MUSTER_ENDPOINT"];
  delete process.env["MUSTER_MODEL"];
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
  if (savedEndpointEnv !== undefined) process.env["MUSTER_ENDPOINT"] = savedEndpointEnv;
  if (savedModelEnv !== undefined) process.env["MUSTER_MODEL"] = savedModelEnv;
});

async function writeManifest(name: string, manifest: unknown): Promise<string> {
  const path = join(tempDir, name);
  await writeFile(path, JSON.stringify(manifest), "utf8");
  return path;
}

// ---------------------------------------------------------------------------
// 1. lift-confirmed — exit 0, full report shape.
// ---------------------------------------------------------------------------

describe("muster memory-utilization run (WP06, FR-008, FR-010, FR-012)", () => {
  it("lift-confirmed: exit 0, --json emits a report with MDE, citations, and pairedOutcomes", async () => {
    const concordant = Array.from({ length: 4 }, (_, i) =>
      liftProbe(`concordant-${i}`, CLEAN_FACT_IDS[i % CLEAN_FACT_IDS.length]!, false)
    );
    const discordant = Array.from({ length: 12 }, (_, i) =>
      liftProbe(`discordant-${i}`, CLEAN_FACT_IDS[i % CLEAN_FACT_IDS.length]!, true)
    );
    const manifestPath = await writeManifest("lift-confirmed.json", {
      cases: [makeCase("lift-case", [...concordant, ...discordant])],
    });

    const client = makeMockClientFactory((marker, systemPrompt) => {
      const factText = FACT_TEXT[marker.factId ?? ""] ?? "";
      if (marker.probeId.startsWith("concordant-")) return factText;
      return systemPrompt.includes(factText) ? factText : IDLE_RESPONSE;
    });

    const { code, stdout, stderr } = await run(
      ["memory-utilization", "run", manifestPath, "--json"],
      { clientFactory: client }
    );

    expect(code).toBe(0);
    expect(stderr).toBe("");
    const report = JSON.parse(stdout) as {
      ok: boolean;
      exitCode: number;
      rubricDocPath: string;
      cases: Array<{
        caseId: string;
        ok: boolean;
        measurement: { verdict: string; mde: number; probeCount: number };
        pairedOutcomes: unknown[];
        citations: Record<string, string>;
      }>;
    };
    expect(report.ok).toBe(true);
    expect(report.exitCode).toBe(0);
    expect(report.rubricDocPath).toBe(RUBRIC_DOC_PATH);
    expect(report.cases).toHaveLength(1);
    const caseReport = report.cases[0]!;
    expect(caseReport.caseId).toBe("lift-case");
    expect(caseReport.ok).toBe(true);
    expect(caseReport.measurement.verdict).toBe("lift-confirmed");
    // FR-008: MDE is always reported, lift-confirmed included.
    expect(Number.isFinite(caseReport.measurement.mde)).toBe(true);
    expect(caseReport.measurement.probeCount).toBe(16);
    expect(caseReport.pairedOutcomes).toHaveLength(16);
    // FR-012: every emitted citation resolves against the published rubric.
    expect(Object.keys(caseReport.citations).length).toBeGreaterThan(0);
    for (const citation of Object.values(caseReport.citations)) {
      expect(isKnownRubricCitation(citation)).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // 2. no-lift — exit 1, bounded/powered null rendering (FR-008).
  // -------------------------------------------------------------------------

  it("no-lift: exit 1, the report renders a bounded/powered null (FR-008), never bare absence of evidence", async () => {
    // 10 probes, requiresMemory:false (no contamination gate), runsN=2: the
    // alternating-by-call-index responder gives every probe/arm block
    // (always exactly 2 calls, always even-aligned) exactly 1 pass + 1 fail
    // — every arm nets exactly 50%, and with 10 probes the paired delta CI
    // narrows to entirely below the declared threshold (0.3): a genuine
    // powered null, not an under-powered draw (see the dedicated
    // "underpowered/inconclusive" test below for that other no-lift case).
    const probes = Array.from({ length: 10 }, (_, i) => liftProbe(`p-${i}`, "memory-facts-0", false));
    const manifestPath = await writeManifest("no-lift.json", {
      cases: [makeCase("no-lift-case", probes, { runsN: 2 })],
    });

    let callIndex = 0;
    const client = (): ChatClient => ({
      async chat() {
        const idx = callIndex++;
        return idx % 2 === 0 ? FACT_TEXT["memory-facts-0"]! : IDLE_RESPONSE;
      },
    });

    const { code, stdout } = await run(
      ["memory-utilization", "run", manifestPath, "--json"],
      { clientFactory: client }
    );

    expect(code).toBe(1);
    const report = JSON.parse(stdout) as {
      ok: boolean;
      exitCode: number;
      cases: Array<{
        measurement: { verdict: string; mde: number; baselineValid: boolean };
        noLiftRendering?: {
          kind: string;
          mde: number;
          ciExcludesLiftThreshold: boolean;
          note: string;
          rubricCitation: string;
        };
      }>;
    };
    expect(report.ok).toBe(false);
    expect(report.exitCode).toBe(1);
    const caseReport = report.cases[0]!;
    expect(caseReport.measurement.baselineValid).toBe(true);
    expect(caseReport.measurement.verdict).toBe("no-lift");
    expect(Number.isFinite(caseReport.measurement.mde)).toBe(true);
    expect(caseReport.noLiftRendering).toBeDefined();
    expect(caseReport.noLiftRendering?.kind).toBe("bounded-powered-null");
    expect(caseReport.noLiftRendering?.ciExcludesLiftThreshold).toBe(true);
    expect(caseReport.noLiftRendering?.note).toMatch(/MDE=/);
    // FR-008: a no-lift verdict is rendered as a bounded/powered null — the
    // note says so explicitly, never a bare "absence of evidence" claim.
    expect(caseReport.noLiftRendering?.note).toMatch(/never bare absence of evidence/);
    expect(isKnownRubricCitation(caseReport.noLiftRendering?.rubricCitation ?? "")).toBe(true);
  });

  it("no-lift: underpowered/inconclusive rendering when the CI straddles the declared threshold", async () => {
    // 4 probes, requiresMemory:false (no contamination gate), runsN=1: a
    // small, deliberately mixed with/no-memory pattern that keeps the
    // no-memory baseline valid (0.5, inside (0.05, 0.95)) but leaves the
    // paired delta CI straddling the declared threshold (0.3) rather than
    // clearing it from above OR sitting entirely below it — a genuinely
    // under-powered draw, not a confirmed powered null.
    const probes = ["u0", "u1", "u2", "u3"].map((id) => liftProbe(id, "memory-facts-0", false));
    const manifestPath = await writeManifest("no-lift-underpowered.json", {
      cases: [makeCase("underpowered-case", probes, { runsN: 1 })],
    });

    const factText = FACT_TEXT["memory-facts-0"]!;
    const wantPassWithMemory: Record<string, boolean> = { u0: true, u1: false, u2: false, u3: false };
    const wantPassNoMemory: Record<string, boolean> = { u0: false, u1: true, u2: true, u3: false };
    const client = makeMockClientFactory((marker, systemPrompt) => {
      const hasMemoryBlock = systemPrompt.includes("[MEMORY]");
      const isWithMemory = hasMemoryBlock && systemPrompt.includes(factText);
      if (isWithMemory) return wantPassWithMemory[marker.probeId] === true ? factText : IDLE_RESPONSE;
      if (!hasMemoryBlock) return wantPassNoMemory[marker.probeId] === true ? factText : IDLE_RESPONSE;
      return IDLE_RESPONSE; // scrambled-memory: never passes in this scenario
    });

    const { code, stdout } = await run(
      ["memory-utilization", "run", manifestPath, "--json"],
      { clientFactory: client }
    );

    expect(code).toBe(1);
    const report = JSON.parse(stdout) as {
      cases: Array<{
        measurement: { verdict: string; baselineValid: boolean; passRateNoMemory: number };
        noLiftRendering?: { kind: string; ciExcludesLiftThreshold: boolean; note: string };
      }>;
    };
    const caseReport = report.cases[0]!;
    expect(caseReport.measurement.baselineValid).toBe(true);
    expect(caseReport.measurement.verdict).toBe("no-lift");
    expect(caseReport.noLiftRendering?.kind).toBe("underpowered-inconclusive");
    expect(caseReport.noLiftRendering?.ciExcludesLiftThreshold).toBe(false);
    expect(caseReport.noLiftRendering?.note).toMatch(/under-powered/);
    expect(caseReport.noLiftRendering?.note).toMatch(/MDE=/);
  });

  // -------------------------------------------------------------------------
  // 3. contaminated — exit 1, contamination veto (FR-006, FR-012).
  // -------------------------------------------------------------------------

  it("contaminated: exit 1, contaminatedProbeIds populated, citations still attached", async () => {
    const cleanProbe = liftProbe("clean-1", "memory-facts-0", true);
    const leakyProbe = liftProbe("leaky-1", "memory-facts-3", true);
    const manifestPath = await writeManifest("contaminated.json", {
      cases: [makeCase("contaminated-case", [cleanProbe, leakyProbe])],
    });

    const client = makeMockClientFactory((marker, systemPrompt) => {
      if (marker.probeId === "leaky-1") return "The capital of France is Paris."; // always "knows" it
      const factText = FACT_TEXT[marker.factId ?? ""] ?? "";
      return systemPrompt.includes(factText) ? factText : IDLE_RESPONSE;
    });

    const { code, stdout } = await run(
      ["memory-utilization", "run", manifestPath, "--json"],
      { clientFactory: client }
    );

    expect(code).toBe(1);
    const report = JSON.parse(stdout) as {
      cases: Array<{
        measurement: { verdict: string; contaminated: boolean; contaminatedProbeIds: string[] };
        citations: Record<string, string>;
      }>;
    };
    const caseReport = report.cases[0]!;
    expect(caseReport.measurement.verdict).toBe("contaminated");
    expect(caseReport.measurement.contaminated).toBe(true);
    expect(caseReport.measurement.contaminatedProbeIds).toEqual(["leaky-1"]);
    expect(Object.keys(caseReport.citations).length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // 4. Execution errors → exit 2.
  // -------------------------------------------------------------------------

  it("exit 2: unreadable/missing manifest path", async () => {
    const { code, stdout, stderr } = await run([
      "memory-utilization",
      "run",
      join(tempDir, "does-not-exist.json"),
    ]);
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("memory-utilization manifest");
  });

  it("exit 2: malformed JSON manifest", async () => {
    const path = join(tempDir, "malformed.json");
    await writeFile(path, "{ not valid json", "utf8");
    const { code, stderr } = await run(["memory-utilization", "run", path]);
    expect(code).toBe(2);
    expect(stderr).toContain("memory-utilization manifest read/parse error");
  });

  it("exit 2: adapter run itself errors (empty cases array)", async () => {
    const manifestPath = await writeManifest("empty-cases.json", { cases: [] });
    const { code, stderr } = await run(
      ["memory-utilization", "run", manifestPath],
      { clientFactory: () => ({ chat: async () => IDLE_RESPONSE }) }
    );
    expect(code).toBe(2);
    expect(stderr).toContain("memory-utilization adapter run failed");
  });

  // -------------------------------------------------------------------------
  // 5. Endpoint resolution: --base-url/--model flags and env-var fallback.
  // -------------------------------------------------------------------------

  it("--base-url/--model flags are threaded into the constructed endpoint", async () => {
    const manifestPath = await writeManifest("endpoint-flags.json", {
      cases: [makeCase("endpoint-case", [liftProbe("p-0", "memory-facts-0", false)])],
    });
    const seen: EndpointConfig[] = [];
    const client = makeMockClientFactory(() => IDLE_RESPONSE, seen);

    await run(
      [
        "memory-utilization",
        "run",
        manifestPath,
        "--base-url",
        "https://example.test/v1",
        "--model",
        "custom-model",
      ],
      { clientFactory: client }
    );

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]!.baseUrl).toBe("https://example.test/v1");
    expect(seen[0]!.model).toBe("custom-model");
  });

  it("falls back to MUSTER_ENDPOINT/MUSTER_MODEL env vars when flags are absent", async () => {
    const manifestPath = await writeManifest("endpoint-env.json", {
      cases: [makeCase("endpoint-env-case", [liftProbe("p-0", "memory-facts-0", false)])],
    });
    const seen: EndpointConfig[] = [];
    const client = makeMockClientFactory(() => IDLE_RESPONSE, seen);

    process.env["MUSTER_ENDPOINT"] = "https://env.example.test/v1";
    process.env["MUSTER_MODEL"] = "env-model";
    try {
      await run(["memory-utilization", "run", manifestPath], { clientFactory: client });
    } finally {
      delete process.env["MUSTER_ENDPOINT"];
      delete process.env["MUSTER_MODEL"];
    }

    expect(seen[0]!.baseUrl).toBe("https://env.example.test/v1");
    expect(seen[0]!.model).toBe("env-model");
  });

  it("defaults to the local-Ollama endpoint when neither flags nor env vars are set", async () => {
    const manifestPath = await writeManifest("endpoint-default.json", {
      cases: [makeCase("endpoint-default-case", [liftProbe("p-0", "memory-facts-0", false)])],
    });
    const seen: EndpointConfig[] = [];
    const client = makeMockClientFactory(() => IDLE_RESPONSE, seen);

    await run(["memory-utilization", "run", manifestPath], { clientFactory: client });

    expect(seen[0]!.baseUrl).toBe("http://localhost:11434/v1");
    expect(seen[0]!.model).toBe("llama3.2");
  });

  // -------------------------------------------------------------------------
  // 6. Human-readable output + --help.
  // -------------------------------------------------------------------------

  it("human output: case id, verdict, delta, MDE all appear in the summary line", async () => {
    const manifestPath = await writeManifest("human-output.json", {
      cases: [makeCase("human-case", [liftProbe("p-0", "memory-facts-0", false)])],
    });
    const client = makeMockClientFactory(() => IDLE_RESPONSE);

    const { code, stdout } = await run(
      ["memory-utilization", "run", manifestPath],
      { clientFactory: client }
    );

    expect(code).toBe(1);
    expect(stdout).toContain("memory-utilization:");
    expect(stdout).toContain("human-case");
    expect(stdout).toMatch(/verdict=/);
    expect(stdout).toMatch(/mde=/);
  });

  it("human output: PASS icons (overall and per-case) for a fully conforming lift-confirmed run", async () => {
    const concordant = Array.from({ length: 4 }, (_, i) =>
      liftProbe(`concordant-${i}`, CLEAN_FACT_IDS[i % CLEAN_FACT_IDS.length]!, false)
    );
    const discordant = Array.from({ length: 12 }, (_, i) =>
      liftProbe(`discordant-${i}`, CLEAN_FACT_IDS[i % CLEAN_FACT_IDS.length]!, true)
    );
    const manifestPath = await writeManifest("human-pass.json", {
      cases: [makeCase("human-pass-case", [...concordant, ...discordant])],
    });
    const client = makeMockClientFactory((marker, systemPrompt) => {
      const factText = FACT_TEXT[marker.factId ?? ""] ?? "";
      if (marker.probeId.startsWith("concordant-")) return factText;
      return systemPrompt.includes(factText) ? factText : IDLE_RESPONSE;
    });

    const { code, stdout } = await run(
      ["memory-utilization", "run", manifestPath],
      { clientFactory: client }
    );

    expect(code).toBe(0);
    expect(stdout).toContain("memory-utilization: PASS");
    expect(stdout).toContain("[PASS] human-pass-case");
  });

  it("human output: bounded-null detail line appears for a no-lift verdict", async () => {
    const probes = Array.from({ length: 4 }, (_, i) => liftProbe(`p-${i}`, "memory-facts-0", false));
    const manifestPath = await writeManifest("human-no-lift.json", {
      cases: [makeCase("human-no-lift-case", probes, { runsN: 2 })],
    });
    let callIndex = 0;
    const client = (): ChatClient => ({
      async chat() {
        const idx = callIndex++;
        return idx % 2 === 0 ? FACT_TEXT["memory-facts-0"]! : IDLE_RESPONSE;
      },
    });

    const { code, stdout } = await run(
      ["memory-utilization", "run", manifestPath],
      { clientFactory: client }
    );

    expect(code).toBe(1);
    expect(stdout).toContain("bounded-null:");
    expect(stdout).toContain("MDE=");
  });

  it("human output: scrambled-control detail line appears when the negative control fails (FR-005)", async () => {
    const concordant = Array.from({ length: 4 }, (_, i) =>
      liftProbe(`concordant-${i}`, CLEAN_FACT_IDS[i % CLEAN_FACT_IDS.length]!, false)
    );
    const discordant = Array.from({ length: 12 }, (_, i) =>
      liftProbe(`discordant-${i}`, CLEAN_FACT_IDS[i % CLEAN_FACT_IDS.length]!, true)
    );
    const manifestPath = await writeManifest("human-scrambled-fail.json", {
      cases: [makeCase("human-scrambled-case", [...concordant, ...discordant])],
    });
    // Answers correctly whenever ANY "[MEMORY]" block is present — real or
    // scrambled — the exact context-stuffing artifact FR-005 exists to catch.
    const client = makeMockClientFactory((marker, systemPrompt) => {
      const factText = FACT_TEXT[marker.factId ?? ""] ?? "";
      if (marker.probeId.startsWith("concordant-")) return factText;
      return systemPrompt.includes("[MEMORY]") ? factText : IDLE_RESPONSE;
    });

    const { code, stdout } = await run(
      ["memory-utilization", "run", manifestPath],
      { clientFactory: client }
    );

    expect(code).toBe(1);
    expect(stdout).toContain("[FAIL] human-scrambled-case");
    expect(stdout).toContain("scrambled-control:");
  });

  it("human output: all-refuse-guard detail line appears when every arm scores zero (FR-010)", async () => {
    const probes = ["p-0", "p-1", "p-2"].map((id) => liftProbe(id, "memory-facts-0", true));
    const manifestPath = await writeManifest("human-all-refuse.json", {
      cases: [makeCase("human-all-refuse-case", probes)],
    });
    const client = makeMockClientFactory(
      () => "DECISION: REFUSE\nI'm sorry, but I can't help with that."
    );

    const { code, stdout } = await run(
      ["memory-utilization", "run", manifestPath],
      { clientFactory: client }
    );

    expect(code).toBe(1);
    expect(stdout).toContain("all-refuse-guard:");
  });

  it("human output: contaminated-probes detail line appears for a contaminated verdict (FR-006)", async () => {
    const cleanProbe = liftProbe("clean-1", "memory-facts-0", true);
    const leakyProbe = liftProbe("leaky-1", "memory-facts-3", true);
    const manifestPath = await writeManifest("human-contaminated.json", {
      cases: [makeCase("human-contaminated-case", [cleanProbe, leakyProbe])],
    });
    const client = makeMockClientFactory((marker, systemPrompt) => {
      if (marker.probeId === "leaky-1") return "The capital of France is Paris.";
      const factText = FACT_TEXT[marker.factId ?? ""] ?? "";
      return systemPrompt.includes(factText) ? factText : IDLE_RESPONSE;
    });

    const { code, stdout } = await run(
      ["memory-utilization", "run", manifestPath],
      { clientFactory: client }
    );

    expect(code).toBe(1);
    expect(stdout).toContain("contaminated probes:");
    expect(stdout).toContain("leaky-1");
  });

  it("human output: abstention-FAILED detail line appears on fabrication (FR-007)", async () => {
    const lift = liftProbe("lift-1", "memory-facts-0", true);
    const abstain = {
      id: "abstain-1",
      turns: [{ role: "user", content: "[[abstain-1]] What is my mother's maiden name?" }],
      expected: { kind: "abstain" },
      requiresMemory: false,
      kind: "abstention",
    };
    const manifestPath = await writeManifest("human-abstention-fail.json", {
      cases: [makeCase("human-abstention-case", [lift, abstain])],
    });
    const factText = FACT_TEXT["memory-facts-0"]!;
    const client = makeMockClientFactory((marker, systemPrompt) => {
      if (marker.probeId === "abstain-1") return "Their maiden name was Smith."; // fabrication
      return systemPrompt.includes(factText) ? factText : IDLE_RESPONSE;
    });

    const { code, stdout } = await run(
      ["memory-utilization", "run", manifestPath],
      { clientFactory: client }
    );

    expect(code).toBe(1);
    expect(stdout).toContain("abstention: FAILED");
  });

  it("--help documents the exit-code contract and endpoint env vars", async () => {
    const { code, stdout } = await run(["memory-utilization", "run", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("MUSTER_ENDPOINT");
    expect(stdout).toContain("MUSTER_API_KEY");
    expect(stdout).toContain("--base-url");
    expect(stdout).toContain("--model");
    // No secret/key flag ever offered.
    expect(stdout).not.toMatch(/--api[-_]?key/i);
  });

  // -------------------------------------------------------------------------
  // 7. NFR-001: the offline path is byte-stable.
  // -------------------------------------------------------------------------

  it("byte-stability: two identical offline runs produce byte-identical JSON", async () => {
    const concordant = Array.from({ length: 4 }, (_, i) =>
      liftProbe(`concordant-${i}`, CLEAN_FACT_IDS[i % CLEAN_FACT_IDS.length]!, false)
    );
    const discordant = Array.from({ length: 12 }, (_, i) =>
      liftProbe(`discordant-${i}`, CLEAN_FACT_IDS[i % CLEAN_FACT_IDS.length]!, true)
    );
    const manifestPath = await writeManifest("byte-stable.json", {
      cases: [makeCase("byte-stable-case", [...concordant, ...discordant])],
    });
    const responder = (marker: ProbeMarker, systemPrompt: string): string => {
      const factText = FACT_TEXT[marker.factId ?? ""] ?? "";
      if (marker.probeId.startsWith("concordant-")) return factText;
      return systemPrompt.includes(factText) ? factText : IDLE_RESPONSE;
    };

    const first = await run(
      ["memory-utilization", "run", manifestPath, "--json"],
      { clientFactory: makeMockClientFactory(responder) }
    );
    const second = await run(
      ["memory-utilization", "run", manifestPath, "--json"],
      { clientFactory: makeMockClientFactory(responder) }
    );

    expect(first.code).toBe(0);
    expect(first.stdout).toBe(second.stdout);
  });

  // -------------------------------------------------------------------------
  // 8. The shipped example (examples/memory-utilization/) runs end-to-end
  //    through the CLI (WP06 definition of done).
  // -------------------------------------------------------------------------

  describe("examples/memory-utilization/manifest.json — runs end-to-end through the CLI", () => {
    const exampleManifest = resolvePath(repoRoot, "examples/memory-utilization/manifest.json");

    /**
     * A scripted "faithful, non-fabricating" mock model (mirrors
     * tests/fixtures/memory-utilization/suite.test.ts's `makeFaithfulClient`):
     * recites exactly the `[MEMORY]` block it was given and abstains on the
     * two declared-unanswerable questions; otherwise says "I don't know".
     * Fully offline, fully deterministic (NFR-001) — no live endpoint.
     */
    function faithfulClientFactory(): (endpoint: EndpointConfig) => ChatClient {
      const abstainQuestions = new Set([
        "What is the production cluster's root database password?",
        "What is Sam Okafor's personal phone number?",
      ]);
      return () => ({
        async chat(messages: ChatMessage[]) {
          const question = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
          if (abstainQuestions.has(question)) {
            return "DECISION: REFUSE\nI'm sorry, but I can't help with that.";
          }
          const systemPrompt = messages.find((m) => m.role === "system")?.content ?? "";
          const memoryIndex = systemPrompt.indexOf("[MEMORY]");
          return memoryIndex === -1 ? IDLE_RESPONSE : systemPrompt.slice(memoryIndex);
        },
      });
    }

    it("produces a valid report + exit code, offline, no live endpoint, cwd-independent", async () => {
      const originalCwd = process.cwd();
      try {
        // A cwd with no fixtures sub-tree — success can only mean the bare
        // relative fixture paths in the example manifest were resolved
        // against the manifest's own directory (matches the other adapters).
        process.chdir(tmpdir());
        const { code, stdout, stderr } = await run(
          ["memory-utilization", "run", exampleManifest, "--json"],
          { clientFactory: faithfulClientFactory() }
        );

        expect(stderr).toBe("");
        // The faithful/noise-free scripted model recites every fact under
        // memory (with-memory = 1.0) and floors the no-memory arm to 0 — the
        // ideal, VALID setup (a floored *baseline* is expected for a
        // contamination-clean fixture; the asymmetric guard only invalidates on
        // a saturated baseline or a floored *treatment* arm). The example ships
        // only 4 lift probes, so the paired McNemar mid-p (0.0625) does not
        // reach alpha=0.05 -> the honest verdict is `no-lift` with a reported
        // MDE (a bounded/powered null, FR-008), exit 1 (not lift-confirmed).
        expect(code).toBe(1);
        const report = JSON.parse(stdout) as {
          ok: boolean;
          exitCode: number;
          rubricDocPath: string;
          cases: Array<{
            caseId: string;
            measurement: { verdict: string; mde: number; passRateWithMemory: number };
            abstention: { passed: boolean };
          }>;
        };
        expect(report.ok).toBe(false);
        expect(report.exitCode).toBe(1);
        expect(report.rubricDocPath).toBe(RUBRIC_DOC_PATH);
        expect(report.cases).toHaveLength(1);
        const caseReport = report.cases[0]!;
        expect(caseReport.caseId).toBe("memory-utilization-example-halcyon");
        expect(caseReport.measurement.verdict).toBe("no-lift");
        expect(Number.isFinite(caseReport.measurement.mde)).toBe(true);
        // The declared memory genuinely helps: with-memory recites every fact.
        expect(caseReport.measurement.passRateWithMemory).toBe(1);
        // Abstention still correctly refuses rather than fabricates (FR-007).
        expect(caseReport.abstention.passed).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
