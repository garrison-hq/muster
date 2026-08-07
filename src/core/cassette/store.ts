/**
 * Cassette file persistence (FR-003/FR-004): one directory per suite run,
 * one file per case plus a suite index/provenance file, each serialized as
 * RFC 8785 canonical JSON (C-003: reuses `canonicalJson` verbatim) with a
 * stamped `schemaVersion`.
 *
 * Non-empty-target-directory semantics (plan design decision #2, T016):
 * `writeCassetteCase`/`writeCassetteSuiteIndex` overwrite ONLY the single
 * file they are asked to write — they create the directory if absent, but
 * never enumerate or delete anything else already in it. Re-recording a
 * suite into a directory that already holds files from a prior, unrelated
 * suite therefore leaves those unrelated files untouched; only the files
 * this run actually produces (this suite's case files + its index) change.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson } from "../canonical-json.js";
import type { CassetteCaseFile, CassetteSuiteIndex } from "./types.js";

/**
 * Reserved suite-index filename. Chosen to be extremely unlikely to collide
 * with a real `BehavioralCase.id` (leading underscore + hyphenated multi-
 * word name); callers MUST NOT name a case `_suite-index`.
 */
const SUITE_INDEX_FILENAME = "_suite-index.json";

/**
 * Map a case id to its on-disk filename. Case ids come from manifest data
 * and are not guaranteed filesystem-safe (no path-traversal guarantee
 * either), so every character outside a conservative safe set is replaced
 * with `_` — this also means two case ids differing only in "unsafe"
 * characters could collide on disk; case ids are expected to already be
 * simple slug-like identifiers in practice (every fixture in this repo is).
 */
function caseFileName(caseId: string): string {
  const safe = caseId.replace(/[^A-Za-z0-9._-]/g, "_");
  return `${safe}.json`;
}

/** Persist one case's recorded exchanges (FR-003). Creates `dir` if absent;
 *  overwrites only this case's own file. */
export function writeCassetteCase(dir: string, caseFile: CassetteCaseFile): void {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, caseFileName(caseFile.caseId));
  writeFileSync(path, canonicalJson(caseFile), "utf8");
}

/**
 * Load one case's cassette file, or `undefined` when no file exists for
 * `caseId` in `dir` (a whole-case miss — the caller's replay-miss handling
 * covers this, not a thrown error here).
 */
export function readCassetteCase(dir: string, caseId: string): CassetteCaseFile | undefined {
  const path = join(dir, caseFileName(caseId));
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
  return JSON.parse(raw) as CassetteCaseFile;
}

/** Persist the suite index/provenance file (FR-003/design decision #1).
 *  Creates `dir` if absent; overwrites only the index file. */
export function writeCassetteSuiteIndex(dir: string, index: CassetteSuiteIndex): void {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, SUITE_INDEX_FILENAME);
  writeFileSync(path, canonicalJson(index), "utf8");
}

/** Load the suite index file, or `undefined` when `dir` has none. */
export function readCassetteSuiteIndex(dir: string): CassetteSuiteIndex | undefined {
  const path = join(dir, SUITE_INDEX_FILENAME);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
  return JSON.parse(raw) as CassetteSuiteIndex;
}
