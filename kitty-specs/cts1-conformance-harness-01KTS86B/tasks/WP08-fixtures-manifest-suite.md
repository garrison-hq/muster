---
work_package_id: WP08
title: Fixtures B + Manifest + Suite Gate
dependencies:
- WP06
- WP07
requirement_refs:
- FR-014
- FR-015
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T027
- T028
- T029
- T030
- T031
agent: "claude"
shell_pid: "1382608"
history:
- timestamp: '2026-06-10T20:21:16Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: cts/manifest.yaml
execution_mode: code_change
owned_files:
- cts/fixtures/profiles/**
- cts/fixtures/state/**
- cts/fixtures/evaluation/**
- cts/manifest.yaml
- tests/cts/suite.test.ts
tags: []
---

# WP08 — Fixtures B + Manifest + Suite Gate

## Objective

Complete the fixture set (profiles / state / evaluation), author the unified `cts/manifest.yaml` covering every fixture from WP07+WP08 with a nine-category §25.2 coverage map, and add the Vitest gate that makes the full CTS suite part of `pnpm test` — the moment SC-001/SC-002 become continuously enforced.

## Context

- Normative: §9 (profiles), §20 (state), §21 (evaluation), §4.4 (lexicographic fallback), §25.2 (the nine categories), Appendix F.
- Contracts: `contracts/cts-manifest.md`. WP07's fixture paths are fixed — reference them verbatim.
- Same authoring conventions as WP07 (body purpose notes, canonical expected.json, `profile_overrides: {}` in valid souls).
- FR-014, FR-015 (completion).

## Implementation command

```bash
spec-kitty agent action implement WP08 --agent <name>
```

## Subtasks

### T027 — `cts/fixtures/profiles/` (§25.2 cat. 7)

**Fixtures**:
1. `overlay/` — soul with `profiles: [default, concise]`, `profile_overrides: {concise: {voice: {verbosity: 15}}}`; manifest selects `profile: concise`; expected.json shows verbosity 15 with all other voice keys intact (overlay deep-merge, §9/§7.5 step 4).
2. `missing_default/` — `profiles: [friendly]` → expect_errors at `profiles` ("must include default").
3. `override_not_subset/` — `profile_overrides: {ghost: {}}` → expect_errors at `profile_overrides.ghost`.

### T028 — `cts/fixtures/state/` (§25.2 cat. 8)

**Fixtures**:
1. `base_explicit/` — `state: {base: warm, states: {warm: {voice: {warmth: 90}}, cold: {voice: {warmth: 10}}}}` → expected.json with warm overlay applied (§20.1 + §7.5 step 5).
2. `base_fallback_lexicographic/` — base omitted, states `{zeta: ..., alpha: ...}` → expected.json proves `alpha` applied (§4.4; name the case so failure messages teach the rule).
3. `bad_base/` — `base: ghost` → expect_errors at `state.base`.
4. `trigger_unknown_state/` — trigger `shift_to: ghost` → strict expect_errors at `state.triggers[0].shift_to` (§20.3.7); add a permissive twin case with `expect_ok: true` (warning, trigger ignored).
5. `timed_no_ttl/` — trigger `duration: timed` without `ttl_seconds` → expect_errors (§20.3.7).

### T029 — `cts/fixtures/evaluation/` (§25.2 cat. 9)

**Fixtures**:
1. `rule_id_ok/` — `rule_catalog: [{id: no_speculation, severity: critical, text: "Never state prices"}]`, test_prompt with `expected_rules: ["@no_speculation"]` → expect_ok true.
2. `rule_id_unresolved/` — `expected_rules: ["@ghost_rule"]` → strict expect_errors at the rule path (§21.1).
3. `literal_whitespace_mismatch/` — criterion `"Be brief"`, expected_rule `"Be brief "` (trailing space) → strict error ("exact code-point equality, no trimming" — the spec's own brittleness warning as a fixture).

### T030 — `cts/manifest.yaml`

**Steps**:
1. One entry per fixture across WP07+WP08 — strict-mode cases for all; permissive twins where behavior differs (forbidden_yaml permissive-still-refuses §4.2; unknown-key permissive-ok; trigger_unknown_state permissive-ok).
2. Header comment block: the §25.2 category → case-id map (all nine categories, each listing its case ids) — this is the upstream contribution's table of contents.
3. Field discipline per `contracts/cts-manifest.md`; `expect_effective_json` for every expect_ok:true case that exercises resolution.
4. Target ≈ 20–24 cases total.

### T031 — Suite gate (`tests/cts/suite.test.ts`)

**Steps**:
1. Vitest test: `loadManifest("cts/manifest.yaml")` (path resolved from repo root via `import.meta.url`, not cwd) → `runCts(rfc1Adapter, cases)` → assert every case passed, printing each failure's `mismatches` verbatim in the assertion message.
2. One `it` per case (use `it.each` over loaded cases) so `pnpm test` output names failing fixtures individually.
3. Determinism guard (NFR-001/SC-004): run the resolution-bearing cases twice; assert byte-identical canonical output across runs.
4. Wall-clock guard (NFR-002): suite test file asserts total runtime < 10 s (soft: `expect(elapsed).toBeLessThan(10_000)`).

## Definition of Done

- `pnpm test` green including the full CTS suite; every §25.2 category appears in the manifest header map with ≥1 valid and ≥1 broken case (cats 1–9; cat 4 has five via WP07 merge/).
- Expected drift found during integration resolved per the vendored spec text, with the arbitration noted in the commit message (WP07 risk note).
- Suite runs offline (NFR-003) — no network imports anywhere under tests/cts/.

## Reviewer guidance

- The manifest header map is the SC-001 audit surface — verify each category's case ids actually exist and exercise what they claim (spot-check cat. 8's lexicographic case).
- Check `it.each` naming gives `cts: <case_id>` granularity — flat "suite passed" assertions would gut SC-007 diagnosability.
- Permissive twins: confirm forbidden-YAML stays REFUSED in permissive (§4.2 — the easy mistake is expecting permissive to load it).

## Risks

- This WP integrates three earlier WPs' understanding of the spec; budget review time for expected.json arbitration. The vendored spec text is the referee — never "fix" a fixture to match the implementation without a section citation justifying it.

## Activity Log

- 2026-06-10T23:02:01Z – claude – shell_pid=1320448 – Started implementation via action command
- 2026-06-10T23:13:38Z – claude – shell_pid=1320448 – Ready for review: 11 new fixtures (profiles/state/evaluation + supplementary keyspace unknown-key), cts/manifest.yaml with 28 cases and nine-category header map, tests/cts/suite.test.ts gate (per-case it.each, determinism + wall-clock guards); build green, 383 tests passing, no WP07 expectation drift
- 2026-06-10T23:14:17Z – claude – shell_pid=1382608 – Started review via action command
