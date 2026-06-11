/**
 * SpecAdapter contract — the C-004 boundary, transcribed verbatim from
 * kitty-specs/cts1-conformance-harness-01KTS86B/contracts/adapter-interface.md.
 *
 * Core never imports adapters; the CLI composes them. A future SoulSpec-0.5
 * adapter implements this interface and nothing in `src/core/` changes.
 */

import type { Violation } from "./report.js";

export type Mode = "strict" | "permissive";

/** Parsed Soul document, pre-validation (RFC-1 §3, §5.3). */
export interface SoulDocument {
  /** Absolute or manifest-relative source path. */
  path: string;
  /**
   * First YAML block only (§3.1.1), resolved to plain data **after** the
   * forbidden-feature check (§4.2).
   */
  frontMatter: unknown;
  /** Markdown after the closing `---`; never interpreted as config (§3). */
  body: string;
  /** Defaults to "soul" when omitted (§5.3). */
  kind: "soul" | "mixin";
}

/**
 * Plain JSON-able object — the §7.5 resolution result. Canonical form is the
 * RFC 8785 byte sequence (R2). Invariant: resolving the same inputs twice
 * yields identical bytes (NFR-001).
 */
export type EffectiveConfig = Record<string, unknown>;

/**
 * Standard Merge (RFC-1 §8.1) expressed as data; supplied by the adapter,
 * executed by the core merge engine.
 */
export interface MergeStrategy {
  /** Scalar values (string/number/bool/null): overlay replaces base (§8.1). */
  readonly scalars: "replace";
  /** Map values: deep-merge recursively by key (§8.1). */
  readonly maps: "deep";
  /** List values: overlay replaces base entirely — never append/union (§8.1, §8.2). */
  readonly lists: "replace";
  /** Different value types on both sides: overlay replaces, not an error (§8.1). */
  readonly typeMismatch: "replace";
  /** `null` is a scalar value, not a deletion operator (§8.3). */
  readonly nullIsValue: true;
}

/** R9 thresholds (locked): behavioral grading inputs; per-case overrides win. */
export interface ThresholdMapping {
  /** maxWords(verbosity) = 10 + verbosity (R9). */
  maxWords(verbosity: number): number;
  /** refusalCap = 25 (R9). */
  readonly refusalCap: number;
  /** words(s) = trim-split-/\s+/-count (R9). */
  words(s: string): number;
}

export interface SpecAdapter {
  /** e.g. "rfc1" — used in CLI selection and reports */
  readonly name: string;
  /** e.g. "1.0.0-rc1" — emitted as ConformanceReport.spec */
  readonly specVersion: string;

  /** §3.1.1 front-matter extraction + §4.2 forbidden-feature detection.
   *  MUST NOT apply forbidden YAML semantics; returns violations instead. */
  parse(raw: string, path: string, mode: Mode): SoulDocument | Violation[];

  /** Appendix E schema + §25 keyspace/semantic checks. Pure; no I/O. */
  validate(doc: SoulDocument, mode: Mode): Violation[];

  /** §7.5 / Appendix G resolution. All file access goes through loadRef so the
   *  core owns I/O and cycle bookkeeping stays testable. Returns violations on
   *  cycles, bad profile/state selection, etc. */
  resolve(
    doc: SoulDocument,
    opts: { profile?: string; state?: string; mode: Mode },
    loadRef: (ref: string, fromPath: string) => Promise<SoulDocument | Violation[]>
  ): Promise<EffectiveConfig | Violation[]>;

  /** §8.1 Standard Merge expressed as data; executed by core merge engine. */
  readonly mergeStrategy: MergeStrategy;

  /** R9 thresholds: maxWords(verbosity), refusalCap, words(). Behavioral
   *  grading consumes these; per-case overrides win. */
  readonly thresholds: ThresholdMapping;

  /** R7 predicate subset over injected facts → new active state name or null.
   *  First-match-wins over state.triggers (§20.3.3). Unsupported predicate
   *  syntax → Violation in strict mode. */
  evaluateTriggers(
    effective: EffectiveConfig,
    facts: Record<string, boolean | string>,
    mode: Mode
  ): string | Violation[] | null;
}
