/**
 * /overview data (Phase D) — the HR at-a-glance dashboard, LIVE.
 * Headline numbers come from the PERSISTED store (cycle_employee_scores /
 * monthly_performance_rollup — written by perf_tracker/score_prs.py, frozen at
 * cycle end), card internals from the same proof-first lens /report uses
 * (getEmployeeReports). Read-only; advisory; never a ranked leaderboard.
 */
import { q } from "./db";
import { getEmployeeReports, getCycleContext, type EmployeeReport, type CycleContext, type CarryoverIssue } from "./realReport";
import { REAL_REPO } from "./realReport";

export type IssueRowLite = {
  key: string; title: string | null; type: string | null; priority: string | null;
  sp: number | null; weight: number; status: string | null; bug: number; points: number | null;
  state: "proven" | "awaiting" | "helped";
  prCount: number;
  startedAt: string | null; completedAt: string | null; addedToCycleAt: string | null;
};

export type PerfCardData = {
  band: EmployeeReport["band"];
  combined: number | null;              // ABSOLUTE performance score 0–100 (independent; PRD 10) — live-computed, not the persisted relative one
  output: number | null;                // 0–1 sub-score: volume of quality work shipped vs a strong-cycle bar
  reach: number | null;                 // 0–1 sub-score: CodeGraph blast band
  outputRaw: number | null;             // persisted attributed points, current cycle
  points: number; avgQuality: number | null;
  // the ISSUE SPINE (changes/173): assigned = proven + awaiting, always; helped is separate.
  assigned: number; proven: number; awaiting: number; helped: number;
  evidencePrs: number;                  // DISTINCT merged linked PRs (never a per-issue sum)
  own: number; other: number; untracked: number; totalM: number; onPct: number;
  unpointed: number;
  verdict: string;
  qualityFactor: number | null; impactFactor: number | null;
  flags: { mismatch: number; noProof: number; scope: number; unpointed: number; noReviewPct: number; security: number };
  issues: IssueRowLite[];               // ALL in-scope issues (own proven + awaiting + helped) — no truncation
  carryover: CarryoverIssue[];          // ongoing work carried from EARLIER cycles (shown, NOT scored this cycle)
};

export type OverviewData = {
  cycle: CycleContext;
  scopedCycle: number | null;           // the cycle the view is scoped to (null = whole window)
  issueStats: { planned: number; inProgress: number; done: number; held: number };
  prStats: { open: number; merged: number; matched: number; orphaned: number };
  linkCoveragePct: number | null;
  noEvidence: { total: number; byOwner: { token: string; n: number }[] };  // assigned issues with NO linked merged PR
  distribution: { strong: number; mid: number; behind: number };
  topPerformer: { token: string; points: number } | null;
  needsAttention: number;
  cards: Map<string, PerfCardData>;     // keyed by first-name token (lowercase)
};

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export type DailyPoint = { day: string; points: number; prs: number };

/** Per-day shipped points for one employee (token) — from persisted pr_score, bucketed by the PR's
 *  own merged_at (changes/173). Feeds the performance-over-days graph on the detail page. */
export async function getDailyPoints(token: string): Promise<DailyPoint[]> {
  try {
    const rows = await q<{ day: string; points: number; prs: number }>(
      `SELECT to_char(s.merged_at, 'YYYY-MM-DD') AS day,
              ROUND(SUM(s.issue_value)::numeric, 2)::float8 AS points,
              COUNT(*)::int AS prs
         FROM pr_score s
        WHERE s.merged_at IS NOT NULL
          -- subquery (not a JOIN): an employee with several GitHub logins must not double rows
          AND s.employee_id IN (SELECT employee_id FROM github_identities
                                WHERE employee_name = $1 AND employee_id IS NOT NULL)
        GROUP BY 1 ORDER BY 1`, [token]);
    return rows.map((r) => ({ day: r.day, points: Number(r.points), prs: Number(r.prs) }));
  } catch { return []; }
}

/**
 * @param cycleNum  scope the whole view to a single cycle (from ?cycle=N). null = the full {max,max-1,max-2}
 *                  window. Live-recompute drives the SELECTED cycle; ended cycles read their frozen snapshot.
 * @param preloadedCycle  pass the already-fetched CycleContext (changes/236) so the page can resolve it
 *                  once and run this + the changes/diff panels concurrently, instead of a serial waterfall.
 */
export async function getOverviewData(cycleNum: number | null = null, preloadedCycle?: CycleContext): Promise<OverviewData> {
  // reports are CYCLE-SCOPED at the source (issues of that cycle; PRs attributed via their linked
  // issue's cycle; untracked PRs date-bounded) — so deviation/Fit/flags all share the same scope.
  // STRICT current-cycle scoping (changes/204): the default view = the CURRENT cycle only, NOT the
  // 3-cycle window — completed prior-cycle work must never inflate "this cycle" (the Q2 leak). ?cycle=N
  // drills into a specific prior cycle; null resolves to the current cycle. Each issue's proof (merged PR)
  // is credited to its own cycle, so a cycle-12 PR stays in cycle 12; genuinely unfinished carryover has
  // no merged PR and so scores 0 regardless — hence current-cycle scoping is both correct and leak-free.
  const cycle = preloadedCycle ?? (await getCycleContext());
  const effectiveCycle = cycleNum ?? cycle.current;
  const inScope = (n: number | null | undefined) => (effectiveCycle != null ? Number(n) === effectiveCycle : true);
  // date range of the scoped cycle — bounds the header PR stats
  const scopeWins = effectiveCycle != null ? cycle.windows.filter((w) => w.number === effectiveCycle) : cycle.windows;
  const rangeStart = scopeWins.reduce<string | null>((a, w) => (w.startsAt && (!a || w.startsAt < a) ? w.startsAt : a), null);
  const rangeEnd = scopeWins.reduce<string | null>((a, w) => (w.endsAt && (!a || w.endsAt > a) ? w.endsAt : a), null);

  // ONE wave (changes/236): the live recompute's 5 queries and the 5 header queries below all hit the
  // pooler concurrently — identical rows back, identical math, just no serial stage between them.
  const [reports, [issueRows, prRows, persistedRows, noEvRows, carryRows]] = await Promise.all([
    getEmployeeReports(effectiveCycle),
    Promise.all([
    q<{ status: string | null; cycle_number: number; n: number }>(
      `SELECT status, cycle_number, COUNT(*)::int AS n FROM lab_linear_issues
        WHERE workspace = 'ruh' AND cycle_number IS NOT NULL
          AND cycle_number >= (SELECT MAX(cycle_number) - 2 FROM lab_linear_issues
                               WHERE workspace = 'ruh' AND cycle_number IS NOT NULL)
        GROUP BY status, cycle_number`),
    q<{ merged: number; open: number; matched: number; orphaned: number }>(
      `SELECT COUNT(*) FILTER (WHERE p.merged_at IS NOT NULL)::int AS merged,
              COUNT(*) FILTER (WHERE p.merged_at IS NULL AND p.state = 'open')::int AS open,
              COUNT(*) FILTER (WHERE l.link_status = 'linked' AND p.merged_at IS NOT NULL)::int AS matched,
              COUNT(*) FILTER (WHERE l.link_status <> 'linked' AND p.merged_at IS NOT NULL)::int AS orphaned
         FROM pr_issue_links l JOIN github_prs p ON p.repo = l.repo AND p.pr_number = l.pr_number
        WHERE l.repo = $1
          -- date-bound the header PR stats to the scope (open PRs are current by definition)
          AND (p.merged_at IS NULL OR ($2::timestamptz IS NULL OR p.merged_at BETWEEN $2::timestamptz AND $3::timestamptz))`,
      [REAL_REPO, rangeStart, rangeEnd]),
    q<{ employee_name: string; cycle_number: number; cycle_score_0_100: number | null; output_raw: number | null; quality_factor: number | null; impact_factor: number | null; output_factor: number | null; reach_factor: number | null; score_model_version: string | null }>(
      `SELECT ces.employee_name,
              NULLIF(regexp_replace(pc.cycle_name, '\\D', '', 'g'), '')::int AS cycle_number,
              ces.cycle_score_0_100, ces.output_raw, ces.quality_factor, ces.impact_factor,
              ces.output_factor, ces.reach_factor, ces.score_model_version
         FROM cycle_employee_scores ces
         JOIN performance_cycles pc ON pc.id = ces.cycle_id
        WHERE pc.linear_workspace_key = 'ruh'
        ORDER BY pc.cycle_end DESC`),
    // assigned issues with NO linked merged PR (the "no evidence found" signal), by owner
    q<{ assignee: string | null; cycle_number: number; n: number }>(
      `SELECT i.assignee, i.cycle_number, COUNT(*)::int AS n FROM lab_linear_issues i
        WHERE i.workspace = 'ruh' AND i.cycle_number IS NOT NULL
          AND i.cycle_number >= (SELECT MAX(cycle_number) - 2 FROM lab_linear_issues
                                 WHERE workspace = 'ruh' AND cycle_number IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1 FROM pr_issue_links l JOIN github_prs p ON p.repo = l.repo AND p.pr_number = l.pr_number
             WHERE l.repo = $1 AND l.link_status = 'linked' AND p.merged_at IS NOT NULL
               AND i.issue_key = ANY(l.verified_keys))
        GROUP BY i.assignee, i.cycle_number`, [REAL_REPO]),
    // ongoing work carried from EARLIER cycles (incomplete, per owner) — shown on cards, not scored
    q<{ token: string; issue_key: string; title: string | null; status: string | null; priority: string | null; estimate: number | null; cycle_number: number | null; assigned_at: string | null }>(
      `SELECT lower(assignee) AS token, issue_key, title, status, priority, estimate, cycle_number,
              COALESCE(added_to_cycle_at, started_at, issue_created_at) AS assigned_at
         FROM lab_linear_issues
        WHERE workspace = 'ruh' AND assignee IS NOT NULL
          AND cycle_number IS NOT NULL AND ($1::int IS NULL OR cycle_number < $1::int)
          AND lower(coalesce(status,'')) NOT IN ('done','approved for prod','canceled','cancelled','duplicate')
        ORDER BY cycle_number DESC, issue_key`, [effectiveCycle]),
    ]),
  ]);

  // issue status → planned / in-progress / done / held buckets (scoped)
  const DONE = new Set(["done"]);
  const PLANNED = new Set(["backlog", "todo", "in design"]);
  const HELD = new Set(["on hold", "blocked"]);
  const issueStats = { planned: 0, inProgress: 0, done: 0, held: 0 };
  for (const r of issueRows) {
    if (!inScope(r.cycle_number)) continue;
    const s = (r.status ?? "").trim().toLowerCase();
    if (DONE.has(s)) issueStats.done += Number(r.n);
    else if (PLANNED.has(s)) issueStats.planned += Number(r.n);
    else if (HELD.has(s)) issueStats.held += Number(r.n);
    else issueStats.inProgress += Number(r.n);
  }

  const p = prRows[0] ?? { merged: 0, open: 0, matched: 0, orphaned: 0 };
  const totalLinks = Number(p.matched) + Number(p.orphaned);
  const linkCoveragePct = totalLinks ? Math.round((100 * Number(p.matched)) / totalLinks) : null;

  // no-evidence tally (scoped)
  const noEvByOwner = new Map<string, number>();
  let noEvTotal = 0;
  for (const r of noEvRows) {
    if (!inScope(r.cycle_number)) continue;
    const tok = (r.assignee ?? "unassigned");
    noEvByOwner.set(tok, (noEvByOwner.get(tok) ?? 0) + Number(r.n));
    noEvTotal += Number(r.n);
  }
  const noEvidence = {
    total: noEvTotal,
    byOwner: [...noEvByOwner.entries()].map(([token, n]) => ({ token, n })).sort((a, b) => b.n - a.n),
  };

  // persisted score per (token, cycle) — pick the scoped cycle, else newest
  const persisted = new Map<string, { combined: number | null; output: number | null; qf: number | null; imf: number | null; model: string | null; outputFactor: number | null; reachFactor: number | null }>();
  for (const r of persistedRows) {
    if (effectiveCycle != null && Number(r.cycle_number) !== effectiveCycle) continue;
    if (!persisted.has(r.employee_name)) {
      persisted.set(r.employee_name, {
        combined: num(r.cycle_score_0_100), output: num(r.output_raw),
        qf: num(r.quality_factor), imf: num(r.impact_factor),
        model: r.score_model_version, outputFactor: num(r.output_factor), reachFactor: num(r.reach_factor),
      });
    }
  }

  // ongoing carryover per owner token (shown on cards, not scored)
  const carryByToken = new Map<string, CarryoverIssue[]>();
  for (const r of carryRows) {
    if (!r.token) continue;
    const arr = carryByToken.get(r.token) ?? [];
    arr.push({ issueKey: r.issue_key, title: r.title, status: r.status, priority: r.priority, estimate: num(r.estimate), cycleNumber: r.cycle_number, assignedAt: r.assigned_at });
    carryByToken.set(r.token, arr);
  }

  const cards = new Map<string, PerfCardData>();
  const dist = { strong: 0, mid: 0, behind: 0 };
  let attention = 0;
  let top: { token: string; points: number } | null = null;
  const ownKeysOf = (r: EmployeeReport) => new Set([...r.noProofIssues.map((i) => i.issue_key), ...r.provenIssues.filter((s) => (s.issue.assignee ?? "") === r.employee).map((s) => s.issue.issue_key)]);
  for (const r of reports) {
    const pd = persisted.get(r.employee) ?? { combined: null, output: null, qf: null, imf: null, model: null, outputFactor: null, reachFactor: null };
    // Read the PERSISTED absolute score once score_prs has written it (score_model_version='absolute_v1');
    // until then fall back to the live compute — so this is a no-op until the persist run, and a
    // token-mismatch miss also falls back rather than blanking the score.
    const useDb = pd.model === "absolute_v1" && pd.combined != null;
    const d = r.deviation;   // already cycle-scoped at the source
    const totalPoints = r.totalPoints;
    if (r.counts.evidencePrs > 0) {
      if (r.band === "strong") dist.strong++; else if (r.band === "ok") dist.mid++; else dist.behind++;
      if (!top || totalPoints > top.points) top = { token: r.employee, points: totalPoints };
    }
    const isAttention = !!(d.securityPrs.length || d.mismatchPrs.length || d.noProof || d.offTicket || d.scopePrs.length);
    if (isAttention && r.counts.evidencePrs > 0) attention++;
    const ownKeys = ownKeysOf(r);
    const toRow = (s: EmployeeReport["provenIssues"][number], state: IssueRowLite["state"]): IssueRowLite => ({
      key: s.issue.issue_key, title: s.issue.title, type: s.issue.label, priority: s.issue.priority,
      sp: s.issue.estimate, weight: s.weight, status: s.issue.status, bug: s.bug, points: s.points,
      state, prCount: s.mergedPrs,
      startedAt: s.issue.started_at, completedAt: s.issue.completed_at, addedToCycleAt: s.issue.added_to_cycle_at,
    });
    // Carried-over ongoing work → REGULAR "awaiting" rows in the same table (changes/211): no separate
    // table, no cycle-origin column. They read as normal issues with no evidence found yet.
    const carryRows: IssueRowLite[] = (carryByToken.get(r.employee) ?? []).map((c): IssueRowLite => ({
      key: c.issueKey, title: c.title, type: null, priority: c.priority,
      sp: c.estimate, weight: (c.estimate || 1), status: c.status, bug: 1, points: null,
      state: "awaiting", prCount: 0,
      startedAt: c.assignedAt, completedAt: null, addedToCycleAt: c.assignedAt,
    }));
    // ALL issues in ONE list: own proven → awaiting (current + carried-over) → helped
    const issueRows: IssueRowLite[] = [
      ...r.provenIssues.filter((s) => ownKeys.has(s.issue.issue_key)).map((s) => toRow(s, "proven")),
      ...r.noProofIssues.map((i): IssueRowLite => ({
        key: i.issue_key, title: i.title, type: i.label, priority: i.priority,
        sp: i.estimate, weight: (i.estimate || 1), status: i.status, bug: 1, points: null,
        state: "awaiting", prCount: 0,
        startedAt: i.started_at, completedAt: i.completed_at, addedToCycleAt: i.added_to_cycle_at,
      })),
      ...carryRows,
      ...r.provenIssues.filter((s) => !ownKeys.has(s.issue.issue_key)).map((s) => toRow(s, "helped")),
    ];
    cards.set(r.employee, {
      band: r.band,
      combined: useDb ? pd.combined : r.scoreAbsolute,   // persisted absolute_v1 if written, else live
      output: useDb ? pd.outputFactor : r.output,
      reach: useDb ? pd.reachFactor : r.reach,
      outputRaw: pd.output,
      points: totalPoints, avgQuality: r.avgQuality,
      assigned: r.counts.issues + carryRows.length, proven: r.counts.ownProven, awaiting: r.noProofIssues.length + carryRows.length, helped: r.counts.helped,
      evidencePrs: r.counts.evidencePrs,
      own: d.onTicket.own, other: d.onTicket.other, untracked: d.onTicket.untracked,
      totalM: d.onTicket.total, onPct: d.onTicket.pct,
      unpointed: d.unpointedKeys.length,
      verdict: d.verdict,
      qualityFactor: pd.qf, impactFactor: pd.imf,
      flags: { mismatch: d.mismatchPrs.length, noProof: d.noProof, scope: d.scopePrs.length,
               unpointed: d.unpointedKeys.length, noReviewPct: d.noReviewPct, security: d.securityPrs.length },
      issues: issueRows,
      carryover: carryByToken.get(r.employee) ?? [],
    });
  }

  // Carryforward-only people (changes/233): someone whose work is ALL carried over from earlier cycles
  // has no current-cycle report, so the loop above never carded them — the dashboard used to drop them
  // to all-dashes ("No analyzed work") even though the profile page shows their ongoing issues. Give them
  // a card too: real assigned count + their ongoing issues, score "—" (proof-first — NEVER an invented
  // number; they simply have no merged-PR evidence in this cycle yet). No new query (carryByToken is
  // already loaded), so no added latency.
  for (const [token, items] of carryByToken) {
    if (cards.has(token) || !items.length) continue;
    const issues: IssueRowLite[] = items
      .slice()
      .sort((a, b) => ((a.assignedAt ?? "") < (b.assignedAt ?? "") ? 1 : -1))
      .map((c): IssueRowLite => ({
        key: c.issueKey, title: c.title, type: null, priority: c.priority,
        sp: c.estimate, weight: (c.estimate || 1), status: c.status, bug: 1, points: null,
        state: "awaiting", prCount: 0,
        startedAt: c.assignedAt, completedAt: null, addedToCycleAt: c.assignedAt,
      }));
    cards.set(token, {
      band: "none",
      combined: null, output: null, reach: null, outputRaw: null,
      points: 0, avgQuality: null,
      assigned: items.length, proven: 0, awaiting: items.length, helped: 0,
      evidencePrs: 0, own: 0, other: 0, untracked: 0, totalM: 0, onPct: 0,
      unpointed: 0,
      verdict: "",
      qualityFactor: null, impactFactor: null,
      flags: { mismatch: 0, noProof: 0, scope: 0, unpointed: 0, noReviewPct: 0, security: 0 },
      issues,
      carryover: items,
    });
  }

  return {
    cycle,
    scopedCycle: cycleNum,
    issueStats,
    prStats: { open: Number(p.open), merged: Number(p.merged), matched: Number(p.matched), orphaned: Number(p.orphaned) },
    linkCoveragePct,
    noEvidence,
    distribution: dist,
    topPerformer: top,
    needsAttention: attention,
    cards,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * "What changed since ___" — the day-over-day diff panel (changes/205).
 * Two feeds, both derived from timestamps we already store (no new snapshot table):
 *   • Tickets — issues NEWLY added to the cycle (added_to_cycle_at) + status changes
 *     (issue_status_history), with moves INTO a done-ish status flagged as completed.
 *   • PRs — opened (created_at) or merged (merged_at) since the cutoff, repo-wide,
 *     with a `judged` flag (does an AI assessment exist for its head_sha yet?).
 * Read-only. Tickets are scoped to the given cycle; PRs are repo-level recent activity.
 * ──────────────────────────────────────────────────────────────────────────── */
export type TicketChange = {
  issueKey: string; title: string | null; assignee: string | null;
  kind: "new" | "completed" | "status"; fromStatus: string | null; toStatus: string | null; at: string;
};
export type PrChange = {
  prNumber: number; title: string | null; author: string | null; state: string | null;
  kind: "opened" | "merged"; at: string; linked: string[]; judged: boolean;
};
export type ChangeSummary = { completed: number; statusFlipped: number; newTickets: number; prsMerged: number; prsOpened: number };
export type CycleChanges = { sinceISO: string; cycle: number | null; tickets: TicketChange[]; prs: PrChange[]; summary: ChangeSummary };

const DONE_ISH = new Set(["done", "approved for prod", "ready to deploy- qa", "ready to deploy - qa"]);

export async function getCycleChanges(cycleNum: number | null, sinceISO: string): Promise<CycleChanges> {
  const [newRows, statusRows, prRows] = await Promise.all([
    q<{ issue_key: string; title: string | null; assignee: string | null; at: string }>(
      `SELECT issue_key, title, assignee, added_to_cycle_at AS at
         FROM lab_linear_issues
        WHERE workspace = 'ruh' AND cycle_number = $1 AND added_to_cycle_at >= $2::timestamptz
        ORDER BY added_to_cycle_at DESC`, [cycleNum, sinceISO]),
    q<{ issue_key: string; title: string | null; assignee: string | null; from_status: string | null; to_status: string | null; at: string }>(
      `SELECT h.issue_key, i.title, i.assignee, h.from_status, h.to_status, h.changed_at AS at
         FROM issue_status_history h
         JOIN lab_linear_issues i ON i.issue_key = h.issue_key AND i.workspace = 'ruh'
        WHERE i.cycle_number = $1 AND h.changed_at >= $2::timestamptz
        ORDER BY h.changed_at DESC`, [cycleNum, sinceISO]),
    q<{ pr_number: number; title: string | null; author_login: string | null; state: string | null; created_at: string | null; merged_at: string | null; linked_issue_keys: string[] | null; judged: boolean }>(
      `SELECT p.pr_number, p.title, p.author_login, p.state, p.created_at, p.merged_at, p.linked_issue_keys,
              EXISTS(SELECT 1 FROM agent_assessments a WHERE a.repo = p.repo AND a.head_sha = p.head_sha) AS judged
         FROM github_prs p
        WHERE p.repo = $1 AND (p.created_at >= $2::timestamptz OR p.merged_at >= $2::timestamptz)
        ORDER BY COALESCE(p.merged_at, p.created_at) DESC`, [REAL_REPO, sinceISO]),
  ]);

  const tickets: TicketChange[] = [
    ...newRows.map((r): TicketChange => ({ issueKey: r.issue_key, title: r.title, assignee: r.assignee, kind: "new", fromStatus: null, toStatus: null, at: String(r.at) })),
    ...statusRows.map((r): TicketChange => ({
      issueKey: r.issue_key, title: r.title, assignee: r.assignee,
      kind: DONE_ISH.has((r.to_status ?? "").trim().toLowerCase()) ? "completed" : "status",
      fromStatus: r.from_status, toStatus: r.to_status, at: String(r.at),
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  const prs: PrChange[] = prRows.map((r): PrChange => {
    const merged = r.merged_at != null && String(r.merged_at) >= sinceISO;
    return {
      prNumber: Number(r.pr_number), title: r.title, author: r.author_login, state: r.state,
      kind: merged ? "merged" : "opened", at: String(merged ? r.merged_at : r.created_at),
      linked: r.linked_issue_keys ?? [], judged: !!r.judged,
    };
  });

  const summary: ChangeSummary = {
    completed: tickets.filter((t) => t.kind === "completed").length,
    statusFlipped: tickets.filter((t) => t.kind === "status").length,
    newTickets: tickets.filter((t) => t.kind === "new").length,
    prsMerged: prs.filter((p) => p.kind === "merged").length,
    prsOpened: prs.filter((p) => p.kind === "opened").length,
  };
  return { sinceISO, cycle: cycleNum, tickets, prs, summary };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Snapshot diff (changes/206): compares the two most recent daily snapshots for a cycle to produce
 * the tiles that need a prior-day baseline (priority bumped / SP re-pointed / reassigned) and the
 * per-employee SCORE delta. Returns hasPrior=false until at least 2 daily snapshots exist (the writer
 * seeds one per nightly run), in which case the caller shows a "baseline set — deltas from tomorrow" hint.
 * ──────────────────────────────────────────────────────────────────────────── */
export type ScoreDelta = { employee: string; from: number | null; to: number | null; delta: number };
export type SnapshotDiff = {
  hasPrior: boolean; prevDate: string | null; curDate: string | null;
  priorityBumped: number; spRepointed: number; reassigned: number;
  scoreUp: number; scoreDown: number; deltas: ScoreDelta[];
};
const PRANK: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1, none: 0, "": 0 };
const prank = (p: string | null) => PRANK[(p ?? "").trim().toLowerCase()] ?? 0;

export async function getSnapshotDiff(cycleNum: number | null): Promise<SnapshotDiff> {
  const empty: SnapshotDiff = { hasPrior: false, prevDate: null, curDate: null, priorityBumped: 0, spRepointed: 0, reassigned: 0, scoreUp: 0, scoreDown: 0, deltas: [] };
  if (cycleNum == null) return empty;
  let dates: { d: string }[] = [];
  try {
    dates = await q<{ d: string }>(
      `SELECT DISTINCT snapshot_date::text AS d FROM daily_issue_snapshot
        WHERE workspace = 'ruh' AND cycle_number = $1 ORDER BY d DESC LIMIT 2`, [cycleNum]);
  } catch {
    return empty;  // table may not exist yet in an un-migrated env — degrade quietly
  }
  const curDate = dates[0]?.d ?? null;
  if (dates.length < 2) return { ...empty, curDate };
  const prevDate = dates[1].d;

  const [issRows, scoreRows] = await Promise.all([
    q<{ issue_key: string; snapshot_date: string; priority: string | null; estimate: number | null; assignee: string | null }>(
      `SELECT issue_key, snapshot_date::text AS snapshot_date, priority, estimate, assignee
         FROM daily_issue_snapshot WHERE workspace = 'ruh' AND cycle_number = $1 AND snapshot_date IN ($2,$3)`,
      [cycleNum, curDate, prevDate]),
    q<{ employee_name: string; snapshot_date: string; cycle_score_0_100: number | null }>(
      `SELECT employee_name, snapshot_date::text AS snapshot_date, cycle_score_0_100
         FROM daily_score_snapshot WHERE workspace = 'ruh' AND cycle_number = $1 AND snapshot_date IN ($2,$3)`,
      [cycleNum, curDate, prevDate]),
  ]);

  const curI = new Map(issRows.filter((r) => r.snapshot_date === curDate).map((r) => [r.issue_key, r]));
  const prevI = new Map(issRows.filter((r) => r.snapshot_date === prevDate).map((r) => [r.issue_key, r]));
  let priorityBumped = 0, spRepointed = 0, reassigned = 0;
  for (const [k, cur] of curI) {
    const prev = prevI.get(k);
    if (!prev) continue;
    if (prank(cur.priority) > prank(prev.priority)) priorityBumped++;
    if (Number(cur.estimate ?? -1) !== Number(prev.estimate ?? -1)) spRepointed++;
    if ((cur.assignee ?? "") !== (prev.assignee ?? "")) reassigned++;
  }

  const curS = new Map(scoreRows.filter((r) => r.snapshot_date === curDate).map((r) => [r.employee_name, r.cycle_score_0_100]));
  const prevS = new Map(scoreRows.filter((r) => r.snapshot_date === prevDate).map((r) => [r.employee_name, r.cycle_score_0_100]));
  const deltas: ScoreDelta[] = [];
  for (const [emp, to] of curS) {
    const from = prevS.has(emp) ? prevS.get(emp)! : null;
    const d = Number(to ?? 0) - Number(from ?? 0);
    if (d !== 0) deltas.push({ employee: emp, from: from ?? null, to: to ?? null, delta: d });
  }
  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return {
    hasPrior: true, prevDate, curDate, priorityBumped, spRepointed, reassigned,
    scoreUp: deltas.filter((d) => d.delta > 0).length, scoreDown: deltas.filter((d) => d.delta < 0).length, deltas,
  };
}
