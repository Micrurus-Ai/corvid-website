import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Same Corvid TextMate grammar the docs site uses (copied via sync).
// Single grammar source so highlighting can't drift between sites.
const corvidGrammar = JSON.parse(
  readFileSync(resolve(__dirname, 'src/grammars/corvid.tmLanguage.json'), 'utf-8'),
);

export default defineConfig({
  site: 'https://corvid-lang.org',
  base: '/blog',
  trailingSlash: 'never',
  integrations: [mdx()],
  markdown: {
    shikiConfig: {
      langs: [corvidGrammar],
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: false,
    },
  },
});
