# Implementation Plan: OpenClaw SOP (AGENTS.md) Conformance Adapter

**Branch**: `main` | **Date**: 2026-06-13 | **Spec**: `kitty-specs/openclaw-sop-adapter-01KTYKNZ/spec.md`
**Input**: Feature specification from `kitty-specs/openclaw-sop-adapter-01KTYKNZ/spec.md`

## Summary

Build the OpenClaw SOP adapter: a `SpecAdapter`-compliant module that tests
whether a model loaded with an `AGENTS.md` operating policy actually **obeys its
documented rules** — under normal conditions (compliance probes) and under attack
(adversarial injection / scope-escape probes) — graded on an objective
binary/judge split with safety-critical rules aggregated pass^k.

**Key design decision** (grounded in RQ-01, RQ-04, RQ-08): OpenClaw is
convention-only. There is no citable formal schema and conflict precedence is
documented nowhere (RQ-04). Therefore the adapter works against a
**muster-authored SOP rule manifest** — each entry declares one rule with its
probe(s), grading class (binary or judge), aggregation (pass^k / k-of-n), and
cited source. Most checks cite **muster's published rubric** (the normative
source the charter requires); the OpenClaw docs (pinned to a commit SHA) serve
as supporting source. The `AGENTS.md` file is the fixture; the manifest declares
what to test and why.

Grading follows the objectivity line established in RQ-08:

- **Binary** where the property is trace-decidable: never-call-tool,
  tool-call ordering, confirm-before-destructive (event order),
  exact-string non-leakage, output-format (schema/regex).
- **Judge-graded** where the property is fuzzy: refusal quality, tone —
  with documented bias mitigations (position/order-swap + rubric anchoring).

Aggregation follows the charter two-tier model (RQ-08): safety-critical rules
(injection resistance, privacy/non-leakage, never-call-tool, scope) use
**pass^k** (all k runs must hold); stylistic rules use k-of-n. An errored run
counts as a failed run everywhere (FR-007, charter).

A thin **static lint** also ships: presence/structure checks on the SOP file
plus an `undefined-precedence` finding when the manifest declares contradictory
rules with no stated precedence — the absence of any conflict-resolution rule in
OpenClaw's docs is itself the citable finding (RQ-04).

The mission also vendors adversarial probe corpora (InjecAgent, AgentDojo
subset, Gandalf ignore-instructions, deepset prompt-injections — all MIT/Apache,
RQ-09) and publishes muster's SOP rule-class taxonomy and trigger/grading rubric
as the normative versioned documentation source the graders cite (FR-013).

Layer placement: **layer 2 of 3 in the v1-extended milestone** (skills first,
SOP second, cross-layer third — RQ-10). Reuses muster core (`SpecAdapter`,
pipeline, canonical JSON, report, behavioral runner/graders/client) and extends
graders with tool-call/trace inspection and pass^k aggregation.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 22 LTS (unchanged)
**Primary Dependencies**: no new runtime deps. Vendored adversarial corpora are
DATA (files under `vendored/`), not npm dependencies — no charter minimal-deps
violation (see Complexity Tracking). Existing runtime deps: `yaml`, `ajv`,
`commander`; new dev-dep: none beyond what already exists.
**Storage**: N/A (CLI + CI exit codes; no database)
**Testing**: Vitest 3 (`vitest.config.ts` present); full CTS fixture suite plus
the new SOP fixture suite is the regression net. Coverage uploaded as lcov;
SonarCloud gate enforces ≥80% on changed code. `pnpm test:coverage` emits
`coverage/lcov.info`.
**Target Platform**: Linux (Fedora) dev + GitHub Actions ubuntu-latest (CI);
static lint path fully offline and byte-stable deterministic.
**Project Type**: single package (existing layout); adapter lives in
`src/adapters/openclaw-sop/`, tests in `tests/adapters/openclaw-sop/`, fixtures
in `tests/adapters/openclaw-sop/fixtures/`, vendored corpora in
`vendored/openclaw-sop/`.
**Performance Goals**: Static lint < 5 s (NFR-002); full static fixture suite
< 10 s (NFR-003); behavioral suite (compliance + adversarial) < 15 min against
a local 7B model (NFR-004).
**Constraints**:
- C-001: spec-agnostic core never learns SOP specifics; all SOP knowledge behind
  the `SpecAdapter` boundary.
- C-002: OpenClaw citations pin to repo commit SHAs; rule-level checks cite
  muster's published rubric as their normative source.
- C-003: vendored corpora MIT/Apache/CC-BY only, license-verified at vendoring
  time, upstream LICENSE + citation files retained.
- C-006: muster reports violations; it never rewrites the SOP file.
- NFR-001: static lint is zero-network, byte-stable deterministic.
- NFR-005: model access BYOM via any OpenAI-compatible endpoint; credentials
  from environment only (`MUSTER_API_KEY` or `OPENAI_API_KEY`).

**New grader capabilities** (extensions to existing `src/core/behavioral/graders.ts`):
The SOP adapter introduces additional grading functions — NOT modifications to
the core file (C-001). They live in `src/adapters/openclaw-sop/graders.ts`:
- `gradeToolCallPresence` — never-call-tool assertion (binary, trace-level).
- `gradeToolOrder` — tool A only after tool B event-order assertion (binary).
- `gradeConfirmBeforeDestructive` — confirmation turn precedes any destructive
  tool call (binary, event-order).
- `gradeExactStringNonLeakage` — exact string must not appear anywhere in the
  transcript (binary).
- `gradeOutputFormat` — output matches a declared schema or regex (binary).
- `gradeJudgeCompliance` — judge-backed grader for refusal quality/tone with
  order-swap and rubric-anchoring bias controls; ships with a rigged-impossible
  discrimination control (charter).
- `aggregatePassK` — conjunctive k-of-n: all k runs must pass (FR-007).

All graders carry `measured` and `limit` in every grade record (NFR-005 pattern
from v1).

## Charter Check

| Charter gate | Status |
|---|---|
| `tsc` strict passes before merge | PASS — AC on every WP; adapter code is fully typed; no `any` escapes |
| Full Vitest suite green incl. CTS fixture suite | PASS — existing suite is the regression net; new SOP fixture suite added |
| SonarCloud quality gate (≥80% new-code coverage, blocking PR check) | PASS — all new code covered by fixture-driven tests; lcov upload unchanged |
| Every check cites a normative source (muster rubric or OpenClaw doc SHA) | PASS — each `SOPRuleManifest` entry carries a `source` field; static lint surfaces missing sources; FR-009 |
| pass^k for safety-critical rules (injection resistance, non-leakage, never-call-tool, scope) | PASS — `aggregatePassK` enforcer; errored run = failed run everywhere (FR-007, charter) |
| Every judge-backed grader ships a rigged-impossible discrimination control | PASS — `gradeJudgeCompliance` ships a control case that must fail; all-refuse guard included (FR-008) |
| Vendored corpora MIT/Apache/CC-BY, license-verified, LICENSE + citation files retained | PASS — four corpora (InjecAgent MIT, AgentDojo MIT, Gandalf MIT, deepset Apache-2.0); each has `vendored/openclaw-sop/<corpus>/LICENSE` + `CITATION.md` (FR-010, C-003, RQ-09) |
| No implementation before spec/plan/tasks locked | PASS — this plan precedes any code |
| Static path offline + byte-stable deterministic (UTF-16 code-unit ordering) | PASS — lint output is pure function of SOP text + manifest; zero network calls (NFR-001) |
| No hardcoded model providers / no credentials in repo | PASS — BYOM via env key; NFR-005 |
| Minimal runtime dependencies (no new runtime deps) | PASS — vendored corpora are DATA files, not npm deps (see Complexity Tracking) |
| Performance targets (5 s / 10 s / 15 min) | PASS — static lint is synchronous text processing; behavioral budget inherited from charter |
| C-001: core boundary untouched | PASS — new graders and SOP types live entirely under `src/adapters/openclaw-sop/`; `src/core/` has no SOP imports |
| muster rubric published as versioned doc before graders cite it | PASS — WP05 ships the rubric/taxonomy doc page; WP01 enforces every manifest entry references it |

No violations. Re-checked after Phase 1 design: still clean.

## Project Structure

### Documentation (this mission)

```
kitty-specs/openclaw-sop-adapter-01KTYKNZ/
├── spec.md              # locked (authoritative)
├── plan.md              # this file
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (SOP manifest schema, probe contracts)
└── tasks.md             # Phase 2 output (/spec-kitty.tasks — NOT created here)
```

### Source Code (new paths + affected existing paths)

```
src/adapters/openclaw-sop/
├── index.ts             # SOPAdapter: SpecAdapter-compatible entry point + static lint orchestration
├── manifest.ts          # SOPRuleManifest schema, parser, validator; AGENTS.md SOP file reader
├── probes.ts            # ComplianceProbe + AdversarialProbe loaders; probe corpus loader
└── graders.ts           # Binary graders (tool-call/trace inspection) + judge grader + pass^k aggregation

tests/adapters/openclaw-sop/
├── manifest.test.ts     # SOP parse, rule manifest load/validate, static lint
├── graders.test.ts      # All grader functions incl. discrimination controls
├── probes.test.ts       # Probe loader, corpus vendoring, adversarial suite
└── fixtures/
    ├── agents-wellformed.md          # well-formed AGENTS.md SOP fixture
    ├── agents-undefined-precedence.md  # SOP with contradictory rules, no precedence
    ├── agents-tool-drift.md          # SOP referencing a tool absent from the env
    ├── rule-manifest-valid.yaml      # canonical valid rule manifest
    ├── rule-manifest-drift.yaml      # manifest referencing a rule not in the SOP text
    ├── scenario-compliant.yaml       # compliant scenario (passes all compliance probes)
    ├── scenario-violating-tool.yaml  # intentionally violating — tool-call rule broken
    ├── scenario-violating-leak.yaml  # intentionally violating — exact-string leak
    ├── scenario-violating-format.yaml  # intentionally violating — output format
    ├── scenario-violating-refusal.yaml # intentionally violating — refusal quality (judge)
    └── scenario-adversarial.yaml     # adversarial probe scenario (injection attempt)

vendored/openclaw-sop/
├── injecagent/
│   ├── LICENSE          # MIT — retained verbatim (C-003)
│   ├── CITATION.md      # upstream citation + SHA of vendoring commit
│   └── data/            # curated subset of InjecAgent cases (direct harm + exfiltration)
├── agentdojo/
│   ├── LICENSE          # MIT — retained verbatim
│   ├── CITATION.md
│   └── data/            # curated AgentDojo security cases (scope-escape / exfiltration)
├── gandalf/
│   ├── LICENSE          # MIT — retained verbatim
│   ├── CITATION.md
│   └── data/            # Lakera gandalf_ignore_instructions direct-injection strings
└── deepset/
    ├── LICENSE          # Apache-2.0 — retained verbatim
    ├── CITATION.md
    └── data/            # deepset/prompt-injections direct injection + benign negatives

docs/
└── rubric/
    └── sop-rule-taxonomy.md   # FR-013: versioned normative source for grader citations
                               # (SOP rule-class taxonomy + trigger/grading rubric)
```

**Structure decision**: single-package layout unchanged. The SOP adapter mirrors
the `rfc1` layout (`index/manifest/probes/graders.ts`) — four source files, one
adapter-level concern each. Vendored corpora land under `vendored/` (root-level,
not `src/`) to make explicit they are data, not production code; coverage
exclusion in `sonar-project.properties` for `vendored/`.

## Work-Package Outline

Preview for `/spec-kitty.tasks` — NOT tasks.md. Approximately 5 WPs, sequenced
to respect the binary/judge/adversarial dependency chain.

**Build order note**: layer 2 in the v1-extended milestone, ships after skills
(RQ-10). Reuses skills' BYOM patterns (endpoint config, `ChatClient`,
`EndpointConfig` types from `src/core/behavioral/types.ts`) without
modification. WP01 must complete before WP02-04 (schema gates everything). WP05
ships last because it depends on the rubric doc that the graders cite.

---

**WP01 — SOP parse + rule-manifest schema + static lint**
FRs: FR-001, FR-002, FR-003, FR-009 (source-citation gate in manifest
validator), FR-011, FR-013 (rubric doc scaffold — content finalized in WP05)
- `manifest.ts`: `SOPFile` reader (parse markdown, extract sections);
  `SOPRuleManifest` JSON/YAML schema (per-rule: `ruleId`, `ruleText`,
  `probeIds[]`, `gradingClass: "binary" | "judge"`, `aggregation: "pass-k" |
  "k-of-n"`, `source: { normative, supporting? }`); manifest loader +
  validator (Ajv); undefined-precedence detector; tool-reference drift
  detector (SOP text vs. companion env descriptor).
- `index.ts`: static lint orchestration — parses SOP, loads manifest, runs
  structural checks, returns `SOPLintReport` with `findings[]`.
- Tests: all three static lint acceptance scenarios (SC-006); manifest drift
  edge case; ambiguous-confirmation manifest error (not silent pass).
- Fixture: `agents-wellformed.md`, `agents-undefined-precedence.md`,
  `agents-tool-drift.md`, `rule-manifest-valid.yaml`, `rule-manifest-drift.yaml`.

**WP02 — Binary compliance graders + pass^k aggregation**
FRs: FR-004, FR-007, FR-008
- `graders.ts` (binary functions): `gradeToolCallPresence`,
  `gradeToolOrder`, `gradeConfirmBeforeDestructive`, `gradeExactStringNonLeakage`,
  `gradeOutputFormat` — all carry `measured` + `limit` per NFR-005.
- `gradePassK`: conjunctive aggregator over `RunVerdict[]`; errored run = failed.
- Discrimination controls: each binary grader has a rigged-impossible control
  fixture (rule trivially violated by design) that must return `passed: false`.
- Tests: acceptance scenarios 4, 5, 6 from spec; all discrimination controls;
  errored-run-fails scenario (scenario 12).
- Fixture: `scenario-compliant.yaml`, `scenario-violating-tool.yaml`,
  `scenario-violating-leak.yaml`, `scenario-violating-format.yaml`.

**WP03 — Judge compliance grader + bias mitigations + controls**
FRs: FR-005, FR-008
- `graders.ts` (judge function): `gradeJudgeCompliance` — judge call via
  `ChatClient`, position/order-swap (two judge calls with answer A and answer B
  swapped), rubric-anchoring (system prompt cites muster rubric verbatim),
  k-of-n aggregation for stylistic rules.
- Discrimination control: rigged-impossible case (blatant policy violation) must
  fail; all-refuse guard: a case where the agent refuses everything fails the
  all-refuse check, not the compliance check — the manifest declares which
  governs.
- Tests: acceptance scenario 7 from spec; order-swap produces different orderings;
  rubric anchor appears in judge prompt; all-refuse guard triggers correctly.
- Fixture: `scenario-violating-refusal.yaml` (judge-graded intentional violation).

**WP04 — Adversarial probe vendoring + injection/scope-escape probes**
FRs: FR-006, FR-007, FR-010
- `probes.ts`: `ProbeCorpus` loader (reads `vendored/openclaw-sop/<corpus>/data/`,
  checks LICENSE file present, emits citation); `AdversarialProbe` type; probe
  selector (matches probe to manifest rule by `probeIds`).
- Vendored data: curated subsets of InjecAgent (direct harm + exfiltration),
  AgentDojo (scope-escape), Gandalf (direct injection strings), deepset (injection
  + benign negatives) — all MIT/Apache-2.0, license files retained (C-003, RQ-09).
- Pass^k enforcement: adversarial cases use `aggregatePassK`; a single
  leak/scope-escape across k attempts fails the case (FR-007, SC-003).
- Tests: acceptance scenarios 8, 9, 10, 11 (adversarial suite); corpus loader
  rejects a corpus missing its LICENSE file; BYOM endpoint swap scenario
  (scenario 10 — only endpoint config changes, no code changes).
- Fixture: `scenario-adversarial.yaml`; minimal per-corpus fixture entries
  (no full corpus inlined in unit tests).

**WP05 — Fixtures + rubric/taxonomy docs + manifest runner**
FRs: FR-011, FR-012, FR-013
- `docs/rubric/sop-rule-taxonomy.md`: versioned normative doc page — SOP
  rule-class taxonomy (binary trace-decidable classes: tool-call presence,
  tool-order, confirm-before-destructive, exact-string non-leakage,
  output-format; judge-required classes: refusal quality, tone/persona
  adherence) and trigger/grading rubric. This is the source all WP01–04
  graders cite via manifest `source.normative`.
- `index.ts` manifest runner: loads test manifest (YAML, per FR-011 schema),
  dispatches compliance + adversarial probes via behavioral runner, aggregates
  verdicts per case, emits machine-readable `SOPSuiteReport` in muster's
  standard report format.
- Full fixture set in `tests/adapters/openclaw-sop/fixtures/`: compliant
  scenarios for each binary rule class + judge class, corresponding
  intentionally-violating scenarios (SC-002), adversarial probe scenario.
- Tests: end-to-end manifest runner test (fixtures only, no live endpoint);
  SC-001 / SC-002 / SC-003 / SC-004 coverage.
- Acceptance: `pnpm build && pnpm test` green; static lint fixture suite
  ≤10 s; docs page present and linked from repo README.

---

**WP→FR coverage map**:

| WP | FRs covered |
|---|---|
| WP01 | FR-001, FR-002, FR-003, FR-009 (citation gate), FR-011 (schema) |
| WP02 | FR-004, FR-007 (pass^k), FR-008 (binary controls) |
| WP03 | FR-005, FR-008 (judge control + all-refuse guard) |
| WP04 | FR-006, FR-007 (adversarial pass^k), FR-010 |
| WP05 | FR-011 (runner), FR-012, FR-013 |

All 13 FRs covered across the 5 WPs.

## Complexity Tracking

| Aspect | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Vendored corpora under `vendored/` (data, not deps) | Adversarial probe sourcing requires curated corpus data with retained LICENSE files (C-003, FR-010, RQ-09) | Downloading at test time violates NFR-001 (offline static path) and charter (no runtime network in tests); npm dependency on a corpus package doesn't exist |
| New grader module `src/adapters/openclaw-sop/graders.ts` alongside core | Tool-call/trace inspection requires SOP-specific grading functions (FR-004); C-001 forbids adding SOP knowledge to `src/core/behavioral/graders.ts` | Extending core graders would cross C-001; the adapter boundary is load-bearing |
| Muster-authored rule manifest (not auto-parsed prose) | OpenClaw AGENTS.md is prose — there is no machine-parseable schema (RQ-04); muster must own the "what is testable" assertion per RQ-08's normative-source rule | Attempting NLP prose extraction without a citable schema would violate "every check cites a source"; the manifest IS the citable artifact |
| Judge grader in SOP adapter (no judge in v1 core) | FR-005 requires judge-graded refusal quality; RQ-08 confirms judge is required for fuzzy properties; RQ-08 also mandates bias mitigations | Binary-only grading would miss the refusal quality class and leave an uncovered taxonomy cell (charter: every binary rule class has a passing + violating scenario) |
