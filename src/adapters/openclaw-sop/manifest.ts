/**
 * manifest.ts — SOPFile reader, SOPRuleManifest schema + Ajv validator,
 * and static lint detectors for the openclaw-sop adapter.
 *
 * FR-001: SpecAdapter-compliant data layer.
 * FR-002: Parse AGENTS.md SOP files (readSOPFile).
 * FR-003: Load and validate muster-authored rule manifest (loadAndValidateManifest).
 * FR-009: Throw (never silent-pass) when source.normative is missing or empty.
 * NFR-001: Pure function; zero network I/O; deterministic finding order.
 * C-001: src/core/ is untouched — all SOP types live here in src/adapters/openclaw-sop/.
 * C-006: SOPFile.content is verbatim, never modified.
 */

import { readFile } from "node:fs/promises";
import AjvModule from "ajv";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Ajv = (AjvModule as any).default ?? AjvModule;
import { parse as parseYaml } from "yaml";

// ---------------------------------------------------------------------------
// Exported Types (data-model.md — verbatim interfaces)
// ---------------------------------------------------------------------------

/** An AGENTS.md operating policy in markdown. Content is verbatim (C-006). */
export interface SOPFile {
  /** Absolute path to the AGENTS.md file. */
  path: string;
  /** Raw markdown content (UTF-8). Never modified. */
  content: string;
  /** Byte length; used for truncation-limit checks (RQ-04). */
  byteLength: number;
}

/** Stable machine-readable declaration of what to test. */
export interface SOPRuleManifestEntry {
  /** Stable identifier for this rule across manifest versions. */
  ruleId: string;
  /** Verbatim text of the rule as it appears (or should appear) in the SOP. */
  ruleText: string;
  /** IDs of the probes that test this rule. */
  probeIds: string[];
  /** Grading class: binary if trace-decidable; judge if fuzzy (RQ-08). */
  gradingClass: "binary" | "judge";
  /** Aggregation strategy for k runs (FR-007). */
  aggregation: "pass-k" | "k-of-n";
  /** k (number of runs). */
  k: number;
  /** k-of-n threshold; only applicable when aggregation = "k-of-n". */
  passThreshold?: number;
  /** Optional precedence declaration to resolve conflicts. */
  precedence?: string;
  /** Normative source the check cites (FR-009; charter traceability rule). */
  source: {
    /** URL or path to muster's published rubric (the normative source). */
    normative: string;
    /** Optional supporting source: OpenClaw doc URL pinned to a commit SHA (C-002). */
    supporting?: string;
  };
}

/** The muster-authored manifest pairing SOP rules with probes + grading metadata. */
export interface SOPRuleManifest {
  /** Manifest schema version for drift detection. */
  version: string;
  /** Path (relative to the manifest file) to the companion SOPFile. */
  sopFile: string;
  rules: SOPRuleManifestEntry[];
}

/** A static lint finding emitted by the lint detectors. */
export interface SOPLintFinding {
  /** Finding type: UNDEFINED_PRECEDENCE | RULE_DRIFT | TOOL_DRIFT |
   *  MISSING_SOURCE | MANIFEST_ERROR | STRUCTURAL_ABSENCE */
  kind: string;
  /** The ruleId or structural path the finding concerns. */
  location: string;
  message: string;
  /** The normative source the finding cites (muster rubric or OpenClaw doc SHA). */
  source: string;
  severity: "error" | "warning";
}

// BinaryAssertion discriminated union with all five kind variants.
export type BinaryAssertion =
  | {
      kind: "never-call-tool";
      /** Tool name(s) that must never appear in the tool-call trace. */
      forbiddenTools: string[];
    }
  | {
      kind: "tool-order";
      /** tool A must appear in the trace only after tool B. */
      mustPrecede: string;
      mustFollow: string;
    }
  | {
      kind: "confirm-before-destructive";
      /** Tool names classified as destructive (manifest declares them). */
      destructiveTools: string[];
      /** What counts as a confirmation turn. Unspecified is a manifest error. */
      confirmationKind: "agent-explicit-confirm" | "user-prior-turn";
    }
  | {
      kind: "exact-string-non-leakage";
      /** Exact strings that must never appear in any assistant turn. */
      forbiddenStrings: string[];
    }
  | {
      kind: "output-format";
      /** JSON Schema (Ajv-compatible) or regex source the output must match. */
      schema?: Record<string, unknown>;
      regex?: string;
    };

/** Judge assertion for fuzzy grading. orderSwap always true (RQ-08). */
export interface JudgeAssertion {
  kind: "judge";
  /** Rubric text cited verbatim from muster's published rubric (FR-009). */
  rubricText: string;
  /** Judge prompt template; receives {transcript, rubricText}. */
  promptTemplate: string;
  /** Order-swap enabled: grader calls judge twice with answer-order swapped. */
  orderSwap: true;
}

/** A scenario + assertion that tests one SOP rule under normal conditions. */
export interface ComplianceProbe {
  id: string;
  ruleId: string;
  gradingClass: "binary" | "judge";
  scenario: {
    systemPrompt: string;
    turns: unknown[];
  };
  binaryAssertion?: BinaryAssertion;
  judgeAssertion?: JudgeAssertion;
  runs: number;
}

/** An injection/scope-escape/exfiltration attempt targeting one SOP rule. */
export interface AdversarialProbe {
  id: string;
  ruleId: string;
  corpusId: string;
  category: "direct-injection" | "indirect-injection" | "scope-escape" | "data-exfiltration";
  hostilePayload: string[];
  scenario: {
    systemPrompt: string;
    turns: unknown[];
  };
  binaryAssertion: BinaryAssertion;
  runs: number;
}

/** Per-run grade detail. */
export interface SOPGrade {
  assertionKind: string;
  measured: string | number;
  limit: string | number;
  passed: boolean;
  judgePosition?: "A" | "B";
}

/** Per-run result. */
export interface SOPRunVerdict {
  run: number;
  passed: boolean;
  grades: SOPGrade[];
  transcript: unknown;
  error?: string;
}

/** Per-case aggregation result over N runs. */
export interface SOPCaseVerdict {
  probeId: string;
  ruleId: string;
  aggregation: "pass-k" | "k-of-n";
  passed: boolean;
  passCount: number;
  totalRuns: number;
  anyRunFailed?: boolean;
  runs: SOPRunVerdict[];
}

/** Machine-readable output of a full adapter run (stub; full assembly is WP05). */
export interface SOPSuiteReport {
  adapter: "openclaw-sop";
  rubricVersion: string;
  sopFile: string;
  lintFindings: SOPLintFinding[];
  verdicts: SOPCaseVerdict[];
  passed: boolean;
  ranAt: string;
}

// ---------------------------------------------------------------------------
// Ajv Schema (Draft 2020-12 compatible)
// ---------------------------------------------------------------------------

const SOP_RULE_MANIFEST_SCHEMA = {
  type: "object",
  required: ["version", "sopFile", "rules"],
  additionalProperties: true,
  properties: {
    version: { type: "string", minLength: 1 },
    sopFile: { type: "string", minLength: 1 },
    rules: {
      type: "array",
      items: {
        type: "object",
        required: ["ruleId", "ruleText", "probeIds", "gradingClass", "aggregation", "k", "source"],
        additionalProperties: true,
        properties: {
          ruleId: { type: "string", minLength: 1 },
          ruleText: { type: "string", minLength: 1 },
          probeIds: {
            type: "array",
            items: { type: "string" },
          },
          gradingClass: { type: "string", enum: ["binary", "judge"] },
          aggregation: { type: "string", enum: ["pass-k", "k-of-n"] },
          k: { type: "integer", minimum: 1 },
          passThreshold: { type: "integer", minimum: 1 },
          precedence: { type: "string" },
          source: {
            type: "object",
            required: ["normative"],
            additionalProperties: true,
            properties: {
              normative: { type: "string", minLength: 1 },
              supporting: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * FR-002: Read an AGENTS.md SOP file as UTF-8. Returns verbatim content (C-006).
 * Zero network I/O; deterministic (NFR-001).
 */
export async function readSOPFile(filePath: string): Promise<SOPFile> {
  const content = await readFile(filePath, "utf-8");
  const byteLength = Buffer.byteLength(content, "utf8");
  return { path: filePath, content, byteLength };
}

/**
 * FR-003 / FR-009: Load and validate a muster-authored rule manifest from YAML.
 * Throws on any Ajv validation error, duplicate ruleId, empty source.normative,
 * or pass-k / passThreshold mismatch.
 * Zero network I/O; deterministic (NFR-001).
 */
export async function loadAndValidateManifest(manifestPath: string): Promise<SOPRuleManifest> {
  const raw = await readFile(manifestPath, "utf-8");
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const parsed: unknown = parseYaml(raw);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const ajv = new Ajv({ allErrors: true }) as {
    compile: (schema: unknown) => {
      (data: unknown): boolean;
      errors?: Array<{ instancePath: string; message?: string }> | null;
    };
  };
  const validate = ajv.compile(SOP_RULE_MANIFEST_SCHEMA);
  const valid = validate(parsed);
  if (!valid) {
    const msgs = (validate.errors ?? [])
      .map((e) => `${e.instancePath} ${e.message ?? ""}`)
      .join("; ");
    throw new Error(`Manifest validation failed: ${msgs}`);
  }

  const manifest = parsed as SOPRuleManifest;

  // Semantic checks after Ajv passes
  const seenIds = new Set<string>();
  for (const entry of manifest.rules) {
    // Duplicate ruleId
    if (seenIds.has(entry.ruleId)) {
      throw new Error(`Duplicate ruleId: "${entry.ruleId}"`);
    }
    seenIds.add(entry.ruleId);

    // FR-009 citation gate: source.normative must be non-empty (belt-and-suspenders)
    if (!entry.source.normative || entry.source.normative.trim() === "") {
      throw new Error(
        `Entry "${entry.ruleId}": source.normative must be a non-empty string (FR-009)`
      );
    }

    // pass-k passThreshold must equal k when present
    if (
      entry.aggregation === "pass-k" &&
      entry.passThreshold !== undefined &&
      entry.passThreshold !== entry.k
    ) {
      throw new Error(
        `Entry "${entry.ruleId}": aggregation is "pass-k" but passThreshold (${entry.passThreshold}) !== k (${entry.k}). All runs must pass.`
      );
    }

    // confirm-before-destructive must have confirmationKind declared
    // (ambiguous = manifest error per data model invariant)
    const entryAny = entry as unknown as Record<string, unknown>;
    if (
      entryAny["assertionKind"] === "confirm-before-destructive" &&
      entryAny["confirmationKind"] === undefined
    ) {
      throw new Error(
        `Entry "${entry.ruleId}": assertionKind is "confirm-before-destructive" but confirmationKind is absent. Must be "agent-explicit-confirm" or "user-prior-turn".`
      );
    }
  }

  return manifest;
}

/**
 * FR-003: Detect pairs of manifest entries that share overlapping triggers but
 * declare conflicting gradingClass or aggregation without a precedence field.
 * Returns SOPLintFinding[] with kind "UNDEFINED_PRECEDENCE".
 * Pure function; zero network I/O; deterministic (NFR-001).
 * Normative source: docs/rubric/sop-rule-taxonomy.md
 */
export function detectUndefinedPrecedence(manifest: SOPRuleManifest): SOPLintFinding[] {
  const findings: SOPLintFinding[] = [];

  // Heuristic: extract trigger prefix = text up to first comma or period, lowercased
  function triggerPrefix(ruleText: string): string {
    const match = ruleText.match(/^([^,.]*)/) ?? ["", ruleText];
    return match[1].trim().toLowerCase();
  }

  const entries = manifest.rules;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];

      const prefixA = triggerPrefix(a.ruleText);
      const prefixB = triggerPrefix(b.ruleText);

      if (prefixA !== prefixB) continue;

      // Triggers overlap — check for conflict
      const conflict =
        a.gradingClass !== b.gradingClass || a.aggregation !== b.aggregation;

      if (!conflict) continue;

      // If BOTH entries have a precedence field, no finding
      if (a.precedence !== undefined && b.precedence !== undefined) continue;

      findings.push({
        kind: "UNDEFINED_PRECEDENCE",
        location: `${a.ruleId} / ${b.ruleId}`,
        message: `Rules "${a.ruleId}" and "${b.ruleId}" share trigger prefix "${prefixA}" but declare conflicting gradingClass/aggregation with no precedence field.`,
        source: "docs/rubric/sop-rule-taxonomy.md",
        severity: "warning",
      });
    }
  }

  // Deterministic order: sort by location string
  return findings.sort((a, b) => a.location.localeCompare(b.location));
}

/**
 * FR-003: Detect tool references in manifest entries whose tool names are absent
 * from envTools. Returns SOPLintFinding[] with kind "TOOL_DRIFT".
 * Pure function; zero network I/O; deterministic (NFR-001).
 * Normative source: docs/rubric/sop-rule-taxonomy.md
 */
export function detectToolDrift(
  manifest: SOPRuleManifest,
  _sopFile: SOPFile,
  envTools: string[]
): SOPLintFinding[] {
  const findings: SOPLintFinding[] = [];

  const envToolSet = new Set(envTools);

  for (const entry of manifest.rules) {
    // Extract backtick-quoted identifiers from ruleText
    const backtickMatches = entry.ruleText.match(/`([^`]+)`/g) ?? [];
    const candidateTools = backtickMatches.map((m) => m.slice(1, -1));

    for (const tool of candidateTools) {
      if (!envToolSet.has(tool)) {
        findings.push({
          kind: "TOOL_DRIFT",
          location: entry.ruleId,
          message: `Rule "${entry.ruleId}" references tool \`${tool}\` which is absent from envTools.`,
          source: "docs/rubric/sop-rule-taxonomy.md",
          severity: "warning",
        });
      }
    }
  }

  // Deterministic order: sort by location then message
  return findings.sort((a, b) => {
    const loc = a.location.localeCompare(b.location);
    return loc !== 0 ? loc : a.message.localeCompare(b.message);
  });
}

/**
 * FR-003: Check that each manifest entry's ruleText appears as a verbatim
 * substring in the SOP file content. Emits RULE_DRIFT (warning) for any miss.
 * Pure function; zero network I/O; deterministic (NFR-001).
 * Normative source: docs/rubric/sop-rule-taxonomy.md
 */
export function checkRuleTextPresence(
  manifest: SOPRuleManifest,
  sopFile: SOPFile
): SOPLintFinding[] {
  const findings: SOPLintFinding[] = [];

  for (const entry of manifest.rules) {
    if (!sopFile.content.includes(entry.ruleText)) {
      findings.push({
        kind: "RULE_DRIFT",
        location: entry.ruleId,
        message: `Rule "${entry.ruleId}": ruleText not found verbatim in SOP content at "${sopFile.path}".`,
        source: "docs/rubric/sop-rule-taxonomy.md",
        severity: "warning",
      });
    }
  }

  // Deterministic order: sort by location
  return findings.sort((a, b) => a.location.localeCompare(b.location));
}
