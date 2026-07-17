import Link from "next/link";
import { listRosterEmployees } from "@/lib/queries";
import { getCycleContext } from "@/lib/realReport";
import { getOverviewData, getCycleChanges, getSnapshotDiff } from "@/lib/overviewQueries";
import EmployeePerfCard from "./EmployeePerfCard";
import ChangesPanel from "./ChangesPanel";

/** Company/team PERFORMANCE OVERVIEW — LIVE (PRD/08 Phase D). Headline numbers come from the
 *  persisted score store (frozen at cycle end); card internals share the proof-first lens with
 *  the Engineer Report. Advisory: a human always decides; never a ranked leaderboard. */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Performance overview · HR Bot" };

const Dash = () => <span className="text-slate-300">—</span>;
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");

function Kpi({ label, value, hint, c }: { label: string; value: React.ReactNode; hint: string; c: string }) {
  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-5">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: c }} />
        <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <div className="text-3xl font-bold tabular-nums mt-2 text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-400 mt-1">{hint}</div>
    </div>
  );
}

function Row({ label, sub, dot, value }: { label: string; sub: string; dot: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-t border-stone-100 first:border-t-0 text-[13px]">
      <span className="flex items-center gap-2 text-slate-600">
        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: dot }} />
        {label} <span className="text-slate-400 text-[11px]">· {sub}</span>
      </span>
      <span className="font-semibold tabular-nums text-slate-800">{value}</span>
    </div>
  );
}

const SINCE_KEYS = ["24h", "3d", "7d", "cycle"] as const;

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ cycle?: string; since?: string }> }) {
  const sp = await searchParams;
  const reqCycle = sp?.cycle && /^\d+$/.test(sp.cycle) ? Number(sp.cycle) : null;
  const sinceKey = sp?.since && (SINCE_KEYS as readonly string[]).includes(sp.since) ? sp.since : "24h";
  // Resolve the cycle context FIRST (one cheap query), then everything else — roster, the heavy
  // overview recompute, and both "what changed" panels — runs in ONE concurrent wave (changes/236).
  // Before, changes/diff waited for the full getOverviewData waterfall they never depended on.
  const cycle = await getCycleContext();
  // "What changed" panel — same cycle scope as the dashboard; date window from ?since (default 24h)
  const panelCycle = reqCycle ?? cycle.current;
  const panelWin = cycle.windows.find((w) => w.number === panelCycle);
  const DAY_MS = 86400000;
  const sinceISO = sinceKey === "cycle" && panelWin?.startsAt
    ? panelWin.startsAt
    : new Date(Date.now() - (sinceKey === "7d" ? 7 : sinceKey === "3d" ? 3 : 1) * DAY_MS).toISOString();
  const [roster, data, changes, diff] = await Promise.all([
    listRosterEmployees(),
    getOverviewData(reqCycle, cycle),
    cycle.current != null ? getCycleChanges(panelCycle, sinceISO) : null,
    cycle.current != null ? getSnapshotDiff(panelCycle) : null,
  ]);
  const { scopedCycle, issueStats, prStats, linkCoveragePct, noEvidence, distribution, topPerformer, needsAttention, cards } = data;
  const live = cycle.current != null;
  const scopeLabel = scopedCycle != null ? `cycle ${scopedCycle}` : `cycle ${cycle.current ?? "—"} · current`;
  const scopeWin = cycle.windows.find((w) => w.number === (scopedCycle ?? cycle.current));
  const issuesTotal = issueStats.planned + issueStats.inProgress + issueStats.done + issueStats.held;
  const distTotal = distribution.strong + distribution.mid + distribution.behind;
  const dayInfo = (() => {
    const s = scopeWin?.startsAt, e = scopeWin?.endsAt;
    if (!s || !e) return "";
    const day = Math.max(1, Math.ceil((Date.now() - new Date(s).getTime()) / 86400000));
    const len = Math.max(1, Math.round((new Date(e).getTime() - new Date(s).getTime()) / 86400000));
    const within = Date.now() >= new Date(s).getTime() && Date.now() <= new Date(e).getTime();
    return `${within ? `day ${Math.min(day, len)}/${len} · ` : ""}${fmtDate(s)} – ${fmtDate(e)}`;
  })();
  const tokenOf = (name: string) => name.trim().split(/\s+/)[0].toLowerCase();
  // people with analyzed work first (most points), then the rest of the roster
  const sorted = [...roster].sort((a, b) => {
    const pa = cards.get(tokenOf(a.employee_name))?.points ?? -1;
    const pb = cards.get(tokenOf(b.employee_name))?.points ?? -1;
    return pb - pa;
  });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10 space-y-6">
      {/* Gradient hero */}
      <div className="rounded-2xl p-6 sm:p-8 text-white bg-gradient-to-br from-[#AE00D0] to-[#7B5AFF]">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Performance overview</h1>
        <p className="mt-1.5 text-white/85 text-sm max-w-2xl">The whole team at a glance — issues, PR completion, and per-person performance. Advisory: a human always decides; this is never a ranked leaderboard.</p>
        {live ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-white/70 mr-0.5">Cycle:</span>
            {cycle.windows.map((w) => {
              const on = w.number === (scopedCycle ?? cycle.current);
              return (
                <Link key={w.number} href={w.number === cycle.current ? "/overview" : `/overview?cycle=${w.number}`}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 transition ${on ? "bg-white text-[#7B5AFF] font-semibold" : "bg-white/15 text-white hover:bg-white/25"}`}>
                  {w.isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />}
                  {w.number}{w.isCurrent ? " · current" : ""}{w.count === 0 ? " · empty" : ""}
                </Link>
              );
            })}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">{roster.length} on roster</span>
            {scopedCycle != null && <Link href="/overview" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 hover:bg-white/25">← current cycle</Link>}
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1"><span className="w-1.5 h-1.5 rounded-full bg-white/90 inline-block" /> Null base — analyzer not connected</span>
            <Link href="/employees/new" className="inline-flex items-center gap-1.5 rounded-full bg-white text-[#7B5AFF] font-medium px-3 py-1 hover:bg-white/90">+ add employee</Link>
          </div>
        )}
      </div>

      {/* Upper KPI band */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Team members" value={roster.length} hint="on the roster" c="#AE00D0" />
        <Kpi label={scopedCycle != null ? "Viewing cycle" : "Active cycle"} value={live ? (scopedCycle ?? cycle.current) : <Dash />} hint={live ? (dayInfo || "empty cycle") : "cycle — null"} c="#6745E8" />
        <Kpi label="Issues completed" value={live ? issueStats.done : <Dash />} hint={live ? `of ${issuesTotal} in ${scopeLabel}` : "of — this cycle"} c="#1D9E75" />
        <Kpi label="No PR evidence" value={live ? noEvidence.total : <Dash />} hint={live ? "assigned, no merged PR" : "—"} c="#e11d48" />
        <Kpi label="Top performer" value={topPerformer ? topPerformer.token : <Dash />} hint={topPerformer ? `${topPerformer.points.toFixed(1)} pts (proof-first)` : "by combined score"} c="#D4537E" />
        <Kpi label="Needs attention" value={live ? needsAttention : <Dash />} hint="mismatch / no-proof / off-plan" c="#EF9F27" />
      </div>

      {/* No-PR-evidence signal — assigned issues with no merged PR, by owner */}
      {live && noEvidence.total > 0 && (
        <section className="rounded-xl border border-rose-200 bg-rose-50/40 p-4">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-semibold text-rose-900">Assigned but no PR evidence <span className="text-[11px] font-normal text-rose-500">· {noEvidence.total} issues in {scopeLabel} have no merged linked PR</span></h2>
            <span className="text-[11px] text-slate-400">work with no code trail — verify or it shipped in another repo</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {noEvidence.byOwner.slice(0, 14).map((o) => (
              <Link key={o.token} href={o.token === "unassigned" ? "#" : `/employees/${encodeURIComponent(o.token)}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-white ring-1 ring-inset ring-rose-200 px-2.5 py-1 text-[12px] text-rose-800 hover:bg-rose-100">
                {o.token} <b className="tabular-nums">{o.n}</b>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* What changed since ___ (day-over-day diff) */}
      {live && changes && diff && <ChangesPanel changes={changes} diff={diff} since={sinceKey} cycleParam={reqCycle} />}

      {/* Issue + PR completion detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Issues <span className="text-[11px] font-normal text-slate-400">· Linear · cycle {scopedCycle ?? cycle.current ?? "—"}</span></h2>
          <Row label="Planned" sub="committed, not started" dot="#94a3b8" value={live ? issueStats.planned : <Dash />} />
          <Row label="In progress" sub="being worked / in review" dot="#378ADD" value={live ? issueStats.inProgress : <Dash />} />
          <Row label="Done" sub="completed" dot="#1D9E75" value={live ? issueStats.done : <Dash />} />
          <Row label="Blocked / held" sub="on hold" dot="#e11d48" value={live ? issueStats.held : <Dash />} />
        </section>
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">PR completion <span className="text-[11px] font-normal text-slate-400">· GitHub</span></h2>
          <Row label="Open" sub="in review" dot="#EF9F27" value={live ? prStats.open : <Dash />} />
          <Row label="Merged" sub="shipped" dot="#1D9E75" value={live ? prStats.merged : <Dash />} />
          <Row label="Matched to Linear" sub="linked to an issue" dot="#AE00D0" value={live ? prStats.matched : <Dash />} />
          <Row label="Untracked" sub="no ticket id on the PR" dot="#e11d48" value={live ? prStats.orphaned : <Dash />} />
        </section>
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Health</h2>
          <div className="space-y-3.5">
            <div>
              <div className="flex items-center justify-between text-[12px] text-slate-600"><span>Link coverage</span><span className="font-semibold tabular-nums">{linkCoveragePct != null ? `${linkCoveragePct}%` : <Dash />}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-stone-200 overflow-hidden"><div className="h-full bg-[#AE00D0]" style={{ width: `${linkCoveragePct ?? 0}%` }} /></div>
              <div className="text-[10px] text-slate-400 mt-0.5">% of PRs carrying a Linear ticket id — raise by putting AB-### in branch names</div>
            </div>
            <div>
              <div className="text-[12px] text-slate-600 mb-1">Score distribution <span className="text-[10px] text-slate-400">· {distTotal} scored</span></div>
              <div className="flex h-3 rounded-full overflow-hidden ring-1 ring-stone-200 bg-stone-100">
                <div className="bg-emerald-300" style={{ width: distTotal ? `${(100 * distribution.strong) / distTotal}%` : "0%" }} />
                <div className="bg-amber-300" style={{ width: distTotal ? `${(100 * distribution.mid) / distTotal}%` : "0%" }} />
                <div className="bg-rose-300" style={{ width: distTotal ? `${(100 * distribution.behind) / distTotal}%` : "0%" }} />
              </div>
              <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-300 inline-block" /> strong {distribution.strong}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-300 inline-block" /> ok {distribution.mid}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-300 inline-block" /> needs review {distribution.behind}</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Per-employee cards */}
      <section>
        <div className="flex items-end justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">People <span className="text-slate-300 normal-case tracking-normal">· {roster.length}</span></h2>
          <div className="flex items-center gap-4">
            <Link href="/report" className="text-[13px] text-[#7B5AFF] hover:underline">Engineer Report (evidence) →</Link>
            <Link href="/employees/new" className="text-[13px] text-[#AE00D0] hover:underline">+ add employee</Link>
          </div>
        </div>
        {roster.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white px-4 py-12 text-center text-slate-400 text-sm">No employees yet. Add people on the <Link href="/employees" className="text-[#AE00D0] hover:underline">Employees</Link> tab.</div>
        ) : (
          <div className="space-y-4">
            {sorted.map((emp) => <EmployeePerfCard key={emp.employee_id} emp={emp} data={cards.get(tokenOf(emp.employee_name))} />)}
          </div>
        )}
      </section>

      <p className="text-[11px] text-slate-400 text-center">Advisory — these numbers inform a human decision; they are never applied automatically, and this is not a ranked leaderboard.</p>
    </main>
  );
}
