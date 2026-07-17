import type { LabCluster } from "@/lib/labQueries";

// Shared cross-repo "connection check" panel, used by /lab and /dashboard.
// Compact by default; one expander holds the technical "why".

const CHIP_BASE =
  "inline-flex items-center gap-1 text-[11px] uppercase tracking-wide ring-1 ring-inset rounded-full px-2 py-0.5 whitespace-nowrap";

function pct(v: number | null): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const p = v <= 1 ? v * 100 : v;
  return `${Math.round(p)}%`;
}

export function integrationChip(status: string | null) {
  const s = (status ?? "").trim().toLowerCase();
  const map: Record<string, { tone: string; label: string }> = {
    verified: { tone: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "✓ connected" },
    pending: { tone: "bg-amber-50 text-amber-800 ring-amber-200", label: "◷ part missing" },
    mismatch: { tone: "bg-rose-50 text-rose-700 ring-rose-200", label: "✕ don't connect" },
  };
  const v = map[s] ?? { tone: "bg-stone-100 text-slate-600 ring-stone-300", label: s || "—" };
  return <span className={`${CHIP_BASE} ${v.tone}`}>{v.label}</span>;
}

export function ClusterPanel({ clusters }: { clusters: LabCluster[] }) {
  if (clusters.length === 0) return null;
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-indigo-200 flex items-center gap-2 flex-wrap">
        <span className="text-indigo-600">🔗</span>
        <h2 className="text-sm font-semibold text-indigo-900">Cross-repo issues · {clusters.length}</h2>
        <span className="text-[11px] text-indigo-700/70">
          — one feature built across more than one repo. Do the pieces actually fit together?
        </span>
      </div>
      <div className="divide-y divide-indigo-100">
        {clusters.map((c) => {
          const nDefects = c.cross_defects?.length ?? 0;
          const sd = c.score_detail;
          const status = (c.integration_status ?? "").toLowerCase();
          const isLow = status === "mismatch";
          const score = sd?.delivered_score ?? c.combined_quality ?? null;
          const scoreTone = isLow ? "text-rose-600" : status === "pending" ? "text-amber-600" : "text-emerald-600";
          const title = sd?.title ?? null;
          return (
            <div key={c.issue_key} className="px-4 py-3">
              {/* Headline — plain and scannable for anyone */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-slate-900">{c.issue_key}</span>
                    {integrationChip(c.integration_status)}
                    {nDefects > 0 && (
                      <span className="text-[11px] font-medium text-rose-600">🐞 {nDefects} issue{nDefects > 1 ? "s" : ""}</span>
                    )}
                  </div>
                  {title && <div className="mt-1 text-sm font-medium text-slate-800">{title}</div>}
                  {c.connection_notes && (
                    <p className={`mt-1 text-xs leading-snug ${isLow ? "text-rose-700" : "text-slate-600"}`}>
                      {c.connection_notes}
                    </p>
                  )}
                </div>
                {score !== null && (
                  <div className="shrink-0 text-right">
                    <div className={`text-2xl font-semibold ${scoreTone}`}>
                      {score.toFixed(1)}<span className="text-sm font-normal text-slate-400">/10</span>
                    </div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">delivered</div>
                  </div>
                )}
              </div>

              {/* One expander — all the technical "why" lives here, hidden by default */}
              <details className="mt-2">
                <summary className="text-[11px] text-[#AE00D0] cursor-pointer list-none select-none hover:underline">
                  {isLow ? "Why is the score low?" : "How this connects"} ▾
                </summary>
                <div className="mt-2 space-y-2 border-l-2 border-indigo-100 pl-3">
                  {sd && sd.delivered_score !== null && (
                    <div className="flex items-center gap-2 flex-wrap text-[11px]">
                      {(sd.members ?? []).map((m) => (
                        <span key={`${m.repo}#${m.pr}`} className="text-slate-500">
                          {m.repo.split("/").pop()}{" "}
                          <span className="font-mono text-slate-700">{m.quality !== null ? m.quality.toFixed(0) : "—"}</span>
                        </span>
                      ))}
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500">avg <span className="font-mono text-slate-700">{sd.avg_pr_quality?.toFixed(1) ?? "—"}</span></span>
                      <span className="text-slate-300">×</span>
                      <span className="text-slate-500">integration <span className="font-mono text-slate-700">{sd.integration_factor?.toFixed(2) ?? "—"}</span></span>
                      <span className="text-slate-300">=</span>
                      <span className="font-mono text-slate-800 font-semibold">{sd.delivered_score.toFixed(1)}/10</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(c.pr_refs ?? []).map((ref) => (
                      <span key={ref} className="font-mono text-[11px] bg-white text-slate-600 ring-1 ring-inset ring-stone-200 rounded px-1.5 py-0.5">{ref}</span>
                    ))}
                  </div>
                  {nDefects > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">What doesn&apos;t line up</div>
                      <ul className="space-y-0.5 text-[11px] text-slate-600 list-disc list-inside">
                        {c.cross_defects!.map((d, i) => (<li key={i}>{d}</li>))}
                      </ul>
                    </div>
                  )}
                  <div className="text-[10px] text-slate-400">
                    combined quality {c.combined_quality !== null ? c.combined_quality.toFixed(1) : "—"}/10 · confidence {pct(c.confidence)}
                    {" · "}{(c.repos ?? []).join(" + ")}
                    {c.run_date ? ` · run ${c.run_date}` : ""}
                  </div>
                </div>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}
