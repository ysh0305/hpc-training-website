// Sync pipeline coordinator for scripts/sync-doc-submodules.mjs.

import { sh, shInherit, readJson } from "./utils.mjs";
import { listReposWithTopic } from "./github-api.mjs";
import { writeSyncSummary, writeRepoCatalog } from "./catalog.mjs";
import { loadSyncConfig } from "./config.mjs";
import { applyConfigToSummary, createSyncSummary, finalizeSummary } from "./summary.mjs";
import {
  autoRemoveStaleSubmodules,
  commitSyncChanges,
  discoverOrgRepos,
  syncManualRepos,
  syncOrgRepos,
} from "./workflow.mjs";

function main() {
  const summary = createSyncSummary();
  let fatalError = null;

  try {
    const cfg = loadSyncConfig(readJson);
    const token = process.env.GH_TOKEN || "";
    const excludeSet = new Set(cfg.exclude);
    applyConfigToSummary(summary, cfg);

    console.log(
      `Syncing docs submodules:\n` +
        `- org="${cfg.org}" topic="${cfg.topic}"\n` +
        `- pathPrefix="${cfg.pathPrefix}" defaultBranch="${cfg.defaultBranch}"\n` +
        `- autoRemove=${cfg.autoRemove}\n` +
        `- manualRepos=${cfg.manualRepos.length}\n`
    );

    const { orgRepos, canDiscoverOrg } = discoverOrgRepos(
      cfg,
      token,
      excludeSet,
      summary,
      listReposWithTopic
    );

    // Build protection set for manual repos (never auto-remove).
    const manualNames = new Set(cfg.manualRepos.map((r) => r.name));

    autoRemoveStaleSubmodules(cfg, canDiscoverOrg, orgRepos, excludeSet, manualNames, summary);
    const catalogEntries = [];
    syncOrgRepos(orgRepos, cfg, token, summary, catalogEntries);
    syncManualRepos(cfg, token, excludeSet, summary, catalogEntries);

    writeRepoCatalog(catalogEntries);
    commitSyncChanges(cfg, sh, shInherit);
  } catch (err) {
    fatalError = err;
    console.error(`ERROR: ${err?.message || err}`);
  } finally {
    finalizeSummary(summary, fatalError);
    writeSyncSummary(summary);
  }

  if (fatalError || summary.failed.length > 0) {
    process.exit(1);
  }
}

main();
