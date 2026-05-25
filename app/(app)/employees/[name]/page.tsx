import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEmployeeTrend,
  getEmployeeRollup,
  currentPeriod,
  periodLabel,
} from "@/lib/queries";
import { EmployeeTrendChart, type EmployeeSnapshotPoint } from "@/components/EmployeeTrendChart";
import { EmployeeRollupView } from "@/components/EmployeeRollupView";

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
      <Link href="/employees" className="text-sm text-slate-500 hover:text-[#AE00D0]">
        ← All employees
      </Link>

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

function CycleView({ name, fullTrend, cycleFilter, daysShown }: {
  name: string;
  fullTrend: Awaited<ReturnType<typeof getEmployeeTrend>>;
  cycleFilter: string | null;
  daysShown: number;
}) {
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
