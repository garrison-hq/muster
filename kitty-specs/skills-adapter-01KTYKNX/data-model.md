# Data Model: Agent Skills (SKILL.md) Conformance Adapter

**Mission**: `skills-adapter-01KTYKNX` | **Date**: 2026-06-13

Refined from spec.md §Key Entities and §Requirements. Every entity is
adapter-private — nothing here modifies or extends `src/core/`.

---

## Entities

### Skill

A directory on disk containing a `SKILL.md` file. The directory name is
normative: it must equal the `name` field in the frontmatter (FR-003).

```
<skill-root>/          ← parent directory; its basename = skill name
├── SKILL.md           ← authoritative; only the root-level SKILL.md governs
├── scripts/           ← optional; files referenced from SKILL.md body
├── references/        ← optional; files referenced from SKILL.md body
└── assets/            ← optional; files referenced from SKILL.md body
```

Only the `SKILL.md` at `<skill-root>/` is authoritative (spec §directory
layout). Nested `SKILL.md` files at deeper paths are reported as a static
finding (not an error; informational), never resolved as configuration.

**Invariants carried from v1:**
- The skill directory path is resolved to an absolute path before any check;
  no relative-path ambiguity reaches the validators.
- All static checks run without any network I/O (NFR-001).

---

### SkillDocument

The parsed in-memory representation of a valid `SKILL.md` — the output of
`frontmatter.ts` extraction, before validation.

```typescript
interface SkillDocument {
  /** Absolute path to SKILL.md. */
  path: string;
  /** Absolute path of the enclosing skill directory (dirname of path). */
  skillDir: string;
  /**
   * Parsed frontmatter object from the first YAML block.
   * `unknown` pre-validation; `SkillFrontmatter` post-schema-check.
   */
  frontmatter: unknown;
  /**
   * Everything after the closing `---` delimiter.
   * Used only for bundled-file reference extraction (FR-006).
   * Never interpreted as configuration.
   */
  body: string;
}
```

Edge cases in extraction (handled in `frontmatter.ts`):
- Frontmatter absent: `SkillStaticCheck` error at path `(document)`.
- Frontmatter not the first content (e.g. blank line before `---`): error.
- Unterminated frontmatter block (opening `---` with no closing `---`): error.
- Leading UTF-8 BOM stripped before delimiter detection.

---

### SkillFrontmatter

The typed, validated frontmatter after schema + semantic checks pass.

```typescript
interface SkillFrontmatter {
  /** Required. 1–64 chars, [a-z0-9-], no leading/trailing/consecutive hyphens,
   *  equals the parent directory basename (FR-003). */
  name: string;
  /** Required. Non-empty, at most 1024 chars (FR-004). */
  description: string;
  /** Optional. Arbitrary string (FR-005). */
  license?: string;
  /** Optional. 1–500 chars (FR-005). */
  compatibility?: string;
  /** Optional. String→string map; non-string values are rejected (FR-005). */
  metadata?: Record<string, string>;
  /**
   * Optional. Space-separated tool tokens (FR-005).
   * Presence emits an "experimental" warning regardless of content —
   * this warning is normative per the agentskills.io spec's own marking.
   */
  "allowed-tools"?: string;
}
```

**Name invariants** (all required for FR-003):
1. Present and non-empty.
2. Length 1–64 characters (inclusive).
3. Charset `[a-z0-9-]` only (lowercase ASCII letters, digits, hyphens).
4. No leading hyphen (`-foo` is invalid).
5. No trailing hyphen (`foo-` is invalid).
6. No consecutive hyphens (`foo--bar` is invalid).
7. Equals `basename(skillDir)` exactly — case-sensitive (a name valid by
   charset that differs only by case from the directory name is still rejected).

**Description invariants** (FR-004):
1. Present and non-empty (after trimming).
2. Length ≤ 1024 characters.

---

### SkillProfile

Which set of checks applies to a given run.

```typescript
type SkillProfile = "base" | "anthropic";
```

- `"base"` (default): only agentskills.io spec rules apply.
- `"anthropic"`: base rules **plus** Anthropic-platform constraints:
  - `name` must not contain the substrings `anthropic` or `claude`
    (case-insensitive; source: Anthropic docs, cited URL).
  - `description` must not contain XML tags (pattern `<[^>]+>`; source:
    Anthropic docs, cited URL).

When the profile is `"base"`, Anthropic-profile checks are never evaluated —
a skill containing `claude` in its name passes the base spec (FR-007, scenario 7).

---

### StaticCheck

One conformance rule evaluation. The adapter produces a `Violation[]` (core
type, `src/core/report.ts`) for static findings; `StaticCheck` is the
conceptual label for the rule definition that drives each check.

Each rule carries:

| Field | Type | Meaning |
|---|---|---|
| `path` | `string` | Frontmatter path of the violation, e.g. `name`, `description`, `metadata.count`, or `(document)` for whole-file failures |
| `message` | `string` | Human-readable explanation naming the violated rule |
| `severity` | `"error" \| "warning"` | `error` means `ok: false`; `warning` survives next to `ok: true` |
| `section` | `string \| undefined` | agentskills.io clause identifier pinned to the commit SHA, e.g. `§frontmatter.name` @`<sha>`, or Anthropic docs URL for profile checks |

**Invariants carried from v1:**
- Every check cites a normative source in `section` — never an unwritten
  opinion (C-003, charter).
- The static path emits byte-stable, deterministic output across repeated runs
  and machines (NFR-001). Violation ordering is UTF-16 code-unit based
  (same canonical-JSON ordering used in core).
- `(document)` is the canonical path for whole-file failures (no frontmatter
  path exists) — mirrors the RFC-1 adapter's convention.

---

### TriggerQuerySet

A labeled set of queries used to test whether a model routes correctly to a
skill. Loaded from a YAML file in `fixtures/skills/trigger-queries/`.

```typescript
interface TriggerQuerySet {
  /** Identifier matching the manifest entry. */
  id: string;
  /**
   * Normative source citation: agentskills.io trigger-testing methodology
   * (agentskills.io/specification#trigger-testing, pinned commit SHA).
   */
  source: string;
  /**
   * Queries the model SHOULD invoke the target skill on.
   * Rubric: at least 8, varied in phrasing (RQ-02 [as-opt-desc]).
   */
  shouldTrigger: string[];
  /**
   * Queries the model SHOULD NOT invoke the target skill on.
   * Near-misses: share surface keywords with the skill but are clearly
   * out-of-scope. At least 8 required (rubric minimum).
   */
  nearMiss: string[];
  /**
   * Trigger-rate threshold published as a muster rubric, citing
   * agentskills.io methodology as prior art (C-003, RQ-02 [as-opt-desc]).
   * shouldTrigger axis: trigger rate MUST be ≥ threshold to pass.
   * nearMiss axis: trigger rate MUST be < threshold to pass.
   * Default: 0.5 (per spec site's documented guidance).
   */
  threshold: number;
}
```

**Invariant**: a query set with fewer `shouldTrigger` or `nearMiss` entries
than the rubric minimum (8) is rejected as an invalid case before grading
begins. This is a hard gate, not a warning.

---

### TriggerCase

One behavioral test: a skill paired with a query set and run N times per query
against an endpoint.

```typescript
interface TriggerCase {
  id: string;
  /** Absolute path to the skill directory. */
  skillDir: string;
  profile: SkillProfile;
  querySet: TriggerQuerySet;
  /**
   * n in k-of-n: how many times each query is run against the endpoint.
   * Charter minimum is 3 (per agentskills.io methodology); manifest default.
   */
  runsPerQuery: number;
  /**
   * Tool payload sent to the endpoint for every query:
   * [{type: "function", function: {name: skill.name, description: skill.description}}]
   * plus a second "decoy" tool to test discrimination (FR-012).
   */
  tools: ToolDefinition[];
  endpoint: EndpointConfig;   // reused from src/core/behavioral/types.ts
}
```

A `TriggerCase` may also be a **discrimination control** (FR-012): a case
whose skill description cannot plausibly match any realistic query, paired
with an assertion that the grader produces `passed: false`. The test suite
asserts this control fails as designed, proving the grader discriminates rather
than rubber-stamps.

---

### TriggerVerdict

The aggregated outcome for one `TriggerCase`.

```typescript
interface TriggerVerdict {
  id: string;
  passed: boolean;        // true only if BOTH axes pass
  shouldTriggerAxis: AxisVerdict;
  nearMissAxis: AxisVerdict;
  isControl: boolean;     // true for discrimination control cases
}

interface AxisVerdict {
  axis: "should-trigger" | "near-miss";
  /** Measured trigger rate across all queries × runs on this axis. */
  triggerRate: number;
  threshold: number;
  passed: boolean;        // should-trigger: rate >= threshold; near-miss: rate < threshold
  /** Per-query breakdown: how many of the N runs triggered. */
  queryBreakdown: QueryRunResult[];
}

interface QueryRunResult {
  query: string;
  runsTotal: number;
  runsTriggered: number;
  runsErrored: number;    // errored runs counted as non-trigger (FR-011)
}
```

**Errored run invariant** (charter, FR-011): an errored run (endpoint
unreachable, malformed tool-call response, timeout, empty response) counts as a
failed run (non-trigger). It is never skipped and never retried. The remaining
queries in the case still run. `QueryRunResult.runsErrored` tracks the count
for diagnostics.

**Wrong-skill invocation** (spec edge case): if the model invokes a *different*
registered skill than the one under test, that run counts as a non-trigger for
the target skill.

---

## Invariants Summary

| Invariant | Source | Enforced in |
|---|---|---|
| Core `src/core/` is never modified or extended with skill-specific knowledge | C-001 | tsc + grep conformance test |
| Static path: zero network calls, byte-stable output | NFR-001 | Unit tests + byte-stability assertion in fixture suite |
| Every static check cites a normative source (agentskills.io clause @SHA or Anthropic docs URL) | C-003, charter | Code review + source field always set |
| agentskills.io spec pinned to commit SHA with drift-watch note | C-002 | `src/adapters/skills/validate.ts` header comment + drift-watch entry |
| Trigger grader ships a rigged-impossible discrimination control | FR-012, charter | `tests/unit/skills-trigger.test.ts` asserts `passed: false` for the control |
| Errored run = failed run, never skipped, never retried | FR-011, charter | `TriggerVerdict` aggregation + unit test |
| Query set minimum (8 per axis) enforced before grading | spec rubric (RQ-02) | Validation at manifest load time |
| `SpecAdapter` contract satisfied (tsc-enforced) | FR-001 | `const _contractCheck: SpecAdapter = skillsAdapter` in `index.ts` |
