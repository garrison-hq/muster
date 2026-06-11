---
name: Bug report
about: muster does the wrong thing — a crash, a wrong verdict, or a conformance mismatch.
title: "[bug] "
labels: bug
---

## What happened

<!-- One or two sentences. What did you observe? -->

## What you expected

<!-- One sentence. What should have happened instead? If this is a conformance
     bug, cite the RFC-1 section: "§25.2 cat. 3 says percent fields out of
     0..100 MUST fail in strict mode, but muster accepted verbosity: 142." -->

## Reproduction

Minimal steps from a fresh clone. The closer to a shell transcript, the better.
If the bug involves a specific Soul document, paste a **minimal** one inline.

```bash
git clone https://github.com/garrison-hq/muster
cd muster
pnpm install && pnpm build
node dist/cli/index.js check path/to/Soul.md
# ...
```

```yaml
# minimal Soul.md (or fixture) that triggers it, if applicable
```

## Output

<!-- The actual command output. Use --json for the machine-readable report.
     Scrub anything sensitive. -->

```
```

## Environment

- muster commit / version: <!-- git rev-parse HEAD, or the npm version -->
- OS: <!-- e.g. Linux 6.19 Fedora 43, macOS 15 -->
- Node version: <!-- node --version -->
- pnpm version: <!-- pnpm --version -->
- Command: <!-- check | resolve | cts run | behave run; mode strict/permissive -->

## Additional context

<!-- Hypothesis, related issues, the relevant spec section if you found it. -->
