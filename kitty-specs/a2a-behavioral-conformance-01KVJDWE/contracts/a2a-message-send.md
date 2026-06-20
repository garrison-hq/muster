# Contract: A2A `message/send` Wire (what muster emits and tolerates)

**Mission:** `a2a-behavioral-conformance-01KVJDWE` · **Spec:** FR-001, C-004 · **Research:** D1, Q1 ·
**Source of truth:** A2A Protocol Specification v0.3.0 (§6.4 Message, §6.5.1 TextPart, §7.1.1
MessageSendParams). The `message/send` **response** shape is not pinned by the spec excerpt →
treated as a **hey-anton surface dependency** (Q1); muster tolerates both known shapes.

## Request muster emits (per user turn)

```json
{
  "jsonrpc": "2.0",
  "id": "<per-call id>",
  "method": "message/send",
  "params": {
    "message": {
      "kind": "message",
      "role": "user",
      "parts": [ { "kind": "text", "text": "<turn content>" } ],
      "messageId": "<fresh uuid per turn>",
      "contextId": "<echoed from first response; omitted on first turn>",
      "taskId": "<echoed from first response if the agent created a task; else omitted>"
    }
  }
}
```

- **First turn:** omit `contextId` and `taskId` (server generates `contextId`).
- **Subsequent turns:** include the `contextId` (and `taskId` if any) returned by the prior
  response — this is how multi-turn history is carried (server-owned context, D1). muster does
  **not** replay a client-side history array.
- **Auth:** `Authorization: Bearer <token>` header when the token env var is set; token read at
  call time, never stored or logged (NFR-002).
- **No persona/system content is ever sent** — only `role:"user"` turns (black-box, B4/D2).
- **Timeout:** `MUSTER_A2A_TIMEOUT_MS` (default 10 000), reused from `transport.ts`.

> The existing single-turn skill probe keeps its current `params: { skill, message }` shape
> (Q3, NFR-003). This conformant `message/send` path is **additive**.

## Response muster tolerates (Q1 — until hey-anton finalizes)

Reply text is extracted by trying, in order:

1. **Message result:** `result.kind == "message"` → join text of `result.parts[].text`.
2. **Task result:** `result.kind == "task"` → prefer `result.status.message.parts[].text`;
   else concatenate `result.artifacts[].parts[].text`.
3. **Context capture:** read `result.contextId` (and `result.taskId` / `result.id`) for
   threading the next turn, from whichever shape is present.

- A JSON-RPC `error` object, a non-2xx HTTP status, a timeout, or an empty/unextractable reply
  → the run is marked **errored** (errored run = failed run; never retried — D5).
- Error messages carry endpoint host + HTTP status only — never headers or token (NFR-002).

## Invariants

- This is the **only** new network behavior, and it lives in the already-allow-listed
  `src/adapters/a2a/transport.ts` (NI-003). No other file gains a `fetch`.
- Reply extraction is pure given a response body → testable offline with fixture Message and
  Task payloads (no live endpoint needed for unit tests).
