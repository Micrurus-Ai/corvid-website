---
target: Reddit r/rust
status: READY TO SHIP
planned_post_date: TBD — within 24h embargo of HN/prog-langs/programming drafts
length_budget: title <=300 chars / body <=400 words
notes: |
  - Audience: Rust developers, perf people, Cranelift / wasmtime / cdylib
    enthusiasts. Lead with the implementation (Rust + Cranelift), not the
    language semantics. They want to know what they can learn from the
    Corvid codebase, not be sold on Corvid.
  - Mods are strict about self-promotion. Self-disclosure must be at the
    top, not buried.
  - Title MUST be neutral/descriptive; r/rust auto-removes anything that
    reads like marketing.
---

## Title

Corvid v1.0 ships — a Rust-backed AI-safety language with a Cranelift backend, cdylib WASM target, and a permanent-sentinel test discipline

## Body

[Self-disclosure: I'm on the Corvid team. Posting here because the implementation choices are likely to be more interesting to r/rust than the language semantics. Cross-posted to r/programming and r/ProgrammingLanguages with different framing.]

Corvid is a programming language that bakes AI-safety checks (approval reachability, provenance flow, budget arithmetic) into its type system. We just shipped v1.0. The implementation lives at https://github.com/Micrurus-Ai/Corvid-lang under MIT / Apache-2.0.

For r/rust specifically, three things you might find worth poking:

**1. Compiler architecture.** Rust workspace with ~20 crates. `corvid-syntax` (parser, AST, token enum), `corvid-ast` (typed AST + effect rows), `corvid-types` (effect calculus), `corvid-ir` (IR), `corvid-driver` (build pipeline), `corvid-cli`. The parser is hand-written and has a 3,000-line test corpus pinning every accepted/rejected input.

**2. Cranelift backend.** Codegen goes via Cranelift IR for native targets. The WASM target reuses the same backend with the wasm32-unknown-unknown triple, producing a `cdylib` with a bare `(ptr, len)` UTF-8 ABI + multi-value returns. The WASM module ships into the browser as the "Corvid playground" without a separate compiler frontend.

**3. Permanent-sentinel test discipline.** Phase 35V (the verification phase) instituted a small set of "sentinel" tests that pin cross-crate invariants: every guarantee_id wired to its enforcer site, every grammar keyword to its TokKind variant, every parser production to a function. Drift fails the build with a diagnostic naming the missing pair. The pattern is documented in `crates/corvid-guarantees/src/lib.rs`. It's not a formal proof — that's post-v1.0 — but it catches the "we silently broke the docs/code coupling" class of regression. Cheap and effective.

What's not Rust-idiomatic and we're not pretending: orchestration overhead is ~25-36× slower than Python LangChain on the reference apps; Cranelift codegen quality + a lot of allocator pressure + naïve scheduling. Hardening work is the post-v1.0 phase.

Repo: https://github.com/Micrurus-Ai/Corvid-lang
Benchmarks (with raw + reproducibility): https://corvid-lang.org/benchmarks
Effect spec for the curious: https://github.com/Micrurus-Ai/Corvid-lang/tree/main/docs/internals/effect-spec

Try it:

    curl -fsSL https://corvid-lang.org/install | sh

Happy to dig into the Cranelift integration, the cdylib ABI, the test-sentinel pattern, or the workspace shape. PRs welcome.
