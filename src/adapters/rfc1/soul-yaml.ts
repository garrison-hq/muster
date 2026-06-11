/**
 * RFC-1 §4.1–§4.2 Soul-YAML enforcement.
 *
 * Critical requirement (§4.2): the semantics of forbidden YAML features
 * (anchors, aliases, merge keys, custom tags, complex keys) are NEVER
 * applied. We use `parseDocument()` (research R1) and walk the AST with
 * `visit` BEFORE any call to `.toJS()`. `.toJS()` is reachable only when the
 * walk found nothing, so aliases are detected before any resolution to JS
 * values and no expansion is ever observable.
 *
 * Both modes refuse documents containing forbidden features (§4.2 option 1 —
 * "reject with warning" is the RECOMMENDED permissive behavior; we refuse to
 * load in both modes and the caller may downgrade presentation).
 *
 * Whole-document syntax errors (§4.1) carry an empty `path`
 * (documented-empty: there is no resolved config path for an unparseable
 * document).
 */

import {
  parseDocument,
  visit,
  isAlias,
  isPair,
  isScalar,
  isSeq,
  Scalar,
} from "yaml";
import type { Mode } from "../../core/adapter.js";
import type { Violation } from "../../core/report.js";

/** YAML 1.2 core schema tag set — the only explicit tags Soul-YAML allows (§4.2). */
const CORE_SCHEMA_TAGS: ReadonlySet<string> = new Set([
  "tag:yaml.org,2002:map",
  "tag:yaml.org,2002:seq",
  "tag:yaml.org,2002:str",
  "tag:yaml.org,2002:int",
  "tag:yaml.org,2002:float",
  "tag:yaml.org,2002:bool",
  "tag:yaml.org,2002:null",
]);

/**
 * Build a config path (`a.b[0]`) from a `visit` ancestry. Ancestors that are
 * Pairs contribute their key name; Seq ancestors contribute the index of the
 * child on the route to the visited node.
 */
function buildPath(ancestry: readonly unknown[], node: unknown): string {
  let out = "";
  for (let i = 0; i < ancestry.length; i++) {
    const ancestor = ancestry[i];
    const child = i + 1 < ancestry.length ? ancestry[i + 1] : node;
    if (isPair(ancestor)) {
      const key = ancestor.key;
      const segment = isScalar(key) ? String(key.value) : "<complex-key>";
      out = out === "" ? segment : `${out}.${segment}`;
    } else if (isSeq(ancestor)) {
      const index = ancestor.items.indexOf(child);
      out = `${out}[${index >= 0 ? index : "?"}]`;
    }
  }
  return out;
}

/** A `<<` key is a merge key only when it is an unquoted plain scalar — that is how YAML parses it. */
function isMergeKeyScalar(key: unknown): boolean {
  return (
    isScalar(key) &&
    key.value === "<<" &&
    (key.type === Scalar.PLAIN || key.type === undefined)
  );
}

/**
 * Parse a Soul-YAML front-matter block (§4.1–§4.2).
 *
 * Returns `{ data }` only when the document parses under YAML 1.2 and the
 * forbidden-feature walk found nothing; otherwise returns Violations. The
 * §4.2 no-expansion guarantee holds because `.toJS()` is only reached after a
 * clean walk.
 */
export function parseSoulYaml(
  yamlText: string,
  _mode: Mode
): { data: unknown } | Violation[] {
  const doc = parseDocument(yamlText, { version: "1.2" });

  // Document-level syntax errors → §4.1 (allowed-subset) violations.
  if (doc.errors.length > 0) {
    return doc.errors.map((err) => ({
      path: "",
      message: err.message,
      severity: "error" as const,
      section: "§4.1",
    }));
  }

  const violations: Violation[] = [];
  const forbid = (path: string, message: string): void => {
    violations.push({ path, message, severity: "error", section: "§4.2" });
  };

  // AST walk — strictly BEFORE .toJS(), so forbidden semantics never apply.
  visit(doc, {
    Alias(_key, node, ancestry) {
      forbid(buildPath(ancestry, node), "alias (*) is forbidden in Soul-YAML");
    },
    Scalar(_key, node, ancestry) {
      checkAnchorAndTag(node, ancestry);
    },
    Map(_key, node, ancestry) {
      checkAnchorAndTag(node, ancestry);
    },
    Seq(_key, node, ancestry) {
      checkAnchorAndTag(node, ancestry);
    },
    Pair(_key, pair, ancestry) {
      const parent = buildPath(ancestry, pair);
      if (isMergeKeyScalar(pair.key)) {
        forbid(
          parent === "" ? "<<" : `${parent}.<<`,
          "merge key (<<:) is forbidden in Soul-YAML"
        );
      }
      // Complex keys: non-scalar mapping keys (§4.2). Alias keys are already
      // reported by the Alias visitor.
      if (pair.key !== null && !isScalar(pair.key) && !isAlias(pair.key)) {
        forbid(
          parent === "" ? "<complex-key>" : `${parent}.<complex-key>`,
          "complex key is forbidden in Soul-YAML"
        );
      }
    },
  });

  function checkAnchorAndTag(
    node: { anchor?: string; tag?: string },
    ancestry: readonly unknown[]
  ): void {
    if (node.anchor !== undefined && node.anchor !== null) {
      forbid(buildPath(ancestry, node), "anchor (&) is forbidden in Soul-YAML");
    }
    if (node.tag !== undefined && !CORE_SCHEMA_TAGS.has(node.tag)) {
      forbid(buildPath(ancestry, node), "custom tag is forbidden in Soul-YAML");
    }
  }

  if (violations.length > 0) {
    return violations;
  }

  // Walk found nothing — only now is resolving to JS values allowed (§4.2).
  return { data: doc.toJS() };
}
