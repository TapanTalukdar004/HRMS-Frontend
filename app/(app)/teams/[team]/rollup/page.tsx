import Link from "next/link";
import { notFound } from "next/navigation";
import {
  listTeams,
  getTeamMonthlyRollup,
  getTeamQuarterlyRollup,
  getTeamAnnualRollup,
  currentPeriod,
  periodLabel,
  type RollupRow,
} from "@/lib/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Scope = "month" | "quarter" | "year";

type Props = {
  params: Promise<{ team: string }>;
  searchParams: Promise<{ scope?: string; period?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { team } = await params;
  return { title: `${decodeURIComponent(team)} · Rollup · HR Bot` };
}

function parseScope(s: string | undefined): Scope {
  if (s === "quarter" || s === "year") return s;
  return "month";
}

function statusBadge(r: RollupRow) {
  const map: Record<string, string> = {
    high: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    mid: "bg-amber-50 text-amber-700 ring-amber-200",
    low: "bg-rose-50 text-rose-700 ring-rose-200",
    pending: "bg-slate-100 text-slate-500 ring-slate-300",
  };
  const label = {
    high: "on track", mid: "mid", low: "behind", pending: "pending HR",
  }[r.classification];
  return (
    <span className={`inline-block text-[11px] ring-1 ring-inset rounded-full px-2 py-0.5 ${map[r.classification]}`}>
      {label}
    </span>
  );
}

function periodOptions(scope: Scope): string[] {
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

export default async function RollupPage({ params, searchParams }: Props) {
  const { team: rawTeam } = await params;
  const sp = await searchParams;
  const team = decodeURIComponent(rawTeam);
  const scope = parseScope(sp.scope);
  const period = sp.period?.trim() || currentPeriod(scope);

  const allTeams = await listTeams();
  const teamCard = allTeams.find((t) => t.team === team);
  if (!teamCard) return notFound();

  let rows: RollupRow[] = [];
  if (scope === "month") rows = await getTeamMonthlyRollup(team, period);
  else if (scope === "quarter") rows = await getTeamQuarterlyRollup(team, period);
  else rows = await getTeamAnnualRollup(team, period);

  const options = periodOptions(scope);
  const subUnit = scope === "month" ? "cycles" : scope === "quarter" ? "months×cycles" : "quarters×cycles";

  // Aggregates — use display_score so preliminary employees count too.
  // This gives an honest "current state" picture instead of only counting
  // the few HR-finalised rows.
  const teamAvg = rows.length > 0
    ? rows.reduce((s, r) => s + Number(r.display_score), 0) / rows.length
    : null;
  const finalisedRows = rows.filter((r) => !r.is_preliminary);
  const teamFinalisedAvg = finalisedRows.length > 0
    ? finalisedRows.reduce((s, r) => s + Number(r.final_score ?? 0), 0) / finalisedRows.length
    : null;
  const totalGrace = rows.reduce((s, r) => s + Number(r.grace_sum), 0);
  const totalCycles = rows.reduce((s, r) => s + r.cycle_count, 0);
  const totalPending = rows.reduce((s, r) => s + r.pending_cycles, 0);
  const anyPreliminary = rows.some((r) => r.is_preliminary);

  // Classify on display_score for the distribution chart (so HR sees current state)
  const onTrack = rows.filter((r) => !r.is_preliminary && r.display_score >= 8).length;
  const midPerformers = rows.filter((r) => !r.is_preliminary && r.display_score >= 6 && r.display_score < 8).length;
  const behind = rows.filter((r) => !r.is_preliminary && r.display_score < 6).length;
  const pending = rows.filter((r) => r.is_preliminary).length;

  const tierColor = teamAvg === null ? "from-slate-300 to-slate-400"
    : teamAvg >= 8 ? "from-emerald-400 to-emerald-600"
    : teamAvg >= 6 ? "from-amber-400 to-amber-600"
    : "from-rose-400 to-rose-600";

  return (
    <main className="max-w-7xl mx-auto px-8 py-10">
      <Link
        href={`/teams/${encodeURIComponent(team)}`}
        className="text-sm text-slate-500 hover:text-[#AE00D0]"
      >
        ← Back to {team}
      </Link>

      <div className="mt-4 mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          {team} · Rollup
        </h1>
        {teamCard.active_pm && (
          <div className="mt-2 text-sm text-slate-500">
            <span className="text-slate-400 text-xs uppercase tracking-wider mr-2">PM</span>
            <span className="text-[#6745E8] font-medium">{teamCard.active_pm}</span>
          </div>
        )}
      </div>

      {/* Scope tabs + Period dropdown */}
      <section className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex bg-stone-100 rounded-lg p-1">
          {(["month", "quarter", "year"] as const).map((s) => (
            <Link
              key={s}
              href={`/teams/${encodeURIComponent(team)}/rollup?scope=${s}&period=${currentPeriod(s)}`}
              className={
                scope === s
                  ? "px-4 py-1.5 rounded-md bg-white shadow-sm text-sm font-medium text-[#AE00D0]"
                  : "px-4 py-1.5 rounded-md text-sm text-slate-600 hover:text-slate-900"
              }
            >
              {s === "month" ? "Monthly" : s === "quarter" ? "Quarterly" : "Annual"}
            </Link>
          ))}
        </div>

        <form method="GET" className="flex items-center gap-2">
          <input type="hidden" name="scope" value={scope} />
          <select
            name="period"
            defaultValue={period}
            className="px-3 py-2 rounded-lg border border-stone-300 bg-white text-sm
                       focus:outline-none focus:border-[#AE00D0] focus:ring-2 focus:ring-[#AE00D0]/15"
          >
            {options.map((p) => (
              <option key={p} value={p}>
                {periodLabel(scope, p)}{p === currentPeriod(scope) ? " (current)" : ""}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="px-3 py-2 rounded-lg bg-[#AE00D0] text-white text-sm font-medium hover:bg-[#9100ad]"
          >
            View
          </button>
        </form>
      </section>

      {/* TEAM HERO CARD */}
      <section className="mb-8 relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-7">
        <div className={`absolute -inset-x-px -top-px h-1 bg-gradient-to-r ${tierColor}`} />
        <div className="flex items-center justify-between gap-8">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Team avg · {periodLabel(scope, period)}
              {anyPreliminary && (
                <span className="ml-2 text-amber-600 normal-case">(preliminary)</span>
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <div className={`text-6xl font-bold tabular-nums ${teamAvg === null ? "text-slate-300" : "text-slate-900"}`}>
                {teamAvg !== null ? teamAvg.toFixed(2) : "—"}
              </div>
              {teamAvg !== null && <div className="text-2xl text-slate-400 font-light">/ 10</div>}
            </div>
            <div className="mt-1 text-xs text-slate-500 max-w-md">
              {anyPreliminary ? (
                <>
                  Across all {rows.length} employees. <span className="text-amber-700 font-medium">{pending} are still pending HR escalation</span> — their numbers use the raw completion % as a preliminary estimate. Score will firm up once HR finalises.
                  {teamFinalisedAvg !== null && (
                    <span className="block mt-1 text-slate-400">
                      Of the {finalisedRows.length} already finalised: avg <b>{teamFinalisedAvg.toFixed(2)}</b>.
                    </span>
                  )}
                </>
              ) : (
                <>All {rows.length} employees finalised.</>
              )}
            </div>
          </div>

          {/* Distribution */}
          <div className="flex-1 grid grid-cols-4 gap-3 max-w-2xl">
            <Mini label="On track" value={onTrack} tone="emerald" />
            <Mini label="Mid" value={midPerformers} tone="amber" />
            <Mini label="Behind" value={behind} tone="rose" />
            <Mini label="Pending" value={pending} tone="slate" />
          </div>
        </div>

        {/* Secondary metrics row */}
        <div className="mt-6 pt-6 border-t border-stone-100 grid grid-cols-4 gap-6">
          <Detail label="Employees in period" value={rows.length.toString()} />
          <Detail label={subUnit} value={totalCycles.toString()} sub={totalPending > 0 ? `${totalPending} pending` : undefined} />
          <Detail label="Grace applied" value={
            totalGrace === 0 ? "0" : (totalGrace > 0 ? "+" : "") + totalGrace.toFixed(2)
          } />
          <Detail label="Scope" value={scope.charAt(0).toUpperCase() + scope.slice(1) + "ly"} />
        </div>
      </section>

      {/* Per-employee table */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Per-employee breakdown
        </h2>
        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-stone-200 p-12 text-center text-slate-500">
            <div className="text-4xl mb-3">📭</div>
            <div className="font-medium">No cycle data in {periodLabel(scope, period)} yet.</div>
            <div className="text-sm mt-1 text-slate-400">
              Once Esha posts cycles ending in this period, the rollup appears here.
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3">Employee</th>
                  <th className="text-right px-4 py-3">Cycles</th>
                  <th className="text-right px-4 py-3">Base avg</th>
                  <th className="text-right px-4 py-3">Grace</th>
                  <th className="text-right px-4 py-3">Final / 10</th>
                  <th className="text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employee_name} className="border-t border-stone-100 hover:bg-stone-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link
                        href={`/employees/${encodeURIComponent(r.employee_name)}?scope=${scope}&period=${period}`}
                        className="hover:text-[#AE00D0]"
                      >
                        {r.employee_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.cycle_count}
                      {r.pending_cycles > 0 && (
                        <span className="ml-1 text-xs text-amber-600">
                          ({r.pending_cycles} pending)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {r.cycle_avg !== null ? Number(r.cycle_avg).toFixed(2) : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${
                      Number(r.grace_sum) > 0 ? "text-emerald-700"
                      : Number(r.grace_sum) < 0 ? "text-rose-700"
                      : "text-slate-400"
                    }`}>
                      {Number(r.grace_sum) > 0 ? "+" : ""}{Number(r.grace_sum).toFixed(2)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums text-lg font-semibold ${
                      r.is_preliminary ? "text-slate-500" : "text-slate-900"
                    }`}>
                      {Number(r.display_score).toFixed(2)}
                      {r.is_preliminary && (
                        <div className="text-[9px] uppercase tracking-wider text-amber-600 font-normal mt-0.5">
                          preliminary
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">{statusBadge(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-4 text-xs text-slate-400 leading-relaxed">
        Rollup formula: <code>{
          scope === "month"
            ? "avg(cycle final_score) + month-scope grace"
            : scope === "quarter"
            ? "avg(monthly_score for 3 months) + quarter-scope grace"
            : "avg(quarterly_score for 4 quarters) + year-scope grace"
        }</code>, clamped to [0, 10]. See <code>docs/HR_Bot_Performance_System.pdf</code> §6.
      </p>
    </main>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "rose" | "slate" }) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    slate: "bg-slate-50 text-slate-600",
  };
  return (
    <div className={`${colors[tone]} rounded-xl p-3 text-center`}>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider mt-0.5 opacity-80">{label}</div>
    </div>
  );
}

function Detail({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{value}</div>
      {sub && <div className="text-[11px] text-amber-600 mt-0.5">{sub}</div>}
    </div>
  );
}
