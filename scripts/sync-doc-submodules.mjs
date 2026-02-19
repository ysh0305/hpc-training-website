// scripts/sync-doc-submodules.mjs
//
// Sync docs submodules for a Docusaurus portal:
//
// ✅ Auto-managed: all repos in an org with a given topic (e.g., "documentation")
//   - add if missing
//   - update to latest commit on configured branch
//   - optionally remove ones no longer tagged (autoRemove)
//
// ✅ Manual-managed: extra repos outside the org (or no-topic repos)
//   - explicitly listed in config
//   - add if missing
//   - update to latest commit on configured branch
//   - NEVER auto-removed
//
// Usage (GitHub Actions):
//   GH_TOKEN=... node scripts/sync-doc-submodules.mjs
//
// Config file (repo root): submodules.docs.json
// Example:
// {
//   "org": "sdsc-hpc-training-org",
//   "topic": "documentation",
//   "pathPrefix": "docs_external",
//   "defaultBranch": "main",
//   "autoRemove": false,
//   "exclude": ["sdsc-hpc-training-org.github.io"],
//   "branchOverrides": { "basic_skills": "master" },
//   "manualRepos": [
//     { "name": "external-training-docs", "url": "https://github.com/another-org/external-training-docs.git", "branch": "main" }
//   ]
// }

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", stdio: "pipe", ...opts }).trim();
}
function shInherit(cmd, opts = {}) {
  execSync(cmd, { stdio: "inherit", ...opts });
}
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function ghApi(url, token) {
  const out = execSync(
    `curl -sSL -H "Authorization: Bearer ${token}" -H "Accept: application/vnd.github+json" "${url}"`,
    { encoding: "utf8" }
  );
  return JSON.parse(out);
}

// Search API with topic filtering + pagination
function listReposWithTopic(org, topic, token) {
  const perPage = 100;
  let page = 1;
  let all = [];
  while (true) {
    const q = encodeURIComponent(`org:${org} topic:${topic} archived:false fork:false`);
    const url = `https://api.github.com/search/repositories?q=${q}&per_page=${perPage}&page=${page}`;
    const data = ghApi(url, token);
    const items = data.items ?? [];
    all = all.concat(items);
    if (items.length < perPage) break;
    page += 1;
  }
  return all;
}

function toGitmodulesKey(subPath) {
  return subPath.replace(/\\/g, "/"); // .gitmodules uses forward slashes
}

function setGitmodulesBranch(subPath, branch) {
  const key = `submodule.${toGitmodulesKey(subPath)}.branch`;
  shInherit(`git config -f .gitmodules ${key} ${branch}`);
}

function getGitmodulesUrl(subPath) {
  try {
    const key = `submodule.${toGitmodulesKey(subPath)}.url`;
    return sh(`git config -f .gitmodules --get ${key}`);
  } catch {
    return null;
  }
}

function hasSubmoduleEntry(subPath) {
  return Boolean(getGitmodulesUrl(subPath));
}

function isProbablySubmoduleDir(dirPath) {
  // Guard: if folder exists but isn't a tracked submodule, don't touch it.
  if (!fs.existsSync(dirPath)) return false;
  if (hasSubmoduleEntry(dirPath)) return true;
  const dotGit = path.join(dirPath, ".git");
  return fs.existsSync(dotGit);
}

function pickBranch(repoName, repoDefaultBranch, cfg) {
  const overrides = cfg.branchOverrides ?? {};
  return overrides[repoName] || repoDefaultBranch || cfg.defaultBranch || "main";
}

function submoduleAdd(url, dest) {
  shInherit(`git submodule add ${url} ${dest}`);
}

function submoduleEnsureInit(dest) {
  shInherit(`git submodule sync -- ${dest}`);
  shInherit(`git submodule update --init --recursive -- ${dest}`);
}

function submoduleUpdateRemote(dest) {
  shInherit(`git submodule update --remote --recursive -- ${dest}`);
}

function addOrUpdateSubmodule({ name, url, default_branch }, cfg, kindLabel) {
  const dest = path.join(cfg.pathPrefix, name);
  const branch = pickBranch(name, default_branch, cfg);

  ensureDir(cfg.pathPrefix);

  if (!fs.existsSync(dest) && !hasSubmoduleEntry(dest)) {
    console.log(`+ [${kindLabel}] Adding submodule ${name} -> ${dest} (branch=${branch})`);
    submoduleAdd(url, dest);
  } else {
    // If directory exists but isn't a submodule, skip for safety
    if (fs.existsSync(dest) && !isProbablySubmoduleDir(dest)) {
      console.log(
        `! [${kindLabel}] Skipping ${dest} (exists but not a tracked submodule). ` +
          `Rename/remove manually if you want it managed.`
      );
      return;
    }
    console.log(`= [${kindLabel}] Submodule exists: ${name}`);
  }

  setGitmodulesBranch(dest, branch);
  submoduleEnsureInit(dest);

  console.log(`↑ [${kindLabel}] Updating ${name} to latest on "${branch}"`);
  submoduleUpdateRemote(dest);
}

function removeSubmodule(dest) {
  console.log(`- Removing submodule ${dest}`);
  shInherit(`git submodule deinit -f ${dest}`);
  shInherit(`git rm -f ${dest}`);
}

function main() {
  const cfgPath = path.resolve("submodules.docs.json");
  if (!fs.existsSync(cfgPath)) {
    console.error("ERROR: submodules.docs.json not found at repo root");
    process.exit(1);
  }

  const cfg = readJson(cfgPath);

  // Token required for GitHub API + possibly private repo access
  const token = process.env.GH_TOKEN;
  if (!token) {
    console.error("ERROR: GH_TOKEN env var is required");
    process.exit(1);
  }

  // Normalize config
  cfg.org = cfg.org || process.env.ORG_NAME;
  cfg.topic = cfg.topic || "documentation";
  cfg.pathPrefix = cfg.pathPrefix || "docs_external";
  cfg.defaultBranch = cfg.defaultBranch || "main";
  cfg.autoRemove = Boolean(cfg.autoRemove);
  cfg.exclude = cfg.exclude ?? [];
  cfg.branchOverrides = cfg.branchOverrides ?? {};
  cfg.manualRepos = cfg.manualRepos ?? [];

  const excludeSet = new Set(cfg.exclude);

  // Validate manual repos
  for (const r of cfg.manualRepos) {
    if (!r?.name || !r?.url) {
      console.error("ERROR: Each manualRepos entry must have { name, url, branch? }");
      console.error("Bad entry:", JSON.stringify(r));
      process.exit(1);
    }
  }

  console.log(
    `Syncing docs submodules:\n` +
      `- org="${cfg.org}" topic="${cfg.topic}"\n` +
      `- pathPrefix="${cfg.pathPrefix}" defaultBranch="${cfg.defaultBranch}"\n` +
      `- autoRemove=${cfg.autoRemove}\n` +
      `- manualRepos=${cfg.manualRepos.length}\n`
  );

  // 1) Fetch org repos with topic
  let orgRepos = [];
  if (cfg.org) {
    orgRepos = listReposWithTopic(cfg.org, cfg.topic, token).filter((r) => !excludeSet.has(r.name));
  } else {
    console.log("No org configured; skipping org topic discovery.");
  }

  // 2) Build protection set for manual repos (never auto-remove)
  const manualNames = new Set(cfg.manualRepos.map((r) => r.name));

  // 3) Optional removal: ONLY remove submodules that are:
  //    - tracked in .gitmodules
  //    - under pathPrefix
  //    - NOT in org topic set
  //    - NOT in manual repos list
  if (cfg.autoRemove) {
    const validOrgNames = new Set(orgRepos.map((r) => r.name));
    const prefixDir = cfg.pathPrefix;

    if (fs.existsSync(prefixDir)) {
      const entries = fs
        .readdirSync(prefixDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      for (const name of entries) {
        if (excludeSet.has(name)) continue;
        if (manualNames.has(name)) continue; // protect manual repos
        if (validOrgNames.has(name)) continue;

        const subPath = path.join(prefixDir, name);
        if (hasSubmoduleEntry(subPath)) {
          console.log(`- [AUTO] ${name} no longer matches org topic; removing`);
          removeSubmodule(subPath);
        } else {
          console.log(`! [AUTO] Not removing ${subPath} (not a tracked submodule)`);
        }
      }
    }
  }

  // 4) Add/update org-managed repos
  console.log(`Found ${orgRepos.length} org repos with topic "${cfg.topic}" (excluding configured excludes).`);
  for (const repo of orgRepos) {
    addOrUpdateSubmodule(
      {
        name: repo.name,
        url: repo.clone_url, // https clone
        default_branch: repo.default_branch,
      },
      cfg,
      "ORG"
    );
  }

  // 5) Add/update manual repos (outside org OK)
  if (cfg.manualRepos.length > 0) {
    console.log(`Syncing ${cfg.manualRepos.length} manual repos...`);
    for (const r of cfg.manualRepos) {
      if (excludeSet.has(r.name)) continue;

      // Manual can set branch inline (overrides global map)
      const manualCfg = {
        ...cfg,
        branchOverrides: {
          ...cfg.branchOverrides,
          [r.name]: r.branch || cfg.branchOverrides[r.name] || cfg.defaultBranch,
        },
      };

      addOrUpdateSubmodule(
        {
          name: r.name,
          url: r.url,
          default_branch: r.branch || cfg.defaultBranch,
        },
        manualCfg,
        "MANUAL"
      );
    }
  }

  // 6) Commit if any changes
  const status = sh("git status --porcelain");
  if (!status) {
    console.log("No changes to commit.");
    return;
  }

  console.log("Staging changes...");
  shInherit(`git add .gitmodules ${cfg.pathPrefix}`);

  console.log("Committing...");
  shInherit(`git commit -m "chore: sync documentation submodules"`);

  console.log("Done.");
}

main();
