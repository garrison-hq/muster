/**
 * Skills adapter — Ajv JSON Schema validator for SKILL.md frontmatter.
 *
 * JSON Schema Draft 2020-12 via Ajv validates the frontmatter object's
 * structural types before semantic rules run. Catches type mismatches early.
 *
 * C-001: no imports from src/core/ — Ajv instance is adapter-private.
 * FR-005: metadata object with string-only values is enforced here.
 */

// Use the Ajv2020 named export (CJS interop-safe; same pattern as rfc1/keyspace.ts).
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv/dist/2020.js";

// Compile schema once at module load.
const ajv = new Ajv2020({ allErrors: true });

const FRONTMATTER_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    license: { type: "string" },
    compatibility: { type: "string" },
    metadata: {
      type: "object",
      additionalProperties: { type: "string" },
    },
    "allowed-tools": { type: "string" },
  },
  required: ["name", "description"],
  additionalProperties: true,
} as const;

const compiledValidator = ajv.compile(FRONTMATTER_SCHEMA);

/**
 * Structural schema for the `muster skills run` manifest (FR-003).
 *
 * Covers the case-shape union (`static` | `behavioral`) via `allOf`/`if`/
 * `then` conditionals: each branch requires its own fields, and every case
 * requires `id`, `type`, `skillDir`, and `profile` regardless of branch.
 * `expectations.ok` is constrained to `boolean` so a manifest that declares
 * it as a string (or any other non-boolean) fails schema validation before
 * any case executes, rather than being silently coerced or dereferenced
 * incorrectly deep inside a case runner.
 *
 * Structural only — does not duplicate `checkLayout`/`validateSkill`'s own
 * semantic rules, and does not validate `expectations.violations` entries'
 * shape (the case runner never compares them; only `expectations.ok` drives
 * pass/fail).
 */
const SKILLS_MANIFEST_SCHEMA = {
  type: "object",
  required: ["cases"],
  additionalProperties: true,
  properties: {
    cases: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "type", "skillDir", "profile"],
        additionalProperties: true,
        properties: {
          id: { type: "string", minLength: 1 },
          type: { type: "string", enum: ["static", "behavioral"] },
          skillDir: { type: "string", minLength: 1 },
          profile: { type: "string", enum: ["base", "anthropic"] },
          expectations: {
            type: "object",
            required: ["ok"],
            additionalProperties: true,
            properties: {
              ok: { type: "boolean" },
              violations: { type: "array" },
            },
          },
          querySetPath: { type: "string", minLength: 1 },
          runsPerQuery: { type: "integer", minimum: 1 },
          threshold: { type: "number" },
          isControl: { type: "boolean" },
        },
        allOf: [
          {
            if: { properties: { type: { const: "static" } }, required: ["type"] },
            then: { required: ["expectations"] },
          },
          {
            if: { properties: { type: { const: "behavioral" } }, required: ["type"] },
            then: {
              required: ["querySetPath", "runsPerQuery", "threshold", "isControl"],
            },
          },
        ],
      },
    },
  },
} as const;

const compiledManifestValidator = ajv.compile(SKILLS_MANIFEST_SCHEMA);

/**
 * Validate a parsed `muster skills run` manifest against
 * {@link SKILLS_MANIFEST_SCHEMA} (FR-003).
 *
 * Throws a plain `Error` naming the offending field(s) on failure — mirrors
 * `openclaw-sop/manifest.ts:loadAndValidateManifest`'s own
 * throw-then-CLI-rewraps pattern (the CLI wraps this in its existing
 * `ExecutionError` → exit 2 path; this function itself never touches
 * process exit codes).
 */
export function validateManifest(parsed: unknown): void {
  const valid = compiledManifestValidator(parsed);
  if (valid) {
    return;
  }
  const msgs = (compiledManifestValidator.errors ?? [])
    .map((ajvErr: ErrorObject) => {
      const path = ajvErr.instancePath.length > 0 ? ajvErr.instancePath.slice(1) : "(root)";
      return `${path} ${ajvErr.message ?? "schema validation error"}`;
    })
    .join("; ");
  throw new Error(`skills manifest schema validation failed: ${msgs}`);
}

/**
 * Validate the frontmatter object's structural types.
 *
 * Returns `{ valid: true, errors: [] }` on success or
 * `{ valid: false, errors: [...] }` with AJV-mapped errors.
 *
 * FR-005: metadata with non-string values → error at path `metadata/<key>`.
 */
export function validateSchema(frontmatter: unknown): {
  valid: boolean;
  errors: { path: string; message: string }[];
} {
  const valid = compiledValidator(frontmatter);
  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (compiledValidator.errors ?? []).map((ajvErr: ErrorObject) => {
    let errPath: string;
    if (ajvErr.keyword === "required" && ajvErr.params && typeof (ajvErr.params as Record<string, unknown>)["missingProperty"] === "string") {
      // For required property errors, instancePath is empty; use the missing property name.
      errPath = (ajvErr.params as Record<string, unknown>)["missingProperty"] as string;
    } else if (ajvErr.instancePath.length > 0) {
      // instancePath looks like "/metadata/someKey"; trim the leading `/`.
      errPath = ajvErr.instancePath.slice(1);
    } else {
      errPath = "(document)";
    }
    const message = ajvErr.message ?? "schema validation error";
    return { path: errPath, message };
  });

  return { valid: false, errors };
}
