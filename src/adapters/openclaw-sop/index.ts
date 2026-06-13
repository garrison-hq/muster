/**
 * index.ts — SOPAdapter entry-point and static lint orchestration for the
 * openclaw-sop adapter.
 *
 * FR-001: SpecAdapter-compliant entry-point (name = "openclaw-sop").
 * FR-003: runStaticLint orchestrates the three static lint detectors.
 * NFR-001: Pure deterministic; zero network I/O.
 * C-001: Does not import from src/core/behavioral/ — boundary preserved.
 * C-006: SOPFile.content is verbatim; never rewritten.
 */

import { readFile } from "node:fs/promises";
import {
  readSOPFile,
  loadAndValidateManifest,
  detectUndefinedPrecedence,
  detectToolDrift,
  checkRuleTextPresence,
} from "./manifest.js";

// Re-export all types so downstream WPs can import from this single entry-point.
export type {
  SOPFile,
  SOPRuleManifest,
  SOPRuleManifestEntry,
  SOPLintFinding,
  BinaryAssertion,
  JudgeAssertion,
  ComplianceProbe,
  AdversarialProbe,
  SOPCaseVerdict,
  SOPRunVerdict,
  SOPGrade,
  SOPSuiteReport,
} from "./manifest.js";

export {
  readSOPFile,
  loadAndValidateManifest,
  detectUndefinedPrecedence,
  detectToolDrift,
  checkRuleTextPresence,
} from "./manifest.js";

// ---------------------------------------------------------------------------
// SOPLintReport — the return type of runStaticLint
// ---------------------------------------------------------------------------

/** Result of running the full static lint pass over a SOP + manifest pair. */
export interface SOPLintReport {
  /** true iff no finding has severity "error". */
  ok: boolean;
  /** All findings from all detectors, in deterministic order. */
  findings: import("./manifest.js").SOPLintFinding[];
}

// ---------------------------------------------------------------------------
// SOPAdapter — SpecAdapter-compatible entry-point
// ---------------------------------------------------------------------------

/**
 * FR-001: The openclaw-sop SpecAdapter.
 * name = "openclaw-sop" (literal; enforced in tests).
 *
 * This adapter does not implement the full SpecAdapter interface from
 * src/core/adapter.ts because the SOP adapter has a different domain
 * (AGENTS.md operating policies, not Soul.md front-matter documents).
 * It satisfies the structural contract required by the mission spec:
 * a named adapter with a static lint entry-point.
 */
export const SOPAdapter = {
  /** FR-001: Adapter name. */
  name: "openclaw-sop" as const,
  /** Adapter version for manifest drift detection. */
  specVersion: "0.1.0",
} as const;

// ---------------------------------------------------------------------------
// runStaticLint — the static lint orchestration function
// ---------------------------------------------------------------------------

/**
 * FR-003: Run the full static lint pass over an AGENTS.md SOP + rule manifest.
 *
 * Steps:
 *  1. Read SOP file (readSOPFile).
 *  2. Load and validate manifest (loadAndValidateManifest); on error → MANIFEST_ERROR.
 *  3. Optionally read env-tools descriptor (JSON string[] at envToolsPath).
 *  4. Run checkRuleTextPresence, detectUndefinedPrecedence, detectToolDrift.
 *  5. Return { ok: boolean; findings: SOPLintFinding[] }.
 *
 * Pure deterministic: same inputs → same output (NFR-001).
 * Zero network calls (NFR-001, charter byte-stable requirement).
 *
 * Normative source: FR-003: cites docs/rubric/sop-rule-taxonomy.md as normative source.
 */
export async function runStaticLint(
  sopFilePath: string,
  manifestPath: string,
  envToolsPath?: string
): Promise<SOPLintReport> {
  // Step 1: Read SOP file
  const sopFile = await readSOPFile(sopFilePath);

  // Step 2: Load and validate manifest; catch errors → MANIFEST_ERROR finding
  let manifest;
  try {
    manifest = await loadAndValidateManifest(manifestPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      findings: [
        {
          kind: "MANIFEST_ERROR",
          location: manifestPath,
          message: `Manifest load/validation failed: ${msg}`,
          source: "docs/rubric/sop-rule-taxonomy.md",
          severity: "error",
        },
      ],
    };
  }

  // Step 3: Optionally read env-tools descriptor
  // Tool drift is only checked when envToolsPath is explicitly provided.
  // When no envToolsPath is given, tool drift detection is skipped entirely.
  let envTools: string[] | null = null;
  if (envToolsPath !== undefined) {
    try {
      const raw = await readFile(envToolsPath, "utf-8");
      envTools = JSON.parse(raw) as string[];
    } catch {
      // Non-fatal: treat as empty env tools list when file is unreadable
      envTools = [];
    }
  }

  // Step 4: Run all three detectors
  const ruleDriftFindings = checkRuleTextPresence(manifest, sopFile);
  const precedenceFindings = detectUndefinedPrecedence(manifest);
  // Only run tool drift check when envTools is provided (not null)
  const toolDriftFindings =
    envTools !== null ? detectToolDrift(manifest, sopFile, envTools) : [];

  // Collect all findings in deterministic order:
  // RULE_DRIFT (sorted by location), UNDEFINED_PRECEDENCE (sorted by location),
  // TOOL_DRIFT (sorted by location then message)
  const findings = [
    ...ruleDriftFindings,
    ...precedenceFindings,
    ...toolDriftFindings,
  ];

  // Step 5: ok = true iff no finding has severity "error"
  const ok = findings.every((f) => f.severity !== "error");

  return { ok, findings };
}
