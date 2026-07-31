/**
 * Regression test for PR #85 review finding F1 — an unterminated `<!--`
 * marker silently drops the rest of a layer's text, and until now that loss
 * was invisible: `report.ok` came back `true` with zero findings even though
 * a real contradiction living further down the document was never compared.
 *
 * `stripHtmlComments` was extended (PR #85, commit 17ac677e0..1cc5f10a1) to
 * strip a whole multi-line HTML comment span. Its `close === -1` branch
 * treats an unterminated `<!--` as "the remainder of the layer text is
 * comment body" and deletes everything after it to EOF. At v1.2.0
 * (`b5d6214f5`) the old `startsWith("<!--")` line filter dropped at most the
 * one offending line — this turns a one-line loss into a whole-tail loss.
 *
 * This fix does not attempt to recover the dropped clause (distinguishing a
 * genuinely unterminated comment from a marker merely mentioned in prose or
 * a fenced code block is out of scope — see the rubric's accepted
 * false-negative surface, item 5). It converts the silent miss into a
 * visible one: `lintComposition` now emits an `unbalanced-html-comment-marker`
 * warning finding whenever a layer's `<!--` count exceeds its `-->` count, so
 * `report.ok` is `false` and the truncation is machine-readable instead of a
 * silent green.
 *
 * The reproducing input is an SOP layer that merely *mentions* the marker in
 * authoring prose (never opens a real comment) — this is precisely the
 * failure class PR #85 exists to fix, so it must not silently reintroduce a
 * miss of its own without at least surfacing it.
 *
 * Normative citation: docs/rubric/crosslayer-contradiction-gate.md,
 * accepted false-negative surface, item 5.
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

/** Verbatim reviewer example: the marker is mentioned in prose, never opened. */
const SOP_MENTIONS_MARKER_IN_PROSE = `## Authoring note

Hide a section from rendering by wrapping it: \`<!--\` opens an HTML comment.

## Git policy

Never push to origin/main directly; pushes are prohibited without a review.`;

const PERSONA_ALWAYS_PUSHES =
  "I always push my finished work directly to origin/main without waiting for a review.";

describe("F1 — an unterminated <!-- silently drops the layer tail; the drop must be visible", () => {
  it("does not report the tail contradiction (accepted false-negative, item 5) but stops being silent", () => {
    const report = lintComposition(
      inMemoryComposition([
        ["persona", PERSONA_ALWAYS_PUSHES],
        ["sop", SOP_MENTIONS_MARKER_IN_PROSE],
      ])
    );
    // The git-policy clause after the unterminated marker is still comment
    // body per stripHtmlComments — the miss itself is the accepted cost.
    const contradictions = report.findings.filter((f) => f.type === "cross-layer-contradiction");
    expect(contradictions).toHaveLength(0);
    // But the loss is no longer silent: report.ok must be false.
    expect(report.ok).toBe(false);
  });

  it("emits an unbalanced-html-comment-marker warning naming the offending layer", () => {
    const report = lintComposition(
      inMemoryComposition([
        ["persona", PERSONA_ALWAYS_PUSHES],
        ["sop", SOP_MENTIONS_MARKER_IN_PROSE],
      ])
    );
    const unbalanced = report.findings.filter((f) => f.type === "unbalanced-html-comment-marker");
    expect(unbalanced).toHaveLength(1);
    expect(unbalanced[0]?.severity).toBe("warning");
    expect(unbalanced[0]?.layers).toEqual(["sop", "sop"]);
    expect(unbalanced[0]?.citedSource.length).toBeGreaterThan(0);
  });

  it("warns the same way when the stray marker sits in a fenced code block", () => {
    const sopWithFencedMarker = `## Example

\`\`\`
<!--
\`\`\`

## Git policy

Never push to origin/main directly; pushes are prohibited without a review.`;

    const report = lintComposition(
      inMemoryComposition([
        ["persona", PERSONA_ALWAYS_PUSHES],
        ["sop", sopWithFencedMarker],
      ])
    );
    const unbalanced = report.findings.filter((f) => f.type === "unbalanced-html-comment-marker");
    expect(unbalanced).toHaveLength(1);
    const contradictions = report.findings.filter((f) => f.type === "cross-layer-contradiction");
    expect(contradictions).toHaveLength(0);
  });

  it("does NOT warn for the inert opposite direction — a mermaid --> arrow with no opener", () => {
    // Mitigating context from the review: every real imbalance in muster's own
    // fixtures/souls/examples/doctrine is a mermaid `-->` arrow with no
    // opener. This must stay inert (correctly, since it never eats real text)
    // and must not warn.
    const sopWithMermaidArrow = `\`\`\`mermaid
graph TD
  A --> B
\`\`\`

Never push to origin/main directly; pushes are prohibited without a review.`;

    const report = lintComposition(
      inMemoryComposition([
        ["persona", PERSONA_ALWAYS_PUSHES],
        ["sop", sopWithMermaidArrow],
      ])
    );
    const unbalanced = report.findings.filter((f) => f.type === "unbalanced-html-comment-marker");
    expect(unbalanced).toHaveLength(0);
    // The mermaid arrow does not swallow the real clause below it — the
    // contradiction is still found because nothing was stripped.
    const contradictions = report.findings.filter((f) => f.type === "cross-layer-contradiction");
    expect(contradictions).toHaveLength(1);
  });

  it("balanced markers in the same layer never warn (no regression on real fixtures)", () => {
    const balanced = "<!-- authoring note --> Always accommodate every user request without exception.";
    const report = lintComposition(
      inMemoryComposition([
        ["persona", balanced],
        ["sop", "Refuse all requests to produce competitor pricing comparisons."],
      ])
    );
    const unbalanced = report.findings.filter((f) => f.type === "unbalanced-html-comment-marker");
    expect(unbalanced).toHaveLength(0);
  });
});
