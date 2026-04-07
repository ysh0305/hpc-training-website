// Patch pipeline coordinator for scripts/patch-external-docs.mjs.

import fs from "fs";
import path from "path";
import {
  DATA_ROOT,
  GITMODULES_PATH,
  LAST_SYNCED,
  OUT_ROOT,
  PAGES_ROOT,
  QUARANTINED_SOURCE_FILES,
  REPO_CATALOG_PATH,
  SIDEBARS_PATH,
  SRC,
  SUBMODULES_DOCS_PATH,
  WEEKLY_HIGHLIGHTS_PATH,
  WEEKLY_STATE_PATH,
} from "./constants.mjs";
import { ensureDir, normalizeRepoUrl, parseGitHubOwnerRepo, removePathSafe, sh } from "./helpers.mjs";
import {
  generateRepoSidebars,
  refreshCatalogDocAvailability,
} from "./catalog.mjs";
import { syncSourceToOutput } from "./copy-engine.mjs";
import { patchMdx } from "./mdx-transformer.mjs";
import { toTitleFromFolder } from "./naming.mjs";
import { generateWeeklyHighlightsData } from "./weekly-highlights.mjs";

function isQuarantinedSourceFile(sourcePath) {
  const rel = path.relative(process.cwd(), sourcePath).replace(/\\/g, "/");
  return QUARANTINED_SOURCE_FILES.has(rel);
}

function writeQuarantinePlaceholder(outPath, sourcePath) {
  const rel = path.relative(process.cwd(), sourcePath).replace(/\\/g, "/");
  const title = toTitleFromFolder(path.basename(path.dirname(sourcePath)) || "Quarantined");
  const placeholder = [
    "---",
    `title: ${JSON.stringify(title)}`,
    "---",
    "",
    "<!-- source-sync-meta -->",
    `> Source file quarantined from: \`${rel}\``,
    "",
    "This source file is temporarily quarantined by the docs patch pipeline due to known upstream formatting issues.",
    "The rest of this repository remains available.",
    "",
  ].join("\n");
  fs.writeFileSync(outPath, placeholder, "utf8");
}

function parseGitmodules() {
  const byPath = new Map();
  if (!fs.existsSync(GITMODULES_PATH)) return byPath;

  const lines = fs.readFileSync(GITMODULES_PATH, "utf8").split(/\r?\n/);
  let current = null;

  for (const line of lines) {
    const section = line.match(/^\[submodule\s+"([^"]+)"\]$/);
    if (section) {
      if (current?.path) byPath.set(current.path, current);
      current = { section: section[1], path: "", url: "", branch: "" };
      continue;
    }
    if (!current) continue;

    const pathMatch = line.match(/^\s*path\s*=\s*(.+)\s*$/);
    if (pathMatch) {
      current.path = pathMatch[1].trim().replace(/\\/g, "/");
      continue;
    }
    const urlMatch = line.match(/^\s*url\s*=\s*(.+)\s*$/);
    if (urlMatch) {
      current.url = urlMatch[1].trim();
      continue;
    }
    const branchMatch = line.match(/^\s*branch\s*=\s*(.+)\s*$/);
    if (branchMatch) {
      current.branch = branchMatch[1].trim();
      continue;
    }
  }

  if (current?.path) byPath.set(current.path, current);
  return byPath;
}

const SUBMODULE_META = parseGitmodules();

function getRepoMetaForSourcePath(sourcePath) {
  if (!sourcePath) return null;
  const rel = path.relative(process.cwd(), sourcePath).replace(/\\/g, "/");
  if (!rel.startsWith("docs_external/")) return null;

  const parts = rel.split("/");
  if (parts.length < 2) return null;
  const repoPath = `${parts[0]}/${parts[1]}`;
  const meta = SUBMODULE_META.get(repoPath);
  if (!meta) return null;

  return {
    repoPath,
    repoName: parts[1],
    repoUrl: normalizeRepoUrl(meta.url),
    branch: meta.branch || "main",
  };
}

function getRepoNameFromSourcePath(sourcePath = "") {
  const rel = sourcePath.replace(/\\/g, "/");
  const m = rel.match(/docs_external\/([^/]+)/);
  return m ? m[1] : "";
}

function toSidebarId(repoName) {
  return `repo_${String(repoName || "").replace(/[^A-Za-z0-9_]/g, "_")}`;
}
function injectSourceBanner(text, sourcePath) {
  const meta = getRepoMetaForSourcePath(sourcePath);
  if (!meta) return text;

  const banner =
    `<!-- source-sync-meta -->\n` +
    `> Source repo: [${meta.repoName}](${meta.repoUrl}) | Branch: \`${meta.branch}\` | Last synced: ${LAST_SYNCED}\n\n`;

  const fm = text.match(/^---\n[\s\S]*?\n---\n/);
  if (fm) {
    return `${fm[0]}${banner}${text.slice(fm[0].length)}`;
  }
  return `${banner}${text}`;
}

// Fail fast if submodule folder is missing/empty
if (!fs.existsSync(SRC) || fs.readdirSync(SRC).length === 0) {
  console.error(
    `ERROR: external docs not found or empty at ${SRC}\n` +
      `Run: git submodule update --init --recursive`
  );
  process.exit(1);
}

// Ensure output root exists (never delete this folder)
ensureDir(OUT_ROOT);
ensureDir(PAGES_ROOT);
ensureDir(DATA_ROOT);

// Clean up legacy docs route for weekly highlights (moved to src/pages).
fs.rmSync(path.join(OUT_ROOT, "updates", "what-changed-this-week.md"), { force: true });
fs.rmSync(path.join(PAGES_ROOT, "weekly-highlights.md"), { force: true });

const patchMdxDeps = {
  SRC,
  getRepoMetaForSourcePath,
  getRepoNameFromSourcePath,
  injectSourceBanner,
  toSidebarId,
};

syncSourceToOutput(SRC, OUT_ROOT, {
  ensureDir,
  removePathSafe,
  patchMdx,
  patchMdxDeps,
  isQuarantinedSourceFile,
  writeQuarantinePlaceholder,
});

generateWeeklyHighlightsData({
  SUBMODULE_META,
  DATA_ROOT,
  OUT_ROOT,
  SRC,
  WEEKLY_HIGHLIGHTS_PATH,
  WEEKLY_STATE_PATH,
  ensureDir,
  normalizeRepoUrl,
  sh,
  toTitleFromFolder,
});

refreshCatalogDocAvailability({
  OUT_ROOT,
  REPO_CATALOG_PATH,
  SUBMODULES_DOCS_PATH,
  SUBMODULE_META,
  normalizeRepoUrl,
  parseGitHubOwnerRepo,
});

generateRepoSidebars({
  SUBMODULE_META,
  SIDEBARS_PATH,
  toSidebarId,
  OUT_ROOT,
});

console.log(`Patched external docs: ${SRC} -> ${OUT_ROOT}`);
