import fs from "fs";
import { execSync } from "child_process";

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

export function removePathSafe(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch (err) {
    try {
      execSync(`rm -rf ${JSON.stringify(p)}`, { stdio: "pipe" });
    } catch {
      throw err;
    }
  }
}

export function normalizeRepoUrl(url) {
  if (!url) return "";
  if (url.startsWith("git@github.com:")) {
    return `https://github.com/${url.slice("git@github.com:".length).replace(/\.git$/, "")}`;
  }
  return url.replace(/\.git$/, "");
}

export function parseGitHubOwnerRepo(url) {
  const normalized = normalizeRepoUrl(url);
  const m = normalized.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/i);
  if (!m) return { owner: "", repo: "" };
  return { owner: m[1], repo: m[2] };
}

export function sh(cmd, cwd = process.cwd()) {
  return execSync(cmd, { encoding: "utf8", stdio: "pipe", cwd }).trim();
}
