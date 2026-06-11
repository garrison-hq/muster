<!--
Thanks for the PR. Confirm the checklist below so review can focus on
the change itself. See CONTRIBUTING.md for context on each item.
-->

## What this changes

<!-- One paragraph. WHY this change is needed, not what the code does. -->

## Linked issue

<!-- Non-trivial PRs should link an issue (CONTRIBUTING.md §"Open an issue first").
     If this is a typo or obvious bug fix, say so instead of linking. -->

Fixes #

## Conformance impact

<!-- Does this change how a Soul document is validated or resolved? -->

- [ ] No conformance behavior changes (tooling / docs / refactor).
- [ ] Conformance behavior changes — the relevant RFC-1 section is cited in the
  code and in the new/changed test names:

<!-- e.g. "§8.2 — lists replace entirely; removed the accidental union path." -->

## Checklist

- [ ] Read `CONTRIBUTING.md`.
- [ ] `pnpm build` (tsc strict) passes with zero errors.
- [ ] `pnpm test` passes (full suite incl. the CTS fixture suite; runs offline).
- [ ] Scope is minimal — no unrelated cleanup, no speculative abstractions.
- [ ] No new **runtime** dependency, or it is justified in a commit-message
  paragraph (what it does, why stdlib/an existing dep is insufficient,
  alternatives considered).
- [ ] No `src/core/` → `src/adapters/` import introduced.
- [ ] No secrets, API keys, or absolute local paths committed.
- [ ] Any new `cts/` fixture's `expected.json` was computed by hand from the
  spec, not captured from current output; the fixture body cites the clause it
  exercises.
- [ ] Docs updated in the same PR if behavior changed (README, and the relevant
  mission spec/plan if working inside `kitty-specs/`).

## Notes for reviewers

<!-- Tricky bits, known limitations, trade-offs — anything that saves review time. -->
