/**
 * Rfc1Adapter — the SpecAdapter assembly for Soul.md RFC-1 1.0.0-rc1.
 *
 * Pure composition of the WP02–WP04 pieces; no CLI concerns, no I/O beyond
 * the injected loadRef. This is the only module the CLI/CTS layers need to
 * import to plug RFC-1 into the spec-agnostic core pipeline (C-004: core
 * never imports this — the composition happens from outside).
 */

import type {
  Mode,
  SoulDocument,
  SpecAdapter,
  ThresholdMapping,
} from "../../core/adapter.js";
import type { Violation } from "../../core/report.js";
import type { DetailedSpecAdapter } from "../../core/pipeline.js";
import { extractFrontMatter } from "./frontmatter.js";
import { parseSoulYaml } from "./soul-yaml.js";
import { validate } from "./keyspace.js";
import {
  RFC1_MERGE_STRATEGY,
  resolveComposition,
  resolveCompositionDetailed,
} from "./resolve.js";
import { evaluateTriggers } from "./state.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * §3.1.1 + §4.1–§4.2 parse: front-matter extraction (pure text splitting),
 * Soul-YAML parsing with forbidden-feature refusal (no expansion is ever
 * observable), then §5.3 kind defaulting: `kind` is "mixin" only when the
 * document says exactly that; omitted (or any other value — the schema layer
 * rejects invalid spellings) defaults to "soul".
 */
function parse(raw: string, path: string, mode: Mode): SoulDocument | Violation[] {
  const extracted = extractFrontMatter(raw, mode);
  if (Array.isArray(extracted)) return extracted;
  const parsed = parseSoulYaml(extracted.yamlText, mode);
  if (Array.isArray(parsed)) return parsed;
  const data = parsed.data;
  const kind: "soul" | "mixin" =
    isRecord(data) && data["kind"] === "mixin" ? "mixin" : "soul";
  return { path, frontMatter: data, body: extracted.body, kind };
}

/*
 * ── Thresholds dynamic-linkage seam (WP09) ─────────────────────────────────
 *
 * `src/adapters/rfc1/thresholds.ts` is WP09-owned and MUST NOT be created
 * here. To let this module compile and load before WP09 lands, the linkage is
 * a dynamic import with a NON-LITERAL specifier (typed `string`, so tsc does
 * not try to resolve the not-yet-existing module), attempted once at module
 * load via top-level await. The `thresholds` getter below returns the linked
 * mapping or throws a clear "not yet linked" error.
 *
 * WP09 linking contract: create `./thresholds.ts` exporting the R9 mapping as
 * EITHER a named export `rfc1Thresholds: ThresholdMapping` OR the default
 * export. Nothing in this file needs to change — the import starts resolving
 * as soon as the module exists, and WP09's tests exercise the real linkage
 * through `rfc1Adapter.thresholds`.
 */
const THRESHOLDS_MODULE: string = "./thresholds.js";

let linkedThresholds: ThresholdMapping | undefined;
try {
  const mod = (await import(THRESHOLDS_MODULE)) as {
    rfc1Thresholds?: ThresholdMapping;
    default?: ThresholdMapping;
  };
  linkedThresholds = mod.rfc1Thresholds ?? mod.default;
} catch {
  // WP09 has not landed yet — the getter below reports this clearly.
}

/** The RFC-1 1.0.0-rc1 adapter. Satisfies SpecAdapter (tsc-enforced) and the
 *  core pipeline's optional DetailedSpecAdapter capability, so `checkSoul`
 *  can report permissive-mode warnings and the resolved active state. */
export const rfc1Adapter: DetailedSpecAdapter = {
  name: "rfc1",
  specVersion: "1.0.0-rc1",

  parse,

  /** Appendix E schema + §25 keyspace + §4.3/§4.3.1 scalars + §9 profiles,
   *  deduplicated by (path, message). Pure; no I/O. */
  validate(doc, mode) {
    return validate(doc.frontMatter, mode);
  },

  /** §7.5 / Appendix G resolution (state applied internally per §20). */
  resolve(doc, opts, loadRef) {
    return resolveComposition(doc, opts, loadRef);
  },

  /** Rich variant for the core pipeline: warnings next to a successful
   *  config, plus the applied profile and active state. */
  resolveDetailed(doc, opts, loadRef) {
    return resolveCompositionDetailed(doc, opts, loadRef);
  },

  /** §8.1 Standard Merge as data. */
  mergeStrategy: RFC1_MERGE_STRATEGY,

  /** R9 thresholds — linked dynamically from WP09's `./thresholds.js` (see
   *  the seam note above). Throws until that module exists. */
  get thresholds(): ThresholdMapping {
    if (linkedThresholds === undefined) {
      throw new Error(
        "rfc1 thresholds not yet linked: src/adapters/rfc1/thresholds.ts " +
          "(WP09-owned) is absent — it must export `rfc1Thresholds` (or a " +
          "default export) implementing ThresholdMapping"
      );
    }
    return linkedThresholds;
  },

  /** R7 trigger evaluation (§20.2/§20.3), first-match-wins. */
  evaluateTriggers(effective, facts, mode) {
    return evaluateTriggers(effective, facts, mode);
  },
};

/** Structural conformance witness: the assembly satisfies the C-004 contract.
 *  The typed assignment is the check; `noUnusedLocals` is not enabled so the
 *  `_`-prefixed variable requires no `void` suppressor (S3735). */
const _contractCheck: SpecAdapter = rfc1Adapter;
