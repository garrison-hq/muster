/**
 * Fetch-only OpenAI-compatible chat client (C-006; charter directive 5).
 *
 * - POST `{baseUrl}/chat/completions` with `{model, messages[, temperature]}`.
 *   The temperature key is OMITTED ENTIRELY when the caller does not supply
 *   one — the provider default applies and transcripts record `"default"`
 *   (C-009).
 * - The API key is read from `process.env[endpoint.apiKeyEnv]` AT CALL TIME
 *   and never stored, logged, or echoed in errors (R6, directive 5). When the
 *   variable is absent or empty, no Authorization header is sent at all
 *   (local Ollama needs none).
 * - This module is the ONLY place in `src/core/behavioral/` that touches
 *   `process.env` or the network (a conformance test greps for this).
 *
 * Error hygiene: messages carry the endpoint HOSTNAME (never the full URL or
 * its query), the HTTP status, and a short response-body excerpt — never
 * request headers.
 */

import type { ChatClient, ChatMessage, EndpointConfig } from "./types.js";

/** Request timeout — generous enough for local 7B models (NFR-002 envelope). */
const TIMEOUT_MS = 120_000;

/** Max response-body characters quoted into error messages. */
const BODY_EXCERPT_CHARS = 300;

/**
 * The endpoint answered but `choices[0].message.content` was empty or
 * missing. The runner counts this as a failed run (FR-022).
 */
export class EmptyResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmptyResponseError";
  }
}

/** Hostname for error context — never the full URL (no path/query leakage). */
function hostnameOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    // Not URL-parseable; fall back to a scheme-stripped, query-free prefix.
    return baseUrl.replace(/^[a-z+]+:\/\//i, "").split(/[/?#]/, 1)[0] ?? baseUrl;
  }
}

/** Extract `choices[0].message.content` from an OpenAI-style payload. */
function extractContent(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const choices = (payload as Record<string, unknown>)["choices"];
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (typeof first !== "object" || first === null) return null;
  const message = (first as Record<string, unknown>)["message"];
  if (typeof message !== "object" || message === null) return null;
  const content = (message as Record<string, unknown>)["content"];
  return typeof content === "string" ? content : null;
}

/**
 * Build a ChatClient for one OpenAI-compatible endpoint. Pure construction —
 * no env read, no network until `chat` is invoked.
 */
/** Strip trailing slashes without a regex to avoid super-linear backtracking. */
function stripTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === "/") {
    end--;
  }
  return end === s.length ? s : s.slice(0, end);
}

export function makeClient(endpoint: EndpointConfig): ChatClient {
  const url = `${stripTrailingSlashes(endpoint.baseUrl)}/chat/completions`;
  const host = hostnameOf(endpoint.baseUrl);

  return {
    async chat(
      messages: ChatMessage[],
      opts: { temperature?: number }
    ): Promise<string> {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      // Key read at call time, used once, never logged (directive 5).
      const apiKey = process.env[endpoint.apiKeyEnv];
      if (apiKey !== undefined && apiKey !== "") {
        headers["authorization"] = `Bearer ${apiKey}`;
      }

      const body = JSON.stringify({
        model: endpoint.model,
        messages,
        // C-009: spread adds the key ONLY when a temperature was supplied.
        ...(opts.temperature !== undefined && { temperature: opts.temperature }),
      });

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        // Hostname only — never the full URL, never headers.
        throw new Error(`chat request to ${host} failed: ${reason}`);
      }

      if (!response.ok) {
        let excerpt = "";
        try {
          excerpt = (await response.text()).slice(0, BODY_EXCERPT_CHARS);
        } catch {
          // Body unreadable — status alone will have to do.
        }
        throw new Error(
          `chat request to ${host} failed: HTTP ${response.status}` +
            (excerpt.length > 0 ? ` — ${excerpt}` : "")
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new EmptyResponseError(
          `chat response from ${host} is not JSON (counts as a failed run, FR-022)`
        );
      }

      const content = extractContent(payload);
      if (content === null || content.length === 0) {
        throw new EmptyResponseError(
          `chat response from ${host} has empty or missing ` +
            "choices[0].message.content (counts as a failed run, FR-022)"
        );
      }
      return content;
    },
  };
}
