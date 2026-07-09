/**
 * fixture.ts — Stage the declared memory fixture in its three variants
 * (data-model.md `MemoryFixture`): `real`, `none` (empty/absent), and
 * `scrambled` (plausible-but-irrelevant facts).
 *
 * FR-002: reuses the Memory adapter's `MEMORY.md`/`USER.md` parser
 * (`src/adapters/memory/lint.ts` `FactParser`) rather than re-implementing
 * fact parsing — the closest surface per research.md §3.
 *
 * NFR-001: fixture loading is fully offline and byte-stable deterministic —
 * no `Date.now()`/`Math.random()` anywhere in this module. The scrambler
 * below is a pure function of each fact's `id` (a deterministic string hash
 * selects the substitute), never a random draw.
 */

import { readFileSync } from "node:fs";
import { FactParser, type FactManifest, type MemoryFact } from "../memory/lint.js";
import type { ConditionArmName, MemoryFixtureRef } from "./manifest.js";

export type FixtureVariant = "real" | "none" | "scrambled";

/** One staged variant of the declared memory fixture (data-model.md `MemoryFixture`). */
export interface StagedFixture {
  readonly variant: FixtureVariant;
  readonly facts: readonly MemoryFact[];
  /** The `[MEMORY]` block to inject into the arm's system prompt; `""` for `none`. */
  readonly contextBlock: string;
}

const NEUTRAL_SYSTEM_PROMPT =
  "You are a helpful assistant. Answer the user's questions directly and honestly.";

// ---------------------------------------------------------------------------
// Deterministic scrambler (FR-002 discrimination fixture; C-002 non-runtime).
//
// muster judgment call (no citable convention — C-003): each real fact is
// deterministically mapped to one entry of a fixed pool of plausible-but-
// irrelevant facts via a pure string hash of the fact's id (FNV-1a, a
// well-known non-cryptographic hash — chosen only for its determinism and
// uniform bucket spread, not for any security property). The same fact id
// always scrambles to the same pool entry, on any machine, forever — the
// NFR-001 byte-stability invariant this mission's static path requires.
// ---------------------------------------------------------------------------

const SCRAMBLE_POOL: readonly string[] = [
  "The office lobby plant is a pothos that gets watered on Mondays.",
  "The building's recycling bins are collected every other Thursday.",
  "The nearest coffee shop closes at six on weekdays.",
  "The conference room projector needs an HDMI adapter, not USB-C.",
  "The parking garage's third level is reserved for visitors.",
  "The break-room fridge is cleaned out on the first of the month.",
  "The company softball team practices on Tuesday evenings.",
  "The printer on the second floor only accepts A4 paper.",
  "The elevator on the west side is slower than the one on the east side.",
  "The rooftop deck is closed during winter months.",
  "The mail room sorts packages before 10am each day.",
  "The bike racks outside are covered but not locked.",
] as const;

/** FNV-1a 32-bit hash — pure, deterministic, no crypto/PRNG dependency. */
function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministically map a real fact to a plausible-but-irrelevant
 * replacement text. Same fact id -> same replacement, always (NFR-001).
 */
export function scrambleFactText(fact: MemoryFact): string {
  const index = fnv1aHash(fact.id) % SCRAMBLE_POOL.length;
  return SCRAMBLE_POOL[index] ?? SCRAMBLE_POOL[0]!;
}

// ---------------------------------------------------------------------------
// Loading — reuses the Memory adapter's FactParser (FR-002).
// ---------------------------------------------------------------------------

function loadFactManifest(manifestPath: string): FactManifest {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as FactManifest;
}

/** Parse MEMORY.md + USER.md into the real declared facts (reused parser, FR-002). */
export function loadRealFacts(ref: MemoryFixtureRef): MemoryFact[] {
  const parser = new FactParser();
  const manifest = loadFactManifest(ref.manifestPath);
  const memoryFacts = parser.parse(ref.memoryPath, manifest);
  const userFacts = parser.parse(ref.userPath, manifest);
  return [...memoryFacts, ...userFacts];
}

/** Join staged facts into the `[MEMORY]` block text injected into a system prompt. */
function buildContextBlock(facts: readonly MemoryFact[]): string {
  if (facts.length === 0) return "";
  return `[MEMORY]\n${facts.map((f) => f.text).join("\n")}\n`;
}

/**
 * Stage one variant of the declared memory fixture.
 *
 * - `none`: no facts, empty context block — the closed-book baseline (FR-002).
 * - `real`: the declared facts, verbatim (FR-002).
 * - `scrambled`: same fact ids/shape, each fact's text replaced with a
 *   plausible-but-irrelevant substitute (FR-005 discrimination control).
 */
export function stageFixture(ref: MemoryFixtureRef, variant: FixtureVariant): StagedFixture {
  if (variant === "none") {
    return { variant, facts: [], contextBlock: "" };
  }
  const realFacts = loadRealFacts(ref);
  if (variant === "real") {
    return { variant, facts: realFacts, contextBlock: buildContextBlock(realFacts) };
  }
  const scrambledFacts = realFacts.map((fact) => ({
    ...fact,
    text: scrambleFactText(fact),
    timestamp: undefined,
  }));
  return { variant, facts: scrambledFacts, contextBlock: buildContextBlock(scrambledFacts) };
}

/** Stage all three condition-arm variants for one declared fixture (FR-002). */
export function stageAllArms(ref: MemoryFixtureRef): Record<ConditionArmName, StagedFixture> {
  return {
    "no-memory": stageFixture(ref, "none"),
    "with-memory": stageFixture(ref, "real"),
    "scrambled-memory": stageFixture(ref, "scrambled"),
  };
}

/** Build the arm's full system-prompt text (neutral instruction + staged context block). */
export function buildArmSystemPrompt(staged: StagedFixture): string {
  return staged.contextBlock.length === 0
    ? NEUTRAL_SYSTEM_PROMPT
    : `${NEUTRAL_SYSTEM_PROMPT}\n\n${staged.contextBlock}`;
}
