import type { CycleHistoryRow } from "@/lib/realReport";

/**
 * Last-3-cycles report (changes/210): the persisted per-cycle absolute score + Output/Quality/Reach
 * make-up, newest first, side by side — so an employee/HR can see the recent trajectory per cycle.
 * Absolute + advisory. Hidden if there's no cycle history yet.
 */
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const q10 = (v: number | null) => (v == null ? "—" : `${(v * 10).toFixed(1)}`);
const scoreTone = (s: number | null) => (s == null ? "text-slate-300" : s >= 70 ? "text-emerald-600" : s >= 45 ? "text-amber-600" : "text-rose-500");

export default function CycleHistory({ rows }: { rows: CycleHistoryRow[] }) {
  if (!rows.length) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-2">Last {rows.length} cycle{rows.length !== 1 ? "s" : ""} — score history</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {rows.map((c) => (
          <div key={c.cycleNumber ?? Math.random()} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex items-baseline justify-between">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Cycle {c.cycleNumber ?? "—"}</div>
              <div className="text-[10px] text-slate-300">{c.provenSize != null ? `${c.provenSize} pts` : ""}</div>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className={`text-3xl font-bold tabular-nums leading-none ${scoreTone(c.score)}`}>{c.score ?? "—"}</span>
              <span className="text-[13px] text-slate-300 font-medium">/100</span>
            </div>
            <div className="mt-3 space-y-1.5 text-[11px] text-slate-500">
              <div className="flex justify-between"><span>Output</span><span className="tabular-nums font-medium text-slate-700">{pct(c.output)}</span></div>
              <div className="flex justify-between"><span>Quality</span><span className="tabular-nums font-medium text-slate-700">{q10(c.quality)}/10</span></div>
              <div className="flex justify-between"><span>Reach</span><span className="tabular-nums font-medium text-slate-700">{pct(c.reach)}</span></div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5">Per-cycle absolute score — your own work only, not a ranking. Advisory.</p>
    </section>
  );
}
