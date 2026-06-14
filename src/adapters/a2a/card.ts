/**
 * A2A Agent Card parser, discovery-URI lint, and structural sanity checks.
 *
 * Implements FR-002 (parse), FR-003 (well-known URI check), FR-005 (structural
 * sanity + delegation note), and NFR-001 (byte-stable deterministic output).
 *
 * Hard rules:
 * - parse NEVER throws on a structurally-odd card — it returns findings.
 * - Deep card-schema validation is explicitly delegated to a2a-tck (C-002, FR-005).
 * - All output is deterministic and byte-stable: no Date, no random, no localeCompare.
 * - Discovery check cites A2A §8.2 (protobuf a2a.proto is the normative source,
 *   the JSON Schema is non-normative, C-003).
 */

// ---------------------------------------------------------------------------
// Domain types (data-model.md)
// ---------------------------------------------------------------------------

/** A skill advertised on the Agent Card, probed against the live agent (§8.3.1). */
export interface DeclaredSkill {
  id: string;
  description: string;
  /** Optional framing used to grade an actual response (§8.3.1). */
  expectedBehavior?: string;
}

/** A declared auth scheme (§7) exercised by the auth-negative probes. */
export interface SecurityScheme {
  id: string;
  type: string;
  /** A2A methods the scheme is meant to guard. */
  protectedMethods: string[];
}

/**
 * A compact/detached JWS signature over the card payload.
 * Retained verbatim for downstream JWS verification (WP02).
 */
export interface JwsSignature {
  protected: string;
  signature: string;
  header?: Record<string, unknown>;
}

/**
 * The parsed Agent Card entity.
 *
 * `raw` is retained verbatim (the original parsed JSON object) for downstream
 * JWS signature verification in WP02 — the verify step needs the exact
 * bytes/structure that was signed, without any normalisation applied by this parser.
 */
export interface AgentCard {
  name: string;
  version: string;
  skills: DeclaredSkill[];
  securitySchemes: SecurityScheme[];
  signatures?: JwsSignature[];
  /** The URI or file path the card was loaded from. Used to flag the obsolete agent.json (§8.2). */
  discoveredFrom: string;
  /** The original parsed JSON, retained verbatim for WP02 JWS verification. */
  raw: unknown;
}

/**
 * A single lint finding from discovery-URI or structural checks.
 * Reused by WP02 for JWS lint findings.
 */
export interface LintFinding {
  rule: string;
  path: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Internal helpers — narrow raw JSON to typed shapes safely
// ---------------------------------------------------------------------------

function toStringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function parseDeclaredSkill(raw: unknown): DeclaredSkill | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const id = toStringOrEmpty(obj["id"]);
  const description = toStringOrEmpty(obj["description"]);
  const skill: DeclaredSkill = { id, description };
  if (typeof obj["expectedBehavior"] === "string") {
    skill.expectedBehavior = obj["expectedBehavior"];
  }
  return skill;
}

function parseSecurityScheme(raw: unknown): SecurityScheme | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const id = toStringOrEmpty(obj["id"]);
  const type = toStringOrEmpty(obj["type"]);
  const protectedMethods = toStringArray(obj["protectedMethods"]);
  return { id, type, protectedMethods };
}

function parseJwsSignature(raw: unknown): JwsSignature | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const protectedField = toStringOrEmpty(obj["protected"]);
  const signature = toStringOrEmpty(obj["signature"]);
  const sig: JwsSignature = { protected: protectedField, signature };
  if (typeof obj["header"] === "object" && obj["header"] !== null) {
    sig.header = obj["header"] as Record<string, unknown>;
  }
  return sig;
}

// ---------------------------------------------------------------------------
// T001 — Parse AgentCard (FR-002)
// ---------------------------------------------------------------------------

/**
 * Parse raw Agent Card JSON into a typed AgentCard.
 *
 * Never throws on a structurally-odd card — parse failures are surfaced as
 * empty skills/securitySchemes; the caller (lint) surfaces the finding.
 *
 * `raw` is retained verbatim for downstream JWS verification (WP02).
 *
 * @param rawJson   - The raw JSON string to parse.
 * @param discoveredFrom - The URI or file path the card was loaded from.
 */
export function parseAgentCard(rawJson: string, discoveredFrom: string): AgentCard {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch {
    // JSON parse failure: return a minimal card with empty arrays.
    // The caller (checkStructure / checkDiscoveryUri) will surface lint findings.
    return {
      name: "",
      version: "",
      skills: [],
      securitySchemes: [],
      discoveredFrom,
      raw: null,
    };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return {
      name: "",
      version: "",
      skills: [],
      securitySchemes: [],
      discoveredFrom,
      raw: parsed,
    };
  }

  const obj = parsed as Record<string, unknown>;

  const skills: DeclaredSkill[] = [];
  if (Array.isArray(obj["skills"])) {
    for (const s of obj["skills"] as unknown[]) {
      const skill = parseDeclaredSkill(s);
      if (skill !== null) skills.push(skill);
    }
  }

  const securitySchemes: SecurityScheme[] = [];
  if (Array.isArray(obj["securitySchemes"])) {
    for (const s of obj["securitySchemes"] as unknown[]) {
      const scheme = parseSecurityScheme(s);
      if (scheme !== null) securitySchemes.push(scheme);
    }
  }

  const card: AgentCard = {
    name: toStringOrEmpty(obj["name"]),
    version: toStringOrEmpty(obj["version"]),
    skills,
    securitySchemes,
    discoveredFrom,
    raw: parsed,
  };

  if (Array.isArray(obj["signatures"])) {
    const sigs: JwsSignature[] = [];
    for (const s of obj["signatures"] as unknown[]) {
      const sig = parseJwsSignature(s);
      if (sig !== null) sigs.push(sig);
    }
    card.signatures = sigs;
  }

  return card;
}

// ---------------------------------------------------------------------------
// T002 — Discovery well-known URI check (FR-003, A2A §8.2)
// ---------------------------------------------------------------------------

/** The canonical well-known path mandated by A2A §8.2. */
const CANONICAL_WELL_KNOWN = "/.well-known/agent-card.json";

/** The obsolete well-known path that §8.2 deprecated in favour of agent-card.json. */
const OBSOLETE_WELL_KNOWN = "/.well-known/agent.json";

/**
 * Check that the discovery URI uses the canonical well-known path (A2A §8.2).
 *
 * - Returns `null` when the URI ends with `/.well-known/agent-card.json` (pass).
 * - Returns a LintFinding when it ends with `/.well-known/agent.json` (obsolete URI).
 * - Returns `null` for any other path (e.g. fixture file paths in tests) so that
 *   local-file linting still works — the well-known check only fires for
 *   `.well-known/*` URIs.
 *
 * Citation: A2A spec v1.0.0, §8.2 (normative source: protobuf a2a.proto; the
 * JSON Schema is non-normative, C-003).
 */
export function checkDiscoveryUri(discoveredFrom: string): LintFinding | null {
  if (discoveredFrom.endsWith(CANONICAL_WELL_KNOWN)) {
    return null;
  }

  if (discoveredFrom.endsWith(OBSOLETE_WELL_KNOWN)) {
    return {
      rule: "well-known-uri",
      path: discoveredFrom,
      message:
        "Card discovered at the obsolete agent.json well-known URI; " +
        "A2A §8.2 requires agent-card.json (/.well-known/agent-card.json). " +
        "Citation: A2A spec v1.0.0 protobuf a2a.proto §8.2.",
    };
  }

  // Not a well-known path at all — not applicable for local file linting.
  return null;
}

// ---------------------------------------------------------------------------
// T003 — Structural sanity checks + a2a-tck delegation note (FR-005)
// ---------------------------------------------------------------------------

/**
 * Run residual-gap structural sanity checks on a parsed AgentCard.
 *
 * Checks only the minimum the residual-gap probes need:
 * - Each DeclaredSkill must have a non-empty `id`.
 * - Each SecurityScheme must have a non-empty `id` and `type`.
 * - A card declaring NO schemes is NOT a finding (auth probes not applicable).
 *
 * Deep card-schema validation is explicitly delegated to a2a-tck (C-002, FR-005).
 * This is NOT a substitute for running a2a-tck — it is the residual-gap check only.
 *
 * Citation: A2A spec v1.0.0 protobuf a2a.proto §8.3.1 (skill structure), §7
 * (security scheme structure).
 */
export function checkStructure(card: AgentCard): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const skill of card.skills) {
    if (skill.id.trim().length === 0) {
      findings.push({
        rule: "skill-structure",
        path: card.discoveredFrom,
        message:
          "DeclaredSkill has an empty or missing `id`. " +
          "Citation: A2A spec v1.0.0 protobuf a2a.proto §8.3.1.",
      });
    }
  }

  for (const scheme of card.securitySchemes) {
    const idMissing = scheme.id.trim().length === 0;
    const typeMissing = scheme.type.trim().length === 0;
    if (idMissing || typeMissing) {
      findings.push({
        rule: "scheme-structure",
        path: card.discoveredFrom,
        message:
          "SecurityScheme has an empty or missing `id` or `type`. " +
          "Citation: A2A spec v1.0.0 protobuf a2a.proto §7.",
      });
    }
  }

  return findings;
}

/**
 * Returns a delegation note recording that full A2A card-schema validation is
 * delegated to `a2a-tck` (C-002, FR-005).
 *
 * This note MUST be included in the lint report detail (WP02 assembles it).
 * Do NOT use this note as a substitute for running a2a-tck.
 */
export function delegationNote(): { schemaValidation: "delegated:a2a-tck" } {
  return { schemaValidation: "delegated:a2a-tck" };
}
