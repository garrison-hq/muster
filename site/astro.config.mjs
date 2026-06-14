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
        'Conformance harness for the agent-file stack: static validation and behavioral grading across Soul.md personas, Agent Skills, SOPs, tools, memory, heartbeat, A2A cards, and cross-layer composition.',
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
          items: [{ slug: 'getting-started' }, { slug: 'reference/layers' }],
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
