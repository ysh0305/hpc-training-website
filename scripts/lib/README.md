# Scripts Library

This directory contains modular implementation code for:

- `scripts/patch-external-docs.mjs`
- `scripts/sync-doc-submodules.mjs`

## Design Goals

- Keep each module focused on one responsibility.
- Keep `pipeline.mjs` files orchestration-only.
- Make behavior easy to change without touching unrelated logic.

## Structure

- `patch/`: modules for external docs patch/copy pipeline
- `sync/`: modules for submodule sync/discovery pipeline

## Editing Guide

- Change workflow/order in folder-level `pipeline.mjs`.
- Change behavior in the module responsible for that concern.
- Keep top-level entrypoints stable and place implementation updates here.
