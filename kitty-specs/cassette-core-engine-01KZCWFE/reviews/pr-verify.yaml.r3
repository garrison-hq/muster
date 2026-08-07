# review-verify/v1
schema: review-verify/v1
complete: true
phase: pr
results:
  - id: PR-FRESH-001
    status: resolved
    reason: All citations in the rewritten table row (doSkillsRun:1748, doSopRun:1873, doA2aBehavioralRun:1321-1325, doBehaveRun:634-653) plus the two additionally-corrected citations (resolveSkillsBehavioralEndpoint:1531-1554, deprecation notice:1541-1544) and runCli's catch:2530-2544 were each read directly against current src/cli/index.ts and match exactly.
  - id: PR-FRESH-002
    status: resolved
    reason: The replay row's Situation label now names the actual condition ("cassette miss/stale entry (no endpoint contacted)") instead of reusing "endpoint unreachable", and the post-table sentence adds the carve-out clause distinguishing live-run contract compliance from the documented replay exception.
  - id: PR-FRESH-003
    status: resolved
    reason: The chatWithTools comment now states precisely what tools:[...tools] guarantees (array-shell copy only, not per-tool-object) and explicitly notes it is one level shallower than chat's per-message copy, matching the code exactly instead of overclaiming parity.
  - id: PR-FRESH-004
    status: resolved
    reason: Empirically verified — reverting client.ts:183's chatWithTools request build from a copy back to the plain `{ messages, tools }` alias causes the new PR-FRESH-004 test to fail (persisted messages array grows to length 3 after the caller mutates it post-call).
  - id: PR-FRESH-005
    status: resolved
    reason: "Empirically verified: reverting client.ts:148's chat request build from opts:{...chatOpts} back to opts: chatOpts causes the new PR-FRESH-005 test to fail (persisted opts.temperature becomes 0.9 instead of the pre-call snapshot 0.5)."
  - id: PR-FRESH-006
    status: resolved
    reason: Empirically verified — renaming CaseVerdict.stale in src/core/behavioral/types.ts breaks compilation at discrimination-control.test.ts's `Pick<CaseVerdict, "id" | "passed" | "stale">` line (TS2344), confirming a real compile-time link rather than a hand-duplicated shape.
  - id: PR-FRESH-007
    status: resolved
    reason: The new guard sums exchanges.length across all discovered case files and asserts totalExchanges > 0 before the per-exchange loop, which fails loudly (not vacuously) if every committed case file's exchanges array were ever empty, closing the one-level-down vacuity gap the finding identified.
