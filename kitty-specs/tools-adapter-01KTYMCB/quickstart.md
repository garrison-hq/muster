# Local Verification: Tools Adapter

**Mission**: `tools-adapter-01KTYMCB`
**Date**: 2026-06-13

All commands run from the repository root. No credentials or network access
are needed for the static and drift paths (NFR-001/C-003). The behavioral path
requires a BYOM OpenAI-compatible endpoint (NFR-005).

---

## 1. Build

```bash
pnpm build
```

Runs `tsc` in strict mode (NFR-006). Must exit 0 with no errors before any
further step.

---

## 2. Full test suite (static + drift paths, offline)

```bash
pnpm test
```

Runs the complete Vitest suite, including:
- The CTS fixture suite (existing, must stay green — FR-001/C-001).
- `tests/tools/unit/lint.test.ts` — static lint unit tests (WP01).
- `tests/tools/unit/drift.test.ts` — drift check unit tests, all three finding
  types (WP02).
- `tests/tools/unit/selection.test.ts` — selection grader + discrimination
  control (WP03).

Expected: all tests pass; the rigged-impossible control case in
`selection.test.ts` is verified to produce `passed: false` (FR-008, charter).

---

## 3. Static lint against a TOOLS.md fixture (offline, byte-stable)

Run the static lint check against the well-formed fixture:

```bash
pnpm muster tools lint tests/tools/fixtures/tools-md/well-formed.md
```

Expected output: `ok: true`, zero structural errors.

Run against the fixture with a missing required section:

```bash
pnpm muster tools lint tests/tools/fixtures/tools-md/missing-section.md
```

Expected output: one structural violation citing the muster rubric (FR-003/FR-009).

Run against the duplicate-name fixture:

```bash
pnpm muster tools lint tests/tools/fixtures/tools-md/duplicate-tool.md
```

Expected output: one duplicate-name error (spec edge case).

---

## 4. Drift check against a supplied environment descriptor (offline, byte-stable)

Run the drift check with the exactly-matching MCP descriptor:

```bash
pnpm muster tools drift \
  tests/tools/fixtures/tools-md/well-formed.md \
  tests/tools/fixtures/env-descriptors/matching-mcp.json
```

Expected output: clean drift report, zero findings (acceptance scenario 6/SC-002).

Run with the `documented-but-missing` descriptor:

```bash
pnpm muster tools drift \
  tests/tools/fixtures/tools-md/well-formed.md \
  tests/tools/fixtures/env-descriptors/documented-but-missing.json
```

Expected output: one `documented-but-missing` finding for `send_email`
(acceptance scenario 3).

Run with the `present-but-undocumented` descriptor:

```bash
pnpm muster tools drift \
  tests/tools/fixtures/tools-md/well-formed.md \
  tests/tools/fixtures/env-descriptors/present-but-undocumented.json
```

Expected output: one `present-but-undocumented` finding for `delete_file`
(acceptance scenario 4).

Run with a schema-mismatch descriptor (reality-ahead direction):

```bash
pnpm muster tools drift \
  tests/tools/fixtures/tools-md/well-formed.md \
  tests/tools/fixtures/env-descriptors/schema-mismatch-sub.json
```

Expected output: one `schema-mismatch` finding, `direction: reality-ahead`,
with the differing field(s) named (acceptance scenario 5).

Run with an unknown-format descriptor to verify the error path:

```bash
pnpm muster tools drift \
  tests/tools/fixtures/tools-md/well-formed.md \
  tests/tools/fixtures/env-descriptors/unknown-format.json
```

Expected output: a clear error (not a silent pass), spec edge case "Environment
descriptor format the adapter does not recognize" (FR-004).

---

## 5. Byte-stability verification (static + drift path)

Run the same drift check twice and confirm the outputs are identical:

```bash
pnpm muster tools drift \
  tests/tools/fixtures/tools-md/well-formed.md \
  tests/tools/fixtures/env-descriptors/matching-mcp.json \
  --output /tmp/drift-run1.json

pnpm muster tools drift \
  tests/tools/fixtures/tools-md/well-formed.md \
  tests/tools/fixtures/env-descriptors/matching-mcp.json \
  --output /tmp/drift-run2.json

diff /tmp/drift-run1.json /tmp/drift-run2.json && echo "byte-stable: OK"
```

Expected: `diff` exits 0, `byte-stable: OK` printed (NFR-001/SC-002).

---

## 6. Behavioral tool-selection probes (BYOM, requires live endpoint)

Set your endpoint and model in the environment:

```bash
export MUSTER_BASE_URL=http://localhost:11434/v1   # e.g. local Ollama
export MUSTER_MODEL=mistral:7b                      # any OpenAI-compatible model
```

Run the correct-selection scenario (acceptance scenario 7):

```bash
pnpm muster tools behavioral \
  tests/tools/fixtures/tools-md/well-formed.md \
  tests/tools/fixtures/selection-scenarios/correct-tool.json
```

Expected output: `passed: true`, model selected the correct tool at or above
the rubric threshold over k-of-n runs (FR-006/FR-007).

Run the abstention scenario (acceptance scenario 8):

```bash
pnpm muster tools behavioral \
  tests/tools/fixtures/tools-md/well-formed.md \
  tests/tools/fixtures/selection-scenarios/abstain.json
```

Expected output: `passed: true` on the abstention axis (FR-007).

Run the rigged-impossible discrimination control (acceptance scenario 9):

```bash
pnpm muster tools behavioral \
  tests/tools/fixtures/tools-md/well-formed.md \
  tests/tools/fixtures/selection-scenarios/control.json
```

Expected output: `passed: false` — the control must fail (FR-008, charter
"every judge-backed grader ships with a rigged-impossible control case proving
it can fail"). A passing control here is itself a defect.

---

## 7. Coverage gate

```bash
pnpm test:coverage
```

Runs `vitest run --coverage`, emitting `coverage/lcov.info`. New code in
`src/adapters/tools/` must meet the ≥80% new-code coverage threshold enforced
by SonarCloud (NFR-006, charter). Review the summary for any uncovered branches
in `lint.ts`, `drift.ts`, or `selection.ts` before submitting the PR.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `tsc` errors in `src/adapters/tools/` | Missing WP not yet implemented | Verify correct WP merge order (WP01 → WP02 → WP03 → WP04) |
| `drift` command errors with "unknown format" on a valid MCP manifest | Format detection heuristic | Check JSON shape matches expected MCP manifest structure; see `data-model.md` `EnvironmentDescriptor` |
| Behavioral suite hangs | Endpoint unreachable or model too slow | Confirm `MUSTER_BASE_URL` is reachable; check endpoint supports `tools` in the chat API |
| Behavioral control case reports `passed: true` | Grader defect | The discrimination control must fail; a passing control is a test-suite failure (FR-008) |
| Byte-stability `diff` shows differences | Non-deterministic output ordering | Verify `DriftReport.findings` sort order is kind-then-toolName UTF-16 lexicographic (NFR-001) |
| Coverage < 80% on new code | Missing branch/edge-case tests | Add unit tests for the uncovered branches before PR; do not reduce fixture coverage to meet the gate |
