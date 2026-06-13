/**
 * Unit tests for src/crosslayer/composition.ts
 *
 * Tests the StackComposition model and assembleComposedContext() function
 * in isolation — no network, no live models.
 *
 * Normative citation: muster cross-layer conformance rubric
 * (cross-layer-conformance-01KTYKP2), spec FR-002, C-005.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assembleComposedContext,
} from "../../../src/crosslayer/composition.js";
import type {
  LayerEntry,
  LayerType,
  PrecedenceDeclaration,
  ResolvedContext,
  StackComposition,
} from "../../../src/crosslayer/composition.js";

// ---------------------------------------------------------------------------
// Fixture paths (relative to the worktree root — tests run from there)
// ---------------------------------------------------------------------------

const BENIGN_SOUL = "fixtures/crosslayer/benign/SOUL.md";
const BENIGN_AGENTS = "fixtures/crosslayer/benign/AGENTS.md";
const BENIGN_SKILL = "fixtures/crosslayer/benign/SKILL.md";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function writeTempFile(content: string): Promise<string> {
  const path = join(tmpdir(), `muster-test-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  await fs.writeFile(path, content, "utf-8");
  return path;
}

function layers(...entries: [LayerType, string][]): LayerEntry[] {
  return entries.map(([layerType, fixturePath]) => ({ layerType, fixturePath }));
}

// ---------------------------------------------------------------------------
// Type-level smoke tests — these verify the exported shape at compile time
// ---------------------------------------------------------------------------

describe("StackComposition type shape", () => {
  it("accepts a valid StackComposition object literal", () => {
    const comp: StackComposition = {
      layers: [
        { layerType: "persona", fixturePath: "path/to/SOUL.md" },
        { layerType: "sop", fixturePath: "path/to/AGENTS.md" },
      ],
      resolved: null,
    };
    expect(comp.resolved).toBeNull();
    expect(comp.layers).toHaveLength(2);
  });

  it("accepts a PrecedenceDeclaration with a valid order tuple", () => {
    const prec: PrecedenceDeclaration = { order: ["sop", "persona"] };
    expect(prec.order[0]).toBe("sop");
  });

  it("accepts a ResolvedContext with correct shape", () => {
    const ctx: ResolvedContext = {
      composedText: "full",
      sopAloneText: "sop only",
      layerTexts: new Map<LayerType, string>([
        ["sop", "sop only"],
        ["persona", "persona text"],
      ]),
    };
    expect(ctx.layerTexts.get("sop")).toBe("sop only");
  });
});

// ---------------------------------------------------------------------------
// T002 — Layer-type guard: rejects unsupported layer types (C-005)
// ---------------------------------------------------------------------------

describe("assembleComposedContext — unsupported layer type guard (C-005)", () => {
  it("throws with a C-005 citation when an unsupported layer type is present", async () => {
    // Cast to LayerEntry[] to simulate a runtime-supplied bad value.
    const badLayers = [
      { layerType: "memory" as LayerType, fixturePath: "irrelevant.md" },
      { layerType: "sop" as LayerType, fixturePath: BENIGN_AGENTS },
    ];
    await expect(
      assembleComposedContext({ layers: badLayers })
    ).rejects.toThrow("C-005");
  });

  it("throws naming the unsupported layer type in the error message", async () => {
    const badLayers = [
      { layerType: "heartbeat" as LayerType, fixturePath: "irrelevant.md" },
      { layerType: "sop" as LayerType, fixturePath: BENIGN_AGENTS },
    ];
    await expect(
      assembleComposedContext({ layers: badLayers })
    ).rejects.toThrow(`"heartbeat"`);
  });
});

// ---------------------------------------------------------------------------
// Invariant validation — missing required layers
// ---------------------------------------------------------------------------

describe("assembleComposedContext — layer invariant validation", () => {
  it("throws when no persona layer is provided", async () => {
    await expect(
      assembleComposedContext({
        layers: layers(["sop", BENIGN_AGENTS]),
      })
    ).rejects.toThrow("persona");
  });

  it("throws when no SOP layer is provided", async () => {
    await expect(
      assembleComposedContext({
        layers: layers(["persona", BENIGN_SOUL]),
      })
    ).rejects.toThrow("sop");
  });

  it("throws when a LayerType appears more than once", async () => {
    await expect(
      assembleComposedContext({
        layers: layers(
          ["persona", BENIGN_SOUL],
          ["sop", BENIGN_AGENTS],
          ["sop", BENIGN_AGENTS]
        ),
      })
    ).rejects.toThrow("Duplicated");
  });
});

// ---------------------------------------------------------------------------
// T003 + T004 — Happy path: persona + SOP
// ---------------------------------------------------------------------------

describe("assembleComposedContext — happy path (persona + SOP)", () => {
  it("returns a populated StackComposition with resolved set (not null)", async () => {
    const result = await assembleComposedContext({
      layers: layers(["persona", BENIGN_SOUL], ["sop", BENIGN_AGENTS]),
    });
    expect(result.resolved).not.toBeNull();
  });

  it("composedText is non-empty", async () => {
    const result = await assembleComposedContext({
      layers: layers(["persona", BENIGN_SOUL], ["sop", BENIGN_AGENTS]),
    });
    expect(result.resolved?.composedText.length).toBeGreaterThan(0);
  });

  it("sopAloneText equals the raw SOP fixture text (T004)", async () => {
    const rawSop = await fs.readFile(BENIGN_AGENTS, "utf-8");
    const result = await assembleComposedContext({
      layers: layers(["persona", BENIGN_SOUL], ["sop", BENIGN_AGENTS]),
    });
    expect(result.resolved?.sopAloneText).toBe(rawSop);
  });

  it("layerTexts contains entries for persona and sop (T004)", async () => {
    const result = await assembleComposedContext({
      layers: layers(["persona", BENIGN_SOUL], ["sop", BENIGN_AGENTS]),
    });
    const map = result.resolved?.layerTexts;
    expect(map?.has("persona")).toBe(true);
    expect(map?.has("sop")).toBe(true);
  });

  it("layerTexts.get('sop') equals the raw SOP fixture text (T004)", async () => {
    const rawSop = await fs.readFile(BENIGN_AGENTS, "utf-8");
    const result = await assembleComposedContext({
      layers: layers(["persona", BENIGN_SOUL], ["sop", BENIGN_AGENTS]),
    });
    expect(result.resolved?.layerTexts.get("sop")).toBe(rawSop);
  });

  it("composedText contains both SOP and persona sections", async () => {
    const result = await assembleComposedContext({
      layers: layers(["persona", BENIGN_SOUL], ["sop", BENIGN_AGENTS]),
    });
    const text = result.resolved?.composedText ?? "";
    expect(text).toContain("muster:layer:sop");
    expect(text).toContain("muster:layer:persona");
  });

  it("composedText does not contain the skill layer header when no skill present", async () => {
    const result = await assembleComposedContext({
      layers: layers(["persona", BENIGN_SOUL], ["sop", BENIGN_AGENTS]),
    });
    expect(result.resolved?.composedText).not.toContain("muster:layer:skill");
  });

  it("preserves the declared precedence in the returned StackComposition", async () => {
    const precedence: PrecedenceDeclaration = { order: ["sop", "persona"] };
    const result = await assembleComposedContext({
      layers: layers(["persona", BENIGN_SOUL], ["sop", BENIGN_AGENTS]),
      precedence,
    });
    expect(result.precedence).toStrictEqual(precedence);
  });
});

// ---------------------------------------------------------------------------
// T004 — sopAloneText isolation
// ---------------------------------------------------------------------------

describe("assembleComposedContext — sopAloneText isolation (T004)", () => {
  it("sopAloneText does not contain text from the persona fixture body", async () => {
    const rawPersona = await fs.readFile(BENIGN_SOUL, "utf-8");
    // Extract just the body from the persona file (text after the second ---)
    const bodyStart = rawPersona.indexOf("\n---\n", rawPersona.indexOf("---\n") + 4);
    const personaBody = bodyStart >= 0 ? rawPersona.slice(bodyStart + 5).trim() : "";

    const result = await assembleComposedContext({
      layers: layers(["persona", BENIGN_SOUL], ["sop", BENIGN_AGENTS]),
    });
    const sopAlone = result.resolved?.sopAloneText ?? "";

    // The persona body text must not leak into sopAloneText.
    // We check for a distinctive line from the persona body.
    if (personaBody.length > 0) {
      const firstPersonaLine = personaBody.split("\n").find((l) => l.trim().length > 0) ?? "";
      if (firstPersonaLine.length > 0) {
        expect(sopAlone).not.toContain(firstPersonaLine);
      }
    }
    // sopAloneText must not contain the SOP layer header either
    // (it is raw SOP text, no headers added).
    expect(sopAlone).not.toContain("muster:layer:");
  });
});

// ---------------------------------------------------------------------------
// T003 + T004 — Happy path: persona + SOP + skill
// ---------------------------------------------------------------------------

describe("assembleComposedContext — happy path (persona + SOP + skill)", () => {
  it("layerTexts.get('skill') is defined when a skill layer is provided (T004)", async () => {
    const result = await assembleComposedContext({
      layers: layers(
        ["persona", BENIGN_SOUL],
        ["sop", BENIGN_AGENTS],
        ["skill", BENIGN_SKILL]
      ),
    });
    expect(result.resolved?.layerTexts.get("skill")).toBeDefined();
  });

  it("layerTexts.get('skill') equals the raw skill fixture text (T004)", async () => {
    const rawSkill = await fs.readFile(BENIGN_SKILL, "utf-8");
    const result = await assembleComposedContext({
      layers: layers(
        ["persona", BENIGN_SOUL],
        ["sop", BENIGN_AGENTS],
        ["skill", BENIGN_SKILL]
      ),
    });
    expect(result.resolved?.layerTexts.get("skill")).toBe(rawSkill);
  });

  it("composedText contains all three section headers when skill is present", async () => {
    const result = await assembleComposedContext({
      layers: layers(
        ["persona", BENIGN_SOUL],
        ["sop", BENIGN_AGENTS],
        ["skill", BENIGN_SKILL]
      ),
    });
    const text = result.resolved?.composedText ?? "";
    expect(text).toContain("muster:layer:sop");
    expect(text).toContain("muster:layer:persona");
    expect(text).toContain("muster:layer:skill");
  });

  it("composedText is non-empty with all three layers", async () => {
    const result = await assembleComposedContext({
      layers: layers(
        ["persona", BENIGN_SOUL],
        ["sop", BENIGN_AGENTS],
        ["skill", BENIGN_SKILL]
      ),
    });
    expect(result.resolved?.composedText.length).toBeGreaterThan(0);
  });

  it("sopAloneText does not contain skill text (T004)", async () => {
    const rawSkill = await fs.readFile(BENIGN_SKILL, "utf-8");
    const distinctSkillLine = rawSkill.split("\n").find((l) => l.trim().length > 5) ?? "";
    const result = await assembleComposedContext({
      layers: layers(
        ["persona", BENIGN_SOUL],
        ["sop", BENIGN_AGENTS],
        ["skill", BENIGN_SKILL]
      ),
    });
    if (distinctSkillLine.length > 0) {
      expect(result.resolved?.sopAloneText).not.toContain(distinctSkillLine);
    }
  });
});

// ---------------------------------------------------------------------------
// T003 — RFC-1 violation propagation
// ---------------------------------------------------------------------------

describe("assembleComposedContext — RFC-1 violation propagation (T003)", () => {
  it("throws when the persona fixture fails RFC-1 strict-mode validation", async () => {
    // A persona with missing mandatory keys (soul_spec is required by §5.1).
    // Providing an otherwise valid front-matter structure but missing soul_spec.
    const malformedPersona = `---
id: "bad-persona"
name: "Malformed"
---

This persona is missing soul_spec which is required by RFC-1.
`;
    const personaPath = await writeTempFile(malformedPersona);

    try {
      await expect(
        assembleComposedContext({
          layers: layers(["persona", personaPath], ["sop", BENIGN_AGENTS]),
        })
      ).rejects.toThrow("RFC-1 strict-mode");
    } finally {
      await fs.unlink(personaPath).catch(() => undefined);
    }
  });

  it("error message from RFC-1 validation contains the section citation", async () => {
    const malformedPersona = `---
id: "bad-persona-2"
name: "Also Malformed"
---

Missing soul_spec again.
`;
    const personaPath = await writeTempFile(malformedPersona);

    try {
      await expect(
        assembleComposedContext({
          layers: layers(["persona", personaPath], ["sop", BENIGN_AGENTS]),
        })
      ).rejects.toThrow(/§/);
    } finally {
      await fs.unlink(personaPath).catch(() => undefined);
    }
  });
});

// ---------------------------------------------------------------------------
// Determinism (NFR-001) — same inputs produce identical outputs
// ---------------------------------------------------------------------------

describe("assembleComposedContext — deterministic output (NFR-001)", () => {
  it("produces identical composedText on two successive calls with the same inputs", async () => {
    const composition = {
      layers: layers(["persona", BENIGN_SOUL], ["sop", BENIGN_AGENTS]),
    };
    const first = await assembleComposedContext(composition);
    const second = await assembleComposedContext(composition);
    expect(first.resolved?.composedText).toBe(second.resolved?.composedText);
  });
});
