---
work_package_id: WP06
title: CTS Manifest & Runner
dependencies:
- WP05
requirement_refs:
- FR-014
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T021
- T022
- T023
agent: "claude"
shell_pid: "1178042"
history:
- timestamp: '2026-06-10T20:21:16Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: src/core/cts/
execution_mode: code_change
owned_files:
- src/core/cts/manifest.ts
- src/core/cts/runner.ts
- tests/unit/cts-runner.test.ts
tags: []
---

# WP06 — CTS Manifest & Runner

## Objective

The Appendix F machinery: load and validate `cts/manifest.yaml` (F.1 fields + the `expect_effective_json` extension from R8), execute each case through the WP05 pipeline, and compare outcomes — including byte-for-byte canonical-JSON comparison of effective configs (F.2, the CTS-1-normative path).

## Context

- Contract: `contracts/cts-manifest.md` — field semantics and runner pass/fail rules are specified there; implement them exactly.
- Normative: Appendix F.1/F.2; §25.1 report comparison.
- FR-014. Consumed by WP08's suite gate and WP10's `cts run`.
- Spec-agnostic: the runner takes a `SpecAdapter` parameter; nothing RFC-1-specific in this directory.

## Implementation command

```bash
spec-kitty agent action implement WP06 --agent <name>
```

## Subtasks

### T021 — Manifest loader (`src/core/cts/manifest.ts`)

**Steps**:
1. Export `loadManifest(path): Promise<CtsCase[] | Violation[]>` — YAML list (plain `yaml` parse is fine here; manifests are ours, not Soul-YAML).
2. Validate each entry per data-model: `id` (unique across manifest), `root` (string), `mode` ∈ {strict, permissive}, `expect_ok` (boolean) required; `profile`, `state`, `expect_effective_yaml`, `expect_effective_json`, `expect_errors` optional. Both expect_effective keys present → manifest error ("declare one comparison form").
3. Resolve `root` and expectation paths relative to the manifest's directory; store absolute.

**Validation**:
- [ ] duplicate ids → error naming both
- [ ] unknown field → error (manifests are ours; strict always)

### T022 — Runner (`src/core/cts/runner.ts`)

**Steps**:
1. Export `runCts(adapter, cases, opts?: {filter?: (id) => boolean}): Promise<CtsCaseResult[]>`.
2. Per case (independent; one case's crash → that case fails with the exception message, suite continues):
   - read root file, run `checkSoul` with the case's mode/profile/state and the fs loadRef;
   - `passed` starts as `report.ok === expect_ok`;
   - `expect_errors`: each `{path, message}` must match ≥1 actual error — `path` exact string equality, `message` case-sensitive substring (contract). Unmatched expectation → mismatch "expected error at <path> matching \"<msg>\" not found";
   - `expect_effective_json`: read file bytes, compare against `canonicalJson(effective)` — on difference, record first differing byte offset and a ±40-char context window from both sides (debuggability, SC-007);
   - `expect_effective_yaml`: YAML-load the file, `canonicalJson` both, byte-compare (R8 fidelity path);
   - effective comparison only when `expect_ok: true` and effective non-null; expected-effective on an expect_ok:false case → mismatch (manifest authoring error).
3. **Discrimination rule** (SC-002/SC-006): `expect_ok: false` with an actually-ok report is a FAILURE — assert symmetric.
4. Aggregate helper `summarize(results): {total, passed, failed}`.

**Validation**:
- [ ] all four mismatch classes produce human-readable `mismatches` entries

### T023 — Runner tests (`tests/unit/cts-runner.test.ts`)

Use tmp-dir fixtures written inline by the test (no dependence on WP07/08 fixture content):
- [ ] passing case (expect_ok true, matching expected.json)
- [ ] expected-error matching: path exact + message substring; near-miss path → mismatch
- [ ] byte-difference report includes offset and context
- [ ] expect_ok:false but document valid → case FAILS ("Appendix F discrimination")
- [ ] one case throwing (unreadable root) doesn't stop the suite
- [ ] filter option runs subset only

## Definition of Done

- Tests green; runner is adapter-parameterized (compiles with a mock adapter in tests — proves spec-agnosticism).
- Mismatch messages reviewed for usefulness: a fixture author can act on them without reading runner source.

## Reviewer guidance

- F.2's normative claim is byte-for-byte canonical JSON — confirm the comparison is on raw bytes/strings, not deep-equal of parsed objects (deep-equal would mask number-formatting drift).
- Confirm the expected.json file is read as bytes and NOT re-canonicalized (the fixture file itself must already be canonical; re-canonicalizing would hide malformed fixtures — WP07/08 authors rely on this honesty).

## Risks

- Relative-path resolution differs between manifest location and process cwd — all resolution anchors to the manifest's directory (T021 step 3); tests must run from a different cwd to prove it.

## Activity Log

- 2026-06-10T22:25:40Z – claude – shell_pid=1149926 – Started implementation via action command
- 2026-06-10T22:31:17Z – claude – shell_pid=1149926 – Ready for review: Appendix F.1 manifest loader (strict, manifest-dir path anchoring) + F.2 byte-for-byte canonical-JSON runner with symmetric discrimination; 16 mock-adapter tests, full suite 346 green
- 2026-06-10T22:31:55Z – claude – shell_pid=1178042 – Started review via action command
- 2026-06-10T22:33:50Z – claude – shell_pid=1178042 – Review passed: ran build+test myself (346 green, type-clean); F.1 field set + R8 extension exact; F.2 raw-byte canonical-JSON comparison verified non-re-canonicalizing with offset+context diagnostics; symmetric discrimination tested; manifest-dir path anchoring proven from foreign cwd; core imports no adapters
