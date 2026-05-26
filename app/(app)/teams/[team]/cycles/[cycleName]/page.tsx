import Link from "next/link";
import { notFound } from "next/navigation";
import {
  listSnapshotsForCycle,
  getSnapshotEmployeesWithDelta,
  getCycleIssuesByEmployee,
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
  hasSpEstimate,
  type Lane,
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
  let doneWeight = 0;
  let totalIssues = 0;
  let doneIssues = 0;
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

  for (const [name, issues] of Object.entries(issuesByEmployee)) {
    const score = computeEmployeeScore(issues, cycleEnd);
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
      const isDone = isCompleted(it);
      if (lane === "removed" || lane === "late_dump") continue;
      totalWeight += w;
      if (isDone) {
        doneWeight += w;
        doneIssues += 1;
      }
      const pri = (it.priority || "other").toLowerCase();
      const bucket = pri === "p0" || pri === "p1" || pri === "p2" || pri === "low" ? pri : "other";
      priorityBuckets[bucket].totalWeight += w;
      if (isDone) priorityBuckets[bucket].done += 1;
      else priorityBuckets[bucket].open += 1;
    }
  }

  const sorted = [...perEmployee].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  const topPerformers = sorted.filter(p => p.pct !== null && p.pct > 0).slice(0, 3);
  const watchList = sorted.filter(p => p.classification === "low" || p.pct === 0).slice(-3).reverse();

  return {
    totalIssues,
    doneIssues,
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

  const employees = await getSnapshotEmployeesWithDelta(selected.cycle_id);

  // ── v3 per-issue data ────────────────────────────────────────────────
  // Fetched in parallel.  Returns empty objects on cycles that pre-date
  // migration 019, so the section just doesn't render — safe fall-through.
  const [issuesByEmployee, completenessByEmployee] = await Promise.all([
    getCycleIssuesByEmployee(selected.cycle_id),
    getCycleCompleteness(selected.cycle_id),
  ]);
  const hasV3Data = Object.keys(issuesByEmployee).length > 0
                  || Object.keys(completenessByEmployee).length > 0;
  // Use cycle_end for lane classification; fall back to a far-future
  // date when missing so no issue is misclassified as late dump.
  const cycleEndForScoring = selected.cycle_end
    ? selected.cycle_end + "T23:59:59Z"
    : "2099-12-31T23:59:59Z";

  return (
    <main className="max-w-7xl mx-auto px-8 py-10">
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
                        sub={`${pctOverall}% complete`}
                        accent={pctOverall >= 60 ? "emerald" : pctOverall >= 30 ? "amber" : "rose"} />
              <StatTile label="Issues"
                        value={`${pulse.doneIssues} / ${totalIssuesAll}`}
                        sub={`${totalIssuesAll - pulse.doneIssues} open`} />
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
                    <div className="text-xs uppercase tracking-wider text-emerald-600 mb-2">Leaders</div>
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
                            <span className="text-[11px] tabular-nums text-slate-500">{p.pct !== null ? Math.round(p.pct * 100) : "—"}%</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-rose-600 mb-2">Needs attention</div>
                    {pulse.watchList.length === 0 ? (
                      <div className="text-xs text-slate-400 italic">All clear</div>
                    ) : (
                      <ul className="space-y-2">
                        {pulse.watchList.map((p) => (
                          <li key={p.name} className="flex items-center gap-2 text-sm">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500" />
                            <span className="text-slate-800 font-medium flex-1 truncate">{p.name}</span>
                            <span className="text-[11px] tabular-nums text-slate-500">
                              {fmt(p.weightTotal)} wt
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
                <th className="text-left px-4 py-3">Employee</th>
                <th className="text-right px-4 py-3">Tickets</th>
                <th className="text-right px-4 py-3">Δ tix</th>
                <th className="text-right px-4 py-3">SP</th>
                <th className="text-right px-4 py-3">Δ sp</th>
                <th className="text-right px-4 py-3">%</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const tixPct = e.tickets_total
                  ? Math.round(((e.tickets_completed ?? 0) / e.tickets_total) * 100)
                  : null;
                const tone = tixPct === null ? "text-slate-400"
                  : tixPct >= 80 ? "text-emerald-700"
                  : tixPct >= 60 ? "text-amber-700"
                  : "text-rose-700";
                const scopeGrew = e.tickets_added > 0 || e.sp_added > 0;
                return (
                  <tr key={e.employee_name}
                      className={`border-t border-stone-100 hover:bg-stone-50 ${scopeGrew ? "bg-amber-50/30" : ""}`}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link
                        href={`/employees/${encodeURIComponent(e.employee_name)}?cycle=${encodeURIComponent(cycleName)}`}
                        className="hover:text-[#AE00D0]"
                      >
                        {e.employee_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {e.tickets_completed ?? 0}/{e.tickets_total ?? 0}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums text-xs ${
                      e.tickets_added > 0 ? "text-amber-700 font-semibold"
                      : e.tickets_added < 0 ? "text-blue-700"
                      : "text-slate-300"
                    }`}>
                      {e.tickets_added > 0 ? `+${e.tickets_added}`
                        : e.tickets_added < 0 ? `${e.tickets_added}`
                        : "·"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {e.story_points_completed ?? 0}/{e.story_points_total ?? 0}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums text-xs ${
                      e.sp_added > 0 ? "text-amber-700 font-semibold"
                      : e.sp_added < 0 ? "text-blue-700"
                      : "text-slate-300"
                    }`}>
                      {e.sp_added > 0 ? `+${e.sp_added}`
                        : e.sp_added < 0 ? `${e.sp_added}`
                        : "·"}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${tone}`}>
                      {pct(e.tickets_completed, e.tickets_total)}
                    </td>
                    <td className="px-4 py-3">{classBadge(e.classification)}</td>
                  </tr>
                );
              })}
              {employees.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No employees in this snapshot.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-slate-500 leading-relaxed">
          <span className="text-amber-700 font-semibold">+N</span> = tickets / SP added vs the previous snapshot (scope grew).
          <span className="text-blue-700 font-semibold ml-2">−N</span> = removed.
          Rows highlighted amber = scope expanded for that employee mid-cycle.
          Apply a grace mark from the Slack DM at end-of-cycle to compensate, e.g.
          <code className="ml-1">give +1 to mayank in May — completed all original commitments</code>.
        </p>
      </section>

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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Columns</h3>
                  <dl className="space-y-2 text-[13px]">
                    <div className="flex gap-2"><dt className="font-semibold text-slate-700 w-32 flex-none">Priority</dt><dd className="text-slate-600">Business urgency — p0 (critical), p1 (high), p2 (normal), low.</dd></div>
                    <div className="flex gap-2"><dt className="font-semibold text-slate-700 w-32 flex-none">Story points</dt><dd className="text-slate-600">Effort estimate set by PM/PL during planning. <b>If missing</b>, we use 1 (the minimum) and flag the row — PM should add an estimate.</dd></div>
                    <div className="flex gap-2"><dt className="font-semibold text-slate-700 w-32 flex-none">Weighted effort</dt><dd className="text-slate-600">Contribution to score: <code className="text-[11px] bg-stone-100 px-1 rounded">SP × priority multiplier</code>. A p0 issue counts 2× a p2 of the same size.</dd></div>
                    <div className="flex gap-2"><dt className="font-semibold text-slate-700 w-32 flex-none">Target days</dt><dd className="text-slate-600">How long this issue should take (in whole days): <code className="text-[11px] bg-stone-100 px-1 rounded">SP × time factor</code>, always rounded up. Min 1 day.</dd></div>
                    <div className="flex gap-2"><dt className="font-semibold text-slate-700 w-32 flex-none">Schedule fit</dt><dd className="text-slate-600">Is there enough time left in the cycle? See the lane formula below.</dd></div>
                    <div className="flex gap-2"><dt className="font-semibold text-slate-700 w-32 flex-none">Status</dt><dd className="text-slate-600">Where the work is — todo, in progress, done. Only <b>done</b> issues add to the numerator.</dd></div>
                    <div className="flex gap-2"><dt className="font-semibold text-slate-700 w-32 flex-none">Assigned</dt><dd className="text-slate-600">The day this issue landed on this person&apos;s plate (decides Schedule fit).</dd></div>
                  </dl>
                </div>
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Multipliers (per priority)</h3>
                  <table className="w-full text-[12px] mb-4">
                    <thead className="text-[10px] uppercase tracking-wider text-slate-400">
                      <tr><th className="text-left pb-1">priority</th><th className="text-right pb-1">effort ×</th><th className="text-right pb-1">time ×</th></tr>
                    </thead>
                    <tbody className="tabular-nums">
                      <tr className="border-t border-violet-100"><td className="py-1.5"><span className="bg-rose-100 text-rose-800 rounded px-1.5 py-0.5 font-mono text-[10px]">p0</span> critical</td><td className="text-right text-rose-700 font-bold">2.0</td><td className="text-right text-slate-600">0.6 × SP</td></tr>
                      <tr className="border-t border-violet-100"><td className="py-1.5"><span className="bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 font-mono text-[10px]">p1</span> high</td><td className="text-right text-amber-700 font-bold">1.5</td><td className="text-right text-slate-600">0.8 × SP</td></tr>
                      <tr className="border-t border-violet-100"><td className="py-1.5"><span className="bg-stone-100 text-slate-700 rounded px-1.5 py-0.5 font-mono text-[10px]">p2</span> normal</td><td className="text-right text-slate-700 font-bold">1.0</td><td className="text-right text-slate-600">1.0 × SP</td></tr>
                      <tr className="border-t border-violet-100"><td className="py-1.5"><span className="bg-slate-50 text-slate-500 rounded px-1.5 py-0.5 font-mono text-[10px]">low</span> nice-to-have</td><td className="text-right text-slate-500 font-bold">0.7</td><td className="text-right text-slate-600">1.5 × SP</td></tr>
                    </tbody>
                  </table>
                  <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Schedule-fit lanes</h3>
                  <ul className="space-y-1.5 text-[12px]">
                    <li className="flex items-start gap-2">
                      <span className="inline-block text-[10px] bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 rounded-full px-2 py-0.5 flex-none mt-0.5">Normal</span>
                      <span className="text-slate-600">Days left ≥ <b>1.5× Target days</b> — relaxed pace, full weight counts.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="inline-block text-[10px] bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 rounded-full px-2 py-0.5 flex-none mt-0.5">Tight-fair</span>
                      <span className="text-slate-600">Days left ≥ Target days but &lt; 1.5× — tight but doable. <b>+20% bonus</b> if completed.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="inline-block text-[10px] bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 rounded-full px-2 py-0.5 flex-none mt-0.5">Late dump</span>
                      <span className="text-slate-600">Days left &lt; Target days — not enough time. <b>Excluded from employee score</b>, shown to PM as a planning signal.</span>
                    </li>
                  </ul>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-violet-100 text-[12px] text-slate-600 leading-relaxed">
                <b>Final score per employee</b>:{" "}
                <code className="text-[11px] bg-white border border-stone-200 px-2 py-0.5 rounded">
                  pct = sum of weight(done) ÷ sum of weight(counted lanes)
                </code>{" "}
                — then mapped to <span className="text-emerald-700 font-semibold">HIGH (≥80%)</span> /{" "}
                <span className="text-amber-700 font-semibold">MID (60–79%)</span> /{" "}
                <span className="text-rose-700 font-semibold">LOW (&lt;60%)</span>.
                Mid-cycle scores are previews; the permanent score is written only on cycle-end day. HR can apply grace marks on top.
              </div>
            </div>
          </details>

          <div className="space-y-3">
            {Object.keys(issuesByEmployee).length === 0 && (
              <div className="text-sm text-slate-400 italic">
                No per-issue data for this snapshot yet.
              </div>
            )}

            {Object.entries(issuesByEmployee).map(([empName, issues]) => {
              const score = computeEmployeeScore(issues, cycleEndForScoring);
              const complete = completenessByEmployee[empName];
              const isTruncated = complete?.status === "truncated";
              const pctStr = score.pctComplete !== null
                ? `${Math.round(score.pctComplete * 100)}%`
                : "—";
              return (
                <details key={empName}
                         className="group bg-white rounded-xl border border-stone-200 overflow-hidden hover:border-stone-300 transition-colors">
                  <summary className="cursor-pointer list-none px-4 py-3.5 hover:bg-stone-50/60 select-none">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-slate-400 group-open:rotate-90 transition-transform inline-block w-3 flex-none">▸</span>
                        {/* Avatar disc with initial */}
                        <span className={`flex-none inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                          score.classification === "high"   ? "bg-emerald-100 text-emerald-700"
                          : score.classification === "mid"  ? "bg-amber-100 text-amber-700"
                          : score.classification === "low"  ? "bg-rose-100 text-rose-700"
                          :                                   "bg-stone-100 text-slate-500"
                        }`}>
                          {empName.charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">{empName}</div>
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            {issues.length} issue{issues.length !== 1 ? "s" : ""} · weight {score.weightDone}/{score.weightTotal}
                          </div>
                        </div>
                        {isTruncated && (
                          <span title={complete?.parser_warning ?? "data was truncated this snapshot"}
                                className="ml-2 inline-block text-[10px] bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 rounded-full px-2 py-0.5 flex-none">
                            ⚠ truncated · {complete.n_issues_received}
                            {complete.n_issues_expected !== null && (<>/{complete.n_issues_expected}</>)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        {/* Lane mini-chips */}
                        <div className="hidden md:flex items-center gap-1 text-[10px]">
                          {score.lanes.normal > 0 && (
                            <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-medium tabular-nums">
                              {score.lanes.normal} normal
                            </span>
                          )}
                          {score.lanes.tight > 0 && (
                            <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium tabular-nums">
                              {score.lanes.tight} tight
                            </span>
                          )}
                          {score.lanes.late_dump > 0 && (
                            <span title="assigned with too little time — excluded from score, shown to PM"
                                  className="bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded font-medium tabular-nums">
                              {score.lanes.late_dump} late-dump
                            </span>
                          )}
                        </div>
                        {/* Weight progress mini-bar */}
                        <div className="hidden sm:block w-24">
                          <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                            <div className={`h-full transition-all ${
                              score.classification === "high"   ? "bg-emerald-500"
                              : score.classification === "mid"  ? "bg-amber-500"
                              : "bg-rose-400"
                            }`} style={{ width: `${Math.round((score.pctComplete ?? 0) * 100)}%` }} />
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 text-right tabular-nums">{pctStr}</div>
                        </div>
                        <span>{classBadge(score.classification === "no_data" ? null : score.classification)}</span>
                      </div>
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
                          const lane = classifyLane(it, cycleEndForScoring);
                          const w = computeWeight(it);
                          const ed = computeExpectedDays(it);
                          const done = isCompleted(it);
                          const hasEstimate = hasSpEstimate(it);
                          return (
                            <tr key={it.issue_id}
                                className={`border-t border-stone-100 ${done ? "bg-emerald-50/20" : ""}`}>
                              <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{it.issue_id}</td>
                              <td className="px-3 py-2.5 text-slate-800 max-w-md truncate" title={it.title ?? ""}>
                                {it.title ?? <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-3 py-2.5">{priorityBadge(it.priority)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">
                                {hasEstimate ? (
                                  <span className="text-slate-700 font-medium">{it.story_points}</span>
                                ) : (
                                  <span title="PM has not added an SP estimate yet — weight is calculated from the 1-SP minimum"
                                        className="inline-block text-[10px] bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 rounded-full px-2 py-0.5">
                                    no&nbsp;estimate
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums">
                                <span className={`font-medium ${hasEstimate ? "text-slate-900" : "text-slate-400"}`}>{w}</span>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 font-medium">
                                {ed}<span className="text-[10px] text-slate-400 ml-0.5">d</span>
                              </td>
                              <td className="px-3 py-2.5">{laneBadge(lane)}</td>
                              <td className="px-3 py-2.5">{statusBadge(it.status)}</td>
                              <td className="px-3 py-2.5 text-xs text-slate-500">
                                {it.assigned_at ? new Date(it.assigned_at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—"}
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
        </section>
      )}
    </main>
  );
}
