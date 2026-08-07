# review-verify/v1 — canonical format for fix-verification output.
schema: review-verify/v1
complete: true
phase: pr
results:
  - id: PR-CONTRACT-001
    status: resolved
    reason: docs/guides/spec-kitty-conformance.md now documents the --cassette --replay
      exit-2 carve-out in a new table row citing opts.replay !== true at src/cli/index.ts:644,
      and the stale doBehaveRun ":479-489" citation is refreshed to ":634-653" — verified
      against the current file that lines 634-653 are exactly the exit-discipline block
      and line 644 is the opts.replay !== true condition.
  - id: PR-CONTRACT-002
    status: resolved
    reason: tests/cassette/discrimination-control.test.ts's primary test now asserts
      expect(verdicts[0]?.stale).toBeUndefined(), and `stale` is a real, additive field
      populated by src/core/behavioral/runner.ts (only set true on a CassetteMissError)
      and threaded through the actual JSON CLI output the test parses, so the assertion
      directly rules out the cassette-miss explanation rather than relying implicitly
      on the paired test.
  - id: PR-TESTS-001
    status: resolved
    reason: 'src/core/cassette/client.ts deep-copies the request in both record-mode
      chat (messages.map((m) => ({ ...m })), opts: { ...chatOpts }) and chatWithTools
      (messages.map((m) => ({ ...m })), tools: [...tools]); recomputed computeRequestHash
      against the current fixtures/cassettes/discrimination-control/rigged-case.json
      directly (via tsx) and it matches the persisted requestHash exactly (88b2147c...),
      with request.messages now correctly containing only the 2 real turns (system+user);
      both new regression tests exist (client.test.ts mutates the caller''s array after
      chat() returns, store.test.ts hashes every committed fixture); temporarily reverted
      client.ts to the pre-fix aliasing version and reverted the fixture to its pre-fix
      corrupted content and confirmed both new tests fail against the unfixed code/fixture
      (then restored both files to HEAD, verified git diff HEAD is empty) — the tests
      are not vacuous.'
  - id: PR-TESTS-002
    status: resolved
    reason: tests/unit/cli.test.ts adds a regression test using a clientFactory that
      throws on the 3rd of 5 calls during --record; ran it and confirmed it passes today
      asserting the case file has 4 exchanges (fewer than applied.runs) while the suite
      index still declares runs=5 (src/cli/index.ts:619 confirmed to use applied.runs,
      not recordSink.length), which locks the documented contract with an assertion that
      would fail if that line were ever changed to use recordSink.length instead.
