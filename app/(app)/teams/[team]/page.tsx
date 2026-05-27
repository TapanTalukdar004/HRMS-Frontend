import Link from "next/link";
import { notFound } from "next/navigation";
import { listCycleSummariesForTeam, listTeams } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: Promise<{ team: string }> };

export async function generateMetadata({ params }: Props) {
  const { team } = await params;
  return { title: `${decodeURIComponent(team)} · HR Bot` };
}

export default async function TeamDetailPage({ params }: Props) {
  const { team: rawTeam } = await params;
  const team = decodeURIComponent(rawTeam);

  // Verify team exists
  const allTeams = await listTeams();
  const teamCard = allTeams.find((t) => t.team === team);
  if (!teamCard) return notFound();

  const cycles = await listCycleSummariesForTeam(team);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      <Link href="/teams" className="text-sm text-slate-500 hover:text-[#AE00D0]">
        ← Back to all teams
      </Link>

      {/* Team header — PM up top, single line, not in any table */}
      <div className="mt-4 mb-10 flex items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{team}</h1>
          <div className="mt-2 flex items-center gap-3 text-sm">
            {teamCard.active_pm ? (
              <span className="text-slate-700">
                <span className="text-slate-400 text-xs uppercase tracking-wider mr-2">Project Manager</span>
                <span className="font-medium text-[#6745E8]">{teamCard.active_pm}</span>
              </span>
            ) : (
              <span className="text-slate-400 italic text-sm">
                No PM assigned yet — will be asked at the next end-of-cycle report
              </span>
            )}
          </div>
        </div>
        <Link
          href={`/teams/${encodeURIComponent(team)}/rollup?scope=month`}
          className="text-sm font-medium text-white bg-[#AE00D0] hover:bg-[#9100ad] px-4 py-2 rounded-lg transition"
        >
          📊 View Monthly / Quarterly / Annual rollup →
        </Link>
      </div>

      {/* Cycle selector */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Which cycle do you want to see?
          </h2>
          <div className="text-xs text-slate-400">
            {cycles.length} cycle{cycles.length !== 1 ? "s" : ""} on record
          </div>
        </div>

        {cycles.length === 0 ? (
          <div className="text-center py-16 text-slate-500 bg-white rounded-xl border border-stone-200">
            <div className="text-4xl mb-3">📭</div>
            <div>No cycles posted yet for this team.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {cycles.map((c) => (
              <Link
                key={c.cycle_name}
                href={`/teams/${encodeURIComponent(team)}/cycles/${encodeURIComponent(c.cycle_name)}`}
                className="block bg-white rounded-xl border border-stone-200 hover:border-[#AE00D0]
                           hover:shadow-sm transition px-6 py-5 group"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold text-slate-900 group-hover:text-[#AE00D0]">
                    {c.cycle_name}
                  </h3>
                  <div className="text-xs text-slate-400">
                    {c.n_snapshots} snapshot{c.n_snapshots !== 1 ? "s" : ""} from Esha
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500">
                    {c.cycle_start ?? "?"} → {c.cycle_end ?? "?"}
                    <span className="text-slate-300 mx-2">·</span>
                    Latest snapshot: {new Date(c.latest_snapshot_at).toLocaleDateString(undefined, {
                      weekday: "short", day: "numeric", month: "short", year: "numeric",
                    })}
                  </div>
                  <div className="text-xs text-slate-400 group-hover:text-[#AE00D0]">
                    View employees →
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
