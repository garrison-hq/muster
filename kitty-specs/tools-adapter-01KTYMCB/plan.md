# Implementation Plan: Tools (TOOLS.md) Conformance Adapter + Drift Checks

**Branch**: `main` (planning base and merge target; WPs run in spec-kitty lanes) | **Date**: 2026-06-13 | **Spec**: `kitty-specs/tools-adapter-01KTYMCB/spec.md`
**Input**: Feature specification from `/home/jeroennouws/dev/garrison-hq/muster/kitty-specs/tools-adapter-01KTYMCB/spec.md`

## Summary

Add a **Tools adapter** behind muster's `SpecAdapter` boundary that delivers
three test classes against a `TOOLS.md` file:

1. **Static lint** (offline, deterministic, FR-003): structural/presence checks
   on `TOOLS.md` per muster's published rubric (OpenClaw docs pinned to a
   commit SHA as supporting source, per C-002).
2. **Drift checks** (NEW class — documented vs. environment, FR-004/FR-005):
   compare each documented tool descriptor against a supplied **environment
   descriptor** (MCP manifest or OpenAI-compatible tool/function registry) and
   emit `documented-but-missing`, `present-but-undocumented`, and
   `schema-mismatch` findings against a published match-rubric. The descriptor
   is an input artifact — no live network call; path is offline and
   byte-stable (NFR-001).
3. **Behavioral tool-selection probes** (stochastic k-of-n, FR-006/FR-007):
   documented tools registered as OpenAI-compatible function-call invocables, a
   task scenario graded on correct-selection and abstention axes over N runs;
   errored run counts as failed (charter); every grader ships a
   rigged-impossible discrimination control (FR-008/charter).

`TOOLS.md` is guidance-only ("does not control tool availability" — OpenClaw
docs, RQ-04 of `kitty-specs/v2-agent-stack-research-01KTYA4C/research.md`), so
all static and drift findings cite muster's published rubric as the normative
source with OpenClaw docs (commit-SHA-pinned) as supporting source (C-002).
The drift test class introduced here is reusable across other adapters for
file-vs-reality comparisons; the tool-specific match-rubric stays inside this
adapter (C-004).

The adapter reuses the spec-agnostic core (pipeline, canonical-JSON, report,
CTS runner, behavioral runner/graders/client) without modifying it (FR-001,
C-001). Tool-selection observation maps onto OpenAI-compatible function calling;
endpoints lacking it cause those cases to error and fail (spec edge cases;
NFR-005). Positioning: this is one of three parallel OpenClaw convention-layer
missions (tools / memory / schedule), implementing the layer after SOP in the
research-locked order (RQ-10).

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 22 LTS (unchanged)
**Primary Dependencies**: no new runtime deps; no new dev-deps. Existing stack:
`yaml` (AST-level parsing), `ajv` (JSON Schema Draft 2020-12), `commander`
(CLI), `vitest` (tests), `@vitest/coverage-v8` (coverage; already added by
sonarcloud-remediation mission). Models reached via plain `fetch` against
OpenAI-compatible endpoints — no provider SDKs (NFR-005; charter).
**Storage**: N/A (file-based; static and drift paths fully offline)
**Testing**: Vitest 3 (`vitest.config.ts` present); fixture suite is primary
acceptance surface. Static + drift paths: deterministic, byte-stable. Behavioral
paths: BYOM OpenAI-compatible endpoint, k-of-n, errored = failed. Coverage gate:
≥80% new-code (SonarCloud, charter/NFR-006).
**Target Platform**: Linux (Fedora dev); GitHub Actions ubuntu-latest (CI)
**Project Type**: single package (existing layout — `src/adapters/tools/` mirrors `src/adapters/rfc1/`)
**Performance Goals**: single `TOOLS.md` static + drift < 5 s (NFR-002); full
static/drift fixture suite < 10 s (NFR-003); behavioral suite < 15 min against
local 7B (NFR-004).
**Constraints**: spec-agnostic core boundary untouched (C-001); drift path
offline and byte-stable — no live MCP/tool-endpoint calls (C-003/NFR-001); all
findings cite a muster-published rubric (FR-009); no credentials in repo
(NFR-005/charter); `tsc` strict (NFR-006).
**Scale/Scope**: one new adapter (`src/adapters/tools/`), four source modules,
fixture set (TOOLS.md files + environment descriptors + selection scenarios),
4 work packages.

## Charter Check

*Charter: `.kittify/charter/charter.md` (v1 charter; engineering constraints
carry to this mission).*

| Charter gate | Status |
|---|---|
| tsc strict passes before merge | PASS — NFR-006; all WP ACs require it |
| Full Vitest suite green incl. CTS fixture suite | PASS — NFR-006; each WP is behavior-adding with tests |
| No implementation before spec/plan/tasks locked | PASS — this plan precedes any code change |
| Minimal dependencies | PASS — zero new deps; existing yaml/ajv/vitest/coverage-v8 stack sufficient |
| Static + drift path zero network calls / offline / byte-stable | PASS — NFR-001/C-003; environment descriptor supplied as input file; deterministic canonical ordering |
| Every check cites a muster-published rubric (normative source) | PASS — FR-009/C-002; OpenClaw docs pinned to commit SHA as supporting source; no unwritten opinions |
| k-of-n with abstention axis; errored = failed | PASS — FR-007; charter "errored run counts as a failed run everywhere" |
| Every grader ships rigged-impossible discrimination control | PASS — FR-008; charter "every judge-backed grader ships with a rigged-impossible control case" |
| No hardcoded providers / no credentials in repo | PASS — NFR-005; BYOM endpoint from environment only; plain fetch |
| Performance targets | PASS — NFR-002/NFR-003/NFR-004; adapter reuses existing core, no new overhead sources |
| ≥80% new-code coverage (SonarCloud gate) | PASS — fixture suite + unit tests covers all four modules; charter 80% new-code threshold |
| Drift descriptor is an input artifact (not a live crawl) | PASS — C-003; muster does not connect to a live MCP server or tool endpoint |

No violations. Re-checked after Phase 1 design: clean.

## Project Structure

### Documentation (this feature)

```
kitty-specs/tools-adapter-01KTYMCB/
├── spec.md              # done
├── plan.md              # this file
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/spec-kitty.tasks — NOT created here)
```

### Source Code (repository root)

```
src/
└── adapters/
    └── tools/
        ├── index.ts         # adapter assembly (mirrors src/adapters/rfc1/index.ts)
        ├── lint.ts          # static TOOLS.md structural lint (FR-002, FR-003)
        ├── drift.ts         # drift checks vs. environment descriptor (FR-004, FR-005)
        └── selection.ts     # behavioral tool-selection probes (FR-006, FR-007, FR-008)

tests/
└── tools/
    ├── unit/
    │   ├── lint.test.ts         # static lint unit tests
    │   ├── drift.test.ts        # drift check unit tests (all three finding types)
    │   └── selection.test.ts    # selection grader + discrimination control
    └── fixtures/
        ├── tools-md/
        │   ├── well-formed.md           # passes static lint (FR acceptance scenario 1)
        │   ├── missing-section.md       # triggers static structural error (scenario 2)
        │   └── duplicate-tool.md        # duplicate-name static error (edge case)
        ├── env-descriptors/
        │   ├── matching-mcp.json        # exactly matches well-formed.md (scenario 6 / SC-002)
        │   ├── matching-openai.json     # OpenAI tool-registry format, exact match
        │   ├── documented-but-missing.json  # missing send_email (scenario 3)
        │   ├── present-but-undocumented.json # has delete_file not in TOOLS.md (scenario 4)
        │   ├── schema-mismatch-sub.json     # param subset (scenario 5 / direction: reality-ahead)
        │   ├── schema-mismatch-super.json   # param superset (direction: docs-ahead)
        │   └── unknown-format.json          # neither MCP nor OpenAI format (edge case)
        └── selection-scenarios/
            ├── correct-tool.json    # unambiguous correct tool (scenario 7)
            ├── abstain.json         # no applicable tool (scenario 8)
            └── control.json         # rigged-impossible discrimination control (scenario 9 / FR-008)
```

**Structure Decision**: single-package layout unchanged; new adapter under
`src/adapters/tools/` mirrors the `rfc1/` structure (4 modules vs. 7 — narrower
because the drift class replaces the resolve/state/schema machinery). Tests
mirror `tests/tools/` for parity with the existing behavioral test layout.

## Work-package outline (preview for /spec-kitty.tasks — not tasks.md)

- **WP01 — TOOLS.md parser + static structure lint** (FR-002, FR-003, NFR-001/002/003):
  - Parse `TOOLS.md` into structured `TOOLSFile` / `ToolDescriptor` entities
    (name, description, parameters, section structure).
  - Static lint: required sections, duplicate-name detection, per-rubric
    structural checks; every finding cites muster rubric + OpenClaw docs
    (commit-SHA-pinned) as supporting source (FR-009, C-002).
  - Deterministic canonical-JSON output (byte-stable, locale-independent
    UTF-16 ordering consistent with `canonical-json.ts`).
  - Deliverables: `src/adapters/tools/lint.ts`, partial `index.ts`, fixtures
    (`well-formed.md`, `missing-section.md`, `duplicate-tool.md`),
    `tests/tools/unit/lint.test.ts`.
  - Maps to FR-002, FR-003, C-001, C-002, NFR-001, NFR-002, NFR-003.

- **WP02 — Drift checks vs. supplied environment descriptor** (FR-004, FR-005, NFR-001):
  - Accept an `EnvironmentDescriptor` (MCP manifest or OpenAI-compatible tool
    registry JSON) as an input artifact.
  - Format detection: recognize MCP manifest shape vs. OpenAI tool registry;
    error clearly on unknown format (edge case from spec).
  - Match-rubric: structured name-match, parameter-set comparison, type-match;
    emit `documented-but-missing`, `present-but-undocumented`, `schema-mismatch`
    `DriftFinding` entities; record direction (docs-ahead / reality-ahead) on
    schema-mismatch; pure prose description differences are a lower-severity
    finding (spec edge-case).
  - All findings cite the match-rubric (FR-009); path zero network calls (C-003).
  - Deliverables: `src/adapters/tools/drift.ts`, `EnvironmentDescriptor` +
    `DriftFinding` types, env-descriptor fixtures (6 variants),
    `tests/tools/unit/drift.test.ts`.
  - Maps to FR-004, FR-005, FR-009, C-002, C-003, C-004, NFR-001.

- **WP03 — Behavioral tool-selection probes** (FR-006, FR-007, FR-008):
  - Documented tools registered as OpenAI-compatible function-call invocables
    sent to a BYOM endpoint.
  - Two grading axes: **correct-selection** (did the model call the right tool?)
    and **abstention** (did the model call no tool when none applied?).
  - k-of-n aggregation over N runs; errored run = failed run (charter rule).
  - `ToolSelectionCase` / `ToolSelectionVerdict` types; grader + control.
  - Rigged-impossible discrimination control: a scenario whose grader is
    forced to pass an obviously-wrong selection — this control must fail as
    designed (FR-008, charter, acceptance scenario 9).
  - BYOM endpoint from environment only; plain `fetch`; no provider SDK (NFR-005).
  - Deliverables: `src/adapters/tools/selection.ts`, selection-scenario
    fixtures (3: correct, abstain, control), `tests/tools/unit/selection.test.ts`.
  - Maps to FR-006, FR-007, FR-008, C-001, NFR-004, NFR-005.

- **WP04 — Fixture set + manifest runner + adapter assembly** (FR-010, FR-011, C-005):
  - `index.ts`: assemble lint + drift + selection behind the adapter boundary;
    expose a manifest-runner entry point (case id, `TOOLS.md`, environment
    descriptor, scenario set, expectations → pass/fail summary, FR-010).
  - Complete the fixture set shaped as a candidate upstream conformance suite
    (FR-011, C-005): validate all fixtures pass/fail as designed.
  - Integration test: run full static/drift fixture suite offline, verify
    byte-stable output (SC-002, NFR-001).
  - Deliverables: `src/adapters/tools/index.ts` (complete), full fixture set,
    integration test, SonarCloud gate green on new code.
  - Maps to FR-001, FR-010, FR-011, C-001, C-004, C-005, NFR-001, NFR-003, NFR-006.

**Build order**: WP01 → WP02 → WP03 → WP04. WP01 and WP02 are the core static
path; WP03 is the behavioral path (can begin once WP01 types are stable); WP04
requires all three. This mission is one of three parallel OpenClaw convention
layers; the drift test class it introduces (WP02) is reusable by other adapters
(e.g. memory recall, schedule action-diff) but the tool-specific match-rubric
stays in `src/adapters/tools/drift.ts` (C-004).

## Complexity Tracking

*No charter violations — zero new dependencies.*
