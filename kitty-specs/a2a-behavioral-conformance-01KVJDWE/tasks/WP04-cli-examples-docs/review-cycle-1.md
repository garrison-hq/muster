# WP04 review — cycle 1: changes requested

The behavior is correct and well tested: build + full suite green (2806 pass / 3
skip), invariants 12/12 (C-004 boundary holds, NI-003 no new fetch site), both
example manifests load+skip offline (exit 0), `--json` emits `[]`/`CaseVerdict[]`
correctly, the static path is byte-unchanged (regression test + manual smoke
confirm), no secret reaches stdout/stderr, examples carry env-var NAMES only, and
docs cite spec sections. The static/skill/auth/signed paths and `invokeSkill` are
untouched. Routing is genuinely additive.

Three issues, all centered on the manifest-`kind` peeking block in `doA2aRun`
(`src/cli/index.ts` ~837-880). They are coupled — fixing #1 resolves all three.

**Issue 1 (blocking): adapter-layer parsing leaked into the CLI layer.**
`doA2aRun` (src/cli/index.ts:837-880) inlines `JSON.parse`, `parseYaml`, and the
`kind`-field type-guarding to route the manifest. That is adapter knowledge
(manifest shape / parse strategy) living in the delivery layer. The code comment
at src/cli/index.ts:839 even says "We read the file inline here since
peekManifestKind is in the adapter" — but no `peekManifestKind` exists anywhere
in `src/` (grep confirms it is only referenced in that comment). So the comment
is misleading and the intended adapter helper was never created.
Fix: add a small `peekManifestKind(absPath): Promise<string | null>` (or
equivalent) to `src/adapters/a2a/` that does the single read + JSON-then-YAML
parse + `kind` extraction, and have the CLI call it. The CLI then only does
`if (kind === "behavioral") return doA2aBehavioralRun(...)`. `src/cli/index.ts`
is already in owned_files; adding a helper to `src/adapters/a2a/index.ts` is also
owned. Keep the static path byte-identical (it already is).

**Issue 2 (blocking): cognitive complexity of `doA2aRun` likely exceeds 15.**
CI runs SonarCloud with `-Dsonar.qualitygate.wait=true` (.github/workflows/ci.yml:71),
and Sonar's default cognitive-complexity threshold is 15. After the WP02/WP03
behavioral routing was folded in, `doA2aRun` now has two nested try/catch blocks
each containing a 4-condition type-guard `if`, plus the `kind === "behavioral"`
branch with its own nested `instanceof` guard, plus the static try/catch and two
trailing ternaries. By hand this estimates to ~16, i.e. over the gate — exactly
the "complexity reduction that didn't actually drop below 15" failure mode. The WP
claims the extraction of `doA2aBehavioralRun` kept it under 15, but the inlined
parse block re-inflated it. I could not run Sonar locally to get the exact number;
per "default to rejecting on uncertainty" and because the gate blocks the merge
target, this must be brought down. Extracting the peek helper (Issue 1) removes
both nested try/catch blocks from `doA2aRun` and drops it well under 15. Please
confirm the post-fix Sonar number (or the local cognitive-complexity count) in the
activity log.

**Issue 3 (non-blocking, fix while here): manifest file is read twice.**
src/cli/index.ts:844 reads the file in the JSON `try`; on JSON-parse failure the
YAML `catch` re-reads the same file at the second `readFile`. Read once, then try
JSON then YAML on the same buffer. The extracted `peekManifestKind` helper (Issue
1) is the natural place to do the single read.

## What is already good (no action needed)
- Exit contract 0/1/2 wired correctly (skip⇒0 via FR-009, exitCode passthrough
  from WP03's runner, allErrored⇒2); static exit logic intact.
- All-errored path is exercised against a real dead endpoint (127.0.0.1:1), so the
  discrimination is genuine, not mocked into passing.
- No `localeCompare`, no new fetch site, no `.skip/.only/.todo`, no weakened tests,
  only owned_files touched.

## Re-review checklist for cycle 2
1. `kind` peeking moved behind an adapter helper; CLI no longer parses JSON/YAML
   inline; the misleading `peekManifestKind` comment is resolved (helper now real).
2. Sonar quality gate passes / `doA2aRun` cognitive complexity < 15 (state the
   number).
3. Single file read on the routing path.
4. `pnpm build` + `pnpm test` green; static-path regression test still asserts
   byte-identical behavior; examples still skip offline with exit 0.
