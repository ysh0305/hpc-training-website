import path from "path";

export const SRC = path.resolve("docs_external"); // submodule path (read-only)
export const OUT_ROOT = path.resolve("docs"); // stable output root (do NOT delete)
export const PAGES_ROOT = path.resolve("src/pages");
export const DATA_ROOT = path.resolve("src/data");
export const REPO_CATALOG_PATH = path.resolve("src/data/repo-catalog.json");
export const WEEKLY_HIGHLIGHTS_PATH = path.resolve("src/data/weekly-highlights.json");
export const WEEKLY_STATE_PATH = path.resolve("src/data/weekly-highlights-state.json");
export const SIDEBARS_PATH = path.resolve("sidebars.ts");
export const GITMODULES_PATH = path.resolve(".gitmodules");
export const SUBMODULES_DOCS_PATH = path.resolve("submodules.docs.json");
export const LAST_SYNCED = new Date().toISOString().replace("T", " ").replace("Z", " UTC");

export const QUARANTINED_SOURCE_FILES = new Set([
  // Known problematic upstream files that can intermittently break MDX/doc metadata generation.
  "docs_external/sdsc-summer-institute-2023/README.md",
  "docs_external/sdsc-summer-institute-2023/5.1b_deep_learning_pt1/README.md",
  "docs_external/sdsc-summer-institute-2023/4.2a_python_for_hpc/dask_slurm/README.md",
  "docs_external/sdsc-summer-institute-2025/6.4_overview_of_PNRP/README.md",
]);
