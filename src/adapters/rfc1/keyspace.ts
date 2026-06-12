/**
 * RFC-1 two-layer validation (research R4).
 *
 * Layer 1 — `validateSchema`: the vendored Appendix E JSON Schema through Ajv
 * (Draft 2020-12, `strict: false` per research R3 because the spec's schema is
 * deliberately permissive).
 *
 * Layer 2 — `validateKeyspace` / `validateScalars` / `validateProfiles`: the
 * §25 conformance rules the permissive schema cannot express — keyspace
 * enforcement by mode, scalar typing on optional domains (§4.3), BCP-47
 * (§4.3.1), and profile rules (§9).
 *
 * `validate` composes both layers and deduplicates by (path, message).
 * All functions are pure: no I/O, no env access.
 *
 * Provenance: `./schema.json` is vendored **verbatim** from
 * `.kittify/reference/soul-spec.md` Appendix E (Soul.md RFC-1 1.0.0-rc1),
 * lines 2025–2159 of the vendored spec. Do not edit it; re-extract and diff
 * to verify byte fidelity.
 */

import { createRequire } from "node:module";
// The Ajv Draft 2020-12 build (research R3). The named class export is used
// instead of the default because ajv ships CJS and TS NodeNext does not model
// its `module.exports = class` reassignment as a constructable default.
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv/dist/2020.js";
import type { Mode } from "../../core/adapter.js";
import type { Violation } from "../../core/report.js";

// JSON import via createRequire: tsconfig (WP01-owned) has no
// `resolveJsonModule`, and the vendored artifact must stay a standalone .json
// file for byte-faithful diffing against Appendix E.
const requireJson = createRequire(import.meta.url);
const appendixESchema = requireJson("./schema.json") as Record<string, unknown>;

// Compiled once at module level (research R3): strict:false because Appendix E
// is intentionally permissive (`additionalProperties: true` throughout);
// allErrors so a single pass reports every schema violation.
const ajv = new Ajv2020({ strict: false, allErrors: true });
const compiledSchema: ValidateFunction = ajv.compile(appendixESchema);

/**
 * §25 mandatory keys (also §5.1). Note the spec discrepancy documented in the
 * WP03 risk register: Appendix E's `required` list for `kind: soul` includes
 * `profile_overrides`, while §25's mandatory list omits it (§9.2: REQUIRED but
 * MAY be omitted / treated as `{}`). We keep the schema authoritative for
 * *presence* (it is the spec's own artifact) and the keyspace authoritative
 * for *unknown-key classification*, so `profile_overrides` lives in
 * KNOWN_OPTIONAL below.
 */
export const MANDATORY: readonly string[] = [
  "soul_spec",
  "id",
  "name",
  "locale",
  "composition",
  "profiles",
  "values",
  "voice",
  "interaction",
  "safety",
  "extensions",
];

/**
 * §25 known-optional keys (Sections 5.1, 6–23) plus the §6.4 optional
 * metadata fields. `homepage` is listed by §6.4 (and therefore inside the
 * §25 keyspace) even though the WP enumeration omitted it — the vendored
 * spec is the single source of truth.
 */
export const KNOWN_OPTIONAL: readonly string[] = [
  "kind",
  "profile_overrides",
  "relationship",
  "examples",
  "identity",
  "cognition",
  "planning",
  "verification",
  "uncertainty",
  "decisions",
  "response",
  "social",
  "memory",
  "actions",
  "presentation",
  "state",
  "evaluation",
  // §6.4 optional metadata fields
  "version",
  "author",
  "description",
  "tags",
  "license",
  "homepage",
  "created",
  "updated",
];

const RFC1_KEYSPACE: ReadonlySet<string> = new Set([
  ...MANDATORY,
  ...KNOWN_OPTIONAL,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMixinDocument(data: unknown): boolean {
  return isRecord(data) && data["kind"] === "mixin";
}

/** Unescape one RFC 6901 JSON-pointer segment (`~1` → `/`, `~0` → `~`). */
function unescapePointerSegment(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

/** Convert an Ajv instancePath (`/a/b/0`) to a config path (`a.b[0]`). */
function pointerToConfigPath(instancePath: string): string {
  if (instancePath === "") return "";
  let out = "";
  for (const raw of instancePath.slice(1).split("/")) {
    const segment = unescapePointerSegment(raw);
    if (/^\d+$/.test(segment)) {
      out += `[${segment}]`;
    } else {
      out = out === "" ? segment : `${out}.${segment}`;
    }
  }
  return out;
}

/** Violation path for an Ajv error: instancePath; empty → offending key from params. */
function ajvErrorPath(error: ErrorObject): string {
  const base = pointerToConfigPath(error.instancePath);
  if (base !== "") return base;
  const params = error.params as Record<string, unknown>;
  const fromParams = params["missingProperty"] ?? params["additionalProperty"];
  if (typeof fromParams === "string" && fromParams !== "") return fromParams;
  return "(document)";
}

/**
 * Layer 1 — Appendix E schema validation via Ajv.
 *
 * `oneOf` noise filtering: Appendix E selects soul vs. mixin via a top-level
 * `oneOf`; unfiltered, every failure produces both branches' error sets. We
 * keep only the branch matching the document's `kind` (mixin branch is index
 * 1) and drop the redundant `oneOf` summary error.
 */
export function validateSchema(data: unknown): Violation[] {
  if (compiledSchema(data)) return [];
  const errors = compiledSchema.errors ?? [];

  const branchPrefix = isMixinDocument(data) ? "#/oneOf/1" : "#/oneOf/0";
  let relevant = errors.filter((error) => {
    if (error.keyword === "oneOf") return false; // summary; branch errors carry the detail
    if (!error.schemaPath.startsWith("#/oneOf/")) return true; // top-level (non-branch) errors
    return error.schemaPath.startsWith(branchPrefix);
  });
  // Safety net: never swallow a failure entirely (permissive-mode invariant —
  // a problem is at worst downgraded, never dropped).
  if (relevant.length === 0) relevant = errors;

  return relevant.map((error) => ({
    path: ajvErrorPath(error),
    message: error.message ?? `schema violation (${error.keyword})`,
    severity: "error" as const,
    section: "Appendix E",
  }));
}

/**
 * Layer 2 — §25 keyspace enforcement.
 *
 * Unknown top-level keys (outside MANDATORY ∪ KNOWN_OPTIONAL; `extensions`
 * *content* is nested under the `extensions` key and therefore never a
 * top-level key) are rejected in strict mode and downgraded to a warning in
 * permissive mode — never silently dropped (§25).
 *
 * Known-optional keys are ALWAYS accepted, in both modes, even where muster
 * does not implement them (§25 critical distinction: a strict runtime must
 * not reject valid RFC-1 documents that use optional features it lacks).
 *
 * Mixin documents (§25): the keyspace check applies to whatever keys are
 * present; mandatory-core absence is NOT an error here (presence is the
 * schema layer's job, and the mixin branch only requires soul_spec/id/kind).
 */
export function validateKeyspace(data: unknown, mode: Mode): Violation[] {
  if (!isRecord(data)) return [];
  const violations: Violation[] = [];
  for (const key of Object.keys(data)) {
    if (!RFC1_KEYSPACE.has(key)) {
      violations.push({
        path: key,
        message: "unknown top-level key outside RFC-1 keyspace",
        severity: mode === "strict" ? "error" : "warning",
        section: "§25",
      });
    }
  }
  return violations;
}

/** Documented percent (integer 0..100) locations — §4.3, §13, §14, §21. */
const PERCENT_LOCATIONS: ReadonlyArray<readonly string[]> = [
  ["voice", "formality"],
  ["voice", "warmth"],
  ["voice", "verbosity"],
  ["voice", "jargon"],
  ["voice", "examples_budget"],
  ["interaction", "ask_threshold"],
  ["evaluation", "scoring", "pass_threshold"],
];

/** Documented float01 locations — §19 (`presentation.tts`). */
const FLOAT01_LOCATIONS: ReadonlyArray<readonly string[]> = [
  ["presentation", "tts", "stability"],
  ["presentation", "tts", "expressiveness"],
];

/** §21: evaluation.scoring.method enum (beyond Appendix E's reach). */
const SCORING_METHODS: ReadonlySet<string> = new Set([
  "rule_based",
  "llm_judge",
  "hybrid",
]);

/** Look up a nested value; distinguishes "absent" from "present but null/odd". */
function getAt(
  data: Record<string, unknown>,
  segments: readonly string[]
): { present: boolean; value: unknown } {
  let current: unknown = data;
  for (const segment of segments) {
    if (!isRecord(current) || !(segment in current)) {
      return { present: false, value: undefined };
    }
    current = current[segment];
  }
  return { present: true, value: current };
}

/** §4.3 percent check: integer in 0..100 inclusive. */
export function checkPercent(path: string, value: unknown): Violation[] {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100) {
    return [];
  }
  return [
    {
      path,
      message: `must be an integer percent in 0..100 (got ${JSON.stringify(value)})`,
      severity: "error",
      section: "§4.3",
    },
  ];
}

/** §4.3 float01 check: finite number in 0.0..1.0 inclusive. Exported for reuse. */
export function checkFloat01(path: string, value: unknown): Violation[] {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1) {
    return [];
  }
  return [
    {
      path,
      message: `must be a float in 0.0..1.0 (got ${JSON.stringify(value)})`,
      severity: "error",
      section: "§4.3",
    },
  ];
}

/**
 * §4.3.1 BCP-47 syntactic validity (research R5): `Intl.getCanonicalLocales`
 * throws RangeError on malformed tags. One supplement: ECMA-402 accepts 5–8
 * alpha primary language subtags (e.g. `english`), which §4.3.1 explicitly
 * names invalid — so the primary subtag is additionally constrained to
 * 2–3 alpha (ISO 639 form, matching the spec's valid/invalid example sets).
 */
function isSyntacticallyValidBcp47(tag: string): boolean {
  try {
    Intl.getCanonicalLocales(tag);
  } catch {
    return false;
  }
  return /^[a-zA-Z]{2,3}(-|$)/.test(tag);
}

/**
 * §4.3.1 `locale` validation. Strict: malformed → error. Permissive: attempt
 * the spec-named normalization (`_` → `-`, e.g. `en_US` → `en-US`) — warning
 * if normalization succeeds, error if still invalid. Never silently dropped.
 */
function validateLocale(data: Record<string, unknown>, mode: Mode): Violation[] {
  const locale = data["locale"];
  if (typeof locale !== "string") return []; // absence/type is the schema layer's job
  if (isSyntacticallyValidBcp47(locale)) return [];

  if (mode === "permissive") {
    const normalized = locale.replaceAll("_", "-");
    if (normalized !== locale && isSyntacticallyValidBcp47(normalized)) {
      return [
        {
          path: "locale",
          message: `"${locale}" is not a valid BCP-47 tag; normalizes to "${normalized}"`,
          severity: "warning",
          section: "§4.3.1",
        },
      ];
    }
  }
  return [
    {
      path: "locale",
      message: `"${locale}" is not a syntactically valid BCP-47 language tag`,
      severity: "error",
      section: "§4.3.1",
    },
  ];
}

/**
 * Layer 2 — §4.3 scalar typing on documented locations (including optional
 * domains Appendix E does not bound, e.g. `evaluation`), §21 enum membership,
 * and §4.3.1 BCP-47 for `locale`. Applies to whatever keys are present, so it
 * covers mixins too (§25: "any provided fields are valid by type/range").
 */
export function validateScalars(data: unknown, mode: Mode): Violation[] {
  if (!isRecord(data)) return [];
  const violations: Violation[] = [];

  for (const segments of PERCENT_LOCATIONS) {
    const { present, value } = getAt(data, segments);
    if (present) violations.push(...checkPercent(segments.join("."), value));
  }

  for (const segments of FLOAT01_LOCATIONS) {
    const { present, value } = getAt(data, segments);
    if (present) violations.push(...checkFloat01(segments.join("."), value));
  }

  const method = getAt(data, ["evaluation", "scoring", "method"]);
  if (method.present && !(typeof method.value === "string" && SCORING_METHODS.has(method.value))) {
    violations.push({
      path: "evaluation.scoring.method",
      message: `must be one of "rule_based", "llm_judge", "hybrid" (got ${JSON.stringify(method.value)})`,
      severity: "error",
      section: "§21",
    });
  }

  violations.push(...validateLocale(data, mode));
  return violations;
}

/**
 * Layer 2 — §9 profile rules (FR-009). Applies only to `kind: soul`
 * documents (mixins do not carry profiles — §9.4, §25).
 */
export function validateProfiles(data: unknown): Violation[] {
  if (!isRecord(data) || isMixinDocument(data)) return [];
  const violations: Violation[] = [];

  const profiles = data["profiles"];
  if (Array.isArray(profiles)) {
    if (!profiles.includes("default")) {
      violations.push({
        path: "profiles",
        message: 'profiles must include "default"',
        severity: "error",
        section: "§9",
      });
    }
    const overrides = data["profile_overrides"];
    if (isRecord(overrides)) {
      for (const key of Object.keys(overrides)) {
        if (!profiles.includes(key)) {
          violations.push({
            path: `profile_overrides.${key}`,
            message: `profile_overrides key "${key}" is not present in profiles`,
            severity: "error",
            section: "§9",
          });
        }
      }
    }
  }
  return violations;
}

/** Deduplicate violations by (path, message); the first occurrence wins. */
export function dedupeViolations(violations: readonly Violation[]): Violation[] {
  const seen = new Set<string>();
  const out: Violation[] = [];
  for (const violation of violations) {
    const key = `${violation.path} ${violation.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(violation);
    }
  }
  return out;
}

/**
 * Full RFC-1 validation: Appendix E schema (layer 1), then the §25 keyspace,
 * §4.3/§4.3.1 scalar, and §9 profile rules (layer 2). Violations are
 * concatenated and deduplicated by (path, message). Pure; no I/O.
 */
export function validate(data: unknown, mode: Mode): Violation[] {
  return dedupeViolations([
    ...validateSchema(data),
    ...validateKeyspace(data, mode),
    ...validateScalars(data, mode),
    ...validateProfiles(data),
  ]);
}
