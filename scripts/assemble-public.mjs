#!/usr/bin/env node
/*
 * assemble-public.mjs
 *
 * Builds the Firebase Hosting deploy artifact at ./public by combining:
 *   - The marketing landing + SEO surface at /
 *   - The Starlight build output (docs-site/dist/) at /docs/*
 *   - The blog Astro build output (blog-site/dist/) at /blog/*
 *
 * Both Astro projects set their own base path (`/docs` and `/blog`), so
 * the dist trees' internal asset URLs already point at the right roots.
 * We just copy each dist into its mount point under public/.
 *
 * Idempotent: clears ./public before assembling.
 */

import { existsSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const PUBLIC_DIR = resolve(REPO_ROOT, 'public');
const DOCS_DIST = resolve(REPO_ROOT, 'docs-site/dist');
const BLOG_DIST = resolve(REPO_ROOT, 'blog-site/dist');
const BENCHMARKS_DIST = resolve(REPO_ROOT, 'benchmarks-site/dist');

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
  if (!existsSync(DOCS_DIST)) {
    throw new Error(
      `docs-site build output not found at ${DOCS_DIST}. Run \`npm --prefix docs-site run build\` first.`,
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

  // 2. Copy the docs site into /docs/.
  copyRecursive(DOCS_DIST, join(PUBLIC_DIR, 'docs'));
  console.log(`[assemble-public] mounted docs-site/dist -> public/docs/`);

  // 3. Copy the blog site into /blog/, if it was built.
  // The blog build is optional during local dev; CI always builds it.
  if (existsSync(BLOG_DIST)) {
    copyRecursive(BLOG_DIST, join(PUBLIC_DIR, 'blog'));
    console.log(`[assemble-public] mounted blog-site/dist -> public/blog/`);
  } else {
    console.warn(`[assemble-public] WARNING: blog-site/dist not found — skipping /blog/`);
  }

  // 4. Copy the benchmarks site into /benchmarks/, if it was built.
  if (existsSync(BENCHMARKS_DIST)) {
    copyRecursive(BENCHMARKS_DIST, join(PUBLIC_DIR, 'benchmarks'));
    console.log(`[assemble-public] mounted benchmarks-site/dist -> public/benchmarks/`);
  } else {
    console.warn(`[assemble-public] WARNING: benchmarks-site/dist not found — skipping /benchmarks/`);
  }

  console.log(`[assemble-public] public/ assembled`);
}

main();
