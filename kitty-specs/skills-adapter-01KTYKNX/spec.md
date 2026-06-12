# Feature Specification: Agent Skills (SKILL.md) Conformance Adapter

**Mission**: `skills-adapter-01KTYKNX` (mission_id `01KTYKNX2ATCYA9H8SG1N3ZCMA`)
**Created**: 2026-06-12
**Status**: Draft
**Mission Type**: software-dev
**Milestone**: v1-extended (agent-file stack) — **layer 1 of 3**, ships first per research RQ-10
**Input**: Add an Agent Skills adapter behind muster's existing spec-agnostic core, providing static conformance (frontmatter schema, naming, directory layout) plus behavioral trigger conformance (does a skill fire on the right queries and stay quiet on near-misses), citing agentskills.io as the normative source.
**Seeds**: `BRIEF.md`; `kitty-specs/v2-agent-stack-research-01KTYA4C/research.md` (RQ-02, RQ-06); the project charter.

---

## Overview

The Agent Skills format (`SKILL.md`) is an open standard published at
agentskills.io with ~42 adopting clients (OpenAI Codex, Gemini CLI, Cursor,
Copilot, …). It has a real, citable specification but **no unified conformance
suite**: static linters exist (`skills-ref`, third-party linters) and the spec
site documents a trigger-testing methodology, but nothing combines static spec
conformance with behavioral trigger conformance in one harness. This is the v1
RFC-1 playbook repeated for a far larger audience, and it is why the research
ranked it the first layer to ship.

This mission adds a **Skills adapter** that plugs into muster's existing
`SpecAdapter` boundary and reuses the core wholesale (pipeline, canonical JSON,
report format, CTS runner, behavioral runner/graders/client). It delivers two
test classes against a `SKILL.md` skill:

1. **Static conformance** (offline, deterministic): validate the YAML
   frontmatter against the agentskills.io schema (required `name`,
   `description`; optional `license`, `compatibility`, `metadata`,
   `allowed-tools`), the `name`↔directory-name match, the naming charset
   rules, and the directory layout (referenced bundled files exist). Tests the
   **file**.
2. **Behavioral trigger conformance** (stochastic, k-of-n): present the
   skill's Level-1 disclosure (name + description) to a bring-your-own model
   endpoint as an invocable, run a labeled query set (should-trigger and
   near-miss should-not-trigger), and grade whether the skill fires correctly.
   Tests the **router decision** the skill's description is supposed to drive.

The normative source is **agentskills.io/specification**, pinned to a commit
SHA of `agentskills/agentskills` (the spec is unversioned — a drift risk the
charter requires us to manage by pinning). Anthropic-platform-specific extra
constraints (no XML tags in `name`/`description`; reserved words
`anthropic`/`claude` barred from `name`) ship as a documented optional profile
citing the Anthropic docs, not as part of the base spec.

The trigger-testing methodology muster implements cites the spec site's own
documented approach (labeled should/should-not-trigger queries, repeated runs,
a trigger-rate threshold) as its normative source, satisfying the charter's
"every check cites a normative source" rule.

## User Scenarios & Testing

### Primary User Stories

1. **Skill author (static)**: As an author of a `SKILL.md` skill, I run muster
   against my skill directory and get a pass/fail conformance report that names
   each violation by frontmatter path and message (e.g. `name` exceeds 64
   chars, `name` ≠ directory name, missing `description`), so I can fix the
   skill against the spec without reading it.
2. **Skill author (triggering)**: As a skill author, I point muster at my skill
   plus a model endpoint and a labeled query set, and learn whether the model
   actually invokes my skill on the queries it should and abstains on the
   near-misses it should not — before my skill ships and either never fires or
   fires constantly.
3. **Spec maintainer (fixtures)**: As an Agent Skills maintainer, I can take
   muster's skill fixture set (valid skills, intentionally-broken skills, and
   labeled trigger query sets) as the seed of an official conformance suite.

### Acceptance Scenarios

#### Static conformance

1. **Given** a minimal valid skill (a directory `foo/` containing `SKILL.md`
   with `name: foo` and a non-empty `description`), **When** muster checks it,
   **Then** the report says `ok: true` with zero errors.
2. **Given** a skill whose `name` is missing, empty, longer than 64 chars, or
   contains characters outside `[a-z0-9-]` (or has leading/trailing/consecutive
   hyphens), **When** checked, **Then** the report says `ok: false` with an
   error whose path is `name` and whose message cites the spec's naming rule.
3. **Given** a skill whose `name` does not equal its parent directory name,
   **When** checked, **Then** it is rejected with a `name`-vs-directory error.
4. **Given** a skill whose `description` is missing, empty, or exceeds 1024
   characters, **When** checked, **Then** it is rejected with a `description`
   error.
5. **Given** a skill with optional fields (`license`, `compatibility` ≤ 500
   chars, `metadata` as a string→string map, `allowed-tools`), **When**
   checked, **Then** valid optional fields pass; `allowed-tools` additionally
   emits an "experimental field" warning per the spec's own marking.
6. **Given** a skill whose body references a bundled file under `scripts/`,
   `references/`, or `assets/` that does not exist on disk, **When** checked,
   **Then** a static finding reports the missing referenced file (the
   file-vs-package drift check).
7. **Given** the Anthropic optional profile is enabled and a skill whose `name`
   contains the reserved word `claude` or whose `description` contains an XML
   tag, **When** checked, **Then** it is rejected citing the Anthropic-docs
   source; **When** the profile is disabled, **Then** the same skill passes the
   base spec.
8. **Given** a manifest of skill test cases (id, skill directory, profile,
   expectations), **When** the suite runs, **Then** every case's actual outcome
   is compared against its declared expectation and a pass/fail summary is
   produced — byte-stable across runs.

#### Behavioral trigger conformance

9. **Given** a valid skill and a labeled query set (≥8 should-trigger queries
   varied in phrasing and ≥8 near-miss should-not-trigger queries that share
   keywords), **When** muster presents the skill as an invocable to a
   conforming endpoint and runs each query N times, **Then** the should-trigger
   queries invoke the skill at or above the rubric's trigger-rate threshold and
   the near-miss queries stay below it, and the case passes.
10. **Given** a skill with a deliberately vague description and a should-trigger
    set, **When** graded against an endpoint that fails to invoke it, **Then**
    the case fails with a sub-threshold trigger rate — the harness reports the
    description as the cause, it does not rubber-stamp.
11. **Given** a near-miss query set sharing surface keywords with the skill,
    **When** the model over-fires (invokes on near-misses), **Then** the case
    fails on the should-not-trigger axis — proving the grader discriminates
    over-triggering, not just under-triggering.
12. **Given** the same skill and query set, **When** run against a second,
    differently-hosted OpenAI-compatible endpoint with only endpoint
    configuration changed, **Then** the harness runs identically with no code
    changes.
13. **Given** a rigged-impossible discrimination control (a skill whose
    description cannot match any realistic query, paired with a control
    assertion that a forced invocation is graded as failing), **When** the
    suite runs, **Then** the control fails as designed — proving the trigger
    grader can fail.

### Edge Cases

- Frontmatter absent, unterminated, or not the first content in `SKILL.md`.
- `name` valid charset but equal to a directory name that differs only by case.
- `metadata` present but a value is a non-string (number/bool/null) — rejected.
- `allowed-tools` present but empty, or malformed (not space-separated tokens).
- Bundled-file reference that points outside the skill directory (path
  traversal) — rejected as a static finding, never resolved.
- Multiple `SKILL.md` files at different directory depths — only the skill-root
  one is authoritative; nested matches reported.
- Behavioral: endpoint that does not support tool/function calling at all (case
  errors and is reported; an errored run counts as a failed run, remaining
  cases still run); endpoint returns a malformed tool-call; model invokes a
  *different* registered skill than the one under test (counts as a non-trigger
  for the target).
- Trigger query set with fewer than the rubric's minimum labeled queries
  (rejected as an invalid case, not silently graded).
- k-of-n with split verdicts and with errored runs (an errored run counts as a
  failed run for the majority).

## Requirements

### Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-001 | The Skills adapter implements muster's existing `SpecAdapter` contract and reuses the core pipeline, canonical-JSON, report, CTS runner, and behavioral runner without modifying the spec-agnostic core. | Proposed |
| FR-002 | The adapter parses a skill by reading its `SKILL.md`, extracting only the first YAML frontmatter block as configuration and treating the remainder as the skill body, and by reading the enclosing skill directory's layout. | Proposed |
| FR-003 | The adapter validates the `name` field: present, 1–64 characters, lowercase `[a-z0-9-]` only, no leading/trailing/consecutive hyphens, and equal to the skill's parent directory name. | Proposed |
| FR-004 | The adapter validates the `description` field: present, non-empty, at most 1024 characters. | Proposed |
| FR-005 | The adapter validates optional fields when present: `license` (string), `compatibility` (1–500 chars), `metadata` (map of string→string), and `allowed-tools` (space-separated tokens), and emits a documented "experimental" warning for `allowed-tools` per the spec's own marking. | Proposed |
| FR-006 | The adapter performs a static layout/drift check: bundled files referenced by the skill body under `scripts/`, `references/`, or `assets/` must exist on disk and resolve within the skill directory; missing or escaping references are reported as static findings. | Proposed |
| FR-007 | The adapter ships an optional Anthropic-platform profile that additionally bars XML tags in `name`/`description` and the reserved words `anthropic`/`claude` in `name`, citing the Anthropic docs as that profile's normative source; the base spec (agentskills.io) governs when the profile is off. | Proposed |
| FR-008 | The adapter reports violations in muster's existing machine-readable report format, and every static check cites either an agentskills.io clause (pinned commit SHA) or a muster-published rubric. | Proposed |
| FR-009 | The adapter provides behavioral trigger conformance: given a skill and a labeled query set, it presents the skill's name+description to a BYOM OpenAI-compatible endpoint as an invocable, runs each query N times, and records whether the skill was invoked per run. | Proposed |
| FR-010 | The trigger grader evaluates two axes per case — should-trigger queries must meet or exceed the rubric trigger-rate threshold, near-miss should-not-trigger queries must stay below it — and a case passes only if both axes pass; the methodology cites the agentskills.io trigger-testing documentation as its normative source. | Proposed |
| FR-011 | Behavioral aggregation follows the charter: trigger conformance for a query uses k-of-n over N runs, and an errored run counts as a failed run (never skipped, never retried). | Proposed |
| FR-012 | The trigger grader ships with a rigged-impossible discrimination control proving the grader can fail, per the charter's cap-of-zero pattern. | Proposed |
| FR-013 | The adapter runs from a test manifest (case id, skill directory, profile, expectations for static cases; query set and thresholds for behavioral cases) and produces a pass/fail summary across the suite. | Proposed |
| FR-014 | The mission ships a fixture set: valid skills, intentionally-broken skills (one per static rule), and labeled trigger query sets, shaped as a candidate upstream conformance suite. | Proposed |

### Non-Functional Requirements

| ID | Requirement | Threshold | Status |
|----|-------------|-----------|--------|
| NFR-001 | The static path runs fully offline with byte-stable deterministic output. | Zero network calls on the static path; identical bytes across repeated runs and across machines. | Proposed |
| NFR-002 | Single-skill static check latency. | < 5 seconds. | Proposed |
| NFR-003 | Full static fixture suite latency. | < 10 seconds. | Proposed |
| NFR-004 | Behavioral trigger suite latency against a local 7B model. | < 15 minutes. | Proposed |
| NFR-005 | Model access is bring-your-own via any OpenAI-compatible endpoint; credentials come from the environment only. | No provider SDKs; no credentials in the repo. | Proposed |
| NFR-006 | Type-check and test gates. | `tsc` strict passes; full Vitest suite green including the skills fixture suite; SonarCloud quality gate passes. | Proposed |

### Constraints

| ID | Constraint | Status |
|----|------------|--------|
| C-001 | The spec-agnostic core never learns skill specifics; all skill knowledge lives in the adapter behind the `SpecAdapter` boundary. | Proposed |
| C-002 | The agentskills.io specification is unversioned; muster pins it to a `agentskills/agentskills` commit SHA and records a drift-watch note. | Proposed |
| C-003 | Every check cites a normative source — an agentskills.io clause, the Anthropic docs (for the optional profile), or a muster-published rubric (for the trigger-rate threshold) — never an unwritten opinion. | Proposed |
| C-004 | The work is shaped to be upstreamable as the conformance suite for Agent Skills. | Proposed |
| C-005 | No model-provider SDKs and no new runtime dependencies beyond the v1 set; trigger query sets and fixtures are muster-authored (no third-party corpora needed for this layer). | Proposed |

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | A skill author can validate a `SKILL.md` skill and receive a precise, per-field pass/fail report without reading the specification. |
| SC-002 | Every static rule in the agentskills.io frontmatter/layout spec has at least one passing fixture and one intentionally-broken fixture that the harness catches. |
| SC-003 | A skill author can measure, before shipping, whether a model fires their skill on appropriate queries and abstains on near-misses, expressed as a trigger rate per axis. |
| SC-004 | The trigger grader demonstrably fails its rigged-impossible control, proving it discriminates rather than rubber-stamps. |
| SC-005 | The same behavioral suite runs unchanged against two differently-hosted OpenAI-compatible endpoints. |
| SC-006 | The static path produces byte-identical output across repeated runs and machines. |

## Key Entities

- **Skill**: a directory containing `SKILL.md` (frontmatter + body) and optional
  `scripts/`, `references/`, `assets/`.
- **Skill frontmatter**: `name`, `description` (required); `license`,
  `compatibility`, `metadata`, `allowed-tools` (optional).
- **Static check**: one conformance rule with a cited source (spec clause,
  Anthropic-profile source, or muster rubric), severity, and report path.
- **Trigger query set**: labeled queries (should-trigger / near-miss
  should-not-trigger) with a rubric threshold.
- **Trigger case / verdict**: a skill + query set run over N attempts against an
  endpoint, aggregated k-of-n per axis, with a discrimination control.
- **Profile**: base (agentskills.io) or anthropic (adds platform constraints).

## Dependencies & Assumptions

- **Depends on**: muster v1 core (`SpecAdapter`, pipeline, canonical JSON,
  report, behavioral runner/graders/client) — already shipped and test-enforced.
- **Assumption**: trigger observation maps cleanly onto OpenAI-compatible
  tool/function calling — the skill is registered as an invocable and a
  tool-call for it counts as a trigger. Endpoints without tool-calling support
  cause behavioral cases to error (and thus fail), not to be skipped.
- **Assumption**: muster authors its own trigger-rate threshold as a published
  rubric, citing the agentskills.io methodology as prior art; the spec offers
  guidance (repeated runs, near-miss negatives) but no normative pass/fail bar.
- **Out of scope**: generating or optimizing skill descriptions; executing skill
  scripts; the SOP, memory, heartbeat, tools-drift, SoulSpec, and A2A layers;
  cross-layer composition (a later mission).

## Scope Guard (carried from BRIEF.md)

Not an agent framework or runtime; not a prompt optimizer or generator; not a
registry; not a hosted service. CLI + CI exit codes only.
