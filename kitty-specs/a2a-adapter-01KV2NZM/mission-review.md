# Mission Review: A2A Agent Cards (Manifests) Conformance Adapter

**Mission**: `a2a-adapter-01KV2NZM`
**Reviewer**: principal-engineer mission review (post-implementation, pre-merge)
**Date**: 2026-06-14
**Branch**: `feat/a2a-adapter` (12 commits over `main`; PR #18 → `main`)
**Baseline commit**: `e5f973e` | **HEAD at review**: `bc336cb`
**WPs reviewed**: WP01–WP05 (all implemented, each per-WP APPROVED; WP05 had one mission-review fix cycle)
**Verdict**: **PASS-WITH-NOTES** — no CRITICAL or HIGH blocking findings.

## Verification performed

- `pnpm build` → PASS (tsc strict, 0 errors).
- `pnpm test tests/a2a/` → 14 files, **360 passed**, 0 failures, no type errors. Full `pnpm test` green except the pre-existing `NI-001 no committed secrets` trip on the developer's gitignored/untracked local `.env` (`sk-` key) — reproduces identically on `main`, passes in CI (no `.env`); not a mission regression.
- Scoped coverage `src/adapters/a2a/**`: **92.14% stmts / 85.38% branch / 100% funcs**. `graders/` 100%/100%. All files above the 80% new-code gate.
- `git diff e5f973e..HEAD -- src/core/` → **empty** (0 lines). `grep` confirms `src/core/` imports no a2a symbol (C-001/C-004 boundary clean).
- No `Date`/`Date.now`/`new Date`/`Math.random`/`localeCompare`/`performance.now` in `src/adapters/a2a/**` (only comments forbidding them). No `TODO`/`FIXME`/`not implemented` in a2a source.
- Diff coverage map: changes confined to `src/adapters/a2a/**` (9 files), `src/cli/index.ts` (+118, additive a2a wiring), `tests/a2a/**` + `tests/fixtures/a2a/**`, and `tests/unit/invariants.test.ts` (+28, the NI-003 allowlist widening — verified to be exactly that, no other invariant touched). No file the spec required to change is missing from the diff.
- Dead-code check: `A2aAdapter` is wired into the live CLI — `ADAPTER_REGISTRY` (`a2a: () => new A2aAdapter()`), `--adapter` choices `["rfc1","heartbeat","a2a"]`, `doCheck` a2a branch, `doA2aRun` + `muster a2a run` command, `runA2aManifest`. Not dead code.
- End-to-end CLI smoke: offline `a2a run manifest.json --json` → exit 0 (2 static pass, 3 live skipped, failed:0); healthy in-process endpoint → exit 0 (all 5 passed); `check --adapter a2a valid.json` → exit 0; deliberate failure → exit 1.

## 1. FR coverage trace

| FR | Requirement (brief) | Implementation | Test | Status |
|----|---------------------|----------------|------|--------|
| FR-001 | SpecAdapter contract; reuse core; no core mod | `index.ts` `A2aAdapter implements SpecAdapter`; reuses `conjunctivePassK` from `src/core/behavioral/pass-k.js`; core diff empty | `manifest.test.ts`, `card.test.ts` | COVERED |
| FR-002 | Parse card + manifest declaring cases | `card.ts` `parseAgentCard`; `types.ts` `ManifestCase`/`loadManifest` | `card.test.ts`, `manifest.test.ts` | COVERED |
| FR-003 | Static lint: well-known URI §8.2 (flag obsolete `agent.json`) | `card.ts` `checkDiscoveryUri`; `lint.ts` `lintCard` | `card.test.ts`, `lint.test.ts`; `manifest.controls.json` static-obsolete-uri-control | COVERED |
| FR-004 | Offline JWS verify vs JWKS, tamper-detecting | `signature.ts` `verifyCardJws` (`node:crypto`) | `signature.test.ts` (verify matrix), `lint.test.ts` | COVERED |
| FR-005 | Residual-gap structure only; delegate schema to a2a-tck | `card.ts` `checkStructure`/`delegationNote`; report `detail.schemaValidation:"delegated:a2a-tck"` | `card.test.ts`, `lint.test.ts` | COVERED |
| FR-006 | Skill-behavior live probe, k-of-n, §8.3.1 | `graders/skill-behavior.ts` `probeSkill`/`aggregateSkillBehavior` | `skill-behavior.test.ts` (vs test-server) | COVERED |
| FR-007 | Auth-enforcement negatives, §7 | `graders/auth-negative.ts` `checkAuthEnforcement` | `auth-negative.test.ts` | COVERED |
| FR-008 | Optional live signed-card check + nested skip | `graders/signed-card.ts` `checkLiveSignedCard` | `signed-card.test.ts` | COVERED |
| FR-009 | Live via `MUSTER_A2A_ENDPOINT`; skip on unset; not chat env | `transport.ts` `envEndpoint`; `index.ts` `runManifest` skip logic | `skill-behavior.test.ts` skip path; `manifest.test.ts` offline section | COVERED |
| FR-010 | Errored run = failed (not skipped); env-unset distinct | `index.ts` `runManifest` try/catch → `passed:false`; skip only on env-unset | `manifest.test.ts`, `signed-card.test.ts` error paths | COVERED (see RISK-1 on the *timeout* sub-case) |
| FR-011 | Every grader ships a rigged-impossible control | `lint.ts` `signatureControl`; `manifest.controls.json` (5 controls, one per grader); control inversion in `runManifest` | `manifest.test.ts` controls section asserts all fire (`graderRawPassed:false`) | COVERED |
| FR-012 | CLI exit non-zero iff non-skipped fail; JSON report; CI contract | `cli` `doA2aRun` (`failed>0?1:0`, `--json`); shipped `manifest.json` (no controls → healthy agent exits 0) | `manifest.test.ts` exit-code section + e2e CLI smoke | COVERED |
| FR-013 | Machine-readable findings; cite §8.2/§8.3.1/§7/proto + rubric | citations embedded in `card.ts`/`lint.ts` finding messages; canonical report | `card.test.ts`, `lint.test.ts` | COVERED |
| FR-014 | Fixture set as candidate upstream residual-gap suite | `tests/fixtures/a2a/**` (cards, jwks, in-process `test-server.ts`, two manifests) | all a2a integration tests | COVERED |

**All 14 FRs adequately covered** — each test constrains the required behavior (graders verified against a real in-process A2A server, not synthetic fixtures; signature verification against real JWS fixtures; the obsolete-uri control genuinely drives the §8.2 rule via the per-case `discoveredFrom` override).

## 2. NFR / constraint trace

| ID | Threshold | Result |
|----|-----------|--------|
| NFR-001 | Static path offline + byte-stable | PASS — no `Date`/random/locale sort; serialize byte-stable tests; offline JWS uses fixtures, zero network |
| NFR-002/003 | Static lint < 5s/card; suite < 10s | PASS — full a2a static suite < 1.5s |
| NFR-004 | Live suite < 5min vs fixture server | PASS — full a2a suite (incl. live-vs-test-server) < 2s |
| NFR-005 | BYO endpoint; no creds in repo | PASS — `MUSTER_A2A_ENDPOINT`/`MUSTER_A2A_TOKEN` env only; no private key committed (fixtures carry only public JWK `x`; healthy test-server signs with an ephemeral in-memory key) |
| NFR-006 | tsc strict + vitest green + SonarCloud gate | PASS locally (tsc clean, suite green); **SonarCloud quality gate pends CI on PR #18** |
| C-001 | Core never learns A2A | PASS — core diff empty; no a2a import in core |
| C-002 | Residual-gap only; no generic validator | PASS — `delegationNote`; no card-schema validation attempted |
| C-003 | Well-known `agent-card.json` §8.2; proto normative | PASS — `checkDiscoveryUri`; JSON Schema treated non-normative |
| C-004 | Live targets real A2A endpoint, not chat model; skip but never silently pass a live failure | PASS — `transport.ts` own client; adapter never references `MUSTER_ENDPOINT`/`MODEL`/`API_KEY`; live error → failed run |
| C-005 | Upstreamable residual-gap suite | PASS — fixtures + test-server shaped as a suite |

## 3. Drift findings

None. No non-goal invasion (no generic card validator; core untouched), no locked-decision violation (residual-gap scope honored; well-known URI + proto-normative respected; live endpoint not the chat model), no punted FR (all 14 mapped to real tests), no NFR miss (SonarCloud gate is the one item still pending CI, not a miss).

## 4. Risk findings

### RISK-1: Unbounded HTTP — no timeout on `fetch` calls
**Type**: ERROR-PATH / UNBOUND-HTTP · **Severity**: MEDIUM (non-blocking)
**Location**: `src/adapters/a2a/transport.ts` `fetch(...)` at lines 73 (`discoverCard`), 160 (`invokeSkill`), 243 (`probeAuth`), 309 (`fetchJwks`) — none pass an `AbortSignal`/timeout.
**Trigger**: a live A2A endpoint that accepts the TCP connection but never responds (hung server, half-open connection).
**Analysis**: the module doc-comment (`transport.ts:10,65`) and FR-010 promise that a "timeout … THROWS → failed run". In practice no timeout is configured, so a true network hang does **not** become a failed run — the `muster a2a run` invocation blocks indefinitely. For the one-shot CLI this is recoverable (operator interrupts); for the FR-012 scheduled-CI monitoring posture it degrades a clean "failed run" into a hang that only the CI job's own step-timeout eventually kills. Recommend wrapping each `fetch` with `AbortSignal.timeout(<ms>)` (built-in, no dependency) so a hang materialises as the documented failed run. Non-blocking for release (no shared lock, no data loss; env-unset path is unaffected), but should be closed in a follow-up.

## 5. Silent-failure candidates

| Location | Condition | Result | Assessment |
|----------|-----------|--------|------------|
| `graders/signed-card.ts` `checkLiveSignedCard` bare `catch {}` on `fetchJwks` | endpoint reachable, live JWKS 404/errors | returns `skipped:true, skipReason:"live JWKS unavailable"` | INTENTIONAL & reviewed — a *defined* nested skip (FR-008), distinct from a failure; the error carries no credential, and a genuine endpoint-unreachable error throws earlier in `discoverCard` (uncaught → failed run). Acceptable. |
| `index.ts` `runManifest` live-grader try/catch | live probe throws | `passed:false` (failed run) | CORRECT — matches FR-010 (errored run = failed, not skipped). |

No empty-string/`None`-on-malfunction anti-patterns found. `parseAgentCard` returning an empty-arrays card on malformed JSON is by-design (the lint surfaces the finding) and tested.

## 6. Security notes

| Finding | Location | Risk class | Recommendation |
|---------|----------|------------|----------------|
| `fetch` without timeout | `transport.ts` (RISK-1) | UNBOUND-HTTP | Add `AbortSignal.timeout(...)`; follow-up |
| No subprocess/shell/eval introduced | `src/adapters/a2a/**` | SHELL-INJECTION | None — grep confirms zero `exec`/`spawn`/`shell`/`eval` |
| Bearer token never logged/stored | `transport.ts` `envToken` read at call time | CREDENTIAL-LEAK | None — no `console`/stdout writes in the adapter; token only placed in the `Authorization` header |
| Manifest `cardSource` path resolution | `types.ts` `loadManifest` resolves relative to the manifest dir | PATH-TRAVERSAL | Low — `cardSource` is operator-authored (the same trust level as the manifest itself), not untrusted external input; acceptable for a CLI conformance tool. Note only. |
| No private key in repo | `tests/fixtures/a2a/**` | CREDENTIAL-IN-REPO | None — fixtures carry only public JWK material; healthy test-server signs with an ephemeral in-memory key |

## 7. Open items (non-blocking — candidates for a follow-up)

1. **RISK-1**: add `AbortSignal.timeout(...)` to the four `transport.ts` `fetch` calls so a network hang becomes the documented failed run (matters for the FR-012 scheduled-monitoring posture).
2. **JWS alg coverage**: offline verification advertises RS256/ES256/EdDSA but only the **EdDSA** happy-path is proven by fixtures (RSA/EC verify paths reached only negatively, via the unsupported-alg case). Add an RS256 and/or ES256 signed fixture if those algorithms are to be first-class.
3. **`wrong-key.json` kid mismatch**: the wrong-key JWKS uses a different `kid`, so `verifyCardJws(signed, wrong-key)` short-circuits at `unknown-kid` rather than reaching a crypto-level mismatch (which *is* covered by `tampered.json`). Optional: add a same-`kid` wrong-key fixture to exercise the wrong-key-material branch directly.
4. **Auth scheme generality**: `checkAuthEnforcement` always probes with `Bearer` and uses the `scheme` arg only diagnostically; non-bearer A2A security schemes (`apiKey`, `oauth2`) would need branching on `scheme.type` when/if supported.
5. **`expect` is descriptive-only for skill-behavior**: the grader's consistency check is response-contains-`input`; the manifest `expect` string is documentation, not a wired assertion (documented in code). Fine for the echo fixture; if richer skill semantics are needed, wire `expect` into the check.

## Final verdict

**PASS-WITH-NOTES.**

All 14 FRs are adequately covered by tests that constrain real runtime behavior (live graders exercised against a real in-process A2A server; JWS verification against genuine signed fixtures; controls that genuinely fire). The spec-agnostic core boundary is provably clean (zero core diff, no a2a import). No drift, no non-goal invasion, no locked-decision violation, no punted FR. The residual-gap scope (C-002) is honored — deep card-schema validation is delegated to `a2a-tck`, not reimplemented. The mission-review fix cycle on WP05 closed two genuine must-fixes (live-control incoherence that would have broken the FR-012 healthy-agent-exits-0 contract; a non-discriminating obsolete-uri check), and both are verified resolved with empirical CLI exit codes. No CRITICAL or HIGH finding exists. The single MEDIUM finding (RISK-1, unbounded HTTP) is non-blocking for release and is recorded as the top open item. One release-gating item remains outside this static review: the **SonarCloud quality gate on PR #18 CI** must pass before merge (NFR-006).
