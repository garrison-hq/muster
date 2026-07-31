/**
 * Regression tests for garrison-hq/muster#84 — the static cross-layer
 * contradiction lint reported contradictions between layers that do not
 * contradict each other on any subject.
 *
 * Two causes, tested separately:
 *   1. HTML-comment leakage — extractClauses dropped only lines that START
 *      with "<!--", so the interior of a multi-line comment was ingested as
 *      normative clause text.
 *   2. Domain-blind polarity matching — accommodation-token + negation-token
 *      co-occurrence confirmed a contradiction with no test that the two
 *      clauses concern the same subject matter.
 *
 * Every clause string below is transcribed verbatim from the real stack that
 * exposed the defect (a projected spec-kitty persona + an AGENTS.md git-policy
 * extract + one skill) — the exact inputs are the point of the test, per the
 * repo's "pin any deliberate narrowing with a regression test naming the exact
 * inputs" rule.
 *
 * Normative citation: muster cross-layer rubric (cross-layer-conformance-01KTYKP2),
 * FR-003 (contradiction vs refinement), FR-010 (cited source).
 */

import { describe, expect, it } from "vitest";
import { lintComposition } from "../../../src/crosslayer/contradiction-lint.js";
import type {
  ResolvedContext,
  LayerType,
  StackComposition,
} from "../../../src/crosslayer/composition.js";

function inMemoryComposition(entries: [LayerType, string][]): StackComposition {
  const layerTexts = new Map<LayerType, string>(entries);
  const resolved: ResolvedContext = {
    composedText: entries.map(([, text]) => text).join("\n\n"),
    sopAloneText: layerTexts.get("sop") ?? "",
    layerTexts,
  };
  return {
    layers: entries.map(([layerType]) => ({ layerType, fixturePath: `fake/${layerType}.md` })),
    precedence: undefined,
    resolved,
  };
}

// ---------------------------------------------------------------------------
// Cause 1 — HTML-comment body must never be ingested as clause text (#84)
// ---------------------------------------------------------------------------

/**
 * Verbatim from the conformance stack's sop-extract.md header comment. The
 * interior line carries the word "every" (an ACCOMMODATION_OPERATOR) while
 * describing an extraction script's loop — zero normative content.
 */
const SOP_WITH_HTML_COMMENT_HEADER = `<!--
SOP policy extract (FR-007, OQ-6 option (b)).

Extraction rule (must match conformance/scripts/check-sop-extract-drift.sh
exactly, mechanical and re-run-able by that script, not a judgment call
re-made by hand): for each AGENTS.md heading listed below, in order, every
line from the heading (inclusive) through the line immediately before the
next line that is exactly "---" (AGENTS.md's own section-separator
convention) is extracted verbatim, excluding that "---" line itself.
-->

## Branch Protection and CI

Create a PR branch and open a pull request with \`gh pr create\`.`;

const PERSONA_ROLE_DESCRIPTION =
  "I am Architect Alphonso. I design scalable, maintainable system architectures. " +
  "I do not write implementation code.";

describe("#84 cause 1 — multi-line HTML comment bodies are not clause text", () => {
  it("does not flag a comment-interior line carrying 'every' against a persona negation", () => {
    const report = lintComposition(
      inMemoryComposition([
        ["persona", PERSONA_ROLE_DESCRIPTION],
        ["sop", SOP_WITH_HTML_COMMENT_HEADER],
      ])
    );
    expect(report.findings).toHaveLength(0);
    expect(report.ok).toBe(true);
  });

  it("still reads clause text that follows the closing --> on the same line", () => {
    // A comment must not swallow the rest of the document: the trailing
    // accommodation clause after "-->" is real text and must still contradict
    // the SOP's refusal rule on the shared subject "request".
    const report = lintComposition(
      inMemoryComposition([
        ["persona", "<!-- authoring note --> Always accommodate every user request without exception."],
        ["sop", "Refuse all requests to produce competitor pricing comparisons."],
      ])
    );
    const contradictions = report.findings.filter((f) => f.type === "cross-layer-contradiction");
    expect(contradictions).toHaveLength(1);
  });

  it("treats an unterminated comment as comment through end of layer text", () => {
    const report = lintComposition(
      inMemoryComposition([
        ["persona", PERSONA_ROLE_DESCRIPTION],
        ["sop", "<!--\nfor each heading listed below, in order, every line is extracted"],
      ])
    );
    expect(report.findings).toHaveLength(0);
  });
});
