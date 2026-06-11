# muster documentation site

The [Astro](https://astro.build) + [Starlight](https://starlight.astro.build)
documentation site for muster, published to GitHub Pages at
<https://garrison-hq.github.io/muster>.

This is a standalone package (it is **not** part of the root `@garrison-hq/muster`
install, so it never affects the published npm package). Content lives in
`src/content/docs/` as Markdown/MDX.

## Local development

```sh
cd site
pnpm install
pnpm dev        # http://localhost:4321/muster
pnpm build      # static output → site/dist
```

## Deployment

The `.github/workflows/site.yml` workflow rebuilds and deploys on any push to
`main` that touches `site/**`. GitHub Pages must be enabled with **GitHub
Actions** as the source.
