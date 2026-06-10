---
work_package_id: WP04
title: Composition, State & Evaluation Resolution
dependencies:
- WP01
- WP02
- WP03
requirement_refs:
- FR-006
- FR-007
- FR-008
- FR-010
- FR-011
planning_base_branch: main
merge_target_branch: main
branch_strategy: 'Planning/base branch: main. Completed changes merge into main. Execution worktree allocated per computed lane from lanes.json.'
subtasks:
- T013
- T014
- T015
- T016
- T017
history:
- timestamp: '2026-06-10T20:21:16Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/adapters/rfc1/resolve.ts
execution_mode: code_change
owned_files:
- src/adapters/rfc1/resolve.ts
- src/adapters/rfc1/state.ts
- src/adapters/rfc1/evaluation.ts
- tests/unit/resolve.test.ts
- tests/unit/state.test.ts
- tests/unit/evaluation.test.ts
tags: []
---

# WP04 — Composition, State & Evaluation Resolution

## Objective

The deterministic heart of the static spine: §7.5/Appendix G composition resolution (extends → mixins → local → profile → state) with root-owned-field stripping and cycle detection; §20 state semantics; §21 evaluation rule references; and the RPP-1-subset trigger evaluator the behavioral slice will use.

## Context

- Normative: `.kittify/reference/soul-spec.md` §7 (composition), §8 (merge — engine already exists in `src/core/merge.ts`), §9.4 (root-owned profiles), §20 (state), §21 (evaluation), §4.4 (lexicographic UTF-8 fallback), Appendix G (reference algorithm — follow G.5 structure).
- FR-006, FR-007, FR-008, FR-010, FR-011 + adapter `evaluateTriggers` (R7).
- I/O rule (adapter contract): `resolve` does NO file access itself — every reference loads through the injected `loadRef(ref, fromPath)` callback, which returns an already-parsed `SoulDocument | Violation[]`.

## Implementation command

```bash
spec-kitty agent action implement WP04 --agent <name>
```

## Subtasks

### T013 — Composition resolution (`src/adapters/rfc1/resolve.ts`)

**Steps** (mirror Appendix G.5; cite step numbers in comments only where the code order is non-obvious):
1. Export `resolveComposition(doc, opts, loadRef): Promise<EffectiveConfig | Violation[]>`.
2. Recursive loading with cycle detection: maintain a visiting-set of canonical paths; a reference already in the set → error `{path: "composition", message: "Cycle detected: <chain>", section: "§7.3"}` (strict fails; permissive also fails — a cycle is unresolvable).
3. For each base in `composition.extends` (listed order) then each mixin in `composition.mixins` (listed order):
   - load via `loadRef` (relative paths resolve against the current document's location — caller handles actual fs);
   - recursively resolve that document's own composition first (Appendix G);
   - **strip `profiles` and `profile_overrides`** from the loaded result before merging (§7.5/§9.4 — root-owned);
   - merge left-to-right onto the accumulator with `merge()` and the adapter's Standard Merge strategy.
4. Merge the local document's own data (minus `profile_overrides`, minus `composition` bookkeeping per G) onto the accumulator.
5. Profile overlay: select `opts.profile ?? "default"`; if not in root `profiles` → error (§9). Apply `profile_overrides[profile]` via Standard Merge when present.
6. State overlay: delegate to T014's `selectState` + apply overlay via Standard Merge (§7.5 step 5).
7. Validate the materialized result (call WP03's validate; Appendix G.6) — composition can assemble an invalid effective config; that must surface.

**Validation**:
- [ ] two extends + one mixin: hand-compute expected, assert canonical-JSON equality
- [ ] mixin carrying `profiles` → stripped, root's profiles win
- [ ] A extends B extends A → cycle error naming the chain
- [ ] unknown profile requested → error at `profiles`

### T014 — State semantics (`src/adapters/rfc1/state.ts`)

**Steps** (§20):
1. `selectState(effective, requested, mode): string | null | Violation[]`:
   - no `state` or empty/missing `state.states` → `null` (state ignored entirely, §20.1);
   - `requested` (runtime selection): exists → use; doesn't exist → strict error / permissive warning + fall back (§20.1);
   - else `state.base` if present (must reference an existing state, else error §20.1);
   - else **lexicographically smallest key of `state.states` by raw UTF-8 bytes** (§4.4): compare `Buffer.from(key, "utf8")`, NOT localeCompare, NOT code-point order — byte order. No Unicode normalization (NFC/NFD keys are distinct).
2. `validateStateBlock(effective, mode): Violation[]`:
   - every trigger's `shift_to` must exist in `state.states` (§20.3.7): strict error / permissive warning ("trigger ignored");
   - `duration: timed` without `ttl_seconds` → strict error / permissive warning (§20.3.7);
   - state overlay containing a `state` key → strict error / permissive warning (§20.1.1).
3. `applyStateOverlay(effective, stateName)`: Standard Merge of `state.states[stateName]` onto the effective config.

**Validation**:
- [ ] base omitted, states `{warm: {}, cold: {}}` → `cold` (lexicographic)
- [ ] UTF-8 byte ordering: keys `{"é": {}, "z": {}}` → `z` (0x7A < 0xC3) — the test that catches localeCompare bugs
- [ ] `shift_to: ghost` → strict error path `state.triggers[0].shift_to`

### T015 — Evaluation rule references (`src/adapters/rfc1/evaluation.ts`)

**Steps** (§21.1, FR-011):
1. `resolveRuleRefs(effective, mode): Violation[]` over `evaluation.test_prompts[*].expected_rules`:
   - `@id` form: exact Unicode code-point match against `rule_catalog[*].id`; no catalog or no match → strict error / permissive warning;
   - literal form: exact code-point match (case-sensitive, NO trimming) against `critical_criteria` then `secondary_criteria`; first occurrence wins; no match → strict error / permissive warning.
2. ID references resolve against the catalog FIRST when both catalog and literals exist (§21.1).

**Validation**:
- [ ] `@handle_rudeness` resolving against catalog → ok
- [ ] literal with trailing space vs criterion without → MUST NOT match (spec's explicit brittleness warning)

### T016 — Trigger evaluation, RPP-1 subset (`src/adapters/rfc1/state.ts`)

**Steps** (R7, §20.2/20.3):
1. `evaluateTriggers(effective, facts, mode): string | Violation[] | null` — adapter contract method.
2. Predicate grammar (documented subset): `expr := term ("&&" term)*`, `term := "!"? ident`, `ident := dotted name`. Tokenize on whitespace; anything else (`||`, parens, `==`) → strict: Violation "unsupported predicate (muster implements a documented RPP-1 subset)"; permissive: warning + trigger skipped.
3. Identifier truth: `facts[ident] === true` (string facts: non-empty = true is NOT assumed — only boolean true matches; document this).
4. Triggers evaluated in listed order, **first match wins**, at most one transition per call (§20.3.3, §20.3.6) → return its `shift_to`; no match → `null`.

**Validation**:
- [ ] `user.rude && !user.apologized` with `{user.rude: true}` → matches
- [ ] same with both true → no match; next trigger considered
- [ ] two matching triggers → first one's shift_to returned

### T017 — Tests (`tests/unit/{resolve,state,evaluation}.test.ts`)

Every validation bullet above, plus:
- [ ] "§7.5 resolution order": a key set at every layer (extends, mixin, local, profile, state) — final value comes from state; remove state → profile; etc. (one test per layer peel)
- [ ] "NFR-001 determinism": full resolve of the same fixture twice → identical canonical-JSON bytes
- [ ] loadRef returning Violations (broken referenced file) propagates with the referencing path context

## Definition of Done

- Tests green; zero fs/network imports in the three modules (loadRef only).
- Stripping happens on loaded bases/mixins BEFORE merge, never on the root.
- §25.2 categories 4, 5, 6, 8, 9 each have at least one named test across the three test files.

## Reviewer guidance

- Verify the §4.4 comparator is byte-wise (`Buffer.compare`), not `<` on JS strings (UTF-16 code units differ from UTF-8 bytes for astral/Latin-1-supplement keys). The `é`/`z` test must exist.
- Verify profile overlay uses the ROOT document's `profile_overrides` — a mixin's overrides must be unreachable even if present.
- Check the cycle error includes the chain (debuggability, SC-007).

## Risks

- Appendix G is dense; where G and §7.5 prose disagree in your reading, §7.5 + §9.4 normative constraints win, and the discrepancy gets a code comment citing both.
- Deep-merge recursion on hostile fixtures: cap reference depth (e.g. 32) with a clear error to avoid stack overflow on adversarial cycles that evade path-identity (symlinks are out of scope).
