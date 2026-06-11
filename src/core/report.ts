/**
 * Core report vocabulary for the muster conformance harness.
 *
 * Shapes follow Soul.md RFC-1 §25.1 exactly (see
 * kitty-specs/cts1-conformance-harness-01KTS86B/contracts/conformance-report.schema.json).
 * `section` is a muster extension over §25.1: an RFC-1 citation (e.g. "§8.1"),
 * serialized only when present (charter directive 3).
 */

import type { Mode } from "./adapter.js";

export type Severity = "error" | "warning";

/** A single conformance finding. `path` and `message` are always non-empty (NFR-005). */
export interface Violation {
  /** Config path, e.g. `composition.extends[1]`. */
  path: string;
  /** Human-readable description. */
  message: string;
  /** Warnings never flip `ok`. */
  severity: Severity;
  /** RFC-1 citation, e.g. "§8.1" (muster extension, optional). */
  section?: string;
}

/** Serialized violation form used inside a ConformanceReport (§25.1 + section extension). */
export interface ReportViolation {
  path: string;
  message: string;
  section?: string;
}

/** Conformance report — RFC-1 §25.1 field set exactly. */
export interface ConformanceReport {
  /** Spec version, e.g. "1.0.0-rc1". */
  spec: string;
  /** From document `id`; "" if unparseable. */
  soul_id: string;
  mode: Mode;
  /** Selected profile, default "default". */
  profile: string;
  /** Active state or null. */
  state: string | null;
  /** false iff at least one error. */
  ok: boolean;
  errors: ReportViolation[];
  warnings: ReportViolation[];
}

/**
 * Serialize a Violation as `{path, message}` with `section` included only when set
 * (§25.1 shape; section is the muster extension).
 */
export function serializeViolation(violation: Violation): ReportViolation {
  const serialized: ReportViolation = {
    path: violation.path,
    message: violation.message,
  };
  if (violation.section !== undefined) {
    serialized.section = violation.section;
  }
  return serialized;
}

/**
 * Build a §25.1 ConformanceReport from raw violations.
 * `ok` is computed as `errors.length === 0` — warnings never flip `ok`.
 */
export function buildReport(opts: {
  spec: string;
  soulId: string;
  mode: Mode;
  profile: string;
  state: string | null;
  violations: readonly Violation[];
}): ConformanceReport {
  const errors = opts.violations
    .filter((v) => v.severity === "error")
    .map(serializeViolation);
  const warnings = opts.violations
    .filter((v) => v.severity === "warning")
    .map(serializeViolation);
  return {
    spec: opts.spec,
    soul_id: opts.soulId,
    mode: opts.mode,
    profile: opts.profile,
    state: opts.state,
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
