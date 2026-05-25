/**
 * Hero card showing a big score for a period.
 * Renders the final score, status badge, breakdown chips (cycle avg, grace),
 * and a context line.
 */

export type RollupHeroData = {
  period_label: string;
  scope: "month" | "quarter" | "year";
  cycle_count: number;
  pending_cycles?: number;
  cycle_avg: number | null;
  grace_sum: number;
  final_score: number | null;
  display_score?: number;
  is_preliminary?: boolean;
};

function tierFor(score: number | null, isPrelim?: boolean): "high" | "mid" | "low" | "pending" {
  if (score === null) return "pending";
  if (isPrelim) return "pending";
  if (score >= 8) return "high";
  if (score >= 6) return "mid";
  return "low";
}

const TIER_COLORS: Record<string, { grad: string; ring: string; text: string; bg: string; label: string }> = {
  high:    { grad: "from-emerald-400 to-emerald-600", ring: "ring-emerald-200", text: "text-emerald-700", bg: "bg-emerald-50", label: "Strong performer" },
  mid:     { grad: "from-amber-400 to-amber-600",     ring: "ring-amber-200",   text: "text-amber-700",   bg: "bg-amber-50",   label: "Solid mid-performer" },
  low:     { grad: "from-rose-400 to-rose-600",       ring: "ring-rose-200",    text: "text-rose-700",    bg: "bg-rose-50",    label: "Needs attention" },
  pending: { grad: "from-slate-300 to-slate-400",     ring: "ring-slate-200",   text: "text-slate-500",   bg: "bg-slate-50",   label: "Awaiting HR review" },
};

export function RollupHeroCard({ data }: { data: RollupHeroData }) {
  const isPrelim = !!data.is_preliminary;
  const shownScore = data.display_score !== undefined
    ? data.display_score
    : data.final_score;
  const tier = tierFor(shownScore, isPrelim);
  const colors = TIER_COLORS[tier];
  const subUnit = data.scope === "month" ? "cycle" : data.scope === "quarter" ? "month" : "quarter";

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-7`}>
      {/* Top accent stripe */}
      <div className={`absolute -inset-x-px -top-px h-1 bg-gradient-to-r ${colors.grad}`} />

      <div className="flex items-center justify-between gap-8">
        {/* Left: big score */}
        <div className="flex-shrink-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {data.scope.charAt(0).toUpperCase() + data.scope.slice(1)} score · {data.period_label}
            {isPrelim && (
              <span className="ml-2 text-amber-600 normal-case">(preliminary)</span>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className={`text-6xl font-bold tabular-nums ${shownScore === null ? "text-slate-300" : isPrelim ? "text-slate-500" : "text-slate-900"}`}>
              {shownScore !== null ? shownScore.toFixed(2) : "—"}
            </div>
            {shownScore !== null && (
              <div className="text-2xl text-slate-400 font-light">/ 10</div>
            )}
          </div>
          <div className={`mt-2 inline-block px-3 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text} ring-1 ${colors.ring}`}>
            {colors.label}
          </div>
          {isPrelim && data.pending_cycles !== undefined && data.pending_cycles > 0 && (
            <div className="mt-2 text-[11px] text-amber-700 max-w-xs">
              {data.pending_cycles} cycle{data.pending_cycles !== 1 ? "s" : ""} awaiting HR escalation. Score uses raw completion % until HR decides.
            </div>
          )}
        </div>

        {/* Right: components breakdown */}
        <div className="flex-1 grid grid-cols-3 gap-4">
          <Stat
            label={`${subUnit}s counted`}
            value={data.cycle_count.toString()}
            sub={data.cycle_count === 0 ? "no data yet" : undefined}
          />
          <Stat
            label="Base average"
            value={data.cycle_avg !== null ? data.cycle_avg.toFixed(2) : "—"}
            sub={data.scope === "month" ? "from cycle scores" : `from ${subUnit}ly scores`}
          />
          <Stat
            label="Grace applied"
            value={
              data.grace_sum === 0
                ? "0"
                : (data.grace_sum > 0 ? "+" : "") + data.grace_sum.toFixed(2)
            }
            tone={data.grace_sum > 0 ? "positive" : data.grace_sum < 0 ? "negative" : undefined}
            sub={`at ${data.scope}-scope`}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative";
}) {
  const valueColor =
    tone === "positive" ? "text-emerald-700"
    : tone === "negative" ? "text-rose-700"
    : "text-slate-900";
  return (
    <div className="bg-stone-50 rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}
