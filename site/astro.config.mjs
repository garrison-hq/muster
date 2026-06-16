// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightBlog from 'starlight-blog';

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
      // Google Analytics 4 with Consent Mode v2. analytics_storage defaults to
      // denied, so until the visitor accepts in the consent banner GA sends no
      // cookies. The banner (see ConsentBanner.astro) updates consent to
      // granted on accept. Order matters: the default-denied call runs before
      // config so the first hit already respects the denied state.
      head: [
        {
          tag: 'script',
          content:
            "window.dataLayer=window.dataLayer||[];" +
            "function gtag(){dataLayer.push(arguments);}" +
            "gtag('consent','default',{analytics_storage:'denied'});",
        },
        {
          tag: 'script',
          attrs: {
            async: true,
            src: 'https://www.googletagmanager.com/gtag/js?id=G-VTTFT7JE73',
          },
        },
        {
          tag: 'script',
          // cookie_domain is pinned to the current host because *.github.io is
          // on the Public Suffix List: GA4's automatic domain detection picks an
          // invalid domain there and the browser rejects the _ga cookies.
          content:
            "gtag('js',new Date());" +
            "gtag('config','G-VTTFT7JE73',{cookie_domain:location.hostname});",
        },
      ],
      components: {
        // Renders the default footer plus the cookie consent banner, which
        // gates Google Analytics behind an explicit choice (see ConsentBanner).
        Footer: './src/components/Footer.astro',
      },
      plugins: [
        starlightBlog({
          authors: {
            jeroen: {
              name: 'Jeroen Nouws',
              title: 'Maintainer',
            },
          },
        }),
      ],
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
