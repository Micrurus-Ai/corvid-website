# Handoff: browser-compatible Corvid typechecker crate (33J7 prerequisite)

**Audience:** Rust developer with workspace knowledge of `Micrurus-Ai/Corvid-lang`.
**Filed by:** Corvid website team (Micrurus-Ai/corvid-website).
**Date:** 2026-05-11.
**Status:** Blocking — the v1.0 cloud-IDE launch (slice 33J7) cannot proceed on the website side until this lands.

> Convert this document into a GitHub issue on `Micrurus-Ai/Corvid-lang` with the title:
> *"[33J7] Add `corvid-browser` crate: WASM-compatible typechecker entry point for the v1.0 playground"*

---

## Why this exists

The website team is building a browser-based cloud IDE for Corvid as part of the v1.0 launch (slice 33J7 in the Phase 33 handoff). The IDE compiles user-written `.cor` source in the browser via a WASM module and renders the resulting diagnostics with `guarantee_id` badges that link to `/docs/reference/guarantees#<id>`.

We probed the current `Corvid-lang/main` tree on 2026-05-11 and found that **the compiler binary cannot be compiled to `wasm32-unknown-unknown` as it stands**. We need a thin browser-targeting crate that wraps just the typechecking surface and excludes the wasm-incompatible runtime pieces.

This crate does **not** need to run programs — only check them. Compile-refusal (the moat demo) is a typecheck-time signal, not a runtime signal. Running agents and calling LLM providers is explicitly out of scope for the WASM build; that happens locally after `curl install`.

## What we found in the probe

Three concrete blockers in `Micrurus-Ai/Corvid-lang/main`:

1. **`crates/corvid-cli/Cargo.toml` declares only `[[bin]]`**, no `[lib]` with `crate-type = ["cdylib"]`. To produce a WASM module callable from JavaScript, we need either a `cdylib` library target or a new wrapper crate.

2. **`corvid-cli`'s dependency graph pulls in wasm-incompatible crates.** Visible in its `Cargo.toml`:
   - `tokio` with `rt-multi-thread` features — does not compile to `wasm32-unknown-unknown`.
   - `rayon` — same problem.
   - `libloading` — needs dlopen, no browser equivalent.
   - `tempfile` — needs filesystem.
   - `tar` — fine on its own but ties into filesystem-y workflows.

   Pulling `corvid-cli` directly into a WASM build will fail at compile time. We need a crate that depends only on the typechecking surface, not on the orchestration runtime.

3. **`crates/corvid-codegen-wasm` exists, but it's the wrong direction.** That crate emits WASM as a *target* for compiled Corvid programs (Corvid source → WASM binary). What we need is the *compiler frontend* to run in the browser as a WASM module, so end-users can paste Corvid source into a textarea and get back diagnostics. There is no precedent crate for that direction yet.

## What we need delivered

A new crate, suggested name `corvid-browser` (rename to taste — `corvid-wasm-check`, `corvid-playground-wasm`, etc.):

```
crates/corvid-browser/
├── Cargo.toml          # cdylib, dep set below
├── src/
│   └── lib.rs          # exposes pub fn check(source: &str) -> CheckResult
└── README.md
```

**`Cargo.toml`** depends only on the typechecking surface — concretely (subject to your audit):
- `corvid-syntax` (parser, lexer)
- `corvid-ast`
- `corvid-resolve`
- `corvid-types` (effect calculus)
- `corvid-guarantees`
- `serde` + `serde_json` for diagnostic serialization
- `wasm-bindgen` for the JS binding layer

**Critical:** before adding a dep here, check that *its* transitive graph compiles to `wasm32-unknown-unknown`. The typechecker may have tokio woven through it in ways that aren't visible from API names — please audit and either gate problematic features with `cfg(target_arch = "wasm32")` or extract pure-Rust subsets.

**`src/lib.rs`** exposes a single entry point:

```rust
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
pub struct Diagnostic {
    pub guarantee_id: String,    // e.g. "approval.dangerous_call_requires_token"
    pub severity: String,        // "error" | "warning" | "info"
    pub message: String,         // primary message
    pub span: Span,              // location
    pub help: Option<String>,    // suggested fix, if any
}

#[derive(Serialize)]
pub struct Span {
    pub start_line: u32,         // 1-indexed
    pub start_col: u32,          // 1-indexed
    pub end_line: u32,
    pub end_col: u32,
}

#[derive(Serialize)]
pub struct CheckResult {
    pub diagnostics: Vec<Diagnostic>,
    pub ok: bool,                // true if no errors (warnings OK)
}

#[wasm_bindgen]
pub fn check(source: &str) -> JsValue {
    let result: CheckResult = run_typecheck(source);  // wraps the existing pipeline
    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}
```

The exact serialization shape is negotiable — propose something cleaner if you see one. The key requirement is that the website renderer can map each diagnostic to a `guarantee_id` for the docs link, a message for inline display, and a span for editor squiggles.

## Suggested approach

1. **Audit the typechecker's dep graph first.** Run `cargo tree -p corvid-types`, `corvid-resolve`, `corvid-guarantees`, etc. Identify any tokio/rayon/filesystem pulls. Decide for each: `cfg(not(target_arch = "wasm32"))` gate, refactor, or pull the offending sub-feature into a different crate.

2. **Stand up the empty `corvid-browser` crate** with a stub `check()` that returns an empty diagnostics array. Verify it builds clean:
   ```sh
   cargo build -p corvid-browser --target wasm32-unknown-unknown --release
   ```
   This proves the dep graph is clean before any real logic lands.

3. **Wire the real typecheck path.** From `check(source)`, call into the same pipeline `corvid check src/main.cor` uses for typechecking, but **stop before code generation, runtime, connectors.** The typecheck pipeline already exists and is well-tested; this is just exposing it through a thin browser-targeting wrapper.

4. **Map internal diagnostic types to the `Diagnostic` shape.** Existing internal diagnostics have richer info (multi-span notes, fix-it suggestions, etc.). For v1 of the playground, flatten to: one primary span, one message, optional help. Future versions can extend.

5. **Run-size budget: the WASM module should be ≤8 MB gzipped on the wire** (per the brief). After your first build, run `wasm-bindgen --out-dir target/wasm-pack target/wasm32-unknown-unknown/release/corvid_browser.wasm` and check the gzipped size. If over budget, options include:
   - `wasm-opt -Oz` (binaryen) — usually gets 20–40% reduction.
   - Strip unused codegen backends (we don't need the Python or Cranelift code generators for the browser-check use case).
   - Audit dep graph for surprise pull-ins.

6. **Hook into CI.** Add a build step in the Corvid-lang workflow that compiles the WASM artifact on every push to `main`. Either publish it as a release asset, or trigger a `repository_dispatch` to `Micrurus-Ai/corvid-website` so the website CI re-pulls and re-deploys. The website-side dispatch listener `corvid-lang-wasm-changed` will be added by the website team once your crate ships.

## Acceptance criteria

- [ ] `cargo build -p corvid-browser --target wasm32-unknown-unknown --release` completes with no errors.
- [ ] `wasm-bindgen` postprocessing produces a JS-importable module + a `.wasm` artifact.
- [ ] Gzipped wire size of the `.wasm` artifact is ≤8 MB.
- [ ] Calling `check("agent foo(t: Ticket) -> Decision uses bar: return baz()")` (a compile-refusal example) from JS returns a `CheckResult` whose `diagnostics[0].guarantee_id` matches what the native compiler reports for the same source.
- [ ] Calling `check("# valid corvid")` (a trivial valid program) returns `{ ok: true, diagnostics: [] }`.
- [ ] At least one accepted-input and one rejected-input test under `crates/corvid-browser/tests/`.
- [ ] CI workflow at `.github/workflows/build-wasm.yml` (or added to existing CI) produces the artifact on every push to `main`.

## Out of scope (explicit non-promises for this slice)

- **Runtime execution.** No `corvid run`, no agent execution. Typecheck only.
- **LLM provider calls.** Not even via a stub. The playground's user-supplied API key path runs directly from the browser to the provider; the WASM never sees a key.
- **Connector OAuth flows** (Gmail, Slack, MS365). Out of scope.
- **Multi-file resolution across an entire `corvid.toml` project.** v1 of the playground supports single-file typechecking. Multi-file is a Phase 2 enhancement; we'll spec it separately if there's demand.
- **Code generation.** The WASM module does not need to invoke Cranelift, the Python codegen, or any backend. Reject programs at typecheck if the program references things that the typecheck-only build can't see.
- **A formal proof that `corvid-browser` matches `corvid check` byte-for-byte.** Best-effort parity is fine; we'll surface differences as issues.

## Estimated effort

Best case: **2 weeks** if the typechecker is already cleanly separable from runtime concerns.
Typical case: **3–4 weeks** if the dep audit reveals tokio/runtime entanglements that need refactoring.
Hard case: **6+ weeks** if the typechecker uses runtime primitives we didn't anticipate.

## Coordination

When you have the artifact building:

1. Comment on this issue (or PR) with the WASM module size + a sample `CheckResult` JSON for the compile-refusal example. The website team will use that to wire the renderer.
2. We'll add the `corvid-lang-wasm-changed` `repository_dispatch` listener on the website side, plus the CI step that clones Corvid-lang and fetches the artifact.
3. Either of us can iterate on the diagnostic schema — propose changes via PR comments on this issue.

## Related

- Phase 33 handoff brief (33J7 slice): [see handoff document]
- Original WASM target work: phase 20n-B (the corvid-codegen-wasm crate)
- Effect-spec: `docs/internals/effect-spec/`
- Diagnostic format reference: `docs/reference/guarantees.md`

— website team
