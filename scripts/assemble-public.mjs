#!/usr/bin/env node
/*
 * assemble-public.mjs
 *
 * Builds the Firebase Hosting deploy artifact at ./public by combining:
 *   - The marketing landing (index.html, assets/, logos/, social/) at /
 *   - The Starlight build output (docs-site/dist/) at /docs/*
 *
 * Astro is configured with `base: '/docs'`, so the dist tree's internal asset
 * URLs already point at /docs/_astro/..., /docs/book/..., etc. We just copy
 * dist/* into public/docs/* and the URLs line up with what Firebase serves.
 *
 * Idempotent: clears ./public before assembling.
 */

import { existsSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const PUBLIC_DIR = resolve(REPO_ROOT, 'public');
const DIST_DIR = resolve(REPO_ROOT, 'docs-site/dist');

// Top-level files/dirs that make up the marketing landing + SEO surface.
const LANDING_ENTRIES = [
  'index.html',
  'assets',
  'logos',
  'social',
  'robots.txt',
  'sitemap.xml',
];

function copyRecursive(src, dst) {
  if (!existsSync(src)) return;
  const isDir = statSync(src).isDirectory();
  if (isDir) {
    mkdirSync(dst, { recursive: true });
    for (const entry of readdirSync(src)) {
      copyRecursive(join(src, entry), join(dst, entry));
    }
  } else {
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
  }
}

function main() {
  if (!existsSync(DIST_DIR)) {
    throw new Error(
      `Starlight build output not found at ${DIST_DIR}. Run \`npm --prefix docs-site run build\` first.`,
    );
  }

  // Clean public/ entirely so deletes upstream propagate.
  if (existsSync(PUBLIC_DIR)) {
    rmSync(PUBLIC_DIR, { recursive: true, force: true });
  }
  mkdirSync(PUBLIC_DIR, { recursive: true });

  // 1. Copy the landing.
  for (const entry of LANDING_ENTRIES) {
    const src = resolve(REPO_ROOT, entry);
    if (!existsSync(src)) {
      console.warn(`[assemble-public] WARNING: landing entry '${entry}' not found, skipping`);
      continue;
    }
    copyRecursive(src, join(PUBLIC_DIR, entry));
  }

  // 2. Copy the Starlight build into /docs/.
  copyRecursive(DIST_DIR, join(PUBLIC_DIR, 'docs'));

  console.log(`[assemble-public] public/ assembled (landing + docs/)`);
}

main();
