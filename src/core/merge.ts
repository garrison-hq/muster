/**
 * Standard Merge engine — RFC-1 §8 executed as data-driven behavior.
 *
 * The strategy object (§8.1 as data, supplied by the adapter) parameterizes
 * the engine; the core hard-codes no spec-version-specific behavior.
 *
 * Normative rules implemented (RFC-1 §8.1–§8.3):
 * - Scalars (string/number/bool/null): overlay replaces base.
 * - Both maps: deep-merge recursively by key.
 * - Lists: overlay replaces base entirely — never append/union (§8.2).
 * - Type mismatch (map↔scalar, list↔map, ...): overlay replaces, NOT an error.
 * - `null` overlay value: the key remains, with value `null` — `null` is a
 *   value, not a deletion operator (§8.3).
 */

import type { MergeStrategy } from "./adapter.js";

function isMap(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structural copy so merge results never alias (or mutate) the inputs. */
function deepCopy(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepCopy);
  }
  if (isMap(value)) {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      copy[key] = deepCopy(value[key]);
    }
    return copy;
  }
  return value;
}

/**
 * Merge `overlay` onto `base` per the given strategy (RFC-1 §8.1 Standard Merge).
 * Pure: never mutates the inputs; returns freshly built structures.
 */
export function merge(base: unknown, overlay: unknown, strategy: MergeStrategy): unknown {
  if (isMap(base) && isMap(overlay) && strategy.maps === "deep") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(base)) {
      result[key] = deepCopy(base[key]);
    }
    for (const key of Object.keys(overlay)) {
      // §8.3 (strategy.nullIsValue): a null overlay value replaces like any
      // scalar — the key stays present; merge never deletes keys.
      result[key] = key in base
        ? merge(base[key], overlay[key], strategy)
        : deepCopy(overlay[key]);
    }
    return result;
  }
  // Everything else — scalars, lists, and type mismatches — is "replace":
  // strategy.scalars / strategy.lists / strategy.typeMismatch (§8.1, §8.2).
  return deepCopy(overlay);
}
