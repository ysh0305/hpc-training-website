# HPC Training Docs Website

This repository hosts the SDSC HPC training docs site built with [Docusaurus](https://docusaurus.io/).

## Architecture Overview

1. Source documentation repositories are tracked as git submodules under `docs_external/`.
2. `scripts/sync-doc-submodules.mjs` syncs those repos from:
   - repos in the configured org with topic `documentation` (when `GH_TOKEN` is available)
   - manual repo entries in `submodules.docs.json`
3. `scripts/patch-external-docs.mjs` transforms upstream markdown/MDX and copies results to `docs/`.
4. Docusaurus builds and serves from `docs/`.
5. Derived metadata files are regenerated during patch/sync.

### Sync Behavior

- Sync fetches branch SHA first and skips submodule update when unchanged.
- Patch tracks last processed repo SHA in `src/data/patch-processed-state.json` and repatches only changed repos.
- Removed source repos are removed from generated `docs/` output.

## Key Files

- `submodules.docs.json`: sync rules (org/topic/path/default branch/manual repos)
- `.gitmodules`: git submodule registry
- `docusaurus.config.ts`: Docusaurus site config
- `sidebars.ts`: generated per-repo sidebars
- `src/data/repo-catalog.json`: generated catalog metadata
- `src/data/events.json`: interactive video catalog source data
- `src/data/weekly-highlights.json`: generated highlight data
- `src/data/patch-processed-state.json`: persisted minimal state (repo SHA + first seen timestamp)
- `sync-summary.json`: generated sync run summary (workflow artifact)

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

Run org/topic discovery + manual sync:

```bash
GH_TOKEN=<your_github_token> node scripts/sync-doc-submodules.mjs
```

Run manual repos only:

```bash
node scripts/sync-doc-submodules.mjs
```

To sync and patch in one command:

```bash
npm run sync:docs
```

Inspect changes:

```bash
git status
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
2. Sync submodules from org topic + manual repos
3. Commit and push submodule changes (if any)
4. Build Docusaurus site
5. Deploy to GitHub Pages

## Notes

- External repo inclusion is controlled by `submodules.docs.json`.
- `manualRepos` are always included and never auto-removed.
- Org topic discovery requires `GH_TOKEN`; without it, sync runs manual-only mode.
- For manual repos, set topic labels with `topic` or `topics`.
- Patch includes a quarantine list for known problematic upstream files.
- `docs/` is generated output from `docs_external/`.
- Catalog page combines repo docs cards and interactive video cards from `src/data/events.json`.
- Interactive cards always include the `interactive video` topic and can include resource buttons (for example `GitHub`, `Slides`) when present in event data.
- Catalog pagination is client-side with 24 items per page.
