/**
 * findings.ts — the frozen finding vocabulary for the spec-kitty-profile
 * adapter (WP01 T001).
 *
 * Every check module in this mission (this WP's `schema.ts` and the later
 * WPs' handoff/reference/context-sources/identity/projection modules) emits
 * `SkProfileFinding` values exclusively through this module's `err()`/
 * `warn()` helpers, so the finding shape and the 13-kind vocabulary are
 * defined exactly once.
 *
 * `SkProfileFindingKind` is copied verbatim from data-model.md /
 * `contracts/spec-kitty-profile-report.schema.json`'s `finding.kind` enum —
 * frozen: do not invent, rename, or reorder any of the 13 values.
 *
 * C-001/C-003: this file imports nothing from `src/core/` and never shells
 * out to or imports from `spec-kitty` — it is a pure, dependency-free type +
 * factory module.
 */

export type SkProfileFindingKind =
  | "schema-conformance-violation"
  | "profile-parse-error"
  | "handoff-unresolved"
  | "handoff-asymmetric"
  | "reference-unresolved"
  | "reference-not-activated"
  | "activation-config-unrecognized-shape"
  | "context-source-missing"
  | "profile-id-illegal"
  | "profile-id-filename-mismatch"
  | "profile-id-collision"
  | "projection-output-missing"
  | "projection-hash-drift";

/**
 * A single conformance finding (data-model.md `SkProfileFinding`).
 *
 * `profileId` is `"(manifest)"` for manifest/schema-load-level findings not
 * tied to one profile. `source.normative` (FR-009) is always non-empty: the
 * schema+SHA URL for `schema-conformance-violation` (built in `schema.ts`),
 * or a `docs/rubric/spec-kitty-profile-taxonomy.md` §clause for every other
 * kind (WP02/WP04's job) — this module itself never hardcodes citation text,
 * only the shape.
 */
export interface SkProfileFinding {
  readonly kind: SkProfileFindingKind;
  readonly profileId: string;
  readonly path: string;
  readonly message: string;
  readonly severity: "error" | "warning";
  readonly source: { readonly normative: string };
}

/** Construct an error-severity finding. */
export function err(
  kind: SkProfileFindingKind,
  profileId: string,
  path: string,
  message: string,
  normative: string
): SkProfileFinding {
  return { kind, profileId, path, message, severity: "error", source: { normative } };
}

/** Construct a warning-severity finding. */
export function warn(
  kind: SkProfileFindingKind,
  profileId: string,
  path: string,
  message: string,
  normative: string
): SkProfileFinding {
  return { kind, profileId, path, message, severity: "warning", source: { normative } };
}
