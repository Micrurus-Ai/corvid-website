---
target: Reddit r/programming
status: READY TO SHIP
planned_post_date: TBD — within 24h embargo of HN/prog-langs/rust drafts
length_budget: title <=300 chars / body <=400 words
notes: |
  - Audience: working developers, mixed languages, opinionated about AI hype.
    Lead with the practical problem (unauthorized agent actions), not the
    PL theory. Plain English over jargon.
  - Reddit's r/programming auto-flags posts that look like marketing. Lead
    with the GIF/demo at top, body terse.
  - Self-disclosure required.
---

## Title

Show: Corvid — a programming language where an AI agent's unauthorized refund won't even compile

## Body

Two refunds got issued for the same customer last quarter. The agent's "guardrail" library quietly failed a runtime check on a code path nobody tested. We've been watching teams ship this same bug class for two years, each time slightly differently. Corvid is a programming language we just shipped that moves the check from runtime to compile time.

Five-line example that doesn't compile:

    agent refund_bot(t: Ticket) -> Decision uses refund_effect:
        return issue_refund(t.claim, amount: $50.00)

The compiler refuses with `approval.dangerous_call_requires_token` and points at the missing `approve RefundClaim(...)`. No runtime check to forget. No library decorator to misconfigure. The check IS the type signature.

The 2-minute demo (compile-refusal + grounded provenance + replay + budget): https://corvid-lang.org/

What's in v1.0:
- Tool calls can require approval tokens. The compiler walks the call graph and rejects any call site where the token isn't reachable.
- `Grounded<T>` carries citations through the type system. You can't pass a raw model string where a verified-source string is expected.
- Per-agent compile-time budgets. `@budget($0.50)` + cost-annotated prompts = compile fails before you spend $50K overnight.
- `corvid replay <id>` reproduces any production run bit-for-bit, ~50x faster, no model API calls.
- `corvid eval --swap-model gpt-5 …` shows the behavior diff at your desk, not at 3 AM after the upgrade.

Honest non-promises in v1.0:
- Corvid is ~25-36× slower than Python LangChain on orchestration overhead (canonical reference apps). Model latency dominates user-perceived time, so the gap is mostly invisible end-to-end, but we don't hide it. Numbers + reproducibility: https://corvid-lang.org/benchmarks
- The type system is not yet mechanically verified (formal proof is the post-v1.0 research agenda).
- One implementation today; second-implementation TCB shrinkage is post-v1.0.

Install:

    curl -fsSL https://corvid-lang.org/install | sh

Or Homebrew / Scoop, see https://corvid-lang.org/docs/book/01-install

Docs: https://corvid-lang.org/docs
Repo: https://github.com/Micrurus-Ai/Corvid-lang (MIT / Apache-2.0)
Quickstart in 5 min: https://corvid-lang.org/docs/book/02-quickstart

Disclosure: I'm on the Corvid team. Happy to answer practical questions about migrating an existing Python agent, or about the perf-overhead trade-off.
