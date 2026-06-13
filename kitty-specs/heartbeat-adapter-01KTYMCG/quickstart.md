# Quickstart: Local Verification — Schedule (HEARTBEAT.md) Conformance Adapter

**Mission**: `heartbeat-adapter-01KTYMCG`
**Date**: 2026-06-13
**Spec**: `kitty-specs/heartbeat-adapter-01KTYMCG/spec.md`

This guide covers everything needed to verify the Schedule adapter locally: a
full build, the static lint path (including the empty-file-skip check), the
behavioral tick probes against a BYOM endpoint, the discrimination controls, and
coverage.

> The CLI surface is two commands: `muster check --adapter heartbeat <file>`
> (static lint of one `HEARTBEAT.md`) and `muster heartbeat run <manifest>`
> (the behavioral + static manifest suite). Examples below invoke the built CLI
> directly as `node dist/cli/index.js ...`; if the `muster` bin is on PATH you
> can substitute `muster ...`.

---

## Prerequisites

- Node 22 LTS, pnpm (already in use for this repo).
- `tsc` strict in PATH (via `pnpm exec tsc`).
- For behavioral probes: an OpenAI-compatible endpoint and its key in the
  environment (no provider SDK required). The manifest runner reads these from
  the environment:

```
export MUSTER_API_KEY=<your-key>             # or OPENAI_API_KEY
export MUSTER_ENDPOINT=<endpoint-url>        # e.g. https://api.openai.com/v1
export MUSTER_MODEL=<model-name>             # e.g. gpt-4o-mini
```

(Node 22 can load a gitignored `.env` directly: `node --env-file=.env dist/cli/index.js ...`.)

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
tests/heartbeat/tick.test.ts           # tick-state model helpers + framing
tests/heartbeat/action-diff.test.ts    # action-diff probe + control
tests/heartbeat/idempotency.test.ts    # idempotency probe + control
tests/heartbeat/quiet-ack.test.ts      # quiet-ack probe + control
tests/heartbeat/fixture-suite.test.ts  # manifest runner + wired behavioral path
```

---

## 3. Static lint — single file

Run the static lint against a specific `HEARTBEAT.md` fixture (the path is a
positional argument):

```bash
node dist/cli/index.js check --adapter heartbeat \
  tests/fixtures/heartbeat/checklists/valid-concise.md
```

Expected output (machine-readable JSON): `{ "ok": true, "isEmpty": false, "findings": [] }`, exit code 0.

Run against an over-length file to see the token-burn advisory (muster rubric):

```bash
node dist/cli/index.js check --adapter heartbeat \
  tests/fixtures/heartbeat/checklists/over-length.md
```

Expected: a finding with `rule: "heartbeat/length-advisory"`, `severity:
"advisory"`, citing the muster rubric, and exit code 1.

---

## 4. Static lint — empty-file-skip check (C-003)

The OpenClaw docs specify that an empty or comment-only `HEARTBEAT.md` skips
the run entirely.  Verify both fixtures:

```bash
node dist/cli/index.js check --adapter heartbeat \
  tests/fixtures/heartbeat/checklists/empty.md

node dist/cli/index.js check --adapter heartbeat \
  tests/fixtures/heartbeat/checklists/comment-only.md
```

Both report `isEmpty: true` with a `heartbeat/empty-file-skip` finding citing
the OpenClaw heartbeat docs (pinned commit SHA).  The finding is informational,
not a failure: `ok: true`, exit code 0.

---

## 5. Behavioral tick probes (BYOM endpoint required)

All cases are declared in the test manifest (FR-011); the runner reads endpoint
coordinates from `MUSTER_ENDPOINT` / `MUSTER_MODEL` / `MUSTER_API_KEY`. Run the
full suite:

```bash
MUSTER_ENDPOINT=https://api.openai.com/v1 MUSTER_MODEL=gpt-4o-mini \
  node --env-file=.env dist/cli/index.js heartbeat run \
  tests/fixtures/heartbeat/manifest.json
```

The manifest covers the static-lint and interval-config cases plus the three
behavioral tick probes (action-diff on a due tick, idempotency on a repeat tick,
quiet-ack on a nothing-due tick). The summary prints a per-case `PASS` / `FAIL`
/ `SKIP` line; add `--json` for the machine-readable `ManifestSummary`. Exit
code 0 when no case fails, 1 when any case fails, 2 on an execution error.

When `MUSTER_ENDPOINT` is unset the behavioral cases skip gracefully (with a
`MUSTER_ENDPOINT not set` reason) and the static/config cases still run — useful
for a CI lane without an endpoint:

```bash
node dist/cli/index.js heartbeat run tests/fixtures/heartbeat/manifest.json
```

Per-case expectations (all driven through the one manifest run above):
- **action-diff (FR-004)** — on the due tick the agent emits one `ACTION: <label>`
  line per checklist item it acts on; the grader matches that set against the
  manifest's `intendedActions` (no missing, no extra) at the k-of-n threshold.
- **idempotency (FR-005)** — on the repeat tick, once-only items are not repeated.
- **quiet-ack (FR-006)** — on the nothing-due tick the agent replies `HEARTBEAT_OK`
  within `ackMaxChars` (default 300; cites the OpenClaw docs pinned SHA).

---

## 6. Interval-config awareness (FR-007)

Interval configs are declared per case in the manifest (`intervalConfig` →
`default-30m.json`, `oauth-1h.json`, or absent). The `hb-config-001` case in
`manifest.json` exercises the absent-config path and the report records
`"assumed": true` with `"intervalMinutes": 30`; the `oauth-1h` fixture exercises
the configured 1h value. These run as part of the suite in section 5 — no
separate flag is needed (interval-dependent assertions read the configured
value, never a hardcoded one, per C-002).

---

## 7. Discrimination controls — confirm graders can fail (FR-009)

Each grader (action-diff, idempotency, quiet-ack) ships a rigged-impossible
control that MUST fail as designed (charter testing standard). These are
asserted by the unit tests and do not require a live endpoint:

```bash
pnpm test tests/heartbeat/action-diff.test.ts
pnpm test tests/heartbeat/idempotency.test.ts
pnpm test tests/heartbeat/quiet-ack.test.ts
```

Look for test descriptions containing `"discrimination control"` /
`"rigged"` and confirm they are green (i.e. the control correctly fails the
grader). If any control would pass, the grader has a logic error — do not accept
the WP.

---

## 8. Second endpoint — portability check (SC-006)

Change only the endpoint coordinates and confirm the suite runs identically — no
fixture or manifest changes:

```bash
MUSTER_ENDPOINT=<second-endpoint-url> MUSTER_MODEL=<second-model> \
  node --env-file=.env dist/cli/index.js heartbeat run \
  tests/fixtures/heartbeat/manifest.json
```

The harness runs identically against both endpoints (FR-001, NFR-005).

---

## 9. Coverage (charter quality gate)

```bash
pnpm test:coverage
```

New-code coverage on `src/adapters/heartbeat/**` must be ≥ 80%.
