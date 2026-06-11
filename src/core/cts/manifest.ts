/**
 * CTS manifest loader — RFC-1 Appendix F.1 field set plus the muster
 * `expect_effective_json` extension (research R8; contracts/cts-manifest.md).
 *
 * Manifests are muster's own artifacts (not Soul-YAML), so a plain `yaml`
 * parse is used and validation is ALWAYS strict: unknown fields are errors
 * regardless of the conformance mode the cases themselves request.
 *
 * Spec-agnostic: this module names no concrete spec adapter (C-004 holds for
 * the whole `src/core/cts/` surface).
 */

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Mode } from "../adapter.js";
import type { Violation } from "../report.js";

/** One `expect_errors` entry: `path` exact match, `message` substring (contract). */
export interface CtsExpectedError {
  path: string;
  message: string;
}

/**
 * A validated manifest case (Appendix F.1 + R8 extension). `root`,
 * `expect_effective_yaml` and `expect_effective_json` are stored as ABSOLUTE
 * paths, resolved against the manifest's directory — never the process cwd.
 */
export interface CtsCase {
  /** Unique within the manifest. */
  id: string;
  /** Absolute path to the root Soul.md. */
  root: string;
  profile?: string;
  /** Runtime-requested state (§20.1). */
  state?: string;
  mode: Mode;
  expect_ok: boolean;
  /** F.1 key: YAML loaded → canonicalized → compared (absolute path). */
  expect_effective_yaml?: string;
  /** Muster extension (R8): canonical-JSON file, byte compare (absolute path). */
  expect_effective_json?: string;
  expect_errors?: CtsExpectedError[];
}

/** Appendix F.1 field set + the R8 extension; anything else is an error. */
const KNOWN_FIELDS = new Set([
  "id",
  "root",
  "profile",
  "state",
  "mode",
  "expect_ok",
  "expect_effective_yaml",
  "expect_effective_json",
  "expect_errors",
]);

const EXPECTED_ERROR_FIELDS = new Set(["path", "message"]);

/** Type guard for `loadManifest`'s union result: true means manifest errors. */
export function isManifestError(
  result: CtsCase[] | Violation[]
): result is Violation[] {
  return result.length > 0 && "severity" in (result[0] as object);
}

function violation(path: string, message: string): Violation {
  return { path, message, severity: "error", section: "Appendix F.1" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Resolve a manifest-relative path against the manifest's directory (T021 step 3). */
function resolveFromManifest(manifestDir: string, ref: string): string {
  return isAbsolute(ref) ? ref : resolvePath(manifestDir, ref);
}

function validateEntry(
  entry: unknown,
  index: number,
  manifestDir: string,
  errors: Violation[]
): CtsCase | null {
  const where = `manifest[${index}]`;
  if (!isRecord(entry)) {
    errors.push(violation(where, "manifest entry must be a mapping of Appendix F.1 fields"));
    return null;
  }

  for (const key of Object.keys(entry)) {
    if (!KNOWN_FIELDS.has(key)) {
      errors.push(
        violation(
          `${where}.${key}`,
          `unknown manifest field "${key}" (manifests are strict; Appendix F.1 fields plus expect_effective_json only)`
        )
      );
    }
  }

  const startCount = errors.length;

  const id = entry["id"];
  if (typeof id !== "string" || id.length === 0) {
    errors.push(violation(`${where}.id`, "required field \"id\" must be a non-empty string"));
  }
  const root = entry["root"];
  if (typeof root !== "string" || root.length === 0) {
    errors.push(violation(`${where}.root`, "required field \"root\" must be a non-empty string"));
  }
  const mode = entry["mode"];
  if (mode !== "strict" && mode !== "permissive") {
    errors.push(
      violation(`${where}.mode`, 'required field "mode" must be "strict" or "permissive"')
    );
  }
  const expectOk = entry["expect_ok"];
  if (typeof expectOk !== "boolean") {
    errors.push(violation(`${where}.expect_ok`, 'required field "expect_ok" must be a boolean'));
  }

  for (const optional of ["profile", "state", "expect_effective_yaml", "expect_effective_json"] as const) {
    const value = entry[optional];
    if (value !== undefined && typeof value !== "string") {
      errors.push(violation(`${where}.${optional}`, `optional field "${optional}" must be a string`));
    }
  }

  if (
    entry["expect_effective_yaml"] !== undefined &&
    entry["expect_effective_json"] !== undefined
  ) {
    errors.push(
      violation(
        where,
        "both expect_effective_yaml and expect_effective_json present — declare one comparison form"
      )
    );
  }

  let expectErrors: CtsExpectedError[] | undefined;
  const rawExpectErrors = entry["expect_errors"];
  if (rawExpectErrors !== undefined) {
    if (!Array.isArray(rawExpectErrors)) {
      errors.push(
        violation(`${where}.expect_errors`, 'optional field "expect_errors" must be a list of {path, message}')
      );
    } else {
      expectErrors = [];
      rawExpectErrors.forEach((raw, errorIndex) => {
        const errorWhere = `${where}.expect_errors[${errorIndex}]`;
        if (!isRecord(raw)) {
          errors.push(violation(errorWhere, "expect_errors entry must be a {path, message} mapping"));
          return;
        }
        for (const key of Object.keys(raw)) {
          if (!EXPECTED_ERROR_FIELDS.has(key)) {
            errors.push(
              violation(`${errorWhere}.${key}`, `unknown expect_errors field "${key}" (only path and message)`)
            );
          }
        }
        if (typeof raw["path"] !== "string" || typeof raw["message"] !== "string") {
          errors.push(
            violation(errorWhere, "expect_errors entry requires string \"path\" and string \"message\"")
          );
          return;
        }
        expectErrors?.push({ path: raw["path"], message: raw["message"] });
      });
    }
  }

  if (errors.length > startCount) {
    return null;
  }

  const ctsCase: CtsCase = {
    id: id as string,
    root: resolveFromManifest(manifestDir, root as string),
    mode: mode as Mode,
    expect_ok: expectOk as boolean,
  };
  if (typeof entry["profile"] === "string") ctsCase.profile = entry["profile"];
  if (typeof entry["state"] === "string") ctsCase.state = entry["state"];
  if (typeof entry["expect_effective_yaml"] === "string") {
    ctsCase.expect_effective_yaml = resolveFromManifest(manifestDir, entry["expect_effective_yaml"]);
  }
  if (typeof entry["expect_effective_json"] === "string") {
    ctsCase.expect_effective_json = resolveFromManifest(manifestDir, entry["expect_effective_json"]);
  }
  if (expectErrors !== undefined) ctsCase.expect_errors = expectErrors;
  return ctsCase;
}

/**
 * Load and validate `cts/manifest.yaml` (Appendix F.1).
 *
 * Returns the validated cases — with `root` and expectation paths resolved to
 * absolute paths against the manifest's directory — or the full list of
 * manifest errors as Violations. Use `isManifestError` to discriminate.
 */
export async function loadManifest(path: string): Promise<CtsCase[] | Violation[]> {
  const manifestPath = isAbsolute(path) ? path : resolvePath(path);
  const manifestDir = dirname(manifestPath);

  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return [violation("manifest", `cannot read manifest "${manifestPath}": ${reason}`)];
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return [violation("manifest", `manifest is not valid YAML: ${reason}`)];
  }

  if (!Array.isArray(parsed)) {
    return [violation("manifest", "manifest must be a YAML list of test cases (Appendix F.1)")];
  }

  const errors: Violation[] = [];
  const cases: CtsCase[] = [];
  const firstIndexById = new Map<string, number>();

  parsed.forEach((entry, index) => {
    const ctsCase = validateEntry(entry, index, manifestDir, errors);
    if (ctsCase === null) {
      return;
    }
    const firstIndex = firstIndexById.get(ctsCase.id);
    if (firstIndex !== undefined) {
      errors.push(
        violation(
          `manifest[${index}].id`,
          `duplicate case id "${ctsCase.id}": first declared at manifest[${firstIndex}], duplicated at manifest[${index}]`
        )
      );
      return;
    }
    firstIndexById.set(ctsCase.id, index);
    cases.push(ctsCase);
  });

  return errors.length > 0 ? errors : cases;
}
