/**
 * Request hashing (FR-005): the request-hash key that drives cassette
 * record/replay ordinal keying.
 *
 * C-003: reuses `canonicalJson` (`src/core/canonical-json.ts`) verbatim —
 * no parallel canonicalization implementation.
 *
 * FR-005: the hash MUST be computed over the canonical-JSON form of the
 * *fully-built* request, i.e. exactly what `ChatClient.chat`/`ToolChatClient
 * .chatWithTools` receives — **after** any blinding/arm-ordering transform a
 * caller applies upstream (e.g. `blindArmOrder`,
 * `src/adapters/memory-utilization/rubric.ts:234`), never over a
 * pre-blinding logical probe identity. This module has no notion of
 * "blinding" at all — it hashes whatever request object it is given, which
 * is what makes this guarantee hold: the decorator (`client.ts`) only ever
 * calls this function with the literal arguments its own `chat`/
 * `chatWithTools` methods receive, i.e. already past any upstream transform.
 */

import { createHash } from "node:crypto";
import { canonicalJson } from "../canonical-json.js";
import type { CassetteChatRequest, CassetteToolRequest } from "./types.js";

/**
 * Compute the hex sha256 request-hash key for a fully-built `chat` or
 * `chatWithTools` request.
 */
export function computeRequestHash(
  request: CassetteChatRequest | CassetteToolRequest
): string {
  return createHash("sha256").update(canonicalJson(request)).digest("hex");
}
