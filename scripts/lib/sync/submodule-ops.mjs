import fs from "fs";
import path from "path";
import { ensureDir, sh, shInherit } from "./utils.mjs";

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

export function hasSubmoduleEntry(subPath) {
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

export function pickBranch(repoName, repoDefaultBranch, cfg) {
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

function getSubmoduleHeadSha(dest) {
  try {
    return sh(`git -C ${dest} rev-parse HEAD`);
  } catch {
    return "";
  }
}

function fetchLatestBranchSha(dest, branch) {
  try {
    shInherit(`git -C ${dest} fetch --quiet origin ${branch}`);
    return sh(`git -C ${dest} rev-parse FETCH_HEAD`);
  } catch {
    return "";
  }
}

export function addOrUpdateSubmodule({ name, url, default_branch }, cfg, kindLabel, summary) {
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

    const localShaBefore = getSubmoduleHeadSha(dest);
    const latestRemoteSha = fetchLatestBranchSha(dest, branch);
    const needsUpdate = added || !localShaBefore || !latestRemoteSha || localShaBefore !== latestRemoteSha;

    if (needsUpdate) {
      console.log(`↑ [${kindLabel}] Updating ${name} to latest on "${branch}"`);
      submoduleUpdateRemote(dest);
    } else {
      console.log(`= [${kindLabel}] ${name} already up to date on "${branch}" (${latestRemoteSha.slice(0, 7)})`);
    }

    if (added) {
      summary.added.push({ ...details, sha: latestRemoteSha || getSubmoduleHeadSha(dest) });
    } else if (needsUpdate) {
      summary.updated.push({ ...details, sha: latestRemoteSha || getSubmoduleHeadSha(dest) });
    } else {
      summary.skipped.push({ ...details, reason: "unchanged", sha: latestRemoteSha || localShaBefore });
    }
    return true;
  } catch (err) {
    const error = err?.message || String(err);
    console.error(`ERROR: failed to sync ${name}: ${error}`);
    summary.failed.push({ ...details, error });
    return false;
  }
}

export function removeSubmodule(dest, summary, reason = "") {
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
