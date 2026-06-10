---
work_package_id: WP07
title: 'Fixtures A: minimal / merge / composition'
dependencies: []
requirement_refs:
- FR-015
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T024
- T025
- T026
agent: "claude"
shell_pid: "1210846"
history:
- timestamp: '2026-06-10T20:21:16Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: cts/fixtures/
execution_mode: code_change
owned_files:
- cts/fixtures/minimal/**
- cts/fixtures/merge/**
- cts/fixtures/composition/**
tags: []
---

# WP07 — Fixtures A: minimal / merge / composition

## Objective

Author the first half of the CTS-1 fixture contribution: soul documents (valid and intentionally broken) plus hand-computed `expected.json` files in canonical-JSON form. Data only — no code. These fixtures double as the upstream contribution seed (SC-008), so self-describing quality matters: every fixture directory gets a one-line `README.md` … no. Keep it minimal: a comment line in each Soul.md body explaining what the fixture exercises (the Markdown body is non-configuration, §3 — safe for documentation).

## Context

- Normative: Appendix A (minimal soul — transcribe from `.kittify/reference/soul-spec.md` §Appendix A), §8 (merge), §7 (composition), Appendix F layout.
- Contract: `contracts/cts-manifest.md` — expectation file conventions: `expected.json` is **already-canonical** bytes (sorted keys, JSON.stringify number forms, no trailing newline). The runner does NOT re-canonicalize it.
- Valid souls MUST include `profile_overrides: {}` (Appendix E requires it — see WP03 risk note).
- FR-015 (partial). Naming: snake_case directories matching manifest case ids.

## Implementation command

```bash
spec-kitty agent action implement WP07 --agent <name>
```

## Subtasks

### T024 — `cts/fixtures/minimal/`

**Fixtures**:
1. `valid/Soul.md` — the Appendix A minimal soul, transcribed faithfully (soul_spec "1.0", id, name, locale en, empty-list composition, profiles [default], profile_overrides {}, values.priorities, full voice block, interaction block, safety block, extensions {}). Body: one paragraph stating it mirrors Appendix A.
2. `valid/expected.json` — hand-compute: the front-matter data after resolution (no composition/profile/state changes for a minimal soul; note `composition` and `profile_overrides` remain in the effective output as materialized — match Appendix G.6 behavior as implemented by WP04; coordinate via the suite gate if drift appears).
3. `missing_mandatory/Soul.md` — Appendix A minus the `voice` block (§25.2 cat. 2).
4. `forbidden_yaml/Soul.md` — valid content plus `aliases: &x [1]` / `reuse: *x` (§25.2 cat. 1).
5. `bad_types/Soul.md` — `voice.verbosity: 142` and `locale: en_US` (§25.2 cat. 3 — two errors expected).

**Validation**: each broken fixture breaks exactly the rule it names — no incidental second violations (keeps expect_errors precise).

### T025 — `cts/fixtures/merge/`

**Fixtures** (each: `base.md` + root `Soul.md` extending it + `expected.json`; §25.2 cat. 4):
1. `scalar_replace/` — base `voice.formality: 80`, root `voice.formality: 20` → 20.
2. `map_deep/` — base voice has formality+warmth; root overrides warmth only → both present, warmth from root ("§8.1 maps deep-merge").
3. `list_replace/` — base `values.priorities: [a, b, c]`, root `[x]` → exactly `[x]` ("§8.2 lists replace, never union").
4. `null_value/` — root sets `voice.preferred_phrases: null` over base list → key present, value null ("§8.3").
5. `type_mismatch/` — base `relationship: {tone: warm}`, root `relationship: "minimal"` → scalar wins ("§8.1 type mismatch replaces").

**Validation**: expected.json files written by applying §8.1 by hand — double-check list_replace contains NO base elements.

### T026 — `cts/fixtures/composition/`

**Fixtures** (§25.2 cat. 5–6):
1. `order/` — `base_a.md`, `base_b.md` (kind: soul bases), `mixin_m.md` (kind: mixin), root extends [a, b] + mixins [m], same key set at conflicting values → expected.json proves left-to-right + mixins-after-extends ordering (§7.5 steps 1–2).
2. `strip_root_owned/` — mixin file declares `profiles: [evil]` and `profile_overrides: {evil: {...}}` → expected.json shows root's profiles only (§9.4).
3. `cycle/` — `Soul.md` extends `loop.md`; `loop.md` extends `Soul.md` → expect_errors `{path: "composition", message: "Cycle detected"}` (§7.3).
4. `local_wins/` — extends base; local document overrides → §7.5 step 3 (local over composed base).

**Validation**: chains are ≤2 levels deep — hand-computability is the point (tasks.md risk 1).

## Definition of Done

- All files in place under exactly the three owned directories; every Soul.md body carries its one-paragraph purpose note.
- `expected.json` files: keys sorted, no trailing newline, no non-canonical number forms (write them by mentally applying canonicalJson — or by sorting keys manually; verify with `python3 -c "import json,sys; d=json.load(open(f)); print(json.dumps(d, sort_keys=True, separators=(',',':')))"` equality check).
- No manifest entries here — WP08 owns `cts/manifest.yaml` and will reference these paths verbatim (directory/file names above are the contract; do not rename).

## Reviewer guidance

- Spot-check two expected.json files against the spec by hand — fixture drift is silent until WP08's gate.
- Confirm broken fixtures are minimally broken (one rule each).
- Confirm the cycle fixture's two files actually reference each other relatively (`./loop.md`, `./Soul.md`).

## Risks

- The exact effective-output shape for materialized fields (`composition`, `extensions` defaults) depends on WP04's Appendix G reading. If WP08's suite shows systematic drift, fix EITHER fixtures or resolver per the spec text — the vendored spec §7.5/G.6 arbitrates, never convenience.

## Activity Log

- 2026-06-10T22:37:29Z – claude – shell_pid=1210846 – Started implementation via action command
- 2026-06-10T22:50:14Z – claude – shell_pid=1210846 – Ready for review: 13 fixture soul documents + 9 canonical expected.json files across minimal/, merge/, composition/; all verified byte-for-byte against the live pipeline; build and 346 tests green
