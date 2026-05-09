# Corvid docs site (slice 33J3)

This subdirectory builds the docs section of [corvid-lang.org](https://corvid-lang.org). It renders the markdown tree from [`Micrurus-Ai/Corvid-lang/docs/`](https://github.com/Micrurus-Ai/Corvid-lang/tree/main/docs) using [Astro Starlight](https://starlight.astro.build/), and the output is assembled into `../public/docs/` for Firebase Hosting alongside the marketing landing page.

## Local development

```sh
cd docs-site
npm install
npm run dev    # runs prebuild → sync, then astro dev on http://localhost:4321/docs
```

The first run shallow-clones `Micrurus-Ai/Corvid-lang` into `../.corvid-source/`. Subsequent runs `git fetch` + `reset --hard` against `origin/main`. To pin to a different branch or tag while iterating, set `CORVID_LANG_REF`:

```sh
CORVID_LANG_REF=feature/branch-x npm run dev
```

To preview the full deploy artifact (landing + docs) the way Firebase will serve it:

```sh
npm run build                   # docs-site/dist/
node ../scripts/assemble-public.mjs   # ../public/{index.html,docs/...}
firebase emulators:start --only hosting
```

## Architecture

```
corvid-website/
├── index.html, assets/, logos/, social/   ← marketing landing (untouched by this slice)
├── docs-site/                             ← THIS PROJECT (Starlight)
│   └── src/content/docs/                  ← gitignored; populated by sync at build time
├── scripts/
│   ├── sync-docs.mjs                      ← shallow-clones Corvid-lang, copies docs/, drops phases/
│   └── assemble-public.mjs                ← builds ../public/ from landing + dist/
├── public/                                ← Firebase Hosting deploy artifact (gitignored)
├── firebase.json + .firebaserc            ← project: corvid-website
└── .github/workflows/deploy.yml           ← sync → build → deploy
```

The `scripts/sync-docs.mjs` step:
- Excludes `docs/phases/` (historical engineering records, not user-facing).
- Renames each section's `README.md` to `index.md` so Starlight serves it as the section landing page.
- Injects a `title:` frontmatter on any file that doesn't have one (Starlight requires it; not every upstream md has frontmatter yet).

## Deploy

Two triggers fire `deploy.yml`:

1. **Push to `main` on this repo** — landing or build-pipeline changes redeploy.
2. **`repository_dispatch` of type `corvid-lang-docs-changed`** — fired from the upstream repo when `docs/` changes (see "Upstream dispatch hook" below).

`workflow_dispatch` is also enabled for manual reruns.

### Authentication: Workload Identity Federation (no secret needed)

The deploy auths to GCP via WIF — GitHub Actions mints an OIDC token that GCP's STS exchanges for a short-lived access token at runtime. **No JSON key file ever exists**, which both respects the `micrurus.com` org policy `constraints/iam.disableServiceAccountKeyCreation` and is Google's currently recommended posture.

Already provisioned (one-time, on 2026-05-09):

- Service account: `gha-deploy@corvid-website.iam.gserviceaccount.com` with role `roles/firebasehosting.admin`.
- Workload identity pool: `github-pool` in project `corvid-website`.
- OIDC provider: `github-provider`, restricted via attribute condition `assertion.repository_owner == 'Micrurus-Ai'` (so only repos in your org can impersonate the SA).
- IAM binding: `principalSet://.../attribute.repository/Micrurus-Ai/corvid-website` → `roles/iam.workloadIdentityUser` on the SA.

The workflow YAML references the provider as:
```
projects/616744154906/locations/global/workloadIdentityPools/github-pool/providers/github-provider
```

To rebuild this from scratch, see the gcloud command sequence committed in `docs-site/README.md` history (commit `feat(33J3)`).

### Optional GitHub secrets

- **`CORVID_LANG_TOKEN`** *(optional)* — only needed if `Micrurus-Ai/Corvid-lang` becomes a private repo. PAT scoped to `contents:read` on that repo.

### Custom domain (corvid-lang.org)

1. In the Firebase console, **Hosting → Add custom domain → corvid-lang.org**. Firebase issues a verification TXT record.
2. Set the verification TXT at the domain registrar.
3. Once verified, Firebase prints two A records (or the recommended AAAA pair). Set them at the registrar; TTL ≤ 3600.
4. Provisioning + cert issuance takes 30–60 minutes. The site keeps working at `https://corvid-website.web.app` until then.

Until DNS is cut over, the canonical URL in `astro.config.mjs` (`site: 'https://corvid-lang.org'`) will produce sitemap/canonical links pointing at the eventual domain. That's intentional — links work the moment DNS resolves, no rebuild needed.

## Upstream dispatch hook (Micrurus-Ai/Corvid-lang)

Add this workflow at `.github/workflows/notify-website.yml` in the language repo so docs edits redeploy the site:

```yaml
name: Notify website on docs change

on:
  push:
    branches: [main]
    paths: ['docs/**']

jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger website deploy
        run: |
          curl -X POST \
            -H "Accept: application/vnd.github+json" \
            -H "Authorization: Bearer ${{ secrets.WEBSITE_DISPATCH_TOKEN }}" \
            https://api.github.com/repos/Micrurus-Ai/corvid-website/dispatches \
            -d '{"event_type":"corvid-lang-docs-changed","client_payload":{"sha":"${{ github.sha }}"}}'
```

`WEBSITE_DISPATCH_TOKEN` is a fine-grained PAT with **Actions: Write** on `Micrurus-Ai/corvid-website`.

This file is *not* added in this slice (the brief explicitly says don't push to the language repo). File a PR there separately when you're ready.

## Corvid syntax highlighting

` ```corvid ` blocks are highlighted via a TextMate grammar at [`src/grammars/corvid.tmLanguage.json`](./src/grammars/corvid.tmLanguage.json), loaded by Shiki through Expressive Code in [`astro.config.mjs`](./astro.config.mjs). The grammar covers every category from the brief: keywords, control flow, declarations, built-in types, PascalCase user types, `@annotations` (including `@host.namespace.method` chains), `approve <PascalCaseAction>`, `Grounded<T>`, `$money` literals, doc comments (`#:`) vs line comments (`#`), single + triple strings.

To validate after edits to the grammar, the brief points at three reference files for the test corpus:
- `docs/book/03-tutorial-refund-agent.md`
- `docs/book/07-effects.md`
- `docs/recipes/README.md`

After `npm run dev`, navigate to those pages and visually check the colorization against the token list in the brief.

## What this slice intentionally does NOT do

Per the brief's "Out of scope" section, these land separately:
- **WASM playground** (slice 33J7)
- **Benchmarks page** (slice 33J4)
- **Blog shell** (slice 33J5)
- **Grammar drift gate** (slice 33J6)
- **Authoring new docs** — happens upstream in `Micrurus-Ai/Corvid-lang`. This site only renders.
