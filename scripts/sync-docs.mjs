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
import { dirname, join, relative, resolve, basename, posix } from 'node:path';
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

    // Compute the file's directory relative to docs/ root (POSIX form, for
    // link resolution). Top-level files have fileDir === '.'.
    const fileRelToDocs = relative(SOURCE_DOCS, srcPath).split(/[\\/]/).join('/');
    const fileDir = posix.dirname(fileRelToDocs);

    const withFrontmatter = ensureFrontmatter(content, srcPath);
    const withRewrittenLinks = rewriteMarkdownLinks(withFrontmatter, fileDir);
    writeFileSync(dstPath, withRewrittenLinks);
  }
}

// Top-level directories that legitimately exist inside docs/. Anything else
// at the docs-tree root (e.g. crates/, ROADMAP.md, .github/) is repo-level
// content and should redirect to GitHub instead of staying as a relative
// link that resolves to a 404 on the website.
const DOCS_TOP_DIRS = new Set([
  'book', 'guides', 'recipes', 'reference', 'migration', 'operations',
  'security', 'internals', 'help', 'meta',
]);
const GITHUB_BASE = 'https://github.com/Micrurus-Ai/Corvid-lang/blob/main/';

// Rewrite all Markdown link targets in the file body. Image syntax (`![alt](src)`)
// is left untouched so synced image assets keep working.
function rewriteMarkdownLinks(content, fileDir) {
  return content.replace(
    /(^|[^!])(\[(?:[^\]\\]|\\.)*\])\(([^()\s]+)(\s+"[^"]*")?\)/g,
    (_match, prefix, textPart, target, titlePart = '') => {
      const newTarget = rewriteLinkTarget(target, fileDir);
      return `${prefix}${textPart}(${newTarget}${titlePart})`;
    },
  );
}

function rewriteLinkTarget(target, fileDir) {
  // Skip absolute URLs, schemes, anchors, root-relative paths.
  if (/^(https?:\/\/|mailto:|tel:|#|\/|data:|ftp:)/i.test(target)) return target;

  const hashIdx = target.indexOf('#');
  const pathPart = hashIdx >= 0 ? target.slice(0, hashIdx) : target;
  const anchorSuffix = hashIdx >= 0 ? target.slice(hashIdx) : '';

  if (!pathPart) return target;
  // Skip pure query-string links — they don't fit our rewrite model.
  if (pathPart.startsWith('?')) return target;

  // Resolve under a sentinel so ../ traversals above docs/ are detectable.
  const SENTINEL = '__DOCS__';
  const fileDirNorm = fileDir === '.' ? '' : fileDir;
  const resolved = posix.normalize(posix.join(SENTINEL, fileDirNorm, pathPart));

  // Path escaped above docs/ via ../ — point at GitHub source.
  if (!resolved.startsWith(`${SENTINEL}/`) && resolved !== SENTINEL) {
    return `${GITHUB_BASE}${resolved}${anchorSuffix}`;
  }

  let webPath = resolved === SENTINEL ? '' : resolved.slice(SENTINEL.length + 1);

  // First-segment check: a path that stays inside the docs/ tree but whose
  // first segment isn't a known docs subdirectory (book, guides, …) is
  // repo-rooted content masquerading as docs (e.g. `../../crates/foo.rs`
  // resolves to `crates/foo.rs`, `../../ROADMAP.md` resolves to `ROADMAP.md`).
  // Only README/index at the docs root is a legitimate "docs landing" target.
  const firstSeg = webPath.split('/')[0];
  const isReadmeOrIndex = /^(README|index)(\.mdx?)?$/i.test(webPath);
  if (
    firstSeg &&
    !DOCS_TOP_DIRS.has(firstSeg) &&
    !isReadmeOrIndex
  ) {
    return `${GITHUB_BASE}${webPath}${anchorSuffix}`;
  }

  // Non-markdown extension (e.g. `.cor`, `.rs`, `.toml`) → source code, not
  // a docs page. Point at GitHub so it renders in the source viewer.
  const extMatch = webPath.match(/\.([a-z0-9]+)$/i);
  if (extMatch && !/^mdx?$/i.test(extMatch[1])) {
    return `${GITHUB_BASE}docs/${webPath}${anchorSuffix}`;
  }

  // Existence check: if the upstream file/dir doesn't exist, the link is a
  // content typo. Fall back to GitHub blob view so the reader at least
  // lands on something real instead of a 404 in the docs site.
  if (!resolvedExistsInDocs(webPath)) {
    return `${GITHUB_BASE}docs/${webPath}${anchorSuffix}`;
  }

  // In-docs path: strip .md/.mdx, collapse README/index to its directory.
  webPath = webPath.replace(/\.mdx?$/i, '');
  webPath = webPath.replace(/(^|\/)README$/i, '$1');
  webPath = webPath.replace(/(^|\/)index$/i, '$1');
  webPath = webPath.replace(/\/+$/, '');

  // Mirror Astro's content-collection slug normalization on each path
  // segment: lowercase + strip periods (so `v1.0-demo-script.md` resolves
  // to `v10-demo-script`, matching the route Astro emits).
  webPath = webPath.split('/').map(astroSlug).join('/');

  if (!webPath) return `/docs${anchorSuffix}`;
  return `/docs/${webPath}${anchorSuffix}`;
}

// Astro's content collection slug-from-filename rules (observed):
// lowercase, strip periods. Other punctuation is preserved.
function astroSlug(seg) {
  return seg.toLowerCase().replace(/\./g, '');
}

// Check whether a path (relative to docs/ root) corresponds to a renderable
// docs page upstream. A bare directory with no markdown does NOT count —
// Astro can't generate a route for it. Valid only if any of:
//   - <path>.md / <path>.mdx exists (extension stripped in author's link)
//   - <path>/README.md or <path>/index.md exists (directory landing)
function resolvedExistsInDocs(webPath) {
  const base = join(SOURCE_DOCS, webPath);
  if (existsSync(base + '.md')) return true;
  if (existsSync(base + '.mdx')) return true;
  if (existsSync(join(base, 'README.md'))) return true;
  if (existsSync(join(base, 'index.md'))) return true;
  return false;
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
