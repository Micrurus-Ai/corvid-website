---
target: Reddit r/ProgrammingLanguages
status: READY TO SHIP
planned_post_date: TBD — within 24h embargo of HN/programming/rust drafts
length_budget: title <=300 chars / body <=400 words
notes: |
  - Audience: PL theorists, type-system enthusiasts, language implementers.
    Lead with the effect-algebra hook, not the marketing pitch.
  - Self-disclosure required: "I'm on the Corvid team" — Reddit's mod
    convention for self-promotion.
  - r/ProgrammingLanguages allows self-promotion of new languages but
    expects technical substance, not a press release.
---

## Title

Corvid v1.0: a language where dangerous AI calls compile with a proof or not at all (effect rows + approval tokens at the type level)

## Body

Corvid is a programming language we just shipped that bakes five things every AI team eventually rebuilds — approval registries, model-vs-source provenance, per-agent budgets, deterministic replay, model-upgrade diffs — into the compiler.

The interesting bit for this subreddit is the effect calculus. Functions declare effect rows ("uses session, audit, refund_effect"). Tool calls inside those effects can carry a `@dangerous` annotation, which gates them behind an `approve <Action>` token. The compile-time reachability check walks the call graph: if a path to the call site doesn't pass through an `approve` for the right Action, the program is rejected.

Five-line refusal:

    agent refund_bot(t: Ticket) -> Decision uses refund_effect:
        return issue_refund(t.claim, amount: $50.00)

→ `error[approval.dangerous_call_requires_token]: tool call issue_refund is gated by RefundClaim approval, but approve RefundClaim(...) is not reachable on any path to this call site.`

Other type-level pieces:
- `Grounded<T>` — a sum-like wrapper carrying the citation of a value's provenance. Composes with effect rows; the row carries which sources are allowed to flow.
- Compile-time budget arithmetic on cost annotations (each prompt declares `cost: $0.02`; agents declare `@budget($0.50)`; the compiler sums worst-case path).
- Replay determinism — the runtime is structured so that `corvid replay <id>` produces byte-identical output. Implementation detail: model responses captured as fixtures; non-model entropy (timestamps, random) is captured per trace.

Honest gaps in v1.0:
- The effect calculus is not yet mechanically verified. A Coq/Lean proof is the post-v1.0 research agenda. Until then, the "permanent sentinel" test suite is the discipline holding it together.
- Orchestration overhead is ~25-36× slower than Python LangChain on the reference apps (~1.7-2.6× vs TypeScript). The implementation uses Rust + Cranelift; lots of low-hanging perf work remains.
- One implementation. A second-implementation TCB shrinkage is post-v1.0.

Formal grammar: https://corvid-lang.org/docs/reference/grammar
Effect spec: https://github.com/Micrurus-Ai/Corvid-lang/tree/main/docs/internals/effect-spec
Adversarial-taxonomy bounty (find a path where a dangerous call compiles without approve): https://github.com/Micrurus-Ai/Corvid-lang/blob/main/docs/internals/effect-spec/bounty.md
Repo: https://github.com/Micrurus-Ai/Corvid-lang (MIT / Apache-2.0)
Landing + 2-min demo: https://corvid-lang.org/

Happy to dig into the effect-row composition rules or the replay guarantees. Disclosure: I'm on the Corvid team.
