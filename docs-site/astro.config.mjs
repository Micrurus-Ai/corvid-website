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
      customCss: ['./src/styles/corvid.css', './src/styles/fonts.css'],
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
