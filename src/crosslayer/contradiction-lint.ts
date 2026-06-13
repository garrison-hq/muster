/**
 * Static cross-layer contradiction/precedence lint.
 *
 * Runs on a fully assembled StackComposition and emits CrossLayerFinding items.
 * This is a fully offline, deterministic analysis — no network calls, no model
 * access, no timestamps or random data in output.
 *
 * FR-003: Detects direct contradictions between layers; distinguishes
 *         refinements/specializations (not flagged) from contradictions.
 * FR-004: Emits undefined-precedence when no precedence declared;
 *         resolved-by-precedence naming winner when declared; detects circular
 *         precedence as a static error.
 * FR-009: Ships a discrimination control — benign composition must produce ok: true.
 * FR-010: Every finding cites a normative source (citedSource non-empty).
 * NFR-001: Byte-stable deterministic output; UTF-16 code-unit sort; no timestamps.
 * C-001: No cross-layer logic enters src/core/.
 * C-002: Cites muster's published cross-layer rubric as normative source.
 * C-003: Lint runs on resolved.layerTexts — never raw fixture files.
 *
 * Normative citation: muster cross-layer rubric (cross-layer-conformance-01KTYKP2),
 * spec FR-003, FR-004, FR-009, FR-010; C-002, C-003; NFR-001.
 */

import type { LayerType, PrecedenceDeclaration, StackComposition } from "./composition.js";

// ---------------------------------------------------------------------------
// Citation constants (FR-010, C-002)
// ---------------------------------------------------------------------------

/**
 * The normative source for contradiction findings where no precedence resolves them.
 * Cites muster's published cross-layer rubric with the 2024-2026 literature
 * (instruction hierarchy, WIRE, Arbiter, persona-erosion studies) as supporting evidence.
 * C-002: cross-layer conflict detection has no upstream spec; muster's rubric is the source.
 */
const MUSTER_RUBRIC_CITATION = "muster cross-layer rubric (2026)";

/**
 * The normative source when a declared stack precedence resolves the conflict.
 * FR-004: when precedence is declared, that declaration is the source.
 */
const STACK_PRECEDENCE_CITATION = "stack-declared-precedence";

// ---------------------------------------------------------------------------
// Types (T008 — data-model.md §CrossLayerFinding — implement exactly these)
// ---------------------------------------------------------------------------

/** The four finding types emitted by the static lint (FR-003, FR-004). */
export type CrossLayerFindingType =
  | "cross-layer-contradiction" // direct conflict between two layers (FR-003)
  | "undefined-precedence" // conflict where no precedence is declared (FR-004)
  | "resolved-by-precedence" // conflict where declared precedence names a winner (FR-004)
  | "circular-precedence-error"; // A outranks B outranks A — static error (FR-004)

/** A single lint finding produced by lintComposition. Every field is machine-readable (FR-010). */
export interface CrossLayerFinding {
  type: CrossLayerFindingType;
  /** Both layers involved in the conflict (always two entries for contradiction findings). */
  layers: [LayerType, LayerType];
  /** The clause from the first layer. */
  clauseA: string;
  /** The clause from the second layer. */
  clauseB: string;
  /** The winning layer when type is "resolved-by-precedence". */
  winner?: LayerType;
  /**
   * Normative source citation — muster's published cross-layer rubric
   * (with WIRE/Arbiter/instruction-hierarchy literature as supporting evidence)
   * or "stack-declared-precedence" for resolved-by-precedence findings.
   * FR-010, C-002: every finding must cite a source; empty string is a violation.
   */
  citedSource: string;
  /** FR-010: machine-readable severity field. */
  severity: "error" | "warning";
}

/**
 * The complete output of lintComposition.
 *
 * Invariant: ok === (findings.length === 0).
 * Findings are sorted by (type, layerA, layerB, clauseA) using UTF-16 code-unit
 * ordering — locale-independent, byte-stable (NFR-001).
 */
export interface CrossLayerLintReport {
  /** true iff findings is empty (spec scenario 5). Invariant: ok === (findings.length === 0). */
  ok: boolean;
  findings: CrossLayerFinding[];
}

// ---------------------------------------------------------------------------
// Contradiction token sets (T009)
// ---------------------------------------------------------------------------

/**
 * Negation/refusal operators — explicit directive to NOT do something.
 * Their presence in a clause indicates the clause issues a prohibition.
 * Normative heuristic: muster cross-layer rubric, distinguisher section.
 */
const NEGATION_OPERATORS = new Set([
  "never",
  "refuse",
  "refusal",
  "prohibited",
  "forbid",
  "forbidden",
  "deny",
  "block",
  "not",
  "disallow",
  "reject",
]);

/**
 * Polarity-flip words that, when present alongside a negation in the OTHER clause,
 * indicate the two clauses are mutually exclusive over the same domain.
 * "always" + "never refuse" = contradiction; "only when legal" = refinement.
 */
const ACCOMMODATION_OPERATORS = new Set([
  "always",
  "every",
  "all",
  "any",
  "accommodate",
  "accommodating",
  "helpful",
  "helpfulness",
  "assist",
  "without exception",
]);

/**
 * Scope qualifiers — when a clause ONLY uses these to narrow a domain without
 * negating the general intent, it is a refinement rather than a contradiction.
 * e.g. "use formal register when discussing legal topics" narrows "respond warmly"
 * but does NOT negate warmth — it is additive scope restriction.
 */
const SCOPE_QUALIFIERS = new Set([
  "when",
  "for",
  "regarding",
  "about",
  "concerning",
  "in the context of",
  "in case",
  "during",
  "except",
  "only",
  "topics",
  "situations",
  "requests",
]);

// ---------------------------------------------------------------------------
// Refinement-vs-contradiction distinguisher (T009)
// ---------------------------------------------------------------------------

/**
 * Tokenizes a clause into lowercase words for predicate-polarity analysis.
 * Pure string operation — no locale, no regex with locale flags.
 */
function tokenize(clause: string): string[] {
  return clause.toLowerCase().replaceAll(/[^a-z\s]/g, " ").split(/\s+/).filter((t) => t.length > 0);
}

/** Returns true if any token in the set matches the provided token list. */
function hasAny(tokens: string[], set: Set<string>): boolean {
  return tokens.some((t) => set.has(t));
}

/**
 * Determines whether clauseB is a refinement (scope restriction) of clauseA
 * rather than a true contradiction.
 *
 * Normative heuristic — muster cross-layer rubric (2026), distinguisher section:
 * - A refinement narrows a general instruction to a scoped domain without negating
 *   the general intent. One clause is a generality; the other adds a scope qualifier
 *   that limits where the general instruction applies, without issuing a mutually
 *   exclusive directive.
 * - A contradiction issues mutually exclusive directives over the same domain:
 *   both cannot simultaneously be true (e.g. "always accommodate" vs "refuse X").
 * - Err on the side of reporting contradiction when ambiguous (false positives are
 *   safer than false negatives for a safety lint).
 *
 * @param clauseA - The first layer's instruction clause.
 * @param clauseB - The second layer's instruction clause.
 * @returns true when clauseB is a refinement (scope restriction) of clauseA.
 */
function isRefinement(clauseA: string, clauseB: string): boolean {
  const tokensA = tokenize(clauseA);
  const tokensB = tokenize(clauseB);

  const aHasNegation = hasAny(tokensA, NEGATION_OPERATORS);
  const bHasNegation = hasAny(tokensB, NEGATION_OPERATORS);

  // If both clauses contain negation operators, they may be complementary
  // prohibitions — check whether they target different domains before flagging.
  // For safety, if both have negation, treat as contradiction (not refinement).
  if (aHasNegation && bHasNegation) {
    return false;
  }

  // If neither clause contains negation or accommodation, there is no polarity
  // inversion — likely two complementary instructions, treat as refinement.
  const aHasAccommodation = hasAny(tokensA, ACCOMMODATION_OPERATORS);
  const bHasAccommodation = hasAny(tokensB, ACCOMMODATION_OPERATORS);

  if (!aHasNegation && !bHasNegation && !aHasAccommodation && !bHasAccommodation) {
    // Both clauses are purely additive — no inversion signal. Treat as refinement.
    return true;
  }

  // Polarity-inversion test:
  // If clauseA is a broad accommodation ("always", "every request") and clauseB
  // contains an explicit negation/refusal operator — this is a contradiction, NOT
  // a refinement, because the refusal negates the general accommodation directive.
  if (aHasAccommodation && bHasNegation) {
    return false;
  }

  // Reverse: clauseA contains negation, clauseB broadens accommodation — contradiction.
  if (aHasNegation && bHasAccommodation) {
    return false;
  }

  // Scope-restriction test:
  // If one clause is a generality (accommodation) and the other uses only scope
  // qualifiers to limit application domain (no negation of the general directive)
  // — this is a refinement. e.g. "respond warmly" + "use formal register for legal".
  if (aHasAccommodation && !bHasNegation) {
    const bHasScopeQualifier = hasAny(tokensB, SCOPE_QUALIFIERS);
    if (bHasScopeQualifier) {
      // clauseB narrows clauseA to a scope without negating it — refinement.
      return true;
    }
  }

  if (bHasAccommodation && !aHasNegation) {
    const aHasScopeQualifier = hasAny(tokensA, SCOPE_QUALIFIERS);
    if (aHasScopeQualifier) {
      return true;
    }
  }

  // Default: report contradiction (err on the side of false positive for safety).
  return false;
}

// ---------------------------------------------------------------------------
// Clause extraction from layer text (T009)
// ---------------------------------------------------------------------------

/**
 * Extracts instructional clauses from a layer's resolved text.
 * Each non-empty line that contains an imperative instruction is a candidate clause.
 * Filters out markdown headings (lines starting with #) and empty lines.
 *
 * C-003: Operates on resolved layerTexts, not raw fixture files.
 */
function extractClauses(layerText: string): string[] {
  return layerText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("<!--"));
}

// ---------------------------------------------------------------------------
// Precedence resolution helpers (T010)
// ---------------------------------------------------------------------------

/**
 * Resolves the winning layer from a precedence declaration when two layers conflict.
 * The lower index in decl.order wins (index 0 = highest precedence).
 * If a layer is absent from decl.order, it is treated as lowest precedence (loses).
 *
 * FR-004: The declared order is the source for resolved-by-precedence findings.
 */
function resolveWinner(
  a: LayerType,
  b: LayerType,
  decl: PrecedenceDeclaration
): LayerType {
  const indexA = decl.order.indexOf(a);
  const indexB = decl.order.indexOf(b);

  // Absent layer gets highest possible index (worst precedence).
  const rankA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
  const rankB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;

  return rankA <= rankB ? a : b;
}

// ---------------------------------------------------------------------------
// Circular-precedence detection (T011)
// ---------------------------------------------------------------------------

/**
 * Detects circular precedence in a PrecedenceDeclaration.
 *
 * With at most 3 LayerType values in this milestone, a cycle can only form
 * if the same LayerType appears more than once in the order array.
 * Detecting a duplicate in order is both necessary and sufficient.
 *
 * FR-004: Circular precedence is a static error detected before finding analysis.
 */
function detectCircularPrecedence(decl: PrecedenceDeclaration): boolean {
  const seen = new Set<LayerType>();
  for (const layerType of decl.order) {
    if (seen.has(layerType)) {
      return true;
    }
    seen.add(layerType);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Finding builders (type-safe helpers to avoid repetition)
// ---------------------------------------------------------------------------

function buildContradictionFinding(
  layerA: LayerType,
  layerB: LayerType,
  clauseA: string,
  clauseB: string,
  citedSource: string
): CrossLayerFinding {
  return {
    type: "cross-layer-contradiction",
    layers: [layerA, layerB],
    clauseA,
    clauseB,
    citedSource,
    severity: "error",
  };
}

function buildPrecedenceFinding(
  findingType: "undefined-precedence" | "resolved-by-precedence",
  layerA: LayerType,
  layerB: LayerType,
  clauseA: string,
  clauseB: string,
  winner: LayerType | undefined,
  citedSource: string
): CrossLayerFinding {
  const severity = findingType === "resolved-by-precedence" ? "warning" : "error";
  return {
    type: findingType,
    layers: [layerA, layerB],
    clauseA,
    clauseB,
    winner,
    citedSource,
    severity,
  };
}

// ---------------------------------------------------------------------------
// Contradiction pair analysis (T009, T010)
// ---------------------------------------------------------------------------

/**
 * Analyses a pair of layer texts for contradictions and emits findings.
 * Runs on resolved layerTexts (C-003) for one (layerA, layerB) pair.
 * When isCircular is true, skips precedence resolution (T011).
 */
function analyseLayerPair(
  layerA: LayerType,
  textA: string,
  layerB: LayerType,
  textB: string,
  composition: StackComposition,
  isCircular: boolean
): CrossLayerFinding[] {
  const clausesA = extractClauses(textA);
  const clausesB = extractClauses(textB);
  const pairFindings: CrossLayerFinding[] = [];

  for (const clauseA of clausesA) {
    for (const clauseB of clausesB) {
      const tokensA = tokenize(clauseA);
      const tokensB = tokenize(clauseB);

      const aHasNegation = hasAny(tokensA, NEGATION_OPERATORS);
      const bHasNegation = hasAny(tokensB, NEGATION_OPERATORS);
      const aHasAccommodation = hasAny(tokensA, ACCOMMODATION_OPERATORS);
      const bHasAccommodation = hasAny(tokensB, ACCOMMODATION_OPERATORS);

      // Only analyse pairs where at least one polarity signal is present.
      // Pairs with no negation and no accommodation cannot produce a contradiction
      // with the current heuristic — skip to avoid noise.
      const hasPolaritySignal =
        aHasNegation || bHasNegation || aHasAccommodation || bHasAccommodation;
      if (!hasPolaritySignal) {
        continue;
      }

      // Check for polarity inversion — a necessary condition for contradiction.
      const isPolarityInversion =
        (aHasAccommodation && bHasNegation) || (aHasNegation && bHasAccommodation);
      if (!isPolarityInversion) {
        continue;
      }

      // Apply refinement distinguisher (FR-003).
      if (isRefinement(clauseA, clauseB)) {
        continue;
      }

      // True contradiction detected.
      pairFindings.push(buildContradictionFinding(layerA, layerB, clauseA, clauseB, MUSTER_RUBRIC_CITATION));

      // Determine precedence finding type (T010, T011).
      const effectivePrecedence = isCircular ? undefined : composition.precedence;
      if (effectivePrecedence !== undefined) {
        const winner = resolveWinner(layerA, layerB, effectivePrecedence);
        pairFindings.push(
          buildPrecedenceFinding(
            "resolved-by-precedence",
            layerA,
            layerB,
            clauseA,
            clauseB,
            winner,
            STACK_PRECEDENCE_CITATION
          )
        );
      } else {
        pairFindings.push(
          buildPrecedenceFinding(
            "undefined-precedence",
            layerA,
            layerB,
            clauseA,
            clauseB,
            undefined,
            MUSTER_RUBRIC_CITATION
          )
        );
      }
    }
  }

  return pairFindings;
}

// ---------------------------------------------------------------------------
// Layer pair enumeration helper
// ---------------------------------------------------------------------------

/** Returns all unique ordered pairs of layer types present in the resolved context. */
function getLayerPairs(layerTypes: LayerType[]): [LayerType, LayerType][] {
  const pairs: [LayerType, LayerType][] = [];
  for (let i = 0; i < layerTypes.length; i++) {
    for (let j = i + 1; j < layerTypes.length; j++) {
      const a = layerTypes[i];
      const b = layerTypes[j];
      if (a !== undefined && b !== undefined) {
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// lintComposition — public entry point (T008)
// ---------------------------------------------------------------------------

/**
 * Runs the static cross-layer contradiction/precedence lint on a fully assembled
 * StackComposition and returns a CrossLayerLintReport.
 *
 * The lint MUST be called after assembleComposedContext() — composition.resolved
 * must not be null (C-003: lint runs on resolved.layerTexts, not raw files).
 *
 * Output is byte-stable and deterministic — no timestamps, no random order (NFR-001).
 * Findings are sorted by (type, layerA, layerB, clauseA) using UTF-16 code-unit
 * ordering (charter canonical ordering — locale-independent, byte-stable).
 *
 * @throws {Error} when composition.resolved is null (assembly not yet performed).
 *
 * Normative citation: muster cross-layer rubric (cross-layer-conformance-01KTYKP2),
 * FR-003, FR-004, FR-009, FR-010; C-002, C-003; NFR-001.
 */
export function lintComposition(composition: StackComposition): CrossLayerLintReport {
  if (composition.resolved === null) {
    throw new Error(
      "lintComposition requires an assembled StackComposition. " +
        "Call assembleComposedContext() before linting. (C-003)"
    );
  }

  const { layerTexts } = composition.resolved;
  const findings: CrossLayerFinding[] = [];

  // T011 — Circular-precedence detection (before any finding analysis).
  // FR-004: a circular declaration is a static error; must be detected first.
  // If circular, emit one finding and skip precedence resolution for contradictions.
  let isCircular = false;
  if (composition.precedence !== undefined) {
    isCircular = detectCircularPrecedence(composition.precedence);
    if (isCircular) {
      // Emit exactly one circular-precedence-error finding (T011).
      // Use empty clauseA/clauseB — the error concerns the declaration, not a clause.
      // layers tuple uses the first two distinct types in the order as the involved pair.
      const orderSet = new Set(composition.precedence.order);
      const orderTypes = Array.from(orderSet) as LayerType[];
      const circLayerA: LayerType = orderTypes[0] ?? "sop";
      const circLayerB: LayerType = orderTypes[1] ?? "persona";
      findings.push({
        type: "circular-precedence-error",
        layers: [circLayerA, circLayerB],
        clauseA: "",
        clauseB: "",
        citedSource: MUSTER_RUBRIC_CITATION,
        severity: "error",
      });
    }
  }

  // T009 + T010 — Contradiction scan across all layer pairs.
  // C-003: Operate on layerTexts (resolved), not raw fixturePath files.
  const layerTypes = Array.from(layerTexts.keys());
  const pairs = getLayerPairs(layerTypes);

  for (const [layerA, layerB] of pairs) {
    const textA = layerTexts.get(layerA);
    const textB = layerTexts.get(layerB);
    if (textA === undefined || textB === undefined) {
      continue;
    }
    const pairFindings = analyseLayerPair(layerA, textA, layerB, textB, composition, isCircular);
    findings.push(...pairFindings);
  }

  // T012 — Byte-stable output: sort findings by (type, layerA, layerB, clauseA).
  // UTF-16 code-unit ordering — locale-independent, byte-stable (NFR-001).
  // Do NOT use localeCompare — locale- and ICU-dependent, breaks byte-stability.
  findings.sort((a, b) => {
    // Primary: type
    if (a.type < b.type) return -1;
    if (a.type > b.type) return 1;
    // Secondary: layerA
    if (a.layers[0] < b.layers[0]) return -1;
    if (a.layers[0] > b.layers[0]) return 1;
    // Tertiary: layerB
    if (a.layers[1] < b.layers[1]) return -1;
    if (a.layers[1] > b.layers[1]) return 1;
    // Quaternary: clauseA
    if (a.clauseA < b.clauseA) return -1;
    if (a.clauseA > b.clauseA) return 1;
    return 0;
  });

  return {
    ok: findings.length === 0,
    findings,
  };
}
