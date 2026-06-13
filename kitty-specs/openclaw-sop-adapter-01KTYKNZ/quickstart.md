# Quickstart: OpenClaw SOP (AGENTS.md) Conformance Adapter

**Mission**: `openclaw-sop-adapter-01KTYKNZ`
**Date**: 2026-06-13

Local verification steps after landing the WPs. All commands run from the repo
root. The static lint path is fully offline; behavioral steps require a
BYOM endpoint.

---

## 0. Prerequisites

```bash
# Node 22 LTS + pnpm
node --version   # expect v22.x
pnpm --version   # expect 9.x or later

# Build the project
pnpm install
pnpm build        # tsc strict — must exit 0 with no errors
```

---

## 1. Type-check and unit tests

```bash
pnpm build        # tsc strict — all new code in src/adapters/openclaw-sop/ included
pnpm test         # full Vitest suite: CTS fixture suite + SOP fixture suite + existing suites
```

Expected output: all test files green, including:
- `tests/adapters/openclaw-sop/manifest.test.ts`
- `tests/adapters/openclaw-sop/graders.test.ts`
- `tests/adapters/openclaw-sop/probes.test.ts`

The static lint fixture suite must complete in under 10 seconds (NFR-003).

---

## 2. Run static lint on a fixture SOP

No endpoint required — fully offline (NFR-001).

```bash
# Well-formed SOP: expect ok: true, zero findings
pnpm muster lint --adapter openclaw-sop \
  --sop tests/adapters/openclaw-sop/fixtures/agents-wellformed.md \
  --manifest tests/adapters/openclaw-sop/fixtures/rule-manifest-valid.yaml

# SOP with contradictory rules, no precedence: expect UNDEFINED_PRECEDENCE finding
pnpm muster lint --adapter openclaw-sop \
  --sop tests/adapters/openclaw-sop/fixtures/agents-undefined-precedence.md \
  --manifest tests/adapters/openclaw-sop/fixtures/rule-manifest-valid.yaml

# SOP referencing a tool not in the companion env: expect TOOL_DRIFT finding
pnpm muster lint --adapter openclaw-sop \
  --sop tests/adapters/openclaw-sop/fixtures/agents-tool-drift.md \
  --manifest tests/adapters/openclaw-sop/fixtures/rule-manifest-valid.yaml
```

The output for the second command must include a finding similar to:

```json
{
  "kind": "UNDEFINED_PRECEDENCE",
  "location": "rule:<ruleId-A> vs rule:<ruleId-B>",
  "message": "Contradictory rules with no stated precedence ...",
  "source": "docs/rubric/sop-rule-taxonomy.md",
  "severity": "warning"
}
```

Byte-stable verification: run the lint command twice on the same fixture and
diff the output — it must be identical (NFR-001).

```bash
pnpm muster lint --adapter openclaw-sop \
  --sop tests/adapters/openclaw-sop/fixtures/agents-wellformed.md \
  --manifest tests/adapters/openclaw-sop/fixtures/rule-manifest-valid.yaml \
  --output /tmp/lint-run1.json

pnpm muster lint --adapter openclaw-sop \
  --sop tests/adapters/openclaw-sop/fixtures/agents-wellformed.md \
  --manifest tests/adapters/openclaw-sop/fixtures/rule-manifest-valid.yaml \
  --output /tmp/lint-run2.json

diff /tmp/lint-run1.json /tmp/lint-run2.json   # must print nothing
```

---

## 3. Run compliance behavioral suite (BYOM endpoint)

Set your endpoint credentials in the environment. The adapter uses
`MUSTER_API_KEY` or `OPENAI_API_KEY`; no credentials go in the repo (NFR-005).

```bash
export MUSTER_API_KEY=<your-key>   # or OPENAI_API_KEY

# Run the compliance fixture suite (binary + judge probes, no adversarial)
pnpm muster behave --adapter openclaw-sop \
  --manifest tests/adapters/openclaw-sop/fixtures/rule-manifest-valid.yaml \
  --sop tests/adapters/openclaw-sop/fixtures/agents-wellformed.md \
  --suite compliance \
  --base-url http://localhost:11434/v1 \
  --model llama3   # replace with your model name
```

Expected output: a per-probe verdict table. Compliant scenarios pass; the
intentionally-violating fixture scenarios (`scenario-violating-*.yaml`) are run
as discrimination controls and must return `passed: false`.

---

## 4. Confirm pass^k behavior

pass^k is enforced for safety-critical rules (injection resistance,
non-leakage, never-call-tool, scope) — a single failed or errored run across k
attempts fails the case (FR-007).

Use the intentionally-violating fixture to observe the behavior:

```bash
pnpm muster behave --adapter openclaw-sop \
  --manifest tests/adapters/openclaw-sop/fixtures/rule-manifest-valid.yaml \
  --sop tests/adapters/openclaw-sop/fixtures/agents-wellformed.md \
  --probe scenario-violating-tool \
  --base-url http://localhost:11434/v1 \
  --model llama3
```

The output must show `passed: false` with `anyRunFailed: true` and the
individual run that failed — proving the pass^k aggregator fired.

For an errored-run scenario (endpoint unreachable mid-suite), the adapter marks
that run as `passed: false` with an `error` field; the remaining cases still
run (spec acceptance scenario 12).

---

## 5. Run adversarial behavioral suite (BYOM endpoint)

```bash
pnpm muster behave --adapter openclaw-sop \
  --manifest tests/adapters/openclaw-sop/fixtures/rule-manifest-valid.yaml \
  --sop tests/adapters/openclaw-sop/fixtures/agents-wellformed.md \
  --suite adversarial \
  --base-url http://localhost:11434/v1 \
  --model llama3
```

The adversarial suite loads injection/scope-escape probes from the vendored
corpora (`vendored/openclaw-sop/`). Each probe asserts the targeted SOP rule
holds under the hostile payload; all probes use pass^k aggregation.

**BYOM endpoint swap** (spec acceptance scenario 10): rerun the command above
changing only `--base-url` and `--model` — the same rule manifest, the same
SOP, and the same probe set run against a second endpoint with no code changes.

---

## 6. License-verify a vendored corpus

Each corpus under `vendored/openclaw-sop/` must have a `LICENSE` file and a
`CITATION.md`. The corpus loader errors at load time if either is absent (C-003).

Manual inspection:

```bash
# Verify LICENSE files are present for all four corpora
for corpus in injecagent agentdojo gandalf deepset; do
  ls -la vendored/openclaw-sop/$corpus/LICENSE
  head -5 vendored/openclaw-sop/$corpus/CITATION.md
done
```

Programmatic check via the probe loader (throws on missing LICENSE):

```bash
pnpm muster verify-corpus --corpus vendored/openclaw-sop/injecagent
pnpm muster verify-corpus --corpus vendored/openclaw-sop/agentdojo
pnpm muster verify-corpus --corpus vendored/openclaw-sop/gandalf
pnpm muster verify-corpus --corpus vendored/openclaw-sop/deepset
```

Each command exits 0 with a license summary line:
`injecagent: MIT (1054 entries, SHA: <commit>)`

---

## 7. Coverage gate

```bash
pnpm test:coverage
```

This runs `vitest run --coverage` and emits `coverage/lcov.info`. The SonarCloud
quality gate enforces ≥80% coverage on changed code (charter). Inspect the local
summary:

```bash
# Coverage summary for new adapter files only
grep -E "^SF:src/adapters/openclaw-sop" coverage/lcov.info | head -20
```

All files under `src/adapters/openclaw-sop/` must exceed 80% line coverage.
Files under `vendored/` are excluded from coverage (configured in
`sonar-project.properties`).

---

## 8. CI quality gates (reference)

The full gate that must pass on every PR (charter, plan.md Charter Check table):

```bash
pnpm build       # tsc strict
pnpm test        # full Vitest suite green
pnpm test:coverage  # ≥80% new-code coverage (enforced by SonarCloud in CI)
```

SonarCloud analysis runs as a separate CI job (`sonar` job in
`.github/workflows/ci.yml`) and is a blocking PR check. The gate is not
enforced locally — it runs on the PR branch in GitHub Actions.
