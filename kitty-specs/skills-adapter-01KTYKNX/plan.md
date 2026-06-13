# Implementation Plan: Agent Skills (SKILL.md) Conformance Adapter

**Branch**: `main` | **Date**: 2026-06-13 | **Spec**: `kitty-specs/skills-adapter-01KTYKNX/spec.md`
**Input**: Feature specification from `kitty-specs/skills-adapter-01KTYKNX/spec.md`

## Summary

Add a **Skills adapter** that plugs into muster's existing `SpecAdapter` boundary and
delivers two test classes against a `SKILL.md` skill:

1. **Static conformance** (offline, deterministic): validate YAML frontmatter fields
   (`name`, `description` required; `license`, `compatibility`, `metadata`,
   `allowed-tools` optional), name↔directory-name identity, naming charset rules, and
   directory-layout drift (bundled files under `scripts/`, `references/`, `assets/` must
   exist on disk and not escape the skill directory). An optional Anthropic platform
   profile adds reserved-word and XML-tag checks citing the Anthropic docs. Normative
   source: agentskills.io/specification pinned to a `agentskills/agentskills` commit SHA
   (C-002; unversioned — drift-watch required).

2. **Behavioral trigger conformance** (stochastic, k-of-n): present the skill's
   name+description to a BYOM OpenAI-compatible endpoint as an invocable tool, run a
   labeled query set (should-trigger / near-miss should-not-trigger), and grade two axes —
   trigger rate at or above rubric threshold on positive queries, below it on near-misses.
   Methodology cites agentskills.io's own published trigger-testing approach (C-003). The
   adapter reuses the core wholesale (pipeline, canonical-JSON, report format, CTS runner,
   behavioral runner/graders/client) without modifying any `src/core/` file (FR-001, C-001).

This is **layer 1 of 3** in the v1-extended agent-file stack, ships first per research
RQ-10, and is shaped to be upstreamable as the official Agent Skills conformance suite
(C-004).

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 22 LTS (unchanged)
**Package manager**: pnpm, single package (unchanged layout)
**Primary Dependencies**: no new runtime deps (C-005). The skills adapter joins the
  existing dep set: `yaml` for frontmatter AST parsing, `ajv` for schema validation,
  `commander` for CLI. No model-provider SDKs — trigger observation maps onto
  OpenAI-compatible tool/function calling: the skill is registered as a `tools[]` entry
  (`type: "function"`, `function.name` = skill name, `function.description` = skill
  description) and a `tool_calls` choice for that function name counts as a trigger;
  any other choice or absence counts as a non-trigger. Endpoints that do not support
  tool calling cause behavioral cases to error (and thus fail — FR-011).
**New dev deps**: none (coverage infrastructure already landed in the sonarcloud mission).
**Storage**: N/A
**Testing**: Vitest 3 (existing `vitest.config.ts`); fixture-driven acceptance surface
  identical in shape to the CTS fixture suite. Skills fixture suite is the primary
  acceptance surface; unit tests cover each sub-module (FR-001, NFR-006).
**Target Platform**: Linux (Fedora) + GitHub Actions ubuntu-latest (unchanged)
**Project Type**: single package; no structural change to the root layout
**Performance Goals**: static path < 5 s per skill, < 10 s full fixture suite (NFR-002,
  NFR-003); behavioral suite < 15 min against a local 7B model (NFR-004)
**Constraints**: spec-agnostic core untouched (C-001); static path fully offline +
  byte-stable deterministic (NFR-001); no credentials in repo — model key via env
  `MUSTER_API_KEY` or `OPENAI_API_KEY` at runtime (NFR-005, charter); agentskills.io
  spec pinned to commit SHA with documented drift-watch (C-002)

## Charter Check

*Gate source: `.kittify/charter/charter.md`*

| Charter gate | Status | Note |
|---|---|---|
| `tsc` strict passes before merge | PASS | All new files are TypeScript strict; `SkillAdapter` is typed against the `SpecAdapter` contract (tsc-enforced) |
| Full Vitest suite green incl. skills fixture suite | PASS | WP04 delivers the fixture suite; every WP's acceptance criteria require the full suite to stay green before review |
| SonarCloud quality gate passes (≥ 80% new-code coverage) | PASS | All new adapter code under `src/adapters/skills/` and new test code under `tests/` are covered by unit + fixture tests; coverage uploaded as lcov per existing CI job |
| Every check cites a normative source | PASS — flag: agentskills.io pinning required | Each static check carries an agentskills.io clause cited to a `agentskills/agentskills` commit SHA (C-002). The spec is unversioned — **drift-watch note**: the SHA must be re-verified at the start of each implementing WP; any spec delta is a blocker recorded in the mission work log. The trigger-rate threshold is a muster-published rubric citing the agentskills.io methodology as prior art (RQ-02, C-003). |
| pass^k for safety-critical axes | PASS | No safety-critical axis (injection resistance, never-call-tool, privacy) in this layer — behavioral trigger axes are stylistic (k-of-n applies) |
| k-of-n for trigger axes; errored run = failed run | PASS | FR-011 mirrors the core behavioral runner's existing k-of-n contract; errored runs count as failed (charter; never skipped, never retried) |
| Discrimination control: every judge-backed grader ships with rigged-impossible control | PASS | FR-012 requires a rigged-impossible discrimination control for the trigger grader; WP03 delivers it (SC-004) |
| No implementation code before spec/plan/tasks locked | PASS | This plan precedes any code |
| No new runtime dependencies | PASS | No new runtime deps added (C-005); trigger fixtures and query sets are muster-authored |
| Static path offline + byte-stable deterministic | PASS | Static check produces canonical output (UTF-16 code-unit ordering, locale-independent) from existing `canonical-json` module; no network calls |
| No hardcoded providers / no credentials in repo | PASS | Endpoint config via env vars only (NFR-005) |

No violations. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```
kitty-specs/skills-adapter-01KTYKNX/
├── spec.md              # done
├── plan.md              # this file
├── data-model.md        # Phase 1 — implementation entities and invariants
├── quickstart.md        # Phase 1 — local verification steps
└── tasks.md             # Phase 2 (/spec-kitty.tasks — NOT created here)
```

### Source Code (repository root — new files only; no existing file modified)

```
src/adapters/skills/
├── index.ts             # SkillsAdapter assembly (mirrors rfc1/index.ts pattern)
├── frontmatter.ts       # SKILL.md first-block YAML extraction (pure text split)
├── schema.ts            # Ajv-backed frontmatter schema (name/description/optional fields)
├── validate.ts          # Static checks: name charset, length, dir-name match,
│                        #   description length, optional-field rules, allowed-tools
│                        #   experimental warning; Anthropic profile gate
├── layout.ts            # Directory-layout drift check: resolve bundled file
│                        #   references (scripts/references/assets), path-traversal guard
├── trigger.ts           # Trigger-conformance entry: build tool-call payload,
│                        #   drive behavioral client, two-axis grader, k-of-n,
│                        #   discrimination control
└── types.ts             # Skills-specific types: SkillDocument, SkillFrontmatter,
                         #   SkillStaticCheck, TriggerQuerySet, TriggerCase,
                         #   TriggerVerdict, SkillProfile

tests/
├── cts/
│   └── suite.test.ts    # (existing; extended to pick up skills fixture manifest)
├── behavioral/
│   ├── graders.test.ts  # (existing; skills trigger grader unit tests added here
│   │                    #   or in a sibling skills-grader.test.ts)
│   └── runner.test.ts   # (existing; unchanged)
└── unit/
    ├── skills-frontmatter.test.ts   # frontmatter extraction edge cases
    ├── skills-validate.test.ts      # per-rule static validation unit tests
    ├── skills-layout.test.ts        # bundled-file drift + path-traversal unit tests
    └── skills-trigger.test.ts       # trigger grader unit tests incl. discrimination control

fixtures/
└── skills/
    ├── valid/
    │   ├── minimal/                 # name + description only — minimal valid skill
    │   │   └── SKILL.md
    │   ├── full-optional/           # all optional fields present and valid
    │   │   ├── SKILL.md
    │   │   ├── scripts/helper.sh
    │   │   └── assets/icon.png
    │   └── anthropic-profile-clean/ # passes both base and Anthropic profile
    │       └── SKILL.md
    ├── broken/
    │   ├── name-missing/            # FR-003: name absent
    │   │   └── SKILL.md
    │   ├── name-too-long/           # FR-003: name > 64 chars
    │   │   └── SKILL.md
    │   ├── name-bad-charset/        # FR-003: uppercase in name
    │   │   └── SKILL.md
    │   ├── name-leading-hyphen/     # FR-003: leading hyphen
    │   │   └── SKILL.md
    │   ├── name-dir-mismatch/       # FR-003: name ≠ parent directory
    │   │   └── SKILL.md
    │   ├── description-missing/     # FR-004: description absent
    │   │   └── SKILL.md
    │   ├── description-too-long/    # FR-004: description > 1024 chars
    │   │   └── SKILL.md
    │   ├── metadata-bad-value/      # FR-005: metadata value is a number
    │   │   └── SKILL.md
    │   ├── bundled-file-missing/    # FR-006: scripts/missing.sh referenced but absent
    │   │   └── SKILL.md
    │   ├── bundled-file-escape/     # FR-006: ../outside.sh path-traversal attempt
    │   │   └── SKILL.md
    │   ├── anthropic-reserved-word/ # FR-007: name contains "claude"
    │   │   └── SKILL.md
    │   └── anthropic-xml-tag/       # FR-007: description contains <tag>
    │       └── SKILL.md
    ├── trigger-queries/
    │   ├── weather-skill-queries.yaml   # labeled should-trigger + near-miss set
    │   └── rigged-impossible-queries.yaml  # discrimination control (FR-012)
    └── skills-manifest.yaml         # CTS-style manifest: id, skill dir, profile,
                                     #   expectations (static) or query-set + thresholds
                                     #   (behavioral)
```

**Structure Decision**: single-package layout, no new top-level directories. The
`src/adapters/skills/` subtree mirrors `src/adapters/rfc1/` in shape (index assembles,
sub-modules are pure). The `fixtures/skills/` tree is parallel to existing fixtures.
No existing file under `src/core/` is touched.

## Work-Package Outline (preview for /spec-kitty.tasks — not tasks.md)

Layer 1 of the v1-extended stack; all WPs land on `main` through individual PRs, each
reviewed before the next begins.

---

**WP01 — Adapter scaffold + frontmatter/naming static validation**
FRs covered: FR-001, FR-002, FR-003, FR-004, FR-008, C-001, C-002, C-003

Deliverables:
- `src/adapters/skills/types.ts` — `SkillDocument`, `SkillFrontmatter`, `SkillStaticCheck`, `SkillProfile`
- `src/adapters/skills/frontmatter.ts` — SKILL.md first-block YAML extraction with edge-case handling (absent frontmatter, unterminated block, frontmatter not first content, BOM strip)
- `src/adapters/skills/schema.ts` — Ajv JSON Schema for frontmatter fields (name/description required; optional fields typed); `validate` entry point
- `src/adapters/skills/validate.ts` — `name` rules (present, 1–64 chars, `[a-z0-9-]`, no leading/trailing/consecutive hyphens, equals parent directory name); `description` rules (present, 1–1024 chars); reports via muster's `Violation[]` format, each check citing the agentskills.io clause at the pinned SHA
- `src/adapters/skills/index.ts` — `SkillsAdapter` implementing `SpecAdapter` (parse + validate wired; resolve stub returning empty config; thresholds stub; evaluateTriggers stub)
- Unit tests: `tests/unit/skills-frontmatter.test.ts`, `tests/unit/skills-validate.test.ts`

Acceptance: `tsc` strict passes; all new unit tests green; all existing tests remain green.

---

**WP02 — Directory layout + bundled-file drift checks + Anthropic optional profile**
FRs covered: FR-005, FR-006, FR-007, FR-008

Deliverables:
- `src/adapters/skills/layout.ts` — scan skill body for bundled file references under `scripts/`, `references/`, `assets/`; resolve each against skill directory root; reject path-traversal attempts lexically; report missing files as static findings citing FR-006 / agentskills.io layout clause; handle multiple `SKILL.md` depths (only skill-root is authoritative, nested matches reported)
- `src/adapters/skills/validate.ts` extended — optional field rules: `license` (string), `compatibility` (1–500 chars), `metadata` (string→string map, rejects non-string values), `allowed-tools` (space-separated tokens, not empty); `allowed-tools` emits "experimental" warning per spec's own marking
- Anthropic profile gate in `validate.ts`: when `profile === "anthropic"`, additionally check name for reserved words `anthropic`/`claude` and description for XML tags, each citing the Anthropic docs URL
- Unit tests: `tests/unit/skills-layout.test.ts`, extended `tests/unit/skills-validate.test.ts`

Acceptance: `tsc` strict passes; all new tests green; all existing tests remain green; static path stays offline + byte-stable (verified by a determinism check in the test suite).

---

**WP03 — Behavioral trigger conformance (two-axis grader, k-of-n, discrimination control)**
FRs covered: FR-009, FR-010, FR-011, FR-012

Deliverables:
- `src/adapters/skills/trigger.ts` — trigger conformance runner:
  - Builds `tools[]` payload with one entry: `{type: "function", function: {name, description}}` from skill's frontmatter
  - Drives `ChatClient` (reused from `src/core/behavioral/client.ts`) with tool-call support added (new `chatWithTools` method or extended call signature)
  - Per-run records whether the target skill's name appeared in `tool_calls`; endpoints lacking tool-call support cause the run to error (FR-011)
  - Two-axis grader: should-trigger axis (trigger rate ≥ threshold), near-miss axis (trigger rate < threshold); both axes must pass for the case to pass (FR-010)
  - k-of-n aggregation: errored run = failed run, never skipped (FR-011); `TriggerVerdict` carries per-run outcomes and overall pass/fail
  - Rigged-impossible discrimination control (FR-012): a control case whose skill description cannot match any realistic query; control must fail — the test asserts the grader produces `passed: false` for it
- `tests/unit/skills-trigger.test.ts` — unit tests for the two-axis grader logic, the errored-run-counts-as-failed rule, discrimination control, and model-invokes-wrong-skill edge case

Note on `ChatClient` extension: the behavioral client in `src/core/behavioral/client.ts` currently calls `POST /chat/completions` without a `tools` parameter. The trigger runner extends the call with a `tools` field (OpenAI-compatible). To preserve the C-001 boundary (core untouched), `trigger.ts` either:
(a) composes directly with a new local fetch wrapper sharing the same error-hygiene pattern, or
(b) extends `ChatClient` with a `chatWithTools` variant at the `src/core/behavioral/` level — acceptable if the extension adds no skill-specific knowledge to core.
The implementing agent will document the chosen approach in the WP03 work log before coding begins.

Acceptance: `tsc` strict passes; all new tests green; discrimination control test asserts `passed: false`; all existing tests remain green.

---

**WP04 — Fixture set + CTS-style manifest runner**
FRs covered: FR-013, FR-014, SC-001 through SC-006

Deliverables:
- All fixture skill directories under `fixtures/skills/valid/`, `fixtures/skills/broken/` (one per static rule), and trigger query sets under `fixtures/skills/trigger-queries/` (see Project Structure tree)
- `fixtures/skills/skills-manifest.yaml` — CTS-style manifest: one static entry per fixture (id, skill directory, profile, expected ok + violations); one behavioral entry per trigger-query set (id, skill directory, query set path, thresholds)
- `tests/cts/suite.test.ts` extended (or a new `tests/cts/skills-suite.test.ts`) to load `skills-manifest.yaml` and run the full fixture suite; byte-stability verified by running twice and comparing output
- Verify SC-002: every static rule in the spec has at least one passing fixture and at least one broken fixture that the harness catches
- Verify SC-004: discrimination control case in the manifest produces `passed: false`
- Verify SC-005 (documented): behavioral suite unchanged when only `MUSTER_API_KEY` / base-url env vars differ
- Verify SC-006: byte-stable output assertion in the test suite

Acceptance: full Vitest suite green including the skills fixture suite; byte-stability assertion passes; SonarCloud gate passes (≥ 80% new-code coverage); `tsc` strict passes.

---

**Build order**: WP01 → WP02 → WP03 → WP04. Each WP depends on the previous. WP03 may
begin its non-client-extension work in parallel with WP02 if needed, but must not merge
before WP02 is approved.

## Complexity Tracking

No charter gate violations. No new runtime dependencies. No structural exceptions.

> The `ChatClient` tool-call extension (WP03 design note) is an implementation decision,
> not a charter violation — it adds capability to the behavioral client without introducing
> skill-specific knowledge into core. The implementing agent documents the chosen approach
> before coding.
