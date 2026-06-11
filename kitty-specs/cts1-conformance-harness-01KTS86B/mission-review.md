# Mission Review Report: cts1-conformance-harness-01KTS86B

**Reviewer**: Claude (spec-kitty-mission-review, post-merge adversarial audit)
**Date**: 2026-06-11
**Mission**: `cts1-conformance-harness-01KTS86B` — Soul.md CTS-1 Conformance Harness (muster), mission_number 1
**Baseline commit**: `1a139dc` (main immediately before squash merge)
**HEAD at review**: `7caf5d7` (squash merge of mission)
**WPs reviewed**: WP01–WP11 (all `done`; event log: 1 rejection cycle total — WP01 `for_review → in_progress`, "Re-implementing after review feedback", resolved cleanly; zero forced approvals, zero arbiter overrides)
**Diff magnitude**: 101 files, +13,855 / −1

---

## FR Coverage Matrix

Tests cite RFC-1 sections rather than FR ids (charter directive 3), so trace is by behavior, verified at three layers: unit tests, the 28-case CTS suite, and the workflow's live-execution verifications.

| FR | Description (brief) | WP | Verification | Adequacy | Finding |
|----|---------------------|----|--------------|----------|---------|
| FR-001 | Front-matter extraction §3.1.1 | WP02 | `tests/unit/frontmatter.test.ts`; live: real /tmp files refused/parsed | ADEQUATE | — |
| FR-002 | Soul-YAML forbidden features §4.2, never expanded | WP02 | `tests/unit/soul-yaml.test.ts` incl. 1000-char-alias no-expansion regression; `toJS()` confirmed reachable only after a clean AST walk (`soul-yaml.ts:153`) | ADEQUATE | — |
| FR-003 | Appendix E schema validation | WP03 | `tests/unit/keyspace.test.ts`; schema vendored byte-faithful | ADEQUATE | — |
| FR-004 | §25 keyspace by mode | WP03 | unit + CTS `minimal` strict/permissive twins; known-optional `memory:{}` accepted both modes | ADEQUATE | — |
| FR-005 | percent/float01/enum/BCP-47 | WP03 | unit + CTS `bad_types` fixture (verbosity 142, en_US) | ADEQUATE | — |
| FR-006 | §7.5 order + Standard Merge | WP01+WP04 | `merge.test.ts` (§8.1 examples verbatim), `resolve.test.ts` layer-peel tests, CTS `merge/*` 5 fixtures with byte-exact expected.json | ADEQUATE | — |
| FR-007 | Root-owned stripping | WP04 | CTS `composition_strip_root_owned`; live verify proved no trace of mixin profile "evil" | ADEQUATE | — |
| FR-008 | Cycle detection | WP04 | CTS `composition_cycle`; live verify on real cycle pair | ADEQUATE | — |
| FR-009 | Profile rules §9 | WP03 | CTS `profiles_missing_default`, `profiles_override_not_subset` | ADEQUATE | — |
| FR-010 | State semantics §20 incl. UTF-8 fallback | WP04 | `state.test.ts` (é/z byte-order test), CTS `state_*` 5 fixtures | ADEQUATE | — |
| FR-011 | §21.1 rule references | WP04 | wired into resolution (`resolve.ts:344`); CTS `evaluation_*` incl. trailing-whitespace mismatch | ADEQUATE | — |
| FR-012 | §25.1 report | WP05 | report Ajv-validated against `contracts/conformance-report.schema.json` in tests AND live via piped CLI output | ADEQUATE | — |
| FR-013 | RFC 8785 canonical JSON output | WP01+WP10 | RFC 8785 vector tests; live: `resolve --output-format canonical-json` twice → identical sha256 | ADEQUATE | — |
| FR-014 | Manifest-driven CTS runner | WP06+WP08 | `cts-runner.test.ts` (incl. discrimination: expect_ok flip → FAIL), 28/28 suite | ADEQUATE | — |
| FR-015 | Fixture set, six categories + voice soul | WP07+WP08+WP11 | manifest header maps all nine §25.2 categories; each has ≥1 valid + ≥1 broken case | ADEQUATE | — |
| FR-016 | Turn-list in, transcript out, multi-turn | WP09 | `runner.test.ts`; live: 3-turn rude-shift case on two providers | ADEQUATE | — |
| FR-017 | BYOM OpenAI-compatible, no hardcoded provider | WP09 | deps = exactly `ajv, commander, yaml` (no SDK); live: NIM + OpenAI through identical `makeClient` code | ADEQUATE | — |
| FR-018 | Verbosity axis, adapter mapping + override | WP09 | `graders.test.ts` boundary tests; `thresholds.ts:28` `10 + verbosity` | ADEQUATE | — |
| FR-019 | Refusal cap + assertions | WP09 | `thresholds.ts:35` cap 25; live refusal case passed both providers | ADEQUATE | — |
| FR-020 | Content assertions (regex) | WP09 | price-figure regex live-caught in behavioral manifest | ADEQUATE | — |
| FR-021 | State-shift axis, shifted thresholds | WP09 | `runner.ts:189` `shiftedEffective`, per-turn `activeState`; turn-0-vs-turn-1 grading test | ADEQUATE | — |
| FR-022 | k-of-n, errored=failed | WP09 | `runner.ts:432–484` (`passCount >= pass_threshold`); defaults 3/2 (`manifest.ts:131`); split-verdict + errored-run tests | ADEQUATE | — |
| FR-023 | Full transcript recording | WP09+WP10 | live `--json` outputs inspected: model, baseUrl, temperature ("default"), per-entry activeState, word counts | ADEQUATE | — |
| FR-024 | Mode per run / per case | WP05+WP10 | CLI `--mode` default strict (`cli/index.ts:345`); per-case `mode` in CTS manifest with permissive twins | ADEQUATE | — |

No PARTIAL, MISSING, or FALSE_POSITIVE entries. Synthetic-fixture-trap check: CTS suite tests read the same `cts/manifest.yaml` + fixture files production users consume; behavioral tests stub only the network client while exercising production manifest/runner/grader code paths.

**NFRs**: NFR-001 determinism (suite guard + live sha256) PASS · NFR-002 <10 s (suite ≈2 s) PASS · NFR-003 offline (NI-003 grep-verified: only `fetch(` lives in `client.ts`) PASS · **NFR-004 (<15 min vs local 7B) NOT VERIFIED** — see DRIFT-1 · NFR-005 path+message hygiene (tested) PASS · NFR-006 fixture portability (manifest-relative resolution, tested from foreign cwd) PASS.

---

## Drift Findings

### DRIFT-1: Local-Ollama half of locked constraint C-008 not executed

**Type**: NFR-MISS / LOCKED-DECISION (partial, documented deferral)
**Severity**: MEDIUM (non-blocking — documented known issue)
**Spec reference**: spec.md C-008 ("local GPU-served Ollama model `qwen2.5:7b-instruct` AND at least one hosted endpoint"), NFR-004
**Evidence**: `behave/results/` contains NIM and OpenAI runs only; `behave/results/README.md` records "connection refused; no Ollama service running" with the exact reproduction command. `curl http://localhost:11434/v1/models` → exit 7 at review time.
**Analysis**: SC-005's two-endpoint requirement was met by substituting OpenAI as the second endpoint — architecturally equivalent and arguably a stronger BYOM proof (two independent hosts). But C-008 names the local Ollama target explicitly, and NFR-004's wall-clock threshold is defined against a local 7B model, so neither is fully discharged. The deferral is environment-caused (NVIDIA driver awaiting reboot/MOK enrollment), documented in-repo with a reproduction command, and was surfaced to the project owner before acceptance. Non-blocking; must be closed by running the documented command post-reboot.

### DRIFT-2: §7.2 reference-scheme documentation MUST not satisfied

**Type**: PUNTED-FR (documentation requirement)
**Severity**: LOW
**Spec reference**: RFC-1 §7.2 "Runtimes MUST document which reference schemes they support"; mission spec.md Assumptions ("URI schemes are documented as unsupported in this pass")
**Evidence**: `grep -ain "scheme|URI|relative path" README.md` → no hits documenting reference support. Implementation (`src/core/pipeline.ts:239–256`) supports relative paths (anchored to `dirname(fromPath)`) and absolute paths; URI refs fall through to a file-read attempt.
**Analysis**: The code's behavior is spec-permitted, but the spec makes the *documentation* itself normative, and the mission spec explicitly promised it. One README paragraph closes this. No code change required.

---

## Risk Findings

### RISK-1: Unrestricted reference resolution = arbitrary file read for untrusted souls

**Type**: BOUNDARY-CONDITION / security-adjacent
**Severity**: MEDIUM (for a future service context; LOW for current local-CLI usage)
**Location**: `src/core/pipeline.ts:241` — `isAbsolute(ref) ? ref : resolvePath(dirname(fromPath), ref)`
**Trigger condition**: checking a soul file from an untrusted source whose `composition.extends` contains `../../..`-style or absolute paths.
**Analysis**: A hostile SOUL.md can direct muster to read any file the user can read. The content is then parsed as a soul — almost always failing — but YAML parse-error messages can echo fragments of the target file into the conformance report (information disclosure). RFC-1 §7.2 explicitly permits relative and absolute references (runtime-defined), so this is conformant behavior, and no test or spec clause anticipated hostile inputs. Recommendation for a follow-up: a `--restrict-refs <base-dir>` containment option plus a trust-model paragraph in the README (pairs naturally with DRIFT-2's fix). Becomes important the moment muster runs server-side (e.g., behind the voice-frontdesk pipeline).

### RISK-2: URI references degrade to a confusing file-read error

**Type**: ERROR-PATH
**Severity**: LOW
**Location**: `src/core/pipeline.ts:239–256`
**Trigger condition**: `extends: ["https://example.org/base.md"]`
**Analysis**: `https://...` is not `isAbsolute`, so it resolves to `<souldir>/https:/example.org/base.md` and fails with `cannot read referenced document ... ENOENT`. Correct refusal, but the message misdiagnoses (path error rather than "URI schemes unsupported"). A scheme-sniff (`/^[a-z][a-z0-9+.-]*:\/\//i`) producing a purposeful violation would make the error honest. Cosmetic; behavior is safe.

### RISK-3 (operational note): `§` characters defeat naive grep

**Type**: CROSS-WP-INTEGRATION (tooling)
**Severity**: LOW
**Location**: all source files containing RFC-1 section citations (`file` identifies them as `data`)
**Analysis**: GNU grep treats these files as binary and suppresses line output unless `-a`/`--binary-files=text` is used. Discovered during this review when source searches silently returned nothing. Any future CI guard built on grep (e.g., automating the C-004 check or NI-002) must use `-a` or it may silently under-report. The existing in-suite C-004 gate is immune (it reads the file via Node, `tests/unit/pipeline.test.ts:268`); the acceptance matrix's grep_absence commands remain valid because binary-mode grep still *detects* matches (exit codes are unaffected), it only suppresses display.

---

## Silent Failure Candidates

All 16 `catch` blocks in `src/` were read. None swallow a malfunction into a default value on a spec-bearing path:

| Location | Condition | Behavior | Verdict |
|----------|-----------|----------|---------|
| `src/adapters/rfc1/index.ts:75` | thresholds module absent (pre-WP09 seam) | getter throws "thresholds not yet linked" — loud, documented | OK |
| `src/core/pipeline.ts:245` | unreadable reference | error Violation with ref + resolved path + reason | OK |
| `src/core/behavioral/client.ts:43` | unparseable base URL in error context | falls back to scheme-stripped prefix (display only, never auth) | OK |
| `src/core/behavioral/runner.ts:451` | per-run exception | RunVerdict `{passed:false, error}` — counts as failed run (FR-022) | OK |
| `src/cli/index.ts:91,457,482` | command/entrypoint errors | exit 2 with stderr message | OK |

No `except-and-return-empty` pattern exists. The behavioral report can never be silently empty: an errored run is a recorded failed run.

---

## Security Notes

| Finding | Location | Risk class | Recommendation |
|---------|----------|------------|----------------|
| Unanchored reference resolution (RISK-1) | `pipeline.ts:241` | PATH-TRAVERSAL (read-only) | `--restrict-refs` option + trust-model docs in follow-up |
| HTTP timeout present | `client.ts:97` `AbortSignal.timeout` | UNBOUND-HTTP — **mitigated** | none |
| Key handling | `client.ts` env-read at call time; no key flag; errors carry hostname only | CREDENTIAL-LEAK — **mitigated** | none; NI-001 grep + WP11 secret scan both clean |
| No subprocess use in src/ | — | SHELL-INJECTION — n/a | none |
| Temperature/body construction | `client.ts:87` literal spread, no string interpolation into URLs beyond baseUrl join | INJECTION — n/a | none |

---

## Final Verdict

**PASS WITH NOTES**

### Verdict rationale

All 24 functional requirements trace to adequate, production-shaped verification — most with three independent layers (unit tests, the self-hosted 28-case CTS suite, and live execution against real files and two real model providers). No locked decision was violated in code: the dependency set, threshold constants, k-of-n semantics, temperature omission, strict-default mode, and the core/adapter import boundary all check out against C-001..C-010, and the boundary is enforced by an in-suite test rather than convention. The event log is clean (one ordinary rejection cycle, no forced approvals). The two drift findings are a documented environment deferral (local Ollama half of C-008/NFR-004, reproduction command committed) and a missing README paragraph that RFC-1 §7.2 makes normative — neither blocks release of a local developer tool. No CRITICAL or HIGH findings exist.

### Open items (non-blocking)

1. **Close DRIFT-1**: after the NVIDIA reboot — `ollama pull qwen2.5:7b-instruct && muster behave run behave/voice-frontdesk.yaml`, append results to `behave/results/`, which also discharges NFR-004.
2. **Close DRIFT-2**: add a "Reference resolution" README paragraph (relative + absolute supported, URI schemes unsupported this pass) — ideally alongside RISK-1's trust-model note.
3. **RISK-1 hardening** (`--restrict-refs`) before any server-side / untrusted-input deployment.
4. **RISK-2 polish**: scheme-aware violation message for URI references.
5. **Tooling note**: future grep-based CI guards on this codebase need `-a` (RISK-3).
