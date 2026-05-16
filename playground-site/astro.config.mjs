import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://corvid-lang.org',
  base: '/playground',
  trailingSlash: 'never',
  vite: {
    // The corvid-browser WASM module + JS glue live under public/wasm/ and are
    // loaded at runtime via `import('/playground/wasm/corvid_browser.js')` and
    // a bare fetch for the .wasm. Don't try to pre-bundle them.
    assetsInclude: ['**/*.wasm'],
  },
});
