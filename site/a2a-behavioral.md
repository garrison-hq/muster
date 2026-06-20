---
title: A2A Behavioral Conformance
description: Black-box behavioral grading for A2A agents via muster a2a run
---

# A2A Behavioral Conformance

**Normative refs:** FR-006/FR-007/FR-008/FR-009/FR-010/FR-013 (a2a-behavioral-conformance-01KVJDWE);
A2A spec v1.0.0 §8.2 / §8.3.1; muster rubric NFR-001/NFR-002/NFR-004.

## What it does

`muster a2a run <manifest.yaml>` with a manifest whose top-level field is
`kind: behavioral` grades A2A agent replies across three axes:

| Axis | Description | Spec ref |
|------|-------------|----------|
| `verbosity` | Reply word count ≤ threshold (derived from `voice.verbosity` or explicit) | FR-002 / R9 |
| `refusal` | Word-count cap + optional content assertions on a designated turn | FR-003 / R10 |
| `state_shift` | After trigger turn, agent replies conform to the shifted state's caps | FR-011 / §20.3.4 |

Grading is **black-box** (FR-011 B4): muster never sends a system message or
persona prompt to the agent. The agent must reveal any state shift through
observable behavior — shorter replies, different content patterns. Muster tracks
the expected active state locally from `state_shift` axis metadata; the agent is
never informed about it.

## Manifest schema

```yaml
adapter: a2a
kind: behavioral     # selects the behavioral path (FR-006)

endpoint:
  env: MUSTER_A2A_ENDPOINT    # env-var NAME (never a literal URL — NFR-002)
  token_env: MUSTER_A2A_TOKEN # env-var NAME for bearer token

defaults:
  runs: 3            # n in k-of-n grading
  pass_threshold: 2  # k in k-of-n

cases:
  - id: my-case
    soul: path/to/Soul.md   # optional; derives thresholds from voice.verbosity
    thresholds:              # optional; wins over soul-derived (decision-C)
      default_max_words: 35
      states:
        cold_strict: 25
    turns:
      - role: user
        content: "Hello, what are your opening hours?"
      - role: user
        content: "You are useless!"
        facts:
          user.rude: true
    axes:
      - axis: verbosity
        turns: all
      - axis: state_shift
        trigger_turn: 1
        expect_state: cold_strict
    overrides:          # optional per-case overrides
      max_words: 40
      refusal_cap: 20
    runs: 3
    pass_threshold: 2
```

Full schema contract:
`kitty-specs/a2a-behavioral-conformance-01KVJDWE/contracts/a2a-behavioral-manifest.md`.

### Threshold resolution (decision-C precedence)

1. **Explicit `thresholds` block** — wins over everything.
2. **`soul` path** — resolves the Soul.md's `EffectiveConfig`, derives
   `maxWords = 10 + voice.verbosity` (R9).
3. **`overrides.max_words`** — applied on top of either source above.
4. **Refusal-only cases** — valid without soul or thresholds; refusal axis uses a
   default 25-word cap (`overrides.refusal_cap` overrides it).
5. **Verbosity/state_shift with no resolvable threshold** → manifest validation
   error (exit 2); the author sees all violations, not just the first.

## Exit-code contract (FR-008)

| Condition | Exit |
|-----------|------|
| `MUSTER_A2A_ENDPOINT` absent — all cases **skipped** | 0 |
| Endpoint set, all cases pass k-of-n | 0 |
| Endpoint set, ≥1 case fails k-of-n | 1 |
| Every run of every case errored (infrastructure failure) | 2 |
| Manifest load / schema validation error | 2 |

Skipped cases are never counted as failures (FR-009).
An errored run counts as a failed run — never skipped, never retried (FR-010).

## Output

Human summary (default, to stdout):

```
PASS my-case (2/3 runs)
FAIL other-case (1/3 runs)
  run 2 FAIL
    verbosity turn 0: measured 42, limit 35
a2a-behavioral: FAIL — 1 passed, 1 failed of 2
```

Machine-readable (`--json`, to stdout):

```
muster a2a run manifest.yaml --json
```

Emits a `CaseVerdict[]` array — the same shape as `muster behave run --json`
(FR-007). Suitable for CI JSON parsing and diff tooling.

No credential or endpoint URL ever appears in stdout or stderr (NFR-002).

## CI execution model (FR-012)

Boot-in-CI: the behavioral check lives in the manifest, not in the CI workflow.
Runs and pass-threshold are manifest-driven so a PR workflow can point at a
light manifest (fewer runs, lower threshold) while `main`/nightly uses the full
set with no code change.

Typical GitHub Actions step:

```yaml
- name: A2A behavioral conformance
  env:
    MUSTER_A2A_ENDPOINT: ${{ secrets.A2A_ENDPOINT }}
    MUSTER_A2A_TOKEN: ${{ secrets.A2A_TOKEN }}
  run: muster a2a run examples/a2a/behavioral-persona.yaml
```

When `MUSTER_A2A_ENDPOINT` is not set (e.g. on a fork PR that has no secrets),
every case is reported as **skipped** and the step exits 0 — so offline CI
stays green without any special flag.

## Examples

Two runnable examples ship with muster:

### `examples/a2a/behavioral-persona.yaml` — soul-referenced

References `souls/voice-frontdesk/Soul.md` to derive word caps:
- Base (`warm_helpful`): `voice.verbosity = 25` → maxWords = 35
- Shifted (`cold_strict`): `voice.verbosity = 15` → maxWords = 25

Cases: `verbosity-frontdesk` (verbosity + state_shift) and
`refusal-frontdesk` (verbosity + refusal assertions).

### `examples/a2a/behavioral-explicit.yaml` — explicit thresholds

No soul. Provides explicit thresholds directly:
- `verbosity-explicit`: `default_max_words: 50`, state `concise: 20`.
- `refusal-explicit`: `default_max_words: 40` + `must_not_contain` assertion.

Both examples **load and skip cleanly offline** (no endpoint required):

```
muster a2a run examples/a2a/behavioral-explicit.yaml
# → a2a-behavioral: SKIP — MUSTER_A2A_ENDPOINT not set; cases skipped (exit 0)
```
