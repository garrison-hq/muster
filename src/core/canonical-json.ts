/**
 * RFC 8785 (JSON Canonicalization Scheme) serializer — the exact comparison
 * form for CTS-1 (RFC-1 Appendix F.2, FR-013, NFR-001).
 *
 * Strategy (research R2): object keys are sorted by UTF-16 code units
 * (`Array.prototype.sort()` default) and primitives ride on `JSON.stringify`,
 * whose ECMA-262 number formatting and string escaping match RFC 8785.
 * No custom number formatter — deliberately.
 */

/**
 * Serialize `value` to its RFC 8785 canonical JSON form.
 *
 * - Objects: keys sorted by UTF-16 code units, values recursed.
 * - Arrays: element order preserved, elements recursed.
 * - Primitives: ECMA-262 `JSON.stringify` formatting.
 * - No trailing newline.
 *
 * @throws TypeError for values canonical JSON cannot represent:
 *   `undefined`, functions, symbols, bigints, and non-finite numbers.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(
          `canonical JSON cannot represent non-finite number: ${String(value)}`
        );
      }
      return JSON.stringify(value);
    case "object":
      return Array.isArray(value)
        ? canonicalArray(value)
        : canonicalObject(value as Record<string, unknown>);
    default:
      // undefined, function, symbol, bigint
      throw new TypeError(`canonical JSON cannot represent value of type ${typeof value}`);
  }
}

function canonicalArray(values: readonly unknown[]): string {
  return `[${values.map(canonicalJson).join(",")}]`;
}

function canonicalObject(obj: Record<string, unknown>): string {
  // Default sort compares UTF-16 code units — exactly the RFC 8785 key order.
  const keys = Object.keys(obj).sort();
  const members = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`);
  return `{${members.join(",")}}`;
}
