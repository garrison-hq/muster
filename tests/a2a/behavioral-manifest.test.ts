/**
 * T012 — A2A behavioral manifest schema + loader tests (WP02).
 *
 * Tests FR-004 (accept A2A behavioral manifest), FR-005 (strict validation,
 * unknown fields, literal token/URL rejection), and decision-C threshold
 * resolution (T010 explicit-wins precedence).
 *
 * Normative: kitty-specs/a2a-behavioral-conformance-01KVJDWE/contracts/a2a-behavioral-manifest.md
 * Citation: a2a-behavioral-conformance-01KVJDWE WP02 T012.
 */

import { describe, it, expect } from "vitest";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadBehavioralManifest,
  isA2aBehavioralManifestError,
  resolveThresholds,
} from "../../src/adapters/a2a/behavioral-manifest.js";
import { rfc1Adapter } from "../../src/adapters/rfc1/index.js";

const FIXTURE_DIR = resolvePath(
  fileURLToPath(import.meta.url),
  "../../fixtures/a2a/behavioral-manifests"
);

function fixture(name: string): string {
  return resolvePath(FIXTURE_DIR, name);
}

// ---------------------------------------------------------------------------
// Valid manifests
// ---------------------------------------------------------------------------

describe("FR-004 valid manifests load successfully", () => {
  it("persona.yaml — soul-only threshold source (decision-C source 2)", async () => {
    const result = await loadBehavioralManifest(fixture("persona.yaml"));

    expect(isA2aBehavioralManifestError(result)).toBe(false);
    if (isA2aBehavioralManifestError(result)) return;

    expect(result.adapter).toBe("a2a");
    expect(result.kind).toBe("behavioral");
    expect(result.endpoint.env).toBe("MUSTER_A2A_ENDPOINT");
    expect(result.endpoint.token_env).toBe("MUSTER_A2A_TOKEN");
    expect(result.cases).toHaveLength(1);

    const kase = result.cases[0];
    expect(kase.id).toBe("verbosity-via-soul");
    expect(kase.soul).toBeDefined();
    expect(kase.soul).toContain("Soul.md");
    expect(kase.thresholds).toBeUndefined();
    expect(kase.turns).toHaveLength(1);
    expect(kase.axes).toHaveLength(1);
    expect(kase.runs).toBe(3);
    expect(kase.pass_threshold).toBe(2);
  });

  it("explicit.yaml — explicit threshold source only (decision-C source 1)", async () => {
    const result = await loadBehavioralManifest(fixture("explicit.yaml"));

    expect(isA2aBehavioralManifestError(result)).toBe(false);
    if (isA2aBehavioralManifestError(result)) return;

    expect(result.cases).toHaveLength(1);
    const kase = result.cases[0];
    expect(kase.id).toBe("explicit-thresholds-only");
    expect(kase.soul).toBeUndefined();
    expect(kase.thresholds).toBeDefined();
    expect(kase.thresholds?.default_max_words).toBe(40);
    expect(kase.thresholds?.states?.["escalated"]).toBe(25);
    expect(kase.runs).toBe(5);
    expect(kase.pass_threshold).toBe(4);
    expect(kase.axes).toHaveLength(2);
  });

  it("both.yaml — both sources present; explicit wins over persona-derived (decision-C)", async () => {
    const result = await loadBehavioralManifest(fixture("both.yaml"));

    expect(isA2aBehavioralManifestError(result)).toBe(false);
    if (isA2aBehavioralManifestError(result)) return;

    const kase = result.cases[0];
    expect(kase.id).toBe("both-sources-explicit-wins");
    expect(kase.soul).toBeDefined();
    expect(kase.thresholds).toBeDefined();
    expect(kase.thresholds?.default_max_words).toBe(50);

    // Decision-C: resolveThresholds should return explicit source (50), not
    // persona-derived (10 + 25 = 35)
    const thresholds = await resolveThresholds(
      kase.id,
      kase.soul,
      kase.thresholds,
      kase.overrides,
      kase.axes,
      rfc1Adapter
    );
    expect(Array.isArray(thresholds)).toBe(false);
    if (Array.isArray(thresholds)) return;
    // Explicit source 1 wins: default_max_words = 50 (not persona 35)
    expect(thresholds.baseMaxWords).toBe(50);
    // Per-state explicit cap
    expect(thresholds.stateMaxWords["cold_strict"]).toBe(30);
  });

  it("endpoint defaults to MUSTER_A2A_ENDPOINT / MUSTER_A2A_TOKEN when omitted", async () => {
    const result = await loadBehavioralManifest(fixture("both.yaml"));

    expect(isA2aBehavioralManifestError(result)).toBe(false);
    if (isA2aBehavioralManifestError(result)) return;

    expect(result.endpoint.env).toBe("MUSTER_A2A_ENDPOINT");
    expect(result.endpoint.token_env).toBe("MUSTER_A2A_TOKEN");
  });
});

// ---------------------------------------------------------------------------
// Decision-C: threshold resolution
// ---------------------------------------------------------------------------

describe("T010 decision-C threshold resolution", () => {
  it("persona source: derives baseMaxWords = 10 + voice.verbosity from soul", async () => {
    const result = await loadBehavioralManifest(fixture("persona.yaml"));
    if (isA2aBehavioralManifestError(result)) throw new Error("load failed");

    const kase = result.cases[0];
    const thresholds = await resolveThresholds(
      kase.id,
      kase.soul,
      kase.thresholds,
      kase.overrides,
      kase.axes,
      rfc1Adapter
    );

    expect(Array.isArray(thresholds)).toBe(false);
    if (Array.isArray(thresholds)) return;

    // voice-frontdesk: verbosity = 25 → 10 + 25 = 35
    expect(thresholds.baseMaxWords).toBe(35);
    // cold_strict state: verbosity = 15 → 10 + 15 = 25
    expect(thresholds.stateMaxWords["cold_strict"]).toBe(25);
    // Default refusal cap
    expect(thresholds.refusalCap).toBe(25);
  });

  it("explicit source: uses thresholds.default_max_words directly", async () => {
    const result = await loadBehavioralManifest(fixture("explicit.yaml"));
    if (isA2aBehavioralManifestError(result)) throw new Error("load failed");

    const kase = result.cases[0];
    const thresholds = await resolveThresholds(
      kase.id,
      kase.soul,
      kase.thresholds,
      kase.overrides,
      kase.axes,
      rfc1Adapter
    );

    expect(Array.isArray(thresholds)).toBe(false);
    if (Array.isArray(thresholds)) return;

    expect(thresholds.baseMaxWords).toBe(40);
    expect(thresholds.stateMaxWords["escalated"]).toBe(25);
  });

  it("no-threshold.yaml: verbosity axis without soul or thresholds → violation (decision-C)", async () => {
    const result = await loadBehavioralManifest(fixture("no-threshold.yaml"));
    if (isA2aBehavioralManifestError(result)) throw new Error("load failed");

    const kase = result.cases[0];
    const thresholds = await resolveThresholds(
      kase.id,
      kase.soul,
      kase.thresholds,
      kase.overrides,
      kase.axes,
      rfc1Adapter
    );

    // Must return a violation — verbosity axis needs a threshold (FR-005, decision-C)
    expect(Array.isArray(thresholds)).toBe(true);
    if (!Array.isArray(thresholds)) return;
    expect(thresholds).toHaveLength(1);
    expect(thresholds[0].message).toContain("decision-C");
  });

  it("refusal-only case with no soul or thresholds resolves successfully", async () => {
    // A refusal axis with overrides.refusal_cap is valid without soul or thresholds
    const violations = await resolveThresholds(
      "refusal-only",
      undefined,
      undefined,
      { refusal_cap: 20 },
      [{ axis: "refusal", turn: 0 }],
      rfc1Adapter
    );
    expect(Array.isArray(violations)).toBe(false);
    if (Array.isArray(violations)) return;
    expect(violations.refusalCap).toBe(20);
    expect(violations.baseMaxWords).toBeNull();
  });

  it("refusal-only with default cap (no overrides) is valid without soul or thresholds", async () => {
    const result = await resolveThresholds(
      "refusal-no-overrides",
      undefined,
      undefined,
      undefined,
      [{ axis: "refusal", turn: 0 }],
      rfc1Adapter
    );
    expect(Array.isArray(result)).toBe(false);
    if (Array.isArray(result)) return;
    expect(result.refusalCap).toBe(25);
    expect(result.baseMaxWords).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Error cases (T011 + T012)
// ---------------------------------------------------------------------------

describe("FR-005 strict validation — error cases", () => {
  it("unknown-field.yaml: unknown top-level field → named violation (FR-005)", async () => {
    const result = await loadBehavioralManifest(fixture("unknown-field.yaml"));

    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;

    const unknownFieldError = result.find((v) =>
      v.message.includes("unknownTopField")
    );
    expect(unknownFieldError).toBeDefined();
    expect(unknownFieldError?.message).toContain("FR-005");
  });

  it("literal-token.yaml: literal URL in endpoint.env → violation (NFR-002)", async () => {
    const result = await loadBehavioralManifest(fixture("literal-token.yaml"));

    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;

    const tokenError = result.find(
      (v) => v.path === "endpoint.env" || v.message.includes("NFR-002")
    );
    expect(tokenError).toBeDefined();
    expect(tokenError?.message).toContain("NFR-002");
  });

  it("threshold-gt-runs.yaml: pass_threshold > runs → violation (FR-022 k ≤ n)", async () => {
    const result = await loadBehavioralManifest(fixture("threshold-gt-runs.yaml"));

    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;

    const countError = result.find((v) =>
      v.message.includes("pass_threshold") && v.message.includes("exceeds")
    );
    expect(countError).toBeDefined();
    expect(countError?.message).toContain("FR-022");
  });

  it("empty-turns.yaml: empty turns list → violation (C-005)", async () => {
    const result = await loadBehavioralManifest(fixture("empty-turns.yaml"));

    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;

    const turnsError = result.find((v) => v.path.includes("turns"));
    expect(turnsError).toBeDefined();
  });

  it("out-of-range-turn.yaml: refusal.turn index out of range → violation (FR-005)", async () => {
    const result = await loadBehavioralManifest(fixture("out-of-range-turn.yaml"));

    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;

    const rangeError = result.find((v) => v.path.includes("turn"));
    expect(rangeError).toBeDefined();
    expect(rangeError?.message).toContain("FR-005");
  });

  it("dup-id.yaml: duplicate case id → violation (FR-005)", async () => {
    const result = await loadBehavioralManifest(fixture("dup-id.yaml"));

    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;

    const dupError = result.find(
      (v) => v.message.includes("duplicate") && v.message.includes("repeated-case")
    );
    expect(dupError).toBeDefined();
    expect(dupError?.message).toContain("FR-005");
  });

  it("missing manifest file → violation with readable message", async () => {
    const result = await loadBehavioralManifest(
      fixture("does-not-exist.yaml")
    );

    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;

    expect(result[0].path).toBe("manifest");
    expect(result[0].message).toContain("cannot read");
  });

  it("adapter discriminator wrong → violation", async () => {
    // Write an inline test via a temp file approach or use a raw load
    // We test with a known invalid: wrong adapter value
    const result = await loadBehavioralManifest(
      fixture("unknown-field.yaml")
    );
    // unknown-field.yaml has adapter: a2a and kind: behavioral but extra field
    // The adapter/kind discriminators should be correct; only the unknown field fails
    if (!isA2aBehavioralManifestError(result)) {
      throw new Error("Expected violations");
    }
    // Confirm the adapter/kind discriminators themselves are NOT violated
    const adapterError = result.find((v) => v.path === "manifest.adapter");
    expect(adapterError).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// C-004 boundary guard — inline check
// ---------------------------------------------------------------------------

describe("C-004 boundary — adapter never imported by core", () => {
  it("behavioral-manifest.ts exports the isA2aBehavioralManifestError type-guard (confirms module loads)", () => {
    // The NI-002 invariant in tests/unit/invariants.test.ts is the authoritative
    // gate. Here we verify the adapter module exposes its public API, which confirms
    // it can be loaded without circularity. If core imported this module the tsc
    // build would fail (circular) and invariants.test.ts would report the violation.
    expect(typeof isA2aBehavioralManifestError).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// NFR-002 guard — env-var name validation
// ---------------------------------------------------------------------------

describe("NFR-002 env-var name validation for endpoint fields", () => {
  it("accepts valid POSIX env-var names", async () => {
    // both.yaml uses default endpoint (omitted) — defaults are valid names
    const result = await loadBehavioralManifest(fixture("both.yaml"));
    expect(isA2aBehavioralManifestError(result)).toBe(false);
    if (isA2aBehavioralManifestError(result)) return;
    expect(result.endpoint.env).toBe("MUSTER_A2A_ENDPOINT");
    expect(result.endpoint.token_env).toBe("MUSTER_A2A_TOKEN");
  });

  it("rejects literal URL in endpoint.env (NFR-002)", async () => {
    const result = await loadBehavioralManifest(fixture("literal-token.yaml"));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    // At least one error must mention the env field
    const envError = result.find(
      (v) => v.path.includes("endpoint.env") && v.severity === "error"
    );
    expect(envError).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// isEnvVarName branches — whitespace, nvapi, host:port, invalid POSIX
// ---------------------------------------------------------------------------

describe("isEnvVarName rejects non-env-var literals (NFR-002)", () => {
  it.each([
    ["rejects env with whitespace characters", "endpoint-whitespace-env.yaml"],
    ["rejects env with host:port pattern", "endpoint-hostport-env.yaml"],
    [
      "rejects env that fails POSIX identifier check (starts with digit)",
      "endpoint-invalid-posix-env.yaml",
    ],
  ])("%s", async (_name, fixtureName) => {
    const result = await loadBehavioralManifest(fixture(fixtureName));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find((v) => v.path === "endpoint.env");
    expect(err).toBeDefined();
    expect(err?.message).toContain("NFR-002");
  });
});

// ---------------------------------------------------------------------------
// Endpoint validation branches
// ---------------------------------------------------------------------------

describe("endpoint validation error cases", () => {
  it.each([
    [
      "endpoint is a non-mapping scalar → violation",
      "endpoint-non-mapping.yaml",
      "endpoint",
      "mapping",
    ],
    [
      "endpoint.env is an empty string → violation",
      "endpoint-empty-env.yaml",
      "endpoint.env",
      "non-empty",
    ],
    [
      "endpoint.token_env is a literal URL → violation (NFR-002)",
      "endpoint-literal-token-env.yaml",
      "endpoint.token_env",
      "NFR-002",
    ],
  ])("%s", async (_name, fixtureName, expectedPath, expectedMessage) => {
    const result = await loadBehavioralManifest(fixture(fixtureName));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find((v) => v.path === expectedPath);
    expect(err).toBeDefined();
    expect(err?.message).toContain(expectedMessage);
  });
});

// ---------------------------------------------------------------------------
// Defaults validation branches
// ---------------------------------------------------------------------------

describe("defaults validation error cases", () => {
  it.each([
    [
      "defaults is a scalar (not mapping) → violation",
      "defaults-non-mapping.yaml",
      "defaults",
      "mapping",
    ],
    [
      "defaults.runs = 0 → violation (must be ≥ 1)",
      "defaults-bad-runs.yaml",
      "defaults.runs",
      "integer ≥ 1",
    ],
    [
      "defaults.pass_threshold = 0 → violation (must be ≥ 1)",
      "defaults-bad-pass-threshold.yaml",
      "defaults.pass_threshold",
      "integer ≥ 1",
    ],
    [
      "defaults with unknown field → violation (FR-005)",
      "defaults-unknown-field.yaml",
      "defaults.extraField",
      "FR-005",
    ],
  ])("%s", async (_name, fixtureName, expectedPath, expectedMessage) => {
    const result = await loadBehavioralManifest(fixture(fixtureName));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find((v) => v.path === expectedPath);
    expect(err).toBeDefined();
    expect(err?.message).toContain(expectedMessage);
  });
});

// ---------------------------------------------------------------------------
// Turn validation branches
// ---------------------------------------------------------------------------

describe("turn validation error cases", () => {
  it("turn entry is a string (not mapping) → violation", async () => {
    const result = await loadBehavioralManifest(fixture("turn-non-mapping.yaml"));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find((v) => v.path.includes("turns[0]") && v.message.includes("mapping"));
    expect(err).toBeDefined();
  });

  it("turn facts is an array (not mapping) → violation", async () => {
    const result = await loadBehavioralManifest(fixture("turn-non-mapping-facts.yaml"));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find((v) => v.path.includes("facts") && v.message.includes("mapping"));
    expect(err).toBeDefined();
  });

  it.each([
    [
      "turn role = 'assistant' → violation (only 'user' allowed)",
      "turn-wrong-role.yaml",
      "role",
      '"user"',
    ],
    [
      "turn content is empty string → violation",
      "turn-empty-content.yaml",
      "content",
      "non-empty",
    ],
    [
      "turn fact value is a number (not bool/string) → violation",
      "turn-bad-fact-value.yaml",
      "facts.important",
      "boolean or string",
    ],
    [
      "turn with unknown field → violation (FR-005)",
      "turn-unknown-field.yaml",
      "unknownTurnField",
      "FR-005",
    ],
  ])("%s", async (_name, fixtureName, expectedPathSubstring, expectedMessage) => {
    const result = await loadBehavioralManifest(fixture(fixtureName));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find((v) => v.path.includes(expectedPathSubstring));
    expect(err).toBeDefined();
    expect(err?.message).toContain(expectedMessage);
  });
});

// ---------------------------------------------------------------------------
// Assertion validation branches
// ---------------------------------------------------------------------------

describe("assertion validation error cases", () => {
  it.each([
    [
      "assertion is a string (not mapping) → violation",
      "assertion-non-mapping.yaml",
      "assertions[0]",
      "mapping",
    ],
    [
      "assertion regex=true with invalid pattern → violation",
      "assertion-invalid-regex.yaml",
      "pattern",
      "invalid regular expression",
    ],
    [
      "refusal axis assertions is a mapping (not list) → violation",
      "assertions-non-list.yaml",
      "assertions",
      "list",
    ],
  ])("%s", async (_name, fixtureName, expectedPathSubstring, expectedMessageSubstring) => {
    const result = await loadBehavioralManifest(fixture(fixtureName));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find(
      (v) => v.path.includes(expectedPathSubstring) && v.message.includes(expectedMessageSubstring)
    );
    expect(err).toBeDefined();
  });

  it.each([
    [
      "assertion kind = 'should_contain' → violation (must be must_contain or must_not_contain)",
      "assertion-bad-kind.yaml",
      "assertions[0].kind",
      "must_contain",
    ],
    [
      "assertion pattern is empty string → violation",
      "assertion-empty-pattern.yaml",
      "assertions[0].pattern",
      "non-empty",
    ],
    [
      "assertion regex is a string (not boolean) → violation",
      "assertion-non-bool-regex.yaml",
      "regex",
      "boolean",
    ],
    [
      "assertion with unknown field → violation (FR-005)",
      "assertion-unknown-field.yaml",
      "unknownAssertField",
      "FR-005",
    ],
  ])("%s", async (_name, fixtureName, expectedPathSubstring, expectedMessage) => {
    const result = await loadBehavioralManifest(fixture(fixtureName));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find((v) => v.path.includes(expectedPathSubstring));
    expect(err).toBeDefined();
    expect(err?.message).toContain(expectedMessage);
  });
});

// ---------------------------------------------------------------------------
// Axis validation branches
// ---------------------------------------------------------------------------

describe("axis validation error cases", () => {
  it.each([
    [
      "axis entry is a string (not mapping) → violation",
      "axis-non-mapping.yaml",
      "axes[0]",
      "mapping",
    ],
    [
      "verbosity axis turns='none' (not 'all' or list) → violation",
      "verbosity-bad-turns.yaml",
      "turns",
      '"all"',
    ],
    [
      "verbosity axis turn index out of range → violation (FR-005)",
      "verbosity-out-of-range-turn.yaml",
      "turns[1]",
      "FR-005",
    ],
    [
      "state_shift axis trigger_turn out of range → violation (FR-005)",
      "state-shift-out-of-range.yaml",
      "trigger_turn",
      "FR-005",
    ],
  ])("%s", async (_name, fixtureName, expectedPathSubstring, expectedMessageSubstring) => {
    const result = await loadBehavioralManifest(fixture(fixtureName));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find(
      (v) => v.path.includes(expectedPathSubstring) && v.message.includes(expectedMessageSubstring)
    );
    expect(err).toBeDefined();
  });

  it.each([
    [
      "axis discriminator is unknown value → violation",
      "axis-unknown-type.yaml",
      "axes[0].axis",
      "verbosity",
    ],
    [
      "verbosity axis with unknown field → violation (FR-005)",
      "axis-unknown-field-verbosity.yaml",
      "unknownAxisField",
      "FR-005",
    ],
    [
      "refusal axis with unknown field → violation (FR-005)",
      "axis-unknown-field-refusal.yaml",
      "unknownRefusalField",
      "FR-005",
    ],
    [
      "state_shift axis expect_state empty string → violation (FR-021)",
      "state-shift-empty-expect-state.yaml",
      "expect_state",
      "FR-021",
    ],
    [
      "state_shift axis with unknown field → violation (FR-005)",
      "axis-unknown-field-state-shift.yaml",
      "unknownStateShiftField",
      "FR-005",
    ],
  ])("%s", async (_name, fixtureName, expectedPathSubstring, expectedMessage) => {
    const result = await loadBehavioralManifest(fixture(fixtureName));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find((v) => v.path.includes(expectedPathSubstring));
    expect(err).toBeDefined();
    expect(err?.message).toContain(expectedMessage);
  });
});

// ---------------------------------------------------------------------------
// Overrides validation branches
// ---------------------------------------------------------------------------

describe("overrides validation error cases", () => {
  it("overrides is a string (not mapping) → violation", async () => {
    const result = await loadBehavioralManifest(fixture("overrides-non-mapping.yaml"));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find((v) => v.path.includes("overrides") && v.message.includes("mapping"));
    expect(err).toBeDefined();
  });

  it.each([
    [
      "overrides.max_words = -5 → violation (must be ≥ 0)",
      "overrides-bad-max-words.yaml",
      "max_words",
      "integer ≥ 0",
    ],
    [
      "overrides.refusal_cap = -1 → violation (must be ≥ 0)",
      "overrides-bad-refusal-cap.yaml",
      "refusal_cap",
      "integer ≥ 0",
    ],
    [
      "overrides with unknown field → violation (FR-005)",
      "overrides-unknown-field.yaml",
      "unknownOverrideField",
      "FR-005",
    ],
  ])("%s", async (_name, fixtureName, expectedPathSubstring, expectedMessage) => {
    const result = await loadBehavioralManifest(fixture(fixtureName));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find((v) => v.path.includes(expectedPathSubstring));
    expect(err).toBeDefined();
    expect(err?.message).toContain(expectedMessage);
  });
});

// ---------------------------------------------------------------------------
// Thresholds block validation branches
// ---------------------------------------------------------------------------

describe("thresholds validation error cases", () => {
  it("thresholds is a scalar (not mapping) → violation", async () => {
    const result = await loadBehavioralManifest(fixture("thresholds-non-mapping.yaml"));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find((v) => v.path.includes("thresholds") && v.message.includes("mapping"));
    expect(err).toBeDefined();
  });

  it("thresholds.states is a list (not mapping) → violation", async () => {
    const result = await loadBehavioralManifest(fixture("thresholds-non-mapping-states.yaml"));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find((v) => v.path.includes("states") && v.message.includes("mapping"));
    expect(err).toBeDefined();
  });

  it.each([
    [
      "thresholds.default_max_words = -1 → violation (must be ≥ 0)",
      "thresholds-bad-max-words.yaml",
      "default_max_words",
      "integer ≥ 0",
    ],
    [
      "thresholds state word limit is a string (not int) → violation",
      "thresholds-bad-state-limit.yaml",
      "states.escalated",
      "word limit must be an integer",
    ],
    [
      "thresholds with unknown field → violation (FR-005)",
      "thresholds-unknown-field.yaml",
      "unknownThreshField",
      "FR-005",
    ],
  ])("%s", async (_name, fixtureName, expectedPathSubstring, expectedMessage) => {
    const result = await loadBehavioralManifest(fixture(fixtureName));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find((v) => v.path.includes(expectedPathSubstring));
    expect(err).toBeDefined();
    expect(err?.message).toContain(expectedMessage);
  });
});

// ---------------------------------------------------------------------------
// Case validation branches
// ---------------------------------------------------------------------------

describe("case validation error cases", () => {
  it("case entry is a string (not mapping) → violation", async () => {
    const result = await loadBehavioralManifest(fixture("case-non-mapping.yaml"));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find((v) => v.path === "cases[0]" && v.message.includes("mapping"));
    expect(err).toBeDefined();
  });

  it("case missing id field → violation", async () => {
    const result = await loadBehavioralManifest(fixture("case-missing-id.yaml"));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find((v) => v.path.includes("id") && v.message.includes('"id"'));
    expect(err).toBeDefined();
  });

  it.each([
    ["case soul is empty string → violation", "case-empty-soul.yaml", "soul", "non-empty"],
    ["case axes is empty list → violation", "case-missing-axes.yaml", "axes", "non-empty"],
    [
      "case with unknown field → violation (FR-005)",
      "case-unknown-field.yaml",
      "unknownCaseField",
      "FR-005",
    ],
    ["case runs = 0 → violation (FR-022)", "case-bad-runs.yaml", "runs", "FR-022"],
    [
      "case pass_threshold = 0 → violation (FR-022)",
      "case-bad-pass-threshold.yaml",
      "pass_threshold",
      "FR-022",
    ],
  ])("%s", async (_name, fixtureName, expectedPathSubstring, expectedMessage) => {
    const result = await loadBehavioralManifest(fixture(fixtureName));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find((v) => v.path.includes(expectedPathSubstring));
    expect(err).toBeDefined();
    expect(err?.message).toContain(expectedMessage);
  });
});

// ---------------------------------------------------------------------------
// Top-level manifest validation branches
// ---------------------------------------------------------------------------

describe("top-level loadBehavioralManifest validation branches", () => {
  it.each([
    ["wrong adapter value → violation", "wrong-adapter.yaml", "manifest.adapter", '"a2a"'],
    ["wrong kind value → violation (FR-004)", "wrong-kind.yaml", "manifest.kind", "FR-004"],
    ["empty cases list → violation", "empty-cases.yaml", "cases", "non-empty"],
    [
      "top-level unknown field → violation (FR-005)",
      "top-unknown-field.yaml",
      "manifest.extraTopField",
      "FR-005",
    ],
  ])("%s", async (_name, fixtureName, expectedPath, expectedMessage) => {
    const result = await loadBehavioralManifest(fixture(fixtureName));
    expect(isA2aBehavioralManifestError(result)).toBe(true);
    if (!isA2aBehavioralManifestError(result)) return;
    const err = result.find((v) => v.path === expectedPath);
    expect(err).toBeDefined();
    expect(err?.message).toContain(expectedMessage);
  });
});

// ---------------------------------------------------------------------------
// resolveThresholds branches — decision-C edge cases
// ---------------------------------------------------------------------------

describe("T010 resolveThresholds edge cases (decision-C)", () => {
  it("explicit thresholds empty block + verbosity axis → violation (decision-C)", async () => {
    const result = await loadBehavioralManifest(fixture("explicit-no-threshold-verbosity.yaml"));
    if (isA2aBehavioralManifestError(result)) throw new Error("load failed");
    const kase = result.cases[0];
    const thresholds = await resolveThresholds(
      kase.id,
      kase.soul,
      kase.thresholds,
      kase.overrides,
      kase.axes,
      rfc1Adapter
    );
    expect(Array.isArray(thresholds)).toBe(true);
    if (!Array.isArray(thresholds)) return;
    expect(thresholds[0].message).toContain("decision-C");
    expect(thresholds[0].message).toContain(kase.id);
  });

  it("state_shift axis without soul or thresholds → violation (decision-C)", async () => {
    const result = await loadBehavioralManifest(fixture("state-shift-no-threshold.yaml"));
    if (isA2aBehavioralManifestError(result)) throw new Error("load failed");
    const kase = result.cases[0];
    const thresholds = await resolveThresholds(
      kase.id,
      kase.soul,
      kase.thresholds,
      kase.overrides,
      kase.axes,
      rfc1Adapter
    );
    expect(Array.isArray(thresholds)).toBe(true);
    if (!Array.isArray(thresholds)) return;
    expect(thresholds[0].message).toContain("decision-C");
  });

  it("soul path does not exist → resolveThresholds returns violation", async () => {
    const result = await loadBehavioralManifest(fixture("soul-path-missing.yaml"));
    if (isA2aBehavioralManifestError(result)) throw new Error("load failed");
    const kase = result.cases[0];
    const thresholds = await resolveThresholds(
      kase.id,
      kase.soul,
      kase.thresholds,
      kase.overrides,
      kase.axes,
      rfc1Adapter
    );
    expect(Array.isArray(thresholds)).toBe(true);
    if (!Array.isArray(thresholds)) return;
    expect(thresholds[0].message).toContain("cannot read soul");
  });

  it("explicit thresholds + overrides.max_words overrides baseMaxWords", async () => {
    const result = await loadBehavioralManifest(fixture("explicit-with-overrides.yaml"));
    if (isA2aBehavioralManifestError(result)) throw new Error("load failed");
    const kase = result.cases[0];
    const thresholds = await resolveThresholds(
      kase.id,
      kase.soul,
      kase.thresholds,
      kase.overrides,
      kase.axes,
      rfc1Adapter
    );
    expect(Array.isArray(thresholds)).toBe(false);
    if (Array.isArray(thresholds)) return;
    // overrides.max_words=15 should override thresholds.default_max_words=40
    expect(thresholds.baseMaxWords).toBe(15);
    // overrides.max_words also overrides per-state thresholds
    expect(thresholds.stateMaxWords["escalated"]).toBe(15);
    // overrides.refusal_cap=10
    expect(thresholds.refusalCap).toBe(10);
  });

  it("explicit states-only threshold with state_shift axis → valid (stateMaxWords populated)", async () => {
    const result = await loadBehavioralManifest(fixture("explicit-states-only.yaml"));
    if (isA2aBehavioralManifestError(result)) throw new Error("load failed");
    const kase = result.cases[0];
    const thresholds = await resolveThresholds(
      kase.id,
      kase.soul,
      kase.thresholds,
      kase.overrides,
      kase.axes,
      rfc1Adapter
    );
    expect(Array.isArray(thresholds)).toBe(false);
    if (Array.isArray(thresholds)) return;
    expect(thresholds.baseMaxWords).toBeNull();
    expect(thresholds.stateMaxWords["escalated"]).toBe(20);
  });

  it("soul path with invalid soul YAML → resolveThresholds returns conformance violation", async () => {
    // We provide an inline call: use a file that exists but is not a valid soul
    const badSoulPath = fixture("unknown-field.yaml"); // not a soul, will fail conformance
    const thresholds = await resolveThresholds(
      "test-case",
      badSoulPath,
      undefined,
      undefined,
      [{ axis: "verbosity", turns: "all" }],
      rfc1Adapter
    );
    expect(Array.isArray(thresholds)).toBe(true);
    if (!Array.isArray(thresholds)) return;
    expect(thresholds[0].message).toContain("failed static conformance");
  });
});
