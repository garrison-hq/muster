/**
 * references.test.ts — WP02 T009/T012: `references.ts` (FR-004) unit
 * coverage. Uses a real `mkdtemp` doctrine tree on disk plus an inline
 * activation-config YAML file.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkReferences, resolveDoctrineFile } from "../../src/adapters/spec-kitty-profile/references.js";
import type { AgentProfile } from "../../src/adapters/spec-kitty-profile/profile.js";

const tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skprofile-references-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function buildDoctrineTree(root: string): Promise<void> {
  await mkdir(join(root, "directives", "built-in"), { recursive: true });
  await mkdir(join(root, "tactics", "built-in", "architecture"), { recursive: true });
  await mkdir(join(root, "toolguides", "built-in"), { recursive: true });
  await mkdir(join(root, "styleguides", "built-in"), { recursive: true });
  await writeFile(
    join(root, "directives", "built-in", "001-architectural-integrity-standard.directive.yaml"),
    "id: 001-architectural-integrity-standard\n"
  );
  await writeFile(
    join(root, "tactics", "built-in", "architecture", "development-bdd.tactic.yaml"),
    "id: development-bdd\n"
  );
  await writeFile(join(root, "toolguides", "built-in", "contextive.toolguide.yaml"), "id: contextive\n");
  await writeFile(join(root, "styleguides", "built-in", "prose.styleguide.yaml"), "id: prose\n");
}

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

describe("resolveDoctrineFile", () => {
  it("resolves a directive code by filename prefix match", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    expect(resolveDoctrineFile(root, "directive", "001")).toBe(true);
    expect(resolveDoctrineFile(root, "directive", "999")).toBe(false);
  });

  it("resolves a tactic id by exact filename-stem match, recursively", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    expect(resolveDoctrineFile(root, "tactic", "development-bdd")).toBe(true);
    expect(resolveDoctrineFile(root, "tactic", "nonexistent-tactic")).toBe(false);
  });

  it("resolves toolguide and styleguide ids by exact filename-stem match", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    expect(resolveDoctrineFile(root, "toolguide", "contextive")).toBe(true);
    expect(resolveDoctrineFile(root, "styleguide", "prose")).toBe(true);
    expect(resolveDoctrineFile(root, "toolguide", "missing")).toBe(false);
  });

  it("returns false (never throws) when the relevant doctrine subtree does not exist on disk", async () => {
    const root = await makeTmpDir();
    // No buildDoctrineTree call — <root>/directives never gets created.
    expect(resolveDoctrineFile(root, "directive", "001")).toBe(false);
  });
});

describe("doctrine file listing cache — per-call scoping, not process-global", () => {
  it("a listing computed before a file is added does not mask that file once a new run begins", async () => {
    const root = await makeTmpDir();
    await mkdir(join(root, "directives", "built-in"), { recursive: true });

    // "Run 1": nothing on disk yet for this code — resolves false, and (with
    // the old module-global cache) would have poisoned every future lookup
    // for this doctrineRoot/kind pair with an empty listing forever.
    const p = profile({ profileId: "architect-alphonso", directiveRefs: ["002"] });
    const firstRun = await checkReferences([p], root);
    expect(firstRun.map((f) => f.kind)).toEqual(["reference-unresolved"]);

    // The file now appears on disk (e.g. a later fixture setup step, or a
    // concurrent test against the same tmp root).
    await writeFile(
      join(root, "directives", "built-in", "002-second-directive.directive.yaml"),
      "id: 002-second-directive\n"
    );

    // "Run 2": a fresh call must not reuse run 1's (now-stale) listing.
    const secondRun = await checkReferences([p], root);
    expect(secondRun).toEqual([]);
  });

  it("resolveDoctrineFile's default per-call cache does not leak across independent calls", async () => {
    const root = await makeTmpDir();
    await mkdir(join(root, "directives", "built-in"), { recursive: true });

    expect(resolveDoctrineFile(root, "directive", "003")).toBe(false);

    await writeFile(
      join(root, "directives", "built-in", "003-third-directive.directive.yaml"),
      "id: 003-third-directive\n"
    );

    expect(resolveDoctrineFile(root, "directive", "003")).toBe(true);
  });
});

describe("checkReferences — doctrineRoot itself must exist", () => {
  it("throws when doctrineRoot does not exist on disk at all (never silently returns zero findings)", async () => {
    const root = await makeTmpDir();
    const missingDoctrineRoot = join(root, "does-not-exist");
    const p = profile({ profileId: "architect-alphonso", directiveRefs: ["001"] });
    await expect(checkReferences([p], missingDoctrineRoot)).rejects.toThrow(/doctrineRoot/);
  });

  it("throws when doctrineRoot exists but is a file, not a directory", async () => {
    const root = await makeTmpDir();
    const doctrineRootFile = join(root, "not-a-directory");
    await writeFile(doctrineRootFile, "not a directory\n");
    const p = profile({ profileId: "architect-alphonso", directiveRefs: ["001"] });
    await expect(checkReferences([p], doctrineRootFile)).rejects.toThrow(/doctrineRoot/);
  });
});

describe("checkReferences — stage 1: on-disk existence", () => {
  it("a resolvable directive code passes stage 1 with no finding", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    const p = profile({ profileId: "architect-alphonso", directiveRefs: ["001"] });
    const findings = await checkReferences([p], root);
    expect(findings).toEqual([]);
  });

  it("an unresolvable directive code produces reference-unresolved (error)", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    const p = profile({ profileId: "architect-alphonso", directiveRefs: ["999"] });
    const findings = await checkReferences([p], root);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "reference-unresolved",
      path: "directive-references[0].code",
      severity: "error",
    });
    expect(findings[0]?.source.normative).toContain("§4.1");
  });

  it("an unresolvable tactic id produces reference-unresolved (error)", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    const p = profile({ profileId: "architect-alphonso", tacticRefs: ["ghost-tactic"] });
    const findings = await checkReferences([p], root);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.path).toBe("tactic-references[0].id");
  });

  it("a resolvable toolguideRefs/styleguideRefs entry passes stage-1 resolution", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    const p = profile({ profileId: "architect-alphonso", toolguideRefs: ["contextive"], styleguideRefs: ["prose"] });
    const findings = await checkReferences([p], root);
    expect(findings).toEqual([]);
  });

  it("an unresolvable toolguideRefs/styleguideRefs entry produces reference-unresolved", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    const p = profile({
      profileId: "architect-alphonso",
      toolguideRefs: ["ghost-toolguide"],
      styleguideRefs: ["ghost-styleguide"],
    });
    const findings = await checkReferences([p], root);
    expect(findings.map((f) => f.kind)).toEqual(["reference-unresolved", "reference-unresolved"]);
    expect(findings.map((f) => f.path)).toEqual(["toolguide-references[0].id", "styleguide-references[0].id"]);
  });
});

describe("checkReferences — stage 2: activation gating", () => {
  it("without an activation config, an inactive-in-reality directive still resolves cleanly with no reference-not-activated finding", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    const p = profile({ profileId: "architect-alphonso", directiveRefs: ["001"] });
    const findings = await checkReferences([p], root);
    expect(findings).toEqual([]);
  });

  it("with an activation config, a resolvable-but-inactive directive produces reference-not-activated (warning)", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    const activationPath = join(root, "activation.yaml");
    await writeFile(activationPath, "activated_directives: []\nactivated_tactics: []\n");
    const p = profile({ profileId: "architect-alphonso", directiveRefs: ["001"] });
    const findings = await checkReferences([p], root, activationPath);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "reference-not-activated",
      severity: "warning",
      path: "directive-references[0].code",
    });
  });

  it("an activated directive (matched by slug prefix) produces no reference-not-activated finding", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    const activationPath = join(root, "activation.yaml");
    await writeFile(
      activationPath,
      "activated_directives:\n  - 001-architectural-integrity-standard\nactivated_tactics: []\n"
    );
    const p = profile({ profileId: "architect-alphonso", directiveRefs: ["001"] });
    const findings = await checkReferences([p], root, activationPath);
    expect(findings).toEqual([]);
  });

  it("an activated tactic (matched by exact id) produces no reference-not-activated finding", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    const activationPath = join(root, "activation.yaml");
    await writeFile(activationPath, "activated_directives: []\nactivated_tactics:\n  - development-bdd\n");
    const p = profile({ profileId: "architect-alphonso", tacticRefs: ["development-bdd"] });
    const findings = await checkReferences([p], root, activationPath);
    expect(findings).toEqual([]);
  });

  it("emits exactly one activation-config-unrecognized-shape finding, regardless of profile/reference count", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    const activationPath = join(root, "activation.yaml");
    await writeFile(activationPath, "unrelated_key: true\n");
    const a = profile({ profileId: "architect-alphonso", directiveRefs: ["001"], tacticRefs: ["development-bdd"] });
    const b = profile({ profileId: "planner-priti", directiveRefs: ["001"], tacticRefs: ["development-bdd"] });
    const findings = await checkReferences([a, b], root, activationPath);
    const shapeFindings = findings.filter((f) => f.kind === "activation-config-unrecognized-shape");
    expect(shapeFindings).toHaveLength(1);
    expect(shapeFindings[0]).toMatchObject({
      profileId: "(manifest)",
      path: "activationConfigPath",
      severity: "warning",
    });
    // Degrades gracefully to "no reference is activated" — every resolved
    // directive/tactic reference across both profiles is reported inactive.
    const inactive = findings.filter((f) => f.kind === "reference-not-activated");
    expect(inactive).toHaveLength(4);
  });
});
