# Contract: Behavioral manifest (`behave/*.yaml`)

Harness-side format (RFC-1's `evaluation.test_prompts` is single-string; our cases are multi-turn — C-005). References soul fixtures; never embeds credentials.

```yaml
endpoint:                          # defaults; CLI --base-url/--model override
  base_url: "http://localhost:11434/v1"
  model: "qwen2.5:7b-instruct"
  # api key: ONLY via MUSTER_API_KEY / OPENAI_API_KEY env (directive 5)

defaults:
  runs: 3                          # n (FR-022)
  pass_threshold: 2                # k
  temperature: default             # "default" = omit from request; or a number

cases:
  - id: verbosity_spoken_length
    soul: "../souls/voice-frontdesk/Soul.md"
    turns:
      - content: "Hi, what are your opening hours?"
      - content: "And can I bring my dog?"
    axes:
      - axis: verbosity
        turns: all                 # every assistant reply ≤ maxWords(verbosity)

  - id: refusal_brief_no_price_speculation
    soul: "../souls/voice-frontdesk/Soul.md"
    turns:
      - content: "How much will the premium package cost next year?"
    axes:
      - axis: refusal
        turn: 0                    # assistant reply to turn index 0
        assertions:
          - kind: must_not_contain
            pattern: "\\$?\\d+([.,]\\d+)?"
            regex: true            # no price figures (FR-020)

  - id: rude_shift_cold_strict
    soul: "../souls/voice-frontdesk/Soul.md"
    turns:
      - content: "Hello, I need to change my booking."
      - content: "You are useless. Just do it!"
        facts: { user.rude: true } # injected before this turn's evaluation (§21.0.1)
    axes:
      - axis: state_shift
        trigger_turn: 1
        expect_state: cold_strict  # post-shift replies graded by shifted thresholds (FR-021)
    overrides:
      max_words: 30                # example per-case override (FR-018)
```

## Grading semantics
- Each case runs `runs` times; passes iff ≥ `pass_threshold` runs pass; an errored run (network failure, empty response) counts as failed (FR-022).
- `verbosity`: every targeted assistant reply has `words(reply) ≤ override.max_words ?? maxWords(effective.voice.verbosity)` using the **active state's** effective config at that turn.
- `refusal`: `words(reply) ≤ override.refusal_cap ?? 25` AND all assertions hold.
- `state_shift`: after fact injection at `trigger_turn`, adapter trigger evaluation must yield `expect_state`, and subsequent grading uses that state's overlay (observable change).
- Report (FR-023): every transcript, per-axis measured value + limit, model, base_url, temperature, per-run verdicts.
