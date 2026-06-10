# Contract: SpecAdapter interface (`src/core/adapter.ts`)

The C-004 boundary. Core never imports adapters; the CLI composes them. A future SoulSpec-0.5 adapter implements this interface and nothing in `src/core/` changes.

```ts
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
```

## Invariants
1. `parse`/`validate` are pure and synchronous; `resolve` does I/O only via `loadRef`.
2. Determinism: same inputs → same outputs, byte-stable through canonical JSON (NFR-001).
3. Every Violation carries non-empty `path` and `message`; RFC-1 adapter also sets `section` (charter directive 3).
4. Adapters never read environment variables or the network.
