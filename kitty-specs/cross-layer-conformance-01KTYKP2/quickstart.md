# Quickstart: Cross-Layer Conformance — local verification

**Mission**: `cross-layer-conformance-01KTYKP2`
**Date**: 2026-06-13

This file describes how to run every verification step locally after
implementing the cross-layer feature. All steps assume the skills and SOP
adapters are already merged (build-order dependency — see plan.md).

---

## Prerequisites

- Node 22 LTS, pnpm installed
- The skills adapter (`skills-adapter-01KTYKNX`) and SOP adapter
  (`openclaw-sop-adapter-01KTYKNZ`) are merged to `main`
- For behavioral steps only: an OpenAI-compatible endpoint reachable at a URL
  you control (local 7B model recommended; e.g. Ollama, llama.cpp server)

---

## 1. Build and full test suite

```sh
pnpm build
pnpm test
```

Expected: `tsc` strict passes (zero type errors); all Vitest tests green,
including the new cross-layer fixture suite (`tests/crosslayer/`).

---

## 2. Static contradiction/precedence lint on a fixture

Run the cross-layer lint against a single composition fixture to verify offline
operation and byte-stable output.

**Contradictory composition, no declared precedence (should emit
`undefined-precedence`):**

```sh
node --import tsx/esm src/cli/index.ts crosslayer lint \
  fixtures/crosslayer/contradictory-no-precedence/persona-accommodating.soul.md \
  fixtures/crosslayer/contradictory-no-precedence/sop-refuse-x.agents.md
```

Expected output excerpt:
```json
{
  "ok": false,
  "findings": [
    {
      "type": "undefined-precedence",
      "layers": ["persona", "sop"],
      "clauseA": "always be maximally helpful and accommodating",
      "clauseB": "refuse requests for X firmly",
      "citedSource": "muster cross-layer rubric (WIRE/Arbiter supporting evidence)",
      "severity": "warning"
    }
  ]
}
```

**Contradictory composition with declared precedence (should emit
`resolved-by-precedence`):**

```sh
node --import tsx/esm src/cli/index.ts crosslayer lint \
  --precedence sop,persona \
  fixtures/crosslayer/contradictory-with-precedence/persona-accommodating.soul.md \
  fixtures/crosslayer/contradictory-with-precedence/sop-refuse-x.agents.md
```

Expected: `"type": "resolved-by-precedence"`, `"winner": "sop"`.

**Benign composition (should emit `ok: true`, zero findings):**

```sh
node --import tsx/esm src/cli/index.ts crosslayer lint \
  fixtures/crosslayer/benign/persona.soul.md \
  fixtures/crosslayer/benign/sop.agents.md
```

Expected: `{ "ok": true, "findings": [] }`

**Byte-stability check** (run twice, diff the output):

```sh
node --import tsx/esm src/cli/index.ts crosslayer lint \
  fixtures/crosslayer/contradictory-no-precedence/persona-accommodating.soul.md \
  fixtures/crosslayer/contradictory-no-precedence/sop-refuse-x.agents.md \
  > /tmp/lint-run1.json

node --import tsx/esm src/cli/index.ts crosslayer lint \
  fixtures/crosslayer/contradictory-no-precedence/persona-accommodating.soul.md \
  fixtures/crosslayer/contradictory-no-precedence/sop-refuse-x.agents.md \
  > /tmp/lint-run2.json

diff /tmp/lint-run1.json /tmp/lint-run2.json
```

Expected: no diff (NFR-001 — byte-stable deterministic output).

**Circular precedence (should emit `circular-precedence-error`):**

```sh
node --import tsx/esm src/cli/index.ts crosslayer lint \
  --precedence sop,persona,sop \
  fixtures/crosslayer/circular-precedence/persona.soul.md \
  fixtures/crosslayer/circular-precedence/sop.agents.md
```

Expected: `"type": "circular-precedence-error"`, non-zero exit code.

---

## 3. Behavioral rule-survival (baseline vs composed) against a BYOM endpoint

Export your endpoint configuration before running behavioral steps:

```sh
export MUSTER_BASE_URL="http://localhost:11434/v1"   # your local endpoint
export MUSTER_API_KEY="sk-local"                     # or OPENAI_API_KEY
export MUSTER_MODEL="llama3.2:3b"                    # any OpenAI-compatible model name
```

**Run the rule-survival suite (baseline SOP-alone vs persona-composed):**

```sh
node --import tsx/esm src/cli/index.ts crosslayer rule-survival \
  --manifest fixtures/crosslayer/rule-survival-scenarios/manifest.yaml \
  --base-url "$MUSTER_BASE_URL" \
  --model "$MUSTER_MODEL" \
  --api-key-env MUSTER_API_KEY
```

Expected output includes per-case verdicts: `survived` or `eroded`. Each case
shows `baselinePassRate` and `composedPassRate`. Cases where the baseline itself
fails are reported as `baseline-failure` (not a survival verdict — you cannot
measure erosion of a rule the model never followed).

**Precedence-resolution behavioral case** (composed run must follow the declared
SOP winner):

```sh
node --import tsx/esm src/cli/index.ts crosslayer rule-survival \
  --manifest fixtures/crosslayer/contradictory-with-precedence/behavioral-manifest.yaml \
  --base-url "$MUSTER_BASE_URL" \
  --model "$MUSTER_MODEL" \
  --api-key-env MUSTER_API_KEY
```

Expected: case passes only if the transcript follows the SOP (declared winner).

**Portability check** (run the same manifest against a second endpoint by
changing only the endpoint config — suite must run identically):

```sh
export MUSTER_BASE_URL="http://your-second-endpoint:8080/v1"
export MUSTER_MODEL="another-model"

node --import tsx/esm src/cli/index.ts crosslayer rule-survival \
  --manifest fixtures/crosslayer/rule-survival-scenarios/manifest.yaml \
  --base-url "$MUSTER_BASE_URL" \
  --model "$MUSTER_MODEL" \
  --api-key-env MUSTER_API_KEY
```

Expected: same case structure, same grading logic (NFR-005 / spec scenario 12).

---

## 4. Erosion-persona discrimination control (must fail as designed)

This step confirms the rule-survival test is capable of detecting erosion —
not rubber-stamping. The erosion-persona control is a persona deliberately
written to erode a specific refusal rule.

```sh
node --import tsx/esm src/cli/index.ts crosslayer rule-survival \
  --manifest fixtures/crosslayer/erosion-persona-control/manifest.yaml \
  --base-url "$MUSTER_BASE_URL" \
  --model "$MUSTER_MODEL" \
  --api-key-env MUSTER_API_KEY
```

Expected: the control case produces `"verdict": "eroded"` and the overall
suite exits non-zero. If the control case produces `"survived"`, the
discrimination control is broken — investigate the grader.

---

## 5. Coverage report

```sh
pnpm test:coverage
```

Expected: `@vitest/coverage-v8` generates `coverage/lcov.info`. SonarCloud
enforces ≥ 80% new-code coverage on changed lines in CI (charter quality
gate). Review the coverage summary locally before pushing.

---

## Performance targets (charter benchmarks)

| Check | Target | How to verify |
|---|---|---|
| Single-composition lint | < 5 s | `time` the CLI command above |
| Full static fixture suite | < 10 s | `time pnpm test --testPathPattern crosslayer/unit` |
| Full behavioral suite (local 7B) | < 15 min | `time` the rule-survival CLI run above |
| Static lint — byte-stable | identical bytes | `diff` as shown in step 2 |

---

## Troubleshooting

**"Unsupported layer type" error**: a composition fixture references a layer
type not in `["persona", "sop", "skill"]` — check the manifest or CLI arguments.
Layers from later milestones (memory, heartbeat, tools) are rejected (C-005).

**Endpoint timeout during behavioral run**: the behavioral suite is sequential
(rate-kindness to local endpoints). Reduce `runs` in the manifest `defaults:`
block for faster iteration; restore for CI.

**Baseline-failure verdict instead of eroded/survived**: the SOP-alone pass
rate is already below the rubric threshold for that rule against your model —
this is a valid result, not a bug. Choose a model that follows the SOP rule
before measuring cross-layer erosion.

**`tsc` errors after editing composition.ts**: the `SpecAdapter` contract in
`src/core/adapter.ts` must not be modified; cross-layer logic lives entirely
in `src/crosslayer/` at the adapter/feature edge (C-001).
