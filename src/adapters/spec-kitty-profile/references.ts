/**
 * references.ts — directive/tactic/toolguide/styleguide reference
 * resolution + activation gating (FR-004, WP02 T009).
 *
 * Two independent stages: on-disk existence (always), then activation
 * membership (only when an `activationConfigPath` is supplied). Never
 * parses doctrine YAML *content* — filename-only existence checks
 * (research.md R2); content validation is M3's domain.
 *
 * `resolveDoctrineFile` is the shared resolver also imported by
 * `context-sources.ts` for the same match rules, so the prefix-vs-
 * exact-match logic lives in exactly one place. `id`/`code` values are
 * never joined into a filesystem path — they are only compared against a
 * directory listing already confined to `<doctrineRoot>/<kind>s`, so there
 * is no path-traversal surface here even for a hostile `id` string (same
 * discipline as the `skills` adapter's `layout.ts`, applied by construction
 * rather than by an explicit `..`-rejection check).
 *
 * C-001/C-003: no import from `src/core/` or from `spec-kitty`.
 */

import { readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import { err, warn, type SkProfileFinding } from "./findings.js";
import type { AgentProfile } from "./profile.js";
import { RUBRIC_CITATION } from "./rubric.js";

export type DoctrineFileKind = "directive" | "tactic" | "toolguide" | "styleguide";

const KIND_SUFFIX: Record<DoctrineFileKind, string> = {
  directive: ".directive.yaml",
  tactic: ".tactic.yaml",
  toolguide: ".toolguide.yaml",
  styleguide: ".styleguide.yaml",
};

// Only "directive" resolves by filename-prefix match (`<code>-...`); every
// other kind resolves by exact filename-stem match (research.md R2's table).
const PREFIX_MATCH_KINDS = new Set<DoctrineFileKind>(["directive"]);

// Recursive doctrine-subtree file listing, cached per (doctrineRoot, kind)
// for the duration of a run — never re-`readdir` per reference (plan.md
// Performance Goals: this is O(n·m) as-is, re-walking per reference would
// be needlessly worse).
//
// Deliberately NOT module-level state: a `Map` living at module scope would
// outlive every individual run in a long-lived process (e.g. a harness that
// calls `checkReferences`/`checkContextSources` repeatedly against changing
// on-disk fixtures) and would silently return a stale listing. Callers
// instead create one `DoctrineFileCache` per run via `createDoctrineFileCache`
// and may thread the same instance into both `checkReferences` and
// `checkContextSources` to share the on-disk walk for one `doctrineRoot`
// across both checks — or let each call default to its own fresh cache,
// which is always correct, just not maximally shared.
export type DoctrineFileCache = Map<string, readonly string[]>;

export function createDoctrineFileCache(): DoctrineFileCache {
  return new Map<string, readonly string[]>();
}

/**
 * FR-001: `doctrineRoot` is a required manifest field — a declared-but-
 * structurally-missing `doctrineRoot` must fail loudly (the CLI layer maps
 * a thrown `Error` here to exit code 2), never silently degrade to "zero
 * references resolve" or "zero findings" (HIGH-2 remediation). Only the
 * root itself is asserted here: a missing `<doctrineRoot>/<kind>s` subtree
 * is legitimately "no <kind>s yet" and stays `walkRecursive`'s job to
 * swallow, unchanged.
 */
function assertDoctrineRootExists(doctrineRoot: string): void {
  let stats: import("node:fs").Stats;
  try {
    stats = statSync(doctrineRoot);
  } catch {
    throw new Error(
      `spec-kitty-profile references: doctrineRoot "${doctrineRoot}" does not exist on disk`
    );
  }
  if (!stats.isDirectory()) {
    throw new Error(
      `spec-kitty-profile references: doctrineRoot "${doctrineRoot}" is not a directory`
    );
  }
}

/**
 * A missing optional `<doctrineRoot>/<kind>s` subtree (`ENOENT`) is
 * legitimately "no <kind>s yet" and must resolve to an empty listing. Any
 * other error — most importantly `EACCES` on an unreadable subtree — must
 * propagate: an unreadable doctrine subtree is a run error, not "zero
 * references resolve" (charter constraint 4: an errored run must never be
 * reported as a graded one).
 */
function walkRecursive(dir: string): string[] {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return [];
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      names.push(...walkRecursive(join(dir, entry.name)));
    } else if (entry.isFile()) {
      names.push(entry.name);
    }
  }
  return names;
}

function listDoctrineFiles(
  cache: DoctrineFileCache,
  doctrineRoot: string,
  kind: DoctrineFileKind
): readonly string[] {
  const cacheKey = `${doctrineRoot} ${kind}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const subtreeRoot = join(doctrineRoot, `${kind}s`);
  const listing = walkRecursive(subtreeRoot);
  cache.set(cacheKey, listing);
  return listing;
}

/**
 * Does a `<doctrineRoot>/<kind>s/**` file matching `id` exist? Directives
 * match by filename **prefix** (`"<id>-"`); every other kind matches by
 * exact filename **stem**.
 *
 * `cache` defaults to a fresh, call-scoped `DoctrineFileCache` so a bare
 * `resolveDoctrineFile(doctrineRoot, kind, id)` call is always correct (never
 * stale) — pass an explicit cache created via `createDoctrineFileCache` when
 * you want repeated calls (e.g. `checkReferences` and `checkContextSources`
 * within the same run against the same `doctrineRoot`) to share one on-disk
 * walk.
 */
export function resolveDoctrineFile(
  doctrineRoot: string,
  kind: DoctrineFileKind,
  id: string,
  cache: DoctrineFileCache = createDoctrineFileCache()
): boolean {
  const suffix = KIND_SUFFIX[kind];
  const files = listDoctrineFiles(cache, doctrineRoot, kind);
  const usesPrefixMatch = PREFIX_MATCH_KINDS.has(kind);
  return files.some((name) => {
    if (!name.endsWith(suffix)) return false;
    const stem = name.slice(0, -suffix.length);
    return usesPrefixMatch ? name.startsWith(`${id}-`) : stem === id;
  });
}

// ---------------------------------------------------------------------------
// Activation config (research.md R3)
// ---------------------------------------------------------------------------

interface ActivationConfig {
  readonly recognized: boolean;
  readonly activatedDirectives: readonly string[];
  readonly activatedTactics: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Parse `activationConfigPath` as YAML and extract `activated_directives`/
 * `activated_tactics`. `recognized` is false iff the top-level object
 * exposes **neither** key — the loud-failure shape-validation signal
 * (research.md R3's post-plan-gate correction). Either way, the returned
 * arrays default to `[]` for any absent key, so downstream stage-2 checks
 * degrade gracefully to "no reference is activated" without special-casing
 * the unrecognized-shape path.
 */
async function loadActivationConfig(activationConfigPath: string): Promise<ActivationConfig> {
  const raw = await readFile(activationConfigPath, "utf-8");
  const parsed: unknown = parseYaml(raw);
  const record = isRecord(parsed) ? parsed : {};
  const hasDirectivesKey = Object.hasOwn(record, "activated_directives");
  const hasTacticsKey = Object.hasOwn(record, "activated_tactics");
  return {
    recognized: hasDirectivesKey || hasTacticsKey,
    activatedDirectives: stringArray(record["activated_directives"]),
    activatedTactics: stringArray(record["activated_tactics"]),
  };
}

function isDirectiveActivated(config: ActivationConfig, code: string): boolean {
  return config.activatedDirectives.some((slug) => slug.startsWith(`${code}-`));
}

function isTacticActivated(config: ActivationConfig, id: string): boolean {
  return config.activatedTactics.includes(id);
}

// ---------------------------------------------------------------------------
// Per-profile checks
// ---------------------------------------------------------------------------

function unresolvedFinding(profileId: string, path: string, description: string): SkProfileFinding {
  return err(
    "reference-unresolved",
    profileId,
    path,
    `${description} does not resolve to any file on disk`,
    RUBRIC_CITATION["reference-unresolved"]
  );
}

function notActivatedFinding(profileId: string, path: string, description: string): SkProfileFinding {
  return warn(
    "reference-not-activated",
    profileId,
    path,
    `${description} resolves on disk but is not in the activated set`,
    RUBRIC_CITATION["reference-not-activated"]
  );
}

/** Stage 1 (+ optional stage 2) for `directive-references[].code`. */
function checkDirectiveRefs(
  profile: AgentProfile,
  doctrineRoot: string,
  activation: ActivationConfig | undefined,
  cache: DoctrineFileCache
): SkProfileFinding[] {
  const findings: SkProfileFinding[] = [];
  profile.directiveRefs.forEach((code, index) => {
    const path = `directive-references[${index}].code`;
    if (!resolveDoctrineFile(doctrineRoot, "directive", code, cache)) {
      findings.push(unresolvedFinding(profile.profileId, path, `directive code "${code}"`));
      return;
    }
    if (activation && !isDirectiveActivated(activation, code)) {
      findings.push(notActivatedFinding(profile.profileId, path, `directive code "${code}"`));
    }
  });
  return findings;
}

/** Stage 1 (+ optional stage 2) for `tactic-references[].id`. */
function checkTacticRefs(
  profile: AgentProfile,
  doctrineRoot: string,
  activation: ActivationConfig | undefined,
  cache: DoctrineFileCache
): SkProfileFinding[] {
  const findings: SkProfileFinding[] = [];
  profile.tacticRefs.forEach((id, index) => {
    const path = `tactic-references[${index}].id`;
    if (!resolveDoctrineFile(doctrineRoot, "tactic", id, cache)) {
      findings.push(unresolvedFinding(profile.profileId, path, `tactic id "${id}"`));
      return;
    }
    if (activation && !isTacticActivated(activation, id)) {
      findings.push(notActivatedFinding(profile.profileId, path, `tactic id "${id}"`));
    }
  });
  return findings;
}

/**
 * Stage-1-only resolution for `toolguide-references[].id`/
 * `styleguide-references[].id` — FR-004 activation-gates only
 * directives/tactics; toolguide/styleguide references still get on-disk
 * resolution here for completeness of this module (T009 step 5's
 * either-placement rule: `references.ts` owns them, not
 * `context-sources.ts`).
 */
function checkUnactivatedKindRefs(
  profile: AgentProfile,
  doctrineRoot: string,
  kind: Extract<DoctrineFileKind, "toolguide" | "styleguide">,
  ids: readonly string[],
  pathPrefix: string,
  cache: DoctrineFileCache
): SkProfileFinding[] {
  const findings: SkProfileFinding[] = [];
  ids.forEach((id, index) => {
    const path = `${pathPrefix}[${index}].id`;
    if (!resolveDoctrineFile(doctrineRoot, kind, id, cache)) {
      findings.push(unresolvedFinding(profile.profileId, path, `${kind} id "${id}"`));
    }
  });
  return findings;
}

/**
 * Check every directive/tactic/toolguide/styleguide reference across the
 * whole profile set. When `activationConfigPath` is supplied and its
 * parsed shape is unrecognized, emits exactly one
 * `activation-config-unrecognized-shape` warning for the whole run (never
 * once per reference), then proceeds with empty activation sets so every
 * resolvable directive/tactic reports `reference-not-activated`.
 *
 * `cache` defaults to a fresh, call-scoped `DoctrineFileCache` (see
 * `createDoctrineFileCache`) so two calls to `checkReferences` — even
 * against the same `doctrineRoot` — never share state and never see a
 * stale on-disk listing. Pass an explicit cache (also threaded to
 * `checkContextSources`) to share one on-disk walk across both checks
 * within a single run.
 */
export async function checkReferences(
  profiles: readonly AgentProfile[],
  doctrineRoot: string,
  activationConfigPath?: string,
  cache: DoctrineFileCache = createDoctrineFileCache()
): Promise<SkProfileFinding[]> {
  assertDoctrineRootExists(doctrineRoot);
  const findings: SkProfileFinding[] = [];
  let activation: ActivationConfig | undefined;

  if (activationConfigPath !== undefined) {
    activation = await loadActivationConfig(activationConfigPath);
    if (!activation.recognized) {
      findings.push(
        warn(
          "activation-config-unrecognized-shape",
          "(manifest)",
          "activationConfigPath",
          `activation config "${activationConfigPath}" exposes neither activated_directives nor activated_tactics`,
          RUBRIC_CITATION["activation-config-unrecognized-shape"]
        )
      );
    }
  }

  for (const profile of profiles) {
    findings.push(
      ...checkDirectiveRefs(profile, doctrineRoot, activation, cache),
      ...checkTacticRefs(profile, doctrineRoot, activation, cache),
      ...checkUnactivatedKindRefs(
        profile,
        doctrineRoot,
        "toolguide",
        profile.toolguideRefs,
        "toolguide-references",
        cache
      ),
      ...checkUnactivatedKindRefs(
        profile,
        doctrineRoot,
        "styleguide",
        profile.styleguideRefs,
        "styleguide-references",
        cache
      )
    );
  }
  return findings;
}
