/**
 * /me — the employee's OWN performance page (PRD 10 role split). Read-only, own data only.
 * Same rich detail as the HR page (verdict gauge, trend graph, per-issue points, evidence + codebase
 * map) MINUS the HR attention flags (DeviationCard `employeeView`) — plus the "how your score is built"
 * Output/Quality/Reach signature and the friendly one-repo caveat + feedback chat. HR/PM → /overview.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { accountFor, AUTH_COOKIE } from "@/lib/auth";
import { getEmployeeReports, applyPersistedScores, getCycleContext, getCarryoverIssues, getMonthlyScore, getCycleHistory, REAL_REPO } from "@/lib/realReport";
import CarryoverSection from "@/components/CarryoverSection";
import ScoreScopeTabs from "@/components/ScoreScopeTabs";
import CycleHistory from "@/components/CycleHistory";
import { getDailyPoints } from "@/lib/overviewQueries";
import { EngineerCard, f1, qTone, bandWord } from "@/components/EngineerReport";
import { DeviationCard } from "@/components/DeviationCard";
import { FeedbackChat } from "@/components/FeedbackChat";
import EmployeePrAnalysis from "../employees/[name]/EmployeePrAnalysis";
import PerformanceGraph from "../employees/[name]/PerformanceGraph";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "My performance · HR Bot" };


function Tile({ label, value, tone = "text-slate-900" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-gradient-to-br from-white to-stone-50/40 border border-stone-200 rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold tabular-nums leading-tight ${tone}`}>{value}</div>
    </div>
  );
}

export default async function MePage() {
  const c = await cookies();
  const account = accountFor(c.get(AUTH_COOKIE)?.value);
  if (!account) redirect("/login");
  if (account.role !== "employee") redirect("/overview");

  const token = account.employee ?? account.username;
  const cyc = await getCycleContext();   // STRICT current-cycle scope (changes/204) — no prior-cycle leak
  const [reports0, daily] = await Promise.all([getEmployeeReports(cyc.current), getDailyPoints(token)]);
  const reports = await applyPersistedScores(reports0, cyc.current);   // persisted DB score for the current cycle (fallback: live)
  const carryover = await getCarryoverIssues(token, cyc.current);      // ongoing work from earlier cycles (shown, not scored)
  const monthly = await getMonthlyScore(token, new Date().toISOString());   // absolute monthly rollup + EWMA trend
  const cycleHistory = await getCycleHistory(token);                        // last 3 cycles' score + make-up
  const me = reports.find((r) => r.employee === token) ?? null;
  const display = account.label;
  const initials = display.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const hasProof = !!me && me.mergedPrs > 0;
  const bandCls = me?.band === "strong" ? "bg-emerald-100 text-emerald-700" : me?.band === "ok" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700";

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10 space-y-5">
      {/* header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#AE00D0] to-[#7B5AFF] text-white flex items-center justify-center text-xl font-semibold shrink-0">{initials}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Hi {display} 👋</h1>
            {hasProof && <span className={`text-[11px] uppercase tracking-wider rounded-full px-2.5 py-0.5 ${bandCls}`}>{bandWord(me!.band)}</span>}
          </div>
          <p className="text-[13px] text-slate-500 mt-0.5">Your work in <span className="font-medium text-slate-700">{REAL_REPO}</span> · current cycle · advisory — informs a conversation, never an automatic decision</p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-[13px] text-amber-900 leading-snug">
        <b>This is one repo only.</b> Work you shipped in other repos isn&apos;t counted here yet, so a low number can simply mean &ldquo;not visible yet.&rdquo; You can ask about any score you disagree with below.
      </div>

      {/* score signature — Cycle (real-time) / Monthly (rollup + trend) / Quarter (soon) */}
      <ScoreScopeTabs
        cycle={{ score: me?.scoreAbsolute ?? null, output: me?.output ?? null, quality: me && me.avgQuality != null ? me.avgQuality / 10 : null, reach: me?.reach ?? null }}
        monthly={monthly}
        subject="You"
      />

      {/* last 3 cycles — score history */}
      <CycleHistory rows={cycleHistory} />

      {hasProof ? (
        <>
          {/* key stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile label="Merged PRs" value={String(me!.mergedPrs)} />
            <Tile label="Avg quality" value={`${f1(me!.avgQuality)}/10`} tone={qTone(me!.avgQuality)} />
            <Tile label="Points earned" value={f1(me!.totalPoints)} tone="text-[#7B5AFF]" />
            <Tile label="Issues proven" value={String(me!.provenIssues.length)} />
          </div>

          {/* your work distribution — employeeView hides the HR attention flags */}
          <DeviationCard r={me!} employeeView />

          {/* impact over time */}
          {daily.length > 0 && (
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <h2 className="text-[14px] font-semibold text-slate-800 mb-1">Your impact over time <span className="text-[11px] font-normal text-slate-400">· points shipped per day (by PR merge date)</span></h2>
              <PerformanceGraph daily={daily} />
            </div>
          )}

          {/* how each issue's points are calculated */}
          <details className="rounded-xl border border-stone-200 bg-white">
            <summary className="cursor-pointer list-none px-5 py-3 text-[14px] font-semibold text-slate-800 flex items-center gap-2"><span className="text-[#AE00D0]">ⓘ</span> How each issue&apos;s points are calculated</summary>
            <div className="px-5 pb-4 pt-1 text-[13px] text-slate-600 leading-relaxed">
              <p>Your <b>overall score</b> above is Output / Quality / Reach. Each individual <b>issue&apos;s points</b> come from: <span className="font-mono text-[12px] text-[#7B5AFF]">size × quality × bug × proof × together × reach</span>, where <b>size</b> = story points × priority. Open any issue below for its exact math.</p>
            </div>
          </details>

          {/* your issues → per-issue points */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-2">Your issues &amp; PRs — open any for its points &amp; reason</h2>
            <EngineerCard r={me!} defaultOpen carryover={carryover} />
          </div>

          {/* evidence analysis + codebase map */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-2">Evidence — per-PR review &amp; where your work reached</h2>
            <EmployeePrAnalysis report={me!} />
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
            <div className="text-lg font-medium text-slate-800">No scored work in this repo yet</div>
            <p className="text-[14px] text-slate-500 mt-1">Either your PRs here aren&apos;t linked to a ticket, or your work is in another repo we haven&apos;t connected. This will fill in as more repos are added.</p>
          </div>
          {/* still surface ongoing carryover even with no scored work this cycle */}
          <CarryoverSection items={carryover} name="you" />
        </div>
      )}

      {/* talk to the AI about your scores */}
      <FeedbackChat />
    </main>
  );
}
