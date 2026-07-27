/**
 * schema.ts — FR-002: Ajv2020 schema-conformance check against the
 * SHA-pinned vendored `agent-profile.schema.yaml` (WP01 T004).
 *
 * Critical import (research.md R4): the upstream schema's own header is
 * `$schema: https://json-schema.org/draft/2020-12/schema`. Ajv 8.x's
 * default export only supports draft-07, so this module imports the
 * `ajv/dist/2020` entry point instead — the same `.default ?? Module`
 * CJS/ESM interop idiom `src/adapters/openclaw-sop/manifest.ts:15-17` uses
 * for plain `Ajv`, applied here to the 2020 entry point (an independently
 * verified requirement of *this* schema's own `$schema` header, not
 * borrowed from `openclaw-sop`'s own draft-07 usage).
 *
 * C-001/C-003: no import from `src/core/` or from `spec-kitty`; the schema
 * file is read as a plain local file, never fetched over the network.
 */

import { readFileSync } from "node:fs";
import Ajv2020Module from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";

import { err, type SkProfileFinding } from "./findings.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Ajv2020 = (Ajv2020Module as any).default ?? Ajv2020Module;

interface AjvValidateFunction {
  (data: unknown): boolean;
  errors?: Array<{ instancePath: string; message?: string }> | null;
}

interface AjvInstance {
  compile: (schema: unknown) => AjvValidateFunction;
}

/**
 * SK's own stable repo-relative path to the schema file (research.md R7).
 * A compile-time constant combined with the manifest-supplied `schemaSha` —
 * never a literal `@<SHA>` path segment, and never read from the schema
 * file's own `$comment` (spec.md's Dependencies & Assumptions explicitly
 * rejects that alternative).
 */
const SCHEMA_UPSTREAM_PATH = "src/doctrine/schemas/agent-profile.schema.yaml";

/** Build `source.normative` for schema-conformance findings (FR-002, research.md R7). */
export function schemaNormativeSource(schemaSha: string): string {
  return `https://github.com/Priivacy-ai/spec-kitty/blob/${schemaSha}/${SCHEMA_UPSTREAM_PATH}`;
}

// Module-level compiled-validator cache, keyed by `schemaPath` — a run only
// ever uses one schema, so a single-entry cache is sufficient (no
// over-engineered multi-schema cache).
const compiledValidatorCache = new Map<string, AjvValidateFunction>();

function compileSchemaAt(schemaPath: string): AjvValidateFunction {
  const cached = compiledValidatorCache.get(schemaPath);
  if (cached !== undefined) return cached;

  const raw = readFileSync(schemaPath, "utf-8");
  const schema: unknown = parseYaml(raw);

  const ajv = new Ajv2020({ allErrors: true, strict: false }) as AjvInstance;
  const validate = ajv.compile(schema);
  compiledValidatorCache.set(schemaPath, validate);
  return validate;
}

/**
 * FR-002: validate `rawProfileYaml` (the raw, un-narrowed parsed YAML
 * object — never `profile.ts`'s narrowed `AgentProfile`) against the
 * compiled schema at `schemaPath`. Every Ajv error maps to one
 * `schema-conformance-violation` finding.
 *
 * A profile whose YAML failed to parse is never routed here (there is no
 * raw object to validate) — it surfaces via a separate `profile-parse-error`
 * finding elsewhere (WP03's `index.ts`), never from this module.
 *
 * *(Deviation from the WP01 prompt's literal T004 step-4 signature, which
 * lists `(rawProfileYaml, filePath, profileId, schemaSha)` with no
 * `schemaPath` parameter: step 3 of the same subtask requires reading and
 * compiling the schema file at `schemaPath`, keyed by `schemaPath`, which is
 * unimplementable without `schemaPath` reaching this function. `schemaPath`
 * is added here as the second parameter to reconcile that internal
 * contradiction; flagged for reviewer attention rather than silently
 * resolved.)*
 */
export function checkSchemaConformance(
  rawProfileYaml: unknown,
  schemaPath: string,
  filePath: string,
  profileId: string,
  schemaSha: string
): SkProfileFinding[] {
  const validate = compileSchemaAt(schemaPath);
  const valid = validate(rawProfileYaml);
  if (valid) return [];

  const normative = schemaNormativeSource(schemaSha);
  return (validate.errors ?? []).map((ajvError) =>
    err(
      "schema-conformance-violation",
      profileId,
      ajvError.instancePath.trim().length > 0 ? ajvError.instancePath.trim() : "(root)",
      `${filePath}: ${ajvError.message ?? "schema validation failed"}`,
      normative
    )
  );
}
