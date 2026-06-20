---
work_package_id: WP01
title: Multi-turn A2A transport (B1)
dependencies: []
requirement_refs:
- FR-001
- FR-010
- NFR-002
planning_base_branch: kitty/mission-a2a-behavioral-conformance
merge_target_branch: kitty/mission-a2a-behavioral-conformance
branch_strategy: Planning artifacts for this feature were generated on kitty/mission-a2a-behavioral-conformance. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into kitty/mission-a2a-behavioral-conformance unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-a2a-behavioral-conformance-01KVJDWE
base_commit: 0bd5cd4778a8db4d2375e32c9b59e165f682ed75
created_at: '2026-06-20T12:29:34.755565+00:00'
subtasks:
- T001
- T002
- T003
- T004
- T005
- T006
shell_pid: "734352"
agent: "claude:sonnet:implementer:implementer"
history:
- Created by /spec-kitty.tasks for mission a2a-behavioral-conformance-01KVJDWE
authoritative_surface: src/adapters/a2a/transport.ts
execution_mode: code_change
owned_files:
- src/adapters/a2a/transport.ts
- tests/a2a/transport-multiturn.test.ts
- tests/fixtures/a2a/responses/**
tags: []
---

# WP01 — Multi-turn A2A transport (B1)

## Objective

Extend `src/adapters/a2a/transport.ts` with a **conformant multi-turn `message/send`** path:
build a proper A2A `Message`, thread the server-owned `contextId`/`taskId` across turns, and
extract the assistant reply from a response whose shape (Message vs Task) is not yet pinned by
the external agent. Add this **additively** — the existing single-turn `invokeSkill`
(`params: { skill, message }`) probe must keep working unchanged.

This is the foundation WP. WP03 (the behavioral runner) consumes the `sendMessage` function and
the conversation handle you build here.

## Context (read before coding)

- Contract: `kitty-specs/a2a-behavioral-conformance-01KVJDWE/contracts/a2a-message-send.md`
  (authoritative for the request shape, threading, and response tolerance).
- Research: `.../research.md` D1 (why contextId threading, why the current payload is
  non-conformant) and Q1 (response shape is an external unknown).
- Existing code: `src/adapters/a2a/transport.ts` already has `invokeSkill`, `envEndpoint()`,
  `envToken()`, `timeoutMs()` (default 10 000, `MUSTER_A2A_TIMEOUT_MS`). Reuse these helpers;
  do not duplicate env reads.
- Invariant: `transport.ts` is one of only two `fetch`-allow-listed files
  (`tests/unit/invariants.test.ts`, NI-003). **Do not add a `fetch` anywhere else.**
- Charter: token read at call time, never stored/logged (NFR-002); error messages carry host +
  HTTP status only, never headers or token.

## Subtasks

### T001 — A2A `Message`/`Part` request builder

**Purpose:** Produce the JSON-RPC `message/send` request body for one user turn, per the A2A
v0.3.0 `Message` shape.

**Steps:**
1. Add a builder (e.g. `buildSendRequest(turnText, handle, idSeq)`) returning:
   ```json
   { "jsonrpc": "2.0", "id": "<call id>", "method": "message/send",
     "params": { "message": {
       "kind": "message", "role": "user",
       "parts": [ { "kind": "text", "text": "<turnText>" } ],
       "messageId": "<fresh id>",
       "contextId": "<handle.contextId if set>",
       "taskId": "<handle.taskId if set>"
     } } }
   ```
2. On the **first** turn (`handle` empty), **omit** `contextId` and `taskId` entirely (do not
   send nulls).
3. `messageId` must be unique per turn. Use a deterministic counter or a uuid helper already in
   the repo if present; avoid `Math.random()`/`Date.now()` if a deterministic option exists
   (keeps tests stable). The JSON-RPC `id` may be a simple incrementing integer/string.

**Files:** `src/adapters/a2a/transport.ts`.
**Validation:** unit test asserts exact body for turn 1 (no contextId/taskId) and turn 2
(contextId present).

### T002 — Conversation handle: thread `contextId`/`taskId`

**Purpose:** Carry server-owned context across turns (multi-turn continuity, D1).

**Steps:**
1. Define a small `ConversationHandle` type: `{ contextId?: string; taskId?: string }`.
2. After each response, update the handle from the response (see T004 extraction): capture
   `contextId` and, if the agent created a task, `taskId`.
3. The handle is passed into the next `buildSendRequest` (T001). The runner (WP03) owns the
   handle's lifetime across a case; `transport.ts` just reads/returns it.

**Files:** `src/adapters/a2a/transport.ts`.
**Validation:** unit test threads a 2-turn exchange and asserts turn 2 carries turn 1's
`contextId`.

### T003 — `sendMessage(endpoint, turn, handle, opts)`

**Purpose:** The single network call the runner uses per user turn.

**Steps:**
1. Signature (suggested):
   `async function sendMessage(endpoint: string, turnText: string, handle: ConversationHandle,
   opts: { token?: string | null; timeoutMs?: number; idSeq: number }): Promise<{ reply: string;
   handle: ConversationHandle }>`.
2. POST `buildSendRequest(...)` to `endpoint` (base URL, no path suffix — matches existing
   `invokeSkill`). Set `Content-Type: application/json`.
3. Add `Authorization: Bearer <token>` only when token is non-null/non-empty (reuse the existing
   header logic from `invokeSkill`).
4. Apply `AbortSignal.timeout(opts.timeoutMs ?? timeoutMs())`.
5. Return the extracted `reply` (T004) and the updated `handle` (T002).

**Files:** `src/adapters/a2a/transport.ts`.
**Validation:** covered by T006 (mock fetch).

### T004 — Reply extraction tolerant of Message and Task responses (Q1)

**Purpose:** Pull the assistant text + context ids from a response whose shape is not pinned.

**Steps:** implement `extractReply(resultObj)` trying in order:
1. **Message result:** `result.kind === "message"` → join `result.parts[].text` (text parts only).
2. **Task result:** `result.kind === "task"` → prefer `result.status.message.parts[].text`;
   else concatenate `result.artifacts[].parts[].text`.
3. Capture `contextId` from `result.contextId`; `taskId` from `result.taskId` (Task) or
   `result.id` when that is the task id.
4. If neither shape yields any text → return a sentinel that the caller treats as an **errored**
   run (do not throw here; let T005 classify).

**Files:** `src/adapters/a2a/transport.ts`.
**Validation:** T006 feeds a Message fixture and a Task fixture and asserts identical reply text
extraction + context capture.

### T005 — Error / timeout / protocol-error handling

**Purpose:** Map every failure to an **errored** result (errored run = failed run, never
retried — D5), without leaking secrets.

**Steps:**
1. Non-2xx HTTP, network error, or `AbortError` (timeout) → throw/return an error carrying
   `endpoint host + HTTP status` only (mirror `invokeSkill`'s hygiene). Never include headers or
   the token.
2. JSON-RPC `error` object present in the body → treat as errored with the error `code`/`message`
   (message is the agent's, safe to surface).
3. Empty/unextractable reply (T004 sentinel) → errored.
4. Decide the surface: either `sendMessage` throws a typed error the runner catches, or returns a
   discriminated `{ ok: false, error }`. Pick one and document it in a doc-comment; WP03 depends
   on this contract.

**Files:** `src/adapters/a2a/transport.ts`.
**Validation:** T006 covers timeout, non-2xx, JSON-RPC error, empty reply; asserts no token in
the error string.

### T006 — Unit tests

**Purpose:** Prove the wire contract offline (no live endpoint).

**Steps:**
1. New `tests/a2a/transport-multiturn.test.ts`. Mock `fetch` (the repo already mocks fetch in
   a2a/behavioral tests — follow the existing pattern).
2. Fixtures under `tests/fixtures/a2a/responses/`: `message-result.json`, `task-result.json`,
   `jsonrpc-error.json`.
3. Cases: turn-1 body shape (no contextId), turn-2 threading, extraction from Message and Task,
   timeout, non-2xx, JSON-RPC error, empty reply, and **token never present in any error string**.
4. Add a regression assertion that `invokeSkill`'s existing single-turn body is unchanged.

**Files:** `tests/a2a/transport-multiturn.test.ts`, `tests/fixtures/a2a/responses/**`.
**Validation:** `pnpm test` green; `pnpm typecheck` clean.

## Definition of Done

- `sendMessage` + builder + extractor implemented additively in `transport.ts`; `invokeSkill`
  untouched and still tested.
- Multi-turn threading works; reply extraction handles Message and Task; all failures → errored
  with no secret leakage.
- New tests pass; `pnpm build` (tsc strict) and `pnpm test` green; NI-003 invariant test still
  passes (no new fetch site).

## Reviewer guidance

- Confirm turn-1 omits `contextId`/`taskId` and turn-2 includes them.
- Confirm no `fetch` added outside `transport.ts`; no token in error strings/logs.
- Confirm `invokeSkill` behavior is byte-identical (diff should be purely additive).

## Implementation command

```
spec-kitty agent action implement WP01 --agent <name>
```

## Activity Log

- 2026-06-20T12:29:36Z – claude:sonnet:implementer:implementer – shell_pid=734352 – Assigned agent via action command
