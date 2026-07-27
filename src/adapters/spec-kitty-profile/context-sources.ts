/**
 * context-sources.ts — `context-sources.{directives,tactics,toolguides,
 * styleguides}` on-disk integrity (FR-005, WP02 T010).
 *
 * Same on-disk resolver as `references.ts`'s stage 1 (imported, never
 * duplicated) — but **never** activation-gated: there is no warning tier
 * here, only "missing → error". This check runs regardless of whether
 * `activationConfigPath` is supplied; activation has no bearing on
 * context-sources at all.
 *
 * C-001/C-003: no import from `src/core/` or from `spec-kitty`.
 */

import { err, type SkProfileFinding } from "./findings.js";
import type { AgentProfile } from "./profile.js";
import {
  createDoctrineFileCache,
  resolveDoctrineFile,
  type DoctrineFileCache,
  type DoctrineFileKind,
} from "./references.js";
import { RUBRIC_CITATION } from "./rubric.js";

// context-sources field name -> doctrine-file kind it resolves against.
const CONTEXT_SOURCE_KINDS: ReadonlyArray<{
  readonly field: keyof AgentProfile["contextSources"];
  readonly kind: DoctrineFileKind;
}> = [
  { field: "directives", kind: "directive" },
  { field: "tactics", kind: "tactic" },
  { field: "toolguides", kind: "toolguide" },
  { field: "styleguides", kind: "styleguide" },
];

function checkContextSourceField(
  profile: AgentProfile,
  doctrineRoot: string,
  field: keyof AgentProfile["contextSources"],
  kind: DoctrineFileKind,
  cache: DoctrineFileCache
): SkProfileFinding[] {
  const findings: SkProfileFinding[] = [];
  profile.contextSources[field].forEach((id, index) => {
    if (!resolveDoctrineFile(doctrineRoot, kind, id, cache)) {
      findings.push(
        err(
          "context-source-missing",
          profile.profileId,
          `context-sources.${field}[${index}]`,
          `context-sources.${field} entry "${id}" does not resolve to any file on disk`,
          RUBRIC_CITATION["context-source-missing"]
        )
      );
    }
  });
  return findings;
}

/**
 * Check every `context-sources` entry across the whole profile set for
 * on-disk existence against `doctrineRoot`. Never activation-gated.
 *
 * `cache` defaults to a fresh, call-scoped `DoctrineFileCache` so repeated
 * calls (even against the same `doctrineRoot`) never share state and never
 * see a stale on-disk listing. Pass the same cache instance used for a
 * `checkReferences` call in the same run to share one on-disk walk across
 * both checks.
 */
export function checkContextSources(
  profiles: readonly AgentProfile[],
  doctrineRoot: string,
  cache: DoctrineFileCache = createDoctrineFileCache()
): SkProfileFinding[] {
  const findings: SkProfileFinding[] = [];
  for (const profile of profiles) {
    for (const { field, kind } of CONTEXT_SOURCE_KINDS) {
      findings.push(...checkContextSourceField(profile, doctrineRoot, field, kind, cache));
    }
  }
  return findings;
}
