/**
 * /teams — the entry point into the performance Dashboard (change 172, Decision 1).
 * Rebuilt on the PR-evidence lineage (getCycleContext), NOT the old Esha performance_cycles model.
 * Lists the tracked team and its in-scope Linear cycles {current, -1, -2}; clicking a cycle opens the
 * cycle-scoped Dashboard (/overview?cycle=N). The empty cycle (e.g. 11) shows honestly as 0/0.
 */
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { accountFor, AUTH_COOKIE } from "@/lib/auth";
import { getCycleContext, REAL_REPO } from "@/lib/realReport";
import { listRosterEmployees } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Teams · HR Bot" };

const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—");

export default async function TeamsPage() {
  const acct = accountFor((await cookies()).get(AUTH_COOKIE)?.value);
  if (!acct) redirect("/login");
  if (acct.role !== "hr") redirect("/me");

  const [cycle, roster] = await Promise.all([getCycleContext(), listRosterEmployees()]);
  const live = cycle.current != null;

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10 space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Teams</h1>
        <p className="mt-1 text-slate-500 text-[14px]">Pick a team and cycle to open its performance Dashboard. Scope is the current + 2 prior Linear cycles.</p>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-4 p-5 bg-gradient-to-br from-[#AE00D0] to-[#7B5AFF] text-white">
          <div>
            <div className="text-xl font-semibold">Agent Builder</div>
            <div className="text-[12.5px] text-white/85 mt-0.5">{REAL_REPO} · {roster.length} on roster</div>
          </div>
          <Link href="/overview" className="rounded-full bg-white text-[#7B5AFF] font-medium text-[13px] px-4 py-1.5 hover:bg-white/90">Open Dashboard →</Link>
        </div>

        {live ? (
          <div className="p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Cycles in scope</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {cycle.windows.map((w) => (
                <Link key={w.number} href={w.number === cycle.current ? "/overview" : `/overview?cycle=${w.number}`}
                  className="group rounded-xl border border-stone-200 hover:border-[#AE00D0] hover:shadow-sm transition p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold text-slate-900">Cycle {w.number}</span>
                    {w.isCurrent && <span className="text-[10px] uppercase tracking-wider rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">current</span>}
                  </div>
                  <div className="text-[12px] text-slate-500 mt-1">{fmt(w.startsAt)} – {fmt(w.endsAt)}</div>
                  <div className="mt-2 text-[13px] text-slate-600 tabular-nums">
                    {w.count === 0 ? <span className="text-slate-400">no issues (carried into current)</span>
                      : <>{w.count} issue{w.count === 1 ? "" : "s"}{w.inherited > 0 ? ` · ${w.inherited} carried` : ""}</>}
                  </div>
                  <div className="mt-2 text-[12px] text-[#AE00D0] opacity-0 group-hover:opacity-100 transition">Open cycle Dashboard →</div>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 text-sm">No cycle data yet — the analyzer has not run for this team.</div>
        )}
      </div>

      <p className="text-[11px] text-slate-400 text-center">Advisory — a human always decides; this is never a ranked leaderboard.</p>
    </main>
  );
}
