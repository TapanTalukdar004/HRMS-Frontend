/**
 * Real per-engineer report + scoring (READ-ONLY, deterministic, no AI at view).
 * PROOF-FIRST: no merged PR → no score. points = weight × quality × bug × proof × together.
 *   weight   = SP × priority
 *   quality  = AI 0–10 → ×0.85–1.0
 *   bug      = ×0.7 for a bug-fix or a feature held by an open bug
 *   proof    = review/CI strength of the merged PRs (self-merged-unreviewed / CI-failed nudge down)
 *   together = ×0.7 if the multi-PR connection check says the PRs DON'T match the issue
 * Each issue carries a confidence (high / med / low). Also surfaces AI strengths + defects.
 */
import { cache } from "react";
import { q } from "./db";

export const REAL_REPO = "ruh-ai/agent-builder";   // primary repo (codebase-map JSON + label fallback)
export const REAL_WORKSPACE = "ruh";
export const WORKSPACE_LABEL = "the RUH workspace";

/**
 * The scoring-repo set (changes/240): every repo whose PRs feed this workspace's scores
 * (`repo_project_map.scores`). Dashboards read PRs/assessments/blast facts across ALL of them, so an
 * employee's cross-repo work shows and scores. Falls back to the primary repo if the flag/table is absent.
 */
export async function getScoringRepos(): Promise<string[]> {
  try {
    const rows = await q<{ repo: string }>("SELECT repo FROM repo_project_map WHERE active AND scores ORDER BY repo");
    return rows.length ? rows.map((r) => r.repo) : [REAL_REPO];
  } catch {
    return [REAL_REPO];
  }
}

/** Every collected PR by this employee with NO working issue link, current + previous cycle only
 *  (changes/241 — the self-service loop: the employee sees exactly which of their PRs aren't tracked,
 *  adds the issue key to the PR title/branch, and the next nightly run links + scores it).
 *  Spans ALL active real repos (incl. collect-only ones like sdr), so work is visible even where
 *  scoring isn't on yet. `external_key` = a key was found but it isn't an issue we hold (other team). */
export type UntrackedPr = {
  repo: string; prNumber: number; title: string | null; state: string | null;
  mergedAt: string | null; status: "untracked" | "external_key"; candidateKeys: string[];
};
export async function getUntrackedPrs(token: string): Promise<UntrackedPr[]> {
  try {
    const rows = await q<{ repo: string; pr_number: number; title: string | null; state: string | null; merged_at: string | null; link_status: "untracked" | "external_key"; candidate_keys: string[] | null }>(
      `WITH b AS (
         SELECT COALESCE(
                  MIN(cycle_started_at) FILTER (WHERE cycle_number = (SELECT MAX(cycle_number) - 1 FROM lab_linear_issues WHERE workspace = $1 AND cycle_number IS NOT NULL)),
                  now() - interval '14 days') AS boundary
           FROM lab_linear_issues WHERE workspace = $1)
       SELECT l.repo, l.pr_number, p.title, p.state, p.merged_at, l.link_status, l.candidate_keys
         FROM pr_issue_links l
         JOIN github_prs p ON p.repo = l.repo AND p.pr_number = l.pr_number
         JOIN repo_project_map m ON m.repo = l.repo AND m.active AND m.repo LIKE 'ruh-ai/%'
        WHERE l.link_status IN ('untracked','external_key') AND lower(l.employee_name) = $2
          AND (p.merged_at >= (SELECT boundary FROM b) OR (p.merged_at IS NULL AND p.state = 'open'))
        ORDER BY COALESCE(p.merged_at, p.created_at) DESC`,
      [REAL_WORKSPACE, token.toLowerCase()]);
    return rows.map((r) => ({
      repo: r.repo, prNumber: Number(r.pr_number), title: r.title, state: r.state,
      mergedAt: r.merged_at, status: r.link_status, candidateKeys: r.candidate_keys ?? [],
    }));
  } catch {
    return [];
  }
}

const REWORK_PENALTY = 0.7;
const BUG_RESOLVED = 0.93;
const STAGE: Record<string, number | null> = {
  "backlog": 0, "todo": 0, "in development": 0.30, "code review": 0.55, "in review": 0.65,
  "in qa": 0.78, "ready to deploy- qa": 0.80, "ready to deploy - qa": 0.80, "pt review": 0.86,
  "approved for prod": 0.93, "done": 1.0, "on hold": 0.30, "canceled": null, "cancelled": null, "duplicate": null,
};
function stageCredit(s: string | null): number | null { const k = (s ?? "").trim().toLowerCase(); return k in STAGE ? STAGE[k] : 0; }
function priorityMult(p: string | null): number { switch ((p ?? "none").trim().toLowerCase()) { case "urgent": return 2.0; case "high": return 1.5; case "medium": return 1.0; case "low": return 0.7; default: return 1.0; } }
export function priorityMultLabel(p: string | null) { return priorityMult(p).toFixed(1); }
function qualityMult(qv: number | null): number { if (qv === null) return 1; return Math.min(1.0, Math.max(0.85, 0.85 + 0.015 * qv)); }
// CodeGraph blast radius → a bounded UPWARD booster (high-ripple work counts more; story points stay the base).
const BLAST_MULT: Record<string, number> = { local: 1.0, moderate: 1.1, wide: 1.25 };
function blastMult(band: string | null): number { return BLAST_MULT[(band ?? "local").toLowerCase()] ?? 1.0; }

export type RealIssue = { issue_key: string; title: string | null; status: string | null; priority: string | null; estimate: number | null; assignee: string | null; label: string | null; relates_to: string[] | null; cycle_number: number | null; is_inherited: boolean; cycle_started_at: string | null; cycle_ended_at: string | null; started_at: string | null; completed_at: string | null; added_to_cycle_at: string | null };
export type RealPr = {
  repo: string;   // owning repo — pr_number is unique only within a repo (changes/240 multi-repo)
  pr_number: number; title: string | null; state: string | null; merged_at: string | null; head_sha: string | null;
  employee_name: string | null; link_status: string; verified_keys: string[];
  reviews: number; selfMerged: boolean; ci: string | null; adds: number; dels: number; files: number;
  // CodeGraph blast radius (null until the repo is indexed)
  reachedSymbols: number | null; blastBand: string | null; touchesSensitive: boolean;
  changedModules: string[]; reachedModules: string[];
};
export type ProvenPr = { pr: RealPr; merged: boolean; quality: number | null; narrative: string | null; strengths: string[]; defects: string[]; coversReq: number | null; flags: string[] };
export type ScoredIssue = {
  issue: RealIssue; prs: ProvenPr[]; mergedPrs: number; quality: number | null;
  weight: number; bug: number; held: boolean; proof: number; togetherFactor: number; impact: number;
  points: number | null; confidence: "high" | "med" | "low";
  together: string | null; togetherNotes: string | null; crossDefects: string[];
  blastBand: string | null; reachedSymbols: number | null; riskFlag: boolean;
};
export type Suggestion = { pr: RealPr; issue_key: string; issue_title: string | null; overlap: number };
/** "Assigned vs Shipped" deviation signals — all derived from data we already store. */
export type Deviation = {
  onTicket: { own: number; other: number; untracked: number; total: number; pct: number };
  mismatchPrs: number[];     // RED — PR claims a ticket but the diff does something else (requirement_mismatch / status_without_code)
  securityPrs: number[];     // RED — possible_defect, or auth/tenancy keywords in the AI's defects (flag for human review)
  scopePrs: number[];        // AMBER — covers_requirement < 0.5 (partial vs the ticket's ask)
  offTicket: boolean;        // AMBER — most shipped work isn't on their own tickets (pct < 0.5)
  unpointedKeys: string[];   // GREY — high/urgent ticket with no story points (scores near-zero)
  crossRepoKeys: string[];   // GREY — multi-PR issue whose partner half is in an unconnected repo (together = pending)
  noProof: number;           // RED-ish — own ticket at an advanced status with zero merged PRs (claim without proof)
  noReviewPct: number; selfMergedPct: number;  // GREY — process hygiene vs the team
  verdict: string;           // one plain sentence for HR/PM
  score: number;             // sort key: higher = more it needs a conversation
};
export type EmployeeReport = {
  employee: string; provenIssues: ScoredIssue[]; noProofIssues: RealIssue[]; unlinkedPrs: RealPr[]; suggestions: Suggestion[];
  mergedPrs: number; totalPoints: number; avgQuality: number | null; band: "strong" | "ok" | "weak" | "none";
  // The ISSUE-SPINE numbers (changes/173): assigned = ownProven + noProofIssues.length, always.
  // helped = in-scope issues owned by others that this person's PRs prove. evidencePrs = DISTINCT
  // merged linked PR count (never a per-issue sum, so it can't exceed reality).
  counts: { issues: number; ownProven: number; helped: number; evidencePrs: number; prs: number; linked: number; untracked: number; judged: number };
  // ABSOLUTE performance score (0–100) — independent per person, NO top-performer normalization
  // (PRD 10). score = 100 × (0.60·output + 0.30·quality + 0.10·reach). Proof-first: null unless a
  // merged, quality-judged PR exists. output = volume of quality work shipped vs a strong-cycle bar;
  // reach = CodeGraph blast. Both are 0–1 sub-scores shown in the breakdown.
  scoreAbsolute: number | null; output: number | null; reach: number | null;
  deviation: Deviation;
};

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const STOP = new Set(["the", "a", "an", "to", "of", "for", "and", "in", "on", "with", "fix", "add", "update", "feat", "feature", "chore", "implement", "support", "when", "is", "api"]);
const words = (s: string | null) => new Set((s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
// promotion/merge PRs ("dev to qa", "promote…") bundle everyone's commits — not authored
// work for an issue, so they never count as proof.
const isPromo = (t: string | null) => /dev\s*(to|->|→)\s*qa|promote|moving\s*dev/i.test(t ?? "");

// Gentle, ADAPTIVE proof-strength per merged PR. We only penalise a PR for skipping a
// safeguard the repo ACTUALLY uses: the self-merged-unreviewed nudge applies ONLY when the
// repo has a review culture at all (so a team that never uses PR reviews isn't docked
// per-PR for it), and CI is only penalised when it FAILED ('none' = the repo has no CI =
// no penalty). Net: a repo with no CI / no reviews (e.g. the gateway) is not crushed —
// scoring there leans on quality + covers + weight instead.
function prProof(pr: RealPr, hasReviewCulture: boolean): number {
  let f = 1.0;
  if (hasReviewCulture && pr.selfMerged && pr.reviews === 0) f *= 0.95; // skipped AVAILABLE peer review
  if ((pr.ci ?? "").toLowerCase() === "failure") f *= 0.90;             // CI actually failed
  return f;
}

export type CycleWindow = { number: number; startsAt: string | null; endsAt: string | null; count: number; inherited: number; isCurrent: boolean };
export type CycleContext = { current: number | null; cycles: number[]; windows: CycleWindow[]; startsAt: string | null; endsAt: string | null; inherited: number; total: number };

const WEEK_MS = 7 * 86400000;
const EMPTY_CYCLE_CTX: CycleContext = { current: null, cycles: [], windows: [], startsAt: null, endsAt: null, inherited: 0, total: 0 };

/**
 * The Linear cycle window in scope = ARITHMETIC [max, max-1, max-2] from the highest cycle number present.
 * The window is derived by arithmetic, NOT from which cycles happen to have issues — so a genuinely EMPTY
 * cycle (e.g. cycle 11, whose issues Linear auto-advanced into 12) still appears as an in-window 0/0 card
 * instead of silently vanishing. Empty-cycle dates are inferred from the weekly cadence of a present neighbour.
 */
// cache(): dedupes per request — /overview now resolves the context once at the page level and other
// callers (getOverviewData without a preloaded ctx, /me, profile) reuse it instead of re-querying.
export const getCycleContext = cache(async (): Promise<CycleContext> => {
  try {
    const rows = await q<{ cycle_number: number; s: string | null; e: string | null; n: number; inh: number }>(
      `SELECT cycle_number, MIN(cycle_started_at) AS s, MAX(cycle_ended_at) AS e, COUNT(*)::int AS n,
              COUNT(*) FILTER (WHERE is_inherited)::int AS inh
         FROM lab_linear_issues WHERE workspace = $1 AND cycle_number IS NOT NULL
         GROUP BY cycle_number ORDER BY cycle_number DESC`, [REAL_WORKSPACE]);
    if (!rows.length) return EMPTY_CYCLE_CTX;
    const present = new Map(rows.map((r) => [Number(r.cycle_number), r]));
    const max = Math.max(...present.keys());
    const wantNumbers = [max, max - 1, max - 2];
    // an anchor (any present cycle with a start date) lets us infer an empty cycle's week
    const anchor = rows.find((r) => r.s);
    const anchorNum = anchor ? Number(anchor.cycle_number) : max;
    const anchorStart = anchor?.s ? new Date(anchor.s).getTime() : null;
    const windows: CycleWindow[] = wantNumbers.map((num) => {
      const r = present.get(num);
      if (r) return { number: num, startsAt: r.s, endsAt: r.e, count: Number(r.n), inherited: Number(r.inh), isCurrent: num === max };
      const startMs = anchorStart != null ? anchorStart - (anchorNum - num) * WEEK_MS : null;
      return {
        number: num,
        startsAt: startMs != null ? new Date(startMs).toISOString() : null,
        endsAt: startMs != null ? new Date(startMs + WEEK_MS).toISOString() : null,
        count: 0, inherited: 0, isCurrent: false,
      };
    });
    const cur = windows[0];
    return {
      current: max,
      cycles: wantNumbers,
      windows,
      startsAt: cur.startsAt, endsAt: cur.endsAt,
      inherited: rows.reduce((a, r) => a + Number(r.inh ?? 0), 0),
      total: rows.reduce((a, r) => a + Number(r.n ?? 0), 0),
    };
  } catch { return EMPTY_CYCLE_CTX; }
});

/**
 * @param cycleNum  scope to ONE Linear cycle (issues of that cycle only; PRs attributed via their
 *                  linked issue's cycle — changes/173 decision). null = the whole {max,max-1,max-2} window.
 */
export const getEmployeeReports = cache(async (cycleNum: number | null = null): Promise<EmployeeReport[]> => {
  const repos = await getScoringRepos();   // multi-repo scoring union (changes/240)
  const [issueRows, prRows, assessRows, clusterRows, impactRows] = await Promise.all([
    q<RealIssue>(`SELECT issue_key, title, status, priority, estimate, assignee, label, relates_to,
                         cycle_number, is_inherited, cycle_started_at, cycle_ended_at,
                         started_at, completed_at, added_to_cycle_at
                  FROM lab_linear_issues
                  WHERE workspace = $1 AND cycle_number IS NOT NULL
                    -- defend the window IN the query too (not only at ingest): current + 2 prior
                    AND cycle_number >= (SELECT MAX(cycle_number) - 2 FROM lab_linear_issues WHERE workspace = $1 AND cycle_number IS NOT NULL)
                    AND ($2::int IS NULL OR cycle_number = $2::int)`, [REAL_WORKSPACE, cycleNum]),
    q<RealPr>(`SELECT l.repo, l.pr_number, l.employee_name, l.link_status, l.verified_keys,
                      p.title, p.state, p.merged_at, p.head_sha,
                      p.review_approvals AS reviews, p.self_merged AS "selfMerged", p.ci_status AS ci,
                      p.additions AS adds, p.deletions AS dels, p.changed_files AS files
               FROM pr_issue_links l JOIN github_prs p ON p.repo = l.repo AND p.pr_number = l.pr_number
               WHERE l.repo = ANY($1) ORDER BY l.pr_number DESC`, [repos]),
    q<{ issue_key: string; head_sha: string | null; code_quality: number | null; narrative: string | null; strengths: string[] | null; defects_found: string[] | null; covers_requirement: number | null; truthfulness_flags: string[] | null }>(
      `SELECT DISTINCT ON (head_sha, issue_key) issue_key, head_sha, code_quality, narrative, strengths, defects_found, covers_requirement, truthfulness_flags
       FROM agent_assessments WHERE repo = ANY($1) ORDER BY head_sha, issue_key, created_at DESC`, [repos]),
    q<{ issue_key: string; integration_status: string | null; connection_notes: string | null; cross_defects: string[] | null }>(
      `SELECT DISTINCT ON (issue_key) issue_key, integration_status, connection_notes, cross_defects
       FROM issue_cluster ORDER BY issue_key, run_date DESC, created_at DESC`),
    q<{ repo: string; pr_number: number; reached_symbols: number | null; blast_band: string | null; touches_sensitive: boolean | null; detail: { changed_modules?: string[]; reached_modules?: string[] } | null }>(
      `SELECT repo, pr_number, reached_symbols, blast_band, touches_sensitive, detail FROM pr_graph_impact WHERE repo = ANY($1)`, [repos]),
  ]);

  const issues = issueRows.map((r) => ({ ...r, estimate: num(r.estimate), relates_to: r.relates_to ?? [] }));
  const impactByPr = new Map(impactRows.map((g) => [`${g.repo}|${Number(g.pr_number)}`, g]));
  const allPrs = prRows.map((r) => {
    const g = impactByPr.get(`${r.repo}|${Number(r.pr_number)}`);
    return { ...r, pr_number: Number(r.pr_number), verified_keys: r.verified_keys ?? [], reviews: Number(r.reviews ?? 0), selfMerged: !!r.selfMerged, adds: Number(r.adds ?? 0), dels: Number(r.dels ?? 0), files: Number(r.files ?? 0),
      reachedSymbols: g ? num(g.reached_symbols) : null, blastBand: g?.blast_band ?? null, touchesSensitive: !!g?.touches_sensitive,
      changedModules: g?.detail?.changed_modules ?? [], reachedModules: g?.detail?.reached_modules ?? [] };
  });
  // Does this repo even use PR reviews? If NO PR was ever reviewed, there is no review
  // culture, so we don't dock individuals for self-merging (adaptive proof — see prProof).
  const hasReviewCulture = allPrs.some((p) => p.reviews > 0);
  const issueByKey = new Map(issues.map((i) => [i.issue_key.toUpperCase(), i]));

  // ── SCOPE the PR set (changes/173): a linked PR belongs to the cycle of its LINKED ISSUE;
  // an untracked/unlinked PR has no issue, so it's date-bounded to the scope's own date range
  // (fixes the old "110 lifetime PRs" leaking into every cycle's Fit/deviation numbers).
  const scopeStart = issues.reduce<number | null>((a, i) => (i.cycle_started_at ? Math.min(a ?? Infinity, new Date(i.cycle_started_at).getTime()) : a), null);
  const scopeEnd = issues.reduce<number | null>((a, i) => (i.cycle_ended_at ? Math.max(a ?? -Infinity, new Date(i.cycle_ended_at).getTime()) : a), null);
  const inScopeDates = (mergedAt: string | null) => {
    if (mergedAt === null) return true;                    // open PRs are current by definition
    if (scopeStart === null || scopeEnd === null) return false;
    const t = new Date(mergedAt).getTime();
    return t >= scopeStart && t <= scopeEnd;
  };
  const prs = allPrs.filter((p) =>
    p.link_status === "linked"
      ? p.verified_keys.some((k) => issueByKey.has(k.toUpperCase()))   // issue-cycle attribution
      : inScopeDates(p.merged_at));                                    // date-bounded for no-issue PRs
  const assess = new Map<string, { quality: number | null; narrative: string | null; strengths: string[]; defects: string[]; coversReq: number | null; flags: string[] }>();
  // Per-PR (head_sha) rollups so deviation signals work even for untracked PRs
  // (whose assessment is filed under a synthetic "PR-###" key, not a real issue).
  const flagsBySha = new Map<string, Set<string>>();
  const coversBySha = new Map<string, number>();
  const defectsBySha = new Map<string, string>();
  for (const a of assessRows) {
    const flags = a.truthfulness_flags ?? [];
    assess.set(`${a.head_sha}|${(a.issue_key || "").toUpperCase()}`, { quality: num(a.code_quality), narrative: a.narrative, strengths: a.strengths ?? [], defects: a.defects_found ?? [], coversReq: num(a.covers_requirement), flags });
    if (a.head_sha) {
      const set = flagsBySha.get(a.head_sha) ?? new Set<string>(); flags.forEach((f) => set.add(f)); flagsBySha.set(a.head_sha, set);
      const cv = num(a.covers_requirement); if (cv !== null) coversBySha.set(a.head_sha, Math.min(coversBySha.get(a.head_sha) ?? 1, cv));
      defectsBySha.set(a.head_sha, `${defectsBySha.get(a.head_sha) ?? ""} ${(a.defects_found ?? []).join(" ")} ${a.narrative ?? ""}`);
    }
  }
  const clusterByKey = new Map<string, { status: string | null; notes: string | null; defects: string[] }>();
  for (const c of clusterRows) clusterByKey.set(c.issue_key.toUpperCase(), { status: c.integration_status, notes: c.connection_notes, defects: c.cross_defects ?? [] });

  const merged = (p: RealPr) => !!p.merged_at;
  const proofFor = (pr: RealPr, key: string): ProvenPr => {
    const a = assess.get(`${pr.head_sha}|${key.toUpperCase()}`);
    return { pr, merged: merged(pr), quality: a?.quality ?? null, narrative: a?.narrative ?? null, strengths: a?.strengths ?? [], defects: a?.defects ?? [], coversReq: a?.coversReq ?? null, flags: a?.flags ?? [] };
  };
  function isHeld(issue: RealIssue): boolean {
    if ((issue.label ?? "") === "Bug") return false;
    for (const k of issue.relates_to ?? []) { const rel = issueByKey.get(k.toUpperCase()); if (rel && rel.label === "Bug" && (stageCredit(rel.status) ?? 0) < BUG_RESOLVED) return true; }
    return false;
  }
  function scoreIssue(issue: RealIssue, provs: ProvenPr[]): ScoredIssue {
    const mergedProvs = provs.filter((p) => p.merged);
    const quality = mean(mergedProvs.map((x) => x.quality).filter((qv): qv is number => qv !== null));
    const weight = (issue.estimate || 1) * priorityMult(issue.priority);
    const held = isHeld(issue);
    const bug = (issue.label ?? "") === "Bug" || held ? REWORK_PENALTY : 1;
    const proof = mergedProvs.length ? mean(mergedProvs.map((p) => prProof(p.pr, hasReviewCulture)))! : 1;
    const cl = clusterByKey.get(issue.issue_key.toUpperCase());
    const together = cl?.status ?? null;
    const togetherFactor = together === "mismatch" ? 0.7 : 1;
    // CodeGraph impact: the issue takes the MAX band across its merged PRs (touching a hub earns credit).
    const bands = mergedProvs.map((p) => p.pr.blastBand).filter((b): b is string => !!b);
    const topBand = bands.length ? bands.reduce((a, b) => (blastMult(b) > blastMult(a) ? b : a)) : null;
    const impact = blastMult(topBand);
    const reachedSymbols = mergedProvs.length ? Math.max(0, ...mergedProvs.map((p) => p.pr.reachedSymbols ?? 0)) : null;
    // risk (needs review, NOT a score penalty): a wide, security-sensitive change that
    // NOBODY reviewed. Keyed on the raw review state (not `proof`, which is neutralised to
    // 1.0 on a repo with no review culture) — so these still surface for a human here.
    const riskFlag = mergedProvs.some((p) => (p.pr.blastBand ?? "").toLowerCase() === "wide" && p.pr.touchesSensitive && (p.pr.reviews === 0 || p.pr.selfMerged));
    // BOTH-SOURCES GATE: points need a merged PR (GitHub proof) AND an AI quality read on it.
    // A merged PR whose review hasn't run yet must NOT score with a silently-neutral quality —
    // it stays visible as proven-but-unscored ("—") until the assessment lands.
    const points = mergedProvs.length > 0 && quality !== null ? Number((weight * qualityMult(quality) * bug * proof * togetherFactor * impact).toFixed(2)) : null;
    // confidence: low if no SP / mismatch / no quality; high if SP + some review + verified-or-na together
    const reviewed = mergedProvs.some((p) => p.pr.reviews > 0 && !p.pr.selfMerged);
    let confidence: ScoredIssue["confidence"] = "med";
    if (quality === null || !issue.estimate || together === "mismatch") confidence = "low";
    else if (issue.estimate && reviewed && (together === "verified" || together === null)) confidence = "high";
    return { issue, prs: provs, mergedPrs: mergedProvs.length, quality, weight, bug, held, proof, togetherFactor, impact, points, confidence,
             together, togetherNotes: cl?.notes ?? null, crossDefects: cl?.defects ?? [],
             blastBand: topBand, reachedSymbols, riskFlag };
  }

  const tokens = new Set<string>();
  for (const i of issues) if (i.assignee && i.assignee !== "unassigned") tokens.add(i.assignee);
  for (const p of prs) if (p.employee_name) tokens.add(p.employee_name);

  const reports: EmployeeReport[] = [];
  for (const emp of tokens) {
    const empIssues = issues.filter((i) => i.assignee === emp);
    const empPrs = prs.filter((p) => p.employee_name === emp);
    const linked = empPrs.filter((p) => p.link_status === "linked" && !isPromo(p.title));
    const unlinkedPrs = empPrs.filter((p) => p.link_status !== "linked" && !isPromo(p.title));

    const mk = (issue: RealIssue): ScoredIssue =>
      scoreIssue(issue, linked.filter((p) => p.verified_keys.map((k) => k.toUpperCase()).includes(issue.issue_key.toUpperCase())).map((p) => proofFor(p, issue.issue_key)));
    const ownScored = empIssues.map(mk);
    const ownKeys = new Set(empIssues.map((i) => i.issue_key.toUpperCase()));
    const otherKeys = new Set<string>();
    for (const p of linked) for (const k of p.verified_keys) if (!ownKeys.has(k.toUpperCase())) otherKeys.add(k.toUpperCase());
    const otherScored: ScoredIssue[] = [];
    for (const k of otherKeys) { const i = issueByKey.get(k); if (i) otherScored.push(mk(i)); }

    const provenIssues = [...ownScored, ...otherScored].filter((s) => s.mergedPrs > 0).sort((a, b) => b.mergedPrs - a.mergedPrs || (b.points ?? 0) - (a.points ?? 0));
    const noProofIssues = ownScored.filter((s) => s.mergedPrs === 0).map((s) => s.issue);

    const suggestions: Suggestion[] = [];
    for (const pr of unlinkedPrs.filter((p) => p.link_status === "untracked")) {
      const pw = words(pr.title); let best: Suggestion | null = null;
      for (const i of empIssues) { const o = [...words(i.title)].filter((w) => pw.has(w)).length; if (o >= 2 && (!best || o > best.overlap)) best = { pr, issue_key: i.issue_key, issue_title: i.title, overlap: o }; }
      if (best) suggestions.push(best);
    }

    const mergedLinkedCount = linked.filter(merged).length;
    const totalPoints = Number(provenIssues.reduce((a, s) => a + (s.points ?? 0), 0).toFixed(1));
    const allQ = provenIssues.flatMap((x) => x.prs.filter((p) => p.merged).map((p) => p.quality)).filter((qv): qv is number => qv !== null);
    const avgQuality = mean(allQ);
    const band: EmployeeReport["band"] = mergedLinkedCount === 0 ? "none" : (avgQuality ?? 0) >= 7 ? "strong" : (avgQuality ?? 0) >= 5 ? "ok" : "weak";

    // ── Deviation: assigned vs shipped ───────────────────────────────────────
    const ownKeysU = new Set(empIssues.map((i) => i.issue_key.toUpperCase()));
    const isOwnPr = (p: RealPr) => p.link_status === "linked" && p.verified_keys.some((k) => ownKeysU.has(k.toUpperCase()));
    const mergedNP = empPrs.filter((p) => merged(p) && !isPromo(p.title));
    const ownPrs = mergedNP.filter(isOwnPr);
    const untrkPrs = mergedNP.filter((p) => p.link_status === "untracked");
    const otherPrs = mergedNP.filter((p) => !isOwnPr(p) && p.link_status !== "untracked");
    const totalM = mergedNP.length;
    const onPct = totalM ? ownPrs.length / totalM : 0;
    const EMPTY_SET = new Set<string>();
    const flagsOf = (p: RealPr) => (p.head_sha ? flagsBySha.get(p.head_sha) ?? EMPTY_SET : EMPTY_SET);
    const coversOf = (p: RealPr) => (p.head_sha ? coversBySha.get(p.head_sha) ?? null : null);
    // Phase-A fix: a RED "security" flag needs a REAL fact, not a prose keyword.
    // It now requires ALL THREE: (1) the AI STRUCTURALLY flagged a possible defect
    // (possible_defect — its own deliberate signal, not words we grepped), (2) the
    // change went UNREVIEWED (self-merged or 0 reviews — nobody caught it), and (3)
    // the flagged defect reads as a security control being removed/bypassed. The
    // keyword alone used to fire on 28+ benign PRs (any mention of "auth"); on its
    // own it's noise, so SEC_RE only REFINES the label now, it never triggers RED.
    const SEC_RE = /commented out|disabled (the )?check|cross[- ]?tenant|tenancy check|org[- ]?scoping|authoriz\w* (check|bypass|guard)|auth(orization)? bypass|security (regression|bypass)|removed? \w*\s*(auth|permission|tenancy|scoping) (check|guard)/i;
    const mismatchPrs = mergedNP.filter((p) => { const f = flagsOf(p); return f.has("requirement_mismatch") || f.has("status_without_code"); }).map((p) => p.pr_number);
    const securityPrs = mergedNP.filter((p) =>
      flagsOf(p).has("possible_defect") &&
      (p.selfMerged || p.reviews === 0) &&
      SEC_RE.test(defectsBySha.get(p.head_sha ?? "") ?? "")
    ).map((p) => p.pr_number);
    const scopePrs = mergedNP.filter((p) => { const c = coversOf(p); return c !== null && c < 0.5; }).map((p) => p.pr_number);
    const unpointedKeys = empIssues.filter((i) => ["urgent", "high"].includes((i.priority ?? "").toLowerCase()) && !i.estimate && stageCredit(i.status) !== null).map((i) => i.issue_key);
    const crossRepoKeys = provenIssues.filter((s) => s.together === "pending").map((s) => s.issue.issue_key);
    const noProof = noProofIssues.filter((i) => (stageCredit(i.status) ?? 0) >= 0.65).length;
    const noReviewPct = totalM ? mergedNP.filter((p) => p.reviews === 0).length / totalM : 0;
    const selfMergedPct = totalM ? mergedNP.filter((p) => p.selfMerged).length / totalM : 0;
    const offTicket = totalM > 0 && onPct < 0.5;
    const score = securityPrs.length * 100 + noProof * 12 + mismatchPrs.length * 10 + (offTicket ? (1 - onPct) * 6 : 0) + scopePrs.length * 2 + (unpointedKeys.length ? 1 : 0);
    const verdict =
      securityPrs.length ? `${securityPrs.length} PR${securityPrs.length > 1 ? "s" : ""} flagged for security review — check before anything else.`
      : mismatchPrs.length ? `${mismatchPrs.length} PR${mismatchPrs.length > 1 ? "s" : ""} don't match the ticket they claim — verify.`
      : noProof ? `${noProof} ticket${noProof > 1 ? "s" : ""} marked advanced with no merged code here — verify or it's in another repo.`
      : totalM === 0 ? `No merged work linked in this repo — likely shipping elsewhere or links missing.`
      : offTicket ? `${totalM} shipped, only ${ownPrs.length} on their own tickets — most work is off-plan.`
      : scopePrs.length ? `${scopePrs.length} PR${scopePrs.length > 1 ? "s" : ""} delivered only part of what the ticket asked.`
      : `On plan — ${ownPrs.length}/${totalM} of shipped work is on their own tickets.`;
    const deviation: Deviation = { onTicket: { own: ownPrs.length, other: otherPrs.length, untracked: untrkPrs.length, total: totalM, pct: onPct }, mismatchPrs, securityPrs, scopePrs, offTicket, unpointedKeys, crossRepoKeys, noProof, noReviewPct, selfMergedPct, verdict, score };

    // ── ABSOLUTE performance score (independent per person; no top-performer normalization) — PRD 10 ──
    // FIX (2026-07-11): Output is the VOLUME of quality-gated work shipped (own + helped) vs a fixed
    // "strong cycle" bar — NOT a completion ratio. A ratio wrongly ranked a 2-PR finisher above a
    // 33-PR contributor; volume-vs-a-bar makes doing MORE real work raise the score, quality-adjusted.
    // score = 100 × (0.60·output + 0.30·quality + 0.10·reach). No Craft/CI/review axis (no such culture).
    const STRONG_CYCLE_SIZE = 45;  // TUNABLE, ABSOLUTE: weighted work (SP×priority, bug-discounted) that = a strong ONE-WEEK cycle → 100% Output. Not the top performer.
    const provenSize = provenIssues.reduce((a, s) => a + s.weight * s.bug, 0);                 // magnitude of ALL shipped, quality-gated work (own + helped)
    // Span-scale the bar (changes/212) so an oversized/catch-all cycle (PRs merged over many weeks) can't
    // saturate Output. Normal weekly cycle → span 1 week → bar unchanged; mirrors score_prs.py.
    const mergeMs = provenIssues.flatMap((s) => s.prs.filter((p) => p.merged && p.pr.merged_at).map((p) => new Date(p.pr.merged_at as string).getTime()));
    const spanWeeks = mergeMs.length > 1 ? Math.max(1, Math.round((Math.max(...mergeMs) - Math.min(...mergeMs)) / (7 * 86400000))) : 1;
    const output = Math.min(1, provenSize / (STRONG_CYCLE_SIZE * spanWeeks));                  // absolute volume vs the span-adjusted strong-cycle bar
    const qualitySub = avgQuality !== null ? Math.min(1, avgQuality / 10) : null;              // AI reviewer 0–10 → 0–1
    const bandScore = (b: string | null) => { const k = (b ?? "").toLowerCase(); return k === "wide" ? 1 : k === "moderate" ? 0.75 : 0.5; };
    const reach = provenIssues.length ? mean(provenIssues.map((s) => bandScore(s.blastBand))) : null;  // CodeGraph blast → 0–1
    let scoreAbsolute: number | null = null;
    if (qualitySub !== null) {                                                                  // proof-first gate: needs a judged, merged PR
      scoreAbsolute = Math.round(100 * (0.60 * output + 0.30 * qualitySub + 0.10 * (reach ?? 0.5)));
    }

    reports.push({ employee: emp, provenIssues, noProofIssues, unlinkedPrs, suggestions, mergedPrs: mergedLinkedCount, totalPoints, avgQuality, band,
      scoreAbsolute, output, reach,
      counts: { issues: empIssues.length,
                ownProven: ownScored.filter((s) => s.mergedPrs > 0).length,
                helped: otherScored.filter((s) => s.mergedPrs > 0).length,
                evidencePrs: mergedLinkedCount,
                prs: empPrs.length, linked: linked.length, untracked: empPrs.filter((p) => p.link_status === "untracked").length, judged: allQ.length },
      deviation });
  }

  reports.sort((a, b) => b.mergedPrs - a.mergedPrs || b.totalPoints - a.totalPoints);
  return reports;
});

/**
 * Overlay the PERSISTED absolute score (cycle_employee_scores, written by score_prs.py) onto the
 * live reports — the SAME fallback policy /overview uses (overviewQueries.ts): read the stored
 * `absolute_v1` score when present, else keep the live compute. This makes /me and /employees read
 * the DB exactly like /overview, so all three surfaces agree, without touching getEmployeeReports
 * (the pure live lens) or /overview. Keyed by employee_name; picks the NEWEST cycle per employee
 * (the current headline). A token-mismatch miss simply keeps the live value rather than blanking it.
 */
/** Incomplete work an employee still owns from EARLIER cycles (their ongoing plate). Shown on the
 *  employee/HR views as context — NOT scored into the current cycle (its proof, if any, belongs to the
 *  cycle it shipped in), so it restores visibility of carryover without re-introducing the Q2 leak. */
export type CarryoverIssue = { issueKey: string; title: string | null; status: string | null; priority: string | null; estimate: number | null; cycleNumber: number | null; assignedAt: string | null };
export async function getCarryoverIssues(token: string, currentCycle: number | null): Promise<CarryoverIssue[]> {
  if (currentCycle == null) return [];
  try {
    const rows = await q<{ issue_key: string; title: string | null; status: string | null; priority: string | null; estimate: number | null; cycle_number: number | null; assigned_at: string | null }>(
      `SELECT issue_key, title, status, priority, estimate, cycle_number,
              COALESCE(added_to_cycle_at, started_at, issue_created_at) AS assigned_at
         FROM lab_linear_issues
        WHERE workspace = $1 AND lower(assignee) = $2
          AND cycle_number IS NOT NULL AND cycle_number < $3
          -- ONGOING only: drop resolved (Done / Approved for Prod) + dead statuses; keep in-flight work
          AND lower(coalesce(status,'')) NOT IN ('done','approved for prod','canceled','cancelled','duplicate')
        ORDER BY assigned_at DESC NULLS LAST, issue_key`, [REAL_WORKSPACE, token.toLowerCase(), currentCycle]);
    return rows.map((r) => ({ issueKey: r.issue_key, title: r.title, status: r.status, priority: r.priority, estimate: num(r.estimate), cycleNumber: r.cycle_number, assignedAt: r.assigned_at }));
  } catch {
    return [];
  }
}

/** MONTHLY score (changes/208): the persisted absolute "big-cycle" monthly rollup for one employee,
 *  plus an EWMA recency trend derived from their cycle-score series. Reliable for the CURRENT month
 *  (score_prs windows 3 cycles); a true all-time monthly is a later v2. Returns null if none yet. */
export type MonthlyScore = {
  yearMonth: string; score: number | null; output: number | null; quality: number | null; reach: number | null;
  provenSize: number | null; nCycles: number | null; isPartial: boolean;
  trend: "up" | "down" | "flat" | null; trendDelta: number | null;
  history: { ym: string; score: number | null }[];
};
export async function getMonthlyScore(token: string, nowISO: string): Promise<MonthlyScore | null> {
  let rows: { year_month: string; score_0_100: number | null; output_factor: number | null; quality_sub: number | null; reach_factor: number | null; proven_size: number | null; n_cycles_in_month: number | null }[] = [];
  try {
    rows = await q(
      `SELECT year_month, score_0_100, output_factor, quality_sub, reach_factor, proven_size, n_cycles_in_month
         FROM monthly_performance_rollup
        WHERE employee_id IN (SELECT employee_id FROM github_identities
                              WHERE lower(employee_name) = $1 AND employee_id IS NOT NULL)
        ORDER BY year_month DESC`, [token.toLowerCase()]);
  } catch {
    return null;
  }
  if (!rows.length) return null;
  const top = rows[0];
  const curYm = nowISO.slice(0, 7);  // 'YYYY-MM'
  // EWMA trend over the employee's cycle scores (oldest -> newest), alpha = 0.5
  let trend: MonthlyScore["trend"] = null, trendDelta: number | null = null;
  try {
    const cyc = await q<{ s: number | null }>(
      `SELECT ces.cycle_score_0_100 AS s FROM cycle_employee_scores ces
         JOIN performance_cycles pc ON pc.id = ces.cycle_id
        WHERE pc.linear_workspace_key = $1 AND lower(ces.employee_name) = $2 AND ces.cycle_score_0_100 IS NOT NULL
        ORDER BY pc.cycle_end ASC`, [REAL_WORKSPACE, token.toLowerCase()]);
    const series = cyc.map((r) => Number(r.s)).filter((n) => !isNaN(n));
    if (series.length >= 2) {
      const a = 0.5;
      let ewma = series[0];
      for (let i = 1; i < series.length - 1; i++) ewma = a * series[i] + (1 - a) * ewma;  // EWMA of all-but-last
      const last = series[series.length - 1];
      trendDelta = Math.round(last - ewma);
      trend = trendDelta > 3 ? "up" : trendDelta < -3 ? "down" : "flat";
    }
  } catch { /* trend optional */ }
  return {
    yearMonth: top.year_month, score: num(top.score_0_100), output: num(top.output_factor),
    quality: num(top.quality_sub), reach: num(top.reach_factor), provenSize: num(top.proven_size),
    nCycles: top.n_cycles_in_month, isPartial: top.year_month === curYm, trend, trendDelta,
    history: rows.slice(0, 6).map((r) => ({ ym: r.year_month, score: num(r.score_0_100) })),
  };
}

/** Last-3-cycles history for one employee (changes/210): the persisted per-cycle absolute score +
 *  make-up, newest first. Lets an employee see their recent cycle reports side by side. */
export type CycleHistoryRow = { cycleNumber: number | null; score: number | null; output: number | null; quality: number | null; reach: number | null; provenSize: number | null };
export async function getCycleHistory(token: string, limit = 3): Promise<CycleHistoryRow[]> {
  try {
    const rows = await q<{ cycle_number: number | null; score: number | null; output_factor: number | null; quality_sub: number | null; reach_factor: number | null; proven_size: number | null }>(
      `SELECT NULLIF(regexp_replace(pc.cycle_name, '\\D', '', 'g'), '')::int AS cycle_number,
              ces.cycle_score_0_100 AS score, ces.output_factor, ces.quality_sub, ces.reach_factor, ces.proven_size
         FROM cycle_employee_scores ces
         JOIN performance_cycles pc ON pc.id = ces.cycle_id
        WHERE pc.linear_workspace_key = $1 AND lower(ces.employee_name) = $2
        ORDER BY cycle_number DESC NULLS LAST
        LIMIT $3`, [REAL_WORKSPACE, token.toLowerCase(), limit]);
    return rows.map((r) => ({ cycleNumber: r.cycle_number, score: num(r.score), output: num(r.output_factor),
      quality: num(r.quality_sub), reach: num(r.reach_factor), provenSize: num(r.proven_size) }));
  } catch {
    return [];
  }
}

export async function applyPersistedScores(reports: EmployeeReport[], cycleNum: number | null = null): Promise<EmployeeReport[]> {
  let rows: { employee_name: string; cycle_number: number | null; cycle_score_0_100: number | null;
              output_factor: number | null; reach_factor: number | null; score_model_version: string | null }[] = [];
  try {
    rows = await q(
      `SELECT ces.employee_name,
              NULLIF(regexp_replace(pc.cycle_name, '\\D', '', 'g'), '')::int AS cycle_number,
              ces.cycle_score_0_100, ces.output_factor, ces.reach_factor, ces.score_model_version
         FROM cycle_employee_scores ces
         JOIN performance_cycles pc ON pc.id = ces.cycle_id
        WHERE pc.linear_workspace_key = $1`, [REAL_WORKSPACE]);
  } catch {
    return reports;  // never let a persisted-read failure blank the page — fall back to the live compute
  }
  // scope to the requested cycle (STRICT current-cycle, changes/204) if given, else newest per employee
  const best = new Map<string, typeof rows[number]>();
  for (const r of rows) {
    if (cycleNum != null && Number(r.cycle_number) !== cycleNum) continue;
    const prev = best.get(r.employee_name);
    if (!prev || Number(r.cycle_number ?? -1) > Number(prev.cycle_number ?? -1)) best.set(r.employee_name, r);
  }
  for (const rep of reports) {
    const pd = best.get(rep.employee);
    const useDb = pd?.score_model_version === "absolute_v1" && pd.cycle_score_0_100 != null;
    if (useDb && pd) {
      rep.scoreAbsolute = num(pd.cycle_score_0_100);
      rep.output = num(pd.output_factor) ?? rep.output;
      rep.reach = num(pd.reach_factor) ?? rep.reach;
    }
  }
  return reports;
}
