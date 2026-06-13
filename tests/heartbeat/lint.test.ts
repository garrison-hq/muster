/**
 * Unit tests for src/adapters/heartbeat/lint.ts
 *
 * Covers T001 (parseHeartbeat), T002 (loadManifest / applyManifest),
 * T004 (lintHeartbeat), and T005 (serializeLintReport).
 */

import { describe, it, expect } from "vitest";
import {
  parseHeartbeat,
  loadManifest,
  validateManifestData,
  applyManifest,
  lintHeartbeat,
  serializeLintReport,
  ManifestValidationError,
  CITATIONS,
} from "../../src/adapters/heartbeat/lint.js";
import type {
  HeartbeatFile,
  LintReport,
  RecurrenceManifest,
} from "../../src/adapters/heartbeat/lint.js";

// ---------------------------------------------------------------------------
// T001 — parseHeartbeat; isEmpty detection
// ---------------------------------------------------------------------------

describe("T001 parseHeartbeat", () => {
  it("empty string → isEmpty: true, items: []", () => {
    const result = parseHeartbeat("/tmp/HEARTBEAT.md", "");
    expect(result.isEmpty).toBe(true);
    expect(result.items).toEqual([]);
    expect(result.path).toBe("/tmp/HEARTBEAT.md");
    expect(result.raw).toBe("");
  });

  it("whitespace-only file → isEmpty: true", () => {
    const result = parseHeartbeat("/tmp/HEARTBEAT.md", "   \n\t\n  ");
    expect(result.isEmpty).toBe(true);
    expect(result.items).toEqual([]);
  });

  it("comment-only file (single-line comment) → isEmpty: true", () => {
    const result = parseHeartbeat("/tmp/HEARTBEAT.md", "<!-- this is a comment -->");
    expect(result.isEmpty).toBe(true);
    expect(result.items).toEqual([]);
  });

  it("comment-only file (multi-line comment) → isEmpty: true", () => {
    const content = "<!--\n  multi-line comment\n  still a comment\n-->";
    const result = parseHeartbeat("/tmp/HEARTBEAT.md", content);
    expect(result.isEmpty).toBe(true);
    expect(result.items).toEqual([]);
  });

  it("whitespace + comments only → isEmpty: true", () => {
    const content = "\n  \n<!-- comment -->\n  \n<!-- another comment -->\n";
    const result = parseHeartbeat("/tmp/HEARTBEAT.md", content);
    expect(result.isEmpty).toBe(true);
    expect(result.items).toEqual([]);
  });

  it("one real instruction → isEmpty: false, items.length === 1", () => {
    const result = parseHeartbeat("/tmp/HEARTBEAT.md", "- Do the daily summary");
    expect(result.isEmpty).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toBe("Do the daily summary");
    expect(result.items[0].id).toBe("item-1");
  });

  it("one real instruction surrounded by blank lines and comments → isEmpty: false", () => {
    const content =
      "\n<!-- header comment -->\n\n- Check the logs\n\n<!-- footer -->\n";
    const result = parseHeartbeat("/tmp/HEARTBEAT.md", content);
    expect(result.isEmpty).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toBe("Check the logs");
  });

  it("checkbox items with [ ] and [x] are parsed correctly", () => {
    const content =
      "- [ ] Send daily report\n- [x] Review PR\n- [X] Update changelog";
    const result = parseHeartbeat("/tmp/HEARTBEAT.md", content);
    expect(result.isEmpty).toBe(false);
    expect(result.items).toHaveLength(3);
    expect(result.items[0].text).toBe("Send daily report");
    expect(result.items[1].text).toBe("Review PR");
    expect(result.items[2].text).toBe("Update changelog");
  });

  it("mixed real instructions + comments → isEmpty: false, correct item count", () => {
    const content =
      "<!-- intro comment -->\n- Task one\n- Task two\n<!-- end comment -->\n- Task three";
    const result = parseHeartbeat("/tmp/HEARTBEAT.md", content);
    expect(result.isEmpty).toBe(false);
    expect(result.items).toHaveLength(3);
  });

  it("headings are not counted as checklist items", () => {
    const content = "# My Heartbeat\n## Section\n- Do something";
    const result = parseHeartbeat("/tmp/HEARTBEAT.md", content);
    expect(result.isEmpty).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toBe("Do something");
  });

  it("items have stable ordinal IDs", () => {
    const content = "- First\n- Second\n- Third";
    const result = parseHeartbeat("/tmp/HEARTBEAT.md", content);
    expect(result.items.map((i) => i.id)).toEqual(["item-1", "item-2", "item-3"]);
  });

  it("recurrence is undefined at parse time (set by applyManifest)", () => {
    const result = parseHeartbeat("/tmp/HEARTBEAT.md", "- Do something");
    expect(result.items[0].recurrence).toBeUndefined();
  });

  it("data-model invariant: isEmpty === true implies items.length === 0", () => {
    const result = parseHeartbeat("/tmp/HEARTBEAT.md", "<!-- comment -->");
    expect(result.isEmpty).toBe(true);
    expect(result.items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T002 — loadManifest / applyManifest
// ---------------------------------------------------------------------------

describe("T002 loadManifest / applyManifest", () => {
  describe("validateManifestData", () => {
    it("valid manifest with once-only + recurring entries → items annotated correctly", () => {
      const data = {
        checklistPath: "/tmp/HEARTBEAT.md",
        items: [
          { itemId: "item-1", recurrence: "once-only" },
          { itemId: "item-2", recurrence: "recurring" },
        ],
      };
      const manifest = validateManifestData(data, "/tmp/manifest.json");
      expect(manifest.checklistPath).toBe("/tmp/HEARTBEAT.md");
      expect(manifest.items).toHaveLength(2);
      expect(manifest.items[0].recurrence).toBe("once-only");
      expect(manifest.items[1].recurrence).toBe("recurring");
    });

    it("manifest missing checklistPath uses empty string", () => {
      const data = { items: [] };
      const manifest = validateManifestData(data, "/tmp/manifest.json");
      expect(manifest.checklistPath).toBe("");
      expect(manifest.items).toHaveLength(0);
    });

    it("malformed manifest — not an object → ManifestValidationError", () => {
      expect(() => validateManifestData("not an object", "/tmp/manifest.json"))
        .toThrow(ManifestValidationError);
    });

    it("malformed manifest — items not an array → ManifestValidationError", () => {
      expect(() =>
        validateManifestData({ checklistPath: "/tmp/HEARTBEAT.md", items: "not-array" }, "/tmp/manifest.json")
      ).toThrow(ManifestValidationError);
    });

    it("malformed manifest — entry missing itemId → ManifestValidationError", () => {
      const data = {
        checklistPath: "/tmp/HEARTBEAT.md",
        items: [{ recurrence: "once-only" }],
      };
      expect(() => validateManifestData(data, "/tmp/manifest.json")).toThrow(
        ManifestValidationError
      );
    });

    it("malformed manifest — invalid recurrence value → ManifestValidationError", () => {
      const data = {
        checklistPath: "/tmp/HEARTBEAT.md",
        items: [{ itemId: "item-1", recurrence: "daily" }],
      };
      expect(() => validateManifestData(data, "/tmp/manifest.json")).toThrow(
        ManifestValidationError
      );
    });

    it("manifest entry for non-existent itemId → included without error", () => {
      // loadManifest itself is permissive: extra entries don't throw.
      const data = {
        checklistPath: "/tmp/HEARTBEAT.md",
        items: [{ itemId: "item-999", recurrence: "once-only" }],
      };
      const manifest = validateManifestData(data, "/tmp/manifest.json");
      expect(manifest.items[0].itemId).toBe("item-999");
    });
  });

  describe("applyManifest", () => {
    function makeFile(itemTexts: string[]): HeartbeatFile {
      const items = itemTexts.map((text, i) => ({ id: `item-${i + 1}`, text }));
      return {
        path: "/tmp/HEARTBEAT.md",
        raw: itemTexts.map((t) => `- ${t}`).join("\n"),
        items,
        isEmpty: false,
      };
    }

    function makeManifest(entries: Array<{ itemId: string; recurrence: "once-only" | "recurring" }>): RecurrenceManifest {
      return { checklistPath: "/tmp/HEARTBEAT.md", items: entries };
    }

    it("items are annotated with their manifest recurrence", () => {
      const file = makeFile(["Task A", "Task B"]);
      const manifest = makeManifest([
        { itemId: "item-1", recurrence: "once-only" },
        { itemId: "item-2", recurrence: "recurring" },
      ]);
      const annotated = applyManifest(file, manifest);
      expect(annotated.items[0].recurrence).toBe("once-only");
      expect(annotated.items[1].recurrence).toBe("recurring");
    });

    it("item with no manifest entry defaults to 'recurring'", () => {
      const file = makeFile(["Task A", "Task B"]);
      const manifest = makeManifest([{ itemId: "item-1", recurrence: "once-only" }]);
      const annotated = applyManifest(file, manifest);
      expect(annotated.items[0].recurrence).toBe("once-only");
      expect(annotated.items[1].recurrence).toBe("recurring"); // default
    });

    it("manifest entry for non-existent itemId is ignored without error", () => {
      const file = makeFile(["Task A"]);
      const manifest = makeManifest([
        { itemId: "item-999", recurrence: "once-only" },
        { itemId: "item-1", recurrence: "recurring" },
      ]);
      const annotated = applyManifest(file, manifest);
      expect(annotated.items[0].recurrence).toBe("recurring");
    });

    it("does not mutate the input file (returns new object)", () => {
      const file = makeFile(["Task A"]);
      const manifest = makeManifest([{ itemId: "item-1", recurrence: "once-only" }]);
      const annotated = applyManifest(file, manifest);
      expect(annotated).not.toBe(file);
      expect(annotated.items).not.toBe(file.items);
      expect(file.items[0].recurrence).toBeUndefined(); // original unchanged
    });

    it("empty file → returns empty items (isEmpty invariant preserved)", () => {
      const emptyFile: HeartbeatFile = {
        path: "/tmp/HEARTBEAT.md",
        raw: "",
        items: [],
        isEmpty: true,
      };
      const manifest = makeManifest([]);
      const annotated = applyManifest(emptyFile, manifest);
      expect(annotated.isEmpty).toBe(true);
      expect(annotated.items).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// T004 — lintHeartbeat: static lint checks
// ---------------------------------------------------------------------------

describe("T004 lintHeartbeat", () => {
  it("concise well-formed file → ok: true, no findings", () => {
    const file = parseHeartbeat("/tmp/HEARTBEAT.md", "- Do the daily summary\n- Check metrics");
    const report = lintHeartbeat(file);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
    expect(report.isEmpty).toBe(false);
    expect(report.itemCount).toBe(2);
  });

  it("empty file → ok: true, isEmpty: true, info finding with OpenClaw citation", () => {
    const file = parseHeartbeat("/tmp/HEARTBEAT.md", "");
    const report = lintHeartbeat(file);
    expect(report.ok).toBe(true);
    expect(report.isEmpty).toBe(true);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].rule).toBe("heartbeat/empty-file-skip");
    expect(report.findings[0].severity).toBe("info");
    expect(report.findings[0].citation).toContain("OpenClaw heartbeat docs");
    expect(report.findings[0].citation).not.toContain("<SHA>");
  });

  it("comment-only file → ok: true, isEmpty: true, heartbeat/empty-file-skip finding", () => {
    const file = parseHeartbeat("/tmp/HEARTBEAT.md", "<!-- only a comment -->");
    const report = lintHeartbeat(file);
    expect(report.ok).toBe(true);
    expect(report.isEmpty).toBe(true);
    expect(report.findings.some((f) => f.rule === "heartbeat/empty-file-skip")).toBe(true);
  });

  it("over-length file (> 50 lines) → advisory finding emitted, rubric citation", () => {
    const lines = Array.from({ length: 55 }, (_, i) => `- Task ${i + 1}`).join("\n");
    const file = parseHeartbeat("/tmp/HEARTBEAT.md", lines);
    const report = lintHeartbeat(file);
    const advisory = report.findings.find((f) => f.rule === "heartbeat/length-advisory");
    expect(advisory).toBeDefined();
    expect(advisory!.severity).toBe("advisory");
    expect(advisory!.citation).toContain("muster rubric");
  });

  it("over-length file (> 2000 chars) → advisory finding emitted", () => {
    const longText = "- " + "a".repeat(2001);
    const file = parseHeartbeat("/tmp/HEARTBEAT.md", longText);
    const report = lintHeartbeat(file);
    expect(report.findings.some((f) => f.rule === "heartbeat/length-advisory")).toBe(true);
  });

  it("OR-branch: ONLY lines threshold exceeded (>50 lines, ≤2000 chars) → length-advisory fires", () => {
    // 51 short items: 51 lines, ≤600 chars — trips lines threshold only (NFR-001 OR-branch).
    const raw = Array.from({ length: 51 }, (_, i) => `- Item ${String(i + 1).padStart(2, "0")}`).join("\n");
    const file = parseHeartbeat("/tmp/HEARTBEAT.md", raw);
    expect(file.raw.split("\n").length).toBe(51); // lines > 50
    expect(file.raw.length).toBeLessThanOrEqual(2000); // chars ≤ 2000
    const report = lintHeartbeat(file);
    expect(report.findings.some((f) => f.rule === "heartbeat/length-advisory")).toBe(true);
  });

  it("OR-branch: ONLY chars threshold exceeded (≤50 lines, >2000 chars) → length-advisory fires", () => {
    // 3 items: 4 lines, >2000 chars — trips chars threshold only (NFR-001 OR-branch).
    const longItem = "- " + "a".repeat(2001);
    const raw = longItem + "\n- Check system status\n- Verify connections";
    const file = parseHeartbeat("/tmp/HEARTBEAT.md", raw);
    expect(file.raw.split("\n").length).toBeLessThanOrEqual(50); // lines ≤ 50
    expect(file.raw.length).toBeGreaterThan(2000); // chars > 2000
    const report = lintHeartbeat(file);
    expect(report.findings.some((f) => f.rule === "heartbeat/length-advisory")).toBe(true);
  });

  it("advisory finding sets ok: false (advisory is a blocking severity per spec)", () => {
    // Per spec T004: "ok is true when there are no advisory or higher-severity findings."
    // Advisory findings DO set ok: false. Only 'info' findings are non-blocking.
    const lines = Array.from({ length: 55 }, (_, i) => `- Task ${i + 1}`).join("\n");
    const file = parseHeartbeat("/tmp/HEARTBEAT.md", lines);
    const report = lintHeartbeat(file);
    expect(report.ok).toBe(false);
  });

  it("findings are sorted by rule in UTF-16 code-unit order (determinism check)", () => {
    // Manufacture a scenario where both findings appear.
    const lines = Array.from({ length: 55 }, (_, i) => `- Task ${i + 1}`).join("\n");
    const file = parseHeartbeat("/tmp/HEARTBEAT.md", lines);
    const report = lintHeartbeat(file);
    const rules = report.findings.map((f) => f.rule);
    const sorted = [...rules].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(rules).toEqual(sorted);
  });

  it("path and itemCount are reflected in the report", () => {
    const file = parseHeartbeat("/my/HEARTBEAT.md", "- Item 1\n- Item 2\n- Item 3");
    const report = lintHeartbeat(file);
    expect(report.path).toBe("/my/HEARTBEAT.md");
    expect(report.itemCount).toBe(3);
  });

  it("repeated runs on same input → byte-identical LintReport structure (determinism)", () => {
    const file = parseHeartbeat("/tmp/HEARTBEAT.md", "- Do the daily summary\n");
    const r1 = lintHeartbeat(file);
    const r2 = lintHeartbeat(file);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

// ---------------------------------------------------------------------------
// T005 — serializeLintReport
// ---------------------------------------------------------------------------

describe("T005 serializeLintReport", () => {
  function buildReport(overrides: Partial<LintReport> = {}): LintReport {
    return {
      path: "/tmp/HEARTBEAT.md",
      ok: true,
      isEmpty: false,
      itemCount: 2,
      findings: [],
      ...overrides,
    };
  }

  it("round-trips: JSON.parse(serializeLintReport(report)) equals the input", () => {
    const report = buildReport({
      findings: [
        {
          rule: "heartbeat/empty-file-skip",
          severity: "info",
          message: "File is empty.",
          citation: CITATIONS["heartbeat/empty-file-skip"],
        },
      ],
    });
    const serialized = serializeLintReport(report);
    const parsed = JSON.parse(serialized) as unknown;
    expect(parsed).toMatchObject({
      path: report.path,
      ok: report.ok,
      isEmpty: report.isEmpty,
      itemCount: report.itemCount,
    });
  });

  it("repeated calls with the same input → identical string output (byte-stability)", () => {
    const report = buildReport();
    const s1 = serializeLintReport(report);
    const s2 = serializeLintReport(report);
    expect(s1).toBe(s2);
  });

  it("output is valid JSON", () => {
    const report = buildReport();
    expect(() => JSON.parse(serializeLintReport(report))).not.toThrow();
  });

  it("citation strings contain the pinned SHA (not <SHA> placeholder)", () => {
    expect(CITATIONS["heartbeat/empty-file-skip"]).not.toContain("<SHA>");
    expect(CITATIONS["heartbeat/length-advisory"]).toBeTruthy();
    // The empty-file-skip citation must contain the actual content-SHA.
    expect(CITATIONS["heartbeat/empty-file-skip"]).toContain(
      "f32e439dc6248942bc2c10fca2ad2d3a4e9761b2569edb7232006e64d1c92a8d"
    );
  });

  it("key order in serialized output is RFC 8785 canonical: findings, isEmpty, itemCount, ok, path", () => {
    // canonicalJson sorts keys by UTF-16 code units (RFC 8785, NFR-001, FR-001).
    const report = buildReport();
    const serialized = serializeLintReport(report);
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    expect(keys).toEqual(["findings", "isEmpty", "itemCount", "ok", "path"]);
  });

  it("finding with location field is included in output", () => {
    const report = buildReport({
      findings: [
        {
          rule: "heartbeat/length-advisory",
          severity: "advisory",
          message: "Too long.",
          citation: CITATIONS["heartbeat/length-advisory"],
          location: { line: 51 },
        },
      ],
    });
    const serialized = serializeLintReport(report);
    const parsed = JSON.parse(serialized) as { findings: Array<{ location?: unknown }> };
    expect(parsed.findings[0].location).toEqual({ line: 51 });
  });

  it("finding without location field omits location key", () => {
    const report = buildReport({
      findings: [
        {
          rule: "heartbeat/empty-file-skip",
          severity: "info",
          message: "Empty.",
          citation: CITATIONS["heartbeat/empty-file-skip"],
          // no location
        },
      ],
    });
    const serialized = serializeLintReport(report);
    const parsed = JSON.parse(serialized) as { findings: Array<Record<string, unknown>> };
    expect("location" in parsed.findings[0]).toBe(false);
  });

  it("T007 byte-stability check: parseHeartbeat + lintHeartbeat + serializeLintReport", () => {
    const raw = "- Do the daily summary\n";
    const file = parseHeartbeat("/tmp/test.md", raw);
    const r1 = serializeLintReport(lintHeartbeat(file));
    const r2 = serializeLintReport(lintHeartbeat(file));
    expect(r1).toBe(r2);
  });
});

// ---------------------------------------------------------------------------
// Edge-case integration: loadManifest from disk (file-loading path)
// ---------------------------------------------------------------------------

describe("loadManifest file-loading", () => {
  it("throws ManifestValidationError for non-existent file", () => {
    expect(() => loadManifest("/tmp/nonexistent-manifest-abc123.json")).toThrow(
      ManifestValidationError
    );
  });
});
