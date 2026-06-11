# Security policy

muster is pre-1.0 software maintained by a small team. This file documents what
security reporting looks like in practice, so expectations are honest up front.

---

## Supported versions

Only the current `main` branch is actively maintained. There are no backported
fixes for prior tags. If you are running something older, the first step of any
security discussion will be "please upgrade."

| Version | Supported |
|---|---|
| `main` / latest release | Yes |
| Anything older | No |

---

## Reporting a vulnerability

**Do not open a public GitHub issue for a security-sensitive bug.**

Use GitHub's private vulnerability reporting:

> **Repository → Security → Report a vulnerability**

This routes to the maintainers' private advisory inbox. (An email contact may
be added here before a wider public announcement; until then, the GitHub flow
is the channel.)

Please include:

- A description of the issue and where in the code you believe it lives (file
  path + line number if you have one).
- The conditions under which it is exploitable.
- A minimal reproduction if you have one — a failing test case is ideal.
- Whether you've disclosed this anywhere else and your intended disclosure
  timeline.

---

## What happens next

- **Acknowledgement** within **7 calendar days** of the report.
- **Triage**: if confirmed, a rough severity and fix timeline within another
  **7 days**; most fixes land within **30 days** of acknowledgement.
- **Disclosure**: coordinated by default — a fix ships, a release is cut, and an
  advisory is published with credit to the reporter unless anonymity is
  requested. If 90 days pass without a fix you are free to disclose; please give
  notice first.

---

## Highest-risk surface

muster is primarily an offline static analysis tool, but two areas are genuine
trust boundaries and are where security review is most welcome:

### Reference resolution (`src/core/pipeline.ts`)

A Soul document's `composition.extends` / `composition.mixins` entries are
**references that muster reads from the filesystem with the invoking user's
permissions.** Checking an *untrusted* soul is therefore a trust boundary: a
hostile document can name `../../../../etc/passwd` (or an absolute path) and
muster will attempt to read it; the file's content may surface in a parse-error
diagnostic.

Mitigations already in place (see the README "Reference resolution" section):

- URI-scheme references (`https://`, `file://`, …) are rejected, not fetched.
- `--restrict-refs [dir]` confines resolution to a base directory; references
  that escape it (checked lexically, including absolute paths) are refused.
- Diagnostics from *referenced* documents are sanitized — position information
  is kept, raw source excerpts are withheld.

Known limitation: the containment check is **lexical**, so a symlink inside the
restricted directory that points outside it is not caught. Treat
`--restrict-refs` as defense-in-depth, not a sandbox, when checking fully
untrusted input. Reports of containment bypasses, additional disclosure
channels, or symlink-based escapes are in scope and welcome.

### Behavioral endpoint / credential handling (`src/core/behavioral/client.ts`)

The behavioral checker reads an API key from the environment
(`MUSTER_API_KEY`, falling back to `OPENAI_API_KEY`) and sends it to the
operator-configured OpenAI-compatible endpoint. The key must never appear in
argv, logs, transcripts, error messages, or committed results. A path that
leaks the key, or sends it to an unintended host, is a vulnerability. (That the
operator-supplied `--base-url` is trusted is by design — the operator chooses
the endpoint.)

---

## What does *not* qualify

Send these to a normal issue, not the security channel:

- "muster reads the file named in `extends`" — yes; that is the documented
  behavior. Use `--restrict-refs` for untrusted input.
- "muster sends my key to the `--base-url` I gave it" — that is the operator's
  chosen endpoint, a trust boundary by design.
- Resource use proportional to a large but well-formed input.

---

## Scope

This policy covers the muster codebase in this repository. It does **not**
cover upstream dependencies (report those to their maintainers), the vendored
Soul.md specification text (report spec issues upstream at
https://github.com/rokoss21/soul.md), or downstream forks.
