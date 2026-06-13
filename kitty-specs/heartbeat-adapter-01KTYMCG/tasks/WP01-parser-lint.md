---
work_package_id: WP01
title: HEARTBEAT.md parser + manifest + static lint
dependencies: []
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-010
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-13T01:30:00Z'
subtasks:
- T001
- T002
- T003
- T004
- T005
- T006
- T007
history: []
authoritative_surface: src/adapters/heartbeat/
execution_mode: code_change
owned_files:
- src/adapters/heartbeat/lint.ts
- src/adapters/heartbeat/tick.ts
- tests/heartbeat/lint.test.ts
- tests/heartbeat/tick.test.ts
tags: []
assignee: "claude"
agent: "claude:opus:reviewer:reviewer"
---

# WP01 — HEARTBEAT.md parser + manifest + static lint

## Objective

Implement the three foundational adapter source files that every subsequent WP depends on:

1. **`src/adapters/heartbeat/lint.ts`** — static lint: parse `HEARTBEAT.md` into a typed
   `ChecklistItem[]` list, detect empty/comment-only skip semantics (citing OpenClaw docs
   pinned SHA, C-003), load the item-recurrence manifest, emit a machine-readable
   length/"token burn" advisory finding per muster rubric (FR-003, FR-010, NFR-001).
2. **`src/adapters/heartbeat/tick.ts`** — tick-state model: `SimulatedTick`,
   `IntervalConfig`, and scenario-framing helpers used by the two behavioral WPs
   (FR-002, C-004).
3. Unit tests covering both files at ≥80% new-code coverage (charter testing standards).

No `src/core/` file is modified. No behavioral runner or grader is called in this WP;
those live in WP02/WP03.

## Context

- Spec: `kitty-specs/heartbeat-adapter-01KTYMCG/spec.md` (FR-002, FR-003, FR-010,
  NFR-001, NFR-002, NFR-003, C-001, C-002, C-003, C-004)
- Data model: `kitty-specs/heartbeat-adapter-01KTYMCG/data-model.md` — authoritative
  field-level invariants for `HEARTBEAT.md`, `ChecklistItem`, `SimulatedTick`,
  `IntervalConfig`
- Peer adapter reference: `src/adapters/rfc1/` (mirror layout)
- Charter: `.kittify/charter/charter.md` — byte-stable deterministic output, ≥80%
  new-code coverage, every check cites a normative source, no credentials in repo

**Hard rules for the whole WP**:
1. Touch only `owned_files` — do not modify `src/core/` or any existing test file.
2. Static lint output must be byte-stable and deterministic: identical bytes across
   repeated runs on the same fixture (NFR-001). Canonical ordering is UTF-16 code-unit
   based; no locale-dependent sorts.
3. Citations are mandatory: empty/comment-only skip cites the OpenClaw heartbeat docs
   pinned commit SHA (C-003); length advisory cites muster's published rubric (FR-010).
4. The adapter never infers or hardcodes the interval value — `IntervalConfig` is always
   supplied by the caller or defaulted with `assumed: true` (C-002).

## Subtasks

### T001 — Parse `HEARTBEAT.md`; isEmpty detection

**Purpose**: Produce `HEARTBEAT.md` as the typed domain entity defined in the data model.
Parse raw UTF-8 content into a `ChecklistItem[]` and set `isEmpty` correctly, citing the
OpenClaw docs for the skip semantics.

**Steps**:
1. In `src/adapters/heartbeat/lint.ts`, define the `HeartbeatFile` interface mirroring
   the data model:
   ```ts
   export interface HeartbeatFile {
     path: string;
     raw: string;
     items: ChecklistItem[];
     isEmpty: boolean;
   }
   ```
2. Implement `parseHeartbeat(path: string, raw: string): HeartbeatFile`.
   - `isEmpty` is `true` when `raw` is empty or contains only whitespace and Markdown
     comment blocks (`<!-- ... -->`). A file with a single real instruction (non-whitespace,
     non-comment line) is NOT empty even if all other lines are blank or comments — this
     is the spec edge case documented in `data-model.md`.
   - When `isEmpty` is `true`, `items` is `[]`.
   - Parse checklist items from Markdown list markers (`- [ ]`, `- [x]`, `- `) and bare
     lines that are not comments, headers, or blank. Assign a stable ordinal `id` (e.g.
     `"item-1"`, `"item-2"`) to each item; `recurrence` is `undefined` at parse time and
     filled by T002.
3. Add a JSDoc comment on `parseHeartbeat` stating: "isEmpty semantics follow OpenClaw
   heartbeat docs (pinned SHA recorded in FR-010 citations map). An empty or
   comment-only file causes the heartbeat run to be skipped entirely."

**Files**: `src/adapters/heartbeat/lint.ts`

**Validation**: `tsc` strict compiles; `tests/heartbeat/lint.test.ts` (T006) covers:
- empty file → `isEmpty: true, items: []`
- whitespace-only file → `isEmpty: true`
- comment-only file (`<!-- ... -->` blocks only) → `isEmpty: true`
- one real instruction → `isEmpty: false, items.length === 1`
- mixed real instructions + comments → `isEmpty: false`, correct item count

---

### T002 — Item-recurrence manifest loader

**Purpose**: Load the companion JSON manifest that declares each `ChecklistItem`'s
recurrence label (`once-only` | `recurring`) and tick-state assignments (FR-002).
This is the authoritative discriminator for idempotency grading — the adapter never
infers recurrence from item text.

**Steps**:
1. Define `RecurrenceManifest` and `ManifestEntry` interfaces in `lint.ts`:
   ```ts
   export type Recurrence = 'once-only' | 'recurring';

   export interface ManifestEntry {
     itemId: string;
     recurrence: Recurrence;
   }

   export interface RecurrenceManifest {
     checklistPath: string;
     items: ManifestEntry[];
   }
   ```
2. Implement `loadManifest(manifestPath: string): RecurrenceManifest`. Parse the JSON
   file at `manifestPath`; validate that every entry has `itemId: string` and
   `recurrence: 'once-only' | 'recurring'`; throw a typed `ManifestValidationError`
   for malformed input.
3. Implement `applyManifest(file: HeartbeatFile, manifest: RecurrenceManifest): HeartbeatFile`.
   For each `ChecklistItem` in `file.items`, look up the corresponding `ManifestEntry`
   by `itemId`; set `item.recurrence`. Items with no matching manifest entry default to
   `'recurring'` (safe default — they will not affect idempotency grading).
   Return a new `HeartbeatFile` object (do not mutate the input).
4. The manifest fixture used by tests is `tests/fixtures/heartbeat/manifest.json`
   (owned by WP04 T018); T002 only needs the loader and the unit test stubs using
   inline JSON objects.

**Files**: `src/adapters/heartbeat/lint.ts`

**Validation**: `tests/heartbeat/lint.test.ts` (T006) covers:
- valid manifest with once-only + recurring entries → items annotated correctly
- manifest entry for non-existent itemId → ignored without error
- item with no manifest entry → defaults to `'recurring'`
- malformed manifest JSON → `ManifestValidationError` thrown

---

### T003 — Tick-state model + scenario-framing helpers in `tick.ts`

**Purpose**: Define the `SimulatedTick` and `IntervalConfig` domain types and the
scenario-framing helper used by the behavioral WPs. Ticks are simulated via scenario
framing and a supplied state — no real scheduler is ever run (C-004).

**Steps**:
1. Create `src/adapters/heartbeat/tick.ts`. Define the following interfaces, mirroring
   the data model exactly:
   ```ts
   export interface IntervalConfig {
     intervalMinutes: number;
     assumed: boolean;
   }

   export type TickState = 'due' | 'repeat' | 'nothing-due';

   export interface SimulatedTick {
     id: string;
     scenarioFraming: string;
     state: TickState;
     priorActionSummary: string | null;
     intervalConfig: IntervalConfig;
   }
   ```
2. Implement `buildIntervalConfig(supplied?: { intervalMinutes: number }): IntervalConfig`:
   - If `supplied` is provided, return `{ intervalMinutes: supplied.intervalMinutes, assumed: false }`.
   - If `supplied` is absent or undefined, return `{ intervalMinutes: 30, assumed: true }`.
   - The default 30-minute value is the OpenClaw-documented default. The Anthropic OAuth
     1-hour default must be supplied via config, never assumed (C-002, data-model invariant).
   - Add a comment: "Default 30m per OpenClaw heartbeat docs. Anthropic OAuth default is
     60m and MUST be supplied by the caller, never defaulted here (C-002)."
3. Implement `buildScenarioFraming(checklist: HeartbeatFile, tick: SimulatedTick): string`.
   The framing is derived from the OpenClaw-documented default heartbeat prompt
   (data-model `SimulatedTick.scenarioFraming` field): *"Read HEARTBEAT.md if it exists.
   Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs
   attention, reply HEARTBEAT_OK."* The function injects the checklist content and, for
   `repeat` ticks, the `priorActionSummary` into a system-prompt string. Returns the
   complete framing string.
4. Implement `loadTickState(tickStatePath: string): SimulatedTick`. Parse a JSON tick-state
   file (from `tests/fixtures/heartbeat/tick-states/`) and validate required fields;
   throw `TickStateValidationError` for malformed input.
5. Enforce data-model invariants as runtime assertions:
   - `state === 'repeat'` → `priorActionSummary !== null` (throw if violated)
   - `state === 'due' || state === 'nothing-due'` → `priorActionSummary === null` (throw if violated)

**Files**: `src/adapters/heartbeat/tick.ts`

**Validation**: `tests/heartbeat/tick.test.ts` (T006) covers:
- `buildIntervalConfig` with supplied value → `assumed: false`
- `buildIntervalConfig` with no value → `{ intervalMinutes: 30, assumed: true }`
- `buildIntervalConfig` never hardcodes 60m (Anthropic OAuth test: caller must pass 60)
- `buildScenarioFraming` includes the documented OpenClaw prompt verbatim
- `buildScenarioFraming` for repeat tick injects `priorActionSummary`
- `loadTickState` with valid due.json → correct SimulatedTick
- `loadTickState` with repeat tick missing priorActionSummary → throws `TickStateValidationError`
- invariant violations → typed errors thrown

---

### T004 — Static lint: length advisory + empty/comment-only skip detection

**Purpose**: Implement the two static lint checks that form the primary static-path output.
Both checks cite normative sources; both produce machine-readable findings. Output must be
byte-stable and deterministic (NFR-001).

**Steps**:
1. Define the `LintFinding` and `LintReport` types in `lint.ts`:
   ```ts
   export type LintSeverity = 'advisory' | 'info';

   export interface LintFinding {
     rule: string;
     severity: LintSeverity;
     message: string;
     citation: string;
     location?: { line?: number };
   }

   export interface LintReport {
     path: string;
     ok: boolean;
     findings: LintFinding[];
     isEmpty: boolean;
     itemCount: number;
   }
   ```
2. Implement `lintHeartbeat(file: HeartbeatFile): LintReport`.

   **Empty/comment-only skip check** (rule `heartbeat/empty-file-skip`):
   - When `file.isEmpty === true`, emit a finding with `severity: 'info'` and
     `citation` referencing the OpenClaw heartbeat docs pinned SHA. Message:
     `"File is empty or comment-only — the heartbeat run will be skipped per OpenClaw docs."`.
     Set `ok: true` (skip is not a failure; it is documented behavior).

   **Length/"token burn" advisory** (rule `heartbeat/length-advisory`):
   - Read the line count and approximate character count of `file.raw`.
   - If the file exceeds the muster rubric's length guidance (e.g. > 50 lines or > 2000
     characters — record the exact thresholds as named constants with comments citing the
     rubric), emit a finding with `severity: 'advisory'` and `citation` referencing
     muster's published rubric. Message: `"HEARTBEAT.md exceeds the recommended length
     — long files increase token burn per the muster rubric."`.

3. The `findings` array must be emitted in deterministic order: findings are sorted by
   `rule` string using UTF-16 code-unit ordering (the charter byte-stable constraint,
   NFR-001). Use `.sort((a, b) => (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0))`.
4. `ok` is `true` when there are no `advisory` or higher-severity findings (info findings
   are informational only and do not set `ok: false`).

**Files**: `src/adapters/heartbeat/lint.ts`

**Validation**: `tests/heartbeat/lint.test.ts` (T006) covers the three spec scenarios:
1. Concise well-formed file → `ok: true`, no advisory findings
2. Empty or comment-only file → `ok: true`, `isEmpty: true`, info finding with OpenClaw
   citation, `heartbeat/empty-file-skip` rule
3. Over-length file → `ok: true` or `ok: false` (per rubric; advisory is non-blocking
   by default — record the decision), `heartbeat/length-advisory` rule, rubric citation
4. Repeated runs on same input → byte-identical `LintReport` JSON (determinism check)

---

### T005 — Machine-readable report output for static lint

**Purpose**: Serialize `LintReport` to JSON in muster's canonical format; ensure output
is byte-stable across runs and machines (NFR-001). Citations must be embedded in the
serialized form (FR-010).

**Steps**:
1. Implement `serializeLintReport(report: LintReport): string` in `lint.ts`. Produce
   compact JSON (`JSON.stringify(report, null, 2)` with deterministic key ordering).
   Key ordering: `path`, `ok`, `isEmpty`, `itemCount`, `findings` (each finding:
   `rule`, `severity`, `message`, `citation`, `location`). Use the existing
   `src/core/canonical-json.ts` serializer if it exports a compatible API; otherwise
   implement a local key-sorted serializer.
2. The output string must be byte-identical across:
   - Repeated calls with the same input
   - Different machines (no locale-dependent behavior)
   - Different Node.js minor versions in the supported range
3. Add a `CITATIONS` constant object at the top of `lint.ts` mapping rule IDs to their
   citation strings:
   ```ts
   const CITATIONS = {
     'heartbeat/empty-file-skip': 'OpenClaw heartbeat docs, commit <SHA> — "an empty or comment-only file skips the run"',
     'heartbeat/length-advisory': 'muster rubric §heartbeat-length — "keep HEARTBEAT.md short to avoid token burn"',
   } as const;
   ```
   The `<SHA>` placeholder must be replaced with the actual pinned commit SHA from the
   OpenClaw docs (C-003). Record the SHA in a comment near the constant.

**Files**: `src/adapters/heartbeat/lint.ts`

**Validation**: `tests/heartbeat/lint.test.ts` (T006):
- `serializeLintReport` round-trips: `JSON.parse(serializeLintReport(report))` equals
  the input report
- Repeated calls with the same report input → identical string output
- Citation strings contain the pinned SHA (not `<SHA>` placeholder)

---

### T006 — WP01 unit tests: `lint.test.ts` + `tick.test.ts`

**Purpose**: Provide the unit test coverage for T001–T005 output. New-code coverage
must reach ≥80% on all WP01 owned files (charter testing standards, NFR-006).

**Steps**:
1. Create `tests/heartbeat/lint.test.ts`. Use Vitest (`import { describe, it, expect }
   from 'vitest'`). Cover all T001–T005 scenarios listed in their respective Validation
   sections. Use inline fixture strings (no file I/O in the unit test layer except where
   testing the file-loading functions).
2. Create `tests/heartbeat/tick.test.ts`. Cover all T003 scenarios.
3. For each test file, add a describe block per subtask (`T001 parseHeartbeat`,
   `T002 loadManifest / applyManifest`, `T003 tick model`, etc.) so failures are
   easy to bisect.
4. Run `pnpm test:coverage` locally and confirm that new-code coverage on
   `src/adapters/heartbeat/lint.ts` and `src/adapters/heartbeat/tick.ts` is ≥80%.
   The SonarCloud gate enforces this on the PR.
5. Do not import `src/core/` modules in the test files unless they are already used by
   the adapter source — the goal is isolated unit tests, not integration tests.

**Files**: `tests/heartbeat/lint.test.ts`, `tests/heartbeat/tick.test.ts`

**Validation**:
- `pnpm test -- tests/heartbeat/lint tests/heartbeat/tick` → all pass
- `pnpm build` (strict tsc) → no errors in test files or adapter source
- Coverage report: `src/adapters/heartbeat/lint.ts` ≥80%, `src/adapters/heartbeat/tick.ts` ≥80%

---

### T007 — WP01 verification (gate for Definition of Done)

**Purpose**: Confirm the complete WP01 deliverable is green before WP02/WP03 proceed.

**Steps** (in order):
```bash
pnpm build                          # strict tsc — zero errors
pnpm test                           # full Vitest suite — zero failures, zero new skips
pnpm test -- tests/heartbeat/lint tests/heartbeat/tick   # heartbeat unit suite specifically
pnpm test:coverage                  # emits coverage/lcov.info; review new-code % in summary
git diff --stat                     # ONLY the four owned files changed
git diff -U0 | grep '^[-+]export' || echo OK    # no unintended export surface changes
```

Byte-stability check for static lint:
```bash
node -e "
  const { parseHeartbeat, lintHeartbeat, serializeLintReport } = require('./dist/adapters/heartbeat/lint.js');
  const f1 = parseHeartbeat('/tmp/test.md', '- Do the daily summary\n');
  const r1 = serializeLintReport(lintHeartbeat(f1));
  const r2 = serializeLintReport(lintHeartbeat(f1));
  console.assert(r1 === r2, 'NOT byte-stable');
  console.log('byte-stable: OK');
"
```

**Files**: none (verification only)

**Validation**:
- `pnpm build` green
- Full Vitest suite green with no new skips
- Byte-stability assertion passes
- `git diff --stat` shows only the four owned files

## Definition of Done

- [ ] `src/adapters/heartbeat/lint.ts`: `parseHeartbeat`, `loadManifest`, `applyManifest`,
  `lintHeartbeat`, `serializeLintReport` fully implemented and type-checking under `tsc` strict
- [ ] `src/adapters/heartbeat/tick.ts`: `IntervalConfig`, `SimulatedTick`, `buildIntervalConfig`,
  `buildScenarioFraming`, `loadTickState` fully implemented and type-checking
- [ ] `tests/heartbeat/lint.test.ts`: all T001–T005 scenarios covered; passes
- [ ] `tests/heartbeat/tick.test.ts`: all T003 scenarios covered; passes
- [ ] Static lint output is byte-stable and deterministic (T007 verification passes)
- [ ] Citations use the real pinned SHA, not the `<SHA>` placeholder
- [ ] `buildIntervalConfig` never hardcodes 60m; Anthropic OAuth default must be supplied
- [ ] No `src/core/` file modified; no existing file outside owned_files touched
- [ ] `pnpm build` + `pnpm test` green; no new skips; new-code coverage ≥80%

## Reviewer guidance

- **Reject if** any `src/core/` file is modified, any existing test file is changed,
  or the `<SHA>` citation placeholder was not replaced with the real pinned SHA.
- Check `isEmpty` logic: a file with one real instruction must NOT be empty even if
  surrounded by blank lines and comments — the spec edge case is a data-model invariant.
- Check `buildIntervalConfig`: must never contain a literal `60` as a default — the
  60-minute value is Anthropic-OAuth-specific and must come from the caller.
- Check `serializeLintReport`: findings must be sorted by rule in UTF-16 code-unit order
  (no `localeCompare`).
- Check citations: both `CITATIONS` values must contain the real pinned SHA and rubric
  reference, not placeholder text.
- For byte-stability: run the T007 verification command or ask for the output in the
  work log.

## Activity Log

- 2026-06-13T01:30:00Z – /spec-kitty.tasks – created
- 2026-06-13T14:26:28Z – claude:sonnet:implementer:implementer – Moved to in_progress
- 2026-06-13T14:30:57Z – claude:sonnet:implementer:implementer – Implemented on rebased code-only lane; build+test green, coverage >=89%
- 2026-06-13T14:33:58Z – claude:opus:reviewer:reviewer – Parser/manifest/lint correct; isEmpty edge case + UTF-16 sort + real pinned SHA; build+test green, coverage >=90%, no core/localeCompare/clock leakage
- 2026-06-13T14:53:15Z – claude:sonnet:implementer:implementer – Reopen: action-diff live observation contract fix (FR-004)
- 2026-06-13T14:59:42Z – claude:sonnet:implementer:implementer – Action observation contract implemented; action-diff matches ACTION: lines
- 2026-06-13T15:03:16Z – claude:opus:reviewer:reviewer – FR-004 fix: tick.ts adds ACTION_OBSERVATION_CONVENTION appended AFTER the verbatim OPENCLAW_HEARTBEAT_PROMPT (constant byte-identical, untouched by fix per git diff; C-003 honored). Convention is output-format only (ACTION: <label>), does not leak which items are due. WP01-owned files (tick.ts, lint.ts, tests) within owned_files; C-004 holds (no heartbeat in src/core). Build clean, 1872 pass/3 skip/0 type errors, heartbeat coverage 94.35% (tick.ts 93.7%).
- 2026-06-13T15:07:41Z – claude:sonnet:implementer:implementer – Reopen: tick-state semantics framing must convey due-tick meaning WITHOUT leaking the answer
- 2026-06-13T15:09:42Z – claude:sonnet:implementer:implementer – Non-leaky tick-state semantics added to framing
- 2026-06-13T15:11:31Z – claude:opus:reviewer:reviewer – Non-leaky tick-state framing; preserves probe integrity
