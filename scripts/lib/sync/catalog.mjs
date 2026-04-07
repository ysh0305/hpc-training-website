import fs from "fs";
import path from "path";
import { ensureDir } from "./utils.mjs";
import { REPO_CATALOG_PATH, SYNC_SUMMARY_PATH } from "./constants.mjs";
import { normalizeTopics, parseGithubRepoFromUrl } from "./github-api.mjs";

export function repoHasMarkdownDocs(pathPrefix, repoName) {
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

export function buildCatalogEntry({
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

export function writeRepoCatalog(entries) {
  ensureDir(path.dirname(REPO_CATALOG_PATH));
  const payload = {
    generatedAt: new Date().toISOString(),
    repos: entries.sort((a, b) => a.name.localeCompare(b.name)),
  };
  fs.writeFileSync(REPO_CATALOG_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote catalog metadata: ${path.relative(process.cwd(), REPO_CATALOG_PATH)}`);
}

export function writeSyncSummary(summary) {
  const payload = {
    ...summary,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(SYNC_SUMMARY_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote sync summary: ${path.relative(process.cwd(), SYNC_SUMMARY_PATH)}`);
}
