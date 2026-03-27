# HPC Training Docs Website

This repository hosts the SDSC HPC training docs site built with [Docusaurus](https://docusaurus.io/).

## How It Works

- Documentation source repos are tracked as git submodules under `docs_external/`.
- Submodules are synced from your GitHub org by topic (`documentation`) using `scripts/sync-doc-submodules.mjs`.
- External docs are patched/copied into `docs/` by `scripts/patch-external-docs.mjs`.
- Docusaurus serves/builds from `docs/`.

Key config files:

- `submodules.docs.json` - org/topic/path/branch rules for sync
- `.gitmodules` - tracked submodule entries
- `docusaurus.config.ts` - site/nav/theme config
- `src/data/repo-catalog.json` - generated catalog metadata (topics, source, branch, route)
- `src/data/weekly-highlights.json` - generated weekly highlights data
- `src/data/weekly-highlights-state.json` - persisted state for detecting newly added/updated repos
- `sidebars.ts` - generated per-repo sidebars for docs navigation

## Prerequisites

- Node.js `>=20`
- npm

## Install

```bash
npm install
```

## Run Locally

```bash
npm run start
```

`prestart` automatically runs `scripts/patch-external-docs.mjs` first.

## Build Locally

```bash
npm run build
```

`prebuild` also runs `scripts/patch-external-docs.mjs` first and outputs static files to `build/`.

## Sync Submodules Locally

To run org/topic auto-sync (requires GitHub API token):

```bash
GH_TOKEN=<your_github_token> node scripts/sync-doc-submodules.mjs
```

To sync manual repos only (no GitHub token):

```bash
node scripts/sync-doc-submodules.mjs
```

To sync and patch in one command:

```bash
npm run sync:docs
```

Then check what changed:

```bash
git status
cat .gitmodules
ls docs_external
```

## GitHub Actions (Single Workflow)

Workflow: `.github/workflows/sync-doc-submodules.yml`

Triggers:

- push to `main`
- pull requests targeting `main` (build check only)
- daily schedule (`0 9 * * *`)
- manual dispatch

Pipeline in one workflow:

1. PR check path: patch + build validation only
1. Sync submodules from org topic + manual repos
2. Commit and push submodule changes (if any)
3. Build Docusaurus site
4. Deploy to GitHub Pages

## Notes

- External repo inclusion rules are controlled by `submodules.docs.json`.
- Repos discovered by org topic are auto-removed when they no longer match the configured topic (`autoRemove: true`).
- `manualRepos` are always included and never auto-removed.
- Org topic discovery and GitHub topic fetching require `GH_TOKEN`.
- Without `GH_TOKEN`, sync runs in manual-only mode (no org/topic discovery).
- Repo topics are pulled from GitHub during submodule sync when token is available and written to `src/data/repo-catalog.json`.
- For `manualRepos`, you can override topics with `topic` (string) or `topics` (string array).
- Docs patching is idempotent and reruns on every start/build, and also regenerates `weekly-highlights` data and `sidebars.ts`.
- `docs/` is generated from `docs_external/` by patching; keep only `docs/index.md` as source-of-truth in git.
- Patch script supports an internal quarantine list for known-bad upstream docs to avoid breaking builds.
- Sync workflow emits `sync-summary.json` and uploads it as a workflow artifact for monitoring.
