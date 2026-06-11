// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Deployed as a GitHub Pages project site, hence the /muster base path.
// When a custom domain arrives, change `site` and drop `base`.
export default defineConfig({
  site: 'https://garrison-hq.github.io',
  base: '/muster',
  integrations: [
    starlight({
      title: 'muster',
      description:
        'Reference CTS-1 conformance harness for Soul.md RFC-1: static validation, deterministic composition resolution, and behavioral conformance grading.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/garrison-hq/muster',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/garrison-hq/muster/edit/main/site/',
      },
      sidebar: [
        {
          label: 'Start here',
          items: [{ slug: 'getting-started' }],
        },
        {
          label: 'Guides',
          items: [
            { slug: 'guides/static-conformance' },
            { slug: 'guides/behavioral-conformance' },
            { slug: 'guides/reference-resolution' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { slug: 'reference/cli' },
            { slug: 'reference/cts-1-coverage' },
            { slug: 'reference/thresholds' },
            { slug: 'reference/architecture' },
          ],
        },
      ],
    }),
  ],
});
