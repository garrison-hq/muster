/**
 * A2A static-lint class: assembles discovery + structure + offline JWS findings
 * into a byte-stable LintReport.
 *
 * Implements FR-003 (discovery URI), FR-004 (offline JWS via signature.ts),
 * FR-005 (delegation note), FR-011 (signature discrimination control),
 * NFR-001 (byte-stable deterministic output).
 *
 * Hard rules:
 * - All output is byte-stable: no Date, no random, no localeCompare.
 * - ok is false iff any finding has severity "error" OR (expectSigned && signature !== "verified").
 * - serializeLintReport uses canonicalJson (RFC 8785) for deterministic output.
 * - The rigged-impossible discrimination control (signatureControl) is exported
 *   for use in tests proving the signature grader can fail (FR-011).
 */

import { canonicalJson } from "../../core/canonical-json.js";
import type { AgentCard, LintFinding } from "./card.js";
import { checkDiscoveryUri, checkStructure, delegationNote } from "./card.js";
import type { Jwks } from "./signature.js";
import { verifyCardJws } from "./signature.js";

// ---------------------------------------------------------------------------
// Public types (T009)
// ---------------------------------------------------------------------------

/**
 * A lint finding from the A2A static-lint class.
 *
 * severity "error" → sets ok: false.
 * severity "info"  → informational only, does not set ok: false.
 */
export type LintSeverity = "error" | "info";

/**
 * An A2A lint finding (extends WP01's LintFinding with severity).
 */
export interface A2aLintFinding extends LintFinding {
  severity: LintSeverity;
}

/**
 * The signature verification status for a lint report.
 * - "verified"    — JWS verified offline against the supplied JWKS.
 * - "invalid"     — JWS verification failed (tamper or wrong key).
 * - "unsigned"    — Card has no signature.
 * - "not-checked" — No JWKS was supplied; verification was not attempted.
 */
export type SignatureStatus = "verified" | "invalid" | "unsigned" | "not-checked";

/**
 * The static-lint report for one Agent Card.
 *
 * Byte-stable: identical across repeated runs and machines (NFR-001).
 */
export interface LintReport {
  path: string;
  ok: boolean;
  discoveredFrom: string;
  findings: A2aLintFinding[];
  signature: SignatureStatus;
  detail: { schemaValidation: "delegated:a2a-tck" };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Map a WP01 LintFinding (no severity) to an A2aLintFinding with severity.
 * WP01 discovery/structure findings are always "error" severity when present.
 */
function toA2aFinding(f: LintFinding, severity: LintSeverity): A2aLintFinding {
  return { rule: f.rule, path: f.path, message: f.message, severity };
}

/**
 * Build the signature status and optional finding from a verifyCardJws result.
 */
function resolveSignature(
  card: AgentCard,
  jwks: Jwks | undefined
): { status: SignatureStatus; finding: A2aLintFinding | null } {
  if (jwks === undefined) {
    return { status: "not-checked", finding: null };
  }

  const result = verifyCardJws(card, jwks);

  if (result.verified) {
    return { status: "verified", finding: null };
  }

  if (result.reason === "card is unsigned") {
    return { status: "unsigned", finding: null };
  }

  // Signature failed verification — produce an error finding.
  const finding: A2aLintFinding = {
    rule: "jws-signature",
    path: card.discoveredFrom,
    message:
      `JWS signature verification failed: ${result.reason ?? "unknown reason"}` +
      (result.alg !== undefined ? ` (alg: ${result.alg})` : "") +
      (result.kid !== undefined ? ` (kid: ${result.kid})` : "") +
      ". Citation: A2A spec v1.0.0 signed cards FR-004; muster rubric.",
    severity: "error",
  };
  return { status: "invalid", finding };
}

// ---------------------------------------------------------------------------
// T009 — lintCard (static-lint assembler)
// ---------------------------------------------------------------------------

/**
 * Run offline static lint checks on a parsed AgentCard.
 *
 * Assembles:
 * 1. checkDiscoveryUri (WP01) — well-known URI correctness (A2A §8.2).
 * 2. checkStructure (WP01)    — residual-gap structural sanity (§8.3.1, §7).
 * 3. verifyCardJws (WP02)     — offline JWS signature verification (FR-004),
 *    only when opts.jwks is supplied.
 *
 * ok is false iff:
 * - Any finding has severity "error", OR
 * - opts.expectSigned is true AND signature !== "verified".
 *
 * Output is byte-stable: no timestamps, stable key order (NFR-001).
 *
 * @param card  - Parsed AgentCard (from parseAgentCard in card.ts).
 * @param opts  - Optional: { jwks, expectSigned }.
 */
export function lintCard(
  card: AgentCard,
  opts?: { jwks?: Jwks; expectSigned?: boolean }
): LintReport {
  const findings: A2aLintFinding[] = [];

  // Step 1: Discovery URI check (FR-003).
  const discoveryFinding = checkDiscoveryUri(card.discoveredFrom);
  if (discoveryFinding !== null) {
    findings.push(toA2aFinding(discoveryFinding, "error"));
  }

  // Step 2: Structural sanity checks (FR-005).
  for (const f of checkStructure(card)) {
    findings.push(toA2aFinding(f, "error"));
  }

  // Step 3: Offline JWS verification (FR-004), when JWKS is provided.
  const { status, finding: sigFinding } = resolveSignature(card, opts?.jwks);
  if (sigFinding !== null) {
    findings.push(sigFinding);
  }

  // Sort findings by rule using UTF-16 code-unit ordering (NFR-001, no localeCompare).
  findings.sort((a, b) => (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0));

  // ok is false iff any error finding OR (expectSigned && not verified).
  const hasErrorFinding = findings.some((f) => f.severity === "error");
  const expectSignedFailed =
    (opts?.expectSigned ?? false) && status !== "verified";

  const ok = !hasErrorFinding && !expectSignedFailed;

  return {
    path: card.discoveredFrom,
    ok,
    discoveredFrom: card.discoveredFrom,
    findings,
    signature: status,
    detail: delegationNote(),
  };
}

// ---------------------------------------------------------------------------
// T009 — serializeLintReport (byte-stable)
// ---------------------------------------------------------------------------

/**
 * Serialize a LintReport to a canonical, byte-stable JSON string.
 *
 * Uses canonicalJson (RFC 8785) — keys sorted by UTF-16 code-unit ordering.
 * No timestamps. Output is byte-identical across repeated runs and machines.
 *
 * Key order in output (UTF-16 sort): detail, discoveredFrom, findings, ok, path, signature.
 * Each finding key order: message, path, rule, severity.
 *
 * Citation: NFR-001, FR-013; mirrors heartbeat's serializeLintReport pattern.
 */
export function serializeLintReport(report: LintReport): string {
  const findingsJson = report.findings.map((f) => ({
    message: f.message,
    path: f.path,
    rule: f.rule,
    severity: f.severity,
  }));

  const output = {
    detail: report.detail,
    discoveredFrom: report.discoveredFrom,
    findings: findingsJson,
    ok: report.ok,
    path: report.path,
    signature: report.signature,
  };

  return canonicalJson(output);
}

// ---------------------------------------------------------------------------
// T010 — Rigged-impossible signature discrimination control (FR-011)
// ---------------------------------------------------------------------------

/**
 * Signature discrimination control for FR-011.
 *
 * This function constructs a case where signature verification MUST fail:
 * it takes a card whose payload was tampered after signing (stale signature)
 * and asserts `expectVerified: true`. The returned lint report will have
 * `signature: "invalid"` and `ok: false`, proving the grader discriminates.
 *
 * Usage in tests:
 *   const { report, expectation } = signatureControl(tamperedCard, validJwks);
 *   // The grader returns signature: "invalid" — failing the rigged expectation.
 *   assert(report.signature === "invalid");         // grader correctly detected tamper
 *   assert(expectation.expectVerified === true);    // rigged expectation was impossible
 *   assert(report.ok === false);                    // control fails as designed
 *
 * Citation: FR-011 "every grader ships a rigged-impossible discrimination control".
 */
export function signatureControl(
  card: AgentCard,
  jwks: Jwks
): { report: LintReport; expectation: { expectVerified: true } } {
  const report = lintCard(card, { jwks, expectSigned: true });
  return { report, expectation: { expectVerified: true } };
}
