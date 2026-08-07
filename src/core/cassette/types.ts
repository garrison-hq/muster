/**
 * Cassette core types (FR-002/003/004/006/011) — the schema-versioned,
 * canonical-JSON, byte-stable recording format for chat exchanges, and the
 * three-mode (`record`/`replay`/`live`) decorator contract built on top of
 * it.
 *
 * C-001/NI-002: this whole module (`src/core/cassette/`) is spec-agnostic
 * core — it imports only `../canonical-json.js` and `../behavioral/` (both
 * `src/core/`), never `src/adapters/`.
 */

import type { ChatMessage } from "../behavioral/types.js";

/**
 * Schema version stamped on every persisted cassette file (FR-003). Bump
 * this when the on-disk shape of `CassetteCaseFile` or `CassetteSuiteIndex`
 * changes incompatibly.
 */
export const SCHEMA_VERSION = "1";

/** The three modes `makeCassetteClient` supports (FR-007..010). */
export type CassetteMode = "record" | "replay" | "live";

/** Minimal, credential-safe provenance: requested model + endpoint hostname
 *  only (FR-004/FR-012) — never a full URL, never `apiKeyEnv`'s value, never
 *  key material. */
export interface CassetteProvenance {
  /** The requested model name — never the model the server actually served
   *  (FR-012: `ChatClient.chat()` discards the server-echoed model before it
   *  reaches cassette code). */
  model: string;
  /** Endpoint hostname only, extracted via `hostnameOf` (C-004). */
  hostname: string;
}

/** The fully-built request for a `chat` exchange — exactly what `ChatClient
 *  .chat` receives, post any blinding/arm-ordering transform (FR-005). */
export interface CassetteChatRequest {
  messages: ChatMessage[];
  opts: Record<string, unknown>;
}

/** The fully-built request for a `chatWithTools` exchange (FR-011). */
export interface CassetteToolRequest {
  messages: ChatMessage[];
  tools: unknown[];
}

/**
 * One recorded exchange (FR-004/FR-011). `kind` disambiguates the two
 * request/response shapes at the same seam without re-serializing
 * `chatWithTools` into `chat`'s shape, and without them ever colliding on
 * `requestHash` in practice (the fully-built request differs by
 * construction — `opts` vs. `tools` as the second request key).
 *
 * `durationMs` is opt-in (present whenever record mode measured a real
 * duration) and is excluded from NFR-001's byte-stability comparison — it
 * is real, non-deterministic wall-clock timing, not part of the
 * deterministic replay contract.
 *
 * FR-012 fidelity asymmetry: `ChatClient.chat()` (`src/core/behavioral/
 * client.ts`) parses the raw OpenAI-style JSON response and hands cassette
 * code only `choices[0].message.content` as a plain string — `finish_reason`,
 * `usage`, any additional `choices` beyond the first, and the server-echoed
 * `model` are all discarded before that seam returns, and cassette code
 * never sees them. A `kind: "chat"` exchange's `response` is therefore just
 * that extracted string. `chatWithTools`, by contrast, returns the full raw
 * JSON-parsed payload (`unknown`) untouched, so a `kind: "chatWithTools"`
 * exchange's `response` retains everything the server sent — this is the
 * `chat`/`chatWithTools` fidelity asymmetry. `provenance.model` on both
 * kinds is always the *requested* model (`endpoint.model`, config-supplied)
 * — never the served one, since the served model is one of the fields
 * `chat()` discards and `chatWithTools` never inspects for provenance
 * purposes.
 */
export type CassetteExchange =
  | {
      kind: "chat";
      /** hex sha256 over `canonicalJson(request)`, post-transform (FR-005). */
      requestHash: string;
      /** 1-based; resets per case file, increments per repeated identical
       *  request key within that file (FR-006). */
      ordinal: number;
      request: CassetteChatRequest;
      response: string;
      provenance: CassetteProvenance;
      durationMs?: number;
    }
  | {
      kind: "chatWithTools";
      requestHash: string;
      ordinal: number;
      request: CassetteToolRequest;
      response: unknown;
      provenance: CassetteProvenance;
      durationMs?: number;
    };

/** One case's cassette file — one per case, one directory per suite run
 *  (FR-003/design decision #1). */
export interface CassetteCaseFile {
  schemaVersion: string;
  caseId: string;
  exchanges: CassetteExchange[];
}

/**
 * The suite index/provenance file — one per suite run directory
 * (FR-003/design decision #1). `suiteId` is informational provenance only
 * (the manifest's resolved path at record time), never compared for
 * byte-stability. `cases[].runs` is the authoritative per-case declared run
 * count a replay caller reads — never inferred from exchange counts.
 */
export interface CassetteSuiteIndex {
  schemaVersion: string;
  suiteId: string;
  cases: { id: string; runs: number }[];
  recordedAt: string;
}
