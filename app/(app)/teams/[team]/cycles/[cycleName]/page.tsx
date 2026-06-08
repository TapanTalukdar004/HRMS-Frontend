import Link from "next/link";
import { notFound } from "next/navigation";
import {
  listSnapshotsForCycle,
  getCycleIssuesByEmployee,
  getCycleIssuesAcrossSnapshots,
  getCyclePreviousSnapshotChanges,
  getCrossCyclePriorAppearance,
  getCycleCompleteness,
  listTeams,
} from "@/lib/queries";
import { SnapshotDatePicker } from "@/components/SnapshotDatePicker";
import { BackButton } from "@/components/BackButton";
import {
  computeEmployeeScore,
  computeWeight,
  computeExpectedDays,
  classifyLane,
  isCompleted,
  isDevComplete,
  statusCredit,
  hasSpEstimate,
  qualityState,
  reopenCount,
  REWORK_PENALTY,
  HOLD_CAP,
  isBug,
  isCorrective,
  heldFeatureIds,
  type Lane,
  type Issue,
} from "@/lib/issueScoring";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  params: Promise<{ team: string; cycleName: string }>;
  searchParams: Promise<{ snapshot?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { team, cycleName } = await params;
  return {
    title: `${decodeURIComponent(cycleName)} · ${decodeURIComponent(team)} · HR Bot`,
  };
}

function pct(done: number | null, total: number | null): string {
  if (!total || total === 0) return "—";
  return `${Math.round(((done ?? 0) / total) * 100)}%`;
}

/** Compact number: integer as-is, else one decimal. Coerces defensively
 *  because pg returns NUMERIC columns as strings. Module-scope so both
 *  the Team Pulse block and the summary table can use it. */
function fmtNum(n: number | string | null | undefined): string {
  const x = Number(n) || 0;
  return Number.isInteger(x) ? `${x}` : x.toFixed(1);
}

/** A column header that reveals its full meaning on hover.  The dotted
 *  underline + help cursor signal "hover me" to non-technical readers. */
function Hdr({ tip, children }: { tip: string; children: React.ReactNode }) {
  return (
    <span
      title={tip}
      className="cursor-help border-b border-dotted border-slate-400/70 hover:text-slate-700"
    >
      {children}
    </span>
  );
}

/** Coarse pipeline bucket for an issue, from its status credit.
 *  not_started (0) · building (<0.80) · in_qa (0.80–0.94) · done (≥0.95). */
type StageKey = "not_started" | "building" | "in_qa" | "done";
function stageBucket(it: import("@/lib/queries").CycleIssue): StageKey | null {
  const c = statusCredit(it);
  if (c === null) return null;          // excluded (canceled/duplicate)
  if (c === 0) return "not_started";
  if (c < 0.80) return "building";
  if (c < 0.95) return "in_qa";
  return "done";
}

const STAGE_META: Record<StageKey, { label: string; color: string }> = {
  not_started: { label: "Not started", color: "#cbd5e1" }, // slate-300
  building:    { label: "Building / review", color: "#60a5fa" }, // blue-400
  in_qa:       { label: "In QA / testing", color: "#f59e0b" }, // amber-500
  done:        { label: "Approved / shipped", color: "#10b981" }, // emerald-500
};

/** A compact stacked bar showing how a person's issues split across the
 *  pipeline — so "24 of 30" is no longer mistaken for "24 completed".
 *  Hover shows exact counts. */
function StageBar({ stages, total }: { stages: Record<StageKey, number>; total: number }) {
  const order: StageKey[] = ["done", "in_qa", "building", "not_started"];
  const tip = order
    .filter((k) => stages[k] > 0)
    .map((k) => `${stages[k]} ${STAGE_META[k].label.toLowerCase()}`)
    .join(" · ");
  return (
    <div className="flex items-center gap-2" title={tip || "no issues"}>
      <div className="flex h-2.5 w-28 rounded-full overflow-hidden bg-stone-100 flex-none">
        {order.map((k) =>
          stages[k] > 0 ? (
            <div key={k} style={{ width: `${(stages[k] / total) * 100}%`, background: STAGE_META[k].color }} />
          ) : null,
        )}
      </div>
      <span className="text-[11px] tabular-nums text-slate-500 flex-none">
        <span className="text-emerald-700 font-semibold">{stages.done}</span>
        <span className="text-amber-600"> +{stages.in_qa}</span>
        <span className="text-slate-400"> /{total}</span>
      </span>
    </div>
  );
}

function classBadge(c: string | null) {
  if (c === "high") return <span className="inline-block text-[11px] bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 rounded-full px-2 py-0.5">on track</span>;
  if (c === "mid")  return <span className="inline-block text-[11px] bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 rounded-full px-2 py-0.5">mid</span>;
  if (c === "low")  return <span className="inline-block text-[11px] bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 rounded-full px-2 py-0.5">behind</span>;
  return <span className="inline-block text-[11px] bg-stone-100 text-slate-500 ring-1 ring-inset ring-stone-300 rounded-full px-2 py-0.5">—</span>;
}

function laneBadge(lane: Lane) {
  const map: Record<Lane, { label: string; cls: string }> = {
    normal:            { label: "normal",     cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    tight:             { label: "tight-fair", cls: "bg-amber-50  text-amber-700  ring-amber-200" },
    late_dump:         { label: "late dump",  cls: "bg-rose-50   text-rose-700   ring-rose-200" },
    removed:           { label: "removed",    cls: "bg-slate-100 text-slate-500  ring-slate-200" },
    blocked_cancelled: { label: "blocked",    cls: "bg-blue-50   text-blue-700   ring-blue-200" },
  };
  const v = map[lane];
  return (
    <span className={`inline-block text-[10px] ${v.cls} ring-1 ring-inset rounded-full px-1.5 py-0.5`}>
      {v.label}
    </span>
  );
}

function priorityBadge(p: string | null | undefined) {
  if (!p) return <span className="text-slate-300">—</span>;
  const cls = p === "p0" ? "bg-rose-100 text-rose-800"
            : p === "p1" ? "bg-amber-100 text-amber-800"
            : p === "p2" ? "bg-stone-100 text-slate-700"
            : "bg-slate-50 text-slate-500";
  return <span className={`inline-block text-[10px] ${cls} rounded px-1.5 py-0.5 font-mono`}>{p}</span>;
}

function StatTile({ label, value, sub, accent }: {
  label: string;
  value: string;
  sub?: string;
  accent?: "emerald" | "amber" | "rose";
}) {
  const accentBg = accent === "emerald" ? "from-emerald-50 to-white border-emerald-100"
                 : accent === "amber"   ? "from-amber-50 to-white border-amber-100"
                 : accent === "rose"    ? "from-rose-50 to-white border-rose-100"
                 :                        "from-white to-stone-50/40 border-stone-200";
  const accentValue = accent === "emerald" ? "text-emerald-700"
                    : accent === "amber"   ? "text-amber-700"
                    : accent === "rose"    ? "text-rose-700"
                    :                        "text-slate-900";
  return (
    <div className={`bg-gradient-to-br ${accentBg} border rounded-xl p-4`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{label}</div>
      <div className={`text-xl font-bold tabular-nums leading-tight ${accentValue}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function DiffPill({ icon, label, count, accent }: {
  icon: string;
  label: string;
  count: number;
  accent: "emerald" | "amber" | "violet" | "blue" | "rose";
}) {
  const isZero = count === 0;
  const accentBg = isZero
    ? "bg-stone-50 border-stone-200 text-slate-400"
    : accent === "emerald" ? "bg-emerald-50 border-emerald-200 text-emerald-800"
    : accent === "amber"   ? "bg-amber-50 border-amber-200 text-amber-800"
    : accent === "violet"  ? "bg-violet-50 border-violet-200 text-violet-800"
    : accent === "blue"    ? "bg-blue-50 border-blue-200 text-blue-800"
    :                        "bg-rose-50 border-rose-200 text-rose-800";
  return (
    <div className={`border rounded-xl px-3 py-2 ${accentBg}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-base leading-none" aria-hidden>{icon}</span>
        <span className="text-2xl font-bold tabular-nums leading-none">{count}</span>
      </div>
      <div className={`text-[10px] uppercase tracking-wider mt-1 ${isZero ? "text-slate-400" : "opacity-80"}`}>{label}</div>
    </div>
  );
}

function statusBadge(s: string | null | undefined) {
  if (!s) return <span className="text-slate-300">—</span>;
  const key = s.toLowerCase();
  if (key === "done" || key === "completed" || key === "closed") {
    return <span className="inline-block text-[10px] bg-emerald-100 text-emerald-800 rounded px-1.5 py-0.5">done</span>;
  }
  if (key === "in_progress" || key === "started") {
    return <span className="inline-block text-[10px] bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">in&nbsp;progress</span>;
  }
  return <span className="inline-block text-[10px] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{s}</span>;
}

/**
 * Compute team-wide stats for the Team Pulse hero.
 * Pure function over the parsed issue map — no DB hits.
 */
function computeTeamPulse(
  issuesByEmployee: Record<string, import("@/lib/queries").CycleIssue[]>,
  cycleEnd: string | Date,
) {
  let totalWeight = 0;
  let doneWeight = 0;          // status-credit-weighted (Σ weight × credit)
  let totalIssues = 0;
  let doneIssues = 0;          // formally Done (shipped/closed)
  let devCompleteIssues = 0;   // past the QA handoff line (dev work finished)
  let nMissingSp = 0;          // data-quality counter
  const lanes: Record<Lane, number> = {
    normal: 0, tight: 0, late_dump: 0, removed: 0, blocked_cancelled: 0,
  };
  const priorityBuckets: Record<"p0" | "p1" | "p2" | "low" | "other", { open: number; done: number; totalWeight: number }> = {
    p0:    { open: 0, done: 0, totalWeight: 0 },
    p1:    { open: 0, done: 0, totalWeight: 0 },
    p2:    { open: 0, done: 0, totalWeight: 0 },
    low:   { open: 0, done: 0, totalWeight: 0 },
    other: { open: 0, done: 0, totalWeight: 0 },
  };
  const perEmployee: { name: string; pct: number | null; weightDone: number; weightTotal: number; classification: string }[] = [];

  // BUG RETENTION: a feature with an OPEN linked bug is held at HOLD_CAP until
  // it clears. Built once from the WHOLE cycle (bugs may belong to a different
  // assignee than the feature owner). Passed into every score so Team Pulse,
  // the per-person rows, and the employee page all agree.
  const allCycleIssues: Issue[] = Object.values(issuesByEmployee).flat();
  const held = heldFeatureIds(allCycleIssues);

  for (const [name, issues] of Object.entries(issuesByEmployee)) {
    const score = computeEmployeeScore(issues, cycleEnd, held);
    perEmployee.push({
      name,
      pct: score.pctComplete,
      weightDone: score.weightDone,
      weightTotal: score.weightTotal,
      classification: score.classification,
    });
    for (const it of issues) {
      const lane = classifyLane(it, cycleEnd);
      lanes[lane] += 1;
      const w = computeWeight(it);
      totalIssues += 1;
      if (!hasSpEstimate(it)) nMissingSp += 1;

      const credit = statusCredit(it);            // 0..1, null = excluded
      if (credit === null) continue;              // canceled/duplicate — drop
      const isDone = isCompleted(it);             // formally Done
      const devDone = isDevComplete(it);          // past QA handoff
      if (isDone) doneIssues += 1;
      if (devDone) devCompleteIssues += 1;

      // STATUS-AWARE + BUG RETENTION: total = all non-excluded; done uses the
      // same effective credit as the per-person score (hold + corrective).
      const heldHere = !isBug(it) && held.has(it.issue_id) && credit > HOLD_CAP;
      let eff = heldHere ? HOLD_CAP : credit;
      if (isCorrective(it)) eff *= REWORK_PENALTY;
      totalWeight += w;
      doneWeight += w * eff;

      const pri = (it.priority || "other").toLowerCase();
      const bucket = pri === "p0" || pri === "p1" || pri === "p2" || pri === "low" ? pri : "other";
      priorityBuckets[bucket].totalWeight += w;
      // "done" per priority now means dev-complete (past QA) — the
      // meaningful "finished" number, not just formally-closed.
      if (devDone) priorityBuckets[bucket].done += 1;
      else priorityBuckets[bucket].open += 1;
    }
  }

  // LEADERS rank by OUTPUT = weightDone (Σ weight × credit × rework) — i.e.
  // difficulty-weighted progress delivered, accounting for quality. This is
  // the "who carried the cycle" measure, NOT raw completion % (which would
  // crown someone with one tiny finished ticket).
  // "unassigned" is the bucket of issues no one officially owns in Linear —
  // never a person, so it's excluded from leaders / watch and shown last.
  const realPeople = perEmployee.filter(p => p.name !== "unassigned");
  const byOutput = [...realPeople].sort((a, b) => b.weightDone - a.weightDone);
  const topPerformers = byOutput.filter(p => p.weightDone > 0).slice(0, 3);
  // NEEDS ATTENTION = behind on a REAL load (so a lightly-loaded person who
  // did their bit isn't unfairly flagged). Low % + meaningful weight.
  const watchList = realPeople
    .filter(p => p.weightTotal >= 5 && (p.pct ?? 1) < 0.60)
    .sort((a, b) => (a.pct ?? 1) - (b.pct ?? 1))
    .slice(0, 3);

  return {
    totalIssues,
    doneIssues,
    devCompleteIssues,
    totalWeight: Math.round(totalWeight * 10) / 10,
    doneWeight: Math.round(doneWeight * 10) / 10,
    pctWeight: totalWeight > 0 ? doneWeight / totalWeight : 0,
    lanes,
    priorityBuckets,
    topPerformers,
    watchList,
    nMissingSp,
    nHigh: perEmployee.filter(p => p.classification === "high").length,
    nMid:  perEmployee.filter(p => p.classification === "mid").length,
    nLow:  perEmployee.filter(p => p.classification === "low").length,
  };
}

/**
 * Compute "Day N of M" position for the selected snapshot.
 * Inputs are date strings (YYYY-MM-DD) from cycle_start, cycle_end, snapshot_at.
 * Returns null when we don't have enough data to compute (defends against
 * legacy rows that pre-date v3 and don't carry cycle_start/end).
 */
function cyclePosition(
  snapAt: string | null,
  cycleStart: string | null,
  cycleEnd: string | null,
): null | { dayInCycle: number; totalDays: number; daysLeft: number; pctElapsed: number; cycleStartDate: string; cycleEndDate: string } {
  if (!snapAt || !cycleStart || !cycleEnd) return null;
  const snap = new Date(snapAt + (snapAt.length === 10 ? "T00:00:00Z" : ""));
  const start = new Date(cycleStart + "T00:00:00Z");
  const end = new Date(cycleEnd + "T23:59:59Z");
  const dayMs = 86_400_000;
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs));
  const dayInCycle = Math.max(1, Math.min(totalDays, Math.round((snap.getTime() - start.getTime()) / dayMs) + 1));
  const daysLeft = Math.max(0, Math.round((end.getTime() - snap.getTime()) / dayMs));
  const pctElapsed = Math.min(100, Math.max(0, (dayInCycle / totalDays) * 100));
  return {
    dayInCycle, totalDays, daysLeft, pctElapsed,
    cycleStartDate: start.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    cycleEndDate: end.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
  };
}


export default async function CycleDetailPage({ params, searchParams }: Props) {
  const { team: rawTeam, cycleName: rawCycleName } = await params;
  const team = decodeURIComponent(rawTeam);
  const cycleName = decodeURIComponent(rawCycleName);
  const sp = await searchParams;

  // Verify team exists + get PM
  const allTeams = await listTeams();
  const teamCard = allTeams.find((t) => t.team === team);
  if (!teamCard) return notFound();

  // All snapshots for this team+cycle (date picker source)
  const snapshots = await listSnapshotsForCycle(team, cycleName);
  if (snapshots.length === 0) return notFound();

  // Selected snapshot: from ?snapshot=<id>, defaulting to the LATEST
  const selectedSnapshotId = sp.snapshot ?? snapshots[snapshots.length - 1].cycle_id;
  const selected = snapshots.find((s) => s.cycle_id === selectedSnapshotId)
                 ?? snapshots[snapshots.length - 1];

  // ── v3 per-issue data ────────────────────────────────────────────────
  // Now uses the cross-snapshot query so employees who appeared earlier
  // in the cycle (and got dropped by Esha because they finished early
  // or briefly had no active work) stay visible with their last-known
  // state.  See getCycleIssuesAcrossSnapshots for the rationale.
  const [crossSnap, completenessByEmployee, prevChanges, priorCycleByIssue] = await Promise.all([
    getCycleIssuesAcrossSnapshots(team, cycleName, selected.cycle_id, selected.snapshot_at),
    getCycleCompleteness(selected.cycle_id),
    getCyclePreviousSnapshotChanges(team, cycleName, selected.snapshot_at),
    getCrossCyclePriorAppearance(team, cycleName),
  ]);
  // prevChanges is the new structured result.  Per-row "↑ from X"
  // indicators still want the original by-id map, so we keep it under
  // the old name for that path.
  const prevChangesByIssue = prevChanges.changes;
  const issuesByEmployee = crossSnap.issuesByEmployee;
  // BUG RETENTION: cycle-wide set of features with an open linked bug (held at
  // HOLD_CAP). Built once here so summary rows, the per-employee detail, and
  // the issue-row badges all use the SAME hold the Team Pulse uses.
  const held = heldFeatureIds(Object.values(issuesByEmployee).flat() as Issue[]);
  const lastSeenByEmployee = crossSnap.lastSeenByEmployee;
  const currentEmployeeSet = new Set(crossSnap.currentEmployeeNames);
  const reassignedAwayCount = crossSnap.reassignedAwayCount;
  const hasV3Data = Object.keys(issuesByEmployee).length > 0
                  || Object.keys(completenessByEmployee).length > 0;
  // Use cycle_end for lane classification; fall back to a far-future
  // date when missing so no issue is misclassified as late dump.
  const cycleEndForScoring = selected.cycle_end
    ? selected.cycle_end + "T23:59:59Z"
    : "2099-12-31T23:59:59Z";

  // ── Per-employee summary rows for the "Employees as of" table ──────────
  // Built from the SAME V3 per-issue data the cards use (so the table and
  // the cards agree).  % is the status-credit score; "done" counts mean
  // dev-complete (past QA).  Δ tickets/SP come from issues that are NEW vs
  // the previous snapshot (empty at a fresh baseline).
  const _newIdSet = new Set(prevChanges.newIssueIds);
  const summaryRows = Object.entries(issuesByEmployee).map(([name, issues]) => {
    const score = computeEmployeeScore(issues, cycleEndForScoring, held);
    const sp = (i: { story_points?: number | string | null }) => Number(i.story_points ?? 0) || 0;
    const spTotal = issues.reduce((s, i) => s + sp(i), 0);
    // SP-done is STRICT: only SP whose issue is truly shipped (Approved for
    // Prod / Released / Done, credit ≥ 0.95).  Work still in QA/review does
    // NOT count here — that nuance lives in the % (graded) column instead.
    const isShipped = (i: import("@/lib/queries").CycleIssue) => (statusCredit(i) ?? 0) >= 0.95;
    const spDone = issues.filter(isShipped).reduce((s, i) => s + sp(i), 0);
    const newOnes = issues.filter((i) => _newIdSet.has(i.issue_id));
    const stages: Record<StageKey, number> = { not_started: 0, building: 0, in_qa: 0, done: 0 };
    for (const i of issues) {
      const b = stageBucket(i);
      if (b) stages[b] += 1;
    }
    return {
      name,
      tickets_total: issues.length,
      stages,
      sp_total: spTotal,
      sp_done: spDone,
      pct: score.pctComplete,
      classification: score.classification,
      tickets_added: newOnes.length,
      sp_added: newOnes.reduce((s, i) => s + sp(i), 0),
    };
  }).sort((a, b) => {
    // "unassigned" always sinks to the bottom (it's a bucket, not a person).
    if (a.name === "unassigned") return 1;
    if (b.name === "unassigned") return -1;
    return (b.pct ?? -1) - (a.pct ?? -1);
  });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      <BackButton
        fallbackHref={`/teams/${encodeURIComponent(team)}`}
        fallbackLabel={`Back to ${team}`}
      />

      {/* Team + cycle header — PM up top, not in any row */}
      <div className="mt-4 mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          {cycleName}
        </h1>
        <div className="mt-2 flex items-center gap-4 text-sm">
          <span className="text-slate-500">
            <span className="text-slate-400 text-xs uppercase tracking-wider mr-2">Team</span>
            <span className="text-slate-800 font-medium">{team}</span>
          </span>
          {teamCard.active_pm && (
            <span className="text-slate-500">
              <span className="text-slate-400 text-xs uppercase tracking-wider mr-2">Project Manager</span>
              <span className="text-[#6745E8] font-medium">{teamCard.active_pm}</span>
            </span>
          )}
        </div>
      </div>

      {/* Cycle-position hero strip — "Day N of M · X days left" + visual bar.
          Tells the user exactly where in the cycle this snapshot sits. */}
      {(() => {
        const pos = cyclePosition(selected.snapshot_at, selected.cycle_start, selected.cycle_end);
        if (!pos) return null;
        const snapDate = new Date(selected.snapshot_at.slice(0, 10) + "T00:00:00Z");
        const snapLabel = snapDate.toLocaleDateString(undefined, {
          weekday: "long", day: "numeric", month: "long", year: "numeric",
        });
        const phase = pos.pctElapsed < 33 ? "early"
                    : pos.pctElapsed < 67 ? "mid"
                    : pos.pctElapsed < 100 ? "late"
                    : "ended";
        const phaseCls = phase === "early" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                       : phase === "mid"   ? "bg-amber-50 text-amber-700 ring-amber-200"
                       : phase === "late"  ? "bg-rose-50 text-rose-700 ring-rose-200"
                       :                     "bg-slate-100 text-slate-600 ring-slate-200";
        return (
          <div className="mb-8 bg-gradient-to-br from-[#faf7ff] to-white border border-[#ede9fe] rounded-2xl p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Snapshot</div>
                <div className="text-lg font-semibold text-slate-900">{snapLabel}</div>
                <div className="text-sm text-slate-500 mt-0.5">
                  Cycle runs <span className="text-slate-700 font-medium">{pos.cycleStartDate}</span> →{" "}
                  <span className="text-slate-700 font-medium">{pos.cycleEndDate}</span> ({pos.totalDays} days)
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`inline-block text-[11px] ${phaseCls} ring-1 ring-inset rounded-full px-2.5 py-1 font-medium`}>
                  {phase === "early" ? "Early cycle" : phase === "mid" ? "Mid cycle" : phase === "late" ? "Late cycle" : "Cycle ended"}
                </span>
                <div className="text-right">
                  <div className="text-2xl font-bold text-slate-900 leading-none tabular-nums">
                    Day {pos.dayInCycle}
                    <span className="text-slate-400 text-base font-normal"> / {pos.totalDays}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 tabular-nums">
                    {pos.daysLeft === 0
                      ? "Cycle ended"
                      : `${pos.daysLeft} day${pos.daysLeft === 1 ? "" : "s"} left`}
                  </div>
                </div>
              </div>
            </div>
            {/* Progress bar */}
            <div className="mt-4 h-2 rounded-full bg-stone-100 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#AE00D0] to-[#7B5AFF] transition-all"
                   style={{ width: `${pos.pctElapsed}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-slate-400 tabular-nums">
              <span>{pos.cycleStartDate}</span>
              <span>{Math.round(pos.pctElapsed)}% elapsed</span>
              <span>{pos.cycleEndDate}</span>
            </div>
          </div>
        );
      })()}

      {/* ─── Team Pulse — at-a-glance HR widgets ─────────────────────────── */}
      {hasV3Data && (() => {
        const pulse = computeTeamPulse(issuesByEmployee, cycleEndForScoring);
        const pctOverall = Math.round(pulse.pctWeight * 100);
        const totalIssuesAll = pulse.totalIssues;
        const fmt = (n: number) => Number.isInteger(n) ? `${n}` : n.toFixed(1);
        // Lane breakdown for donut
        const laneOrder: { key: Lane; label: string; color: string }[] = [
          { key: "normal",            label: "Normal",     color: "#10b981" },
          { key: "tight",             label: "Tight-fair", color: "#f59e0b" },
          { key: "late_dump",         label: "Late dump",  color: "#ef4444" },
          { key: "removed",           label: "Removed",    color: "#94a3b8" },
          { key: "blocked_cancelled", label: "Blocked",    color: "#3b82f6" },
        ];
        const laneSegs = laneOrder
          .map(l => ({ ...l, count: pulse.lanes[l.key] }))
          .filter(l => l.count > 0);
        const laneTotal = laneSegs.reduce((s, l) => s + l.count, 0) || 1;
        // Build conic-gradient string for the donut
        let accum = 0;
        const conicStops = laneSegs.map(l => {
          const start = (accum / laneTotal) * 360;
          accum += l.count;
          const end = (accum / laneTotal) * 360;
          return `${l.color} ${start}deg ${end}deg`;
        }).join(", ");
        return (
          <section className="mb-10">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                Team Pulse
              </h2>
              <span className="text-xs text-slate-400">snapshot {new Date(selected.snapshot_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
            </div>

            {/* 5-stat strip — HR-at-a-glance */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
              <StatTile label="Team weight" value={`${fmt(pulse.doneWeight)} / ${fmt(pulse.totalWeight)}`}
                        sub={`${pctOverall}% complete (status-weighted)`}
                        accent={pctOverall >= 60 ? "emerald" : pctOverall >= 30 ? "amber" : "rose"} />
              <StatTile label="Dev-complete"
                        value={`${pulse.devCompleteIssues} / ${totalIssuesAll}`}
                        sub={`${pulse.doneIssues} shipped · ${totalIssuesAll - pulse.devCompleteIssues} in flight`}
                        accent={pulse.devCompleteIssues >= totalIssuesAll * 0.6 ? "emerald" : pulse.devCompleteIssues >= totalIssuesAll * 0.3 ? "amber" : "rose"} />
              <StatTile label="Classification" value={`${pulse.nHigh} H · ${pulse.nMid} M · ${pulse.nLow} L`}
                        sub={`${pulse.nHigh + pulse.nMid + pulse.nLow} scored`}
                        accent={pulse.nLow > pulse.nHigh ? "rose" : "emerald"} />
              <StatTile label="Late dumps" value={`${pulse.lanes.late_dump}`}
                        sub={pulse.lanes.late_dump === 0 ? "no PM scope issues" : "excluded from scoring"}
                        accent={pulse.lanes.late_dump > 0 ? "rose" : "emerald"} />
              <StatTile label="Data quality"
                        value={pulse.nMissingSp === 0 ? "OK" : `${pulse.nMissingSp} of ${totalIssuesAll}`}
                        sub={pulse.nMissingSp === 0 ? "all issues estimated" : "missing SP — PM action"}
                        accent={pulse.nMissingSp === 0 ? "emerald" : pulse.nMissingSp > totalIssuesAll / 2 ? "rose" : "amber"} />
            </div>

            {/* Lane donut + Priority breakdown + Top/Watch lists */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {/* Lane donut */}
              <div className="bg-white rounded-xl border border-stone-200 p-5">
                <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">Lane mix</div>
                <div className="flex items-center gap-5">
                  <div className="relative w-24 h-24 rounded-full"
                       style={{ background: laneSegs.length > 0 ? `conic-gradient(${conicStops})` : "#e5e7eb" }}>
                    <div className="absolute inset-3 rounded-full bg-white flex items-center justify-center">
                      <div className="text-center leading-none">
                        <div className="text-lg font-bold text-slate-900 tabular-nums">{laneTotal}</div>
                        <div className="text-[9px] uppercase text-slate-400 tracking-wider">issues</div>
                      </div>
                    </div>
                  </div>
                  <ul className="text-xs space-y-1.5 flex-1">
                    {laneSegs.map(l => (
                      <li key={l.key} className="flex items-center gap-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
                        <span className="text-slate-700 flex-1">{l.label}</span>
                        <span className="tabular-nums text-slate-500">{l.count}</span>
                        <span className="tabular-nums text-slate-400 text-[10px] w-9 text-right">
                          {Math.round((l.count / laneTotal) * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Priority breakdown */}
              <div className="bg-white rounded-xl border border-stone-200 p-5">
                <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">Backlog by priority</div>
                <ul className="space-y-2.5">
                  {(["p0","p1","p2","low"] as const).map(p => {
                    const b = pulse.priorityBuckets[p];
                    const total = b.open + b.done;
                    if (total === 0) return null;
                    const pct = total > 0 ? (b.done / total) * 100 : 0;
                    const colorMap = { p0: "bg-rose-500", p1: "bg-amber-500", p2: "bg-slate-500", low: "bg-stone-400" };
                    return (
                      <li key={p}>
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-xs font-mono uppercase text-slate-700">{p}</span>
                          <span className="text-[11px] tabular-nums text-slate-500">
                            {b.done}/{total} done · {fmt(b.totalWeight)} weight
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                          <div className={`h-full ${colorMap[p]} transition-all`}
                               style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Top performers + Watch list */}
              <div className="bg-white rounded-xl border border-stone-200 p-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-emerald-600 mb-2"
                         title="Ranked by OUTPUT = difficulty-weighted progress delivered (volume × how-far × quality). This is a contribution measure, not the same as completion %. The big number is output points; the % in brackets is that person's completion rate.">
                      Top performers <span className="text-slate-400 normal-case tracking-normal">· by output</span></div>
                    {pulse.topPerformers.length === 0 ? (
                      <div className="text-xs text-slate-400 italic">Nobody completed work yet</div>
                    ) : (
                      <ul className="space-y-2">
                        {pulse.topPerformers.map((p, i) => (
                          <li key={p.name} className="flex items-center gap-2 text-sm">
                            <span className={`inline-flex w-5 h-5 items-center justify-center rounded-full text-[10px] font-bold ${
                              i === 0 ? "bg-amber-100 text-amber-700"
                              : i === 1 ? "bg-slate-200 text-slate-700"
                              : "bg-amber-50 text-amber-700"
                            }`}>{i + 1}</span>
                            <span className="text-slate-800 font-medium flex-1 truncate">{p.name}</span>
                            <span className="text-[12px] tabular-nums text-slate-800 font-semibold" title="Output = weighted progress delivered (Σ weight × credit). The cycle's main 'who carried it' number.">{fmt(p.weightDone)}</span>
                            <span className="text-[10px] tabular-nums text-slate-400" title="That person's completion % (how far along their own assigned work is).">({p.pct !== null ? Math.round(p.pct * 100) : "—"}%)</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-rose-600 mb-2"
                         title="Behind on a real workload: completion under 60% with meaningful weight assigned. Lightly-loaded people are not flagged here.">
                      Needs attention</div>
                    {pulse.watchList.length === 0 ? (
                      <div className="text-xs text-slate-400 italic">All clear</div>
                    ) : (
                      <ul className="space-y-2">
                        {pulse.watchList.map((p) => (
                          <li key={p.name} className="flex items-center gap-2 text-sm">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500" />
                            <span className="text-slate-800 font-medium flex-1 truncate">{p.name}</span>
                            <span className="text-[11px] tabular-nums text-rose-600 font-medium">
                              {p.pct !== null ? Math.round(p.pct * 100) : "—"}%
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* Snapshot date picker */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Choose a date to view employee progress
        </h2>
        <SnapshotDatePicker
          options={snapshots.map((s, i) => ({
            id: s.cycle_id,
            snapshot_at: s.snapshot_at,
            days_left: s.days_left,
            is_current: i === snapshots.length - 1,
          }))}
          selectedId={selected.cycle_id}
        />
        <p className="mt-2 text-xs text-slate-400">
          {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""} on record. The current snapshot is selected by default.
        </p>
      </section>

      {/* Employee table — only employee-wise data, as of selected snapshot */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Employees as of <span className="text-slate-700 normal-case">
            {new Date(selected.snapshot_at).toLocaleDateString(undefined, {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            })}
          </span>
        </h2>
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-3">
                  <Hdr tip="The team member. Click any name to open their full personal history.">Employee</Hdr>
                </th>
                <th className="text-left px-4 py-3">
                  <Hdr tip="Where this person's issues sit in the pipeline. GREEN = approved / shipped (truly done). AMBER = in QA / testing (dev work finished, being verified). BLUE = still building / in review. GREY = not started. The number reads: ✓approved + in-QA / total. Hover the bar for exact counts.">Pipeline</Hdr>
                </th>
                <th className="text-right px-4 py-3">
                  <Hdr tip="Δ tickets: how many NEW issues landed on this person since the previous snapshot. Blank at a fresh baseline.">Δ tix</Hdr>
                </th>
                <th className="text-right px-4 py-3">
                  <Hdr tip="Story points SHIPPED / total committed. Strict: only counts issues that reached Approved-for-Prod or later. Work still in QA/review is NOT counted here — see the % column for graded progress.">SP shipped</Hdr>
                </th>
                <th className="text-right px-4 py-3">
                  <Hdr tip="Δ story points: SP added since the previous snapshot.">Δ sp</Hdr>
                </th>
                <th className="text-right px-4 py-3">
                  <Hdr tip="Status-weighted completion — the score. Every issue earns partial credit by stage: In QA 80%, Approved 95%, Done 100%. This is why someone with 0 fully-shipped issues can still be 70%+.">%</Hdr>
                </th>
                <th className="text-left px-4 py-3">
                  <Hdr tip="Band from the %: on track (≥80%), mid (60–79%), behind (<60%).">Status</Hdr>
                </th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((e) => {
                const pctNum = e.pct === null ? null : Math.round(e.pct * 100);
                const tone = pctNum === null ? "text-slate-400"
                  : pctNum >= 80 ? "text-emerald-700"
                  : pctNum >= 60 ? "text-amber-700"
                  : "text-rose-700";
                const scopeGrew = e.tickets_added > 0 || e.sp_added > 0;
                return (
                  <tr key={e.name}
                      className={`border-t border-stone-100 hover:bg-stone-50 ${scopeGrew ? "bg-amber-50/30" : ""}`}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link
                        href={`/employees/${encodeURIComponent(e.name)}?cycle=${encodeURIComponent(cycleName)}`}
                        className="hover:text-[#AE00D0] hover:underline"
                      >
                        {e.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StageBar stages={e.stages} total={e.tickets_total} />
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums text-xs ${
                      e.tickets_added > 0 ? "text-amber-700 font-semibold" : "text-slate-300"
                    }`}>
                      {e.tickets_added > 0 ? `+${e.tickets_added}` : "·"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtNum(e.sp_done)}/{fmtNum(e.sp_total)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums text-xs ${
                      e.sp_added > 0 ? "text-amber-700 font-semibold" : "text-slate-300"
                    }`}>
                      {e.sp_added > 0 ? `+${fmtNum(e.sp_added)}` : "·"}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${tone}`}>
                      {pctNum === null ? "—" : `${pctNum}%`}
                    </td>
                    <td className="px-4 py-3">{classBadge(e.classification)}</td>
                  </tr>
                );
              })}
              {summaryRows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No employees in this snapshot.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-slate-500 leading-relaxed space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-slate-700">Pipeline bar:</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "#10b981" }} /> approved / shipped</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "#f59e0b" }} /> in QA / testing</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "#60a5fa" }} /> building / review</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "#cbd5e1" }} /> not started</span>
          </div>
          <p>
            The bar shows <b>where each person&apos;s work actually sits</b> — so &ldquo;24/30&rdquo; can&apos;t be misread as &ldquo;24 finished.&rdquo;
            The number reads <span className="text-emerald-700 font-semibold">✓ approved</span> <span className="text-amber-600 font-semibold">+ in-QA</span> / total. Hover for exact counts.
            <span className="font-semibold text-slate-700 ml-2">%</span> = status-weighted completion (the score: In QA 80% → Approved 95% → Done 100%).
            <span className="text-amber-700 font-semibold ml-2">+N</span> = added since the previous snapshot. Click a name for full history.
          </p>
        </div>
      </section>

      {/* ─── What changed since previous snapshot ─────────────────────── */}
      {/* Renders whenever a previous snapshot exists in the SAME cycle.
          On Day 1 of a cycle prevChanges.prevSnapshotAt is null and the
          card stays hidden (a "Day 1 — nothing to diff yet" message
          would also be reasonable; we just hide for now to keep the
          page clean).  When it's Day 2+ the card ALWAYS renders even
          if every bucket is 0 — that way the absence of activity is
          itself visible, instead of the card mysteriously disappearing. */}
      {hasV3Data && prevChanges.prevSnapshotAt && (() => {
        const changes = Object.values(prevChangesByIssue);
        const prevSnapshotAt = prevChanges.prevSnapshotAt;
        const allIssuesFlat = Object.values(issuesByEmployee).flat();
        const issueById = new Map(allIssuesFlat.map(i => [i.issue_id, i]));
        let nPriority = 0, nSp = 0, nStatusDone = 0, nStatusOther = 0, nReassigned = 0;
        for (const c of changes) {
          const cur = issueById.get(c.issue_id);
          if (!cur) continue;
          if (cur.priority !== c.prev_priority)             nPriority++;
          if (cur.story_points !== c.prev_story_points)     nSp++;
          if (cur.status !== c.prev_status) {
            if (cur.status === "done")                       nStatusDone++;
            else                                             nStatusOther++;
          }
          if (cur.employee_name !== c.prev_employee_name)   nReassigned++;
        }
        const nNew = prevChanges.newIssueIds.length;
        const nDropped = prevChanges.droppedIssueIds.length;
        const totalActivity =
          nStatusDone + nPriority + nSp + nStatusOther + nReassigned + nNew + nDropped;
        return (
          <section className="mt-10">
            <div className="bg-gradient-to-br from-violet-50/40 via-white to-amber-50/30 border border-violet-100 rounded-2xl p-5">
              <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">
                  What changed since previous snapshot
                </h2>
                <span className="text-xs text-slate-500">
                  diff vs <b className="text-slate-700">{new Date(prevSnapshotAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</b>
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <DiffPill icon="✓" label="Completed"       count={nStatusDone}   accent="emerald" />
                <DiffPill icon="↑" label="Priority bumped" count={nPriority}     accent="amber" />
                <DiffPill icon="↑" label="SP re-pointed"   count={nSp}           accent="violet" />
                <DiffPill icon="↻" label="Status flipped"  count={nStatusOther}  accent="blue" />
                <DiffPill icon="↻" label="Reassigned"      count={nReassigned}   accent="rose" />
                <DiffPill icon="+" label="New issues"      count={nNew}          accent="violet" />
                <DiffPill icon="−" label="Dropped"         count={nDropped}      accent="amber" />
              </div>
              {totalActivity === 0 ? (
                <p className="text-[11px] text-slate-500 mt-3">
                  Quiet day — no priority / SP / status / assignee changes and
                  no issues added or removed.  Not unusual mid-cycle, especially
                  in the first 24–48 hours after a sprint starts.
                </p>
              ) : (
                <>
                  <p className="text-[11px] text-slate-500 mt-3">
                    Mid-cycle changes are normal — but a flurry of priority bumps
                    or status reversals close to cycle end is worth a PM
                    conversation. Each affected issue row shows a small{" "}
                    <span className="text-violet-600 font-medium">↑ from X</span>{" "}
                    indicator so you can see exactly what shifted.
                  </p>
                  {(nNew > 0 || nDropped > 0) && (
                    <p className="text-[11px] text-slate-500 mt-2">
                      {nNew > 0 && (
                        <>
                          <span className="font-medium text-slate-700">New today:</span>{" "}
                          {prevChanges.newIssueIds.slice(0, 12).join(", ")}
                          {prevChanges.newIssueIds.length > 12 ? ` +${prevChanges.newIssueIds.length - 12} more` : ""}.{" "}
                        </>
                      )}
                      {nDropped > 0 && (
                        <>
                          <span className="font-medium text-slate-700">Dropped:</span>{" "}
                          {prevChanges.droppedIssueIds.slice(0, 12).join(", ")}
                          {prevChanges.droppedIssueIds.length > 12 ? ` +${prevChanges.droppedIssueIds.length - 12} more` : ""}.
                          {nDropped > 0 && " Worth confirming whether these were intentional descopes."}
                        </>
                      )}
                    </p>
                  )}
                </>
              )}
            </div>
          </section>
        );
      })()}

      {/* ─── v3 per-issue detail ──────────────────────────────────────── */}
      {hasV3Data && (
        <section className="mt-12">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Issue-level detail (v3)
          </h2>
          {/* ── "How to read this" explainer ────────────────────────── */}
          <details className="mb-5 bg-gradient-to-br from-violet-50/50 to-white border border-violet-100 rounded-xl">
            <summary className="cursor-pointer list-none px-4 py-3 select-none">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold">i</span>
                  <span className="text-sm font-semibold text-slate-800">How to read this</span>
                  <span className="text-xs text-slate-500">— column meanings &amp; scoring formula</span>
                </div>
                <span className="text-xs text-violet-600 group-open:rotate-90">▸ click to expand</span>
              </div>
            </summary>
            <div className="px-4 pb-4 pt-2 border-t border-violet-100">
              <p className="text-[13px] text-slate-600 leading-relaxed mb-4">
                A person&apos;s score is <b>not</b> &ldquo;how many issues are fully closed.&rdquo; It&apos;s
                <b> how far their work has moved through the pipeline.</b> Every issue earns
                partial credit as it advances — most of it by the time the developer hands off
                to QA. That&apos;s why someone with <b>0 formally-Done issues can still score 70%+</b>:
                their work is finished and sitting in QA / review / approved, just not closed.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                {/* ── Status-credit ladder ── */}
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Credit by status (the engine)</h3>
                  <table className="w-full text-[12px]">
                    <thead className="text-[10px] uppercase tracking-wider text-slate-400">
                      <tr><th className="text-left pb-1">status</th><th className="text-right pb-1">credit</th><th className="text-left pb-1 pl-3">meaning</th></tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {[
                        ["Todo / Backlog", "0%", "not started", "text-slate-400"],
                        ["In Development", "30%", "actively building", "text-slate-600"],
                        ["Code Review", "55%", "code written, in review", "text-slate-600"],
                        ["In Review", "65%", "later review", "text-slate-600"],
                        ["In QA / Ready-Deploy", "78%", "dev work DONE — handoff", "text-emerald-700 font-semibold"],
                        ["PT Review", "86%", "product testing", "text-slate-600"],
                        ["Approved for Prod", "93%", "passed all gates", "text-slate-600"],
                        ["Released / Done", "100%", "shipped / closed", "text-slate-600"],
                      ].map(([s, c, m, cls]) => (
                        <tr key={s as string} className="border-t border-violet-100">
                          <td className="py-1 pr-2">{s}</td>
                          <td className={`text-right font-bold ${cls}`}>{c}</td>
                          <td className="pl-3 text-slate-500 text-[11px]">{m}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                    The last 78%→100% is a <b>quality reserve</b>: released only as QA/PT/Prod confirm
                    the work is clean. If QA finds a bug and bounces it back, the status drops — so the
                    credit drops automatically — and a re-completion lands at <b>0.7×</b> (rework).
                  </p>
                </div>

                {/* ── Weight: priority × story points ── */}
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Weight — how much each issue counts</h3>
                  <p className="text-[12px] text-slate-600 leading-relaxed mb-2">
                    Status credit answers <i>how far</i>; <b>weight</b> answers <i>how much it matters</i>.
                    A p0 issue counts twice a p2 of the same size.
                  </p>
                  <table className="w-full text-[12px]">
                    <thead className="text-[10px] uppercase tracking-wider text-slate-400">
                      <tr><th className="text-left pb-1">priority</th><th className="text-right pb-1">× multiplier</th><th className="text-left pb-1 pl-3">meaning</th></tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {[
                        ["p0 — urgent", "×2.0", "most critical"],
                        ["p1 — high", "×1.5", ""],
                        ["p2 / no-priority", "×1.0", "baseline"],
                        ["low", "×0.7", "nice-to-have"],
                      ].map(([p, m, meaning]) => (
                        <tr key={p as string} className="border-t border-violet-100">
                          <td className="py-1 pr-2">{p}</td>
                          <td className="text-right font-bold text-slate-700">{m}</td>
                          <td className="pl-3 text-slate-500 text-[11px]">{meaning}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                    <code className="text-[10px] bg-stone-100 px-1 rounded">weight = story points × priority</code>
                    {" "}(no estimate → 1 SP, row flagged). Each issue&apos;s contribution =
                    {" "}<b>weight × status-credit</b> (× 0.7 if it&apos;s a bug or was reopened).
                    <br />Example: a p1 (×1.5), 2-SP issue in QA (78%) → 2 × 1.5 × 0.78 = <b>2.34</b>.
                  </p>
                </div>

                {/* ── Bug retention (hold & release) ── */}
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">🐞 Bugs &amp; bug-retention</h3>
                  <p className="text-[12px] text-slate-600 leading-relaxed">
                    Every issue is tagged <b>Bug</b> or <b>Feature</b> (from its Linear label) — shown as a chip
                    under each Issue&nbsp;ID. A bug is its own issue, linked back to the feature it came from
                    (<span className="font-mono text-[11px]">🐞 Bug →AB-412</span>).
                  </p>
                  <ul className="text-[11px] text-slate-500 mt-2 leading-relaxed list-disc pl-4 space-y-1">
                    <li><b className="text-violet-700">Hold &amp; release:</b> a feature with an <b>open</b> linked bug
                      is <b>held at 78%</b> (the <span className="font-mono">🛡 Held</span> chip) until the bug is
                      fixed — then it releases to its real credit. &ldquo;No full marks until it&apos;s correct.&rdquo;</li>
                    <li><b>Bug-fix work counts at 0.7×</b> (corrective), so shipping clean first time always
                      out-scores buggy-then-fixed.</li>
                    <li>Fixing the bug <b>any day / cycle later</b> restores the feature and adds the fix credit.</li>
                  </ul>
                </div>

                {/* ── Worked example ── */}
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Worked example — 0 done, still ~70%</h3>
                  <p className="text-[12px] text-slate-600 leading-relaxed mb-2">
                    An engineer with <b>30 issues, none formally &ldquo;Done&rdquo;</b>, but most past the QA line
                    (weight 1 each here, for clarity):
                  </p>
                  <table className="w-full text-[12px] tabular-nums">
                    <tbody>
                      <tr className="border-t border-violet-100"><td className="py-1">6 × Approved for Prod</td><td className="text-right text-slate-500">×0.93</td><td className="text-right font-medium">5.58</td></tr>
                      <tr className="border-t border-violet-100"><td className="py-1">6 × PT Review</td><td className="text-right text-slate-500">×0.86</td><td className="text-right font-medium">5.16</td></tr>
                      <tr className="border-t border-violet-100"><td className="py-1">12 × In QA / Ready</td><td className="text-right text-slate-500">×0.78</td><td className="text-right font-medium">9.36</td></tr>
                      <tr className="border-t border-violet-100"><td className="py-1">3 × In Development</td><td className="text-right text-slate-500">×0.30</td><td className="text-right font-medium">0.90</td></tr>
                      <tr className="border-t border-violet-100"><td className="py-1">3 × Todo</td><td className="text-right text-slate-500">×0.00</td><td className="text-right font-medium">0</td></tr>
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-violet-200 font-semibold">
                        <td className="py-1.5">earned ÷ total weight</td>
                        <td className="text-right" colSpan={2}>21.0 ÷ 30 = <span className="text-amber-700">70%</span></td>
                      </tr>
                    </tfoot>
                  </table>
                  <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                    Real rows weight by <code className="text-[10px] bg-stone-100 px-1 rounded">SP × priority</code>
                    {" "}(p0 2.0 / p1 1.5 / p2 1.0 / low 0.7; missing SP → 1). The % is the weighted credit.
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-violet-100 text-[12px] text-slate-600 leading-relaxed space-y-2">
                <div>
                  <b>Score per employee</b>:{" "}
                  <code className="text-[11px] bg-white border border-stone-200 px-2 py-0.5 rounded">
                    % = Σ (weight × status-credit) ÷ Σ weight
                  </code>{" "}
                  → <span className="text-emerald-700 font-semibold">HIGH ≥80%</span> /{" "}
                  <span className="text-amber-700 font-semibold">MID 60–79%</span> /{" "}
                  <span className="text-rose-700 font-semibold">LOW &lt;60%</span>.
                  <b> Team weight</b> is the same formula summed across everyone&apos;s issues.
                  Mid-cycle scores are live previews; finalised on cycle-end day. HR can add grace marks.
                </div>
                <div className="bg-white border border-stone-200 rounded-lg p-3">
                  <b>Three numbers, three questions</b> (they&apos;re different on purpose, not a bug):
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                    <li><b>Completion %</b> — how far along this person&apos;s own work is. Same number on the
                      team table and the employee page.</li>
                    <li><b>Output</b> (Top performers) — difficulty-weighted work delivered (volume × how-far ×
                      quality). Rewards carrying the most hard work, so it ranks differently from %.</li>
                    <li><b>Rating /10</b> (employee page) — the % mapped to 0–10, <i>plus</i> a small on-time
                      bonus. So it can sit slightly above the raw %.</li>
                  </ul>
                </div>
                <div>
                  <b>How we know an issue belongs to this cycle:</b> Linear tells us directly — every
                  issue carries the cycle it&apos;s in, so membership is exact <i>regardless of whether it
                  has an assigned date</i>. We do <b>not</b> guess from the issue number (AB-512 → AB-513
                  is just creation order, not cycle membership). An issue with no &ldquo;assigned&rdquo; date
                  still counts if Linear placed it in this cycle — it simply shows &ldquo;—&rdquo; for the date.
                </div>
              </div>
            </div>
          </details>

          <div className="space-y-3">
            {Object.keys(issuesByEmployee).length === 0 && (
              <div className="text-sm text-slate-400 italic">
                No per-issue data for this snapshot yet.
              </div>
            )}

            {Object.entries(issuesByEmployee)
              .sort(([a], [b]) => (a === "unassigned" ? 1 : b === "unassigned" ? -1 : 0))
              .map(([empName, issues]) => {
              // Use effective_assigned_at when scoring (reassignment-aware).
              const issuesForScoring = issues.map(it => ({ ...it, assigned_at: it.effective_assigned_at }));
              const score = computeEmployeeScore(issuesForScoring, cycleEndForScoring, held);
              const complete = completenessByEmployee[empName];
              const isTruncated = complete?.status === "truncated";
              const reassignedAway = reassignedAwayCount[empName] ?? 0;
              // Cross-cycle lineage for this employee's issues:
              //  - carried over from a prior cycle (same person)
              //  - inherited via cross-cycle reassignment (different person prior)
              let carriedOverCount = 0;
              let crossCycleInheritedCount = 0;
              for (const it of issues) {
                const prior = priorCycleByIssue[it.issue_id];
                if (!prior) continue;
                if (prior.prior_employee === empName) carriedOverCount++;
                else crossCycleInheritedCount++;
              }
              const pctStr = score.pctComplete !== null
                ? `${Math.round(score.pctComplete * 100)}%`
                : "—";
              return (
                <details key={empName}
                         className="group bg-white rounded-xl border border-stone-200 overflow-hidden hover:border-stone-300 transition-colors">
                  <summary className="cursor-pointer list-none px-3 sm:px-4 py-3 hover:bg-stone-50/60 select-none">
                    {/* Row 1 — identity + score (always fits) */}
                    <div className="flex items-center gap-2.5">
                      <span className="text-slate-400 group-open:rotate-90 transition-transform inline-block w-3 flex-none">▸</span>
                      <span className={`flex-none inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                        score.classification === "high"   ? "bg-emerald-100 text-emerald-700"
                        : score.classification === "mid"  ? "bg-amber-100 text-amber-700"
                        : score.classification === "low"  ? "bg-rose-100 text-rose-700"
                        :                                   "bg-stone-100 text-slate-500"
                      }`}>
                        {empName.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        {empName === "unassigned" ? (
                          <span className="font-medium text-slate-600 truncate">Unassigned issues</span>
                        ) : (
                          <Link
                            href={`/employees/${encodeURIComponent(empName)}?cycle=${encodeURIComponent(cycleName)}`}
                            className="font-medium text-slate-900 truncate hover:text-[#AE00D0] hover:underline"
                          >
                            {empName}
                          </Link>
                        )}
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {empName === "unassigned"
                            ? <span className="normal-case not-italic text-slate-500">{issues.length} issue{issues.length !== 1 ? "s" : ""} with no owner in Linear — not counted toward any person. HR / PM can assign these to credit the right engineer.</span>
                            : <>{issues.length} issue{issues.length !== 1 ? "s" : ""} · weight {score.weightDone}/{score.weightTotal} · {pctStr}</>}
                        </div>
                      </div>
                      {/* Progress bar — desktop only */}
                      <div className="hidden sm:block w-20 flex-none">
                        <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                          <div className={`h-full transition-all ${
                            score.classification === "high"   ? "bg-emerald-500"
                            : score.classification === "mid"  ? "bg-amber-500"
                            : "bg-rose-400"
                          }`} style={{ width: `${Math.round((score.pctComplete ?? 0) * 100)}%` }} />
                        </div>
                      </div>
                      <span className="flex-none">{classBadge(score.classification === "no_data" ? null : score.classification)}</span>
                    </div>

                    {/* Row 2 — badges + lane chips, wrap freely (no overflow) */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-[26px]">
                      {/* Lane chips */}
                      {score.lanes.normal > 0 && (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-medium tabular-nums">{score.lanes.normal} normal</span>
                      )}
                      {score.lanes.tight > 0 && (
                        <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium tabular-nums">{score.lanes.tight} tight</span>
                      )}
                      {score.lanes.late_dump > 0 && (
                        <span title="assigned with too little time — excluded from score, shown to PM"
                              className="text-[10px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded font-medium tabular-nums">{score.lanes.late_dump} late-dump</span>
                      )}
                      {isTruncated && (
                        <span title={complete?.parser_warning ?? "data was truncated this snapshot"}
                              className="text-[10px] bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                          ⚠ truncated · {complete.n_issues_received}{complete.n_issues_expected !== null && (<>/{complete.n_issues_expected}</>)}
                        </span>
                      )}
                      {reassignedAway > 0 && (
                        <span title={`${reassignedAway} issue(s) this person started but no longer has. Does NOT affect score.`}
                              className="text-[10px] bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                          ↻ {reassignedAway} reassigned away
                        </span>
                      )}
                      {crossCycleInheritedCount > 0 && (
                        <span title={`${crossCycleInheritedCount} issue(s) reassigned to this person from a PREVIOUS cycle.`}
                              className="text-[10px] bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                          ↻ {crossCycleInheritedCount} inherited
                        </span>
                      )}
                      {carriedOverCount > 0 && (
                        <span title={`${carriedOverCount} issue(s) carried over from a previous cycle (still theirs).`}
                              className="text-[10px] bg-stone-100 text-slate-500 ring-1 ring-inset ring-stone-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                          ↺ {carriedOverCount} carried over
                        </span>
                      )}
                      {!currentEmployeeSet.has(empName) && !isTruncated && lastSeenByEmployee[empName] && (() => {
                        const lastSeen = lastSeenByEmployee[empName];
                        const isAllDone = issues.length > 0 && issues.every(i => isCompleted(i));
                        const cls = isAllDone ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-violet-50 text-violet-700 ring-violet-200";
                        return (
                          <span title={`Not in today's snapshot. Last seen ${new Date(lastSeen).toLocaleDateString(undefined, { day: "numeric", month: "short" })}.`}
                                className={`text-[10px] ${cls} ring-1 ring-inset rounded-full px-2 py-0.5 whitespace-nowrap`}>
                            {isAllDone ? "✓ completed early" : "↻ carried over"} · {new Date(lastSeen).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                          </span>
                        );
                      })()}
                    </div>
                  </summary>

                  <div className="border-t border-stone-100 overflow-x-auto">
                    <table className="w-full min-w-[980px] text-sm">
                      <thead className="bg-stone-50/60 text-[11px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="text-left  px-3 py-2.5 whitespace-nowrap">Issue&nbsp;ID</th>
                          <th className="text-left  px-3 py-2.5">Title</th>
                          <th className="text-left  px-3 py-2.5 whitespace-nowrap" title="Business urgency: p0 critical / p1 high / p2 normal / low">Priority</th>
                          <th className="text-right px-3 py-2.5 whitespace-nowrap" title="Story points — PM/PL effort estimate. Em-dash = not yet estimated.">Story&nbsp;Pts</th>
                          <th className="text-right px-3 py-2.5 whitespace-nowrap" title="SP × priority multiplier. The number that goes into the score.">Weighted</th>
                          <th className="text-right px-3 py-2.5 whitespace-nowrap" title="How many full days this issue should take. Rounded up.">Target&nbsp;Days</th>
                          <th className="text-left  px-3 py-2.5 whitespace-nowrap" title="Was there enough time between assigned date and cycle end? Normal / Tight-fair / Late dump">Schedule&nbsp;Fit</th>
                          <th className="text-left  px-3 py-2.5 whitespace-nowrap">Status</th>
                          <th className="text-left  px-3 py-2.5 whitespace-nowrap">Assigned</th>
                        </tr>
                      </thead>
                      <tbody>
                        {issues.map((it) => {
                          // Reassignment-aware: use effective_assigned_at
                          // (when CURRENT assignee got it) for lane math.
                          // For non-reassigned issues this equals
                          // it.assigned_at, so behaviour is unchanged.
                          const issueForScoring = { ...it, assigned_at: it.effective_assigned_at };
                          const lane = classifyLane(issueForScoring, cycleEndForScoring);
                          const w = computeWeight(it);
                          const ed = computeExpectedDays(it);
                          const done = isCompleted(it);
                          const hasEstimate = hasSpEstimate(it);
                          const wasReassigned = !!it.reassigned_from;
                          // Diff vs previous snapshot — drives "was X" indicators
                          const prev = prevChangesByIssue[it.issue_id];
                          const priorityChanged = prev && prev.prev_priority !== it.priority;
                          const spChanged       = prev && prev.prev_story_points !== it.story_points;
                          const statusChanged   = prev && prev.prev_status !== it.status;
                          // Cross-cycle lineage
                          const priorCycle = priorCycleByIssue[it.issue_id];
                          const crossCycleReassigned = priorCycle && priorCycle.prior_employee !== empName;
                          const crossCycleCarried    = priorCycle && priorCycle.prior_employee === empName;
                          return (
                            <tr key={it.issue_id}
                                className={`border-t border-stone-100 ${done ? "bg-emerald-50/20" : ""}`}>
                              <td className="px-3 py-2.5 font-mono text-xs text-slate-600 align-top">
                                {it.issue_id}
                                <div className="mt-1 flex flex-col gap-0.5 items-start">
                                  {isBug(it) ? (
                                    <span title={it.is_bug_of ? `Bug — belongs to ${it.is_bug_of}. Counted at ${REWORK_PENALTY}× (corrective work).` : `Bug (no linked feature in Linear). Counted at ${REWORK_PENALTY}× (corrective work).`}
                                          className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-300 rounded px-1.5 py-0.5 shadow-[0_0_6px_rgba(244,63,94,0.35)]">
                                      🐞 Bug{it.is_bug_of ? <span className="font-mono font-semibold normal-case">→{it.is_bug_of}</span> : null}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200 rounded px-1.5 py-0.5">
                                      {(it.issue_type || "feature")}
                                    </span>
                                  )}
                                  {!isBug(it) && held.has(it.issue_id) && (
                                    <span title="This feature has an OPEN linked bug, so its credit is HELD at 0.78 (In-QA level) until the bug is fixed — then it releases to full."
                                          className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-300 rounded px-1.5 py-0.5 shadow-[0_0_6px_rgba(174,0,208,0.30)]">
                                      🛡 Held · open bug
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-slate-800 max-w-md" title={it.title ?? ""}>
                                <div className="truncate">{it.title ?? <span className="text-slate-300">—</span>}</div>
                                {wasReassigned && (
                                  <div className="mt-0.5">
                                    <span title={`Reassigned from ${it.reassigned_from} on ${new Date(it.reassigned_at!).toLocaleDateString(undefined, { day: "numeric", month: "short" })}. Schedule fit is calculated from the date this person got it, not the issue's original creation date.`}
                                          className="inline-block text-[10px] bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                                      ↻ reassigned from <b>{it.reassigned_from}</b> on {new Date(it.reassigned_at!).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                                    </span>
                                  </div>
                                )}
                                {/* Cross-cycle reassignment — prominent. This issue
                                    belonged to a DIFFERENT person in a prior cycle. */}
                                {crossCycleReassigned && (
                                  <div className="mt-0.5">
                                    <span title={`This issue was held by ${priorCycle.prior_employee} in ${priorCycle.prior_cycle}. It was reassigned to ${empName} for this cycle.`}
                                          className="inline-block text-[10px] bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-300 rounded-full px-2 py-0.5 whitespace-nowrap font-medium">
                                      ↻ reassigned from <b>{priorCycle.prior_employee}</b> · {priorCycle.prior_cycle}
                                    </span>
                                  </div>
                                )}
                                {/* Carried over (same person, prior cycle) — subtle. */}
                                {crossCycleCarried && (
                                  <div className="mt-0.5">
                                    <span title={`This issue was also on ${empName}'s plate in ${priorCycle.prior_cycle} — it's been carried over (not completed last cycle).`}
                                          className="inline-block text-[9px] text-slate-400 whitespace-nowrap">
                                      ↺ carried from {priorCycle.prior_cycle}
                                    </span>
                                  </div>
                                )}
                                {/* QA-bug quality flag. Drives the rework
                                    penalty in scoring. */}
                                {(() => {
                                  const qs = qualityState(it);
                                  if (qs === "clean") return null;
                                  const n = reopenCount(it);
                                  if (qs === "open_bug") {
                                    return (
                                      <div className="mt-0.5">
                                        <span title={`QA caught a bug after this was marked done${n > 1 ? ` ${n} times` : ""}. The original developer has zero credit for this issue until it's marked done again. The next completion will land at ${REWORK_PENALTY}× normal weight to reflect the rework cost.`}
                                              className="inline-block text-[10px] bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 rounded-full px-2 py-0.5 whitespace-nowrap font-medium">
                                          🔴 Open bug{n > 1 ? ` (×${n})` : ""}
                                        </span>
                                      </div>
                                    );
                                  }
                                  // reworked: completed but had ≥1 prior reopen
                                  return (
                                    <div className="mt-0.5">
                                      <span title={`This was completed, then QA found a bug (after >24h, so it wasn't a self-correction), then it was re-completed. Lands at ${REWORK_PENALTY}× normal weight to reflect the rework cost.`}
                                            className="inline-block text-[10px] bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap font-medium">
                                        ⚠ Reworked{n > 1 ? ` (×${n})` : ""} · {REWORK_PENALTY}× weight
                                      </span>
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex flex-col gap-0.5">
                                  {priorityBadge(it.priority)}
                                  {priorityChanged && (
                                    <span title={`Priority changed since ${new Date(prev.prev_snapshot_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}
                                          className="text-[9px] text-violet-600 font-medium whitespace-nowrap">
                                      ↑ from {prev.prev_priority ?? "—"}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums">
                                {hasEstimate ? (
                                  <span className="text-slate-700 font-medium">{it.story_points}</span>
                                ) : (
                                  <span title="PM has not added an SP estimate yet — weight is calculated from the 1-SP minimum"
                                        className="inline-block text-[10px] bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 rounded-full px-2 py-0.5">
                                    no&nbsp;estimate
                                  </span>
                                )}
                                {spChanged && (
                                  <div className="text-[9px] text-violet-600 font-medium whitespace-nowrap mt-0.5"
                                       title={`SP changed since ${new Date(prev.prev_snapshot_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}>
                                    ↑ from {prev.prev_story_points ?? "none"}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums">
                                <span className={`font-medium ${hasEstimate ? "text-slate-900" : "text-slate-400"}`}>{w}</span>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 font-medium">
                                {ed}<span className="text-[10px] text-slate-400 ml-0.5">d</span>
                              </td>
                              <td className="px-3 py-2.5">{laneBadge(lane)}</td>
                              <td className="px-3 py-2.5">
                                <div className="flex flex-col gap-0.5">
                                  {statusBadge(it.status)}
                                  {statusChanged && (
                                    <span title={`Status changed since ${new Date(prev.prev_snapshot_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}
                                          className={`text-[9px] font-medium whitespace-nowrap ${
                                            it.status === "done" ? "text-emerald-700" : "text-violet-600"
                                          }`}>
                                      {it.status === "done" ? "✓ completed today" : `↻ from ${prev.prev_status ?? "—"}`}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-xs">
                                {it.effective_assigned_at ? (
                                  <span className={wasReassigned ? "text-violet-700 font-medium" : "text-slate-500"}>
                                    {new Date(it.effective_assigned_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                                  </span>
                                ) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}

            {/* Surface truncated employees who have NO issues in DB yet
                (recovered from a payload that cut off before any of their
                issues had landed). */}
            {Object.entries(completenessByEmployee)
              .filter(([name, c]) => c.status === "truncated" && !issuesByEmployee[name])
              .map(([name, c]) => (
                <div key={name}
                     className="bg-amber-50/40 rounded-xl border border-amber-200 px-4 py-3 text-sm">
                  <span className="font-medium text-slate-800">{name}</span>{" "}
                  <span className="inline-block text-[10px] bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-300 rounded-full px-2 py-0.5 ml-2">
                    ⚠ data truncated · 0
                    {c.n_issues_expected !== null && (<>/{c.n_issues_expected}</>)}
                    {" "}issues recovered
                  </span>
                  <span className="text-xs text-slate-500 ml-3">
                    {c.parser_warning ?? "Esha's message was cut off before this employee's issues arrived"}
                  </span>
                </div>
              ))}
          </div>

          <p className="mt-4 text-xs text-slate-500 leading-relaxed max-w-3xl">
            See the <b>How to read this</b> panel above for the full column legend
            and lane formula. Rows with an <span className="bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 rounded-full px-1.5 text-[10px]">no estimate</span> badge
            mean the PM has not assigned story points yet — their weight is held
            at the 1-SP minimum until they do.
          </p>
          <p className="mt-2 text-xs text-slate-500 leading-relaxed max-w-3xl">
            <b>Quality badges:</b> a <span className="bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 rounded-full px-1.5 text-[10px] font-medium">🔴 Open bug</span> means
            QA found a problem after the developer marked it done — the developer holds
            zero credit until the fix lands.  A <span className="bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 rounded-full px-1.5 text-[10px] font-medium">⚠ Reworked</span> means
            the issue was completed → reopened → completed again; it counts at <b>{REWORK_PENALTY}× weight</b> to
            reflect the rework cost. Same-day self-corrections (within 24h of completion)
            are NOT counted as QA failures.
          </p>
        </section>
      )}
    </main>
  );
}
