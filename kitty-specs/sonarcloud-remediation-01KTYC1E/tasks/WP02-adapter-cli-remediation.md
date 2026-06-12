---
work_package_id: WP02
title: Adapter & CLI remediation (src/adapters/rfc1, src/cli)
dependencies: []
requirement_refs:
- FR-4
- FR-5
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-12T18:19:06Z'
subtasks:
- T008
- T009
- T010
- T011
- T012
- T013
agent: "claude:opus:reviewer:reviewer"
shell_pid: "1157557"
history:
- timestamp: '2026-06-12T18:19:06Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/adapters/
execution_mode: code_change
owned_files:
- src/adapters/rfc1/resolve.ts
- src/adapters/rfc1/state.ts
- src/adapters/rfc1/evaluation.ts
- src/adapters/rfc1/keyspace.ts
- src/adapters/rfc1/frontmatter.ts
- src/adapters/rfc1/index.ts
- src/cli/index.ts
- src/cli/output.ts
tags: []
---

# WP02 — Adapter & CLI remediation (`src/adapters/rfc1/**`, `src/cli/**`)

## Objective

Fix every open SonarCloud finding in the RFC-1 adapter and the CLI (19
findings: 4 critical complexity, 3 critical void-operator, 12 major/minor
smells) with **zero behavior change**. `resolve.ts` and `state.ts` implement
RFC-1's deterministic composition resolution — the highest-care files here.

## Context (read first)

- Spec: `kitty-specs/sonarcloud-remediation-01KTYC1E/spec.md` (FR-4, FR-5)
- Research: `kitty-specs/sonarcloud-remediation-01KTYC1E/research.md` — **D-8**
  (refactor rules: extraction-only, no exported-signature changes)
- Inventory: `kitty-specs/sonarcloud-remediation-01KTYC1E/sonar-inventory.md`
- Quickstart: `kitty-specs/sonarcloud-remediation-01KTYC1E/quickstart.md`

**Hard rules**: behavior-preserving only; no test edits (WP03 owns tests);
adapter/core boundary untouched; only `owned_files` modified. The static path
(`muster check`, `muster cts run`) must produce byte-identical output — these
adapters ARE the static path.

## Subtasks

### T008 — `src/adapters/rfc1/resolve.ts` (S3776 ×2 CRITICAL, S7778 ×2 MINOR)

**Issues**: complexity at lines 102 and 254 (reduce to ≤15); multiple
consecutive `Array#push()` at 196 and 344.

**Steps**:
1. Baseline first (this file is the resolution engine):
   ```bash
   pnpm build && node dist/cli/index.js cts run cts/manifest.yaml > /tmp/wp02-before.out 2>&1 || true
   ```
2. Refactor the two flagged functions per D-8. Resolution code typically
   seams along: reference-loading vs cycle-detection vs merge-application —
   extract those phases as named file-local helpers with explicit parameter
   lists. **Do not reorder operations**: resolution order is normative
   (RFC-1 §7.5) and tested by CTS fixtures.
3. S7778: merge consecutive `push(a); push(b);` into `push(a, b)` (or build
   an array literal and spread once). Pure syntax — element order unchanged.
4. `pnpm test` after each function.

**Validation**: CTS fixture suite passes unmodified;
`diff /tmp/wp02-before.out <(node dist/cli/index.js cts run cts/manifest.yaml 2>&1)` empty.

### T009 — `src/adapters/rfc1/state.ts` (S3776 ×2 CRITICAL, S6353 ×2 MINOR)

**Issues**: complexity at lines 81 and 285; verbose regex character class
`[A-Za-z0-9_]` twice at line 230.

**Steps**:
1. Refactor the two functions per D-8. State/trigger evaluation usually seams
   along per-trigger-kind handlers — extract them; keep the dispatch order
   identical.
2. Line 230: replace `[A-Za-z0-9_]` with `\w` **only after confirming** the
   regex has no `u`-flag/Unicode subtlety concern: `\w` ≡ `[A-Za-z0-9_]` in
   JS for both unicode and non-unicode flags, so this is safe — note it in
   the commit message. Two occurrences on the same line.

**Validation**: state-shift behavioral/unit tests pass unmodified.

### T010 — rfc1 small fixes: `evaluation.ts`, `keyspace.ts`, `frontmatter.ts`, `index.ts` (6 issues)

**Issues**:
- `evaluation.ts:96` — S3358 nested ternary (MAJOR): extract to `if/else`
  or named consts.
- `evaluation.ts:59` — S7753: use `.indexOf(x)` instead of
  `.findIndex(...)` when searching for an item by identity.
- `keyspace.ts:116` (×2), `keyspace.ts:302` — S7781: `replace(/…/g, …)` →
  `replaceAll()`. **Check each**: `replaceAll` with a regex requires the `g`
  flag (throws otherwise); with a string pattern it replaces all occurrences
  (`replace` with string only replaces the first — if the original was a
  string-pattern `replace`, verify the intent really was replace-ALL before
  swapping; if intent was replace-first, mark the issue accepted instead).
- `frontmatter.ts:26` — S7758: `charCodeAt` → `codePointAt`. This scans
  frontmatter bytes; for code points < 0x80 (ASCII delimiters) the two are
  identical. Confirm the comparison target is ASCII; if the code does
  surrogate-aware arithmetic, keep semantics and add the rule exception
  comment instead.
- `index.ts:129` — S3735 (CRITICAL): remove the `void` operator. If it
  discards a promise, replace with an explicit ignored-promise pattern the
  linter accepts (e.g. `.catch(() => {})` if fire-and-forget was intended —
  read the surrounding code; in an adapter entry point it is more likely a
  leftover that should be `await`ed or simply dropped).

**Validation**: `pnpm test` green; keyspace unit behavior identical (these
functions normalize RFC-1 keys — covered by CTS fixtures).

### T011 — `src/cli/index.ts` (S3735 ×2 CRITICAL, S3358, S7785, S7735)

**Issues**:
- `cli/index.ts:498, 499` — S3735 remove `void` operator ×2
- `cli/index.ts:132` — S3358 nested ternary → statement
- `cli/index.ts:547` — S7785 prefer top-level await over promise chain
- `cli/index.ts:350` — S7735 negated condition

**Steps**:
1. Lines 498–499: these `void` uses likely discard promises around command
   dispatch. Replace with proper handling: package.json is ESM
   (`"type": "module"`), so awaiting is available at top level.
2. Line 547: the entry-point promise chain (`main().then/.catch` pattern) →
   top-level `await` with `try/catch` setting `process.exitCode`. **Preserve
   exact exit-code semantics** — CI consumers depend on them (charter: CLI +
   CI exit codes are the product surface). Check how the current chain maps
   rejections to exit codes and reproduce it 1:1.
3. Lines 132, 350: standard ternary extraction / condition flip.
4. Smoke both paths after:
   ```bash
   pnpm build
   node dist/cli/index.js check souls/voice-frontdesk/Soul.md; echo "exit=$?"
   node dist/cli/index.js cts run cts/manifest.yaml; echo "exit=$?"
   node dist/cli/index.js check /nonexistent.md; echo "exit=$? (expect nonzero, same code as before the change)"
   ```

**Validation**: exit codes identical for success AND failure paths; CLI unit
tests pass unmodified.

### T012 — `src/cli/output.ts` (S7735, S7780)

**Issues**:
- `output.ts:17` — S7735 negated condition → flip branches
- `output.ts:98` — S7780 use `String.raw` to avoid `\\` escaping

**Steps**: mechanical. For S7780: `String.raw\`...\`` only where the literal
contains escaped backslashes and **no** intended escape sequences (`\n`, `\t`)
— if the literal mixes both, leave it and mark accepted with a note.
Output.ts builds the violation report text: confirm emitted strings are
byte-identical (covered by T013 smoke diff).

**Validation**: report output byte-identical.

### T013 — WP02 verification (gate for Definition of Done)

```bash
pnpm build                  # strict tsc
pnpm test                   # FULL suite — zero failures, zero new skips
node dist/cli/index.js check souls/voice-frontdesk/Soul.md > /tmp/wp02-check-after.out; echo "exit=$?"
node dist/cli/index.js cts run cts/manifest.yaml > /tmp/wp02-cts-after.out; echo "exit=$?"
diff /tmp/wp02-before.out /tmp/wp02-cts-after.out    # empty (T008 baseline)
git diff --stat             # ONLY the eight owned files
git diff -U0 | grep '^[-+]export' || echo OK         # expect OK
```

## Definition of Done

- [ ] All 19 findings in `src/adapters/rfc1/**` + `src/cli/**` addressed
- [ ] CTS fixture output and CLI report output byte-identical; exit codes
      identical on success and failure paths
- [ ] `pnpm build` + `pnpm test` green; no test file touched
- [ ] No exported API surface changed; no files outside `owned_files`
- [ ] Any accepted-instead-of-fixed item (T010 replaceAll/codePointAt edge,
      T012 String.raw mix) documented with one-line justification in the work log

## Reviewer guidance

- `resolve.ts`/`state.ts` refactors: verify extraction-only — same predicates,
  same order, no merged branches. These implement normative RFC-1 resolution;
  drift here is a spec-fidelity failure (DIRECTIVE_010).
- T011 exit-code preservation: demand the smoke evidence including the
  failure-path exit code.
- `replaceAll` swaps: check each original — regex-with-g (safe) vs
  string-pattern-replace-first (semantics change → must be accepted, not
  swapped).

## Activity Log

- 2026-06-12T18:43:47Z – claude:sonnet:implementer:implementer – shell_pid=1118999 – Started implementation via action command
- 2026-06-12T18:55:54Z – claude:sonnet:implementer:implementer – shell_pid=1118999 – Ready for review: 19 adapter/CLI findings fixed, output+exit codes byte-identical, suite green (567/567, 30 files)
- 2026-06-12T18:56:34Z – claude:opus:reviewer:reviewer – shell_pid=1157557 – Started review via action command
- 2026-06-12T18:59:57Z – claude:opus:reviewer:reviewer – shell_pid=1157557 – Review passed: 19 findings remediated extraction-only across 8 owned files; resolve.ts/state.ts §7.5 resolution + trigger eval verified identical predicate sets/order/branches; T011 top-level-await preserves exit codes (success=0, failure=2 matches base, cts=0); CTS+check+failure output byte-identical to base; no export signatures changed; build clean; 567/567 tests green, no new skips
