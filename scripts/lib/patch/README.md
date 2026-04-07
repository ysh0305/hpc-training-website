# Patch Modules

These modules power `scripts/patch-external-docs.mjs`.

## What This Pipeline Does

1. Reads source docs from `docs_external/`.
2. Copies them into `docs/` while patching markdown/MDX for Docusaurus compatibility.
3. Applies known file-specific fixups for problematic upstream content.
4. Regenerates derived data:
   - weekly highlights JSON
   - catalog availability/topic metadata
   - per-repo sidebars

## Module Responsibilities

- `pipeline.mjs`: top-level coordinator and execution order
- `constants.mjs`: shared paths and static settings
- `helpers.mjs`: shell/fs helper utilities
- `copy-engine.mjs`: source-to-output traversal and copy/patch application
- `mdx-transformer.mjs`: generic markdown/MDX normalization pipeline
- `mdx-utils.mjs`: low-level HTML/MDX transform helpers
- `link-fixes.mjs`: file-specific upstream rewrite rules
- `naming.mjs`: title/label normalization helpers
- `weekly-highlights.mjs`: weekly highlights data generation
- `catalog.mjs`: catalog refresh and sidebar generation

## Where to Edit

- Add or adjust one-off upstream rewrites in `link-fixes.mjs`.
- Change generic markdown normalization behavior in `mdx-transformer.mjs`.
- Change copy behavior (skip/copy/patch flow) in `copy-engine.mjs`.
- Change generated metadata behavior in `weekly-highlights.mjs` or `catalog.mjs`.
