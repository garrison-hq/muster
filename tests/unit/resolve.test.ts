import { describe, expect, it } from "vitest";
import type { SoulDocument } from "../../src/core/adapter.js";
import type { Violation } from "../../src/core/report.js";
import { canonicalJson } from "../../src/core/canonical-json.js";
import {
  type LoadRef,
  resolveComposition,
  resolveCompositionDetailed,
} from "../../src/adapters/rfc1/resolve.js";

/** Build a SoulDocument around already-parsed front matter. */
function soulDoc(path: string, frontMatter: Record<string, unknown>): SoulDocument {
  return {
    path,
    frontMatter,
    body: "",
    kind: frontMatter["kind"] === "mixin" ? "mixin" : "soul",
  };
}

/** In-memory loadRef stub keyed by the raw reference string. */
function stubLoader(map: Record<string, SoulDocument | Violation[]>): LoadRef {
  return async (ref) => {
    const hit = map[ref];
    if (hit === undefined) {
      return [
        { path: "composition", message: `unresolved reference ${ref}`, severity: "error" },
      ];
    }
    return hit;
  };
}

/** Appendix A minimal valid soul with per-test tweaks. */
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

/** Dotted-path lookup into an effective config. */
function at(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const segment of path.split(".")) {
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function expectViolations(result: unknown): Violation[] {
  expect(Array.isArray(result)).toBe(true);
  return result as Violation[];
}

describe("§7.5 / Appendix G composition resolution", () => {
  it("§25.2(4) Standard Merge through composition — §25.2(5) two extends + one mixin: hand-computed canonical equality", async () => {
    const baseA = soulDoc(
      "a.md",
      minimalSoul({
        id: "org.example.a",
        name: "Base A",
        locale: "en-GB",
        voice: { formality: 60, warmth: 10, verbosity: 50, jargon: 40, formatting: "minimal" },
        extensions: { "org.example.x": { p: 1, q: 1 } },
      })
    );
    // Partial deep content is legal in a base: only top-level mandatory
    // presence is checked per document (§5.1); the EFFECTIVE config is what
    // must validate (Appendix G.6).
    const baseB = soulDoc("b.md", {
      soul_spec: "1.0.0-rc1",
      id: "org.example.b",
      name: "Base B",
      locale: "en-GB",
      composition: { extends: [], mixins: [], merge_policy: "standard" },
      profiles: ["default"],
      values: { priorities: ["speed"] }, // §8.2: lists REPLACE, never union
      voice: { warmth: 20 }, // §8.1: maps deep-merge
      interaction: {},
      safety: {},
      extensions: { "org.example.x": { q: 2 } },
    });
    const mixinM = soulDoc("m.md", {
      soul_spec: "1.0.0-rc1",
      id: "org.example.m",
      kind: "mixin",
      voice: { jargon: 5 },
    });
    const root = soulDoc("root.md", {
      soul_spec: "1.0.0-rc1",
      id: "org.example.root",
      name: "Root",
      locale: "en-US",
      kind: "soul",
      composition: { extends: ["./a.md", "./b.md"], mixins: ["./m.md"], merge_policy: "standard" },
      profiles: ["default"],
      profile_overrides: {},
      voice: { warmth: 30 }, // §8.1: scalar replaces base/mixin values
      extensions: {},
    });

    const result = await resolveComposition(
      root,
      { mode: "strict" },
      stubLoader({ "./a.md": baseA, "./b.md": baseB, "./m.md": mixinM })
    );

    // Hand-computed per §7.5 steps 1-3 + §8.1/§8.2 + §9.4 reattachment.
    const expected = {
      soul_spec: "1.0.0-rc1",
      id: "org.example.root",
      name: "Root",
      locale: "en-US",
      kind: "soul",
      composition: { extends: ["./a.md", "./b.md"], mixins: ["./m.md"], merge_policy: "standard" },
      profiles: ["default"],
      profile_overrides: {},
      values: { priorities: ["speed"] },
      voice: { formality: 60, warmth: 30, verbosity: 50, jargon: 5, formatting: "minimal" },
      interaction: {
        clarifying_questions: "when_ambiguous",
        uncertainty: "explicit",
        disagreement: "neutral",
        confirmations: "implicit",
      },
      safety: { refusal_style: "brief", privacy: "strict", speculation: "mark" },
      extensions: { "org.example.x": { p: 1, q: 2 } },
    };
    expect(Array.isArray(result)).toBe(false);
    expect(canonicalJson(result)).toBe(canonicalJson(expected));
  });

  it("§9.4 root-owned fields: mixin carrying profiles/profile_overrides is stripped; root's win", async () => {
    const mixin = soulDoc("m.md", {
      soul_spec: "1.0.0-rc1",
      id: "org.example.evil",
      kind: "mixin",
      profiles: ["evil"],
      profile_overrides: { default: { voice: { warmth: 99 } } },
    });
    const root = soulDoc(
      "root.md",
      minimalSoul({
        kind: "soul",
        composition: { extends: [], mixins: ["./m.md"], merge_policy: "standard" },
      })
    );

    const result = await resolveComposition(
      root,
      { mode: "strict" },
      stubLoader({ "./m.md": mixin })
    );
    expect(Array.isArray(result)).toBe(false);
    const effective = result as Record<string, unknown>;
    expect(effective["profiles"]).toEqual(["default"]);
    // Reviewer guidance: the mixin's overrides must be unreachable.
    expect(effective["profile_overrides"]).toEqual({});
    expect(at(effective, "voice.warmth")).toBe(30); // root's value, not 99
  });

  it("Appendix G.5.4 strips ONLY profiles/profile_overrides: a mixin's kind merges into the effective config (documented G-literal behavior)", async () => {
    const mixin = soulDoc("m.md", {
      soul_spec: "1.0.0-rc1",
      id: "org.example.trait",
      kind: "mixin",
    });
    const root = soulDoc(
      "root.md",
      minimalSoul({
        composition: { extends: [], mixins: ["./m.md"], merge_policy: "standard" },
      })
    ); // root omits `kind` (§5.3 default)

    const outcome = await resolveCompositionDetailed(
      root,
      { mode: "strict" },
      stubLoader({ "./m.md": mixin })
    );
    expect(outcome.effective).not.toBeNull();
    expect(outcome.effective?.["kind"]).toBe("mixin");
  });

  it("§25.2(6) §7.3 cycle detection: A extends B extends A → error naming the chain (strict)", async () => {
    const docA = soulDoc(
      "a.md",
      minimalSoul({
        id: "org.example.a",
        composition: { extends: ["./b.md"], mixins: [], merge_policy: "standard" },
      })
    );
    const docB = soulDoc(
      "b.md",
      minimalSoul({
        id: "org.example.b",
        composition: { extends: ["./a.md"], mixins: [], merge_policy: "standard" },
      })
    );
    const loader = stubLoader({ "./a.md": docA, "./b.md": docB });

    const violations = expectViolations(await resolveComposition(docA, { mode: "strict" }, loader));
    const cycle = violations.find((v) => v.section === "§7.3");
    expect(cycle).toBeDefined();
    expect(cycle?.path).toBe("composition");
    expect(cycle?.message).toContain("Cycle detected: a.md -> b.md -> a.md");
  });

  it("§7.3 a cycle is unresolvable in permissive mode too", async () => {
    const docA = soulDoc(
      "a.md",
      minimalSoul({
        composition: { extends: ["./b.md"], mixins: [], merge_policy: "standard" },
      })
    );
    const docB = soulDoc(
      "b.md",
      minimalSoul({
        id: "org.example.b",
        composition: { extends: ["./a.md"], mixins: [], merge_policy: "standard" },
      })
    );
    const loader = stubLoader({ "./a.md": docA, "./b.md": docB });

    const outcome = await resolveCompositionDetailed(docA, { mode: "permissive" }, loader);
    expect(outcome.effective).toBeNull();
    expect(outcome.violations.some((v) => v.section === "§7.3" && v.severity === "error")).toBe(
      true
    );
  });

  it("§7.3 diamond composition (shared base, no cycle) resolves cleanly", async () => {
    const shared = soulDoc("shared.md", minimalSoul({ id: "org.example.shared" }));
    const left = soulDoc(
      "left.md",
      minimalSoul({
        id: "org.example.left",
        composition: { extends: ["./shared.md"], mixins: [], merge_policy: "standard" },
      })
    );
    const right = soulDoc(
      "right.md",
      minimalSoul({
        id: "org.example.right",
        composition: { extends: ["./shared.md"], mixins: [], merge_policy: "standard" },
      })
    );
    const root = soulDoc(
      "root.md",
      minimalSoul({
        id: "org.example.root",
        composition: { extends: ["./left.md", "./right.md"], mixins: [], merge_policy: "standard" },
      })
    );

    const result = await resolveComposition(
      root,
      { mode: "strict" },
      stubLoader({ "./shared.md": shared, "./left.md": left, "./right.md": right })
    );
    expect(Array.isArray(result)).toBe(false);
    expect((result as Record<string, unknown>)["id"]).toBe("org.example.root");
  });

  it("§9 unknown profile requested → error at `profiles` (strict)", async () => {
    const root = soulDoc("root.md", minimalSoul());
    const violations = expectViolations(
      await resolveComposition(root, { profile: "nope", mode: "strict" }, stubLoader({}))
    );
    const violation = violations.find((v) => v.path === "profiles");
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe("error");
    expect(violation?.section).toBe("§9");
    expect(violation?.message).toContain('"nope"');
  });

  it('§9 unknown profile in permissive mode → warning + fallback to "default"', async () => {
    const root = soulDoc("root.md", minimalSoul());
    const outcome = await resolveCompositionDetailed(
      root,
      { profile: "nope", mode: "permissive" },
      stubLoader({})
    );
    expect(outcome.effective).not.toBeNull();
    expect(outcome.profile).toBe("default");
    expect(
      outcome.violations.some((v) => v.path === "profiles" && v.severity === "warning")
    ).toBe(true);
  });

  it("§5.1 referenced soul missing mandatory keys: strict error with referencing context, permissive warning", async () => {
    const partialBase = soulDoc("base.md", {
      soul_spec: "1.0.0-rc1",
      id: "org.example.partial",
      // missing name/locale/... and NOT declared kind: mixin
    });
    const root = soulDoc(
      "root.md",
      minimalSoul({
        composition: { extends: ["./base.md"], mixins: [], merge_policy: "standard" },
      })
    );
    const loader = stubLoader({ "./base.md": partialBase });

    const strict = expectViolations(await resolveComposition(root, { mode: "strict" }, loader));
    const nameViolation = strict.find((v) => v.path === "name" && v.section === "§5.1");
    expect(nameViolation?.severity).toBe("error");
    expect(nameViolation?.message).toContain("base.md");

    const permissive = await resolveCompositionDetailed(root, { mode: "permissive" }, loader);
    expect(permissive.effective).not.toBeNull();
    expect(
      permissive.violations.some((v) => v.section === "§5.1" && v.severity === "warning")
    ).toBe(true);
  });
});

/**
 * §7.5 layer-peel fixture: voice.warmth is set at EVERY layer —
 * extends (10) → mixin (20) → local (30) → profile (40) → state (50).
 */
function layeredFixture(layers: {
  mixin?: boolean;
  local?: boolean;
  profile?: boolean;
  state?: boolean;
}): { root: SoulDocument; loader: LoadRef } {
  const base = soulDoc(
    "base.md",
    minimalSoul({
      id: "org.example.base",
      voice: { formality: 60, warmth: 10, verbosity: 50, jargon: 40, formatting: "minimal" },
    })
  );
  const mixin = soulDoc("m.md", {
    soul_spec: "1.0.0-rc1",
    id: "org.example.m",
    kind: "mixin",
    voice: { warmth: 20 },
  });
  const root = soulDoc("root.md", {
    soul_spec: "1.0.0-rc1",
    id: "org.example.root",
    name: "Root",
    locale: "en-US",
    kind: "soul",
    composition: {
      extends: ["./base.md"],
      mixins: layers.mixin ? ["./m.md"] : [],
      merge_policy: "standard",
    },
    profiles: ["default"],
    profile_overrides: layers.profile ? { default: { voice: { warmth: 40 } } } : {},
    extensions: {},
    ...(layers.local ? { voice: { warmth: 30 } } : {}),
    ...(layers.state
      ? { state: { base: "only", states: { only: { voice: { warmth: 50 } } } } }
      : {}),
  });
  return { root, loader: stubLoader({ "./base.md": base, "./m.md": mixin }) };
}

describe("§7.5 resolution order (one test per layer peel)", () => {
  it("§7.5 all five layers set → state wins (50)", async () => {
    const { root, loader } = layeredFixture({ mixin: true, local: true, profile: true, state: true });
    const outcome = await resolveCompositionDetailed(root, { mode: "strict" }, loader);
    expect(outcome.violations.filter((v) => v.severity === "error")).toEqual([]);
    expect(at(outcome.effective, "voice.warmth")).toBe(50);
    expect(outcome.state).toBe("only");
  });

  it("§7.5 remove state → profile wins (40)", async () => {
    const { root, loader } = layeredFixture({ mixin: true, local: true, profile: true });
    const outcome = await resolveCompositionDetailed(root, { mode: "strict" }, loader);
    expect(at(outcome.effective, "voice.warmth")).toBe(40);
    expect(outcome.state).toBeNull();
  });

  it("§7.5 remove profile → local wins (30)", async () => {
    const { root, loader } = layeredFixture({ mixin: true, local: true });
    const outcome = await resolveCompositionDetailed(root, { mode: "strict" }, loader);
    expect(at(outcome.effective, "voice.warmth")).toBe(30);
  });

  it("§7.5 remove local → mixin wins (20)", async () => {
    const { root, loader } = layeredFixture({ mixin: true });
    const outcome = await resolveCompositionDetailed(root, { mode: "strict" }, loader);
    expect(at(outcome.effective, "voice.warmth")).toBe(20);
  });

  it("§7.5 remove mixin → extends base wins (10)", async () => {
    const { root, loader } = layeredFixture({});
    const outcome = await resolveCompositionDetailed(root, { mode: "strict" }, loader);
    expect(at(outcome.effective, "voice.warmth")).toBe(10);
  });
});

describe("NFR-001 determinism", () => {
  it("NFR-001: resolving the same fixture twice yields identical canonical-JSON bytes", async () => {
    const make = () =>
      layeredFixture({ mixin: true, local: true, profile: true, state: true });
    const first = make();
    const second = make();
    const a = await resolveComposition(first.root, { mode: "strict" }, first.loader);
    const b = await resolveComposition(second.root, { mode: "strict" }, second.loader);
    expect(Array.isArray(a)).toBe(false);
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });
});

describe("§7.2 broken references", () => {
  it("§7.2/§4.2 loadRef violations propagate with the referencing path context", async () => {
    const childViolation: Violation = {
      path: "",
      message: "anchor (&) is forbidden in Soul-YAML",
      severity: "error",
      section: "§4.2",
    };
    const root = soulDoc(
      "root.md",
      minimalSoul({
        composition: { extends: ["./broken.md"], mixins: [], merge_policy: "standard" },
      })
    );
    const violations = expectViolations(
      await resolveComposition(
        root,
        { mode: "strict" },
        stubLoader({ "./broken.md": [childViolation] })
      )
    );
    const context = violations.find((v) => v.path === "composition.extends[0]");
    expect(context).toBeDefined();
    expect(context?.message).toContain("./broken.md");
    expect(context?.message).toContain("root.md");
    expect(violations).toContainEqual(childViolation);
  });

  it("Appendix G.6: composition can assemble an INVALID effective config — that must surface", async () => {
    // Each document is individually plausible; the merged voice.formality
    // is out of range (§4.3 percent).
    const base = soulDoc(
      "base.md",
      minimalSoul({ id: "org.example.base", voice: { formality: 60, warmth: 30 } })
    );
    const root = soulDoc(
      "root.md",
      minimalSoul({
        composition: { extends: ["./base.md"], mixins: [], merge_policy: "standard" },
        voice: { formality: 200, verbosity: 50, jargon: 40, warmth: 30 },
      })
    );
    const violations = expectViolations(
      await resolveComposition(root, { mode: "strict" }, stubLoader({ "./base.md": base }))
    );
    expect(
      violations.some((v) => v.path === "voice.formality" && v.section === "§4.3")
    ).toBe(true);
  });
});
