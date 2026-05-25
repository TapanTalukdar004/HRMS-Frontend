import Link from "next/link";
import type { EmployeeRollupDetail } from "@/lib/queries";
import { RollupHeroCard } from "./RollupHeroCard";

function fmt(n: number | null): string {
  return n === null ? "—" : n.toFixed(2);
}

function statusBadge(score: number | null) {
  const tier = score === null ? "pending" : score >= 8 ? "high" : score >= 6 ? "mid" : "low";
  const map: Record<string, string> = {
    high: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    mid: "bg-amber-50 text-amber-700 ring-amber-200",
    low: "bg-rose-50 text-rose-700 ring-rose-200",
    pending: "bg-slate-100 text-slate-500 ring-slate-300",
  };
  return (
    <span className={`inline-block text-[11px] ring-1 ring-inset rounded-full px-2 py-0.5 ${map[tier]}`}>
      {tier === "pending" ? "pending HR" : tier === "low" ? "behind" : tier === "mid" ? "mid" : "on track"}
    </span>
  );
}

export function EmployeeRollupView({ detail }: { detail: EmployeeRollupDetail }) {
  return (
    <div className="space-y-6">
      <RollupHeroCard data={{
        period_label: detail.period_label,
        scope: detail.scope,
        cycle_count: detail.scope === "month" ? detail.cycle_count : detail.sub_rollups.length,
        pending_cycles: detail.pending_cycles,
        cycle_avg: detail.cycle_avg,
        grace_sum: detail.grace_sum,
        final_score: detail.final_score,
        display_score: detail.display_score,
        is_preliminary: detail.is_preliminary,
      }} />

      {/* Breakdown — either cycles (monthly) or sub-rollups (quarterly/annual) */}
      {detail.scope === "month" && (
        <BreakdownTable
          title="Cycles in this month"
          subtitle={detail.cycles.length === 0
            ? "No cycles ended in this month yet."
            : `${detail.cycles.length} cycle${detail.cycles.length !== 1 ? "s" : ""}, average becomes your monthly base.`}
          headers={["Cycle", "Ended", "Method", "Score", "Status"]}
          rows={detail.cycles.map((c) => {
            // For pending cycles, show preliminary score (adjusted_score × 10)
            const prelimScore = c.adjusted_score !== null ? Number(c.adjusted_score) * 10 : null;
            const shown = c.final_score !== null ? c.final_score : prelimScore;
            const isPending = c.final_score === null;
            return [
              c.cycle_name,
              new Date(c.cycle_end).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
              c.finalized_method ?? "pending HR",
              <span className={`font-semibold tabular-nums ${isPending ? "text-slate-500" : ""}`}>
                {shown !== null ? Number(shown).toFixed(2) : "—"}
                {isPending && shown !== null && (
                  <div className="text-[9px] uppercase tracking-wider text-amber-600 font-normal mt-0.5">
                    preliminary
                  </div>
                )}
              </span>,
              statusBadge(isPending ? null : shown),
            ];
          })}
        />
      )}
      {detail.scope !== "month" && (
        <BreakdownTable
          title={detail.scope === "quarter" ? "Months in this quarter" : "Quarters in this year"}
          subtitle={`Average of ${detail.scope === "quarter" ? "monthly" : "quarterly"} scores becomes the ${detail.scope}ly base.`}
          headers={[detail.scope === "quarter" ? "Month" : "Quarter", "Cycles", "Base avg", "Grace", "Score"]}
          rows={detail.sub_rollups.map((r) => [
            r.sub_label,
            <span>
              {r.cycle_count}
              {r.pending_cycles > 0 && (
                <span className="ml-1 text-xs text-amber-600">({r.pending_cycles} pending)</span>
              )}
            </span>,
            <span className="text-slate-600 tabular-nums">{fmt(r.cycle_avg)}</span>,
            <span className={
              r.grace_sum > 0 ? "text-emerald-700 tabular-nums"
              : r.grace_sum < 0 ? "text-rose-700 tabular-nums"
              : "text-slate-400 tabular-nums"
            }>
              {r.grace_sum > 0 ? "+" : ""}{fmt(r.grace_sum)}
            </span>,
            <span className={`font-semibold tabular-nums ${r.is_preliminary ? "text-slate-500" : ""}`}>
              {Number(r.display_score).toFixed(2)}
              {r.is_preliminary && (
                <div className="text-[9px] uppercase tracking-wider text-amber-600 font-normal mt-0.5">
                  preliminary
                </div>
              )}
            </span>,
          ])}
        />
      )}

      {/* Grace marks log */}
      <BreakdownTable
        title={`Grace marks at ${detail.scope}-scope`}
        subtitle={detail.grace_marks.length === 0
          ? `No ${detail.scope}-scope grace marks for ${detail.period_label}.`
          : `${detail.grace_marks.length} adjustment${detail.grace_marks.length !== 1 ? "s" : ""} applied.`}
        headers={["When", "Δ", "Granted by", "Reason"]}
        rows={detail.grace_marks.map((g) => [
          new Date(g.granted_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
          <span className={
            Number(g.delta) > 0 ? "text-emerald-700 font-semibold tabular-nums"
            : "text-rose-700 font-semibold tabular-nums"
          }>
            {Number(g.delta) > 0 ? "+" : ""}{Number(g.delta).toFixed(2)}
          </span>,
          <span className="text-xs">
            <span className="inline-block px-1.5 py-0.5 rounded bg-[#f0ebff] text-[#6745E8] mr-1">
              {g.granted_by_role}
            </span>
          </span>,
          g.reason,
        ])}
      />

      <div className="text-xs text-slate-400 leading-relaxed">
        See <code>docs/HR_Bot_Performance_System.pdf</code> §6 — &quot;Aggregation formulas&quot; — for how this score
        is derived. To apply or propose grace marks, use the Slack DM with the bot or HR-only
        grace marks page (coming soon).
      </div>
    </div>
  );
}

function BreakdownTable({ title, subtitle, headers, rows }: {
  title: string;
  subtitle: string;
  headers: string[];
  rows: (string | number | React.ReactNode)[][];
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-1">
        {title}
      </h3>
      <p className="text-xs text-slate-400 mb-3">{subtitle}</p>
      {rows.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-slate-400 text-sm">
          (nothing to show)
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="text-left px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-stone-100 hover:bg-stone-50">
                  {row.map((cell, j) => (
                    <td key={j} className="px-4 py-3">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
