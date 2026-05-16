/**
 * Playground runtime. Hooks the pre-rendered DOM to live behavior:
 *
 * - Picker clicks → swap source view / metadata / terminal placeholder.
 * - "Check" button → lazy-load corvid-browser WASM, call checkExample()
 *   (read-only mode) or check(source) (editable mode), render the
 *   resulting CheckResult into the terminal panel.
 * - Marquee examples (approve-gates, provenance-propagation) replace the
 *   read-only source view with an editable <textarea>; edits trigger a
 *   debounced 300ms re-check via check(source). Reset restores the baked
 *   source so a fresh visitor always sees a green initial state.
 *
 * Wire schemas match `docs/meta/playground-examples-contract.md`:
 *   ExampleCatalog v1, CheckResult v1.
 */

type Severity = 'error' | 'warning' | 'info';

interface Span {
  start_line: number;
  start_col: number;
  end_line: number;
  end_col: number;
}

interface Diagnostic {
  guarantee_id: string;
  severity: Severity;
  message: string;
  span: Span;
  help: string | null;
}

interface CheckResult {
  version: 'v1';
  ok: boolean;
  diagnostics: Diagnostic[];
}

interface ClientExample {
  name: string;
  title: string;
  category: string;
  pitch: string;
  source: string;
  highlightedSource: string;
  spec_path: string;
  non_scope: string;
  tier: 1 | 2;
  editable: boolean;
}

// The wasm-bindgen --target web glue exposes a default `init(url)` to load
// the .wasm and named exports for each #[wasm_bindgen] function. We type
// just what we call.
interface CorvidBrowser {
  default: (input?: { module_or_path?: string | URL } | string | URL) => Promise<unknown>;
  check: (source: string) => CheckResult;
  checkExample: (name: string) => CheckResult;
}

const PLAYGROUND_BASE = '/playground';
const WASM_GLUE_URL = `${PLAYGROUND_BASE}/wasm/corvid_browser.js`;
const WASM_BIN_URL = `${PLAYGROUND_BASE}/wasm/corvid_browser_bg.wasm`;
const GUARANTEES_BASE = '/docs/reference/guarantees';

let cb: CorvidBrowser | null = null;
let cbLoading: Promise<CorvidBrowser> | null = null;

async function loadCorvidBrowser(): Promise<CorvidBrowser> {
  if (cb) return cb;
  if (cbLoading) return cbLoading;
  cbLoading = (async () => {
    const mod = (await import(/* @vite-ignore */ WASM_GLUE_URL)) as CorvidBrowser;
    await mod.default(WASM_BIN_URL);
    cb = mod;
    return mod;
  })();
  return cbLoading;
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`playground: missing element #${id}`);
  return el;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function specUrlFor(spec_path: string): string {
  return `https://github.com/Micrurus-Ai/Corvid-lang/blob/main/${spec_path}`;
}

function readCatalog(): ClientExample[] {
  const tag = document.getElementById('pg-catalog');
  if (!tag) throw new Error('playground: missing #pg-catalog');
  return JSON.parse(tag.textContent ?? '[]') as ClientExample[];
}

interface State {
  catalog: ClientExample[];
  current: ClientExample;
  editedSource: string | null; // null = baked source unchanged
  editor: HTMLTextAreaElement | null;
  debounceTimer: number | null;
}

const state: State = {
  catalog: [],
  current: undefined as unknown as ClientExample,
  editedSource: null,
  editor: null,
  debounceTimer: null,
};

function setStatus(text: string, dot: 'idle' | 'loading' | 'ok' | 'err') {
  $('pg-status-text').textContent = text;
  $('pg-status-dot').dataset.state = dot;
}

function renderTerminal(name: string, source: string, result: CheckResult | { error: string }) {
  const term = $('pg-terminal');
  const cmd = `<span class="pg-term-line"><span class="pg-term-prompt">$ </span>corvid check ${escapeHtml(name)}.cor</span>`;
  if ('error' in result) {
    term.innerHTML =
      cmd +
      `<span class="pg-term-line pg-term-status-err">  failed: ${escapeHtml(result.error)}</span>`;
    return;
  }
  const lines: string[] = [cmd];
  if (result.ok && result.diagnostics.length === 0) {
    lines.push(
      `<span class="pg-term-line pg-term-status-ok">  compiles ✓  (zero diagnostics, ${countLines(source)} source lines)</span>`,
    );
  } else {
    const errors = result.diagnostics.filter((d) => d.severity === 'error').length;
    const warns = result.diagnostics.filter((d) => d.severity === 'warning').length;
    lines.push(
      `<span class="pg-term-line ${result.ok ? 'pg-term-status-ok' : 'pg-term-status-err'}">  ${result.ok ? 'compiles ✓' : 'refused to compile ✗'}  (${errors} error${errors === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'})</span>`,
    );
    for (const d of result.diagnostics) {
      const cls = `pg-term-diag-${d.severity}`;
      const loc = `<span class="pg-term-loc">${d.span.start_line}:${d.span.start_col}</span>`;
      const badge = `<a class="pg-term-badge" href="${GUARANTEES_BASE}#${encodeURIComponent(d.guarantee_id)}" target="_blank" rel="noopener">${escapeHtml(d.guarantee_id)}</a>`;
      lines.push(
        `<span class="pg-term-line ${cls}">  ${d.severity}  ${escapeHtml(d.message)} ${loc}${badge}</span>`,
      );
      if (d.help) {
        lines.push(
          `<span class="pg-term-line pg-term-help">help: ${escapeHtml(d.help)}</span>`,
        );
      }
    }
  }
  term.innerHTML = lines.join('');
}

function countLines(s: string): number {
  if (!s) return 0;
  return s.split('\n').length;
}

function setActiveInPicker(name: string) {
  const picker = $('pg-picker');
  for (const btn of Array.from(picker.querySelectorAll<HTMLButtonElement>('button.pg-ex'))) {
    btn.dataset.active = btn.dataset.name === name ? 'true' : 'false';
  }
}

function renderSourceReadOnly(ex: ClientExample) {
  const host = $('pg-source-host');
  host.innerHTML = ex.highlightedSource;
  host.style.padding = '18px 22px';
  state.editor = null;
}

function renderSourceEditable(_ex: ClientExample, initial: string) {
  const host = $('pg-source-host');
  host.innerHTML = '';
  host.style.padding = '0';
  const ta = document.createElement('textarea');
  ta.className = 'pg-source-editor';
  ta.spellcheck = false;
  ta.autocapitalize = 'off';
  ta.autocomplete = 'off';
  (ta as unknown as { autocorrect: string }).autocorrect = 'off';
  ta.value = initial;
  host.appendChild(ta);
  ta.addEventListener('input', onEditorInput);
  state.editor = ta;
}

function onEditorInput() {
  if (!state.editor) return;
  state.editedSource = state.editor.value;
  $('pg-reset').removeAttribute('disabled');
  if (state.debounceTimer != null) {
    window.clearTimeout(state.debounceTimer);
  }
  state.debounceTimer = window.setTimeout(() => {
    state.debounceTimer = null;
    void runCheck({ silent: true });
  }, 300);
}

function selectExample(name: string) {
  const ex = state.catalog.find((e) => e.name === name);
  if (!ex) return;
  state.current = ex;
  state.editedSource = null;

  setActiveInPicker(name);
  $('pg-source-title').textContent = ex.title;
  $('pg-meta-title').textContent = ex.title;
  $('pg-meta-category').textContent = ex.category;
  $('pg-meta-pitch').textContent = ex.pitch;
  $('pg-meta-nonscope').textContent = ex.non_scope;
  $('pg-meta-name').textContent = ex.name;
  const link = $('pg-meta-spec-link') as HTMLAnchorElement;
  link.href = specUrlFor(ex.spec_path);
  link.textContent = ex.spec_path;
  $('pg-term-meta').textContent = ex.editable
    ? 'corvid check (live)'
    : 'corvid check';

  const badge = $('pg-editable-badge');
  const reset = $('pg-reset');
  if (ex.editable) {
    badge.removeAttribute('hidden');
    reset.removeAttribute('disabled');
    renderSourceEditable(ex, ex.source);
    setStatus('Edit the source — typechecker re-runs as you type.', 'idle');
  } else {
    badge.setAttribute('hidden', '');
    reset.setAttribute('disabled', '');
    renderSourceReadOnly(ex);
    setStatus('Ready. Click Check to typecheck this example.', 'idle');
  }

  // Reset terminal to placeholder; do not auto-run on selection. The user
  // initiates each check explicitly except for the editable marquee, which
  // auto-runs on edit (not on selection — first paint stays cheap).
  const term = $('pg-terminal');
  term.innerHTML =
    `<span class="pg-term-line"><span class="pg-term-prompt">$ </span>corvid check ${escapeHtml(ex.name)}.cor</span>` +
    `<span class="pg-term-line">  (${ex.editable ? 'edit the source above to trigger a re-check, or click Check' : 'click Check to run the typechecker in your browser'})</span>`;
}

async function runCheck(opts: { silent?: boolean } = {}) {
  const ex = state.current;
  if (!ex) return;
  if (!opts.silent) setStatus('Loading WASM module…', 'loading');
  try {
    const mod = await loadCorvidBrowser();
    const source = state.editedSource ?? ex.source;
    let result: CheckResult;
    if (state.editedSource != null) {
      result = mod.check(source);
    } else {
      result = mod.checkExample(ex.name);
    }
    renderTerminal(ex.name, source, result);
    setStatus(
      result.ok
        ? 'Compiles. The compiler proved every claim in this example.'
        : `Refused to compile: ${result.diagnostics.length} diagnostic${result.diagnostics.length === 1 ? '' : 's'}.`,
      result.ok ? 'ok' : 'err',
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    renderTerminal(ex.name, '', { error: message });
    setStatus(`Failed to run check: ${message}`, 'err');
  }
}

function onReset() {
  if (!state.current?.editable) return;
  state.editedSource = null;
  $('pg-reset').setAttribute('disabled', '');
  renderSourceEditable(state.current, state.current.source);
  setStatus('Reset to the baked source. Edits will trigger a re-check.', 'idle');
  void runCheck({ silent: true });
}

function init() {
  state.catalog = readCatalog();
  if (state.catalog.length === 0) {
    setStatus('No examples found (build issue).', 'err');
    return;
  }
  state.current = state.catalog[0];

  // Pre-rendered default is the first example. If it's editable, we still
  // need to swap in the textarea (the .astro template renders highlighted
  // HTML by default).
  if (state.current.editable) {
    renderSourceEditable(state.current, state.current.source);
  }

  // Picker click handler — event delegation, one listener for all buttons.
  $('pg-picker').addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>('button.pg-ex');
    if (!btn) return;
    const name = btn.dataset.name;
    if (!name) return;
    selectExample(name);
  });

  // Check / Reset buttons.
  $('pg-check').addEventListener('click', () => void runCheck());
  $('pg-reset').addEventListener('click', onReset);

  // Pre-warm the WASM in the background so the first explicit Check feels
  // instant. Fire-and-forget — surface errors only when the user actually
  // clicks Check.
  loadCorvidBrowser().catch(() => {
    /* swallowed — user-initiated check will re-attempt and report */
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
