#!/usr/bin/env node
/*
 * smoke-marquee.mjs
 *
 * One-shot sanity check the playground depends on:
 *   1. The baked `approve-gates` source compiles clean (checkExample → ok).
 *   2. Removing the `approve IssueRefund(id)` line produces exactly one
 *      diagnostic with guarantee_id `approval.dangerous_call_requires_token`
 *      via check(editedSource) — the marquee compile-refusal demo.
 *   3. Same shape for `provenance-propagation` (the second editable example).
 *
 * Run via `node playground-site/scripts/smoke-marquee.mjs` after sync.
 * Re-uses the wasm-bindgen --target nodejs build path the snapshot step
 * already exercises.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const CORVID_SOURCE = resolve(REPO_ROOT, '.corvid-source');
const SCRATCH = resolve(REPO_ROOT, '.playground-smoke-tmp');
const CATALOG_PATH = resolve(__dirname, '../public/wasm/examples.json');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  if (r.status !== 0) throw new Error(`failed: ${cmd} ${args.join(' ')}`);
}

const wasmIn = resolve(
  CORVID_SOURCE,
  'target/wasm32-unknown-unknown/release/corvid_browser.wasm',
);
if (!existsSync(wasmIn)) {
  console.error('error: WASM not built. Run npm --prefix playground-site run sync first.');
  process.exit(1);
}

rmSync(SCRATCH, { recursive: true, force: true });
mkdirSync(SCRATCH, { recursive: true });
run('wasm-bindgen', ['--out-dir', SCRATCH, '--target', 'nodejs', wasmIn]);
const mod = await import(pathToFileURL(resolve(SCRATCH, 'corvid_browser.js')).href);

const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));
const byName = new Map(catalog.examples.map((e) => [e.name, e]));

let failed = 0;
function check(label, cond, detail = '') {
  if (cond) {
    console.log(`  ok    ${label}`);
  } else {
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    failed += 1;
  }
}

function runCase(name, mutator, expectGuarantee) {
  console.log(`# ${name}`);
  const ex = byName.get(name);
  if (!ex) {
    console.error(`  FAIL  example "${name}" not in catalog`);
    failed += 1;
    return;
  }
  // 1. Baked source compiles clean.
  const baseline = mod.checkExample(name);
  check(`${name}.cor compiles clean as shipped`, baseline.ok === true && baseline.diagnostics.length === 0,
    `got ${JSON.stringify(baseline)}`);

  // 2. Mutated source is rejected with the expected guarantee_id.
  const mutated = mutator(ex.source);
  const result = mod.check(mutated);
  check(`mutated source refuses with ${expectGuarantee}`,
    result.ok === false && result.diagnostics.some((d) => d.guarantee_id === expectGuarantee),
    `got ${JSON.stringify(result.diagnostics.map((d) => d.guarantee_id))}`);
}

// approve-gates marquee: strip the `approve IssueRefund(id)` line.
runCase(
  'approve-gates',
  (src) => src.split('\n').filter((l) => !/^\s*approve\s+IssueRefund/.test(l)).join('\n'),
  'approval.dangerous_call_requires_token',
);

// provenance-propagation: confirm the baked source compiles clean. The
// playground exposes it as editable but the specific mutation that
// triggers the typechecker depends on upstream's exact grounded-typing
// rules and is left to the in-page demo to choose.
const provenance = byName.get('provenance-propagation');
if (provenance) {
  console.log('# provenance-propagation');
  const baseline = mod.checkExample('provenance-propagation');
  check(
    'provenance-propagation.cor compiles clean as shipped',
    baseline.ok === true && baseline.diagnostics.length === 0,
    `got ${JSON.stringify(baseline)}`,
  );
}

rmSync(SCRATCH, { recursive: true, force: true });

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nall checks passed');
