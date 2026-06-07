/**
 * Phase H queries — Esha-driven performance flow.
 *
 * All reads hit the post-refactor tables: performance_cycles,
 * cycle_employee_scores, cycle_escalations, team_project_assignments.
 *
 * Names returned use lowercase keys from Esha; UI is responsible for
 * display capitalisation if desired.
 */
import { q } from "./db";

// ─── Source preference (Esha → Linear migration) ───────────────────────────
//
// We now ingest directly from Linear (source LIKE 'linear%'), which is
// complete + status-accurate.  The legacy Esha snapshots stay in the DB
// for history but are HIDDEN whenever a cycle has Linear data.
//
// This SQL fragment, dropped into a WHERE clause, keeps only the
// preferred source for a (team, cycle_name): Linear rows if any exist,
// otherwise the Esha rows.  It relies on positional params $1 = team and
// $2 = cycle_name being present in the host query.  `source` resolves
// unambiguously (only performance_cycles has that column).
const PREFER_LINEAR_SRC = `AND (
  source LIKE 'linear%'
  OR NOT EXISTS (
    SELECT 1 FROM performance_cycles _pl
    WHERE _pl.team = $1 AND _pl.cycle_name = $2 AND _pl.source LIKE 'linear%'
  )
)`;

// ─── Types ────────────────────────────────────────────────────────────────

export type TeamCard = {
  team: string;
  latest_cycle_name: string;
  latest_cycle_received_at: string;
  latest_cycle_status: string | null;
  latest_days_left: number | null;
  total_cycles: number;
  n_employees: number;
  n_low: number;
  n_mid: number;
  n_high: number;
  active_pm: string | null;
  percent_complete: number | null;
};

export type CycleCard = {
  cycle_id: string;
  cycle_name: string;
  cycle_start: string | null;
  cycle_end: string | null;
  received_at: string;
  processing_status: string | null;
  n_employees: number;
  n_high: number;
  n_mid: number;
  n_low: number;
  team: string | null;
};

export type EmployeeLatestForTeam = {
  employee_name: string;
  employee_id: string | null;
  cycle_name: string;
  snapshot_at: string | null;
  tickets_completed: number | null;
  tickets_total: number | null;
  story_points_completed: number | null;
  story_points_total: number | null;
  raw_score: number | null;
  classification: string | null;
  final_score: number | null;
  finalized_method: string | null;
  project_lead_name: string | null;
};

export type CycleSnapshot = {
  cycle_id: string;
  cycle_name: string;
  received_at: string;
  snapshot_at: string | null;
  employee_name: string;
  tickets_completed: number | null;
  tickets_total: number | null;
  story_points_completed: number | null;
  story_points_total: number | null;
  raw_score: number | null;
  classification: string | null;
};

export type EmployeeTrendPoint = {
  cycle_name: string;
  received_at: string;
  snapshot_at: string;        // Esha's date — preferred for display
  team: string | null;
  tickets_completed: number | null;
  tickets_total: number | null;
  story_points_completed: number | null;
  story_points_total: number | null;
  raw_score: number | null;
  classification: string | null;
  final_score: number | null;
};

// ─── Queries ──────────────────────────────────────────────────────────────

/** All teams with their latest cycle summary + active PM, ordered by activity. */
export async function listTeams(): Promise<TeamCard[]> {
  return await q<TeamCard>(`
    WITH latest_per_team AS (
      SELECT DISTINCT ON (team)
        team,
        id AS latest_cycle_id,
        cycle_name AS latest_cycle_name,
        COALESCE(snapshot_at, received_at) AS latest_cycle_received_at,
        processing_status AS latest_cycle_status,
        n_employees,
        n_high, n_mid, n_low,
        cycle_end,
        parsed_payload
      FROM performance_cycles
      WHERE team IS NOT NULL
      ORDER BY team, COALESCE(snapshot_at, received_at) DESC
    ),
    cycle_counts AS (
      SELECT team, COUNT(*)::int AS total_cycles
      FROM performance_cycles
      WHERE team IS NOT NULL
      GROUP BY team
    ),
    active_pms AS (
      SELECT DISTINCT ON (team_name)
        team_name AS team,
        lead_name_verbatim AS active_pm
      FROM team_project_assignments
      WHERE end_date IS NULL AND scope = 'team_wide'
      ORDER BY team_name, assigned_at DESC
    )
    SELECT
      l.team,
      l.latest_cycle_name,
      l.latest_cycle_received_at::text,
      l.latest_cycle_status,
      NULLIF(l.parsed_payload::jsonb ->> 'days_left', '')::int AS latest_days_left,
      cc.total_cycles,
      l.n_employees,
      l.n_low, l.n_mid, l.n_high,
      ap.active_pm,
      NULLIF(l.parsed_payload::jsonb ->> 'total_percent_complete', '')::int AS percent_complete
    FROM latest_per_team l
    JOIN cycle_counts cc ON cc.team = l.team
    LEFT JOIN active_pms ap ON ap.team = l.team
    ORDER BY l.latest_cycle_received_at DESC
  `);
}

/** All cycles for one team. */
export async function listCyclesForTeam(team: string): Promise<CycleCard[]> {
  return await q<CycleCard>(
    `SELECT
       id AS cycle_id,
       cycle_name,
       cycle_start::text,
       cycle_end::text,
       received_at::text,
       processing_status,
       n_employees, n_high, n_mid, n_low,
       team
     FROM performance_cycles
     WHERE team = $1
     ORDER BY received_at DESC`,
    [team],
  );
}

/** Unique cycle names for a team (one entry per actual cycle, not per snapshot).
 *  Each cycle_name + team can have many performance_cycles rows (= snapshots). */
export type CycleSummary = {
  cycle_name: string;
  cycle_start: string | null;
  cycle_end: string | null;
  n_snapshots: number;
  first_snapshot_at: string;
  latest_snapshot_at: string;
  latest_n_high: number;
  latest_n_mid: number;
  latest_n_low: number;
  latest_n_employees: number;
};

export async function listCycleSummariesForTeam(team: string): Promise<CycleSummary[]> {
  return await q<CycleSummary>(`
    WITH latest_per_cycle AS (
      SELECT DISTINCT ON (cycle_name)
        cycle_name,
        cycle_start, cycle_end,
        COALESCE(snapshot_at, received_at) AS received_at,
        n_employees, n_high, n_mid, n_low
      FROM performance_cycles
      WHERE team = $1
      ORDER BY cycle_name, COALESCE(snapshot_at, received_at) DESC
    ),
    snap_counts AS (
      SELECT
        cycle_name,
        COUNT(*)::int AS n_snapshots,
        MIN(COALESCE(snapshot_at, received_at)) AS first_snapshot_at,
        MAX(COALESCE(snapshot_at, received_at)) AS latest_snapshot_at
      FROM performance_cycles
      WHERE team = $1
      GROUP BY cycle_name
    )
    SELECT
      l.cycle_name,
      l.cycle_start::text,
      l.cycle_end::text,
      sc.n_snapshots,
      sc.first_snapshot_at::text,
      sc.latest_snapshot_at::text,
      l.n_high AS latest_n_high,
      l.n_mid AS latest_n_mid,
      l.n_low AS latest_n_low,
      l.n_employees AS latest_n_employees
    FROM latest_per_cycle l
    JOIN snap_counts sc ON sc.cycle_name = l.cycle_name
    ORDER BY sc.latest_snapshot_at DESC
  `, [team]);
}

/** Every snapshot (= individual performance_cycles row) for a cycle_name + team. */
export type SnapshotRow = {
  cycle_id: string;
  received_at: string;
  snapshot_at: string;             // Esha's date, falls back to received_at
  cycle_start: string | null;      // for cycle-position computation
  cycle_end: string | null;        // for v3 lane classification + position
  n_employees: number;
  n_high: number;
  n_mid: number;
  n_low: number;
  days_left: number | null;
};

export async function listSnapshotsForCycle(team: string, cycleName: string): Promise<SnapshotRow[]> {
  return await q<SnapshotRow>(`
    SELECT
      id AS cycle_id,
      received_at::text,
      COALESCE(snapshot_at, received_at)::text AS snapshot_at,
      cycle_start::text,
      cycle_end::text,
      n_employees, n_high, n_mid, n_low,
      NULLIF(parsed_payload::jsonb ->> 'days_left', '')::int AS days_left
    FROM performance_cycles
    WHERE team = $1 AND cycle_name = $2
    ${PREFER_LINEAR_SRC}
    ORDER BY COALESCE(snapshot_at, received_at) ASC
  `, [team, cycleName]);
}

// ─── v3 per-issue queries (migration 019) ────────────────────────────────

/** One row from cycle_employee_issues, ready to feed into issueScoring.ts.
 *  Names mirror the Python ORM (CycleEmployeeIssue) and Esha v3 payload.
 */
export type CycleIssue = {
  id: string;
  cycle_id: string;
  employee_name: string;
  employee_id: string | null;
  issue_id: string;
  title: string | null;
  issue_type: string | null;
  priority: string | null;
  story_points: number | null;
  status: string | null;
  labels: string[] | null;
  assigned_at: string | null;
  completed_at: string | null;
  snapshot_at: string;
  /** Linear parent.identifier (e.g. "AB-432") for child issues, or null
   *  for top-level.  Populated from cycle_employee_issues.parent_issue_id
   *  once Esha starts sending the field. */
  parent_issue_id?: string | null;
  /** Count of `reopened` events emitted by the verifier for this issue
   *  in this cycle.  >0 means QA caught a bug after completion (under
   *  the >24h heuristic).  Drives the rework penalty + quality badges. */
  reopen_count?: number | null;
};

/** Per-employee completeness flag for one snapshot.
 *  'complete'  → full data received
 *  'truncated' → Esha's JSON was cut off mid-employee; we recovered
 *                whatever survived but should NOT trust the summary
 *  'missing'   → employee was in earlier snapshots but absent today
 */
export type SnapshotCompleteness = {
  cycle_id: string;
  employee_name: string;
  snapshot_at: string;
  status: "complete" | "truncated" | "missing";
  n_issues_received: number;
  n_issues_expected: number | null;
  parser_warning: string | null;
};

/** One employee's full issue history grouped by CYCLE NAME (not by
 *  snapshot).  Each cycle appears ONCE, consolidating every snapshot of
 *  that cycle the employee appeared in.  Per issue we keep both the
 *  LATEST state and the FIRST-seen state so the UI can render a change
 *  report (newly assigned, completed, priority/SP changed, reassigned).
 */
export type EmployeeCycleIssue = CycleIssue & {
  first_seen_at: string;             // first snapshot this employee held it
  first_priority: string | null;
  first_story_points: number | null;
  first_status: string | null;
};

export type EmployeeCycleBucket = {
  cycle_name: string;
  team: string | null;
  cycle_start: string | null;
  cycle_end: string | null;
  snapshot_at: string;               // latest snapshot of this cycle the emp was in
  issues: EmployeeCycleIssue[];
};

export async function getIssuesForEmployeeByCycle(
  employeeName: string,
): Promise<EmployeeCycleBucket[]> {
  // One row per (cycle_name, issue): the LATEST state this employee held
  // it in, plus the FIRST-seen state, plus the cycle's metadata.  Grouping
  // by cycle_name (not the per-snapshot cycle_id) consolidates multiple
  // daily snapshots of the same cycle into a single bucket.
  const rows = await q<EmployeeCycleIssue & {
    cycle_name: string;
    team: string | null;
    cycle_start: string | null;
    cycle_end: string | null;
  }>(
    `
    WITH all_rows AS (
      -- ALL employees (not filtered) — needed to find the global holder.
      SELECT
        pc.cycle_name, pc.team,
        pc.cycle_start, pc.cycle_end,
        COALESCE(pc.snapshot_at, pc.received_at) AS snap,
        cei.*
      FROM cycle_employee_issues cei
      JOIN performance_cycles pc ON pc.id = cei.cycle_id
    ),
    global_holder AS (
      -- Who CURRENTLY holds each (cycle, issue) — the globally-latest row.
      -- If an issue was reassigned, this is the new holder.  If it's just
      -- missing/truncated (no one else has it), this stays the last holder.
      SELECT DISTINCT ON (cycle_name, issue_id)
        cycle_name, issue_id, employee_name AS holder
      FROM all_rows
      ORDER BY cycle_name, issue_id, snap DESC
    ),
    emp_rows AS (
      SELECT * FROM all_rows WHERE employee_name = $1
    ),
    latest AS (
      SELECT DISTINCT ON (cycle_name, issue_id)
        cycle_name, team, cycle_start, cycle_end,
        issue_id, employee_name, employee_id, title, issue_type,
        priority, story_points, status, labels, assigned_at, completed_at,
        snap AS snapshot_at
      FROM emp_rows
      ORDER BY cycle_name, issue_id, snap DESC
    ),
    first_seen AS (
      SELECT DISTINCT ON (cycle_name, issue_id)
        cycle_name, issue_id,
        snap        AS first_seen_at,
        priority    AS first_priority,
        story_points AS first_story_points,
        status      AS first_status
      FROM emp_rows
      ORDER BY cycle_name, issue_id, snap ASC
    ),
    cycle_latest_snap AS (
      SELECT cycle_name, MAX(snap) AS latest_snap
      FROM emp_rows GROUP BY cycle_name
    )
    SELECT
      l.cycle_name, l.team,
      l.cycle_start::text, l.cycle_end::text,
      cls.latest_snap::text AS snapshot_at,
      '' AS id, ''::text AS cycle_id,
      l.employee_name, l.employee_id::text AS employee_id,
      l.issue_id, l.title, l.issue_type, l.priority, l.story_points,
      l.status, l.labels,
      l.assigned_at::text, l.completed_at::text,
      f.first_seen_at::text, f.first_priority, f.first_story_points, f.first_status
    FROM latest l
    JOIN first_seen f ON f.cycle_name = l.cycle_name AND f.issue_id = l.issue_id
    JOIN cycle_latest_snap cls ON cls.cycle_name = l.cycle_name
    JOIN global_holder g ON g.cycle_name = l.cycle_name AND g.issue_id = l.issue_id
    -- Keep the issue under this person ONLY if they're still the current
    -- global holder.  Truncated (forgotten) issues → still theirs.
    -- Reassigned-away issues → now belong to someone else, excluded here.
    WHERE g.holder = $1
    ORDER BY cls.latest_snap DESC, l.priority NULLS LAST, l.issue_id
    `,
    [employeeName],
  );
  if (rows.length === 0) return [];

  // Group into one bucket per cycle_name, preserving the DESC snapshot order.
  const order: string[] = [];
  const byCycle: Record<string, EmployeeCycleBucket> = {};
  for (const r of rows) {
    if (!byCycle[r.cycle_name]) {
      order.push(r.cycle_name);
      byCycle[r.cycle_name] = {
        cycle_name: r.cycle_name,
        team: r.team,
        cycle_start: r.cycle_start,
        cycle_end: r.cycle_end,
        snapshot_at: r.snapshot_at,
        issues: [],
      };
    }
    byCycle[r.cycle_name].issues.push(r);
  }
  return order.map(name => byCycle[name]);
}

/** Cross-snapshot, REASSIGNMENT-AWARE view of a cycle's issues.
 *
 *  Two problems this solves at once:
 *
 *  (A) Esha drops people once they have no active work — an engineer
 *      who finished early (e.g. nikhil) disappears from later snapshots.
 *      We want them visible all cycle long with their last-known state.
 *
 *  (B) Issues can be REASSIGNED from one engineer to another mid-cycle.
 *      Esha sends the same issue under a new employee_name; the
 *      `assigned_at` Esha sends is the issue's ORIGINAL creation date,
 *      not when the new assignee actually got it.  Naively keeping
 *      rows under both employees would double-count the work.
 *
 *  How we handle it:
 *    1. Each issue gets ONE current assignee — whoever has the most
 *       recent snapshot row.
 *    2. We compute `effective_assigned_at` = the snapshot_at when the
 *       CURRENT assignee FIRST appeared as holder of this issue.
 *       That's the date used for Schedule-fit lane classification.
 *    3. If a previous assignee existed, we record `reassigned_from`
 *       (their name) and `reassigned_at` (= effective_assigned_at).
 *    4. We separately track `reassignedAwayCount` per employee — how
 *       many issues they were the FIRST holder of but no longer have.
 *       This is a soft HR signal, never affects score.
 */
export type CycleIssueWithReassignment = CycleIssue & {
  effective_assigned_at: string;        // when current assignee got it
  reassigned_from: string | null;       // previous holder, if any
  reassigned_at: string | null;         // when reassignment happened
};

/** Cross-CYCLE lineage: for each issue in the given cycle, find whether
 *  it also appeared in an EARLIER cycle (different cycle_name, earlier
 *  dates) and who held it then.  Lets the dashboard flag:
 *    • carried over   — same person held it last cycle too
 *    • reassigned     — a DIFFERENT person held it in the prior cycle
 *  This is the "is this person inheriting / losing work across cycles"
 *  signal HR asked for.  One cheap query per cycle-page load.
 */
export type PriorCycleAppearance = {
  issue_id: string;
  prior_employee: string;
  prior_cycle: string;
  prior_snapshot_at: string;
};

export async function getCrossCyclePriorAppearance(
  team: string,
  cycleName: string,
): Promise<Record<string, PriorCycleAppearance>> {
  const rows = await q<PriorCycleAppearance>(
    `
    WITH cur_cycle_start AS (
      SELECT MIN(COALESCE(snapshot_at, received_at)) AS snap
      FROM performance_cycles WHERE team = $1 AND cycle_name = $2
    ),
    cur_issues AS (
      SELECT DISTINCT cei.issue_id
      FROM cycle_employee_issues cei
      JOIN performance_cycles pc ON pc.id = cei.cycle_id
      WHERE pc.team = $1 AND pc.cycle_name = $2
        AND (
          pc.source LIKE 'linear%'
          OR NOT EXISTS (
            SELECT 1 FROM performance_cycles _pl
            WHERE _pl.team = $1 AND _pl.cycle_name = $2 AND _pl.source LIKE 'linear%'
          )
        )
    ),
    prior AS (
      SELECT DISTINCT ON (cei.issue_id)
        cei.issue_id,
        cei.employee_name              AS prior_employee,
        pc.cycle_name                  AS prior_cycle,
        COALESCE(pc.snapshot_at, pc.received_at)::text AS prior_snapshot_at
      FROM cycle_employee_issues cei
      JOIN performance_cycles pc ON pc.id = cei.cycle_id
      WHERE cei.issue_id IN (SELECT issue_id FROM cur_issues)
        AND pc.team = $1
        AND pc.cycle_name <> $2
        AND COALESCE(pc.snapshot_at, pc.received_at) < (SELECT snap FROM cur_cycle_start)
      ORDER BY cei.issue_id, COALESCE(pc.snapshot_at, pc.received_at) DESC
    )
    SELECT issue_id, prior_employee, prior_cycle, prior_snapshot_at FROM prior
    `,
    [team, cycleName],
  );
  const byId: Record<string, PriorCycleAppearance> = {};
  for (const r of rows) byId[r.issue_id] = r;
  return byId;
}


export type CycleCrossSnapshotResult = {
  /** Issues grouped by their CURRENT assignee.  Each issue appears
   *  exactly once (under whoever holds it now). */
  issuesByEmployee: Record<string, CycleIssueWithReassignment[]>;
  /** snapshot_at (ISO) of each employee's most-recent appearance. */
  lastSeenByEmployee: Record<string, string>;
  /** Names that appear in the CURRENT (selected) snapshot.  Used to
   *  visually distinguish "fresh data today" vs "carried over". */
  currentEmployeeNames: string[];
  /** Soft HR signal: per-employee count of issues that USED to be
   *  theirs but are now assigned elsewhere.  Never affects score. */
  reassignedAwayCount: Record<string, number>;
};

export async function getCycleIssuesAcrossSnapshots(
  team: string,
  cycleName: string,
  currentCycleId: string,
  asOfSnapshotAt: string,
): Promise<CycleCrossSnapshotResult> {
  // "As-of" semantics: only consider snapshots up to and including the
  // SELECTED one (asOfSnapshotAt).  This makes the per-issue view reflect
  // the state ON the date the user picked in the snapshot date picker —
  // not the latest-ever state.  Viewing May 26 shows each issue's May 26
  // state; viewing May 27 shows May 27 state.
  const rows = await q<{
    issue_id: string;
    employee_name: string;
    employee_id: string | null;
    title: string | null;
    issue_type: string | null;
    priority: string | null;
    story_points: number | null;
    status: string | null;
    labels: string[] | null;
    parent_issue_id: string | null;
    esha_assigned_at: string | null;
    completed_at: string | null;
    latest_snapshot_at: string;
    first_seen_at: string;            // when THIS assignee first held this issue
    cycle_id: string;
    assignee_rank: number;            // 1 = current, 2 = previous, 3 = older
    reopen_count: number;             // from issue_quality view
  }>(
    `
    WITH cycle_snapshots AS (
      SELECT id, COALESCE(snapshot_at, received_at) AS snap
      FROM performance_cycles
      WHERE team = $1 AND cycle_name = $2
        AND COALESCE(snapshot_at, received_at) <= $3::timestamptz
        ${PREFER_LINEAR_SRC}
    ),
    all_rows AS (
      SELECT cei.*
      FROM cycle_employee_issues cei
      JOIN cycle_snapshots cs ON cs.id = cei.cycle_id
    ),
    -- Latest row per (issue, assignee): the most recent state of this
    -- issue while this person was holding it.  DISTINCT ON keeps the
    -- whole row, including TEXT[] labels (which ARRAY_AGG cannot).
    per_assignee_latest AS (
      SELECT DISTINCT ON (issue_id, employee_name)
        issue_id, employee_name, employee_id, title, issue_type,
        priority, story_points, status, labels, parent_issue_id,
        assigned_at, completed_at, snapshot_at, cycle_id
      FROM all_rows
      ORDER BY issue_id, employee_name, snapshot_at DESC
    ),
    -- First snapshot_at where this person held this issue.
    per_assignee_first AS (
      SELECT issue_id, employee_name, MIN(snapshot_at) AS first_seen_at
      FROM all_rows
      GROUP BY issue_id, employee_name
    ),
    -- Total reopens this issue has accumulated ACROSS this cycle's
    -- snapshots (sum across snapshot rows so date-rewind still shows
    -- the quality history that landed on/before the chosen date).
    quality_by_issue AS (
      SELECT
        iq.issue_id,
        SUM(iq.reopen_count)::int AS reopen_count
      FROM issue_quality iq
      JOIN cycle_snapshots cs ON cs.id = iq.cycle_id
      GROUP BY iq.issue_id
    ),
    -- Rank assignees within an issue by recency of LAST appearance.
    -- Rank 1 = current holder, 2 = previous, etc.
    ranked AS (
      SELECT
        l.issue_id, l.employee_name, l.employee_id::text AS employee_id,
        l.title, l.issue_type, l.priority, l.story_points,
        l.status, l.labels, l.parent_issue_id,
        l.assigned_at::text AS esha_assigned_at,
        l.completed_at::text AS completed_at,
        l.snapshot_at::text  AS latest_snapshot_at,
        f.first_seen_at::text,
        l.cycle_id,
        ROW_NUMBER() OVER (
          PARTITION BY l.issue_id ORDER BY l.snapshot_at DESC
        )::int AS assignee_rank,
        COALESCE(qbi.reopen_count, 0)::int AS reopen_count
      FROM per_assignee_latest l
      JOIN per_assignee_first f
        ON f.issue_id = l.issue_id AND f.employee_name = l.employee_name
      LEFT JOIN quality_by_issue qbi ON qbi.issue_id = l.issue_id
    )
    SELECT * FROM ranked
    ORDER BY issue_id, assignee_rank
    `,
    [team, cycleName, asOfSnapshotAt],
  );

  // Build maps: current assignee per issue, previous assignee per issue.
  const currentByIssue: Record<string, typeof rows[number]> = {};
  const previousByIssue: Record<string, typeof rows[number]> = {};
  const firstHolderByIssue: Record<string, string> = {};
  for (const r of rows) {
    if (r.assignee_rank === 1) currentByIssue[r.issue_id] = r;
    if (r.assignee_rank === 2) previousByIssue[r.issue_id] = r;
    // Track first-ever holder so we can count reassigned-away per person
    const prev = firstHolderByIssue[r.issue_id];
    if (!prev) firstHolderByIssue[r.issue_id] = r.employee_name;
    // We rely on ROW_NUMBER ordering DESC, so the LAST entry per issue
    // is the FIRST holder.  Overwrite blindly — the loop ends on the
    // oldest assignee.
    firstHolderByIssue[r.issue_id] = r.employee_name;
  }

  // Compose the public result.
  const issuesByEmployee: Record<string, CycleIssueWithReassignment[]> = {};
  const lastSeenByEmployee: Record<string, string> = {};
  for (const issueId of Object.keys(currentByIssue)) {
    const cur = currentByIssue[issueId];
    const prev = previousByIssue[issueId];
    // Effective assigned date for the CURRENT holder:
    //   • No reassignment → use Esha's assigned_at (issue's original).
    //   • Reassignment    → use first_seen_at (when this person got it).
    const effectiveAssigned = prev
      ? cur.first_seen_at
      : (cur.esha_assigned_at ?? cur.first_seen_at);
    const item: CycleIssueWithReassignment = {
      id: "",  // not surfaced
      cycle_id: cur.cycle_id,
      employee_name: cur.employee_name,
      employee_id: cur.employee_id,
      issue_id: cur.issue_id,
      title: cur.title,
      issue_type: cur.issue_type,
      priority: cur.priority,
      story_points: cur.story_points,
      status: cur.status,
      labels: cur.labels,
      assigned_at: cur.esha_assigned_at,
      completed_at: cur.completed_at,
      snapshot_at: cur.latest_snapshot_at,
      parent_issue_id: cur.parent_issue_id,
      reopen_count: cur.reopen_count ?? 0,
      effective_assigned_at: effectiveAssigned,
      reassigned_from: prev ? prev.employee_name : null,
      reassigned_at:   prev ? cur.first_seen_at  : null,
    };
    (issuesByEmployee[cur.employee_name] ??= []).push(item);
    const prevSeen = lastSeenByEmployee[cur.employee_name];
    if (!prevSeen || cur.latest_snapshot_at > prevSeen) {
      lastSeenByEmployee[cur.employee_name] = cur.latest_snapshot_at;
    }
  }

  // Reassigned-away count per employee (soft HR signal).
  // An employee was a "first holder" of an issue but no longer is.
  const reassignedAwayCount: Record<string, number> = {};
  for (const issueId of Object.keys(firstHolderByIssue)) {
    const firstHolder = firstHolderByIssue[issueId];
    const currentHolder = currentByIssue[issueId]?.employee_name;
    if (currentHolder && firstHolder !== currentHolder) {
      reassignedAwayCount[firstHolder] = (reassignedAwayCount[firstHolder] ?? 0) + 1;
    }
  }

  // Who's in the CURRENT snapshot's payload (not carried over)?
  const currentRows = await q<{ employee_name: string }>(
    `SELECT DISTINCT employee_name FROM cycle_employee_issues WHERE cycle_id = $1`,
    [currentCycleId],
  );
  const currentEmployeeNames = currentRows.map(r => r.employee_name);

  return { issuesByEmployee, lastSeenByEmployee, currentEmployeeNames, reassignedAwayCount };
}


/** For the SELECTED snapshot date, return how the cycle differs from the
 *  snapshot immediately BEFORE it.  Drives the "what changed since
 *  previous snapshot" card + the per-row "↑ from X" indicators.
 *
 *  Scoping: both sides are computed STRICTLY WITHIN this (team, cycle_name)
 *  — cur/prv pull only from snapshots in the page's own cycle, so an
 *  issue that's no longer in the cycle (descoped / reassigned away)
 *  shows up as a true "dropped" — not silently "unchanged" because the
 *  most recent global appearance happens to be from a different cycle.
 *
 *  Three buckets returned together so callers can render one card:
 *    • changes        — issues present in both snapshots, with at least
 *                       one of (priority / SP / status / assignee) different
 *    • newIssueIds    — issues present in cur but absent from prv (added today)
 *    • droppedIssueIds — issues present in prv but absent from cur (descoped /
 *                       reassigned to someone outside this cycle / silent drop)
 *
 *  `prevSnapshotAt` is the boundary date.  It's null when the SELECTED
 *  snapshot is the FIRST of the cycle (Day 1) — the UI can use this to
 *  display "no previous snapshot to compare against yet" instead of the
 *  diff card.
 */
export type PreviousIssueState = {
  issue_id: string;
  prev_priority: string | null;
  prev_story_points: number | null;
  prev_status: string | null;
  prev_employee_name: string;
  prev_snapshot_at: string;   // the boundary date the "previous" state is as-of
};

export type CyclePreviousChanges = {
  changes: Record<string, PreviousIssueState>;
  newIssueIds: string[];
  droppedIssueIds: string[];
  prevSnapshotAt: string | null;   // null when there's no earlier snap in this cycle
};

export async function getCyclePreviousSnapshotChanges(
  team: string,
  cycleName: string,
  asOfSnapshotAt: string,
): Promise<CyclePreviousChanges> {
  // First: resolve cycle_ids in this (team, cycle_name) and the prev-boundary
  // snapshot.  Doing it in one round-trip keeps the page fast.
  const meta = await q<{
    sel_cycle_ids: string[];
    prev_cycle_ids: string[] | null;
    prev_snap: string | null;
  }>(
    `
    WITH cs AS (
      SELECT id, COALESCE(snapshot_at, received_at) AS snap
      FROM performance_cycles
      WHERE team = $1 AND cycle_name = $2
        ${PREFER_LINEAR_SRC}
    ),
    sel AS (SELECT $3::timestamptz AS snap),
    sel_cycles AS (
      SELECT id FROM cs WHERE snap <= (SELECT snap FROM sel)
    ),
    prev_boundary AS (
      SELECT MAX(snap) AS snap FROM cs WHERE snap < (SELECT snap FROM sel)
    ),
    prev_cycles AS (
      SELECT id FROM cs WHERE snap <= (SELECT snap FROM prev_boundary)
    )
    SELECT
      ARRAY(SELECT id FROM sel_cycles)                    AS sel_cycle_ids,
      NULLIF(ARRAY(SELECT id FROM prev_cycles), '{}')     AS prev_cycle_ids,
      (SELECT snap FROM prev_boundary)::text              AS prev_snap
    `,
    [team, cycleName, asOfSnapshotAt],
  );

  const { sel_cycle_ids, prev_cycle_ids, prev_snap } = meta[0] ?? {
    sel_cycle_ids: [],
    prev_cycle_ids: null,
    prev_snap: null,
  };

  // Day 1 of a brand new cycle has no prev snapshot — return empty
  // buckets so the UI can show a "Day 1 — nothing to diff yet" message.
  if (!prev_cycle_ids || prev_cycle_ids.length === 0 || !prev_snap) {
    return {
      changes: {},
      newIssueIds: [],
      droppedIssueIds: [],
      prevSnapshotAt: null,
    };
  }

  // Second query: build cur + prv strictly within this cycle, then
  // compute the three buckets (changed / new / dropped).
  const rows = await q<{
    issue_id: string;
    bucket: "changed" | "new" | "dropped";
    prev_priority: string | null;
    prev_story_points: number | null;
    prev_status: string | null;
    prev_employee_name: string | null;
  }>(
    `
    WITH cur AS (
      SELECT DISTINCT ON (cei.issue_id)
        cei.issue_id, cei.employee_name, cei.priority,
        cei.story_points, cei.status, cei.snapshot_at
      FROM cycle_employee_issues cei
      WHERE cei.cycle_id = ANY($1::varchar[])
      ORDER BY cei.issue_id, cei.snapshot_at DESC
    ),
    prv AS (
      SELECT DISTINCT ON (cei.issue_id)
        cei.issue_id, cei.employee_name, cei.priority,
        cei.story_points, cei.status, cei.snapshot_at
      FROM cycle_employee_issues cei
      WHERE cei.cycle_id = ANY($2::varchar[])
      ORDER BY cei.issue_id, cei.snapshot_at DESC
    )
    -- Changed: in BOTH snapshots, with at least one field different.
    SELECT
      cur.issue_id,
      'changed'::text AS bucket,
      prv.priority         AS prev_priority,
      prv.story_points     AS prev_story_points,
      prv.status           AS prev_status,
      prv.employee_name    AS prev_employee_name
    FROM cur
    JOIN prv ON prv.issue_id = cur.issue_id
    WHERE
         COALESCE(cur.priority, '')                 IS DISTINCT FROM COALESCE(prv.priority, '')
      OR COALESCE(cur.story_points::text, '')       IS DISTINCT FROM COALESCE(prv.story_points::text, '')
      OR COALESCE(cur.status, '')                   IS DISTINCT FROM COALESCE(prv.status, '')
      OR cur.employee_name                          IS DISTINCT FROM prv.employee_name

    UNION ALL

    -- Added: in cur but not in prv.
    SELECT
      cur.issue_id,
      'new'::text,
      NULL, NULL, NULL, NULL
    FROM cur
    WHERE cur.issue_id NOT IN (SELECT issue_id FROM prv)

    UNION ALL

    -- Dropped: in prv but not in cur.
    SELECT
      prv.issue_id,
      'dropped'::text,
      prv.priority, prv.story_points, prv.status, prv.employee_name
    FROM prv
    WHERE prv.issue_id NOT IN (SELECT issue_id FROM cur)
    `,
    [sel_cycle_ids, prev_cycle_ids],
  );

  const changes: Record<string, PreviousIssueState> = {};
  const newIssueIds: string[] = [];
  const droppedIssueIds: string[] = [];
  for (const r of rows) {
    if (r.bucket === "changed") {
      changes[r.issue_id] = {
        issue_id: r.issue_id,
        prev_priority: r.prev_priority,
        prev_story_points: r.prev_story_points,
        prev_status: r.prev_status,
        prev_employee_name: r.prev_employee_name ?? "",
        prev_snapshot_at: prev_snap,
      };
    } else if (r.bucket === "new") {
      newIssueIds.push(r.issue_id);
    } else {
      droppedIssueIds.push(r.issue_id);
    }
  }

  return {
    changes,
    newIssueIds,
    droppedIssueIds,
    prevSnapshotAt: prev_snap,
  };
}


/** All issues in a cycle, grouped by employee.
 *  Use this in the cycle page to render per-issue tables.
 *  Only returns rows from the LATEST snapshot for each issue
 *  (issues persist across snapshots; we want the current state).
 */
export async function getCycleIssuesByEmployee(
  cycleId: string,
): Promise<Record<string, CycleIssue[]>> {
  const rows = await q<CycleIssue>(
    `
    WITH latest AS (
      SELECT DISTINCT ON (cycle_id, employee_name, issue_id)
        id, cycle_id, employee_name, employee_id, issue_id, title,
        issue_type, priority, story_points, status, labels,
        assigned_at, completed_at, snapshot_at
      FROM cycle_employee_issues
      WHERE cycle_id = $1
      ORDER BY cycle_id, employee_name, issue_id, snapshot_at DESC
    )
    SELECT * FROM latest
    ORDER BY employee_name, priority NULLS LAST, issue_id
    `,
    [cycleId],
  );
  const byEmp: Record<string, CycleIssue[]> = {};
  for (const r of rows) {
    if (!byEmp[r.employee_name]) byEmp[r.employee_name] = [];
    byEmp[r.employee_name].push(r);
  }
  return byEmp;
}

/** Per-employee completeness for the LATEST snapshot of a cycle.
 *  Returns one row per employee.  Use this to show ⚠️ truncation badges
 *  on the cycle page.
 */
export async function getCycleCompleteness(
  cycleId: string,
): Promise<Record<string, SnapshotCompleteness>> {
  const rows = await q<SnapshotCompleteness>(
    `
    SELECT DISTINCT ON (cycle_id, employee_name)
      cycle_id, employee_name, snapshot_at, status,
      n_issues_received, n_issues_expected, parser_warning
    FROM cycle_snapshot_completeness
    WHERE cycle_id = $1
    ORDER BY cycle_id, employee_name, snapshot_at DESC
    `,
    [cycleId],
  );
  const byEmp: Record<string, SnapshotCompleteness> = {};
  for (const r of rows) {
    byEmp[r.employee_name] = r;
  }
  return byEmp;
}

/** Snapshot detail — employee rows as of one specific performance_cycles row. */
export type SnapshotEmployee = {
  employee_name: string;
  tickets_completed: number | null;
  tickets_total: number | null;
  story_points_completed: number | null;
  story_points_total: number | null;
  classification: string | null;
  raw_score: number | null;
};

export async function getSnapshotEmployees(cycleId: string): Promise<SnapshotEmployee[]> {
  return await q<SnapshotEmployee>(`
    SELECT
      employee_name,
      tickets_completed,
      tickets_total,
      story_points_completed,
      story_points_total,
      classification,
      raw_score
    FROM cycle_employee_scores
    WHERE cycle_id = $1
    ORDER BY employee_name
  `, [cycleId]);
}

/** Employees in a snapshot + per-row deltas vs the previous snapshot
 *  (same team + cycle_name, one position earlier in time). */
export type SnapshotEmployeeWithDelta = SnapshotEmployee & {
  tickets_added: number;
  sp_added: number;
  tickets_done_delta: number;
};

export async function getSnapshotEmployeesWithDelta(cycleId: string): Promise<SnapshotEmployeeWithDelta[]> {
  // 1. Fetch metadata for THIS snapshot
  const meta = await q<{ cycle_name: string; team: string | null; snapshot_at: string }>(
    `SELECT cycle_name, team,
            COALESCE(snapshot_at, received_at)::text AS snapshot_at
       FROM performance_cycles WHERE id = $1`,
    [cycleId],
  );
  if (meta.length === 0) return [];
  const { cycle_name, team, snapshot_at } = meta[0];

  // 2. Find the PREVIOUS snapshot (same team + cycle_name, strictly earlier time)
  const prevMeta = await q<{ id: string }>(
    `SELECT id FROM performance_cycles
      WHERE cycle_name = $1
        AND (team IS NOT DISTINCT FROM $2)
        AND COALESCE(snapshot_at, received_at) < $3::timestamp
      ORDER BY COALESCE(snapshot_at, received_at) DESC
      LIMIT 1`,
    [cycle_name, team, snapshot_at],
  );

  // 3. Fetch employees for current snapshot
  const curr = await getSnapshotEmployees(cycleId);
  if (prevMeta.length === 0) {
    // No previous — deltas are 0 (first snapshot)
    return curr.map((e) => ({
      ...e,
      tickets_added: 0,
      sp_added: 0,
      tickets_done_delta: 0,
    }));
  }

  // 4. Fetch employees for previous snapshot
  const prev = await getSnapshotEmployees(prevMeta[0].id);
  const prevByName = new Map(prev.map((e) => [e.employee_name.toLowerCase(), e]));

  return curr.map((e) => {
    const p = prevByName.get(e.employee_name.toLowerCase());
    return {
      ...e,
      tickets_added: p ? (e.tickets_total ?? 0) - (p.tickets_total ?? 0) : 0,
      sp_added: p ? (e.story_points_total ?? 0) - (p.story_points_total ?? 0) : 0,
      tickets_done_delta: p ? (e.tickets_completed ?? 0) - (p.tickets_completed ?? 0) : 0,
    };
  });
}

/** Latest score row per employee for a team (across all cycles).
 *  Useful for the team detail "current state" table. */
export async function getEmployeesLatestForTeam(team: string): Promise<EmployeeLatestForTeam[]> {
  return await q<EmployeeLatestForTeam>(
    `SELECT DISTINCT ON (ces.employee_name)
       ces.employee_name,
       ces.employee_id,
       pc.cycle_name,
       ces.snapshot_at::text,
       ces.tickets_completed,
       ces.tickets_total,
       ces.story_points_completed,
       ces.story_points_total,
       ces.raw_score,
       ces.classification,
       ces.final_score,
       ces.finalized_method,
       ces.project_lead_name
     FROM cycle_employee_scores ces
     JOIN performance_cycles pc ON pc.id = ces.cycle_id
     WHERE pc.team = $1
     ORDER BY ces.employee_name, ces.snapshot_at DESC NULLS LAST, pc.received_at DESC`,
    [team],
  );
}

/** All snapshots for a specific cycle id (day-wise data for charts).
 *  Matches every cycle row with the same cycle_name + team for trend across snapshots. */
export async function getCycleSnapshots(cycleId: string): Promise<CycleSnapshot[]> {
  // First look up cycle_name + team, then pull every snapshot with the same identity
  const meta = await q<{ cycle_name: string; team: string | null }>(
    `SELECT cycle_name, team FROM performance_cycles WHERE id = $1`,
    [cycleId],
  );
  if (meta.length === 0) return [];
  const { cycle_name, team } = meta[0];
  return await q<CycleSnapshot>(
    `SELECT
       pc.id AS cycle_id,
       pc.cycle_name,
       pc.received_at::text,
       ces.snapshot_at::text,
       ces.employee_name,
       ces.tickets_completed,
       ces.tickets_total,
       ces.story_points_completed,
       ces.story_points_total,
       ces.raw_score,
       ces.classification
     FROM cycle_employee_scores ces
     JOIN performance_cycles pc ON pc.id = ces.cycle_id
     WHERE pc.cycle_name = $1
       AND (pc.team IS NOT DISTINCT FROM $2)
     ORDER BY pc.received_at, ces.employee_name`,
    [cycle_name, team],
  );
}

/** One cycle's metadata. */
export async function getCycle(cycleId: string): Promise<CycleCard | null> {
  const rows = await q<CycleCard>(
    `SELECT
       id AS cycle_id, cycle_name,
       cycle_start::text, cycle_end::text,
       received_at::text, processing_status,
       n_employees, n_high, n_mid, n_low, team
     FROM performance_cycles WHERE id = $1`,
    [cycleId],
  );
  return rows[0] || null;
}

/** Per-employee trend across all cycles they appear in. */
export async function getEmployeeTrend(employeeName: string): Promise<EmployeeTrendPoint[]> {
  return await q<EmployeeTrendPoint>(
    `SELECT
       pc.cycle_name,
       pc.received_at::text,
       COALESCE(pc.snapshot_at, pc.received_at)::text AS snapshot_at,
       pc.team,
       ces.tickets_completed,
       ces.tickets_total,
       ces.story_points_completed,
       ces.story_points_total,
       ces.raw_score,
       ces.classification,
       ces.final_score
     FROM cycle_employee_scores ces
     JOIN performance_cycles pc ON pc.id = ces.cycle_id
     WHERE LOWER(ces.employee_name) = LOWER($1)
     ORDER BY COALESCE(pc.snapshot_at, pc.received_at)`,
    [employeeName],
  );
}

/** Gap-filled day-by-day trend for the graph.
 *
 *  Problem: getEmployeeTrend only returns days the employee actually
 *  appeared in an Esha snapshot.  If Esha dropped them on a given day
 *  (because they finished early or briefly had no active work), that
 *  day has no point — the graph skips it (e.g. shivam's May 26 missing).
 *
 *  This version returns a point for EVERY snapshot date of every cycle
 *  the employee participated in, carrying forward their last-known state
 *  WITHIN that cycle on days they were absent.  Cross-cycle carry-forward
 *  is intentionally NOT done (a Cycle 5 value never bleeds into Cycle 6).
 */
export async function getEmployeeTrendFilled(employeeName: string): Promise<EmployeeTrendPoint[]> {
  return await q<EmployeeTrendPoint>(
    `
    WITH emp_cycles AS (
      SELECT DISTINCT pc.cycle_name, pc.team
      FROM cycle_employee_scores ces
      JOIN performance_cycles pc ON pc.id = ces.cycle_id
      WHERE LOWER(ces.employee_name) = LOWER($1)
    ),
    cycle_snaps AS (
      SELECT pc.cycle_name, pc.team,
             COALESCE(pc.snapshot_at, pc.received_at) AS snap
      FROM performance_cycles pc
      JOIN emp_cycles ec
        ON ec.cycle_name = pc.cycle_name
       AND COALESCE(ec.team, '') = COALESCE(pc.team, '')
    ),
    emp_scores AS (
      SELECT pc.cycle_name,
             COALESCE(pc.snapshot_at, pc.received_at) AS snap,
             ces.tickets_completed, ces.tickets_total,
             ces.story_points_completed, ces.story_points_total,
             ces.raw_score, ces.classification, ces.final_score
      FROM cycle_employee_scores ces
      JOIN performance_cycles pc ON pc.id = ces.cycle_id
      WHERE LOWER(ces.employee_name) = LOWER($1)
    )
    SELECT
      cs.cycle_name,
      cs.snap::text AS received_at,
      cs.snap::text AS snapshot_at,
      cs.team,
      es.tickets_completed, es.tickets_total,
      es.story_points_completed, es.story_points_total,
      es.raw_score, es.classification, es.final_score
    FROM cycle_snaps cs
    LEFT JOIN LATERAL (
      SELECT * FROM emp_scores e
      WHERE e.cycle_name = cs.cycle_name AND e.snap <= cs.snap
      ORDER BY e.snap DESC
      LIMIT 1
    ) es ON true
    WHERE es.cycle_name IS NOT NULL   -- skip dates before the emp's first appearance in that cycle
    ORDER BY cs.snap
    `,
    [employeeName],
  );
}

/** Every employee that's been scored in any cycle. Used by /employees index. */
export type EmployeeIndexRow = {
  employee_name: string;
  employee_id: string | null;
  email: string | null;
  designation: string | null;
  department: string | null;
  teams_seen: string[];           // distinct teams this employee has been in
  total_cycles: number;
  latest_team: string | null;
  latest_cycle_name: string | null;
  latest_received_at: string | null;
  latest_classification: string | null;
  latest_final_score: number | null;
};

export async function listAllEmployees(filter?: { search?: string; team?: string; department?: string }): Promise<EmployeeIndexRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];

  if (filter?.search) {
    params.push(`%${filter.search.toLowerCase()}%`);
    where.push(`LOWER(ces.employee_name) LIKE $${params.length}`);
  }
  if (filter?.team) {
    params.push(filter.team);
    where.push(`pc.team = $${params.length}`);
  }
  if (filter?.department) {
    params.push(filter.department);
    where.push(`COALESCE(ep.department, '') = $${params.length}`);
  }

  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

  return await q<EmployeeIndexRow>(`
    WITH employee_team_history AS (
      SELECT DISTINCT
        ces.employee_name,
        ces.employee_id,
        pc.team
      FROM cycle_employee_scores ces
      JOIN performance_cycles pc ON pc.id = ces.cycle_id
      ${whereSQL}
    ),
    employee_summary AS (
      SELECT
        ces.employee_name,
        MAX(ces.employee_id::text) AS employee_id,
        COUNT(DISTINCT ces.cycle_id)::int AS total_cycles,
        (ARRAY_AGG(DISTINCT pc.team) FILTER (WHERE pc.team IS NOT NULL)) AS teams_seen
      FROM cycle_employee_scores ces
      JOIN performance_cycles pc ON pc.id = ces.cycle_id
      ${whereSQL}
      GROUP BY ces.employee_name
    ),
    latest_per_employee AS (
      SELECT DISTINCT ON (ces.employee_name)
        ces.employee_name,
        pc.team AS latest_team,
        pc.cycle_name AS latest_cycle_name,
        pc.received_at AS latest_received_at,
        ces.classification AS latest_classification,
        ces.final_score AS latest_final_score
      FROM cycle_employee_scores ces
      JOIN performance_cycles pc ON pc.id = ces.cycle_id
      ${whereSQL}
      ORDER BY ces.employee_name, ces.snapshot_at DESC NULLS LAST, pc.received_at DESC
    )
    SELECT
      es.employee_name,
      es.employee_id,
      e.email,
      ep.designation,
      ep.department,
      COALESCE(es.teams_seen, ARRAY[]::text[]) AS teams_seen,
      es.total_cycles,
      lpe.latest_team,
      lpe.latest_cycle_name,
      lpe.latest_received_at::text,
      lpe.latest_classification,
      lpe.latest_final_score
    FROM employee_summary es
    LEFT JOIN latest_per_employee lpe ON lpe.employee_name = es.employee_name
    LEFT JOIN employees e ON e.id::text = es.employee_id
    LEFT JOIN employee_profiles ep ON ep.employee_id::text = es.employee_id
    ORDER BY lpe.latest_received_at DESC NULLS LAST, es.employee_name ASC
  `, params);
}

/** Distinct teams + departments for filter dropdowns. */
export async function getFilterOptions(): Promise<{ teams: string[]; departments: string[] }> {
  const [teamRows, deptRows] = await Promise.all([
    q<{ team: string }>(`SELECT DISTINCT team FROM performance_cycles WHERE team IS NOT NULL ORDER BY team`),
    q<{ department: string }>(`SELECT DISTINCT department FROM employee_profiles WHERE department IS NOT NULL AND department <> '' ORDER BY department`),
  ]);
  return {
    teams: teamRows.map(r => r.team),
    departments: deptRows.map(r => r.department),
  };
}

/** ───────────────────── Rollup aggregations ─────────────────────────────
 *
 * Period boundaries are calendar-based:
 *   month:    YYYY-MM-01  →  first day of next month
 *   quarter:  Q1=Jan 1, Q2=Apr 1, Q3=Jul 1, Q4=Oct 1  →  first day of next Q
 *   year:     YYYY-01-01  →  YYYY+1-01-01
 *
 * Each level uses the formula from `docs/HR_Bot_Performance_System.pdf`:
 *   monthly_score   = avg(cycle final_score for cycles ending in month)
 *                     + sum(performance_adjustments scope='month')   clamped 0-10
 *   quarterly_score = avg(monthly_score for 3 months in Q)
 *                     + sum(adjustments scope='quarter')             clamped 0-10
 *   annual_score    = avg(quarterly_score for 4 quarters)
 *                     + sum(adjustments scope='year')                clamped 0-10
 *
 * For multi-snapshot cycles (Esha posts daily), we use the LATEST snapshot's
 * final_score per (cycle_name, employee).
 */

export type RollupRow = {
  employee_name: string;
  cycle_count: number;             // total cycles in period
  pending_cycles: number;          // cycles where final_score is NULL (awaiting HR)
  cycle_avg: number | null;        // average of FINALISED cycle scores only
  grace_sum: number;
  final_score: number | null;      // HR-finalised score; null if pending
  preliminary_score: number;       // best-estimate using raw adjusted_score×10 for unfinalised cycles
  display_score: number;           // = final_score if set, else preliminary_score (always present)
  is_preliminary: boolean;         // true when at least one cycle in period is pending HR
  classification: "high" | "mid" | "low" | "pending";
};

function periodBounds(scope: "month" | "quarter" | "year", periodValue: string): { start: string; end: string } {
  // Returns ISO dates: [start inclusive, end exclusive]
  if (scope === "month") {
    // periodValue = "YYYY-MM"
    const [y, m] = periodValue.split("-").map(Number);
    const start = `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-01`;
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    const end = `${ny.toString().padStart(4, "0")}-${nm.toString().padStart(2, "0")}-01`;
    return { start, end };
  }
  if (scope === "quarter") {
    // periodValue = "YYYY-Q1" ... "YYYY-Q4"
    const [yStr, qStr] = periodValue.split("-Q");
    const y = Number(yStr);
    const q = Number(qStr);
    const startMonth = (q - 1) * 3 + 1;     // Q1→1, Q2→4, Q3→7, Q4→10
    const endMonth = q * 3 + 1;             // exclusive — Q1→4
    const start = `${y.toString().padStart(4, "0")}-${startMonth.toString().padStart(2, "0")}-01`;
    const end = endMonth > 12
      ? `${(y + 1).toString().padStart(4, "0")}-01-01`
      : `${y.toString().padStart(4, "0")}-${endMonth.toString().padStart(2, "0")}-01`;
    return { start, end };
  }
  // year — periodValue = "YYYY"
  const y = Number(periodValue);
  return {
    start: `${y.toString().padStart(4, "0")}-01-01`,
    end: `${(y + 1).toString().padStart(4, "0")}-01-01`,
  };
}

/** Returns the months that fall within a quarter or year period. */
function monthsInPeriod(scope: "quarter" | "year", periodValue: string): string[] {
  const { start } = periodBounds(scope, periodValue);
  const startY = Number(start.slice(0, 4));
  const startM = Number(start.slice(5, 7));
  const count = scope === "quarter" ? 3 : 12;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const m = startM + i;
    const y = startY + Math.floor((m - 1) / 12);
    const mm = ((m - 1) % 12) + 1;
    out.push(`${y.toString().padStart(4, "0")}-${mm.toString().padStart(2, "0")}`);
  }
  return out;
}

/** Returns the quarters that fall within a year. */
function quartersInYear(year: string): string[] {
  return [`${year}-Q1`, `${year}-Q2`, `${year}-Q3`, `${year}-Q4`];
}

/** Compute monthly rollup for an entire team for one month.
 *
 * Includes EVERY employee who appears in any cycle this month — even ones
 * whose final_score is still NULL (LOW employees waiting on HR escalation).
 * Pending cycles are surfaced separately so HR can see what's open.
 */
export async function getTeamMonthlyRollup(team: string, monthValue: string): Promise<RollupRow[]> {
  const { start, end } = periodBounds("month", monthValue);
  const rows = await q<{
    employee_name: string;
    cycle_count: number;
    pending_cycles: number;
    cycle_avg: number | null;        // avg of FINALISED scores only
    preliminary_cycle_avg: number;   // avg combining finalised + adjusted_score×10 for unfinalised
    grace_sum: number;
  }>(`
    WITH cycle_latest AS (
      -- Take the latest snapshot per (cycle, employee). Use it for BOTH the
      -- finalised final_score (if HR decided) AND the raw adjusted_score
      -- (used to compute a preliminary score when HR hasn't yet).
      SELECT DISTINCT ON (pc.cycle_name, ces.employee_name)
        pc.cycle_name,
        ces.employee_name,
        ces.final_score,
        ces.adjusted_score,
        ces.classification
      FROM cycle_employee_scores ces
      JOIN performance_cycles pc ON pc.id = ces.cycle_id
      WHERE pc.team = $1
        AND pc.cycle_end >= $2::date
        AND pc.cycle_end < $3::date
      ORDER BY pc.cycle_name, ces.employee_name, pc.snapshot_at DESC
    ),
    grace AS (
      SELECT LOWER(employee_name_verbatim) AS emp_l,
             COALESCE(SUM(delta),0)::numeric(5,2) AS s
      FROM performance_adjustments
      WHERE scope = 'month' AND scope_value = $4
      GROUP BY LOWER(employee_name_verbatim)
    ),
    by_emp AS (
      SELECT
        cl.employee_name,
        COUNT(*)::int AS cycle_count,
        COUNT(*) FILTER (WHERE cl.final_score IS NULL)::int AS pending_cycles,
        AVG(cl.final_score) FILTER (WHERE cl.final_score IS NOT NULL)::numeric(5,2) AS cycle_avg,
        -- preliminary: if final_score is set, use it; otherwise raw × 10
        AVG(COALESCE(cl.final_score::numeric, cl.adjusted_score::numeric * 10))::numeric(5,2)
          AS preliminary_cycle_avg
      FROM cycle_latest cl
      GROUP BY cl.employee_name
    )
    SELECT
      e.employee_name,
      e.cycle_count,
      e.pending_cycles,
      e.cycle_avg,
      e.preliminary_cycle_avg,
      COALESCE(g.s, 0)::numeric(5,2) AS grace_sum
    FROM by_emp e
    LEFT JOIN grace g ON g.emp_l = LOWER(e.employee_name)
    ORDER BY e.employee_name
  `, [team, start, end, monthValue]);

  return rows.map((r) => {
    const avgFinalised = r.cycle_avg !== null ? Number(r.cycle_avg) : null;
    const avgPrelim = Number(r.preliminary_cycle_avg);
    const grace = Number(r.grace_sum);
    const isPrelim = Number(r.pending_cycles) > 0;

    const finalScore = avgFinalised !== null && !isPrelim
      ? Math.max(0, Math.min(10, avgFinalised + grace))
      : null;
    const preliminary = Math.max(0, Math.min(10, avgPrelim + grace));
    const display = finalScore !== null ? finalScore : preliminary;

    const cls: RollupRow["classification"] = isPrelim
      ? "pending"
      : display >= 8 ? "high"
      : display >= 6 ? "mid"
      : "low";

    return {
      employee_name: r.employee_name,
      cycle_count: Number(r.cycle_count),
      pending_cycles: Number(r.pending_cycles),
      cycle_avg: avgFinalised,
      grace_sum: grace,
      final_score: finalScore !== null ? Number(finalScore.toFixed(2)) : null,
      preliminary_score: Number(preliminary.toFixed(2)),
      display_score: Number(display.toFixed(2)),
      is_preliminary: isPrelim,
      classification: cls,
    };
  });
}

/** Quarterly = avg of monthly_scores + quarter-scope grace. */
export async function getTeamQuarterlyRollup(team: string, quarterValue: string): Promise<RollupRow[]> {
  const months = monthsInPeriod("quarter", quarterValue);
  const monthly = await Promise.all(months.map((m) => getTeamMonthlyRollup(team, m)));

  // Merge: union of all employees across the 3 months
  const allEmployees = new Set<string>();
  monthly.forEach((rows) => rows.forEach((r) => allEmployees.add(r.employee_name)));

  // Fetch quarter-scope grace
  const qGrace = await q<{ emp_l: string; s: number }>(`
    SELECT LOWER(employee_name_verbatim) AS emp_l,
           COALESCE(SUM(delta),0)::numeric(5,2) AS s
    FROM performance_adjustments
    WHERE scope = 'quarter' AND scope_value = $1
    GROUP BY LOWER(employee_name_verbatim)
  `, [quarterValue]);
  const gMap = new Map(qGrace.map((r) => [r.emp_l, Number(r.s)]));

  return Array.from(allEmployees).sort().map((emp) => {
    const monthlyFinal: number[] = [];
    const monthlyDisplay: number[] = [];
    let cycleCount = 0;
    let pendingCycles = 0;
    let anyPrelim = false;
    for (const monthRows of monthly) {
      const r = monthRows.find((x) => x.employee_name === emp);
      if (r) {
        cycleCount += r.cycle_count;
        pendingCycles += r.pending_cycles;
        if (r.final_score !== null) monthlyFinal.push(Number(r.final_score));
        monthlyDisplay.push(Number(r.display_score));
        if (r.is_preliminary) anyPrelim = true;
      }
    }
    const grace = gMap.get(emp.toLowerCase()) ?? 0;

    const finalAvg = monthlyFinal.length > 0 && !anyPrelim
      ? monthlyFinal.reduce((a, b) => a + b, 0) / monthlyFinal.length
      : null;
    const finalScore = finalAvg !== null
      ? Math.max(0, Math.min(10, finalAvg + grace))
      : null;

    const prelimAvg = monthlyDisplay.length > 0
      ? monthlyDisplay.reduce((a, b) => a + b, 0) / monthlyDisplay.length
      : 0;
    const preliminary = Math.max(0, Math.min(10, prelimAvg + grace));
    const display = finalScore !== null ? finalScore : preliminary;

    const cls: RollupRow["classification"] = anyPrelim
      ? "pending"
      : display >= 8 ? "high"
      : display >= 6 ? "mid"
      : "low";

    return {
      employee_name: emp,
      cycle_count: cycleCount,
      pending_cycles: pendingCycles,
      cycle_avg: finalAvg !== null ? Number(finalAvg.toFixed(2)) : null,
      grace_sum: Number(grace.toFixed(2)),
      final_score: finalScore !== null ? Number(finalScore.toFixed(2)) : null,
      preliminary_score: Number(preliminary.toFixed(2)),
      display_score: Number(display.toFixed(2)),
      is_preliminary: anyPrelim,
      classification: cls,
    };
  });
}

/** Annual = avg of quarterly_scores + year-scope grace. */
export async function getTeamAnnualRollup(team: string, yearValue: string): Promise<RollupRow[]> {
  const quarters = quartersInYear(yearValue);
  const quarterly = await Promise.all(quarters.map((q) => getTeamQuarterlyRollup(team, q)));

  const allEmployees = new Set<string>();
  quarterly.forEach((rows) => rows.forEach((r) => allEmployees.add(r.employee_name)));

  const yGrace = await q<{ emp_l: string; s: number }>(`
    SELECT LOWER(employee_name_verbatim) AS emp_l,
           COALESCE(SUM(delta),0)::numeric(5,2) AS s
    FROM performance_adjustments
    WHERE scope = 'year' AND scope_value = $1
    GROUP BY LOWER(employee_name_verbatim)
  `, [yearValue]);
  const gMap = new Map(yGrace.map((r) => [r.emp_l, Number(r.s)]));

  return Array.from(allEmployees).sort().map((emp) => {
    const qFinal: number[] = [];
    const qDisplay: number[] = [];
    let cycleCount = 0;
    let pendingCycles = 0;
    let anyPrelim = false;
    for (const qRows of quarterly) {
      const r = qRows.find((x) => x.employee_name === emp);
      if (r) {
        cycleCount += r.cycle_count;
        pendingCycles += r.pending_cycles;
        if (r.final_score !== null) qFinal.push(Number(r.final_score));
        qDisplay.push(Number(r.display_score));
        if (r.is_preliminary) anyPrelim = true;
      }
    }
    const grace = gMap.get(emp.toLowerCase()) ?? 0;

    const finalAvg = qFinal.length > 0 && !anyPrelim
      ? qFinal.reduce((a, b) => a + b, 0) / qFinal.length
      : null;
    const finalScore = finalAvg !== null
      ? Math.max(0, Math.min(10, finalAvg + grace))
      : null;
    const prelimAvg = qDisplay.length > 0
      ? qDisplay.reduce((a, b) => a + b, 0) / qDisplay.length
      : 0;
    const preliminary = Math.max(0, Math.min(10, prelimAvg + grace));
    const display = finalScore !== null ? finalScore : preliminary;

    const cls: RollupRow["classification"] = anyPrelim
      ? "pending"
      : display >= 8 ? "high"
      : display >= 6 ? "mid"
      : "low";

    return {
      employee_name: emp,
      cycle_count: cycleCount,
      pending_cycles: pendingCycles,
      cycle_avg: finalAvg !== null ? Number(finalAvg.toFixed(2)) : null,
      grace_sum: Number(grace.toFixed(2)),
      final_score: finalScore !== null ? Number(finalScore.toFixed(2)) : null,
      preliminary_score: Number(preliminary.toFixed(2)),
      display_score: Number(display.toFixed(2)),
      is_preliminary: anyPrelim,
      classification: cls,
    };
  });
}

/** ───── Per-employee rollup detail ───── */

export type EmployeeCycleInPeriod = {
  cycle_name: string;
  cycle_end: string;
  final_score: number | null;
  adjusted_score: number | null;        // 0..1 raw completion
  finalized_method: string | null;
  classification: string | null;
};

export type GraceMark = {
  id: string;
  delta: number;
  reason: string;
  granted_by_role: string;
  granted_at: string;
  team_name: string | null;
};

export type EmployeeRollupDetail = {
  scope: "month" | "quarter" | "year";
  period_value: string;
  period_label: string;
  // Score components
  cycle_count: number;
  pending_cycles: number;
  cycle_avg: number | null;          // avg of finalised scores only
  grace_sum: number;
  final_score: number | null;        // null if any cycle is pending
  preliminary_score: number;         // best-estimate with raw × 10 for unfinalised
  display_score: number;             // = final_score if set, else preliminary_score
  is_preliminary: boolean;
  // Breakdown
  cycles: EmployeeCycleInPeriod[];   // for monthly view
  sub_rollups: Array<{                // for quarterly/annual view
    sub_scope: "month" | "quarter";
    sub_period: string;
    sub_label: string;
    cycle_count: number;
    pending_cycles: number;
    cycle_avg: number | null;
    grace_sum: number;
    final_score: number | null;
    preliminary_score: number;
    display_score: number;
    is_preliminary: boolean;
  }>;
  grace_marks: GraceMark[];
};

async function _cyclesForEmployeeInRange(
  employeeName: string, periodStart: string, periodEnd: string,
): Promise<EmployeeCycleInPeriod[]> {
  return await q<EmployeeCycleInPeriod>(`
    SELECT DISTINCT ON (pc.cycle_name)
      pc.cycle_name,
      pc.cycle_end::text,
      ces.final_score,
      ces.adjusted_score,
      ces.finalized_method,
      ces.classification
    FROM cycle_employee_scores ces
    JOIN performance_cycles pc ON pc.id = ces.cycle_id
    WHERE LOWER(ces.employee_name) = LOWER($1)
      AND pc.cycle_end >= $2::date
      AND pc.cycle_end < $3::date
    ORDER BY pc.cycle_name, pc.snapshot_at DESC
  `, [employeeName, periodStart, periodEnd]);
}

async function _graceMarksFor(
  employeeName: string, scope: string, periodValue: string,
): Promise<GraceMark[]> {
  return await q<GraceMark>(`
    SELECT id, delta, reason, granted_by_role,
           created_at::text AS granted_at, team_name
    FROM performance_adjustments
    WHERE LOWER(employee_name_verbatim) = LOWER($1)
      AND scope = $2 AND scope_value = $3
    ORDER BY created_at DESC
  `, [employeeName, scope, periodValue]);
}

export async function getEmployeeRollup(
  employeeName: string,
  scope: "month" | "quarter" | "year",
  periodValue: string,
): Promise<EmployeeRollupDetail> {
  const { start, end } = periodBounds(scope, periodValue);
  const periodLab = periodLabel(scope, periodValue);
  const graceMarks = await _graceMarksFor(employeeName, scope, periodValue);
  const grace_sum = graceMarks.reduce((s, g) => s + Number(g.delta), 0);

  if (scope === "month") {
    const cycles = await _cyclesForEmployeeInRange(employeeName, start, end);
    const scored = cycles.filter((c) => c.final_score !== null);
    const pendingCycles = cycles.filter((c) => c.final_score === null).length;
    const anyPrelim = pendingCycles > 0;

    const cycle_avg = scored.length > 0
      ? scored.reduce((s, c) => s + Number(c.final_score), 0) / scored.length
      : null;

    // Preliminary: blend finalised + raw×10 for unfinalised
    const prelimNumbers = cycles.map((c) =>
      c.final_score !== null
        ? Number(c.final_score)
        : (c.adjusted_score !== null ? Number(c.adjusted_score) * 10 : 0)
    );
    const prelimAvg = prelimNumbers.length > 0
      ? prelimNumbers.reduce((a, b) => a + b, 0) / prelimNumbers.length
      : 0;

    const final_score = !anyPrelim && cycle_avg !== null
      ? Math.max(0, Math.min(10, cycle_avg + grace_sum))
      : null;
    const preliminary_score = Math.max(0, Math.min(10, prelimAvg + grace_sum));
    const display_score = final_score !== null ? final_score : preliminary_score;

    return {
      scope, period_value: periodValue, period_label: periodLab,
      cycle_count: cycles.length,
      pending_cycles: pendingCycles,
      cycle_avg: cycle_avg !== null ? Number(cycle_avg.toFixed(2)) : null,
      grace_sum: Number(grace_sum.toFixed(2)),
      final_score: final_score !== null ? Number(final_score.toFixed(2)) : null,
      preliminary_score: Number(preliminary_score.toFixed(2)),
      display_score: Number(display_score.toFixed(2)),
      is_preliminary: anyPrelim,
      cycles, sub_rollups: [], grace_marks: graceMarks,
    };
  }

  // Quarter / year — roll up from the level below
  const subScope = scope === "quarter" ? "month" : "quarter";
  const subPeriods = scope === "quarter"
    ? monthsInPeriod("quarter", periodValue)
    : quartersInYear(periodValue);

  const subRollups = await Promise.all(
    subPeriods.map((p) => getEmployeeRollup(employeeName, subScope, p)),
  );

  const subFinalScores = subRollups
    .map((r) => r.final_score)
    .filter((s): s is number => s !== null);
  const subDisplayScores = subRollups.map((r) => r.display_score);
  const anyPrelim = subRollups.some((r) => r.is_preliminary);

  const subFinalAvg = !anyPrelim && subFinalScores.length > 0
    ? subFinalScores.reduce((a, b) => a + b, 0) / subFinalScores.length
    : null;
  const subDisplayAvg = subDisplayScores.length > 0
    ? subDisplayScores.reduce((a, b) => a + b, 0) / subDisplayScores.length
    : 0;

  const final_score = subFinalAvg !== null
    ? Math.max(0, Math.min(10, subFinalAvg + grace_sum))
    : null;
  const preliminary_score = Math.max(0, Math.min(10, subDisplayAvg + grace_sum));
  const display_score = final_score !== null ? final_score : preliminary_score;

  return {
    scope, period_value: periodValue, period_label: periodLab,
    cycle_count: subRollups.reduce((s, r) => s + r.cycle_count, 0),
    pending_cycles: subRollups.reduce((s, r) => s + r.pending_cycles, 0),
    cycle_avg: subFinalAvg !== null ? Number(subFinalAvg.toFixed(2)) : null,
    grace_sum: Number(grace_sum.toFixed(2)),
    final_score: final_score !== null ? Number(final_score.toFixed(2)) : null,
    preliminary_score: Number(preliminary_score.toFixed(2)),
    display_score: Number(display_score.toFixed(2)),
    is_preliminary: anyPrelim,
    cycles: [],
    sub_rollups: subRollups.map((r) => ({
      sub_scope: subScope as "month" | "quarter",
      sub_period: r.period_value,
      sub_label: r.period_label,
      cycle_count: r.cycle_count,
      pending_cycles: r.pending_cycles,
      cycle_avg: r.cycle_avg,
      grace_sum: r.grace_sum,
      final_score: r.final_score,
      preliminary_score: r.preliminary_score,
      display_score: r.display_score,
      is_preliminary: r.is_preliminary,
    })),
    grace_marks: graceMarks,
  };
}

/** Convenience: current period given today's date. */
export function currentPeriod(scope: "month" | "quarter" | "year"): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (scope === "month") return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}`;
  if (scope === "quarter") {
    const q = Math.floor((m - 1) / 3) + 1;
    return `${y}-Q${q}`;
  }
  return `${y}`;
}

/** Pretty label for a period value, e.g. "May 2026" / "Q2 2026" / "2026". */
export function periodLabel(scope: "month" | "quarter" | "year", periodValue: string): string {
  if (scope === "month") {
    const [y, m] = periodValue.split("-").map(Number);
    const monthName = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long" });
    return `${monthName} ${y}`;
  }
  if (scope === "quarter") {
    return periodValue.replace("-", " ");  // "2026-Q2" → "2026 Q2"
  }
  return periodValue;
}

/** Simple counts for the landing page. */
export type HomeStats = {
  total_teams: number;
  total_cycles: number;
  total_employees_tracked: number;
  open_escalations: number;
};

export async function getHomeStats(): Promise<HomeStats> {
  const [team, cycle, emp, esc] = await Promise.all([
    q<{ n: number }>(`SELECT COUNT(DISTINCT team) AS n FROM performance_cycles WHERE team IS NOT NULL`),
    q<{ n: number }>(`SELECT COUNT(*) AS n FROM performance_cycles`),
    q<{ n: number }>(`SELECT COUNT(DISTINCT employee_name) AS n FROM cycle_employee_scores`),
    q<{ n: number }>(
      `SELECT COUNT(*) AS n FROM cycle_escalations WHERE state NOT IN ('closed', 'hr_decided')`,
    ),
  ]);
  return {
    total_teams: Number(team[0]?.n ?? 0),
    total_cycles: Number(cycle[0]?.n ?? 0),
    total_employees_tracked: Number(emp[0]?.n ?? 0),
    open_escalations: Number(esc[0]?.n ?? 0),
  };
}

// ─── issue_events reads (migration 020) ───────────────────────────────────

export type IssueEventRow = {
  issue_id: string;
  cycle_name: string;
  team: string | null;
  employee_name: string | null;
  prev_employee: string | null;
  event_type: string;       // assigned|reassigned|priority_changed|sp_changed|status_changed|completed|reopened
  old_value: string | null;
  new_value: string | null;
  occurred_at: string;
};

/** Full chronological lifeline of one issue across all cycles.
 *  Powers the "life of an issue" view — every assignment, reassignment,
 *  priority/SP/status change, completion, reopen — in one cheap query. */
export async function getIssueLifeline(issueId: string): Promise<IssueEventRow[]> {
  return await q<IssueEventRow>(
    `SELECT issue_id, cycle_name, team, employee_name, prev_employee,
            event_type, old_value, new_value, occurred_at::text
     FROM issue_events
     WHERE issue_id = $1
     ORDER BY occurred_at ASC, created_at ASC`,
    [issueId],
  );
}

/** All change events for a cycle up to (and including) a given date.
 *  Excludes the noisy bulk 'assigned' events by default so the feed
 *  shows real changes (reassignments, priority/SP/status, completions). */
export async function getCycleEventFeed(
  team: string,
  cycleName: string,
  asOfSnapshotAt: string,
  includeAssigned = false,
): Promise<IssueEventRow[]> {
  return await q<IssueEventRow>(
    `SELECT issue_id, cycle_name, team, employee_name, prev_employee,
            event_type, old_value, new_value, occurred_at::text
     FROM issue_events
     WHERE cycle_name = $1
       AND COALESCE(team, '') = COALESCE($2, '')
       AND occurred_at <= $3::timestamptz
       AND ($4 OR event_type <> 'assigned')
     ORDER BY occurred_at DESC, issue_id`,
    [cycleName, team, asOfSnapshotAt, includeAssigned],
  );
}

/** Per-employee event tallies for a quarter/period — HR analytics.
 *  e.g. "who completed the most / received the most reassignments". */
export type EmployeeEventStat = {
  employee_name: string;
  completed: number;
  reassigned_in: number;     // issues reassigned TO this person
};

export async function getEmployeeEventStats(
  startISO: string,
  endISO: string,
): Promise<EmployeeEventStat[]> {
  return await q<EmployeeEventStat>(
    `SELECT employee_name,
            COUNT(*) FILTER (WHERE event_type = 'completed')  AS completed,
            COUNT(*) FILTER (WHERE event_type = 'reassigned') AS reassigned_in
     FROM issue_events
     WHERE occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz
       AND employee_name IS NOT NULL
     GROUP BY employee_name
     ORDER BY completed DESC, reassigned_in DESC`,
    [startISO, endISO],
  );
}

// ─── Status-credit trend (per snapshot) ─────────────────────────────────────
//
// Per-snapshot per-issue rows for one employee, source-preferred (Linear
// rows win for any cycle that has them; Esha rows used only for cycles
// without Linear data).  The employee page groups these by snapshot date
// and runs computeEmployeeScore() per group to plot the REAL status-credit
// %, instead of the old tickets_pct that reads the void aggregate table.
//
// This is also the foundation for the per-day credit-delta metric.
export type EmployeeCreditTrendRow = {
  snapshot_at: string;
  cycle_name: string;
  issue_id: string;
  status: string | null;
  story_points: number | null;
  priority: string | null;
  labels: string[] | null;
};

export async function getEmployeeStatusCreditTrend(
  employeeName: string,
): Promise<EmployeeCreditTrendRow[]> {
  return await q<EmployeeCreditTrendRow>(
    `
    SELECT
      COALESCE(pc.snapshot_at, pc.received_at)::text AS snapshot_at,
      pc.cycle_name,
      cei.issue_id, cei.status, cei.story_points, cei.priority, cei.labels
    FROM cycle_employee_issues cei
    JOIN performance_cycles pc ON pc.id = cei.cycle_id
    WHERE LOWER(cei.employee_name) = LOWER($1)
      AND (
        pc.source LIKE 'linear%'
        OR NOT EXISTS (
          SELECT 1 FROM performance_cycles _pl
          WHERE _pl.team = pc.team AND _pl.cycle_name = pc.cycle_name
            AND _pl.source LIKE 'linear%'
        )
      )
    ORDER BY COALESCE(pc.snapshot_at, pc.received_at) ASC
    `,
    [employeeName],
  );
}
