# Quickstart: Skills Adapter Local Verification

**Mission**: `skills-adapter-01KTYKNX` | **Date**: 2026-06-13

All commands run from the repository root. Requires Node 22 + pnpm.

---

## 1. Build and run all tests

```sh
pnpm build && pnpm test
```

`pnpm build` runs `tsc --noEmit` (strict). `pnpm test` runs the full Vitest
suite including the skills fixture suite. Both must exit `0` before any PR
merge (charter quality gate).

---

## 2. Run the static check against a skill fixture

```sh
# Check a minimal valid skill (expect: ok: true, zero errors)
node dist/cli/index.js check \
  --adapter skills \
  fixtures/skills/valid/minimal

# Check a broken skill (name longer than 64 chars; expect: ok: false, error on `name`)
node dist/cli/index.js check \
  --adapter skills \
  fixtures/skills/broken/name-too-long

# Check with the optional Anthropic platform profile
node dist/cli/index.js check \
  --adapter skills \
  --profile anthropic \
  fixtures/skills/broken/anthropic-reserved-word
```

The report is printed to stdout as JSON in muster's `ConformanceReport` format.
Each violation includes a `section` field citing the agentskills.io clause
pinned to a commit SHA, or the Anthropic docs URL for Anthropic-profile checks.

To check your own skill directory:

```sh
node dist/cli/index.js check --adapter skills /path/to/your-skill-dir
```

---

## 3. Run the trigger suite against a BYOM endpoint

The behavioral trigger suite requires a running OpenAI-compatible endpoint
and a model that supports tool/function calling. Set the endpoint coordinates
in the environment before running:

```sh
# Using an OpenAI key (or any OpenAI-compatible hosted endpoint)
export OPENAI_API_KEY=sk-...
export MUSTER_MODEL=gpt-4o-mini
export MUSTER_BASE_URL=https://api.openai.com/v1

# Or using a local endpoint (e.g. llama.cpp server, Ollama with tool support)
# Leave MUSTER_API_KEY / OPENAI_API_KEY unset for unauthenticated local endpoints
export MUSTER_MODEL=llama3.2:3b
export MUSTER_BASE_URL=http://localhost:11434/v1

# Run the trigger cases from the skills manifest
node dist/cli/index.js behavioral \
  --adapter skills \
  --manifest fixtures/skills/skills-manifest.yaml \
  --base-url "$MUSTER_BASE_URL" \
  --model "$MUSTER_MODEL"
```

Environment variable precedence: `MUSTER_API_KEY` is checked first;
`OPENAI_API_KEY` is the fallback. Neither variable is required for
unauthenticated local endpoints.

The suite runs all behavioral cases in `skills-manifest.yaml` sequentially
(rate-kind to local models) and prints a pass/fail summary. An errored run
(endpoint unreachable, malformed tool response, timeout) counts as a
non-trigger; the remaining cases still run.

To run only a specific case by id:

```sh
node dist/cli/index.js behavioral \
  --adapter skills \
  --manifest fixtures/skills/skills-manifest.yaml \
  --base-url "$MUSTER_BASE_URL" \
  --model "$MUSTER_MODEL" \
  --case weather-skill-should-trigger
```

---

## 4. Byte-stability check for the static path

The static path must produce identical bytes across repeated runs and machines
(NFR-001). The fixture suite asserts this automatically, but you can verify
manually:

```sh
node dist/cli/index.js check \
  --adapter skills \
  fixtures/skills/valid/full-optional \
  > /tmp/run1.json

node dist/cli/index.js check \
  --adapter skills \
  fixtures/skills/valid/full-optional \
  > /tmp/run2.json

diff /tmp/run1.json /tmp/run2.json
# No output = byte-identical. Any diff is a bug.
```

To verify across a full manifest run:

```sh
node dist/cli/index.js suite \
  --adapter skills \
  --manifest fixtures/skills/skills-manifest.yaml \
  --static-only \
  > /tmp/suite-run1.json

node dist/cli/index.js suite \
  --adapter skills \
  --manifest fixtures/skills/skills-manifest.yaml \
  --static-only \
  > /tmp/suite-run2.json

diff /tmp/suite-run1.json /tmp/suite-run2.json
```

---

## 5. Coverage check (≥ 80% new-code per charter)

```sh
pnpm test:coverage
```

This runs `vitest run --coverage` and emits `coverage/lcov.info`. In CI,
SonarCloud reads this file and enforces the ≥ 80% new-code gate as a blocking
PR check. Locally, inspect `coverage/index.html` for a line-by-line breakdown:

```sh
pnpm test:coverage && open coverage/index.html   # macOS
pnpm test:coverage && xdg-open coverage/index.html  # Linux
```

The 80% threshold applies to **new code only** — there is no whole-project
floor (charter). All new files under `src/adapters/skills/` and their
corresponding test files under `tests/` are in scope.
