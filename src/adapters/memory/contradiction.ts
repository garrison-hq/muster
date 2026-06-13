/**
 * Memory adapter: ContradictionLinter
 *
 * FR-004: detect cross-file (MEMORY.md ↔ USER.md) and intra-file
 *         (MEMORY.md ↔ MEMORY.md) contradictions.
 * FR-010: distinguish timestamped supersession from genuine contradiction.
 * NFR-001: byte-stable deterministic output — findings sorted by factAId then
 *          factBId in UTF-16 code-unit order; no Math.random(), Date.now(),
 *          or locale-dependent collation.
 * C-001: adapter boundary — src/core/ never imports memory specifics.
 * C-002: every ContradictionFinding carries a normative rubricCitation
 *        (imported from lint.ts — do NOT redeclare).
 *
 * This module is consumed by WP05 (LintReport composer). It imports types
 * from lint.ts but NEVER modifies that file.
 */

import type {
  MemoryFact,
  LintReport,
  ContradictionFinding,
  SupersessionNote,
} from "./lint.js";
import { RUBRIC_CITATION } from "./lint.js";

// Re-export the interfaces so callers can import from this module if desired.
export type { ContradictionFinding, SupersessionNote };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract a set of lowercase "content words" from a fact's text.
 * Words shorter than 3 characters or in the stop-list are omitted to reduce
 * noise. Returns a Set of strings.
 *
 * NFR-001: no locale-dependent APIs (toLocaleLowerCase → toLowerCase).
 */
const STOP_WORDS = new Set([
  "the", "and", "for", "are", "was", "has", "have", "had", "but", "not",
  "all", "one", "any", "can", "its", "our", "you", "her", "his", "they",
  "them", "their", "that", "this", "with", "from", "into", "been", "will",
  "just", "also", "some", "each", "than", "then", "more", "over", "such",
  "only", "very", "may", "out", "now", "who", "both", "your", "time",
  // Generic subject words that appear across many unrelated facts:
  "user", "prefer", "prefers", "preferred", "uses", "use", "without",
  "address", "responses", "direct", "new",
]);

function contentWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return new Set(words);
}

/**
 * Return the count of shared words between two Sets.
 */
function sharedWordCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const word of a) {
    if (b.has(word)) count++;
  }
  return count;
}

/**
 * Determine whether two facts are "topic-related" based on keyword overlap.
 * At least one shared content word is required.
 */
function topicRelated(factA: MemoryFact, factB: MemoryFact): boolean {
  const wordsA = contentWords(factA.text);
  const wordsB = contentWords(factB.text);
  return sharedWordCount(wordsA, wordsB) >= 1;
}

/**
 * Compare two Date-or-undefined values for ordering.
 * Returns -1 if a < b, 0 if equal or both undefined, 1 if a > b.
 */
function compareDates(
  a: Date | undefined,
  b: Date | undefined
): -1 | 0 | 1 {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 0; // treat missing as unordered
  if (b === undefined) return 0; // treat missing as unordered
  const diff = a.getTime() - b.getTime();
  if (diff < 0) return -1;
  if (diff > 0) return 1;
  return 0;
}

/**
 * UTF-16 code-unit string comparison (no localeCompare).
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
function utf16Compare(a: string, b: string): number {
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    const diff = a.charCodeAt(i) - b.charCodeAt(i);
    if (diff !== 0) return diff;
  }
  return a.length - b.length;
}

// ---------------------------------------------------------------------------
// T006 — ContradictionLinter
// ---------------------------------------------------------------------------

export class ContradictionLinter {
  /**
   * Lint two parsed fact arrays for contradictions and supersessions.
   *
   * Returns a partial LintReport containing only contradictionFindings and
   * supersessionNotes. A caller (WP05) merges these with stalenessFindings
   * to produce the full LintReport.
   *
   * Pair generation:
   *   - MEMORY × USER (cross-file)
   *   - MEMORY × MEMORY (intra-file)
   *   USER × USER pairs are NOT generated (rubric: USER.md does not self-contradict).
   *
   * Supersession rule (FR-010):
   *   - If both facts in a pair have timestamps and one is strictly newer,
   *     emit SupersessionNote (not ContradictionFinding).
   *   - Otherwise, if the facts assert contradictory values for the same topic,
   *     emit ContradictionFinding.
   *
   * NFR-001: findings are sorted by factAId → factBId in UTF-16 code-unit order
   * before return; algorithm is deterministic.
   */
  lint(
    memoryFacts: MemoryFact[],
    userFacts: MemoryFact[]
  ): Pick<LintReport, "contradictionFindings" | "supersessionNotes"> {
    const contradictionFindings: ContradictionFinding[] = [];
    const supersessionNotes: SupersessionNote[] = [];

    // Produce all pairs to check.
    const pairs: Array<[MemoryFact, MemoryFact]> = [];

    // Cross-file: MEMORY × USER
    for (const memFact of memoryFacts) {
      for (const userFact of userFacts) {
        pairs.push([memFact, userFact]);
      }
    }

    // Intra-file: MEMORY × MEMORY (each distinct ordered pair once)
    for (let i = 0; i < memoryFacts.length; i++) {
      for (let j = i + 1; j < memoryFacts.length; j++) {
        pairs.push([memoryFacts[i], memoryFacts[j]]);
      }
    }

    for (const [factA, factB] of pairs) {
      // Only consider topic-related pairs.
      if (!topicRelated(factA, factB)) continue;

      // Supersession check: if both have timestamps and one is strictly newer.
      const cmp = compareDates(factA.timestamp, factB.timestamp);

      if (
        factA.timestamp !== undefined &&
        factB.timestamp !== undefined &&
        cmp !== 0
      ) {
        // One supersedes the other — record as supersession, not contradiction.
        const [superseded, superseding] = cmp < 0
          ? [factA, factB]   // factA is older → superseded
          : [factB, factA];  // factB is older → superseded

        supersessionNotes.push({
          kind: "supersession",
          supersededFactId: superseded.id,
          supersedingFactId: superseding.id,
          note:
            `Fact "${superseded.id}" (${superseded.timestamp!.toISOString()}) ` +
            `superseded by "${superseding.id}" (${superseding.timestamp!.toISOString()}) ` +
            `on topic covered by: "${superseded.text.slice(0, 60)}"`,
        });
        continue;
      }

      // Contradiction check: both are topic-related but not a supersession.
      // We check that the facts assert different values for the shared topic.
      // Strategy: if the texts are not identical and share at least one
      // strong subject word, treat them as contradictory.
      if (factA.text !== factB.text) {
        contradictionFindings.push({
          kind: "contradiction",
          factAId: factA.id,
          factBId: factB.id,
          factASource: factA.source,
          factBSource: factB.source,
          factAText: factA.text,
          factBText: factB.text,
          rubricCitation: RUBRIC_CITATION,
        });
      }
    }

    // NFR-001: sort findings deterministically by factAId → factBId (UTF-16
    // code-unit order). No localeCompare.
    contradictionFindings.sort((a, b) => {
      const byA = utf16Compare(a.factAId, b.factAId);
      if (byA !== 0) return byA;
      return utf16Compare(a.factBId, b.factBId);
    });

    return { contradictionFindings, supersessionNotes };
  }
}
