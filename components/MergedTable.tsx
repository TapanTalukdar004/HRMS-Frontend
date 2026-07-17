"use client";

/**
 * MergedTable — the "Merged (scored)" view for a high-volume repo (e.g. Flowise):
 * a compact, sortable scored-PR table + the contributor ranking. No per-PR descriptions
 * (too many PRs) — the depth lives in the score chips. Same design language as the rest.
 */

import { useMemo, useState } from "react";
import type { TrialPR, TrialContributor, TrialOverview } from "@/lib/trialQueries";

const bandColor = (b: string | null) => (b === "wide" ? "#E24B4A" : b === "moderate" ? "#EF9F27" : "#1D9E75");

export function MergedTable({ prs, contributors, overview }: {
  prs: TrialPR[]; contributors: TrialContributor[]; overview: TrialOverview;
}) {
  const [sortKey, setSortKey] = useState<"score" | "reached_symbols" | "proof">("score");
  const sorted = useMemo(
    () => [...prs].sort((a, b) => Number(b[sortKey] ?? -1) - Number(a[sortKey] ?? -1)),
    [prs, sortKey],
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Merged PRs" value={overview.prs} />
        <Stat label="Local" value={overview.bands.local} color="#1D9E75" />
        <Stat label="Moderate" value={overview.bands.moderate} color="#EF9F27" />
        <Stat label="Wide" value={overview.bands.wide} color="#E24B4A" />
        <Stat label="Touch sensitive" value={overview.sensitive} color="#A32D2D" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-100">
            <h3 className="text-sm font-semibold text-slate-800">Scored PRs ({prs.length})</h3>
            <div className="flex gap-1 text-[11px]">
              {(["score", "reached_symbols", "proof"] as const).map((k) => (
                <button key={k} onClick={() => setSortKey(k)}
                  className={`px-2 py-1 rounded ${sortKey === k ? "bg-[#AE00D0] text-white" : "bg-stone-100 text-slate-600 hover:bg-stone-200"}`}>
                  {k === "reached_symbols" ? "blast" : k}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-stone-50 text-slate-500 text-[11px] uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-3 py-2">PR</th>
                  <th className="text-left font-medium px-2 py-2">Title</th>
                  <th className="text-left font-medium px-2 py-2">Author</th>
                  <th className="text-center font-medium px-2 py-2">Band</th>
                  <th className="text-right font-medium px-2 py-2">Blast</th>
                  <th className="text-right font-medium px-2 py-2">Proof</th>
                  <th className="text-right font-medium px-3 py-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.pr_number} className="border-t border-stone-50 hover:bg-violet-50/40">
                    <td className="px-3 py-1.5 font-mono text-slate-500">#{p.pr_number}</td>
                    <td className="px-2 py-1.5 text-slate-700 max-w-[300px] truncate" title={p.title ?? ""}>
                      {p.risk_flag && <span title="risk" className="mr-1">⚠️</span>}{p.title ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-slate-500 truncate max-w-[110px]">{p.author ?? "—"}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] text-white" style={{ background: bandColor(p.blast_band) }}>{p.blast_band ?? "—"}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{p.reached_symbols ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{p.proof != null ? p.proof.toFixed(2) : "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-800">{p.score != null ? p.score.toFixed(1) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 h-fit">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Contributor ranking</h3>
          <p className="text-[11px] text-slate-400 mb-3">by total proven-impact score</p>
          <ol className="space-y-1.5">
            {contributors.slice(0, 14).map((c, i) => (
              <li key={c.author} className="flex items-center gap-2 text-[12.5px]">
                <span className="w-5 text-right text-slate-400 tabular-nums">{i + 1}</span>
                <span className="flex-1 truncate text-slate-700" title={c.author}>{c.author}</span>
                <span className="tabular-nums text-slate-400">{c.prs} PRs</span>
                <span className="tabular-nums font-semibold text-[#AE00D0] w-12 text-right">{c.total}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-xl font-bold tabular-nums" style={{ color: color ?? "#1e293b" }}>{value}</div>
    </div>
  );
}
