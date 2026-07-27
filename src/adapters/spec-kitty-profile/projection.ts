/**
 * projection.ts — FR-007: projection-drift independent re-verification
 * (WP03 T014). Re-checks, without trusting Spec Kitty's own `doctor`
 * verdict, that a projected native artefact (e.g. `.claude/agents/<id>.md`)
 * still exists and still matches the source `*.agent.yaml` it was generated
 * from.
 *
 * **Matching key** (rubric §7.1, research.md R5 — the single easiest way to
 * get this module wrong): entries are matched to a locally-loaded
 * `AgentProfile` by `entry.profile_urn === "agent_profile:" + profile.
 * profileId`, **never** by `entry.source_path`, which is recorded on the
 * machine that ran the projector and is provenance-only.
 *
 * **Hash algorithm** (rubric §7.1, research.md R5, verified against SK's own
 * `hash_content`/`hash_file`): SHA-256 hex over raw UTF-8 file bytes — no
 * normalization, no line-ending handling.
 *
 * **`output_path` resolution** (rubric §7.2 — the load-bearing subtlety this
 * module must not get wrong by intuition): both absolute and repo-relative
 * forms are accepted. A relative `output_path` resolves against the
 * *projection manifest file's own parent directory's parent* (the project
 * root) — NOT against the manifest's own directory the way every other
 * path-shaped field in this adapter resolves (`manifest.ts`'s
 * `resolveSkProfileManifestPaths`). This resolution happens once, in
 * `loadProjectionManifest`, so `checkProjectionDrift` itself never has to
 * reason about relative vs. absolute paths.
 *
 * C-001/C-003: no import from `src/core/` or from `spec-kitty`; every file
 * read is a plain local read, never a network call.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import { err, warn, type SkProfileFinding } from "./findings.js";
import type { AgentProfile } from "./profile.js";
import { RUBRIC_CITATION } from "./rubric.js";

/** One `schema_version: 1` entry from a `.kittify/agent_profiles_manifest.json`-shaped file. */
export interface ProjectionEntry {
  readonly profile_urn: string;
  readonly source_layer: string;
  readonly tool_key: string;
  readonly output_path: string;
  readonly format: string;
  readonly file_hash: string;
  /** Provenance only — recorded on the machine that ran the projector. Never used for matching. */
  readonly source_path: string;
  readonly source_hash: string;
  readonly projection_version: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  return typeof value === "string" ? value : "";
}

function numberField(raw: Record<string, unknown>, key: string): number {
  const value = raw[key];
  return typeof value === "number" ? value : 0;
}

/** Resolve `outputPath` (if relative) against `projectRoot` — rubric §7.2. */
function resolveOutputPath(outputPath: string, projectRoot: string): string {
  return isAbsolute(outputPath) ? outputPath : resolve(projectRoot, outputPath);
}

function toProjectionEntry(raw: unknown, projectRoot: string): ProjectionEntry | undefined {
  if (!isRecord(raw)) return undefined;
  return {
    profile_urn: stringField(raw, "profile_urn"),
    source_layer: stringField(raw, "source_layer"),
    tool_key: stringField(raw, "tool_key"),
    output_path: resolveOutputPath(stringField(raw, "output_path"), projectRoot),
    format: stringField(raw, "format"),
    file_hash: stringField(raw, "file_hash"),
    source_path: stringField(raw, "source_path"),
    source_hash: stringField(raw, "source_hash"),
    projection_version: numberField(raw, "projection_version"),
  };
}

/**
 * Read and `JSON.parse` the projection manifest at `path` (genuinely JSON,
 * not YAML — verified against the real `.kittify/agent_profiles_manifest.
 * json` shape). Throws a plain `Error` on read/parse failure — the CLI layer
 * maps this to exit code 2 (Scenario 14); this module never attempts that
 * mapping itself.
 *
 * Every entry's `output_path` is resolved here, once, against `path`'s own
 * parent directory's parent (rubric §7.2) — so every `ProjectionEntry`
 * `checkProjectionDrift` ever sees already carries an absolute, existence-
 * checkable `output_path`.
 */
export async function loadProjectionManifest(
  path: string
): Promise<{ entries: readonly ProjectionEntry[] }> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    throw new Error(
      `spec-kitty-profile projection manifest: could not read "${path}": ${errorMessage(error)}`
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `spec-kitty-profile projection manifest: could not parse "${path}" as JSON: ${errorMessage(error)}`
    );
  }
  const projectRoot = dirname(dirname(path));
  const rawEntries = isRecord(parsed) && Array.isArray(parsed["entries"]) ? parsed["entries"] : [];
  const entries = rawEntries
    .map((entry) => toProjectionEntry(entry, projectRoot))
    .filter((entry): entry is ProjectionEntry => entry !== undefined);
  return { entries };
}

function sha256HexOfFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Which recorded hash(es) differ from their independently recomputed value — empty when clean. */
function driftedHashNames(
  entry: ProjectionEntry,
  recomputedSourceHash: string,
  recomputedFileHash: string
): string[] {
  const drifted: string[] = [];
  if (recomputedSourceHash !== entry.source_hash) drifted.push("source_hash");
  if (recomputedFileHash !== entry.file_hash) drifted.push("file_hash");
  return drifted;
}

/** rubric §7.2: no matching entry at all, or a matched entry whose `output_path` is missing — reported identically. */
function missingOutputFinding(profileId: string, detail: string): SkProfileFinding {
  return err(
    "projection-output-missing",
    profileId,
    "projectionManifestPath",
    detail,
    RUBRIC_CITATION["projection-output-missing"]
  );
}

/** One profile's projection-drift check against the already-resolved `entries` set. */
function checkProfileProjection(
  profile: AgentProfile,
  byUrn: ReadonlyMap<string, ProjectionEntry>
): SkProfileFinding[] {
  const urn = `agent_profile:${profile.profileId}`;
  const entry = byUrn.get(urn);
  if (entry === undefined) {
    return [
      missingOutputFinding(
        profile.profileId,
        `no projection-manifest entry found for "${urn}" — the projected native artefact this profile is ` +
          "supposed to have was never recorded"
      ),
    ];
  }
  if (!existsSync(entry.output_path)) {
    return [
      missingOutputFinding(
        profile.profileId,
        `matched projection-manifest entry's output_path "${entry.output_path}" does not exist on disk`
      ),
    ];
  }

  const recomputedSourceHash = sha256HexOfFile(profile.filePath);
  const recomputedFileHash = sha256HexOfFile(entry.output_path);
  const drifted = driftedHashNames(entry, recomputedSourceHash, recomputedFileHash);
  if (drifted.length === 0) return [];

  return [
    warn(
      "projection-hash-drift",
      profile.profileId,
      "projectionManifestPath",
      `recomputed ${drifted.join(" and ")} ${drifted.length > 1 ? "differ" : "differs"} from the ` +
        "projection manifest's recorded value",
      RUBRIC_CITATION["projection-hash-drift"]
    ),
  ];
}

/**
 * FR-007: independently re-verify projection drift for every local profile
 * against `entries` (already-resolved `output_path`s, per
 * `loadProjectionManifest`). Returns `[]` immediately — this whole check
 * class is skipped, not merely vacuously passing — when `entries` is
 * `undefined` (`projectionManifestPath` was omitted from the manifest).
 *
 * Profiles with `parseError` set are skipped: they have no valid content to
 * hash meaningfully and are already surfaced via `profile-parse-error`
 * elsewhere.
 */
export function checkProjectionDrift(
  profiles: readonly AgentProfile[],
  entries: readonly ProjectionEntry[] | undefined
): SkProfileFinding[] {
  if (entries === undefined) return [];
  const byUrn = new Map(entries.map((entry) => [entry.profile_urn, entry] as const));

  const findings: SkProfileFinding[] = [];
  for (const profile of profiles) {
    if (profile.parseError !== undefined) continue;
    findings.push(...checkProfileProjection(profile, byUrn));
  }
  return findings;
}
