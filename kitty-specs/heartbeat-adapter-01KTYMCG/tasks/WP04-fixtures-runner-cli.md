---
work_package_id: WP04
title: Fixtures + manifest runner + CLI wiring
dependencies:
- WP01
- WP02
- WP03
requirement_refs:
- FR-011
- FR-012
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-13T01:30:00Z'
subtasks:
- T018
- T019
- T020
- T021
- T022
- T023
history: []
authoritative_surface: src/adapters/heartbeat/
execution_mode: code_change
owned_files:
- src/adapters/heartbeat/index.ts
- tests/fixtures/heartbeat/checklists/valid-concise.md
- tests/fixtures/heartbeat/checklists/empty.md
- tests/fixtures/heartbeat/checklists/comment-only.md
- tests/fixtures/heartbeat/checklists/over-length.md
- tests/fixtures/heartbeat/checklists/mixed-recurrence.md
- tests/fixtures/heartbeat/tick-states/due.json
- tests/fixtures/heartbeat/tick-states/repeat.json
- tests/fixtures/heartbeat/tick-states/nothing-due.json
- tests/fixtures/heartbeat/interval-configs/default-30m.json
- tests/fixtures/heartbeat/interval-configs/oauth-1h.json
- tests/fixtures/heartbeat/interval-configs/absent.json
- tests/fixtures/heartbeat/manifest.json
tags: []
assignee: "claude"
agent: "claude:sonnet:implementer:implementer"
---

# WP04 — Fixtures + manifest runner + CLI wiring

## Objective

Assemble the complete heartbeat adapter deliverable from the components built in WP01–WP03:

1. **Complete fixture set** (`tests/fixtures/heartbeat/`) — 5 checklist fixtures, 3
   tick-state JSON fixtures, 3 interval-config JSON fixtures, and the test manifest
   shaped as a candidate upstream conformance suite (C-005, FR-012).
2. **`manifest.json` runner** — iterates all cases in the manifest and produces a
   pass/fail summary (FR-011).
3. **`src/adapters/heartbeat/index.ts`** — `HeartbeatAdapter` assembly behind the
   `SpecAdapter` boundary (FR-001, C-001).
4. **CLI wiring** — `muster check --adapter heartbeat` (FR-012).
5. Full Vitest fixture suite integration; SonarCloud quality gate green (NFR-006).

This WP merges last (depends on WP01, WP02, WP03). The `src/cli/index.ts` edit is
minimal — one adapter entry — but it is an existing shared file; the change must be
the only modification to it.

## Context

- Spec: `kitty-specs/heartbeat-adapter-01KTYMCG/spec.md` (FR-001, FR-011, FR-012,
  NFR-001–NFR-004, NFR-006, C-001, C-004, C-005)
- Plan: `kitty-specs/heartbeat-adapter-01KTYMCG/plan.md` — fixture tree, manifest schema,
  build order
- Peer adapter reference: `src/adapters/rfc1/index.ts` (mirror layout exactly)
- Charter: `.kittify/charter/charter.md` — ≥80% new-code coverage, SonarCloud gate,
  scope guard (CLI + CI exit codes only, no hosted service)

**Hard rules for the whole WP**:
1. `owned_files` does not include `src/cli/index.ts`; the CLI wiring edit is a minimal
   single-entry addition. Do not restructure, rename, or otherwise modify the CLI file
   beyond adding the heartbeat adapter entry.
2. The `HeartbeatAdapter` in `index.ts` must stay behind the `SpecAdapter` boundary:
   no heartbeat-specific type is ever imported by `src/core/`.
3. Fixture files are static data — their content must be deterministic and version-
   controlled. No script generates them at test time.
4. The manifest runner produces a deterministic pass/fail summary: findings sorted in
   case-id order (UTF-16 code-unit ordering, NFR-001).
5. The fixture set is shaped as a candidate upstream conformance suite (C-005): case
   IDs are stable strings (e.g. `"hb-static-001"`), not ordinals, so they survive
   upstream adoption.

## Subtasks

### T018 — Complete fixture set: all checklists + tick states + interval configs

**Purpose**: Create the canonical fixture files that serve as the primary acceptance
surface for the heartbeat adapter and the basis for the candidate upstream conformance
suite (C-005, FR-012).

**Steps**:

1. **Checklist fixtures** (`tests/fixtures/heartbeat/checklists/`):

   **`valid-concise.md`** — concise well-formed HEARTBEAT.md; passes all static checks:
   ```markdown
   <!-- HEARTBEAT.md — concise fixture for muster conformance suite -->
   - [ ] Check the error log for new critical entries
   - [ ] Summarise open pull requests awaiting review
   ```

   **`empty.md`** — completely empty file (0 bytes). Used by the empty-file-skip
   static lint fixture (`hb-static-002`).

   **`comment-only.md`** — only Markdown comment blocks, no real instructions:
   ```markdown
   <!-- This file is intentionally comment-only for muster fixture hb-static-003. -->
   <!-- No checklist items. The heartbeat run should be skipped per OpenClaw docs. -->
   ```

   **`over-length.md`** — exceeds the muster rubric's length guidance. Populate with
   51+ lines of checklist items (enough to trigger the length advisory); each line is a
   valid checklist item so the file is syntactically correct but operationally too long:
   ```markdown
   <!-- over-length fixture for muster conformance suite (hb-static-004) -->
   - [ ] Task 1: Check service A health
   - [ ] Task 2: Check service B health
   ... (continue to 51 items)
   - [ ] Task 51: Archive old logs
   ```

   **`mixed-recurrence.md`** — contains both once-only and recurring items; used by
   the idempotency probe fixture:
   ```markdown
   <!-- mixed-recurrence fixture — once-only + recurring items (hb-behavioral-002) -->
   - [ ] Send the daily summary email (once-only — do not repeat on subsequent ticks)
   - [ ] Check the error log (recurring — check on every tick)
   ```

2. **Tick-state fixtures** (`tests/fixtures/heartbeat/tick-states/`):

   **`due.json`** — tick state where the daily-summary action is due:
   ```json
   {
     "id": "tick-due-001",
     "state": "due",
     "priorActionSummary": null,
     "intervalConfig": { "intervalMinutes": 30, "assumed": false }
   }
   ```

   **`repeat.json`** — repeat tick, prior summary injected; once-only action was
   already done on the due tick:
   ```json
   {
     "id": "tick-repeat-001",
     "state": "repeat",
     "priorActionSummary": "Sent the daily summary email at 09:00.",
     "intervalConfig": { "intervalMinutes": 30, "assumed": false }
   }
   ```

   **`nothing-due.json`** — tick where no action is required:
   ```json
   {
     "id": "tick-nothing-due-001",
     "state": "nothing-due",
     "priorActionSummary": null,
     "intervalConfig": { "intervalMinutes": 30, "assumed": false }
   }
   ```

3. **Interval-config fixtures** (`tests/fixtures/heartbeat/interval-configs/`):

   **`default-30m.json`** — explicit 30m config (not assumed):
   ```json
   { "intervalMinutes": 30, "assumed": false }
   ```

   **`oauth-1h.json`** — Anthropic OAuth 1h config (must be supplied by caller):
   ```json
   { "intervalMinutes": 60, "assumed": false }
   ```

   **`absent.json`** — represents a missing config; used by tests that verify the
   default-assumed path. Content: `{}` (empty object — `intervalMinutes` absent).

**Files**: all fixture files listed in `owned_files`

**Validation**:
- `empty.md` has 0 bytes (verify with `wc -c`)
- `over-length.md` has ≥51 list items (verify with `grep -c '^\- '`)
- `mixed-recurrence.md` has exactly one once-only item and one recurring item
- All JSON fixtures are valid JSON (`node -e "JSON.parse(require('fs').readFileSync(...))"`)
- `repeat.json` has non-null `priorActionSummary`
- `absent.json` has no `intervalMinutes` key

---

### T019 — `manifest.json` runner: iterate cases, produce pass/fail summary

**Purpose**: Implement the test manifest schema and runner. The manifest declares each
test case's checklist path, item recurrence labels, tick state, interval config, grading
class, and expected outcome. The runner iterates cases and produces a deterministic
pass/fail summary (FR-011).

**Steps**:
1. Define the `manifest.json` schema at `tests/fixtures/heartbeat/manifest.json`.
   Each entry is a conformance test case with a stable case ID:
   ```json
   {
     "cases": [
       {
         "id": "hb-static-001",
         "description": "Concise well-formed HEARTBEAT.md passes static lint",
         "checklistPath": "tests/fixtures/heartbeat/checklists/valid-concise.md",
         "itemRecurrence": [],
         "tickState": null,
         "intervalConfig": "tests/fixtures/heartbeat/interval-configs/default-30m.json",
         "gradingClass": "static-lint",
         "expectation": { "ok": true, "findings": [] }
       },
       {
         "id": "hb-static-002",
         "description": "Empty HEARTBEAT.md produces empty-file-skip info finding",
         "checklistPath": "tests/fixtures/heartbeat/checklists/empty.md",
         "itemRecurrence": [],
         "tickState": null,
         "intervalConfig": "tests/fixtures/heartbeat/interval-configs/default-30m.json",
         "gradingClass": "static-lint",
         "expectation": { "ok": true, "isEmpty": true, "hasRule": "heartbeat/empty-file-skip" }
       },
       {
         "id": "hb-static-003",
         "description": "Comment-only HEARTBEAT.md produces empty-file-skip info finding",
         "checklistPath": "tests/fixtures/heartbeat/checklists/comment-only.md",
         "itemRecurrence": [],
         "tickState": null,
         "intervalConfig": "tests/fixtures/heartbeat/interval-configs/default-30m.json",
         "gradingClass": "static-lint",
         "expectation": { "ok": true, "isEmpty": true, "hasRule": "heartbeat/empty-file-skip" }
       },
       {
         "id": "hb-static-004",
         "description": "Over-length HEARTBEAT.md triggers length advisory",
         "checklistPath": "tests/fixtures/heartbeat/checklists/over-length.md",
         "itemRecurrence": [],
         "tickState": null,
         "intervalConfig": "tests/fixtures/heartbeat/interval-configs/default-30m.json",
         "gradingClass": "static-lint",
         "expectation": { "hasRule": "heartbeat/length-advisory" }
       },
       {
         "id": "hb-behavioral-001",
         "description": "Due tick: action-diff probe (requires BYOM endpoint)",
         "checklistPath": "tests/fixtures/heartbeat/checklists/valid-concise.md",
         "itemRecurrence": [
           { "itemId": "item-1", "recurrence": "recurring" },
           { "itemId": "item-2", "recurrence": "recurring" }
         ],
         "tickState": "tests/fixtures/heartbeat/tick-states/due.json",
         "intervalConfig": "tests/fixtures/heartbeat/interval-configs/default-30m.json",
         "gradingClass": "action-diff",
         "expectation": { "passThreshold": 0.6 }
       },
       {
         "id": "hb-behavioral-002",
         "description": "Repeat tick: idempotency probe (requires BYOM endpoint)",
         "checklistPath": "tests/fixtures/heartbeat/checklists/mixed-recurrence.md",
         "itemRecurrence": [
           { "itemId": "item-1", "recurrence": "once-only" },
           { "itemId": "item-2", "recurrence": "recurring" }
         ],
         "tickState": "tests/fixtures/heartbeat/tick-states/repeat.json",
         "intervalConfig": "tests/fixtures/heartbeat/interval-configs/default-30m.json",
         "gradingClass": "idempotency",
         "expectation": { "passThreshold": 0.6 }
       },
       {
         "id": "hb-behavioral-003",
         "description": "Nothing-due tick: quiet-ack probe (requires BYOM endpoint)",
         "checklistPath": "tests/fixtures/heartbeat/checklists/valid-concise.md",
         "itemRecurrence": [],
         "tickState": "tests/fixtures/heartbeat/tick-states/nothing-due.json",
         "intervalConfig": "tests/fixtures/heartbeat/interval-configs/default-30m.json",
         "gradingClass": "quiet-ack",
         "expectation": { "passThreshold": 0.6 }
       },
       {
         "id": "hb-config-001",
         "description": "Absent interval config defaults to 30m (assumed: true)",
         "checklistPath": "tests/fixtures/heartbeat/checklists/valid-concise.md",
         "itemRecurrence": [],
         "tickState": null,
         "intervalConfig": "tests/fixtures/heartbeat/interval-configs/absent.json",
         "gradingClass": "interval-config",
         "expectation": { "assumed": true, "intervalMinutes": 30 }
       }
     ]
   }
   ```
2. Implement the manifest runner in `src/adapters/heartbeat/index.ts` or a new file
   `src/adapters/heartbeat/runner.ts` (document the choice). The runner:
   - Loads `manifest.json`
   - For each case, resolves paths relative to the manifest file's directory
   - Dispatches to the correct grader based on `gradingClass`
   - For `static-lint` cases: runs synchronously, no model call required
   - For `action-diff`, `idempotency`, `quiet-ack` cases: runs against the supplied
     BYOM endpoint (skips gracefully if `MUSTER_ENDPOINT` is not set, with a clear
     logged message)
   - Produces a pass/fail summary sorted by case ID (UTF-16 code-unit ordering, NFR-001)
3. The runner output format mirrors muster's CTS runner output (FR-001).

**Files**: `tests/fixtures/heartbeat/manifest.json`, `src/adapters/heartbeat/index.ts`
(or new `runner.ts` if chosen)

**Validation**:
- `manifest.json` is valid JSON with all 8 cases
- Static cases (`hb-static-001..004`, `hb-config-001`) run without a BYOM endpoint
- Runner output is deterministic when run twice on the same static cases
- `hb-static-001` produces `ok: true` (the valid-concise fixture passes)
- `hb-static-002` and `hb-static-003` produce `isEmpty: true` + `heartbeat/empty-file-skip`
- `hb-static-004` produces `heartbeat/length-advisory`

---

### T020 — HeartbeatAdapter assembly in `index.ts` (SpecAdapter boundary)

**Purpose**: Assemble the `HeartbeatAdapter` class that implements muster's `SpecAdapter`
contract, wiring together the parser, lint, tick model, graders, and manifest runner
behind the adapter boundary (FR-001, C-001). Mirrors `src/adapters/rfc1/index.ts` layout.

**Steps**:
1. In `src/adapters/heartbeat/index.ts`, import from:
   - `src/adapters/heartbeat/lint.ts` (parseHeartbeat, lintHeartbeat, serializeLintReport)
   - `src/adapters/heartbeat/tick.ts` (SimulatedTick, IntervalConfig, buildScenarioFraming)
   - `src/adapters/heartbeat/graders/action-diff.ts`
   - `src/adapters/heartbeat/graders/idempotency.ts`
   - `src/adapters/heartbeat/graders/quiet-ack.ts`
   - `src/core/` (SpecAdapter interface, pipeline types only — no heartbeat types
     flow the other direction)
2. Implement `export class HeartbeatAdapter implements SpecAdapter`:
   - `check(filePath: string, options: AdapterOptions): Promise<AdapterReport>` —
     runs static lint and, if a BYOM endpoint is configured in `options`, the
     behavioral probes
   - `name: string = 'heartbeat'`
   - `version: string` = current version from package.json
3. Confirm the `SpecAdapter` interface is satisfied by reading `src/adapters/rfc1/index.ts`
   and matching the structure exactly (same exported class shape, same method signatures).
4. Do not export any heartbeat-specific type from `index.ts` that `src/core/` would
   need to import — the boundary is one-directional.

**Files**: `src/adapters/heartbeat/index.ts`

**Validation**:
- `pnpm build` (strict tsc) → no errors
- `HeartbeatAdapter` satisfies the `SpecAdapter` interface
- No type from `src/adapters/heartbeat/` is imported in `src/core/`

---

### T021 — CLI wiring: `--adapter heartbeat`

**Purpose**: Wire `muster check --adapter heartbeat` so the CLI resolves and invokes
`HeartbeatAdapter`. The change to `src/cli/index.ts` is one entry in the adapter
registry — no restructuring.

**Steps**:
1. Read `src/cli/index.ts` and locate the adapter registry (the map or switch
   that maps `--adapter` values to `SpecAdapter` implementations).
2. Add `'heartbeat': () => new HeartbeatAdapter()` (or the equivalent pattern used
   by the existing adapters) as one new entry. Import `HeartbeatAdapter` from
   `src/adapters/heartbeat/index.ts`.
3. Do not modify any other part of `src/cli/index.ts`.

**Files**: `src/cli/index.ts` (not in `owned_files` but requires minimal modification;
document the touch in the work log)

**Validation**:
- `node dist/cli/index.js check --adapter heartbeat --help` exits 0 and mentions heartbeat
- `node dist/cli/index.js check --adapter heartbeat tests/fixtures/heartbeat/checklists/valid-concise.md`
  exits 0 and prints a report with `ok: true`
- `git diff src/cli/index.ts` shows only the import + one registry entry

---

### T022 — Full fixture suite Vitest integration + coverage gate

**Purpose**: Integrate the heartbeat fixture suite into the full Vitest run and confirm
the SonarCloud quality gate passes (NFR-006, charter gate).

**Steps**:
1. Create a Vitest integration test at `tests/heartbeat/fixture-suite.test.ts` (owned
   by this WP — add to owned_files if not already listed; update the frontmatter) that:
   - Imports the manifest runner
   - Runs all `static-lint` and `interval-config` cases from `manifest.json` (no BYOM
     endpoint required)
   - Asserts each case's outcome matches its `expectation` field
   - Marks `action-diff`, `idempotency`, and `quiet-ack` cases as skipped when
     `MUSTER_ENDPOINT` is not set (with `it.skipIf(() => !process.env.MUSTER_ENDPOINT)`)
2. Run `pnpm test` — all non-behavioral cases must pass.
3. Run `pnpm test:coverage` — new-code coverage on `src/adapters/heartbeat/` must meet
   the ≥80% SonarCloud gate.
4. Confirm the existing full suite still passes (no regressions): `pnpm test` shows the
   same total passing test count as before WP04 plus the new heartbeat fixture tests.

**Files**: `tests/heartbeat/fixture-suite.test.ts` (add to `owned_files`)

**Validation**:
- `pnpm test` → all tests green (behavioral cases skipped if no endpoint, not failed)
- `pnpm test:coverage` → coverage ≥80% on new `src/adapters/heartbeat/` code
- Static fixture cases `hb-static-001..004` and `hb-config-001` produce correct outcomes
- No existing test is broken or newly skipped

---

### T023 — WP04 verification: build, suite, CLI smoke, coverage, SonarCloud gate

**Purpose**: Final verification gate for the complete heartbeat adapter mission.

**Steps** (in order):
```bash
pnpm build                          # strict tsc — zero errors across all files
pnpm test                           # full Vitest suite — zero failures, zero new skips
pnpm test:coverage                  # emits coverage/lcov.info; confirm ≥80% on heartbeat adapter
git diff --stat                     # owned files + src/cli/index.ts (one entry only)
```

CLI smoke commands (static path, no BYOM endpoint required):
```bash
node dist/cli/index.js check --adapter heartbeat tests/fixtures/heartbeat/checklists/valid-concise.md
# Expected: exits 0; output contains "ok: true"

node dist/cli/index.js check --adapter heartbeat tests/fixtures/heartbeat/checklists/empty.md
# Expected: exits 0; output contains "heartbeat/empty-file-skip"

node dist/cli/index.js check --adapter heartbeat tests/fixtures/heartbeat/checklists/over-length.md
# Expected: exits 0; output contains "heartbeat/length-advisory"
```

Performance gate:
```bash
time node dist/cli/index.js check --adapter heartbeat tests/fixtures/heartbeat/checklists/valid-concise.md
# Expected: < 5 seconds (NFR-002)

time pnpm test -- tests/heartbeat
# Expected: < 10 seconds for static fixture suite (NFR-003)
```

Byte-stability check:
```bash
node dist/cli/index.js check --adapter heartbeat tests/fixtures/heartbeat/checklists/valid-concise.md > /tmp/hb-run1.json
node dist/cli/index.js check --adapter heartbeat tests/fixtures/heartbeat/checklists/valid-concise.md > /tmp/hb-run2.json
diff /tmp/hb-run1.json /tmp/hb-run2.json
# Expected: empty diff (NFR-001)
```

```bash
git diff -U0 src/cli/index.ts | grep '^\+' | grep -v 'heartbeat\|HeartbeatAdapter' || echo OK
# Expected: OK (only heartbeat-related lines added to CLI)
```

**Files**: none (verification only)

**Validation**:
- `pnpm build` + `pnpm test` green with no new skips
- CLI smoke: all three commands produce correct output
- Performance: single-file lint < 5s, static suite < 10s
- Byte-stability: diff is empty
- CLI diff: only heartbeat-related additions

## Definition of Done

- [ ] All fixture files created with correct content (T018 validation checks pass)
- [ ] `manifest.json` has all 8 cases with stable IDs; valid JSON
- [ ] Manifest runner iterates cases and produces deterministic pass/fail summary (FR-011)
- [ ] `src/adapters/heartbeat/index.ts`: `HeartbeatAdapter` implements `SpecAdapter`;
  tsc strict passes; no heartbeat type flows into `src/core/`
- [ ] CLI wiring: `muster check --adapter heartbeat` resolves to HeartbeatAdapter;
  `src/cli/index.ts` diff is import + one registry entry only
- [ ] `tests/heartbeat/fixture-suite.test.ts` covers all static manifest cases;
  behavioral cases skipped (not failed) without endpoint
- [ ] `pnpm build` + `pnpm test` green; no regressions; no new skips beyond endpoint-gated ones
- [ ] `pnpm test:coverage` → ≥80% new-code coverage on `src/adapters/heartbeat/`
- [ ] CLI smoke: valid-concise → `ok: true`; empty/comment-only → `heartbeat/empty-file-skip`;
  over-length → `heartbeat/length-advisory`
- [ ] Byte-stability diff is empty
- [ ] Single-file lint < 5s (NFR-002); static suite < 10s (NFR-003)

## Reviewer guidance

- **Reject if** `src/core/` imports any type from `src/adapters/heartbeat/`, or if
  `src/cli/index.ts` is modified beyond import + one registry entry, or if the manifest
  lacks any of the 8 expected cases.
- Check fixture completeness: `empty.md` must be 0 bytes; `mixed-recurrence.md` must
  have exactly one once-only item (used by idempotency probe); `absent.json` must have
  no `intervalMinutes` key.
- Check manifest case IDs: must be stable strings (`hb-*`), not ordinals.
- Check behavioral case skipping: `action-diff`, `idempotency`, `quiet-ack` cases must
  use `it.skipIf` (not `it.todo` or unconditional skip) so they run when an endpoint
  is configured in CI.
- Check byte-stability: require the diff evidence in the work log.
- Check NFR-002/NFR-003 timing: ask for timing output from T023.
- Check `HeartbeatAdapter` boundary: confirm no heartbeat-specific type appears in any
  `src/core/` file (`grep -r 'heartbeat' src/core/` must return nothing).

## Activity Log

- 2026-06-13T01:30:00Z – /spec-kitty.tasks – created
- 2026-06-13T14:26:33Z – claude:sonnet:implementer:implementer – Moved to in_progress
- 2026-06-13T14:31:03Z – claude:sonnet:implementer:implementer – Implemented on rebased code-only lane; build+test green, coverage >=89%
- 2026-06-13T14:34:42Z – claude:opus:reviewer:reviewer – Moved to planned
- 2026-06-13T14:35:59Z – claude:sonnet:implementer:implementer – Moved to in_progress
- 2026-06-13T14:41:36Z – claude:sonnet:implementer:implementer – Wired behavioral path per review; errored=failed enforced; tests assert cases run via stub client
- 2026-06-13T14:43:47Z – claude:opus:reviewer:reviewer – Behavioral path wired through core client; FR-008 enforced; tests exercise the wired path
- 2026-06-13T14:53:18Z – claude:sonnet:implementer:implementer – Reopen: action-diff live observation contract fix (FR-004)
