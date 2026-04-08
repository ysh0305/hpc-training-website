# Patch Modules

These modules implement `scripts/patch-external-docs.mjs`.

## Pipeline Flow

1. Read source repos from `docs_external/`.
2. Patch markdown/MDX and copy output into `docs/`.
3. Apply file-specific upstream fixes and quarantine known problematic files.
4. Regenerate derived data files (catalog, sidebars, weekly highlights).
5. Persist patch SHA state so future runs patch only changed repos.

## Main Files

- `pipeline.mjs`: top-level patch orchestration
- `constants.mjs`: shared paths and settings
- `helpers.mjs`: shared shell/fs utilities
- `copy-engine.mjs`: source traversal + copy/patch execution
- `mdx-transformer.mjs`: generic markdown/MDX normalization
- `mdx-utils.mjs`: low-level HTML/MDX helper transforms
- `link-fixes.mjs`: targeted per-file upstream fixes
- `naming.mjs`: display/title normalization helpers
- `weekly-highlights.mjs`: weekly highlight dataset generation
- `catalog.mjs`: catalog and sidebar generation helpers

## State Files

- `src/data/patch-processed-state.json`: patch + weekly minimal state (repo SHA, firstSeenAt)
- `src/data/weekly-highlights.json`: generated highlight data

## Where To Edit

- Add one-off source fix rules: `link-fixes.mjs`
- Change generic markdown transformation behavior: `mdx-transformer.mjs`
- Change patch scope/copy behavior: `copy-engine.mjs` and `pipeline.mjs`
- Change generated metadata behavior: `weekly-highlights.mjs` or `catalog.mjs`
