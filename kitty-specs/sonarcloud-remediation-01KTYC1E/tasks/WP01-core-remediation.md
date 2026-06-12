---
work_package_id: WP01
title: Core remediation (src/core)
dependencies: []
requirement_refs:
- FR-3
- FR-4
- FR-5
- FR-6
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-sonarcloud-remediation-01KTYC1E
base_commit: 0cd02046ea98ad89b4a54cc3589a53aaffb527b9
created_at: '2026-06-12T18:26:48.539308+00:00'
subtasks:
- T001
- T002
- T003
- T004
- T005
- T006
- T007
shell_pid: '1059627'
history:
- timestamp: '2026-06-12T18:19:06Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/core/
execution_mode: code_change
owned_files:
- src/core/canonical-json.ts
- src/core/behavioral/client.ts
- src/core/behavioral/manifest.ts
- src/core/behavioral/runner.ts
- src/core/cts/manifest.ts
- src/core/cts/runner.ts
tags: []
---

# WP01 — Core remediation (`src/core/**`)

## Objective

Fix every open SonarCloud finding located in `src/core/**` (24 findings: 1
bug, 1 security hotspot, 6 critical code smells, 16 major/minor smells) with
**zero behavior change**. This WP contains the two riskiest items of the
mission: the canonical-JSON sort comparator (byte-stable determinism
constraint) and a ReDoS-prone regex that parses untrusted BYOM endpoint
responses.

## Context (read first)

- Spec: `kitty-specs/sonarcloud-remediation-01KTYC1E/spec.md` (FR-3, FR-4,
  FR-5, FR-6.1; constraints; AC-4/AC-5)
- Research decisions: `kitty-specs/sonarcloud-remediation-01KTYC1E/research.md`
  — **D-3** (comparator), **D-4** (ReDoS), **D-8** (refactor rules)
- Issue inventory (authoritative list with issue keys):
  `kitty-specs/sonarcloud-remediation-01KTYC1E/sonar-inventory.md`
- Verification procedures:
  `kitty-specs/sonarcloud-remediation-01KTYC1E/quickstart.md`

**Hard rules for the whole WP** (from spec + charter):
1. Behavior-preserving only. No exported signature changes; no test edits
   (tests are owned by WP03 — if a core change breaks a test, the change is
   wrong, not the test).
2. The spec-agnostic core boundary stays intact: nothing RFC-1-specific moves
   into core.
3. Touch only files in `owned_files`.

## Subtasks

### T001 — S2871 comparator in `src/core/canonical-json.ts:53` (+ byte-stability guard)

**Issue**: `typescript:S2871` (CRITICAL, BUG) — "Provide a compare function…"

**⚠ THE TRAP**: Sonar's suggested `localeCompare` fix is **forbidden** here.
Canonical-JSON key ordering is v1's byte-stable determinism guarantee
(RFC 8785-style code-unit ordering). `localeCompare` is locale- and
ICU-dependent and would silently break it.

**Steps**:
1. Capture the baseline BEFORE changing anything:
   ```bash
   pnpm build
   node dist/cli/index.js cts run cts/manifest.yaml > /tmp/cts-before.out 2>&1 || true
   node dist/cli/index.js check souls/voice-frontdesk/Soul.md > /tmp/check-before.out 2>&1 || true
   ```
2. At `canonical-json.ts:53`, replace the bare `.sort()` with an explicit
   UTF-16 code-unit comparator:
   ```ts
   .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
   ```
   This encodes the engine's *current* default string ordering explicitly —
   provably zero output change. Add a one-line comment stating the constraint
   the code can't show: ordering must stay UTF-16 code-unit based for
   byte-stable canonical output (do NOT use localeCompare).
   Note: S3358 (nested ternary) is scoped to *statements*; a comparator
   arrow of this shape is the idiomatic exception and does not retrigger it —
   but if the analyzer flags it, extract a named `compareCodeUnits(a, b)`
   helper instead.
3. Rebuild and diff:
   ```bash
   pnpm build
   node dist/cli/index.js cts run cts/manifest.yaml > /tmp/cts-after.out 2>&1 || true
   node dist/cli/index.js check souls/voice-frontdesk/Soul.md > /tmp/check-after.out 2>&1 || true
   diff /tmp/cts-before.out /tmp/cts-after.out && diff /tmp/check-before.out /tmp/check-after.out
   ```
   **Both diffs MUST be empty.** Any byte of difference = revert and rethink.

**Validation**: empty diffs; `tests/unit/canonical-json.test.ts` passes
unmodified.

### T002 — ReDoS regex in `src/core/behavioral/client.ts:67` (security hotspot, dos/MEDIUM)

**Issue**: hotspot "regex … vulnerable to super-linear runtime due to
backtracking". This is a **real fix, not a review-away** (research D-4): the
regex runs over responses from untrusted, user-configured BYOM endpoints.

**Steps**:
1. Read the regex at `client.ts:67` and identify the super-linear construct
   (typically nested/overlapping quantifiers like `(a+)+`, `(\s*\S*)*`, or an
   alternation with common prefixes under a `*`).
2. Rewrite to a linear-time equivalent. Preferred order:
   a. Replace with plain string ops (`indexOf`/`slice`/`split`) if the
      pattern is structurally simple — this is the most robust fix.
   b. Otherwise restructure the regex: anchor it, make quantified groups
      mutually exclusive (no character can match in two adjacent quantified
      positions), avoid optional-inside-repeated groups.
3. Verify identical match behavior over representative inputs: run the
   behavioral test files that exercise the client (`pnpm test -- behavioral`)
   — they mock fetch with realistic payloads.
4. Sanity-check the pathological case: craft the classic attack string for
   the old pattern (e.g., long run of the repeated char + a final
   non-matching char) in a quick `node -e` one-liner and confirm the new code
   returns promptly.

**Validation**: behavioral tests pass unmodified; pathological input
completes in O(n). After merge, mark the hotspot resolved (the fix closes it
on re-analysis).

### T003 — Cognitive-complexity refactors in `src/core/behavioral/runner.ts` (S3776 ×3, S107)

**Issues** (all CRITICAL except S107 MAJOR):
- `runner.ts:97` — S3776 (reduce to ≤15)
- `runner.ts:235` — S3776 **and** S107 (`executeRun`, 8 params > 7)
- `runner.ts:338` — S3776

**Steps**:
1. For each flagged function, extract named, file-local helper functions per
   research D-8: guard clauses first, then per-case/per-branch handlers.
   Extraction only — identical control flow, no new branches, no removed
   short-circuits. Keep helpers `function`-declared near their caller,
   unexported.
2. For `executeRun` (235): fold the trailing parameters into a single options
   object (e.g., `ExecuteRunOptions` interface, file-local). Update **all**
   call sites inside `runner.ts`. Do not export the type; do not change the
   module's public surface.
3. Typical extraction seams in a k-of-n runner: attempt-loop body → 
   `runSingleAttempt(...)`; error-classification ladder →
   `classifyRunError(...)`; result aggregation → `aggregateVerdict(...)`.
   Follow the actual code, not this sketch — read the function fully before
   cutting.
4. Re-run `pnpm test` after EACH function refactor, not once at the end —
   bisectability is the point of behavior-preserving work.

**Validation**: all behavioral runner tests pass unmodified; no exported
symbol changed (`git diff` shows no `export` line touched).

### T004 — `runner.ts` line-107 cluster + catch rename (S7735 ×2, S3358, S4624, S7718)

**Issues** (all MINOR except S3358/S4624 MAJOR):
- `runner.ts:106,107` — S7735 unexpected negated condition ×2
- `runner.ts:107` — S3358 nested ternary + S4624 nested template literal
  (one expression triggering three rules)
- `runner.ts:451` — S7718 catch parameter naming

**Steps**:
1. Line ~106–107 is a stacked conditional/template expression. Decompose it:
   compute the parts as named `const`s with **positive** conditions
   (`if (x) … else …` or swapped ternary arms), then assemble one flat
   template literal. All three rules on 107 disappear with one decomposition.
   Do this AFTER T003 (the lines may have moved into a helper — fix it where
   it lives).
2. `runner.ts:451`: rename the catch binding to the rule's expected name
   (message says `error_`): `catch (error_)`. Rename uses inside the block.

**Validation**: `pnpm test` green; output strings byte-identical (these lines
build report/log text — compare a behavioral test snapshot if one covers it).

### T005 — `src/core/behavioral/manifest.ts` (S3776 ×2, S4325 ×4, S7735)

**Issues**:
- `manifest.ts:256, 339` — S3776 complexity (CRITICAL)
- `manifest.ts:284, 311, 425, 427` — S4325 unnecessary type assertion (MINOR)
- `manifest.ts:154` — S7735 negated condition (MINOR)

**Steps**:
1. Refactor the two complex functions per D-8 (extraction-only, same rules as
   T003). Manifest parsing/validation usually decomposes cleanly into
   per-field validators returning typed values.
2. Remove the four unnecessary `as`/non-null assertions — they're no-ops per
   the analyzer; deletion must compile under `tsc` strict. If deletion does
   NOT compile, the assertion wasn't unnecessary: investigate (likely the
   T005.1 refactor changed narrowing) and prefer a type guard over restoring
   the cast.
3. Flip the negated condition at 154 (swap branches / invert operator).

**Validation**: `pnpm build` (strict tsc) and `pnpm test` green, behavioral
manifest tests unmodified.

### T006 — `src/core/cts/manifest.ts` + `src/core/cts/runner.ts` (S3776, S7735 ×3, S3358)

**Issues**:
- `cts/manifest.ts:82` — S3776 complexity (CRITICAL)
- `cts/manifest.ts:148` — S7735 negated condition
- `cts/runner.ts:167, 280` — S7735 negated condition ×2
- `cts/runner.ts:239` — S3358 nested ternary (MAJOR)

**Steps**:
1. `cts/manifest.ts:82`: extraction-only refactor per D-8.
2. Flip the three negated conditions (positive-first branches).
3. `cts/runner.ts:239`: extract the nested ternary into an `if/else if/else`
   chain or named consts; this is CTS *report-path* code — output must stay
   byte-identical (the T007 diff will catch drift).

**Validation**: CTS suite (`tests/cts/suite.test.ts` and fixture runs) passes
unmodified.

### T007 — WP01 verification (gate for Definition of Done)

**Steps** (in order):
```bash
pnpm build                  # strict tsc + schema copy
pnpm test                   # FULL suite — zero failures, zero new skips
node dist/cli/index.js check souls/voice-frontdesk/Soul.md
node dist/cli/index.js cts run cts/manifest.yaml
diff /tmp/cts-before.out /tmp/cts-after.out      # from T001 — re-run after ALL subtasks
diff /tmp/check-before.out /tmp/check-after.out  # MUST be empty
git diff --stat             # ONLY the six owned files changed
```
Confirm no `export` declarations changed:
`git diff -U0 | grep '^[-+]export' || echo OK` → expect `OK`.

## Definition of Done

- [ ] All 24 `src/core/**` findings from `sonar-inventory.md` addressed in code
- [ ] T001 byte-diff empty (AC-5); comparator is code-unit based, no localeCompare anywhere
- [ ] T002 regex linear-time; behavioral tests pass unmodified
- [ ] `pnpm build` + `pnpm test` green; no test file touched; no new skips
- [ ] No exported API surface changed; no files outside `owned_files` modified
- [ ] Each subtask is its own commit (bisectable)

## Reviewer guidance

- **Reject if** any test file changed, any snapshot/fixture changed, or the
  T001 diff procedure is missing from the work log.
- Check the comparator: must be code-unit ordering with the constraint
  comment; `localeCompare` anywhere in the diff is an automatic reject.
- For each S3776 extraction, spot-check one refactored function: identical
  condition set and ordering, no behavior branch added/removed.
- For S4325 removals: confirm `tsc` strict passes (CI build is the proof).
- ReDoS fix: ask for the pathological-input check evidence (T002.4).
