/**
 * handoff.test.ts — WP02 T008/T012: `handoff.ts` (FR-003) unit coverage.
 *
 * `AgentProfile[]` fixtures are constructed directly as object literals —
 * no `loadProfileSet` filesystem round-trip needed for these pure-function
 * checks over already-loaded profiles.
 */

import { describe, expect, it } from "vitest";

import { checkHandoffs } from "../../src/adapters/spec-kitty-profile/handoff.js";
import type { AgentProfile } from "../../src/adapters/spec-kitty-profile/profile.js";

function profile(overrides: Partial<AgentProfile> & { profileId: string }): AgentProfile {
  return {
    filePath: `/profiles/${overrides.profileId}.agent.yaml`,
    fileNameStem: overrides.profileId,
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

describe("checkHandoffs — resolution", () => {
  it("resolves a works-with role held by exactly one other profile with no finding", () => {
    // works-with has no symmetry counterpart, so this isolates pure
    // single-holder resolution without also exercising the symmetry rule.
    const architect = profile({ profileId: "architect-alphonso", roles: ["architect"], worksWith: ["planner"] });
    const planner = profile({ profileId: "planner-priti", roles: ["planner"] });
    expect(checkHandoffs([architect, planner])).toEqual([]);
  });

  it("resolves a role held by two profiles (non-unique) with no finding", () => {
    // works-with has no symmetry counterpart, so this isolates pure
    // multi-holder resolution without also exercising the symmetry rule.
    const architect = profile({ profileId: "architect-alphonso", roles: ["architect"], worksWith: ["implementer"] });
    const impl1 = profile({ profileId: "implementer-ivy", roles: ["implementer"] });
    const impl2 = profile({ profileId: "implementer-igor", roles: ["implementer"] });
    expect(checkHandoffs([architect, impl1, impl2])).toEqual([]);
  });

  it("reports a dangling handoff-to role as handoff-unresolved (error)", () => {
    const architect = profile({ profileId: "architect-alphonso", roles: ["architect"], handoffTo: ["nonexistent-role"] });
    const findings = checkHandoffs([architect]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "handoff-unresolved",
      profileId: "architect-alphonso",
      path: "collaboration.handoff-to[0]",
      severity: "error",
    });
    expect(findings[0]?.source.normative).toContain("§3.1");
  });

  it("does not resolve a role against the declaring profile's own roles", () => {
    const lonely = profile({ profileId: "lonely-larry", roles: ["planner"], handoffTo: ["planner"] });
    const findings = checkHandoffs([lonely]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("handoff-unresolved");
  });

  it("reports dangling handoff-from and works-with roles too", () => {
    const solo = profile({
      profileId: "solo-sam",
      roles: ["solo"],
      handoffFrom: ["ghost-role"],
      worksWith: ["another-ghost"],
    });
    const findings = checkHandoffs([solo]);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.path)).toEqual([
      "collaboration.handoff-from[0]",
      "collaboration.works-with[0]",
    ]);
  });

  it("an empty collaboration block produces zero findings", () => {
    const solo = profile({ profileId: "solo-sam", roles: ["solo"] });
    expect(checkHandoffs([solo])).toEqual([]);
  });
});

describe("checkHandoffs — symmetry", () => {
  it("a fully reciprocal handoff-to/handoff-from pair produces no warning", () => {
    const architect = profile({
      profileId: "architect-alphonso",
      roles: ["architect"],
      handoffTo: ["planner"],
    });
    const planner = profile({
      profileId: "planner-priti",
      roles: ["planner"],
      handoffFrom: ["architect"],
    });
    expect(checkHandoffs([architect, planner])).toEqual([]);
  });

  it("a one-directional handoff-to (no reciprocal handoff-from) produces handoff-asymmetric (warning)", () => {
    const architect = profile({
      profileId: "architect-alphonso",
      roles: ["architect"],
      handoffTo: ["planner"],
    });
    const planner = profile({ profileId: "planner-priti", roles: ["planner"] });
    const findings = checkHandoffs([architect, planner]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "handoff-asymmetric",
      profileId: "architect-alphonso",
      path: "collaboration.handoff-to[0]",
      severity: "warning",
    });
    expect(findings[0]?.source.normative).toContain("§3.2");
  });

  it("works-with has no symmetric counterpart — one-directional works-with never warns", () => {
    const architect = profile({
      profileId: "architect-alphonso",
      roles: ["architect"],
      worksWith: ["planner"],
    });
    const planner = profile({ profileId: "planner-priti", roles: ["planner"] });
    expect(checkHandoffs([architect, planner])).toEqual([]);
  });

  it("symmetry resolves against any reciprocating holder when a role is non-unique", () => {
    const architect = profile({
      profileId: "architect-alphonso",
      roles: ["architect"],
      handoffTo: ["implementer"],
    });
    const impl1 = profile({ profileId: "implementer-ivy", roles: ["implementer"] });
    const impl2 = profile({
      profileId: "implementer-igor",
      roles: ["implementer"],
      handoffFrom: ["architect"],
    });
    expect(checkHandoffs([architect, impl1, impl2])).toEqual([]);
  });
});

describe("checkHandoffs — determinism", () => {
  it("iterates profiles in input order, and handoffTo/handoffFrom/worksWith in array order", () => {
    const a = profile({
      profileId: "a-profile",
      roles: ["a"],
      handoffTo: ["ghost-1"],
      handoffFrom: ["ghost-2"],
      worksWith: ["ghost-3"],
    });
    const b = profile({ profileId: "b-profile", roles: ["b"], handoffTo: ["ghost-4"] });
    const findings = checkHandoffs([a, b]);
    expect(findings.map((f) => `${f.profileId}:${f.path}`)).toEqual([
      "a-profile:collaboration.handoff-to[0]",
      "a-profile:collaboration.handoff-from[0]",
      "a-profile:collaboration.works-with[0]",
      "b-profile:collaboration.handoff-to[0]",
    ]);
  });
});
