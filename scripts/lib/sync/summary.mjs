export function createSyncSummary() {
  return {
    mode: "manual-only",
    org: "",
    topic: "",
    pathPrefix: "",
    defaultBranch: "",
    autoRemove: false,
    manualReposConfigured: 0,
    orgReposDiscovered: 0,
    added: [],
    updated: [],
    removed: [],
    skipped: [],
    failed: [],
  };
}

export function applyConfigToSummary(summary, cfg) {
  summary.org = cfg.org || "";
  summary.topic = cfg.topic || "documentation";
  summary.pathPrefix = cfg.pathPrefix;
  summary.defaultBranch = cfg.defaultBranch;
  summary.autoRemove = cfg.autoRemove;
  summary.manualReposConfigured = cfg.manualRepos.length;
}

export function finalizeSummary(summary, fatalError) {
  summary.status = fatalError || summary.failed.length > 0 ? "failed" : "success";
  if (fatalError) {
    summary.error = fatalError?.message || String(fatalError);
  }
}

