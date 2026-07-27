/**
 * profile.ts — `AgentProfile` parsing + profile-set loader (WP01 T003).
 *
 * Turns each `*.agent.yaml` file in `profilesDir` into the narrow
 * `AgentProfile` shape every downstream check consumes. Tolerant of
 * individual parse failures: a profile that fails to parse is data, not an
 * execution error — it returns `parseError` set, never throws, so it never
 * silently disappears from the run (data-model.md: "errored counts as
 * failed, never silently skipped").
 *
 * C-001/C-003: no import from `src/core/` or from `spec-kitty`.
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parse as parseYaml } from "yaml";

import { compareStrings } from "./manifest.js";

const AGENT_YAML_SUFFIX = ".agent.yaml";

export interface AgentProfile {
  readonly filePath: string;
  readonly fileNameStem: string;
  readonly profileId: string;
  readonly roles: readonly string[];
  readonly handoffTo: readonly string[];
  readonly handoffFrom: readonly string[];
  readonly worksWith: readonly string[];
  readonly directiveRefs: readonly string[];
  readonly tacticRefs: readonly string[];
  readonly toolguideRefs: readonly string[];
  readonly styleguideRefs: readonly string[];
  readonly contextSources: {
    readonly directives: readonly string[];
    readonly tactics: readonly string[];
    readonly toolguides: readonly string[];
    readonly styleguides: readonly string[];
  };
  readonly parseError?: string;
}

// ---------------------------------------------------------------------------
// Defensive field extraction — every field is treated as possibly
// absent/wrong-typed (the raw value comes from an un-validated YAML parse).
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function stringField(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  return typeof value === "string" ? value : "";
}

/** `roles` (array) wins when present; else `role` (scalar) folds to a 1-element array; else `[]`. */
function extractRoles(raw: Record<string, unknown>): string[] {
  if (Array.isArray(raw["roles"])) return stringArray(raw["roles"]);
  const role = raw["role"];
  return typeof role === "string" ? [role] : [];
}

function extractCollaborationField(raw: Record<string, unknown>, key: string): string[] {
  const collaboration = raw["collaboration"];
  if (!isRecord(collaboration)) return [];
  return stringArray(collaboration[key]);
}

/** `<listKey>[].<idKey>` — e.g. `directive-references[].code`. */
function extractRefIds(raw: Record<string, unknown>, listKey: string, idKey: string): string[] {
  const list = raw[listKey];
  if (!Array.isArray(list)) return [];
  const ids: string[] = [];
  for (const entry of list) {
    if (isRecord(entry) && typeof entry[idKey] === "string") {
      ids.push(entry[idKey]);
    }
  }
  return ids;
}

function extractContextSources(raw: Record<string, unknown>): AgentProfile["contextSources"] {
  const contextSources = raw["context-sources"];
  const source = isRecord(contextSources) ? contextSources : {};
  return {
    directives: stringArray(source["directives"]),
    tactics: stringArray(source["tactics"]),
    toolguides: stringArray(source["toolguides"]),
    styleguides: stringArray(source["styleguides"]),
  };
}

function parsedYamlToProfile(filePath: string, fileNameStem: string, raw: unknown): AgentProfile {
  const record = isRecord(raw) ? raw : {};
  return {
    filePath,
    fileNameStem,
    profileId: stringField(record, "profile-id"),
    roles: extractRoles(record),
    handoffTo: extractCollaborationField(record, "handoff-to"),
    handoffFrom: extractCollaborationField(record, "handoff-from"),
    worksWith: extractCollaborationField(record, "works-with"),
    directiveRefs: extractRefIds(record, "directive-references", "code"),
    tacticRefs: extractRefIds(record, "tactic-references", "id"),
    toolguideRefs: extractRefIds(record, "toolguide-references", "id"),
    styleguideRefs: extractRefIds(record, "styleguide-references", "id"),
    contextSources: extractContextSources(record),
  };
}

function emptyProfileWithError(
  filePath: string,
  fileNameStem: string,
  parseError: string
): AgentProfile {
  return {
    filePath,
    fileNameStem,
    profileId: "",
    roles: [],
    handoffTo: [],
    handoffFrom: [],
    worksWith: [],
    directiveRefs: [],
    tacticRefs: [],
    toolguideRefs: [],
    styleguideRefs: [],
    contextSources: { directives: [], tactics: [], toolguides: [], styleguides: [] },
    parseError,
  };
}

function fileNameStemOf(filePath: string): string {
  const base = basename(filePath);
  return base.endsWith(AGENT_YAML_SUFFIX) ? base.slice(0, -AGENT_YAML_SUFFIX.length) : base;
}

/**
 * Parse one `*.agent.yaml` file into an `AgentProfile`. Never throws: a
 * read/parse failure returns a record with `parseError` set, `fileNameStem`
 * still computed (needed by identity checks later), and every list field
 * `[]`.
 */
export async function loadAgentProfile(filePath: string): Promise<AgentProfile> {
  const fileNameStem = fileNameStemOf(filePath);
  let raw: unknown;
  try {
    const content = await readFile(filePath, "utf-8");
    raw = parseYaml(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return emptyProfileWithError(filePath, fileNameStem, message);
  }
  return parsedYamlToProfile(filePath, fileNameStem, raw);
}

/**
 * Load every `*.agent.yaml` file directly under `profilesDir`
 * (non-recursive — verified real layout is flat), sorted by `fileNameStem`
 * using the UTF-16 `compareStrings` comparator so iteration order (and
 * therefore finding order) is byte-stable regardless of `readdir` ordering
 * (NFR-001).
 */
export async function loadProfileSet(profilesDir: string): Promise<AgentProfile[]> {
  const entries = await readdir(profilesDir);
  const agentYamlFiles = entries.filter((name) => name.endsWith(AGENT_YAML_SUFFIX));
  const profiles = await Promise.all(
    agentYamlFiles.map((name) => loadAgentProfile(join(profilesDir, name)))
  );
  return profiles.sort((a, b) => compareStrings(a.fileNameStem, b.fileNameStem));
}
