/**
 * A2A behavioral manifest loader (WP02 — T008/T009/T010/T011).
 *
 * Strict YAML; unknown fields at any level are rejected (FR-005). No literal
 * token or URL values may appear under endpoint — only env-var NAMES (NFR-002).
 * Soul paths resolved against manifest directory (byte-stable, no cwd).
 *
 * Decision-C threshold precedence (a2a-behavioral-manifest.md §Threshold resolution):
 *   1. Explicit thresholds present → use them (explicit wins).
 *   2. Soul present → resolve EffectiveConfig → derive maxWords = 10 + voice.verbosity.
 *   3. Apply overrides.max_words / overrides.refusal_cap on top.
 *   4. Verbosity/state_shift axis with no resolvable threshold → violation.
 *   5. Refusal-only case with refusalCap (default 25) is valid without soul or thresholds.
 *
 * Normative: kitty-specs/a2a-behavioral-conformance-01KVJDWE/contracts/a2a-behavioral-manifest.md
 * Boundary: C-004 — imports core; core NEVER imports this module.
 * NI-003: no new fetch site — network I/O only via src/adapters/a2a/transport.ts.
 */

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import { parse as parseYaml } from "yaml";

import type { SpecAdapter } from "../../core/adapter.js";
import type { Violation } from "../../core/report.js";
import { checkSoul, makeFsLoadRef } from "../../core/pipeline.js";

import type {
  A2aBehavioralCase,
  A2aBehavioralManifest,
  A2aEndpointRef,
  A2aThresholds,
  AxisSpec,
  CaseOverrides,
  ResolvedThresholds,
  Turn,
} from "./behavioral-types.js";

export type {
  A2aBehavioralManifest,
  A2aBehavioralCase,
  A2aEndpointRef,
  A2aThresholds,
  ResolvedThresholds,
};

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

// ---------------------------------------------------------------------------
// Violation helpers
// ---------------------------------------------------------------------------

function violation(path: string, message: string): Violation {
  return { path, message, severity: "error" };
}

// ---------------------------------------------------------------------------
// Strict unknown-field rejection (FR-005)
// ---------------------------------------------------------------------------

function rejectUnknown(
  entry: Record<string, unknown>,
  known: ReadonlySet<string>,
  where: string,
  errors: Violation[]
): void {
  for (const key of Object.keys(entry)) {
    if (!known.has(key)) {
      errors.push(
        violation(
          `${where}.${key}`,
          `unknown field "${key}" (behavioral manifests are strict — FR-005)`
        )
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Allowed field sets
// ---------------------------------------------------------------------------

const TOP_FIELDS = new Set(["adapter", "kind", "endpoint", "defaults", "cases"]);
const ENDPOINT_FIELDS = new Set(["env", "token_env"]);
const DEFAULTS_FIELDS = new Set(["runs", "pass_threshold"]);
const CASE_FIELDS = new Set([
  "id",
  "soul",
  "thresholds",
  "turns",
  "axes",
  "overrides",
  "runs",
  "pass_threshold",
]);
const THRESHOLDS_FIELDS = new Set(["default_max_words", "states"]);
const TURN_FIELDS = new Set(["role", "content", "facts"]);
const AXIS_VERBOSITY_FIELDS = new Set(["axis", "turns"]);
const AXIS_REFUSAL_FIELDS = new Set(["axis", "turn", "assertions"]);
const AXIS_STATE_SHIFT_FIELDS = new Set(["axis", "trigger_turn", "expect_state"]);
const ASSERTION_FIELDS = new Set(["kind", "pattern", "regex"]);
const OVERRIDE_FIELDS = new Set(["max_words", "refusal_cap"]);

// ---------------------------------------------------------------------------
// Env-var name validation (NFR-002)
// ---------------------------------------------------------------------------

/**
 * A valid env-var name contains no spaces, no protocol schemes, and no
 * characters that make it clearly a literal URL or secret token.
 * Permissive for valid env-var names; hard-rejects clear violations.
 */
function isEnvVarName(value: string): boolean {
  // Reject protocol scheme (e.g. "https://...")
  if (value.includes("://")) return false;
  // Reject whitespace
  if (/\s/.test(value)) return false;
  // Reject known secret-prefix patterns (NFR-002 — repository key-invariant)
  if (/^sk-[A-Za-z0-9_-]{20}/.test(value)) return false;
  if (/^nvapi-[A-Za-z0-9]{8}/.test(value)) return false;
  // Reject host:port patterns (looks like a URL without scheme)
  if (/^[a-zA-Z0-9.-]+:\d+/.test(value)) return false;
  // Valid env-var: POSIX identifier characters only
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

// ---------------------------------------------------------------------------
// Endpoint validation (T008)
// ---------------------------------------------------------------------------

const DEFAULT_ENDPOINT_ENV = "MUSTER_A2A_ENDPOINT";
const DEFAULT_TOKEN_ENV = "MUSTER_A2A_TOKEN";

function validateEndpoint(
  raw: unknown,
  errors: Violation[]
): A2aEndpointRef | null {
  if (raw === undefined) {
    return { env: DEFAULT_ENDPOINT_ENV, token_env: DEFAULT_TOKEN_ENV };
  }

  if (!isRecord(raw)) {
    errors.push(
      violation("endpoint", '"endpoint" must be a mapping with env/token_env fields')
    );
    return null;
  }

  rejectUnknown(raw, ENDPOINT_FIELDS, "endpoint", errors);

  const env = raw["env"] ?? DEFAULT_ENDPOINT_ENV;
  const tokenEnv = raw["token_env"] ?? DEFAULT_TOKEN_ENV;

  let envOk = true;
  let tokenOk = true;

  if (typeof env !== "string" || env.length === 0) {
    errors.push(
      violation("endpoint.env", '"env" must be a non-empty string (env-var name only)')
    );
    envOk = false;
  } else if (!isEnvVarName(env)) {
    errors.push(
      violation(
        "endpoint.env",
        `"env" must be an env-var name, not a literal URL or token (NFR-002)`
      )
    );
    envOk = false;
  }

  if (typeof tokenEnv !== "string" || tokenEnv.length === 0) {
    errors.push(
      violation("endpoint.token_env", '"token_env" must be a non-empty string (env-var name only)')
    );
    tokenOk = false;
  } else if (!isEnvVarName(tokenEnv)) {
    errors.push(
      violation(
        "endpoint.token_env",
        `"token_env" must be an env-var name, not a literal URL or token (NFR-002)`
      )
    );
    tokenOk = false;
  }

  if (!envOk || !tokenOk) return null;

  return {
    env: String(env),
    token_env: String(tokenEnv),
  };
}

// ---------------------------------------------------------------------------
// Defaults validation
// ---------------------------------------------------------------------------

interface ResolvedDefaults {
  runs: number;
  pass_threshold: number;
}

function validateDefaults(raw: unknown, errors: Violation[]): ResolvedDefaults {
  const defaults: ResolvedDefaults = { runs: 3, pass_threshold: 2 };
  if (raw === undefined) return defaults;

  if (!isRecord(raw)) {
    errors.push(violation("defaults", '"defaults" must be a mapping'));
    return defaults;
  }

  rejectUnknown(raw, DEFAULTS_FIELDS, "defaults", errors);

  if (raw["runs"] !== undefined) {
    if (!isInt(raw["runs"]) || raw["runs"] < 1) {
      errors.push(violation("defaults.runs", '"defaults.runs" must be an integer ≥ 1'));
    } else {
      defaults.runs = raw["runs"];
    }
  }

  if (raw["pass_threshold"] !== undefined) {
    if (!isInt(raw["pass_threshold"]) || raw["pass_threshold"] < 1) {
      errors.push(
        violation("defaults.pass_threshold", '"defaults.pass_threshold" must be an integer ≥ 1')
      );
    } else {
      defaults.pass_threshold = raw["pass_threshold"];
    }
  }

  return defaults;
}

// ---------------------------------------------------------------------------
// Turn validation
// ---------------------------------------------------------------------------

function validateTurn(
  raw: unknown,
  where: string,
  errors: Violation[]
): Turn | null {
  if (!isRecord(raw)) {
    errors.push(violation(where, "turn must be a mapping"));
    return null;
  }
  rejectUnknown(raw, TURN_FIELDS, where, errors);

  if (raw["role"] !== undefined && raw["role"] !== "user") {
    errors.push(
      violation(
        `${where}.role`,
        'turn "role" may only be "user" (A2A behavioral turns are always user turns)'
      )
    );
    return null;
  }

  const content = raw["content"];
  if (typeof content !== "string" || content.length === 0) {
    errors.push(
      violation(`${where}.content`, 'turn requires a non-empty string "content"')
    );
    return null;
  }

  const turn: Turn = { role: "user", content };

  const facts = raw["facts"];
  if (facts !== undefined) {
    if (!isRecord(facts)) {
      errors.push(
        violation(
          `${where}.facts`,
          '"facts" must be a mapping of fact name → boolean|string'
        )
      );
      return null;
    }
    const checked: Record<string, boolean | string> = {};
    for (const [key, value] of Object.entries(facts)) {
      if (typeof value !== "boolean" && typeof value !== "string") {
        errors.push(
          violation(`${where}.facts.${key}`, "fact values must be boolean or string")
        );
        return null;
      }
      checked[key] = value;
    }
    turn.facts = checked;
  }

  return turn;
}

// ---------------------------------------------------------------------------
// Assertion validation
// ---------------------------------------------------------------------------

import type { ContentAssertion } from "./behavioral-types.js";

function validateAssertion(
  raw: unknown,
  where: string,
  errors: Violation[]
): ContentAssertion | null {
  if (!isRecord(raw)) {
    errors.push(
      violation(where, "assertion must be a {kind, pattern[, regex]} mapping")
    );
    return null;
  }
  rejectUnknown(raw, ASSERTION_FIELDS, where, errors);

  const kind = raw["kind"];
  if (kind !== "must_contain" && kind !== "must_not_contain") {
    errors.push(
      violation(`${where}.kind`, '"kind" must be "must_contain" or "must_not_contain"')
    );
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
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      errors.push(
        violation(`${where}.pattern`, `invalid regular expression: ${reason}`)
      );
      return null;
    }
  }

  const assertion: ContentAssertion = { kind, pattern };
  if (raw["regex"] === true) assertion.regex = true;
  return assertion;
}

// ---------------------------------------------------------------------------
// Turn-index range check (FR-005)
// ---------------------------------------------------------------------------

function validTurnIndex(
  value: unknown,
  turnCount: number,
  where: string,
  errors: Violation[]
): value is number {
  if (!isInt(value) || value < 0 || value >= turnCount) {
    errors.push(
      violation(
        where,
        `turn index must be an integer in [0, ${turnCount - 1}] (0-indexed — FR-005)`
      )
    );
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Axis validation
// ---------------------------------------------------------------------------

function validateVerbosityAxis(
  raw: Record<string, unknown>,
  where: string,
  turnCount: number,
  errors: Violation[]
): AxisSpec | null {
  rejectUnknown(raw, AXIS_VERBOSITY_FIELDS, where, errors);
  const turns = raw["turns"];
  if (turns === "all") return { axis: "verbosity", turns: "all" };
  if (Array.isArray(turns)) {
    let ok = true;
    turns.forEach((value, i) => {
      if (!validTurnIndex(value, turnCount, `${where}.turns[${i}]`, errors)) ok = false;
    });
    return ok ? { axis: "verbosity", turns: turns as number[] } : null;
  }
  errors.push(
    violation(`${where}.turns`, '"turns" must be "all" or a list of 0-indexed turn integers')
  );
  return null;
}

function validateRefusalAxis(
  raw: Record<string, unknown>,
  where: string,
  turnCount: number,
  errors: Violation[]
): AxisSpec | null {
  rejectUnknown(raw, AXIS_REFUSAL_FIELDS, where, errors);
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
    const a = validateAssertion(entry, `${where}.assertions[${i}]`, errors);
    if (a === null) ok = false;
    else assertions.push(a);
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
  rejectUnknown(raw, AXIS_STATE_SHIFT_FIELDS, where, errors);
  const rawTriggerTurn = raw["trigger_turn"];
  if (!validTurnIndex(rawTriggerTurn, turnCount, `${where}.trigger_turn`, errors)) return null;

  const expectState = raw["expect_state"];
  if (typeof expectState !== "string" || expectState.length === 0) {
    errors.push(
      violation(`${where}.expect_state`, '"expect_state" must be a non-empty string (FR-021)')
    );
    return null;
  }

  return {
    axis: "state_shift",
    trigger_turn: rawTriggerTurn,
    expect_state: expectState,
  };
}

function validateAxis(
  raw: unknown,
  where: string,
  turnCount: number,
  errors: Violation[]
): AxisSpec | null {
  if (!isRecord(raw)) {
    errors.push(
      violation(where, 'axis must be a mapping with an "axis" discriminator')
    );
    return null;
  }
  const axis = raw["axis"];
  if (axis === "verbosity") return validateVerbosityAxis(raw, where, turnCount, errors);
  if (axis === "refusal") return validateRefusalAxis(raw, where, turnCount, errors);
  if (axis === "state_shift") return validateStateShiftAxis(raw, where, turnCount, errors);
  errors.push(
    violation(
      `${where}.axis`,
      '"axis" must be "verbosity", "refusal", or "state_shift"'
    )
  );
  return null;
}

// ---------------------------------------------------------------------------
// Overrides validation
// ---------------------------------------------------------------------------

function validateOverrides(
  raw: unknown,
  where: string,
  errors: Violation[]
): CaseOverrides | null {
  if (!isRecord(raw)) {
    errors.push(
      violation(where, '"overrides" must be a mapping of max_words/refusal_cap')
    );
    return null;
  }
  rejectUnknown(raw, OVERRIDE_FIELDS, where, errors);

  const overrides: CaseOverrides = {};
  for (const key of ["max_words", "refusal_cap"] as const) {
    const value = raw[key];
    if (value !== undefined) {
      if (!isInt(value) || value < 0) {
        errors.push(
          violation(`${where}.${key}`, `"${key}" must be an integer ≥ 0`)
        );
        return null;
      }
      overrides[key] = value;
    }
  }
  return overrides;
}

// ---------------------------------------------------------------------------
// Thresholds block validation
// ---------------------------------------------------------------------------

function validateThresholds(
  raw: unknown,
  where: string,
  errors: Violation[]
): A2aThresholds | null {
  if (!isRecord(raw)) {
    errors.push(violation(where, '"thresholds" must be a mapping'));
    return null;
  }
  rejectUnknown(raw, THRESHOLDS_FIELDS, where, errors);

  const thresholds: A2aThresholds = {};
  const startCount = errors.length;

  const defaultMaxWords = raw["default_max_words"];
  if (defaultMaxWords !== undefined) {
    if (!isInt(defaultMaxWords) || defaultMaxWords < 0) {
      errors.push(
        violation(`${where}.default_max_words`, '"default_max_words" must be an integer ≥ 0')
      );
    } else {
      thresholds.default_max_words = defaultMaxWords;
    }
  }

  const states = raw["states"];
  if (states !== undefined) {
    if (!isRecord(states)) {
      errors.push(
        violation(`${where}.states`, '"states" must be a mapping of state → word limit')
      );
    } else {
      const stateMap: Record<string, number> = {};
      for (const [stateName, limit] of Object.entries(states)) {
        if (!isInt(limit) || (limit as number) < 0) {
          errors.push(
            violation(
              `${where}.states.${stateName}`,
              `state "${stateName}" word limit must be an integer ≥ 0`
            )
          );
        } else {
          stateMap[stateName] = limit as number;
        }
      }
      thresholds.states = stateMap;
    }
  }

  return errors.length > startCount ? null : thresholds;
}

// ---------------------------------------------------------------------------
// Run-count validation per case
// ---------------------------------------------------------------------------

function validateRunCounts(
  raw: Record<string, unknown>,
  where: string,
  defaults: ResolvedDefaults,
  errors: Violation[]
): { runs: number; pass_threshold: number } {
  let runs = defaults.runs;
  if (raw["runs"] !== undefined) {
    if (!isInt(raw["runs"]) || raw["runs"] < 1) {
      errors.push(
        violation(`${where}.runs`, '"runs" must be an integer ≥ 1 (FR-022)')
      );
    } else {
      runs = raw["runs"];
    }
  }

  let passThreshold = defaults.pass_threshold;
  if (raw["pass_threshold"] !== undefined) {
    if (!isInt(raw["pass_threshold"]) || raw["pass_threshold"] < 1) {
      errors.push(
        violation(
          `${where}.pass_threshold`,
          '"pass_threshold" must be an integer ≥ 1 (FR-022)'
        )
      );
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

  return { runs, pass_threshold: passThreshold };
}

// ---------------------------------------------------------------------------
// Case validation (T009)
// ---------------------------------------------------------------------------

async function validateCase(
  raw: unknown,
  index: number,
  manifestDir: string,
  defaults: ResolvedDefaults,
  errors: Violation[]
): Promise<A2aBehavioralCase | null> {
  const where = `cases[${index}]`;

  if (!isRecord(raw)) {
    errors.push(violation(where, "case must be a mapping"));
    return null;
  }

  rejectUnknown(raw, CASE_FIELDS, where, errors);
  const startCount = errors.length;

  // id — required, non-empty, unique (uniqueness checked in caller)
  const id = raw["id"];
  if (typeof id !== "string" || id.length === 0) {
    errors.push(
      violation(`${where}.id`, 'required field "id" must be a non-empty string')
    );
  }

  // soul — optional path, resolved to absolute against manifest directory
  let soulAbsolute: string | undefined;
  const rawSoul = raw["soul"];
  if (rawSoul !== undefined) {
    if (typeof rawSoul !== "string" || rawSoul.length === 0) {
      errors.push(
        violation(`${where}.soul`, '"soul" must be a non-empty path string when provided')
      );
    } else {
      soulAbsolute = isAbsolute(rawSoul)
        ? rawSoul
        : resolvePath(manifestDir, rawSoul);
    }
  }

  // thresholds — optional explicit threshold block
  let thresholds: A2aThresholds | undefined;
  if (raw["thresholds"] !== undefined) {
    const checked = validateThresholds(raw["thresholds"], `${where}.thresholds`, errors);
    if (checked !== null) thresholds = checked;
  }

  // turns — required, ≥ 1
  const rawTurns = raw["turns"];
  const turns: Turn[] = [];
  if (!Array.isArray(rawTurns) || rawTurns.length === 0) {
    errors.push(
      violation(
        `${where}.turns`,
        'required field "turns" must be a non-empty list (C-005)'
      )
    );
  } else {
    rawTurns.forEach((entry, i) => {
      const turn = validateTurn(entry, `${where}.turns[${i}]`, errors);
      if (turn !== null) turns.push(turn);
    });
  }

  // axes — required, ≥ 1
  const rawAxes = raw["axes"];
  const axes: AxisSpec[] = [];
  if (!Array.isArray(rawAxes) || rawAxes.length === 0) {
    errors.push(
      violation(`${where}.axes`, 'required field "axes" must be a non-empty list')
    );
  } else if (Array.isArray(rawTurns) && rawTurns.length > 0) {
    rawAxes.forEach((entry, i) => {
      const axis = validateAxis(
        entry,
        `${where}.axes[${i}]`,
        rawTurns.length,
        errors
      );
      if (axis !== null) axes.push(axis);
    });
  }

  // overrides — optional
  let overrides: CaseOverrides | undefined;
  if (raw["overrides"] !== undefined) {
    const checked = validateOverrides(
      raw["overrides"],
      `${where}.overrides`,
      errors
    );
    if (checked !== null) overrides = checked;
  }

  // run counts with defaults
  const { runs, pass_threshold: passThreshold } = validateRunCounts(
    raw,
    where,
    defaults,
    errors
  );

  if (errors.length > startCount) return null;

  const caseId = String(id);
  const result: A2aBehavioralCase = {
    id: caseId,
    turns,
    axes,
    runs,
    pass_threshold: passThreshold,
  };

  if (soulAbsolute !== undefined) result.soul = soulAbsolute;
  if (thresholds !== undefined) result.thresholds = thresholds;
  if (overrides !== undefined) result.overrides = overrides;

  return result;
}

// ---------------------------------------------------------------------------
// Threshold resolution (decision-C, T010)
// ---------------------------------------------------------------------------

const DEFAULT_REFUSAL_CAP = 25;

/** Derive verbosity word cap from voice.verbosity (R9: 10 + verbosity). */
function deriveMaxWords(verbosity: number): number {
  return 10 + verbosity;
}

/** True when axes contain verbosity or state_shift (both need a word cap). */
function needsVerbosityThreshold(axes: AxisSpec[]): boolean {
  return axes.some(
    (axis) => axis.axis === "verbosity" || axis.axis === "state_shift"
  );
}

/**
 * Resolve thresholds for one A2A behavioral case (decision-C precedence).
 *
 * This function is async because source 2 (soul) requires reading and resolving
 * the soul YAML to extract EffectiveConfig. Pass the RFC-1 adapter instance for
 * soul parsing and resolution (injected to keep the function testable).
 *
 * Normative: a2a-behavioral-manifest.md §Threshold resolution (decision C).
 * Citation: a2a-behavioral-conformance-01KVJDWE WP02 T010.
 */
export async function resolveThresholds(
  caseId: string,
  soulPath: string | undefined,
  thresholds: A2aThresholds | undefined,
  overrides: CaseOverrides | undefined,
  axes: AxisSpec[],
  adapter: SpecAdapter
): Promise<ResolvedThresholds | Violation[]> {
  const refusalCap = overrides?.refusal_cap ?? DEFAULT_REFUSAL_CAP;
  const requiresVerbosity = needsVerbosityThreshold(axes);

  // Source 1: explicit thresholds — highest precedence.
  if (thresholds !== undefined) {
    const baseMaxWords =
      overrides?.max_words !== undefined
        ? overrides.max_words
        : thresholds.default_max_words ?? null;

    const stateMaxWords: Record<string, number> = {};
    for (const [state, limit] of Object.entries(thresholds.states ?? {})) {
      stateMaxWords[state] =
        overrides?.max_words !== undefined ? overrides.max_words : limit;
    }

    if (requiresVerbosity && baseMaxWords === null && Object.keys(stateMaxWords).length === 0) {
      return [
        violation(
          `cases[${caseId}].thresholds`,
          `case "${caseId}": verbosity or state_shift axis requires a word threshold; ` +
            "thresholds block must include default_max_words or states (decision-C)"
        ),
      ];
    }

    return { baseMaxWords, stateMaxWords, refusalCap };
  }

  // Source 2: soul present — resolve EffectiveConfig, derive caps from voice.verbosity.
  if (soulPath !== undefined) {
    let raw: string;
    try {
      raw = await readFile(soulPath, "utf8");
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return [
        violation(
          `cases[${caseId}].soul`,
          `cannot read soul "${soulPath}": ${reason}`
        ),
      ];
    }

    const loadRef = makeFsLoadRef(
      (refRaw, refPath) => adapter.parse(refRaw, refPath, "strict")
    );
    const checkResult = await checkSoul(
      adapter,
      raw,
      soulPath,
      { mode: "strict" },
      loadRef
    );

    if (!checkResult.report.ok || checkResult.effective === null) {
      const errMessages = checkResult.report.errors
        .map((e) => `${e.path}: ${e.message}`)
        .join("; ");
      return [
        violation(
          `cases[${caseId}].soul`,
          `soul "${soulPath}" failed static conformance: ${errMessages}`
        ),
      ];
    }

    const effective = checkResult.effective;
    const voice = isRecord(effective["voice"]) ? effective["voice"] : {};
    const verbosity =
      typeof voice["verbosity"] === "number" ? voice["verbosity"] : null;

    const baseMaxWords =
      overrides?.max_words !== undefined
        ? overrides.max_words
        : verbosity !== null
        ? deriveMaxWords(verbosity)
        : null;

    // Build per-state caps from state overlays in EffectiveConfig.
    const stateMaxWords: Record<string, number> = {};
    const stateSection = isRecord(effective["state"]) ? effective["state"] : {};
    const statesMap = isRecord(stateSection["states"]) ? stateSection["states"] : {};

    for (const [stateName, overlay] of Object.entries(statesMap)) {
      if (!isRecord(overlay)) continue;
      const stateVoice = isRecord(overlay["voice"]) ? overlay["voice"] : {};
      const stateVerbosity =
        typeof stateVoice["verbosity"] === "number"
          ? stateVoice["verbosity"]
          : verbosity;
      if (stateVerbosity !== null) {
        stateMaxWords[stateName] =
          overrides?.max_words !== undefined
            ? overrides.max_words
            : deriveMaxWords(stateVerbosity);
      }
    }

    if (requiresVerbosity && baseMaxWords === null) {
      return [
        violation(
          `cases[${caseId}].soul`,
          `case "${caseId}": verbosity or state_shift axis requires a word threshold; ` +
            `soul "${soulPath}" has no voice.verbosity to derive one from (decision-C)`
        ),
      ];
    }

    return { baseMaxWords, stateMaxWords, refusalCap };
  }

  // No soul, no thresholds — valid for refusal-only axes; violation if verbosity needed.
  if (requiresVerbosity) {
    return [
      violation(
        `cases[${caseId}]`,
        `case "${caseId}": verbosity or state_shift axis requires a word threshold; ` +
          "neither soul nor thresholds is provided (decision-C — FR-005)"
      ),
    ];
  }

  return { baseMaxWords: null, stateMaxWords: {}, refusalCap };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Type guard: discriminate violation list from a successful manifest load. */
export function isA2aBehavioralManifestError(
  result: A2aBehavioralManifest | Violation[]
): result is Violation[] {
  return Array.isArray(result);
}

/**
 * Load and strictly validate an A2A behavioral manifest from a YAML file.
 *
 * Returns the validated manifest or an array of all violations found (never
 * both; never aborts at first error — authors see the full list).
 * Soul paths are resolved to absolute paths against the manifest directory.
 * Manifest-wide defaults (runs=3, pass_threshold=2) are applied before the
 * caller sees the result. Unknown fields at any level produce named violations.
 *
 * Threshold resolution (decision-C, async soul loading) is deliberately
 * deferred: call resolveThresholds() per-case after loading.
 *
 * Normative: a2a-behavioral-manifest.md; FR-004, FR-005, FR-012.
 * Citation: a2a-behavioral-conformance-01KVJDWE commit (WP02).
 */
export async function loadBehavioralManifest(
  path: string
): Promise<A2aBehavioralManifest | Violation[]> {
  const manifestPath = isAbsolute(path) ? path : resolvePath(path);
  const manifestDir = dirname(manifestPath);

  let rawText: string;
  try {
    rawText = await readFile(manifestPath, "utf8");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return [
      violation(
        "manifest",
        `cannot read A2A behavioral manifest "${manifestPath}": ${reason}`
      ),
    ];
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(rawText);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return [
      violation("manifest", `A2A behavioral manifest is not valid YAML: ${reason}`)
    ];
  }

  if (!isRecord(parsed)) {
    return [
      violation(
        "manifest",
        "A2A behavioral manifest must be a YAML mapping of adapter/kind/endpoint/defaults/cases"
      ),
    ];
  }

  const errors: Violation[] = [];
  rejectUnknown(parsed, TOP_FIELDS, "manifest", errors);

  if (parsed["adapter"] !== "a2a") {
    errors.push(
      violation(
        "manifest.adapter",
        '"adapter" must be "a2a" for an A2A behavioral manifest'
      )
    );
  }

  if (parsed["kind"] !== "behavioral") {
    errors.push(
      violation(
        "manifest.kind",
        '"kind" must be "behavioral" to select the behavioral path (FR-004)'
      )
    );
  }

  const endpoint = validateEndpoint(parsed["endpoint"], errors);
  const defaults = validateDefaults(parsed["defaults"], errors);

  const cases: A2aBehavioralCase[] = [];
  const rawCases = parsed["cases"];

  if (!Array.isArray(rawCases) || rawCases.length === 0) {
    errors.push(
      violation("cases", 'required field "cases" must be a non-empty list')
    );
  } else {
    const firstIndexById = new Map<string, number>();
    const casePromises = rawCases.map((entry, index) =>
      validateCase(entry, index, manifestDir, defaults, errors)
    );
    const resolvedCases = await Promise.all(casePromises);

    for (let index = 0; index < resolvedCases.length; index++) {
      const validatedCase = resolvedCases[index];
      if (validatedCase === null) continue;
      const firstIndex = firstIndexById.get(validatedCase.id);
      if (firstIndex !== undefined) {
        errors.push(
          violation(
            `cases[${index}].id`,
            `duplicate case id "${validatedCase.id}": first declared at cases[${firstIndex}] (FR-005)`
          )
        );
        continue;
      }
      firstIndexById.set(validatedCase.id, index);
      cases.push(validatedCase);
    }
  }

  if (errors.length > 0 || endpoint === null) {
    return errors.length > 0
      ? errors
      : [violation("endpoint", "endpoint block failed validation")];
  }

  const manifest: A2aBehavioralManifest = {
    adapter: "a2a",
    kind: "behavioral",
    endpoint,
    cases,
  };

  if (parsed["defaults"] !== undefined) {
    manifest.defaults = {
      runs: defaults.runs,
      pass_threshold: defaults.pass_threshold,
    };
  }

  return manifest;
}
