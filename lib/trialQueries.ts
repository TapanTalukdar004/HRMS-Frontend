/**
 * Trial-repo queries (Phase 4 of the CodeGraph trial).
 *
 * Reads the GitHub-only trial pipeline: github_prs + pr_graph_impact (blast radius)
 * + pr_trial_score (proof x impact), all tagged by repo so the trial stays isolated
 * from the gateway. The module-level codebase graph is read from the static
 * public/trial/<repo>.graph.json exported by agent/graph_impact.py.
 */
import { q } from "./db";
import fs from "fs";
import path from "path";

export type TrialPR = {
  pr_number: number;
  title: string | null;
  author: string | null;
  additions: number | null;
  deletions: number | null;
  ci_status: string | null;
  review_approvals: number | null;
  merged_at: string | null;
  blast_band: string | null;
  reached_symbols: number | null;
  reached_files: number | null;
  touches_sensitive: boolean | null;
  proof: number | null;
  impact: number | null;
  score: number | null;
  risk_flag: boolean | null;
  changed_modules: string[];
  reached_modules: string[];
};

export type TrialContributor = {
  author: string;
  prs: number;
  total: number;
  avg: number;
  avgproof: number;
};

export type TrialGraph = {
  repo: string;
  nodes: { id: string; files: number; pkg: string; indeg: number }[];
  edges: { from: string; to: string; w: number }[];
  counts: { modules: number; edges: number; files: number };
};

export type TrialOverview = {
  prs: number;
  sensitive: number;
  bands: { local: number; moderate: number; wide: number };
};

export async function getTrialRepo(): Promise<string> {
  const rows = await q<{ full_name: string }>(
    "SELECT full_name FROM repo_registry WHERE status='trial' ORDER BY last_checked DESC LIMIT 1",
  );
  return rows[0]?.full_name ?? "FlowiseAI/Flowise";
}

export async function getTrialPRs(repo: string): Promise<TrialPR[]> {
  return q<TrialPR>(
    `SELECT p.pr_number, p.title, p.author_login AS author, p.additions, p.deletions,
            p.ci_status, p.review_approvals, p.merged_at,
            g.blast_band, g.reached_symbols, g.reached_files, g.touches_sensitive,
            s.proof::float8 AS proof, s.impact::float8 AS impact, s.score::float8 AS score,
            s.risk_flag,
            COALESCE(g.detail->'changed_modules', '[]'::jsonb) AS changed_modules,
            COALESCE(g.detail->'reached_modules', '[]'::jsonb) AS reached_modules
       FROM github_prs p
       LEFT JOIN pr_graph_impact g ON g.repo = p.repo AND g.pr_number = p.pr_number
       LEFT JOIN pr_trial_score  s ON s.repo = p.repo AND s.pr_number = p.pr_number
      WHERE p.repo = $1 AND p.merged_at IS NOT NULL
      ORDER BY s.score DESC NULLS LAST, p.pr_number DESC`,
    [repo],
  );
}

export async function getTrialContributors(repo: string): Promise<TrialContributor[]> {
  return q<TrialContributor>(
    `SELECT author_login AS author, count(*)::int AS prs,
            round(sum(score), 1)::float8 AS total,
            round(avg(score), 2)::float8 AS avg,
            round(avg(proof), 2)::float8 AS avgproof
       FROM pr_trial_score
      WHERE repo = $1 AND author_login IS NOT NULL
      GROUP BY author_login
      ORDER BY total DESC NULLS LAST`,
    [repo],
  );
}

export async function getTrialOverview(repo: string): Promise<TrialOverview> {
  const tot = await q<{ prs: number; sensitive: number }>(
    `SELECT count(*)::int AS prs,
            count(*) FILTER (WHERE touches_sensitive)::int AS sensitive
       FROM pr_graph_impact WHERE repo = $1`,
    [repo],
  );
  const bandRows = await q<{ blast_band: string; n: number }>(
    `SELECT blast_band, count(*)::int AS n FROM pr_trial_score WHERE repo = $1 GROUP BY blast_band`,
    [repo],
  );
  const bands = { local: 0, moderate: 0, wide: 0 };
  for (const b of bandRows) if (b.blast_band && b.blast_band in bands) (bands as Record<string, number>)[b.blast_band] = b.n;
  return { prs: tot[0]?.prs ?? 0, sensitive: tot[0]?.sensitive ?? 0, bands };
}

export function readTrialGraph(repo: string): TrialGraph | null {
  const file = repo.replace(/\//g, "__") + ".graph.json";
  const p = path.join(process.cwd(), "public", "trial", file);
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as TrialGraph;
  } catch {
    return null;
  }
}
