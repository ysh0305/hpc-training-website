import fs from "fs";
import path from "path";

export function loadSyncConfig(readJsonFn) {
  const cfgPath = path.resolve("submodules.docs.json");
  if (!fs.existsSync(cfgPath)) {
    throw new Error("submodules.docs.json not found at repo root");
  }

  const cfg = readJsonFn(cfgPath);
  cfg.org = cfg.org || process.env.ORG_NAME;
  cfg.topic = cfg.topic || "documentation";
  cfg.pathPrefix = cfg.pathPrefix || "docs_external";
  cfg.defaultBranch = cfg.defaultBranch || "main";
  cfg.autoRemove = Boolean(cfg.autoRemove);
  cfg.exclude = cfg.exclude ?? [];
  cfg.branchOverrides = cfg.branchOverrides ?? {};
  cfg.manualRepos = cfg.manualRepos ?? [];

  for (const r of cfg.manualRepos) {
    if (!r?.name || !r?.url) {
      throw new Error(
        `Each manualRepos entry must have { name, url, branch? }. Bad entry: ${JSON.stringify(r)}`
      );
    }
  }

  return cfg;
}

