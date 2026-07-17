"use client";
import { useState } from "react";
import type { MonthlyScore } from "@/lib/realReport";

/**
 * Score-scope tabs (changes/208): switch the headline performance score between CYCLE (real-time,
 * current cycle), MONTHLY (persisted absolute "big-cycle" rollup + EWMA trend chip), and QUARTER
 * (coming later). Same Output/Quality/Reach signature for cycle & month. Client component — the
 * server passes both score objects as props. Advisory; absolute; no peer normalization.
 */

export type ScopeScore = { score: number | null; output: number | null; quality: number | null; reach: number | null };

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const q10 = (v: number | null) => (v == null ? "—" : `${(v * 10).toFixed(1)}/10`);

function Bar({ label, weight, value, display, color }: { label: string; weight: string; value: number | null; display: string; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-slate-700"><span className="font-medium">{label}</span> <span className="text-slate-400">{weight}</span></span>
        <span className="tabular-nums font-medium text-slate-800">{display}</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-stone-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: value == null ? "0%" : `${Math.round(value * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function TrendChip({ m }: { m: MonthlyScore }) {
  if (!m.trend) return null;
  const map = { up: { c: "bg-emerald-100 text-emerald-700", i: "▲", t: "trending up" }, down: { c: "bg-rose-100 text-rose-700", i: "▼", t: "trending down" }, flat: { c: "bg-stone-100 text-slate-500", i: "→", t: "steady" } }[m.trend];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${map.c}`} title={`EWMA of recent cycle scores (${m.trendDelta != null && m.trendDelta > 0 ? "+" : ""}${m.trendDelta ?? 0} vs smoothed)`}>{map.i} {map.t}</span>;
}

const TABS = [
  { key: "cycle", label: "Cycle", sub: "real-time" },
  { key: "monthly", label: "Monthly", sub: "this month" },
  { key: "quarter", label: "Quarter", sub: "soon" },
] as const;

export default function ScoreScopeTabs({ cycle, monthly, subject = "This" }: { cycle: ScopeScore; monthly: MonthlyScore | null; subject?: string }) {
  const [tab, setTab] = useState<"cycle" | "monthly" | "quarter">("cycle");
  const active: ScopeScore | null = tab === "cycle" ? cycle : tab === "monthly" ? (monthly ? { score: monthly.score, output: monthly.output, quality: monthly.quality, reach: monthly.reach } : null) : null;
  const score = active?.score ?? null;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-stone-100">
        {TABS.map((t) => {
          const on = t.key === tab;
          const disabled = t.key === "quarter";
          return (
            <button key={t.key} disabled={disabled} onClick={() => !disabled && setTab(t.key)}
              className={`flex-1 px-4 py-2.5 text-[13px] font-medium transition border-b-2 -mb-px ${on ? "border-[#7B5AFF] text-[#7B5AFF] bg-[#7B5AFF08]" : disabled ? "border-transparent text-slate-300 cursor-not-allowed" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-stone-50"}`}>
              {t.label} <span className="text-[10px] uppercase tracking-wider opacity-70">· {t.sub}</span>
            </button>
          );
        })}
      </div>

      {tab === "quarter" ? (
        <div className="p-8 text-center text-slate-400 text-sm">Quarterly score — coming later. It will roll up the quarter&apos;s months the same absolute, proof-first way.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(200px,250px)_1fr]">
          <div className="p-6 sm:p-7 border-b sm:border-b-0 sm:border-r border-stone-100 flex flex-col justify-center bg-gradient-to-br from-white to-stone-50/60">
            <div className="flex items-center gap-2">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">{tab === "cycle" ? "Cycle score" : "Monthly score"}</div>
              {tab === "monthly" && monthly && <TrendChip m={monthly} />}
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-6xl font-semibold tabular-nums text-slate-900 leading-none">{score ?? "—"}</span>
              <span className="text-lg text-slate-300 font-medium">/100</span>
            </div>
            {tab === "monthly" && monthly ? (
              <p className="text-[12px] text-slate-500 mt-3 leading-relaxed">
                {monthly.yearMonth}{monthly.isPartial && <span className="text-amber-600 font-medium"> · month in progress</span>} · {monthly.provenSize ?? 0} proven pts pooled this month. Absolute — your own work only.
              </p>
            ) : tab === "monthly" ? (
              <p className="text-[12px] text-slate-500 mt-3 leading-relaxed">No monthly score yet — needs merged, AI-judged work this month.</p>
            ) : (
              <p className="text-[12px] text-slate-500 mt-3 leading-relaxed">Your own work in the current cycle — not a ranking. It doesn&apos;t move when a teammate ships more.</p>
            )}
          </div>
          <div className="p-6 sm:p-7">
            <div className="text-[13px] font-medium text-slate-800 mb-4">How it&apos;s built</div>
            {active ? (
              <>
                <div className="space-y-3.5">
                  <Bar label="Output" weight="×0.60" value={active.output} display={pct(active.output)} color="#7B5AFF" />
                  <Bar label="Quality" weight="×0.30" value={active.quality} display={q10(active.quality)} color="#059669" />
                  <Bar label="Reach" weight="×0.10" value={active.reach} display={pct(active.reach)} color="#2563eb" />
                </div>
                <div className="mt-4 pt-3 border-t border-stone-100 text-[12px] text-slate-500 tabular-nums">
                  100 × (0.60·{(active.output ?? 0).toFixed(2)} + 0.30·{(active.quality ?? 0).toFixed(2)} + 0.10·{(active.reach ?? 0).toFixed(2)}) = <b className="text-slate-800">{score ?? "—"} / 100</b>
                </div>
                <div className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                  <b>Output</b> = quality work shipped vs a strong {tab === "monthly" ? "month" : "cycle"} · <b>Quality</b> = the reviewer&apos;s read · <b>Reach</b> = how far changes ripple.{tab === "monthly" && " Pooled over the whole month (not an average of weeks)."}
                </div>
              </>
            ) : (
              <p className="text-[13px] text-slate-400">Nothing to show for this scope yet.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
