# Decision Moment `01KYV5PJKZHE4T2F6CGR6EJ3YZ`

- **Mission:** `conformance-programme-docs-01KYV5H0`
- **Origin flow:** `specify`
- **Slot key:** `specify.rubric-index.drift-check-repair-scope`
- **Input key:** `drift_check_repair_scope`
- **Status:** `resolved`
- **Created:** `2026-07-31T04:07:43.999681+00:00`
- **Resolved:** `2026-07-31T04:08:06.942087+00:00`
- **Opened by:** `cli`
- **Other answer:** `false`

## Question

Should the rubric-citation drift-check (FR-002) also mechanically repair skills-trigger-taxonomy.md's stale anchors (muster#80) as part of this mission, or ship the checker without touching #80 and let it go red?

## Options

- repair-anchors-now
- ship-checker-advisory-only
- defer-checker-until-80-fixed

## Final answer

repair-anchors-now: the drift-check is a byproduct of building the checker; repairing skills-trigger-taxonomy.md's stale file:line anchors is a purely mechanical pointer fix (no rubric judgment/severity content changes), so it does not violate the 'no rubric content changes beyond the index' scope guard, and it prevents shipping a citation-drift gate that is red from minute one.

## Rationale

_(none)_

## Change log

- `2026-07-31T04:07:43.999681+00:00` — opened
- `2026-07-31T04:08:06.942087+00:00` — resolved (final_answer="repair-anchors-now: the drift-check is a byproduct of building the checker; repairing skills-trigger-taxonomy.md's stale file:line anchors is a purely mechanical pointer fix (no rubric judgment/severity content changes), so it does not violate the 'no rubric content changes beyond the index' scope guard, and it prevents shipping a citation-drift gate that is red from minute one.")
