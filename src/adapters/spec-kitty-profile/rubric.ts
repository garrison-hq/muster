/**
 * rubric.ts — the single place every lint module in this WP (and WP03's
 * `projection.ts`) imports its `source.normative` citation string from.
 * Never inline a citation string in a check module directly (WP02 T007).
 *
 * Citation text quotes real §-clause ids from WP04's published
 * `docs/rubric/spec-kitty-profile-taxonomy.md` (v1.2.0, already landed on
 * this mission's WP04 lane at authoring time — no placeholder needed).
 *
 * `profile-id-illegal` is the one finding kind whose citation is NOT a
 * single fixed string: WP04's §6 group splits the identity-legality check
 * into two separately-tagged clauses — §6.1 (character set, [NORMATIVE])
 * and §6.2 (length ceiling, [CONVENTION]) — so `identity.ts` disambiguates
 * at the call site via `profileIdIllegalCitation()` rather than through the
 * flat `RUBRIC_CITATION` map, which can only hold one string per kind.
 *
 * C-001/C-003: this file imports nothing from `src/core/` and never shells
 * out to or imports from `spec-kitty` — it is a pure citation-string module.
 */

import type { SkProfileFindingKind } from "./findings.js";

/** Path (relative to repo root) to WP04's published rubric document. */
export const RUBRIC_DOC_PATH = "docs/rubric/spec-kitty-profile-taxonomy.md";

/** Build a citation string in the mission's canonical form. */
function citation(clause: string, label: string): string {
  return `muster spec-kitty-profile rubric ${clause} (${label}) — ${RUBRIC_DOC_PATH}`;
}

/** §6.1 — Legal Character Set [NORMATIVE]: cite when `^[a-z0-9-]+$` is violated. */
export const PROFILE_ID_CHARSET_CITATION = citation("§6.1", "profile-id-as-filename legality");

/** §6.2 — Length Ceiling [CONVENTION]: cite when otherwise legal but >64 chars. */
export const PROFILE_ID_LENGTH_CITATION = citation("§6.2", "profile-id-as-filename legality");

/**
 * Disambiguate the `profile-id-illegal` citation between §6.1 (character
 * set) and §6.2 (length ceiling) by which sub-rule actually failed.
 */
export function profileIdIllegalCitation(reason: "charset" | "length"): string {
  return reason === "charset" ? PROFILE_ID_CHARSET_CITATION : PROFILE_ID_LENGTH_CITATION;
}

/**
 * One citation per non-schema, non-structural finding kind.
 * `"schema-conformance-violation"` cites the vendored schema+SHA URL
 * (`schema.ts`, not this file); `"profile-parse-error"` is structural and
 * cites a fixed non-rubric literal (`index.ts`, WP03 T015) — neither is
 * representable here, so a missing entry is a compile error, not a silent
 * `undefined`.
 *
 * `"profile-id-illegal"`'s entry below is the §6.1 (charset) form, used as
 * the generic/default citation (e.g. by `citationFor`); `identity.ts` uses
 * `profileIdIllegalCitation()` directly to pick §6.1 vs §6.2 per violation.
 */
export const RUBRIC_CITATION: Record<
  Exclude<SkProfileFindingKind, "schema-conformance-violation" | "profile-parse-error">,
  string
> = {
  "handoff-unresolved": citation("§3.1", "handoff resolution"),
  "handoff-asymmetric": citation("§3.2", "handoff symmetry"),
  "reference-unresolved": citation("§4.1", "doctrine-reference resolution"),
  "reference-not-activated": citation("§4.2", "doctrine-reference activation"),
  "activation-config-unrecognized-shape": citation("§4.3", "doctrine-reference activation"),
  "context-source-missing": citation("§5.1", "context-sources integrity"),
  "profile-id-illegal": PROFILE_ID_CHARSET_CITATION,
  "profile-id-filename-mismatch": citation("§6.3", "profile-id-as-filename legality"),
  "profile-id-collision": citation("§6.4", "profile-id-as-filename legality"),
  "projection-output-missing": citation("§7.2", "projection drift"),
  "projection-hash-drift": citation("§7.3", "projection drift"),
};

/**
 * Index `RUBRIC_CITATION` by kind. Calling this with `"schema-conformance-
 * violation"` or `"profile-parse-error"` is a type error at the call
 * site — neither is representable in `RUBRIC_CITATION`.
 *
 * `"profile-id-illegal"` is also excluded here even though it *does* have a
 * `RUBRIC_CITATION` entry (the §6.1/charset form, used only as the generic
 * default value in the map above): routing a real `profile-id-illegal`
 * finding through this flat lookup would silently mis-cite §6.1 for a §6.2
 * (length) violation. `profileIdIllegalCitation("charset" | "length")` is
 * the only sanctioned path for that kind — narrowing this parameter type
 * turns "a future caller routes a length violation through `citationFor`"
 * into a compile error instead of a silent wrong citation.
 */
export function citationFor(
  kind: Exclude<SkProfileFindingKind, "schema-conformance-violation" | "profile-parse-error" | "profile-id-illegal">
): string {
  return RUBRIC_CITATION[kind];
}
