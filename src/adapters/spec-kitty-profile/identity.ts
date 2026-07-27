/**
 * identity.ts — profile-id legality, filename match, and collision
 * (FR-006, WP02 T011). The profile-id is the literal
 * `.claude/agents/<id>.md` filename stem, so a mismatch is a hard
 * native-filename violation, not a style nit.
 *
 * Three distinct finding kinds that can co-occur on the same profile:
 * legality (`profile-id-illegal`), filename match
 * (`profile-id-filename-mismatch`), and collision
 * (`profile-id-collision`) — none of them short-circuits any other.
 *
 * C-001/C-003: no import from `src/core/` or from `spec-kitty`.
 */

import { err, type SkProfileFinding } from "./findings.js";
import type { AgentProfile } from "./profile.js";
import { profileIdIllegalCitation, RUBRIC_CITATION } from "./rubric.js";

const LEGAL_CHARSET_PATTERN = /^[a-z0-9-]+$/;
const MAX_PROFILE_ID_LENGTH = 64;

/**
 * Legality: `profileId` must match `^[a-z0-9-]+$` (§6.1) and be
 * ≤ 64 characters (§6.2). An empty `profileId` fails the charset rule (the
 * pattern requires at least one character) — it is not special-cased into
 * a different kind.
 */
function checkLegality(profile: AgentProfile): SkProfileFinding[] {
  const { profileId } = profile;
  const displayId = profileId === "" ? "(empty)" : profileId;
  if (!LEGAL_CHARSET_PATTERN.test(profileId)) {
    return [
      err(
        "profile-id-illegal",
        displayId,
        "profile-id",
        `profile-id "${displayId}" does not match the legal character set ^[a-z0-9-]+$`,
        profileIdIllegalCitation("charset")
      ),
    ];
  }
  if (profileId.length > MAX_PROFILE_ID_LENGTH) {
    return [
      err(
        "profile-id-illegal",
        displayId,
        "profile-id",
        `profile-id "${displayId}" exceeds the ${MAX_PROFILE_ID_LENGTH}-character length ceiling`,
        profileIdIllegalCitation("length")
      ),
    ];
  }
  return [];
}

/** Filename match: `profileId` must equal `fileNameStem` exactly (case-sensitive). */
function checkFilenameMatch(profile: AgentProfile): SkProfileFinding[] {
  if (profile.profileId === profile.fileNameStem) return [];
  return [
    err(
      "profile-id-filename-mismatch",
      profile.profileId,
      "profile-id",
      `profile-id "${profile.profileId}" does not match its file's name stem "${profile.fileNameStem}"`,
      RUBRIC_CITATION["profile-id-filename-mismatch"]
    ),
  ];
}

/**
 * Collision: two or more profiles sharing the same non-empty `profileId`.
 * An empty `profileId` (unparsed profile) is deliberately excluded from
 * grouping — already caught by the legality check, and grouping every
 * unparsed profile into one giant "collision" would be noise, not signal.
 */
function checkCollisions(profiles: readonly AgentProfile[]): SkProfileFinding[] {
  const groups = new Map<string, AgentProfile[]>();
  for (const profile of profiles) {
    if (profile.profileId === "") continue;
    const group = groups.get(profile.profileId);
    if (group) {
      group.push(profile);
    } else {
      groups.set(profile.profileId, [profile]);
    }
  }
  const findings: SkProfileFinding[] = [];
  for (const profile of profiles) {
    if (profile.profileId === "") continue;
    const group = groups.get(profile.profileId);
    if (group && group.length > 1) {
      findings.push(
        err(
          "profile-id-collision",
          profile.profileId,
          "profile-id",
          `profile-id "${profile.profileId}" is shared by ${group.length} profiles`,
          RUBRIC_CITATION["profile-id-collision"]
        )
      );
    }
  }
  return findings;
}

/**
 * Check profile-id legality, filename match, and cross-profile collision
 * for the whole profile set. Iterates profiles in input order.
 */
export function checkIdentity(profiles: readonly AgentProfile[]): SkProfileFinding[] {
  const findings: SkProfileFinding[] = [];
  for (const profile of profiles) {
    findings.push(...checkLegality(profile));
    findings.push(...checkFilenameMatch(profile));
  }
  findings.push(...checkCollisions(profiles));
  return findings;
}
