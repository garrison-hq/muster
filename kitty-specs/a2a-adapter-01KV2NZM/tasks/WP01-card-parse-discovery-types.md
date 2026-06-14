---
work_package_id: WP01
title: Card parse + discovery lint + manifest types
dependencies: []
requirement_refs:
- FR-002
- FR-003
- FR-005
- FR-013
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts were generated on feat/a2a-adapter (main is protected). During implementation this WP builds on the single mission lane; completed changes merge into main via one PR unless the human redirects the landing branch.
created_at: '2026-06-14T09:11:11Z'
subtasks:
- T001
- T002
- T003
- T004
- T005
- T006
assignee: claude
agent: claude:sonnet:implementer:implementer
history: []
authoritative_surface: src/adapters/a2a/
execution_mode: code_change
owned_files:
- src/adapters/a2a/card.ts
- src/adapters/a2a/types.ts
- tests/a2a/card.test.ts
- tests/fixtures/a2a/cards/valid.json
- tests/fixtures/a2a/cards/obsolete-uri.json
tags: []
---

# WP01 — Card parse + discovery lint + manifest types

## Objective

Lay the A2A adapter foundation every later WP depends on:

1. **`src/adapters/a2a/card.ts`** — parse an Agent Card into a typed `AgentCard`,
   check the discovery well-known URI (flag the obsolete `agent.json`, A2A §8.2),
   and do **residual-gap** structural sanity of declared skills + security schemes,
   explicitly **delegating deep schema validation to `a2a-tck`** (C-002, FR-005).
2. **`src/adapters/a2a/types.ts`** — the `ManifestCase` / `CaseResult` /
   `ManifestSummary` types (mirroring the heartbeat adapter) plus a `loadManifest`
   reader (FR-002).
3. Unit tests at ≥80% new-code coverage.

No `src/core/` file is modified. No JWS verification, transport, or grader code
lives here (those are WP02–WP04). No `index.ts`/`runManifest`/CLI here (WP05).

## Context

- Spec: `kitty-specs/a2a-adapter-01KV2NZM/spec.md` (FR-002, FR-003, FR-005, FR-013, C-002, C-003)
- Data model: `kitty-specs/a2a-adapter-01KV2NZM/data-model.md` — authoritative field-level
  shapes for `AgentCard`, `DeclaredSkill`, `SecurityScheme`, `ManifestCase`, `ManifestSummary`
- Contracts: `kitty-specs/a2a-adapter-01KV2NZM/contracts/manifest-and-report.md`
- Peer reference: `src/adapters/heartbeat/` (`lint.ts` parse pattern, `index.ts` manifest types)
- Charter: byte-stable deterministic output; ≥80% new-code coverage; every check cites a
  normative source; no credentials in repo.

**Hard rules for the whole WP**:
1. Touch only `owned_files`. Do not modify `src/core/` or any existing file.
2. Parsing never throws on a structurally-odd card — it returns findings. Deep card-schema
   validation is **out of scope** and must be recorded as delegated to `a2a-tck` (FR-005).
3. Discovery checks cite A2A §8.2; treat the protobuf `a2a.proto` as normative and the
   JSON Schema as non-normative (C-003).
4. All output is deterministic and byte-stable — no `Date`, no random, no locale sorts.

## Subtasks

### T001 — Parse AgentCard
**Purpose**: Turn raw card JSON into the typed `AgentCard` entity from the data model.

**Steps**:
1. In `card.ts` define and export:
   ```ts
   export interface DeclaredSkill { id: string; description: string; expectedBehavior?: string; }
   export interface SecurityScheme { id: string; type: string; protectedMethods: string[]; }
   export interface JwsSignature { protected: string; signature: string; header?: Record<string, unknown>; }
   export interface AgentCard {
     name: string; version: string;
     skills: DeclaredSkill[];
     securitySchemes: SecurityScheme[];
     signatures?: JwsSignature[];
     discoveredFrom: string;      // the URI/path the card was loaded from
     raw: unknown;                // the original parsed JSON (for signature verification in WP02)
   }
   ```
2. Implement `parseAgentCard(raw: string, discoveredFrom: string): AgentCard`.
   - JSON-parse `raw`; on parse error return a card with empty `skills`/`securitySchemes`
     and let the lint surface a finding (do NOT throw).
   - Map A2A card fields to `DeclaredSkill[]`/`SecurityScheme[]`; tolerate missing arrays
     (default to `[]`). Preserve `signatures` if present. Keep `raw` for WP02.
3. JSDoc: note that `raw` is retained verbatim for downstream JWS verification.

**Files**: `src/adapters/a2a/card.ts`
**Validation** (T006): valid card → populated skills/schemes; card missing `skills` → `[]`;
malformed JSON → no throw, parse-failure surfaced by lint.

### T002 — Discovery well-known URI check (§8.2)
**Purpose**: Flag the obsolete `agent.json` and confirm the canonical
`/.well-known/agent-card.json`.

**Steps**:
1. Implement `checkDiscoveryUri(discoveredFrom: string): LintFinding | null`.
   - PASS (return `null`) when the URI path ends with `/.well-known/agent-card.json`.
   - FAIL when it ends with `/.well-known/agent.json` (the obsolete URI) → finding
     `{ rule: "well-known-uri", message: "...obsolete agent.json; A2A §8.2 requires agent-card.json", path: discoveredFrom }`.
   - For other paths (e.g. fixture file paths in tests) treat as not-applicable (`null`) so
     local-file linting still works; the well-known check only fires for `.well-known/*` URIs.
2. Define `LintFinding { rule: string; path: string; message: string }` here (reused by WP02 lint).

**Files**: `src/adapters/a2a/card.ts`
**Validation** (T006): `…/agent-card.json` → null; `…/agent.json` → finding citing §8.2.

### T003 — Structural sanity + `a2a-tck` delegation note
**Purpose**: Residual-gap structural checks only; record that full schema validation is
delegated to `a2a-tck` (FR-005).

**Steps**:
1. Implement `checkStructure(card: AgentCard): LintFinding[]` — only the minimum the
   residual-gap probes need:
   - each `DeclaredSkill` has a non-empty `id` (else finding `rule: "skill-structure"`);
   - each `SecurityScheme` has a non-empty `id` + `type` (else `rule: "scheme-structure"`);
   - a card declaring no schemes is NOT a finding (records "auth probes not applicable").
2. Implement `delegationNote(): { schemaValidation: "delegated:a2a-tck" }` and ensure it is
   included in the lint report detail (WP02 assembles it). Do NOT validate the full A2A
   card schema — that is `a2a-tck`'s job (C-002).

**Files**: `src/adapters/a2a/card.ts`
**Validation** (T006): skill with empty id → finding; no-scheme card → no finding;
delegation note present.

### T004 — Manifest + summary types and loader [P]
**Purpose**: Define the manifest/summary contract the runner (WP05) and graders consume.

**Steps**:
1. In `types.ts` define and export, matching `contracts/manifest-and-report.md`:
   ```ts
   export type GradingClass = "static-lint" | "skill-behavior" | "auth-negative" | "signed-card-live";
   export interface ManifestCase {
     id: string; description: string; cardSource: string; gradingClass: GradingClass;
     skillProbe?: { skillId: string; input: string; expect: string };
     auth?: { scheme: string; method: string; authorized: boolean };
     signed?: { jwksSource: string; expectVerified: boolean };
     runs?: number; passThreshold?: number; control?: boolean;
     expectation: Record<string, unknown>;
   }
   export interface CaseResult {
     id: string; description: string; gradingClass: GradingClass;
     passed: boolean; skipped: boolean; skipReason?: string; detail?: Record<string, unknown>;
   }
   export interface ManifestSummary { totalCases: number; passed: number; failed: number; skipped: number; results: CaseResult[]; }
   export interface A2aManifest { adapter: "a2a"; cases: ManifestCase[]; }
   ```
2. Implement `loadManifest(path: string): A2aManifest` — read + JSON-parse + minimal
   validation (throw a clear `Error` on a non-`a2a` adapter or missing `cases`, so the CLI
   maps it to exit code 2). Resolve `cardSource` fixture paths relative to the manifest dir.

**Files**: `src/adapters/a2a/types.ts`
**Validation** (T006): valid manifest loads; wrong `adapter` → throws; relative `cardSource`
resolves against manifest dir.

### T005 — Card fixtures [P]
**Purpose**: Minimal fixtures for the discovery/structure tests.

**Steps**:
1. `tests/fixtures/a2a/cards/valid.json` — a well-formed card: `name`, `version`, one
   `echo` skill, one `bearer` security scheme guarding `message/send`. No signature.
2. `tests/fixtures/a2a/cards/obsolete-uri.json` — same card body; used by a test that passes
   `discoveredFrom` ending in `/.well-known/agent.json`.

**Files**: the two fixtures.
**Validation**: both parse; used by T006.

### T006 — Unit tests
**Purpose**: Cover card parsing, discovery, structure, delegation, and manifest loading.

**Steps**: Write `tests/a2a/card.test.ts` (Vitest) covering every validation bullet above,
plus determinism (same input → identical findings array). Target ≥80% new-code coverage of
`card.ts` + `types.ts`.

**Files**: `tests/a2a/card.test.ts`

## Branch Strategy
Planning artifacts were generated on `feat/a2a-adapter` (`main` is protected). Execution
worktrees are allocated per the computed lane from `lanes.json`; this mission uses a single
lane. Completed changes merge into `main` via one PR.

## Definition of Done
- [ ] `card.ts` + `types.ts` implemented; `tsc` strict passes.
- [ ] Discovery flags obsolete `agent.json` citing §8.2; structure checks are residual-gap
      only; delegation-to-`a2a-tck` note recorded (FR-005).
- [ ] `loadManifest` reads/validates the manifest contract; bad adapter → throws.
- [ ] `card.test.ts` green; ≥80% new-code coverage; output deterministic/byte-stable.
- [ ] Only `owned_files` touched; `src/core/` untouched.

## Reviewer guidance
Confirm no deep card-schema validation is attempted (must be delegated to `a2a-tck`, C-002);
confirm no `Date`/random; confirm the well-known check still allows local-file linting.
