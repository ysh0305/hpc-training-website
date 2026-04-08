import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import highlightsData from "../data/weekly-highlights.json";

type WeeklyRepo = {
  id: string;
  name: string;
  displayName: string;
  repoUrl: string;
  branch: string;
  tutorialLink?: string | null;
  hasDocs?: boolean;
  latestCommitShort?: string;
  latestCommitAt?: string;
  latestCommitSubject?: string;
  isNewlyAdded?: boolean;
  isUpdated?: boolean;
};

type WeeklyHighlightsPayload = {
  generatedAt?: string;
  summary?: {
    total?: number;
    newlyAdded?: number;
    updated?: number;
  };
  repos?: WeeklyRepo[];
};

const payload = highlightsData as WeeklyHighlightsPayload;
const repos: WeeklyRepo[] = Array.isArray(payload.repos) ? payload.repos : [];

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

export default function WeeklyHighlightsPage() {
  const sortedRepos = [...repos].sort((a, b) => {
    const ad = Date.parse(a.latestCommitAt || "");
    const bd = Date.parse(b.latestCommitAt || "");
    const safeAd = Number.isFinite(ad) ? ad : -1;
    const safeBd = Number.isFinite(bd) ? bd : -1;
    if (safeBd !== safeAd) return safeBd - safeAd;
    return a.name.localeCompare(b.name);
  });

  const availableCount = sortedRepos.filter((r) => Boolean(r.hasDocs && r.tutorialLink)).length;
  const pendingCount = sortedRepos.length - availableCount;
  const newCount = payload.summary?.newlyAdded ?? sortedRepos.filter((r) => r.isNewlyAdded).length;
  const updatedCount = payload.summary?.updated ?? sortedRepos.filter((r) => r.isUpdated).length;
  const totalCount = payload.summary?.total ?? sortedRepos.length;

  function formatDate(value?: string) {
    if (!value) return "Unknown";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString();
  }

  return (
    <Layout title="Weekly Documentation Highlights" description="Latest documentation sync overview">
      <main className="container margin-vert--lg weekly-page">
        <section className="weekly-hero">
          <p className="weekly-eyebrow">Weekly Snapshot</p>
          <h1>Weekly Documentation Highlights</h1>
          <p className="weekly-subtitle">Based on latest repository commits (updated within the last 7 days).</p>
          <div className="weekly-stats">
            <div className="weekly-stat">
              <span className="weekly-stat-label">Total Repos</span>
              <strong>{totalCount}</strong>
            </div>
            <div className="weekly-stat">
              <span className="weekly-stat-label">Newly Added</span>
              <strong>{newCount}</strong>
            </div>
            <div className="weekly-stat">
              <span className="weekly-stat-label">Updated</span>
              <strong>{updatedCount}</strong>
            </div>
          </div>
          <p className="weekly-sync-line">Docs available: <strong>{availableCount}</strong> | Pending: <strong>{pendingCount}</strong></p>
        </section>

        <section className="weekly-timeline">
          {sortedRepos.map((repo) => (
            <article key={repo.id} className="weekly-item">
              <div className="weekly-item-dot" aria-hidden="true" />
              <h2 className="weekly-item-title">{repo.displayName || toDisplayLabel(repo.name)}</h2>
              <p className="weekly-item-meta">
                Source repo:{" "}
                <a href={repo.repoUrl} target="_blank" rel="noreferrer">
                  {repo.name}
                </a>
              </p>
              <p className="weekly-item-meta">
                Branch: <code>{repo.branch}</code>
              </p>
              <p className="weekly-item-meta">
                Latest commit: <code>{repo.latestCommitShort || "N/A"}</code> at <code>{formatDate(repo.latestCommitAt)}</code>
              </p>
              {repo.latestCommitSubject ? <p className="weekly-item-meta">Change: {repo.latestCommitSubject}</p> : null}
              <div className="weekly-item-tags">
                {repo.isNewlyAdded ? <span className="weekly-pill weekly-pill-new">NEW</span> : null}
                {repo.isUpdated ? <span className="weekly-pill weekly-pill-updated">UPDATED</span> : null}
                {!repo.isNewlyAdded && !repo.isUpdated ? <span className="weekly-pill weekly-pill-stable">STABLE</span> : null}
              </div>

              <div className="weekly-item-actions">
                {repo.hasDocs && repo.tutorialLink ? (
                  <Link className="button button--primary button--sm" to={repo.tutorialLink}>
                    Open Tutorial
                  </Link>
                ) : (
                  <span className="button button--primary button--sm button--disabled">Docs Pending</span>
                )}
                <a className="button button--secondary button--sm" href={repo.repoUrl} target="_blank" rel="noreferrer">
                  GitHub
                </a>
              </div>
            </article>
          ))}
        </section>

        <p className="weekly-generated-at">
          Data generated at: <code>{payload.generatedAt || "Unknown"}</code>
        </p>
      </main>
    </Layout>
  );
}
