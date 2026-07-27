/**
 * index.ts — `SpecKittyProfileAdapter`: factory + whole-graph `run()`
 * orchestration (WP03 T015), tying every check module (WP01's schema
 * check, WP02's four lints, this WP's projection check) into one
 * `AdapterResult` per data-model.md's Flow section.
 *
 * Does not implement `SpecAdapter` (`src/core/adapter.ts`) — D1's
 * manifest-runner shape (factory + `run(manifest, options)` →
 * `AdapterResult`) applies here exactly as it does for
 * `memory-utilization`, not the Soul.md/RFC-1-specific `SpecAdapter`
 * contract.
 *
 * **Raw-YAML re-read, not a `profile.ts` touch**: schema conformance
 * (`schema.ts`) validates the *raw*, un-narrowed parsed YAML object, not
 * `profile.ts`'s narrowed `AgentProfile`. `profile.ts` is outside this WP's
 * `owned_files` (it is WP01's already-merged module), so this module
 * re-parses each `*.agent.yaml` file once more here (T015 step 5's
 * explicitly sanctioned "or re-parse the file once more here" alternative)
 * rather than extending `profile.ts`'s return shape — a small, local
 * duplicate read, not a cross-WP file edit.
 *
 * C-001/C-003: no import from `src/core/` or from `spec-kitty`.
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

import { checkContextSources } from "./context-sources.js";
import { err, type SkProfileFinding } from "./findings.js";
import { checkHandoffs } from "./handoff.js";
import { checkIdentity } from "./identity.js";
import { validateManifest, type SkProfileCase, type SkProfileManifest } from "./manifest.js";
import { loadProfileSet, type AgentProfile } from "./profile.js";
import { checkProjectionDrift, loadProjectionManifest } from "./projection.js";
import { checkReferences } from "./references.js";
import { checkSchemaConformance } from "./schema.js";

export type { SkProfileManifest, SkProfileCase } from "./manifest.js";
export type { AgentProfile } from "./profile.js";
export type { ProjectionEntry } from "./projection.js";
export type { SkProfileFinding, SkProfileFindingKind } from "./findings.js";

/**
 * Reserved-but-empty run options (research.md R8) — this capability has no
 * behavioral half at all, unlike `memory-utilization`'s `RunOptions`, so
 * there is no `client`/`endpoint` field to carry.
 */
export interface RunOptions {}

/** A named report-grouping filter view (research.md R1) — filter-only, not an independent run. */
export interface SkProfileCaseResult {
  readonly caseId: string;
  readonly profileId?: string;
  readonly findings: readonly SkProfileFinding[];
}

export interface AdapterResult {
  /** True iff no finding has severity "error", across the WHOLE graph. */
  readonly ok: boolean;
  readonly summary: string;
  /** Authoritative, ungrouped, whole-graph finding set. */
  readonly findings: readonly SkProfileFinding[];
  /** Report-organization view only. */
  readonly cases: readonly SkProfileCaseResult[];
}

/**
 * `profile-parse-error` is structural (malformed `*.agent.yaml` syntax),
 * not one of WP04's rubric §-clauses — `RUBRIC_CITATION`/`citationFor`
 * deliberately exclude this kind, so this fixed, non-rubric literal is the
 * sole citation path for it.
 */
const STRUCTURAL_PARSE_ERROR_CITATION = "structural: malformed *.agent.yaml";

async function loadRawProfileYaml(filePath: string): Promise<unknown> {
  const content = await readFile(filePath, "utf-8");
  return parseYaml(content);
}

/** One `profile-parse-error` finding per profile whose `*.agent.yaml` failed to parse (WP01's `loadAgentProfile`). */
function parseErrorFindings(profiles: readonly AgentProfile[]): SkProfileFinding[] {
  return profiles
    .filter((profile) => profile.parseError !== undefined)
    .map((profile) =>
      err(
        "profile-parse-error",
        profile.profileId.length > 0 ? profile.profileId : "(unknown)",
        "(document)",
        profile.parseError ?? "",
        STRUCTURAL_PARSE_ERROR_CITATION
      )
    );
}

/** FR-002: schema-conformance findings for every successfully-parsed profile (parse-error profiles skip this check). */
async function schemaFindings(
  profiles: readonly AgentProfile[],
  manifest: SkProfileManifest
): Promise<SkProfileFinding[]> {
  const findings: SkProfileFinding[] = [];
  for (const profile of profiles) {
    if (profile.parseError !== undefined) continue;
    const rawYaml = await loadRawProfileYaml(profile.filePath);
    findings.push(
      ...checkSchemaConformance(
        rawYaml,
        manifest.schemaPath,
        profile.filePath,
        profile.profileId,
        manifest.schemaSha
      )
    );
  }
  return findings;
}

/** FR-007: skipped entirely (empty findings contribution) when `projectionManifestPath` is omitted. */
async function projectionFindings(
  profiles: readonly AgentProfile[],
  manifest: SkProfileManifest
): Promise<SkProfileFinding[]> {
  if (manifest.projectionManifestPath === undefined) return [];
  const { entries } = await loadProjectionManifest(manifest.projectionManifestPath);
  return checkProjectionDrift(profiles, entries);
}

/**
 * Concatenate every check module's findings in a fixed, documented order —
 * schema, profile-parse-error, handoff, references, context-sources,
 * identity, projection — so `--json` output is byte-stable independent of
 * which check happened to run first in code (NFR-001).
 */
async function collectFindings(
  profiles: readonly AgentProfile[],
  manifest: SkProfileManifest
): Promise<SkProfileFinding[]> {
  const schema = await schemaFindings(profiles, manifest);
  const parseErrors = parseErrorFindings(profiles);
  const handoff = checkHandoffs(profiles);
  const references = await checkReferences(profiles, manifest.doctrineRoot, manifest.activationConfigPath);
  const contextSources = checkContextSources(profiles, manifest.doctrineRoot);
  const identity = checkIdentity(profiles);
  const projection = await projectionFindings(profiles, manifest);
  return [...schema, ...parseErrors, ...handoff, ...references, ...contextSources, ...identity, ...projection];
}

/** research.md R1's filter-only semantics — `ok` is computed once over the whole graph, independent of case coverage. */
function buildCases(
  cases: readonly SkProfileCase[],
  findings: readonly SkProfileFinding[]
): SkProfileCaseResult[] {
  return cases.map((kase) => {
    const caseFindings = findings.filter(
      (finding) => kase.profileId === undefined || finding.profileId === kase.profileId
    );
    return kase.profileId === undefined
      ? { caseId: kase.id, findings: caseFindings }
      : { caseId: kase.id, profileId: kase.profileId, findings: caseFindings };
  });
}

function summarize(findings: readonly SkProfileFinding[], profileCount: number): string {
  const errorCount = findings.filter((finding) => finding.severity === "error").length;
  return `spec-kitty-profile adapter: ${errorCount} error finding(s) across ${profileCount} profile(s)`;
}

/**
 * `SpecKittyProfileAdapter` — entry point for the spec-kitty-profile static
 * conformance adapter (FR-001..FR-010). Mirrors
 * `createMemoryUtilizationAdapter()`'s factory + `run()` shape (D1); shares
 * no code with `memory-utilization` beyond that shape convention.
 */
export class SpecKittyProfileAdapter {
  readonly name = "spec-kitty-profile";

  async run(manifest: SkProfileManifest, _options?: RunOptions): Promise<AdapterResult> {
    const profiles = await loadProfileSet(manifest.profilesDir);
    validateManifest(
      manifest,
      profiles.map((profile) => profile.profileId)
    );

    const findings = await collectFindings(profiles, manifest);
    const ok = findings.every((finding) => finding.severity !== "error");
    const cases = buildCases(manifest.cases, findings);

    return { ok, summary: summarize(findings, profiles.length), findings, cases };
  }
}

export function createSpecKittyProfileAdapter(): SpecKittyProfileAdapter {
  return new SpecKittyProfileAdapter();
}
