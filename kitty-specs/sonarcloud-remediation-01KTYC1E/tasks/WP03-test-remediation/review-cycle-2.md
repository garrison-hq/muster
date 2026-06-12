---
affected_files: []
cycle_number: 2
mission_slug: sonarcloud-remediation-01KTYC1E
reproduction_command:
reviewed_at: '2026-06-12T19:14:43Z'
reviewer_agent: unknown
verdict: rejected
wp_id: WP03
---

# WP03 Review — Cycle 1 (changes requested)

Overall the WP is very close: build passes, full suite is 567/567 with 0 skips,
no `src/` files touched, only the 7 owned test files changed, test counts per
file are byte-identical to the base, and almost every change is a clean
mechanical remediation. The S5443 mkdtemp/tmpdir path fix, the S2871 code-unit
comparator (applied to BOTH sides of the `.toEqual`), the S7784 acceptances
(all three feed `validateReport(...)` of the JSON-serialized form — genuine
round-trip/schema semantics, not plain clones), the http-fixture decisions
(`override.local` → https for the flag-plumbing test; `127.0.0.1:9` loopback
kept as http), the S6551 cast (`init.body` is `JSON.stringify(...)` in
`src/core/behavioral/client.ts`, so the cast is sound), the `suite.test.ts:108`
`continue` guard (provably unreachable — `rerunResults` ids are a subset of
`resultById`, and `expect(first).toBeDefined()` on the prior line already fails
the test if `first` is undefined; it is a pure type-narrowing guard that skips
no assertion), and every String.raw conversion (value-preserving; the `:546`
quadruple-backslash accept and `:617` conversion are both correct) all check
out.

There is ONE blocking issue.

---

**Issue 1 — `tests/unit/cli.test.ts:331` (T015, ReDoS hotspot): the regex
replacement loosens the assertion.**

Base assertion (cli.test.ts, "Appendix F: the full CTS-1 manifest passes →
exit 0 with summary line"):

```ts
expect(stdout).toMatch(/\d+ passed, 0 failed of \d+\n$/);
```

Current replacement:

```ts
expect(stdout.includes(" passed, 0 failed of ")).toBe(true);
expect(stdout.endsWith("\n")).toBe(true);
```

This weakens what the test verifies in two ways, both of which the original
regex enforced:

1. **Digit anchoring lost.** The original required a `\d+` run immediately
   before " passed" and immediately after "of " (the count and total). The
   substring check would now pass on malformed output such as
   `"abc passed, 0 failed of xyz"`.
2. **End-of-output anchoring lost.** The original `...\n$` pinned the summary
   line to the END of stdout. `stdout.endsWith("\n")` only checks the final
   char is a newline; arbitrary content could appear between the summary line
   and that newline and the test would still pass.

This is the WP's central reject-criterion ("no assertion may be loosened; the
suite must stay exactly as strong"). The original regex is also not actually
catastrophic-backtracking (the two `\d+` are separated by required literal
text), but the fix still must close the Sonar finding WITHOUT loosening.

**Required change**: restore strict matching while satisfying the hotspot.
Easiest strictness-preserving option is to pin and parse the last line, e.g.:

```ts
const lastLine = stdout.split("\n").at(-1) === "" ? stdout.split("\n").at(-2) : ...;
```

or, more simply, keep a *linear* regex that still anchors digits and the line
end (a non-backtracking pattern is acceptable — the original is already
linear), or assert the exact final line:

```ts
const summary = stdout.trimEnd().split("\n").at(-1) ?? "";
expect(summary).toMatch(/^\d+ passed, 0 failed of \d+$/);
expect(stdout.endsWith("\n")).toBe(true);
```

The point is: the digit-runs and the summary-line-at-end-of-output must remain
verified, exactly as the base test did.

---

No other findings. Once Issue 1 restores strict matching (digits + end
anchoring) for the CTS summary line, this WP is approvable.
