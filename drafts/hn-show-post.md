---
target: Hacker News (Show HN)
status: READY TO SHIP
planned_post_date: TBD — coordinate with team; all four launch posts go up within a 24h window
length_budget: title <=80 chars / body <=500 words
notes: |
  - URL field: https://corvid-lang.org/  (landing carries the 2-min GIF/video once 33L scene-recording lands)
  - Body field: the text below the "---" marker, no front-matter
  - Drafted by team; poster is the Corvid project. Account should be the
    project's HN account (with karma >= ~500 to avoid auto-filter), NOT
    a brand-new one. If using a new account, post when EU/US morning
    overlap, expect slower velocity.
---

## Title (<=80 chars)

Show HN: Corvid – a language where unauthorized AI tool calls don't compile

## URL

https://corvid-lang.org/

## Body (<=500 words)

Hi HN — Corvid is a programming language where dangerous AI actions either compile with a proof, or do not compile at all. The compiler reads `approve`, `Grounded<T>`, effect rows, and budget annotations the way other compilers read types.

Write this agent:

    agent refund_bot(t: Ticket) -> Decision uses refund_effect:
        return issue_refund(t.claim, amount: $50.00)

It doesn't compile. `issue_refund` is gated by RefundClaim approval; no `approve RefundClaim(...)` is reachable on any path to the call site. The diagnostic prints `approval.dangerous_call_requires_token` and points at the missing token.

We watched five AI teams independently rebuild the same five things: an approval registry, a way to track which strings came from a verified source vs. the model, a per-agent compile-time budget, a deterministic replay system, and a model-upgrade diff. Corvid puts the five in the compiler.

Things in the language:
- `approve <Action>` is a compile-time token. The call graph reachability check is the security check.
- `Grounded<T>` requires the citation to travel with the value. `.unwrap_with_citation()` is the only way to strip it.
- `@budget($0.50)` on an agent + `cost:` annotations on prompts. Compile fails if the worst-case path exceeds budget.
- `corvid replay <id>` reproduces a run bit-for-bit, ~50x faster, no model API calls.
- `corvid eval --swap-model gpt-5 ...` diffs old vs new model behavior at your desk.

Honest non-promises in v1.0:
- Orchestration overhead is ~25-36× slower than Python LangChain on the canonical reference apps (~1.7-2.6× vs TypeScript). Model latency dominates end-user wall clock, but the gap is real. Numbers + reproducibility at https://corvid-lang.org/benchmarks
- The type system is not yet mechanically verified. A formal proof of the effect calculus is the post-v1.0 research agenda.
- One implementation today. A second-implementation TCB shrinkage is also post-v1.0.

Try it:

    curl -fsSL https://corvid-lang.org/install | sh
    corvid new my-agent && cd my-agent && corvid run src/main.cor

The 2-minute moat demo (compile-refusal, grounded provenance, replay, budget) is at the top of https://corvid-lang.org/

If you want to break the compiler — find a path where a `@dangerous` tool call compiles without an `approve` reachable — the adversarial-taxonomy bounty names the prize: https://github.com/Micrurus-Ai/Corvid-lang/blob/main/docs/internals/effect-spec/bounty.md

Docs: https://corvid-lang.org/docs
Repo: https://github.com/Micrurus-Ai/Corvid-lang (MIT / Apache-2.0)

Happy to answer questions about the effect calculus, the WASM target, the replay determinism guarantees, or anything else. Disclosure: I'm on the Corvid team.
