import React, { useMemo, useState } from "react";
import Link from "@docusaurus/Link";
import catalogData from "../data/repo-catalog.json";
import highlightsData from "../data/weekly-highlights.json";

type RepoCatalogEntry = {
  id: string;
  name: string;
  owner: string;
  fullName: string;
  url: string;
  branch: string;
  source: "org" | "manual";
  topics: string[];
  route: string;
  hasDocs?: boolean;
};

type RepoCatalogPayload = {
  generatedAt?: string;
  repos?: RepoCatalogEntry[];
};

type WeeklyRepoEntry = {
  name: string;
  latestCommitAt?: string;
};

type WeeklyHighlightsPayload = {
  repos?: WeeklyRepoEntry[];
};

const payload = catalogData as RepoCatalogPayload;
const repos: RepoCatalogEntry[] = Array.isArray(payload.repos) ? payload.repos : [];
const weeklyPayload = highlightsData as WeeklyHighlightsPayload;
const weeklyRepos: WeeklyRepoEntry[] = Array.isArray(weeklyPayload.repos) ? weeklyPayload.repos : [];

function toDisplayLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bHpc\b/g, "HPC")
    .replace(/\bSdsc\b/g, "SDSC")
    .replace(/\bCiml\b/g, "CIML");
}

function normalizeTopic(topic: string) {
  return (topic || "").trim().toLowerCase();
}

export default function CatalogContent() {
  const [selectedTopic, setSelectedTopic] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "alphabet">("date");
  const latestCommitAtByRepo = useMemo(
    () => new Map(weeklyRepos.map((r) => [r.name, r.latestCommitAt || ""])),
    []
  );

  const topicOptions = useMemo(() => {
    const set = new Set<string>();
    for (const repo of repos) {
      for (const topic of repo.topics || []) {
        const normalized = normalizeTopic(topic);
        if (normalized) set.add(normalized);
      }
    }
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, []);

  const filteredRepos = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = repos.filter((repo) => {
      const repoTopics = (repo.topics || []).map(normalizeTopic);
      const topicOk = selectedTopic === "all" || repoTopics.includes(selectedTopic);
      if (!topicOk) return false;
      if (!q) return true;

      const haystack = [repo.name, repo.fullName, repo.owner, repo.branch, ...(repo.topics || [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    result.sort((a, b) => {
      if (sortBy === "alphabet") {
        return a.name.localeCompare(b.name);
      }
      const ad = Date.parse(latestCommitAtByRepo.get(a.name) || "");
      const bd = Date.parse(latestCommitAtByRepo.get(b.name) || "");
      const safeAd = Number.isFinite(ad) ? ad : -1;
      const safeBd = Number.isFinite(bd) ? bd : -1;
      if (safeBd !== safeAd) return safeBd - safeAd;
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [search, selectedTopic, sortBy, latestCommitAtByRepo]);

  return (
    <>
      <div className="catalog-controls">
        <input
          className="catalog-search"
          type="search"
          placeholder="Search repos, owners, branches, topics..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="catalog-filter-row">
          <div className="catalog-topics">
            {topicOptions.map((topic) => (
              <button
                key={topic}
                type="button"
                className={`catalog-topic-chip ${selectedTopic === topic ? "is-active" : ""}`}
                onClick={() => setSelectedTopic(topic)}
              >
                {topic === "all" ? "All Topics" : toDisplayLabel(topic)}
              </button>
            ))}
          </div>
          <label className="catalog-sort">
            <span>Sort by</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "date" | "alphabet")}>
              <option value="date">Date (newest first)</option>
              <option value="alphabet">Alphabet (A-Z)</option>
            </select>
          </label>
        </div>
      </div>

      <p className="catalog-count">
        Showing <strong>{filteredRepos.length}</strong> of <strong>{repos.length}</strong> repositories
      </p>

      <div className="catalog-grid">
        {filteredRepos.map((repo) => (
          <article key={repo.id} className="catalog-card">
            <h2 className="catalog-card-title">{toDisplayLabel(repo.name)}</h2>
            <p className="catalog-card-meta">
              <code>{repo.fullName}</code>
            </p>
            <p className="catalog-card-meta">
              Source: <strong>{repo.source === "manual" ? "Manual" : "Org Topic Sync"}</strong> | Branch:{" "}
              <code>{repo.branch}</code>
            </p>

            <div className="catalog-card-tags">
              {(repo.topics || []).length > 0 ? (
                (repo.topics || []).map((topic) => (
                  <span key={`${repo.id}-${topic}`} className="catalog-tag">
                    {toDisplayLabel(topic)}
                  </span>
                ))
              ) : (
                <span className="catalog-tag muted">Uncategorized</span>
              )}
            </div>

            <div className="catalog-card-actions">
              {repo.hasDocs ? (
                <Link className="button button--primary button--sm" to={repo.route}>
                  Open Docs
                </Link>
              ) : (
                <span className="button button--primary button--sm button--disabled">Docs Pending</span>
              )}
              <a className="button button--secondary button--sm" href={repo.url} target="_blank" rel="noreferrer">
                GitHub
              </a>
            </div>
          </article>
        ))}
      </div>

      <p className="catalog-generated-at">
        Last catalog sync: <code>{payload.generatedAt || "Unknown"}</code>
      </p>
    </>
  );
}
