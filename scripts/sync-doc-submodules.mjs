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

const REPO_CATALOG_PATH = path.resolve("src/data/repo-catalog.json");
const SYNC_SUMMARY_PATH = path.resolve(process.env.SYNC_SUMMARY_PATH || "sync-summary.json");

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
function ghApi(url, token, accept = "application/vnd.github+json") {
  const out = execSync(
    `curl -sSL -H "Authorization: Bearer ${token}" -H "Accept: ${accept}" "${url}"`,
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

function parseGithubRepoFromUrl(url) {
  if (!url) return null;

  const https = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (https) {
    return { owner: https[1], name: https[2] };
  }

  const ssh = url.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (ssh) {
    return { owner: ssh[1], name: ssh[2] };
  }

  return null;
}

function listRepoTopics(owner, repo, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/topics`;
  const data = ghApi(url, token, "application/vnd.github+json");
  return Array.isArray(data?.names) ? data.names : [];
}

function normalizeTopics(topics) {
  if (!Array.isArray(topics)) return [];
  return Array.from(
    new Set(
      topics
        .map((t) => String(t).trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort();
}

function repoHasMarkdownDocs(pathPrefix, repoName) {
  const repoDir = path.join(pathPrefix, repoName);
  if (!fs.existsSync(repoDir)) return false;

  const stack = [repoDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (/\.(md|mdx)$/i.test(entry.name)) return true;
    }
  }
  return false;
}

function buildCatalogEntry({
  name,
  owner,
  url,
  branch,
  source,
  topics = [],
  hasDocs = false,
}) {
  const parsed = parseGithubRepoFromUrl(url);
  const derivedOwner = owner || parsed?.owner || "";
  return {
    id: name,
    name,
    owner: derivedOwner,
    fullName: derivedOwner ? `${derivedOwner}/${name}` : name,
    url,
    branch,
    source, // "org" | "manual"
    topics: normalizeTopics(topics),
    route: `/${name}/`,
    hasDocs,
  };
}

function writeRepoCatalog(entries) {
  ensureDir(path.dirname(REPO_CATALOG_PATH));
  const payload = {
    generatedAt: new Date().toISOString(),
    repos: entries.sort((a, b) => a.name.localeCompare(b.name)),
  };
  fs.writeFileSync(REPO_CATALOG_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote catalog metadata: ${path.relative(process.cwd(), REPO_CATALOG_PATH)}`);
}

function writeSyncSummary(summary) {
  const payload = {
    ...summary,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(SYNC_SUMMARY_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote sync summary: ${path.relative(process.cwd(), SYNC_SUMMARY_PATH)}`);
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

function isSubmoduleTracked(subPath) {
  try {
    const out = sh(`git ls-files --stage -- ${subPath}`);
    return /^160000\s/m.test(out); // gitlink mode for submodules
  } catch {
    return false;
  }
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

function submoduleAdd(url, dest, force = false) {
  const forceFlag = force ? "--force " : "";
  shInherit(`git submodule add ${forceFlag}${url} ${dest}`);
}

function submoduleEnsureInit(dest) {
  shInherit(`git submodule sync -- ${dest}`);
  shInherit(`git submodule update --init --recursive -- ${dest}`);
}

function submoduleUpdateRemote(dest) {
  shInherit(`git submodule update --remote --recursive -- ${dest}`);
}

function addOrUpdateSubmodule({ name, url, default_branch }, cfg, kindLabel, summary) {
  const dest = path.join(cfg.pathPrefix, name);
  const branch = pickBranch(name, default_branch, cfg);
  const hasEntry = hasSubmoduleEntry(dest);
  const tracked = isSubmoduleTracked(dest);
  const details = { name, kind: kindLabel.toLowerCase(), branch, path: dest, url };

  try {
    ensureDir(cfg.pathPrefix);

    let added = false;
    if (!fs.existsSync(dest) && (!hasEntry || !tracked)) {
      console.log(`+ [${kindLabel}] Adding submodule ${name} -> ${dest} (branch=${branch})`);
      if (hasEntry && !tracked) {
        console.log(`! [${kindLabel}] Found stale .gitmodules entry for ${dest}; re-adding with --force`);
      }
      submoduleAdd(url, dest, hasEntry);
      added = true;
    } else {
      // If directory exists but isn't a submodule, skip for safety
      if (fs.existsSync(dest) && !isProbablySubmoduleDir(dest)) {
        const reason = `exists but not a tracked submodule: ${dest}`;
        console.log(`! [${kindLabel}] Skipping ${reason}`);
        summary.skipped.push({ ...details, reason });
        return false;
      }

      if (!tracked && hasEntry) {
        console.log(`! [${kindLabel}] Submodule entry exists but is not tracked: ${dest}; repairing`);
        submoduleAdd(url, dest, true);
      }

      console.log(`= [${kindLabel}] Submodule exists: ${name}`);
    }

    setGitmodulesBranch(dest, branch);
    submoduleEnsureInit(dest);

    console.log(`↑ [${kindLabel}] Updating ${name} to latest on "${branch}"`);
    submoduleUpdateRemote(dest);

    if (added) summary.added.push(details);
    else summary.updated.push(details);
    return true;
  } catch (err) {
    const error = err?.message || String(err);
    console.error(`ERROR: failed to sync ${name}: ${error}`);
    summary.failed.push({ ...details, error });
    return false;
  }
}

function removeSubmodule(dest, summary, reason = "") {
  const name = path.basename(dest);
  const details = { name, kind: "auto-remove", path: dest, reason };
  try {
    console.log(`- Removing submodule ${dest}`);
    shInherit(`git submodule deinit -f ${dest}`);
    shInherit(`git rm -f ${dest}`);
    summary.removed.push(details);
    return true;
  } catch (err) {
    const error = err?.message || String(err);
    console.error(`ERROR: failed to remove ${dest}: ${error}`);
    summary.failed.push({ ...details, error });
    return false;
  }
}

function main() {
  const summary = {
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
  let fatalError = null;

  try {
    const cfgPath = path.resolve("submodules.docs.json");
    if (!fs.existsSync(cfgPath)) {
      throw new Error("submodules.docs.json not found at repo root");
    }

    const cfg = readJson(cfgPath);

  // Token is required for GitHub API operations (org/topic discovery + topic fetch),
  // but manual submodule sync can run without it.
  const token = process.env.GH_TOKEN || "";

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
    summary.org = cfg.org || "";
    summary.topic = cfg.topic || "documentation";
    summary.pathPrefix = cfg.pathPrefix;
    summary.defaultBranch = cfg.defaultBranch;
    summary.autoRemove = cfg.autoRemove;
    summary.manualReposConfigured = cfg.manualRepos.length;

  // Validate manual repos
  for (const r of cfg.manualRepos) {
    if (!r?.name || !r?.url) {
      throw new Error(`Each manualRepos entry must have { name, url, branch? }. Bad entry: ${JSON.stringify(r)}`);
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
  const canDiscoverOrg = Boolean(cfg.org && token);
  summary.mode = canDiscoverOrg ? "org+manual" : "manual-only";
  if (canDiscoverOrg) {
    orgRepos = listReposWithTopic(cfg.org, cfg.topic, token).filter((r) => !excludeSet.has(r.name));
  } else if (cfg.org && !token) {
    console.log("GH_TOKEN not set; skipping org/topic discovery and running manual repos only.");
  } else {
    console.log("No org configured; skipping org topic discovery.");
  }
  summary.orgReposDiscovered = orgRepos.length;

  // 2) Build protection set for manual repos (never auto-remove)
  const manualNames = new Set(cfg.manualRepos.map((r) => r.name));

  // 3) Optional removal: ONLY remove submodules that are:
  //    - tracked in .gitmodules
  //    - under pathPrefix
  //    - NOT in org topic set
  //    - NOT in manual repos list
  if (cfg.autoRemove && canDiscoverOrg) {
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
          removeSubmodule(subPath, summary, "missing topic match");
        } else {
          console.log(`! [AUTO] Not removing ${subPath} (not a tracked submodule)`);
        }
      }
    }
  } else if (cfg.autoRemove && !canDiscoverOrg) {
    console.log("Skipping autoRemove because org/topic discovery is unavailable without GH_TOKEN.");
  }

  // 4) Add/update org-managed repos
  console.log(`Found ${orgRepos.length} org repos with topic "${cfg.topic}" (excluding configured excludes).`);
  const catalogEntries = [];

  for (const repo of orgRepos) {
    const branch = pickBranch(repo.name, repo.default_branch, cfg);
    const ok = addOrUpdateSubmodule(
      {
        name: repo.name,
        url: repo.clone_url, // https clone
        default_branch: repo.default_branch,
      },
      cfg,
      "ORG",
      summary
    );
    if (!ok) continue;

    let topics = [];
    if (token) {
      try {
        topics = listRepoTopics(cfg.org, repo.name, token);
      } catch (err) {
        console.warn(`! [ORG] Could not fetch topics for ${cfg.org}/${repo.name}: ${err?.message || err}`);
      }
    }

    catalogEntries.push(
      buildCatalogEntry({
        name: repo.name,
        owner: cfg.org,
        url: repo.html_url || repo.clone_url,
        branch,
        source: "org",
        topics,
        hasDocs: repoHasMarkdownDocs(cfg.pathPrefix, repo.name),
      })
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

      const ok = addOrUpdateSubmodule(
        {
          name: r.name,
          url: r.url,
          default_branch: r.branch || cfg.defaultBranch,
        },
        manualCfg,
        "MANUAL",
        summary
      );
      if (!ok) continue;

      let topics = normalizeTopics([
        ...(Array.isArray(r.topics) ? r.topics : []),
        ...(r.topic ? [r.topic] : []),
      ]);
      if (topics.length === 0 && token) {
        const parsed = parseGithubRepoFromUrl(r.url);
        if (parsed) {
          try {
            topics = listRepoTopics(parsed.owner, parsed.name, token);
          } catch (err) {
            console.warn(`! [MANUAL] Could not fetch topics for ${parsed.owner}/${parsed.name}: ${err?.message || err}`);
          }
        }
      }

      catalogEntries.push(
        buildCatalogEntry({
          name: r.name,
          url: r.url.replace(/\.git$/, ""),
          branch: r.branch || cfg.defaultBranch,
          source: "manual",
          topics,
          hasDocs: repoHasMarkdownDocs(cfg.pathPrefix, r.name),
        })
      );
    }
  }

  writeRepoCatalog(catalogEntries);

  // 6) Commit if any changes
  const status = sh("git status --porcelain");
  if (!status) {
    console.log("No changes to commit.");
    return;
  }

  console.log("Staging changes...");
  shInherit(`git add .gitmodules ${cfg.pathPrefix} src/data/repo-catalog.json`);

  console.log("Committing...");
  shInherit(`git commit -m "chore: sync documentation submodules"`);

    console.log("Done.");
  } catch (err) {
    fatalError = err;
    console.error(`ERROR: ${err?.message || err}`);
  } finally {
    summary.status =
      fatalError || summary.failed.length > 0 ? "failed" : "success";
    if (fatalError) {
      summary.error = fatalError?.message || String(fatalError);
    }
    writeSyncSummary(summary);
  }

  if (fatalError || summary.failed.length > 0) {
    process.exit(1);
  }
}

main();
