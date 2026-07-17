/**
 * /employees/[name] — the per-employee DETAIL page (HR/PM view), proof-first.
 * Rebuilt on getEmployeeReports (the same lens as the Dashboard) — REPLACES the old Esha snapshot scorecard.
 *   · verdict header (DeviationCard)
 *   · transparent score: each Linear issue → its PRs → contribution → overall, with the criteria shown (EngineerCard)
 *   · per-PR review feed + click-to-codebase-map (EmployeePrAnalysis, added in P3)
 * Scope = the current + 2 prior Linear cycles. HR view only; the employee self-view (/me) is separate.
 */
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { accountFor, AUTH_COOKIE } from "@/lib/auth";
import { getEmployeeReports, applyPersistedScores, getCycleContext, getCarryoverIssues, getMonthlyScore, getCycleHistory, REAL_REPO, type CycleHistoryRow } from "@/lib/realReport";
import CarryoverSection from "@/components/CarryoverSection";
import ScoreScopeTabs from "@/components/ScoreScopeTabs";
import CycleHistory from "@/components/CycleHistory";
import { getDailyPoints } from "@/lib/overviewQueries";
import { listRosterEmployees } from "@/lib/queries";
import { EngineerCard, f1, qTone, bandWord } from "@/components/EngineerReport";
import { DeviationCard } from "@/components/DeviationCard";
import EmployeePrAnalysis from "./EmployeePrAnalysis";
import PerformanceGraph from "./PerformanceGraph";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: Promise<{ name: string }> };

const tokenOf = (s: string) => decodeURIComponent(s).trim().split(/\s+/)[0].toLowerCase();

export async function generateMetadata({ params }: Props) {
  const { name } = await params;
  return { title: `${decodeURIComponent(name)} · HR Bot` };
}

function Tile({ label, value, tone = "text-slate-900" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-gradient-to-br from-white to-stone-50/40 border border-stone-200 rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold tabular-nums leading-tight ${tone}`}>{value}</div>
    </div>
  );
}


export default async function EmployeeDetailPage({ params }: Props) {
  const c = await cookies();
  const acct = accountFor(c.get(AUTH_COOKIE)?.value);
  if (!acct) redirect("/login");
  if (acct.role !== "hr") redirect("/me");   // HR/PM view; employees use /me

  const { name } = await params;
  const token = tokenOf(name);
  const cyc = await getCycleContext();   // STRICT current-cycle scope (changes/204) — no prior-cycle leak
  const nowISO = new Date().toISOString();
  // Everything below is independent of `reports`, so run it all in ONE Promise.all instead of 5 serial
  // awaits (changes/233 perf) — the page no longer waits on a chain of pooler round-trips.
  const [reports0, roster, daily, carryover, monthly, cycleHistory] = await Promise.all([
    getEmployeeReports(cyc.current),
    listRosterEmployees(),
    getDailyPoints(token),
    getCarryoverIssues(token, cyc.current),   // ongoing work from earlier cycles (shown, not scored)
    getMonthlyScore(token, nowISO),           // absolute monthly rollup + EWMA trend
    getCycleHistory(token),                   // persisted per-cycle score (scored cycles only)
  ]);
  const reports = await applyPersistedScores(reports0, cyc.current);   // persisted DB score (fallback: live)
  const r = reports.find((x) => x.employee === token) ?? null;
  const display = roster.find((e) => e.employee_name.trim().split(/\s+/)[0].toLowerCase() === token)?.employee_name
    ?? token.charAt(0).toUpperCase() + token.slice(1);
  const hasProof = !!r && r.mergedPrs > 0;
  // Uniform recent-3-cycle strip: always the current + 2 prior cycle NUMBERS, merging in a persisted score
  // where one exists and "—" where it doesn't — so the history shows for everyone, not just scored people.
  const histByCycle = new Map(cycleHistory.map((h) => [h.cycleNumber, h]));
  const cycleHistory3: CycleHistoryRow[] = cyc.cycles.map((n) =>
    histByCycle.get(n) ?? { cycleNumber: n, score: null, output: null, quality: null, reach: null, provenSize: null });

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10 space-y-5">
      <Link href="/overview" className="text-[13px] text-[#AE00D0] hover:underline">← Dashboard</Link>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{display}</h1>
          <p className="mt-1 text-slate-500 text-[14px]">Proof-first performance in <span className="font-medium text-slate-700">{REAL_REPO}</span> · current cycle. Advisory — a human decides.</p>
        </div>
        {hasProof ? (
          <span className={`text-[11px] uppercase tracking-wider rounded-full px-3 py-1 ${r!.band === "strong" ? "bg-emerald-100 text-emerald-700" : r!.band === "ok" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>{bandWord(r!.band)}</span>
        ) : (
          <span className="text-[11px] uppercase tracking-wider rounded-full px-3 py-1 bg-stone-100 text-slate-400">no merged PR this cycle</span>
        )}
      </div>

      {/* score signature — Cycle (real-time) / Monthly (rollup + trend) / Quarter (soon) */}
      <ScoreScopeTabs
        cycle={{ score: r?.scoreAbsolute ?? null, output: r?.output ?? null, quality: r && r.avgQuality != null ? r.avgQuality / 10 : null, reach: r?.reach ?? null }}
        monthly={monthly}
        subject={display}
      />

      {/* recent 3 cycles — current + 2 prior, uniform for everyone ("—" where unscored) */}
      <CycleHistory rows={cycleHistory3} />

      {/* headline tiles — SAME skeleton for everyone; 0 / — until a merged PR lands (proof-first) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Merged PRs" value={String(r?.mergedPrs ?? 0)} />
        <Tile label="Avg quality" value={r && r.avgQuality != null ? `${f1(r.avgQuality)}/10` : "—"} tone={qTone(r?.avgQuality ?? null)} />
        <Tile label="Points earned" value={f1(r?.totalPoints ?? 0)} tone="text-[#7B5AFF]" />
        <Tile label="Proven issues" value={String(r?.provenIssues.length ?? 0)} />
      </div>

      {/* verdict header — shown whenever there's a current-cycle report; for 0 proof it still reads the
          assigned/shipped/diverged story ("no proof here yet"). Carryforward-only people (no report) skip it. */}
      {r && <DeviationCard r={r} />}

      {/* performance over time — ALWAYS a card; PerformanceGraph renders its own empty state until PRs land */}
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-[14px] font-semibold text-slate-800 mb-1">Performance over time <span className="text-[11px] font-normal text-slate-400">· points shipped per day (persisted, by PR merge date)</span></h2>
        <PerformanceGraph daily={daily} />
      </div>

      {/* how the score is built — only meaningful once something is actually scored */}
      {hasProof && (
        <details className="rounded-xl border border-stone-200 bg-white" open>
          <summary className="cursor-pointer list-none px-5 py-3 text-[14px] font-semibold text-slate-800 flex items-center gap-2"><span className="text-[#AE00D0]">ⓘ</span> How {display.split(" ")[0]}&apos;s score is built</summary>
          <div className="px-5 pb-4 pt-1 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5 text-[13px] text-slate-600 leading-relaxed">
            <ul className="space-y-1.5 list-disc list-inside">
              <li><b>Proof first:</b> points only for work that <b>shipped</b> (a merged PR linked to the issue). No merged PR → no score.</li>
              <li><b>Per issue:</b> <span className="font-mono text-[12px] text-[#7B5AFF]">weight × quality × bug × proof × together × impact</span> — one issue can have several PRs; each PR is scored, then combined.</li>
              <li><b>weight</b> = story points × priority (urgent ×2 · high ×1.5 · med ×1 · low ×0.7).</li>
            </ul>
            <ul className="space-y-1.5 list-disc list-inside">
              <li><b>quality</b> = the reviewer&apos;s 0–10 read of the merged code; <b>bug</b> ×0.7 for a fix / held-by-bug.</li>
              <li><b>impact</b> = CodeGraph blast radius (local ×1 · moderate ×1.1 · wide ×1.25).</li>
              <li><b>Overall</b> = the sum of every proven issue&apos;s points. Open any issue below for its exact math.</li>
            </ul>
          </div>
        </details>
      )}

      {/* issues & PRs — EngineerCard when there's a current-cycle report (handles 0 proof + folds in
          carryover); CarryoverSection when the person is carryforward-only (no report this cycle). */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-2">Issues &amp; PRs{hasProof ? " — open any for the score & reason" : ""}</h2>
        {r ? (
          <EngineerCard r={r} defaultOpen carryover={carryover} />
        ) : carryover.length > 0 ? (
          <CarryoverSection items={carryover} name={display} />
        ) : (
          <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-slate-400 text-[14px]">No issues assigned to {display} in the current window.</div>
        )}
      </div>

      {/* per-PR review + codebase-map graph — only when there are merged PRs to analyse */}
      {hasProof && <EmployeePrAnalysis report={r!} />}
    </main>
  );
}
