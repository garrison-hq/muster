/**
 * RFC-1 composition resolution — §7.5 / Appendix G (FR-006, FR-007, FR-008).
 *
 * Mirrors Appendix G.5: recursive reference loading with cycle detection
 * (G.5.2), root-owned-field stripping (G.5.4 / §9.4), root-overlay
 * reattachment (G.5.3), profile overlay (G.5.1 / §9), state overlay
 * (G.7 / §20), and materialized validation (G.6).
 *
 * I/O rule (adapter contract): this module performs NO file access — every
 * reference loads through the injected `loadRef` callback, which returns an
 * already-parsed `SoulDocument | Violation[]`. Zero fs/network imports
 * (Definition of Done).
 */

import type { EffectiveConfig, Mode, SoulDocument } from "../../core/adapter.js";
import type { Violation } from "../../core/report.js";
import { merge } from "../../core/merge.js";
import { MANDATORY, validate } from "./keyspace.js";
import {
  RFC1_MERGE_STRATEGY,
  applyStateOverlay,
  selectState,
  validateStateBlock,
} from "./state.js";
import { resolveRuleRefs } from "./evaluation.js";

// Re-export so WP05's adapter assembly has a single import surface for the
// §8.1 Standard Merge constants.
export { RFC1_MERGE_STRATEGY } from "./state.js";

/** Injected reference loader (adapter contract): the caller owns all fs/URI
 *  handling and resolves `ref` relative to `fromPath` (§7.2). */
export type LoadRef = (
  ref: string,
  fromPath: string
) => Promise<SoulDocument | Violation[]>;

export interface ResolveOptions {
  profile?: string;
  state?: string;
  mode: Mode;
}

/** Rich resolution result — see `resolveCompositionDetailed`. */
export interface ResolveOutcome {
  /** Materialized effective config, or null when resolution failed outright
   *  (cycle, broken reference, strict-mode selection/state-block failure). */
  effective: EffectiveConfig | null;
  /** The profile actually applied (after permissive fallback, if any). */
  profile: string;
  /** Active state name applied in §7.5 step 5, or null. */
  state: string | null;
  /** Every violation encountered, errors AND warnings. */
  violations: Violation[];
}

/**
 * Reference-depth cap: defends against adversarial chains that evade
 * path-identity cycle detection (e.g. generated unique paths). 32 levels is
 * far beyond any legitimate composition chain.
 */
const MAX_COMPOSITION_DEPTH = 32;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Appendix G.5.4 `StripNonComposableFields`: remove the root-owned keys
 * `profiles` and `profile_overrides` (§7.5 / §9.4) from a copy. Applied to
 * loaded bases/mixins BEFORE merging — never to the root's own overlays,
 * which are reattached verbatim afterwards (G.5.3).
 *
 * Note: `composition` is intentionally NOT stripped. The WP04 prompt reads
 * Appendix G as removing "composition bookkeeping", but G.5.4 removes only
 * `profiles`/`profile_overrides`, and §7.5 step 3 excludes only
 * `profile_overrides` — the normative text wins (WP04 risk note). Effective
 * configs therefore carry the root's `composition` block (list replacement,
 * §8.2, makes the root's reference lists win in the merged result).
 */
function stripRootOwned(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  delete out["profiles"];
  delete out["profile_overrides"];
  return out;
}

/**
 * Appendix G.5.2 `LoadAndResolveSoul`, with the cycle set keyed by the
 * canonical document paths reported by `loadRef`.
 *
 * `visiting` is the in-progress chain (gray set): entries are removed once a
 * document finishes resolving, so diamond composition (two branches sharing a
 * base) is legal while true cycles (§7.3) are errors. Appendix G's pseudo-code
 * keeps a permanent `visited` set, which would misreport diamonds as cycles;
 * §7.3's normative requirement is cycle detection, so the visiting-set
 * (§7.5 + §7.3 reading) wins over G's literal pseudo-code (WP04 risk note).
 *
 * Returns the composed mapping, or null when composition is unresolvable —
 * violations describing why are pushed onto `violations`.
 */

/** Phase: validate mixin structure and return its data clone (G.5.2). */
function checkMixinRequirements(
  doc: SoulDocument,
  data: Record<string, unknown>,
  mode: Mode,
  violations: Violation[]
): Record<string, unknown> | null {
  const missing = ["soul_spec", "id"].filter((key) => !Object.hasOwn(data, key));
  for (const key of missing) {
    violations.push({
      path: key,
      message: `mixin "${doc.path}" is missing required key "${key}"`,
      severity: mode === "strict" ? "error" : "warning",
      section: "§7.4",
    });
  }
  if (mode === "strict" && missing.length > 0) return null;
  return structuredClone(data);
}

/** Phase: validate mandatory core keys for non-root soul references (G.5.2). */
function checkReferencedSoulRequirements(
  doc: SoulDocument,
  data: Record<string, unknown>,
  mode: Mode,
  violations: Violation[]
): boolean {
  const missing = MANDATORY.filter((key) => !Object.hasOwn(data, key));
  for (const key of missing) {
    violations.push({
      path: key,
      message: `referenced soul "${doc.path}" is missing required key "${key}"`,
      severity: mode === "strict" ? "error" : "warning",
      section: "§5.1",
    });
  }
  return !(mode === "strict" && missing.length > 0);
}

/** Phase: load and merge one composition reference into accumulator (§7.5 steps 1–2). */
async function mergeOneRef(
  ref: unknown,
  refPath: string,
  doc: SoulDocument,
  loadRef: LoadRef,
  visiting: string[],
  violations: Violation[],
  mode: Mode,
  accumulator: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  if (typeof ref !== "string") {
    violations.push({
      path: refPath,
      message: "composition references must be strings",
      severity: mode === "strict" ? "error" : "warning",
      section: "§7.2",
    });
    return accumulator;
  }

  const loaded = await loadRef(ref, doc.path);
  if (Array.isArray(loaded)) {
    // Broken referenced file: propagate the child's violations with the
    // referencing path context (WP04 T017).
    violations.push(
      {
        path: refPath,
        message: `failed to load reference "${ref}" from "${doc.path}"`,
        severity: "error",
        section: "§7.2",
      },
      ...loaded
    );
    return null;
  }

  // §7.3 cycle detection over the canonical paths reported by loadRef.
  if (visiting.includes(loaded.path)) {
    violations.push({
      path: "composition",
      message: `Cycle detected: ${[...visiting, loaded.path].join(" -> ")}`,
      severity: "error", // a cycle is unresolvable in BOTH modes
      section: "§7.3",
    });
    return null;
  }

  visiting.push(loaded.path);
  const child = await composeDocument(loaded, loadRef, visiting, violations, mode, false);
  visiting.pop();
  if (child === null) return null;

  // §7.5 / §9.4 / G.5.4: strip root-owned fields from the loaded result
  // BEFORE merging — a base's or mixin's profiles never cross the
  // composition boundary, even when the base is itself a composed soul.
  return merge(
    accumulator,
    stripRootOwned(child),
    RFC1_MERGE_STRATEGY
  ) as Record<string, unknown>;
}

async function composeDocument(
  doc: SoulDocument,
  loadRef: LoadRef,
  visiting: string[],
  violations: Violation[],
  mode: Mode,
  isRoot: boolean
): Promise<Record<string, unknown> | null> {
  if (visiting.length > MAX_COMPOSITION_DEPTH) {
    violations.push({
      path: "composition",
      message:
        `composition reference depth exceeds ${MAX_COMPOSITION_DEPTH} ` +
        `(chain: ${visiting.join(" -> ")})`,
      severity: "error",
      section: "§7.3",
    });
    return null;
  }

  const data = doc.frontMatter;
  if (!isRecord(data)) {
    violations.push({
      path: "(document)",
      message: `front matter of "${doc.path}" is not a mapping`,
      severity: "error",
      section: "§3.1.1",
    });
    return null;
  }

  // G.5.2: a `kind: mixin` document returns as-is — its own composition (if
  // any) is NOT resolved. Partial mixins MUST carry soul_spec and id (§7.4).
  if (doc.kind === "mixin") {
    return checkMixinRequirements(doc, data, mode, violations);
  }

  // G.5.2 ValidateMandatoryCore for referenced (non-root) soul documents.
  // The root's own validity surfaces via the materialized validation (G.6)
  // and the pipeline's per-document validate, so it is not re-checked here.
  if (!isRoot && !checkReferencedSoulRequirements(doc, data, mode, violations)) {
    return null;
  }

  const composition = isRecord(data["composition"]) ? data["composition"] : {};
  let accumulator: Record<string, unknown> = {};

  // §7.5 steps 1–2: extends in listed order, then mixins in listed order,
  // each merged left-to-right with Standard Merge.
  for (const sourceKey of ["extends", "mixins"] as const) {
    const refs = composition[sourceKey];
    if (!Array.isArray(refs)) continue; // §7.1 default []
    for (let index = 0; index < refs.length; index++) {
      const ref = refs[index];
      const refPath = `composition.${sourceKey}[${index}]`;
      const next = await mergeOneRef(ref, refPath, doc, loadRef, visiting, violations, mode, accumulator);
      if (next === null) return null;
      accumulator = next;
    }
  }

  // §7.5 step 3 + G.5.2/G.5.3: merge the local document (minus root-owned
  // fields), then reattach THIS document's original profiles and
  // profile_overrides verbatim. Net effect for the root: its overlays are
  // preserved untouched (never merged with anything — bases were stripped),
  // satisfying "stripping never happens on the root".
  const result = merge(
    accumulator,
    stripRootOwned(data),
    RFC1_MERGE_STRATEGY
  ) as Record<string, unknown>;
  if (Object.hasOwn(data, "profiles")) {
    result["profiles"] = structuredClone(data["profiles"]);
  }
  if (Object.hasOwn(data, "profile_overrides")) {
    result["profile_overrides"] = structuredClone(data["profile_overrides"]);
  }
  return result;
}

/**
 * Phase: §7.5 step 4 / G.5.1 profile selection.
 *
 * Returns the resolved profile name and the effective config with the profile
 * overlay applied, or null when strict-mode selection fails (violations
 * pushed onto `violations`).
 */
function applyProfileSelection(
  composed: Record<string, unknown>,
  requestedProfile: string,
  mode: Mode,
  violations: Violation[]
): { profile: string; effective: Record<string, unknown> } | null {
  let profile = requestedProfile;
  const profiles = composed["profiles"];
  if (!Array.isArray(profiles) || !profiles.includes(profile)) {
    if (mode === "strict") {
      violations.push({
        path: "profiles",
        message: `Unknown profile "${profile}"`,
        severity: "error",
        section: "§9",
      });
      return null;
    }
    // Permissive: warn and fall back to "default" (§9.3; G.4 "continue when
    // safe" — mirrors the §20.1 unknown-requested-state fallback).
    violations.push({
      path: "profiles",
      message: `Unknown profile "${profile}"; falling back to "default"`,
      severity: "warning",
      section: "§9",
    });
    profile = "default";
  }

  let effective: Record<string, unknown> = composed;
  const overrides = composed["profile_overrides"];
  if (isRecord(overrides) && Object.hasOwn(overrides, profile)) {
    const overlay = overrides[profile];
    if (isRecord(overlay)) {
      effective = merge(effective, overlay, RFC1_MERGE_STRATEGY) as Record<string, unknown>;
    } else {
      violations.push({
        path: `profile_overrides.${profile}`,
        message: "profile override must be a mapping (partial YAML tree)",
        severity: mode === "strict" ? "error" : "warning",
        section: "§9.2",
      });
    }
  }
  return { profile, effective };
}

/**
 * Phase: §7.5 step 5 state application.
 *
 * Returns `{ activeState, effective }` on success, or null when strict-mode
 * state-block validation or selection fails (violations pushed onto `violations`).
 */
function applyStatePhase(
  effective: Record<string, unknown>,
  requestedState: string | null,
  mode: Mode,
  violations: Violation[]
): { activeState: string | null; effective: Record<string, unknown> } | null {
  const stateBlockViolations = validateStateBlock(effective, mode);
  violations.push(...stateBlockViolations);
  if (mode === "strict" && stateBlockViolations.some((v) => v.severity === "error")) {
    return null;
  }

  const selection = selectState(effective, requestedState, mode, violations);
  if (Array.isArray(selection)) {
    violations.push(...selection);
    return null;
  }
  let activeState: string | null = null;
  if (selection !== null) {
    activeState = selection;
    effective = applyStateOverlay(effective, selection);
  }
  return { activeState, effective };
}

/**
 * Full §7.5 / Appendix G.5.1 resolution with a rich outcome: effective
 * config, applied profile, active state, and EVERY violation (errors and
 * warnings). The adapter-contract wrapper `resolveComposition` collapses
 * this to `EffectiveConfig | Violation[]`, which cannot carry warnings next
 * to a successful config — pipeline code that must report permissive-mode
 * warnings (WP05) should call this function instead.
 */
export async function resolveCompositionDetailed(
  doc: SoulDocument,
  opts: ResolveOptions,
  loadRef: LoadRef
): Promise<ResolveOutcome> {
  const violations: Violation[] = [];
  const mode = opts.mode;
  const requestedProfile = opts.profile ?? "default"; // §9.3

  // §7.5 steps 1–3 (G.5.2), cycle set seeded with the root's own path.
  const composed = await composeDocument(
    doc,
    loadRef,
    [doc.path],
    violations,
    mode,
    true
  );
  if (composed === null) {
    return { effective: null, profile: requestedProfile, state: null, violations };
  }

  // §7.5 step 4 / G.5.1: profile selection.
  const profileResult = applyProfileSelection(composed, requestedProfile, mode, violations);
  if (profileResult === null) {
    return { effective: null, profile: requestedProfile, state: null, violations };
  }
  const { profile } = profileResult;
  let effective = profileResult.effective;

  // §7.5 step 5: state.
  const stateResult = applyStatePhase(effective, opts.state ?? null, mode, violations);
  if (stateResult === null) {
    return { effective: null, profile, state: null, violations };
  }
  effective = stateResult.effective;
  const activeState = stateResult.activeState;

  // G.6 materialized validation: composition can assemble an INVALID
  // effective config (bad ranges, unknown keys, broken profile bookkeeping);
  // that must surface even though every input document looked fine. The
  // effective config is still returned alongside the violations — the §25.1
  // report layer decides what `ok` means.
  // §21.1 / FR-011: evaluation rule references resolve against the
  // materialized config (profiles/state may have contributed criteria).
  violations.push(...validate(effective, mode), ...resolveRuleRefs(effective, mode));

  return { effective, profile, state: activeState, violations };
}

/**
 * Adapter-contract resolution (SpecAdapter.resolve shape):
 * `EffectiveConfig` on success, `Violation[]` when resolution failed or any
 * error-severity violation was found. Warning-only outcomes return the
 * effective config; the warnings are available via
 * `resolveCompositionDetailed` (documented seam for WP05).
 */
export async function resolveComposition(
  doc: SoulDocument,
  opts: ResolveOptions,
  loadRef: LoadRef
): Promise<EffectiveConfig | Violation[]> {
  const outcome = await resolveCompositionDetailed(doc, opts, loadRef);
  if (outcome.effective === null || outcome.violations.some((v) => v.severity === "error")) {
    return outcome.violations;
  }
  return outcome.effective;
}
