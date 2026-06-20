# Briefing: muster A2A behavioral conformance for a running external agent

**Audience:** the user, to drive muster (`garrison-hq/muster`) via spec-kitty.
**Status:** briefing only — **no muster code is authored by this story.** This defines
the "extra work to muster" that lets muster conformance-test hey-anton's **actual
assembled, running agent** over A2A, not just its `Soul.md` persona through Mistral.
**Companion:** hey-anton Story 2.8 ships the persona-through-Mistral gate that works
today (`conformance/` + `.github/workflows/agent-conformance.yml`). This briefing is
the follow-up that closes the running-agent gap. The reusable GitHub Action that wraps
the resulting CLI surface is specified in `briefings/muster-github-action.md`.

---

## 1. Problem statement

Today muster grades a `Soul.md` **persona** by sending its declared voice/safety/state
to a **direct OpenAI-compatible `/chat/completions` endpoint** and grading the model's
replies k-of-n on three axes (verbosity / refusal / state_shift). That is exactly what
hey-anton uses now (Mistral as the BYOM endpoint) and it works for the **persona
contract**.

The gap: hey-anton's real product is not "a model behind a persona prompt" — it is an
**assembled agent**: router → PII redaction-on-input → language detection → RAG
grounding → Art. 50 disclosure → confidence/topic escalation. To conformance-test *that*
(the thing customers actually talk to), muster must drive the **running agent over the
wire** and grade its multi-turn behavior.

muster already has an **A2A adapter** (`src/adapters/a2a/`), but it only does:
- **static card lint** (`lint.ts`, `card.ts`, `signature.ts`) — Agent Card schema +
  offline JWS signature; and
- **single-turn live probes** (`graders/skill-behavior.ts`, `auth-negative.ts`,
  `signed-card.ts`) — invoke one declared skill via one `message/send` and check a
  non-leaky consistency matcher / auth-negative / signed-card.

There is **no multi-turn behavioral grader** that drives an external running agent over
A2A JSON-RPC and grades it on the verbosity / refusal / state_shift axes k-of-n. The
behavioral runner that *does* those axes (`src/core/behavioral/runner.ts`) is wired to
the **OpenAI-compatible chat client** (`src/core/behavioral/client.ts`), not to an A2A
transport. Closing that — a multi-turn A2A behavioral grader reusing the three axis
graders — is the extra work.

---

## 2. Concrete muster-side changes

Respect the architecture invariants in `CONTRIBUTING.md`: **spec-agnostic core**, the
**C-001/C-004 core→adapter boundary** (core must not import an adapter), determinism, no
baked-in providers. The three axis graders (`src/core/behavioral/graders.ts`) and pass^k
(`src/core/behavioral/pass-k.ts`) are core and **reusable as-is** — they grade a
`TranscriptEntry[]` against an `EffectiveConfig`, independent of *how* the transcript was
produced. So this is best done as a **new adapter-side behavioral runner in the A2A
adapter** that produces transcripts over A2A and **calls the core axis graders** — NOT a
core change. (Core stays transport-agnostic; the A2A adapter owns its transport, exactly
as it already owns `transport.ts`.)

| # | Change | Files | Size |
|---|--------|-------|------|
| B1 | **Multi-turn `message/send` over A2A** — extend the transport to carry conversation **history** across turns (today `invokeSkill` posts a single `{ skill, message }` with no history; a behavioral case is multi-turn). Add a `sendMessage(endpoint, messages, opts)` that posts the running turn list per the A2A `message/send` multi-turn shape and returns the assistant text. Keep the call-time env read + never-store-token discipline. | `src/adapters/a2a/transport.ts` | **M** |
| B2 | **A2A behavioral-case runner** — a new adapter-side runner that, per case, walks the turns, calls B1 for each user turn, builds a `TranscriptEntry[]`, and **reuses the core graders** (`gradeVerbosity`/`gradeRefusal`/`gradeStateShift`) + `pass^k` to grade k-of-n. It resolves the persona `EffectiveConfig` for the threshold mapping (or accepts an explicit threshold mapping for the case). **Adapter-side, importing core — never core importing the adapter** (C-004). | new `src/adapters/a2a/graders/behavioral.ts`; wired in `src/adapters/a2a/index.ts` | **L** |
| B3 | **Manifest schema for A2A behavioral cases** — extend the A2A manifest with a behavioral-case kind: `turns` (multi-turn user messages, optional `facts` for state), `axes` (the same verbosity/refusal/state_shift discriminated union the behavioral manifest already validates), `runs`/`pass_threshold`/`overrides`. Reuse the existing strict validators from `src/core/behavioral/manifest.ts` where possible (the axis/turn/override validators are already written and tested). | `src/adapters/a2a/index.ts` (manifest load), reuse `src/core/behavioral/manifest.ts` validators | **M** |
| B4 | **State over A2A** — decide how `facts`-driven state shift is conveyed to an external agent: either (a) inject the active-state hint into the turn payload (mirrors how the chat runner adds "Current mood state: X" to the system prompt), or (b) grade the shift purely from the agent's *observable* behavior (post-shift verbosity tightening) without telling the agent its state. Recommend (b) for a true black-box conformance signal; document the choice. | `src/adapters/a2a/graders/behavioral.ts` | **S** |
| B5 | **CLI + env wiring + docs** — surface the A2A behavioral cases through `muster a2a run` (it already switches behavioral on `MUSTER_A2A_ENDPOINT` / `MUSTER_A2A_TOKEN`); add the layers-table/CLI-reference docs and an `examples/a2a/` behavioral case. Every new check **cites the spec section** (A2A spec; the axis FRs) per the contributing rule. | `src/adapters/a2a/index.ts`, `examples/a2a/`, `site/` docs, tests | **S** |

**Boundary check:** B2/B4 are the only behavioral-logic additions and both live **in the
A2A adapter**, importing the core graders. No core file gains an A2A import. This matches
the existing pattern where the A2A adapter owns its own HTTP client (`transport.ts` is a
sanctioned, allowlisted network surface) distinct from the core chat client.

---

## 3. The hey-anton-side contract muster will drive (dependency — NOT built here)

For muster to grade the running agent, hey-anton must expose a minimal **A2A surface**
**and stand it up inside the conformance workflow** (see §4 — boot-in-CI is the chosen
execution model). This is **future hey-anton work** (an Epic-3-ish channel/transport task
that pairs with the muster work) — noted here as the **dependency**, not something Story
2.8 builds:

- **Endpoint lifecycle owner (decided):** hey-anton ships a **CI-bootable server target**
  that the conformance workflow starts with the Mistral key, fronting the **assembled**
  agent over A2A. The workflow boots it, waits for the agent card, runs `muster a2a run`,
  and tears it down. muster never owns the lifecycle — it points at an endpoint that is
  already up (§4).
- **Agent Card discovery:** `GET /.well-known/agent-card.json` — an A2A Agent Card
  describing Anton (name, skills, security scheme). muster's `discoverCard`/`card.ts`
  already consume this shape. **This endpoint doubles as the readiness probe** (§4).
- **JSON-RPC `message/send`:** `POST /` accepting JSON-RPC 2.0 `{ jsonrpc, id, method:
  "message/send", params }` and returning the assistant reply. Must support the
  **multi-turn** params shape (B1) so a behavioral case can carry history. This is the
  surface that fronts the **assembled** `AgentDefinition` (the same pipeline `handle()`
  runs — router+RAG+redaction+disclosure+escalation), reusing the in-JVM 2-1
  `AgentConformanceRunner`/`AgentDefinition` seam behind the transport.
- **Auth:** a bearer scheme so muster's `auth-negative` probe has something to assert
  (token in `MUSTER_A2A_TOKEN`, never committed). The **Mistral key is consumed by the
  server, not by muster** — it gates server boot, which is where the fork-PR guard lives
  (§4).
- **Multi-turn / conversation:** the surface must thread a conversation id so the
  first-turn disclosure (Art. 50) and the escalation loop counter behave correctly across
  turns — this is where the assembled-agent behavioral assertions (disclosure on first
  turn incl. the `stream()` path — D2-7-5/D2-7-6; code-switch — D2-5; grounded answers —
  D2-3) become wire-testable, beyond the persona-level checks Story 2.8 ships.

---

## 4. CI execution model (boot-in-CI)

The running agent is **booted inside the conformance workflow** — not pointed at a
deployed staging env. The workflow shape is: **boot server (Mistral key) → wait for agent
card → `muster a2a run` → tear down.** Three consequences the mission and the companion
workflow must honor:

1. **Readiness gate is mandatory, and it interacts with AC#4.** muster's contract is:
   absent `MUSTER_A2A_ENDPOINT` → **skip**; reachable-but-errored endpoint → **fail**. If
   the workflow exports `MUSTER_A2A_ENDPOINT` before the server is listening, the first
   `message/send` races the boot and **fails the run** instead of skipping. The workflow
   must **poll `GET /.well-known/agent-card.json` until 200 (with a timeout)** before the
   muster step. The companion Action exposes this as an optional `health-url` + `timeout`
   input so consumers don't re-implement the wait.
2. **The Mistral secret moves the fork-PR guard to the boot step.** The key is consumed by
   the *server*, not by muster. On a fork PR the secret is absent → the server can't boot
   → the **whole conformance job skips** (mirror the existing `sonar` fork guard in
   `.github/workflows/ci.yml`). Fork-PR safety still holds; it is just enforced at
   server-boot rather than at the muster step.
3. **Live-model cost + flakiness needs a gating policy.** Every behavioral case hits
   Mistral k-times through the full pipeline. This is **workflow policy, not a code
   change** to B1–B5:
   - **When:** static card-lint + single-turn probes on *every* PR (cheap, deterministic);
     multi-turn behavioral A2A on **main / nightly / labeled-PR** only.
   - **k on PR vs main:** if behavioral runs on PRs at all, use a lower
     `runs`/`pass_threshold` there and full k-of-n on main.

---

## 5. Ordering + acceptance criteria for muster's spec-kitty mission

**Order:** B1 → B3 → B2 → B4 → B5 (transport multi-turn first; then the manifest schema;
then the runner that consumes both; then the state decision; then CLI/docs/examples).

**Acceptance criteria the mission must satisfy:**

1. `muster a2a run <manifest>` can run a **multi-turn behavioral case** against a live
   A2A endpoint and grade it on verbosity / refusal / state_shift **k-of-n**, exit 0
   all-passed / 1 a case failed / 2 every run errored (same exit contract as `behave run`).
2. The behavioral grading **reuses the core axis graders + pass^k** — no axis logic is
   re-implemented in the adapter; the runner is adapter-side and imports core (C-004
   holds: no core→adapter import; the NI-003 invariant guard still passes).
3. The A2A behavioral manifest is **strict-validated** (unknown fields error), reusing the
   existing turn/axis/override validators; **no key/token value** is ever a manifest field
   (only env-var names) — the repository key-invariant test still passes.
4. Multi-turn history is sent per the **A2A `message/send`** shape; the token is read at
   call time and never stored/logged; an unreachable/errored endpoint **fails** the run,
   absent `MUSTER_A2A_ENDPOINT` **skips** (existing FR-009/FR-010 behavior preserved).
5. State-shift over A2A is graded from **observable** post-shift behavior (B4 option b)
   or a documented state-hint injection; the choice is documented + tested.
6. A runnable `examples/a2a/` behavioral case + docs (layers table, CLI reference) land,
   and **every new check cites its spec section** (A2A spec + the axis FRs) per
   `CONTRIBUTING.md`. Determinism + minimal-dependency invariants hold.
7. **No regression** to the existing static-card-lint / single-turn skill-probe /
   auth-negative / signed-card paths.
8. The behavioral run is **CI-gating policy aware** (§4): the manifest/CLI surface lets a
   workflow run static-only on PRs and full behavioral on main/nightly without code
   changes — i.e. `runs`/`pass_threshold`/case selection are manifest- or flag-driven,
   not hard-coded.

---

## 6. Five-bullet summary of the muster extra-work

- **B1 (M):** multi-turn `message/send` history in the A2A transport (today it is
  single-turn `{skill, message}` with no history).
- **B2 (L):** a new **adapter-side A2A behavioral-case runner** that produces transcripts
  over A2A and **reuses the core verbosity/refusal/state_shift graders + pass^k** — the
  one genuinely new piece.
- **B3 (M):** an **A2A behavioral-case manifest schema** reusing the existing strict
  turn/axis/override validators.
- **B4 (S):** decide + document **how state shift is conveyed/graded over A2A**
  (recommend black-box observable post-shift behavior).
- **B5 (S):** CLI surfacing via `muster a2a run`, an `examples/a2a/` behavioral case,
  docs, and spec-citations — respecting the spec-agnostic-core / C-004 boundary
  throughout (the new behavioral logic is adapter-side, importing core, never the reverse).
