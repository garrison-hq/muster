# Decision Moment `01KYJFARP9P2YYWCE81WMAP4JT`

- **Mission:** `skills-behavioral-enablement-01KYJFAC`
- **Origin flow:** `specify`
- **Slot key:** `specify.scope.a2a-control-inversion`
- **Input key:** `a2a_control_inversion_in_scope`
- **Status:** `resolved`
- **Created:** `2026-07-27T19:02:52.873198+00:00`
- **Resolved:** `2026-07-27T19:03:09.558236+00:00`
- **Opened by:** `cli`
- **Other answer:** `false`

## Question

Issue #62 found a second, structurally-related discrimination-control defect in the a2a adapter's applyControlInversion (a control:true static-lint case whose fixture is deleted inverts a read-error's passed:false to passed:true, same as the skills bug but via inversion rather than the expectation-derived catch). Should M5 (skills-behavioral-enablement) also fix the a2a instance, or stay scoped to the skills adapter and track a2a separately?

## Options

- Fix both in M5 (single mission, both adapters)
- Fix skills only in M5; file a separate follow-up issue/mission for a2a
- Fix skills only in M5; no action recorded for a2a

## Final answer

Fix skills only in M5; file a separate follow-up issue/mission for a2a

## Rationale

_(none)_

## Change log

- `2026-07-27T19:02:52.873198+00:00` — opened
- `2026-07-27T19:03:09.558236+00:00` — resolved (final_answer="Fix skills only in M5; file a separate follow-up issue/mission for a2a")
