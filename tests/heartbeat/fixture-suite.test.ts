/**
 * Heartbeat fixture suite integration tests (T022).
 *
 * Drives the manifest runner against all static and interval-config cases in
 * tests/fixtures/heartbeat/manifest.json. Behavioral cases (action-diff,
 * idempotency, quiet-ack) run via stubbed ChatClient when MUSTER_ENDPOINT is
 * not set, and via the real core behavioral client when it is set.
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
 * Includes stub-client integration tests for the wired behavioral path (FR-001,
 * FR-008 errored-run-as-failure).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import * as BehavioralClient from "../../src/core/behavioral/client.js";
import type { ChatClient } from "../../src/core/behavioral/types.js";

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

  it("over-lines-only.md: lines > 50 AND chars ≤ 2000 (single-threshold fixture, lines only)", () => {
    const content = readFileSync(checklistPath("over-lines-only.md"), "utf-8");
    expect(content.split("\n").length).toBeGreaterThan(50);
    expect(content.length).toBeLessThanOrEqual(2000);
  });

  it("over-chars-only.md: lines ≤ 50 AND chars > 2000 (single-threshold fixture, chars only)", () => {
    const content = readFileSync(checklistPath("over-chars-only.md"), "utf-8");
    expect(content.split("\n").length).toBeLessThanOrEqual(50);
    expect(content.length).toBeGreaterThan(2000);
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

  it("action-diff contract: intendedActions aligns with checklist item texts (FR-004 indirection)", () => {
    // The action-diff grader compares model ACTION: lines against intendedActions.
    // The model is shown the checklist item texts via buildScenarioFraming and
    // instructed to emit ACTION: <label> matching each item. For the grading
    // result to be meaningful, every entry in intendedActions MUST appear as the
    // text of a checklist item the model is shown — otherwise the model cannot
    // emit the correct labels.
    //
    // This test verifies that for every action-diff case in manifest.json,
    // each declared intendedAction is a subset of the checklist item texts
    // (case-insensitive trim, matching the normalizeActionLabel contract).
    // If this test fails, the manifest intendedActions have drifted from the
    // checklist and will produce meaningless all-fail results at runtime.
    const manifest = loadManifestFile(MANIFEST_PATH);
    for (const kase of manifest.cases) {
      if (kase.gradingClass !== "action-diff") continue;
      if (!Array.isArray(kase.intendedActions) || kase.intendedActions.length === 0) continue;

      const checklistRaw = readFileSync(resolvePath(PROJECT_ROOT, kase.checklistPath), "utf-8");
      const heartbeatFile = parseHeartbeat(kase.checklistPath, checklistRaw);
      const checklistTexts = new Set(
        heartbeatFile.items.map((item) => item.text.trim().toLowerCase())
      );

      for (const action of kase.intendedActions) {
        const normalized = action.trim().toLowerCase();
        expect(
          checklistTexts.has(normalized),
          `intendedAction "${action}" in case "${kase.id}" must match a checklist item text ` +
          `(checklist items: ${[...checklistTexts].join(", ")})`
        ).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// T019 — Manifest runner: static cases pass, behavioral cases skip
// ---------------------------------------------------------------------------

describe("T019 manifest runner", () => {
  it("runs without throwing", async () => {
    await expect(runManifest(MANIFEST_PATH, PROJECT_ROOT)).resolves.not.toThrow();
  });

  it("returns 8 total cases", async () => {
    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    expect(summary.totalCases).toBe(8);
  });

  it("passes hb-static-001 (valid-concise → ok: true, no findings)", async () => {
    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "hb-static-001");
    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(true);
    expect((result?.detail as Record<string, unknown>)["ok"]).toBe(true);
    expect((result?.detail as Record<string, unknown>)["isEmpty"]).toBe(false);
  });

  it("passes hb-static-002 (empty → isEmpty: true, empty-file-skip rule)", async () => {
    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "hb-static-002");
    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(true);
    expect((result?.detail as Record<string, unknown>)["isEmpty"]).toBe(true);
    const rules = (result?.detail as Record<string, unknown>)["findingRules"] as string[];
    expect(rules).toContain("heartbeat/empty-file-skip");
  });

  it("passes hb-static-003 (comment-only → isEmpty: true, empty-file-skip rule)", async () => {
    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "hb-static-003");
    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(true);
    expect((result?.detail as Record<string, unknown>)["isEmpty"]).toBe(true);
    const rules = (result?.detail as Record<string, unknown>)["findingRules"] as string[];
    expect(rules).toContain("heartbeat/empty-file-skip");
  });

  it("passes hb-static-004 (over-length → length-advisory rule)", async () => {
    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "hb-static-004");
    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(true);
    const rules = (result?.detail as Record<string, unknown>)["findingRules"] as string[];
    expect(rules).toContain("heartbeat/length-advisory");
  });

  it("passes hb-config-001 (absent config → assumed: true, 30m)", async () => {
    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "hb-config-001");
    expect(result).toBeDefined();
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(true);
    expect((result?.detail as Record<string, unknown>)["assumed"]).toBe(true);
    expect((result?.detail as Record<string, unknown>)["intervalMinutes"]).toBe(30);
  });

  it("skips all 3 behavioral cases when MUSTER_ENDPOINT is not set", async () => {
    // Ensure no endpoint is set for this test.
    const savedEndpoint = process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_ENDPOINT"];

    try {
      const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
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
    async () => {
      const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
      const behavioralIds = ["hb-behavioral-001", "hb-behavioral-002", "hb-behavioral-003"];
      for (const id of behavioralIds) {
        const result = summary.results.find((r) => r.id === id);
        // When endpoint is set, they must not be skipped and must have a pass/fail result.
        expect(result?.skipped, `${id} must not be skipped`).toBe(false);
        expect(typeof result?.passed, `${id} must have a boolean passed`).toBe("boolean");
        expect(result?.skipReason, `${id} must have no skipReason`).toBeUndefined();
      }
    }
  );

  it("results are sorted by case ID (UTF-16 ordering, NFR-001)", async () => {
    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const ids = summary.results.map((r) => r.id);
    const sorted = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(ids).toEqual(sorted);
  });

  it("runner is deterministic: two runs produce identical summaries (NFR-001)", async () => {
    const run1 = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const run2 = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });

  it("summary counts are consistent (passed + failed + skipped = totalCases)", async () => {
    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    expect(summary.passed + summary.failed + summary.skipped).toBe(summary.totalCases);
  });
});

// ---------------------------------------------------------------------------
// T019-behavioral — Stub-client integration: behavioral path runs deterministically
//
// These tests wire a deterministic stub ChatClient into the manifest runner so
// the behavioral graders (WP02/WP03) are exercised without a live endpoint.
// They prove FR-001 (core behavioral client reused), FR-004/005/006 (graders
// are called), and FR-008 (errored run counts as a failed run).
// ---------------------------------------------------------------------------

describe("T019 behavioral path (stub client)", () => {
  let savedEndpoint: string | undefined;

  beforeEach(() => {
    savedEndpoint = process.env["MUSTER_ENDPOINT"];
    // Set a fake endpoint so the behavioral path is activated.
    process.env["MUSTER_ENDPOINT"] = "http://stub-endpoint.test";
  });

  afterEach(() => {
    if (savedEndpoint !== undefined) {
      process.env["MUSTER_ENDPOINT"] = savedEndpoint;
    } else {
      delete process.env["MUSTER_ENDPOINT"];
    }
    vi.restoreAllMocks();
  });

  it("action-diff case runs and produces pass/fail (stub returning HEARTBEAT_OK fails)", async () => {
    // HEARTBEAT_OK on a due tick is an action-diff miss (spec edge case).
    const stubClient: ChatClient = { chat: async () => "HEARTBEAT_OK" };
    vi.spyOn(BehavioralClient, "makeClient").mockReturnValue(stubClient);

    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "hb-behavioral-001");
    expect(result?.skipped).toBe(false);
    expect(typeof result?.passed).toBe("boolean");
    // HEARTBEAT_OK on a due tick → all actions missing → passed: false
    expect(result?.passed).toBe(false);
    const detail = result?.detail as Record<string, unknown>;
    expect(detail["passCount"]).toBe(0);
  });

  it("action-diff case passes when stub returns ACTION: lines matching manifest intendedActions", async () => {
    // hb-behavioral-001 intendedActions: ["check-error-log", "summarise-prs"]
    // Stub emits ACTION: lines with those exact labels — grader must pass.
    const stubClient: ChatClient = {
      chat: async () =>
        "I reviewed the checklist and performed the following actions:\nACTION: check-error-log\nACTION: summarise-prs",
    };
    vi.spyOn(BehavioralClient, "makeClient").mockReturnValue(stubClient);

    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "hb-behavioral-001");
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(true);
    const detail = result?.detail as Record<string, unknown>;
    // All 3 runs passed (default N=3, k=ceil(0.6*3)=2; all pass so passCount=3)
    expect((detail["passCount"] as number)).toBeGreaterThanOrEqual(2);
  });

  it("action-diff case fails when stub returns wrong ACTION: labels", async () => {
    // Stub emits ACTION: lines with wrong labels (not in intendedActions).
    const stubClient: ChatClient = {
      chat: async () =>
        "ACTION: update-calendar\nACTION: send-report",
    };
    vi.spyOn(BehavioralClient, "makeClient").mockReturnValue(stubClient);

    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "hb-behavioral-001");
    expect(result?.skipped).toBe(false);
    // Wrong labels → all runs fail → aggregate fails
    expect(result?.passed).toBe(false);
    const detail = result?.detail as Record<string, unknown>;
    expect(detail["passCount"]).toBe(0);
  });

  it("action-diff case fails when stub emits prose (no ACTION: lines)", async () => {
    // Model replies in prose — no ACTION: lines — grader extracts nothing → fails.
    const stubClient: ChatClient = {
      chat: async () =>
        "I checked the error logs and summarised the open pull requests.",
    };
    vi.spyOn(BehavioralClient, "makeClient").mockReturnValue(stubClient);

    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "hb-behavioral-001");
    expect(result?.skipped).toBe(false);
    // Prose → 0 observed actions → all missing → all runs fail
    expect(result?.passed).toBe(false);
    const detail = result?.detail as Record<string, unknown>;
    expect(detail["passCount"]).toBe(0);
  });

  it("idempotency case runs and produces pass/fail", async () => {
    // Stub returns once-only item text → idempotency check: repeated action
    const stubClient: ChatClient = {
      chat: async () => "- Send the daily summary email (once-only — do not repeat on subsequent ticks)",
    };
    vi.spyOn(BehavioralClient, "makeClient").mockReturnValue(stubClient);

    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "hb-behavioral-002");
    expect(result?.skipped).toBe(false);
    expect(typeof result?.passed).toBe("boolean");
    const detail = result?.detail as Record<string, unknown>;
    expect(typeof detail["passCount"]).toBe("number");
  });

  it("quiet-ack case passes when stub returns HEARTBEAT_OK", async () => {
    const stubClient: ChatClient = { chat: async () => "HEARTBEAT_OK" };
    vi.spyOn(BehavioralClient, "makeClient").mockReturnValue(stubClient);

    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "hb-behavioral-003");
    expect(result?.skipped).toBe(false);
    expect(result?.passed).toBe(true);
    const detail = result?.detail as Record<string, unknown>;
    expect((detail["passCount"] as number)).toBeGreaterThanOrEqual(1);
  });

  it("FR-008: errored run (client throws) counts as failed run and drops pass count", async () => {
    // Stub that always throws — every run is an errored run → all failed.
    const stubClient: ChatClient = {
      chat: async () => { throw new Error("transport error"); },
    };
    vi.spyOn(BehavioralClient, "makeClient").mockReturnValue(stubClient);

    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);

    for (const id of ["hb-behavioral-001", "hb-behavioral-002", "hb-behavioral-003"]) {
      const result = summary.results.find((r) => r.id === id);
      expect(result?.skipped, `${id} must not be skipped`).toBe(false);
      expect(result?.passed, `${id} errored runs must fail aggregation`).toBe(false);
      const detail = result?.detail as Record<string, unknown>;
      // passCount must be 0 since every run errored (FR-008: errored = failed).
      expect(detail["passCount"], `${id} passCount must be 0`).toBe(0);
    }
  });

  it("FR-008: partial errors reduce pass count below k threshold", async () => {
    // Stub: each client gets a fresh callCount, so only the first call of
    // each case's client passes; the remaining 2 throw → passCount=1, k=2 → fails.
    vi.spyOn(BehavioralClient, "makeClient").mockImplementation(() => {
      let callCount = 0;
      const client: ChatClient = {
        chat: async () => {
          callCount++;
          if (callCount === 1) return "HEARTBEAT_OK";
          throw new Error("transport error");
        },
      };
      return client;
    });

    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    const result = summary.results.find((r) => r.id === "hb-behavioral-003");
    expect(result?.skipped).toBe(false);
    // passCount=1, k=ceil(0.6*3)=2 → aggregate fails
    expect(result?.passed).toBe(false);
    const detail = result?.detail as Record<string, unknown>;
    expect(detail["passCount"]).toBe(1);
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

  it("checkHeartbeatFile: over-lines-only → length-advisory (lines OR-branch, chars within limit)", async () => {
    const report = await checkHeartbeatFile(checklistPath("over-lines-only.md"));
    expect(report.findings.some((f) => f.rule === "heartbeat/length-advisory")).toBe(true);
    // Verify it is the lines threshold that fires, not the chars threshold
    const raw = readFileSync(checklistPath("over-lines-only.md"), "utf-8");
    expect(raw.length).toBeLessThanOrEqual(2000);
  });

  it("checkHeartbeatFile: over-chars-only → length-advisory (chars OR-branch, lines within limit)", async () => {
    const report = await checkHeartbeatFile(checklistPath("over-chars-only.md"));
    expect(report.findings.some((f) => f.rule === "heartbeat/length-advisory")).toBe(true);
    // Verify it is the chars threshold that fires, not the lines threshold
    const raw = readFileSync(checklistPath("over-chars-only.md"), "utf-8");
    expect(raw.split("\n").length).toBeLessThanOrEqual(50);
  });
});

// ---------------------------------------------------------------------------
// T022 — Static fixture suite: all static cases pass
// ---------------------------------------------------------------------------

describe("T022 static fixture suite", () => {
  const staticCaseIds = ["hb-static-001", "hb-static-002", "hb-static-003", "hb-static-004"];

  it("all 4 static cases pass in the manifest runner", async () => {
    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
    for (const id of staticCaseIds) {
      const result = summary.results.find((r) => r.id === id);
      expect(result, `${id} must be present`).toBeDefined();
      expect(result?.skipped, `${id} must not be skipped`).toBe(false);
      expect(result?.passed, `${id} must pass`).toBe(true);
    }
  });

  it("hb-config-001 interval-config case passes", async () => {
    const summary = await runManifest(MANIFEST_PATH, PROJECT_ROOT);
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
    const summary = await runManifest(tmpManifest, PROJECT_ROOT);
    expect(summary.results[0]?.passed).toBe(false);
    expect(summary.results[0]?.skipped).toBe(false);
    unlinkSync(tmpManifest);
  });
});
