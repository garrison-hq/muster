# Contributing to muster

muster is a reference **CTS-1 conformance harness** for [Soul.md
RFC-1](https://github.com/rokoss21/soul.md). It is maintained alongside other
work, so response times are measured in days to weeks. Contributions are
welcome; this document explains how to make them land smoothly.

The guiding principle: **the vendored spec is the law.** Every conformance
behavior in muster traces to a section of `.kittify/reference/soul-spec.md`
(RFC-1 `1.0.0-rc1`). If your change alters how a Soul document is validated or
resolved, it must cite the section that requires the change — in the code, in
the test name, and in the PR.

---

## Before you start

Read, in order:

1. [`README.md`](./README.md) — what muster does and how to run it.
2. The relevant section(s) of the vendored spec at
   `.kittify/reference/soul-spec.md`. This is the single source of truth for
   all conformance behavior.
3. The planning trail under
   [`kitty-specs/`](./kitty-specs) — muster was built with a spec-driven
   workflow; the spec/plan/tasks/mission-review documents record *why* the
   design is the way it is. Most "wouldn't it be cleaner if…" ideas are
   already answered in a mission-review or a locked constraint.

---

## Open an issue first

For anything beyond an obvious typo or a one-line bug fix, **open an issue
before a PR**. The issue templates in
[`.github/ISSUE_TEMPLATE/`](./.github/ISSUE_TEMPLATE) cover the three common
shapes: bug reports, feature proposals, and spec/design questions. Pick the
closest fit.

A spec-conformance bug ("muster accepts a document RFC-1 §X says it must
reject") is the most valuable kind of report — include the offending Soul
document and the section number.

---

## Architecture rules (non-negotiable)

These are load-bearing invariants. A PR that breaks one will be asked to change
regardless of whether tests pass:

- **Spec-agnostic core.** Nothing under `src/core/` may import from
  `src/adapters/`. The core is parameterized by a `SpecAdapter`; RFC-1 is the
  first adapter. A second spec must be addable as a new adapter without touching
  the core. This is enforced by a test in `tests/unit/invariants.test.ts`.
- **Determinism.** Static resolution is byte-for-byte reproducible (RFC 8785
  canonical JSON). No `Date.now()`, no `Math.random()`, no map-iteration-order
  dependence in resolution or grading paths.
- **No baked-in providers or credentials.** The behavioral checker talks to any
  OpenAI-compatible endpoint; the API key is read from the environment at
  request time. No key flag, no key file, no provider hardcoded. The
  `tests/unit/invariants.test.ts` guards scan for committed secrets.
- **Minimal dependencies.** Runtime deps are `ajv`, `commander`, `yaml`. Adding
  a direct runtime dependency requires a justification paragraph in the PR
  explaining what it does, why the standard library or an existing dep is
  insufficient, and what alternatives were considered.

---

## Code rules

- **TypeScript strict, Node ≥ 22, pnpm.** `pnpm build` (which runs `tsc` in
  strict mode) must pass with zero errors.
- **Tests are required and cite the spec.** New conformance behavior gets a
  test whose name references the RFC-1 section it covers (e.g.
  `"§8.1 lists replace, never union"`). The CTS fixture suite
  (`tests/cts/suite.test.ts` over `cts/manifest.yaml`) is the primary
  acceptance surface.
- **Fixtures are data, computed by hand.** `expected.json` files are canonical
  JSON authored by applying the spec's rules manually — never by capturing
  whatever the implementation currently emits. A test that "passes because the
  code produced it" proves nothing.
- **Comments explain *why*, not *what*.** Well-named identifiers already say
  what. Reserve comments for invariants, spec-section rationale, and behavior
  that would surprise a reader.
- **Scope discipline.** A bug fix is the smallest change that fixes the bug. No
  bundled "while I'm here" refactors — they make review slower and are the most
  common reason a PR stalls.

Run before pushing:

```bash
pnpm build      # tsc strict — must be clean
pnpm test       # full suite incl. the CTS fixture suite — must be green, runs offline
```

---

## Commit messages

```
short imperative subject (≤72 chars)

WHY the change is needed, not what the code does. Cite the RFC-1
section if the change is conformance-relevant (e.g. "§20.1 state.base
fallback must use raw UTF-8 byte order, not localeCompare").

If a new runtime dependency is added, justify it here.
```

One logical change per commit.

---

## Pull request checklist

The [PR template](./.github/pull_request_template.md) asks you to confirm:

- [ ] Linked issue (or an explanation why it didn't need one).
- [ ] `pnpm build` (tsc strict) and `pnpm test` pass locally.
- [ ] New/changed conformance behavior cites its RFC-1 section in code and test
  names.
- [ ] No new runtime dependency without justification.
- [ ] No core→adapter import introduced; no committed secrets.
- [ ] Docs updated in the same PR if behavior changed (README, and the relevant
  spec/plan if you're working inside a mission).

---

## Contributor License terms

Contributions are accepted under the **Apache License 2.0**, the same license
as the project (see [`LICENSE`](./LICENSE)). By opening a PR you confirm you
have the right to contribute the code under these terms. There is no CLA and no
DCO sign-off required — just don't submit code or specification text you don't
have the right to license this way. In particular, do not add third-party
specification or fixture text without confirming its license permits
redistribution and adding the attribution to [`NOTICE`](./NOTICE).

---

## Code of conduct

This project follows the Contributor Covenant 2.1. See
[`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## Security issues

**Do not open a public issue for a security-sensitive bug.** See
[`SECURITY.md`](./SECURITY.md) for the private reporting path.
