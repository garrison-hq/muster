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

  // G.5.2 ValidateMandatoryCore for referenced (non-root) soul documents.
  // The root's own validity surfaces via the materialized validation (G.6)
  // and the pipeline's per-document validate, so it is not re-checked here.
  if (!isRoot) {
    const missing = MANDATORY.filter((key) => !Object.hasOwn(data, key));
    for (const key of missing) {
      violations.push({
        path: key,
        message: `referenced soul "${doc.path}" is missing required key "${key}"`,
        severity: mode === "strict" ? "error" : "warning",
        section: "§5.1",
      });
    }
    if (mode === "strict" && missing.length > 0) return null;
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
      if (typeof ref !== "string") {
        violations.push({
          path: refPath,
          message: "composition references must be strings",
          severity: mode === "strict" ? "error" : "warning",
          section: "§7.2",
        });
        continue;
      }

      const loaded = await loadRef(ref, doc.path);
      if (Array.isArray(loaded)) {
        // Broken referenced file: propagate the child's violations with the
        // referencing path context (WP04 T017).
        violations.push({
          path: refPath,
          message: `failed to load reference "${ref}" from "${doc.path}"`,
          severity: "error",
          section: "§7.2",
        });
        violations.push(...loaded);
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
      accumulator = merge(
        accumulator,
        stripRootOwned(child),
        RFC1_MERGE_STRATEGY
      ) as Record<string, unknown>;
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
  let profile = opts.profile ?? "default"; // §9.3

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
    return { effective: null, profile, state: null, violations };
  }

  // §7.5 step 4 / G.5.1: profile selection against the ROOT's profiles
  // (reattached by G.5.3 — bases'/mixins' lists were stripped and can never
  // be selected against).
  const profiles = composed["profiles"];
  if (!Array.isArray(profiles) || !profiles.includes(profile)) {
    if (mode === "strict") {
      violations.push({
        path: "profiles",
        message: `Unknown profile "${profile}"`,
        severity: "error",
        section: "§9",
      });
      return { effective: null, profile, state: null, violations };
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

  // §7.5 step 5: state. Structural state-block checks first — strict mode
  // MUST fail loading on §20.3.7/§20.1.1 violations.
  const stateBlockViolations = validateStateBlock(effective, mode);
  violations.push(...stateBlockViolations);
  if (mode === "strict" && stateBlockViolations.some((v) => v.severity === "error")) {
    return { effective: null, profile, state: null, violations };
  }

  const selection = selectState(effective, opts.state ?? null, mode, violations);
  let activeState: string | null = null;
  if (Array.isArray(selection)) {
    violations.push(...selection);
    return { effective: null, profile, state: null, violations };
  }
  if (selection !== null) {
    activeState = selection;
    effective = applyStateOverlay(effective, selection);
  }

  // G.6 materialized validation: composition can assemble an INVALID
  // effective config (bad ranges, unknown keys, broken profile bookkeeping);
  // that must surface even though every input document looked fine. The
  // effective config is still returned alongside the violations — the §25.1
  // report layer decides what `ok` means.
  violations.push(...validate(effective, mode));
  // §21.1 / FR-011: evaluation rule references resolve against the
  // materialized config (profiles/state may have contributed criteria).
  violations.push(...resolveRuleRefs(effective, mode));

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
