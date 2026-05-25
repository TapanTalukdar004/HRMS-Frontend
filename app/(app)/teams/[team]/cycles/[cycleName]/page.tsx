import Link from "next/link";
import { notFound } from "next/navigation";
import {
  listSnapshotsForCycle,
  getSnapshotEmployeesWithDelta,
  listTeams,
} from "@/lib/queries";
import { SnapshotDatePicker } from "@/components/SnapshotDatePicker";

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

  return (
    <main className="max-w-7xl mx-auto px-8 py-10">
      <Link
        href={`/teams/${encodeURIComponent(team)}`}
        className="text-sm text-slate-500 hover:text-[#AE00D0]"
      >
        ← Back to {team}
      </Link>

      {/* Team + cycle header — PM up top, not in any row */}
      <div className="mt-4 mb-8">
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
    </main>
  );
}
