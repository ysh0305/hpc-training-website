# Sync Modules

These modules implement `scripts/sync-doc-submodules.mjs`.

## Pipeline Flow

1. Load and validate `submodules.docs.json`.
2. Discover org repos by topic when `GH_TOKEN` is available.
3. Sync manual repos listed in config.
4. For each submodule, fetch remote branch SHA and skip update when unchanged.
5. Optionally auto-remove stale org-managed submodules.
6. Regenerate catalog metadata and write sync summary.
7. Commit sync changes when there is a git diff.

## Main Files

- `pipeline.mjs`: top-level sync orchestration
- `config.mjs`: config loading/defaults/validation
- `summary.mjs`: summary creation/finalization helpers
- `workflow.mjs`: discover/sync/auto-remove/commit flow
- `github-api.mjs`: GitHub repo/topic discovery helpers
- `submodule-ops.mjs`: git submodule add/update/remove operations
- `catalog.mjs`: repo catalog generation + summary writer
- `utils.mjs`: shared shell/fs/json helpers
- `constants.mjs`: shared sync constants

## Mode Behavior

- With `GH_TOKEN`: org+manual mode
- Without `GH_TOKEN`: manual-only mode (no org topic discovery)

## Generated Artifacts

- `src/data/repo-catalog.json`: generated repository catalog
- `sync-summary.json`: sync run summary (used in workflow logs/artifacts)

## Where To Edit

- Change sync order/flow: `workflow.mjs` and `pipeline.mjs`
- Change validation/defaults: `config.mjs`
- Change GitHub query behavior: `github-api.mjs`
- Change git submodule behavior: `submodule-ops.mjs`
- Change catalog output shape: `catalog.mjs`
