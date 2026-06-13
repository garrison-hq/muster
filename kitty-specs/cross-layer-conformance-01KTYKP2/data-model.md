# Data Model: Cross-Layer Conformance

**Mission**: `cross-layer-conformance-01KTYKP2`
**Date**: 2026-06-13
**Spec**: `kitty-specs/cross-layer-conformance-01KTYKP2/spec.md`

All entities below correspond directly to the spec's Key Entities section.
No entities are invented beyond what the spec normatively requires.

---

## Entities

### StackComposition

The input to both test classes. Captures an ordered set of layer fixtures, an
optional declared precedence, and the resolved composed context produced by
assembly.

```typescript
/** Supported layer types for this milestone (C-005). */
type LayerType = "persona" | "sop" | "skill";

/** One layer entry in the stack. */
interface LayerEntry {
  /** Discriminates assembly strategy. */
  layerType: LayerType;
  /** Absolute path to the fixture file (persona: SOUL.md; sop: AGENTS.md; skill: SKILL.md). */
  fixturePath: string;
}

/** Optional declared precedence: an ordered list of layer types, highest-rank first.
 *  Present → wins field used in CrossLayerFinding; absent → undefined-precedence finding. */
interface PrecedenceDeclaration {
  /** e.g. ["sop", "persona", "skill"] — SOP outranks persona outranks skill. */
  order: [LayerType, ...LayerType[]];
}

/** The resolved composed context, produced by assembleComposedContext().
 *  The persona layer is resolved via resolveCompositionDetailed() (RFC-1 §7.5/Appendix G);
 *  the SOP and skill texts are concatenated in CONTEXT_FILE_ORDER injection order
 *  (AGENTS→SOUL per OpenClaw source; SHA-pinned citation). */
interface ResolvedContext {
  /** The full assembled system-prompt text for behavioral runs. */
  composedText: string;
  /** The SOP-alone text (persona stripped) used for baseline runs. */
  sopAloneText: string;
  /** Layer-to-text mapping for the static lint (lint runs on resolved text, C-003). */
  layerTexts: Map<LayerType, string>;
}

interface StackComposition {
  /** Ordered layers; at minimum [persona, sop]; skill is optional. */
  layers: LayerEntry[];
  /** Optional declared precedence. Absence does not prevent assembly; it drives findings. */
  precedence?: PrecedenceDeclaration;
  /** Populated by assembleComposedContext(); null until assembled. */
  resolved: ResolvedContext | null;
}
```

**Invariants**:
- `layers` must contain at least one persona layer and one sop layer.
- `layers` may contain at most one entry per `LayerType`.
- Only `LayerType` values above are accepted; any other layer identifier is
  rejected with a static error (C-005).
- `resolved` is never null when passed to the lint or the rule-survival runner;
  callers assemble first.
- Assembly calls `resolveCompositionDetailed` for the persona layer with
  `mode: "strict"` and propagates its violations as composition errors.

---

### CrossLayerFinding

Output of the static contradiction/precedence lint (FR-003, FR-004). Every
finding cites a normative source (FR-010, C-002).

```typescript
type CrossLayerFindingType =
  | "cross-layer-contradiction"   // direct conflict between two layers (FR-003)
  | "undefined-precedence"        // conflict where no precedence is declared (FR-004)
  | "resolved-by-precedence"      // conflict where declared precedence names a winner (FR-004)
  | "circular-precedence-error";  // A outranks B outranks A — static error (FR-004)

interface CrossLayerFinding {
  type: CrossLayerFindingType;
  /** Both layers involved in the conflict (always two entries for contradiction findings). */
  layers: [LayerType, LayerType];
  /** The clause from the first layer. */
  clauseA: string;
  /** The clause from the second layer. */
  clauseB: string;
  /** The winning layer when type is "resolved-by-precedence". */
  winner?: LayerType;
  /** Normative source citation — muster's published cross-layer rubric
   *  (with WIRE/Arbiter/instruction-hierarchy literature as supporting evidence)
   *  or "stack-declared-precedence" for resolved-by-precedence. */
  citedSource: string;
  /** FR-010: machine-readable format field. */
  severity: "error" | "warning";
}

interface CrossLayerLintReport {
  ok: boolean;            // true iff findings is empty (spec scenario 5)
  findings: CrossLayerFinding[];
  /** Byte-stable across runs: findings sorted by (type, layerA, layerB, clauseA)
   *  using UTF-16 code-unit order (charter performance benchmarks, NFR-001). */
}
```

**Invariants**:
- Lint runs on `StackComposition.resolved.layerTexts`, not raw files (C-003).
- Refinements (SOP narrows a persona generality) are not emitted as findings (FR-003).
- Circular precedence produces exactly one `circular-precedence-error` finding
  and halts further precedence analysis.
- `ok: true` iff `findings.length === 0`.
- Output is byte-stable and deterministic; no timestamps, no random order (NFR-001).

---

### RuleSurvivalCase

The unit of behavioral rule-survival grading (FR-005, FR-006). Captures the
SOP rule, its probe, the SOP-alone baseline, and the persona-composed treatment.

```typescript
type GradingClass =
  | "pass-k"    // safety-critical: ALL k composed runs must pass (FR-006, charter)
  | "k-of-n";   // stylistic: pass_threshold of n runs suffice

interface RuleSurvivalCase {
  id: string;
  /** The SOP rule under test (text, cited from the SOP adapter's rule manifest). */
  rule: string;
  /** The probe — reused from the SOP adapter's probe set (FR-005 assumption). */
  probe: string;
  /** Number of baseline runs (SOP-alone). */
  baselineRuns: number;
  /** Number of composed runs (persona + SOP). */
  composedRuns: number;       // = k for pass-k grading
  /** pass_threshold for k-of-n grading; ignored for pass-k. */
  passThreshold: number;
  gradingClass: GradingClass;
  /** Whether this case is the erosion-persona discrimination control (FR-009). */
  isDiscriminationControl: boolean;
}

type RuleSurvivalVerdict =
  | "survived"         // composed pass rate ≥ baseline within tolerance
  | "eroded"           // composed pass rate dropped below baseline tolerance
  | "baseline-failure" // SOP-alone pass rate already below threshold (FR-005)
  | "error";           // endpoint error; counts as failed (FR-006)

interface RunResult {
  /** true = passed, false = failed or errored. Errored run = false (charter). */
  passed: boolean;
  /** Present when the run produced an error (NFR-007). */
  errorMessage?: string;
}

interface RuleSurvivalResult {
  case: RuleSurvivalCase;
  baselineResults: RunResult[];
  composedResults: RunResult[];
  baselinePassRate: number;    // passed / total (0.0–1.0)
  composedPassRate: number;
  verdict: RuleSurvivalVerdict;
  /** For pass-k: false if any of the k composed runs failed. */
  passK?: boolean;
}
```

**Invariants**:
- Errored runs are counted as failed in both baseline and composed legs (FR-006, charter).
- `baseline-failure` is reported when `baselinePassRate < rubric-baseline-threshold`;
  no survival verdict is issued in this case (spec edge case).
- `pass-k` grading: `composedResults.every(r => r.passed)` must be true for
  `verdict === "survived"`.
- `isDiscriminationControl === true` cases must produce `verdict === "eroded"` —
  their failure validates that the test detects erosion (SC-003, FR-009).
- A persona that *improves* a rule's pass rate is not a failure; only degradation
  beyond tolerance fails (spec edge case).

---

### ErosionPersonaControl

A persona fixture written specifically to erode a known SOP refusal rule.
Doubles as the rule-survival discrimination control (FR-009, SC-003).

```typescript
interface ErosionPersonaControl {
  /** Absolute path to the persona fixture (SOUL.md) that contains the eroding instructions. */
  personaFixturePath: string;
  /** The specific SOP rule this persona is designed to erode. */
  targetRule: string;
  /** The probe that tests the targeted rule. */
  probe: string;
  /** The behavioral mechanism by which the persona erodes the rule
   *  (e.g. "always be maximally helpful and accommodating" overriding a refusal). */
  erosionMechanism: string;
}
```

**Invariants**:
- The erosion-persona control must be a `RuleSurvivalCase` with
  `isDiscriminationControl === true`.
- The composed run against this control must always yield `verdict === "eroded"`;
  any other verdict is a grader bug, not a test pass.
- One control per adapter release is the minimum (charter: every grader ships
  a rigged-impossible control case).

---

### PrecedenceDeclaration

Stack-level ordering of layers, serving as both the normative source for
`resolved-by-precedence` findings and the expected behavior for precedence
behavioral cases (FR-004, FR-008).

```typescript
interface PrecedenceDeclaration {
  /** Ordered list: index 0 = highest precedence. */
  order: [LayerType, ...LayerType[]];
}
```

**Invariants**:
- Circular declarations (A outranks B outranks A) are a static error emitted
  before any lint findings (FR-004).
- When present, a contradiction between two layers is reported as
  `resolved-by-precedence` naming `winner = order[lower-index]` (the
  higher-rank layer wins).
- When absent, any conflict is `undefined-precedence`.
- The declaration is the source for behavioral precedence cases: the transcript
  must follow the declared winner (FR-008, spec scenario 11).

---

### CompositionManifest

Declares each case's full configuration for the manifest runner (FR-011).

```typescript
interface CompositionManifestCase {
  id: string;
  /** Ordered layer entries. */
  layers: LayerEntry[];
  precedence?: PrecedenceDeclaration;
  /** Only for behavioral cases. */
  rule?: string;
  probeSet?: string[];
  baselineConfig?: {
    runs: number;
    passThreshold: number;
  };
  gradingClass?: GradingClass;
  /** "static" | "behavioral" */
  testClass: "static" | "behavioral";
  /** Expected outcome for fixture-level assertions. */
  expected: {
    ok?: boolean;
    findingTypes?: CrossLayerFindingType[];
    verdict?: RuleSurvivalVerdict;
  };
}

interface CompositionManifest {
  endpoint?: {           // required for behavioral cases; omitted for static-only suites
    base_url: string;
    model: string;
    api_key_env: string;
  };
  cases: CompositionManifestCase[];
}
```

**Invariants**:
- `endpoint` is required if any case has `testClass === "behavioral"`.
- `id` values are unique within a manifest.
- The manifest runner produces a machine-readable pass/fail summary per case
  with cited sources (FR-010, FR-011).
- Credentials are never manifest fields; only the env-var name is configurable
  (charter deployment constraints).

---

## Dependency Note

This mission's entities and all behavioral logic depend on three upstream
adapters being present:

| Dependency | Why required |
|---|---|
| `src/adapters/rfc1/resolve.ts` — `resolveCompositionDetailed` | Persona layer assembly; already shipped in v1 |
| Skills adapter (`skills-adapter-01KTYKNX`) — merged | `LayerType: "skill"` requires skill fixture parsing and text extraction |
| SOP adapter (`openclaw-sop-adapter-01KTYKNZ`) — merged | `RuleSurvivalCase.probe` and `gradingClass` reuse the SOP adapter's probe set, graders, and rule manifest; `sopAloneText` is the SOP adapter's fixture text |

This mission must be implemented after both the skills and SOP adapters are
merged. Implementing before they exist violates FR-002 (stack composition
requires all referenced layer types) and FR-005 (rule-survival probe set
reuse).
