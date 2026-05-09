import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const corvidGrammar = JSON.parse(
  readFileSync(resolve(__dirname, 'src/grammars/corvid.tmLanguage.json'), 'utf-8'),
);

const LANG_REPO = 'https://github.com/Micrurus-Ai/Corvid-lang';
const EDIT_BASE = `${LANG_REPO}/edit/main/docs/`;

export default defineConfig({
  site: 'https://corvid-lang.org',
  base: '/docs',
  trailingSlash: 'never',
  integrations: [
    starlight({
      title: 'Corvid Docs',
      description:
        'Corvid is a programming language where dangerous AI actions either compile with a proof or do not compile at all.',
      logo: {
        light: '../logos/corvid-mark.svg',
        dark: '../logos/corvid-mark.svg',
        replacesTitle: false,
      },
      social: { github: LANG_REPO },
      editLink: { baseUrl: EDIT_BASE },
      lastUpdated: true,
      // Load the same Google Fonts the landing page uses so docs typography
      // matches exactly (Source Serif 4, Source Sans 3, JetBrains Mono).
      // Injected into <head> directly because Vite strips bare @import url(https://...)
      // statements from bundled CSS.
      head: [
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' } },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,500;0,8..60,600;0,8..60,700;1,8..60,300;1,8..60,400&family=Source+Sans+3:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
          },
        },
      ],
      customCss: ['./src/styles/corvid.css'],
      expressiveCode: {
        themes: ['github-light', 'github-dark'],
        shiki: { langs: [corvidGrammar] },
        styleOverrides: {
          codeFontFamily: "'JetBrains Mono', ui-monospace, monospace",
          codeFontSize: '13px',
          borderRadius: '6px',
        },
      },
      pagefind: true,
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Overview', link: '/' },
            { slug: 'book/00-why-corvid' },
            { slug: 'book/01-install' },
            { slug: 'book/02-quickstart' },
            { slug: 'book/03-tutorial-refund-agent' },
          ],
        },
        { label: 'The Book', autogenerate: { directory: 'book' }, collapsed: true },
        { label: 'Guides', autogenerate: { directory: 'guides' } },
        { label: 'Recipes', autogenerate: { directory: 'recipes' } },
        { label: 'Reference', autogenerate: { directory: 'reference' }, collapsed: true },
        { label: 'Migration', autogenerate: { directory: 'migration' } },
        { label: 'Operations', autogenerate: { directory: 'operations' }, collapsed: true },
        { label: 'Security', autogenerate: { directory: 'security' } },
        { label: 'Internals', autogenerate: { directory: 'internals' }, collapsed: true },
        { label: 'Help', autogenerate: { directory: 'help' } },
        { label: 'Meta', autogenerate: { directory: 'meta' }, collapsed: true },
      ],
      components: {},
    }),
  ],
});
