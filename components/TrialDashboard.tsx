"use client";

/**
 * Trial dashboard (Phase 4) — for a GitHub-only trial repo (e.g. Flowise).
 * Shows the module-level codebase graph (nodes = modules, edges = dependencies),
 * every merged PR with its blast radius + proof + score, and the contributor
 * ranking. Click a PR row -> its changed + reached modules light up on the graph.
 *
 * Pure client rendering (no graph lib): circular layout computed in JS, SVG for
 * edges, divs are avoided — nodes are SVG circles. Scroll to zoom, drag to pan.
 */

import { useMemo, useRef, useState } from "react";
import type { TrialPR, TrialContributor, TrialGraph, TrialOverview } from "@/lib/trialQueries";

const PKG_COLORS = ["#7C3AED", "#0EA5E9", "#059669", "#D97706", "#DB2777", "#0891B2", "#65A30D", "#9333EA"];
const bandColor = (b: string | null) =>
  b === "wide" ? "#E24B4A" : b === "moderate" ? "#EF9F27" : "#1D9E75";

export function TrialDashboard({
  repo, graph, prs, contributors, overview,
}: {
  repo: string; graph: TrialGraph | null; prs: TrialPR[];
  contributors: TrialContributor[]; overview: TrialOverview;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<"score" | "reached_symbols" | "proof">("score");
  const [t, setT] = useState({ x: 0, y: 0, k: 0.55 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const pkgColor = useMemo(() => {
    const pkgs = Array.from(new Set((graph?.nodes ?? []).map((n) => n.pkg))).sort();
    const m = new Map<string, string>();
    pkgs.forEach((p, i) => m.set(p, PKG_COLORS[i % PKG_COLORS.length]));
    return m;
  }, [graph]);

  const layout = useMemo(() => {
    if (!graph || graph.nodes.length === 0) return null;
    const nodes = [...graph.nodes].sort((a, b) => a.pkg.localeCompare(b.pkg) || b.files - a.files);
    const N = nodes.length;
    const R = Math.max(300, N * 4.2);
    const cx = R + 70, cy = R + 70;
    const pos = new Map<string, { x: number; y: number; r: number; pkg: string; files: number }>();
    nodes.forEach((n, i) => {
      const ang = (i / N) * 2 * Math.PI - Math.PI / 2;
      pos.set(n.id, {
        x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang),
        r: 4 + Math.sqrt(n.files) * 2.0, pkg: n.pkg, files: n.files,
      });
    });
    const edges = graph.edges
      .filter((e) => pos.has(e.from) && pos.has(e.to))
      .sort((a, b) => b.w - a.w);
    return { nodes, pos, edges, cx, cy, W: cx * 2, H: cy * 2 };
  }, [graph]);

  const selPr = sel != null ? prs.find((p) => p.pr_number === sel) ?? null : null;
  const changedSet = useMemo(() => new Set(selPr?.changed_modules ?? []), [selPr]);
  const reachedSet = useMemo(() => new Set(selPr?.reached_modules ?? []), [selPr]);
  const active = selPr != null;

  const sortedPrs = useMemo(
    () => [...prs].sort((a, b) => (Number(b[sortKey] ?? -1)) - (Number(a[sortKey] ?? -1))),
    [prs, sortKey],
  );

  const onWheel = (e: React.WheelEvent) => {
    const k = Math.min(2.5, Math.max(0.2, t.k * (e.deltaY < 0 ? 1.1 : 0.9)));
    setT((p) => ({ ...p, k }));
  };
  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: t.x, oy: t.y };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setT((p) => ({ ...p, x: drag.current!.ox + (e.clientX - drag.current!.px), y: drag.current!.oy + (e.clientY - drag.current!.py) }));
  };
  const onUp = () => { drag.current = null; };

  return (
    <div className="space-y-5">
      {/* stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Stat label="Modules" value={graph?.counts.modules ?? "—"} sub={`${graph?.counts.files ?? "—"} files`} />
        <Stat label="Dependencies" value={graph?.counts.edges ?? "—"} sub="module edges" />
        <Stat label="PRs scored" value={overview.prs} sub="merged" />
        <Stat label="Local" value={overview.bands.local} color="#1D9E75" />
        <Stat label="Moderate" value={overview.bands.moderate} color="#EF9F27" />
        <Stat label="Wide" value={overview.bands.wide} color="#E24B4A" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        {/* graph */}
        <div className="relative">
          <div className="absolute top-3 left-3 z-20 text-[12px] text-slate-500 bg-white/85 backdrop-blur rounded-lg px-2.5 py-1.5 border border-stone-200">
            {active ? (
              <span>PR <b className="text-slate-800">#{selPr!.pr_number}</b> — <span style={{ color: "#7C3AED" }}>● changed</span> <span style={{ color: "#D97706" }}>● reached (blast radius)</span></span>
            ) : (
              <span>codebase modules · click a PR below to light up its blast radius</span>
            )}
          </div>
          <div className="absolute top-3 right-3 z-20 flex gap-1.5">
            <button onClick={() => setT((p) => ({ ...p, k: Math.min(2.5, p.k * 1.2) }))} className="w-8 h-8 rounded-lg bg-white border border-stone-200 text-slate-600 hover:border-[#AE00D0] text-lg leading-none">+</button>
            <button onClick={() => setT((p) => ({ ...p, k: Math.max(0.2, p.k * 0.83) }))} className="w-8 h-8 rounded-lg bg-white border border-stone-200 text-slate-600 hover:border-[#AE00D0] text-lg leading-none">−</button>
            <button onClick={() => setT({ x: 0, y: 0, k: 0.55 })} className="h-8 px-2.5 rounded-lg bg-white border border-stone-200 text-slate-600 hover:border-[#AE00D0] text-xs">Reset</button>
          </div>
          <div
            onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
            className="relative h-[560px] overflow-hidden rounded-xl border border-stone-200 bg-[radial-gradient(circle,#ece8f3_1px,transparent_1px)] [background-size:22px_22px] cursor-grab active:cursor-grabbing select-none"
          >
            {!layout ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 text-center px-8">
                No codebase graph yet. Run agent/graph_impact.py with --graph-json to generate it.
              </div>
            ) : (
              <div style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.k})`, transformOrigin: "0 0" }} className="absolute">
                <svg width={layout.W} height={layout.H} className="absolute top-0 left-0">
                  {/* edges */}
                  <g>
                    {(active
                      ? layout.edges.filter((e) => changedSet.has(e.from) || changedSet.has(e.to) || reachedSet.has(e.from) || reachedSet.has(e.to))
                      : layout.edges.slice(0, 450)
                    ).map((e, i) => {
                      const a = layout.pos.get(e.from)!, b = layout.pos.get(e.to)!;
                      const mx = (a.x + b.x) / 2 + (layout.cx - (a.x + b.x) / 2) * 0.35;
                      const my = (a.y + b.y) / 2 + (layout.cy - (a.y + b.y) / 2) * 0.35;
                      const hot = active && (changedSet.has(e.from) || changedSet.has(e.to));
                      return <path key={i} d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`} fill="none"
                        stroke={hot ? "#D97706" : "#b9a8d6"} strokeWidth={hot ? 1.1 : 0.5} opacity={active ? (hot ? 0.55 : 0.18) : 0.10} />;
                    })}
                  </g>
                  {/* nodes */}
                  <g>
                    {layout.nodes.map((n) => {
                      const p = layout.pos.get(n.id)!;
                      const isChanged = changedSet.has(n.id), isReached = reachedSet.has(n.id);
                      const dim = active && !isChanged && !isReached;
                      const fill = isChanged ? "#7C3AED" : isReached ? "#D97706" : (pkgColor.get(n.pkg) ?? "#94a3b8");
                      return (
                        <g key={n.id} opacity={dim ? 0.18 : 1}>
                          <circle cx={p.x} cy={p.y} r={p.r} fill={fill}
                            stroke={isChanged || isReached ? "#fff" : "none"} strokeWidth={1} />
                          {(n.files >= 18 || isChanged || isReached) && (
                            <text x={p.x} y={p.y - p.r - 2} textAnchor="middle" fontSize={9}
                              fill="#475569">{n.id.split("/").slice(-2).join("/")}</text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* right panel: PR detail OR contributor ranking */}
        <div className="rounded-xl border border-stone-200 bg-white p-4 h-[560px] overflow-auto">
          {selPr ? (
            <PrDetail pr={selPr} onClose={() => setSel(null)} />
          ) : (
            <>
              <h3 className="text-sm font-semibold text-slate-800 mb-1">Contributor ranking</h3>
              <p className="text-[11px] text-slate-400 mb-3">by total proven-impact score (impact × proof)</p>
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
            </>
          )}
        </div>
      </div>

      {/* PR table */}
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-100">
          <h3 className="text-sm font-semibold text-slate-800">All merged PRs ({prs.length})</h3>
          <div className="flex gap-1 text-[11px]">
            {(["score", "reached_symbols", "proof"] as const).map((k) => (
              <button key={k} onClick={() => setSortKey(k)}
                className={`px-2 py-1 rounded ${sortKey === k ? "bg-[#AE00D0] text-white" : "bg-stone-100 text-slate-600 hover:bg-stone-200"}`}>
                {k === "reached_symbols" ? "blast" : k}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[460px] overflow-auto">
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
              {sortedPrs.map((p) => (
                <tr key={p.pr_number} onClick={() => setSel(p.pr_number)}
                  className={`border-t border-stone-50 cursor-pointer hover:bg-violet-50/50 ${sel === p.pr_number ? "bg-violet-50" : ""}`}>
                  <td className="px-3 py-1.5 font-mono text-slate-500">#{p.pr_number}</td>
                  <td className="px-2 py-1.5 text-slate-700 max-w-[280px] truncate" title={p.title ?? ""}>
                    {p.risk_flag && <span title="risk: wide + sensitive + weak proof" className="mr-1">⚠️</span>}
                    {p.title ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-slate-500 truncate max-w-[110px]">{p.author ?? "—"}</td>
                  <td className="px-2 py-1.5 text-center">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] text-white" style={{ background: bandColor(p.blast_band) }}>
                      {p.blast_band ?? "—"}
                    </span>
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
    </div>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-xl font-bold tabular-nums" style={{ color: color ?? "#1e293b" }}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}

function PrDetail({ pr, onClose }: { pr: TrialPR; onClose: () => void }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-xs text-slate-500">PR #{pr.pr_number}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xs">✕</button>
      </div>
      <div className="text-sm font-medium text-slate-900 mt-1 leading-snug">{pr.title ?? "—"}</div>
      <div className="text-[12px] text-slate-500 mt-0.5">by {pr.author ?? "—"}</div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Mini label="Impact" v={pr.impact?.toFixed(2) ?? "—"} />
        <Mini label="Proof" v={pr.proof?.toFixed(2) ?? "—"} />
        <Mini label="Score" v={pr.score?.toFixed(1) ?? "—"} hot />
      </div>
      <dl className="mt-3 space-y-1 text-[12px]">
        <Row k="Blast band" v={pr.blast_band ?? "—"} />
        <Row k="Reached symbols" v={String(pr.reached_symbols ?? "—")} />
        <Row k="Reached files" v={String(pr.reached_files ?? "—")} />
        <Row k="CI" v={pr.ci_status ?? "—"} />
        <Row k="Reviews" v={String(pr.review_approvals ?? 0)} />
        <Row k="Touches sensitive" v={pr.touches_sensitive ? "yes" : "no"} />
      </dl>
      <div className="mt-3">
        <div className="text-[11px] text-slate-400 mb-1">Changed modules ({pr.changed_modules.length})</div>
        <div className="flex flex-wrap gap-1">
          {pr.changed_modules.slice(0, 12).map((m) => (
            <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">{m.split("/").slice(-2).join("/")}</span>
          ))}
        </div>
      </div>
      <div className="mt-2">
        <div className="text-[11px] text-slate-400 mb-1">Reached modules — blast radius ({pr.reached_modules.length})</div>
        <div className="flex flex-wrap gap-1">
          {pr.reached_modules.slice(0, 18).map((m) => (
            <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{m.split("/").slice(-2).join("/")}</span>
          ))}
          {pr.reached_modules.length > 18 && <span className="text-[10px] text-slate-400">+{pr.reached_modules.length - 18} more</span>}
        </div>
      </div>
    </div>
  );
}

function Mini({ label, v, hot }: { label: string; v: string; hot?: boolean }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${hot ? "border-[#AE00D0] bg-fuchsia-50" : "border-stone-200 bg-stone-50"}`}>
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className={`text-base font-bold tabular-nums ${hot ? "text-[#AE00D0]" : "text-slate-800"}`}>{v}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-400">{k}</dt>
      <dd className="text-slate-700 text-right truncate max-w-[60%]" title={v}>{v}</dd>
    </div>
  );
}
