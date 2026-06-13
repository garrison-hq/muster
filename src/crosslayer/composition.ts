/**
 * Cross-layer composition model and resolved-context assembly.
 *
 * FR-002: Accepts a stack composition — an ordered set of layer fixtures
 * (persona soul + SOP, optionally a skill) with an optional declared precedence.
 *
 * C-001: All cross-layer logic lives here at the adapter/feature edge. The
 * spec-agnostic core (src/core/) is never touched or modified.
 *
 * Normative citation: muster cross-layer conformance rubric
 * (cross-layer-conformance-01KTYKP2), spec FR-002, C-005.
 */

import { promises as fs } from "node:fs";
import { resolve as pathResolve, dirname } from "node:path";
import { parseDocument } from "yaml";
import { resolveCompositionDetailed } from "../adapters/rfc1/resolve.js";
import type { SoulDocument } from "../core/adapter.js";

// ---------------------------------------------------------------------------
// Types (data-model.md §StackComposition — implement exactly these)
// ---------------------------------------------------------------------------

/** Supported layer types for this milestone (C-005). */
export type LayerType = "persona" | "sop" | "skill";

/** One layer entry in the stack. */
export interface LayerEntry {
  /** Discriminates assembly strategy. */
  layerType: LayerType;
  /** Path to the fixture file (persona: SOUL.md; sop: AGENTS.md; skill: SKILL.md). */
  fixturePath: string;
}

/**
 * Optional declared precedence: an ordered list of layer types, highest-rank first.
 * Present → wins field used in CrossLayerFinding; absent → undefined-precedence finding.
 */
export interface PrecedenceDeclaration {
  /** e.g. ["sop", "persona", "skill"] — SOP outranks persona outranks skill. */
  order: [LayerType, ...LayerType[]];
}

/**
 * The resolved composed context, produced by assembleComposedContext().
 * The persona layer is resolved via resolveCompositionDetailed() (RFC-1 §7.5/Appendix G);
 * the SOP and skill texts are concatenated in CONTEXT_FILE_ORDER injection order
 * (AGENTS→SOUL per OpenClaw source convention).
 */
export interface ResolvedContext {
  /** The full assembled system-prompt text for behavioral runs. */
  composedText: string;
  /** The SOP-alone text (persona stripped) used for baseline runs. */
  sopAloneText: string;
  /** Layer-to-text mapping for the static lint (lint runs on resolved text, C-003). */
  layerTexts: Map<LayerType, string>;
}

/** Stack composition — the input contract for both the static lint (WP02) and
 *  the behavioral runner (WP03). */
export interface StackComposition {
  /** Ordered layers; at minimum [persona, sop]; skill is optional. */
  layers: LayerEntry[];
  /** Optional declared precedence. Absence does not prevent assembly; it drives findings. */
  precedence?: PrecedenceDeclaration;
  /** Populated by assembleComposedContext(); null until assembled. */
  resolved: ResolvedContext | null;
}

// ---------------------------------------------------------------------------
// Layer-type guard (T002) — C-005
// ---------------------------------------------------------------------------

const SUPPORTED_LAYER_TYPES = new Set<LayerType>(["persona", "sop", "skill"]);

/**
 * Rejects any layer type that is not supported in this milestone (C-005).
 * Throws explicitly so callers see which value triggered the rejection.
 *
 * Normative citation: muster cross-layer conformance rubric C-005.
 */
function assertSupportedLayers(layers: LayerEntry[]): void {
  for (const entry of layers) {
    if (!SUPPORTED_LAYER_TYPES.has(entry.layerType)) {
      throw new Error(
        `Unsupported layer type "${entry.layerType}". ` +
          `Only persona, sop, and skill are supported in this milestone (C-005).`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Invariant validation
// ---------------------------------------------------------------------------

/**
 * Validates that the layer list satisfies the StackComposition invariants:
 * - at most one entry per LayerType
 * - at least one "persona" entry
 * - at least one "sop" entry
 */
function assertLayerInvariants(layers: LayerEntry[]): void {
  const counts = new Map<LayerType, number>();
  for (const entry of layers) {
    counts.set(entry.layerType, (counts.get(entry.layerType) ?? 0) + 1);
  }

  const duplicates = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([type]) => type);

  if (duplicates.length > 0) {
    throw new Error(
      `Each LayerType may appear at most once in a StackComposition. ` +
        `Duplicated: ${duplicates.join(", ")}.`
    );
  }

  if (!counts.has("persona")) {
    throw new Error(
      `StackComposition must contain at least one "persona" layer entry.`
    );
  }

  if (!counts.has("sop")) {
    throw new Error(
      `StackComposition must contain at least one "sop" layer entry.`
    );
  }
}

// ---------------------------------------------------------------------------
// Persona parsing helper
// ---------------------------------------------------------------------------

/**
 * Parses raw SOUL.md text into a SoulDocument for RFC-1 resolution.
 * Implements §3.1.1 front-matter extraction directly (pure text splitting)
 * and uses the yaml package for AST parsing, matching the rfc1 adapter's
 * approach without importing from it (to avoid coupling to the adapter seam).
 */
function parseSoulDocumentFromText(raw: string, filePath: string): SoulDocument {
  const lines = raw.split("\n");
  if (lines[0]?.trimEnd() !== "---") {
    throw new Error(
      `Persona fixture "${filePath}" is missing the YAML front-matter opening delimiter "---" (§3.1.1).`
    );
  }

  let closeIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trimEnd() === "---") {
      closeIndex = i;
      break;
    }
  }

  if (closeIndex === -1) {
    throw new Error(
      `Persona fixture "${filePath}" has an unterminated YAML front-matter block (§3.1.1).`
    );
  }

  const yamlText = lines.slice(1, closeIndex).join("\n");
  const body = lines.slice(closeIndex + 1).join("\n");

  const yamlDoc = parseDocument(yamlText, { version: "1.2" });
  if (yamlDoc.errors.length > 0) {
    const messages = yamlDoc.errors.map((e) => e.message).join("; ");
    throw new Error(
      `Persona fixture "${filePath}" has invalid YAML front matter: ${messages}`
    );
  }

  const frontMatter = yamlDoc.toJS() as unknown;

  return {
    path: filePath,
    frontMatter,
    body,
    kind: "soul",
  };
}

// ---------------------------------------------------------------------------
// Section header builder (deterministic — no clock/RNG/localeCompare)
// ---------------------------------------------------------------------------

function sectionHeader(layer: LayerType): string {
  return `<!-- muster:layer:${layer} -->`;
}

// ---------------------------------------------------------------------------
// Path helpers (pure string operations — UTF-16 code-unit ordering, no clock)
// ---------------------------------------------------------------------------

function findFixturePath(layers: LayerEntry[], type: LayerType): string {
  const entry = layers.find((l) => l.layerType === type);
  if (entry === undefined) {
    throw new Error(`Layer type "${type}" not found in composition layers.`);
  }
  return entry.fixturePath;
}

/**
 * Resolves a relative reference path against the fromPath directory.
 * Pure string operation — no I/O, no clock, no RNG (charter NFR-001).
 */
function resolveRelativePath(ref: string, fromPath: string): string {
  return pathResolve(dirname(fromPath), ref);
}

// ---------------------------------------------------------------------------
// assembleComposedContext (T003 + T004)
// ---------------------------------------------------------------------------

/**
 * Assembles a resolved composed context from the given stack composition.
 *
 * Assembly order (CONTEXT_FILE_ORDER — AGENTS→SOUL per OpenClaw source convention):
 *   1. SOP text (AGENTS.md)
 *   2. Persona text resolved via RFC-1 (SOUL.md)
 *   3. Skill text (SKILL.md), if present
 *
 * FR-001: Reuses resolveCompositionDetailed from src/adapters/rfc1/resolve.ts
 *         without teaching src/core/ any cross-layer specifics.
 * FR-002: Accepts a stack composition with optional precedence.
 * C-001:  No cross-layer logic enters src/core/.
 * C-003:  Assembly resolves the persona before assembly, so resolved text is used.
 * C-005:  Unsupported layer types are rejected before assembly begins.
 *
 * Normative citation: muster cross-layer conformance rubric (FR-002, C-005),
 * OpenClaw CONTEXT_FILE_ORDER (AGENTS→SOUL injection convention).
 */
export async function assembleComposedContext(
  composition: Omit<StackComposition, "resolved">
): Promise<StackComposition> {
  assertSupportedLayers(composition.layers);
  assertLayerInvariants(composition.layers);

  const fileTexts = await readLayerFiles(composition.layers);

  const resolvedPersonaText = await resolvePersonaLayer(
    fileTexts,
    composition.layers
  );

  const sopText = fileTexts.get("sop") ?? "";
  const skillText = fileTexts.get("skill");

  const layerTexts = buildLayerTexts(resolvedPersonaText, sopText, skillText);
  const composedText = buildComposedText(resolvedPersonaText, sopText, skillText);

  const resolved: ResolvedContext = {
    composedText,
    sopAloneText: sopText,
    layerTexts,
  };

  return {
    layers: composition.layers,
    precedence: composition.precedence,
    resolved,
  };
}

/** Reads all layer fixture files from disk asynchronously. */
async function readLayerFiles(
  layers: LayerEntry[]
): Promise<Map<LayerType, string>> {
  const fileTexts = new Map<LayerType, string>();
  for (const entry of layers) {
    const text = await fs.readFile(entry.fixturePath, "utf-8");
    fileTexts.set(entry.layerType, text);
  }
  return fileTexts;
}

/** Resolves the persona layer through RFC-1 strict mode, propagating violations. */
async function resolvePersonaLayer(
  fileTexts: Map<LayerType, string>,
  layers: LayerEntry[]
): Promise<string> {
  const personaRaw = fileTexts.get("persona");
  if (personaRaw === undefined) {
    throw new Error(
      `Internal: persona text unexpectedly absent after invariant check.`
    );
  }

  const personaFixturePath = findFixturePath(layers, "persona");
  const personaDoc = parseSoulDocumentFromText(personaRaw, personaFixturePath);

  const outcome = await resolveCompositionDetailed(
    personaDoc,
    { mode: "strict" },
    async (ref, fromPath) => {
      const refPath = resolveRelativePath(ref, fromPath);
      const refText = await fs.readFile(refPath, "utf-8");
      return parseSoulDocumentFromText(refText, refPath);
    }
  );

  const errorViolations = outcome.violations.filter(
    (v) => v.severity === "error"
  );
  if (errorViolations.length > 0) {
    const messages = errorViolations
      .map((v) => `[${v.section}] ${v.path}: ${v.message}`)
      .join("; ");
    throw new Error(
      `Persona layer failed RFC-1 strict-mode validation: ${messages}`
    );
  }

  // The persona body is the instructional text contributed to composed context.
  return personaDoc.body.trim();
}

/** Builds the layerTexts map from resolved layer content. */
function buildLayerTexts(
  resolvedPersonaText: string,
  sopText: string,
  skillText: string | undefined
): Map<LayerType, string> {
  const layerTexts = new Map<LayerType, string>();
  layerTexts.set("persona", resolvedPersonaText);
  layerTexts.set("sop", sopText);
  if (skillText !== undefined) {
    layerTexts.set("skill", skillText);
  }
  return layerTexts;
}

/**
 * Concatenates layer sections in CONTEXT_FILE_ORDER injection order:
 * SOP → persona → skill (if present).
 * Each section is prefixed with a muster layer header for attribution.
 * Sections are separated by a blank line.
 */
function buildComposedText(
  resolvedPersonaText: string,
  sopText: string,
  skillText: string | undefined
): string {
  const sections: string[] = [
    `${sectionHeader("sop")}\n${sopText.trim()}`,
    `${sectionHeader("persona")}\n${resolvedPersonaText}`,
  ];
  if (skillText !== undefined) {
    sections.push(`${sectionHeader("skill")}\n${skillText.trim()}`);
  }
  return sections.join("\n\n");
}
