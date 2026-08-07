schema: review-findings/v1
complete: true
phase: pr
lens_group: fresh
mission: cassette-core-engine-01KZCWFE
findings:
- id: PR-FRESH-001
  lens: fresh
  severity: 4
  title: Revision fixed only one of four stale citations inside the exact table row
    it rewrote, leaving three now-wrong line numbers in place
  evidence: 'docs/guides/spec-kitty-conformance.md, the "Endpoint unreachable for
    every run of every case" table row (§3) — the whole markdown row line was rewritten
    by this diff to bump doBehaveRun''s citation from `:479-489` to `:634-653` (that
    part is correct: verified against src/cli/index.ts:634-653). The same rewritten
    line still carries three other citations that drifted by the identical mission-caused
    line shift and were not corrected: (1) `doSkillsRun, src/cli/index.ts:1584` —
    the actual `return ok ? 0 : 1;` is now at src/cli/index.ts:1748; (2) `doSopRun,
    :1685` — the actual `return report.passed ? 0 : 1;` is now at src/cli/index.ts:1873;
    (3) `doA2aBehavioralRun, :1157-1161` — the actual exit-2 check (`if (result.allErrored)
    { ... return 2; }`) is now at src/cli/index.ts:1321-1325 (lines 1157-1161 currently
    fall inside an unrelated function, doCrossLayerRun, per src/cli/index.ts:1145-1161).
    Confirmed via git history that all four numbers (`:479-489`, `:1584`, `:1685`,
    `:1157-1161`) were accurate pre-mission (commit 999b88b) and drifted together
    when the cassette-core-engine mission inserted code ahead of doBehaveRun — the
    same drift the diff''s own new Status-paragraph text names as the reason doBehaveRun''s
    citation needed refreshing.'
  claim: 'The revision''s stated purpose was to correct citation drift caused by the
    cassette-core-engine mission''s ~150-line insertion ahead of doBehaveRun. It rewrote
    the entire table row containing four code citations but re-verified/fixed only
    one (doBehaveRun), leaving the other three — doSkillsRun, doSopRun, and doA2aBehavioralRun
    — silently wrong in the same edited line. This is a doc fix that, in the course
    of touching a line, leaves adjacent wrong line numbers uncorrected rather than
    introducing a brand-new wrong number, but the net effect is the same: a reader
    following doA2aBehavioralRun''s citation to verify the "2, treated as an execution
    fault" claim lands inside doCrossLayerRun instead, an entirely unrelated function.
    The guide''s own Status banner claims §3 was "re-checked" against the current
    commit; this row demonstrates that re-check was partial, not row-complete, even
    though the row line itself was rewritten in full.'
  remediation: 'While touching this row, re-verify and correct all four citations
    against current src/cli/index.ts: doSkillsRun''s `return ok ? 0 : 1;` → :1748;
    doSopRun''s `return report.passed ? 0 : 1;` → :1873; doA2aBehavioralRun''s `result.allErrored`
    exit-2 block → :1321-1325. Alternatively, if a full re-check of every citation
    in the row is out of scope for this change, say so explicitly in the row itself
    (not just in the general Status-banner disclaimer) so a reader doesn''t assume
    the citations right next to a freshly-verified one share that verification.'
  source_artifact: docs/guides/spec-kitty-conformance.md
- id: PR-FRESH-002
  lens: fresh
  severity: 3
  title: New replay-carve-out row's Situation label reuses "endpoint unreachable"
    for a condition its own row text says never touches an endpoint, and is inconsistent
    with the unchanged "implement that written contract exactly" claim below the table
  evidence: 'docs/guides/spec-kitty-conformance.md §3, the newly added row''s leftmost
    cell reads "`behave run --cassette ... --replay`: endpoint unreachable for every
    run of every case", but the same row''s right-column body reads "Replay never
    touches a live endpoint at all (NFR-003)". Directly below the table (unchanged
    by this diff), the guide states "`behave` and `a2a` implement that written contract
    exactly" (contracts/cli.md''s uniform exit-2-on-endpoint-unreachable rule), with
    no carve-out mentioned. Code confirms the row''s own explanation, not its label:
    in replay mode the gate at src/cli/index.ts:644 (`opts.replay !== true`) is unconditional
    on cause, and a replay miss is a `CassetteMissError` thrown by src/core/cassette/client.ts:208/223
    on a cassette-lookup miss, never a network/endpoint call.'
  claim: Reusing the literal phrase "endpoint unreachable for every run of every case"
    to label a scenario the row itself says involves no endpoint at all is self-contradictory
    on a literal reading, and it leaves the unchanged post-table sentence ("behave...
    implement[s] that written contract exactly") looking like it overlooks this row's
    carve-out. A reader skimming just the Situation column (as the table is designed
    to be skimmed — "$? is what your automation should branch on") could reasonably
    conclude behave sometimes fails to map a genuine endpoint-unreachable condition
    to exit 2, which is not what is actually happening (the carve-out is scoped to
    cassette staleness, a different failure cause that happens to share the same all-runs-errored
    code path).
  remediation: 'Reword the new row''s Situation-column label to name the actual condition
    instead of reusing the endpoint-unreachable phrase — e.g. "`behave run --cassette
    ... --replay`: every run of every case is a cassette miss/stale entry (no endpoint
    contacted)". Optionally add a short clause to the unchanged post-table sentence
    acknowledging the one documented carve-out (e.g. "...implement that written contract
    exactly for live runs; the `--replay` carve-out above is a deliberate, documented
    exception, not a divergence") so the two unqualified claims ("implements exactly"
    / "endpoint unreachable") don''t read as being in tension.'
  source_artifact: docs/guides/spec-kitty-conformance.md
- id: PR-FRESH-003
  lens: fresh
  severity: 2
  title: chatWithTools's freeze comment claims parity with chat's copy but the implementation
    copies one level shallower (array only, not per-tool-object)
  evidence:
  - 'src/core/cassette/client.ts:141-148 — chat''s request: `messages: messages.map((m)
    => ({ ...m })), opts: { ...chatOpts }` — a new array PLUS a new object per message/opts.'
  - 'src/core/cassette/client.ts:172-174 — chatWithTools''s comment: "Deep-copy at
    call time — same PR-TESTS-001 rationale as `chat` above: freeze a copy, never
    alias the caller''s mutable array." But the code is `tools: [...tools]` — only
    a new array; the individual tool-definition objects inside it are the SAME references
    as the caller''s.'
  - 'src/core/behavioral/client.ts:109-113 (`ToolChatClient`) types `tools` as `unknown[]`
    — fully opaque; core has no guarantee its elements are immutable primitives the
    way `ChatMessage` (types.ts:190-193, flat `{role, content: string}`) is.'
  claim: 'The comment on the `chatWithTools` copy asserts it uses "same PR-TESTS-001
    rationale" as `chat`''s fix, implying equivalent protection against the confirmed
    aliasing class. For `chat`, the fix is genuinely immune to any caller mutation
    because `ChatMessage` is flat (both fields are primitive strings), so the per-message
    spread plus the fresh array closes the aliasing hole completely. For `chatWithTools`,
    `tools: [...tools]` only protects against the SPECIFIC confirmed pattern (a caller
    pushing/splicing the array after the call, mirroring `executeRun`''s `messages.push`)
    — it does NOT protect against a caller mutating a tool object''s own fields in
    place after the call (e.g. `tools[0].function.name = ...`), since the copy is
    one level shallower than `chat`''s. Today no call site does that (the only `chatWithTools`
    caller reachable through `makeCassetteClient` is `tests/cassette/client-tools.test.ts`;
    the only production `chatWithTools` caller, `src/adapters/skills/trigger.ts`''s
    `runSingleQuery`/`makeToolClient`, reuses a static, never-mutated `tools` array
    and does not route through `makeCassetteClient` at all — `src/cli/index.ts`''s
    `buildCaseClient` only ever calls `makeCassetteClient` with the plain `ChatClient`
    overload), so this is not exploitable right now. But the comment''s "same rationale"
    phrasing overstates the guarantee for a genuinely opaque (`unknown[]`) type, which
    could mislead a future maintainer who reuses a `tools` array across turns and
    mutates an element in place, assuming the cassette decorator already froze it
    the same way it froze `messages`.'
  remediation: Either (a) reword the `chatWithTools` comment to state precisely what
    is guaranteed — "freezes the array shell against push/splice; does NOT protect
    a tool object's own fields against later in-place mutation, since `tools` is opaque
    (`unknown[]`)" — or (b) if per-element immunity is desired for parity, deep-clone
    each tool entry too (e.g. `tools.map((t) => structuredClone(t))`, guarding for
    non-cloneable values) so the guarantee genuinely matches `chat`'s.
  source_artifact: src/core/cassette/client.ts
- id: PR-FRESH-004
  lens: fresh
  severity: 3
  title: PR-TESTS-001 regression test covers chat's aliasing fix but not chatWithTools's
    identical fix
  evidence: "tests/cassette/client.test.ts:142-177 adds one regression test, exercised\
    \ only\nthrough `client.chat(messages, OPTS)`. Compare src/core/cassette/client.ts:136-165\n\
    (chat) with :166-191 (chatWithTools): the fix commit (ca5d777) changed BOTH\n\
    call sites identically —\n  chat:          `const request = { messages: messages.map((m)\
    \ => ({ ...m })), opts: { ...chatOpts } };`  (client.ts:148)\n  chatWithTools:\
    \ `const request = { messages: messages.map((m) => ({ ...m })), tools: [...tools]\
    \ };`      (client.ts:174)\nBefore the fix, both were plain aliasing (`{ messages,\
    \ opts: chatOpts }` /\n`{ messages, tools }` — see `git show ca5d777 -- src/core/cassette/client.ts`).\n\
    The chatWithTools code comment at client.ts:172-173 even says \"same PR-TESTS-001\n\
    rationale as `chat` above\" — the two paths are acknowledged as the same bug\n\
    class, but only one got a regression test.\n"
  claim: 'If a future change reverts client.ts:174 back to `{ messages, tools }` (re-aliasing
    the caller''s array in chatWithTools''s persisted request), no test in this file
    would fail — WOULD THIS TEST FAIL IF THE FIX WERE REVERTED? For the chatWithTools
    half of the fix, no. The only chatWithTools test in the file (client.test.ts:44-61,
    live mode) doesn''t touch record mode or persistence at all. This is a real gap:
    the exact same severity-4-class bug can silently return in the tools path.

    '
  remediation: 'Add a chatWithTools counterpart to the PR-TESTS-001 test: call `client.chatWithTools(messages,
    tools)` in record mode, then mutate the same `messages` array (and/or `tools`
    array) after it resolves, and assert recordSink[0].request.messages/tools match
    a pre-call snapshot and are not the same array references as the caller''s mutated
    arrays.

    '
  source_artifact: tests/cassette/client.test.ts
- id: PR-FRESH-005
  lens: fresh
  severity: 2
  title: New test proves messages-array freezing but not opts-object freezing, despite
    exercising the same code path
  evidence: 'tests/cassette/client.test.ts:163-175 only mutates `messages` (line 168:

    `messages.push(...)`) after the `chat()` call; `OPTS` (client.test.ts:27,

    `const OPTS = {} as const`) is never mutated before or after the call in

    this test or anywhere else in the file. Yet the fix this test claims to

    regression-guard also changed the opts side: client.ts:148 changed

    `opts: chatOpts` to `opts: { ...chatOpts }` in the same commit (ca5d777).

    '
  claim: 'WOULD THIS TEST FAIL IF ONLY THE OPTS HALF OF THE FIX WERE REVERTED (i.e.
    client.ts:148 read `request = { messages: messages.map(...), opts: chatOpts }`)?
    No — nothing in this test or the file mutates a chatOpts object after passing
    it to `chat()`, so aliasing on that field is untested. Low real-world urgency
    today (src/core/behavioral/runner.ts:345-346 builds `chatOpts` once per run and
    never mutates it after the fact), but the test''s own docstring ("freezes the
    persisted request at call time") implies full-request freezing, which it does
    not fully demonstrate.

    '
  remediation: 'Either narrow the test''s claim to "messages array" specifically,
    or add an opts-mutation assertion (construct a mutable `{ temperature: 0.5 }`
    opts object, call chat, mutate `opts.temperature` afterward, and assert the persisted
    request.opts is unaffected and not the same object reference) to make the coverage
    match the docstring.

    '
  source_artifact: tests/cassette/client.test.ts
- id: PR-FRESH-006
  lens: fresh
  severity: 2
  title: New `stale` discrimination relies on a hand-duplicated local type with an
    unchecked JSON.parse cast, not a compile-time link to CaseVerdict
  evidence:
  - code: 'tests/cassette/discrimination-control.test.ts:54-58 (local `interface ReplayVerdict
      { id: string; passed: boolean; stale?: boolean; }`)'
  - code: 'tests/cassette/discrimination-control.test.ts:77 (`JSON.parse(stdout) as
      { replayed: boolean; verdicts: ReplayVerdict[] }` — an unchecked type assertion,
      not a runtime-validated parse)'
  - code: tests/cassette/discrimination-control.test.ts:94 (`expect(verdicts[0]?.stale).toBeUndefined();`)
  - code: 'src/core/behavioral/types.ts:132,151 (production `CaseVerdict.stale?: boolean`
      is the actual source of truth this assertion is meant to track)'
  claim: 'Verified this specific concern does NOT make the new assertion currently
    vacuous: `src/core/behavioral/runner.ts:493-521,640` shows `stale` is real, additive,
    and only set true when `executeRun` throws a `CassetteMissError` — a genuinely
    distinct code path from the grader-fails-but-replay-succeeds path this fixture
    exercises (confirmed empirically: `vitest run tests/cassette/discrimination-control.test.ts`
    passes, 2/2, no type errors). However, the guarantee this assertion buys is only
    as strong as `ReplayVerdict` staying byte-for-byte in sync with `CaseVerdict`
    — it is a hand-copied shape read through an unchecked `as` cast over `JSON.parse`,
    not `Pick<CaseVerdict, ...>` or an import. If the production field were ever renamed
    (e.g. `stale` -> `isStale`) or the JSON shape changed, `verdicts[0]?.stale` would
    silently become `undefined` and this "self-evidently about a real grading failure"
    assertion (per the new PR-CONTRACT-002 comment at :88-93) would keep passing while
    providing zero discrimination — with no compiler signal, since `tsc`/vitest typecheck
    only validates `ReplayVerdict`''s internal consistency, not its correspondence
    to `CaseVerdict`. This is a pattern the file already carried for `id` and `passed`
    before this diff (not a new problem class), but the revision extends that same
    fragile pattern to the field that is now the crux of the control''s core anti-vacuity
    claim, raising the stakes on the existing gap.'
  remediation: 'Low-cost hardening: derive `ReplayVerdict` from the production type
    instead of hand-duplicating it, e.g. `type ReplayVerdict = Pick<CaseVerdict, "id"
    | "passed" | "stale">` (import `CaseVerdict` from `../../src/core/behavioral/types.js`),
    so a future rename of `CaseVerdict.stale` breaks the test file at compile time
    instead of silently degrading this assertion to a no-op. Optional given severity;
    not required to land this revision.'
  source_artifact: tests/cassette/discrimination-control.test.ts
- id: PR-FRESH-007
  lens: fresh
  severity: 3
  title: Fixture-integrity guard checks case-FILE count, not exchange count — a future
    all-empty-exchanges fixture state would still pass vacuously
  evidence:
  - tests/cassette/store.test.ts:320-321 — the only vacuity guard is `expect(caseFiles.length).toBeGreaterThan(0)`,
    computed from the count of JSON files that match `isCassetteCaseFile` (i.e. have
    an `exchanges` array of ANY length, including zero).
  - tests/cassette/store.test.ts:323-330 — the actual assertion (`computeRequestHash(...).toBe(exchange.requestHash)`)
    lives inside a nested `for (const exchange of parsed.exchanges)` loop with no
    per-file or aggregate check that at least one exchange was iterated.
  - 'Currently the guard happens to hold in substance too: fixtures/cassettes/discrimination-control/rigged-case.json
    is the only committed case file and has exactly 1 exchange, so today''s run does
    exercise the real assertion (verified by running `npx vitest run tests/cassette/store.test.ts`,
    which shows the fixture-integrity test passing with a real hash comparison, not
    skipped).'
  claim: 'If every currently-committed case file''s `exchanges` array were ever empty
    at the same time (e.g. a future fixture is added purely to exercise suite-index
    or schema-version behavior and is given `exchanges: []`, or the sole existing
    case file''s exchanges list is trimmed to zero during unrelated fixture cleanup),
    `caseFiles.length` would still be greater than 0 (the file itself exists and structurally
    matches `isCassetteCaseFile`), so the guard at line 321 passes, but the nested
    loop at lines 323-330 would iterate zero times and assert nothing. The test would
    go green having performed zero hash comparisons — exactly the "vacuity by empty
    set" failure mode this whole describe block exists to prevent, just one level
    down (empty exchange set within a non-empty file set, rather than an empty file
    set). This is a latent gap in the guard''s completeness, not a currently-manifesting
    vacuous pass: as of this diff the one committed fixture has one real exchange
    and the assertion genuinely runs and genuinely compares a real hash.

    '
  remediation: 'Guard on total exchange count, not just case-file count — e.g. after
    the `caseFiles.length` check (or replacing it), add `const totalExchanges = caseFiles.reduce((n,
    cf) => n + cf.parsed.exchanges.length, 0); expect(totalExchanges).toBeGreaterThan(0);`
    so the test fails loudly if the discovered case files collectively contain zero
    exchanges to check, not just if zero case files were discovered.

    '
  source_artifact: tests/cassette/store.test.ts
