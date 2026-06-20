# Contract: A2A Behavioral Manifest Schema

**Mission:** `a2a-behavioral-conformance-01KVJDWE` · **Spec:** FR-004, FR-005, FR-012 ·
**Decision:** Q2 = C (persona reference optional **and/or** explicit thresholds).

Strict YAML. **Unknown/extra fields are rejected** at load time (reuses the core
strict-validation discipline from `src/core/behavioral/manifest.ts`). **No literal key or
token value may ever appear** — only environment-variable *names* (NFR-002, repository
key-invariant test).

## Top-level

```yaml
adapter: a2a                 # required discriminator
kind: behavioral             # required: selects the behavioral path (vs static/skill/auth/signed)
endpoint:                    # required for live cases
  env: MUSTER_A2A_ENDPOINT   # env-var NAME holding the base URL (default: MUSTER_A2A_ENDPOINT)
  token_env: MUSTER_A2A_TOKEN  # env-var NAME holding the bearer token (default: MUSTER_A2A_TOKEN)
defaults:                    # optional; per-case fields override
  runs: 3                    # >= 1, default 3
  pass_threshold: 2          # >= 1 and <= runs, default 2
cases: [ ... ]               # required, >= 1
```

Allowed top-level fields: `{adapter, kind, endpoint, defaults, cases}` — strict.
Allowed `endpoint` fields: `{env, token_env}` — strict; both are env-var names.
Allowed `defaults` fields: `{runs, pass_threshold}` — strict.

## Case

```yaml
- id: escalation-stays-terse          # required, non-empty, unique
  soul: ../../souls/voice-frontdesk/Soul.md   # OPTIONAL (decision C): resolved → EffectiveConfig → thresholds
  thresholds:                          # OPTIONAL (decision C): explicit, override persona-derived
    default_max_words: 40
    states:                            # per-state shifted limits (black-box state, B4)
      escalated: 25
  turns:                               # required, >= 1; role is always "user"
    - role: user
      content: "I've asked three times and nothing works."
      facts: { frustration: true }     # OPTIONAL: drives muster's EXPECTED state only — never sent to the agent
  axes:                                # required, >= 1
    - { axis: verbosity, turns: all }
    - { axis: refusal, turn: 2, assertions: [ { kind: must_not_contain, pattern: "account number" } ] }
    - { axis: state_shift, trigger_turn: 1, expect_state: escalated }
  overrides: { max_words: 50, refusal_cap: 20 }   # OPTIONAL, reused as-is
  runs: 5                              # OPTIONAL, overrides defaults
  pass_threshold: 4                    # OPTIONAL, overrides defaults
```

Allowed case fields: `{id, soul, thresholds, turns, axes, overrides, runs, pass_threshold}` — strict.

### Reused unchanged from core (`src/core/behavioral/manifest.ts`)

- `turns[]` → `Turn { role:"user", content, facts? }`
- `axes[]` → `AxisSpec` union: `{axis:verbosity, turns:number[]|"all"}` |
  `{axis:refusal, turn, assertions?}` | `{axis:state_shift, trigger_turn, expect_state}`
- `assertions[]` → `ContentAssertion { kind: must_contain|must_not_contain, pattern, regex? }`
- `overrides` → `CaseOverrides { max_words?, refusal_cap? }`
- `runs` / `pass_threshold` defaulting (3 / 2, `pass_threshold ≤ runs`)

### Net-new for A2A

- `endpoint.{env, token_env}` (env-var names; replaces chat `endpoint.{base_url, model, api_key_env}`).
- `thresholds.{default_max_words, states{<state>:limit}}` (decision C explicit source).
- `soul` is OPTIONAL here (in the chat manifest it is required).

## Threshold resolution (decision C — precedence)

1. If `thresholds` present → use it (explicit wins).
2. Else if `soul` present → resolve `EffectiveConfig`, derive `maxWords = 10 + voice.verbosity`
   per active/shifted state.
3. Per-case `overrides.max_words` / `overrides.refusal_cap` override the chosen source for that case.
4. If an axis needs a verbosity/state limit and **neither** `thresholds` nor `soul` resolves
   one → **load-time error** (a refusal-only case with `overrides.refusal_cap` is valid with neither).

## Validation rules (testable)

- Unknown field at any level → error naming the field (FR-005).
- A literal-looking key/token under `endpoint` (value not an env-var name) → error (NFR-002).
- `pass_threshold > runs` → error.
- Empty `turns` or empty `axes` → error.
- `state_shift.trigger_turn` / `refusal.turn` out of range of `turns` → error.
- Duplicate case `id` → error.
