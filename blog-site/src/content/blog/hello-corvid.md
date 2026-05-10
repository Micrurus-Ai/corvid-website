---
title: Hello, Corvid
description: A placeholder post that exists so the build pipeline has content to render while the v1.0 launch post is still being drafted.
pubDate: 2026-05-10
author: Micrurus AI
draft: false
---

This is a scaffold post. It exists so the blog's build pipeline has at least one entry to render. It will be removed (or rewritten) before the v1.0 launch.

A quick test of Corvid syntax highlighting:

```corvid
agent refund_bot(brief: String) -> Refund uses session, audit:
    #: Issues a refund only when the customer's claim is approved.
    let claim = approve RefundClaim(amount: $50.00)
    return process_refund(claim)
```

If the page renders the keywords `agent`, `approve`, the type `Refund`, the doc comment `#:`, the money literal `$50.00`, and the function call `process_refund` with distinct highlighting, the Shiki pipeline + Corvid TextMate grammar are working end to end.
