# muster v1-extended — testing the full agent-file stack: a project brief

**Status:** pre-research seed. This brief feeds (1) a deep-research pass to
verify the landscape claims and close the open questions, then (2) a
spec-kitty run (charter → specify → plan → tasks). Nothing here is locked
except the scope guard and the carried-over constraints.

---

## Where v1 left off

muster today is the reference CTS-1 conformance harness for **Soul.md RFC-1**
(`1.0.0-rc1`): static conformance (parse → schema → §25 rules → deterministic
resolution → violation report) plus behavioral conformance (k-of-n grading of
a bring-your-own model against a soul's declared axes). The architecture that
matters for v2 is already in place and enforced by test: a **spec-agnostic
core** (merge, pipeline, canonical JSON, CTS runner, behavioral
runner/graders/client) behind an **adapter boundary**, with RFC-1 as the
first adapter.

## The thesis

SOUL.md is one layer of a stack. Agent definitions in the wild decompose into
roughly seven layers, each with its own file convention or spec, and every
layer reduces to the same harness shape muster already has:

> fixture files + scenario → run agent → **pluggable assertion** on the transcript

What varies per layer is the assertion type, not the engine. And persona —
the layer v1 already handles — is the *fuzziest* assertion of the lot
(rubric-graded tone/verbosity). Almost every other layer has crisper
pass/fail semantics. If the harness can grade souls, the rest of the stack is
downhill: new adapters and assertion plugins, not a new product.

The differentiating claim for v2: **no existing tool tests the assembled
stack.** These files compose into one context and they conflict — a soul's
"warm and accommodating" eroding a security rule in the SOP layer, a skill
contradicting stored memory, undefined precedence between layers. Cross-layer
conflict and rule-survival testing is the gap.

## The layer landscape (to be verified by the research pass)

| Layer | File / spec | Governing text | Maturity | Primary assertion type |
|---|---|---|---|---|
| Persona | `SOUL.md` — Soul.md RFC-1; SoulSpec v0.4–0.5 package (`soul.json` + SOUL/IDENTITY/STYLE) | RFC-1 is normative; SoulSpec is a community package convention | RFC + draft | LLM-judge rubric, k-of-n *(shipped in v1)* |
| Instructions / SOP | `AGENTS.md` — both the cross-vendor agents.md standard (README-for-agents) and the OpenClaw workspace role (rules, routing, security policy) | agents.md standard text; OpenClaw docs are conventions | standard / convention | Binary compliance probes; adversarial (injection, scope-escape) |
| Skills | `SKILL.md` — Anthropic Agent Skills (frontmatter `name`/`description` + body, on-demand loading) | Anthropic spec | spec | Trigger tests (fires / stays quiet on paraphrase sets) + outcome tests |
| Tools | `TOOLS.md` (OpenClaw convention); MCP as the runtime counterpart | convention / protocol | convention | Tool-selection probes + **drift lint** (file vs. live environment) |
| Memory | `MEMORY.md`, `USER.md` (OpenClaw) | convention | convention | Recall probes; **leak probes** (withhold in group context); staleness/contradiction lint |
| Schedule | `HEARTBEAT.md` | convention | convention | Action-diff on simulated ticks; idempotency; quiet-when-nothing-to-do |
| Manifests | `soul.json`; A2A Agent Cards | SoulSpec; A2A protocol (Linux Foundation) | spec | JSON Schema; optional live contract test |

Two structural observations the design should respect:

- **Three test classes, not one.** *Static lint* (schema, structure,
  contradiction detection — offline, deterministic, cheap), *behavioral
  probes* (scenario → transcript → assert — stochastic, k-of-n), and *drift
  checks* (file vs. reality: documented tools exist, schemas match, dates
  aren't stale). v1 has the first two; drift is new.
- **Not every layer has a normative spec.** Where one exists (RFC-1, Agent
  Skills, A2A, agents.md), the v1 traceability rule holds: every check cites
  its clause. Where the layer is convention-only (TOOLS, MEMORY, HEARTBEAT),
  muster must publish its *own* documented rubric per check and cite that —
  the rule becomes "every check cites a normative source, upstream or ours,"
  never an unwritten opinion.

## Cross-layer testing (the headline feature)

The assembled-context test class, sketched:

- **Rule survival under persona** — load soul + SOP together; run the SOP's
  compliance probes; assert pass rates don't degrade versus SOP-alone.
  Failure means the persona is eroding a rule.
- **Precedence conflicts** — fixtures where layers give contradictory
  instructions; assert the documented precedence (if the stack defines one)
  or flag undefined precedence as a static finding.
- **Memory/skill contradiction lint** — static cross-file check: a skill
  instructing what MEMORY.md contradicts, USER.md facts conflicting with
  IDENTITY.md backstory.
- **Privacy boundary** — MEMORY.md content must not surface in group-context
  scenarios (the convention's own rule, made executable).

## Carried-over constraints (non-negotiable, from v1)

1. **Spec-agnostic core, adapters at the edge** — each layer is an adapter;
   the core never learns layer specifics. Already enforced by test.
2. **Static path fully offline and byte-stable deterministic.**
3. **Bring-your-own-model, no baked-in providers** — any OpenAI-compatible
   endpoint; key via env only.
4. **k-of-n grading; an errored run counts as a failed run** — never skipped,
   never retried. Flaky endpoints cannot manufacture conformance.
5. **Every check traces to a cited normative source** (upstream clause or
   muster's published rubric).
6. **Discrimination controls** — every new grader ships with a
   rigged-impossible control case proving it can fail, per the v1 cap-of-zero
   pattern.

## Scope guard — what v2 is NOT

- **Not an agent framework or runtime.** muster runs *tests against* agents;
  it never hosts, schedules, or operates one.
- **Not a prompt optimizer or generator.** It reports violations; it does not
  rewrite files.
- **Not a registry or marketplace** for souls/skills.
- **Not a hosted service** in this milestone. CLI + CI exit codes, same as v1.
- **No new layer without a citable source** — if the research pass can't find
  a normative text or a documented, attributable convention for a layer, that
  layer waits.

## Open questions for the deep-research pass

The research pass should return sourced answers; these gate the spec.

1. **agents.md standard** — is there any conformance regime, schema, or test
   suite attached to the cross-vendor standard, or is it prose-only? How does
   its role differ from OpenClaw's AGENTS.md (SOP/routing/security), and
   should muster treat those as two adapters or one with profiles?
2. **Agent Skills (SKILL.md)** — what exactly is normative (frontmatter
   schema? loading semantics? directory layout?), is it versioned, and is
   there prior art for trigger-set testing (paraphrase generation against
   `description` fields)?
3. **SoulSpec vs RFC-1** — current version status of each, divergence between
   them, and whether a SoulSpec *package* adapter (soul.json + multi-file) can
   reuse the v1 RFC-1 adapter or needs its own.
4. **OpenClaw workspace semantics** — is there machine-readable or otherwise
   citable documentation of load order, precedence, and the
   MEMORY-private-sessions rule, or only blog-level convention? Strongest
   available sources per file.
5. **A2A Agent Cards** — schema location and version, what a meaningful
   *contract test* (card vs. live agent) checks, and whether prior art exists.
6. **Prior art sweep** — promptfoo, DeepEval, OpenAI Evals, Inspect, and the
   eval-harness field generally: what do they already cover per layer, what
   assertion types do they support, and precisely where is the uncovered gap
   (expected: file-spec conformance + cross-layer composition)?
7. **Cross-layer conflict detection** — any existing research or tooling on
   instruction-precedence conflicts in composed LLM contexts? Anything
   citable on persona-induced rule erosion?
8. **Compliance grading objectivity** — for SOP rules, where is the line
   between binary transcript checks (tool-call inspection, refusal detection)
   and judge-graded checks? Which SOP rule classes are objectively gradable
   (the v1 "three axes" discipline, applied to rules)?
9. **Adversarial probe sourcing** — established public corpora for
   prompt-injection / scope-escape probes that can be vendored or referenced
   with clean licensing?
10. **Sequencing** — which layer ships first for maximum standalone value?
    Working hypothesis: SOP/AGENTS.md (clearest assertions, biggest safety
    payoff), then skills, then the cross-layer class once two layers exist.

## Positioning note

Specs win when they get conformance suites. v1 made muster the reference
harness for one RFC; v2's claim is "the test harness for the agent-file
stack" — every layer that lands should be upstreamable as *the* CTS for its
spec, the way v1 was for RFC-1. Relationships with upstream spec authors are
part of the work, not an afterthought.
