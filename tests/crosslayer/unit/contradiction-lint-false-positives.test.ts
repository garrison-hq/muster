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
import { assembleComposedContext } from "../../../src/crosslayer/composition.js";
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

// ---------------------------------------------------------------------------
// Cause 2 — polarity inversion alone is not a contradiction (#84)
// ---------------------------------------------------------------------------

/** Verbatim from the conformance stack's AGENTS.md git-policy extract. */
const SOP_NO_DIRECT_PUSH_CLAUSE =
  "**All changes to origin/main MUST go through pull requests. Direct pushes are prohibited.**";
const SOP_WHY_CLAUSE =
  "**Why:** The workflow is predicated on pull requests for review, CI gating, and audit trail. " +
  "Direct pushes to origin/main bypass all of these.";

/** Verbatim from the conformance stack's persona projections. */
const PERSONA_ALPHONSO_SUMMARY =
  "Design and validate system architectures for scalability, maintainability, and correctness. " +
  "Architect Alphonso translates high-level requirements into well-structured technical blueprints, " +
  "selects appropriate patterns, and ensures architectural coherence across components. " +
  "Does NOT implement code or manage day-to-day tasks.";

/** Verbatim from src/doctrine/skills/spk-run-next/SKILL.md, step 3. */
const SKILL_QUERY_STEP_CLAUSE =
  "3. For `query`, inspect only; do not execute a prompt or mark a result.";

describe("#84 cause 2 — clauses on unrelated subjects are not contradictions", () => {
  it("a git-push policy is not contradicted by a persona's implementation boundary", () => {
    // "All ... prohibited" (accommodation + negation) vs "I do not write
    // implementation code" (negation). Polarity inverts; subject matter does
    // not overlap at all. A policy note is entitled to the word "all".
    const report = lintComposition(
      inMemoryComposition([
        ["persona", PERSONA_ROLE_DESCRIPTION],
        ["sop", SOP_NO_DIRECT_PUSH_CLAUSE],
      ])
    );
    expect(report.findings).toHaveLength(0);
  });

  it("a git-push policy is not contradicted by a skill's read-only query step", () => {
    const report = lintComposition(
      inMemoryComposition([
        ["sop", SOP_NO_DIRECT_PUSH_CLAUSE],
        ["skill", SKILL_QUERY_STEP_CLAUSE],
      ])
    );
    expect(report.findings).toHaveLength(0);
  });

  it("a CI-rationale note is not contradicted by an architecture role summary", () => {
    const report = lintComposition(
      inMemoryComposition([
        ["persona", PERSONA_ALPHONSO_SUMMARY],
        ["sop", SOP_WHY_CLAUSE],
      ])
    );
    expect(report.findings).toHaveLength(0);
  });

  it("the whole three-layer conformance stack produces ok: true", () => {
    // The composition that blocked spec-kitty-conformance mission M7's
    // static gate: persona + AGENTS.md policy extract + one skill, none of
    // which conflict with any other.
    const report = lintComposition(
      inMemoryComposition([
        ["persona", `${PERSONA_ALPHONSO_SUMMARY}\n\n${PERSONA_ROLE_DESCRIPTION}`],
        ["sop", `${SOP_WITH_HTML_COMMENT_HEADER}\n\n${SOP_NO_DIRECT_PUSH_CLAUSE}\n\n${SOP_WHY_CLAUSE}`],
        ["skill", SKILL_QUERY_STEP_CLAUSE],
      ])
    );
    expect(report.findings).toHaveLength(0);
    expect(report.ok).toBe(true);
  });

  it("the same polarity shape IS flagged once the clauses share a subject", () => {
    // Guard against the opposite failure: a gate that blocks everything. Same
    // sentence shapes as above, but both clauses are about pushing to main.
    const report = lintComposition(
      inMemoryComposition([
        ["persona", "I always push my finished work straight to origin/main."],
        ["sop", SOP_NO_DIRECT_PUSH_CLAUSE],
      ])
    );
    const contradictions = report.findings.filter((f) => f.type === "cross-layer-contradiction");
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0]?.clauseA).toBe("I always push my finished work straight to origin/main.");
    expect(contradictions[0]?.clauseB).toBe(SOP_NO_DIRECT_PUSH_CLAUSE);
  });
});

// ---------------------------------------------------------------------------
// The deliberate narrowing, pinned by exact counts on committed fixtures (#84)
// ---------------------------------------------------------------------------

describe("#84 — deliberate narrowing on committed fixtures, pinned by exact counts", () => {
  it("contradictory-no-precedence: 5 contradiction findings narrow to 2", async () => {
    const comp = await assembleComposedContext({
      layers: [
        {
          layerType: "persona",
          fixturePath: "fixtures/crosslayer/contradictory-no-precedence/SOUL.md",
        },
        {
          layerType: "sop",
          fixturePath: "fixtures/crosslayer/contradictory-no-precedence/AGENTS.md",
        },
      ],
    });
    const report = lintComposition(comp);
    // Dropped: the three pairings whose SOP side was the "professional tone"
    // rule or a continuation line with no shared subject. Kept: both pairings
    // against the refusal rule itself.
    expect(report.findings.filter((f) => f.type === "cross-layer-contradiction")).toHaveLength(2);
    expect(report.findings).toHaveLength(4);
  });

  it("erosion-persona-control: 8 contradiction findings narrow to 2", async () => {
    const comp = await assembleComposedContext({
      layers: [
        {
          layerType: "persona",
          fixturePath: "fixtures/crosslayer/erosion-persona-control/SOUL-eroding.md",
        },
        {
          layerType: "sop",
          fixturePath: "fixtures/crosslayer/erosion-persona-control/AGENTS-refusal-rule.md",
        },
      ],
    });
    const report = lintComposition(comp);
    // Dropped: the pairings against the observability DECISION-line rules,
    // which the eroding persona does not address at all.
    expect(report.findings.filter((f) => f.type === "cross-layer-contradiction")).toHaveLength(2);
    expect(report.findings).toHaveLength(4);
  });
});
