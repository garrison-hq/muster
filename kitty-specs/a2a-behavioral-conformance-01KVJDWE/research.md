# Research: A2A Behavioral Conformance (Phase 0)

**Mission:** `a2a-behavioral-conformance-01KVJDWE`
**Scope (lean, per request):** (1) the A2A multi-turn `message/send` wire shape; (2) a
reuse inventory of existing muster pieces; (3) a data-model mapping. Scope/axes/boundary
are **settled in `kitty-specs/a2a-behavioral-conformance-01KVJDWE/spec.md`** and are not
re-derived here.

Evidence trail: `kitty-specs/a2a-behavioral-conformance-01KVJDWE/research/evidence-log.csv`
and `.../research/source-register.csv`.

---

## Decisions

### D1 — Multi-turn is threaded by `contextId`, and muster's current A2A payload is non-conformant

**Finding.** Canonical A2A (`message/send`) sends a structured **Message** object, not a
flat `{skill, message}` pair. Per the v0.3.0 spec:

- `params` = `MessageSendParams { message, configuration? }`.
- `message` = `Message { role: "user"|"agent", parts: Part[], messageId, contextId?, taskId?, kind: "message", … }`.
- `Part` (TextPart) = `{ kind: "text", text, metadata? }`.
- **Multi-turn continuity** is by **server-generated `contextId`** (and `taskId`): the
  server "must always provide a `context_id` in its messages"; the client echoes
  `contextId` (and `taskId`) on subsequent turns to keep the conversation/task associated.

muster's current transport (`src/adapters/a2a/transport.ts → invokeSkill`) posts
`params: { skill, message }` — a **non-standard** shape with **no history and no context
threading**. (Confirmed by source inventory.)

**Decision.** B1 introduces a conformant multi-turn send that (a) builds a proper
A2A `Message` with `role:"user"`, `parts:[{kind:"text", text}]`, a fresh `messageId` per
turn, and (b) **threads `contextId`/`taskId`** returned by the first response into every
subsequent turn. History is carried by the *server* via `contextId`; muster does not
assume the agent replays a client-sent history array. The existing single-turn
`{skill, message}` probe path must remain working (NFR-003) — so this is an **additive**
send path, not an in-place rewrite, with the migration decision deferred to plan.

**Rationale.** This is the one genuine *external* unknown the spec flags. Threading
`contextId` is the spec-blessed mechanism and matches how the assembled agent keeps
first-turn disclosure / escalation counters correct across turns (spec §Dependencies).

**Open sub-question (tracked, see Q1).** The `message/send` **response** shape is *not*
pinned in the spec excerpt — it may return a `Message` (reply in `result.parts`) or a
`Task` (reply in `result.status.message.parts` or `result.artifacts`). This is a
**hey-anton surface dependency**; the transcript-extraction step must tolerate both until
the surface is finalized.

### D2 — Grade with the core axis graders + pass^k; do NOT reuse the persona chat runner wholesale

**Finding.** The core grading half is fully reusable and transport-agnostic:

- `src/core/behavioral/graders.ts` — `gradeVerbosity`, `gradeRefusal`, `gradeStateShift`,
  `verbosityLimit` are pure functions over `TranscriptEntry` + `EffectiveConfig` +
  thresholds. No network, env, adapter, or provider coupling.
- `src/core/behavioral/pass-k.ts` — `conjunctivePassK(passFlags)` is a spec-agnostic
  boolean AND; the caller maps run results → boolean (errored = false) first.
- `src/core/behavioral/types.ts` — `TranscriptEntry`, `Transcript`, `AxisGrade`,
  `RunVerdict`, `CaseVerdict` are Soul-agnostic structs, reusable as-is.

But the **runner** `src/core/behavioral/runner.ts → runCase(...)` is coupled to a
`SpecAdapter`, a resolved `soul` check, and `personaPrompt()` — it **injects a system
prompt** (including a `Current mood state: X` line) to *drive a bare model into the
persona*. For a **running assembled agent**, the agent owns its own prompt; muster must
**not** inject persona/system text.

**Decision.** The A2A behavioral runner is **adapter-side** (`src/adapters/a2a/`). It
reuses the **grading** path (`gradeVerbosity/gradeRefusal/gradeStateShift` →
`conjunctivePassK` → `CaseVerdict`) but builds the `TranscriptEntry[]` itself over A2A,
sending **only user turns** (no system/persona prompt). It imports core; core never
imports it (C-001/C-004; enforced by `tests/unit/invariants.test.ts` NI-002 + NI-003).

**Rationale.** Reusing `runCase` wholesale would re-inject a persona prompt and defeat the
black-box premise. The reuse line is drawn at the *grading* seam, not the *transcript
production* seam — which is exactly the briefing's "reuse the core graders, new
adapter-side runner" framing.

### D3 — State-shift is black-box; the persona `EffectiveConfig` is still needed for thresholds

**Finding.** `gradeVerbosity` needs a verbosity limit (`maxWords = 10 + voice.verbosity`,
or a per-case `max_words` override). `gradeStateShift` compares muster's *expected* active
state against the post-shift verbosity grades using the shifted threshold. The chat runner
gets `activeState` and the threshold mapping from a resolved persona `EffectiveConfig`.

**Decision (B4 = option b, confirmed).** muster never tells the agent its state. It tracks
the **expected** active state locally (from the case's `facts`/triggers) purely to select
the threshold and to grade `state_shift` from **observable** post-shift verbosity
tightening. The threshold mapping comes from either (i) a referenced persona
`EffectiveConfig` resolved for the case, or (ii) explicit per-case thresholds in the
manifest. The `TranscriptEntry.activeState` field is filled with muster's *expected* state,
not anything the agent was told.

**Open sub-question (tracked, see Q2).** Choose (i) persona-config reference vs (ii)
explicit per-case thresholds as the manifest's threshold source — a plan-time call.

### D4 — Reuse the behavioral manifest validators; A2A manifest swaps `soul`→endpoint/threshold source

**Finding.** `src/core/behavioral/manifest.ts` already strict-validates the exact pieces an
A2A behavioral case needs, with unknown-field rejection and defaulting:

- `Turn { role:"user", content, facts? }`, `AxisSpec` discriminated union
  (`verbosity{turns}` | `refusal{turn, assertions?}` | `state_shift{trigger_turn, expect_state}`),
  `ContentAssertion { kind, pattern, regex? }`, `CaseOverrides { max_words?, refusal_cap? }`,
  `BehavioralDefaults { runs(≥1, def 3), pass_threshold(≥1,≤runs, def 2), temperature }`.
- `endpoint` block already models `{ base_url, model, api_key_env }` with `api_key_env`
  defaulting to an env-var *name* (never a literal key) — directly aligned with FR-005/NFR-002.

**Decision.** The A2A behavioral manifest **reuses** the Turn/AxisSpec/ContentAssertion/
CaseOverrides/defaults validators. It replaces the chat `endpoint{base_url, model,
api_key_env}` with an A2A endpoint reference keyed on `MUSTER_A2A_ENDPOINT` /
`MUSTER_A2A_TOKEN` (env-var *names* only), and replaces the per-case `soul` path with the
D3 threshold source. Strict unknown-field rejection is preserved (FR-005). Whether to reuse
the validators by import vs. a thin A2A wrapper is a plan-time structuring call (must keep
core→adapter boundary: the *validators* are core and reusable; the A2A *loader* is
adapter-side).

### D5 — Exit-code, skip, and network contracts are already established; reuse them

**Finding.** Env activation lives in transport: `envEndpoint()` (null ⇒ skip),
`envToken()`, `timeoutMs()` (`MUSTER_A2A_TIMEOUT_MS`, def 10 000). The behave exit contract
(0 all-pass / 1 a case failed / 2 all runs errored) and "errored run = failed run, never
retried" (`conjunctivePassK` inputs) are settled core behavior. `transport.ts` and
`core/behavioral/client.ts` are the only two `fetch` sites allow-listed by the NI-003 guard.

**Decision.** Reuse all of the above unchanged: absent `MUSTER_A2A_ENDPOINT` ⇒ skip
(FR-009); configured-but-unreachable / all-errored ⇒ fail (FR-010, exit 2); token read at
call time, never stored (NFR-002). No new `fetch` site is introduced — multi-turn send
extends `transport.ts`, which is already allow-listed.

---

## Reuse Inventory (summary)

**Reused unchanged:** core axis graders (`graders.ts`), `conjunctivePassK` (`pass-k.ts`),
transcript/verdict types (`types.ts`), the behavioral manifest field validators
(`manifest.ts` — Turn/AxisSpec/ContentAssertion/CaseOverrides/defaults), the env-activation
+ timeout primitives (`transport.ts`), the behave exit contract, and the C-004/NI-003
invariant guard (which the new code must satisfy, not change).

**Extended:** `src/adapters/a2a/transport.ts` — add a conformant multi-turn send (A2A
`Message` shape + `contextId`/`taskId` threading) alongside the existing single-turn probe.

**Net-new (all adapter-side, importing core):** the A2A behavioral-case runner that
produces `TranscriptEntry[]` over A2A and calls the core graders + `conjunctivePassK`
(`src/adapters/a2a/graders/behavioral.ts`); the A2A behavioral manifest loader/wiring in
`src/adapters/a2a/index.ts`; the `muster a2a run` surfacing of behavioral cases; an
`examples/a2a/` behavioral case; docs + spec-citations; tests/fixtures.

---

## Open Questions / Risks (feed `/spec-kitty.tasks`)

- **Q1 — `message/send` response shape (external dependency).** Spec excerpt does not pin
  whether `message/send` returns a `Message` (reply in `result.parts`) or a `Task` (reply
  in `result.status.message.parts` / `result.artifacts`). The transcript extractor must
  tolerate both until the **hey-anton A2A surface** finalizes. Risk: late shape change.
- **Q2 — threshold source for A2A cases.** Persona `EffectiveConfig` reference vs explicit
  per-case thresholds (D3). Plan-time decision; affects manifest schema.
- **Q3 — single-turn probe coexistence.** The existing non-conformant `{skill, message}`
  probe path must not regress (NFR-003). Plan decides whether it stays as-is or migrates to
  the conformant `Message` shape; lowest-risk is additive (new behavioral send path; probe
  untouched).
- **Q4 — black-box state observability.** Some state shifts may not be observable from the
  conversation alone; mitigated by making case authorship responsible for eliciting an
  observable verbosity signal, documented in the shipped example (FR-013).
- **Q5 — manifest validator reuse mechanics.** Reuse the core validators by import vs a thin
  A2A wrapper, keeping validators in core and the loader adapter-side (D4). Structuring call
  for plan.

## Sources

- [Agent2Agent (A2A) Protocol Official Specification v0.3.0](https://a2a-protocol.org/v0.3.0/specification/)
- [A2A Protocol — Core Concepts](https://a2a-protocol.org/latest/topics/key-concepts/)
- muster source (this repo): `src/core/behavioral/{graders,pass-k,types,manifest,runner,client}.ts`,
  `src/adapters/a2a/{transport,index,types}.ts`, `src/core/adapter.ts`,
  `tests/unit/invariants.test.ts`.
