/**
 * Behavioral manifest loader (`behave/*.yaml`) — the harness-side format from
 * contracts/behavioral-manifest.md, implemented exactly.
 *
 * Manifests are muster's own artifacts (not Soul-YAML): a plain `yaml` parse,
 * and validation is ALWAYS strict — unknown fields are errors. Credentials
 * are NEVER manifest fields: only the env-var NAME is configurable (any
 * non-empty string — charter directive 5, NFR-005).
 *
 * `soul` paths are resolved to ABSOLUTE paths against the manifest's
 * directory — never the process cwd. Defaults (runs=3, pass_threshold=2,
 * temperature="default") are applied here so the runner sees fully-resolved
 * cases (FR-022, C-009).
 */

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Violation } from "../report.js";
import type {
  AxisSpec,
  BehavioralCase,
  CaseOverrides,
  ContentAssertion,
  EndpointConfig,
  Turn,
} from "./types.js";

/** Manifest-wide defaults after defaulting (contract `defaults:` block). */
export interface BehavioralDefaults {
  runs: number;
  pass_threshold: number;
  /** `"default"` = omit temperature from requests entirely (C-009). */
  temperature: number | "default";
}

/** A fully validated behavioral manifest. */
export interface BehavioralManifest {
  endpoint: EndpointConfig;
  defaults: BehavioralDefaults;
  cases: BehavioralCase[];
}

/** Type guard for `loadBehavioralManifest`'s union result. */
export function isBehavioralManifestError(
  result: BehavioralManifest | Violation[]
): result is Violation[] {
  return Array.isArray(result);
}

const TOP_FIELDS = new Set(["endpoint", "defaults", "cases"]);
const ENDPOINT_FIELDS = new Set(["base_url", "model", "api_key_env"]);
const DEFAULTS_FIELDS = new Set(["runs", "pass_threshold", "temperature"]);
const CASE_FIELDS = new Set([
  "id",
  "soul",
  "profile",
  "state",
  "turns",
  "axes",
  "runs",
  "pass_threshold",
  "overrides",
]);
const TURN_FIELDS = new Set(["role", "content", "facts"]);
const OVERRIDE_FIELDS = new Set(["max_words", "refusal_cap"]);
const ASSERTION_FIELDS = new Set(["kind", "pattern", "regex"]);
// NOTE: EndpointConfig.apiKeyEnv was widened to `string` (Note 5 — NFR-005 widening).
// The manifest loader still requires a non-empty string; it no longer restricts to
// a narrow set of known names so callers can supply their own env-var names.

function violation(path: string, message: string): Violation {
  return { path, message, severity: "error" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function rejectUnknownFields(
  entry: Record<string, unknown>,
  known: ReadonlySet<string>,
  where: string,
  errors: Violation[]
): void {
  for (const key of Object.keys(entry)) {
    if (!known.has(key)) {
      errors.push(
        violation(`${where}.${key}`, `unknown field "${key}" (behavioral manifests are strict)`)
      );
    }
  }
}

function validateEndpoint(raw: unknown, errors: Violation[]): EndpointConfig | null {
  if (!isRecord(raw)) {
    errors.push(violation("endpoint", "required block \"endpoint\" must be a mapping of base_url/model"));
    return null;
  }
  rejectUnknownFields(raw, ENDPOINT_FIELDS, "endpoint", errors);
  const baseUrl = raw["base_url"];
  if (typeof baseUrl !== "string" || baseUrl.length === 0) {
    errors.push(violation("endpoint.base_url", 'required field "base_url" must be a non-empty string'));
  }
  const model = raw["model"];
  if (typeof model !== "string" || model.length === 0) {
    errors.push(violation("endpoint.model", 'required field "model" must be a non-empty string'));
  }
  const apiKeyEnv = raw["api_key_env"] ?? "MUSTER_API_KEY";
  if (typeof apiKeyEnv !== "string" || apiKeyEnv.length === 0) {
    errors.push(
      violation(
        "endpoint.api_key_env",
        'optional field "api_key_env" must be a non-empty string naming the environment variable ' +
          "that holds the API key (only the env-var NAME is configurable — never a key value; charter directive 5)"
      )
    );
    return null;
  }
  if (typeof baseUrl !== "string" || typeof model !== "string") return null;
  return {
    baseUrl,
    model,
    apiKeyEnv,
  };
}

function validateDefaults(raw: unknown, errors: Violation[]): BehavioralDefaults {
  const defaults: BehavioralDefaults = { runs: 3, pass_threshold: 2, temperature: "default" };
  if (raw === undefined) return defaults;
  if (!isRecord(raw)) {
    errors.push(violation("defaults", 'optional block "defaults" must be a mapping'));
    return defaults;
  }
  rejectUnknownFields(raw, DEFAULTS_FIELDS, "defaults", errors);
  if (raw["runs"] !== undefined) {
    if (!isInt(raw["runs"]) || raw["runs"] < 1) {
      errors.push(violation("defaults.runs", '"runs" must be an integer ≥ 1'));
    } else {
      defaults.runs = raw["runs"];
    }
  }
  if (raw["pass_threshold"] !== undefined) {
    if (!isInt(raw["pass_threshold"]) || raw["pass_threshold"] < 1) {
      errors.push(violation("defaults.pass_threshold", '"pass_threshold" must be an integer ≥ 1'));
    } else {
      defaults.pass_threshold = raw["pass_threshold"];
    }
  }
  const temperature = raw["temperature"];
  if (temperature !== undefined && temperature !== "default") {
    if (typeof temperature === "number") {
      defaults.temperature = temperature;
    } else {
      errors.push(
        violation("defaults.temperature", '"temperature" must be a number or the string "default" (C-009)')
      );
    }
  }
  return defaults;
}

function validateTurn(raw: unknown, where: string, errors: Violation[]): Turn | null {
  if (!isRecord(raw)) {
    errors.push(violation(where, "turn must be a mapping with a string \"content\""));
    return null;
  }
  rejectUnknownFields(raw, TURN_FIELDS, where, errors);
  if (raw["role"] !== undefined && raw["role"] !== "user") {
    errors.push(violation(`${where}.role`, 'turn "role" may only be "user" (assistant turns are produced)'));
    return null;
  }
  const content = raw["content"];
  if (typeof content !== "string" || content.length === 0) {
    errors.push(violation(`${where}.content`, 'turn requires a non-empty string "content"'));
    return null;
  }
  const turn: Turn = { role: "user", content };
  const facts = raw["facts"];
  if (facts !== undefined) {
    if (!isRecord(facts)) {
      errors.push(violation(`${where}.facts`, '"facts" must be a mapping of fact name → boolean|string (§21.0.1)'));
      return null;
    }
    const checked: Record<string, boolean | string> = {};
    for (const [key, value] of Object.entries(facts)) {
      if (typeof value !== "boolean" && typeof value !== "string") {
        errors.push(
          violation(`${where}.facts.${key}`, "fact values must be boolean or string (§20.3.2)")
        );
        return null;
      }
      checked[key] = value;
    }
    turn.facts = checked;
  }
  return turn;
}

function validateAssertion(
  raw: unknown,
  where: string,
  errors: Violation[]
): ContentAssertion | null {
  if (!isRecord(raw)) {
    errors.push(violation(where, "assertion must be a {kind, pattern[, regex]} mapping"));
    return null;
  }
  rejectUnknownFields(raw, ASSERTION_FIELDS, where, errors);
  const kind = raw["kind"];
  if (kind !== "must_contain" && kind !== "must_not_contain") {
    errors.push(violation(`${where}.kind`, '"kind" must be "must_contain" or "must_not_contain" (FR-020)'));
    return null;
  }
  const pattern = raw["pattern"];
  if (typeof pattern !== "string" || pattern.length === 0) {
    errors.push(violation(`${where}.pattern`, '"pattern" must be a non-empty string'));
    return null;
  }
  if (raw["regex"] !== undefined && typeof raw["regex"] !== "boolean") {
    errors.push(violation(`${where}.regex`, '"regex" must be a boolean'));
    return null;
  }
  if (raw["regex"] === true) {
    try {
      new RegExp(pattern, "i");
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      errors.push(violation(`${where}.pattern`, `invalid regular expression: ${reason}`));
      return null;
    }
  }
  const assertion: ContentAssertion = { kind, pattern };
  if (raw["regex"] === true) assertion.regex = true;
  return assertion;
}

/** Validate a 0-indexed turn reference against the case's turn count. */
function validTurnIndex(
  value: unknown,
  turnCount: number,
  where: string,
  errors: Violation[]
): value is number {
  if (!isInt(value) || value < 0 || value >= turnCount) {
    errors.push(
      violation(where, `turn index must be an integer in [0, ${turnCount - 1}] (0-indexed into the case's turns)`)
    );
    return false;
  }
  return true;
}

function validateVerbosityAxis(
  raw: Record<string, unknown>,
  where: string,
  turnCount: number,
  errors: Violation[]
): AxisSpec | null {
  rejectUnknownFields(raw, new Set(["axis", "turns"]), where, errors);
  const turns = raw["turns"];
  if (turns === "all") return { axis: "verbosity", turns: "all" };
  if (Array.isArray(turns)) {
    let ok = true;
    turns.forEach((value, i) => {
      if (!validTurnIndex(value, turnCount, `${where}.turns[${i}]`, errors)) ok = false;
    });
    return ok ? { axis: "verbosity", turns: turns as number[] } : null;
  }
  errors.push(violation(`${where}.turns`, '"turns" must be "all" or a list of 0-indexed turn integers'));
  return null;
}

function validateRefusalAxis(
  raw: Record<string, unknown>,
  where: string,
  turnCount: number,
  errors: Violation[]
): AxisSpec | null {
  rejectUnknownFields(raw, new Set(["axis", "turn", "assertions"]), where, errors);
  const rawTurn = raw["turn"];
  if (!validTurnIndex(rawTurn, turnCount, `${where}.turn`, errors)) return null;
  const spec: AxisSpec = { axis: "refusal", turn: rawTurn };
  const rawAssertions = raw["assertions"];
  if (rawAssertions === undefined) return spec;
  if (!Array.isArray(rawAssertions)) {
    errors.push(violation(`${where}.assertions`, '"assertions" must be a list'));
    return null;
  }
  const assertions: ContentAssertion[] = [];
  let ok = true;
  rawAssertions.forEach((entry, i) => {
    const assertion = validateAssertion(entry, `${where}.assertions[${i}]`, errors);
    if (assertion === null) ok = false;
    else assertions.push(assertion);
  });
  if (!ok) return null;
  spec.assertions = assertions;
  return spec;
}

function validateStateShiftAxis(
  raw: Record<string, unknown>,
  where: string,
  turnCount: number,
  errors: Violation[]
): AxisSpec | null {
  rejectUnknownFields(raw, new Set(["axis", "trigger_turn", "expect_state"]), where, errors);
  const rawTriggerTurn = raw["trigger_turn"];
  if (!validTurnIndex(rawTriggerTurn, turnCount, `${where}.trigger_turn`, errors)) return null;
  const expectState = raw["expect_state"];
  if (typeof expectState !== "string" || expectState.length === 0) {
    errors.push(violation(`${where}.expect_state`, '"expect_state" must be a non-empty string (FR-021)'));
    return null;
  }
  return { axis: "state_shift", trigger_turn: rawTriggerTurn, expect_state: expectState };
}

function validateAxis(
  raw: unknown,
  where: string,
  turnCount: number,
  errors: Violation[]
): AxisSpec | null {
  if (!isRecord(raw)) {
    errors.push(violation(where, "axis must be a mapping with an \"axis\" discriminator"));
    return null;
  }
  const axis = raw["axis"];
  if (axis === "verbosity") return validateVerbosityAxis(raw, where, turnCount, errors);
  if (axis === "refusal") return validateRefusalAxis(raw, where, turnCount, errors);
  if (axis === "state_shift") return validateStateShiftAxis(raw, where, turnCount, errors);
  errors.push(
    violation(`${where}.axis`, '"axis" must be one of "verbosity", "refusal", "state_shift" (the three locked axes)')
  );
  return null;
}

function validateOverrides(raw: unknown, where: string, errors: Violation[]): CaseOverrides | null {
  if (!isRecord(raw)) {
    errors.push(violation(where, '"overrides" must be a mapping of max_words/refusal_cap'));
    return null;
  }
  rejectUnknownFields(raw, OVERRIDE_FIELDS, where, errors);
  const overrides: CaseOverrides = {};
  for (const key of ["max_words", "refusal_cap"] as const) {
    const value = raw[key];
    if (value !== undefined) {
      if (!isInt(value) || value < 0) {
        errors.push(violation(`${where}.${key}`, `"${key}" must be an integer ≥ 0`));
        return null;
      }
      overrides[key] = value;
    }
  }
  return overrides;
}

/** Validate turns list and axes list for a case; returns [turns, axes]. */
function validateCaseTurnsAndAxes(
  raw: Record<string, unknown>,
  where: string,
  errors: Violation[]
): [Turn[], AxisSpec[]] {
  const rawTurns = raw["turns"];
  const turns: Turn[] = [];
  if (!Array.isArray(rawTurns) || rawTurns.length === 0) {
    errors.push(violation(`${where}.turns`, 'required field "turns" must be a non-empty list (C-005)'));
  } else {
    rawTurns.forEach((entry, i) => {
      const turn = validateTurn(entry, `${where}.turns[${i}]`, errors);
      if (turn !== null) turns.push(turn);
    });
  }

  const axes: AxisSpec[] = [];
  const rawAxes = raw["axes"];
  if (!Array.isArray(rawAxes) || rawAxes.length === 0) {
    errors.push(violation(`${where}.axes`, 'required field "axes" must be a non-empty list'));
  } else if (Array.isArray(rawTurns)) {
    rawAxes.forEach((entry, i) => {
      const axis = validateAxis(entry, `${where}.axes[${i}]`, rawTurns.length, errors);
      if (axis !== null) axes.push(axis);
    });
  }
  return [turns, axes];
}

/** Validate runs and pass_threshold for a case; returns [runs, passThreshold]. */
function validateCaseRunCounts(
  raw: Record<string, unknown>,
  where: string,
  defaults: BehavioralDefaults,
  errors: Violation[]
): [number, number] {
  let runs = defaults.runs;
  if (raw["runs"] !== undefined) {
    if (!isInt(raw["runs"]) || raw["runs"] < 1) {
      errors.push(violation(`${where}.runs`, '"runs" must be an integer ≥ 1 (FR-022)'));
    } else {
      runs = raw["runs"];
    }
  }
  let passThreshold = defaults.pass_threshold;
  if (raw["pass_threshold"] !== undefined) {
    if (!isInt(raw["pass_threshold"]) || raw["pass_threshold"] < 1) {
      errors.push(violation(`${where}.pass_threshold`, '"pass_threshold" must be an integer ≥ 1 (FR-022)'));
    } else {
      passThreshold = raw["pass_threshold"];
    }
  }
  if (passThreshold > runs) {
    errors.push(
      violation(
        `${where}.pass_threshold`,
        `pass_threshold ${passThreshold} exceeds runs ${runs} — the case could never pass (FR-022 k ≤ n)`
      )
    );
  }
  return [runs, passThreshold];
}

function validateCase(
  raw: unknown,
  index: number,
  manifestDir: string,
  defaults: BehavioralDefaults,
  errors: Violation[]
): BehavioralCase | null {
  const where = `cases[${index}]`;
  if (!isRecord(raw)) {
    errors.push(violation(where, "case must be a mapping"));
    return null;
  }
  rejectUnknownFields(raw, CASE_FIELDS, where, errors);
  const startCount = errors.length;

  const id = raw["id"];
  if (typeof id !== "string" || id.length === 0) {
    errors.push(violation(`${where}.id`, 'required field "id" must be a non-empty string'));
  }
  const soul = raw["soul"];
  if (typeof soul !== "string" || soul.length === 0) {
    errors.push(violation(`${where}.soul`, 'required field "soul" must be a non-empty path string'));
  }
  for (const optional of ["profile", "state"] as const) {
    if (raw[optional] !== undefined && typeof raw[optional] !== "string") {
      errors.push(violation(`${where}.${optional}`, `optional field "${optional}" must be a string`));
    }
  }

  const [turns, axes] = validateCaseTurnsAndAxes(raw, where, errors);
  const [runs, passThreshold] = validateCaseRunCounts(raw, where, defaults, errors);

  let overrides: CaseOverrides | undefined;
  if (raw["overrides"] !== undefined) {
    const checked = validateOverrides(raw["overrides"], `${where}.overrides`, errors);
    if (checked !== null) overrides = checked;
  }

  if (errors.length > startCount) return null;

  // id and soul validated as non-empty strings above; errors guard confirms.
  const caseId = String(id);
  const caseSoul = String(soul);

  const behavioralCase: BehavioralCase = {
    id: caseId,
    soul: isAbsolute(caseSoul) ? caseSoul : resolvePath(manifestDir, caseSoul),
    turns,
    axes,
    runs,
    pass_threshold: passThreshold,
  };
  if (typeof raw["profile"] === "string") behavioralCase.profile = raw["profile"];
  if (typeof raw["state"] === "string") behavioralCase.state = raw["state"];
  if (overrides !== undefined) behavioralCase.overrides = overrides;
  return behavioralCase;
}

/**
 * Load and validate a behavioral manifest. Returns the manifest with all
 * defaults applied and `soul` paths absolute, or the full list of manifest
 * errors. Use `isBehavioralManifestError` to discriminate.
 */
export async function loadBehavioralManifest(
  path: string
): Promise<BehavioralManifest | Violation[]> {
  const manifestPath = isAbsolute(path) ? path : resolvePath(path);
  const manifestDir = dirname(manifestPath);

  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return [violation("manifest", `cannot read behavioral manifest "${manifestPath}": ${reason}`)];
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return [violation("manifest", `behavioral manifest is not valid YAML: ${reason}`)];
  }

  if (!isRecord(parsed)) {
    return [violation("manifest", "behavioral manifest must be a mapping of endpoint/defaults/cases")];
  }

  const errors: Violation[] = [];
  rejectUnknownFields(parsed, TOP_FIELDS, "manifest", errors);

  const endpoint = validateEndpoint(parsed["endpoint"], errors);
  const defaults = validateDefaults(parsed["defaults"], errors);

  const cases: BehavioralCase[] = [];
  const rawCases = parsed["cases"];
  if (!Array.isArray(rawCases) || rawCases.length === 0) {
    errors.push(violation("cases", 'required field "cases" must be a non-empty list'));
  } else {
    const firstIndexById = new Map<string, number>();
    rawCases.forEach((entry, index) => {
      const behavioralCase = validateCase(entry, index, manifestDir, defaults, errors);
      if (behavioralCase === null) return;
      const firstIndex = firstIndexById.get(behavioralCase.id);
      if (firstIndex !== undefined) {
        errors.push(
          violation(
            `cases[${index}].id`,
            `duplicate case id "${behavioralCase.id}": first declared at cases[${firstIndex}]`
          )
        );
        return;
      }
      firstIndexById.set(behavioralCase.id, index);
      cases.push(behavioralCase);
    });
  }

  if (errors.length > 0 || endpoint === null) {
    return errors.length > 0
      ? errors
      : [violation("endpoint", "endpoint block failed validation")];
  }
  return { endpoint, defaults, cases };
}
