/**
 * Heartbeat fixture suite integration tests (T022).
 *
 * Drives the manifest runner against all static and interval-config cases in
 * tests/fixtures/heartbeat/manifest.json. Behavioral cases (action-diff,
 * idempotency, quiet-ack) are skipped when MUSTER_ENDPOINT is not set — they
 * use it.skipIf so they run when an endpoint is configured in CI.
 *
 * Invariants checked here:
 * - hb-static-001: valid-concise → ok: true, no findings
 * - hb-static-002: empty → isEmpty: true, heartbeat/empty-file-skip rule
 * - hb-static-003: comment-only → isEmpty: true, heartbeat/empty-file-skip rule
 * - hb-static-004: over-length → heartbeat/length-advisory rule
 * - hb-config-001: absent interval config → assumed: true, intervalMinutes: 30
 * - hb-behavioral-001/002/003: skipped without MUSTER_ENDPOINT
 *
 * Also tests the manifest runner directly for determinism and sorting (NFR-001).
 */

import { describe, it, expect } from "vitest";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import {
  runManifest,
  loadManifestFile,
  checkHeartbeatFile,
  HeartbeatAdapter,
  serializeLintReport,
} from "../../src/adapters/heartbeat/index.js";
import {
  parseHeartbeat,
  lintHeartbeat,
} from "../../src/adapters/heartbeat/lint.js";
import { loadIntervalConfig } from "../../src/adapters/heartbeat/graders/quiet-ack.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = resolvePath(__dirname, "../../tests/fixtures/heartbeat");
const MANIFEST_PATH = resolvePath(FIXTURES_ROOT, "manifest.json");
const PROJECT_ROOT = resolvePath(__dirname, "../..");

// ---------------------------------------------------------------------------
// Fixture path helpers
// ---------------------------------------------------------------------------

function checklistPath(name: string): string {
  return resolvePath(FIXTURES_ROOT, "checklists", name);
}

function intervalConfigPath(name: string): string {
  return resolvePath(FIXTURES_ROOT, "interval-configs", name);
}

// ---------------------------------------------------------------------------
// T018 — Fixture file validation
// ---------------------------------------------------------------------------

describe("T018 fixture files", () => {
  it("empty.md has 0 bytes", () => {
    const content = readFileSync(checklistPath("empty.md"));
    expect(content.length).toBe(0);
  });

  it("over-length.md has ≥51 checklist items", () => {
    const content = readFileSync(checklistPath("over-length.md"), "utf-8");
    const items = content.split("\n").filter((line) => /^- /.test(line));
    expect(items.length).toBeGreaterThanOrEqual(51);
  });

  it("mixed-recurrence.md has content for both once-only and recurring items", () => {
    const content = readFileSync(checklistPath("mixed-recurrence.md"), "utf-8");
    expect(content).toContain("once-only");
    expect(content).toContain("recurring");
    // Has exactly 2 checklist items
    const items = content.split("\n").filter((line) => /^- \[/.test(line));
    expect(items.length).toBe(2);
  });

  it("repeat.json has non-null priorActionSummary", () => {
    const data = JSON.parse(
      readFileSync(resolvePath(FIXTURES_ROOT, "tick-states", "repeat.json"), "utf-8")
    ) as Record<string, unknown>;
    expect(data["priorActionSummary"]).not.toBeNull();
    expect(typeof data["priorActionSummary"]).toBe("string");
  });

  it("absent.json has no intervalMinutes key", () => {
    const data = JSON.parse(
      readFileSync(intervalConfigPath("absent.json"), "utf-8")
    ) as Record<string, unknown>;
    expect("intervalMinutes" in data).toBe(false);
  });

  it("all tick-state JSON files are valid JSON with required fields", () => {
    for (const name of ["due.json", "repeat.json", "nothing-due.json"]) {
      const data = JSON.parse(
        readFileSync(resolvePath(FIXTURES_ROOT, "tick-states", name), "utf-8")
      ) as Record<string, unknown>;
      expect(typeof data["id"]).toBe("string");
      expect(["due", "repeat", "nothing-due"]).toContain(data["state"]);
    }
  });

  it("all interval-config JSON files are valid JSON", () => {
    for (const name of ["default-30m.json", "oauth-1h.json", "absent.json"]) {
      expect(() =>
        JSON.parse(readFileSync(intervalConfigPath(name), "utf-8"))
      ).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// T019 — manifest.json: 8 cases with stable IDs, valid JSON
// ---------------------------------------------------------------------------

describe("T019 manifest.json", () => {
  it("is valid JSON and has 8 cases", () => {
    const manifest = loadManifestFile(MANIFEST_PATH);
    expect(manifest.cases.length).toBe(8);
  });

  it("all case IDs are stable hb-* strings (not ordinals)", () => {
    const manifest = loadManifestFile(MANIFEST_PATH);
    for (const kase of manifest.cases) {
      expect(kase.id).toMatch(/^hb-[a-z]+-\d{3}$/);
    }
  });

  it("has all expected case IDs", () => {
    const manifest = loadManifestFile(MANIFEST_PATH);
    const ids = manifest.cases.map((c) => c.id);
    expect(ids).toContain("hb-static-001");
    expect(ids).toContain("hb-static-002");
    expect(ids).toContain("hb-static-003");
    expect(ids).toContain("hb-static-004");
    expect(ids).toContain("hb-behavioral-001");
    expect(ids).toContain("hb-behavioral-002");
    expect(ids).toContain("hb-behavioral-003");
    expect(ids).toContain("hb-config-001");
  });

  it("static-lint cases have no tickState", () => {
    const manifest = loadManifestFile(MANIFEST_PATH);
    for (const kase of manifest.cases) {
      if (kase.gradingClass === "static-lint") {
        expect(kase.tickState).toBeNull();
      }
    }
  });

  it("behavioral cases all have non-null tickState", () => {
    const manifest = loadManifestFile(MANIFEST_PATH);
    for (const kase of manifest.cases) {
      if (["action-diff", "idempotency", "quiet-ack"].includes(kase.gradingClass)) {
        expect(kase.tickState).not.toBeNull();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// T019 — Manifest runner: static cases pass, behavioral cases skip
// ---------------------------------------------------------------------------

describe("T019 manifest runner", () => {
  it("runs without throwing", () => {
    expect(() => runManifest(MANIFEST_PATH, PROJECT_ROOT)).not.toThrow();
  });

  it("returns 8 total cases", () => {
    const summary = runManifest(MANIFEST_PATH, PROJECT_ROOT);
    expect(summary.totalCases).toBe(8);
  });

  it("passes hb-static-001 (valid-concise → ok: true, no findings)", () => {
    const summary = runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "hb-static-001");
    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(true);
    expect((result?.detail as Record<string, unknown>)["ok"]).toBe(true);
    expect((result?.detail as Record<string, unknown>)["isEmpty"]).toBe(false);
  });

  it("passes hb-static-002 (empty → isEmpty: true, empty-file-skip rule)", () => {
    const summary = runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "hb-static-002");
    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(true);
    expect((result?.detail as Record<string, unknown>)["isEmpty"]).toBe(true);
    const rules = (result?.detail as Record<string, unknown>)["findingRules"] as string[];
    expect(rules).toContain("heartbeat/empty-file-skip");
  });

  it("passes hb-static-003 (comment-only → isEmpty: true, empty-file-skip rule)", () => {
    const summary = runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "hb-static-003");
    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(true);
    expect((result?.detail as Record<string, unknown>)["isEmpty"]).toBe(true);
    const rules = (result?.detail as Record<string, unknown>)["findingRules"] as string[];
    expect(rules).toContain("heartbeat/empty-file-skip");
  });

  it("passes hb-static-004 (over-length → length-advisory rule)", () => {
    const summary = runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "hb-static-004");
    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(true);
    const rules = (result?.detail as Record<string, unknown>)["findingRules"] as string[];
    expect(rules).toContain("heartbeat/length-advisory");
  });

  it("passes hb-config-001 (absent config → assumed: true, 30m)", () => {
    const summary = runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "hb-config-001");
    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(true);
    expect((result?.detail as Record<string, unknown>)["assumed"]).toBe(true);
    expect((result?.detail as Record<string, unknown>)["intervalMinutes"]).toBe(30);
  });

  it("skips all 3 behavioral cases when MUSTER_ENDPOINT is not set", () => {
    // Ensure no endpoint is set for this test.
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];

    try {
      const summary = runManifest(MANIFEST_PATH, PROJECT_ROOT);
      const behavioralIds = ["hb-behavioral-001", "hb-behavioral-002", "hb-behavioral-003"];
      for (const id of behavioralIds) {
        const result = summary.results.find((r) => r.id === id);
        expect(result?.skipped, `${id} should be skipped`).toBe(true);
        expect(result?.passed, `${id} should not be passed`).toBe(false);
        expect(result?.skipReason).toContain("MUSTER_ENDPOINT");
      }
    } finally {
      if (savedEndpoint !== undefined) {
        process.env["MUSTER_ENDPOINT"] = savedEndpoint;
      }
    }
  });

  it.skipIf(!process.env["MUSTER_ENDPOINT"])(
    "behavioral cases run (not skipped) when MUSTER_ENDPOINT is set",
    () => {
      const summary = runManifest(MANIFEST_PATH, PROJECT_ROOT);
      const behavioralIds = ["hb-behavioral-001", "hb-behavioral-002", "hb-behavioral-003"];
      for (const id of behavioralIds) {
        const result = summary.results.find((r) => r.id === id);
        // When endpoint is set, they should not be skipped due to missing endpoint.
        expect(result?.skipReason).not.toContain("MUSTER_ENDPOINT not set");
      }
    }
  );

  it("results are sorted by case ID (UTF-16 ordering, NFR-001)", () => {
    const summary = runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const ids = summary.results.map((r) => r.id);
    const sorted = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(ids).toEqual(sorted);
  });

  it("runner is deterministic: two runs produce identical summaries (NFR-001)", () => {
    const run1 = runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const run2 = runManifest(MANIFEST_PATH, PROJECT_ROOT);
    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });

  it("summary counts are consistent (passed + failed + skipped = totalCases)", () => {
    const summary = runManifest(MANIFEST_PATH, PROJECT_ROOT);
    expect(summary.passed + summary.failed + summary.skipped).toBe(summary.totalCases);
  });
});

// ---------------------------------------------------------------------------
// T020 — HeartbeatAdapter boundary: SpecAdapter interface + checkHeartbeatFile
// ---------------------------------------------------------------------------

describe("T020 HeartbeatAdapter SpecAdapter boundary", () => {
  it("implements SpecAdapter interface with all required methods", () => {
    const adapter = new HeartbeatAdapter();
    expect(adapter.name).toBe("heartbeat");
    expect(typeof adapter.specVersion).toBe("string");
    expect(typeof adapter.parse).toBe("function");
    expect(typeof adapter.validate).toBe("function");
    expect(typeof adapter.resolve).toBe("function");
    expect(adapter.mergeStrategy).toBeDefined();
    expect(adapter.thresholds).toBeDefined();
    expect(typeof adapter.evaluateTriggers).toBe("function");
  });

  it("parse returns a SoulDocument (stub)", () => {
    const adapter = new HeartbeatAdapter();
    const result = adapter.parse("test content", "/tmp/HEARTBEAT.md", "strict");
    expect(result).not.toBeInstanceOf(Array);
    const doc = result as { path: string; kind: string };
    expect(doc.path).toBe("/tmp/HEARTBEAT.md");
    expect(doc.kind).toBe("soul");
  });

  it("validate returns empty violations (stub)", () => {
    const adapter = new HeartbeatAdapter();
    const doc = adapter.parse("", "/tmp/HEARTBEAT.md", "strict") as {
      path: string;
      frontMatter: unknown;
      body: string;
      kind: "soul" | "mixin";
    };
    expect(Array.isArray(doc)).toBe(false);
    const violations = adapter.validate(doc, "strict");
    expect(violations).toEqual([]);
  });

  it("evaluateTriggers returns null (stub)", () => {
    const adapter = new HeartbeatAdapter();
    const result = adapter.evaluateTriggers({}, {}, "strict");
    expect(result).toBeNull();
  });

  it("thresholds satisfy ThresholdMapping interface", () => {
    const adapter = new HeartbeatAdapter();
    expect(adapter.thresholds.refusalCap).toBe(25);
    expect(adapter.thresholds.maxWords(0)).toBe(10);
    expect(adapter.thresholds.maxWords(5)).toBe(15);
    expect(adapter.thresholds.words("hello world")).toBe(2);
  });

  it("checkHeartbeatFile: valid-concise → ok: true", async () => {
    const report = await checkHeartbeatFile(checklistPath("valid-concise.md"));
    expect(report.ok).toBe(true);
    expect(report.isEmpty).toBe(false);
    expect(report.findings).toHaveLength(0);
  });

  it("checkHeartbeatFile: empty → ok: true, isEmpty: true, empty-file-skip", async () => {
    const report = await checkHeartbeatFile(checklistPath("empty.md"));
    expect(report.ok).toBe(true);
    expect(report.isEmpty).toBe(true);
    expect(report.findings.some((f) => f.rule === "heartbeat/empty-file-skip")).toBe(true);
  });

  it("checkHeartbeatFile: comment-only → ok: true, isEmpty: true, empty-file-skip", async () => {
    const report = await checkHeartbeatFile(checklistPath("comment-only.md"));
    expect(report.ok).toBe(true);
    expect(report.isEmpty).toBe(true);
    expect(report.findings.some((f) => f.rule === "heartbeat/empty-file-skip")).toBe(true);
  });

  it("checkHeartbeatFile: over-length → length-advisory", async () => {
    const report = await checkHeartbeatFile(checklistPath("over-length.md"));
    expect(report.findings.some((f) => f.rule === "heartbeat/length-advisory")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T022 — Static fixture suite: all static cases pass
// ---------------------------------------------------------------------------

describe("T022 static fixture suite", () => {
  const staticCaseIds = ["hb-static-001", "hb-static-002", "hb-static-003", "hb-static-004"];

  it("all 4 static cases pass in the manifest runner", () => {
    const summary = runManifest(MANIFEST_PATH, PROJECT_ROOT);
    for (const id of staticCaseIds) {
      const result = summary.results.find((r) => r.id === id);
      expect(result, `${id} must be present`).toBeDefined();
      expect(result?.skipped, `${id} must not be skipped`).toBe(false);
      expect(result?.passed, `${id} must pass`).toBe(true);
    }
  });

  it("hb-config-001 interval-config case passes", () => {
    const summary = runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "hb-config-001");
    expect(result?.passed).toBe(true);
    expect(result?.skipped).toBe(false);
  });

  it("serializeLintReport output is byte-stable (NFR-001)", () => {
    const raw = readFileSync(checklistPath("valid-concise.md"), "utf-8");
    const file = parseHeartbeat(checklistPath("valid-concise.md"), raw);
    const report = lintHeartbeat(file);
    const run1 = serializeLintReport(report);
    const run2 = serializeLintReport(report);
    expect(run1).toBe(run2);
  });

  it("serializeLintReport output contains 'ok' key", () => {
    const raw = readFileSync(checklistPath("valid-concise.md"), "utf-8");
    const file = parseHeartbeat(checklistPath("valid-concise.md"), raw);
    const report = lintHeartbeat(file);
    const output = serializeLintReport(report);
    expect(output).toContain('"ok":');
  });

  it("loadIntervalConfig with absent.json → assumed: true, 30m", () => {
    const config = loadIntervalConfig(intervalConfigPath("absent.json"));
    expect(config.assumed).toBe(true);
    expect(config.intervalMinutes).toBe(30);
  });

  it("loadIntervalConfig with default-30m.json → assumed: false, 30m", () => {
    const config = loadIntervalConfig(intervalConfigPath("default-30m.json"));
    expect(config.assumed).toBe(false);
    expect(config.intervalMinutes).toBe(30);
  });

  it("loadIntervalConfig with oauth-1h.json → assumed: false, 60m", () => {
    const config = loadIntervalConfig(intervalConfigPath("oauth-1h.json"));
    expect(config.assumed).toBe(false);
    expect(config.intervalMinutes).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// T020 — HeartbeatAdapter stub method coverage
// ---------------------------------------------------------------------------

describe("T020 HeartbeatAdapter stub method coverage", () => {
  it("validate returns empty array (stub)", async () => {
    const adapter = new HeartbeatAdapter();
    const doc = adapter.parse("hello", "/tmp/HEARTBEAT.md", "strict") as {
      path: string;
      frontMatter: unknown;
      body: string;
      kind: "soul" | "mixin";
    };
    const violations = adapter.validate(doc, "strict");
    expect(Array.isArray(violations)).toBe(true);
    expect(violations.length).toBe(0);
    // Also test permissive mode
    const violations2 = adapter.validate(doc, "permissive");
    expect(violations2.length).toBe(0);
  });

  it("resolve returns empty object (stub)", async () => {
    const adapter = new HeartbeatAdapter();
    const doc = adapter.parse("hello", "/tmp/HEARTBEAT.md", "strict") as {
      path: string;
      frontMatter: unknown;
      body: string;
      kind: "soul" | "mixin";
    };
    const result = await adapter.resolve(doc, { mode: "strict" }, async () => doc);
    expect(typeof result).toBe("object");
    expect(Array.isArray(result)).toBe(false);
  });

  it("mergeStrategy has correct structure", () => {
    const adapter = new HeartbeatAdapter();
    expect(adapter.mergeStrategy.scalars).toBe("replace");
    expect(adapter.mergeStrategy.maps).toBe("deep");
    expect(adapter.mergeStrategy.lists).toBe("replace");
    expect(adapter.mergeStrategy.typeMismatch).toBe("replace");
    expect(adapter.mergeStrategy.nullIsValue).toBe(true);
  });

  it("loadManifestFile throws for invalid JSON", async () => {
    const { writeFileSync, unlinkSync } = await import("node:fs");
    const tmpPath = "/tmp/invalid-hb-manifest.json";
    writeFileSync(tmpPath, "not valid json");
    expect(() => loadManifestFile(tmpPath)).toThrow();
    unlinkSync(tmpPath);
  });

  it("loadManifestFile throws for missing cases array", async () => {
    const { writeFileSync, unlinkSync } = await import("node:fs");
    const tmpPath = "/tmp/no-cases-hb-manifest.json";
    writeFileSync(tmpPath, JSON.stringify({ notCases: [] }));
    expect(() => loadManifestFile(tmpPath)).toThrow();
    unlinkSync(tmpPath);
  });

  it("static lint case with nonexistent file returns failed result", async () => {
    const { writeFileSync, unlinkSync } = await import("node:fs");
    // Use a fake manifest with a nonexistent checklist path
    const fakeManifest = {
      cases: [
        {
          id: "hb-static-999",
          description: "Nonexistent file test",
          checklistPath: "tests/fixtures/heartbeat/checklists/DOES_NOT_EXIST.md",
          itemRecurrence: [],
          tickState: null,
          intervalConfig: "tests/fixtures/heartbeat/interval-configs/default-30m.json",
          gradingClass: "static-lint" as const,
          expectation: { ok: true },
        },
      ],
    };
    const tmpManifest = "/tmp/test-hb-manifest-999.json";
    writeFileSync(tmpManifest, JSON.stringify(fakeManifest));
    const summary = runManifest(tmpManifest, PROJECT_ROOT);
    expect(summary.results[0]?.passed).toBe(false);
    expect(summary.results[0]?.skipped).toBe(false);
    unlinkSync(tmpManifest);
  });
});
