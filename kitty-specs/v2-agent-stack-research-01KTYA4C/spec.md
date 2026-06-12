# Research Specification: The agent-file stack — landscape verification for muster v2

**Mission**: `v2-agent-stack-research-01KTYA4C`
**Created**: 2026-06-12
**Status**: Draft
**Research Type**: Literature Review / Landscape Survey
**Seed Document**: `BRIEF.md` (project root)

## Research Question & Scope

**Primary Research Question**: Is the seven-layer agent-file stack described in
`BRIEF.md` real, citable, and testable — and precisely which conformance gap
does muster v2 fill that existing eval harnesses do not?

**Sub-Questions** (from BRIEF.md "Open questions for the deep-research pass" —
numbering is preserved and used as evidence keys RQ-01…RQ-10):

1. **RQ-01 agents.md standard** — Is there any conformance regime, schema, or
   test suite attached to the cross-vendor agents.md standard, or is it
   prose-only? How does its role differ from OpenClaw's AGENTS.md
   (SOP/routing/security policy), and should muster treat those as two
   adapters or one adapter with profiles?
2. **RQ-02 Agent Skills (SKILL.md)** — What exactly is normative (frontmatter
   schema? loading semantics? directory layout?), is it versioned, and is
   there prior art for trigger-set testing (paraphrase generation against
   `description` fields)?
3. **RQ-03 SoulSpec vs RFC-1** — Current version status of each, divergence
   between them, and whether a SoulSpec *package* adapter (soul.json +
   multi-file) can reuse the v1 RFC-1 adapter or needs its own.
4. **RQ-04 OpenClaw workspace semantics** — Is there machine-readable or
   otherwise citable documentation of load order, precedence, and the
   MEMORY-private-sessions rule, or only blog-level convention? Strongest
   available sources per file (AGENTS/TOOLS/MEMORY/USER/HEARTBEAT).
5. **RQ-05 A2A Agent Cards** — Schema location and version, what a meaningful
   *contract test* (card vs. live agent) checks, and whether prior art exists.
6. **RQ-06 Prior art sweep** — promptfoo, DeepEval, OpenAI Evals, Inspect, and
   the eval-harness field generally: what do they already cover per layer,
   what assertion types do they support, and precisely where is the uncovered
   gap (expected: file-spec conformance + cross-layer composition)?
7. **RQ-07 Cross-layer conflict detection** — Any existing research or tooling
   on instruction-precedence conflicts in composed LLM contexts? Anything
   citable on persona-induced rule erosion?
8. **RQ-08 Compliance grading objectivity** — For SOP rules, where is the line
   between binary transcript checks (tool-call inspection, refusal detection)
   and judge-graded checks? Which SOP rule classes are objectively gradable?
9. **RQ-09 Adversarial probe sourcing** — Established public corpora for
   prompt-injection / scope-escape probes that can be vendored or referenced
   with clean licensing?
10. **RQ-10 Sequencing** — Which layer ships first for maximum standalone
    value? Working hypothesis to test: SOP/AGENTS.md first, then skills, then
    the cross-layer class once two layers exist.

**Scope**:
- **In Scope**: The seven layers tabled in BRIEF.md (persona, instructions/SOP,
  skills, tools, memory, schedule, manifests); their governing texts and
  maturity; the eval-harness prior-art field; cross-layer conflict literature;
  adversarial probe corpora and licensing.
- **Out of Scope**: Implementation design for v2 (belongs to the follow-on
  software-dev mission); anything excluded by the BRIEF.md scope guard (agent
  frameworks/runtimes, prompt optimizers, registries, hosted services);
  layers without a citable source — per the scope guard such layers *wait*,
  and finding that out is a valid research result.
- **Boundaries**: Current published versions of each spec/convention as of
  2026-06; sources must be attributable (spec text, official docs, repos,
  papers) — no unsourced claims survive into the spec phase.

**Expected Outcomes**:
- Sourced answers to RQ-01…RQ-10 in `research.md`, each with a decision,
  rationale, and evidence-log references.
- A verified (corrected where necessary) version of the BRIEF.md layer
  landscape table, fit to seed the v2 charter/specify run.
- A data model of the domain entities (layer, adapter, check, assertion type,
  normative source, probe corpus) in `data-model.md`.
- A go/no-go-per-layer recommendation and a sequencing recommendation
  (confirming or refuting the RQ-10 hypothesis).

## Research Methodology Outline

### Research Approach
- **Method**: Systematic literature/landscape review with adversarial source
  verification (claims in BRIEF.md are treated as hypotheses, not facts).
- **Data Sources**: Primary spec texts (RFC-1, agents.md standard, Anthropic
  Agent Skills docs, A2A protocol/Linux Foundation), official vendor docs
  (OpenClaw), tool repositories and docs (promptfoo, DeepEval, OpenAI Evals,
  Inspect), academic/preprint literature for RQ-07/RQ-08, public adversarial
  corpora and their licenses for RQ-09.
- **Analysis Approach**: Per-question synthesis; every claim keyed to an
  evidence-log row; per-layer verdict against the BRIEF.md rule "every check
  cites a normative source, upstream or ours."

### Success Criteria
- All ten research questions have a sourced answer or an explicit
  "no citable source exists" finding (which is itself decision-grade per the
  scope guard).
- Every layer in the landscape table has its governing text confirmed,
  corrected, or downgraded, with at least one primary source each.
- Prior-art gap statement is specific enough to defend the v2 positioning
  claim ("no existing tool tests the assembled stack") or to correct it.
- All sources logged in `research/source-register.csv`; all findings keyed in
  `research/evidence-log.csv` with confidence levels.

## Research Requirements

### Data Collection Requirements
- **DR-001**: Research MUST consult the primary/normative text for every layer
  claimed to have one (RFC-1, agents.md, Agent Skills, A2A, SoulSpec).
- **DR-002**: All sources MUST be documented in `research/source-register.csv`
  with citation, URL, relevance, and status.
- **DR-003**: For convention-only layers (TOOLS, MEMORY, HEARTBEAT), the
  strongest attributable source MUST be recorded even if informal (docs page,
  repo README, dated blog post by the convention's author).

### Analysis Requirements
- **AR-001**: Findings MUST be synthesized into `research.md` keyed by
  RQ-01…RQ-10, each closing with a decision usable by the v2 spec phase.
- **AR-002**: Methodology MUST be documented and reproducible (search terms,
  source-selection rationale).
- **AR-003**: Limitations and remaining unknowns MUST be listed at the bottom
  of `research.md` as input to `/spec-kitty.tasks` and the v2 charter.

### Quality Requirements
- **QR-001**: All claims MUST be supported by cited evidence; BRIEF.md itself
  is a hypothesis source, never evidence.
- **QR-002**: Confidence levels MUST be assigned to findings in
  `research/evidence-log.csv`.
- **QR-003**: Alternative interpretations MUST be considered — in particular,
  evidence that an existing harness *does* cover file-spec conformance or
  cross-layer composition must be actively sought, not just absence-confirmed.

## Key Concepts & Terminology

- **Agent-file stack**: The composed set of convention files (SOUL.md,
  AGENTS.md, SKILL.md, TOOLS.md, MEMORY.md, HEARTBEAT.md, soul.json / Agent
  Cards) that together define an agent's behavior.
- **Layer**: One stratum of the stack with its own file convention/spec and
  its own primary assertion type.
- **Three test classes**: *Static lint* (offline, deterministic), *behavioral
  probes* (scenario → transcript → assert, k-of-n), *drift checks* (file vs.
  live environment). v1 ships the first two; drift is new in v2.
- **Rule survival**: Cross-layer test asserting an SOP rule's compliance pass
  rate does not degrade when a persona layer is loaded alongside it.
- **Normative source rule**: Every check cites either an upstream spec clause
  or muster's own published rubric — never an unwritten opinion.
- **CTS**: Conformance Test Suite — the role muster plays per spec.

## Evidence Tracking Guidance

- Log every reviewed source in `research/source-register.csv` with citation,
  URL, relevance, and status.
- Capture each key finding in `research/evidence-log.csv`, including
  confidence level and notes; key findings to RQ-01…RQ-10.
- Reference evidence row IDs within `research.md` when making claims.
