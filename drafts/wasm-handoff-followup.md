# Follow-up: 33J7 scope clarification — we need more than typecheck

**Audience:** Rust developer in `Micrurus-Ai/Corvid-lang` who shipped commit `bce2daa` (`corvid-browser` crate).
**Filed by:** Corvid website team.
**Date:** 2026-05-11.
**Status:** Reply on the same issue/PR thread that delivered `corvid-browser`.

> Convert this document into the reply on the original handoff thread.

---

## Thanks

The `corvid-browser` crate is a model of scope discipline — clean dep set, sensible wire format, tight typecheck-only contract. We built and verified it end-to-end on the website side at commit `bce2daa`:

- **Build:** `cargo build -p corvid-browser --target wasm32-unknown-unknown --release` → ✅ 1m 12s on first build
- **Postprocess:** `wasm-bindgen ... --target web` → ✅ (after pinning CLI to 0.2.120 to match `Cargo.lock`)
- **Measured sizes** (post-bindgen, what ships on the wire):
  - `corvid_browser_bg.wasm`: 732,085 bytes raw / **247 KB gzipped**
  - `corvid_browser.js` (glue): 7,327 bytes raw / **2 KB gzipped**
  - **Total wire: ~250 KB gzipped** — about **1/32 of the 8 MB budget**. Excellent.
- **Round-trip CheckResult on the compile-refusal example:**

  ```json
  {
    "version": "v1",
    "ok": false,
    "diagnostics": [{
      "guarantee_id": "approval.dangerous_call_requires_token",
      "severity": "error",
      "message": "dangerous tool `send_email` called without a prior `approve`",
      "span": { "start_line": 4, "start_col": 5, "end_line": 4, "end_col": 41 },
      "help": "add `approve SendEmail(arg1, arg2)` on the line before this call"
    }]
  }
  ```

  Identical schema to your sample, identical diagnostic text. One small note: your sample showed `start_line: 5` for the same source; my round-trip returns `start_line: 4` (which is correct — the `send_email` call is on line 4 of the source you posted, with the `dangerous` declaration on line 1 and a blank line between the declarations). Probably a typo in your hand-written sample, not a contract issue. Worth double-checking in your tests.

- **Valid-program sample** (just a comment) returns `{ "version": "v1", "ok": true, "diagnostics": [] }` as documented. ✅

**One coordination note: pin `wasm-bindgen-cli` version in build instructions.** The `Cargo.lock` pinned `wasm-bindgen 0.2.120` and our default `cargo install -f wasm-bindgen-cli` pulled 0.2.121, which errored with a clear schema-version mismatch. Worth documenting `cargo install -f wasm-bindgen-cli --version 0.2.120` (or whatever matches the lock) in the crate's README so the next consumer doesn't trip on it. Or, alternatively, let `Cargo.lock` float on `wasm-bindgen` so it tracks the latest CLI.

So as a **demo playground** — single-file, paste-source-and-see-compile-refusal — this is ready to ship today.

## Where the scope mismatch sits

When the website maintainer reviewed the v1.0 playground plan, the vision they articulated is broader than the brief's demo widget. Specifically: **users should be able to actually develop with Corvid in the browser, not just paste single-file examples for typecheck.** That means:

| Capability | Demo widget (your crate) | Full cloud IDE (maintainer's v1.0 vision) |
|---|---|---|
| Single-file typecheck | ✅ | ✅ |
| Multi-file imports | ❌ (refused with diagnostic) | ✅ |
| Compile + run an agent | ❌ (typecheck only) | ✅ |
| LLM provider calls (BYO API key) | ❌ (out of scope) | ✅ (browser-side, user supplies key) |
| Project save/load | client-only | client-only or backend-synced |
| Connector OAuth flows | ❌ | post-v1 OK |

The maintainer's stated reason: *"it's a new language; it'll be better for users to test on the playground before installing it."* The demo widget covers part of that (compile-refusal demo). The full cloud IDE covers the rest (try writing a real agent + watch it run).

## What we'd need beyond `corvid-browser` for the full IDE

Honestly speccing this — none of it is small:

**1. Multi-file source resolution in WASM.**
The current crate refuses `import` declarations. For multi-file projects, the browser would maintain an in-memory FS (BrowserFS or IndexedDB-backed) and pass a multi-file source map to the WASM module. The crate API becomes something like:

```rust
pub fn check_project(files: HashMap<String, String>, entry: &str) -> CheckResult
```

Plus the resolver needs to operate on the in-memory file map instead of `std::fs`.

**2. Runtime in WASM (the `corvid-runtime` + `corvid-vm` path).**
This is the heavy one. To `corvid run` an agent in the browser:
- `corvid-vm` needs to compile to `wasm32-unknown-unknown`. Likely needs the same kind of audit you did for `corvid-browser` — gating tokio/async-runtime concerns. Some of this might already be there if the VM uses async; some might need cfg-gating or a thinner browser-targeting subset.
- A new entry point on `corvid-browser` (or a sibling `corvid-runtime-browser` crate):

  ```rust
  pub fn run_agent(files: HashMap<String, String>, entry: &str, invoke_args: Json) -> RunResult
  ```

- The `RunResult` either resolves to a final value, or pauses on a "needs-LLM-call" suspension that the browser fulfills, or returns a runtime diagnostic.

**3. Provider call plumbing via the browser (BYO LLM API key).**
The trick is *how* the WASM module delegates LLM calls to the browser. The pattern we'd want:

- The runtime in WASM, when it hits a prompt/tool that requires a model call, **suspends and returns a structured request** (`{ provider: "openai", model: "...", messages: [...] }`) to JS.
- JS resolves the request using the user's API key (stored encrypted in IndexedDB, never sent anywhere except directly to the provider), then resumes the WASM with the response.
- Coroutine-like flow via `wasm-bindgen-futures` and JS Promise interop.

No mocked provider, no bundled keys — user holds the only key, the browser is the only network endpoint.

**4. Suspension boundary for connectors.**
Connectors (Gmail, Slack, MS365) are explicitly post-v1 — we'd want the runtime to fail with a clear sandbox diagnostic when a connector is invoked, identical to what the brief originally specified.

## Realistic cost estimate

Best case, if `corvid-vm` is already cleanly separable from tokio/native-IO concerns: **~4 weeks** of additional Rust work on top of `corvid-browser`.
Typical: **6–8 weeks** if there are tokio/runtime entanglements similar to what you already navigated in `corvid-browser`.
Hard: **10–12 weeks** if the VM uses runtime primitives that need refactoring.

This is in addition to the 2–3 weeks of website work to build the UI around it. So v1.0 launch slips by roughly the Rust delta plus website integration time.

## The fork in the road

Two paths, both defensible:

**Path A — Ship the demo playground for v1.0, build cloud IDE as Phase 34.**
Your `corvid-browser` crate is exactly what the v1.0 demo playground needs. The website team builds the UI in ~2–3 weeks, v1.0 launches on schedule. Cloud IDE (runtime + multi-file + BYO LLM) becomes a separate Phase 34 project, scoped properly with real v1.0 user feedback informing what runtime-in-browser actually needs to do.

**Path B — Expand scope of the WASM build to a cloud-IDE-grade artifact for v1.0.**
We delay v1.0 by an additional 6–8 weeks (Rust) + 6–11 weeks (website cloud-IDE UI work). Total slip: 3–5 months. v1.0 launches as the full bundle.

We're explicitly asking you to call this. You know the codebase; we don't. Path B is technically possible if `corvid-vm` cooperates, but it's a substantial additional commitment and you'd be best positioned to estimate whether the VM's dep tree is amenable. If your honest read is "the VM has tokio woven through it and this is a 3-month refactor," we'd rather hear that now than rediscover it in week 6.

## What we need from you

A clear "Path A" or "Path B" call. If B, a rough timeline for the runtime crate. If A, we'll ship the demo playground against `corvid-browser` and file the cloud IDE as a Phase 34 issue with you cc'd.

Either way: thank you for the typecheck crate — it's exactly the right shape for what it covers.

— website team

---

## Internal note (not for the upstream reply)

If the Rust dev says "Path A" (defer cloud IDE to Phase 34):
- Mark `[POST-V1.0] Cloud IDE phase` as the agreed deferral.
- Proceed with `[33J7-V1-A]` through `[33J7-V1-F]` on the website side.
- v1.0 launch returns to the ~3-week timeline.

If the Rust dev says "Path B" (expand the crate):
- Wait for their second deliverable.
- Update `[POST-V1.0] Cloud IDE phase` into active v1.0 sub-slices.
- v1.0 launch slips by their Rust estimate + ~6 weeks of website cloud-IDE work.
