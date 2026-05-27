import Link from "next/link";
import { listTeams } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Teams · HR Bot",
};

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function statusPill(team: { latest_days_left: number | null; n_low: number; n_employees: number }) {
  const daysLeft = team.latest_days_left;
  const lowFraction = team.n_employees > 0 ? team.n_low / team.n_employees : 0;
  if (daysLeft === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide
                       bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 rounded-full px-2 py-0.5">
        End of cycle
      </span>
    );
  }
  if (daysLeft !== null && daysLeft > 0) {
    const tone = lowFraction > 0.5 ? "bg-amber-50 text-amber-800 ring-amber-200"
                                    : "bg-emerald-50 text-emerald-700 ring-emerald-200";
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] uppercase tracking-wide ${tone}
                       ring-1 ring-inset rounded-full px-2 py-0.5`}>
        {daysLeft} day{daysLeft !== 1 ? "s" : ""} left
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide
                     bg-stone-100 text-slate-600 ring-1 ring-inset ring-stone-300 rounded-full px-2 py-0.5">
      Idle
    </span>
  );
}

export default async function TeamsPage() {
  const teams = await listTeams();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Teams</h1>
          <p className="mt-1 text-slate-500 text-sm">
            Every team that&apos;s ever posted a cycle report through Esha bot.
            Click a card to drill into the team&apos;s employees + cycle history.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          {teams.length} team{teams.length !== 1 ? "s" : ""}
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <div className="text-5xl mb-3">📭</div>
          <div className="text-lg">No teams yet.</div>
          <div className="text-sm mt-2">
            When Esha posts a cycle report in the Slack channel, it&apos;ll appear here.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {teams.map((t) => (
            <Link
              key={t.team}
              href={`/teams/${encodeURIComponent(t.team)}`}
              className="block bg-white rounded-xl border border-stone-200 hover:border-[#AE00D0]
                         hover:shadow-md transition p-6 group"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold text-slate-900 group-hover:text-[#AE00D0]">
                  {t.team}
                </h3>
                {statusPill(t)}
              </div>

              <div className="text-xs text-slate-500 mb-4">
                Latest cycle: <span className="text-slate-700 font-medium">{t.latest_cycle_name}</span>
                <span className="text-slate-400"> · {relTime(t.latest_cycle_received_at)}</span>
              </div>

              <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between text-xs text-slate-500">
                <div>
                  {t.active_pm ? (
                    <>
                      <span className="text-slate-400 uppercase tracking-wider mr-1">PM</span>
                      <span className="text-slate-800 font-medium">{t.active_pm}</span>
                    </>
                  ) : (
                    <span className="text-slate-400 italic">No PM yet</span>
                  )}
                </div>
                <div className="text-slate-400">
                  {t.total_cycles} cycle{t.total_cycles !== 1 ? "s" : ""} · {t.n_employees} member{t.n_employees !== 1 ? "s" : ""}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
