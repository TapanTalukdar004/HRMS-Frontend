import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEmployeeTrend,
  getEmployeeRollup,
  getIssuesForEmployeeByCycle,
  currentPeriod,
  periodLabel,
} from "@/lib/queries";
import { EmployeeTrendChart, type EmployeeSnapshotPoint } from "@/components/EmployeeTrendChart";
import { EmployeeRollupView } from "@/components/EmployeeRollupView";
import { BackButton } from "@/components/BackButton";
import {
  computeWeight, computeExpectedDays, classifyLane, isCompleted,
  hasSpEstimate, computeEmployeeScore,
} from "@/lib/issueScoring";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Scope = "cycle" | "month" | "quarter" | "year";

type Props = {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ cycle?: string; scope?: string; period?: string; days?: string }>;
};

const DAYS_PER_PAGE = 5;

export async function generateMetadata({ params }: Props) {
  const { name } = await params;
  return { title: `${decodeURIComponent(name)} · HR Bot` };
}

function parseScope(s: string | undefined): Scope {
  if (s === "month" || s === "quarter" || s === "year") return s;
  return "cycle";
}

function classBadge(c: string | null) {
  if (c === "high") return <span className="inline-block text-[11px] bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 rounded-full px-2 py-0.5">on track</span>;
  if (c === "mid")  return <span className="inline-block text-[11px] bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 rounded-full px-2 py-0.5">mid</span>;
  if (c === "low")  return <span className="inline-block text-[11px] bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 rounded-full px-2 py-0.5">behind</span>;
  return <span className="inline-block text-[11px] bg-stone-100 text-slate-500 ring-1 ring-inset ring-stone-300 rounded-full px-2 py-0.5">—</span>;
}

function fmtPct(done: number | null, total: number | null): number | null {
  if (!total || total === 0) return null;
  return Math.round(((done ?? 0) / total) * 100);
}

function periodOptions(scope: "month" | "quarter" | "year"): string[] {
  const now = new Date();
  const out: string[] = [];
  if (scope === "month") {
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`);
    }
  } else if (scope === "quarter") {
    const y = now.getFullYear();
    const q = Math.floor(now.getMonth() / 3) + 1;
    for (let i = 0; i < 6; i++) {
      const qi = q - i;
      const yi = y + Math.floor((qi - 1) / 4);
      const qiNorm = ((qi - 1) % 4 + 4) % 4 + 1;
      out.push(`${yi}-Q${qiNorm}`);
    }
  } else {
    for (let i = 0; i < 3; i++) out.push(`${now.getFullYear() - i}`);
  }
  return out;
}

export default async function EmployeePage({ params, searchParams }: Props) {
  const { name: rawName } = await params;
  const sp = await searchParams;
  const name = decodeURIComponent(rawName);
  const scope = parseScope(sp.scope);
  const cycleFilter = sp.cycle?.trim() || null;
  const daysShown = Math.max(DAYS_PER_PAGE, Number(sp.days) || DAYS_PER_PAGE);

  // Always fetch the trend so we can populate the cycle history view
  const fullTrend = await getEmployeeTrend(name);
  if (fullTrend.length === 0) return notFound();

  return (
    <main className="max-w-7xl mx-auto px-8 py-10">
      <BackButton fallbackHref="/employees" fallbackLabel="All employees" />

      <div className="mt-4 mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{name}</h1>
        <p className="mt-1 text-slate-500 text-sm">
          {fullTrend.length} snapshot{fullTrend.length !== 1 ? "s" : ""} across {
            new Set(fullTrend.map((r) => r.cycle_name)).size
          } cycle{new Set(fullTrend.map((r) => r.cycle_name)).size !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Scope tabs */}
      <nav className="mb-8 flex flex-wrap gap-2">
        {(["cycle", "month", "quarter", "year"] as const).map((s) => {
          const active = s === scope;
          const href = s === "cycle"
            ? `/employees/${encodeURIComponent(name)}`
            : `/employees/${encodeURIComponent(name)}?scope=${s}&period=${currentPeriod(s)}`;
          const label = s === "cycle" ? "By cycle" :
                        s === "month" ? "Monthly" :
                        s === "quarter" ? "Quarterly" : "Annual";
          return (
            <Link
              key={s}
              href={href}
              className={
                active
                  ? "px-4 py-2 rounded-lg bg-[#AE00D0] text-white text-sm font-medium shadow-sm"
                  : "px-4 py-2 rounded-lg bg-white border border-stone-300 text-slate-700 text-sm hover:border-[#AE00D0] hover:text-[#AE00D0]"
              }
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* SCOPE VIEWS */}
      {scope === "cycle" ? (
        <CycleView name={name} fullTrend={fullTrend} cycleFilter={cycleFilter} daysShown={daysShown} />
      ) : (
        <RollupTab name={name} scope={scope} period={sp.period?.trim() || currentPeriod(scope)} />
      )}
    </main>
  );
}

async function RollupTab({ name, scope, period }: {
  name: string;
  scope: "month" | "quarter" | "year";
  period: string;
}) {
  const detail = await getEmployeeRollup(name, scope, period);
  const options = periodOptions(scope);
  const cur = currentPeriod(scope);

  return (
    <div className="space-y-6">
      {/* Period dropdown */}
      <form method="GET" className="flex items-center gap-2">
        <input type="hidden" name="scope" value={scope} />
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Period:
        </label>
        <select
          name="period"
          defaultValue={period}
          className="px-3 py-2 rounded-lg border border-stone-300 bg-white text-sm
                     focus:outline-none focus:border-[#AE00D0] focus:ring-2 focus:ring-[#AE00D0]/15"
        >
          {options.map((p) => (
            <option key={p} value={p}>
              {periodLabel(scope, p)}{p === cur ? " (current)" : ""}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="px-3 py-2 rounded-lg bg-stone-100 text-slate-700 text-sm hover:bg-stone-200"
        >
          View
        </button>
      </form>

      <EmployeeRollupView detail={detail} />
    </div>
  );
}

async function CycleView({ name, fullTrend, cycleFilter, daysShown }: {
  name: string;
  fullTrend: Awaited<ReturnType<typeof getEmployeeTrend>>;
  cycleFilter: string | null;
  daysShown: number;
}) {
  // Per-issue cycle-wise history (new — used by the "Issues by cycle"
  // section below).  Returns [] for legacy data that pre-dates v3.
  const issuesByCycle = await getIssuesForEmployeeByCycle(name);
  // Optional cycle filter
  const trend = cycleFilter
    ? fullTrend.filter((r) => r.cycle_name === cycleFilter)
    : fullTrend;

  // Day-wise dedupe: keep the latest snapshot per calendar date.
  // (trend is sorted ASC by snapshot_at; last write per date wins.)
  // CAREFUL: slice the raw "YYYY-MM-DD" prefix from the timestamp string
  // rather than going through new Date().toISOString() — the latter shifts
  // by the local timezone offset and silently merges adjacent days when
  // the server clock is east of UTC.
  const latestRowByDate = new Map<string, typeof trend[number]>();
  for (const r of trend) {
    const dateKey = r.snapshot_at.slice(0, 10);  // raw YYYY-MM-DD from Postgres
    latestRowByDate.set(dateKey, r);
  }
  // Sorted oldest → newest for chart + delta calculation
  const dayRowsAsc = Array.from(latestRowByDate.values());

  // Compute scope-delta vs PREVIOUS day for each row (added tickets / SP).
  // Useful for HR: "On May 14, mayank got +2 new tickets and +2 SP."
  const dayRowsWithDelta = dayRowsAsc.map((r, i) => {
    const prev = i > 0 ? dayRowsAsc[i - 1] : null;
    return {
      ...r,
      tickets_added: prev ? (r.tickets_total ?? 0) - (prev.tickets_total ?? 0) : 0,
      sp_added: prev ? (r.story_points_total ?? 0) - (prev.story_points_total ?? 0) : 0,
      tickets_completed_delta: prev ? (r.tickets_completed ?? 0) - (prev.tickets_completed ?? 0) : 0,
    };
  });

  // Chart uses ASCENDING (old → new) for x-axis reading
  const points: EmployeeSnapshotPoint[] = dayRowsAsc.map((r) => {
    const d = new Date(r.snapshot_at);
    return {
      label: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }),
      tickets_pct: fmtPct(r.tickets_completed, r.tickets_total),
      sp_pct: fmtPct(r.story_points_completed, r.story_points_total),
      cycle_name: r.cycle_name,
    };
  });

  // Snapshot table uses DESCENDING (newest first) — paginated to `daysShown`
  const tableRowsAll = [...dayRowsWithDelta].reverse();
  const tableRows = tableRowsAll.slice(0, daysShown);
  const hasMore = tableRowsAll.length > daysShown;

  return (
    <div className="space-y-8">
      {cycleFilter && (
        <div className="bg-[#faf7ff] border border-[#ede9fe] rounded-xl px-4 py-3 text-sm">
          Showing <span className="font-semibold text-[#6745E8]">{cycleFilter}</span> only · {" "}
          <Link href={`/employees/${encodeURIComponent(name)}`} className="text-slate-500 underline hover:text-slate-800">
            clear filter
          </Link>
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
          Day-by-day progress (completion %)
        </h2>
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <EmployeeTrendChart data={points} />
        </div>
      </section>

      {/* ─── Issues by cycle — what landed on this person's plate ─── */}
      {issuesByCycle.length > 0 && (
        <section>
          <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                Issues by cycle
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Every ticket assigned to {name} across {issuesByCycle.length} cycle{issuesByCycle.length !== 1 ? "s" : ""}.
                Latest cycle is shown expanded.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {issuesByCycle
              .filter(c => !cycleFilter || c.cycle_name === cycleFilter)
              .map((c, idx) => {
                // Compute per-cycle aggregate score for this employee
                const score = computeEmployeeScore(c.issues,
                  c.cycle_end ? c.cycle_end + "T23:59:59Z" : "2099-12-31T23:59:59Z");
                const pctStr = score.pctComplete !== null
                  ? `${Math.round(score.pctComplete * 100)}%`
                  : "—";
                const done = c.issues.filter(i => isCompleted(i)).length;
                return (
                  <details key={c.cycle_id}
                           open={idx === 0}
                           className="group bg-white rounded-xl border border-stone-200 overflow-hidden hover:border-stone-300 transition-colors">
                    <summary className="cursor-pointer list-none px-4 py-3 hover:bg-stone-50/60 select-none">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-slate-400 group-open:rotate-90 transition-transform inline-block w-3 flex-none">▸</span>
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 truncate flex items-center gap-2">
                              {c.cycle_name}
                              {c.team && (
                                <span className="text-[11px] font-normal text-slate-500">· {c.team}</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 tabular-nums">
                              {c.cycle_start && c.cycle_end ? (
                                <>
                                  {new Date(c.cycle_start + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                                  {" → "}
                                  {new Date(c.cycle_end + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                                </>
                              ) : "(no cycle dates)"}
                              {" · "}
                              {c.issues.length} issue{c.issues.length !== 1 ? "s" : ""}
                              {" · "}
                              {done} done
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-slate-500 tabular-nums hidden sm:inline">
                            weight {score.weightDone}/{score.weightTotal}
                          </span>
                          <div className="w-20">
                            <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                              <div className={
                                score.classification === "high"  ? "h-full bg-emerald-500"
                                : score.classification === "mid" ? "h-full bg-amber-500"
                                : "h-full bg-rose-400"
                              } style={{ width: `${Math.round((score.pctComplete ?? 0) * 100)}%` }} />
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 text-right tabular-nums">{pctStr}</div>
                          </div>
                          {classBadge(score.classification === "no_data" ? null : score.classification)}
                        </div>
                      </div>
                    </summary>

                    <div className="border-t border-stone-100 overflow-x-auto">
                      <table className="w-full min-w-[920px] text-sm">
                        <thead className="bg-stone-50/60 text-[11px] uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="text-left  px-3 py-2 whitespace-nowrap">Issue&nbsp;ID</th>
                            <th className="text-left  px-3 py-2">Title</th>
                            <th className="text-left  px-3 py-2 whitespace-nowrap">Priority</th>
                            <th className="text-right px-3 py-2 whitespace-nowrap">Story&nbsp;Pts</th>
                            <th className="text-right px-3 py-2 whitespace-nowrap">Weighted</th>
                            <th className="text-right px-3 py-2 whitespace-nowrap">Target&nbsp;Days</th>
                            <th className="text-left  px-3 py-2 whitespace-nowrap">Schedule&nbsp;Fit</th>
                            <th className="text-left  px-3 py-2 whitespace-nowrap">Status</th>
                            <th className="text-left  px-3 py-2 whitespace-nowrap">Assigned</th>
                            <th className="text-left  px-3 py-2 whitespace-nowrap">Done&nbsp;on</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.issues.map((it) => {
                            const cyEnd = c.cycle_end ? c.cycle_end + "T23:59:59Z" : "2099-12-31";
                            const lane = classifyLane(it, cyEnd);
                            const w = computeWeight(it);
                            const ed = computeExpectedDays(it);
                            const isDone = isCompleted(it);
                            const hasEst = hasSpEstimate(it);
                            const priCls = it.priority === "p0" ? "bg-rose-100 text-rose-800"
                                         : it.priority === "p1" ? "bg-amber-100 text-amber-800"
                                         : it.priority === "p2" ? "bg-stone-100 text-slate-700"
                                         : "bg-slate-50 text-slate-500";
                            const laneCls = lane === "normal"    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                          : lane === "tight"     ? "bg-amber-50 text-amber-700 ring-amber-200"
                                          : lane === "late_dump" ? "bg-rose-50 text-rose-700 ring-rose-200"
                                          : "bg-stone-100 text-slate-500 ring-slate-200";
                            const laneLabel = lane === "normal" ? "normal"
                                            : lane === "tight" ? "tight-fair"
                                            : lane === "late_dump" ? "late dump"
                                            : lane === "removed" ? "removed" : "blocked";
                            const statusCls = isDone ? "bg-emerald-100 text-emerald-800"
                                            : it.status === "in_progress" || it.status === "started" ? "bg-blue-50 text-blue-700"
                                            : "bg-slate-100 text-slate-600";
                            return (
                              <tr key={it.issue_id}
                                  className={`border-t border-stone-100 ${isDone ? "bg-emerald-50/20" : ""}`}>
                                <td className="px-3 py-2 font-mono text-xs text-slate-600">{it.issue_id}</td>
                                <td className="px-3 py-2 text-slate-800 max-w-md truncate" title={it.title ?? ""}>
                                  {it.title ?? <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-3 py-2">
                                  {it.priority
                                    ? <span className={`inline-block text-[10px] ${priCls} rounded px-1.5 py-0.5 font-mono`}>{it.priority}</span>
                                    : <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {hasEst
                                    ? <span className="text-slate-700 font-medium">{it.story_points}</span>
                                    : <span title="PM has not added an SP estimate yet — weight from 1-SP minimum"
                                            className="inline-block text-[10px] bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 rounded-full px-2 py-0.5">no&nbsp;estimate</span>}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  <span className={`font-medium ${hasEst ? "text-slate-900" : "text-slate-400"}`}>{w}</span>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700 font-medium">
                                  {ed}<span className="text-[10px] text-slate-400 ml-0.5">d</span>
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`inline-block text-[10px] ${laneCls} ring-1 ring-inset rounded-full px-1.5 py-0.5`}>
                                    {laneLabel}
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  {it.status
                                    ? <span className={`inline-block text-[10px] ${statusCls} rounded px-1.5 py-0.5`}>
                                        {it.status === "in_progress" ? "in progress" : it.status}
                                      </span>
                                    : <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-500">
                                  {it.assigned_at ? new Date(it.assigned_at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—"}
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-500">
                                  {it.completed_at
                                    ? <span className="text-emerald-700">{new Date(it.completed_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                                    : <span className="text-slate-300">—</span>}
                                </td>
                              </tr>
                            );
                          })}
                          {c.issues.length === 0 && (
                            <tr>
                              <td colSpan={10} className="px-4 py-6 text-center text-slate-400 text-xs">
                                No issues recorded for this cycle.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </details>
                );
              })}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-end justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Snapshot history (newest first)
          </h2>
          <p className="text-xs text-slate-400">
            Showing <b>{tableRows.length}</b> of {tableRowsAll.length} day{tableRowsAll.length !== 1 ? "s" : ""}.
            Δ columns show what changed vs the previous snapshot.
          </p>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Cycle</th>
                <th className="text-right px-4 py-3">Tickets</th>
                <th className="text-right px-4 py-3">Δ tix</th>
                <th className="text-right px-4 py-3">SP</th>
                <th className="text-right px-4 py-3">Δ sp</th>
                <th className="text-right px-4 py-3">%</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Final</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r, i) => {
                const tixPct = fmtPct(r.tickets_completed, r.tickets_total);
                const scopeAdded = r.tickets_added > 0 || r.sp_added > 0;
                return (
                  <tr key={i} className={`border-t border-stone-100 hover:bg-stone-50 ${i === 0 ? "bg-[#faf7ff]/50" : ""}`}>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {new Date(r.snapshot_at).toLocaleDateString(undefined, {
                        weekday: "short", day: "numeric", month: "short", year: "numeric",
                      })}
                      {i === 0 && (
                        <span className="ml-2 text-[9px] uppercase tracking-wider bg-[#AE00D0] text-white rounded-full px-1.5 py-0.5">
                          latest
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.cycle_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.tickets_completed ?? 0}/{r.tickets_total ?? 0}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums text-xs ${
                      r.tickets_added > 0 ? "text-amber-700 font-semibold"
                      : r.tickets_added < 0 ? "text-blue-700"
                      : "text-slate-300"
                    }`}>
                      {r.tickets_added > 0 ? `+${r.tickets_added}` : r.tickets_added < 0 ? `${r.tickets_added}` : "·"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.story_points_completed ?? 0}/{r.story_points_total ?? 0}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums text-xs ${
                      r.sp_added > 0 ? "text-amber-700 font-semibold"
                      : r.sp_added < 0 ? "text-blue-700"
                      : "text-slate-300"
                    }`}>
                      {r.sp_added > 0 ? `+${r.sp_added}` : r.sp_added < 0 ? `${r.sp_added}` : "·"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {tixPct !== null ? `${tixPct}%` : "—"}
                    </td>
                    <td className="px-4 py-3">{classBadge(r.classification)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.final_score !== null ? Number(r.final_score).toFixed(2) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hasMore && (
            <div className="border-t border-stone-100 bg-stone-50 px-4 py-3 text-center">
              <Link
                href={`/employees/${encodeURIComponent(name)}?${cycleFilter ? `cycle=${encodeURIComponent(cycleFilter)}&` : ""}days=${daysShown + DAYS_PER_PAGE}`}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-white border border-stone-300 text-sm text-slate-700 hover:border-[#AE00D0] hover:text-[#AE00D0]"
              >
                Load {Math.min(DAYS_PER_PAGE, tableRowsAll.length - daysShown)} more day{Math.min(DAYS_PER_PAGE, tableRowsAll.length - daysShown) !== 1 ? "s" : ""}
                <span className="text-slate-400">↓</span>
              </Link>
            </div>
          )}
        </div>

        {/* Scope-delta legend */}
        <div className="mt-3 text-xs text-slate-500 leading-relaxed">
          <span className="text-amber-700 font-semibold">+N (amber)</span> = tickets / SP added mid-cycle (work load grew).{" "}
          <span className="text-blue-700 font-semibold">−N (blue)</span> = removed / reassigned away.{" "}
          When you finalise the cycle, you can apply a grace mark to compensate for mid-cycle scope expansion (e.g.{" "}
          <code>give +1 to mayank in May — completed all original commitments before scope expansion</code>).
        </div>
      </section>
    </div>
  );
}
