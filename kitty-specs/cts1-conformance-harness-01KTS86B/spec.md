# Feature Specification: Soul.md CTS-1 Conformance Harness

**Mission**: `cts1-conformance-harness-01KTS86B` (mission_id `01KTS86BAC5H36TJX529ZKVT1J`)
**Created**: 2026-06-10
**Status**: Draft
**Mission Type**: software-dev
**Input**: Build the missing reference implementation of CTS-1 from Soul.md RFC-1 (rokoss21/soul.md, spec version 1.0.0-rc1): a conformance harness that (1) statically validates SOUL.md files end-to-end and (2) behaviorally validates a bring-your-own model against a soul's declared axes on a thin, objectively-gradable slice.

---

## Overview

Soul.md RFC-1 defines a portable persona format for AI agents. Its roadmap lists a "Reference implementation" and a "CTS-1 fixture repository" as unbuilt. This mission builds both, scoped to ~2 days:

1. **Static conformance** (complete spine): parse a SOUL.md document, validate it against the RFC-1 schema and conformance rules, deterministically resolve composition (extends / mixins / profiles / merge policy / state overlays), and report violations in the spec's machine-readable report format. This tests the **file**.
2. **Behavioral conformance** (thin vertical slice): given a soul and a user-supplied model endpoint, run multi-turn test conversations and grade the model's transcripts against three objectively-measurable axes declared by the soul. This tests the **model**.

The fixture set produced here doubles as a candidate upstream contribution to the unbuilt CTS-1 fixture repository.

The downstream consumer is a voice frontdesk agent; voice-shaped acceptance criteria (short spoken-length responses, brief refusals, warm-but-firm under pressure, no speculation on prices/availability) are baked into the default grading thresholds and the shipped example soul.

## User Scenarios & Testing

### Primary User Stories

1. **Soul author (static)**: As an author of a SOUL.md persona file, I run the harness against my file and receive a pass/fail conformance report that pinpoints each violation by path and message, so I can fix my file without reading the 2,700-line spec.
2. **Agent operator (behavioral)**: As an operator deploying a voice frontdesk agent, I point the harness at my soul file and my model endpoint (local or hosted) and learn whether the model actually exhibits the soul's declared verbosity, refusal brevity, and mood-shift behavior before I put it in front of customers.
3. **Spec maintainer (fixtures)**: As a maintainer of the Soul.md spec, I can take the harness's fixture set (valid and intentionally-broken souls plus a test manifest) as the seed of the official CTS-1 fixture repository.

### Acceptance Scenarios

#### Static conformance

1. **Given** the spec's minimal valid soul (Appendix A), **When** the harness checks it in strict mode, **Then** the report says `ok: true` with zero errors.
2. **Given** a soul with a missing mandatory key (e.g. no `voice`), **When** checked in strict mode, **Then** the report says `ok: false` with an error whose path names the missing key.
3. **Given** a soul using a forbidden YAML feature (anchor, alias, merge key, or custom tag), **When** checked in either mode, **Then** the document is refused and the forbidden feature is never semantically expanded.
4. **Given** a soul with an unknown top-level key outside the RFC-1 keyspace, **When** checked in strict mode **Then** it is rejected; **When** checked in permissive mode **Then** it is accepted with a warning.
5. **Given** a soul composed via `extends` and `mixins`, **When** the harness resolves it, **Then** the effective configuration matches the expected fixture byte-for-byte in canonical JSON form, honoring resolution order (extends → mixins → local → profile → state) and Standard Merge rules (scalars replace, maps deep-merge, lists replace; `null` is a value, not a deletion; `profiles`/`profile_overrides` are root-owned and stripped from composition).
6. **Given** a composition graph with a cycle, **When** checked in strict mode, **Then** loading fails with a cycle-detection error.
7. **Given** a soul whose `state.base` is omitted, **When** resolved, **Then** the active state falls back to the lexicographically smallest state key by raw UTF-8 bytes.
8. **Given** a manifest of test cases (id, root file, mode, expectations), **When** the suite runs, **Then** every case's actual outcome (ok/errors/effective config) is compared against its declared expectation and a summary of passes/failures is produced.

#### Behavioral conformance

9. **Given** the voice-frontdesk soul (low verbosity) and a conforming model endpoint, **When** a behavioral test case sends its turn list, **Then** each graded response's word count is within the threshold derived from the soul's verbosity value, and the case passes on k-of-n majority.
10. **Given** a soul declaring brief refusals and a test conversation designed to elicit a refusal, **When** graded, **Then** the response is within the refusal word cap and satisfies the case's declared content assertions (e.g. contains no price or availability figures the soul forbids speculating about).
11. **Given** a soul with a `user.rude` trigger shifting to a `cold_strict` state, **When** the test case injects the `user.rude` fact mid-conversation, **Then** the graded output after the shift observably differs per the shifted state's thresholds (e.g. tighter word cap), demonstrating the state machine works end-to-end.
12. **Given** the same soul and test cases, **When** run against a second, differently-hosted endpoint with only endpoint configuration changed, **Then** the harness runs identically with no code changes.
13. **Given** a deliberately non-conforming setup (e.g. a system prompt instructing maximal verbosity against a low-verbosity soul), **When** graded, **Then** the harness fails the case — proving the grader can discriminate, not just rubber-stamp.

### Edge Cases

- Front matter absent, unterminated, or not the first content in the file.
- Empty document or empty `state.states` (state must then be ignored entirely).
- Overlay sets a key to `null` (key remains, value is null — not deleted).
- Overlay type mismatch (map replaced by scalar, list replaced by map): replacement, not error.
- Two state keys identical after Unicode normalization but different in raw bytes (NFC vs NFD): treated as distinct; fallback ordering uses raw UTF-8 bytes.
- `profile_overrides` references a profile not in `profiles`.
- Trigger `shift_to` references an undefined state; trigger with `duration: timed` but no `ttl_seconds`.
- `@id` rule reference with no matching `rule_catalog` entry; literal rule text differing only by trailing whitespace (must not match).
- Mixin document carrying `profiles`/`profile_overrides` (must be stripped during composition).
- Behavioral: model returns an empty response; endpoint unreachable or times out mid-suite (case errors and is reported as such, remaining cases still run); model response in unexpected format.
- k-of-n with split verdicts (2-1) and with errored runs (an errored run counts as a failed run for the majority).

## Requirements

### Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-001 | The harness parses a SOUL.md document by extracting only the first YAML front-matter block as configuration and treating the remainder as non-configuration body; in strict mode, documents with missing or malformed front matter are rejected. | Proposed |
| FR-002 | The harness detects forbidden YAML features (anchors, aliases, merge keys, custom tags) and refuses the document without ever applying those features' semantics, in both strict and permissive modes. | Proposed |
| FR-003 | The harness validates documents (both full souls and mixins) against the RFC-1 Appendix E JSON Schema. | Proposed |
| FR-004 | Beyond schema validation, the harness enforces RFC-1 keyspace rules: unknown top-level keys outside the keyspace are rejected in strict mode and ignored-with-warning in permissive mode, while known optional keys are always accepted. | Proposed |
| FR-005 | The harness enforces scalar typing rules: percent fields within 0–100, float01 fields within 0.0–1.0, enum membership, and syntactic BCP-47 validation of locale fields. | Proposed |
| FR-006 | The harness resolves composition in the normative order — extends (left-to-right), mixins (left-to-right), local document, selected profile overlay, active state overlay — using Standard Merge semantics: scalars replace, maps deep-merge, lists replace entirely, type mismatches replace, `null` is a value not a deletion. | Proposed |
| FR-007 | During composition resolution, `profiles` and `profile_overrides` are stripped from all bases and mixins; only the root document's values are used for profile selection. | Proposed |
| FR-008 | The harness detects cycles across the extends/mixins reference graph and fails loading in strict mode. | Proposed |
| FR-009 | The harness enforces profile rules: `profiles` must include `default`, and `profile_overrides` keys must be a subset of `profiles`. | Proposed |
| FR-010 | The harness enforces state rules: `state.base` (when present) must reference a defined state; when absent, the fallback state is the lexicographically smallest state key by raw UTF-8 bytes; triggers must reference defined states; `duration: timed` requires `ttl_seconds`; empty or missing `state.states` means state is ignored. | Proposed |
| FR-011 | The harness resolves evaluation rule references: `@id` references resolve against `rule_catalog` entries, and literal rule text matches criteria lists by exact Unicode code-point equality. | Proposed |
| FR-012 | The harness emits a machine-readable conformance report containing spec version, soul id, mode, profile, state, overall ok flag, and lists of errors and warnings where every entry carries a path and a message (per the spec's recommended report format). | Proposed |
| FR-013 | The harness can output the resolved effective configuration in canonical JSON (RFC 8785) form suitable for byte-for-byte comparison, as CTS-1 requires of conformance runners. | Proposed |
| FR-014 | The harness runs fixture suites driven by a CTS-1 manifest: each case declares id, root file, optional profile and state, mode, expected ok flag, and optionally an expected effective configuration and/or expected errors; the runner reports per-case and aggregate results. | Proposed |
| FR-015 | The deliverable includes a fixture set covering all six CTS-1 categories (minimal, merge, composition, profiles, state, evaluation), each with at least one valid and one intentionally-broken case, plus a voice-frontdesk example soul. | Proposed |
| FR-016 | The behavioral checker accepts a multi-turn turn list as input and produces the full conversation transcript as output; single-turn cases are simply turn lists of length one. | Proposed |
| FR-017 | The behavioral checker connects to any model endpoint speaking the OpenAI-compatible API, configured by base URL, credential, and model name supplied at run time; no provider is hardcoded and no credential is stored in the deliverable. | Proposed |
| FR-018 | The verbosity axis is graded by word count: each graded response must fall within thresholds derived from the soul's declared verbosity value via a documented default mapping owned by the RFC-1 adapter, overridable per test case. | Proposed |
| FR-019 | The refusal axis is graded by word count against a refusal cap derived from the soul's brief-refusal declaration (same default-mapping-with-override mechanism), combined with the case's declared content assertions. | Proposed |
| FR-020 | Behavioral test cases may declare deterministic content assertions on responses (required or forbidden text patterns), enabling rule-based checks such as "must not state prices or availability figures". | Proposed |
| FR-021 | The state-shift axis is graded by injecting declared runtime facts (e.g. `user.rude: true`) at a declared turn, after which grading applies the shifted state's thresholds; the case passes only if the post-shift output observably conforms to the shifted state. | Proposed |
| FR-022 | Behavioral grading uses k-of-n majority: each case runs n times (default 3) and passes if at least ⌈n/2⌉+ runs pass (default ≥2 of 3); an errored run counts as a failed run. | Proposed |
| FR-023 | The behavioral report records, per case: every transcript, every run's verdict with measured values (word counts, assertion outcomes, active state), the model identifier, the endpoint, and the temperature used. | Proposed |
| FR-024 | Where the harness supports both strict and permissive modes, mode is selectable per run and per manifest case. | Proposed |

### Non-Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-001 | Determinism: given identical inputs, static resolution produces byte-identical canonical JSON output across 10 consecutive runs (0 deviations). | Proposed |
| NFR-002 | Static speed: the full static fixture suite completes in under 10 seconds; a single soul check completes in under 5 seconds. | Proposed |
| NFR-003 | Offline capability: all static checks run with zero network access. | Proposed |
| NFR-004 | Behavioral wall-clock: the thin-slice behavioral suite (3 axes, default runs-per-case) completes in under 15 minutes against a locally-hosted ~7B model. | Proposed |
| NFR-005 | Diagnosability: 100% of reported errors and warnings carry both a non-empty path and a non-empty human-readable message; 100% of behavioral failures include the measured value and the threshold it violated. | Proposed |
| NFR-006 | Fixture portability: the fixture set and manifest are consumable without any harness-specific configuration files (manifest + fixture tree are self-describing), so they can be contributed upstream as-is. | Proposed |

### Constraints

| ID | Constraint | Status |
|----|-----------|--------|
| C-001 | Target specification is Soul.md RFC-1 (rokoss21/soul.md, 1.0.0-rc1) — not SoulSpec 0.5 / soulgen.dev. | Locked |
| C-002 | This is a conformance harness, not a soul generator. | Locked |
| C-003 | Implementation language is TypeScript (user decision after recommendation). | Locked |
| C-004 | The core engine is spec-agnostic and interacts with spec semantics only through an adapter interface; RFC-1 is the first adapter. A second spec must be addable without core changes (interface obligation only — no second adapter is built in this pass). | Locked |
| C-005 | The behavioral checker interface is turn-list in, transcript out, multi-turn capable from day one; no single-turn architectural assumptions. | Locked |
| C-006 | Bring-your-own-model via OpenAI-compatible endpoints only; no hardcoded provider, no baked-in API keys. | Locked |
| C-007 | Behavioral scope this pass is exactly three objectively-gradable axes: verbosity (word count), brief refusals (word cap + content assertions), and the rude→cold_strict state shift. No LLM-as-judge, no subjective axes. | Locked |
| C-008 | Acceptance targets: local GPU-served Ollama model `qwen2.5:7b-instruct` and at least one hosted OpenAI-compatible endpoint, explicitly including NVIDIA NIM. | Locked |
| C-009 | Sampling policy: temperature stays at the model/provider default unless overridden, is configurable per run, and is always recorded in the report (required for k-of-n to be meaningful). | Locked |
| C-010 | Total scope is a ~2-day build: the static spine must be complete end-to-end; behavioral is a thin vertical slice. | Locked |

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | Every one of the nine CTS-1 minimum test categories (Soul-YAML enforcement, mandatory core, type/range, Standard Merge, composition order, cycle detection, profiles, state semantics, evaluation rule references) is exercised by at least one fixture case, and the full static suite passes. |
| SC-002 | 100% of intentionally-broken fixtures are rejected with at least one error naming the offending path; 100% of valid fixtures pass. |
| SC-003 | The spec's own minimal soul (Appendix A) and extended composition examples (Appendix D) check out as conforming without modification. |
| SC-004 | Static resolution output is byte-for-byte reproducible across 10 consecutive runs. |
| SC-005 | The behavioral suite produces verdicts on all three axes against two independently-hosted endpoints (one local, one hosted) with only endpoint configuration changed between runs. |
| SC-006 | The behavioral grader demonstrates discrimination: a deliberately non-conforming run is failed, and a conforming run passes, on the same soul and test cases. |
| SC-007 | A soul author can check a single file and read the verdict in under 5 seconds, and every failure tells them where (path) and what (message) without consulting the spec text. |
| SC-008 | The fixture set + manifest stands alone as a coherent, self-describing package suitable for proposing upstream as the seed of the CTS-1 fixture repository. |

## Key Entities

- **Soul document**: a SOUL.md file (YAML front matter + Markdown body); kind `soul` or `mixin`.
- **Adapter**: the pluggable component that owns one spec's semantics (schema, keyspace, merge/resolution rules, threshold mappings); RFC-1 is the first.
- **Effective configuration**: the fully-resolved configuration after composition, profile, and state overlays; canonical JSON is its comparison form.
- **Conformance report**: machine-readable result of a static check (spec, soul id, mode, profile, state, ok, errors, warnings).
- **Manifest / test case**: CTS-1 suite definition; a case binds a root soul, mode, and expectations (ok flag, expected effective config, expected errors).
- **Fixture**: a soul file (valid or intentionally broken) plus any expected-output artifacts, organized in the six CTS-1 categories.
- **Turn list**: ordered conversation input to the behavioral checker (user turns, plus declared fact injections at specific turns).
- **Transcript**: the full recorded conversation produced by a behavioral run, including model responses and metadata (model, endpoint, temperature).
- **Behavioral test case**: a turn list plus grading declarations (axis, thresholds or overrides, content assertions, expected state) and run policy (n, k).
- **Threshold mapping**: the adapter-owned, documented function from declared soul values (e.g. verbosity 0–100) to measurable limits (word counts), overridable per case.
- **Endpoint configuration**: base URL, credential reference, and model name identifying one OpenAI-compatible model service.

## Assumptions

- The fixture set mirrors all six CTS-1 categories with a small number of cases each (valid + broken), sized for a 2-day build rather than exhaustive coverage; the nine §25.2 categories define the coverage floor.
- A voice-frontdesk example soul ships as a fixture (warm-but-firm, low verbosity, brief refusals, no price/availability speculation, with a `cold_strict` state and a `user.rude` trigger) and is the substrate for the behavioral test cases.
- Default voice-shaped thresholds (the adapter's verbosity→word-count mapping and refusal cap) are documented constants chosen for spoken-length responses; exact values are fixed during planning and are per-case overridable, so they are not load-bearing here.
- NVIDIA driver installation (to GPU-serve the local model) is an environment prerequisite, not in-scope work; acceptance criteria reference endpoints, not drivers.
- Reference resolution for `extends`/`mixins` supports relative file paths (the only scheme the fixtures need); URI schemes are documented as unsupported in this pass, which RFC-1 permits as long as supported schemes are documented.
- Strict mode is the default for fixture runs; permissive-mode behavior is exercised by dedicated cases.
- "Word count" means whitespace-delimited tokens after trimming; the precise tokenization rule is documented once in the adapter and used uniformly across axes.

## Out of Scope

- Subjective behavioral axes (nuanced warmth, humor) and any LLM-as-judge grading.
- A second spec adapter (e.g. SoulSpec 0.5) — the adapter interface must permit it; nothing more.
- Lockfile / integrity-hash mechanisms for remote references (RFC-1 §7.2.1, non-normative).
- Field-deletion extension (EXT-MERGE-DEL-1) and any other `extensions.*` semantics beyond accepting their presence.
- Remote URI reference resolution (`https://`, `file://`) for extends/mixins.
- Trigger predicate *evaluation engine* beyond what the state-shift axis needs (fact injection per declared test moments); a full RPP-1 predicate parser is not required this pass.
- Runtime overrides (resolution step 6) beyond what tests require; profile/state selection via run parameters suffices.
- Voice/audio I/O — the voice frontdesk shapes the acceptance thresholds, not the modality; all behavioral testing is text.

## Dependencies

- The Soul.md RFC-1 specification text (vendored locally at `.kittify/reference/soul-spec.md`, version 1.0.0-rc1, fetched 2026-06-10) — source of truth for all normative behavior.
- Availability of one local OpenAI-compatible model server (Ollama, post driver install) and one hosted endpoint with a user-supplied key (e.g. NVIDIA NIM) for behavioral acceptance runs. Static scope has no external dependencies.
