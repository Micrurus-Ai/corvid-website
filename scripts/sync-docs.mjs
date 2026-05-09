#!/usr/bin/env node
/*
 * sync-docs.mjs
 *
 * Pulls the docs tree from Micrurus-Ai/Corvid-lang into docs-site/src/content/docs/
 * so Starlight can render it. Runs before `astro dev` and `astro build`.
 *
 * - Excludes docs/phases/ (historical engineering records, not user-facing).
 * - Renames each section's README.md to index.md so Starlight serves it as the
 *   section landing page (e.g. /docs/book/ comes from book/README.md).
 * - Injects `title:` frontmatter from the first H1 on any file that lacks it
 *   (Starlight requires title; not every upstream md has frontmatter yet).
 *
 * Source-of-truth for content lives at:
 *   https://github.com/Micrurus-Ai/Corvid-lang/tree/main/docs
 *
 * Auth: public repo expected. If you hit rate limits or transition the repo to
 * private, set CORVID_LANG_TOKEN to a GitHub PAT with `contents:read`.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join, relative, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const SOURCE_REPO = process.env.CORVID_LANG_REPO ?? 'https://github.com/Micrurus-Ai/Corvid-lang.git';
const SOURCE_REF = process.env.CORVID_LANG_REF ?? 'main';
const CACHE_DIR = resolve(REPO_ROOT, '.corvid-source');
const SOURCE_DOCS = join(CACHE_DIR, 'docs');
const TARGET_DOCS = resolve(REPO_ROOT, 'docs-site/src/content/docs');

const EXCLUDED_DIRS = new Set(['phases']);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')} (exit ${r.status})`);
  }
}

function cloneOrFetch() {
  if (!existsSync(CACHE_DIR)) {
    console.log(`[sync-docs] cloning ${SOURCE_REPO} (shallow, ref=${SOURCE_REF})...`);
    mkdirSync(CACHE_DIR, { recursive: true });
    const url = injectTokenIfPresent(SOURCE_REPO);
    run('git', ['clone', '--depth=1', '--branch', SOURCE_REF, url, CACHE_DIR]);
  } else {
    console.log(`[sync-docs] refreshing existing clone at ${CACHE_DIR}...`);
    run('git', ['-C', CACHE_DIR, 'fetch', '--depth=1', 'origin', SOURCE_REF]);
    run('git', ['-C', CACHE_DIR, 'reset', '--hard', `origin/${SOURCE_REF}`]);
  }
}

function injectTokenIfPresent(url) {
  const token = process.env.CORVID_LANG_TOKEN;
  if (!token || !url.startsWith('https://github.com/')) return url;
  return url.replace('https://', `https://x-access-token:${token}@`);
}

function clearTarget() {
  if (existsSync(TARGET_DOCS)) {
    rmSync(TARGET_DOCS, { recursive: true, force: true });
  }
  mkdirSync(TARGET_DOCS, { recursive: true });
}

function walkAndCopy(srcRoot, dstRoot) {
  const entries = readdirSync(srcRoot);
  for (const entry of entries) {
    const srcPath = join(srcRoot, entry);
    const isDir = statSync(srcPath).isDirectory();

    if (isDir && EXCLUDED_DIRS.has(entry) && srcRoot === SOURCE_DOCS) {
      console.log(`[sync-docs] excluded ${relative(SOURCE_DOCS, srcPath)}`);
      continue;
    }

    if (isDir) {
      const dstSubdir = join(dstRoot, entry);
      mkdirSync(dstSubdir, { recursive: true });
      walkAndCopy(srcPath, dstSubdir);
      continue;
    }

    if (!entry.endsWith('.md') && !entry.endsWith('.mdx')) {
      // Copy non-markdown assets (diagrams, images) verbatim.
      copyFileSync(srcPath, join(dstRoot, entry));
      continue;
    }

    const dstName = basename(entry).toLowerCase() === 'readme.md' ? 'index.md' : entry;
    const dstPath = join(dstRoot, dstName);
    const content = readFileSync(srcPath, 'utf-8');
    writeFileSync(dstPath, ensureFrontmatter(content, srcPath));
  }
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const H1_RE = /^#\s+(.+?)\s*$/m;

function ensureFrontmatter(content, srcPath) {
  const fm = content.match(FRONTMATTER_RE);
  const h1 = content.match(H1_RE);
  const titleFromH1 = h1 ? h1[1].trim() : basename(srcPath, '.md').replace(/^\d+-/, '').replace(/-/g, ' ');

  if (fm) {
    if (/^title:\s/m.test(fm[1])) return content;
    const injected = `---\ntitle: ${escapeYamlString(titleFromH1)}\n${fm[1]}\n---\n${content.slice(fm[0].length)}`;
    return injected;
  }

  // No frontmatter — add a minimal block. Strip the first H1 since Starlight
  // renders the title from frontmatter (avoids a duplicate H1).
  const stripped = h1 ? content.replace(H1_RE, '').replace(/^\r?\n+/, '') : content;
  return `---\ntitle: ${escapeYamlString(titleFromH1)}\n---\n\n${stripped}`;
}

function escapeYamlString(s) {
  if (/[:#"'\n]/.test(s)) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}

function main() {
  cloneOrFetch();
  if (!existsSync(SOURCE_DOCS)) {
    throw new Error(`Source docs not found at ${SOURCE_DOCS}. Has the upstream repo's docs/ tree moved?`);
  }
  clearTarget();
  walkAndCopy(SOURCE_DOCS, TARGET_DOCS);
  console.log(`[sync-docs] copied docs/ → ${relative(REPO_ROOT, TARGET_DOCS)}`);
}

main();
