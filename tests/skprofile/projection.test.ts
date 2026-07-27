/**
 * projection.test.ts — WP03 T014/T019: `projection.ts` (FR-007) unit
 * coverage.
 *
 * Two scenarios are the load-bearing ones this suite exists to pin:
 *  - matching is by `profile_urn`, NEVER `source_path` (research.md R5);
 *  - `loadProjectionManifest` resolves a relative `output_path` against the
 *    projection manifest's own parent directory's PARENT (rubric §7.2), not
 *    against the manifest's own directory the way every other path field in
 *    this adapter resolves — the "trap" this WP's launch brief calls out
 *    explicitly.
 */

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  checkProjectionDrift,
  loadProjectionManifest,
  type ProjectionEntry,
} from "../../src/adapters/spec-kitty-profile/projection.js";
import type { AgentProfile } from "../../src/adapters/spec-kitty-profile/profile.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function profile(overrides: Partial<AgentProfile> & { profileId: string; filePath: string }): AgentProfile {
  return {
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

function entry(overrides: Partial<ProjectionEntry> & { profile_urn: string; output_path: string }): ProjectionEntry {
  return {
    source_layer: "native",
    tool_key: "claude",
    format: "claude-agent",
    file_hash: "",
    source_path: "/machine-specific/wherever/the/projector/ran.agent.yaml",
    source_hash: "",
    projection_version: 1,
    ...overrides,
  };
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "muster-skprofile-projection-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("checkProjectionDrift", () => {
  it("returns [] immediately when entries is undefined (projectionManifestPath omitted)", () => {
    const p = profile({ profileId: "architect-alphonso", filePath: join(dir, "architect-alphonso.agent.yaml") });
    expect(checkProjectionDrift([p], undefined)).toEqual([]);
  });

  it("clean match: recomputed source_hash and file_hash both match recorded values — no finding", async () => {
    const sourcePath = join(dir, "architect-alphonso.agent.yaml");
    const outputPath = join(dir, "architect-alphonso.md");
    await writeFile(sourcePath, "profile-id: architect-alphonso\n", "utf-8");
    await writeFile(outputPath, "# Architect Alphonso\n", "utf-8");

    const p = profile({ profileId: "architect-alphonso", filePath: sourcePath });
    const e = entry({
      profile_urn: "agent_profile:architect-alphonso",
      output_path: outputPath,
      source_hash: sha256Hex("profile-id: architect-alphonso\n"),
      file_hash: sha256Hex("# Architect Alphonso\n"),
    });

    expect(checkProjectionDrift([p], [e])).toEqual([]);
  });

  it("matches by profile_urn, never by source_path (research.md R5)", async () => {
    const sourcePath = join(dir, "planner-priti.agent.yaml");
    const outputPath = join(dir, "planner-priti.md");
    await writeFile(sourcePath, "profile-id: planner-priti\n", "utf-8");
    await writeFile(outputPath, "# Planner Priti\n", "utf-8");

    const p = profile({ profileId: "planner-priti", filePath: sourcePath });
    // source_path is deliberately stale/machine-specific and does NOT equal
    // sourcePath — matching must still succeed via profile_urn alone.
    const e = entry({
      profile_urn: "agent_profile:planner-priti",
      output_path: outputPath,
      source_hash: sha256Hex("profile-id: planner-priti\n"),
      file_hash: sha256Hex("# Planner Priti\n"),
      source_path: "/home/someone-else/.local/share/uv/tools/spec-kitty-cli/lib/planner-priti.agent.yaml",
    });

    expect(checkProjectionDrift([p], [e])).toEqual([]);
  });

  it("no matching profile_urn entry at all -> projection-output-missing (error)", () => {
    const p = profile({ profileId: "no-entry", filePath: join(dir, "no-entry.agent.yaml") });
    const findings = checkProjectionDrift([p], []);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "projection-output-missing",
      profileId: "no-entry",
      path: "projectionManifestPath",
      severity: "error",
    });
    expect(findings[0]?.source.normative).toContain("§7.2");
  });

  it("matching entry whose output_path does not exist on disk -> projection-output-missing (error)", async () => {
    const sourcePath = join(dir, "missing-output.agent.yaml");
    await writeFile(sourcePath, "profile-id: missing-output\n", "utf-8");
    const p = profile({ profileId: "missing-output", filePath: sourcePath });
    const e = entry({
      profile_urn: "agent_profile:missing-output",
      output_path: join(dir, "does-not-exist.md"),
    });

    const findings = checkProjectionDrift([p], [e]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "projection-output-missing",
      profileId: "missing-output",
      severity: "error",
    });
  });

  it("hash drift on source_hash only -> projection-hash-drift (warning), message names source_hash", async () => {
    const sourcePath = join(dir, "drift-source.agent.yaml");
    const outputPath = join(dir, "drift-source.md");
    await writeFile(sourcePath, "profile-id: drift-source\n", "utf-8");
    await writeFile(outputPath, "# Drift Source\n", "utf-8");

    const p = profile({ profileId: "drift-source", filePath: sourcePath });
    const e = entry({
      profile_urn: "agent_profile:drift-source",
      output_path: outputPath,
      source_hash: "0".repeat(64),
      file_hash: sha256Hex("# Drift Source\n"),
    });

    const findings = checkProjectionDrift([p], [e]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "projection-hash-drift",
      profileId: "drift-source",
      severity: "warning",
    });
    expect(findings[0]?.message).toContain("source_hash");
    expect(findings[0]?.message).not.toContain("file_hash");
    expect(findings[0]?.source.normative).toContain("§7.3");
  });

  it("hash drift on file_hash only -> message names file_hash", async () => {
    const sourcePath = join(dir, "drift-file.agent.yaml");
    const outputPath = join(dir, "drift-file.md");
    await writeFile(sourcePath, "profile-id: drift-file\n", "utf-8");
    await writeFile(outputPath, "# Drift File\n", "utf-8");

    const p = profile({ profileId: "drift-file", filePath: sourcePath });
    const e = entry({
      profile_urn: "agent_profile:drift-file",
      output_path: outputPath,
      source_hash: sha256Hex("profile-id: drift-file\n"),
      file_hash: "0".repeat(64),
    });

    const findings = checkProjectionDrift([p], [e]);
    expect(findings[0]?.message).toContain("file_hash");
    expect(findings[0]?.message).not.toContain("source_hash and");
  });

  it("hash drift on both hashes -> message names both", async () => {
    const sourcePath = join(dir, "drift-both.agent.yaml");
    const outputPath = join(dir, "drift-both.md");
    await writeFile(sourcePath, "profile-id: drift-both\n", "utf-8");
    await writeFile(outputPath, "# Drift Both\n", "utf-8");

    const p = profile({ profileId: "drift-both", filePath: sourcePath });
    const e = entry({
      profile_urn: "agent_profile:drift-both",
      output_path: outputPath,
      source_hash: "0".repeat(64),
      file_hash: "1".repeat(64),
    });

    const findings = checkProjectionDrift([p], [e]);
    expect(findings[0]?.message).toContain("source_hash");
    expect(findings[0]?.message).toContain("file_hash");
  });

  it("skips profiles with parseError set — never re-hashed, never reported missing", () => {
    const p = profile({
      profileId: "",
      filePath: join(dir, "broken.agent.yaml"),
      parseError: "YAML syntax error",
    });
    expect(checkProjectionDrift([p], [])).toEqual([]);
  });
});

describe("loadProjectionManifest", () => {
  it("THE TRAP: resolves a relative output_path against the manifest's parent's parent (project root), not its own directory (rubric §7.2)", async () => {
    // Layout: <dir>/ is the "project root"; the projection manifest itself
    // lives one level down at <dir>/.kittify/agent_profiles_manifest.json,
    // and the relative output_path is declared relative to <dir>, not to
    // <dir>/.kittify.
    const kittifyDir = join(dir, ".kittify");
    await mkdir(kittifyDir, { recursive: true });
    const manifestPath = join(kittifyDir, "agent_profiles_manifest.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        entries: [
          {
            profile_urn: "agent_profile:architect-alphonso",
            source_layer: "native",
            tool_key: "claude",
            output_path: "./.claude/agents/architect-alphonso.md",
            format: "claude-agent",
            file_hash: "a".repeat(64),
            source_path: "/wherever",
            source_hash: "b".repeat(64),
            projection_version: 1,
          },
        ],
      }),
      "utf-8"
    );

    const { entries } = await loadProjectionManifest(manifestPath);
    expect(entries).toHaveLength(1);
    // Resolved against <dir> (project root) — NOT against <dir>/.kittify
    // (which the "intuitive" reading — resolve against the manifest's own
    // directory, like every other path field in this adapter — would give).
    expect(entries[0]?.output_path).toBe(join(dir, ".claude/agents/architect-alphonso.md"));
    expect(entries[0]?.output_path).not.toBe(join(kittifyDir, ".claude/agents/architect-alphonso.md"));
  });

  it("leaves an absolute output_path untouched", async () => {
    const kittifyDir = join(dir, ".kittify");
    await mkdir(kittifyDir, { recursive: true });
    const manifestPath = join(kittifyDir, "agent_profiles_manifest.json");
    const absoluteOutput = join(dir, "elsewhere", "architect-alphonso.md");
    await writeFile(
      manifestPath,
      JSON.stringify({
        entries: [
          {
            profile_urn: "agent_profile:architect-alphonso",
            source_layer: "native",
            tool_key: "claude",
            output_path: absoluteOutput,
            format: "claude-agent",
            file_hash: "a".repeat(64),
            source_path: "/wherever",
            source_hash: "b".repeat(64),
            projection_version: 1,
          },
        ],
      }),
      "utf-8"
    );

    const { entries } = await loadProjectionManifest(manifestPath);
    expect(entries[0]?.output_path).toBe(absoluteOutput);
  });

  it("throws a plain Error when the file cannot be read", async () => {
    await expect(loadProjectionManifest(join(dir, "does-not-exist.json"))).rejects.toThrow(/could not read/);
  });

  it("throws a plain Error when the file is not valid JSON", async () => {
    const manifestPath = join(dir, "bad.json");
    await writeFile(manifestPath, "{ not valid json", "utf-8");
    await expect(loadProjectionManifest(manifestPath)).rejects.toThrow(/could not parse/);
  });

  it("silently drops non-object entries (e.g. a stray string/null in the entries array)", async () => {
    const kittifyDir = join(dir, ".kittify");
    await mkdir(kittifyDir, { recursive: true });
    const manifestPath = join(kittifyDir, "agent_profiles_manifest.json");
    await writeFile(
      manifestPath,
      JSON.stringify({ entries: ["not-an-object", null, 42] }),
      "utf-8"
    );

    const { entries } = await loadProjectionManifest(manifestPath);
    expect(entries).toEqual([]);
  });

  it("returns [] when the top-level 'entries' key is absent or not an array", async () => {
    const manifestPath = join(dir, "no-entries-key.json");
    await writeFile(manifestPath, JSON.stringify({ schema_version: 1 }), "utf-8");
    const { entries } = await loadProjectionManifest(manifestPath);
    expect(entries).toEqual([]);
  });
});
