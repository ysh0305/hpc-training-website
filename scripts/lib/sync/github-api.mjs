import { execSync } from "child_process";

export function ghApi(url, token, accept = "application/vnd.github+json") {
  const out = execSync(
    `curl -sSL -H "Authorization: Bearer ${token}" -H "Accept: ${accept}" "${url}"`,
    { encoding: "utf8" }
  );
  return JSON.parse(out);
}

// Search API with topic filtering + pagination.
export function listReposWithTopic(org, topic, token) {
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

export function parseGithubRepoFromUrl(url) {
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

export function listRepoTopics(owner, repo, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/topics`;
  const data = ghApi(url, token, "application/vnd.github+json");
  return Array.isArray(data?.names) ? data.names : [];
}

export function normalizeTopics(topics) {
  if (!Array.isArray(topics)) return [];
  return Array.from(
    new Set(
      topics
        .map((t) => String(t).trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort();
}
