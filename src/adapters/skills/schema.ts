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
