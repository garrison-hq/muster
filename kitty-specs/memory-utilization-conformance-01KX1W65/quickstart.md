# Quickstart: Memory-Utilization / Learning-Lift Conformance

**Mission**: `memory-utilization-conformance-01KX1W65`
**Spec**: `kitty-specs/memory-utilization-conformance-01KX1W65/spec.md`
**Rubric**: `docs/rubric/memory-utilization-taxonomy.md`

This guide walks through running the shipped example end to end: build, run
the conformance suite against a live OpenAI-compatible endpoint, and read the
report. See `docs/guides/memory-utilization-pilot-protocol.md` for how to
size a probe count (`N`) for your own fixture (FR-015).

---

## Prerequisites

- Node 22 LTS, pnpm (same toolchain as the rest of muster)
- An OpenAI-compatible endpoint (BYOM — no provider SDKs, no credentials in
  the repo, NFR-003/NFR-005). This capability has **no static-only path**: it
  IS the behavioral suite (C-002 non-runtime, but every case grades live
  transcripts), so an endpoint is required to get a real result.
  ```bash
  export MUSTER_ENDPOINT=http://localhost:11434/v1   # example: Ollama
  export MUSTER_API_KEY=unused                        # or a real key
  export MUSTER_MODEL=llama3.2                         # or any compatible model
  ```

---

## 1. Build

```bash
pnpm build
```

Expected: `tsc` strict exits 0. This also verifies the adapter compiles under
the `SpecAdapter`/named-adapter boundary (C-001) and that `src/cli/index.ts`'s
additive `memory-utilization` subcommand type-checks.

---

## 2. Run the full test suite

```bash
pnpm test
```

Expected: all tests green, including `tests/adapters/memory-utilization/**`
(WP03/WP04 unit + integration suites), `tests/fixtures/memory-utilization/
suite.test.ts` (WP05's fixture-driven suite), and
`tests/memory-utilization/cli.test.ts` (this WP's CLI end-to-end suite). The
CLI suite is fully offline — it injects a scripted mock chat client — so it
runs deterministically in CI with no live endpoint (the "reduced CI smoke
profile" T022 asks for).

---

## 3. Run the shipped example against a live endpoint

`examples/memory-utilization/` ships a small, self-contained memory fixture
(`MEMORY.md`/`USER.md`/`labels.json`) plus a `manifest.json` declaring one
case: 4 lift probes (facts only recoverable from the declared memory) and 2
abstention probes (declared-unanswerable questions).

```bash
node --import tsx src/cli/index.ts memory-utilization run \
  examples/memory-utilization/manifest.json \
  --json
```

(Or, once built: `node dist/cli/index.js memory-utilization run
examples/memory-utilization/manifest.json --json`.)

The endpoint is resolved from `--base-url`/`--model` flags first, then
`MUSTER_ENDPOINT`/`MUSTER_MODEL`, then a local-Ollama default
(`http://localhost:11434/v1`, `llama3.2`) — see `muster memory-utilization run
--help` for the full precedence and the exit-code contract.

### Expected report shape

```jsonc
{
  "ok": false,               // true iff every case conforms
  "summary": "memory-utilization adapter: ...",
  "rubricDocPath": "docs/rubric/memory-utilization-taxonomy.md",
  "exitCode": 1,             // mirrors the process exit code: 0 | 1
  "cases": [
    {
      "caseId": "memory-utilization-example-halcyon",
      "ok": false,
      "measurement": {
        "verdict": "lift-confirmed" | "no-lift" | "contaminated" | "baseline-invalid",
        "passRateWithMemory": 0.9,
        "passRateNoMemory": 0.1,
        "passRateScrambledMemory": 0.05,
        "delta": 0.8,
        "deltaCI": { "lower": 0.55, "upper": 0.95 },
        "mcnemarMidP": 0.004,
        "mde": 0.42,          // FR-008: always reported, every verdict
        "baselineValid": true,
        "contaminated": false,
        "contaminatedProbeIds": []
      },
      // present only when measurement.verdict === "no-lift" (FR-008):
      "noLiftRendering": {
        "kind": "bounded-powered-null" | "underpowered-inconclusive",
        "note": "... a bounded/powered null ..., never bare absence of evidence."
      },
      "pairedOutcomes": [ /* one entry per lift probe — the retained per-probe cross-arm scores (C-005) */ ],
      "contamination": [ /* per-probe contamination-gate result (FR-006) */ ],
      "scrambledControl": { "passed": true, "reason": "..." },       // FR-005
      "allRefuseGuard": { "fired": false, "reason": "" },             // FR-010
      "abstention": { "passed": true, "perProbe": [ /* ... */ ] },    // FR-007
      "capOfZeroFailedAsDesigned": true,                              // FR-010
      "citations": {                                                  // FR-012
        "liftDefinition": "muster memory-utilization rubric §2.1 (...) — docs/rubric/memory-utilization-taxonomy.md",
        "baselineValidity": "... §2.2 ...",
        "scrambledControl": "... §2.3 ...",
        "contaminationGate": "... §2.4 ...",
        "abstention": "... §2.5 ...",
        "singleArmCI": "... §3.1 ...",
        "pairedSignificance": "... §3.2 ...",
        "deltaCI": "... §3.3 ...",
        "powerMde": "... §3.4 ...",
        "verdictSemantics": "... §6.1 ...",
        "doubleConfirmation": "... §6.2 ...",
        "contaminationVeto": "... §6.3 ...",
        "abstentionUnderMemory": "... §6.4 ..."
      }
    }
  ]
}
```

### Exit-code contract

| Code | Meaning |
|---|---|
| `0` | Every case conforms (`lift-confirmed`, every control/guard held). |
| `1` | Any case failed / `no-lift` / `contaminated` / `baseline-invalid`. |
| `2` | Manifest could not be read/parsed, or the adapter run itself errored. |

---

## 4. Byte-stability check (offline, scripted-client path)

The CLI's report-building path (manifest load → path resolution → citation
attachment → JSON serialization) is deterministic — no `Date.now()` or
`Math.random()` anywhere in `src/cli/index.ts`'s `memory-utilization`
section. The only non-determinism in a *live* run comes from the model
endpoint itself (NFR-002: no seed is ever sent — decisions rest on
N-sampled pass-rates and their confidence intervals, not exact
reproduction). `tests/memory-utilization/cli.test.ts` proves the CLI's own
path is byte-stable end to end using a scripted, offline mock client — run
it directly:

```bash
npx vitest run tests/memory-utilization/cli.test.ts
```

---

## 5. Sizing your own probe count

`examples/memory-utilization/manifest.json` declares `runsN: 5` and a
`liftDelta` threshold as illustrative defaults, not a sized value. Before
publishing a real conformance claim against your own fixture, follow
`docs/guides/memory-utilization-pilot-protocol.md` (FR-015) to estimate the
variance components a real N-sizing decision needs, then feed
`requiredSampleSize`/`minimumDetectableEffect`
(`src/core/behavioral/stats/power.ts`) to pick a probe count with a
documented basis.

---

## 6. Further reading

- `docs/rubric/memory-utilization-taxonomy.md` — the published rubric every
  emitted `citations` entry resolves against (FR-012, FR-013).
- `docs/guides/memory-utilization-pilot-protocol.md` — the N-sizing pilot
  protocol (FR-015).
- `tests/fixtures/memory-utilization/README.md` — the candidate upstream
  conformance fixture set (FR-014) and its contamination-cleanliness
  argument.
- `kitty-specs/memory-utilization-conformance-01KX1W65/spec.md` — the full
  functional/non-functional requirement set this mission implements.
