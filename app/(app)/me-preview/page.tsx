/**
 * /me-preview — PREVIEW ONLY (not in nav). The redesigned EMPLOYEE self-view for PRD 10, now rendered
 * with REAL data (getEmployeeReports) and composed from the existing rich components the team likes —
 * DeviationCard (verdict), PerformanceGraph (trend), EngineerCard (per-issue points), and
 * EmployeePrAnalysis (evidence + codebase map) — with the NEW "how your score is built"
 * Output/Quality/Reach signature on top. Framed as the employee's own report.
 * The real /me and /employees/[name] are untouched. Pick who to preview with ?e=<first-name>.
 */
import Link from "next/link";
import { getEmployeeReports, REAL_REPO } from "@/lib/realReport";
import { getDailyPoints } from "@/lib/overviewQueries";
import { listRosterEmployees } from "@/lib/queries";
import { EngineerCard, f1, qTone, bandWord } from "@/components/EngineerReport";
import { DeviationCard } from "@/components/DeviationCard";
import EmployeePrAnalysis from "../employees/[name]/EmployeePrAnalysis";
import PerformanceGraph from "../employees/[name]/PerformanceGraph";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Preview · your performance · HR Bot" };

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

function ScorePart({ label, weight, value, display, color }: { label: string; weight: string; value: number | null; display: string; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-slate-700"><span className="font-medium">{label}</span> <span className="text-slate-400">{weight}</span></span>
        <span className="tabular-nums font-medium text-slate-800">{display}</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-stone-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: value === null ? "0%" : `${Math.round(value * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function Tile({ label, value, tone = "text-slate-900" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-gradient-to-br from-white to-stone-50/40 border border-stone-200 rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold tabular-nums leading-tight ${tone}`}>{value}</div>
    </div>
  );
}

export default async function MePreview({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const sp = await searchParams;
  const want = (sp?.e ?? "akshit").trim().toLowerCase();
  const [reports, roster] = await Promise.all([getEmployeeReports(), listRosterEmployees()]);
  const r = reports.find((x) => x.employee === want && x.mergedPrs > 0)
        ?? reports.find((x) => x.employee === want)
        ?? reports.find((x) => x.mergedPrs > 0)
        ?? reports[0] ?? null;
  const token = r?.employee ?? want;
  const daily = r ? await getDailyPoints(token) : [];
  const display = roster.find((e) => e.employee_name.trim().split(/\s+/)[0].toLowerCase() === token)?.employee_name
    ?? token.charAt(0).toUpperCase() + token.slice(1);
  const first = display.split(" ")[0];
  const initials = display.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const hasProof = !!r && r.mergedPrs > 0;
  const bandCls = r?.band === "strong" ? "bg-emerald-100 text-emerald-700" : r?.band === "ok" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700";

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10 space-y-5">
      {/* preview ribbon */}
      <div className="rounded-lg bg-[#fdf0ff] border border-[#f5d4ff] px-4 py-2.5 text-[12px] text-[#7a0092] flex items-center justify-between gap-3 flex-wrap">
        <span><b>Preview</b> — redesigned employee self-view (PRD 10), REAL data. Not in nav; your live pages are untouched.</span>
        <span className="text-[#a34db8]">previewing <b>{display}</b> · switch with <span className="font-mono">?e=firstname</span></span>
      </div>

      <Link href="/overview" className="inline-block text-[13px] text-[#AE00D0] hover:underline">← Dashboard</Link>

      {/* header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#AE00D0] to-[#7B5AFF] text-white flex items-center justify-center text-xl font-semibold shrink-0">{initials}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Your performance</h1>
            {hasProof && <span className={`text-[11px] uppercase tracking-wider rounded-full px-2.5 py-0.5 ${bandCls}`}>{bandWord(r!.band)}</span>}
          </div>
          <p className="text-[13px] text-slate-500 mt-0.5">{display} · <span className="font-medium text-slate-700">{REAL_REPO}</span> · current + 2 prior cycles · advisory — informs a conversation, never an automatic decision</p>
        </div>
      </div>

      {!hasProof ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
          <div className="text-lg font-medium text-slate-800">No proven work for {display} in this window</div>
          <p className="text-[14px] text-slate-500 mt-1">Assigned work with no merged PR yet, or shipped in another repo. Try <span className="font-mono">?e=akshit</span> or <span className="font-mono">?e=vaibhav</span>.</p>
        </div>
      ) : (
        <>
          {/* ── SIGNATURE: how your score is built (the new absolute Output/Quality/Reach model) ── */}
          <section className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(200px,250px)_1fr]">
              <div className="p-6 sm:p-7 border-b sm:border-b-0 sm:border-r border-stone-100 flex flex-col justify-center bg-gradient-to-br from-white to-stone-50/60">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Performance score</div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-6xl font-semibold tabular-nums text-slate-900 leading-none">{r!.scoreAbsolute ?? "—"}</span>
                  <span className="text-lg text-slate-300 font-medium">/100</span>
                </div>
                <p className="text-[12px] text-slate-500 mt-3 leading-relaxed">Your own work only — not a ranking against anyone. Independent: it doesn&apos;t move when a teammate ships more.</p>
              </div>
              <div className="p-6 sm:p-7">
                <div className="text-[13px] font-medium text-slate-800 mb-4">How it&apos;s built</div>
                <div className="space-y-3.5">
                  <ScorePart label="Output" weight="×0.60" value={r!.output} display={pct(r!.output)} color="#7B5AFF" />
                  <ScorePart label="Quality" weight="×0.30" value={r!.avgQuality === null ? null : r!.avgQuality / 10} display={`${f1(r!.avgQuality)}/10`} color="#059669" />
                  <ScorePart label="Reach" weight="×0.10" value={r!.reach} display={pct(r!.reach)} color="#2563eb" />
                </div>
                <div className="mt-4 pt-3 border-t border-stone-100 text-[12px] text-slate-500 tabular-nums">
                  100 × (0.60·{(r!.output ?? 0).toFixed(2)} + 0.30·{((r!.avgQuality ?? 0) / 10).toFixed(2)} + 0.10·{(r!.reach ?? 0).toFixed(2)}) = <b className="text-slate-800">{r!.scoreAbsolute ?? "—"} / 100</b>
                </div>
                <div className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                  <b>Output</b> = how much quality work you shipped vs a strong cycle · <b>Quality</b> = the reviewer&apos;s read · <b>Reach</b> = how far your changes ripple.
                </div>
              </div>
            </div>
          </section>

          {/* key stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile label="Merged PRs" value={String(r!.mergedPrs)} />
            <Tile label="Avg quality" value={`${f1(r!.avgQuality)}/10`} tone={qTone(r!.avgQuality)} />
            <Tile label="Points earned" value={f1(r!.totalPoints)} tone="text-[#7B5AFF]" />
            <Tile label="Issues proven" value={String(r!.provenIssues.length)} />
          </div>

          {/* verdict / deviation card (reused) — employeeView hides the HR attention flags + footnote */}
          <DeviationCard r={r!} employeeView />

          {/* performance over time (reused) */}
          {daily.length > 0 && (
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <h2 className="text-[14px] font-semibold text-slate-800 mb-1">Your impact over time <span className="text-[11px] font-normal text-slate-400">· points shipped per day (by PR merge date)</span></h2>
              <PerformanceGraph daily={daily} />
            </div>
          )}

          {/* how each ISSUE's points are calculated (the per-issue formula, distinct from the overall score above) */}
          <details className="rounded-xl border border-stone-200 bg-white">
            <summary className="cursor-pointer list-none px-5 py-3 text-[14px] font-semibold text-slate-800 flex items-center gap-2"><span className="text-[#AE00D0]">ⓘ</span> How each issue&apos;s points are calculated</summary>
            <div className="px-5 pb-4 pt-1 text-[13px] text-slate-600 leading-relaxed">
              <p>The <b>overall score</b> above is Output / Quality / Reach. Each individual <b>issue&apos;s points</b> (shown below) come from: <span className="font-mono text-[12px] text-[#7B5AFF]">size × quality × bug × proof × together × reach</span>, where <b>size</b> = story points × priority. One issue can have several PRs — each is scored, then combined. Open any issue for its exact math.</p>
            </div>
          </details>

          {/* Linear issues → per-issue points (reused EngineerCard) */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-2">Your issues &amp; PRs — open any for its points &amp; reason</h2>
            <EngineerCard r={r!} defaultOpen />
          </div>

          {/* evidence analysis + codebase map (reused) */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-2">Evidence analysis — per-PR review &amp; where your work reached</h2>
            <EmployeePrAnalysis report={r!} />
          </div>

          <p className="text-[11px] text-slate-400 text-center pt-1">Preview · real cycle-{12} data · advisory — reflects only your own work; a human always decides.</p>
        </>
      )}
    </main>
  );
}
