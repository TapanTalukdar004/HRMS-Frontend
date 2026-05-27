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
  if (s.startsWith("p0") || s === "critical" || s === "blocker") return "p0";
  if (s.startsWith("p1") || s === "high") return "p1";
  if (s.startsWith("p2") || s === "medium" || s === "normal") return "p2";
  if (s === "low" || s === "minor" || s === "trivial") return "low";
  return "p2";
}

/** True when Esha sent a real SP value > 0 for this issue.
 *  UI uses this to display a "no estimate" data-quality flag. */
export function hasSpEstimate(issue: Issue): boolean {
  const sp = issue.story_points;
  if (sp === null || sp === undefined) return false;
  const v = Number(sp);
  return Number.isFinite(v) && v > 0;
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
): EmployeeScore {
  let weightDone = 0;
  let weightTotal = 0;
  const lanes: Record<Lane, number> = {
    normal: 0, tight: 0, late_dump: 0, removed: 0, blocked_cancelled: 0,
  };
  const explanation: string[] = [];

  for (const issue of issues) {
    const lane = classifyLane(issue, cycleEnd);
    lanes[lane] = (lanes[lane] ?? 0) + 1;
    const w = computeWeight(issue);
    const iid = issue.issue_id || "?";
    const done = isCompleted(issue);

    // Disposition labels — always excluded.
    if (lane === "removed") {
      explanation.push(`${iid}  removed (wontfix/duplicate/cancelled) — excluded (weight ${w})`);
      continue;
    }

    // Late-dump asymmetric rule (mirrors scoring.py):
    //   • completed   → fully credited (heroic delivery counts!)
    //   • incomplete  → excluded entirely (no penalty for unfair scope)
    if (lane === "late_dump") {
      if (done) {
        weightTotal += w;
        weightDone += w;
        explanation.push(`${iid}  late dump COMPLETED → counted in full (weight ${w})`);
      } else {
        explanation.push(`${iid}  late dump not done → excluded, no penalty (weight ${w})`);
      }
      continue;
    }

    // Normal + tight-fair: always in denominator.
    weightTotal += w;
    if (done) {
      const effectiveW = lane === "tight" ? w * TIGHT_BONUS : w;
      weightDone += effectiveW;
      if (lane === "tight") {
        explanation.push(
          `${iid}  tight-fair completed → bonus weight ${Math.round(effectiveW * 100) / 100} (base ${w})`,
        );
      }
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
