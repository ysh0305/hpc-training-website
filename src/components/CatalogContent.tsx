import React, { useEffect, useMemo, useState } from "react";
import Link from "@docusaurus/Link";
import catalogData from "../data/repo-catalog.json";
import highlightsData from "../data/weekly-highlights.json";
import eventsData from "../data/events.json";

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

type EventItem = {
  name?: string;
  title?: string;
  tags?: string[];
  vid_link?: string | null;
  start?: number;
  resources?: Record<string, string>;
};

type ResourceLink = {
  label: string;
  url: string;
};

type CatalogCard = {
  id: string;
  name: string;
  owner: string;
  fullName: string;
  url: string;
  branch: string;
  source: "org" | "manual" | "interactive";
  topics: string[];
  route: string;
  hasDocs?: boolean;
  actionLabel: string;
  sortDateMs: number;
  resourceLinks: ResourceLink[];
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
const eventsPayload = eventsData as Record<string, EventItem>;

function toDisplayLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bHpc\b/g, "HPC")
    .replace(/\bSdsc\b/g, "SDSC")
    .replace(/\bCiml\b/g, "CIML")
    .replace(/\bTscc\b/g, "TSCC");
}

function normalizeTopic(topic: string) {
  return (topic || "").trim().toLowerCase();
}

export default function CatalogContent() {
  const PAGE_SIZE = 24;
  const [selectedTopic, setSelectedTopic] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "alphabet">("date");
  const [page, setPage] = useState(1);
  const latestCommitAtByRepo = useMemo(
    () => new Map(weeklyRepos.map((r) => [r.name, r.latestCommitAt || ""])),
    []
  );
  const cards = useMemo<CatalogCard[]>(() => {
    const repoCards: CatalogCard[] = repos.map((repo) => {
      const commitAt = latestCommitAtByRepo.get(repo.name) || "";
      const commitDateMs = Date.parse(commitAt);
      return {
        ...repo,
        actionLabel: "Open Docs",
        sortDateMs: Number.isFinite(commitDateMs) ? commitDateMs : -1,
        resourceLinks: [],
      };
    });

    const interactiveCards: CatalogCard[] = Object.entries(eventsPayload || {}).map(([key, value]) => {
      const eventName = String(value?.name || key).trim();
      const eventTitle = String(value?.title || eventName || key).trim();
      const eventTags = Array.isArray(value?.tags) ? value.tags : [];
      const topics = Array.from(
        new Set(
          ["interactive video", ...eventTags]
            .map((topic) => normalizeTopic(String(topic || "")))
            .filter(Boolean)
        )
      );
      const resourceLinks: ResourceLink[] = Object.entries(value?.resources || {})
        .map(([label, resourceUrl]) => ({
          label: label.trim().toLowerCase() === "github" ? "GitHub" : label.trim(),
          url: String(resourceUrl || "").trim(),
        }))
        .filter((r) => Boolean(r.label && r.url));
      const startMs = Number(value?.start || 0) * 1000;
      return {
        id: `interactive-${key}`,
        name: eventName,
        owner: "SDSC Interactive",
        fullName: eventTitle,
        url: `https://education.sdsc.edu/training/interactive/?id=${encodeURIComponent(eventName)}`,
        branch: "-",
        source: "interactive",
        topics,
        route: "",
        hasDocs: true,
        actionLabel: "Open Video",
        sortDateMs: Number.isFinite(startMs) ? startMs : -1,
        resourceLinks,
      };
    });

    return [...repoCards, ...interactiveCards];
  }, [latestCommitAtByRepo]);

  const topicOptions = useMemo(() => {
    const set = new Set<string>();
    for (const card of cards) {
      for (const topic of card.topics || []) {
        const normalized = normalizeTopic(topic);
        if (normalized) set.add(normalized);
      }
    }
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [cards]);

  const filteredRepos = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = cards.filter((card) => {
      const cardTopics = (card.topics || []).map(normalizeTopic);
      const topicOk = selectedTopic === "all" || cardTopics.includes(selectedTopic);
      if (!topicOk) return false;
      if (!q) return true;

      const haystack = [card.name, card.fullName, card.owner, card.branch, ...(card.topics || [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    result.sort((a, b) => {
      if (sortBy === "alphabet") {
        return a.name.localeCompare(b.name);
      }
      if (b.sortDateMs !== a.sortDateMs) return b.sortDateMs - a.sortDateMs;
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [search, selectedTopic, sortBy, cards]);

  const totalPages = Math.max(1, Math.ceil(filteredRepos.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageStart = Math.max(1, clampedPage - 2);
  const pageEnd = Math.min(totalPages, clampedPage + 2);
  const visiblePages = Array.from({ length: pageEnd - pageStart + 1 }, (_, i) => pageStart + i);
  const pageStartItem = filteredRepos.length === 0 ? 0 : (clampedPage - 1) * PAGE_SIZE + 1;
  const pageEndItem = filteredRepos.length === 0 ? 0 : Math.min(filteredRepos.length, clampedPage * PAGE_SIZE);
  const pagedRepos = useMemo(() => {
    const start = (clampedPage - 1) * PAGE_SIZE;
    return filteredRepos.slice(start, start + PAGE_SIZE);
  }, [filteredRepos, clampedPage, PAGE_SIZE]);

  useEffect(() => {
    setPage(1);
  }, [search, selectedTopic, sortBy]);

  useEffect(() => {
    if (page !== clampedPage) {
      setPage(clampedPage);
    }
  }, [page, clampedPage]);

  function goToPage(nextPage: number) {
    setPage(nextPage);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

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
        Showing <strong>{pageStartItem}</strong>-<strong>{pageEndItem}</strong> of{" "}
        <strong>{filteredRepos.length}</strong> items
      </p>

      <div className="catalog-grid">
        {pagedRepos.map((repo) => (
          <article key={repo.id} className="catalog-card">
            <h2 className="catalog-card-title">
              {repo.source === "interactive" ? repo.fullName : toDisplayLabel(repo.name)}
            </h2>
            {repo.source === "interactive" ? null : (
              <p className="catalog-card-meta">
                <code>{repo.fullName}</code>
              </p>
            )}
            <p className="catalog-card-meta">
              Source:{" "}
              <strong>
                {repo.source === "manual"
                  ? "Manual"
                  : repo.source === "interactive"
                    ? "Interactive Video"
                    : "Org Topic Sync"}
              </strong>
              {repo.source === "interactive" ? null : (
                <>
                  {" "}
                  | Branch: <code>{repo.branch}</code>
                </>
              )}
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
              {repo.source === "interactive" ? (
                <>
                  <a className="button button--primary button--sm" href={repo.url} target="_blank" rel="noreferrer">
                    {repo.actionLabel}
                  </a>
                  {repo.resourceLinks.map((resource) => (
                    <a
                      key={`${repo.id}-${resource.label}-${resource.url}`}
                      className="button button--secondary button--sm"
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {resource.label}
                    </a>
                  ))}
                </>
              ) : repo.hasDocs ? (
                <Link className="button button--primary button--sm" to={repo.route}>
                  {repo.actionLabel}
                </Link>
              ) : (
                <span className="button button--primary button--sm button--disabled">Docs Pending</span>
              )}
              {repo.source === "interactive" ? null : (
                <a className="button button--secondary button--sm" href={repo.url} target="_blank" rel="noreferrer">
                  GitHub
                </a>
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="catalog-pagination">
        <button
          type="button"
          className="button button--secondary button--sm"
          onClick={() => goToPage(1)}
          disabled={clampedPage <= 1}
          aria-label="First page"
        >
          ⏮
        </button>
        <button
          type="button"
          className="button button--secondary button--sm"
          onClick={() => goToPage(Math.max(1, clampedPage - 1))}
          disabled={clampedPage <= 1}
          aria-label="Previous page"
        >
          <span aria-hidden="true">◀</span>
        </button>
        <div className="catalog-page-numbers">
          {visiblePages.map((pageNum) => (
            <button
              key={pageNum}
              type="button"
              className={`catalog-page-btn ${pageNum === clampedPage ? "is-active" : ""}`}
              onClick={() => goToPage(pageNum)}
              aria-label={`Page ${pageNum}`}
              aria-current={pageNum === clampedPage ? "page" : undefined}
            >
              {pageNum}
            </button>
          ))}
        </div>
        <span className="catalog-pagination-label">
          Page <strong>{clampedPage}</strong> of <strong>{totalPages}</strong>
        </span>
        <button
          type="button"
          className="button button--secondary button--sm"
          onClick={() => goToPage(Math.min(totalPages, clampedPage + 1))}
          disabled={clampedPage >= totalPages}
          aria-label="Next page"
        >
          <span aria-hidden="true">▶</span>
        </button>
        <button
          type="button"
          className="button button--secondary button--sm"
          onClick={() => goToPage(totalPages)}
          disabled={clampedPage >= totalPages}
          aria-label="Last page"
        >
          ⏭
        </button>
      </div>

      <p className="catalog-generated-at">
        Last catalog sync: <code>{payload.generatedAt || "Unknown"}</code>
      </p>
    </>
  );
}
