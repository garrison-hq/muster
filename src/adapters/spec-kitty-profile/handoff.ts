/**
 * handoff.ts — handoff-graph resolution + symmetry (FR-003, WP02 T008).
 *
 * `collaboration.handoff-to`/`handoff-from`/`works-with` carry **role
 * names**, not profile-ids (verified: `architect-alphonso` hands off to
 * `planner`, `implementer` — both role names, flagged `[MUSTER-OWN]` in the
 * rubric). Resolving against `profileId` instead of `roles`/`role` is the
 * single easiest way to get this module wrong — it would report every
 * handoff as dangling.
 *
 * C-001/C-003: no import from `src/core/` or from `spec-kitty`.
 */

import { err, warn, type SkProfileFinding } from "./findings.js";
import type { AgentProfile } from "./profile.js";
import { RUBRIC_CITATION } from "./rubric.js";

type CollaborationField = "handoffTo" | "handoffFrom" | "worksWith";

const FIELD_PATH_SEGMENT: Record<CollaborationField, string> = {
  handoffTo: "collaboration.handoff-to",
  handoffFrom: "collaboration.handoff-from",
  worksWith: "collaboration.works-with",
};

/** All *other* profiles (never the declaring profile itself) that declare `role` in their `roles`. */
function holdersOf(role: string, profiles: readonly AgentProfile[], self: AgentProfile): AgentProfile[] {
  return profiles.filter((candidate) => candidate !== self && candidate.roles.includes(role));
}

/** Does any of `holders` reciprocate by listing any of `selfRoles` in its `handoffFrom`? */
function reciprocates(holders: readonly AgentProfile[], selfRoles: readonly string[]): boolean {
  return holders.some((holder) => selfRoles.some((role) => holder.handoffFrom.includes(role)));
}

/** Resolution + (for handoffTo only) symmetry findings for one declared role entry. */
function checkRoleEntry(
  profile: AgentProfile,
  profiles: readonly AgentProfile[],
  field: CollaborationField,
  role: string,
  index: number
): SkProfileFinding[] {
  const path = `${FIELD_PATH_SEGMENT[field]}[${index}]`;
  const holders = holdersOf(role, profiles, profile);
  if (holders.length === 0) {
    return [
      err(
        "handoff-unresolved",
        profile.profileId,
        path,
        `role "${role}" declared in ${FIELD_PATH_SEGMENT[field]} does not match any other profile's roles`,
        RUBRIC_CITATION["handoff-unresolved"]
      ),
    ];
  }
  if (field !== "handoffTo") return [];
  if (reciprocates(holders, profile.roles)) return [];
  return [
    warn(
      "handoff-asymmetric",
      profile.profileId,
      path,
      `role "${role}" in collaboration.handoff-to is not reciprocated by any holder's handoff-from`,
      RUBRIC_CITATION["handoff-asymmetric"]
    ),
  ];
}

function checkField(
  profile: AgentProfile,
  profiles: readonly AgentProfile[],
  field: CollaborationField
): SkProfileFinding[] {
  const roles = profile[field];
  const findings: SkProfileFinding[] = [];
  roles.forEach((role, index) => {
    findings.push(...checkRoleEntry(profile, profiles, field, role, index));
  });
  return findings;
}

/**
 * Check the handoff graph across the whole profile set. Iterates profiles
 * in the order given (already `compareStrings`-sorted by WP01's
 * `loadProfileSet`), and within a profile checks `handoffTo` then
 * `handoffFrom` then `worksWith` in array order — deterministic, never
 * re-sorted by anything content-dependent.
 */
export function checkHandoffs(profiles: readonly AgentProfile[]): SkProfileFinding[] {
  const findings: SkProfileFinding[] = [];
  for (const profile of profiles) {
    findings.push(...checkField(profile, profiles, "handoffTo"));
    findings.push(...checkField(profile, profiles, "handoffFrom"));
    findings.push(...checkField(profile, profiles, "worksWith"));
  }
  return findings;
}
