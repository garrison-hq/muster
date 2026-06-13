# Tasks: Tools (TOOLS.md) Conformance Adapter + Drift Checks

**Mission**: `tools-adapter-01KTYMCB`
**Input**: `spec.md`, `plan.md`, `data-model.md`, `quickstart.md`
**Branch contract**: planned on `main`; WPs execute in lanes; completed changes merge back into `main`.

**Ownership note**: the plan's four modules (`lint.ts`, `drift.ts`, `selection.ts`,
`index.ts`) map cleanly to four WPs by file ownership — `owned_files` never
overlap. WP01 owns the parser + static lint source; WP02 owns the drift engine
and environment-descriptor loading; WP03 owns the behavioral selection probe
machinery; WP04 owns adapter assembly, the manifest runner entry point, and
verifies the full fixture suite. Every WP also owns its own test and fixture
files so they never collide.

## Subtask Index

| ID | Description | WP | Parallel |
|---|---|---|---|
| T001 | `TOOLSFile` / `ToolDescriptor` / `ParameterDescriptor` type declarations | WP01 | [P] |
| T002 | `parseTOOLSFile()` — Markdown heading scan, section map, tool extraction | WP01 | [D] |
| T003 | Static lint checks (required sections, duplicate names, empty descriptions) | WP01 | [D] |
| T004 | Deterministic canonical-JSON output from `TOOLSFile` | WP01 | [D] |
| T005 | Fixture authoring — `well-formed.md`, `missing-section.md`, `duplicate-tool.md` | WP01 | [P] |
| T006 | `tests/tools/unit/lint.test.ts` — parser + lint unit tests (≥80% new-code) | WP01 | [D] |
| T007 | WP01 verification: `pnpm build && pnpm test` green; lint scenarios 1–2 pass | WP01 | [D] |
| T008 | `EnvironmentDescriptor` / `EnvironmentToolEntry` / `DriftFinding` / `DriftReport` types | WP02 | [P] |
| T009 | Format detection (MCP manifest vs. OpenAI tool-registry; unknown-format error) | WP02 | [D] |
| T010 | `runDriftCheck()` — match-rubric: name-match, param-set, type-match; direction flag | WP02 | [D] |
| T011 | Deterministic output ordering (kind-then-toolName, UTF-16 code-unit) | WP02 | [D] |
| T012 | Fixture authoring — 7 env-descriptor JSON files (matching + 5 drift variants) | WP02 | [P] |
| T013 | `tests/tools/unit/drift.test.ts` — all three finding types + clean + edge cases | WP02 | [D] |
| T014 | WP02 verification: offline constraint holds; drift scenarios 3–6 + edge cases pass | WP02 | [D] |
| T015 | `ToolSelectionCase` / `ToolSelectionVerdict` / `ToolSelectionRunResult` types | WP03 | [P] |
| T016 | `runSelectionCase()` — OpenAI function-call registration, k-of-n loop, errored=failed | WP03 | [D] |
| T017 | Correct-selection grader + abstention-axis grader | WP03 | [D] |
| T018 | Rigged-impossible discrimination control (FR-008; charter invariant) | WP03 | [D] |
| T019 | Fixture authoring — `correct-tool.json`, `abstain.json`, `control.json` | WP03 | [P] |
| T020 | `tests/tools/unit/selection.test.ts` — grader + control unit tests (mock fetch) | WP03 | [D] |
| T021 | WP03 verification: control case must produce `passed === false` (charter) | WP03 | [D] |
| T022 | `src/adapters/tools/index.ts` — adapter assembly behind `SpecAdapter` boundary | WP04 | [P] |
| T023 | Manifest runner entry point (case id, TOOLS.md, env-descriptor, scenarios → summary) | WP04 | [D] |
| T024 | Integration test: full static/drift fixture suite offline, byte-stable output | WP04 | [D] |
| T025 | SonarCloud gate green on new code (≥80% new-code coverage) | WP04 | [D] |
| T026 | WP04 verification: `pnpm build && pnpm test` green; all scenarios 1–9 pass | WP04 | [D] |

## Phase 1 — Parser + static lint (WP01)

### WP01 — TOOLS.md parser + static structure lint — prompt: `tasks/WP01-tools-parser-lint.md`

**Goal**: Implement `src/adapters/tools/lint.ts` — the `parseTOOLSFile()` function and
all static lint checks (required sections, duplicate-name detection, empty
descriptions, structural rubric). Produce deterministic canonical-JSON output.
Author the three TOOLS.md fixtures and write the unit test suite.
**Priority**: P1 · **Estimated prompt size**: ~320 lines
**Independent test**: `pnpm build && pnpm test -- tests/tools/unit/lint.test.ts` green;
acceptance scenarios 1 and 2 pass deterministically; no files outside `owned_files` modified.

- [ ] T001 `TOOLSFile` / `ToolDescriptor` / `ParameterDescriptor` type declarations (WP01)
- [ ] T002 `parseTOOLSFile()` Markdown heading scan + section map + tool extraction (WP01)
- [ ] T003 Static lint checks: required sections, duplicate names, empty descriptions (WP01)
- [ ] T004 Deterministic canonical-JSON output from `TOOLSFile` (WP01)
- [ ] T005 Fixture authoring — `well-formed.md`, `missing-section.md`, `duplicate-tool.md` (WP01)
- [ ] T006 `tests/tools/unit/lint.test.ts` (WP01)
- [ ] T007 WP01 verification (WP01)

**Dependencies**: none (first in build order).
**Parallel**: T001 (types) and T005 (fixtures) can be drafted simultaneously; T002–T004 are sequential; T006 depends on T002–T005.
**Risks**: section-heading normalisation must be locale-independent (lower-case
trimmed, consistent with `src/core/canonical-json.ts` UTF-16 ordering); the
parser surfaces duplicates rather than silently deduplicating them (data-model
invariant).

## Phase 2 — Drift checks (WP02)

### WP02 — Drift checks vs. supplied environment descriptor — prompt: `tasks/WP02-drift-checks.md`

**Goal**: Implement `src/adapters/tools/drift.ts` — format detection, `runDriftCheck()`,
match-rubric, `DriftReport` production, and deterministic output ordering. Author
the seven env-descriptor fixtures and write the drift unit test suite covering
all three finding types, the clean path, and all edge cases.
**Priority**: P1 · **Estimated prompt size**: ~380 lines
**Independent test**: `pnpm build && pnpm test -- tests/tools/unit/drift.test.ts` green;
drift scenarios 3–6 and all edge cases (unknown format, superset/subset mismatch,
prose-only) pass; zero network calls in the drift path.

- [ ] T008 `EnvironmentDescriptor` / `DriftFinding` / `DriftReport` types (WP02)
- [ ] T009 Format detection (MCP manifest vs. OpenAI tool-registry; unknown-format error) (WP02)
- [ ] T010 `runDriftCheck()` with full match-rubric (WP02)
- [ ] T011 Deterministic output ordering (kind-then-toolName, UTF-16 code-unit) (WP02)
- [ ] T012 Fixture authoring — 7 env-descriptor JSON files (WP02)
- [ ] T013 `tests/tools/unit/drift.test.ts` (WP02)
- [ ] T014 WP02 verification: offline constraint; byte-stability on scenario 6 (WP02)

**Dependencies**: WP01 (`TOOLSFile` and `ToolDescriptor` types consumed by drift check).
**Parallel**: T008 (types) and T012 (fixtures) can be drafted simultaneously; T009–T011 are sequential.
**Risks**: the `citedRubric` field is mandatory on every `DriftFinding` — the check
must refuse to emit a finding without one (charter invariant); unknown-format
must error, never silently pass (spec edge case); the drift path performs no
network calls (C-003/NFR-001).

## Phase 3 — Behavioral tool-selection probes (WP03)

### WP03 — Behavioral tool-selection probes — prompt: `tasks/WP03-selection-probes.md`

**Goal**: Implement `src/adapters/tools/selection.ts` — `runSelectionCase()`, the
correct-selection grader, the abstention-axis grader, and the rigged-impossible
discrimination control. Author the three selection-scenario fixtures and write
the unit test suite (mock fetch; no live endpoint needed).
**Priority**: P1 · **Estimated prompt size**: ~360 lines
**Independent test**: `pnpm build && pnpm test -- tests/tools/unit/selection.test.ts` green;
control case produces `passed === false` (charter "every grader ships a
rigged-impossible control"); errored-run-is-failed invariant verified;
no credentials in repo.

- [ ] T015 `ToolSelectionCase` / `ToolSelectionVerdict` / `ToolSelectionRunResult` types (WP03)
- [ ] T016 `runSelectionCase()` — OpenAI function-call registration, k-of-n loop, errored=failed (WP03)
- [ ] T017 Correct-selection grader + abstention-axis grader (WP03)
- [ ] T018 Rigged-impossible discrimination control (WP03)
- [ ] T019 Fixture authoring — `correct-tool.json`, `abstain.json`, `control.json` (WP03)
- [ ] T020 `tests/tools/unit/selection.test.ts` with mock fetch (WP03)
- [ ] T021 WP03 verification: control `passed === false`; errored=failed verified (WP03)

**Dependencies**: WP01 (`TOOLSFile` types; tools registered from `TOOLSFile.tools`).
**Parallel**: T015 (types) and T019 (fixtures) can be drafted simultaneously; T016–T018 are sequential.
**Risks**: endpoints lacking OpenAI function-calling support must cause those cases
to error and fail — never silently pass (spec edge case; charter); model
selecting a tool not in the registered set counts as a wrong selection (spec
edge case); BYOM endpoint read from environment only (`process.env`), never
hardcoded (NFR-005; charter).

## Phase 4 — Adapter assembly + fixture runner (WP04)

### WP04 — Fixture set + manifest runner + adapter assembly — prompt: `tasks/WP04-adapter-assembly.md`

**Goal**: Implement `src/adapters/tools/index.ts` — assemble lint + drift + selection
behind the `SpecAdapter` boundary, expose the manifest runner entry point, and
complete the full fixture set as a candidate upstream conformance suite.
Run the integration test and verify SonarCloud gate green on new code.
**Priority**: P1 (merges last) · **Estimated prompt size**: ~350 lines
**Independent test**: `pnpm build && pnpm test` full suite green including the tools
adapter fixture suite; all nine acceptance scenarios pass; byte-stable output
on repeated runs (SC-002); SonarCloud gate passes (≥80% new-code coverage);
`tsc` strict clean.

- [ ] T022 `src/adapters/tools/index.ts` — adapter assembly behind `SpecAdapter` boundary (WP04)
- [ ] T023 Manifest runner entry point (WP04)
- [ ] T024 Integration test: full static/drift fixture suite offline, byte-stable (WP04)
- [ ] T025 SonarCloud gate green on new code (≥80% new-code coverage) (WP04)
- [ ] T026 WP04 verification: full suite; all scenarios 1–9 pass; byte-stable diff (WP04)

**Dependencies**: WP01, WP02, WP03 (all three modules complete).
**Parallel**: T022 (assembly skeleton) can begin once WP01–WP03 types are stable.
**Risks**: `src/core/` must never import from `src/adapters/tools/` — the TypeScript
`SpecAdapter` boundary is enforced at compile time (C-001); SonarCloud gate must
pass as a blocking PR check (charter); full fixture suite must run offline with
zero network calls on the static/drift paths (NFR-001/C-003).

## Dependency summary

```
WP01 ──┐
WP02 ──┤──▶ WP04 (adapter assembly, merges last)
WP03 ──┘
```

WP01 is the strict first step (provides `TOOLSFile` types consumed by WP02 and WP03).
WP02 and WP03 depend on WP01 types but are otherwise independent of each other.
WP04 requires all three.

## Acceptance traceability

- FR-001 (SpecAdapter boundary; core untouched) → WP04 (T022; `tsc` strict enforces the import boundary)
- FR-002 (parse TOOLS.md into ToolDescriptor) → WP01 (T001, T002)
- FR-003 (static lint per rubric) → WP01 (T003, T004, T006)
- FR-004 (drift checks; three finding types) → WP02 (T010, T013)
- FR-005 (env descriptor as input artifact; offline) → WP02 (T009, T014)
- FR-006 (behavioral tool-selection probes; BYOM) → WP03 (T016, T017)
- FR-007 (k-of-n, abstention axis, errored=failed) → WP03 (T016, T021)
- FR-008 (rigged-impossible discrimination control) → WP03 (T018, T021)
- FR-009 (every finding cites muster rubric) → WP01 (T003), WP02 (T010, T011)
- FR-010 (manifest runner; pass/fail summary) → WP04 (T023)
- FR-011 (fixture set shaped as candidate upstream CTS) → WP01 (T005), WP02 (T012), WP03 (T019), WP04 (T024)
- NFR-001 (offline; byte-stable) → WP02 (T011, T014), WP04 (T024, T026)
- NFR-002 (< 5 s single TOOLS.md) → WP01 (T007), WP02 (T014)
- NFR-003 (< 10 s full static/drift suite) → WP04 (T026)
- NFR-004 (< 15 min behavioral suite vs local 7B) → WP03 (T021)
- NFR-005 (no provider SDKs; no credentials in repo) → WP03 (T016, T021)
- NFR-006 (tsc strict; Vitest green; SonarCloud gate) → WP04 (T025, T026)
- SC-001 (operator can detect drift, classified) → WP02 + WP04
- SC-002 (drift check reproducible; byte-identical) → WP02 (T011) + WP04 (T024)
- SC-003 (measure correct-selection + abstention) → WP03
- SC-004 (every grader fails its control) → WP03 (T018, T021)
- SC-005 (same behavioral suite against two endpoints) → WP03 (T016; endpoint from env only)
