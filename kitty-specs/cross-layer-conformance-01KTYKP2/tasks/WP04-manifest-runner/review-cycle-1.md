---
affected_files: []
cycle_number: 1
mission_slug: cross-layer-conformance-01KTYKP2
reproduction_command:
reviewed_at: '2026-06-13T19:30:28Z'
reviewer_agent: claude:opus:reviewer:reviewer
verdict: rejected
wp_id: WP04
---

# WP04 review — `muster crosslayer run <manifest> [--static-only]` — REJECT

## Build/test: GREEN
- `pnpm build`: 0 type errors.
- `pnpm test`: 1629 passing, 2 skipped (both pre-existing `skipIf(!MUSTER_BASE_URL)` env-gated, unrelated to this commit). No tests weakened.

## What's correct
- THIN command confirmed. `doCrossLayerRun` (src/cli/index.ts:475) parses args -> `toAbsolute(manifestPath)` -> `runCrossLayerManifest` -> human/`--json` format -> exit-code map. No business logic in the CLI.
- C-001/C-004 intact: `git diff main -- src/core/` is EMPTY. composition/contradiction-lint/rule-survival/manifest-runner .ts unchanged by this commit (diff is only src/cli/index.ts + tests/unit/cli.test.ts, additive).
- Exit-code contract correct: ExecutionError -> 2 (src/cli/index.ts:736-738), `summary.failed > 0` -> 1, else 0.
- Stream discipline correct: machine JSON / human summary on stdout (`io.outLine`); errors on stderr (`io.errLine`). Verified: non-existent manifest -> exit 2, stdout empty, "crosslayer manifest run failed" on stderr.
- No TODO/unwired functionality in the diff.
- CLI test is real (asserts 5/5 static summary, exit 0, JSON shape, findings detail, exit 2 on missing manifest).

## BLOCKER: `--static-only` 5/5 path only works from the project root (WP item #2 and #3 fail)

The WP explicitly requires confirming the static cases report 5/5 "regardless of cwd" by running from a different cwd. They do not.

Reproduce (from the lane-a worktree, post-build):
```
# project root: correct
$ node dist/cli/index.js crosslayer run fixtures/crosslayer/manifest.yaml --static-only
crosslayer: PASS — 5/5 cases passed, 0 failed   # EXIT 0

# from /tmp, ABSOLUTE manifest path: BROKEN
$ (cd /tmp && node <wt>/dist/cli/index.js crosslayer run <wt>/fixtures/crosslayer/manifest.yaml --static-only)
crosslayer: FAIL — 0/5 cases passed, 5 failed   # EXIT 1
  [FAIL] benign-persona-sop: error — ENOENT: ... open '/tmp/fixtures/crosslayer/benign/SOUL.md'
  ... (all 5 cases ENOENT)
```

### Root cause
`toAbsolute` correctly absolutizes the MANIFEST path, and `$ref` case includes DO resolve regardless of cwd (resolved via `dirname(absPath)` in src/crosslayer/manifest-runner.ts:121,134). But the layer FIXTURE paths inside each case are resolved against `process.cwd()`, not the manifest directory:

src/crosslayer/manifest-runner.ts:396-401
```
function resolveLayerPaths(layers: LayerEntry[]): LayerEntry[] {
  return layers.map((layer) => ({
    ...layer,
    fixturePath: pathResolve(layer.fixturePath),   // <-- pathResolve(rel) = cwd-relative
  }));
}
```
`pathResolve` with a single relative arg uses `process.cwd()`. So from any cwd other than the project root the 5 static cases all ENOENT and the command reports 0/5 exit 1 — a shipped CLI run from a user's own cwd produces 5 spurious failures. The new CLI test passes only because vitest runs from the project root, masking the defect.

### Required fix
Resolve layer `fixturePath` relative to the manifest directory (the same `manifestDir` already used for `$ref`), not `process.cwd()`. Thread `manifestDir` into `resolveLayerPaths` (or resolve layer paths at the same point `$ref` paths are resolved). This is an edit to src/crosslayer/manifest-runner.ts — which is in scope for the mission's cross-layer runner. Then add a CLI test that invokes `runManifest`/`runCli` with a process cwd different from the project root (e.g. `process.chdir(tmpdir())` around the call, restored in `finally`, or run via a child process from another cwd) and asserts 5/5 + exit 0, so the regression cannot silently return.

## Secondary observation (not the blocker, but verify on resubmit)
WP item #3 says behavioral cases without an endpoint must be "handled gracefully (no crash)". With the shipped `fixtures/crosslayer/manifest.yaml` (no `endpoint:` block) a full run (no `--static-only`) returns exit 2 with "Manifest validation failed: 'endpoint' is required when behavioral cases are present." That is a fail-fast (mapped to exit 2, no uncaught crash), which is defensible, but confirm it matches the intended "graceful skip vs. validation error" semantics in the spec/charter and that the discrimination story is intact.
