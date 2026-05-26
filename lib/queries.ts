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

/** One employee's full issue history grouped by cycle.
 *  Returns: {cycle_name: {cycle_id, team, cycle_start, cycle_end, snapshot_at, issues[]}}
 *  Used by the employee profile page to show what they had on their
 *  plate across each cycle (cycle-wise breakdown).
 */
export type EmployeeCycleBucket = {
  cycle_id: string;
  cycle_name: string;
  team: string | null;
  cycle_start: string | null;
  cycle_end: string | null;
  snapshot_at: string;
  issues: CycleIssue[];
};

export async function getIssuesForEmployeeByCycle(
  employeeName: string,
): Promise<EmployeeCycleBucket[]> {
  // First: discover which cycles this person appears in.
  const cycles = await q<{ cycle_id: string; cycle_name: string; team: string | null;
                          cycle_start: string | null; cycle_end: string | null;
                          snapshot_at: string }>(
    `
    SELECT DISTINCT
      pc.id          AS cycle_id,
      pc.cycle_name,
      pc.team,
      pc.cycle_start::text,
      pc.cycle_end::text,
      COALESCE(pc.snapshot_at, pc.received_at)::text AS snapshot_at
    FROM cycle_employee_issues cei
    JOIN performance_cycles pc ON pc.id = cei.cycle_id
    WHERE cei.employee_name = $1
    ORDER BY snapshot_at DESC
    `,
    [employeeName],
  );
  if (cycles.length === 0) return [];

  // Then: fetch the latest snapshot of every issue this person has, across all cycles.
  const issues = await q<CycleIssue>(
    `
    WITH latest AS (
      SELECT DISTINCT ON (cycle_id, issue_id)
        id, cycle_id, employee_name, employee_id, issue_id, title,
        issue_type, priority, story_points, status, labels,
        assigned_at, completed_at, snapshot_at
      FROM cycle_employee_issues
      WHERE employee_name = $1
      ORDER BY cycle_id, issue_id, snapshot_at DESC
    )
    SELECT * FROM latest
    ORDER BY cycle_id, priority NULLS LAST, issue_id
    `,
    [employeeName],
  );

  const byId: Record<string, CycleIssue[]> = {};
  for (const it of issues) {
    (byId[it.cycle_id] ??= []).push(it);
  }
  return cycles.map(c => ({
    cycle_id: c.cycle_id,
    cycle_name: c.cycle_name,
    team: c.team,
    cycle_start: c.cycle_start,
    cycle_end: c.cycle_end,
    snapshot_at: c.snapshot_at,
    issues: byId[c.cycle_id] ?? [],
  }));
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
