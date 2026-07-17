/**
 * Repository Analysis — the ONE unified view. Lists the repos we have analysis for and
 * what each offers (merged-scored PRs and/or open-reviewed PRs), so a single page with a
 * repo selector + Open/Merged toggle can render any repo in a consistent design.
 * Per-repo data is fetched via the existing trialQueries (merged) and reviewQueries (open).
 */
import { q } from "./db";

export type RepoInfo = { repo: string; merged: number; open: number };

export async function getAnalysisRepos(): Promise<RepoInfo[]> {
  const rows = await q<{ repo: string; mode: string; n: number }>(
    `SELECT repo, 'merged' AS mode, count(*)::int AS n FROM pr_trial_score GROUP BY repo
     UNION ALL
     SELECT repo, 'open' AS mode, count(*)::int AS n FROM pr_reviews WHERE state = 'open' GROUP BY repo`,
  );
  const m = new Map<string, RepoInfo>();
  for (const r of rows) {
    const e = m.get(r.repo) ?? { repo: r.repo, merged: 0, open: 0 };
    if (r.mode === "merged") e.merged = r.n; else e.open = r.n;
    m.set(r.repo, e);
  }
  return [...m.values()].sort((a, b) => b.merged + b.open - (a.merged + a.open));
}
