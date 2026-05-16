# Tier-1 playground shipped on the website side — Tier-2 asks

**Audience:** Rust developer in `Micrurus-Ai/Corvid-lang` who shipped `corvid-browser` (the `corvid-tour-catalog` extraction + `list_examples` / `check_example` / `check`) at commit `741abc7`.
**Filed by:** Corvid website team.
**Date:** 2026-05-16.
**Status:** Reply on the same issue/PR thread that delivered Tier 1. Linked commits/files are in `Micrurus-Ai/corvid-website` (commit `f6d5827`).

> Convert this document into the reply on the existing handoff thread.

---

## Thanks — Tier 1 shipped end-to-end

The catalog extraction (`corvid-tour-catalog` as a wasm-clean crate) + the `list_examples` / `check_example` / `check` wasm-bindgen entries were exactly the right shape. We built the website-side Tier-1 playground against `741abc7` and it works end-to-end with zero further coordination needed.

**What we built:**
- New site `playground-site/` (Astro, base `/playground`) parallel to docs/blog/benchmarks. Four panes per the contract: examples picker (left, grouped by category), Shiki-highlighted source view / editable textarea (center top), terminal-style `CheckResult` panel with `guarantee_id` badges (center bottom), pitch + spec link + non-scope (right).
- A sync script (`scripts/sync-playground-wasm.mjs`) that clones Corvid-lang, runs `cargo build -p corvid-browser --target wasm32-unknown-unknown --release`, runs `wasm-bindgen --target web`, and snapshots `list_examples()` to `examples.json` so the picker pre-renders at build time. No second source of truth.
- CI cached for both the cargo registry and the `.corvid-source/target/` incremental build, plus a `corvid-lang-wasm-changed` `repository_dispatch` listener so a push to `crates/corvid-browser/**` or `crates/corvid-tour-catalog/**` rebuilds the playground without manual intervention. **Action item on your side:** when one of those paths changes, dispatch `corvid-lang-wasm-changed` to `Micrurus-Ai/corvid-website` so the playground stays current. Same shape as the existing `corvid-lang-docs-changed` and `corvid-lang-benches-changed` dispatches.

**What we measured (`corvid-browser` at `741abc7`, `wasm-bindgen 0.2.120 --target web`):**
- `corvid_browser_bg.wasm`: 845,594 bytes raw / **~225 KB gzipped on the wire** — still around 1/32 of the 8 MB budget.
- `corvid_browser.js` (glue): 15,950 bytes raw / **~5 KB gzipped**.
- `examples.json` (the `list_examples()` snapshot): 14,807 bytes raw — 20 examples, 5 categories, all `tier: 1`. Schema matches `ExampleCatalog v1` exactly.
- Build time on a warm cache: `cargo build` 0.4–0.7s, `wasm-bindgen` <1s. Cold cache + clean clone is ~2 min on CI.

**Marquee compile-refusal demo, verified:**
We wrote a `playground-site/scripts/smoke-marquee.mjs` that loads the same WASM under Node, stripped the `approve IssueRefund(id)` line from `approve-gates`, and routed the edited source through `check(source)`. Returns `ok: false` with exactly one diagnostic, `guarantee_id: "approval.dangerous_call_requires_token"`. The five-second loop the contract describes (delete approve → red → re-add → green) is the demo, and it works on the surfaces you shipped, with zero new Corvid changes needed.

**Editable in the UI today:** `approve-gates` and `provenance-propagation` (the two marquee examples per the v1.0 brief). All other examples are read-only and run through `check_example(name)`. Edits route through `check(source)` with a 300 ms debounce.

**Diagnostic rendering:** each `Diagnostic` becomes a `<severity> message  line:col [guarantee_id]` line in the terminal panel. `guarantee_id` is a clickable badge that links to `/docs/reference/guarantees#<id>` on the docs site, so a v1.0 visitor lands on the exact guarantee they tripped without losing context.

So Tier 1 ships. No blockers from your side. We are not asking for anything urgent.

## Two small notes about Tier 1 that may interest you

**1. The application/wasm Content-Type matters more than I expected.** Firebase Hosting infers it from the extension, but I added an explicit header rule anyway (`firebase.json`) because some CDNs / proxies drop the inferred type and the browser then refuses to `WebAssembly.instantiateStreaming` — silent fallback to slower `instantiate(arrayBuffer)`. Worth noting if any other consumer ever serves the artifact behind a less-helpful CDN.

**2. Pre-rendering vs runtime call for `list_examples`.** We chose to call `list_examples()` once at build time (under Node, via `--target nodejs`) and snapshot to JSON, then render the picker server-side. Trade-off: the picker is meaningful before any JS / WASM loads, but it does mean a new example in `TOPICS` requires a website rebuild to appear. The dispatch listener handles that automatically as long as you fire `corvid-lang-wasm-changed` on changes under `crates/corvid-browser/**` or `crates/corvid-tour-catalog/**`. If you'd rather we call `list_examples()` at runtime (no rebuild needed for new examples but the picker is empty until WASM loads), we're flexible — speak up.

## Tier 2 — when you're ready, this is what we'd need

No timeline pressure here. Tier 1 covers the v1.0 launch demo. Tier 2 is the "see it actually run" experience and the contract correctly says it waits on `33J7b` (runtime split) + `33J7c` + `33J7d` (suspend/resume bridge). I'm sketching the asks now so when you do get to it, the website side can move quickly.

**What we'd need from `corvid-browser` for Tier 2:**

1. **`run_example(name, opts) -> RunStream`** — the entry the contract sketches but doesn't spec. The shape we'd be able to build against is a stream of structured events the terminal panel can render incrementally:

   ```rust
   pub fn run_example(name: &str, opts: RunOptions) -> RunStream;

   pub struct RunOptions {
       pub live: bool,             // false = replay baked trace; true = use real LLM
       pub provider_request_handler: Option<JsFunction>,  // for live mode
   }

   // Events emitted to JS via async iterator / wasm-bindgen channel:
   //   { kind: "tool_call", name: "issue_refund", args: {...} }
   //   { kind: "tool_result", name: "issue_refund", value: {...} }
   //   { kind: "log", level: "info", message: "..." }
   //   { kind: "needs_provider", request: { provider, model, messages, ... } }
   //   { kind: "finished", value: {...} }
   //   { kind: "error", diagnostic: {...} }
   ```

   The `needs_provider` event is the suspend/resume hand-off. JS resolves it using the user's API key (BYO, stored in IndexedDB, never sent anywhere but to the provider directly) and pushes the response back into the stream.

2. **A replay-only mode that needs nothing from JS.** This is the path we'd ship first — the agent's first run was baked at `corvid tour --topic <name> --record`, and `run_example(name, { live: false })` deterministically replays it. The terminal panel streams the recorded events. No LLM calls, no API key, ~50× wall-clock speed-up that the launch post already references. This alone is the bulk of the "watch it run" experience.

3. **Live mode behind an explicit toggle.** Off by default. When the user toggles "use my API key", the playground prompts for the key, stores it in IndexedDB, hooks the `needs_provider` events, and routes them to the provider via `fetch()`. We never see the key.

**What we don't need yet:**
- Connector OAuth (Gmail, Slack, MS365) — out of scope per the original brief; reject with a sandbox diagnostic if the agent tries.
- Multi-file projects in the picker — every tour topic is single-file by construction; `check_project` is already there for the day a multi-file example becomes useful, but no launch example needs it.
- A real code editor — the textarea for the two marquee examples covers the editing path we need. Monaco / CodeMirror is the wrong shape for this UX (we want "delete one line, see the diagnostic"; we don't want "open a project and refactor it").

**Sequencing on your side, mirroring what the contract already says:**

1. Land the runtime split (`33J7b 3f–3h`) so `corvid-runtime` / `corvid-vm` are clean enough to compile to `wasm32-unknown-unknown`.
2. Land the suspend/resume bridge (`33J7d`) — the WASM ↔ JS event channel for `needs_provider`.
3. Write the **Tier 2 addendum to `docs/meta/playground-examples-contract.md`** *before* the code, same discipline as the original draft. The shape above is our proposal but you know the runtime; if `RunStream` should be something else, the addendum is where to say so.
4. Implement `run_example`. Replay-only first, live mode second.

We will not block on any of this for v1.0. Tier 1 is the launch artifact.

## What we need from you right now

Two things, both small:

1. **Wire the `corvid-lang-wasm-changed` dispatch** (one-line addition to whatever workflow already fires `corvid-lang-docs-changed`). Path filter: `crates/corvid-browser/**` OR `crates/corvid-tour-catalog/**`.
2. **Quick sanity-check the inputs we'd need for Tier 2 above** — particularly whether the suspend/resume design (`needs_provider` event with the request payload, JS resolves and pushes back) sits cleanly on top of where you think the runtime split will land. If your honest read is "the request shape will look different because of how the VM models the suspension," better to know now than to spec it twice.

Everything else: take the time the runtime split needs, then propose the addendum. We'll be ready on the website side.

— website team

---

## Internal note (not for the upstream reply)

Tier-1 playground is `[33J7-V1]` shipped — commit `f6d5827` on `Micrurus-Ai/corvid-website`. Live at `corvid-lang.org/playground` after the next deploy completes.

If the Rust dev wires the dispatch but says nothing about Tier 2: park as `[POST-V1.0] Tier 2 — awaiting runtime split` and proceed with launch.

If the Rust dev counter-proposes a different Tier-2 shape: re-spec, then mark `[POST-V1.0] Tier 2 design negotiated, awaiting code`.

If the Rust dev says "I'll start on Tier 2 now": that's a 6–12 week project on their side (per their own earlier estimate). v1.0 launch is unaffected because Tier 1 already ships the whole launch surface.
