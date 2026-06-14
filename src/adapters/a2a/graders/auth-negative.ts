/**
 * Auth-enforcement negative grader: verify that declared security schemes are
 * actually enforced against unauthenticated / wrong-scheme requests.
 *
 * Implements T019 (auth-enforcement negative check) and T020 (discrimination control).
 *
 * Hard rules (FR-007, FR-010, FR-011):
 * - A single deterministic result per check — NOT k-of-n.
 * - probeAuth(endpoint, method, null) must return rejected:true (unauthorized rejected).
 * - probeAuth(endpoint, method, token) must return rejected:false when a valid token
 *   is supplied (authorized request accepted).
 * - A thrown transport error → passed:false (failed run, FR-010 — never a skip).
 * - The ONE nested skip is in signed-card.ts (live JWKS down). This grader also
 *   produces a skip for unsupported scheme types (see schemeTypeUnsupported below).
 *
 * Unsupported scheme types (FIX 4):
 * Non-bearer-style schemes (e.g. apiKey) are NOT probed. The grader returns a
 * result with schemeTypeUnsupported set so the runManifest caller maps it to a
 * SKIPPED case with a diagnostic reason. This prevents a false pass and prevents
 * a misleading failure from probing Bearer when a non-bearer scheme is declared.
 *
 * Discrimination control (T020, FR-011):
 * Pointing this grader at an enforceAuth:false server (declared-but-unenforced)
 * returns rejectedUnauthorized:false → passed:false. This proves the grader can
 * fail and is NOT a smoke-test that always passes.
 *
 * Citation: A2A spec v1.0.0 protobuf a2a.proto §7 (security schemes);
 * muster rubric FR-007, FR-010, FR-011.
 */

import { probeAuth } from "../transport.js";
import type { SecurityScheme } from "../card.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The result of an auth-enforcement negative check.
 *
 * - `rejectedUnauthorized`  — true when an unauthenticated request was correctly rejected.
 * - `acceptedAuthorized`    — true when an authorized request was correctly accepted,
 *                             or true (not-applicable) when no authorizedToken was supplied.
 * - `passed`                — true iff rejectedUnauthorized AND acceptedAuthorized.
 * - `schemeTypeUnsupported` — when set, this scheme type is not exercised by this grader
 *                             (e.g. apiKey). The caller should map this to a SKIPPED case.
 * - `detail`                — optional diagnostic detail (status codes, not-applicable notes).
 */
export interface AuthCheck {
  rejectedUnauthorized: boolean;
  acceptedAuthorized: boolean;
  passed: boolean;
  schemeTypeUnsupported?: string;
  detail?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// T019 — checkAuthEnforcement
// ---------------------------------------------------------------------------

/**
 * Check that a protected A2A method enforces the declared security scheme.
 *
 * Steps:
 * 1. Probe the endpoint with no credentials (null). Expected: rejected:true.
 * 2. If authorizedToken is supplied, probe with the token. Expected: rejected:false.
 *    If no token is supplied, mark acceptedAuthorized as not-applicable (true, in detail).
 * 3. passed = rejectedUnauthorized && acceptedAuthorized.
 * 4. A thrown transport error → passed:false (failed run, FR-010).
 *
 * This check is DETERMINISTIC — a single authoritative result, not k-of-n.
 * The server either enforces auth or it doesn't.
 *
 * DISCRIMINATION CONTROL (T020, FR-011):
 * When pointed at an enforceAuth:false server (declared-but-unenforced), the
 * unauthenticated request succeeds → rejectedUnauthorized:false → passed:false.
 * This is the rigged-impossible control that proves the grader can fail.
 *
 * @param endpoint        - Base URL of the A2A agent.
 * @param scheme          - The declared SecurityScheme (used for the `method` parameter).
 * @param method          - The A2A JSON-RPC method to probe (e.g. "message/send").
 * @param authorizedToken - Bearer token for the authorized probe, or null to skip it.
 *
 * Citation: A2A spec v1.0.0 protobuf a2a.proto §7; muster rubric FR-007.
 */
/** Scheme types this grader exercises with a Bearer probe. */
const BEARER_STYLE_SCHEMES = new Set(["bearer", "oauth2", "http"]);

export async function checkAuthEnforcement(
  endpoint: string,
  scheme: SecurityScheme,
  method: string,
  authorizedToken: string | null
): Promise<AuthCheck> {
  // FIX 4: Only probe bearer-style schemes. Non-bearer schemes (e.g. apiKey) are
  // not exercised — probing them with Bearer would produce a misleading result.
  // Return an explicit unsupported-scheme signal so the caller skips the case.
  if (!BEARER_STYLE_SCHEMES.has(scheme.type)) {
    return {
      rejectedUnauthorized: false,
      acceptedAuthorized: false,
      passed: false,
      schemeTypeUnsupported: scheme.type,
      detail: {
        schemeTypeUnsupported: scheme.type,
        note: "only bearer-style schemes are exercised by this residual-gap adapter",
        schemeId: scheme.id,
        method,
        citation: "A2A spec v1.0.0 §7; muster rubric FR-007",
      },
    };
  }

  let rejectedUnauthorized: boolean;
  let unauthStatus: number | undefined;

  // Step 1: probe unauthenticated — expect rejected:true
  try {
    const unauthResult = await probeAuth(endpoint, method, null);
    rejectedUnauthorized = unauthResult.rejected;
    unauthStatus = unauthResult.status;
  } catch (err) {
    // Transport error on the unauth probe → failed run (FR-010)
    return {
      rejectedUnauthorized: false,
      acceptedAuthorized: false,
      passed: false,
      detail: {
        unauthProbeError: String(err),
        schemeId: scheme.id,
        schemeType: scheme.type,
        method,
        citation: "A2A spec v1.0.0 §7; muster rubric FR-007",
      },
    };
  }

  // Step 2: probe authorized (if token supplied) — expect rejected:false (accepted)
  let acceptedAuthorized: boolean;
  const detail: Record<string, unknown> = {
    schemeId: scheme.id,
    schemeType: scheme.type,
    method,
    unauthStatus,
    citation: "A2A spec v1.0.0 §7; muster rubric FR-007",
  };

  if (authorizedToken === null) {
    // No token supplied: record as not-applicable, treat as true (cannot fail this leg)
    acceptedAuthorized = true;
    detail["acceptedAuthorizedApplicable"] = false;
    detail["acceptedAuthorizedNote"] = "no authorizedToken supplied — authorized-probe leg not-applicable";
  } else {
    let authStatus: number | undefined;
    try {
      const authResult = await probeAuth(endpoint, method, authorizedToken);
      // Accepted means NOT rejected
      acceptedAuthorized = !authResult.rejected;
      authStatus = authResult.status;
    } catch (err) {
      // Transport error on the authorized probe → failed run (FR-010)
      return {
        rejectedUnauthorized,
        acceptedAuthorized: false,
        passed: false,
        detail: {
          ...detail,
          authProbeError: String(err),
        },
      };
    }
    detail["authStatus"] = authStatus;
    detail["acceptedAuthorizedApplicable"] = true;
  }

  const passed = rejectedUnauthorized && acceptedAuthorized;

  return {
    rejectedUnauthorized,
    acceptedAuthorized,
    passed,
    detail,
  };
}
