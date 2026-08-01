# Decision Moment `01KYV5PWTVK8921KT5R6W2Y9WP`

- **Mission:** `conformance-programme-docs-01KYV5H0`
- **Origin flow:** `specify`
- **Slot key:** `specify.operator-guide.aspirational-suite-table`
- **Input key:** `aspirational_suite_table_treatment`
- **Status:** `resolved`
- **Created:** `2026-07-31T04:07:54.459784+00:00`
- **Resolved:** `2026-07-31T04:08:08.899416+00:00`
- **Opened by:** `cli`
- **Other answer:** `false`

## Question

The M9 issue's test-strategy table (section 11) cites conformance/* manifest paths in spec-kitty-conformance that mostly do not exist yet (crosslayer, behavioral profiles/directives, skills behavioral-manifest are all absent or unimplemented; skprofile/doctrine paths are wrong). Should the operator guide (FR-001) include this as a clearly-labeled forward-looking/planned table with no runnable commands, or omit it entirely until M4/M6 land?

## Options

- labeled-forward-looking-table
- omit-until-m4-m6-land
- include-as-runnable-anyway

## Final answer

labeled-forward-looking-table: include the test-strategy table as an explicitly-labeled planned/pending-M4-M6 appendix with no verification commands attached to rows that reference non-existent conformance/* paths, so the guide stays honest under AC-1 doc-test discipline instead of fabricating runnable examples.

## Rationale

_(none)_

## Change log

- `2026-07-31T04:07:54.459784+00:00` — opened
- `2026-07-31T04:08:08.899416+00:00` — resolved (final_answer="labeled-forward-looking-table: include the test-strategy table as an explicitly-labeled planned/pending-M4-M6 appendix with no verification commands attached to rows that reference non-existent conformance/* paths, so the guide stays honest under AC-1 doc-test discipline instead of fabricating runnable examples.")
