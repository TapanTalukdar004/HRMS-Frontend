/**
 * Reviews (the unified, professional format). Reads the structured `review` JSONB written by
 * agent/review_open_prs.py: a two-register review (narrative + ranked findings, each with a
 * concrete fix). Same shape for any repo (open PRs or a merged sample) → one consistent view.
 */
import { q } from "./db";

export type Finding = {
  type: string;        // bug | mismatch | impact | refactor | nitpick
  severity: string;    // critical | major | minor | nitpick
  confidence?: string; // confirmed | worth-a-look
  title: string;       // failure mode + consequence, one line
  why?: string;
  fix: string;         // standalone imperative instruction for the fixer
  // loop extras (present when reviewed by the multi-pass loop):
  evidence?: string;      // verbatim snippet quoted from the diff
  recurrence?: number;    // how many of the K samples raised it
  confidence_runs?: string; // e.g. "3/5"
  verify_why?: string;    // the verifier's confirmation note
  conf_tier?: string;     // 'high' (confident, drives verdict/score) | 'low' ('worth a look' only)
};

export type Review = {
  pr_number: number;
  title: string | null;
  author: string | null;
  state: string | null;
  code_quality: number | null;
  verdict: string | null;          // clean | needs-changes | blocked
  verdict_line: string;
  what_it_does: string;
  matches_title: boolean;
  matches_note: string;
  blast_prose: string;
  notes: string;
  findings: Finding[];
  strengths: string[];
  reached_symbols: number | null;
  reached_modules: string[];
  changed_modules: string[];
  touches_sensitive: boolean | null;
  // loop extras (present when reviewed by the multi-pass loop):
  loop_version?: string | null;
  confidence?: number | null;      // agreement across the K samples (0..1)
  samples_k?: number | null;       // how many independent reviews were run
  injection_attempt?: boolean;     // a prompt-injection was detected in the PR
  quality_outlier?: boolean;       // a lone off-distribution sample was ignored
};

export type ReviewOverview = {
  reviewed: number;
  need_changes: number;
  mismatch: number;
  reach_sensitive: number;
  findings_total: number;
};

type Row = {
  pr_number: number; title: string | null; author: string | null; state: string | null;
  code_quality: number | null; verdict: string | null;
  review: Partial<Review> | null;
  reached_symbols: number | null; reached_modules: string[] | null; touches_sensitive: boolean | null;
};

export async function getReviewRepos(): Promise<string[]> {
  const rows = await q<{ repo: string }>(
    "SELECT repo FROM pr_reviews WHERE review IS NOT NULL GROUP BY repo ORDER BY max(reviewed_at) DESC",
  );
  return rows.map((r) => r.repo);
}

export async function getReviews(repo: string): Promise<Review[]> {
  const rows = await q<Row>(
    `SELECT pr_number, title, author_login AS author, state,
            code_quality::float8 AS code_quality, verdict, review,
            reached_symbols, COALESCE(reached_modules,'[]'::jsonb) AS reached_modules, touches_sensitive
       FROM pr_reviews
      WHERE repo = $1 AND review IS NOT NULL
      ORDER BY (verdict = 'clean') ASC,
               CASE verdict WHEN 'blocked' THEN 0 WHEN 'needs-changes' THEN 1 ELSE 2 END ASC,
               code_quality ASC NULLS FIRST, pr_number DESC`,
    [repo],
  );
  return rows.map((r) => {
    const rv = r.review ?? {};
    return {
      pr_number: r.pr_number, title: r.title, author: r.author, state: r.state,
      code_quality: r.code_quality, verdict: r.verdict ?? rv.verdict ?? null,
      verdict_line: rv.verdict_line ?? "", what_it_does: rv.what_it_does ?? "",
      matches_title: rv.matches_title ?? true, matches_note: rv.matches_note ?? "",
      blast_prose: rv.blast_prose ?? "", notes: rv.notes ?? "",
      findings: (rv.findings as Finding[]) ?? [], strengths: rv.strengths ?? [],
      reached_symbols: r.reached_symbols, reached_modules: r.reached_modules ?? [],
      changed_modules: (rv.changed_modules as string[]) ?? [],
      touches_sensitive: r.touches_sensitive,
      loop_version: rv.loop_version ?? null,
      confidence: rv.confidence ?? null,
      samples_k: rv.samples_k ?? null,
      injection_attempt: rv.injection_attempt ?? false,
      quality_outlier: rv.quality_outlier ?? false,
    };
  });
}

export async function getReviewOverview(repo: string): Promise<ReviewOverview> {
  const r = await q<ReviewOverview>(
    `SELECT count(*)::int AS reviewed,
            count(*) FILTER (WHERE verdict IN ('needs-changes','blocked'))::int AS need_changes,
            count(*) FILTER (WHERE title_matches_work = false)::int AS mismatch,
            count(*) FILTER (WHERE touches_sensitive)::int AS reach_sensitive,
            COALESCE(sum(jsonb_array_length(COALESCE(review->'findings','[]'::jsonb))),0)::int AS findings_total
       FROM pr_reviews WHERE repo = $1 AND review IS NOT NULL`,
    [repo],
  );
  return r[0] ?? { reviewed: 0, need_changes: 0, mismatch: 0, reach_sensitive: 0, findings_total: 0 };
}
