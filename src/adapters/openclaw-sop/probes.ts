/**
 * probes.ts — ProbeCorpus loader, AdversarialProbe types, and probe selector
 * for the openclaw-sop adapter.
 *
 * FR-006: Adversarial probes from vendored corpora (injection, scope-escape, exfiltration).
 * FR-007: Adversarial probes always use pass^k aggregation — all k runs must pass.
 * FR-010: Corpora MIT/Apache/CC-BY only; upstream LICENSE + CITATION.md retained.
 * C-003: LICENSE must be non-empty verbatim upstream text; CITATION.md contains
 *         upstream URL + commit SHA.
 *
 * Muster rubric citation:
 *   Normative source: docs/rubric/sop-rule-taxonomy.md
 *   Vendoring policy: C-003 (data-model.md ProbeCorpus invariants)
 *
 * Static path invariants (charter byte-stable):
 *   - No network calls; all data read from vendored/ at test-time.
 *   - Vendored paths are deterministic: vendored/openclaw-sop/<corpusId>/.
 *   - License mapping is hard-coded (verified 2026-06-12 per data-model.md table).
 */

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

// Re-export types from manifest for downstream consumers (WP05 manifest runner).
export type { AdversarialProbe, SOPRuleManifest, SOPRuleManifestEntry } from "./manifest.js";

// ---------------------------------------------------------------------------
// ProbeCorpus type (data-model.md)
// ---------------------------------------------------------------------------

/**
 * A vendored public dataset used as the source of adversarial probes.
 * Invariants (C-003, data-model.md):
 *   - license must be one of the three allowed values.
 *   - licensePath must exist and be non-empty — loader throws otherwise.
 *   - citationPath must exist and be non-empty — loader throws otherwise.
 *   - upstreamUrl extracted from CITATION.md (extraction rule documented below).
 */
export interface ProbeCorpus {
  /** Corpus identifier: "injecagent" | "agentdojo" | "gandalf" | "deepset". */
  id: string;
  /** Absolute path to the vendored corpus directory. */
  vendoredPath: string;
  /** SPDX license identifier (C-003: only MIT/Apache/CC-BY). */
  license: "MIT" | "Apache-2.0" | "CC-BY-4.0";
  /** Absolute path to the LICENSE file. */
  licensePath: string;
  /** Absolute path to the CITATION.md file. */
  citationPath: string;
  /** Upstream URL pinned to a commit SHA (extracted from CITATION.md). */
  upstreamUrl: string;
  /** Number of entries in the vendored subset (informational). */
  entryCount: number;
}

// ---------------------------------------------------------------------------
// Corpus raw entry type (shape of data/cases.json entries)
// ---------------------------------------------------------------------------

/** Raw corpus entry as stored in vendored/openclaw-sop/<id>/data/cases.json. */
export interface CorpusEntry {
  /** Stable entry identifier (e.g. "injecagent-001"). */
  id: string;
  /** Probe category vocabulary (FR-006, data-model.md AdversarialProbe). */
  category: "direct-injection" | "indirect-injection" | "scope-escape" | "data-exfiltration" | "benign-negative";
  /** The hostile input turn(s). */
  hostilePayload: string[];
  /** Human-readable description of the attack scenario. */
  description: string;
}

// ---------------------------------------------------------------------------
// Hard-coded license mapping (FR-010, C-003)
// Approved corpora with licenses verified 2026-06-12 per data-model.md table.
// ---------------------------------------------------------------------------

const CORPUS_LICENSE_MAP: Record<string, "MIT" | "Apache-2.0" | "CC-BY-4.0"> = {
  injecagent: "MIT",
  agentdojo: "MIT",
  gandalf: "MIT",
  deepset: "Apache-2.0",
};

// ---------------------------------------------------------------------------
// loadProbeCorpus — load and validate a vendored corpus (FR-006, FR-010, C-003)
// ---------------------------------------------------------------------------

/**
 * Load and validate a vendored adversarial probe corpus.
 *
 * Throws at load time (not at test-time) if:
 *   - corpusId is not one of the four approved corpora.
 *   - LICENSE file is absent or empty (C-003 — vendoring invalid without license).
 *   - CITATION.md is absent or empty.
 *
 * Upstream URL extraction rule: searches for the first line beginning with
 * "upstream:" (optional whitespace) and extracts the first https:// URL on
 * that line. Falls back to the first https:// URL anywhere in the file if no
 * "upstream:" line is found. This heuristic matches the CITATION.md format
 * defined in T015.
 *
 * @param corpusId - One of "injecagent" | "agentdojo" | "gandalf" | "deepset".
 * @param vendoredRoot - Root directory of vendored corpora.
 *   Defaults to path.join(process.cwd(), "vendored/openclaw-sop").
 * @returns ProbeCorpus with loaded metadata.
 * @throws Error at load time if LICENSE or CITATION.md is missing/empty,
 *         or if corpusId is unknown.
 */
export async function loadProbeCorpus(
  corpusId: string,
  vendoredRoot?: string
): Promise<ProbeCorpus> {
  const root = vendoredRoot ?? join(process.cwd(), "vendored/openclaw-sop");
  const vendoredPath = join(root, corpusId);
  const licensePath = join(vendoredPath, "LICENSE");
  const citationPath = join(vendoredPath, "CITATION.md");
  const casesPath = join(vendoredPath, "data", "cases.json");

  // Unknown corpus ID check (must be one of the four approved corpora)
  if (!(corpusId in CORPUS_LICENSE_MAP)) {
    throw new Error(
      `Corpus '${corpusId}': unknown corpus ID — approved corpora are: ${Object.keys(CORPUS_LICENSE_MAP).join(", ")}`
    );
  }

  // LICENSE guard (C-003): file must exist and be non-empty
  // This is a load-time throw, not a test-time assertion.
  try {
    await stat(licensePath);
  } catch {
    throw new Error(
      `Corpus '${corpusId}': LICENSE file missing or empty at ${licensePath} — vendoring invalid (C-003)`
    );
  }

  const licenseContent = await readFile(licensePath, "utf-8");
  if (licenseContent.trim() === "") {
    throw new Error(
      `Corpus '${corpusId}': LICENSE file missing or empty at ${licensePath} — vendoring invalid (C-003)`
    );
  }

  // CITATION.md guard: file must exist and be non-empty
  let citationContent: string;
  try {
    citationContent = await readFile(citationPath, "utf-8");
  } catch {
    throw new Error(
      `Corpus '${corpusId}': CITATION.md missing at ${citationPath} — vendoring invalid (C-003)`
    );
  }

  if (citationContent.trim() === "") {
    throw new Error(
      `Corpus '${corpusId}': CITATION.md is empty at ${citationPath} — vendoring invalid (C-003)`
    );
  }

  // Extract upstream URL from CITATION.md
  // Rule: look for a line starting with "upstream:" and extract the first https:// URL.
  // Fallback: first https:// URL anywhere in the file.
  const upstreamUrl = extractUpstreamUrl(citationContent);

  // Load data/cases.json and count entries
  const casesRaw = await readFile(casesPath, "utf-8");
  const cases = JSON.parse(casesRaw) as CorpusEntry[];
  const entryCount = cases.length;

  // Derive license from hard-coded mapping (verified 2026-06-12)
  const license = CORPUS_LICENSE_MAP[corpusId];

  return {
    id: corpusId,
    vendoredPath,
    license,
    licensePath,
    citationPath,
    upstreamUrl,
    entryCount,
  };
}

/**
 * Extract the upstream URL from CITATION.md content.
 *
 * Extraction rule:
 *   1. Search for lines beginning with "upstream:" (trimmed) — return the first
 *      https:// URL found on that line.
 *   2. Fallback: return the first https:// URL anywhere in the file.
 *   3. If no URL found, return empty string.
 */
function extractUpstreamUrl(citationContent: string): string {
  const lines = citationContent.split("\n");

  // Rule 1: "upstream:" line
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith("upstream:")) {
      const urlMatch = trimmed.match(/https:\/\/[^\s]+/);
      if (urlMatch) {
        return urlMatch[0];
      }
    }
  }

  // Fallback Rule 2: first https:// URL in file
  const anyUrlMatch = citationContent.match(/https:\/\/[^\s]+/);
  return anyUrlMatch ? anyUrlMatch[0] : "";
}

// ---------------------------------------------------------------------------
// selectProbesForRule — build AdversarialProbe array from corpus data
// ---------------------------------------------------------------------------

import type { SOPRuleManifest, AdversarialProbe } from "./manifest.js";

/**
 * Build adversarial probes for a manifest rule by looking up corpus entries.
 *
 * Asserts that the manifest entry for ruleId uses aggregation "pass-k" —
 * adversarial probes are always safety-critical and must never degrade to
 * k-of-n (FR-007, charter two-tier model, data-model.md AdversarialProbe invariant).
 *
 * @param manifest - The loaded and validated SOPRuleManifest.
 * @param ruleId - The ruleId to look up in the manifest.
 * @param corpora - Loaded ProbeCorpus instances to search for probe entries.
 * @returns Array of AdversarialProbe constructed from corpus data.
 * @throws Error if ruleId not found in manifest.
 * @throws Error if the manifest entry for ruleId uses aggregation !== "pass-k".
 * @throws Error if a probeId is not found in any of the provided corpora.
 */
export function selectProbesForRule(
  manifest: SOPRuleManifest,
  ruleId: string,
  corpora: ProbeCorpus[]
): AdversarialProbe[] {
  // Find the manifest entry for this ruleId
  const entry = manifest.rules.find((r) => r.ruleId === ruleId);
  if (!entry) {
    throw new Error(
      `selectProbesForRule: ruleId '${ruleId}' not found in manifest`
    );
  }

  // Assert pass-k aggregation (FR-007, charter): adversarial probes must never use k-of-n
  if (entry.aggregation !== "pass-k") {
    throw new Error(
      `Adversarial probe for rule '${ruleId}' must use pass-k aggregation`
    );
  }

  // Build a lookup map from corpus entries: id -> { corpusId, entry }
  const probeIndex = new Map<string, { corpusId: string; corpusEntry: CorpusEntry }>();
  for (const corpus of corpora) {
    // Load entries from the in-memory corpus structure by reading cases.json path
    // Note: corpora are already loaded; we need to read their cases.json again
    // to access the raw entries. The entries are not stored on ProbeCorpus (by design —
    // ProbeCorpus is metadata only). In tests, callers pass pre-loaded corpora;
    // we reload from disk here synchronously by using a sync marker approach.
    // For the selector to work, we accept an optional extended corpus type.
    const extCorpus = corpus as ProbeCorpus & { _entries?: CorpusEntry[] };
    if (extCorpus._entries) {
      for (const corpusEntry of extCorpus._entries) {
        probeIndex.set(corpusEntry.id, { corpusId: corpus.id, corpusEntry });
      }
    }
  }

  // Build AdversarialProbe for each probeId in the manifest entry
  const probes: AdversarialProbe[] = [];

  for (const probeId of entry.probeIds) {
    const found = probeIndex.get(probeId);
    if (!found) {
      throw new Error(
        `selectProbesForRule: probeId '${probeId}' not found in any provided corpus`
      );
    }

    const { corpusId, corpusEntry } = found;

    // Build the AdversarialProbe — category must be one of the four valid values
    // (benign-negative entries from deepset are not adversarial probes and should
    // not be referenced by rule manifests, but we pass them through if the manifest
    // references them)
    const probe: AdversarialProbe = {
      id: probeId,
      ruleId,
      corpusId,
      category: corpusEntry.category as AdversarialProbe["category"],
      hostilePayload: corpusEntry.hostilePayload,
      scenario: {
        systemPrompt: entry.ruleText,
        turns: corpusEntry.hostilePayload.map((payload) => ({
          role: "user" as const,
          content: payload,
        })),
      },
      binaryAssertion: {
        kind: "exact-string-non-leakage",
        forbiddenStrings: [],
      },
      runs: entry.k,
    };

    probes.push(probe);
  }

  return probes;
}

// ---------------------------------------------------------------------------
// loadProbeCorpusWithEntries — load corpus with entries for selectProbesForRule
// ---------------------------------------------------------------------------

/**
 * Load a ProbeCorpus and attach its entries for use with selectProbesForRule.
 *
 * This is a convenience wrapper that loads the corpus metadata AND the raw
 * entries from data/cases.json, attaching them to the corpus object under the
 * `_entries` field. This allows selectProbesForRule to look up probe entries
 * by ID without an additional async call.
 *
 * The `_entries` field is an implementation detail — callers of loadProbeCorpus
 * who only need metadata can ignore it.
 *
 * @param corpusId - One of the four approved corpus IDs.
 * @param vendoredRoot - Root directory of vendored corpora.
 * @returns ProbeCorpus with `_entries` populated.
 */
export async function loadProbeCorpusWithEntries(
  corpusId: string,
  vendoredRoot?: string
): Promise<ProbeCorpus & { _entries: CorpusEntry[] }> {
  const root = vendoredRoot ?? join(process.cwd(), "vendored/openclaw-sop");
  const corpus = await loadProbeCorpus(corpusId, vendoredRoot);
  const casesPath = join(root, corpusId, "data", "cases.json");
  const casesRaw = await readFile(casesPath, "utf-8");
  const entries = JSON.parse(casesRaw) as CorpusEntry[];

  return Object.assign(corpus, { _entries: entries });
}
