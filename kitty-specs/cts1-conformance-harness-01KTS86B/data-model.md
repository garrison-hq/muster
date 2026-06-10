# Phase 1 Data Model: muster (@garrison-hq/muster)

Types are presented in TypeScript shape for precision; they live in `src/core/` unless marked RFC-1.
RFC-1 section citations are normative anchors.

## Static side

### SoulDocument (parsed, pre-validation)
| Field | Type | Notes |
|---|---|---|
| `path` | string | absolute or manifest-relative source path |
| `frontMatter` | unknown | first YAML block only (§3.1.1), resolved to plain data **after** forbidden-feature check |
| `body` | string | Markdown after closing `---`; never interpreted as config (§3) |
| `kind` | `"soul" \| "mixin"` | defaults to `"soul"` when omitted (§5.3) |

### Violation
| Field | Type | Notes |
|---|---|---|
| `path` | string | config path, e.g. `composition.extends[1]` — non-empty (NFR-005) |
| `message` | string | human-readable — non-empty |
| `severity` | `"error" \| "warning"` | warnings never flip `ok` |
| `section` | string? | RFC-1 citation, e.g. `"§8.1"` (charter directive 3; extension over §25.1, serialized only when present) |

### ConformanceReport (§25.1 shape, exactly)
| Field | Type | Notes |
|---|---|---|
| `spec` | string | `"1.0.0-rc1"` |
| `soul_id` | string | from document `id`; `""` if unparseable |
| `mode` | `"strict" \| "permissive"` | |
| `profile` | string | selected profile, default `"default"` |
| `state` | string \| null | active state or null |
| `ok` | boolean | false iff ≥1 error |
| `errors` | Violation[] (severity=error) | serialized as `{path, message}` (+`section` when set) |
| `warnings` | Violation[] (severity=warning) | same serialization |

### EffectiveConfig
Plain JSON-able object — the §7.5 resolution result. Canonical form = RFC 8785 bytes (R2). Invariant: resolving the same inputs twice yields identical bytes (NFR-001).

### MergeStrategy (core) — parameterizes `merge.ts`
Standard Merge (§8.1) as data: `{ scalars: "replace", maps: "deep", lists: "replace", typeMismatch: "replace", nullIsValue: true }`. Supplied by the adapter, executed by the core.

### CtsManifest / CtsCase (Appendix F.1)
| Field | Type | Notes |
|---|---|---|
| `id` | string | unique within manifest |
| `root` | string | path to root Soul.md, manifest-relative |
| `profile` | string? | |
| `state` | string? | runtime-requested state (§20.1) |
| `mode` | `"strict" \| "permissive"` | |
| `expect_ok` | boolean | |
| `expect_effective_yaml` | string? | F.1 key: YAML loaded → canonicalized → compared (R8) |
| `expect_effective_json` | string? | muster extension: canonical-JSON file, byte compare (R8) |
| `expect_errors` | `{path, message}[]`? | each must match ≥1 actual error; `message` matches by substring |

### CtsCaseResult
`{ id, passed: boolean, report: ConformanceReport, mismatches: string[] }` — `mismatches` lists expectation failures (e.g. "expected error at composition not found", "effective config bytes differ at offset N").

## Adapter contract (core)

### SpecAdapter — the C-004 boundary, defined in `src/core/adapter.ts`
| Member | Signature (shape) | Duty |
|---|---|---|
| `name` | string | `"rfc1"` |
| `specVersion` | string | `"1.0.0-rc1"` |
| `parse` | `(raw, path) → SoulDocument \| Violation[]` | front-matter split + forbidden-feature check (§3.1.1, §4.2) |
| `validate` | `(doc, mode) → Violation[]` | schema + keyspace + semantic checks (App. E, §25) |
| `resolve` | `(doc, {profile, state, mode}, loadRef) → EffectiveConfig \| Violation[]` | §7.5 / Appendix G; `loadRef` callback resolves extends/mixins paths so core owns I/O |
| `mergeStrategy` | MergeStrategy | §8.1 as data |
| `thresholds` | ThresholdMapping | R9; behavioral grading inputs |
| `behavioralFacts` | `(effective, facts, turnIndex) → string \| null` | evaluates triggers (R7 subset) → active state name |

Core imports nothing from `src/adapters/`; the CLI injects the adapter (plan: Structure Decision).

## Behavioral side

### Turn / TurnList
| Field | Type | Notes |
|---|---|---|
| `role` | `"user"` | turn lists carry user turns; assistant turns are produced |
| `content` | string | |
| `facts` | `Record<string, boolean \| string>`? | injected **before** this turn's evaluation moment (§21.0.1, §20.3.1 OnUserMessage) |

### BehavioralCase
| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `soul` | string | path to soul fixture |
| `profile` / `state` | string? | initial selection |
| `turns` | Turn[] | length ≥ 1; multi-turn first-class (C-005) |
| `axes` | AxisSpec[] | which graders run on which turns |
| `runs` | int (default 3) | n in k-of-n (FR-022) |
| `pass_threshold` | int (default 2) | k; errored run = failed run |
| `overrides` | `{max_words?, refusal_cap?}`? | per-case threshold override (FR-018/019) |

### AxisSpec (discriminated union)
- `{ axis: "verbosity", turns: int[] \| "all" }` — word count ≤ mapped/overridden max
- `{ axis: "refusal", turn: int, assertions?: ContentAssertion[] }` — word count ≤ cap + assertions
- `{ axis: "state_shift", trigger_turn: int, expect_state: string }` — post-shift grading uses shifted state's thresholds (FR-021)

### ContentAssertion
`{ kind: "must_contain" \| "must_not_contain", pattern: string, regex?: boolean }` (FR-020) — e.g. forbid `/\$?\d+([.,]\d+)?/` price figures.

### TranscriptEntry / Transcript
`TranscriptEntry = { role: "user" | "assistant", content, activeState: string, wordCount?: int }`
`Transcript = { entries: TranscriptEntry[], model: string, baseUrl: string, temperature: number | "default", durationMs: int }` (FR-023)

### RunVerdict / CaseVerdict
`RunVerdict = { run: int, passed: boolean, axes: AxisGrade[], transcript: Transcript, error?: string }`
`AxisGrade = { axis, turn, measured: number | string, limit: number | string, passed: boolean }` — NFR-005: failures always carry measured + limit.
`CaseVerdict = { id, passed: boolean, passCount: int, runs: RunVerdict[] }` — `passed = passCount ≥ pass_threshold`.

### EndpointConfig
`{ baseUrl: string, model: string, apiKeyEnv: "MUSTER_API_KEY" | "OPENAI_API_KEY" }` — key value never stored, read from env at call time (R6, directive 5).

### ThresholdMapping (RFC-1 adapter, R9 — locked)
`maxWords(verbosity) = 10 + verbosity` · `refusalCap = 25` · `words(s) = trim-split-/\s+/-count`.

## State transitions (behavioral runner)

```
activeState := state.base | lexicographic-min(state.states)        (§20.1)
for each turn t:
  if t.facts: evaluate triggers in order, first match wins          (§20.3.3, R7)
    → activeState := shift_to  (applied before generating reply)    (§20.3.4)
  send conversation so far → endpoint → append assistant entry
  grade axes bound to this turn against activeState's thresholds
duration semantics: "message" reverts before next turn's evaluation;
"session" persists; "timed" out of scope (no wall clock in tests)    (§20.3.5)
```

## Validation-rule traceability (data-model level)

Every Violation produced by the RFC-1 adapter carries `section`; the spec's nine §25.2 categories map onto adapter modules: soul-yaml.ts (cat. 1), keyspace.ts (cat. 2–3), merge strategy + resolve.ts (cat. 4–6), keyspace.ts (cat. 7), state.ts (cat. 8), evaluation.ts (cat. 9).
