---
work_package_id: WP09
title: Behavioral Core
dependencies:
- WP05
requirement_refs:
- FR-016
- FR-017
- FR-018
- FR-019
- FR-020
- FR-021
- FR-022
- FR-023
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T032
- T033
- T034
- T035
- T036
agent: "claude"
shell_pid: "1483089"
history:
- timestamp: '2026-06-10T20:21:16Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/core/behavioral/
execution_mode: code_change
owned_files:
- src/core/behavioral/types.ts
- src/core/behavioral/client.ts
- src/core/behavioral/runner.ts
- src/core/behavioral/graders.ts
- src/core/behavioral/manifest.ts
- src/adapters/rfc1/thresholds.ts
- tests/behavioral/runner.test.ts
- tests/behavioral/graders.test.ts
tags: []
---

# WP09 — Behavioral Core

## Objective

The model-facing half: multi-turn turn-list→transcript execution (C-005), a fetch-only OpenAI-compatible client (C-006, charter directive 5), k-of-n grading (FR-022), the three locked axes (FR-018/019/020/021), and the R9 threshold constants in the RFC-1 adapter. Everything testable against a mocked client — no live endpoint needed until WP11.

## Context

- Contracts: `contracts/behavioral-manifest.md` (manifest format + grading semantics — implement exactly), data-model.md (Turn/Transcript/verdict shapes, state-transition pseudo-code).
- Normative: §20.3 (TEC-1 evaluation moments, first-match-wins, application timing), §21.0.1 (facts injection).
- Thresholds LOCKED (planning decision): `maxWords(v) = 10 + v`; `refusalCap = 25`; `words(s) = s.trim().split(/\s+/).filter(Boolean).length`. Per-case overrides win.
- Trigger evaluation comes from the adapter (`evaluateTriggers`, WP04/T016) — core calls it, never parses predicates itself.
- T019 left `rfc1Adapter.thresholds` as a documented dynamic linkage — complete it here.

## Implementation command

```bash
spec-kitty agent action implement WP09 --agent <name>
```

## Subtasks

### T032 — Types (`src/core/behavioral/types.ts`)

Transcribe from data-model.md: `Turn`, `BehavioralCase`, `AxisSpec` (discriminated union: verbosity/refusal/state_shift), `ContentAssertion`, `TranscriptEntry`, `Transcript`, `AxisGrade`, `RunVerdict`, `CaseVerdict`, `EndpointConfig`, `ChatClient` interface:
```ts
export interface ChatClient {
  chat(messages: {role: "system"|"user"|"assistant"; content: string}[],
       opts: {temperature?: number}): Promise<string>;
}
```
**Validation**: strict compile; `AxisGrade` always carries `measured` and `limit` (NFR-005).

### T033 — OpenAI-compatible client (`src/core/behavioral/client.ts`)

**Steps**:
1. `makeClient(endpoint: EndpointConfig): ChatClient` — POST `{baseUrl}/chat/completions`, body `{model, messages, ...(temperature !== undefined && {temperature})}`. Temperature omitted entirely when "default" (C-009 — provider default, recorded as `"default"` in transcripts).
2. API key: read `process.env[endpoint.apiKeyEnv]` at call time; absent → send no Authorization header (Ollama needs none). NEVER log the key; error messages include status + response body excerpt, never headers.
3. Response: `choices[0].message.content`; empty/missing → throw `EmptyResponseError` (counts as failed run, FR-022).
4. Timeout via `AbortSignal.timeout(120_000)`; network errors throw with endpoint hostname (not full URL query) context.

**Validation**: covered in T036 with a mocked `fetch` (vi.stubGlobal) — request-shape assertions: no temperature key when default; Authorization present only when env set.

### T034 — Runner (`src/core/behavioral/runner.ts` + `manifest.ts`)

**Steps**:
1. `manifest.ts`: load/validate behavioral manifest YAML per contract (endpoint block, defaults, cases with turns/axes/runs/pass_threshold/overrides). Unknown fields → error.
2. `runner.ts`: `runCase(adapter, soulCheck: CheckResult, kase, client): Promise<CaseVerdict>`:
   - per run (1..n): fresh conversation. System prompt: render the effective config as the persona instruction — implement `personaPrompt(effective): string` (compact deterministic rendering: identity/voice/values/safety/interaction key facts + active-state note; document the rendering — it's part of what's being tested);
   - per turn: if `turn.facts` → `adapter.evaluateTriggers(effective, facts, mode)` BEFORE generating the reply (§20.3.1 OnUserMessage / §20.3.4 application timing); on state shift: re-apply overlay (`merge` with adapter strategy) → new effective for grading AND regenerate the system context for subsequent messages (append a system message noting the state change rather than rewriting history — keeps transcripts honest);
   - send accumulated messages → assistant reply → TranscriptEntry with `activeState` + `wordCount`;
   - after all turns: grade each AxisSpec (T035) against the per-turn active effective config;
   - run passes iff every axis grade passes; client errors → RunVerdict `{passed: false, error}` (FR-022: errored = failed);
   - CaseVerdict: `passed = passCount >= pass_threshold`.
3. Concurrency: runs sequential (rate-kindness to local Ollama); cases sequential. Record per-run duration.

**Validation** (T036): scripted mock client returning canned replies per call-index — k-of-n math, fact-injection timing, errored-run accounting.

### T035 — Graders + thresholds (`src/core/behavioral/graders.ts`, `src/adapters/rfc1/thresholds.ts`)

**Steps**:
1. `thresholds.ts` (RFC-1 adapter): export the R9 constants/functions with doc comments citing the planning decision; wire into `rfc1Adapter.thresholds` (replacing T019's dynamic-import seam — update only the linkage point inside your owned thresholds.ts; if index.ts needs a one-line import swap, coordinate: the seam was designed so index.ts's getter resolves `./thresholds.js` dynamically — landing this file completes it without touching WP05's file).
2. `graders.ts`:
   - `gradeVerbosity(entry, effective, override)`: `measured = wordCount`, `limit = override ?? thresholds.maxWords(effective.voice.verbosity)`;
   - `gradeRefusal(entry, override, assertions)`: limit `override ?? 25`; assertions: must_contain/must_not_contain with optional regex (case-insensitive default per contract); each assertion failure is its own AxisGrade line;
   - `gradeStateShift(runState, expectState, postShiftGrades)`: passes iff the adapter reported `expect_state` active at/after trigger_turn AND post-shift verbosity grades used the shifted state's thresholds (observable change, FR-021) — `measured` = actual state name, `limit` = expected.

**Validation** (T036): grader unit tests with synthetic transcripts — boundary exact-at-limit passes; one-over fails; regex price assertion catches "$129.99" and "129 dollars" styles per pattern.

### T036 — Tests (`tests/behavioral/{runner,graders}.test.ts`)

- [ ] k-of-n: 2-of-3 with [pass, fail, pass] → case passes; [pass, error, fail] → fails; n/k from defaults vs case override
- [ ] fact injection at turn 1 (0-indexed) shifts state BEFORE reply 1's grading; turn 0 graded under base state ("§20.3.4 application timing")
- [ ] `duration: message` reversion is exercised if the voice-frontdesk soul uses it — implement reversion per data-model pseudo-code (revert before next turn's evaluation, §20.3.5)
- [ ] transcript completeness: model, baseUrl, temperature ("default" when omitted), per-entry activeState (FR-023)
- [ ] mocked-fetch client request-shape tests (T033 validations)
- [ ] zero `process.env` reads outside client.ts (grep-style test)

## Definition of Done

- All tests green offline; no real network touched (assert via stubbed fetch only).
- `src/core/behavioral/` imports nothing from `src/adapters/` (C-004 — adapter arrives as a parameter).
- Thresholds linkage complete: `rfc1Adapter.thresholds.maxWords(30) === 40` passes from a test.

## Reviewer guidance

- TEC-1 timing is the correctness crux: facts evaluated and state applied BEFORE the same turn's reply (§20.3.4). The turn-0-vs-turn-1 grading test must demonstrate it.
- Check `personaPrompt` is deterministic (no Date/random) — NFR-001 spirit extends to transcript reproducibility at temp 0.
- Verify error paths never print the API key or full auth header.

## Risks

- `personaPrompt` rendering quality directly affects whether a conforming model passes (SC-005/SC-006 in WP11). Keep it faithful to the soul's axes (verbosity instruction, refusal style, state description) and revisit ONLY with the discrimination case as the guardrail against over-prompting.

## Activity Log

- 2026-06-10T23:22:09Z – claude – shell_pid=1422983 – Started implementation via action command
- 2026-06-10T23:35:48Z – claude – shell_pid=1422983 – Ready for review: behavioral core complete — runner (TEC-1 timing per §20.3.4/§20.3.5), fetch-only client (C-006/C-009), k-of-n grading (FR-022), three locked axes, R9 thresholds linked into rfc1Adapter; 461 tests green offline
- 2026-06-10T23:36:27Z – claude – shell_pid=1483089 – Started review via action command
