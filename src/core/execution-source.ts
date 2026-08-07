/**
 * Shared execution-source resolver (FR-018, C-005) — a single, precedence-
 * ordered answer to "is there a configured execution source, and where did
 * it come from" that wave-2 missions (#100/#101/#102) consume by passing
 * their own call-site-specific `ExecutionSourceInput`.
 *
 * This module is deliberately unwired in this mission (C-005): it ships
 * with its own unit tests and is consumed by no call site yet. The five
 * existing gate-bearing checks it is designed to replace (unmodified by
 * this mission) are:
 *   - `src/adapters/heartbeat/index.ts:497` — `process.env["MUSTER_ENDPOINT"]`
 *     only.
 *   - `src/cli/index.ts` `buildSopClient` (`sop run`) — `MUSTER_ENDPOINT`
 *     only.
 *   - `src/cli/index.ts` `doToolsRun`'s endpoint check — `MUSTER_ENDPOINT`
 *     only.
 *   - `src/adapters/skills/trigger.ts:83-101` `resolveEndpointBaseUrl` —
 *     `MUSTER_ENDPOINT` (canonical) then `MUSTER_BASE_URL` (deprecated
 *     alias), canonical wins silently when both are set.
 *   - `src/cli/index.ts` `doCrossLayerNoEnvEndpoint` — env var, then a
 *     manifest endpoint-block fallback today detected by catching and
 *     string-matching an error message; this resolver replaces that with an
 *     explicit `manifestHasEndpointBlock` boolean the caller supplies.
 *
 *     CAVEAT (WP02 cycle-1 finding WP02-C1-001): this call site's own env
 *     check, `endpointFromEnv` (`src/cli/index.ts:887-895`), reads only
 *     `MUSTER_ENDPOINT` — never `MUSTER_BASE_URL`. Neither
 *     `doCrossLayerNoEnvEndpoint` nor the function it calls,
 *     `runCrossLayerManifest` (`src/crosslayer/manifest-runner.ts`), ever
 *     reads `process.env` for a base URL; `runCrossLayerManifest` only ever
 *     consults an explicit `endpointOverride` option or the manifest's own
 *     `endpoint` block. A wave-2 caller wiring this resolver into that call
 *     site MUST NOT let `env` default to `process.env`: it must pass an env
 *     snapshot with `MUSTER_BASE_URL` excluded or explicitly `undefined`
 *     (e.g. `{ ...process.env, MUSTER_BASE_URL: undefined }`). Letting `env`
 *     default there would make branch 3 (below) report
 *     `{ configured: true, usedDeprecatedAlias: true }` from a
 *     `MUSTER_BASE_URL`-only environment — a signal this call site's call
 *     graph has no way to act on — turning today's graceful static-only
 *     degrade into an unhandled validation error once the string-match catch
 *     it replaces is retired. (See the "branch 3" test in
 *     `tests/unit/execution-source.test.ts`, which already pins
 *     `usedDeprecatedAlias: true` for the alias-only case; a caller can use
 *     that flag to detect and reject this scenario before acting on
 *     `configured`.)
 *
 * C-001: this module imports nothing from `src/adapters/` and performs no
 * I/O — it is a pure function over its input.
 */

/**
 * Input to {@link resolveExecutionSource}. All fields are optional; a
 * caller supplies only the signals relevant to its own call site (FR-018,
 * SC-006).
 */
export interface ExecutionSourceInput {
  /**
   * The environment snapshot to read `MUSTER_ENDPOINT`/`MUSTER_BASE_URL`
   * from. Defaults to `process.env` when omitted.
   *
   * CAVEAT for the crosslayer `doCrossLayerNoEnvEndpoint` call site
   * specifically: see the top-of-file per-call-site note above — that call
   * site's call graph has no `MUSTER_BASE_URL` support, so a caller wiring
   * this resolver in there must not let `env` default to `process.env`.
   */
  env?: NodeJS.ProcessEnv;
  /**
   * `true` when the caller has a replay-configured cassette. A
   * replay-configured cassette always counts as a configured execution
   * source, regardless of any other input (FR-018 branch 1).
   */
  cassetteReplayConfigured?: boolean;
  /**
   * `true` when the caller's manifest declares an endpoint block
   * (crosslayer's signal, `src/cli/index.ts:936-943`). Consulted only
   * after both env vars are checked and found absent (FR-018 branch 4).
   */
  manifestHasEndpointBlock?: boolean;
}

/** The source that resolved an execution source, in FR-018 precedence order. */
export type ExecutionSource = "cassette" | "env" | "manifest-endpoint-block" | "none";

/** Result of {@link resolveExecutionSource}. */
export interface ExecutionSourceResult {
  /** Whether any execution source was resolved. */
  configured: boolean;
  /** Which branch of the precedence table resolved it. */
  source: ExecutionSource;
  /**
   * `true` only when `MUSTER_BASE_URL` (the deprecated alias) is the var
   * that actually supplied the value — i.e. `MUSTER_ENDPOINT` was unset.
   * `MUSTER_ENDPOINT` always wins silently when both are set, matching
   * `skills/trigger.ts`'s `resolveEndpointBaseUrl` precedence.
   */
  usedDeprecatedAlias: boolean;
}

/**
 * Resolve whether an execution source is configured, and from where,
 * following FR-018's five-branch precedence table, evaluated in order:
 *
 * 1. `cassetteReplayConfigured === true` → always
 *    `{ configured: true, source: "cassette", usedDeprecatedAlias: false }`,
 *    regardless of any other input.
 * 2. else `env.MUSTER_ENDPOINT` non-empty →
 *    `{ configured: true, source: "env", usedDeprecatedAlias: false }`.
 * 3. else `env.MUSTER_BASE_URL` non-empty (deprecated alias) →
 *    `{ configured: true, source: "env", usedDeprecatedAlias: true }`.
 * 4. else `manifestHasEndpointBlock === true` →
 *    `{ configured: true, source: "manifest-endpoint-block", usedDeprecatedAlias: false }`.
 * 5. otherwise → `{ configured: false, source: "none", usedDeprecatedAlias: false }`.
 *
 * `env` defaults to `process.env` when omitted. A non-empty check means
 * `!== undefined && !== ""`, matching every existing call site's own env
 * check.
 */
export function resolveExecutionSource(
  input: ExecutionSourceInput = {}
): ExecutionSourceResult {
  const { env = process.env, cassetteReplayConfigured, manifestHasEndpointBlock } = input;

  if (cassetteReplayConfigured === true) {
    return { configured: true, source: "cassette", usedDeprecatedAlias: false };
  }

  const canonical = env["MUSTER_ENDPOINT"];
  if (canonical !== undefined && canonical !== "") {
    return { configured: true, source: "env", usedDeprecatedAlias: false };
  }

  const alias = env["MUSTER_BASE_URL"];
  if (alias !== undefined && alias !== "") {
    return { configured: true, source: "env", usedDeprecatedAlias: true };
  }

  if (manifestHasEndpointBlock === true) {
    return { configured: true, source: "manifest-endpoint-block", usedDeprecatedAlias: false };
  }

  return { configured: false, source: "none", usedDeprecatedAlias: false };
}
