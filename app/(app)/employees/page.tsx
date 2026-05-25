import Link from "next/link";
import { listAllEmployees, getFilterOptions } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Employees · HR Bot" };

type SearchParams = Promise<{ q?: string; team?: string; dept?: string }>;

function classBadge(c: string | null) {
  if (c === "high") return <span className="inline-block text-[11px] bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 rounded-full px-2 py-0.5">on track</span>;
  if (c === "mid")  return <span className="inline-block text-[11px] bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 rounded-full px-2 py-0.5">mid</span>;
  if (c === "low")  return <span className="inline-block text-[11px] bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 rounded-full px-2 py-0.5">behind</span>;
  return <span className="inline-block text-[11px] bg-stone-100 text-slate-500 ring-1 ring-inset ring-stone-300 rounded-full px-2 py-0.5">—</span>;
}

export default async function EmployeesIndexPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const search = sp.q?.trim() || undefined;
  const team = sp.team?.trim() || undefined;
  const department = sp.dept?.trim() || undefined;

  const [rows, options] = await Promise.all([
    listAllEmployees({ search, team, department }),
    getFilterOptions(),
  ]);

  return (
    <main className="max-w-7xl mx-auto px-8 py-10">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Employees</h1>
          <p className="mt-1 text-slate-500 text-sm">
            Every person who&apos;s been scored in any cycle. Filter by name, team, or department.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          {rows.length} result{rows.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Filter bar */}
      <form method="GET" className="mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <input
          type="text"
          name="q"
          defaultValue={search ?? ""}
          placeholder="Search by name..."
          className="px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none
                     focus:ring-2 focus:ring-[#AE00D0]/40 focus:border-[#AE00D0]"
        />
        <select
          name="team"
          defaultValue={team ?? ""}
          className="px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white"
        >
          <option value="">All teams</option>
          {options.teams.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          name="dept"
          defaultValue={department ?? ""}
          className="px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white"
        >
          <option value="">All departments</option>
          {options.departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 px-4 py-2 rounded-lg bg-[#AE00D0] text-white text-sm font-medium
                       hover:bg-[#9100ad] transition"
          >
            Apply
          </button>
          <Link
            href="/employees"
            className="px-4 py-2 rounded-lg border border-stone-300 text-sm text-slate-600
                       hover:bg-stone-50 transition"
          >
            Reset
          </Link>
        </div>
      </form>

      {/* Results table */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Employee</th>
              <th className="text-left px-4 py-3">Department</th>
              <th className="text-left px-4 py-3">Teams</th>
              <th className="text-right px-4 py-3">Cycles</th>
              <th className="text-left px-4 py-3">Last cycle</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee_name} className="border-t border-stone-100 hover:bg-stone-50">
                <td className="px-4 py-3 font-medium text-slate-900">
                  <Link
                    href={`/employees/${encodeURIComponent(r.employee_name)}`}
                    className="hover:text-[#AE00D0]"
                  >
                    {r.employee_name}
                  </Link>
                  {r.email && (
                    <div className="text-xs text-slate-500 mt-0.5">{r.email}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {r.department ?? <span className="text-slate-400 italic">—</span>}
                  {r.designation && (
                    <div className="text-[11px] text-slate-500">{r.designation}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {r.teams_seen.length === 0 ? (
                    <span className="text-slate-400 italic">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {r.teams_seen.slice(0, 3).map((t) => (
                        <Link
                          key={t}
                          href={`/teams/${encodeURIComponent(t)}`}
                          className="text-[11px] px-2 py-0.5 rounded-md bg-[#f0ebff] text-[#6745E8]
                                     hover:bg-[#e3d7ff]"
                        >
                          {t}
                        </Link>
                      ))}
                      {r.teams_seen.length > 3 && (
                        <span className="text-[11px] text-slate-400">+{r.teams_seen.length - 3}</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{r.total_cycles}</td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {r.latest_cycle_name ?? <span className="text-slate-400 italic">—</span>}
                  {r.latest_received_at && (
                    <div className="text-[11px] text-slate-400">
                      {new Date(r.latest_received_at).toLocaleDateString()}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">{classBadge(r.latest_classification)}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.latest_final_score !== null ? Number(r.latest_final_score).toFixed(1) : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-16 text-center text-slate-400">
                No employees match this filter.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
