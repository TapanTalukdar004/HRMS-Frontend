// Mirror of perf_tracker/jobs/issue_scoring.py — rules MUST stay in sync.
// Used on the team-view page to render scores without an extra API hop.

import type { ProjectTeamMemberIssueRow } from "./queries";

const STATE_BASE: Record<string, number> = {
  completed: 100,
  started:    60,
  unstarted:  30,
  backlog:    20,
  canceled:   50,
  triage:     25,
};

const TIMELINESS_MULT = {
  on_time: 1.00,
  late:    0.85,
  overdue: 0.50,
  no_due:  1.00,
} as const;

const SUB_BONUS_PER_DONE = 5;
const SUB_BONUS_CAP      = 15;

type Timeliness = keyof typeof TIMELINESS_MULT;

function classifyTimeliness(
  state_type: string | null,
  due_date: string | null,
  completed_at: string | null,
): Timeliness {
  if (!due_date) return "no_due";
  const today = new Date().toISOString().slice(0, 10);
  if (state_type === "completed") {
    if (!completed_at) return "on_time";
    const completedDate = completed_at.slice(0, 10);
    return completedDate <= due_date ? "on_time" : "late";
  }
  return due_date < today ? "overdue" : "no_due";
}

export type IssueScoreView = {
  issue: ProjectTeamMemberIssueRow;
  base: number;
  timeliness: Timeliness;
  mult: number;
  subBonus: number;
  final: number;
};

export type EmployeeScoreView = {
  employee_id: string;
  employee_name: string;
  designation: string | null;
  weekly: number | null;
  nDone: number;
  nInProgress: number;
  nOverdue: number;
  issues: IssueScoreView[];
};

export function scoreIssue(
  issue: ProjectTeamMemberIssueRow,
  subStateTypes?: (string | null)[],
): IssueScoreView {
  const base = STATE_BASE[issue.state_type ?? ""] ?? 20;
  const timeliness = classifyTimeliness(issue.state_type, issue.due_date, issue.completed_at);
  const mult = TIMELINESS_MULT[timeliness];

  let subBonus = 0;
  if (issue.role === "lead" && subStateTypes && subStateTypes.length > 0) {
    const nDone = subStateTypes.filter((t) => t === "completed").length;
    subBonus = Math.min(nDone * SUB_BONUS_PER_DONE, SUB_BONUS_CAP);
  }

  const final = Math.max(0, Math.min(115, base * mult + subBonus));
  return { issue, base, timeliness, mult, subBonus, final: Math.round(final * 10) / 10 };
}

export function scoreEmployee(
  employee_id: string,
  employee_name: string,
  designation: string | null,
  issues: ProjectTeamMemberIssueRow[],
): EmployeeScoreView {
  // Build a map of parent identifier → list of sub state_types
  const subsByParent = new Map<string, (string | null)[]>();
  for (const i of issues) {
    if (i.parent_identifier) {
      if (!subsByParent.has(i.parent_identifier)) subsByParent.set(i.parent_identifier, []);
      subsByParent.get(i.parent_identifier)!.push(i.state_type);
    }
  }

  const scored = issues.map((iss) => {
    if (iss.role === "lead") {
      // For a lead-role issue, the subs are issues with parent_identifier === iss.identifier
      const subs = subsByParent.get(iss.identifier);
      return scoreIssue(iss, subs);
    }
    return scoreIssue(iss);
  });

  const today = new Date().toISOString().slice(0, 10);
  const nDone = scored.filter((s) => s.issue.state_type === "completed").length;
  const nInProgress = scored.filter((s) => s.issue.state_type === "started").length;
  const nOverdue = scored.filter(
    (s) =>
      s.issue.state_type !== "completed" &&
      s.issue.state_type !== "canceled" &&
      s.issue.due_date &&
      s.issue.due_date < today,
  ).length;
  const weekly =
    scored.length > 0
      ? Math.round((scored.reduce((acc, s) => acc + s.final, 0) / scored.length) * 10) / 10
      : null;

  return {
    employee_id,
    employee_name,
    designation,
    weekly,
    nDone,
    nInProgress,
    nOverdue,
    issues: scored,
  };
}
