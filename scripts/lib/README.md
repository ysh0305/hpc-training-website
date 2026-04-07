# Scripts Library

The goals of this layout are:

- Keep each file focused on one job.
- Make behavior easier to debug and update.

## Structure

- `patch/`: modules used by the external-doc patch/build pipeline
- `sync/`: modules used by the submodule discovery/sync pipeline

## How to Use

- If you need to change high-level flow, edit the `pipeline.mjs` in that folder.
- If you need to change specific behavior, edit the module responsible for that behavior (for example link rewrites, GitHub API fetches, or catalog writing).
- Keep entrypoints stable; most implementation changes should happen under `scripts/lib/*`.
