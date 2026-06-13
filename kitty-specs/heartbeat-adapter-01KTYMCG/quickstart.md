# Quickstart: Local Verification — Schedule (HEARTBEAT.md) Conformance Adapter

**Mission**: `heartbeat-adapter-01KTYMCG`
**Date**: 2026-06-13
**Spec**: `kitty-specs/heartbeat-adapter-01KTYMCG/spec.md`

This guide covers everything needed to verify the Schedule adapter locally: a
full build, the static lint path (including the empty-file-skip check), all
three behavioral tick probes against a BYOM endpoint, the discrimination
controls, and coverage upload.

---

## Prerequisites

- Node 22 LTS, pnpm (already in use for this repo).
- `tsc` strict in PATH (via `pnpm exec tsc`).
- For behavioral probes: an OpenAI-compatible endpoint and its key in the
  environment (no provider SDK required).

```
export MUSTER_API_KEY=<your-key>          # or OPENAI_API_KEY
export MUSTER_BASE_URL=<endpoint-url>     # e.g. http://localhost:11434/v1
export MUSTER_MODEL=<model-name>          # e.g. llama3:7b
```

---

## 1. Build and type-check

```bash
pnpm build
```

Runs `tsc --build` in strict mode.  All heartbeat adapter types must resolve
cleanly.  Exit code 0 = pass.

---

## 2. Full Vitest suite (unit + fixture suites)

```bash
pnpm test
```

Runs every test in the repo, including the heartbeat fixture suite.  All tests
must be green before any WP is considered done.  Relevant test files:

```
tests/heartbeat/lint.test.ts           # static lint unit tests
tests/heartbeat/tick.test.ts           # tick-state model helpers
tests/heartbeat/action-diff.test.ts    # action-diff probe + control
tests/heartbeat/idempotency.test.ts    # idempotency probe + control
tests/heartbeat/quiet-ack.test.ts      # quiet-ack probe + control
```

---

## 3. Static lint — single file

Run the static lint against a specific `HEARTBEAT.md` fixture:

```bash
pnpm exec muster check --adapter heartbeat \
  --file tests/fixtures/heartbeat/checklists/valid-concise.md
```

Expected output (machine-readable JSON): `{ "ok": true, "findings": [] }`

Run against an over-length file to see the token-burn advisory (FR-003, muster
rubric):

```bash
pnpm exec muster check --adapter heartbeat \
  --file tests/fixtures/heartbeat/checklists/over-length.md
```

Expected: a finding with `code: "HB-001"` (or equivalent rubric code) and
`severity: "advisory"`, citing the muster rubric.

---

## 4. Static lint — empty-file-skip check (FR-003, C-003)

The OpenClaw docs specify that an empty or comment-only `HEARTBEAT.md` skips
the run entirely.  Verify both fixtures:

```bash
pnpm exec muster check --adapter heartbeat \
  --file tests/fixtures/heartbeat/checklists/empty.md

pnpm exec muster check --adapter heartbeat \
  --file tests/fixtures/heartbeat/checklists/comment-only.md
```

Both must produce a finding with `code: "HB-SKIP"` (or equivalent), recording
the documented skip semantics and citing the OpenClaw heartbeat docs (pinned
commit SHA).  The finding is informational, not a failure: `ok: true` and the
report notes the tick would not execute.

Verify the boundary condition — a file with a single real instruction must NOT
trigger the skip:

```bash
pnpm exec muster check --adapter heartbeat \
  --file tests/fixtures/heartbeat/checklists/valid-concise.md
```

No `HB-SKIP` finding in output.

---

## 5. Behavioral tick probes (BYOM endpoint required)

All three probes read endpoint coordinates and a supplied tick-state sequence
from the test manifest (FR-011).  Run the full manifest suite:

```bash
pnpm exec muster behavioral --adapter heartbeat \
  --manifest tests/fixtures/heartbeat/manifest.json \
  --base-url "$MUSTER_BASE_URL" \
  --model "$MUSTER_MODEL" \
  --api-key-env MUSTER_API_KEY
```

The manifest covers all three tick states and both interval-config variants.
Exit code 0 when all cases pass at their k-of-n threshold; non-zero when any
case fails.  Check the JSON summary for per-case verdicts.

### 5a. Action-diff probe (FR-004)

```bash
pnpm exec muster behavioral --adapter heartbeat \
  --manifest tests/fixtures/heartbeat/manifest.json \
  --filter state=due \
  --base-url "$MUSTER_BASE_URL" \
  --model "$MUSTER_MODEL" \
  --api-key-env MUSTER_API_KEY
```

Expected: the agent's action set matches the checklist's intended actions (no
missing, no extra) at or above the k-of-n threshold.

### 5b. Idempotency probe (FR-005)

```bash
pnpm exec muster behavioral --adapter heartbeat \
  --manifest tests/fixtures/heartbeat/manifest.json \
  --filter state=repeat \
  --base-url "$MUSTER_BASE_URL" \
  --model "$MUSTER_MODEL" \
  --api-key-env MUSTER_API_KEY
```

Expected: once-only checklist items are not repeated or duplicated on the
repeat tick; recurring items appear as normal.

### 5c. Quiet-ack probe (FR-006)

```bash
pnpm exec muster behavioral --adapter heartbeat \
  --manifest tests/fixtures/heartbeat/manifest.json \
  --filter state=nothing-due \
  --base-url "$MUSTER_BASE_URL" \
  --model "$MUSTER_MODEL" \
  --api-key-env MUSTER_API_KEY
```

Expected: agent replies `HEARTBEAT_OK` with remainder within `ackMaxChars`
(default 300; check cites OpenClaw docs pinned SHA).

---

## 6. Interval-config awareness (FR-007)

Run the suite with the Anthropic OAuth interval config (1h) to verify that
interval-dependent assertions use the configured value, not a hardcoded one
(C-002):

```bash
pnpm exec muster behavioral --adapter heartbeat \
  --manifest tests/fixtures/heartbeat/manifest.json \
  --interval-config tests/fixtures/heartbeat/interval-configs/oauth-1h.json \
  --base-url "$MUSTER_BASE_URL" \
  --model "$MUSTER_MODEL" \
  --api-key-env MUSTER_API_KEY
```

Then run without any interval config to verify the default (30m) is assumed and
recorded (spec edge case):

```bash
pnpm exec muster behavioral --adapter heartbeat \
  --manifest tests/fixtures/heartbeat/manifest.json \
  --base-url "$MUSTER_BASE_URL" \
  --model "$MUSTER_MODEL" \
  --api-key-env MUSTER_API_KEY
```

Expected: report includes `"intervalAssumed": true` and `"intervalMinutes": 30`.

---

## 7. Discrimination controls — confirm graders can fail (FR-009)

Each grader ships a rigged-impossible control case.  These MUST fail as
designed (charter testing standards).  Run them explicitly:

```bash
pnpm exec muster behavioral --adapter heartbeat \
  --manifest tests/fixtures/heartbeat/manifest.json \
  --filter control=true \
  --base-url "$MUSTER_BASE_URL" \
  --model "$MUSTER_MODEL" \
  --api-key-env MUSTER_API_KEY
```

Expected: all three control cases report `passed: false`.  If any control
passes, the grader has a logic error — do not accept the WP.

Alternatively, the unit tests for each grader include a rigged-control test
that does not require a live endpoint:

```bash
pnpm test --reporter verbose tests/heartbeat/action-diff.test.ts
pnpm test --reporter verbose tests/heartbeat/idempotency.test.ts
pnpm test --reporter verbose tests/heartbeat/quiet-ack.test.ts
```

Look for test descriptions containing `"discrimination control"` or
`"rigged-impossible"` and confirm they are green (i.e., the control correctly
fails the grader).

---

## 8. Second endpoint — portability check (SC-006)

Change only the endpoint coordinates and confirm the suite runs identically:

```bash
export MUSTER_BASE_URL=<second-endpoint-url>
export MUSTER_MODEL=<second-model>

pnpm exec muster behavioral --adapter heartbeat \
  --manifest tests/fixtures/heartbeat/manifest.json \
  --base-url "$MUSTER_BASE_URL" \
  --model "$MUSTER_MODEL" \
  --api-key-env MUSTER_API_KEY
```

No fixture changes, no manifest changes.  The harness runs identically against
both endpoints (FR-001, NFR-005).

---

## 9. Coverage (charter quality gate)

```bash
pnpm test:coverage
```

Runs Vitest with `--coverage` and emits `coverage/lcov.info`.  New-code
coverage must be ≥ 80 % for the SonarCloud quality gate to pass (charter
testing standards).  Inspect the console table; lines below the threshold in
new adapter files indicate untested branches that must be covered before merge.
