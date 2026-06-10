---
work_package_id: WP03
title: RFC-1 Validation Layer
dependencies:
- WP01
requirement_refs:
- FR-003
- FR-004
- FR-005
- FR-009
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T008
- T009
- T010
- T011
- T012
agent: "claude"
shell_pid: "921257"
history:
- timestamp: '2026-06-10T20:21:16Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/adapters/rfc1/keyspace.ts
execution_mode: code_change
owned_files:
- src/adapters/rfc1/schema.json
- src/adapters/rfc1/keyspace.ts
- tests/unit/keyspace.test.ts
tags: []
---

# WP03 — RFC-1 Validation Layer

## Objective

Two-layer validation (research R4). Layer 1: the vendored Appendix E JSON Schema through Ajv (Draft 2020-12). Layer 2: the §25 conformance rules the deliberately-permissive schema cannot express — keyspace enforcement by mode, scalar typing on optional domains, BCP-47, and profile rules. Output: `Violation[]` with paths, messages, and section citations.

## Context

- Normative: `.kittify/reference/soul-spec.md` §25 (conformance + keyspace definition), §4.3/4.3.1 (scalar typing, BCP-47), §5.1 (mandatory keys), §9 (profiles), Appendix E (schema).
- Research: R3 (Ajv 2020 build, strict:false), R4 (layer split), R5 (Intl.getCanonicalLocales).
- FR-003, FR-004, FR-005, FR-009.
- Operates on parsed front-matter data (`unknown`) — pure, no I/O.

## Implementation command

```bash
spec-kitty agent action implement WP03 --agent <name>
```

## Subtasks

### T008 — Vendor schema + Ajv wiring (`src/adapters/rfc1/schema.json`, part of `keyspace.ts`)

**Steps**:
1. Copy the Appendix E schema **verbatim** from `.kittify/reference/soul-spec.md` lines 2024–2159 into `schema.json`. Add no fields; provenance goes in a sibling comment in keyspace.ts (JSON has no comments — do not annotate the schema itself).
2. In `keyspace.ts`: `import Ajv2020 from "ajv/dist/2020.js"`; compile once at module level with `{ strict: false, allErrors: true }`.
3. Export `validateSchema(data: unknown): Violation[]` mapping Ajv errors → Violations: `path` from `instancePath` (convert `/a/b/0` → `a.b[0]`; empty instancePath → the offending key from `params`), `message` from Ajv message, `section: "Appendix E"`.
4. `oneOf` noise: when data has `kind: "mixin"`, report only the mixin-branch errors; otherwise only the soul-branch errors (filter on `schemaPath` prefix) — otherwise every failure produces a double error set.

**Validation**:
- [ ] Appendix A minimal soul (transcribe from spec §Appendix A) → zero violations
- [ ] missing `voice` → one violation, path `voice`, mentioning required
- [ ] `kind: mixin` with only `soul_spec`+`id`+`kind` → zero violations

### T009 — §25 keyspace rules (`keyspace.ts`)

**Steps**:
1. Define the normative keyspace constants (§25):
   - `MANDATORY = [soul_spec, id, name, locale, composition, profiles, values, voice, interaction, safety, extensions]` (note: spec §25 mandatory list; `profile_overrides` is required by the schema for kind:soul — keep schema authoritative for presence, keyspace authoritative for unknown-key classification)
   - `KNOWN_OPTIONAL = [kind, profile_overrides, relationship, examples, identity, cognition, planning, verification, uncertainty, decisions, response, social, memory, actions, presentation, state, evaluation]` plus §6.4 metadata fields `[version, author, description, tags, license, created, updated]`.
2. Export `validateKeyspace(data, mode): Violation[]`:
   - top-level key not in MANDATORY ∪ KNOWN_OPTIONAL and not `extensions` content → strict: error `{path: key, message: "unknown top-level key outside RFC-1 keyspace", section: "§25"}`; permissive: same as **warning** severity.
   - KNOWN_OPTIONAL keys are always accepted even though muster doesn't implement them all (§25 critical distinction — this is what stops a strict runtime from rejecting valid RFC-1 documents).
3. Mixin documents (`kind: "mixin"`): keyspace check still applies to whatever keys are present; mandatory-core absence is NOT an error (§25 mixin conformance).

**Validation**:
- [ ] `favorite_color: blue` at top level → error strict, warning permissive
- [ ] `memory: {...}` (unimplemented known-optional) → accepted both modes
- [ ] mixin without `name`/`locale` → no mandatory-key errors

### T010 — Scalar typing + BCP-47 (`keyspace.ts`)

**Steps**:
1. Percent fields (integer 0..100, §4.3): walk known percent locations — `voice.formality/warmth/verbosity/jargon/examples_budget`, `interaction.ask_threshold`, `evaluation.scoring.pass_threshold`. Non-integer or out-of-range → error with exact path, `section: "§4.3"`. (Schema already bounds the voice ones when present — keep these checks anyway so optional domains like `evaluation` are covered; duplicate violations for the same path must be deduplicated by (path, message).)
2. float01 fields: validate range 0.0–1.0 on any documented float01 locations encountered (none are mandatory in core; implement the helper + apply to `state`/extension-free known spots; keep generic `checkFloat01(path, value)` exported for reuse).
3. Enum membership beyond schema reach: `evaluation.scoring.method ∈ {rule_based, llm_judge, hybrid}` (§21).
4. BCP-47 (`locale`, §4.3.1): `try { Intl.getCanonicalLocales(value) } catch { violation }`, `section: "§4.3.1"`. Strict: error. Permissive: attempt the spec-named normalizations (`_` → `-`) and emit warning if normalization succeeds, error if still invalid.

**Validation**:
- [ ] `voice.verbosity: 101` → error path `voice.verbosity`
- [ ] `locale: en_US` → strict error; permissive warning (normalizes to en-US)
- [ ] `locale: english` → error both modes

### T011 — Profile rules (`keyspace.ts`)

**Steps** (§9, FR-009):
1. `profiles` must include `"default"` → error `{path: "profiles", section: "§9"}`.
2. Every key of `profile_overrides` must be in `profiles` → error per offending key, path `profile_overrides.<key>`.
3. Applies only to `kind: soul` documents.

**Validation**:
- [ ] `profiles: [concise]` → "must include default"
- [ ] `profile_overrides: {ghost: {...}}` with `profiles: [default]` → error at `profile_overrides.ghost`

### T012 — Validation tests (`tests/unit/keyspace.test.ts`)

Cover every bullet above plus:
- [ ] full `validate()` composition: schema then keyspace, violations concatenated and deduplicated.
- [ ] §25.2 category 2 (mandatory core presence) and 3 (type/range) each have an explicitly named test.
- [ ] every violation: non-empty path+message+section.
- Test names cite sections (`"§25 unknown key strict-rejected"`).

## Definition of Done

- Tests green; schema.json byte-faithful to Appendix E (verify by re-extracting from the vendored spec and diffing).
- Pure functions; no I/O, no env access.
- Permissive mode NEVER silently drops a problem — it downgrades to warning (§25).

## Reviewer guidance

- The subtle conformance trap: rejecting known-optional keys a runtime doesn't implement. T009's `memory` test is the canary — make sure it exists and passes.
- Verify Ajv `oneOf` error filtering — unfiltered, every soul error appears twice with misleading mixin-branch noise.

## Risks

- Appendix E `required` includes `profile_overrides` for kind:soul, while §25's mandatory list omits it. Treat the schema as authoritative for presence (it's the spec's own artifact) and document the discrepancy in a code comment citing both sections — fixtures must include `profile_overrides: {}` in valid souls.

## Activity Log

- 2026-06-10T21:30:51Z – claude – shell_pid=921257 – Started implementation via action command
