---
title: Behavioral conformance
description: Grading a bring-your-own model against a soul's declared axes.
---

Behavioral conformance tests the **model**. Given a soul and an
OpenAI-compatible endpoint, muster runs multi-turn test conversations and grades
the model's transcripts against three objectively-measurable axes the soul
declares.

The checker is **turn-list in, transcript out** and multi-turn from the ground
up — single-turn cases are just turn lists of length one.

## The three axes

| Axis | What it checks |
|------|----------------|
| **Verbosity** | Each graded reply's word count stays within the soul's verbosity-derived cap. |
| **Brief refusals** | A refusal stays under the refusal word cap and satisfies content assertions (e.g. "states no price"). |
| **Dynamic state shift** | Injecting a fact (e.g. `user.rude`) at a turn shifts the active state (e.g. `cold_strict`), and the post-shift output observably conforms to the shifted state. |

These are deliberately the objectively-gradable axes — there is no fuzzy
"LLM-as-judge" for subjective qualities. Every grade records the `measured`
value and the `limit` it was checked against, so a failure is always
explainable.

## k-of-n grading

Models are stochastic, so each case runs `runs` times (default 3) and passes
iff at least `pass_threshold` (default 2) runs pass. An errored run counts as a
failed run. Temperature stays at the provider default unless overridden and is
recorded in every transcript.

## Bring your own model

The behavioral runner talks to any endpoint speaking the OpenAI
`/chat/completions` API. Nothing but configuration changes between providers.

```sh
# Local — Ollama
ollama pull qwen2.5:7b-instruct
muster behave run behave/voice-frontdesk.yaml     # defaults to localhost:11434/v1

# Hosted — NVIDIA NIM (or any compatible provider)
export MUSTER_API_KEY="..."                        # env only; never a flag or file
muster behave run behave/voice-frontdesk.yaml \
  --base-url https://integrate.api.nvidia.com/v1 \
  --model meta/llama-3.1-8b-instruct
```

The API key is read from `MUSTER_API_KEY` (fallback `OPENAI_API_KEY`) at request
time. It never appears in argv, transcripts, or committed results — and must
never be committed to a repository.

See [Behavioral thresholds](/muster/reference/thresholds/) for the exact
word-count mapping and how per-case overrides work.
