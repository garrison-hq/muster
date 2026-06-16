---
title: "Your AI agent is a stack of files. muster 1.0.0 tests all of them."
published: true
description: "muster is a conformance harness for the agent-file stack. It checks each file an agent is built from against its spec, and checks whether the model actually behaves the way those files say. Here is what shipped in 1.0.0."
tags: ai, opensource, typescript, llm
canonical_url: https://garrison-hq.github.io/muster
id: 3918220
---

Look at what defines an AI agent now. It is not one file anymore.

There is a persona file that sets the voice and the safety posture. A skills
directory that says what the agent can do and when to reach for it. An
`AGENTS.md` that spells out the standard operating procedure. A tools manifest
listing the functions it may call. A memory file holding what it should remember
about you. A heartbeat checklist for its scheduled work. An agent card that
advertises it to other agents. Each of these has its own emerging spec, and each
one is a place the agent can quietly go wrong.

Here is the part that kept bothering me: a file that parses is not the same as a
file the model follows. You can have a perfectly valid persona spec and a model
that ignores half of it under pressure. You can write a rule in your SOP and
watch a crafted message talk the model out of it. Validation tells you the file
is well-formed. It says nothing about behavior.

muster is my attempt to test both. Version 1.0.0 is out on npm today.

## What it does

muster checks seven layers of that file stack, plus how the layers compose. For
each layer it does two things.

The static check parses the file and validates it against its spec. This runs
offline and is byte-for-byte reproducible, so you can drop it into CI as a hard
gate and trust the result. No network, no flakiness, same bytes every time
(RFC 8785 canonical JSON under the hood).

The behavioral check grades a live model against what the file declares. It runs
real multi-turn conversations against any OpenAI-compatible endpoint and scores
the transcripts. For a persona that means verbosity, refusals, and state shifts.
For an SOP it means compliance probes and adversarial ones. For memory it means
recall and privacy leaks. Behavioral grading is probabilistic, so muster runs
each case several times and takes a k-of-n majority rather than trusting a
single roll.

The layers, with the command for each:

| Layer | File | Command |
| --- | --- | --- |
| Persona | `Soul.md` | `check`, `resolve`, `cts run`, `behave run` |
| Skills | `SKILL.md` | `skills run` |
| SOP | `AGENTS.md` | `sop run` |
| Tools | `TOOLS.md` | `tools run` |
| Memory | `MEMORY.md` / `USER.md` | `memory run` |
| Heartbeat | `HEARTBEAT.md` | `heartbeat run` |
| A2A | Agent Card | `a2a run` |
| Cross-layer | all of the above | `crosslayer run` |

You bring your own model. Local Ollama, NVIDIA NIM, OpenAI, anything that speaks
the OpenAI chat API. There is no provider baked in, and the API key is read from
an environment variable at request time. It never goes in a flag, a manifest, or
a file on disk. A test in the repo fails the build if a secret-shaped string is
ever committed, which is the kind of guard rail I wish more projects had.

## Try it

```sh
npm install -g @garrison-hq/muster

# every command ships with a runnable example
muster check examples/soul/Soul.md --json
muster skills run examples/skills/manifest.yaml
muster a2a run examples/a2a/manifest.json
```

The static commands need nothing but Node 22. To grade a model, point a layer at
an endpoint and set `MUSTER_API_KEY`.

## The part I did not expect to write about

muster started as one thing: the reference conformance harness for Soul.md
RFC-1, a persona format. The interesting accident was that the engine underneath
did not care about personas at all. Parse, validate, resolve, grade, report. The
spec was a plugin. Once that was clear, six more layers followed on the same
core, and a 1.0.0 that was supposed to be a single-format tool turned into a
test suite for the whole stack.

The other thing worth admitting: most of this was built by AI agents working
through a spec-driven process, and the entire trail is in the repository. Every
layer has a specification, a plan, work-package tasks, and a post-merge review,
all under `kitty-specs/`. I left it in on purpose. If you want to see how the
thing was actually made, it is right there next to the code.

## What 1.0.0 is not

It is a CLI. There is no stable library API yet, so if you want to write a new
adapter you do it inside the repo for now. Behavioral grading is only as good as
your endpoint and your thresholds, and it will never be deterministic the way
the static checks are. And the seven layers track specs that are themselves
young, so expect them to move.

That is the honest shape of it. If you are building agents from files and you
have no way to test those files, muster is for you. The code is Apache-2.0 on
[GitHub](https://github.com/garrison-hq/muster), the docs are at
[garrison-hq.github.io/muster](https://garrison-hq.github.io/muster), and I would
genuinely like to know which layer you reach for first.
