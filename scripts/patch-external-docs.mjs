// scripts/patch-external-docs.mjs
// Copies docs from a submodule folder into a generated docs folder,
// patching MD/MDX to be MDX-safe, WITHOUT deleting the output root folder.

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const SRC = path.resolve("docs_external"); // submodule path (read-only)
const OUT_ROOT = path.resolve("docs");     // stable output root (do NOT delete)
const PAGES_ROOT = path.resolve("src/pages");
const DATA_ROOT = path.resolve("src/data");
const REPO_CATALOG_PATH = path.resolve("src/data/repo-catalog.json");
const WEEKLY_HIGHLIGHTS_PATH = path.resolve("src/data/weekly-highlights.json");
const WEEKLY_STATE_PATH = path.resolve("src/data/weekly-highlights-state.json");
const SIDEBARS_PATH = path.resolve("sidebars.ts");
const GITMODULES_PATH = path.resolve(".gitmodules");
const SUBMODULES_DOCS_PATH = path.resolve("submodules.docs.json");
const LAST_SYNCED = new Date().toISOString().replace("T", " ").replace("Z", " UTC");
const QUARANTINED_SOURCE_FILES = new Set([
  // Known problematic upstream files that can intermittently break MDX/doc metadata generation.
  "docs_external/sdsc-summer-institute-2023/README.md",
  "docs_external/sdsc-summer-institute-2023/5.1b_deep_learning_pt1/README.md",
  "docs_external/sdsc-summer-institute-2023/4.2a_python_for_hpc/dask_slurm/README.md",
  "docs_external/sdsc-summer-institute-2025/6.4_overview_of_PNRP/README.md",
]);

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function removePathSafe(p) {
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

function normalizeRepoUrl(url) {
  if (!url) return "";
  if (url.startsWith("git@github.com:")) {
    return `https://github.com/${url.slice("git@github.com:".length).replace(/\.git$/, "")}`;
  }
  return url.replace(/\.git$/, "");
}

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

function parseGitHubOwnerRepo(url) {
  const normalized = normalizeRepoUrl(url);
  const m = normalized.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/i);
  if (!m) return { owner: "", repo: "" };
  return { owner: m[1], repo: m[2] };
}

function sh(cmd, cwd = process.cwd()) {
  return execSync(cmd, { encoding: "utf8", stdio: "pipe", cwd }).trim();
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

function setOrInsertFrontmatterField(text, key, valueLiteral) {
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const body = fmMatch[2];
    const keyRe = new RegExp(`^${key}\\s*:.*$`, "m");
    const newFm = keyRe.test(fm)
      ? fm.replace(keyRe, `${key}: ${valueLiteral}`)
      : `${fm.trimEnd()}\n${key}: ${valueLiteral}\n`;
    return `---\n${newFm}---\n${body}`;
  }
  return `---\n${key}: ${valueLiteral}\n---\n${text}`;
}

function applyRepoSidebar(text, sourcePath = "") {
  const repoName = getRepoNameFromSourcePath(sourcePath);
  if (!repoName) return text;
  return setOrInsertFrontmatterField(text, "displayed_sidebar", JSON.stringify(toSidebarId(repoName)));
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

function generateWeeklyHighlightsData() {
  ensureDir(DATA_ROOT);
  const entries = Array.from(SUBMODULE_META.values())
    .filter((m) => m.path.startsWith("docs_external/"))
    .sort((a, b) => a.path.localeCompare(b.path));

  function findFirstDocFile(dir) {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];
    const dirs = [];
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (e.isDirectory()) dirs.push(e.name);
      else files.push(e.name);
    }
    files.sort();
    dirs.sort();

    for (const f of files) {
      const ext = path.extname(f).toLowerCase();
      if (ext === ".md" || ext === ".mdx") return path.join(dir, f);
    }
    for (const d of dirs) {
      const nested = findFirstDocFile(path.join(dir, d));
      if (nested) return nested;
    }
    return null;
  }

  function getTutorialRoute(repoName) {
    const repoDir = path.join(OUT_ROOT, repoName);
    if (!fs.existsSync(repoDir)) return null;

    const preferred = ["README.md", "README.mdx", "index.md", "index.mdx"];
    for (const p of preferred) {
      if (fs.existsSync(path.join(repoDir, p))) return `/${repoName}/`;
    }

    const firstDoc = findFirstDocFile(repoDir);
    if (!firstDoc) return null;

    const rel = path.relative(OUT_ROOT, firstDoc).replace(/\\/g, "/");
    const noExt = rel.replace(/\.(md|mdx)$/i, "");
    const base = path.basename(noExt).toLowerCase();
    const repoBase = repoName.toLowerCase();
    if (base === "readme" || base === "index") {
      return `/${path.dirname(noExt)}/`.replace(/\/{2,}/g, "/");
    }
    if (base === repoBase) {
      return `/${repoName}/`;
    }
    return `/${noExt}`.replace(/\/{2,}/g, "/");
  }

  function loadWeeklyState() {
    if (!fs.existsSync(WEEKLY_STATE_PATH)) return { repos: {} };
    try {
      const raw = fs.readFileSync(WEEKLY_STATE_PATH, "utf8");
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : { repos: {} };
    } catch {
      return { repos: {} };
    }
  }

  function getLatestCommitMeta(repoName) {
    const repoDir = path.join(SRC, repoName);
    if (!fs.existsSync(repoDir)) {
      return { hash: "", shortHash: "", committedAt: "", subject: "" };
    }

    try {
      const hash = sh("git log -1 --format=%H", repoDir);
      const committedAt = sh("git log -1 --format=%cI", repoDir);
      const subject = sh("git log -1 --format=%s", repoDir);
      return {
        hash,
        shortHash: hash ? hash.slice(0, 7) : "",
        committedAt,
        subject,
      };
    } catch {
      return { hash: "", shortHash: "", committedAt: "", subject: "" };
    }
  }

  const nowIso = new Date().toISOString();
  const previousState = loadWeeklyState();
  const nextState = { repos: {} };
  const repos = [];

  for (const meta of entries) {
    const repoName = meta.path.replace(/^docs_external\//, "");
    const repoUrl = normalizeRepoUrl(meta.url);
    const branch = meta.branch || "main";
    const tutorialLink = getTutorialRoute(repoName);
    const commit = getLatestCommitMeta(repoName);
    const prev = previousState?.repos?.[repoName];
    const isNewlyAdded = !prev;
    const isUpdated = Boolean(prev && prev.lastSeenCommit && prev.lastSeenCommit !== commit.hash);
    const firstSeenAt = prev?.firstSeenAt || nowIso;

    nextState.repos[repoName] = {
      firstSeenAt,
      lastSeenCommit: commit.hash,
      lastSeenAt: nowIso,
    };

    repos.push({
      id: repoName,
      name: repoName,
      displayName: toTitleFromFolder(repoName),
      repoUrl,
      branch,
      tutorialLink,
      hasDocs: Boolean(tutorialLink),
      latestCommitHash: commit.hash,
      latestCommitShort: commit.shortHash,
      latestCommitAt: commit.committedAt,
      latestCommitSubject: commit.subject,
      isNewlyAdded,
      isUpdated,
      firstSeenAt,
    });
  }

  repos.sort((a, b) => {
    if (a.isNewlyAdded !== b.isNewlyAdded) return a.isNewlyAdded ? -1 : 1;
    if (a.isUpdated !== b.isUpdated) return a.isUpdated ? -1 : 1;
    const ad = Date.parse(a.latestCommitAt || 0);
    const bd = Date.parse(b.latestCommitAt || 0);
    return bd - ad;
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    summary: {
      total: repos.length,
      newlyAdded: repos.filter((r) => r.isNewlyAdded).length,
      updated: repos.filter((r) => r.isUpdated).length,
    },
    repos,
  };

  fs.writeFileSync(WEEKLY_HIGHLIGHTS_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(WEEKLY_STATE_PATH, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
}

function repoHasDocs(repoName) {
  const repoDir = path.join(OUT_ROOT, repoName);
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

function refreshCatalogDocAvailability() {
  if (!fs.existsSync(REPO_CATALOG_PATH)) return;

  try {
    let manualTopicMap = {};
    let manualRepoMap = {};
    let defaultBranch = "main";
    if (fs.existsSync(SUBMODULES_DOCS_PATH)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(SUBMODULES_DOCS_PATH, "utf8"));
        defaultBranch = String(cfg?.defaultBranch || "main").trim() || "main";
        const manualRepos = Array.isArray(cfg?.manualRepos) ? cfg.manualRepos : [];
        for (const r of manualRepos) {
          const name = String(r?.name || "").trim();
          if (!name) continue;
          manualRepoMap[name] = r;
          const topics = Array.from(
            new Set(
              [
                ...(Array.isArray(r?.topics) ? r.topics : []),
                ...(r?.topic ? [r.topic] : []),
              ]
                .map((t) => String(t).trim().toLowerCase())
                .filter(Boolean)
            )
          );
          if (topics.length > 0) {
            manualTopicMap[name] = topics;
          }
        }
      } catch (err) {
        console.warn(`! Could not parse manual topic overrides: ${err?.message || err}`);
      }
    }

    const raw = fs.readFileSync(REPO_CATALOG_PATH, "utf8");
    const payload = JSON.parse(raw);
    if (!Array.isArray(payload?.repos)) return;

    payload.repos = payload.repos.map((repo) => {
      const name = String(repo?.name || "").trim();
      if (!name) return repo;
      const configuredTopics = manualTopicMap[name] || [];
      return {
        ...repo,
        topics: configuredTopics.length > 0 ? configuredTopics : Array.isArray(repo?.topics) ? repo.topics : [],
        hasDocs: repoHasDocs(name),
      };
    });

    const existingNames = new Set(
      payload.repos
        .map((r) => String(r?.name || "").trim())
        .filter(Boolean)
    );
    for (const [name, manual] of Object.entries(manualRepoMap)) {
      if (existingNames.has(name)) continue;
      const normalizedUrl = normalizeRepoUrl(String(manual?.url || ""));
      const parsed = parseGitHubOwnerRepo(normalizedUrl);
      const route = repoHasDocs(name) ? `/${name}/` : null;
      const submodulePath = `docs_external/${name}`;
      const submoduleMeta = SUBMODULE_META.get(submodulePath);
      payload.repos.push({
        id: name,
        name,
        owner: parsed.owner,
        fullName: parsed.owner && parsed.repo ? `${parsed.owner}/${parsed.repo}` : name,
        url: normalizedUrl,
        branch: String(manual?.branch || submoduleMeta?.branch || defaultBranch || "main"),
        source: "manual",
        topics: manualTopicMap[name] || [],
        route,
        hasDocs: Boolean(route),
      });
    }

    payload.repos.sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
    payload.generatedAt = new Date().toISOString();

    fs.writeFileSync(REPO_CATALOG_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch (err) {
    console.warn(`! Could not refresh catalog availability: ${err?.message || err}`);
  }
}

function addFrontmatterTitle(text) {
  // Only operate on files that begin with real frontmatter.
  // Do not treat in-body markdown separators (---) as frontmatter.
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return text;

  const fm = m[1];
  const body = m[2];

  // Require at least one frontmatter-like key to reduce false positives.
  if (!/^[A-Za-z0-9_-]+\s*:/m.test(fm)) return text;

  // If title already exists, do nothing
  if (/^title\s*:/m.test(fm)) return text;

  // Find first H1
  const h1m = body.match(/^\s*#\s+(.+)\s*$/m);
  if (!h1m) return text;

  let title = h1m[1].trim();

  // If H1 is a markdown link, keep only the text: [Text](url) -> Text
  const link = title.match(/^\[([^\]]+)\]\([^)]+\)$/);
  if (link) title = link[1].trim();

  // Insert title into frontmatter (quoted for YAML safety)
  const newFm = `${fm.trimEnd()}\ntitle: ${JSON.stringify(title)}\n`;
  return `---\n${newFm}---\n${body}`;
}

function toTitleFromFolder(folderName) {
  return folderName
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bHpc\b/g, "HPC")
    .replace(/\bSdsc\b/g, "SDSC")
    .replace(/\bCiml\b/g, "CIML");
}

function addReadmeFolderTitle(text, sourcePath = "") {
  const base = path.basename(sourcePath || "").toLowerCase();
  if (base !== "readme.md" && base !== "readme.mdx") return text;

  const folder = path.basename(path.dirname(sourcePath || ""));
  const folderTitle = toTitleFromFolder(folder || "README");
  if (!folderTitle) return text;

  // If file already has frontmatter, add title only when missing.
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const body = fmMatch[2];
    if (/^title\s*:/m.test(fm)) return text;
    return `---\n${fm.trimEnd()}\ntitle: ${JSON.stringify(folderTitle)}\n---\n${body}`;
  }

  // No frontmatter: prepend one with folder-based title.
  return `---\ntitle: ${JSON.stringify(folderTitle)}\n---\n${text}`;
}

const HTML_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

function getAttr(attrs, name) {
  const re = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const m = attrs.match(re);
  if (!m) return "";
  return (m[1] ?? m[2] ?? "").trim();
}

function stripTags(text) {
  return text.replace(/<\/?[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function toBlockquote(text) {
  return text
    .trim()
    .split("\n")
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");
}

function isRemoteUrl(src) {
  return /^(https?:)?\/\//i.test(src) || src.startsWith("data:");
}

function resolveImageSrc(src, fileDir) {
  if (!src || isRemoteUrl(src) || src.startsWith("/")) return src;

  const normalized = src.replace(/\\/g, "/");
  const candidates = [
    normalized,
    normalized.startsWith("./") ? normalized.slice(2) : `./${normalized}`,
    normalized.startsWith("./") ? normalized : `../${normalized}`,
    `../docs/${normalized}`,
    `../expanse-101/docs/${normalized}`,
    `../../docs/${normalized}`,
    `../../expanse-101/docs/${normalized}`,
  ];

  for (const rel of candidates) {
    const abs = path.resolve(fileDir, rel);
    if (fs.existsSync(abs)) {
      return rel.replace(/\\/g, "/");
    }
  }

  return normalized;
}

function hasResolvableLocalImage(src, fileDir) {
  if (!src) return false;
  if (isRemoteUrl(src) || src.startsWith("/")) return true;
  return fs.existsSync(path.resolve(fileDir, src));
}

function fixFileSpecificLinks(text, sourcePath) {
  const src = (sourcePath || "").replace(/\\/g, "/");
  const repoMeta = getRepoMetaForSourcePath(sourcePath);

  function toRepoBlobUrl(relPathFromRepoRoot) {
    if (!repoMeta?.repoUrl) return "";
    const branch = repoMeta.branch || "main";
    const rel = String(relPathFromRepoRoot || "").replace(/\\/g, "/").replace(/^\/+/, "");
    return `${repoMeta.repoUrl}/blob/${branch}/${rel}`;
  }

  function toRepoTreeUrl(relPathFromRepoRoot) {
    if (!repoMeta?.repoUrl) return "";
    const branch = repoMeta.branch || "main";
    const rel = String(relPathFromRepoRoot || "").replace(/\\/g, "/").replace(/^\/+/, "");
    return `${repoMeta.repoUrl}/tree/${branch}/${rel}`;
  }

  function rewriteToSiblingDocs(input, slugs) {
    let out = input;
    for (const slug of slugs) {
      const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(`\\]\\(#${escaped}\\)`, "gi"), `](./${slug})`);
      out = out.replace(new RegExp(`\\]\\(${escaped}\\)`, "gi"), `](./${slug})`);
    }
    return out;
  }

  if (src.endsWith("/basic_skills/basic_linux_skills_expanse/basic_linux_skills_expanse.md")) {
    text = rewriteToSiblingDocs(text, [
      "basic-environment",
      "directories-navigation",
      "copying-directories",
      "manipulating-files",
      "permissions",
      "wildcards-utilities",
    ]);
  }

  if (src.endsWith("/basic_skills/interactive_computing/interactive_computing.md")) {
    text = rewriteToSiblingDocs(text, [
      "interactive-nodes",
      "interactive-node-command-line",
      "interactive-gpu-command-line",
    ]);
  }

  if (src.endsWith("/basic_skills/using_github/using_github.md")) {
    text = rewriteToSiblingDocs(text, [
      "create-github-account",
      "install-git",
      "using-git-at-sdsc",
    ]);
  }

  if (src.endsWith("/basic_skills/basic_linux_skills_expanse/directories-navigation.md")) {
    text = text.replace(/\]\(#permissions\)/gi, "](./permissions)");
  }

  if (/\/(1_)?dask_tutorial\/README\.md$/i.test(src)) {
    const repoRoot = path.join(SRC, repoMeta?.repoName || "");
    const daskDir = path.dirname(sourcePath || "");
    const relDir = path.relative(repoRoot, daskDir).replace(/\\/g, "/");
    const overviewUrl = toRepoBlobUrl(`${relDir}/00_overview.ipynb`);
    const mlUrl = toRepoBlobUrl(`${relDir}/08_machine_learning.ipynb`);
    if (overviewUrl) {
      text = text.replace(/\]\(00_overview\.ipynb\)/gi, `](${overviewUrl})`);
    }
    if (mlUrl) {
      text = text.replace(/\]\(08_machine_learning\.ipynb\)/gi, `](${mlUrl})`);
    }
  }

  if (/\/(2\.5_interactive_computing)\/README\.md$/i.test(src)) {
    const repoRoot = path.join(SRC, repoMeta?.repoName || "");
    const relDir = path.relative(repoRoot, path.dirname(sourcePath || "")).replace(/\\/g, "/");
    const summaryUrl = toRepoTreeUrl(`${relDir}/summary`);
    const docsUrl = toRepoTreeUrl(`${relDir}/docs`);
    if (summaryUrl) {
      text = text.replace(/\]\(summary\)/gi, `](${summaryUrl})`);
    }
    if (docsUrl) {
      text = text.replace(/\]\(docs\)/gi, `](${docsUrl})`);
    }
  }

  if (/\/(?:5\.2a_gpu_computing_and_programming|5\.3a_gpu_computing_programming|5\.3_gpu_computing_and_programming)\/README\.md$/i.test(src)) {
    text = text.replace(/\]\(cuda-samples\)/gi, "](https://github.com/NVIDIA/cuda-samples)");
  }

  if (src.endsWith("/sdsc-summer-institute-2022/5.2a_gpu_computing_and_programming/nvidia-cuda-samples/README.md")) {
    text = text
      .replace(/\]\(#windows-1\)/gi, "](#windows)")
      .replace(/\]\(\.\/Samples\/0_Introduction\/README\.md\)/gi, "](https://github.com/NVIDIA/cuda-samples/tree/master/Samples/0_Introduction)")
      .replace(/\]\(\.\/Samples\/2_Concepts_and_Techniques\/README\.md\)/gi, "](https://github.com/NVIDIA/cuda-samples/tree/master/Samples/2_Concepts_and_Techniques)")
      .replace(/\]\(\.\/Samples\/3_CUDA_Features\/README\.md\)/gi, "](https://github.com/NVIDIA/cuda-samples/tree/master/Samples/3_CUDA_Features)")
      .replace(/\]\(\.\/Samples\/4_CUDA_Libraries\/README\.md\)/gi, "](https://github.com/NVIDIA/cuda-samples/tree/master/Samples/4_CUDA_Libraries)")
      .replace(/\]\(\.\/Samples\/5_Domain_Specific\/README\.md\)/gi, "](https://github.com/NVIDIA/cuda-samples/tree/master/Samples/5_Domain_Specific)")
      .replace(/\]\(\.\/Samples\/6_Performance\/README\.md\)/gi, "](https://github.com/NVIDIA/cuda-samples/tree/master/Samples/6_Performance)");
  }

  if (src.endsWith("/sdsc-summer-institute-2022/5.2a_gpu_computing_and_programming/nvidia-cuda-samples/CHANGELOG.md")) {
    text = text.replace(/\]\(\.\/README\.md#windows-1\)/gi, "](./README.md#windows)");
  }

  if (src.endsWith("/sdsc-summer-institute-2022/5.2a_gpu_computing_and_programming/nvidia-cuda-samples/Samples/1_Utilities/README.md")) {
    text = text.replace(/\]\(\.\/deviceQueryDrv\)/gi, "](https://github.com/NVIDIA/cuda-samples/tree/master/Samples/1_Utilities/deviceQueryDrv)");
  }

  if (src.endsWith("/sdsc-summer-institute-2023/3.2_data_management/tutorials/TRANSFER.md")) {
    text = text
      .replace(/\]\(expanse-storage-external-networks\.png\)/gi, "](../../../sdsc-summer-institute-2022/2.5_data_management/expanse-storage-external-networks.png)")
      .replace(/\]\(xsede_access_point_map\.jpg\)/gi, "](../../../sdsc-summer-institute-2022/2.5_data_management/xsede_access_point_map.jpg)")
      .replace(/\]\(globus-homepage\.png\)/gi, "](../../../sdsc-summer-institute-2022/2.5_data_management/globus-homepage.png)")
      .replace(/\]\(globus-connect-personal\.png\)/gi, "](../../../sdsc-summer-institute-2022/2.5_data_management/globus-connect-personal.png)")
      .replace(/\]\(globus-web-app-climate-seg-data-transfer-complete\.png\)/gi, "](../../../sdsc-summer-institute-2022/2.5_data_management/globus-web-app-climate-seg-data-transfer-complete.png)");
  }

  if (src.endsWith("/sdsc-summer-institute-2024/3.5_high_throughput_computing/DHTC.md")) {
    text = text.replace(
      /\]\(osg_logo\.png\)/gi,
      "](../../sdsc-summer-institute-2023/3.5_high_throughput_computing/osg_logo.png)"
    );
  }

  if (src.endsWith("/expanse-101/expanse-101/compiling-linking.md")) {
    text = text.replace(/\]\(#run-jobs\)/gi, "](./running-jobs)");
  }

  if (src.endsWith("/expanse-101/expanse-101/running-jobs.md")) {
    text = text
      .replace(/^#### Slurm Partitions\s*$/m, "#### Slurm Partitions {#run-jobs-slurm-partition}")
      .replace(/^#### Common Slurm Commands\s*$/m, "#### Common Slurm Commands {#run-jobs-slurm-commands}")
      .replace(/^#### Slurm Job\s+State Codes\s*$/m, "#### Slurm Job State Codes {#run-jobs-slurm-status}");
  }

  if (src.endsWith("/expanse-101/expanse-101/cpu-jobs.md")) {
    text = text
      .replace(/^#### Hello World \(MPI\): Source Code\s*$/m, "#### Hello World (MPI): Source Code {#hello-world-mpi-source}")
      .replace(/^#### Hello World \(MPI\): Compiling\s*$/m, "#### Hello World (MPI): Compiling {#hello-world-mpi-compile}")
      .replace(/^#### Hello World \(MPI\): Batch Script Submission\s*$/m, "#### Hello World (MPI): Batch Script Submission {#hello-world-mpi-batch-submit}")
      .replace(/^#### Hello World \(MPI\): Batch Script Output\s*$/m, "#### Hello World (MPI): Batch Script Output {#hello-world-mpi-batch-output}")
      .replace(/^#### Hello World \(MPI\): Interactive Jobs\s*$/m, "#### Hello World (MPI): Interactive Jobs {#hello-world-mpi-interactive}")
      .replace(/^#### Hello World \(OpenMP\): Source Code\s*$/m, "#### Hello World (OpenMP): Source Code {#hello-world-omp-source}")
      .replace(/^#### Hello World \(OpenMP\): Compiling\s*$/m, "#### Hello World (OpenMP): Compiling {#hello-world-omp-compile}")
      .replace(/^#### Hello World \(OpenMP\): Batch Script Submission\s*$/m, "#### Hello World (OpenMP): Batch Script Submission {#hello-world-omp-batch-submit}")
      .replace(/^#### Hello World \(OpenMP\): Batch Script Output\s*$/m, "#### Hello World (OpenMP): Batch Script Output {#hello-world-omp-batch-output}")
      .replace(/^#### Hello World Hybrid \(MPI \+ OpenMP\): Source Code\s*$/m, "#### Hello World Hybrid (MPI + OpenMP): Source Code {#hybrid-mpi-omp-source}")
      .replace(/^#### Hello World Hybrid \(MPI \+ OpenMP\): Compiling\s*$/m, "#### Hello World Hybrid (MPI + OpenMP): Compiling {#hybrid-mpi-omp-compile}")
      .replace(/^#### Hello World Hybrid \(MPI \+ OpenMP\): Batch Script Submission\s*$/m, "#### Hello World Hybrid (MPI + OpenMP): Batch Script Submission {#hybrid-mpi-omp-batch-submit}")
      .replace(/^#### Hello World Hybrid \(MPI \+ OpenMP\): Batch Script Output\s*$/m, "#### Hello World Hybrid (MPI + OpenMP): Batch Script Output {#hybrid-mpi-omp-batch-output}");
  }

  if (src.endsWith("/expanse-101/expanse-101/gpu-jobs.md")) {
    text = text
      .replace(/^#### Hello World \(GPU-CUDA\): Source Code\s*$/m, "#### Hello World (GPU-CUDA): Source Code {#hello-world-cuda-source}")
      .replace(/^#### Hello World \(GPU-CUDA\): Compiling\s*$/m, "#### Hello World (GPU-CUDA): Compiling {#hello-world-cuda-compile}")
      .replace(/^#### Hello World \(GPU-CUDA\): Execute\s*$/m, "#### Hello World (GPU-CUDA): Execute {#hello-world-execute}")
      .replace(/^#### Hello World \(GPU-CUDA\): Batch Script Submission\s*$/m, "#### Hello World (GPU-CUDA): Batch Script Submission {#hello-world-cuda-batch-submit}")
      .replace(/^#### Hello World \(GPU-CUDA\): Batch Script Output\s*$/m, "#### Hello World (GPU-CUDA): Batch Script Output {#hello-world-cuda-batch-output}")
      .replace(/^#### Vector Addition \(GPU-CUDA\): Source Code\s*$/m, "#### Vector Addition (GPU-CUDA): Source Code {#vec-add-cuda-source}")
      .replace(/^#### Vector Addition \(GPU-CUDA\): Compiling & Running\s*$/m, "#### Vector Addition (GPU-CUDA): Compiling & Running {#vec-add-cuda-compile}")
      .replace(/^#### Vector Addition \(GPU-CUDA\): Batch Script Submission\s*$/m, "#### Vector Addition (GPU-CUDA): Batch Script Submission {#vec-add-cuda-batch-submit}")
      .replace(/^#### Vector Addition \(GPU-CUDA\): Batch Script Output\s*$/m, "#### Vector Addition (GPU-CUDA): Batch Script Output {#vec-add-cuda-batch-output}")
      .replace(/^#### Laplace2D \(GPU\/OpenACC\): Source Code\s*$/m, "#### Laplace2D (GPU/OpenACC): Source Code {#laplace2d-gpu-source}")
      .replace(/^#### Laplace2D \(GPU\/OpenACC\): Compiling\s*$/m, "#### Laplace2D (GPU/OpenACC): Compiling {#laplace2d-gpu-compile}")
      .replace(/^#### Laplace2D \(GPU\/OpenACC\): Batch Script Submission\s*$/m, "#### Laplace2D (GPU/OpenACC): Batch Script Submission {#laplace2d-gpu-batch-submit}")
      .replace(/^#### Laplace2D \(GPU\/OpenACC\): Batch Script Output\s*$/m, "#### Laplace2D (GPU/OpenACC): Batch Script Output {#laplace2d-gpu-batch-output}");
  }

  if (/\/hpc-security\/connecting-to-hpc-systems\/connect-to-(?:comet|expanse)\.md$/i.test(src)) {
    text = text.replace(/\]\(#term-windows-10\)/gi, "](#term-windows10)");
  }

  return text;
}

function patchMdx(text, sourcePath = "") {
  const fileDir = sourcePath ? path.dirname(sourcePath) : process.cwd();

  // For README files, prefer folder name as page title.
  text = addReadmeFolderTitle(text, sourcePath);

  // add title first (uses original H1 before any later normalization)
  text = addFrontmatterTitle(text);

  // Force each external repo page to use that repo's sidebar only.
  text = applyRepoSidebar(text, sourcePath);

  let out = text
    // Normalize malformed GitHub URLs occasionally found in source docs.
    .replace(/https:\/\/github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+(?:\.git)?)/g, "https://github.com/$1/$2")

    // Convert URL autolinks in angle brackets to explicit markdown links for MDX safety.
    .replace(/<((?:https?|ftp):\/\/[^>\s]+)>/gi, "[$1]($1)")

    // Fix known broken filename in upstream docs.
    .replaceAll("geting-started-exp-port-authentication.png", "expanse-portal-authentication.png")

    // Empty markdown links []() are invalid/noisy for Docusaurus; keep label as plain text.
    .replace(/\[([^\]]+)\]\(\s*\)/g, "$1")

    // Anchor at end of a heading line:
    // "## Title <a name="id"></a>" -> "## Title {#id}"
    .replace(/^[ \t]*(#{1,6}[ \t]+.*?)\s*<a\s+name="([^"]+)"\s*>(?:\s*<\/a>)?[ \t]*$/gim, "$1 {#$2}")

    // Anchor at beginning of heading line:
    // "## <a name="id"></a>Title" -> "## Title {#id}"
    .replace(/^[ \t]*(#{1,6}[ \t]*)<a\s+name="([^"]+)"\s*>(?:\s*<\/a>)?[ \t]*(.*?)[ \t]*$/gim, "$1$3 {#$2}")

    // Bold heading line anchors: "**Title** <a name='id'></a>" -> "### Title {#id}"
    .replace(/^[ \t]*\*\*([^*]+)\*\*[ \t]*<a\s+name="([^"]+)"\s*>(?:\s*<\/a>)?[ \t]*$/gim, "### $1 {#$2}")
    // Bold heading with trailing descriptor and anchor:
    // "**Windows** (pre-Win10) <a name='term-windows-older'></a>"
    .replace(/^[ \t]*\*\*([^*]+)\*\*[ \t]*(\([^)]+\))[ \t]*<a\s+name="([^"]+)"\s*>(?:\s*<\/a>)?[ \t]*$/gim, "### $1 $2 {#$3}")

    // Legacy anchor-only line:
    // "<a name="top">Contents" -> "## Contents {#top}"
    .replace(/^<a\s+name="([^"]+)"\s*>(?:\s*<\/a>)?\s*([^\n]+)$/gim, "## $2 {#$1}")

    // Convert HTML links to Markdown links (works for both closed and broken <a href>)
    // <a href="URL">Text</a>  OR  <a href="URL">Text  ->  [Text](URL)
    .replace(/<a\s+href="([^"]+)"[^>]*>\s*([\s\S]*?)(?:<\/a>|(?=\n|$))/gi, "[$2]($1)")
    // Fix known bare same-page slug links in source docs.
    .replace(/\]\(module-commands\)/gi, "](#module-commands)")

    // Remove any remaining <a ...> or </a>
    .replace(/<\/?a\b[^>]*>/gi, "")

    // Headings: <h1>..</h1> -> # ..
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, content) => {
      const hashes = "#".repeat(Number(level));
      const clean = stripTags(content);
      return `\n${hashes} ${clean}\n`;
    })

    // Images: <img src="..." alt="..."> -> ![...](...)
    .replace(/<img\b([^>]*)\/?>/gi, (match, attrs) => {
      const originalSrc = getAttr(attrs, "src");
      const src = resolveImageSrc(originalSrc, fileDir);
      if (!hasResolvableLocalImage(src, fileDir)) return match;
      if (!src) return "";
      const alt = getAttr(attrs, "alt");
      const title = getAttr(attrs, "title");
      const titlePart = title ? ` "${title}"` : "";
      return `![${alt}](${src}${titlePart})`;
    })

    // Structural wrappers
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n")
    .replace(/<div\b[^>]*>([\s\S]*?)<\/div>/gi, "\n$1\n")
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, body) => `\n${toBlockquote(stripTags(body))}\n`)

    // Lists
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, body) => `\n- ${stripTags(body)}`)
    .replace(/<\/?(ul|ol)\b[^>]*>/gi, "")

    // Fenced code blocks
    .replace(/<pre\b[^>]*>\s*(?:<code\b[^>]*>)?([\s\S]*?)(?:<\/code>)?\s*<\/pre>/gi, (_, body) => `\n\`\`\`\n${body.trim()}\n\`\`\`\n`)

    // MDX-safe tags
    .replaceAll("<hr>", "---\n")
    .replaceAll("<hr/>", "<hr />")
    .replaceAll("<hr />", "---\n")
    .replaceAll("<br>", "<br />")
    .replaceAll("<br/>", "  \n")
    .replaceAll("<br />", "  \n")
    .replaceAll("</br>", "  \n")

    // Email autolinks: <consult@sdsc.edu> -> [consult@sdsc.edu](mailto:consult@sdsc.edu)
    .replace(/<([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>/gi, "[$1](mailto:$1)")

    // Convert "Note:" paragraphs to Docusaurus note admonitions
    .replace(/^Note:\s*(.+)$/gim, ":::note\n$1\n:::")

    // Remove inline style="..." (invalid in JSX)
    .replace(/\sstyle="[^"]*"/gi, "")

    // Convert <b>text</b> to **text**, remove stray tags
    .replace(/<b>(.*?)<\/b>/gi, "**$1**")
    .replace(/<\/?b>/gi, "")

    // Convert <em>text</em> to *text*, remove stray tags
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<\/?em>/gi, "")

    // Normalize headings (remove extra trailing hashes, keep optional {#id})
    .replace(/^(#{1,6})\s+(.*?)(?:#+\s*)?(\{#[^}]+\})?\s*$/gm, "$1 $2$3")
    // Remove any "Back to ..." nav chunks, even if malformed (missing ] or ) )
    // Example: "[ [Back to Top](#top)" or "[ [Back to X](#y) ]"
    .replace(/\[\s*\[\s*Back to[^\n]*$/gim, "")
    .replace(/\[\s*Back to[^\n]*$/gim, "")

    // Prevent MDX JSX parse failures on literal "<#" sequences in imported plain text.
    .replace(/<(?=#)/g, "&lt;")

    // Normalize malformed encoded/quoted anchors.
    .replace(/\(#([^)#\s]*?)%22\)/gi, "(#$1)")
    .replace(/\]\(#([^)\s"]+)"\)/gi, "](#$1)")
    .replace(/\(#([^)#\s]*?)"\)/gi, "(#$1)")

    // Convert placeholder syntax to inline code:
    // "<< module name >>" OR "<module name>" -> `module name`
    // Run this late so most HTML tags have already been converted first.
    .replace(/<<\s*([^<>]+?)\s*>>|<([a-z][^<>]*?)>/gi, (match, p1, p2) => {
      const candidate = (p1 || p2 || "").trim();
      if (!candidate) return match;

      // Always convert <<...>> placeholders.
      if (p1) return `\`${candidate}\``;

      // Skip anything that still looks like HTML.
      if (candidate.startsWith("/") || /[="'/]/.test(candidate)) return match;
      const tagName = candidate.split(/\s+/)[0].toLowerCase();
      if (HTML_TAGS.has(tagName)) return match;

      return `\`${candidate}\``;
    })
    ;

  // Promote self-closing div ids to heading ids when followed by a heading.
  // Example:
  // <div id='quickstart'/>
  // ## Quick Start
  // -> ## Quick Start {#quickstart}
  out = out.replace(
    /<div\s+id=['"]([^'"]+)['"]\s*\/>\s*(?:\r?\n\s*)+(#{1,6}\s+[^\n]+)/gi,
    (_, id, heading) => `${heading} {#${id}}`
  );

  // If any self-closing div id remains, keep it as explicit HTML anchor.
  out = out.replace(/<div\s+id=['"]([^'"]+)['"]\s*\/>/gi, '<a id="$1"></a>');

  out = fixFileSpecificLinks(out, sourcePath);
  out = injectSourceBanner(out, sourcePath);

  return out;
}

function generateRepoSidebars() {
  const repoNames = Array.from(SUBMODULE_META.values())
    .filter((m) => m.path.startsWith("docs_external/"))
    .map((m) => m.path.replace(/^docs_external\//, ""))
    .filter((name) => repoHasDocs(name))
    .sort((a, b) => a.localeCompare(b));

  const lines = [
    'import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";',
    "",
    "const sidebars: SidebarsConfig = {",
    '  tutorialSidebar: [{ type: "doc", id: "index" }],',
  ];

  for (const repoName of repoNames) {
    lines.push(
      `  ${toSidebarId(repoName)}: [{ type: "autogenerated", dirName: ${JSON.stringify(repoName)} }],`
    );
  }

  lines.push("};", "", "export default sidebars;", "");
  fs.writeFileSync(SIDEBARS_PATH, lines.join("\n"), "utf8");
}

// Recursively copy + patch *.md/*.mdx only; other files copied as-is
function walkAndCopy(srcDir, outDir) {
  ensureDir(outDir);

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const outPath = path.join(outDir, entry.name);
    let stat = null;
    try {
      stat = fs.statSync(srcPath);
    } catch {
      // Broken symlink or vanished path in source repo; skip safely.
      console.warn(`Skipping unreadable path: ${srcPath}`);
      continue;
    }

    if (stat.isDirectory()) {
      walkAndCopy(srcPath, outPath);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (ext === ".md" || ext === ".mdx") {
      if (isQuarantinedSourceFile(srcPath)) {
        console.warn(`Quarantined source file: ${srcPath}`);
        writeQuarantinePlaceholder(outPath, srcPath);
        continue;
      }
      const raw = fs.readFileSync(srcPath, "utf8");
      fs.writeFileSync(outPath, patchMdx(raw, srcPath), "utf8");
    } else {
      try {
        fs.copyFileSync(srcPath, outPath);
      } catch (err) {
        if (err && err.code === "ENOENT") {
          console.warn(`Skipping missing file during copy: ${srcPath}`);
          continue;
        }
        throw err;
      }
    }
  }
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

// Update only the content coming from the submodule:
// For each top-level entry in SRC, remove the corresponding entry in OUT_ROOT, then copy/patch it.
for (const entry of fs.readdirSync(SRC, { withFileTypes: true })) {
  const srcPath = path.join(SRC, entry.name);
  const outPath = path.join(OUT_ROOT, entry.name);

  // Remove only what we're about to replace (NOT the whole OUT_ROOT)
  removePathSafe(outPath);

  if (entry.isDirectory()) {
    walkAndCopy(srcPath, outPath);
  } else {
    const ext = path.extname(entry.name).toLowerCase();
    if (ext === ".md" || ext === ".mdx") {
      if (isQuarantinedSourceFile(srcPath)) {
        console.warn(`Quarantined source file: ${srcPath}`);
        writeQuarantinePlaceholder(outPath, srcPath);
        continue;
      }
      const raw = fs.readFileSync(srcPath, "utf8");
      fs.writeFileSync(outPath, patchMdx(raw, srcPath), "utf8");
    } else {
      try {
        fs.copyFileSync(srcPath, outPath);
      } catch (err) {
        if (err && err.code === "ENOENT") {
          console.warn(`Skipping missing file during copy: ${srcPath}`);
          continue;
        }
        throw err;
      }
    }
  }
}

generateWeeklyHighlightsData();
refreshCatalogDocAvailability();
generateRepoSidebars();

console.log(`Patched external docs: ${SRC} -> ${OUT_ROOT}`);
