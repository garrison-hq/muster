# Data Model: muster v2 — agent-file stack conformance

**Mission**: `v2-agent-stack-research-01KTYA4C`
**Date**: 2026-06-12
**Status**: research-phase model; entities and relationships discovered while
answering RQ-01…RQ-10. Implementation-grade refinement belongs to the v2
software-dev mission's plan phase.

## Core entities

### Layer
One stratum of the agent-file stack.

| Attribute | Notes |
|---|---|
| id | e.g. `persona`, `instructions-repo`, `instructions-sop`, `skills`, `tools`, `memory`, `schedule`, `manifest` |
| file_convention | e.g. `SOUL.md`, `AGENTS.md`, `SKILL.md` + directory |
| maturity | `spec` \| `standard` \| `convention` (verified per RQ-01…05) |
| primary_assertion_type | → AssertionType |

### NormativeSource
What a check cites. The v1 traceability rule generalizes: upstream clause
*or* muster-published rubric — never an unwritten opinion.

| Attribute | Notes |
|---|---|
| id | e.g. `rfc1`, `agentskills-spec`, `a2a-v1`, `openclaw-docs`, `muster-rubric-tools-drift` |
| kind | `spec` \| `convention-docs` \| `source-code` \| `muster-rubric` |
| version_or_pin | semver where versioned; **commit SHA pin where unversioned** (agentskills, OpenClaw — RQ-02/RQ-04 risk) |
| url | stable URL or repo path |
| clause_scheme | how clauses are cited (§ numbers, heading anchors, rubric rule ids) |

Constraints discovered in research: agentskills spec and OpenClaw docs are
unversioned → `version_or_pin` MUST be a commit SHA; OpenClaw load order is
citable only as `source-code` kind; convention layers require a paired
`muster-rubric` source.

### Adapter
Implements the existing v1 `SpecAdapter` contract (`src/core/adapter.ts`);
the core never learns layer specifics.

| Attribute | Notes |
|---|---|
| id | `rfc1` (shipped), `soulspec`, `agentsmd-repo`, `openclaw-sop`, `skills`, `openclaw-tools`, `openclaw-memory`, `openclaw-heartbeat`, `a2a-card` (residual scope) |
| layer | → Layer (one primary; an adapter never spans layers) |
| sources | → NormativeSource (≥1) |
| stages | parse / validate / resolve / thresholds / triggers — stages may be degenerate (SoulSpec resolve ≈ package assembly, RQ-03) |
| entry_point | single file (RFC-1) or manifest + `loadRef` siblings (SoulSpec package, RQ-03 friction point) |

### Check
A single conformance check. Atomic unit of the violation report.

| Attribute | Notes |
|---|---|
| id | stable, citable id (v1 pattern) |
| adapter / layer | owning adapter; cross-layer checks reference ≥2 layers |
| test_class | → TestClass |
| assertion_type | → AssertionType |
| cites | → NormativeSource + clause (REQUIRED, non-null) |
| severity | error / warning / info |
| discrimination_control | → ControlCase (REQUIRED for every grader-backed check, v1 cap-of-zero pattern) |

### TestClass
| Value | Properties |
|---|---|
| `static` | offline, deterministic, byte-stable (carried v1 constraint) |
| `behavioral` | scenario → transcript → assert; stochastic; k-of-n or pass^k |
| `drift` | NEW in v2: file vs. live environment (documented tools exist, schemas match, dates not stale) |
| `cross-layer` | spans ≥2 layers; has static (contradiction lint) and behavioral (rule survival) members |

### AssertionType
Vocabulary verified against prior art (RQ-06, RQ-08):

| Value | Decidability | Prior-art anchor |
|---|---|---|
| `schema` | binary | JSON Schema / skills-ref |
| `structure-lint` | binary | frontmatter rules, dir-name match |
| `contradiction-lint` | binary/heuristic | Arbiter, WIRE |
| `transcript-regex` | binary | promptfoo deterministic asserts |
| `tool-call` (presence/order/args) | binary | SOPBench oracle verifiers, trajectory asserts |
| `event-order` | binary | "confirm before destructive action" (tau-bench) |
| `trigger-rate` | binary over N runs | agentskills.io methodology (N=3, ≥0.5) |
| `drift-diff` | binary | file vs. env comparison |
| `llm-judge-rubric` | judge | v1 graders; MT-Bench bias caveats (order-swap, anchoring) |

### Scenario / Probe
| Attribute | Notes |
|---|---|
| id, layer(s) | probes may target a composition (cross-layer) |
| kind | compliance / adversarial / recall / leak / heartbeat-tick / trigger / near-miss-negative |
| source_corpus | → ProbeCorpus (nullable for muster-authored probes) |

### ProbeCorpus
Vendored adversarial/probe data (RQ-09).

| Attribute | Notes |
|---|---|
| id | `injecagent`, `agentdojo-subset`, `gandalf-ignore`, `deepset-pi`, `llmail-sample`, `jbb-behaviors` |
| license | MUST be MIT/Apache/CC-BY to vendor; verified date recorded |
| provenance | upstream URL + commit/revision; per-file provenance where aggregated (garak caveat) |
| coverage | direct-injection / indirect-injection / scope-escape / exfiltration / refusal |

### StackComposition (NEW in v2 — the headline)
A fixture set composing ≥2 layers into one context-under-test.

| Attribute | Notes |
|---|---|
| layers | ordered list of (Layer, fixture file) |
| declared_precedence | nullable — if the stack defines none, that absence is itself a static finding (RQ-04: OpenClaw documents no conflict rule) |
| baseline | for rule-survival: the SOP-alone pass rate to compare against |

### Run / Verdict
| Attribute | Notes |
|---|---|
| run | scenario × composition × model endpoint (BYOM, env-key only); errored run = failed run, never skipped/retried |
| verdict aggregation | `k_of_n_threshold` (v1, stylistic axes) or `pass_pow_k` (conjunctive, safety-critical — tau-bench precedent; charter decision pending, open question 10) |

### ControlCase
Rigged-impossible case proving a grader can fail (carried v1 constraint #6).
One per grader-backed Check.

## Key relationships

```
Layer 1—n Adapter 1—n Check n—1 NormativeSource(+clause)
Check n—1 AssertionType, n—1 TestClass
Check 1—1 ControlCase                  (when grader-backed)
Scenario n—1 ProbeCorpus               (when vendored)
StackComposition n—n Layer             (cross-layer checks only)
Run n—1 Scenario, n—1 StackComposition, n—1 ModelEndpoint
Verdict 1—n Run                        (k-of-n / pass^k aggregation)
ViolationReport 1—n CheckResult n—1 Check
```

## Invariants carried from v1 (enforced by test today, must survive v2)

1. Core (merge, pipeline, canonical JSON, runners, graders, client) imports
   nothing layer-specific; adapters live at the edge.
2. `static` and `cross-layer/static` checks run fully offline,
   byte-stable deterministic.
3. Every Check.cites is non-null and resolvable (upstream clause or published
   muster rubric).
4. Every judge-backed Check has a ControlCase that fails when rigged.
5. Errored behavioral runs count as failures in Verdict aggregation.
