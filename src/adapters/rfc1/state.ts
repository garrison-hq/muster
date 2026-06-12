/**
 * RFC-1 §20 dynamic state semantics (FR-010) and the RPP-1-subset trigger
 * evaluator (adapter contract R7, §20.2/§20.3).
 *
 * Pure module: zero fs/network imports (Definition of Done). `node:buffer` is
 * imported only for the §4.4 byte-wise comparator — it touches no I/O.
 */

import { Buffer } from "node:buffer";
import type { EffectiveConfig, MergeStrategy, Mode } from "../../core/adapter.js";
import type { Violation } from "../../core/report.js";
import { merge } from "../../core/merge.js";

/**
 * Standard Merge (§8.1) as data — the adapter's MergeStrategy. Defined here
 * (the lowest module in the rfc1 dependency graph) and re-exported by
 * `resolve.ts`; WP05's adapter assembly consumes it as `mergeStrategy`.
 */
export const RFC1_MERGE_STRATEGY: MergeStrategy = {
  scalars: "replace",
  maps: "deep",
  lists: "replace",
  typeMismatch: "replace",
  nullIsValue: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * §4.4 deterministic comparator: lexicographic ascending order of the RAW
 * UTF-8 bytes of the keys. Byte-wise via `Buffer.compare` — NOT
 * `localeCompare`, NOT `<` on JS strings (UTF-16 code units order astral and
 * Latin-1-supplement keys differently from UTF-8 bytes). No Unicode
 * normalization: NFC/NFD spellings of the "same" key are distinct keys.
 */
export function compareUtf8Bytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** Smallest key per §4.4 (UTF-8 byte order); null for an empty key set. */
export function lexicographicallySmallestKey(keys: readonly string[]): string | null {
  let smallest: string | null = null;
  for (const key of keys) {
    if (smallest === null || compareUtf8Bytes(key, smallest) < 0) {
      smallest = key;
    }
  }
  return smallest;
}

/** The `state` block of an effective config, or null when absent/not a map. */
function stateBlock(effective: EffectiveConfig): Record<string, unknown> | null {
  const st = effective["state"];
  return isRecord(st) ? st : null;
}

/** `state.states` as a map; `{}` when absent or malformed. */
function statesMap(st: Record<string, unknown>): Record<string, unknown> {
  const states = st["states"];
  return isRecord(states) ? states : {};
}

/** §20.1: resolve the explicitly-requested state name (or return a fallback
 *  indicator). Returns the state name, null (fall through to base/default),
 *  or Violation[] on strict-mode failure. */
type StateResolution = string | null | Violation[];

function resolveRequestedState(
  requested: string,
  states: Record<string, unknown>,
  mode: Mode,
  sink: Violation[] | undefined
): StateResolution {
  if (Object.hasOwn(states, requested)) return requested;
  const violation: Violation = {
    path: "state",
    message: `requested state "${requested}" does not exist in state.states`,
    severity: mode === "strict" ? "error" : "warning",
    section: "§20.1",
  };
  if (mode === "strict") return [violation];
  sink?.push(violation); // permissive: ignore the request, fall back to base/default
  return null;
}

/** §20.1: resolve state.base (when provided) against the known states.
 *  Returns the state name, null (fall through to §4.4 default), or
 *  Violation[] on strict-mode failure. */
function resolveBaseState(
  base: unknown,
  states: Record<string, unknown>,
  mode: Mode,
  sink: Violation[] | undefined
): StateResolution {
  if (typeof base === "string" && Object.hasOwn(states, base)) return base;
  const violation: Violation = {
    path: "state.base",
    message: `state.base ${JSON.stringify(base)} does not reference a key in state.states`,
    severity: mode === "strict" ? "error" : "warning",
    section: "§20.1",
  };
  if (mode === "strict") return [violation];
  sink?.push(violation); // permissive: fall back to the §4.4 default below
  return null;
}

/**
 * §20.1 active-state selection.
 *
 * Returns:
 * - `null` — `state` absent, or `state.states` empty/missing: state is
 *   ignored entirely (§20.1);
 * - a state name — the active state (requested → base → §4.4 fallback);
 * - `Violation[]` — strict-mode selection failure (unknown requested state,
 *   dangling `state.base`).
 *
 * Permissive-mode fallbacks emit warnings into the optional `sink` (§20.1:
 * "MAY emit a warning"); the selection itself is still returned. Callers that
 * need the warnings (the resolver does) MUST pass a sink — the
 * `string | null | Violation[]` return type cannot carry both a successful
 * fallback and its warning.
 */
export function selectState(
  effective: EffectiveConfig,
  requested: string | null,
  mode: Mode,
  sink?: Violation[]
): StateResolution {
  const st = stateBlock(effective);
  if (st === null) return null;
  const states = statesMap(st);
  const keys = Object.keys(states);
  // §20.1: empty or missing state.states → ignore `state` entirely.
  if (keys.length === 0) return null;

  // Runtime-requested state (§20.1 "Runtime state selection").
  if (requested !== null) {
    const result = resolveRequestedState(requested, states, mode, sink);
    if (result !== null) return result; // name found, or Violation[] on strict failure
  }

  // §20.1: state.base, when provided, MUST reference a key in state.states.
  const base = st["base"];
  if (base !== undefined) {
    const result = resolveBaseState(base, states, mode, sink);
    if (result !== null) return result; // name found, or Violation[] on strict failure
  }

  // §20.1: omitted base behaves as the lexicographically smallest key (§4.4).
  return lexicographicallySmallestKey(keys);
}

/**
 * §20 structural checks on an effective config's `state` block:
 * - every trigger's `shift_to` exists in `state.states` (§20.3.7);
 * - `duration: timed` carries `ttl_seconds` (§20.3.7);
 * - state overlays do not contain a `state` key themselves (§20.1.1).
 *
 * Strict mode: errors (loading MUST fail). Permissive mode: warnings (the
 * offending trigger/key is ignored) — never silently dropped.
 */
export function validateStateBlock(effective: EffectiveConfig, mode: Mode): Violation[] {
  const violations: Violation[] = [];
  const severity = mode === "strict" ? ("error" as const) : ("warning" as const);
  const st = stateBlock(effective);
  if (st === null) return violations;
  const states = statesMap(st);

  // §20.1.1: overlays must not modify the `state` top-level key itself.
  for (const name of Object.keys(states)) {
    const overlay = states[name];
    if (!isRecord(overlay)) {
      violations.push({
        path: `state.states.${name}`,
        message: "state overlay must be a mapping (partial overlay tree)",
        severity,
        section: "§20",
      });
      continue;
    }
    if (Object.hasOwn(overlay, "state")) {
      violations.push({
        path: `state.states.${name}.state`,
        message:
          mode === "strict"
            ? 'state overlays must not contain a "state" key'
            : 'state overlays must not contain a "state" key (ignored)',
        severity,
        section: "§20.1.1",
      });
    }
  }

  const triggers = st["triggers"];
  if (Array.isArray(triggers)) {
    triggers.forEach((trigger, index) => {
      if (!isRecord(trigger)) {
        violations.push({
          path: `state.triggers[${index}]`,
          message: "trigger must be a mapping",
          severity,
          section: "§20",
        });
        return;
      }
      const shiftTo = trigger["shift_to"];
      if (typeof shiftTo !== "string" || !Object.hasOwn(states, shiftTo)) {
        violations.push({
          path: `state.triggers[${index}].shift_to`,
          message:
            `shift_to ${JSON.stringify(shiftTo)} does not exist in state.states` +
            (mode === "permissive" ? " (trigger ignored)" : ""),
          severity,
          section: "§20.3.7",
        });
      }
      if (trigger["duration"] === "timed" && !Object.hasOwn(trigger, "ttl_seconds")) {
        violations.push({
          path: `state.triggers[${index}].ttl_seconds`,
          message:
            'duration "timed" requires ttl_seconds' +
            (mode === "permissive" ? ' (treated as "session")' : ""),
          severity,
          section: "§20.3.7",
        });
      }
    });
  }
  return violations;
}

/**
 * §7.5 step 5 / Appendix G.7: Standard Merge of `state.states[stateName]`
 * onto the effective config. A `state` key inside the overlay is excluded
 * from the merge (§20.1.1 — strict mode has already rejected it via
 * `validateStateBlock`; permissive mode ignores it with a warning there).
 * Unknown state names or non-map overlays leave the config unchanged.
 */
export function applyStateOverlay(effective: EffectiveConfig, stateName: string): EffectiveConfig {
  const st = stateBlock(effective);
  if (st === null) return effective;
  const states = statesMap(st);
  if (!Object.hasOwn(states, stateName)) return effective;
  const overlay = states[stateName];
  if (!isRecord(overlay)) return effective;
  const safeOverlay = { ...overlay };
  delete safeOverlay["state"]; // §20.1.1
  return merge(effective, safeOverlay, RFC1_MERGE_STRATEGY) as EffectiveConfig;
}

/** One parsed RPP-1-subset term: `"!"? ident`. */
interface PredicateTerm {
  negated: boolean;
  ident: string;
}

/** Dotted identifier: `user.rude`, `task.success` (§20.2 RPP-1).
 * `\w` ≡ `[A-Za-z0-9_]` in JS for both unicode-aware and plain regex — safe
 * substitution (S6353). */
const IDENT_RE = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/;

/**
 * Parse the documented RPP-1 subset (§20.2):
 *
 *   expr := term ("&&" term)*
 *   term := "!"? ident
 *   ident := dotted name
 *
 * Tokenization is on whitespace; `!` binds to its identifier within a token.
 * Anything outside the subset (`||`, parentheses, `==`, stray characters)
 * returns null → unsupported predicate.
 */
function parsePredicate(source: string): PredicateTerm[] | null {
  const tokens = source.trim().split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) return null;
  const terms: PredicateTerm[] = [];
  let expectTerm = true;
  for (const token of tokens) {
    if (expectTerm) {
      const negated = token.startsWith("!");
      const ident = negated ? token.slice(1) : token;
      if (!IDENT_RE.test(ident)) return null;
      terms.push({ negated, ident });
      expectTerm = false;
    } else {
      if (token !== "&&") return null;
      expectTerm = true;
    }
  }
  if (expectTerm) return null; // dangling "&&"
  return terms;
}

/** Validate a single trigger entry, returning a Violation on structural error
 *  or null when the trigger is structurally valid. */
function validateTriggerStructure(
  trigger: unknown,
  index: number,
  mode: Mode
): Violation | null {
  if (!isRecord(trigger)) {
    return {
      path: `state.triggers[${index}]`,
      message: "trigger must be a mapping",
      severity: mode === "strict" ? "error" : "warning",
      section: "§20",
    };
  }
  const predicate = trigger["if"];
  if (typeof predicate !== "string") {
    return {
      path: `state.triggers[${index}].if`,
      message: "trigger predicate must be a string",
      severity: mode === "strict" ? "error" : "warning",
      section: "§20",
    };
  }
  return null;
}

/** Validate the `if` predicate string; returns parsed terms or a Violation. */
function validatePredicate(
  predicate: string,
  index: number,
  mode: Mode
): PredicateTerm[] | Violation {
  const terms = parsePredicate(predicate);
  if (terms !== null) return terms;
  return {
    path: `state.triggers[${index}].if`,
    message:
      `unsupported predicate ${JSON.stringify(predicate)} ` +
      '(muster implements a documented RPP-1 subset: "&&" and "!" over dotted identifiers)',
    severity: mode === "strict" ? "error" : "warning",
    section: "§20.2",
  };
}

/** Validate `shift_to` on a matched trigger; returns null when valid. */
function validateShiftTo(
  trigger: Record<string, unknown>,
  states: Record<string, unknown>,
  index: number,
  mode: Mode
): Violation | null {
  const shiftTo = trigger["shift_to"];
  if (typeof shiftTo === "string" && Object.hasOwn(states, shiftTo)) return null;
  return {
    path: `state.triggers[${index}].shift_to`,
    message:
      `shift_to ${JSON.stringify(shiftTo)} does not exist in state.states` +
      (mode === "permissive" ? " (trigger ignored)" : ""),
    severity: mode === "strict" ? "error" : "warning",
    section: "§20.3.7",
  };
}

/**
 * R7 trigger evaluation over runtime-injected facts (§20.2/§20.3).
 *
 * - Triggers are evaluated in listed order; the FIRST matching trigger wins
 *   and evaluation stops — at most one transition per call (§20.3.3, §20.3.6).
 * - Identifier truth: `facts[ident] === true` ONLY. String facts are never
 *   coerced — `"yes"` / non-empty strings are NOT true (documented muster
 *   behavior; §20.3.2 marks the recommended fact keys as bool).
 * - Predicates outside the documented RPP-1 subset (see `parsePredicate`):
 *   strict → Violation[] returned immediately; permissive → warning + trigger
 *   skipped (§20.2 allows runtimes to implement a documented subset).
 * - A matching trigger whose `shift_to` is unknown: strict → Violation[];
 *   permissive → warning, trigger ignored (§20.3.7).
 *
 * Returns the new active state name, `null` for no transition, or
 * `Violation[]`. Permissive warnings are pushed to the optional `sink`; when
 * no sink is given and NO transition occurred, accumulated warnings are
 * returned as `Violation[]` (all severity "warning") so they are never
 * silently dropped. Callers that need warnings alongside a successful
 * transition MUST pass `sink`.
 */
export function evaluateTriggers(
  effective: EffectiveConfig,
  facts: Record<string, boolean | string>,
  mode: Mode,
  sink?: Violation[]
): string | Violation[] | null {
  const st = stateBlock(effective);
  if (st === null) return null;
  const states = statesMap(st);
  const triggers = st["triggers"];
  if (!Array.isArray(triggers)) return null;

  const warnings: Violation[] = [];
  const warn = (violation: Violation): void => {
    warnings.push(violation);
    sink?.push(violation);
  };

  for (let index = 0; index < triggers.length; index++) {
    const outcome = evaluateOneTrigger(triggers[index], index, facts, states, mode);
    switch (outcome.kind) {
      case "strict-fail":
        return [outcome.violation];
      case "skip":
        warn(outcome.violation); // permissive: trigger skipped (§20.3.7)
        continue;
      case "match":
        return outcome.shiftTo; // §20.3.3 first-match-wins; §20.3.6 one transition
      case "no-match":
        continue;
    }
  }

  if (sink === undefined && warnings.length > 0) return warnings;
  return null;
}

/** Outcome of evaluating one trigger: a strict-mode failure, a permissive skip
 *  (carrying its warning), a matched transition, or no match. */
type TriggerOutcome =
  | { kind: "strict-fail"; violation: Violation }
  | { kind: "skip"; violation: Violation }
  | { kind: "match"; shiftTo: string }
  | { kind: "no-match" };

/** §20.3: structurally validate one trigger, evaluate its predicate against the
 *  facts, and (on match) validate its shift_to target. Pure — the caller maps
 *  the returned outcome to control flow. */
function evaluateOneTrigger(
  trigger: unknown,
  index: number,
  facts: Record<string, boolean | string>,
  states: Record<string, unknown>,
  mode: Mode
): TriggerOutcome {
  // Structural validation: must be a record with a string `if` predicate.
  const structViolation = validateTriggerStructure(trigger, index, mode);
  if (structViolation !== null) {
    return mode === "strict"
      ? { kind: "strict-fail", violation: structViolation }
      : { kind: "skip", violation: structViolation };
  }

  const record = trigger as Record<string, unknown>;
  const predicateResult = validatePredicate(record["if"] as string, index, mode);
  if (!Array.isArray(predicateResult)) {
    return mode === "strict"
      ? { kind: "strict-fail", violation: predicateResult }
      : { kind: "skip", violation: predicateResult };
  }

  const matched = predicateResult.every((term) => {
    const truth = facts[term.ident] === true; // boolean true ONLY
    return term.negated ? !truth : truth;
  });
  if (!matched) return { kind: "no-match" };

  const shiftViolation = validateShiftTo(record, states, index, mode);
  if (shiftViolation !== null) {
    return mode === "strict"
      ? { kind: "strict-fail", violation: shiftViolation }
      : { kind: "skip", violation: shiftViolation };
  }

  return { kind: "match", shiftTo: record["shift_to"] as string };
}
