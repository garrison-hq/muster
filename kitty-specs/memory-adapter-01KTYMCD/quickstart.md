# Quickstart: Memory (MEMORY.md / USER.md) Conformance Adapter

**Mission**: `memory-adapter-01KTYMCD`
**Date**: 2026-06-13
**Spec**: `kitty-specs/memory-adapter-01KTYMCD/spec.md`

This guide walks through verifying the memory adapter locally: build, static
lint, behavioral probes, and coverage. All static steps are fully offline and
require no model endpoint.

---

## Prerequisites

- Node 22 LTS, pnpm (same toolchain as the rest of muster)
- For behavioral steps only: an OpenAI-compatible endpoint (BYOM)
  ```
  export MUSTER_ENDPOINT=http://localhost:11434/v1   # example: Ollama
  export MUSTER_API_KEY=unused                       # or a real key
  export MUSTER_MODEL=mistral:7b                     # or any compatible model
  ```
- No provider SDKs, no credentials in the repo (NFR-005).

---

## 1. Build

```bash
pnpm build
```

Expected: `tsc` strict exits 0, no type errors. This verifies the adapter
compiles under the same strict settings as the rest of the codebase, including
the `SpecAdapter` boundary check (C-001).

---

## 2. Run the full test suite

```bash
pnpm test
```

Expected: all tests green, including the memory fixture suite. The static lint
tests are offline and run first; behavioral tests are skipped unless a live
endpoint is available (the test manifest marks them as requiring an endpoint).

---

## 3. Run the staleness lint with a supplied reference date

Supplying a reference date is **required** for staleness checks — the adapter
performs no clock read (C-003, NFR-001).

```bash
# Against the stale fixture set — expects a staleness finding
node --import tsx src/cli/index.ts memory lint \
  --memory tests/fixtures/memory/stale/MEMORY.md \
  --user   tests/fixtures/memory/stale/USER.md \
  --manifest tests/fixtures/memory/stale/manifest.json \
  --reference-date 2026-06-13

# Expected output: StalenessFinding listing the stale fact, its age, and
# the muster rubric citation.

# Against the consistent fixture set — expects ok: true
node --import tsx src/cli/index.ts memory lint \
  --memory tests/fixtures/memory/consistent/MEMORY.md \
  --user   tests/fixtures/memory/consistent/USER.md \
  --manifest tests/fixtures/memory/consistent/manifest.json \
  --reference-date 2026-06-13

# Expected output: { "ok": true, "stalenessFindings": [], ... }
```

Byte-stability check: run either command twice and diff the outputs — they must
be identical (NFR-001):

```bash
node --import tsx src/cli/index.ts memory lint \
  --memory tests/fixtures/memory/stale/MEMORY.md \
  --user   tests/fixtures/memory/stale/USER.md \
  --manifest tests/fixtures/memory/stale/manifest.json \
  --reference-date 2026-06-13 > /tmp/lint-run-1.json

node --import tsx src/cli/index.ts memory lint \
  --memory tests/fixtures/memory/stale/MEMORY.md \
  --user   tests/fixtures/memory/stale/USER.md \
  --manifest tests/fixtures/memory/stale/manifest.json \
  --reference-date 2026-06-13 > /tmp/lint-run-2.json

diff /tmp/lint-run-1.json /tmp/lint-run-2.json
# Expected: no output (files are identical)
```

Missing reference date — must record a skip note, not silently pass (FR-003):

```bash
node --import tsx src/cli/index.ts memory lint \
  --memory tests/fixtures/memory/stale/MEMORY.md \
  --user   tests/fixtures/memory/stale/USER.md \
  --manifest tests/fixtures/memory/stale/manifest.json
  # no --reference-date flag

# Expected output: { "ok": false, "stalenessSkip": { "kind": "staleness-skip",
#   "reason": "no-reference-date" }, ... }
```

---

## 4. Run the contradiction lint

```bash
# Against the contradictory fixture set — expects contradiction findings
node --import tsx src/cli/index.ts memory lint \
  --memory tests/fixtures/memory/contradictory/MEMORY.md \
  --user   tests/fixtures/memory/contradictory/USER.md \
  --manifest tests/fixtures/memory/contradictory/manifest.json \
  --reference-date 2026-06-13

# Expected output: ContradictionFinding entries for the cross-file
# contradiction (MEMORY.md ↔ USER.md) and the intra-file contradiction,
# each with a rubric citation.

# Against the consistent fixture set — expects ok: true, no findings
node --import tsx src/cli/index.ts memory lint \
  --memory tests/fixtures/memory/consistent/MEMORY.md \
  --user   tests/fixtures/memory/consistent/USER.md \
  --manifest tests/fixtures/memory/consistent/manifest.json \
  --reference-date 2026-06-13

# Expected output: { "ok": true, ... }
```

---

## 5. Run the recall and privacy behavioral probes against BYOM

Ensure the environment variables from the Prerequisites section are set.

**Recall probes (k-of-n)**:

```bash
node --import tsx src/cli/index.ts memory behavioral \
  --manifest tests/fixtures/memory/recall-scenarios/fact-recall.yaml \
  --memory   tests/fixtures/memory/consistent/MEMORY.md \
  --user     tests/fixtures/memory/consistent/USER.md

# Expected: the model recalls the required MEMORY.md fact at or above the
# rubric threshold; case verdict: PASS.

node --import tsx src/cli/index.ts memory behavioral \
  --manifest tests/fixtures/memory/recall-scenarios/addressing-recall.yaml \
  --memory   tests/fixtures/memory/consistent/MEMORY.md \
  --user     tests/fixtures/memory/consistent/USER.md

# Expected: the model honors the USER.md addressing preference; PASS.
```

**Privacy / leak probe (pass^k) — confirm the probe fails on a leaking model**:

The fixture includes a rigged-impossible control case that simulates a leaking
model response:

```bash
node --import tsx src/cli/index.ts memory behavioral \
  --manifest tests/fixtures/memory/privacy-scenarios/group-context.yaml \
  --memory   tests/fixtures/memory/consistent/MEMORY.md \
  --user     tests/fixtures/memory/consistent/USER.md

# Against a compliant model: Expected: no private facts surfaced across all k
# runs; case verdict: PASS.
```

To verify the probe correctly fails on a leaking response, run the
discrimination control directly (this is also run automatically by `pnpm test`):

```bash
# The discrimination control case is marked with probeKind: rigged-fail
# in the manifest. Run the test suite to confirm it fires:
pnpm test -- --grep "privacy.discrimination.control"

# Expected: the test verifies that the grader returns FAIL when the
# simulated response contains the private fact text.
```

**All-refuse guard — confirm it fires on a model that refuses everything**:

The companion recall probe in the privacy fixture set serves as the all-refuse
guard. A model that refuses all outputs trivially passes the leak probe; the
guard fires when the recall probe also fails:

```bash
node --import tsx src/cli/index.ts memory behavioral \
  --manifest tests/fixtures/memory/privacy-scenarios/all-refuse-guard.yaml \
  --memory   tests/fixtures/memory/consistent/MEMORY.md \
  --user     tests/fixtures/memory/consistent/USER.md

# Expected when run against a simulated all-refuse model (use the
# rigged-refuse fixture endpoint): the summary reports
# "all-refuse guard triggered — result is indeterminate".
```

The all-refuse guard is also verified automatically by `pnpm test`:

```bash
pnpm test -- --grep "privacy.all-refuse.guard"
# Expected: PASS (the test confirms the guard fires on the rigged-refuse stub).
```

**Adversarial extraction probe (vendored corpus, pass^k)**:

```bash
node --import tsx src/cli/index.ts memory behavioral \
  --manifest tests/fixtures/memory/privacy-scenarios/adversarial-group-context.yaml \
  --memory   tests/fixtures/memory/consistent/MEMORY.md \
  --user     tests/fixtures/memory/consistent/USER.md

# Expected: the model does not surface private facts even under adversarial
# extraction attempts; all k runs pass; case verdict: PASS.
# If any run leaks: FAIL (pass^k, NFR-007).
```

---

## 6. Run coverage

```bash
pnpm test:coverage
```

Expected: `coverage/lcov.info` generated. New memory adapter code must meet the
≥ 80% new-code threshold enforced by the SonarCloud quality gate (charter
testing standards). The coverage gate applies to changed code in PRs; there is
no whole-project floor.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `"no-reference-date"` in lint output | `--reference-date` flag not supplied | Add `--reference-date YYYY-MM-DD` |
| Behavioral tests skipped entirely | Endpoint env vars not set | Set `MUSTER_ENDPOINT`, `MUSTER_API_KEY`, `MUSTER_MODEL` |
| Privacy probe passes trivially (model refuses everything) | All-refuse guard fires | Check the companion recall probe result; investigate model configuration |
| Privacy probe FAIL on a compliant model | Group-context framing ambiguous | Verify the scenario's group-context framing is unambiguous per the rubric |
| Diff of two lint runs is non-empty | Non-deterministic serialization | Check for `Date.now()` or locale-dependent sort in `lint.ts`; output must use UTF-16 code-unit ordering |
| `tsc` errors on `src/adapters/memory/` | Core boundary violation | Ensure no import of memory types from `src/core/` or vice versa (C-001) |
