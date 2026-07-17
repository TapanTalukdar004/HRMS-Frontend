"use client";
/**
 * PerformanceGraph — points shipped per day (bars) + cumulative points (line), from the first
 * merged evidence PR through TODAY. Data = persisted pr_score.issue_value bucketed by the PR's
 * own merged_at (changes/173) — so the x-axis is real ship dates, not batch times. Pure SVG.
 */
import { useMemo, useState } from "react";
import type { DailyPoint } from "@/lib/overviewQueries";

const DAY_MS = 86400000;
const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function PerformanceGraph({ daily }: { daily: DailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const model = useMemo(() => {
    if (!daily.length) return null;
    const start = new Date(daily[0].day + "T00:00:00Z").getTime();
    const end = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime(); // today
    const nDays = Math.max(1, Math.round((end - start) / DAY_MS) + 1);
    const byDay = new Map(daily.map((d) => [d.day, d]));
    let cum = 0;
    const days = Array.from({ length: nDays }, (_, i) => {
      const iso = new Date(start + i * DAY_MS).toISOString().slice(0, 10);
      const row = byDay.get(iso);
      cum += row?.points ?? 0;
      return { iso, points: row?.points ?? 0, prs: row?.prs ?? 0, cum };
    });
    const maxDay = Math.max(...days.map((d) => d.points), 0.01);
    const total = cum || 0.01;
    return { days, maxDay, total };
  }, [daily]);

  if (!model) return <div className="text-[13px] text-slate-400 text-center py-8">No dated evidence yet — the graph fills in as merged PRs land.</div>;

  const W = 900, H = 190, PAD = 34, BOT = 26;
  const iw = (W - PAD * 2) / model.days.length;
  const x = (i: number) => PAD + i * iw;
  const yBar = (v: number) => (H - BOT) - (v / model.maxDay) * (H - BOT - 30);
  const yCum = (v: number) => (H - BOT) - (v / model.total) * (H - BOT - 30);
  const cumPath = model.days.map((d, i) => `${i === 0 ? "M" : "L"}${(x(i) + iw / 2).toFixed(1)},${yCum(d.cum).toFixed(1)}`).join(" ");
  const h = hover != null ? model.days[hover] : null;
  const tickEvery = Math.max(1, Math.round(model.days.length / 8));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHover(null)} role="img" aria-label="Points shipped per day with cumulative total">
        {/* baseline + ticks */}
        <line x1={PAD} y1={H - BOT} x2={W - PAD} y2={H - BOT} stroke="#e7e5e4" />
        {model.days.map((d, i) => (i % tickEvery === 0 ? (
          <text key={d.iso} x={x(i) + iw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8">{fmt(new Date(d.iso))}</text>
        ) : null))}
        {/* daily bars */}
        {model.days.map((d, i) => (
          <rect key={d.iso} x={x(i) + Math.max(0.5, iw * 0.15)} width={Math.max(1, iw * 0.7)}
            y={d.points > 0 ? yBar(d.points) : H - BOT - 1} height={d.points > 0 ? (H - BOT) - yBar(d.points) : 1}
            fill={d.points > 0 ? "#AE00D0" : "#f1f0ee"} opacity={hover === i ? 1 : 0.75} rx="1.5"
            onMouseEnter={() => setHover(i)} />
        ))}
        {/* cumulative line */}
        <path d={cumPath} fill="none" stroke="#7B5AFF" strokeWidth="2" opacity="0.9" />
        {h && hover != null && (
          <g>
            <line x1={x(hover) + iw / 2} y1={24} x2={x(hover) + iw / 2} y2={H - BOT} stroke="#cbd5e1" strokeDasharray="3 3" />
            <text x={Math.min(Math.max(x(hover) + iw / 2, 120), W - 130)} y={16} textAnchor="middle" fontSize="11" fill="#334155" fontWeight="600">
              {fmt(new Date(h.iso))} · {h.points.toFixed(2)} pts{h.prs ? ` · ${h.prs} PR${h.prs > 1 ? "s" : ""}` : ""} · {h.cum.toFixed(1)} total
            </text>
          </g>
        )}
      </svg>
      <div className="flex gap-4 text-[11px] text-slate-400 mt-1">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#AE00D0] inline-block" /> points shipped that day</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#7B5AFF] inline-block" /> cumulative</span>
        <span>· x-axis = real PR merge dates, through today</span>
      </div>
    </div>
  );
}
