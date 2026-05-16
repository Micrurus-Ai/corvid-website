#!/usr/bin/env node
/*
 * sync-playground-wasm.mjs
 *
 * Produces the playground's runtime artifacts under
 * playground-site/public/wasm/:
 *
 *   - corvid_browser_bg.wasm  — the typecheck-only WASM module
 *   - corvid_browser.js       — wasm-bindgen JS glue (--target web)
 *   - corvid_browser.d.ts     — TS types (informational, kept alongside)
 *   - examples.json           — snapshot of listExamples() output
 *
 * Why a snapshot of examples.json: the picker UI needs the example catalog
 * at HTML render time (server-side build), but listExamples() lives inside
 * the WASM module. We snapshot it once at build time by booting the wasm
 * in Node, calling listExamples(), and writing the JSON. The browser still
 * uses the WASM at runtime for check()/checkExample() — only the picker
 * grouping is pre-rendered.
 *
 * Build inputs:
 *   - `.corvid-source/` clone (managed by sync-docs.mjs; same shared clone)
 *   - cargo + wasm32-unknown-unknown target installed
 *   - wasm-bindgen-cli 0.2.120 (pinned to match the workspace's Cargo.lock)
 *
 * For CI without a Rust toolchain, the Rust side can publish a pre-built
 * artifact bundle to a GitHub Release; the script will pick that up
 * instead when the env var CORVID_BROWSER_RELEASE is set. Not wired yet —
 * stub for the future.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const PLAYGROUND_PUBLIC_WASM = resolve(REPO_ROOT, 'playground-site/public/wasm');
const CORVID_SOURCE = resolve(REPO_ROOT, '.corvid-source');
const CORVID_SOURCE_URL = 'https://github.com/Micrurus-Ai/Corvid-lang.git';

// Pin the wasm-bindgen CLI to match the workspace lockfile. If the upstream
// bumps wasm-bindgen, update this string in lockstep. The crate's README
// notes this contract — schema mismatches between the CLI and the workspace
// produce a loud error, not silent corruption.
const WASM_BINDGEN_VERSION = '0.2.120';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  if (r.status !== 0) {
    throw new Error(`[sync-playground-wasm] command failed: ${cmd} ${args.join(' ')}`);
  }
}

function runCapture(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf-8', shell: false, ...opts });
  if (r.status !== 0) {
    throw new Error(
      `[sync-playground-wasm] command failed: ${cmd} ${args.join(' ')}\n${r.stderr ?? ''}`,
    );
  }
  return r.stdout;
}

function ensureCorvidSource() {
  if (existsSync(CORVID_SOURCE)) {
    console.log('[sync-playground-wasm] .corvid-source/ exists — fetching latest main');
    run('git', ['fetch', '--depth', '1', 'origin', 'main'], { cwd: CORVID_SOURCE });
    run('git', ['checkout', 'FETCH_HEAD'], { cwd: CORVID_SOURCE });
    return;
  }
  console.log('[sync-playground-wasm] cloning Corvid-lang');
  mkdirSync(CORVID_SOURCE, { recursive: true });
  run('git', ['clone', '--depth', '1', CORVID_SOURCE_URL, CORVID_SOURCE]);
}

function ensureWasmBindgenCli() {
  // Check whether the right version is already installed.
  const r = spawnSync('wasm-bindgen', ['--version'], { encoding: 'utf-8', shell: false });
  if (r.status === 0 && r.stdout.trim().endsWith(WASM_BINDGEN_VERSION)) {
    console.log(`[sync-playground-wasm] wasm-bindgen ${WASM_BINDGEN_VERSION} already installed`);
    return;
  }
  console.log(`[sync-playground-wasm] installing wasm-bindgen-cli ${WASM_BINDGEN_VERSION}`);
  run('cargo', [
    'install',
    '-f',
    'wasm-bindgen-cli',
    '--version',
    WASM_BINDGEN_VERSION,
  ]);
}

function buildWasm() {
  console.log('[sync-playground-wasm] cargo build -p corvid-browser --target wasm32-unknown-unknown --release');
  run('cargo', [
    'build',
    '-p',
    'corvid-browser',
    '--target',
    'wasm32-unknown-unknown',
    '--release',
  ], { cwd: CORVID_SOURCE });
}

function bindgenForWeb() {
  const wasmIn = resolve(
    CORVID_SOURCE,
    'target/wasm32-unknown-unknown/release/corvid_browser.wasm',
  );
  if (!existsSync(wasmIn)) {
    throw new Error(`[sync-playground-wasm] expected ${wasmIn} after cargo build`);
  }
  // Clean the output dir before each run so deletes propagate.
  rmSync(PLAYGROUND_PUBLIC_WASM, { recursive: true, force: true });
  mkdirSync(PLAYGROUND_PUBLIC_WASM, { recursive: true });
  console.log('[sync-playground-wasm] wasm-bindgen --target web');
  run('wasm-bindgen', [
    '--out-dir',
    PLAYGROUND_PUBLIC_WASM,
    '--target',
    'web',
    wasmIn,
  ]);
}

async function snapshotExamples() {
  // Boot the same wasm under Node and call listExamples() so the picker can
  // pre-render at build time without shipping a second source of truth.
  // We re-run bindgen with --target nodejs into a scratch dir, then import.
  const SCRATCH = resolve(REPO_ROOT, '.playground-snapshot-tmp');
  const wasmIn = resolve(
    CORVID_SOURCE,
    'target/wasm32-unknown-unknown/release/corvid_browser.wasm',
  );
  rmSync(SCRATCH, { recursive: true, force: true });
  mkdirSync(SCRATCH, { recursive: true });
  run('wasm-bindgen', [
    '--out-dir',
    SCRATCH,
    '--target',
    'nodejs',
    wasmIn,
  ]);
  const modulePath = resolve(SCRATCH, 'corvid_browser.js');
  // Node's ESM loader on Windows requires a file:// URL for absolute paths.
  const mod = await import(pathToFileURL(modulePath).href);
  const catalogJs = mod.listExamples();
  // wasm-bindgen returns a plain JS object via serde-wasm-bindgen; structure
  // matches ExampleCatalog v1.
  const catalog = catalogJs;
  if (catalog?.version !== 'v1') {
    throw new Error(
      `[sync-playground-wasm] expected listExamples() version "v1", got ${JSON.stringify(catalog?.version)}`,
    );
  }
  const out = resolve(PLAYGROUND_PUBLIC_WASM, 'examples.json');
  writeFileSync(out, JSON.stringify(catalog, null, 2));
  console.log(`[sync-playground-wasm] wrote examples.json (${catalog.examples.length} examples)`);
  rmSync(SCRATCH, { recursive: true, force: true });
}

async function main() {
  if (process.env.CORVID_BROWSER_RELEASE) {
    throw new Error(
      `[sync-playground-wasm] CORVID_BROWSER_RELEASE pre-built artifact path not yet implemented`,
    );
  }
  ensureCorvidSource();
  ensureWasmBindgenCli();
  buildWasm();
  bindgenForWeb();
  await snapshotExamples();
  console.log('[sync-playground-wasm] done');
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
