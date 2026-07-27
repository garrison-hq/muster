/**
 * fixtures.test.ts — WP03 T019 step 2: the discrimination-control suite
 * (SC-002/SC-003, spec.md Scenario 11) driving WP05's fixture/example
 * deliverables through the real `SpecKittyProfileAdapter`.
 *
 * Every assertion here pins an EXACT vector (count, or exact kind/severity
 * multiset), never "at least" — a membership assertion is blind to a
 * fixture silently acquiring a second kind, or a checker returning `ok:
 * true` because it never ran a lint at all (spec.md Scenario 11). See this
 * WP's launch brief / WP05's Activity Log for the pinned-vector rationale.
 */

import { readdirSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createSpecKittyProfileAdapter, type AdapterResult, type SkProfileFinding } from "../../src/adapters/spec-kitty-profile/index.js";
import { loadSkProfileManifest, resolveSkProfileManifestPaths, type SkProfileManifest } from "../../src/adapters/spec-kitty-profile/manifest.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

async function runFixtureManifest(relativePath: string): Promise<AdapterResult> {
  const absManifestPath = resolvePath(repoRoot, relativePath);
  const raw = await loadSkProfileManifest(absManifestPath);
  const manifest = resolveSkProfileManifestPaths(raw as SkProfileManifest, dirname(absManifestPath));
  return createSpecKittyProfileAdapter().run(manifest);
}

/** `profileId:kind:severity` triples, sorted — an order-independent exact-multiset comparator. */
function findingSignatures(findings: readonly SkProfileFinding[]): string[] {
  return findings.map((f) => `${f.profileId}:${f.kind}:${f.severity}`).sort();
}

describe("fixtures/skprofile/broken-manifest.yaml — discrimination-control suite (SC-002/SC-003)", () => {
  it("rigs a *.agent.yaml file count of exactly 11 (independent of the finding assertions below)", () => {
    const brokenDir = resolvePath(repoRoot, "fixtures/skprofile/broken");
    const agentYamlFileCount = readdirSync(brokenDir, { withFileTypes: true }).filter(
      (entry) => entry.isFile() && entry.name.endsWith(".agent.yaml")
    ).length;
    expect(agentYamlFileCount).toBe(11);
  });

  it("reports ok: false with EXACTLY 13 findings (12 error, 1 warning)", async () => {
    const result = await runFixtureManifest("fixtures/skprofile/broken-manifest.yaml");
    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(13);
    expect(result.findings.filter((f) => f.severity === "error")).toHaveLength(12);
    expect(result.findings.filter((f) => f.severity === "warning")).toHaveLength(1);
  });

  it("produces the EXACT (profileId, kind, severity) multiset pinned by WP05's remediation header", async () => {
    const result = await runFixtureManifest("fixtures/skprofile/broken-manifest.yaml");

    // Per WP05's broken-manifest.yaml header table. Two DELIBERATE, DOCUMENTED
    // multi-kind vectors are pinned exactly, not just "at least":
    //   - "Illegal_ID" (profile-id-illegal-charset.agent.yaml): a muster-
    //     charset violation is ALSO an upstream-schema-pattern violation, and
    //     the fileNameStem != profileId, so all three lints fire on one
    //     profile: profile-id-illegal + profile-id-filename-mismatch +
    //     schema-conformance-violation.
    //   - "collision-a" (the shared profileId of collision-a.agent.yaml +
    //     collision-b.agent.yaml): two files sharing one id both trip
    //     profile-id-collision, and the second file's stem ("collision-b")
    //     mismatches the shared id "collision-a" once.
    const expected = [
      "asymmetric-a:handoff-asymmetric:warning",
      "collision-a:profile-id-collision:error",
      "collision-a:profile-id-collision:error",
      "collision-a:profile-id-filename-mismatch:error",
      "context-source-missing:context-source-missing:error",
      "dangling-handoff:handoff-unresolved:error",
      "Illegal_ID:profile-id-illegal:error",
      "Illegal_ID:profile-id-filename-mismatch:error",
      "Illegal_ID:schema-conformance-violation:error",
      "id-filename-mismatched:profile-id-filename-mismatch:error",
      "profile-id-length-ceiling-fixture-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx:profile-id-illegal:error",
      "schema-violation:schema-conformance-violation:error",
      "unresolvable-reference:reference-unresolved:error",
    ].sort();

    expect(findingSignatures(result.findings)).toEqual(expected);
  });

  it("still contains every literally-named quickstart.md §4 discrimination-control kind", async () => {
    const result = await runFixtureManifest("fixtures/skprofile/broken-manifest.yaml");
    const kinds = new Set(result.findings.map((f) => f.kind));
    expect(kinds.has("handoff-unresolved")).toBe(true);
    expect(kinds.has("reference-unresolved")).toBe(true);
    expect(kinds.has("profile-id-filename-mismatch")).toBe(true);
  });
});

describe("fixtures/skprofile/manifest.yaml — clean-ish discrimination control (ok: true, non-zero warnings)", () => {
  it("reports ok: true with EXACTLY 2 reference-not-activated warnings and zero errors", async () => {
    const result = await runFixtureManifest("fixtures/skprofile/manifest.yaml");
    expect(result.ok).toBe(true);
    expect(result.findings.filter((f) => f.severity === "error")).toHaveLength(0);
    expect(result.findings.filter((f) => f.kind === "reference-not-activated")).toHaveLength(2);
    expect(result.findings).toHaveLength(2);
  });
});

describe("examples/skprofile/manifest.yaml — the guaranteed fully-clean run (AC-1, Scenario 9)", () => {
  it("rigs a *.agent.yaml file count of exactly 2 (independent of the finding assertions below — HIGH-3: without this guard, deleting every profile also trivially satisfies findings.length === 0)", () => {
    const profilesDir = resolvePath(repoRoot, "examples/skprofile/profiles");
    const agentYamlFileCount = readdirSync(profilesDir, { withFileTypes: true }).filter(
      (entry) => entry.isFile() && entry.name.endsWith(".agent.yaml")
    ).length;
    expect(agentYamlFileCount).toBe(2);
  });

  it("reports findings.length === 0 (not merely ok: true), across exactly 2 profiles", async () => {
    const result = await runFixtureManifest("examples/skprofile/manifest.yaml");
    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(0);
    expect(result.summary).toContain("across 2 profile(s)");
  });
});

describe("fixtures/skprofile/broken-projection-manifest.yaml — isolated FR-007 discrimination control", () => {
  it("reports EXACTLY 2 findings: projection-output-missing(error) + projection-hash-drift(warning)", async () => {
    const result = await runFixtureManifest("fixtures/skprofile/broken-projection-manifest.yaml");
    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(2);
    expect(findingSignatures(result.findings)).toEqual(
      [
        "projection-hash-drift:projection-hash-drift:warning",
        "projection-output-missing:projection-output-missing:error",
      ].sort()
    );
  });
});

describe("fixtures/skprofile/broken-activation-manifest.yaml — isolated §4.3 discrimination control", () => {
  it("reports EXACTLY 1 activation-config-unrecognized-shape warning, ok: true", async () => {
    const result = await runFixtureManifest("fixtures/skprofile/broken-activation-manifest.yaml");
    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      kind: "activation-config-unrecognized-shape",
      severity: "warning",
    });
  });
});
