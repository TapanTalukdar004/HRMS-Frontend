/**
 * PM Desk data (changes/235) — the Project-Manager worklist of UNMARKED ongoing issues.
 * "Unmarked" = an issue still in flight whose scoring inputs are missing: no story points (estimate)
 * and/or no priority. These are exactly the issues that under-credit the engineer when they ship
 * (weight = SP × priority — an unpointed issue scores with SP=1, a priorityless one at ×1.0), so the
 * PM fixes them IN LINEAR (we are read-only on Linear; each row deep-links via the issue's stored url).
 *
 * Autonomous by construction: everything is read LIVE from the tables the nightly pipeline
 * (HRBot-NightlyPipeline → run_pipeline) keeps fresh — lab_linear_issues (Linear sync), pr_issue_links +
 * github_prs (scheduler-detected PR activity, across ALL collected repos, not hardcoded to one), and
 * agent_runs (the freshness stamp shown on the page). Nothing is cached or one-time.
 */
import { q } from "./db";
import { REAL_WORKSPACE } from "./realReport";

export type UnmarkedIssue = {
  issueKey: string;
  title: string | null;
  status: string | null;
  label: string | null;
  priority: string | null;      // raw value; null/none = missing
  estimate: number | null;      // story points; null/0 = missing
  cycleNumber: number | null;
  url: string | null;           // Linear deep-link — where the PM actually sets SP/priority
  assignedAt: string | null;
  missingSp: boolean;
  missingPriority: boolean;
  mergedPrs: number;            // scheduler-detected linked PRs (all repos)
  openPrs: number;
  lastPrAt: string | null;
};

export type PmGroup = {
  assignee: string;             // lowercase token ("unassigned" when none)
  issues: UnmarkedIssue[];
  missingSp: number;
  missingPriority: number;
  withPrActivity: number;
};

export type ScoreCorrection = {
  issueKey: string; cycleName: string | null; employee: string | null;
  oldEstimate: number | null; newEstimate: number | null;
  oldPriority: string | null; newPriority: string | null;
  oldScore: number | null; newScore: number | null;
  detectedAt: string;
  kind: "marking" | "late_linkage";   // WHY the frozen cycle re-scored (changes/241)
};

/** Stale floater (changes/238): still "ongoing" by status, but its merged PRs predate the correctable
 *  window (or its cycle is older than previous) — the work happened long ago and the status was never
 *  closed. Surfaced for STATUS CLEANUP in Linear (mark complete/cancel); never re-scored, never counted
 *  in the marking KPIs. */
export type StaleIssue = {
  issueKey: string; title: string | null; status: string | null;
  estimate: number | null; priority: string | null;
  cycleNumber: number | null; url: string | null; assignee: string;
  mergedPrs: number; lastMergedAt: string | null; inCycleAt: string | null;
};

export type PmDeskData = {
  groups: PmGroup[];
  totals: {
    issues: number; missingSp: number; missingPriority: number; missingBoth: number;
    withPrActivity: number; people: number; stale: number;
  };
  freshness: { lastRunAt: string | null; ok: boolean | null };  // latest nightly pipeline run
  corrections: ScoreCorrection[];   // recent auto-applied marking corrections (changes/237)
  stale: StaleIssue[];              // status-cleanup list (changes/238) — shown, never re-scored
  currentCycle: number | null;      // for the "last chance" chip on previous-cycle rows
  prevCycle: number | null;
};

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// Same "still in flight" set the carryover query uses — one definition of ongoing.
const DONE_ISH = "('done','approved for prod','canceled','cancelled','duplicate')";

export async function getPmDeskData(): Promise<PmDeskData> {
  const empty: PmDeskData = {
    groups: [],
    totals: { issues: 0, missingSp: 0, missingPriority: 0, missingBoth: 0, withPrActivity: 0, people: 0, stale: 0 },
    freshness: { lastRunAt: null, ok: null },
    corrections: [],
    stale: [],
    currentCycle: null,
    prevCycle: null,
  };
  try {
    const [rows, runRows, corrRows] = await Promise.all([
      // ONE round-trip: unmarked ongoing issues + their scheduler-detected PR facts (LATERAL keeps the
      // PR aggregation per-issue without a second query; tables are small — hundreds of rows).
      q<{
        issue_key: string; title: string | null; status: string | null; label: string | null;
        priority: string | null; estimate: number | null; cycle_number: number | null; url: string | null;
        assignee: string | null; assigned_at: string | null;
        merged_n: number | null; open_n: number | null; last_pr_at: string | null; last_merged_at: string | null;
        is_stale: boolean; maxc: number | null;
      }>(
        // THE CORRECTABLE WINDOW (changes/238, Tapan's rule) = current + PREVIOUS cycle only. Enforced
        // here in SQL so every scheduler run / page render derives the same picture from the same facts.
        //   · ACTIONABLE  = unmarked (no SP / no priority), cycle ∈ {max, max-1}, PR work (if any) recent
        //                   → the PM marks these in Linear; the scorer can still (re)score them.
        //   · STALE       = still "ongoing" by status but its merged PRs predate the previous cycle's
        //                   start (or its cycle is even older) — regardless of marking. Surfaced for
        //                   STATUS CLEANUP only (close it in Linear); NEVER re-scored.
        // boundary = previous cycle's start (fallback: current start − 7d, else now − 14d).
        `WITH win AS (
           SELECT MAX(cycle_number) AS maxc FROM lab_linear_issues
            WHERE workspace = $1 AND cycle_number IS NOT NULL
         ), b AS (
           SELECT COALESCE(
                    MIN(cycle_started_at) FILTER (WHERE cycle_number = (SELECT maxc FROM win) - 1),
                    MIN(cycle_started_at) FILTER (WHERE cycle_number = (SELECT maxc FROM win)) - interval '7 days',
                    now() - interval '14 days'
                  ) AS boundary
             FROM lab_linear_issues WHERE workspace = $1
         )
         SELECT i.issue_key, i.title, i.status, i.label, i.priority, i.estimate, i.cycle_number, i.url,
                lower(i.assignee) AS assignee,
                COALESCE(i.added_to_cycle_at, i.started_at, i.issue_created_at) AS assigned_at,
                pr.merged_n, pr.open_n, pr.last_pr_at, pr.last_merged_at,
                (i.cycle_number < (SELECT maxc FROM win) - 1
                 OR (COALESCE(pr.merged_n, 0) > 0 AND pr.last_merged_at < (SELECT boundary FROM b))) AS is_stale,
                (SELECT maxc FROM win) AS maxc
           FROM lab_linear_issues i
           LEFT JOIN LATERAL (
             SELECT COUNT(*) FILTER (WHERE p.merged_at IS NOT NULL)::int AS merged_n,
                    COUNT(*) FILTER (WHERE p.merged_at IS NULL AND p.state = 'open')::int AS open_n,
                    MAX(COALESCE(p.merged_at, p.created_at)) AS last_pr_at,
                    MAX(p.merged_at) AS last_merged_at
               FROM pr_issue_links l
               JOIN github_prs p ON p.repo = l.repo AND p.pr_number = l.pr_number
              WHERE l.link_status = 'linked' AND i.issue_key = ANY(l.verified_keys)
           ) pr ON TRUE
          WHERE i.workspace = $1
            AND lower(coalesce(i.status,'')) NOT IN ${DONE_ISH}
            AND i.cycle_number IS NOT NULL
            AND (
              -- stale floaters: surfaced for status cleanup (any marking)
              (i.cycle_number < (SELECT maxc FROM win) - 1
               OR (COALESCE(pr.merged_n, 0) > 0 AND pr.last_merged_at < (SELECT boundary FROM b)))
              OR
              -- actionable: unmarked, inside the correctable window
              (i.cycle_number >= (SELECT maxc FROM win) - 1
               AND (i.estimate IS NULL OR i.estimate = 0
                    OR i.priority IS NULL OR lower(trim(i.priority)) IN ('', 'none', 'no priority')))
            )
          ORDER BY (COALESCE(pr.merged_n,0) + COALESCE(pr.open_n,0)) DESC, assigned_at ASC NULLS LAST`,
        [REAL_WORKSPACE]),
      // Freshness = the nightly pipeline's latest run (proves the page is fed autonomously).
      q<{ finished_at: string | null; ok: boolean | null }>(
        `SELECT finished_at, ok FROM agent_runs
          WHERE kind = 'pipeline' AND finished_at IS NOT NULL
          ORDER BY finished_at DESC LIMIT 1`),
      // Recent auto-applied marking corrections (changes/237) — PM marked late, the nightly scorer
      // re-scored the issue's ORIGINAL (ended) cycle and audited it here.
      q<{ issue_key: string; cycle_name: string | null; employee_name: string | null;
          old_estimate: number | null; new_estimate: number | null;
          old_priority: string | null; new_priority: string | null;
          old_cycle_score: number | null; new_cycle_score: number | null; detected_at: string;
          kind: "marking" | "late_linkage" }>(
        `SELECT issue_key, cycle_name, employee_name, old_estimate, new_estimate,
                old_priority, new_priority, old_cycle_score, new_cycle_score, detected_at,
                COALESCE(kind, 'marking') AS kind
           FROM score_corrections WHERE workspace = $1
          ORDER BY detected_at DESC LIMIT 12`, [REAL_WORKSPACE]),
    ]);

    const byAssignee = new Map<string, UnmarkedIssue[]>();
    const stale: StaleIssue[] = [];
    let missingSp = 0, missingPriority = 0, missingBoth = 0, withPrActivity = 0;
    const maxc = rows[0]?.maxc != null ? Number(rows[0].maxc) : null;
    for (const r of rows) {
      const est = num(r.estimate);
      // Stale floater → the status-cleanup list; NEVER in the marking KPIs or groups (changes/238).
      if (r.is_stale) {
        stale.push({
          issueKey: r.issue_key, title: r.title, status: r.status,
          estimate: est, priority: r.priority,
          cycleNumber: r.cycle_number, url: r.url, assignee: r.assignee || "unassigned",
          mergedPrs: Number(r.merged_n ?? 0), lastMergedAt: r.last_merged_at, inCycleAt: r.assigned_at,
        });
        continue;
      }
      const noSp = est === null || est === 0;
      const noPrio = !r.priority || ["", "none", "no priority"].includes(r.priority.trim().toLowerCase());
      const issue: UnmarkedIssue = {
        issueKey: r.issue_key, title: r.title, status: r.status, label: r.label,
        priority: r.priority, estimate: est, cycleNumber: r.cycle_number, url: r.url,
        assignedAt: r.assigned_at, missingSp: noSp, missingPriority: noPrio,
        mergedPrs: Number(r.merged_n ?? 0), openPrs: Number(r.open_n ?? 0), lastPrAt: r.last_pr_at,
      };
      if (noSp) missingSp++;
      if (noPrio) missingPriority++;
      if (noSp && noPrio) missingBoth++;
      if (issue.mergedPrs + issue.openPrs > 0) withPrActivity++;
      const tok = r.assignee || "unassigned";
      (byAssignee.get(tok) ?? byAssignee.set(tok, []).get(tok)!).push(issue);
    }
    // stale list: most-recently-shipped first (the most obviously "done but floating" on top)
    stale.sort((a, b) => ((a.lastMergedAt ?? "") < (b.lastMergedAt ?? "") ? 1 : -1));

    const groups: PmGroup[] = [...byAssignee.entries()]
      .map(([assignee, issues]) => ({
        assignee, issues,
        missingSp: issues.filter((i) => i.missingSp).length,
        missingPriority: issues.filter((i) => i.missingPriority).length,
        withPrActivity: issues.filter((i) => i.mergedPrs + i.openPrs > 0).length,
      }))
      // people with code already moving first (most urgent to point), then by open count
      .sort((a, b) => b.withPrActivity - a.withPrActivity || b.issues.length - a.issues.length);

    const actionable = rows.length - stale.length;
    return {
      groups,
      totals: {
        issues: actionable, missingSp, missingPriority, missingBoth, withPrActivity,
        people: [...byAssignee.keys()].filter((k) => k !== "unassigned").length,
        stale: stale.length,
      },
      freshness: runRows[0]
        ? { lastRunAt: runRows[0].finished_at, ok: runRows[0].ok }
        : { lastRunAt: null, ok: null },
      corrections: corrRows.map((c) => ({
        issueKey: c.issue_key, cycleName: c.cycle_name, employee: c.employee_name,
        oldEstimate: num(c.old_estimate), newEstimate: num(c.new_estimate),
        oldPriority: c.old_priority, newPriority: c.new_priority,
        oldScore: num(c.old_cycle_score), newScore: num(c.new_cycle_score),
        detectedAt: c.detected_at,
        kind: c.kind,
      })),
      stale,
      currentCycle: maxc,
      prevCycle: maxc != null ? maxc - 1 : null,
    };
  } catch {
    return empty;  // house pattern: a DB blip degrades to an empty desk, never a crashed page
  }
}
