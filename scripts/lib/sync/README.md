# Sync Modules

These modules power `scripts/sync-doc-submodules.mjs`.

## What This Pipeline Does

1. Loads and validates sync config from `submodules.docs.json`.
2. Optionally discovers org repos by GitHub topic (if token/org are available).
3. Syncs org repos and manual repos into `docs_external/` submodules.
4. Optionally removes stale org-managed submodules.
5. Rebuilds `src/data/repo-catalog.json`.
6. Writes sync summary output and commits changes when needed.

## Module Responsibilities

- `pipeline.mjs`: top-level coordinator and execution order
- `config.mjs`: config loading/defaults/validation
- `summary.mjs`: summary object creation/finalization
- `workflow.mjs`: sync workflow steps (discover, sync, auto-remove, commit)
- `github-api.mjs`: GitHub API helpers for repos/topics
- `submodule-ops.mjs`: git submodule add/update/remove operations
- `catalog.mjs`: catalog entry generation + write helpers + summary write
- `constants.mjs`: shared sync constants
- `utils.mjs`: shell/fs/json helper functions

## Where to Edit

- Change sync logic/order in `workflow.mjs` (or `pipeline.mjs` for orchestration).
- Change config behavior or validation in `config.mjs`.
- Change GitHub query behavior in `github-api.mjs`.
- Change git submodule command behavior in `submodule-ops.mjs`.
- Change catalog output shape in `catalog.mjs`.
