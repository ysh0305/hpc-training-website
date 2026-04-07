import fs from "fs";
import path from "path";
import { listRepoTopics, normalizeTopics, parseGithubRepoFromUrl } from "./github-api.mjs";
import { buildCatalogEntry, repoHasMarkdownDocs } from "./catalog.mjs";
import {
  addOrUpdateSubmodule,
  hasSubmoduleEntry,
  pickBranch,
  removeSubmodule,
} from "./submodule-ops.mjs";

export function discoverOrgRepos(cfg, token, excludeSet, summary, listReposWithTopic) {
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
  return { orgRepos, canDiscoverOrg };
}

export function autoRemoveStaleSubmodules(cfg, canDiscoverOrg, orgRepos, excludeSet, manualNames, summary) {
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
        if (manualNames.has(name)) continue;
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
}

export function syncOrgRepos(orgRepos, cfg, token, summary, catalogEntries) {
  console.log(`Found ${orgRepos.length} org repos with topic "${cfg.topic}" (excluding configured excludes).`);
  for (const repo of orgRepos) {
    const branch = pickBranch(repo.name, repo.default_branch, cfg);
    const ok = addOrUpdateSubmodule(
      {
        name: repo.name,
        url: repo.clone_url,
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
}

export function syncManualRepos(cfg, token, excludeSet, summary, catalogEntries) {
  if (cfg.manualRepos.length === 0) return;

  console.log(`Syncing ${cfg.manualRepos.length} manual repos...`);
  for (const r of cfg.manualRepos) {
    if (excludeSet.has(r.name)) continue;

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

export function commitSyncChanges(cfg, sh, shInherit) {
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
}

