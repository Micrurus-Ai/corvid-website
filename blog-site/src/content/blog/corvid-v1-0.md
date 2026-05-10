---
title: "Corvid v1.0: compile-time AI safety, shipped"
description: A programming language where dangerous AI actions either compile with a proof, or do not compile at all. We just shipped v1.0.
pubDate: 2026-05-10
author: Micrurus AI
draft: false
---

Your AI agent issued two refunds for the same customer last quarter. The Python library you trusted to prevent that quietly failed a runtime check on a code path you hadn't tested. **Corvid is a programming language where the second refund — without an explicit approval token — does not compile.** We just shipped v1.0.

## The five things every AI team is rebuilding

Every team that ships an agent eventually rebuilds the same five things, each in a slightly different way, each missing a piece. A registry of which tool calls require human approval. A way to track which strings came from a verified source versus which came from the model. A per-agent budget that caps cost and latency at the type level. A deterministic replay system for production traces. A model-upgrade diff that catches behavior changes before the new model goes live. We watched five teams build all five, badly. Corvid puts them in the compiler.

## The five-line demo

The shortest demo we know:

```corvid
agent refund_bot(ticket: Ticket) -> Decision uses refund_effect:
    let claim = process(ticket)
    return issue_refund(claim, amount: $50.00)
```

That code does not compile:

```text
error[approval.dangerous_call_requires_token]: tool call `issue_refund`
is gated by RefundClaim approval, but `approve RefundClaim(...)` is not
reachable on any path to this call site.
  --> src/main.cor:3:12
   3 |     return issue_refund(claim, amount: $50.00)
     |            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

help: add `let claim = approve RefundClaim(amount: $50.00)` before
      this call, OR remove the @dangerous annotation from issue_refund
```

That is the heart of Corvid: the compiler reads `approve`, `Grounded<T>`, effect rows, and budget annotations the way other compilers read types, and it refuses to emit a binary if a tool call gated by an approval is reachable without one. No runtime check to forget. No library-side decorator to misconfigure. No string-matched permission policy that drifts away from the call site.

## What's in the language

**Effects and approvals.** Every function declares the effects it uses — `session`, `audit`, `refund_effect`, anything you name — and every tool call inside those effects can require an approval token. The compiler tracks token reachability across the call graph. Add a new `@dangerous` annotation to an existing tool, and every caller that doesn't reach an `approve` for it stops compiling. There is no way to "forget the check" because the check IS the type signature. [Read the Approve chapter →](/docs/book/08-approve)

**Grounded provenance.** Anywhere a model output flows into a downstream call, the type system requires it to be wrapped in `Grounded<T>` — a value that carries its citation back to source. You cannot pass a raw model string where a `Grounded<String>` is expected. You unwrap with `.unwrap_with_citation()` which forces you to thread the source through, or explicitly discard it (and write down why in the discard's annotation). The compiler enforces what your code review wishes it could. [Read the Grounded chapter →](/docs/book/09-grounded)

**Budgets and replay.** Every agent declares a `@budget($0.50)` annotation; every prompt declares its `cost:` dimension in its effect row. The compiler sums them at compile time. If the worst-case path exceeds the agent's budget, the compile fails — before the agent runs. Every run captures a deterministic trace; `corvid replay <id>` reproduces the run bit-for-bit, ~50× faster, with no model API calls. Swap a model with `corvid eval --swap-model gpt-5 ...` and Corvid diffs old behavior against new — at your desk, at your speed, not at 3 AM when the upgrade is already live. [Read the Replay chapter →](/docs/book/17-replay)

## What's NOT in v1.0

We owe honest framing.

The orchestration layer is slower than Python. On the canonical reference apps in `benches/moat/`, Corvid runs ~25–36× slower than Python LangChain and 1.7–2.6× slower than TypeScript on the same workloads. (Reproducible with `corvid bench compare python`.) Model latency dominates the wall clock anyway, so the absolute end-user numbers are usually fine — but the orchestration gap is real and we are not hiding it. We optimize for correctness, not raw throughput. The full numbers and how we measured them live at [/benchmarks](/benchmarks).

Two more honest non-promises. The type system has not yet been mechanically verified — a formal proof of the effect calculus is the post-v1.0 research agenda, not a v1.0 claim. And there is one implementation today. A second-implementation TCB shrinkage is also post-v1.0. Read the [security model](/docs/security/model-overview) for the full picture of what Corvid does and does not promise.

## How to try it in 5 minutes

If you have a terminal, you can try Corvid right now:

```sh
curl -fsSL https://corvid-lang.org/install | sh
corvid new my-agent && cd my-agent
corvid run src/main.cor
```

The install script detects your OS, downloads the matching prebuilt binary, drops `corvid` on your PATH, and runs `corvid doctor` to confirm everything works. On Windows the equivalent is `irm https://corvid-lang.org/install.ps1 | iex`. Homebrew and Scoop builds are also available; the [install guide](/docs/book/01-install) lists all four paths.

The [Quickstart](/docs/book/02-quickstart) walks the first program in about five minutes. The [Refund-agent tutorial](/docs/book/03-tutorial-refund-agent) is the next thirty minutes — the full compile-refusal moat, in working code, with passing and failing variants you can run yourself.

## The roadmap from here

v1.0 closes the design phase: every claim in the spec has a working implementation in the compiler and a runnable test. The next phase is hardening — performance work on the orchestration layer (the 25–36× number should shrink), the mechanized proof of the effect calculus, the second-implementation TCB shrinkage, and a richer ecosystem of language-specific connectors. The [public ROADMAP](https://github.com/Micrurus-Ai/Corvid-lang/blob/main/ROADMAP.md) tracks all of it slice-by-slice; nothing happens off the record.

## Discuss and contribute

If you build something with Corvid, we want to see it. [GitHub Discussions](https://github.com/Micrurus-Ai/Corvid-lang/discussions) is where conversations happen; the [Issue tracker](https://github.com/Micrurus-Ai/Corvid-lang/issues) is where bugs go. If you want to break the compiler — find a path where a tool call gated by an approval compiles without one — the [adversarial-taxonomy bounty](https://github.com/Micrurus-Ai/Corvid-lang/blob/main/docs/internals/effect-spec/bounty.md) names the prize.

The [beta program](/beta) is open. We're looking for twenty developers who want to build something real on Corvid before the v1.0 cut goes wide. Time commitment is about five hours over two weeks. We respond to every issue you file within 48 hours, and we close it either by landing a fix before launch or by writing down why it's out of scope.

Build something dangerous. Watch it refuse to compile. Then ship it anyway, because the compiler proved it's safe.

— The Corvid team
