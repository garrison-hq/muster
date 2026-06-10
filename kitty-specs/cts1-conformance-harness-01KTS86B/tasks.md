# Tasks: Soul.md CTS-1 Conformance Harness (muster)

**Mission**: `cts1-conformance-harness-01KTS86B` | **Branch**: planning on `main`, merging to `main`
**Inputs**: spec.md, plan.md, research.md (R1–R9), data-model.md, contracts/
**Tests**: REQUIRED — charter testing standards make the CTS fixture suite the primary acceptance suite; unit tests cover merge/canonicalization/parsing/grading cores. Every conformance test cites its RFC-1 section (charter directive 3).

## Subtask Index

| ID | Description | WP | Parallel |
|----|-------------|----|----------|
| T001 | Project scaffold: package.json (@garrison-hq/muster), tsconfig strict, vitest config | WP01 | | [D] | [D] |
| T002 | Core types: SpecAdapter interface, Mode, MergeStrategy, Violation, ConformanceReport | WP01 | | [D] |
| T003 | RFC 8785 canonical JSON serializer + test vectors | WP01 | [D] |
| T004 | Parameterized Standard Merge engine + §8.1 unit tests | WP01 | [D] |
| T005 | Front-matter extraction (§3.1.1) | WP02 | | [D] |
| T006 | Soul-YAML forbidden-feature detection via AST (§4.2) | WP02 | | [D] |
| T007 | Parse-layer unit tests (no-expansion guarantee, edge cases) | WP02 | | [D] |
| T008 | Vendor Appendix E schema + Ajv 2020-12 wiring | WP03 | [D] |
| T009 | §25 keyspace rules by mode (unknown vs known-optional keys) | WP03 | | [D] |
| T010 | Scalar typing: percent/float01/enums/BCP-47 (§4.3) | WP03 | | [D] |
| T011 | Profile rules: default required, overrides ⊆ profiles (§9) | WP03 | | [D] |
| T012 | Validation-layer unit tests | WP03 | | [D] |
| T013 | Composition resolution §7.5/Appendix G (loadRef, stripping, ordering) | WP04 | | [D] |
| T014 | State semantics §20 (base fallback, trigger validation, overlay) | WP04 | | [D] |
| T015 | Evaluation rule references §21 (@id + literal code-point match) | WP04 | | [D] |
| T016 | Trigger evaluation: RPP-1 subset (ident, !, &&), first-match-wins | WP04 | | [D] |
| T017 | Resolution/state/evaluation unit tests | WP04 | | [D] |
| T018 | Static pipeline orchestrator (parse→validate→resolve→report) | WP05 | | [D] |
| T019 | Rfc1Adapter assembly implementing SpecAdapter | WP05 | | [D] |
| T020 | Pipeline tests incl. §25.1 report-shape conformance | WP05 | | [D] |
| T021 | CTS manifest loader (F.1 + expect_effective_json extension) | WP06 | [D] |
| T022 | CTS runner: per-case execution + canonical-JSON comparison (F.2) | WP06 | | [D] |
| T023 | Runner unit tests with synthetic in-memory fixtures | WP06 | | [D] |
| T024 | Fixtures: minimal/ (Appendix A valid, missing-key, forbidden-YAML) | WP07 | [D] |
| T025 | Fixtures: merge/ (scalar/map/list/null/type-mismatch + expected.json) | WP07 | [D] |
| T026 | Fixtures: composition/ (extends+mixins order, stripping, cycle) | WP07 | [D] |
| T027 | Fixtures: profiles/ (overlay, missing default, bad override key) | WP08 | [D] |
| T028 | Fixtures: state/ (base fallback UTF-8 order, bad trigger, timed w/o ttl) | WP08 | [D] |
| T029 | Fixtures: evaluation/ (@id resolution, unresolved reference) | WP08 | [D] |
| T030 | cts/manifest.yaml covering all cases + §25.2 category map | WP08 | | [D] |
| T031 | tests/cts/suite.test.ts — vitest entry running the full suite | WP08 | | [D] |
| T032 | Behavioral types: Turn, TurnList, Transcript, BehavioralCase, verdicts | WP09 | |
| T033 | OpenAI-compatible chat client (plain fetch, env-only keys) | WP09 | |
| T034 | Behavioral runner: turn loop, fact injection, k-of-n | WP09 | |
| T035 | Graders (verbosity/refusal/state-shift) + thresholds.ts (R9) | WP09 | |
| T036 | Behavioral unit tests against a mocked client | WP09 | |
| T037 | CLI program + `muster check` | WP10 | |
| T038 | `muster resolve` + output formats incl. canonical-json | WP10 | |
| T039 | `muster cts run` (+ --filter) | WP10 | |
| T040 | `muster behave run` (+ endpoint flags) | WP10 | |
| T041 | CLI tests: exit codes, report schema conformance | WP10 | |
| T042 | Voice-frontdesk Soul.md (cold_strict state, user.rude trigger) | WP11 | [P] |
| T043 | Behavioral manifest: 3 axes + discrimination case | WP11 | |
| T044 | README: quickstart, endpoint setup (Ollama/NIM), fixture contribution note | WP11 | |
| T045 | Acceptance runs: local Ollama + hosted NIM, record results | WP11 | |

## Phase 1 — Setup

### WP01 — Scaffold & Deterministic Primitives
**Goal**: Buildable strict-TS package with the two pure cores everything depends on: RFC 8785 serialization and the Standard Merge engine.
**Priority**: P0 | **Dependencies**: none | **Estimated prompt**: ~300 lines
**Independent test**: `pnpm test` green; canonical-JSON output matches RFC 8785 Appendix B vectors byte-for-byte; merge engine reproduces every §8.1 example.
- [x] T001 Project scaffold (WP01)
- [x] T002 Core types: SpecAdapter, Violation, ConformanceReport (WP01)
- [x] T003 RFC 8785 canonical JSON + vectors (WP01)
- [x] T004 Standard Merge engine + §8.1 tests (WP01)
**Prompt**: [tasks/WP01-scaffold-and-primitives.md](tasks/WP01-scaffold-and-primitives.md)

## Phase 2 — Static Spine (foundational)

### WP02 — RFC-1 Parse Layer
**Goal**: §3.1.1 front-matter extraction and §4.2 forbidden-feature detection that never applies forbidden semantics.
**Priority**: P0 | **Dependencies**: WP01 | **Estimated prompt**: ~280 lines
**Independent test**: anchored/aliased/merge-key/tagged documents are refused in both modes with path+message+section; alias content is never expanded into parsed data.
- [x] T005 Front-matter extraction §3.1.1 (WP02)
- [x] T006 Soul-YAML AST detection §4.2 (WP02)
- [x] T007 Parse-layer unit tests (WP02)
**Prompt**: [tasks/WP02-rfc1-parse-layer.md](tasks/WP02-rfc1-parse-layer.md)

### WP03 — RFC-1 Validation Layer
**Goal**: Two-layer validation (R4): vendored Appendix E schema via Ajv + the §25 keyspace/semantic rules the permissive schema can't express.
**Priority**: P0 | **Dependencies**: WP01 (parallel with WP02) | **Estimated prompt**: ~380 lines
**Independent test**: minimal soul passes both modes; unknown top-level key rejected strict / warned permissive; `en_US` locale rejected strict; percent 101 rejected.
- [x] T008 Schema vendoring + Ajv wiring (WP03)
- [x] T009 §25 keyspace rules by mode (WP03)
- [x] T010 Scalar typing + BCP-47 (WP03)
- [x] T011 Profile rules §9 (WP03)
- [x] T012 Validation unit tests (WP03)
**Prompt**: [tasks/WP03-rfc1-validation-layer.md](tasks/WP03-rfc1-validation-layer.md)

### WP04 — Composition, State & Evaluation Resolution
**Goal**: Deterministic §7.5/Appendix G resolution with root-owned stripping and cycle detection; §20 state semantics; §21 rule references; RPP-1-subset trigger evaluation.
**Priority**: P0 | **Dependencies**: WP01, WP02, WP03 | **Estimated prompt**: ~450 lines
**Independent test**: composition chain produces byte-stable canonical JSON matching hand-computed expectation; cycle fails strict; omitted state.base falls back to lexicographically smallest key by UTF-8 bytes.
- [x] T013 Composition resolution §7.5/G (WP04)
- [x] T014 State semantics §20 (WP04)
- [x] T015 Evaluation rule references §21 (WP04)
- [x] T016 Trigger evaluation RPP-1 subset (WP04)
- [x] T017 Resolution unit tests (WP04)
**Prompt**: [tasks/WP04-composition-state-resolution.md](tasks/WP04-composition-state-resolution.md)

### WP05 — Pipeline & Adapter Assembly
**Goal**: The spec-agnostic check pipeline (parse→validate→resolve→§25.1 report) and the Rfc1Adapter that plugs the WP02–04 pieces into the SpecAdapter contract.
**Priority**: P0 | **Dependencies**: WP02, WP03, WP04 | **Estimated prompt**: ~260 lines
**Independent test**: pipeline emits a report validating against contracts/conformance-report.schema.json; core compiles with zero imports from src/adapters/.
- [x] T018 Static pipeline orchestrator (WP05)
- [x] T019 Rfc1Adapter assembly (WP05)
- [x] T020 Pipeline + report-shape tests (WP05)
**Prompt**: [tasks/WP05-pipeline-adapter-assembly.md](tasks/WP05-pipeline-adapter-assembly.md)

## Phase 3 — CTS Suite

### WP06 — CTS Manifest & Runner
**Goal**: Appendix F.1 manifest loading and the fixture runner with F.2 canonical-JSON byte comparison.
**Priority**: P1 | **Dependencies**: WP05 | **Estimated prompt**: ~300 lines
**Independent test**: synthetic in-memory cases: expect_ok mismatch detected; expected-error matching (path exact, message substring); byte-difference reported.
- [x] T021 Manifest loader F.1 (WP06)
- [x] T022 Runner + comparisons F.2 (WP06)
- [x] T023 Runner unit tests (WP06)
**Prompt**: [tasks/WP06-cts-manifest-runner.md](tasks/WP06-cts-manifest-runner.md)

### WP07 — Fixtures A: minimal / merge / composition
**Goal**: First half of the CTS-1 fixture contribution — data only, hand-computed expected.json files.
**Priority**: P1 | **Dependencies**: none (data-only; verified by WP08 suite) | **Estimated prompt**: ~340 lines
**Independent test**: each fixture is self-describing; expected.json files are valid canonical JSON (sorted keys, no trailing newline).
- [x] T024 minimal/ fixtures (WP07)
- [x] T025 merge/ fixtures (WP07)
- [x] T026 composition/ fixtures (WP07)
**Prompt**: [tasks/WP07-fixtures-minimal-merge-composition.md](tasks/WP07-fixtures-minimal-merge-composition.md)

### WP08 — Fixtures B + Manifest + Suite Gate
**Goal**: Second fixture half (profiles/state/evaluation), the unified cts/manifest.yaml mapping all nine §25.2 categories, and the vitest gate that runs the whole suite.
**Priority**: P1 | **Dependencies**: WP06, WP07 | **Estimated prompt**: ~400 lines
**Independent test**: `pnpm test` runs the full CTS suite green; every §25.2 category exercised by ≥1 valid + ≥1 broken case (SC-001/SC-002).
- [x] T027 profiles/ fixtures (WP08)
- [x] T028 state/ fixtures (WP08)
- [x] T029 evaluation/ fixtures (WP08)
- [x] T030 cts/manifest.yaml + category map (WP08)
- [x] T031 CTS suite vitest entry (WP08)
**Prompt**: [tasks/WP08-fixtures-manifest-suite.md](tasks/WP08-fixtures-manifest-suite.md)

## Phase 4 — Behavioral Slice

### WP09 — Behavioral Core
**Goal**: Turn-list→transcript runner (multi-turn, C-005), fetch-only BYOM client (C-006), k-of-n grading on the three locked axes with R9 thresholds.
**Priority**: P1 | **Dependencies**: WP05 | **Estimated prompt**: ~480 lines
**Independent test**: against a scripted mock client — verbosity over-limit fails with measured vs limit; fact injection at turn N shifts grading thresholds; 2-of-3 semantics incl. errored-run-counts-as-fail.
- [ ] T032 Behavioral types (WP09)
- [ ] T033 OpenAI-compatible client (WP09)
- [ ] T034 Runner: turn loop, facts, k-of-n (WP09)
- [ ] T035 Graders + thresholds.ts (WP09)
- [ ] T036 Mock-client unit tests (WP09)
**Prompt**: [tasks/WP09-behavioral-core.md](tasks/WP09-behavioral-core.md)

## Phase 5 — CLI & Acceptance

### WP10 — CLI Assembly
**Goal**: The `muster` binary: check / resolve / cts run / behave run, uniform exit codes, contracts/cli.md exactly.
**Priority**: P1 | **Dependencies**: WP05, WP06, WP09 | **Estimated prompt**: ~380 lines
**Independent test**: exit code 0/1/2 matrix; `resolve --output-format canonical-json` byte-stable across runs; `check --json` validates against report schema.
- [ ] T037 CLI program + check (WP10)
- [ ] T038 resolve + output formats (WP10)
- [ ] T039 cts run (WP10)
- [ ] T040 behave run (WP10)
- [ ] T041 CLI tests (WP10)
**Prompt**: [tasks/WP10-cli-assembly.md](tasks/WP10-cli-assembly.md)

### WP11 — Voice-Frontdesk Soul, Behavioral Manifest & Acceptance
**Goal**: The behavioral substrate soul, the 3-axis manifest with discrimination case, README, and the two acceptance runs (Ollama local + NIM hosted) — SC-005/SC-006.
**Priority**: P1 | **Dependencies**: WP09, WP10 | **Estimated prompt**: ~360 lines
**Independent test**: `muster check souls/voice-frontdesk/Soul.md` passes strict; behave run produces verdicts on all three axes on both endpoints; discrimination case fails as designed.
- [ ] T042 Voice-frontdesk Soul.md (WP11)
- [ ] T043 Behavioral manifest + discrimination case (WP11)
- [ ] T044 README + endpoint setup docs (WP11)
- [ ] T045 Acceptance runs on both endpoints (WP11)
**Prompt**: [tasks/WP11-voice-soul-acceptance.md](tasks/WP11-voice-soul-acceptance.md)

## Dependency Graph & Parallelization

```
WP01 ──┬── WP02 ──┐
       ├── WP03 ──┼── WP04 ── WP05 ──┬── WP06 ──┐
       │          │                  │          ├── WP08
WP07 ──┼──────────┼──────────────────┼──────────┘
       │          │                  ├── WP09 ──┬── WP10 ── WP11
       └──────────┘                  └──────────┘
```

- **Lane-parallel after WP01**: WP02 ∥ WP03 ∥ WP07 (WP07 is data-only, parallel from the start).
- **After WP05**: WP06 ∥ WP09.
- **Critical path**: WP01 → WP03 → WP04 → WP05 → WP09 → WP10 → WP11 (7 WPs).
- **MVP scope**: WP01–WP05 = a working `static` conformance core (the complete spine the scope guard demands); WP06–WP08 make it CTS-1; WP09–WP11 add the behavioral slice.

## Risks

1. **Hand-computed expected.json drift** (WP07/08): authors must apply §7.5/§8.1 by hand. Mitigation: keep composition fixtures small; suite gate (T031) catches drift immediately.
2. **yaml-package AST API nuances** (WP02): alias/anchor detection must precede resolution. Mitigation: T007 includes a "billion-laughs-shaped" regression test proving no expansion.
3. **Model nondeterminism in acceptance** (WP11): k-of-3 mitigates; discrimination case designed with wide margin (limit 25 vs prompt engineered to produce 60+ words).
4. **Endpoint availability** (WP11): NVIDIA driver install pending reboot; NIM needs a key. Both documented as environment prerequisites — T045 records results rather than gating CI.
