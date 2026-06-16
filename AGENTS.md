# AGENTS.md

Operating notes for anyone (human or agent) making changes in this repo. For
the full contributor guide see [CONTRIBUTING.md](./CONTRIBUTING.md); this file
is the short version plus the conventions that are easy to get wrong.

## Build and test

This is a pnpm workspace. Node 22 is required.

```sh
pnpm install
pnpm build        # tsc strict; also copies the rfc1 schema into dist
pnpm test         # vitest, the full suite
pnpm typecheck    # tsc --noEmit
```

The docs site lives in `site/` and is built separately:

```sh
cd site && pnpm install && pnpm build
```

## Commits and releases

Commits use [Conventional Commits](https://www.conventionalcommits.org/). Pull
requests are squash-merged, so the PR title becomes the commit on `main` and is
what `semantic-release` reads to decide the next version.

What each type does on `main`:

- `feat:` cuts a minor release.
- `fix:` and `perf:` cut a patch release.
- `docs:`, `ci:`, `chore:`, `test:`, `refactor:`, `style:` do not release.

### Scope changes to the site and blog so they do not release

The npm package ships only what the `files` whitelist in `package.json` lists:
`dist`, `src`, `cts`, `souls`, `behave/voice-frontdesk.yaml`, `examples`,
`README.md`, `LICENSE`, `NOTICE`. The docs site (`site/`) and the blog
(`blog/`) are not in the package, so a change to them never changes what npm
publishes.

`semantic-release` decides from the commit message, not from which files
changed, so an unscoped `fix:` on a site-only change still publishes a new npm
version that is identical to the last one. To avoid that, scope non-shipping
changes:

- `site/` changes use the `site` scope: `fix(site):`, `feat(site):`, `docs(site):`.
- `blog/` changes use the `blog` scope: `docs(blog):`, `fix(blog):`.
- Anything else you want to keep out of a release can use the `no-release`
  scope, for example `chore(no-release):`.

These scopes are configured as no-release in `.releaserc.json`, so they never
cut a version. Shipped code keeps releasing as normal: use an unscoped `fix:`
or `feat:`, or a source-area scope like `fix(core)` or `feat(adapter)`.

## A few hard rules

- No `src/core/` file may import from `src/adapters/`. The core is
  spec-agnostic. A test guards this.
- No secrets in the repo. API keys are read from environment variables at
  request time only. A test scans for committed secret-shaped strings.
- One logical change per commit, and explain why in the body, not what.
