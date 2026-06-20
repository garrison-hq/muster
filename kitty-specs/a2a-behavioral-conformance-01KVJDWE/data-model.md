# Data Model: A2A Behavioral Conformance

**Mission:** `a2a-behavioral-conformance-01KVJDWE`
**Source:** `kitty-specs/a2a-behavioral-conformance-01KVJDWE/research.md` (D1–D5) +
`kitty-specs/a2a-behavioral-conformance-01KVJDWE/spec.md` (Key Entities).

This maps the spec's entities onto **existing** muster types so the plan reuses them rather
than inventing parallel shapes. "Reuse" = existing type used unchanged. "New (adapter)" =
adapter-side addition importing core. "Wire" = A2A-protocol-level shape, not a muster core
type.

---

## Entity mapping

| Spec entity | Backing muster type | Source file | Disposition |
|-------------|---------------------|-------------|-------------|
| A2A behavioral case | `BehavioralCase` minus `soul`, plus endpoint + threshold source | `src/core/behavioral/manifest.ts` | New (adapter) loader; reuses field validators |
| Turn | `Turn { role:"user", content, facts? }` | `src/core/behavioral/manifest.ts` | Reuse (validator) — see facts note |
| Transcript | `Transcript { entries, model, baseUrl, temperature, durationMs }` | `src/core/behavioral/types.ts` | Reuse; A2A fills `model`/`baseUrl` from endpoint |
| Transcript entry | `TranscriptEntry { role, content, activeState, wordCount? }` | `src/core/behavioral/types.ts` | Reuse — `activeState` = muster's *expected* state |
| Axis expectation | `AxisSpec` (verbosity \| refusal \| state_shift) | `src/core/behavioral/manifest.ts` | Reuse unchanged |
| Content assertion | `ContentAssertion { kind, pattern, regex? }` | `src/core/behavioral/manifest.ts` | Reuse unchanged |
| Case overrides | `CaseOverrides { max_words?, refusal_cap? }` | `src/core/behavioral/manifest.ts` | Reuse unchanged |
| Run policy (k-of-n) | `runs`, `pass_threshold` (`BehavioralDefaults`) → `conjunctivePassK` | `src/core/behavioral/{manifest,pass-k}.ts` | Reuse unchanged |
| Axis grade | `AxisGrade { axis, turn, measured, limit, passed }` | `src/core/behavioral/types.ts` | Reuse unchanged |
| Run verdict | `RunVerdict { run, passed, axes, transcript, error? }` | `src/core/behavioral/types.ts` | Reuse unchanged |
| Case verdict | `CaseVerdict { id, passed, passCount, runs }` | `src/core/behavioral/types.ts` | Reuse unchanged |
| Threshold mapping | `EffectiveConfig` (`voice.verbosity` → `maxWords`) or explicit thresholds | `src/core/adapter.ts` | Reuse type; **source TBD (Q2)** |
| Endpoint/token contract | `MUSTER_A2A_ENDPOINT` / `MUSTER_A2A_TOKEN` (env *names*) | `src/adapters/a2a/transport.ts` | Reuse env primitives |
| A2A `Message` (send) | `{ role, parts:[{kind:"text",text}], messageId, contextId?, taskId?, kind:"message" }` | A2A spec v0.3.0 | Wire — New (adapter) in `transport.ts` |
| Conversation handle | `{ contextId, taskId }` threaded across turns | A2A spec v0.3.0 | Wire — New (adapter) transport state |

---

## Relationships

```
A2A behavioral manifest
 └── cases: A2A behavioral case [1..n]
      ├── turns: Turn [1..n]            (role:"user"; facts? drive EXPECTED state only)
      ├── axes: AxisSpec [1..n]         (verbosity | refusal | state_shift)
      ├── overrides?: CaseOverrides
      ├── runs, pass_threshold          (k-of-n)
      └── threshold source: EffectiveConfig ref OR explicit thresholds   (Q2)

Per run of a case:
 Turn[]  --(A2A message/send, contextId threaded)-->  agent replies
        ==>  Transcript { entries: TranscriptEntry[] }
        ==>  gradeVerbosity / gradeRefusal / gradeStateShift  ==>  AxisGrade[]
        ==>  RunVerdict { passed, axes, transcript, error? }

Per case:
 RunVerdict[]  --(map errored→false)-->  passFlags
              ==>  conjunctivePassK + (passCount >= pass_threshold)
              ==>  CaseVerdict
```

---

## Field-level notes (the parts that differ from the chat path)

- **`Turn.facts` are NOT sent to the agent (black-box, D3/FR-011).** In the chat runner,
  facts/state drive an injected `Current mood state: X` system line. Here they drive only
  muster's **expected** active-state tracking, which selects the verbosity threshold and
  feeds `gradeStateShift`. The agent is told nothing about state.

- **`TranscriptEntry.activeState`** is filled with muster's expected state (from
  facts/triggers), used by `gradeStateShift` to confirm post-shift verbosity tightening —
  never echoed to the agent.

- **`TranscriptEntry.wordCount`** is computed by muster (`thresholds.words(reply)`) on the
  assistant reply text extracted from the A2A response — independent of how the reply was
  transported.

- **`Transcript.model` / `baseUrl` / `temperature`** are recorded for provenance; for A2A,
  `baseUrl` = the endpoint, `model` = agent/card identifier (or a placeholder), and
  `temperature` is not muster's to set (the running agent owns generation) — record
  `"default"`.

- **Threshold source (Q2).** `gradeVerbosity` needs a limit. Either resolve a persona
  `EffectiveConfig` for the case (reusing the existing thresholds mapping
  `maxWords = 10 + voice.verbosity`) or accept explicit per-case `max_words`/state
  thresholds. The `EffectiveConfig` type is reused either way.

- **Reply extraction (Q1, external).** The assistant text is read from the `message/send`
  response. Until the hey-anton surface finalizes, the extractor must tolerate both a
  `Message` result (`result.parts[].text`) and a `Task` result
  (`result.status.message.parts[].text` / `result.artifacts[].parts[].text`).

---

## Invariants the model must preserve

- **C-001/C-004 / NI-002:** the new runner and manifest loader live under
  `src/adapters/a2a/` and import core; **no `src/core/**` file may import the adapter**
  (`tests/unit/invariants.test.ts`).
- **NI-003:** the only new network is in `src/adapters/a2a/transport.ts` (already
  allow-listed); no other file gains a `fetch`.
- **FR-005 / NFR-002:** the manifest carries env-var *names* only; no literal key/token is
  ever a manifest field (repository key-invariant test still passes).
