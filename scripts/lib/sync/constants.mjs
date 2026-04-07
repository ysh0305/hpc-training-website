import path from "path";

export const REPO_CATALOG_PATH = path.resolve("src/data/repo-catalog.json");
export const SYNC_SUMMARY_PATH = path.resolve(process.env.SYNC_SUMMARY_PATH || "sync-summary.json");
