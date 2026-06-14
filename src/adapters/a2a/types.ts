/**
 * A2A adapter manifest types and manifest loader.
 *
 * Implements FR-002 (manifest contract) and mirrors the heartbeat adapter's
 * manifest/summary model so the CLI and report machinery compose unchanged.
 *
 * All output is deterministic and byte-stable: no Date, no random, no locale sorts.
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";

// ---------------------------------------------------------------------------
// Manifest types (data-model.md, contracts/manifest-and-report.md)
// ---------------------------------------------------------------------------

/**
 * Discriminates the grading class for each manifest case.
 *
 * - "static-lint"       — offline, deterministic (FR-003, FR-004, FR-005)
 * - "skill-behavior"    — k-of-n live probe (FR-006); skipped if env unset
 * - "auth-negative"     — live auth-enforcement check (FR-007); skipped if env unset
 * - "signed-card-live"  — optional live signed-card check (FR-008); skipped if env unset
 */
export type GradingClass =
  | "static-lint"
  | "skill-behavior"
  | "auth-negative"
  | "signed-card-live";

/**
 * One row of the test manifest. Discriminated by `gradingClass`.
 * Mirrors heartbeat's ManifestCase so the CLI/runner compose unchanged (FR-002).
 */
export interface ManifestCase {
  id: string;
  description: string;
  /** Fixture path or "well-known" (fetch from MUSTER_A2A_ENDPOINT at runtime). */
  cardSource: string;
  gradingClass: GradingClass;
  /** Skill-behavior probe params (gradingClass: "skill-behavior"). */
  skillProbe?: {
    skillId: string;
    input: string;
    expect: string;
  };
  /** Auth-enforcement probe params (gradingClass: "auth-negative"). */
  auth?: {
    scheme: string;
    method: string;
    authorized: boolean;
  };
  /** Signed-card check params (gradingClass: "static-lint" | "signed-card-live"). */
  signed?: {
    jwksSource: string;
    expectVerified: boolean;
  };
  /** Number of runs for k-of-n grading (gradingClass: "skill-behavior"). */
  runs?: number;
  /** Minimum pass fraction for k-of-n grading (gradingClass: "skill-behavior"). */
  passThreshold?: number;
  /** When true: a rigged-impossible discrimination control (FR-011). Must fail. */
  control?: boolean;
  /**
   * Optional override for the `discoveredFrom` value passed to parseAgentCard
   * for static-lint cases. When set, this URI is used instead of the file path
   * from cardSource — allowing controls to supply a /.well-known/agent.json URL
   * so the §8.2 obsolete-URI rule fires. Additive and optional; ignored for live
   * grading classes.
   *
   * Citation: A2A spec v1.0.0 protobuf a2a.proto §8.2; muster FR-003.
   */
  discoveredFrom?: string;
  /** Per-class expected outcome (used by each grader). */
  expectation: Record<string, unknown>;
}

/**
 * Result for one manifest case.
 * Mirrors heartbeat's CaseResult so the CLI/report compose unchanged.
 */
export interface CaseResult {
  id: string;
  description: string;
  gradingClass: GradingClass;
  passed: boolean;
  skipped: boolean;
  skipReason?: string;
  detail?: Record<string, unknown>;
}

/**
 * Full manifest run summary.
 * Mirrors heartbeat's ManifestSummary so the CLI/report compose unchanged.
 *
 * Exit-code contract (FR-012): failed > 0 → exit 1; otherwise exit 0.
 * Skipped never flips the exit code.
 */
export interface ManifestSummary {
  totalCases: number;
  passed: number;
  failed: number;
  skipped: number;
  results: CaseResult[];
}

/** The top-level A2A test manifest. */
export interface A2aManifest {
  adapter: "a2a";
  cases: ManifestCase[];
}

// ---------------------------------------------------------------------------
// Manifest loader (FR-002)
// ---------------------------------------------------------------------------

/**
 * Load and validate an A2A test manifest from a JSON file.
 *
 * Throws a clear Error (exit-code 2 in the CLI, FR-012) when:
 * - The file cannot be read.
 * - The content is not valid JSON.
 * - The `adapter` field is not "a2a".
 * - The `cases` array is missing or not an array.
 *
 * Relative `cardSource` paths in each case are resolved against the manifest
 * file's directory so tests can use relative fixture paths.
 *
 * @param manifestPath - Absolute or resolvable path to the manifest JSON file.
 */
export function loadManifest(manifestPath: string): A2aManifest {
  const absPath = resolvePath(manifestPath);

  let rawContent: string;
  try {
    rawContent = readFileSync(absPath, "utf-8");
  } catch (err) {
    throw new Error(
      `A2A manifest: cannot read file at ${absPath}: ${String(err)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent) as unknown;
  } catch {
    throw new Error(
      `A2A manifest: file at ${absPath} is not valid JSON`
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `A2A manifest: file at ${absPath} must be a JSON object`
    );
  }

  const obj = parsed as Record<string, unknown>;

  if (obj["adapter"] !== "a2a") {
    throw new Error(
      `A2A manifest: expected adapter "a2a" but got "${String(obj["adapter"])}" in ${absPath}`
    );
  }

  if (!Array.isArray(obj["cases"])) {
    throw new TypeError(
      `A2A manifest: missing or invalid "cases" array in ${absPath}`
    );
  }

  const manifestDir = dirname(absPath);

  const cases: ManifestCase[] = (obj["cases"] as unknown[]).map(
    (c, index) => resolveManifestCase(c, index, absPath, manifestDir)
  );

  return { adapter: "a2a", cases };
}

/** Extract a plain-object field from a raw case object, or undefined if absent/invalid. */
function extractPlainObject(
  obj: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  const val = obj[key];
  if (typeof val === "object" && val !== null && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return undefined;
}

/** Extract a string field, falling back to `fallback` when absent or non-string. */
function extractString(obj: Record<string, unknown>, key: string, fallback: string): string {
  const val = obj[key];
  return typeof val === "string" ? val : fallback;
}

/** Parse the optional `skillProbe` block from a raw case object. */
function parseSkillProbe(
  obj: Record<string, unknown>
): ManifestCase["skillProbe"] {
  const sp = extractPlainObject(obj, "skillProbe");
  if (sp === undefined) return undefined;
  return {
    skillId: extractString(sp, "skillId", ""),
    input: extractString(sp, "input", ""),
    expect: extractString(sp, "expect", ""),
  };
}

/** Parse the optional `auth` block from a raw case object. */
function parseAuthBlock(obj: Record<string, unknown>): ManifestCase["auth"] {
  const auth = extractPlainObject(obj, "auth");
  if (auth === undefined) return undefined;
  return {
    scheme: extractString(auth, "scheme", ""),
    method: extractString(auth, "method", ""),
    authorized: Boolean(auth["authorized"]),
  };
}

/** Parse the optional `signed` block from a raw case object. */
function parseSignedBlock(obj: Record<string, unknown>): ManifestCase["signed"] {
  const signed = extractPlainObject(obj, "signed");
  if (signed === undefined) return undefined;
  return {
    jwksSource: extractString(signed, "jwksSource", ""),
    expectVerified: Boolean(signed["expectVerified"]),
  };
}

/** Resolve `cardSource` to an absolute path (or preserve "well-known"). */
function resolveCardSource(obj: Record<string, unknown>, manifestDir: string): string {
  const raw = extractString(obj, "cardSource", "");
  if (raw === "well-known" || raw.startsWith("/")) return raw;
  return resolvePath(manifestDir, raw);
}

/** Parse the `expectation` object from a raw case, defaulting to {}. */
function parseExpectation(obj: Record<string, unknown>): Record<string, unknown> {
  return extractPlainObject(obj, "expectation") ?? {};
}

/**
 * Resolve and validate a single manifest case entry.
 * Resolves relative `cardSource` paths against the manifest directory.
 */
function resolveManifestCase(
  raw: unknown,
  index: number,
  manifestPath: string,
  manifestDir: string
): ManifestCase {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(
      `A2A manifest: cases[${index}] must be an object in ${manifestPath}`
    );
  }

  const obj = raw as Record<string, unknown>;

  const id = extractString(obj, "id", `case-${index}`);
  const description = extractString(obj, "description", "");
  const gradingClass = obj["gradingClass"] as GradingClass;
  const expectation = parseExpectation(obj);
  const cardSource = resolveCardSource(obj, manifestDir);

  const kase: ManifestCase = { id, description, cardSource, gradingClass, expectation };

  const skillProbe = parseSkillProbe(obj);
  if (skillProbe !== undefined) kase.skillProbe = skillProbe;

  const auth = parseAuthBlock(obj);
  if (auth !== undefined) kase.auth = auth;

  const signed = parseSignedBlock(obj);
  if (signed !== undefined) kase.signed = signed;

  if (typeof obj["runs"] === "number") kase.runs = obj["runs"];
  if (typeof obj["passThreshold"] === "number") kase.passThreshold = obj["passThreshold"];
  if (typeof obj["control"] === "boolean") kase.control = obj["control"];
  if (typeof obj["discoveredFrom"] === "string") kase.discoveredFrom = obj["discoveredFrom"];

  return kase;
}
