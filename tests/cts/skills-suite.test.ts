/**
 * CTS-style manifest runner for the Agent Skills fixture suite.
 *
 * Exercises the complete skills adapter end-to-end (FR-013, FR-014) by loading
 * fixtures/skills/skills-manifest.yaml and running every case through the
 * skills adapter pipeline.
 *
 * SC-002: per-rule coverage matrix — every static rule has ≥1 passing fixture
 *         AND ≥1 broken fixture that produces ok: false.
 * SC-004: discrimination control — mocked trigger runner returns zero triggers,
 *         asserts passed: false.
 * SC-006: byte-stable static output — two runs produce identical JSON.
 *
 * SC-005 (documented, not auto-tested):
 *   The behavioral suite is endpoint-agnostic by construction. The test code
 *   and fixture data are identical regardless of which endpoint is configured.
 *   Only MUSTER_BASE_URL / MUSTER_API_KEY / MUSTER_MODEL env vars change between
 *   runs against different endpoints. This ensures conformance results are
 *   endpoint-reproducible without modifying the suite itself (SC-005).
 *
 * Offline by construction for static cases (NFR-003): no network access in any
 * static test. Behavioral tests are gated on MUSTER_BASE_URL and skipped in
 * offline CI (SC-005).
 */

import { fileURLToPath } from "node:url";
import { join, resolve as resolvePath } from "node:path";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import { skillsAdapter } from "../../src/adapters/skills/index.js";
import { checkLayout } from "../../src/adapters/skills/layout.js";
import {
  runTriggerConformance,
  RIGGED_IMPOSSIBLE_DESCRIPTION,
} from "../../src/adapters/skills/trigger.js";
import type { TriggerChatClient } from "../../src/adapters/skills/trigger.js";
import type { SkillDocument, SkillProfile } from "../../src/adapters/skills/types.js";
import type { Violation } from "../../src/core/report.js";

// ─── Repo root + manifest paths ─────────────────────────────────────────────

// Resolve from THIS file's location (tests/cts/), not process.cwd().
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const manifestPath = join(repoRoot, "fixtures/skills/skills-manifest.yaml");

// ─── Manifest types ──────────────────────────────────────────────────────────

interface ExpectedViolation {
  path: string;
  severity: "error" | "warning";
}

interface StaticExpectations {
  ok: boolean;
  violations: ExpectedViolation[];
}

interface StaticManifestCase {
  id: string;
  type: "static";
  skillDir: string;
  profile: SkillProfile;
  expectations: StaticExpectations;
}

interface BehavioralManifestCase {
  id: string;
  type: "behavioral";
  skillDir: string;
  profile: SkillProfile;
  querySetPath: string;
  runsPerQuery: number;
  threshold: number;
  isControl: boolean;
}

type ManifestCase = StaticManifestCase | BehavioralManifestCase;

interface Manifest {
  cases: ManifestCase[];
}

// ─── Load manifest ───────────────────────────────────────────────────────────

const manifest = parseYaml(readFileSync(manifestPath, "utf8")) as Manifest;
const staticCases = manifest.cases.filter(
  (c): c is StaticManifestCase => c.type === "static"
);
const behavioralCases = manifest.cases.filter(
  (c): c is BehavioralManifestCase => c.type === "behavioral"
);

// ─── Static case runner ──────────────────────────────────────────────────────

/**
 * Run a single static manifest case: parse + validate + layout check.
 *
 * Combines violations from validateSkill (semantic rules) and checkLayout
 * (bundled-file drift check). Returns a deterministic result object.
 *
 * This function is called TWICE in the SC-006 byte-stability test to confirm
 * the pipeline is deterministic across runs (not testing a cached result).
 */
function runStaticCase(c: StaticManifestCase): {
  id: string;
  ok: boolean;
  violations: Violation[];
} {
  const absoluteSkillDir = resolvePath(repoRoot, c.skillDir);
  const doc: SkillDocument = skillsAdapter.parseSkill(absoluteSkillDir);
  const semanticViolations = skillsAdapter.validateSkill(doc, c.profile);
  const layoutViolations = checkLayout(doc);
  const allViolations = [...semanticViolations, ...layoutViolations];
  const hasError = allViolations.some((v) => v.severity === "error");
  const ok = !hasError;
  return { id: c.id, ok, violations: allViolations };
}

// ─── Static case suite ───────────────────────────────────────────────────────

describe("Skills CTS — static fixture suite (FR-013, FR-014)", () => {
  for (const c of staticCases) {
    it(`skills-cts: ${c.id}`, () => {
      const result = runStaticCase(c);

      // ok must match expectations
      expect(
        result.ok,
        `Case "${c.id}": expected ok=${c.expectations.ok} but got ok=${result.ok}.\nViolations: ${JSON.stringify(result.violations, null, 2)}`
      ).toBe(c.expectations.ok);

      // Every expected violation must have a matching actual violation
      for (const expected of c.expectations.violations) {
        const matched = result.violations.some(
          (actual) =>
            actual.path === expected.path && actual.severity === expected.severity
        );
        expect(
          matched,
          `Case "${c.id}": expected violation {path: "${expected.path}", severity: "${expected.severity}"} not found.\nActual violations: ${JSON.stringify(result.violations, null, 2)}`
        ).toBe(true);
      }
    });
  }
});

// ─── SC-002 rule coverage matrix ─────────────────────────────────────────────

describe("SC-002 coverage matrix — every static rule has ≥1 passing + ≥1 broken fixture", () => {
  /**
   * For each rule axis, identify which fixture IDs cover the passing case and
   * which cover the broken case. An assertion on each rule ensures that if a
   * fixture is accidentally removed, this test fails explicitly.
   *
   * This is an executable assertion — removing any rule's broken fixture causes
   * this test to fail. It is NOT a comment-only gate (reviewer requirement).
   */

  // Run all static cases up-front for matrix analysis.
  const results = staticCases.map(runStaticCase);
  const okById = new Map(results.map((r) => [r.id, r.ok]));

  // Each entry: [ruleLabel, idOfPassingFixture, idOfBrokenFixture]
  const ruleMatrix: [string, string, string][] = [
    ["name-missing", "valid-minimal", "broken-name-missing"],
    ["name-too-long", "valid-minimal", "broken-name-too-long"],
    ["name-bad-charset", "valid-minimal", "broken-name-bad-charset"],
    ["name-leading-hyphen", "valid-minimal", "broken-name-leading-hyphen"],
    ["name-dir-mismatch", "valid-minimal", "broken-name-dir-mismatch"],
    ["description-missing", "valid-minimal", "broken-description-missing"],
    ["description-too-long", "valid-minimal", "broken-description-too-long"],
    ["metadata-bad-value", "valid-full-optional", "broken-metadata-bad-value"],
    [
      "bundled-file-missing",
      "valid-full-optional",
      "broken-bundled-file-missing",
    ],
    [
      "bundled-file-escape",
      "valid-full-optional",
      "broken-bundled-file-escape",
    ],
    [
      "anthropic-reserved-word",
      "valid-anthropic-profile-clean",
      "broken-anthropic-reserved-word",
    ],
    [
      "anthropic-xml-tag",
      "valid-anthropic-profile-clean",
      "broken-anthropic-xml-tag",
    ],
  ];

  for (const [rule, passingId, brokenId] of ruleMatrix) {
    it(`SC-002: rule "${rule}" — passing fixture "${passingId}" (ok=true) + broken fixture "${brokenId}" (ok=false)`, () => {
      const passingOk = okById.get(passingId);
      expect(
        passingOk,
        `SC-002 rule "${rule}": passing fixture "${passingId}" expected ok=true but got ok=${passingOk}`
      ).toBe(true);

      const brokenOk = okById.get(brokenId);
      expect(
        brokenOk,
        `SC-002 rule "${rule}": broken fixture "${brokenId}" expected ok=false but got ok=${brokenOk}`
      ).toBe(false);
    });
  }
});

// ─── SC-006 byte-stability assertion ─────────────────────────────────────────

describe("SC-006 byte-stable static output", () => {
  it("byte-stable static output: two runs produce identical JSON", () => {
    // Run the FULL static pipeline twice — this is NOT testing a cached result.
    // The point is to catch any non-determinism in the parse+validate+layout
    // pipeline (e.g. Set ordering, locale-dependent sort, timestamp injection).
    const run1 = staticCases.map((c) => JSON.stringify(runStaticCase(c)));
    const run2 = staticCases.map((c) => JSON.stringify(runStaticCase(c)));
    expect(run1).toEqual(run2);
  });
});

// ─── SC-004 discrimination control (static-mode analog) ──────────────────────

describe("SC-004 discrimination control — mocked trigger runner asserts passed: false", () => {
  it("discrimination control: mocked runner returning zero triggers → passed: false", async () => {
    /**
     * Static-mode analog for SC-004 (runs in all CI environments; no endpoint required).
     *
     * A TriggerChatClient mock that always returns null (no tool call) is
     * injected into runTriggerConformance with the rigged-impossible case from
     * the manifest. The should-trigger axis trigger rate = 0/N < threshold=0.5,
     * so the verdict must be passed: false.
     *
     * This proves the grader can produce a failure result — not just pass
     * (FR-012 discrimination control requirement, charter cap-of-zero pattern).
     *
     * NOTE: This test uses the rigged-impossible-queries from the manifest but
     * calls the trigger runner with a mock client — no real HTTP call is made.
     */
    const riggedQuerySetPath = resolvePath(
      repoRoot,
      "fixtures/skills/trigger-queries/rigged-impossible-queries.yaml"
    );
    const querySet = parseYaml(readFileSync(riggedQuerySetPath, "utf8")) as {
      id: string;
      source: string;
      shouldTrigger: string[];
      nearMiss: string[];
      threshold: number;
    };

    // Mocked client: always returns null (no tool call — zero triggers).
    const mockClient: TriggerChatClient = {
      async chatWithTools(_userMessage, _tools) {
        return null;
      },
    };

    const triggerCase = {
      id: "sc004-discrimination-control-analog",
      skillDir: "",
      profile: "base" as const,
      querySet: {
        id: querySet.id,
        source: querySet.source,
        shouldTrigger: querySet.shouldTrigger,
        nearMiss: querySet.nearMiss,
        threshold: querySet.threshold,
      },
      runsPerQuery: 1,
      tools: [
        {
          type: "function" as const,
          function: {
            name: "rigged-impossible-control",
            description: RIGGED_IMPOSSIBLE_DESCRIPTION,
          },
        },
      ],
      endpoint: {
        baseUrl: "http://localhost:0",
        model: "mock",
        apiKeyEnv: "MOCK_KEY",
      },
    };

    const verdict = await runTriggerConformance(triggerCase, mockClient);

    // Charter cap-of-zero: discrimination control MUST produce passed: false.
    expect(
      verdict.passed,
      "SC-004: discrimination control with mocked zero-trigger runner must produce passed: false"
    ).toBe(false);

    // Trigger rate should be exactly 0 (all runs return null).
    expect(verdict.shouldTriggerAxis.triggerRate).toBe(0);

    // The should-trigger axis must fail (rate 0 < threshold 0.5).
    expect(verdict.shouldTriggerAxis.passed).toBe(false);
  });
});

// ─── Behavioral cases (require MUSTER_BASE_URL) ───────────────────────────────

describe("Skills CTS — behavioral suite (require MUSTER_BASE_URL)", () => {
  /**
   * SC-005 (behavioral, endpoint-agnostic):
   *   The behavioral test code and fixture data are identical regardless of endpoint.
   *   Switching between endpoints only requires changing MUSTER_BASE_URL /
   *   MUSTER_API_KEY / MUSTER_MODEL. The suite itself is never modified.
   *
   * These tests are skipped in offline CI (MUSTER_BASE_URL not set).
   * Set MUSTER_BASE_URL to an OpenAI-compatible endpoint to run them.
   */

  for (const c of behavioralCases) {
    it.skipIf(!process.env["MUSTER_BASE_URL"])(
      `skills-behavioral: ${c.id}`,
      async () => {
        const { makeToolClient } = await import(
          "../../src/adapters/skills/trigger.js"
        );
        const { default: yamlPkg } = await import("yaml");
        const absoluteSkillDir = resolvePath(repoRoot, c.skillDir);
        const querySetAbsPath = resolvePath(repoRoot, c.querySetPath);

        const querySetRaw = parseYaml(
          readFileSync(querySetAbsPath, "utf8")
        ) as {
          id: string;
          source: string;
          shouldTrigger: string[];
          nearMiss: string[];
          threshold: number;
        };

        // Parse the skill to get its name/description for the tool payload.
        const doc = skillsAdapter.parseSkill(absoluteSkillDir);
        const fm = doc.frontmatter as Record<string, unknown>;

        // Override description with RIGGED_IMPOSSIBLE_DESCRIPTION for control cases.
        const toolDescription = c.isControl
          ? RIGGED_IMPOSSIBLE_DESCRIPTION
          : String(fm["description"] ?? "");

        const endpoint = {
          baseUrl: process.env["MUSTER_BASE_URL"]!,
          model: process.env["MUSTER_MODEL"] ?? "gpt-4o",
          apiKeyEnv: "MUSTER_API_KEY",
        };

        const client = makeToolClient(endpoint);
        const triggerCase = {
          id: c.id,
          skillDir: absoluteSkillDir,
          profile: c.profile,
          querySet: {
            id: querySetRaw.id,
            source: querySetRaw.source,
            shouldTrigger: querySetRaw.shouldTrigger,
            nearMiss: querySetRaw.nearMiss,
            threshold: c.threshold,
          },
          runsPerQuery: c.runsPerQuery,
          tools: [
            {
              type: "function" as const,
              function: {
                name: String(fm["name"] ?? "skill"),
                description: toolDescription,
              },
            },
          ],
          endpoint,
        };

        const verdict = await runTriggerConformance(triggerCase, client);

        if (c.isControl) {
          // SC-004: discrimination control must fail (cap-of-zero).
          expect(
            verdict.passed,
            `SC-004: behavioral discrimination control "${c.id}" must produce passed: false`
          ).toBe(false);
        } else {
          expect(
            verdict.passed,
            `Behavioral case "${c.id}" failed: shouldTrigger rate=${verdict.shouldTriggerAxis.triggerRate}, nearMiss rate=${verdict.nearMissAxis.triggerRate}`
          ).toBe(true);
        }
        // void to silence unused-var lint
        void yamlPkg;
      }
    );
  }
});
