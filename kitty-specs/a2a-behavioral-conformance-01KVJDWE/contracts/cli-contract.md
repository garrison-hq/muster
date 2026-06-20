# Contract: `muster a2a run` Behavioral Surface

**Mission:** `a2a-behavioral-conformance-01KVJDWE` · **Spec:** FR-006, FR-008, FR-009, FR-010, FR-012.

Behavioral A2A cases are surfaced through the **existing** `muster a2a run <manifest>` command
(no new top-level command). A manifest with `kind: behavioral` selects the behavioral path.

## Invocation

```
muster a2a run <manifest.yaml> [--json]
```

- `--json` emits machine-readable verdicts to stdout (human summary otherwise), matching the
  existing behave/cts convention (machine output to stdout, human to stderr).

## Activation & skip/fail semantics (reused, FR-009/FR-010, D5)

| Condition | Behavior | Exit |
|-----------|----------|------|
| `MUSTER_A2A_ENDPOINT` (manifest `endpoint.env`) **absent** | Behavioral cases **skipped** (reported as skipped, not failed) | 0 |
| Endpoint set, all cases pass k-of-n | Pass | 0 |
| Endpoint set, ≥ 1 case fails k-of-n | Fail; report which axis/turn failed (measured vs limit) | 1 |
| Endpoint set but unreachable / **every run errored** | Fail (infrastructure, distinct from conformance) | 2 |

This mirrors the `behave run` exit contract exactly (FR-008). Static/skill/auth/signed cases
in the same or other manifests are unaffected (NFR-003).

## Output (per case)

- `id`, `passed`, `passCount`/`runs`, and per-axis `AxisGrade { axis, turn, measured, limit, passed }`
  for failing runs — the existing `CaseVerdict`/`RunVerdict`/`AxisGrade` shapes (reused).
- No token or endpoint credential ever appears in output (NFR-002).

## CI gating (FR-012)

Case selection and `runs`/`pass_threshold` are manifest-driven, so a workflow can point at a
light manifest (or fewer runs) on PRs and the full set on `main`/nightly with **no code
change** — the boot-in-CI execution model lives in the workflow, not in muster.
