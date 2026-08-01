# Decision Moment `01KYV5PYR59PZDF1XSZQAP9NAK`

- **Mission:** `conformance-programme-docs-01KYV5H0`
- **Origin flow:** `specify`
- **Slot key:** `specify.exit-code-contract.correction-scope`
- **Input key:** `exit_code_correction_scope`
- **Status:** `resolved`
- **Created:** `2026-07-31T04:07:56.421637+00:00`
- **Resolved:** `2026-07-31T04:08:10.763609+00:00`
- **Opened by:** `cli`
- **Other answer:** `false`

## Question

examples/README.md line 5 states a blanket 'endpoint unreachable -> exit 2' rule. Code confirms this is TRUE for behave/a2a (deliberate, cited to contracts/cli.md) but FALSE for skills/sop (which exit 1 for the same scenario, per muster#78's own measured evidence). Should the fix be a narrow, adapter-specific correction (skills row + new per-adapter exit-code table) with the divergence recorded as a new gaps-register entry, or a blanket rewrite asserting exit 1 universally?

## Options

- narrow-adapter-specific-correction
- blanket-universal-rewrite

## Final answer

narrow-adapter-specific-correction: rewrite examples/README.md line 5/19 to match muster#78's actual skills-adapter evidence and add a per-adapter exit-code table; record the behave/a2a-vs-skills/sop total-endpoint-failure divergence as a new recorded-gaps register entry rather than erasing behave/a2a's real, deliberately-coded, contracts/cli.md-cited exit-2 behavior.

## Rationale

_(none)_

## Change log

- `2026-07-31T04:07:56.421637+00:00` — opened
- `2026-07-31T04:08:10.763609+00:00` — resolved (final_answer="narrow-adapter-specific-correction: rewrite examples/README.md line 5/19 to match muster#78's actual skills-adapter evidence and add a per-adapter exit-code table; record the behave/a2a-vs-skills/sop total-endpoint-failure divergence as a new recorded-gaps register entry rather than erasing behave/a2a's real, deliberately-coded, contracts/cli.md-cited exit-2 behavior.")
