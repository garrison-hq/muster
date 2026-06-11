import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { Violation } from "../../src/core/report.js";
import {
  checkSoul,
  makeFsLoadRef,
  type LoadRef,
} from "../../src/core/pipeline.js";
import { rfc1Adapter } from "../../src/adapters/rfc1/index.js";

/** The §25.1 contract schema — test-only import of the contract artifact. */
const contractSchema = JSON.parse(
  readFileSync(
    new URL(
      "../../kitty-specs/cts1-conformance-harness-01KTS86B/contracts/conformance-report.schema.json",
      import.meta.url
    ),
    "utf8"
  )
) as Record<string, unknown>;

const ajv = new Ajv2020({ allErrors: true });
const validateReport = ajv.compile(contractSchema);

/** Appendix A minimal valid soul, with per-test tweaks. */
function minimalSoul(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    soul_spec: "1.0.0-rc1",
    id: "org.example.minimal",
    name: "Minimal",
    locale: "en-US",
    composition: { extends: [], mixins: [], merge_policy: "standard" },
    profiles: ["default"],
    profile_overrides: {},
    values: { priorities: ["accuracy", "clarity", "safety", "speed"] },
    voice: { formality: 60, warmth: 30, verbosity: 50, jargon: 40, formatting: "minimal" },
    interaction: {
      clarifying_questions: "when_ambiguous",
      uncertainty: "explicit",
      disagreement: "neutral",
      confirmations: "implicit",
    },
    safety: { refusal_style: "brief", privacy: "strict", speculation: "mark" },
    extensions: {},
    ...overrides,
  };
}

/** Serialize front matter into a raw Soul.md document string (§3.1.1 shape). */
function soulMd(frontMatter: Record<string, unknown>): string {
  return `---\n${stringify(frontMatter)}---\n\nBody prose, never configuration.\n`;
}

/** loadRef stub for tests that must not load anything. */
const noRefs: LoadRef = async (ref) => [
  {
    path: "composition",
    message: `unexpected reference load: ${ref}`,
    severity: "error" as const,
  },
];

/** In-memory loadRef stub: raw documents keyed by reference string, parsed
 *  through the adapter (mode-bound) — exercises the real parse path. */
function stubLoadRef(files: Record<string, string>, mode: "strict" | "permissive"): LoadRef {
  return async (ref) => {
    const raw = files[ref];
    if (raw === undefined) {
      return [
        {
          path: "composition",
          message: `unresolved reference ${ref}`,
          severity: "error" as const,
        },
      ];
    }
    return rfc1Adapter.parse(raw, ref, mode);
  };
}

/** Dotted-path lookup into an effective config. */
function at(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const segment of path.split(".")) {
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

describe("checkSoul static pipeline (§25.1 report; FR-012, FR-024)", () => {
  it("§25.1 minimal valid soul → ok:true, effective non-null, serialized report validates against the contract schema with the EXACT field set", async () => {
    const { report, effective } = await checkSoul(
      rfc1Adapter,
      soulMd(minimalSoul()),
      "soul.md",
      { mode: "strict" },
      noRefs
    );

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.spec).toBe("1.0.0-rc1");
    expect(report.soul_id).toBe("org.example.minimal");
    expect(report.mode).toBe("strict");
    expect(report.profile).toBe("default");
    expect(report.state).toBeNull();
    expect(effective).not.toBeNull();
    expect(at(effective, "voice.formality")).toBe(60);

    // §25.1 exact field set, byte-for-byte field-wise: the schema has
    // additionalProperties:false AND we assert the key list explicitly.
    const serialized = JSON.parse(JSON.stringify(report)) as Record<string, unknown>;
    expect(validateReport(serialized)).toBe(true);
    expect(Object.keys(serialized).sort()).toEqual(
      ["spec", "soul_id", "mode", "profile", "state", "ok", "errors", "warnings"].sort()
    );
  });

  it("§3.1.1 broken parse → ok:false, effective null, errors carry §-sections and non-empty paths (NFR-005)", async () => {
    const { report, effective } = await checkSoul(
      rfc1Adapter,
      "no front matter at all\n",
      "broken.md",
      { mode: "strict" },
      noRefs
    );

    expect(report.ok).toBe(false);
    expect(effective).toBeNull();
    expect(report.soul_id).toBe("");
    expect(report.state).toBeNull();
    expect(report.errors.length).toBeGreaterThan(0);
    for (const error of report.errors) {
      expect(error.section).toMatch(/^(§|Appendix)/);
      expect(error.path.length).toBeGreaterThan(0);
      expect(error.message.length).toBeGreaterThan(0);
    }
    expect(report.errors[0]?.section).toBe("§3.1.1");
    // Whole-document failures normalize to "(document)" so the report stays
    // schema-valid (contract: path minLength 1).
    expect(report.errors[0]?.path).toBe("(document)");
    expect(validateReport(JSON.parse(JSON.stringify(report)))).toBe(true);
  });

  it('§7.5 composition through the loadRef stub: root extends "./base.md" → effective reflects the §8.1 Standard Merge', async () => {
    const base = minimalSoul({
      id: "org.example.base",
      name: "Base",
      relationship: { tone: "warm" },
      voice: { formality: 10, warmth: 10, verbosity: 50, jargon: 40, formatting: "minimal" },
    });
    const root = minimalSoul({
      id: "org.example.root",
      name: "Root",
      composition: { extends: ["./base.md"], mixins: [], merge_policy: "standard" },
      voice: { formality: 60, warmth: 30, verbosity: 50, jargon: 40, formatting: "minimal" },
    });

    const { report, effective } = await checkSoul(
      rfc1Adapter,
      soulMd(root),
      "root.md",
      { mode: "strict" },
      stubLoadRef({ "./base.md": soulMd(base) }, "strict")
    );

    expect(report.ok).toBe(true);
    expect(report.soul_id).toBe("org.example.root");
    expect(effective).not.toBeNull();
    // Base-only subtree survives the merge; root scalars replace base's (§8.1).
    expect(at(effective, "relationship.tone")).toBe("warm");
    expect(at(effective, "voice.warmth")).toBe(30);
    expect(at(effective, "id")).toBe("org.example.root");
  });

  it("FR-024 / §25 mode passthrough: unknown top-level key → strict ok:false, permissive ok:true with a warning (never dropped)", async () => {
    const raw = soulMd(minimalSoul({ totally_unknown: 1 }));

    const strict = await checkSoul(rfc1Adapter, raw, "soul.md", { mode: "strict" }, noRefs);
    expect(strict.report.ok).toBe(false);
    expect(strict.effective).toBeNull(); // strict validation errors short-circuit resolution
    expect(strict.report.errors.some((e) => e.path === "totally_unknown")).toBe(true);

    const permissive = await checkSoul(rfc1Adapter, raw, "soul.md", { mode: "permissive" }, noRefs);
    expect(permissive.report.ok).toBe(true);
    expect(permissive.effective).not.toBeNull();
    const unknownKeyWarnings = permissive.report.warnings.filter(
      (w) => w.path === "totally_unknown"
    );
    // Exactly one: per-document and materialized (Appendix G.6) findings dedupe.
    expect(unknownKeyWarnings).toHaveLength(1);
    expect(unknownKeyWarnings[0]?.section).toBe("§25");
    expect(validateReport(JSON.parse(JSON.stringify(permissive.report)))).toBe(true);
  });

  it("§20.1 report.state: states present → §4.4 smallest key by default, requested state when valid; no states → null", async () => {
    const withStates = soulMd(
      minimalSoul({
        state: {
          states: {
            calm: { voice: { warmth: 80 } },
            alert: { voice: { warmth: 5 } },
          },
        },
      })
    );

    const defaulted = await checkSoul(
      rfc1Adapter,
      withStates,
      "soul.md",
      { mode: "strict" },
      noRefs
    );
    expect(defaulted.report.ok).toBe(true);
    expect(defaulted.report.state).toBe("alert"); // §4.4 UTF-8 byte order
    expect(at(defaulted.effective, "voice.warmth")).toBe(5); // overlay applied (§7.5 step 5)

    const requested = await checkSoul(
      rfc1Adapter,
      withStates,
      "soul.md",
      { mode: "strict", state: "calm" },
      noRefs
    );
    expect(requested.report.state).toBe("calm");
    expect(at(requested.effective, "voice.warmth")).toBe(80);

    const stateless = await checkSoul(
      rfc1Adapter,
      soulMd(minimalSoul()),
      "soul.md",
      { mode: "strict" },
      noRefs
    );
    expect(stateless.report.state).toBeNull();
  });

  it("§9 profile echo: requested profile lands in the report and its override applies", async () => {
    const raw = soulMd(
      minimalSoul({
        profiles: ["default", "work"],
        profile_overrides: { work: { voice: { formality: 90 } } },
      })
    );
    const { report, effective } = await checkSoul(
      rfc1Adapter,
      raw,
      "soul.md",
      { mode: "strict", profile: "work" },
      noRefs
    );
    expect(report.ok).toBe(true);
    expect(report.profile).toBe("work");
    expect(at(effective, "voice.formality")).toBe(90);
  });
});

describe("C-004 boundary (locked constraint)", () => {
  it("src/core/pipeline.ts imports only from src/core/ — the source never mentions the adapter directory", () => {
    const source = readFileSync(
      new URL("../../src/core/pipeline.ts", import.meta.url),
      "utf8"
    );
    expect(source.includes("adapters")).toBe(false);
    // Every import specifier is core-local.
    for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
      const specifier = match[1] ?? "";
      expect(specifier.startsWith("./") || specifier.startsWith("node:")).toBe(true);
    }
  });
});

describe("makeFsLoadRef (core's only fs touchpoint)", () => {
  it("§7.2 unreadable reference → error violation, no throw", async () => {
    const loadRef = makeFsLoadRef((raw, path) => rfc1Adapter.parse(raw, path, "strict"));
    const result = await loadRef("./does-not-exist.md", "/tmp/muster-pipeline-test/root.md");
    expect(Array.isArray(result)).toBe(true);
    const violations = result as Violation[];
    expect(violations[0]?.severity).toBe("error");
    expect(violations[0]?.message).toContain("does-not-exist.md");
  });
});

describe("WP09 thresholds linkage seam", () => {
  it("rfc1Adapter.thresholds throws a clear not-yet-linked error until ./thresholds.ts (WP09) exists, then exposes the R9 mapping", () => {
    // Either WP09 has landed (mapping is usable) or the seam reports itself.
    try {
      const thresholds = rfc1Adapter.thresholds;
      expect(thresholds.refusalCap).toBe(25); // R9 locked constant
      expect(typeof thresholds.maxWords).toBe("function");
      expect(typeof thresholds.words).toBe("function");
    } catch (error) {
      expect((error as Error).message).toContain("thresholds not yet linked");
    }
  });
});
