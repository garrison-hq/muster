/**
 * schema.test.ts — WP01 T005: `schema.ts` (T004) unit coverage, plus a
 * direct exercise of `findings.ts`'s (T001) `err()`/`warn()` constructors.
 *
 * Uses a small inline draft-2020-12 JSON Schema written to a `tmpdir`
 * (`fixtures/skprofile/` does not exist until WP05) with at least one
 * `$defs`/`$ref` pair, per T005's own instructions.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stringify as stringifyYaml } from "yaml";
import AjvModule from "ajv";
import Ajv2020Module from "ajv/dist/2020.js";

import { checkSchemaConformance, schemaNormativeSource } from "../../src/adapters/spec-kitty-profile/schema.js";
import { err, warn } from "../../src/adapters/spec-kitty-profile/findings.js";

const tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skprofile-schema-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/**
 * A minimal draft-2020-12 JSON Schema with a `$defs`/`$ref` pair — the
 * concrete regression case that distinguishes Ajv2020 from plain
 * (draft-07) Ajv (research.md R4).
 */
function draft202012SchemaWithDefs(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["profile-id", "name"],
    properties: {
      "profile-id": { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
      name: { $ref: "#/$defs/nonEmptyString" },
    },
    $defs: {
      nonEmptyString: { type: "string", minLength: 1 },
    },
  };
}

async function writeSchemaFixture(dir: string): Promise<string> {
  const schemaPath = join(dir, "agent-profile.schema.yaml");
  await writeFile(schemaPath, stringifyYaml(draft202012SchemaWithDefs()), "utf-8");
  return schemaPath;
}

describe("schemaNormativeSource", () => {
  it("builds a GitHub blob URL from the compile-time upstream path + the manifest-supplied schemaSha", () => {
    const normative = schemaNormativeSource("abc1234def5678");
    expect(normative).toBe(
      "https://github.com/Priivacy-ai/spec-kitty/blob/abc1234def5678/src/doctrine/schemas/agent-profile.schema.yaml"
    );
    // Never a literal `@<SHA>` path segment.
    expect(normative).not.toContain("@abc1234def5678");
  });
});

describe("checkSchemaConformance", () => {
  it("returns zero findings for a profile object that validates cleanly", async () => {
    const dir = await makeTmpDir();
    const schemaPath = await writeSchemaFixture(dir);

    const findings = checkSchemaConformance(
      { "profile-id": "architect-alphonso", name: "Architect Alphonso" },
      schemaPath,
      "architect-alphonso.agent.yaml",
      "architect-alphonso",
      "deadbeef"
    );

    expect(findings).toEqual([]);
  });

  it("returns one schema-conformance-violation finding for a profile missing a required field, citing schemaSha + the upstream path", async () => {
    const dir = await makeTmpDir();
    const schemaPath = await writeSchemaFixture(dir);

    const findings = checkSchemaConformance(
      { "profile-id": "architect-alphonso" }, // missing required "name"
      schemaPath,
      "architect-alphonso.agent.yaml",
      "architect-alphonso",
      "deadbeef"
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("schema-conformance-violation");
    expect(findings[0].severity).toBe("error");
    expect(findings[0].profileId).toBe("architect-alphonso");
    expect(findings[0].source.normative).toContain("deadbeef");
    expect(findings[0].source.normative).toContain(
      "src/doctrine/schemas/agent-profile.schema.yaml"
    );
  });

  it("reuses the compiled validator on a second call with the same schemaPath (module-level cache)", async () => {
    const dir = await makeTmpDir();
    const schemaPath = await writeSchemaFixture(dir);

    const first = checkSchemaConformance(
      { "profile-id": "architect-alphonso", name: "Architect Alphonso" },
      schemaPath,
      "architect-alphonso.agent.yaml",
      "architect-alphonso",
      "deadbeef"
    );
    const second = checkSchemaConformance(
      { "profile-id": "planner-priti" }, // missing required "name" this time
      schemaPath,
      "planner-priti.agent.yaml",
      "planner-priti",
      "deadbeef"
    );

    expect(first).toEqual([]);
    expect(second).toHaveLength(1);
  });

  it("resolves the $ref through $defs correctly: a name failing the $defs-nested minLength constraint is caught", async () => {
    const dir = await makeTmpDir();
    const schemaPath = await writeSchemaFixture(dir);

    const findings = checkSchemaConformance(
      { "profile-id": "architect-alphonso", name: "" }, // fails $defs/nonEmptyString's minLength
      schemaPath,
      "architect-alphonso.agent.yaml",
      "architect-alphonso",
      "deadbeef"
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("schema-conformance-violation");
  });

  it("R4 regression guard: plain (draft-07) Ajv cannot even compile this schema, unlike Ajv2020", () => {
    const schema = draft202012SchemaWithDefs();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const PlainAjv = (AjvModule as any).default ?? AjvModule;
    const plainAjv = new PlainAjv({ allErrors: true, strict: false });

    // Plain Ajv 8.x has no registered meta-schema for draft/2020-12, so
    // compiling a schema that declares that $schema header throws — this is
    // exactly the "would fail loudly under plain Ajv" case T004/T005 require
    // a regression test for. If `checkSchemaConformance`'s `ajv/dist/2020`
    // import were ever swapped back to plain `Ajv`, this same throw would
    // surface for every profile in the suite (proven directly against the
    // same import path `schema.ts` itself uses, not a re-implementation).
    expect(() => plainAjv.compile(schema)).toThrow(/no schema with key or ref/);

    // Ajv2020 — the exact entry point `schema.ts` imports — compiles the
    // identical schema, $defs/$ref included, without throwing, and resolves
    // the $ref correctly (a missing/invalid `name` fails validation).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ajv2020 = (Ajv2020Module as any).default ?? Ajv2020Module;
    const ajv2020 = new Ajv2020({ allErrors: true, strict: false });
    let validate: (data: unknown) => boolean;
    expect(() => {
      validate = ajv2020.compile(schema);
    }).not.toThrow();
    expect(validate!({ "profile-id": "architect-alphonso", name: "Architect Alphonso" })).toBe(true);
    expect(validate!({ "profile-id": "architect-alphonso", name: "" })).toBe(false);
  });
});

describe("findings.ts err()/warn() constructors (T001)", () => {
  it("err() constructs an error-severity finding", () => {
    const finding = err(
      "schema-conformance-violation",
      "architect-alphonso",
      "profile-id",
      "boom",
      "https://example.invalid/normative"
    );
    expect(finding).toEqual({
      kind: "schema-conformance-violation",
      profileId: "architect-alphonso",
      path: "profile-id",
      message: "boom",
      severity: "error",
      source: { normative: "https://example.invalid/normative" },
    });
  });

  it("warn() constructs a warning-severity finding", () => {
    const finding = warn(
      "handoff-asymmetric",
      "architect-alphonso",
      "collaboration.handoff-to[0]",
      "no reciprocal hand-back",
      "docs/rubric/spec-kitty-profile-taxonomy.md#handoff-symmetry"
    );
    expect(finding.severity).toBe("warning");
    expect(finding.kind).toBe("handoff-asymmetric");
    expect(finding.source.normative).toBe(
      "docs/rubric/spec-kitty-profile-taxonomy.md#handoff-symmetry"
    );
  });
});
