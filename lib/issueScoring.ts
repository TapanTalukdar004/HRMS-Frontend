/**
 * Issue-level scoring (TypeScript port).
 *
 * THIS FILE MUST MIRROR  perf_tracker/esha/scoring.py
 *
 * The Python file is the canonical reference (it ships in the backend
 * pipeline and is what the analyzer uses).  This TS module lets the
 * frontend render the same numbers without an extra API hop.  If you
 * change a constant here, change it there too (and vice versa).
 *
 * See docs/HR_Bot_Performance_Scoring_Design.pdf for the design.
 */

// ─── Tunable constants ───────────────────────────────────────────────────

export const PRIORITY_MULTIPLIER: Record<string, number> = {
  p0:  2.0,
  p1:  1.5,
  p2:  1.0,
  low: 0.7,
};

export const PRIORITY_TIME_FACTOR: Record<string, number> = {
  p0:  0.6,
  p1:  0.8,
  p2:  1.0,
  low: 1.5,
};

/**
 * SP fallback policy when an issue lacks a story_points estimate.
 *
 * Honest behaviour: when the PM forgets to estimate, we treat the issue
 * as the minimum unit of work (1 SP) rather than silently inflating to
 * a guessed value.  The UI shows a "no estimate" badge on the row so
 * HR / the PM can see the data-quality gap.
 *
 * Net effect:  weight(un-estimated) = 1 × priority_multiplier
 * which sits between 0.7 (low) and 2.0 (p0).
 *
 * MUST mirror perf_tracker/esha/scoring.py:SP_FALLBACK_WHEN_MISSING.
 */
export const SP_FALLBACK_WHEN_MISSING = 1.0;

export const NORMAL_RATIO = 1.5;
export const TIGHT_BONUS = 1.2;

/**
 * Quality penalty: a completed issue with ≥1 reopen (QA caught a bug
 * after the developer marked it done, then it was re-completed) lands
 * at REWORK_PENALTY × its normal weight.  The verifier's 24h heuristic
 * filters out same-day self-corrections, so any reopen that survives
 * represents a real QA failure.
 *
 * 0 would be too punitive (work that ships even after rework is still
 * work delivered).  Full credit erases the quality memory.  0.7 splits
 * the difference and is the starting heuristic — tune over time.
 *
 * MUST mirror perf_tracker/esha/scoring.py:REWORK_PENALTY.
 */
export const REWORK_PENALTY = 0.7;

/**
 * Status-credit ladder — the core of the status-aware scoring model.
 * MUST mirror perf_tracker/esha/scoring.py:STATUS_CREDIT.
 *
 * Graded completion by how far an issue has moved through the Linear
 * pipeline.  Steep rise as the developer finishes (review → QA handoff
 * at 0.80), then a 0.20 "quality reserve" released only as QA/PT/Prod
 * confirm clean.  A QA bounce drops credit automatically (status
 * regressed); REWORK_PENALTY adds the extra ding on re-completion.
 *
 * Keys are normalized via normStatus() and cover real Linear statuses
 * plus legacy Esha values (todo/in_progress/done) so old rows don't break.
 */
export const STATUS_CREDIT: Record<string, number> = {
  // not started
  "backlog": 0.0, "in discussion": 0.0, "todo": 0.0,
  "ready for development": 0.0, "on hold": 0.0,
  // active development  (gently tightened 2026-06-06 to match scoring.py)
  "in design": 0.12,
  "in development": 0.30,
  "code review": 0.55,
  "in review": 0.65,
  // handoff: dev work done; quality reserve (0.78 -> 1.0) begins
  "in qa": 0.78,
  "ready to deploy-qa": 0.78,
  "pt review": 0.86,
  "approved for prod": 0.93,
  "released to prod": 1.0,
  "done": 1.0,
  // legacy Esha collapsed values
  "in progress": 0.30, "in_progress": 0.30,
  "completed": 1.0, "closed": 1.0, "resolved": 1.0,
};

export const EXCLUDED_STATUS = new Set(["canceled", "cancelled", "duplicate"]);
export const UNKNOWN_STATUS_CREDIT = 0.35;
export const DEV_DONE_CREDIT = 0.78;   // In QA line — developer's hands-on work done

/**
 * Bug-retention (hold & release) — MUST mirror scoring.py.
 * A feature/story with an OPEN linked bug is HELD at HOLD_CAP until the bug
 * clears, then releases. Corrective work (bug, or reopened) is discounted
 * REWORK_PENALTY so clean-first-time out-scores buggy-then-fixed.
 */
export const HOLD_CAP = 0.78;
export const BUG_RESOLVED_CREDIT = 0.93;   // bug at/above this is "fixed"

function normStatus(raw?: string | null): string {
  let s = (raw ?? "").trim().toLowerCase();
  s = s.replace(/\s*-\s*/g, "-").replace(/\s+/g, " ");
  return s;
}

/** Graded credit 0..1 from the issue's Linear status. null = excluded
 *  (canceled/duplicate) so the caller drops it from num AND denom. */
export function statusCredit(issue: Issue): number | null {
  const s = normStatus(issue.status);
  if (!s) return 0.0;
  if (EXCLUDED_STATUS.has(s)) return null;
  return s in STATUS_CREDIT ? STATUS_CREDIT[s] : UNKNOWN_STATUS_CREDIT;
}

/** True once the issue reached the handoff line (In QA or later). */
export function isDevComplete(issue: Issue): boolean {
  const c = statusCredit(issue);
  return c !== null && c >= DEV_DONE_CREDIT;
}

/** True when the issue is a bug (type field == 'bug' OR a 'Bug' label). */
export function isBug(issue: Issue): boolean {
  if ((issue.issue_type ?? "").trim().toLowerCase() === "bug") return true;
  return (issue.labels ?? []).some(
    (l) => typeof l === "string" && l.trim().toLowerCase() === "bug",
  );
}

/** Corrective work = a bug, OR a reopened issue. Counted at REWORK_PENALTY. */
export function isCorrective(issue: Issue): boolean {
  return isBug(issue) || reopenCount(issue) > 0;
}

/** Feature/story ids that currently have ≥1 OPEN linked bug (credit <
 *  BUG_RESOLVED_CREDIT). Those features are held at HOLD_CAP until cleared.
 *  MUST mirror scoring.py:held_feature_ids — pass the WHOLE cycle's issues. */
export function heldFeatureIds(allIssues: Issue[]): Set<string> {
  const held = new Set<string>();
  for (const it of allIssues) {
    if (!isBug(it)) continue;
    const cr = statusCredit(it);
    if (cr === null || cr >= BUG_RESOLVED_CREDIT) continue;
    if (it.is_bug_of) held.add(String(it.is_bug_of));
  }
  return held;
}

export const HIGH_THRESHOLD = 0.80;
export const MID_THRESHOLD  = 0.60;

export const REMOVE_LABELS = new Set([
  "wontfix", "won't fix", "duplicate", "cancelled", "out-of-scope",
]);
export const BLOCKED_LABELS = new Set([
  "blocked", "needs-review", "needs-design", "waiting-on-prod",
]);

// ─── Types ──────────────────────────────────────────────────────────────

export type Issue = {
  issue_id: string;
  title?: string | null;
  issue_type?: string | null;
  priority?: string | null;
  story_points?: number | null;
  status?: string | null;
  labels?: string[] | null;
  assigned_at?: string | null;
  completed_at?: string | null;
  snapshot_at?: string | null;
  /** Count of `reopened` events emitted by the verifier (≥1 = QA failure
   *  history).  Joined from issue_quality in the query layer; 0 / absent
   *  when there's no rework. */
  reopen_count?: number | null;
  /** For bug-typed issues: the feature/story this bug belongs to (resolved
   *  from Linear relations by the v4 exporter). Drives the bug-retention hold. */
  is_bug_of?: string | null;
};

export type Lane =
  | "normal"
  | "tight"
  | "late_dump"
  | "removed"
  | "blocked_cancelled";

export type EmployeeScore = {
  weightDone: number;
  weightTotal: number;
  pctComplete: number | null;
  classification: "high" | "mid" | "low" | "no_data";
  score0to10: number | null;
  lanes: Record<Lane, number>;
  explanation: string[];
};

// ─── Normalisers ────────────────────────────────────────────────────────

function normPriority(raw?: string | null): keyof typeof PRIORITY_MULTIPLIER {
  if (!raw) return "p2";
  const s = raw.trim().toLowerCase();
  if (s in PRIORITY_MULTIPLIER) return s as keyof typeof PRIORITY_MULTIPLIER;
  if (s.startsWith("p0") || s === "critical" || s === "blocker" || s === "urgent") return "p0";
  if (s.startsWith("p1") || s === "high") return "p1";
  if (s.startsWith("p2") || s === "medium" || s === "normal") return "p2";
  if (s === "low" || s === "minor" || s === "trivial") return "low";
  return "p2";   // "No priority" / unknown
}

/** True when Esha sent a real SP value > 0 for this issue.
 *  UI uses this to display a "no estimate" data-quality flag. */
export function hasSpEstimate(issue: Issue): boolean {
  const sp = issue.story_points;
  if (sp === null || sp === undefined) return false;
  const v = Number(sp);
  return Number.isFinite(v) && v > 0;
}

/** How many times has this issue been reopened (QA-failure heuristic).
 *  Returns 0 when reopen_count is missing — old query paths still work. */
export function reopenCount(issue: Issue): number {
  const v = issue.reopen_count;
  if (v == null) return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/** True when this issue is COMPLETED and has at least one prior reopen.
 *  Drives the 0.7× weight penalty + the ⚠ Reworked badge. */
export function isReworkedCompletion(issue: Issue): boolean {
  return isCompleted(issue) && reopenCount(issue) > 0;
}

/** Visible quality state for badging on the UI. */
export type QualityState = "clean" | "reworked" | "open_bug";

export function qualityState(issue: Issue): QualityState {
  const reopens = reopenCount(issue);
  if (reopens === 0) return "clean";
  return isCompleted(issue) ? "reworked" : "open_bug";
}

function effectiveSP(issue: Issue): number {
  const sp = issue.story_points;
  if (sp === null || sp === undefined) return SP_FALLBACK_WHEN_MISSING;
  const v = Number(sp);
  if (!Number.isFinite(v) || v <= 0) return SP_FALLBACK_WHEN_MISSING;
  return v;
}

function hasLabel(issue: Issue, vocab: Set<string>): boolean {
  if (!issue.labels || issue.labels.length === 0) return false;
  for (const lbl of issue.labels) {
    if (typeof lbl === "string" && vocab.has(lbl.trim().toLowerCase())) return true;
  }
  return false;
}

// ─── Core formulas ──────────────────────────────────────────────────────

export function computeWeight(issue: Issue): number {
  const sp = effectiveSP(issue);
  const mult = PRIORITY_MULTIPLIER[normPriority(issue.priority)];
  return Math.round(sp * mult * 100) / 100;
}

/** Expected duration in WHOLE days (rounded up, minimum 1).
 *  Fractional days are confusing for HR — we always show round numbers. */
export function computeExpectedDays(issue: Issue): number {
  const sp = effectiveSP(issue);
  const factor = PRIORITY_TIME_FACTOR[normPriority(issue.priority)];
  return Math.max(1, Math.ceil(sp * factor));
}

function toMs(dt?: string | null): number | null {
  if (!dt) return null;
  const ms = Date.parse(dt);
  return Number.isNaN(ms) ? null : ms;
}

export function isCompleted(issue: Issue): boolean {
  if (!issue.status) return false;
  const s = issue.status.trim().toLowerCase();
  return s === "done" || s === "completed" || s === "closed" || s === "resolved";
}

export function classifyLane(issue: Issue, cycleEnd: string | Date): Lane {
  if (hasLabel(issue, REMOVE_LABELS)) return "removed";

  const cycleEndMs = typeof cycleEnd === "string"
    ? Date.parse(cycleEnd)
    : cycleEnd.getTime();
  const assignedMs = toMs(issue.assigned_at);
  if (Number.isNaN(cycleEndMs) || assignedMs === null) return "normal";

  const daysAvailable = (cycleEndMs - assignedMs) / 86_400_000;
  if (daysAvailable < 0) return "late_dump";

  const expected = computeExpectedDays(issue);
  if (daysAvailable >= expected * NORMAL_RATIO) return "normal";
  if (daysAvailable >= expected) return "tight";
  return "late_dump";
}

// ─── Per-employee aggregation ───────────────────────────────────────────

function classifyPct(pct: number | null): EmployeeScore["classification"] {
  if (pct === null) return "no_data";
  if (pct >= HIGH_THRESHOLD) return "high";
  if (pct >= MID_THRESHOLD) return "mid";
  return "low";
}

function scoreFromPct(pct: number | null): number | null {
  if (pct === null) return null;
  if (pct >= HIGH_THRESHOLD) {
    return Math.round(Math.min(10, 8 + (pct - HIGH_THRESHOLD) * 10) * 100) / 100;
  }
  if (pct >= MID_THRESHOLD) {
    return Math.round((6 + (pct - MID_THRESHOLD) * 10) * 100) / 100;
  }
  return Math.round(Math.max(0, pct * 10) * 100) / 100;
}

export function computeEmployeeScore(
  issues: Issue[],
  cycleEnd: string | Date,
  heldFeatures?: Set<string>,
): EmployeeScore {
  const held = heldFeatures ?? new Set<string>();
  let weightDone = 0;
  let weightTotal = 0;
  const lanes: Record<Lane, number> = {
    normal: 0, tight: 0, late_dump: 0, removed: 0, blocked_cancelled: 0,
  };
  const explanation: string[] = [];

  // STATUS-AWARE MODEL + BUG RETENTION (mirrors scoring.py:compute_employee_score).
  // credited = weight × effectiveCredit × correctiveFactor, where a feature
  // with an open linked bug is held at HOLD_CAP and corrective work (bug /
  // reopened) is discounted REWORK_PENALTY. Lanes still computed for display.
  for (const issue of issues) {
    const w = computeWeight(issue);
    const iid = issue.issue_id || "?";

    const credit = statusCredit(issue);
    // Excluded (canceled/duplicate) — out of numerator AND denominator.
    if (credit === null) {
      lanes.removed = (lanes.removed ?? 0) + 1;
      explanation.push(`${iid}  excluded (canceled/duplicate) — dropped (weight ${w})`);
      continue;
    }
    // Disposition labels also exclude.
    if (hasLabel(issue, REMOVE_LABELS)) {
      lanes.removed = (lanes.removed ?? 0) + 1;
      explanation.push(`${iid}  removed (wontfix/duplicate label) — dropped (weight ${w})`);
      continue;
    }

    const lane = classifyLane(issue, cycleEnd);
    if (lane in lanes) lanes[lane] = (lanes[lane] ?? 0) + 1;

    // 1) Quality HOLD: a feature with an open linked bug can't exceed HOLD_CAP.
    const heldHere = !isBug(issue) && held.has(iid) && credit > HOLD_CAP;
    let effCredit = heldHere ? HOLD_CAP : credit;
    // 2) Corrective DISCOUNT: a bug, or a reopened issue, at 0.7×.
    const corrective = isCorrective(issue);
    if (corrective) effCredit *= REWORK_PENALTY;

    weightTotal += w;
    weightDone += w * effCredit;

    if (heldHere) {
      explanation.push(
        `${iid}  HELD (open bug) credit ${credit}→${HOLD_CAP}${
          corrective ? ` × ${REWORK_PENALTY}` : ""} → ${
          Math.round(effCredit * 100) / 100} (weight ${w})`,
      );
    } else if (corrective) {
      explanation.push(
        `${iid}  ${isBug(issue) ? "bug" : "reworked"} credit=${credit} × ${
          REWORK_PENALTY} → ${Math.round(effCredit * 100) / 100} (weight ${w})`,
      );
    } else if (credit >= DEV_DONE_CREDIT) {
      explanation.push(`${iid}  dev-done credit=${credit} (weight ${w})`);
    }
  }

  const pct = weightTotal > 0 ? weightDone / weightTotal : null;

  return {
    weightDone: Math.round(weightDone * 100) / 100,
    weightTotal: Math.round(weightTotal * 100) / 100,
    pctComplete: pct,
    classification: classifyPct(pct),
    score0to10: scoreFromPct(pct),
    lanes,
    explanation,
  };
}

// ─── Cycle performance metric (mirrors scoring.py) ─────────────────────────

export const TIMELINESS_MAX_BONUS = 0.5;   // bonus only — never a penalty

export type CyclePerformance = {
  throughput: number;               // 0..1 weighted completion
  onTimeRate: number | null;        // 0..1 of ESTIMATED completed; null if none judged
  baseScore: number | null;         // 0..10 from throughput alone
  cycleScore: number | null;        // 0..10 = base + timeliness BONUS (>= base)
  classification: "high" | "mid" | "low" | "no_data";
  weightDone: number;
  weightTotal: number;
  nCompleted: number;
  nCounted: number;
  nTotal: number;
  lanes: Record<Lane, number>;
};

/** True if a COMPLETED, ESTIMATED issue was done within its fair window.
 *  null when not completed, not estimated, or dates missing.
 *  Fair window starts at max(assigned_at, cycle_start) so carry-overs get
 *  a fresh window each cycle (no "target stuck in the past"). */
function issueOnTime(
  issue: Issue & { effective_assigned_at?: string | null },
  cycleStart: string | Date | null,
): boolean | null {
  if (!isCompleted(issue)) return null;
  if (!hasSpEstimate(issue)) return null;   // don't judge unestimated work
  const completedMs = issue.completed_at ? Date.parse(issue.completed_at) : NaN;
  const assignedStr = issue.effective_assigned_at ?? issue.assigned_at ?? null;
  const assignedMs = assignedStr ? Date.parse(assignedStr) : NaN;
  if (Number.isNaN(completedMs) || Number.isNaN(assignedMs)) return null;
  const startMs = cycleStart
    ? (typeof cycleStart === "string" ? Date.parse(cycleStart) : cycleStart.getTime())
    : NaN;
  const windowStart = Number.isNaN(startMs) ? assignedMs : Math.max(assignedMs, startMs);
  const targetMs = windowStart + computeExpectedDays(issue) * 86_400_000;
  return completedMs <= targetMs;
}

export function computeCyclePerformance(
  issues: (Issue & { effective_assigned_at?: string | null })[],
  cycleEnd: string | Date,
  cycleStart: string | Date | null = null,
  heldFeatures?: Set<string>,
): CyclePerformance {
  const es = computeEmployeeScore(issues, cycleEnd, heldFeatures);
  const base = es.score0to10;

  const completed = issues.filter(isCompleted);
  const judged = issues
    .map((it) => issueOnTime(it, cycleStart))
    .filter((f): f is boolean => f !== null);
  const onTimeRate = judged.length > 0
    ? judged.filter(Boolean).length / judged.length
    : null;

  let cycleScore: number | null = null;
  if (base !== null) {
    // BONUS ONLY: 0..1 → +0..+0.5. Never below base. Late/incomplete is
    // not penalised here (throughput already reflects it).
    const rate = onTimeRate ?? 0;
    const bonus = rate * TIMELINESS_MAX_BONUS;
    cycleScore = Math.round(Math.min(10, base + bonus) * 100) / 100;
  }

  return {
    throughput: es.pctComplete ?? 0,
    onTimeRate,
    baseScore: base,
    cycleScore,
    classification: es.classification,
    weightDone: es.weightDone,
    weightTotal: es.weightTotal,
    nCompleted: completed.length,
    nCounted: (es.lanes.normal ?? 0) + (es.lanes.tight ?? 0),
    nTotal: issues.length,
    lanes: es.lanes,
  };
}
