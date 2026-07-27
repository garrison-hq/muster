/**
 * context-sources.test.ts — WP02 T010/T012: `context-sources.ts` (FR-005)
 * unit coverage. Reuses the same `mkdtemp` doctrine-tree pattern as
 * `references.test.ts`.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkContextSources } from "../../src/adapters/spec-kitty-profile/context-sources.js";
import type { AgentProfile } from "../../src/adapters/spec-kitty-profile/profile.js";

const tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skprofile-context-sources-test-"));
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

describe("checkContextSources", () => {
  it("all four context-sources kinds resolving cleanly produces no findings", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    const p = profile({
      profileId: "architect-alphonso",
      contextSources: {
        directives: ["001"],
        tactics: ["development-bdd"],
        toolguides: ["contextive"],
        styleguides: ["prose"],
      },
    });
    expect(checkContextSources([p], root)).toEqual([]);
  });

  it("a missing directives context-source produces context-source-missing (error)", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    const p = profile({
      profileId: "architect-alphonso",
      contextSources: { directives: ["999"], tactics: [], toolguides: [], styleguides: [] },
    });
    const findings = checkContextSources([p], root);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "context-source-missing",
      path: "context-sources.directives[0]",
      severity: "error",
    });
    expect(findings[0]?.source.normative).toContain("§5.1");
  });

  it("a missing tactics context-source produces context-source-missing", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    const p = profile({
      profileId: "architect-alphonso",
      contextSources: { directives: [], tactics: ["ghost-tactic"], toolguides: [], styleguides: [] },
    });
    const findings = checkContextSources([p], root);
    expect(findings[0]?.path).toBe("context-sources.tactics[0]");
  });

  it("a missing toolguides context-source produces context-source-missing", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    const p = profile({
      profileId: "architect-alphonso",
      contextSources: { directives: [], tactics: [], toolguides: ["ghost-toolguide"], styleguides: [] },
    });
    const findings = checkContextSources([p], root);
    expect(findings[0]?.path).toBe("context-sources.toolguides[0]");
  });

  it("a missing styleguides context-source produces context-source-missing", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    const p = profile({
      profileId: "architect-alphonso",
      contextSources: { directives: [], tactics: [], toolguides: [], styleguides: ["ghost-styleguide"] },
    });
    const findings = checkContextSources([p], root);
    expect(findings[0]?.path).toBe("context-sources.styleguides[0]");
  });

  it("never activation-gates — context-sources has no warning tier, only missing-is-error", async () => {
    const root = await makeTmpDir();
    await buildDoctrineTree(root);
    const p = profile({
      profileId: "architect-alphonso",
      contextSources: {
        directives: ["001"],
        tactics: ["development-bdd"],
        toolguides: [],
        styleguides: [],
      },
    });
    const findings = checkContextSources([p], root);
    expect(findings.every((f) => f.severity === "error")).toBe(true);
    expect(findings.some((f) => f.kind === "reference-not-activated")).toBe(false);
  });
});
