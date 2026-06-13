# Data Model: Tools (TOOLS.md) Conformance Adapter + Drift Checks

**Mission**: `tools-adapter-01KTYMCB`
**Date**: 2026-06-13
**Spec**: `kitty-specs/tools-adapter-01KTYMCB/spec.md`

All entities live inside `src/adapters/tools/` behind the `SpecAdapter`
boundary (C-001). The spec-agnostic core never imports these types.

---

## Entities

### `TOOLSFile`

The parsed representation of a `TOOLS.md` file. Produced by the lint module
(WP01/FR-002) and consumed by both the lint checks (FR-003) and the drift check
(FR-004) as the documented side of the comparison.

```typescript
interface TOOLSFile {
  /** Absolute or runner-relative path to the source file. */
  readonly path: string;
  /** Ordered list of tool descriptors extracted from the file. */
  readonly tools: readonly ToolDescriptor[];
  /**
   * Raw section inventory used by static lint.
   * Keys are normalised section headings; values are the extracted prose.
   */
  readonly sections: ReadonlyMap<string, string>;
}
```

**Invariants**:
- `tools` entries are ordered by declaration position in the file (top to bottom).
- Duplicate `name` values within `tools` are a static-lint error, not a parse
  error — the parser surfaces them; the linter rejects them (spec edge case:
  "Two documented tools with the same name (duplicate) — static error").
- `sections` keys are normalised to lower-case trimmed heading text for
  locale-independent comparison (consistent with the UTF-16 canonical ordering
  in `src/core/canonical-json.ts`).

---

### `ToolDescriptor`

A single tool as documented in `TOOLS.md`. The documented side of a drift
comparison (FR-002, FR-004).

```typescript
interface ToolDescriptor {
  /** Tool name, exactly as documented. Must be unique within a TOOLSFile. */
  readonly name: string;
  /**
   * Prose description. Used only for lower-severity semantic-drift detection
   * (spec: "pure prose differences are a lower-severity finding").
   * Not part of the structured match-rubric.
   */
  readonly description: string;
  /**
   * Structured parameter declarations as documented.
   * Keys are parameter names; values carry the declared type and required flag.
   */
  readonly parameters: ReadonlyMap<string, ParameterDescriptor>;
}

interface ParameterDescriptor {
  /** JSON Schema type string as documented ("string", "integer", …). */
  readonly type: string;
  /** Whether the parameter is required per the documentation. */
  readonly required: boolean;
}
```

**Invariants**:
- `name` is the match key used by the drift check's match-rubric (FR-004).
- `parameters` is empty (not null/undefined) when no parameters are documented.
- `description` is always a non-empty string; the linter enforces a non-empty
  description per the muster rubric (FR-003).

---

### `EnvironmentDescriptor`

The live tool manifest supplied as an **input artifact** — an MCP server
manifest export or an OpenAI-compatible tool/function registry JSON file. The
drift check reads this as the environment side of the comparison (FR-004,
FR-005, C-003).

```typescript
type EnvironmentDescriptorFormat = "mcp-manifest" | "openai-tool-registry";

interface EnvironmentDescriptor {
  /** Detected format. Unknown format causes an immediate error (spec edge case). */
  readonly format: EnvironmentDescriptorFormat;
  /** Absolute or runner-relative path to the source file. */
  readonly path: string;
  /**
   * Tools available in the environment, keyed by name.
   * Populated after format-normalisation so the rest of the drift logic
   * is format-agnostic.
   */
  readonly tools: ReadonlyMap<string, EnvironmentToolEntry>;
}

interface EnvironmentToolEntry {
  /** Tool name as registered in the environment. */
  readonly name: string;
  /** Parameters declared by the environment's schema, if any. */
  readonly parameters: ReadonlyMap<string, ParameterDescriptor>;
}
```

**Invariants**:
- Loading an `EnvironmentDescriptor` from a file that matches neither the MCP
  manifest shape nor the OpenAI tool-registry shape produces a clear error
  (never a silent pass) — spec edge case "Environment descriptor format the
  adapter does not recognize".
- The descriptor is loaded once from a file; the drift check performs no
  network calls (C-003, NFR-001).
- `tools` keys are the normalised name strings used by the match-rubric.

---

### `DriftFinding`

One finding emitted by the drift check when the documented state diverges from
the environment (FR-004, FR-009). This is the central entity of the new drift
test class.

```typescript
type DriftFindingKind =
  | "documented-but-missing"       // tool in TOOLS.md, absent from environment
  | "present-but-undocumented"     // tool in environment, absent from TOOLS.md
  | "schema-mismatch";             // tool name matches; structured schema differs

type SchemaMismatchDirection =
  | "docs-ahead"     // documentation declares more than the environment has
  | "reality-ahead"; // environment has more/different than documentation states

interface DriftFinding {
  readonly kind: DriftFindingKind;
  /** Tool name that is the subject of this finding. */
  readonly toolName: string;
  /**
   * Direction of the mismatch (schema-mismatch only).
   * Absent for documented-but-missing and present-but-undocumented.
   */
  readonly direction?: SchemaMismatchDirection;
  /**
   * The specific field(s) that differ (schema-mismatch only).
   * e.g. ["parameters.recipient.type", "parameters.subject"] (FR-004 scenario 5).
   */
  readonly fields?: readonly string[];
  /**
   * Whether the mismatch is prose-only (semantic drift, lower severity).
   * true only when structured schemas are identical but descriptions differ.
   */
  readonly proseOnly: boolean;
  /**
   * Muster-published rubric clause that defines this finding type.
   * OpenClaw docs are cited as supporting source, pinned to a commit SHA.
   * Required — never absent (FR-009, C-002, charter: "every check cites a
   * normative source").
   */
  readonly citedRubric: string;
}
```

**Invariants**:
- `kind === "schema-mismatch"` implies `direction` is present.
- `kind === "schema-mismatch"` implies `fields` is non-empty.
- `proseOnly === true` implies `kind === "schema-mismatch"` and `fields` is
  empty / absent — prose-only differences are never `documented-but-missing`
  or `present-but-undocumented`.
- `citedRubric` is never empty; the drift check refuses to emit a finding
  without a rubric citation (charter invariant).
- A clean drift report (no findings, exact match) produces an empty array —
  byte-stable across runs and machines (SC-002, NFR-001).

---

### `DriftReport`

The complete output of a drift check run (FR-004, FR-010).

```typescript
interface DriftReport {
  readonly toolsFilePath: string;
  readonly envDescriptorPath: string;
  readonly envDescriptorFormat: EnvironmentDescriptorFormat;
  /** All findings from this run, ordered by kind then toolName (deterministic). */
  readonly findings: readonly DriftFinding[];
  /** Convenience flag: true iff findings is empty. */
  readonly clean: boolean;
}
```

**Invariant**: `clean === (findings.length === 0)`. Serialised ordering is
kind-then-toolName (UTF-16 code-unit lexicographic, locale-independent) to
satisfy NFR-001 byte-stability.

---

### `ToolSelectionCase`

A behavioral tool-selection test case (FR-006, FR-007, FR-008). The documented
tools from a `TOOLSFile` are registered as OpenAI-compatible function-call
invocables for the duration of the case.

```typescript
interface ToolSelectionCase {
  /** Unique case identifier (used in manifest runner output, FR-010). */
  readonly id: string;
  /**
   * Human-readable task scenario prompt presented to the model.
   * The model must select a tool (or abstain) in response.
   */
  readonly scenario: string;
  /**
   * Expected outcome graded by this case.
   * "correct-selection": a specific tool should be selected.
   * "abstain": no tool should be called (abstention axis).
   * "control": rigged-impossible control case (FR-008).
   */
  readonly expectedAxis: "correct-selection" | "abstain" | "control";
  /**
   * For expectedAxis "correct-selection": the exact tool name the model
   * must select. Absent for abstain and control cases.
   */
  readonly expectedTool?: string;
  /**
   * Number of runs for k-of-n aggregation (FR-007).
   * Minimum 1; typical value 3–5 for non-safety axes (charter).
   */
  readonly runs: number;
  /**
   * Minimum number of passing runs required for the case to pass (k in k-of-n).
   * Must satisfy 1 ≤ pass_threshold ≤ runs.
   */
  readonly pass_threshold: number;
  /**
   * For "control" cases: the deliberately wrong expected tool name that
   * the grader is forced to accept. Must produce a failing verdict to prove
   * the grader can fail (FR-008, charter).
   */
  readonly controlRiggedTool?: string;
}
```

**Invariants**:
- `expectedAxis === "correct-selection"` implies `expectedTool` is present and
  non-empty.
- `expectedAxis === "control"` implies `controlRiggedTool` is present.
- `1 ≤ pass_threshold ≤ runs`.
- A model selecting a tool not in the registered tool set counts as a wrong
  selection (spec edge case).
- An endpoint without tool-calling support causes the run to error; that run
  counts as failed (charter "errored run = failed run").

---

### `ToolSelectionVerdict`

The graded result for one `ToolSelectionCase` after all runs (FR-007, FR-010).

```typescript
interface ToolSelectionRunResult {
  readonly run: number;
  readonly passed: boolean;
  /** The tool name the model selected, or null if the model abstained. */
  readonly selectedTool: string | null;
  /** Duration of this run in milliseconds. */
  readonly durationMs: number;
  /** Error message if this run errored (errored = failed, never skipped). */
  readonly error?: string;
}

interface ToolSelectionVerdict {
  readonly id: string;
  /** true iff passCount >= pass_threshold (FR-007). */
  readonly passed: boolean;
  readonly passCount: number;
  readonly runs: readonly ToolSelectionRunResult[];
  /**
   * The axis that was graded: "correct-selection", "abstain", or "control".
   * A "control" case must produce passed === false by design (FR-008).
   */
  readonly axis: "correct-selection" | "abstain" | "control";
}
```

**Invariants**:
- `passed === (passCount >= pass_threshold)` (consistent with `runCase` in
  `src/core/behavioral/runner.ts`).
- For `axis === "control"`: `passed` must be `false` in the test suite — a
  passing control is itself a test failure (FR-008, charter).
- `runs.length === case.runs` (all runs recorded, no silent skips).

---

## Entity Relationships

```
TOOLSFile
  └── tools: ToolDescriptor[]       ← parsed from TOOLS.md (WP01)
        └── parameters: ParameterDescriptor[]

EnvironmentDescriptor               ← loaded from input artifact file (WP02)
  └── tools: EnvironmentToolEntry[]
        └── parameters: ParameterDescriptor[]

DriftCheck(TOOLSFile, EnvironmentDescriptor)
  └── DriftReport
        └── findings: DriftFinding[]   ← 0..* per run (WP02)

ToolSelectionCase                   ← loaded from scenario fixture (WP03)
  └── tools source: TOOLSFile (same parse path)
ToolSelectionCase --graded-by--> ToolSelectionVerdict (WP03)
```

---

## Charter Invariants

- Every `DriftFinding` carries a non-empty `citedRubric` — no finding without
  a normative citation (FR-009, C-002, charter "every check cites a normative
  source").
- `EnvironmentDescriptor` is always loaded from a file; the adapter never
  initiates a network call to gather it (C-003).
- All entities are plain JSON-serialisable records; the core's
  `canonicalJson()` function applies the UTF-16 ordering invariant for
  byte-stable output (NFR-001).
- The `SpecAdapter` boundary is enforced by TypeScript: `src/core/` has no
  import of `src/adapters/tools/` at compile time (C-001).
- `ToolSelectionCase.expectedAxis === "control"` always produces
  `ToolSelectionVerdict.passed === false` in the test suite; a passing control
  is a test-suite failure (FR-008, charter).
