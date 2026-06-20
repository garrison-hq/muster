---
work_package_id: WP02
title: A2A behavioral manifest schema + loader (B3)
dependencies: []
requirement_refs:
- FR-004
- FR-005
- FR-012
planning_base_branch: kitty/mission-a2a-behavioral-conformance
merge_target_branch: kitty/mission-a2a-behavioral-conformance
branch_strategy: Planning artifacts for this feature were generated on kitty/mission-a2a-behavioral-conformance. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into kitty/mission-a2a-behavioral-conformance unless the human explicitly redirects the landing branch.
subtasks:
- T007
- T008
- T009
- T010
- T011
- T012
agent: "claude:opus:reviewer:reviewer"
shell_pid: "770430"
history:
- Created by /spec-kitty.tasks for mission a2a-behavioral-conformance-01KVJDWE
authoritative_surface: src/adapters/a2a/behavioral-manifest.ts
execution_mode: code_change
owned_files:
- src/adapters/a2a/behavioral-manifest.ts
- src/adapters/a2a/behavioral-types.ts
- tests/a2a/behavioral-manifest.test.ts
- tests/fixtures/a2a/behavioral-manifests/**
tags: []
---

# WP02 — A2A behavioral manifest schema + loader (B3)

## Objective

Add a strict loader for the **A2A behavioral manifest** in two new files,
`src/adapters/a2a/behavioral-types.ts` (types) and `src/adapters/a2a/behavioral-manifest.ts`
(loader), **reusing the core behavioral validators** for the parts that are identical to the
chat manifest, and implementing the **decision-C** threshold source (optional `soul` reference
and/or explicit thresholds, with explicit overriding persona-derived).

This WP is independent of WP01 (runs in parallel). WP03 imports the types and the
threshold-resolution helper from here.

## Context (read before coding)

- Contract (authoritative): `kitty-specs/a2a-behavioral-conformance-01KVJDWE/contracts/a2a-behavioral-manifest.md`.
- Research: `.../research.md` D4 (reuse core validators), Q2/decision C, Q5 (reuse by import,
  loader stays adapter-side).
- Reuse from core (`src/core/behavioral/manifest.ts`) **by import** — do NOT edit core:
  the `Turn`, `AxisSpec` (verbosity/refusal/state_shift union), `ContentAssertion`,
  `CaseOverrides` shapes and their field-level validators; the defaulting rules
  (`runs` def 3, `pass_threshold` def 2 with `pass_threshold ≤ runs`).
- Reuse `EffectiveConfig` + the verbosity threshold mapping (`maxWords = 10 + voice.verbosity`)
  from `src/core/adapter.ts` / the rfc1 resolve path, the same way the chat manifest resolves a
  `soul` to an `EffectiveConfig`. Find how the chat behavioral manifest resolves `soul` →
  effective and reuse that resolver.
- Boundary: C-004 — import core; never let core import this. Do **not** modify the existing
  `src/adapters/a2a/types.ts` static loader (owned by the static path / WP04 routing).
- Key-invariant: a manifest may carry env-var **names** only; a literal key/token value is a
  load error (FR-005/NFR-002).

## Subtasks

### T007 — Behavioral types (`behavioral-types.ts`)

**Purpose:** Type the A2A behavioral manifest distinctly from the static A2A manifest.

**Steps:** define and export:
- `A2aBehavioralManifest { adapter: "a2a"; kind: "behavioral"; endpoint: A2aEndpointRef;
  defaults?: BehavioralDefaultsRef; cases: A2aBehavioralCase[] }`
- `A2aEndpointRef { env: string; token_env: string }` (env-var *names*)
- `A2aBehavioralCase { id: string; soul?: string; thresholds?: A2aThresholds;
  turns: Turn[]; axes: AxisSpec[]; overrides?: CaseOverrides; runs?: number;
  pass_threshold?: number }` — `Turn`/`AxisSpec`/`CaseOverrides` imported from core.
- `A2aThresholds { default_max_words?: number; states?: Record<string, number> }`
- a `ResolvedThresholds` shape the runner (WP03) consumes (e.g. a `ThresholdMapping`-compatible
  object: default word cap + per-state caps + refusal cap).

**Files:** `src/adapters/a2a/behavioral-types.ts`.
**Validation:** `pnpm typecheck` clean; types imported by the loader.

### T008 — Top-level + endpoint strict validation

**Purpose:** Validate the manifest envelope.

**Steps:**
1. `loadBehavioralManifest(path): A2aBehavioralManifest | Violation[]` reads YAML.
2. Allowed top-level fields exactly `{adapter, kind, endpoint, defaults, cases}`; `adapter` must
   be `"a2a"`, `kind` must be `"behavioral"`. Unknown fields → violation naming the field.
3. `endpoint` fields exactly `{env, token_env}`; both non-empty strings; default `env` to
   `MUSTER_A2A_ENDPOINT` and `token_env` to `MUSTER_A2A_TOKEN` when omitted.
4. Reject any endpoint value that is not a plausible env-var *name* (e.g. contains `://`, spaces,
   or looks like a secret) — the value must be a name, not a literal URL/token (NFR-002).

**Files:** `src/adapters/a2a/behavioral-manifest.ts`.
**Validation:** T012 error cases.

### T009 — Case validation reusing core validators

**Purpose:** Validate each case's reusable pieces with the existing core validators.

**Steps:**
1. Allowed case fields exactly `{id, soul, thresholds, turns, axes, overrides, runs,
   pass_threshold}`; unknown → violation.
2. `id` non-empty + unique across cases.
3. Validate `turns` via the core `Turn` validator (role:"user", content non-empty, optional
   `facts`); `axes` via the core `AxisSpec` validator (the verbosity/refusal/state_shift union +
   `ContentAssertion`); `overrides` via the core `CaseOverrides` validator.
4. Apply the core defaulting for `runs`/`pass_threshold` (def 3/2; `pass_threshold ≤ runs`).
5. Cross-check axis turn references: `refusal.turn` and `state_shift.trigger_turn` must be in
   range of `turns`.

**Files:** `src/adapters/a2a/behavioral-manifest.ts`.
**Validation:** T012 valid + range/dup error cases.

### T010 — Decision-C threshold resolution

**Purpose:** Produce the `ResolvedThresholds` each case hands to the runner, honoring the
precedence rule.

**Steps:** implement `resolveThresholds(case): ResolvedThresholds | Violation[]` with precedence:
1. If `thresholds` present → use it (explicit wins): `default_max_words` + per-`states` caps.
2. Else if `soul` present → resolve its `EffectiveConfig` (reuse the chat resolver) and derive
   `maxWords = 10 + voice.verbosity` for the base state and each declared state overlay.
3. Apply `overrides.max_words` / `overrides.refusal_cap` on top of whichever source was chosen.
4. If an axis needs a verbosity/state cap (verbosity or state_shift present) and neither source
   yields one → violation. A refusal-only case with `overrides.refusal_cap` (or the default cap
   25) is valid with neither `soul` nor `thresholds`.
5. Resolve `soul` paths against the manifest directory (mirror the chat manifest's path
   resolution).

**Files:** `src/adapters/a2a/behavioral-manifest.ts`.
**Validation:** T012 persona/explicit/both + missing-threshold cases.

### T011 — Strict unknown-field rejection + full error catalogue

**Purpose:** One place that guarantees every malformed manifest fails clearly.

**Steps:** ensure violations are produced (with field-naming messages) for: unknown field at any
level; literal token/URL under `endpoint`; `pass_threshold > runs`; empty `turns`; empty `axes`;
out-of-range `refusal.turn`/`state_shift.trigger_turn`; duplicate case `id`; verbosity/state axis
with no resolvable threshold. Return all violations (don't stop at the first) so authors see the
full list, matching the core manifest's behavior.

**Files:** `src/adapters/a2a/behavioral-manifest.ts`.
**Validation:** T012 covers each.

### T012 — Unit tests

**Steps:**
1. New `tests/a2a/behavioral-manifest.test.ts`.
2. Fixtures under `tests/fixtures/a2a/behavioral-manifests/`: `persona.yaml` (soul ref),
   `explicit.yaml` (thresholds only), `both.yaml` (soul + thresholds → explicit wins), plus one
   fixture per error case (`unknown-field.yaml`, `literal-token.yaml`, `threshold-gt-runs.yaml`,
   `empty-turns.yaml`, `out-of-range-turn.yaml`, `dup-id.yaml`, `no-threshold.yaml`).
3. Assert valid manifests load with the expected `ResolvedThresholds` (incl. explicit-overrides-
   persona for `both.yaml`); assert each error fixture returns the expected violation.

**Files:** `tests/a2a/behavioral-manifest.test.ts`, `tests/fixtures/a2a/behavioral-manifests/**`.
**Validation:** `pnpm test` green; `pnpm typecheck` clean.

## Definition of Done

- Two new files; A2A behavioral manifest strict-validated; decision-C resolution with correct
  precedence; env-name-only token rule enforced.
- Core validators reused by import; core untouched; `tests/unit/invariants.test.ts` (C-004) green.
- New tests pass; `pnpm build` + `pnpm test` green.

## Reviewer guidance

- Confirm no edits to `src/core/**` or `src/adapters/a2a/types.ts`.
- Confirm `both.yaml` resolves with explicit thresholds overriding persona-derived ones.
- Confirm a literal URL/token under `endpoint` is rejected.

## Implementation command

```
spec-kitty agent action implement WP02 --agent <name>
```

## Activity Log

- 2026-06-20T12:37:03Z – claude:sonnet:implementer:implementer – shell_pid=751549 – Started implementation via action command
- 2026-06-20T12:47:02Z – claude:sonnet:implementer:implementer – shell_pid=751549 – WP02 complete: behavioral-types.ts + behavioral-manifest.ts + 10 YAML fixtures + 20 tests (40 with TS). Decision-C precedence: explicit thresholds > soul-derived > none. Strict field rejection (FR-005), NFR-002 env-name validation, soul paths resolved against manifest dir. pnpm build clean, pnpm test 2732/2732 passed, invariants NI-001/NI-002/NI-003 green. Exports: loadBehavioralManifest, resolveThresholds, isA2aBehavioralManifestError (all needed by WP03).
- 2026-06-20T12:47:27Z – claude:opus:reviewer:reviewer – shell_pid=770430 – Started review via action command
