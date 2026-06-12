/**
 * Agent Lab queries — claim-vs-proof trial over the practice repo.
 *
 * Reads ONLY the lab tables (github_prs, lab_linear_issues, issue_evidence,
 * agent_assessments, agent_runs).  Deliberately separate from the production
 * scoring queries in queries.ts — nothing here feeds real performance scores.
 *
 * Also exports the pure scoring helpers so the UI can spell out the whole
 * equation:  weight × status × bug × evidence × quality = score.
 */
import { q } from "./db";

export const LAB_REPO = "TapanTalukdar004/team-taskboard";

// ─── Row types (mirror the lab DDL) ─────────────────────────────────────────

export type LabIssue = {
  id: string;
  issue_key: string;
  title: string | null;
  description: string | null;
  label: string | null;          // 'Feature' | 'Bug' | ...
  status: string | null;         // Done / In Progress / Todo / Backlog / Canceled
  priority: string | null;       // urgent / high / medium / low / none
  estimate: number | null;
  assignee: string | null;
  relates_to: string[] | null;
  url: string | null;
  updated_at: string | null;
};

export type LabEvidence = {
  id: string;
  repo: string;
  issue_key: string;
  snapshot_date: string;         // DATE comes back as 'YYYY-MM-DD' (see db.ts)
  bucket: string;                // confirmed / unproven / untracked / in_flight / no_evidence
  linked_prs: number[] | null;
  merged: boolean | null;
  ci_status: string | null;
  review_approvals: number | null;
  net_loc: number | null;
  evidence_factor: number | null;
  reasons: string[] | null;
};

export type LabAssessment = {
  id: string;
  repo: string;
  issue_key: string;
  pr_number: number | null;
  head_sha: string | null;
  run_date: string;
  covers_requirement: number | null;   // 0..1 (or 0..100 — UI normalises)
  code_quality: number | null;         // 0..10
  confidence: number | null;
  truthfulness_flags: string[] | null;
  defects_found: string[] | null;
  narrative: string | null;
  model_version: string | null;
  prompt_version: string | null;
  human_verdict: string | null;
  created_at: string | null;
};

export type LabPr = {
  id: string;
  repo: string;
  pr_number: number;
  title: string | null;
  author_login: string | null;
  state: string | null;
  draft: boolean | null;
  base_branch: string | null;
  head_branch: string | null;
  head_sha: string | null;
  additions: number | null;
  deletions: number | null;
  changed_files: number | null;
  ci_status: string | null;
  review_approvals: number | null;
  self_merged: boolean | null;
  linked_issue_keys: string[] | null;
  created_at: string | null;
  merged_at: string | null;
  updated_at: string | null;
};

export type LabRun = {
  id: string;
  kind: string | null;
  started_at: string | null;
  finished_at: string | null;
  items: number | null;
  ok: boolean | null;
  notes: string | null;
};

export type LabData = {
  issues: LabIssue[];
  /** Latest issue_evidence snapshot per issue_key for the repo. */
  evidenceByIssue: Record<string, LabEvidence>;
  /** Latest agent_assessments row per issue_key for the repo. */
  assessmentByIssue: Record<string, LabAssessment>;
  prs: LabPr[];
  lastRun: LabRun | null;
};

// ─── Numeric coercion ───────────────────────────────────────────────────────
// pg returns REAL/INT as numbers in most setups, but NUMERIC-ish values and
// some pooler paths come back as strings.  Coerce defensively.

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

const numArr = (v: unknown): number[] | null =>
  Array.isArray(v) ? v.map((x) => Number(x)) : null;

// ─── Data fetch ─────────────────────────────────────────────────────────────

export async function getLabData(repo: string): Promise<LabData> {
  const [issueRows, evidenceRows, assessmentRows, prRows, runRows] =
    await Promise.all([
      q<LabIssue>(`
        SELECT id, issue_key, title, description, label, status, priority,
               estimate, assignee, relates_to, url, updated_at
        FROM lab_linear_issues
        ORDER BY issue_key
      `),
      q<LabEvidence>(`
        SELECT DISTINCT ON (issue_key)
               id, repo, issue_key, snapshot_date, bucket, linked_prs, merged,
               ci_status, review_approvals, net_loc, evidence_factor, reasons
        FROM issue_evidence
        WHERE repo = $1
        ORDER BY issue_key, snapshot_date DESC
      `, [repo]),
      q<LabAssessment>(`
        SELECT DISTINCT ON (issue_key)
               id, repo, issue_key, pr_number, head_sha, run_date,
               covers_requirement, code_quality, confidence,
               truthfulness_flags, defects_found, narrative,
               model_version, prompt_version, human_verdict, created_at
        FROM agent_assessments
        WHERE repo = $1
        ORDER BY issue_key, run_date DESC, created_at DESC
      `, [repo]),
      q<LabPr>(`
        SELECT id, repo, pr_number, title, author_login, state, draft,
               base_branch, head_branch, head_sha, additions, deletions,
               changed_files, ci_status, review_approvals, self_merged,
               linked_issue_keys, created_at, merged_at, updated_at
        FROM github_prs
        WHERE repo = $1
        ORDER BY pr_number
      `, [repo]),
      q<LabRun>(`
        SELECT id, kind, started_at, finished_at, items, ok, notes
        FROM agent_runs
        ORDER BY started_at DESC NULLS LAST
        LIMIT 1
      `),
    ]);

  const issues = issueRows.map((r) => ({ ...r, estimate: num(r.estimate) }));

  const evidenceByIssue: Record<string, LabEvidence> = {};
  for (const r of evidenceRows) {
    evidenceByIssue[r.issue_key] = {
      ...r,
      linked_prs: numArr(r.linked_prs),
      review_approvals: num(r.review_approvals),
      net_loc: num(r.net_loc),
      evidence_factor: num(r.evidence_factor),
    };
  }

  const assessmentByIssue: Record<string, LabAssessment> = {};
  for (const r of assessmentRows) {
    assessmentByIssue[r.issue_key] = {
      ...r,
      pr_number: num(r.pr_number),
      covers_requirement: num(r.covers_requirement),
      code_quality: num(r.code_quality),
      confidence: num(r.confidence),
    };
  }

  const prs = prRows.map((r) => ({
    ...r,
    pr_number: Number(r.pr_number),
    additions: num(r.additions),
    deletions: num(r.deletions),
    changed_files: num(r.changed_files),
    review_approvals: num(r.review_approvals),
  }));

  const lastRun = runRows.length > 0 ? { ...runRows[0], items: num(runRows[0].items) } : null;

  return { issues, evidenceByIssue, assessmentByIssue, prs, lastRun };
}

// ─── Scoring helpers (pure, deterministic) ──────────────────────────────────

/** Priority multiplier: urgent 2.0 / high 1.5 / medium 1.0 / low 0.7 / none 1.0. */
export function priorityMult(p: string | null | undefined): number {
  switch ((p ?? "none").trim().toLowerCase()) {
    case "urgent": return 2.0;
    case "high":   return 1.5;
    case "medium": return 1.0;
    case "low":    return 0.7;
    default:       return 1.0;   // 'none', null, unknown
  }
}

/** Status credit: Done 1, In Progress 0.5, Todo/Backlog 0, Canceled null (excluded). */
export function statusCredit(status: string | null | undefined): number | null {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "done") return 1;
  if (s === "in progress") return 0.5;
  if (s === "canceled" || s === "cancelled") return null;
  // Todo, Backlog, and anything unrecognised: claimed but no credit yet.
  return 0;
}

/** Issue weight = (estimate || 1) × priority multiplier. */
export function labWeight(
  estimate: number | null | undefined,
  priority: string | null | undefined,
): number {
  return (estimate || 1) * priorityMult(priority);
}

/**
 * Quality multiplier from the agent's 0–10 code_quality score.
 * No judgement yet → neutral 1.  Otherwise 0.85 + 0.015×q, bounded to
 * [0.85, 1.0] — the agent can only nudge a score, never zero it out.
 */
export function qualityMult(q10: number | null | undefined): number {
  if (q10 === null || q10 === undefined) return 1;
  const m = 0.85 + 0.015 * q10;
  return Math.min(1.0, Math.max(0.85, m));
}

export type ScoreParts = {
  weight: number;            // (estimate||1) × priorityMult
  status: number | null;     // null = Canceled (no score at all)
  bug: number;               // 0.7 for Bug-labelled issues, else 1
  evidence: number;          // evidence_factor ?? 1
  quality: number;           // bounded 0.85..1.0
  score: number | null;      // product, or null when status is null
};

/**
 * finalScore = weight × statusCredit × bugMult × evidenceFactor × qualityMult.
 * Returns every factor so the UI can render the full equation.
 */
export function finalScore(
  issue: LabIssue,
  evidence: LabEvidence | null | undefined,
  assessment: LabAssessment | null | undefined,
): ScoreParts {
  const weight = labWeight(issue.estimate, issue.priority);
  const status = statusCredit(issue.status);
  const bug = issue.label === "Bug" ? 0.7 : 1;
  const ev = evidence?.evidence_factor ?? 1;
  const quality = qualityMult(assessment?.code_quality ?? null);
  const score = status === null ? null : weight * status * bug * ev * quality;
  return { weight, status, bug, evidence: ev, quality, score };
}
