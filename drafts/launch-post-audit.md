# Launch post wording audit — `blog-site/src/content/blog/corvid-v1-0.md`

> Per the brief, **every claim in the launch post must trace to a
> runnable command, a test, or a committed example** before the post
> ships publicly. Phase 35V T1-H/T1-K spent several slices tightening
> aspirational wording out of README and security-model.md; this
> audit pins the post's wording with the same discipline.

## Status

- **Draft state:** complete (1,053 words, 8-section structure per brief).
- **Audit state:** this document.
- **Publish gate:** maintainer review + the two unbuilt dependencies
  named in §3 below MUST be live before the post goes public.

## §1. Numerical and behavioral claims — sources

| Claim (paraphrased) | Source of truth |
|---|---|
| ~25–36× slower than Python LangChain on canonical reference apps | `benches/moat/*/RESULTS.md` (upstream); the brief's handoff doc cites these as "Phase 17" numbers. Reproducible via `corvid bench compare python`. |
| 1.7–2.6× slower than TypeScript on the same workloads | Same source. |
| `corvid replay <id>` reproduces a run bit-for-bit ~50× faster | The brief's 33L launch-video script scene 3 names this number. Belongs in `docs/book/17-replay.md` if not already there. |
| `corvid eval --swap-model gpt-5` diffs old vs new model behavior | Brief 33L scene 3. CLI surface lives in `docs/reference/cli.md`. |
| `approval.dangerous_call_requires_token` is the guarantee_id | Named in brief 33L scene 1. Should be in `docs/reference/guarantees.md`. |
| Quickstart takes ~5 minutes, refund-agent tutorial ~30 minutes | Soft estimates qualified with "about". Match against the actual tutorial when this audit runs. |

## §2. Code and CLI examples — runnability

| Example | Runnable as |
|---|---|
| The five-line compile-refusal `agent refund_bot(...)` | Verifiable by saving the snippet as `src/main.cor`, running `corvid check` — the rendered compile-refusal error should match in shape. Column position (`:3:12`) may differ; the guarantee_id and the diagnostic structure are the load-bearing parts. |
| `curl -fsSL https://corvid-lang.org/install \| sh` | Verified: 302 redirect to `Corvid-lang/main/install/install.sh`. |
| `irm https://corvid-lang.org/install.ps1 \| iex` | Verified: 302 redirect to `Corvid-lang/main/install/install.ps1`. |
| `corvid new my-agent && cd my-agent` | Standard. Cross-check against `docs/reference/cli.md`. |
| `corvid run src/main.cor` | Standard. Cross-check against `docs/reference/cli.md`. |
| `.unwrap_with_citation()` method name | Plausible from brief 33L scene 2 ("unwrap_with_citation() fixes it"). Cross-check against `Grounded` stdlib docs / `docs/book/09-grounded.md`. |

## §3. In-website links — must resolve before publish

| Link in post | Resolves at | Status |
|---|---|---|
| `/docs/book/08-approve` | docs site | ✅ live |
| `/docs/book/09-grounded` | docs site | ✅ live |
| `/docs/book/17-replay` | docs site | ✅ live |
| `/docs/book/01-install` | docs site | ✅ live |
| `/docs/book/02-quickstart` | docs site | ✅ live |
| `/docs/book/03-tutorial-refund-agent` | docs site | ✅ live |
| `/docs/security/model-overview` | docs site | ✅ live |
| `/benchmarks` | website | ❌ **NOT YET BUILT** — slice 33J4 |
| `/beta` | website | ❌ **NOT YET BUILT** — slice 33M |

**Publish gate:** the post should NOT go live until 33J4 (`/benchmarks`)
and 33M (`/beta`) ship, OR the two links in the post are removed
before publish.

## §4. External links

| Link | Verified |
|---|---|
| `github.com/Micrurus-Ai/Corvid-lang/discussions` | upstream public repo, exists |
| `github.com/Micrurus-Ai/Corvid-lang/issues` | upstream public repo, exists |
| `github.com/Micrurus-Ai/Corvid-lang/blob/main/ROADMAP.md` | confirm path before publish |
| `github.com/Micrurus-Ai/Corvid-lang/blob/main/docs/internals/effect-spec/bounty.md` | confirm path before publish |

## §5. Aspirational-wording softenings applied during audit

| Original | Tightened | Reason |
|---|---|---|
| "We watched five teams build all five, badly." | "We've watched teams rebuild all five. Each rewrite reintroduces a different variant of the same bug class." | Original implies a specific anecdote we can't cite; softened to a pattern claim that's defensible without citation. |
| "the compiler proved it's safe." (closing line) | "the compiler proved no path can reach a gated tool call without an approval." | "Safe" is broader than what Corvid actually proves. The tightened phrasing names the exact property the compiler verifies. |

## §6. What was NOT softened (and why)

- The "v1.0 shipped" framing — load-bearing assumption that this post
  publishes on launch day. If launch slips, the date in frontmatter
  (`pubDate`) and several "we just shipped" mentions need to track.
- The compile-refusal diagnostic format — illustrative, not promised
  byte-for-byte. The guarantee_id and the help message structure are
  the parts a visitor will recognize when they run `corvid check`.
- The 25–36× / 1.7–2.6× numbers — pulled verbatim from the brief.
  If `benches/moat/*/RESULTS.md` reports a different range when this
  audit re-runs, update both the post and `/benchmarks` together.

## §7. What the next audit should add

When `/benchmarks` (slice 33J4) ships, replace the two cited ratio
ranges in the post with permalinks to the specific `RESULTS.md`
headings on GitHub. Right now those numbers sit as plain text; they
should become hyperlinks once the benchmarks page exists. Document
this in `docs/meta/launch-claim-audit.md` so it does not slip.
