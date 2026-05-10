#!/usr/bin/env node
/*
 * sync-benchmarks.mjs
 *
 * Reads benchmark inputs from the upstream Corvid-lang clone (the same
 * .corvid-source/ that sync-docs.mjs populates) and emits two JSON files
 * for the /benchmarks Astro project to render:
 *
 *   benchmarks-site/src/data/moat.json
 *     - 5 sub-benchmarks under benches/moat/* (compile_time_rejection,
 *       governance_lines, provenance_preservation, replay_determinism,
 *       time_to_audit). For each, the "## Headline numbers" section of
 *       RESULTS.md is extracted as raw Markdown the page renders inline,
 *       plus a github_url permalink to the heading.
 *
 *   benchmarks-site/src/data/archives.json
 *     - Every benches/results/<date>-<name>/ directory that contains
 *       ratios.json gets a row. We embed the full parsed ratios.json so
 *       the archive page can present any subset of fields. Filter call:
 *       confirmed with maintainer on 2026-05-10 — surface ALL sessions
 *       that have ratios.json (no published-flag exists in the schema;
 *       the brief's name-based filter excluded most real data).
 *
 * Idempotent. Re-runs replace the output JSON files in place.
 *
 * Reuses .corvid-source/ if sync-docs already cloned it; otherwise
 * clones with the same shallow/branch logic as sync-docs.mjs.
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const SOURCE_REPO = process.env.CORVID_LANG_REPO ?? 'https://github.com/Micrurus-Ai/Corvid-lang.git';
const SOURCE_REF = process.env.CORVID_LANG_REF ?? 'main';
const CACHE_DIR = resolve(REPO_ROOT, '.corvid-source');
const SOURCE_BENCHES = join(CACHE_DIR, 'benches');
const OUT_DIR = resolve(REPO_ROOT, 'benchmarks-site/src/data');

const GITHUB_BLOB_BASE = `https://github.com/Micrurus-Ai/Corvid-lang/blob/${SOURCE_REF}/`;
const GITHUB_TREE_BASE = `https://github.com/Micrurus-Ai/Corvid-lang/tree/${SOURCE_REF}/`;

// The five moat benchmarks. Order matters — it's the display order on the page.
const MOAT_BENCHMARKS = [
  {
    id: 'compile_time_rejection',
    title: 'Compile-time rejection',
    description:
      'Bug classes that Corvid rejects at compile time and Python/TypeScript accept silently.',
  },
  {
    id: 'governance_lines',
    title: 'Governance line count',
    description:
      'Lines of code required to express the same agent safely in Corvid vs Python vs TypeScript.',
  },
  {
    id: 'provenance_preservation',
    title: 'Provenance preservation',
    description:
      'How often a model-derived string makes it into a downstream call without a citation.',
  },
  {
    id: 'replay_determinism',
    title: 'Replay determinism',
    description:
      'Whether re-running a captured trace produces byte-identical output across compilers, runtimes, hosts.',
  },
  {
    id: 'time_to_audit',
    title: 'Time to audit',
    description:
      'How long it takes a reviewer to confirm a specific safety property holds for a given agent.',
  },
];

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')} (exit ${r.status})`);
  }
}

function injectTokenIfPresent(url) {
  const token = process.env.CORVID_LANG_TOKEN;
  if (!token || !url.startsWith('https://github.com/')) return url;
  return url.replace('https://', `https://x-access-token:${token}@`);
}

function cloneOrFetch() {
  if (!existsSync(CACHE_DIR)) {
    console.log(`[sync-benchmarks] cloning ${SOURCE_REPO} (shallow, ref=${SOURCE_REF})...`);
    mkdirSync(CACHE_DIR, { recursive: true });
    run('git', ['clone', '--depth=1', '--branch', SOURCE_REF, injectTokenIfPresent(SOURCE_REPO), CACHE_DIR]);
  } else {
    console.log(`[sync-benchmarks] refreshing existing clone at ${CACHE_DIR}...`);
    run('git', ['-C', CACHE_DIR, 'fetch', '--depth=1', 'origin', SOURCE_REF]);
    run('git', ['-C', CACHE_DIR, 'reset', '--hard', `origin/${SOURCE_REF}`]);
  }
}

// Capture the "## Headline numbers" section of a RESULTS.md as raw
// Markdown — everything from after the heading up to the next ##
// heading or end of file.
const HEADLINE_RE = /^##\s+Headline[^\n]*\n([\s\S]*?)(?=^##\s|\Z)/m;

// Some benchmarks (governance_lines) don't have a single "## Headline
// numbers" section — instead they emit a section per app, each with
// its own table. For those, fall back to "everything from the first
// content paragraph after the intro blockquote up to '## Methodology'".
const METHODOLOGY_SECTION_RE = /^##\s+(Methodology|Method|Notes|Conventions|How we measured)\b/im;

function extractHeadlineMarkdown(content) {
  // Try the canonical "## Headline numbers" section first.
  const m = content.match(HEADLINE_RE);
  if (m) return m[1].trim();

  // Fallback: strip the H1 title and any leading blockquote intro lines,
  // then capture body up to the first methodology-ish section.
  let body = content
    .replace(/^#\s+[^\n]*\n+/, '')        // drop leading H1
    .replace(/^(>[^\n]*\n)+/gm, '')        // drop blockquote intro lines
    .replace(/^\s+/, '');                  // trim leading whitespace
  const cut = body.search(METHODOLOGY_SECTION_RE);
  if (cut >= 0) body = body.slice(0, cut);
  body = body.trim();
  return body || null;
}

function buildMoat() {
  const benchmarks = MOAT_BENCHMARKS.map((spec) => {
    const resultsPath = join(SOURCE_BENCHES, 'moat', spec.id, 'RESULTS.md');
    if (!existsSync(resultsPath)) {
      console.warn(`[sync-benchmarks] WARNING: ${spec.id}/RESULTS.md not found`);
      return { ...spec, missing: true };
    }
    const content = readFileSync(resultsPath, 'utf-8');
    const headline = extractHeadlineMarkdown(content);
    if (!headline) {
      console.warn(`[sync-benchmarks] WARNING: ${spec.id}/RESULTS.md has no "## Headline numbers" section`);
    }
    return {
      ...spec,
      github_url: `${GITHUB_BLOB_BASE}benches/moat/${spec.id}/RESULTS.md#headline-numbers`,
      github_dir_url: `${GITHUB_TREE_BASE}benches/moat/${spec.id}`,
      headline_markdown: headline,
    };
  });
  return {
    generated_at: new Date().toISOString(),
    source_ref: SOURCE_REF,
    benchmarks,
  };
}

function buildArchives() {
  const resultsRoot = join(SOURCE_BENCHES, 'results');
  if (!existsSync(resultsRoot)) {
    throw new Error(`benches/results/ not found at ${resultsRoot}`);
  }

  const sessions = [];
  for (const entry of readdirSync(resultsRoot)) {
    const sessionDir = join(resultsRoot, entry);
    if (!statSync(sessionDir).isDirectory()) continue;

    // Match dated session prefix: YYYY-MM-DD-<name>
    const dateMatch = entry.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
    if (!dateMatch) continue;
    const [, sessionDate, sessionName] = dateMatch;

    const ratiosPath = join(sessionDir, 'ratios.json');
    if (!existsSync(ratiosPath)) {
      // Filter: surface only sessions that have ratios.json (per maintainer
      // confirmation on 2026-05-10).
      continue;
    }

    let ratios;
    try {
      ratios = JSON.parse(readFileSync(ratiosPath, 'utf-8'));
    } catch (err) {
      console.warn(`[sync-benchmarks] WARNING: failed to parse ${entry}/ratios.json: ${err.message}`);
      continue;
    }

    // Optional README description for the session.
    const readmePath = join(sessionDir, 'README.md');
    let summary = null;
    if (existsSync(readmePath)) {
      const readme = readFileSync(readmePath, 'utf-8');
      const m = readme.match(/^#[^\n]*\n+([^\n#][^\n]*)/);
      summary = m ? m[1].trim() : null;
    }

    sessions.push({
      id: entry,
      date: sessionDate,
      name: sessionName,
      summary,
      github_url: `${GITHUB_TREE_BASE}benches/results/${entry}`,
      ratios_url: `${GITHUB_BLOB_BASE}benches/results/${entry}/ratios.json`,
      ratios,
    });
  }

  // Newest first by date, then by name for deterministic ordering.
  sessions.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.name < b.name ? -1 : 1;
  });

  return {
    generated_at: new Date().toISOString(),
    source_ref: SOURCE_REF,
    session_count: sessions.length,
    sessions,
  };
}

function main() {
  // Honor an env flag so this script can run against an already-cloned
  // source without re-fetching (useful in local dev when sync-docs ran
  // 30 seconds ago and we don't want a second clone).
  if (process.env.SKIP_CLONE !== '1') {
    cloneOrFetch();
  } else if (!existsSync(CACHE_DIR)) {
    throw new Error(`SKIP_CLONE=1 set but ${CACHE_DIR} doesn't exist`);
  }

  if (!existsSync(SOURCE_BENCHES)) {
    throw new Error(`benches/ tree not found at ${SOURCE_BENCHES}`);
  }

  // Ensure output directory exists (gitignored — benchmarks-site/src/data/).
  mkdirSync(OUT_DIR, { recursive: true });

  const moat = buildMoat();
  writeFileSync(join(OUT_DIR, 'moat.json'), JSON.stringify(moat, null, 2));
  console.log(
    `[sync-benchmarks] wrote moat.json — ${moat.benchmarks.length} benchmarks (${moat.benchmarks.filter((b) => b.headline_markdown).length} with headline numbers)`,
  );

  const archives = buildArchives();
  writeFileSync(join(OUT_DIR, 'archives.json'), JSON.stringify(archives, null, 2));
  console.log(`[sync-benchmarks] wrote archives.json — ${archives.session_count} sessions`);
}

main();
