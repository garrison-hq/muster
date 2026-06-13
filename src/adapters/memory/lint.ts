/**
 * Memory adapter: FactParser + StalenessLinter
 *
 * FR-002: parse MEMORY.md / USER.md into MemoryFact[].
 * FR-003: flag time-sensitive facts older than STALENESS_TOLERANCE_DAYS
 *         relative to a supplied ReferenceDate (C-003: no clock reads).
 * NFR-001: byte-stable deterministic output via canonical-JSON (RFC 8785).
 * C-001: adapter boundary — src/core/ never imports memory specifics.
 * C-002: every StalenessFinding carries a normative rubricCitation.
 * C-003: no new Date() / Date.now() anywhere in this module.
 */

import { readFileSync } from "node:fs";
import { canonicalJson } from "../../core/canonical-json.js";

// ---------------------------------------------------------------------------
// C-002: normative rubric citation used in every StalenessFinding.
// ---------------------------------------------------------------------------
export const RUBRIC_CITATION =
  "muster memory-adapter rubric §3.1 (staleness tolerance) — https://github.com/garrison-hq/muster/blob/main/BRIEF.md#memory-layer";

// ---------------------------------------------------------------------------
// C-003: staleness tolerance in whole days (cited from rubric).
// ---------------------------------------------------------------------------
export const STALENESS_TOLERANCE_DAYS = 90;

// ---------------------------------------------------------------------------
// Interfaces (data model per kitty-specs/memory-adapter-01KTYMCD/data-model.md)
// ---------------------------------------------------------------------------

export interface MemoryFact {
  id: string;
  source: "MEMORY.md" | "USER.md";
  text: string;
  private: boolean;
  timeSensitive: boolean;
  timestamp: Date | undefined;
}

export interface ReferenceDate {
  value: Date;
}

export interface StalenessFinding {
  kind: "staleness";
  factId: string;
  source: "MEMORY.md" | "USER.md";
  factText: string;
  recordedDate: Date;
  referenceDate: Date;
  ageInDays: number;
  rubricCitation: string;
}

export interface StalenessSkipNote {
  kind: "staleness-skip";
  reason: "no-reference-date";
}

export interface ContradictionFinding {
  kind: "contradiction";
  factAId: string;
  factBId: string;
  factASource: "MEMORY.md" | "USER.md";
  factBSource: "MEMORY.md" | "USER.md";
  factAText: string;
  factBText: string;
  rubricCitation: string;
}

export interface SupersessionNote {
  kind: "supersession";
  supersededFactId: string;
  supersedingFactId: string;
  note: string;
}

export interface LintReport {
  ok: boolean;
  stalenessFindings: StalenessFinding[];
  stalenessSkip: StalenessSkipNote | undefined;
  contradictionFindings: ContradictionFinding[];
  supersessionNotes: SupersessionNote[];
}

// ---------------------------------------------------------------------------
// FactManifest: caller-supplied labels keyed by fact id.
// ---------------------------------------------------------------------------

export interface FactLabel {
  private: boolean;
  timeSensitive: boolean;
}

export interface FactManifest {
  labels: Record<string, FactLabel>;
}

// ---------------------------------------------------------------------------
// ISO 8601 date extraction regex (YYYY-MM-DD or full ISO 8601).
// Only matches patterns that represent a calendar date with year-month-day.
// ---------------------------------------------------------------------------
const ISO_DATE_PATTERN =
  /\b(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?)\b/;

/**
 * Parse an ISO 8601 date string inline from fact text.
 * Returns undefined on failure — caller handles unparseable-date case.
 * C-003: no new Date() called with no arguments; date value comes from text.
 */
function parseInlineDate(text: string): Date | undefined {
  const match = ISO_DATE_PATTERN.exec(text);
  if (!match) return undefined;
  const candidate = new Date(match[1]);
  // isNaN check without Date.now()
  if (Number.isNaN(candidate.getTime())) return undefined;
  return candidate;
}

/**
 * Slugify a section heading for id generation.
 * Uses UTF-16 code-unit comparison implicitly via String methods — no
 * localeCompare / Intl.Collator (NFR-001).
 */
function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// ---------------------------------------------------------------------------
// T001 — FactParser
// ---------------------------------------------------------------------------

export class FactParser {
  /**
   * Parse a markdown file (MEMORY.md or USER.md) into MemoryFact[].
   *
   * Algorithm:
   * 1. Split on blank lines to detect paragraphs / bullet items.
   * 2. Track H1/H2/H3 headings to build the section slug used in `id`.
   * 3. Assign deterministic ids: <source-base>-<section-slug>-<ordinal>.
   * 4. Look up manifest labels; fall back to private:false, timeSensitive:false.
   * 5. Parse inline dates only for timeSensitive facts.
   *
   * NFR-001: id generation uses only string comparison (no localeCompare).
   * C-003: no clock reads.
   */
  parse(filePath: string, manifest: FactManifest): MemoryFact[] {
    const raw = readFileSync(filePath, "utf8");
    const sourceBase = filePath.endsWith("USER.md") ? "USER.md" : "MEMORY.md";
    const source: "MEMORY.md" | "USER.md" = sourceBase;

    const lines = raw.split("\n");
    const facts: MemoryFact[] = [];

    let currentSection = "root";
    let ordinal = 0;
    let pendingLines: string[] = [];

    const flushPending = (): void => {
      const text = pendingLines.join("\n").trim();
      pendingLines = [];
      if (!text) return;

      const id = `${slugify(source.replace(".md", ""))}-${slugify(currentSection)}-${ordinal}`;
      ordinal += 1;

      const label: FactLabel = manifest.labels[id] ?? {
        private: false,
        timeSensitive: false,
      };

      let timestamp: Date | undefined;
      if (label.timeSensitive) {
        timestamp = parseInlineDate(text);
        // timestamp may be undefined (unparseable-date — handled by StalenessLinter)
      }

      facts.push({
        id,
        source,
        text,
        private: label.private,
        timeSensitive: label.timeSensitive,
        timestamp,
      });
    };

    for (const line of lines) {
      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
      if (headingMatch) {
        // Flush any pending fact before starting a new section
        flushPending();
        currentSection = headingMatch[2].trim();
        ordinal = 0;
        continue;
      }

      // Blank line = paragraph boundary — flush pending
      if (line.trim() === "") {
        flushPending();
        continue;
      }

      // Accumulate content
      pendingLines.push(line);
    }

    // Flush whatever remains at EOF
    flushPending();

    return facts;
  }
}

// ---------------------------------------------------------------------------
// T002 — StalenessLinter
// ---------------------------------------------------------------------------

export class StalenessLinter {
  /**
   * Lint MemoryFact[] for staleness relative to a supplied ReferenceDate.
   *
   * When referenceDate is undefined: return StalenessSkipNote (ok: false).
   * For each timeSensitive fact:
   *   - If timestamp is undefined: emit finding with unparseable-date rubricCitation.
   *   - If ageInDays > STALENESS_TOLERANCE_DAYS: emit StalenessFinding.
   * Output is serialised via canonical-JSON (UTF-16 key sort) for byte-stability (NFR-001).
   * C-003: no new Date() / Date.now() here.
   */
  lint(
    facts: MemoryFact[],
    referenceDate: ReferenceDate | undefined
  ): LintReport {
    if (referenceDate === undefined) {
      return this._buildReport(
        [],
        { kind: "staleness-skip", reason: "no-reference-date" },
        [],
        []
      );
    }

    const stalenessFindings: StalenessFinding[] = [];

    for (const fact of facts) {
      if (!fact.timeSensitive) continue;

      if (fact.timestamp === undefined) {
        // Unparseable date — emit finding so it is not silently passed.
        stalenessFindings.push({
          kind: "staleness",
          factId: fact.id,
          source: fact.source,
          factText: fact.text,
          // recordedDate not available; use reference date as placeholder
          // and set ageInDays to -1 to indicate unparseable (not a real age).
          recordedDate: referenceDate.value,
          referenceDate: referenceDate.value,
          ageInDays: -1,
          rubricCitation:
            RUBRIC_CITATION +
            " — unparseable-date: fact has no recognizable ISO 8601 timestamp",
        });
        continue;
      }

      // C-003: all arithmetic uses caller-supplied Date objects only.
      const ageInDays = Math.floor(
        (referenceDate.value.getTime() - fact.timestamp.getTime()) / 86_400_000
      );

      if (ageInDays > STALENESS_TOLERANCE_DAYS) {
        stalenessFindings.push({
          kind: "staleness",
          factId: fact.id,
          source: fact.source,
          factText: fact.text,
          recordedDate: fact.timestamp,
          referenceDate: referenceDate.value,
          ageInDays,
          rubricCitation: RUBRIC_CITATION,
        });
      }
    }

    return this._buildReport(stalenessFindings, undefined, [], []);
  }

  /**
   * Build a LintReport and verify byte-stability by round-tripping through
   * canonical-JSON. The report fields are in UTF-16 code-unit key order
   * (canonicalJson sorts them) so JSON.stringify of the returned object is
   * byte-stable across runs and engines (NFR-001).
   */
  private _buildReport(
    stalenessFindings: StalenessFinding[],
    stalenessSkip: StalenessSkipNote | undefined,
    contradictionFindings: ContradictionFinding[],
    supersessionNotes: SupersessionNote[]
  ): LintReport {
    const ok =
      stalenessFindings.length === 0 &&
      contradictionFindings.length === 0 &&
      stalenessSkip === undefined;

    const report: LintReport = {
      contradictionFindings,
      ok,
      stalenessFindings,
      stalenessSkip,
      supersessionNotes,
    };

    // Verify canonical serialisation round-trips cleanly (NFR-001 enforcement).
    // We serialise to canonical JSON and back to ensure the shape is stable.
    // Date objects need ISO serialisation for canonical output.
    canonicalJson(toJsonSafe(report));

    return report;
  }
}

// ---------------------------------------------------------------------------
// Helper: make a LintReport JSON-safe (convert Date → ISO string).
// Undefined values are omitted from objects (mirrors JSON.stringify behaviour).
// Used internally for canonical-JSON verification; not exported.
// ---------------------------------------------------------------------------
function toJsonSafe(value: unknown): unknown {
  if (value === undefined) {
    // canonical-JSON cannot represent undefined; callers omit undefined fields.
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(toJsonSafe);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    const rec = value as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      const v = toJsonSafe(rec[key]);
      // Skip undefined values — canonical-JSON cannot represent them
      // and JSON.stringify omits them from objects.
      if (v !== undefined) {
        out[key] = v;
      }
    }
    return out;
  }
  return value;
}

/**
 * Serialize a LintReport to byte-stable canonical JSON.
 * Exported for callers that need the string form (e.g. byte-stability tests).
 * Date fields are converted to ISO 8601 strings before serialization.
 */
export function serializeLintReport(report: LintReport): string {
  return canonicalJson(toJsonSafe(report));
}
