---
target: ProductHunt
status: READY TO SHIP
planned_post_date: TBD — within 24h embargo of HN/Reddit drafts (PH posts at 12:01am PST local launch day; schedule as a "scheduled post")
length_budget:
  tagline: <=60 chars
  description: <=260 chars
  maker_comment: 1 paragraph, link-rich
topics: [Artificial Intelligence, Developer Tools, Open Source]
gallery_assets:
  - public/launch/corvid-2min.gif        # hero (slice 33L scene-recording, when ready)
  - public/social/og-cover.png           # already in repo
  - SCREENSHOT: compile-refusal in editor + diagnostic — TODO before ship
  - SCREENSHOT: docs site landing — TODO before ship
  - SCREENSHOT: /benchmarks page — TODO before ship
notes: |
  - PH "hunter" should be a known PH account, not a new one — discoverability
    is gated by hunter karma. Coordinate with whoever in the network has
    standing on PH.
  - Maker comment should land in the first hour to seed the conversation.
  - PH does NOT accept .svg in gallery — convert any SVG to PNG first.
---

## Tagline (max 60 chars)

```
AI-safe programming. Refunds without approval don't compile.
```

(58 chars — fits the budget with one to spare. Alternates that also fit, pick whichever the team prefers:)

- `Compile-time AI safety. Now a language, not a library.` (54)
- `The compiler refuses unauthorized AI actions.` (45)
- `Your AI agent's bugs, caught before runtime.` (44)

## Description (max 260 chars)

```
Corvid is a programming language where dangerous AI actions either compile with a proof or do not compile at all. Approval reachability, model-vs-source provenance, per-agent budgets, and deterministic replay — all in the type system. v1.0 ships today.
```

(253 chars — within budget, room to tighten if PH's character counter is stricter than mine.)

## Topics

- Artificial Intelligence  (primary)
- Developer Tools
- Open Source

## Maker Comment (post within the first hour)

Hi PH 👋 — I'm on the Corvid team. We just shipped v1.0.

Corvid is the language we wished existed two years ago, when our agent issued two refunds for the same customer and the "guardrail" library quietly failed a runtime check on a path nobody had tested. In Corvid, that second refund — without an explicit `approve RefundClaim(...)` token reachable on the call path — doesn't compile. The compiler IS the guardrail.

What's in the language:
• `approve <Action>` compile-time tokens with call-graph reachability checking
• `Grounded<T>` for citation flow from source → call site
• Per-agent `@budget($0.50)` annotations + compile-time cost arithmetic
• Deterministic replay (`corvid replay <id>` reproduces a run, ~50× faster, no model API calls)
• Model-upgrade diff (`corvid eval --swap-model gpt-5 …`)

Honest about what's not in v1.0: orchestration is ~25–36× slower than Python LangChain on the reference apps (model latency dominates end-user time, but the gap is real — see https://corvid-lang.org/benchmarks). Type system is not yet mechanically verified — formal proof is post-v1.0. One implementation today; a second-implementation TCB shrinkage is also post-v1.0.

Try it in 5 min: https://corvid-lang.org/docs/book/02-quickstart
Install: `curl -fsSL https://corvid-lang.org/install | sh`
Repo: https://github.com/Micrurus-Ai/Corvid-lang (MIT / Apache-2.0)
Launch post: https://corvid-lang.org/blog/corvid-v1-0
2-min demo: https://corvid-lang.org/ (top of the landing)

Happy to answer questions about the effect calculus, the perf trade-off, the WASM playground, or anything else. Especially keen to hear from anyone who has tried to ship an agent and watched the same five bug classes re-emerge.
