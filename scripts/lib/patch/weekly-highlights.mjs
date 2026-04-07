import fs from "fs";
import path from "path";

export function generateWeeklyHighlightsData(deps) {
  const {
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
  } = deps;

  ensureDir(DATA_ROOT);
  const entries = Array.from(SUBMODULE_META.values())
    .filter((m) => m.path.startsWith("docs_external/"))
    .sort((a, b) => a.path.localeCompare(b.path));

  function findFirstDocFile(dir) {
    if (!fs.existsSync(dir)) return null;
    const dirEntries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];
    const dirs = [];
    for (const e of dirEntries) {
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
