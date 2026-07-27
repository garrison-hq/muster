/**
 * manifest.test.ts — WP01 T005: `manifest.ts` (T002) and `profile.ts` (T003)
 * unit coverage.
 *
 * `fixtures/skprofile/` does not exist yet (WP05's deliverable) — every
 * fixture here is constructed inline or under `node:fs/promises.mkdtemp`, so
 * this suite has no forward reference to a path this WP must not create.
 */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  compareStrings,
  loadSkProfileManifest,
  resolveSkProfileManifestPaths,
  validateManifest,
  type SkProfileManifest,
} from "../../src/adapters/spec-kitty-profile/manifest.js";
import { loadAgentProfile, loadProfileSet } from "../../src/adapters/spec-kitty-profile/profile.js";

const tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skprofile-manifest-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function baseManifest(overrides: Partial<SkProfileManifest> = {}): SkProfileManifest {
  return {
    version: "1.0.0",
    profilesDir: "./profiles",
    schemaPath: "./schema.yaml",
    schemaSha: "abc1234",
    doctrineRoot: "./doctrine",
    cases: [{ id: "all-profiles" }],
    ...overrides,
  };
}

describe("compareStrings", () => {
  it("orders by UTF-16 code unit, never localeCompare", () => {
    expect(compareStrings("a", "b")).toBe(-1);
    expect(compareStrings("b", "a")).toBe(1);
    expect(compareStrings("a", "a")).toBe(0);
  });
});

describe("resolveSkProfileManifestPaths", () => {
  it("resolves profilesDir/schemaPath/doctrineRoot relative to the manifest file's directory, not process.cwd()", async () => {
    const manifestDir = await makeTmpDir();
    const raw = baseManifest({
      profilesDir: "profiles",
      schemaPath: "schema.yaml",
      doctrineRoot: "doctrine",
    });

    const resolved = resolveSkProfileManifestPaths(raw, manifestDir);

    expect(resolved.profilesDir).toBe(join(manifestDir, "profiles"));
    expect(resolved.schemaPath).toBe(join(manifestDir, "schema.yaml"));
    expect(resolved.doctrineRoot).toBe(join(manifestDir, "doctrine"));
    // The manifestDir lives outside the repo root (a tmpdir), proving
    // resolution is not accidentally anchored to process.cwd() (the repo root).
    expect(manifestDir.startsWith(process.cwd())).toBe(false);
  });

  it("leaves optional activationConfigPath/projectionManifestPath undefined when absent", async () => {
    const manifestDir = await makeTmpDir();
    const resolved = resolveSkProfileManifestPaths(baseManifest(), manifestDir);
    expect(resolved.activationConfigPath).toBeUndefined();
    expect(resolved.projectionManifestPath).toBeUndefined();
  });

  it("resolves activationConfigPath/projectionManifestPath when present", async () => {
    const manifestDir = await makeTmpDir();
    const resolved = resolveSkProfileManifestPaths(
      baseManifest({
        activationConfigPath: "activation.yaml",
        projectionManifestPath: "projection.json",
      }),
      manifestDir
    );
    expect(resolved.activationConfigPath).toBe(join(manifestDir, "activation.yaml"));
    expect(resolved.projectionManifestPath).toBe(join(manifestDir, "projection.json"));
  });

  it("leaves an already-absolute profilesDir/schemaPath/doctrineRoot untouched", async () => {
    const manifestDir = await makeTmpDir();
    const absoluteProfilesDir = join(manifestDir, "already", "absolute", "profiles");
    const raw = baseManifest({
      profilesDir: absoluteProfilesDir,
      schemaPath: absoluteProfilesDir + "/schema.yaml",
      doctrineRoot: absoluteProfilesDir + "/doctrine",
    });

    const resolved = resolveSkProfileManifestPaths(raw, manifestDir);

    expect(resolved.profilesDir).toBe(absoluteProfilesDir);
    expect(resolved.schemaPath).toBe(absoluteProfilesDir + "/schema.yaml");
    expect(resolved.doctrineRoot).toBe(absoluteProfilesDir + "/doctrine");
  });

  it("leaves schemaSha and cases[].id/profileId untouched (not paths)", async () => {
    const manifestDir = await makeTmpDir();
    const raw = baseManifest({ cases: [{ id: "one", profileId: "architect-alphonso" }] });
    const resolved = resolveSkProfileManifestPaths(raw, manifestDir);
    expect(resolved.schemaSha).toBe("abc1234");
    expect(resolved.cases).toEqual([{ id: "one", profileId: "architect-alphonso" }]);
  });
});

describe("validateManifest", () => {
  it("throws on empty cases[]", () => {
    const manifest = baseManifest({ cases: [] });
    expect(() => validateManifest(manifest, [])).toThrow(/non-empty/);
  });

  it("throws on duplicate case.id", () => {
    const manifest = baseManifest({ cases: [{ id: "dup" }, { id: "dup" }] });
    expect(() => validateManifest(manifest, [])).toThrow(/duplicate case\.id/);
  });

  it("throws when case.profileId names a profile not present in profileIds", () => {
    const manifest = baseManifest({ cases: [{ id: "one", profileId: "ghost-profile" }] });
    expect(() => validateManifest(manifest, ["architect-alphonso"])).toThrow(/unknown profileId/);
  });

  it("validates cleanly for a well-formed manifest with one case and no optional paths", () => {
    const manifest = baseManifest({ cases: [{ id: "one", profileId: "architect-alphonso" }] });
    expect(() => validateManifest(manifest, ["architect-alphonso"])).not.toThrow();
  });

  it("validates cleanly with multiple distinct, non-duplicate case ids", () => {
    const manifest = baseManifest({
      cases: [{ id: "alpha", profileId: "architect-alphonso" }, { id: "beta" }, { id: "gamma" }],
    });
    expect(() => validateManifest(manifest, ["architect-alphonso"])).not.toThrow();
  });

  it("validates cleanly when a case omits profileId (whole-set filter)", () => {
    const manifest = baseManifest({ cases: [{ id: "all-profiles" }] });
    expect(() => validateManifest(manifest, ["architect-alphonso", "planner-priti"])).not.toThrow();
  });
});

describe("loadSkProfileManifest", () => {
  it("reads and parses a YAML manifest file", async () => {
    const manifestDir = await makeTmpDir();
    const manifestPath = join(manifestDir, "manifest.yaml");
    await writeFile(
      manifestPath,
      [
        'version: "1.0.0"',
        "profilesDir: profiles",
        "schemaPath: schema.yaml",
        "schemaSha: abc1234",
        "doctrineRoot: doctrine",
        "cases:",
        "  - id: all-profiles",
      ].join("\n"),
      "utf-8"
    );

    const raw = await loadSkProfileManifest(manifestPath);
    expect(raw).toMatchObject({ version: "1.0.0", profilesDir: "profiles", schemaSha: "abc1234" });
  });

  it("throws a plain Error when the manifest file does not exist", async () => {
    const manifestDir = await makeTmpDir();
    await expect(loadSkProfileManifest(join(manifestDir, "missing.yaml"))).rejects.toThrow();
  });

  it("throws a plain Error when the manifest file does not parse", async () => {
    const manifestDir = await makeTmpDir();
    const manifestPath = join(manifestDir, "broken.yaml");
    // Unbalanced flow-mapping brace — invalid YAML.
    await writeFile(manifestPath, "cases: [ { id: \n", "utf-8");
    await expect(loadSkProfileManifest(manifestPath)).rejects.toThrow();
  });
});

describe("loadAgentProfile", () => {
  it("parses a valid profile with roles (array), collaboration, and reference fields", async () => {
    const dir = await makeTmpDir();
    const filePath = join(dir, "architect-alphonso.agent.yaml");
    await writeFile(
      filePath,
      [
        "profile-id: architect-alphonso",
        "roles:",
        "  - architect",
        "collaboration:",
        "  handoff-to:",
        "    - planner",
        "    - implementer",
        "  handoff-from:",
        "    - reviewer",
        "  works-with:",
        "    - implementer",
        "directive-references:",
        "  - code: '001'",
        "    name: Architectural Integrity",
        "    rationale: because",
        "tactic-references:",
        "  - id: development-bdd",
        "    rationale: because",
        "context-sources:",
        "  directives:",
        "    - '001'",
        "  tactics:",
        "    - development-bdd",
      ].join("\n"),
      "utf-8"
    );

    const profile = await loadAgentProfile(filePath);

    expect(profile.parseError).toBeUndefined();
    expect(profile.fileNameStem).toBe("architect-alphonso");
    expect(profile.profileId).toBe("architect-alphonso");
    expect(profile.roles).toEqual(["architect"]);
    expect(profile.handoffTo).toEqual(["planner", "implementer"]);
    expect(profile.handoffFrom).toEqual(["reviewer"]);
    expect(profile.worksWith).toEqual(["implementer"]);
    expect(profile.directiveRefs).toEqual(["001"]);
    expect(profile.tacticRefs).toEqual(["development-bdd"]);
    expect(profile.contextSources.directives).toEqual(["001"]);
    expect(profile.contextSources.tactics).toEqual(["development-bdd"]);
  });

  it("folds a scalar `role` field into a 1-element roles array when `roles` is absent", async () => {
    const dir = await makeTmpDir();
    const filePath = join(dir, "solo.agent.yaml");
    await writeFile(filePath, "profile-id: solo\nrole: implementer\n", "utf-8");

    const profile = await loadAgentProfile(filePath);

    expect(profile.roles).toEqual(["implementer"]);
  });

  it("prefers `roles` (array) over `role` (scalar) when both are present", async () => {
    const dir = await makeTmpDir();
    const filePath = join(dir, "both.agent.yaml");
    await writeFile(
      filePath,
      "profile-id: both\nrole: legacy-role\nroles:\n  - primary\n  - secondary\n",
      "utf-8"
    );

    const profile = await loadAgentProfile(filePath);

    expect(profile.roles).toEqual(["primary", "secondary"]);
  });

  it("resolves every handoff/reference/context-source list to [] when no collaboration block exists", async () => {
    const dir = await makeTmpDir();
    const filePath = join(dir, "bare.agent.yaml");
    await writeFile(filePath, "profile-id: bare\nroles:\n  - reviewer\n", "utf-8");

    const profile = await loadAgentProfile(filePath);

    expect(profile.handoffTo).toEqual([]);
    expect(profile.handoffFrom).toEqual([]);
    expect(profile.worksWith).toEqual([]);
    expect(profile.directiveRefs).toEqual([]);
    expect(profile.tacticRefs).toEqual([]);
    expect(profile.toolguideRefs).toEqual([]);
    expect(profile.styleguideRefs).toEqual([]);
    expect(profile.contextSources).toEqual({
      directives: [],
      tactics: [],
      toolguides: [],
      styleguides: [],
    });
  });

  it("returns parseError (never throws) for syntactically invalid YAML, with fileNameStem still computed", async () => {
    const dir = await makeTmpDir();
    const filePath = join(dir, "invalid.agent.yaml");
    await writeFile(filePath, "profile-id: [unterminated\n", "utf-8");

    const profile = await loadAgentProfile(filePath);

    expect(profile.parseError).toBeDefined();
    expect(profile.fileNameStem).toBe("invalid");
    expect(profile.profileId).toBe("");
    expect(profile.roles).toEqual([]);
  });

  it("returns profileId \"\" when profile-id is absent or not a string", async () => {
    const dir = await makeTmpDir();
    const filePath = join(dir, "no-id.agent.yaml");
    await writeFile(filePath, "roles:\n  - reviewer\n", "utf-8");

    const profile = await loadAgentProfile(filePath);

    expect(profile.profileId).toBe("");
  });

  it("returns profileId \"\" when profile-id is present but not a string", async () => {
    const dir = await makeTmpDir();
    const filePath = join(dir, "wrong-type-id.agent.yaml");
    await writeFile(filePath, "profile-id: 12345\nroles:\n  - reviewer\n", "utf-8");

    const profile = await loadAgentProfile(filePath);

    expect(profile.profileId).toBe("");
  });

  it("treats a wrong-typed collaboration block (not an object) as absent", async () => {
    const dir = await makeTmpDir();
    const filePath = join(dir, "bad-collab.agent.yaml");
    await writeFile(filePath, "profile-id: bad-collab\nroles:\n  - reviewer\ncollaboration: not-an-object\n", "utf-8");

    const profile = await loadAgentProfile(filePath);

    expect(profile.handoffTo).toEqual([]);
    expect(profile.handoffFrom).toEqual([]);
    expect(profile.worksWith).toEqual([]);
  });

  it("extracts toolguideRefs/styleguideRefs and their context-sources counterparts, ignoring malformed reference entries", async () => {
    const dir = await makeTmpDir();
    const filePath = join(dir, "full-refs.agent.yaml");
    await writeFile(
      filePath,
      [
        "profile-id: full-refs",
        "roles:",
        "  - implementer",
        "toolguide-references:",
        "  - id: contextive",
        "    rationale: because",
        "  - rationale: missing id, must be ignored",
        "  - not-an-object-entry",
        "styleguide-references:",
        "  - id: repo-style",
        "    rationale: because",
        "context-sources:",
        "  toolguides:",
        "    - contextive",
        "  styleguides:",
        "    - repo-style",
      ].join("\n"),
      "utf-8"
    );

    const profile = await loadAgentProfile(filePath);

    expect(profile.toolguideRefs).toEqual(["contextive"]);
    expect(profile.styleguideRefs).toEqual(["repo-style"]);
    expect(profile.contextSources.toolguides).toEqual(["contextive"]);
    expect(profile.contextSources.styleguides).toEqual(["repo-style"]);
  });

  it("resolves roles to [] when neither `role` nor `roles` is present", async () => {
    const dir = await makeTmpDir();
    const filePath = join(dir, "no-role.agent.yaml");
    await writeFile(filePath, "profile-id: no-role\n", "utf-8");

    const profile = await loadAgentProfile(filePath);

    expect(profile.roles).toEqual([]);
  });

  it("returns [] for directive-references/tactic-references that are present but not an array", async () => {
    const dir = await makeTmpDir();
    const filePath = join(dir, "wrong-type-refs.agent.yaml");
    await writeFile(
      filePath,
      "profile-id: wrong-type-refs\nroles:\n  - reviewer\ndirective-references: not-an-array\n",
      "utf-8"
    );

    const profile = await loadAgentProfile(filePath);

    expect(profile.directiveRefs).toEqual([]);
  });
});

describe("loadProfileSet", () => {
  it("loads every *.agent.yaml file non-recursively, sorted by fileNameStem (UTF-16, byte-stable)", async () => {
    const dir = await makeTmpDir();
    // Deliberately created out of sort order, and with a non-matching file
    // that must be ignored.
    await writeFile(join(dir, "zulu.agent.yaml"), "profile-id: zulu\nroles:\n  - reviewer\n", "utf-8");
    await writeFile(join(dir, "alpha.agent.yaml"), "profile-id: alpha\nroles:\n  - architect\n", "utf-8");
    await writeFile(join(dir, "mid.agent.yaml"), "profile-id: mid\nroles:\n  - planner\n", "utf-8");
    await writeFile(join(dir, "README.md"), "not a profile", "utf-8");
    await mkdir(join(dir, "subdir"));
    await writeFile(
      join(dir, "subdir", "nested.agent.yaml"),
      "profile-id: nested\nroles:\n  - implementer\n",
      "utf-8"
    );

    const profiles = await loadProfileSet(dir);

    expect(profiles.map((p) => p.fileNameStem)).toEqual(["alpha", "mid", "zulu"]);
  });
});
