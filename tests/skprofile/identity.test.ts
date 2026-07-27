/**
 * identity.test.ts — WP02 T011/T012: `identity.ts` (FR-006) unit coverage,
 * plus the T012 step-5 rubric-citation completeness assertion.
 */

import { describe, expect, it } from "vitest";

import { checkIdentity } from "../../src/adapters/spec-kitty-profile/identity.js";
import type { AgentProfile } from "../../src/adapters/spec-kitty-profile/profile.js";
import type { SkProfileFindingKind } from "../../src/adapters/spec-kitty-profile/findings.js";
import { citationFor, RUBRIC_CITATION } from "../../src/adapters/spec-kitty-profile/rubric.js";

function profile(overrides: Partial<AgentProfile> & { profileId: string; fileNameStem: string }): AgentProfile {
  return {
    filePath: `/profiles/${overrides.fileNameStem}.agent.yaml`,
    roles: [],
    handoffTo: [],
    handoffFrom: [],
    worksWith: [],
    directiveRefs: [],
    tacticRefs: [],
    toolguideRefs: [],
    styleguideRefs: [],
    contextSources: { directives: [], tactics: [], toolguides: [], styleguides: [] },
    ...overrides,
  };
}

describe("checkIdentity — legality", () => {
  it("a fully legal, filename-matching, unique profile-id produces zero findings", () => {
    const p = profile({ profileId: "architect-alphonso", fileNameStem: "architect-alphonso" });
    expect(checkIdentity([p])).toEqual([]);
  });

  it("an uppercase-charset id produces profile-id-illegal citing §6.1", () => {
    const p = profile({ profileId: "Architect-Alphonso", fileNameStem: "Architect-Alphonso" });
    const findings = checkIdentity([p]);
    const illegal = findings.filter((f) => f.kind === "profile-id-illegal");
    expect(illegal).toHaveLength(1);
    expect(illegal[0]?.severity).toBe("error");
    expect(illegal[0]?.source.normative).toContain("§6.1");
  });

  it("a 65-character (otherwise legal) id produces profile-id-illegal citing §6.2", () => {
    const longId = "a".repeat(65);
    const p = profile({ profileId: longId, fileNameStem: longId });
    const findings = checkIdentity([p]);
    const illegal = findings.filter((f) => f.kind === "profile-id-illegal");
    expect(illegal).toHaveLength(1);
    expect(illegal[0]?.source.normative).toContain("§6.2");
  });

  it("an empty profileId fails legality (charset) as its own violation, not a special-cased kind", () => {
    const p = profile({ profileId: "", fileNameStem: "some-file", parseError: "boom" });
    const findings = checkIdentity([p]);
    const illegal = findings.filter((f) => f.kind === "profile-id-illegal");
    expect(illegal).toHaveLength(1);
    expect(illegal[0]?.profileId).toBe("(empty)");
    expect(illegal[0]?.source.normative).toContain("§6.1");
  });
});

describe("checkIdentity — filename match", () => {
  it("an id that differs from the filename by case only produces profile-id-filename-mismatch", () => {
    const p = profile({ profileId: "Planner-Priti", fileNameStem: "planner-priti" });
    const findings = checkIdentity([p]);
    const mismatch = findings.filter((f) => f.kind === "profile-id-filename-mismatch");
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0]?.severity).toBe("error");
  });

  it("legality and filename-mismatch can co-occur on the same profile (no short-circuit)", () => {
    const p = profile({ profileId: "UPPER-case", fileNameStem: "different-stem" });
    const findings = checkIdentity([p]);
    expect(findings.some((f) => f.kind === "profile-id-illegal")).toBe(true);
    expect(findings.some((f) => f.kind === "profile-id-filename-mismatch")).toBe(true);
  });
});

describe("checkIdentity — collision", () => {
  it("two profiles sharing one profile-id both produce profile-id-collision", () => {
    const a = profile({ profileId: "duplicate-id", fileNameStem: "duplicate-id-a" });
    const b = profile({ profileId: "duplicate-id", fileNameStem: "duplicate-id-b" });
    const findings = checkIdentity([a, b]);
    const collisions = findings.filter((f) => f.kind === "profile-id-collision");
    expect(collisions).toHaveLength(2);
    expect(collisions.every((f) => f.severity === "error")).toBe(true);
  });

  it("an unparsed profile (profileId === '') is excluded from collision grouping", () => {
    const a = profile({ profileId: "", fileNameStem: "unparsed-a", parseError: "boom" });
    const b = profile({ profileId: "", fileNameStem: "unparsed-b", parseError: "boom" });
    const findings = checkIdentity([a, b]);
    expect(findings.some((f) => f.kind === "profile-id-collision")).toBe(false);
  });

  it("collision is a distinct finding kind from filename-mismatch", () => {
    const a = profile({ profileId: "shared-id", fileNameStem: "shared-id" });
    const b = profile({ profileId: "shared-id", fileNameStem: "other-stem" });
    const findings = checkIdentity([a, b]);
    expect(findings.filter((f) => f.kind === "profile-id-collision")).toHaveLength(2);
    expect(findings.filter((f) => f.kind === "profile-id-filename-mismatch")).toHaveLength(1);
  });
});

describe("RUBRIC_CITATION completeness (T012 step 5)", () => {
  it("every non-schema, non-structural finding kind has a non-empty string citation", () => {
    const excluded = new Set<SkProfileFindingKind>(["schema-conformance-violation", "profile-parse-error"]);
    const allKinds: SkProfileFindingKind[] = [
      "schema-conformance-violation",
      "profile-parse-error",
      "handoff-unresolved",
      "handoff-asymmetric",
      "reference-unresolved",
      "reference-not-activated",
      "activation-config-unrecognized-shape",
      "context-source-missing",
      "profile-id-illegal",
      "profile-id-filename-mismatch",
      "profile-id-collision",
      "projection-output-missing",
      "projection-hash-drift",
    ];
    const coveredKinds = allKinds.filter((kind) => !excluded.has(kind));
    expect(coveredKinds).toHaveLength(11);
    for (const kind of coveredKinds) {
      const value = RUBRIC_CITATION[kind as keyof typeof RUBRIC_CITATION];
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
    expect(Object.keys(RUBRIC_CITATION)).not.toContain("schema-conformance-violation");
    expect(Object.keys(RUBRIC_CITATION)).not.toContain("profile-parse-error");
  });

  it("citationFor indexes the map for every non-excluded kind", () => {
    expect(citationFor("handoff-unresolved")).toBe(RUBRIC_CITATION["handoff-unresolved"]);
    expect(citationFor("profile-id-collision")).toBe(RUBRIC_CITATION["profile-id-collision"]);
  });
});
