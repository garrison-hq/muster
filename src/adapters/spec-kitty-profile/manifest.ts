/**
 * manifest.ts — `SkProfileManifest`/`SkProfileCase` types, manifest loading,
 * path resolution, and `validateManifest` for the spec-kitty-profile
 * adapter (WP01 T002, FR-001).
 *
 * A malformed manifest must fail fast and loudly (the CLI layer, WP03, maps
 * a thrown `Error` here to exit code 2) — never silently under-report.
 *
 * C-001/C-003: no import from `src/core/` or from `spec-kitty`; plain
 * YAML/JSON file reads only.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * The adapter's single input document (FR-001, extended per research.md
 * R2/post-spec-gate correction). `schemaSha` and `doctrineRoot` are
 * required — not optional — fields.
 */
export interface SkProfileManifest {
  readonly version: string;
  readonly profilesDir: string;
  readonly schemaPath: string;
  readonly schemaSha: string;
  readonly doctrineRoot: string;
  readonly activationConfigPath?: string;
  readonly projectionManifestPath?: string;
  readonly cases: readonly SkProfileCase[];
}

/** A named report-grouping filter (research.md R1) — not an independent run. */
export interface SkProfileCase {
  readonly id: string;
  readonly profileId?: string;
}

/**
 * Deterministic UTF-16 code-unit string comparator — never `localeCompare`
 * (NFR-001/C-002 byte-stability). Copied locally per this WP's own hard
 * rule: this adapter must not depend on sibling adapters
 * (`memory-utilization`/`tools`) for this small helper.
 */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Read and parse the raw manifest file at `path`. Supports both YAML and
 * JSON (JSON is valid YAML, so a single `yaml.parse` call handles both,
 * matching the worked example in `quickstart.md`, which uses `.yaml`).
 * Throws a plain `Error` on read/parse failure — the CLI layer (WP03) maps
 * this to exit code 2; this module never attempts that mapping itself.
 */
export async function loadSkProfileManifest(path: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`spec-kitty-profile manifest: could not read "${path}": ${message}`);
  }
  try {
    return parseYaml(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`spec-kitty-profile manifest: could not parse "${path}": ${message}`);
  }
}

/** Resolve `p` (if present) against `manifestDir`, leaving already-absolute paths untouched. */
function resolveAgainst(manifestDir: string, p: string): string {
  return isAbsolute(p) ? p : resolve(manifestDir, p);
}

/**
 * Resolve every path-shaped field of `raw` (`profilesDir`, `schemaPath`,
 * `doctrineRoot`, `activationConfigPath`, `projectionManifestPath`) to an
 * absolute path against `manifestDir` — mirrors `memory-utilization`'s
 * `resolveMemoryUtilizationManifestPaths` pattern (`src/cli/index.ts`).
 * `schemaSha` and `cases[].id`/`cases[].profileId` are not paths and are
 * left untouched.
 */
export function resolveSkProfileManifestPaths(
  raw: SkProfileManifest,
  manifestDir: string
): SkProfileManifest {
  return {
    ...raw,
    profilesDir: resolveAgainst(manifestDir, raw.profilesDir),
    schemaPath: resolveAgainst(manifestDir, raw.schemaPath),
    doctrineRoot: resolveAgainst(manifestDir, raw.doctrineRoot),
    activationConfigPath:
      raw.activationConfigPath === undefined
        ? undefined
        : resolveAgainst(manifestDir, raw.activationConfigPath),
    projectionManifestPath:
      raw.projectionManifestPath === undefined
        ? undefined
        : resolveAgainst(manifestDir, raw.projectionManifestPath),
  };
}

/** Throws if `manifest.cases` is empty — a malformed manifest must fail fast. */
function assertNonEmptyCases(manifest: SkProfileManifest): void {
  if (manifest.cases.length === 0) {
    throw new Error("spec-kitty-profile manifest: cases must be a non-empty array");
  }
}

/** Throws on the first duplicate `case.id` found, in byte-stable (sorted) order. */
function assertNoDuplicateCaseIds(manifest: SkProfileManifest): void {
  const ids = manifest.cases.map((c) => c.id).sort(compareStrings);
  for (let i = 1; i < ids.length; i++) {
    if (ids[i] === ids[i - 1]) {
      throw new Error(`spec-kitty-profile manifest: duplicate case.id "${ids[i]}"`);
    }
  }
}

/** Throws if any `case.profileId` does not appear in the supplied `profileIds` set. */
function assertCaseProfileIdsResolve(
  manifest: SkProfileManifest,
  profileIds: readonly string[]
): void {
  const known = new Set(profileIds);
  for (const kase of manifest.cases) {
    if (kase.profileId !== undefined && !known.has(kase.profileId)) {
      throw new Error(
        `spec-kitty-profile manifest: case "${kase.id}" references unknown profileId ` +
          `"${kase.profileId}"`
      );
    }
  }
}

/**
 * Validate a manifest against the already-loaded set of `profileIds`
 * (this function does not load profiles itself, keeping it pure over
 * already-known data — mirrors `memory-utilization`'s `validateCase`
 * fail-fast pattern). Throws on the first violation found; never returns a
 * result object.
 */
export function validateManifest(
  manifest: SkProfileManifest,
  profileIds: readonly string[]
): void {
  assertNonEmptyCases(manifest);
  assertNoDuplicateCaseIds(manifest);
  assertCaseProfileIdsResolve(manifest, profileIds);
}
