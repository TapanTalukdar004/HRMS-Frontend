"use client";

/**
 * ModuleGraph — the codebase "map": modules as nodes (sized by file count, colored by
 * package), dependencies as faint edges. Pan/zoom. Used as a collapsible panel inside the
 * unified analysis dashboard so the map is available without dominating the page.
 */

import { useMemo, useRef, useState } from "react";
import type { TrialGraph } from "@/lib/trialQueries";

const PKG_COLORS = ["#7C3AED", "#0EA5E9", "#059669", "#D97706", "#DB2777", "#0891B2", "#65A30D", "#9333EA"];

export function ModuleGraph({ graph, changed, reached }: { graph: TrialGraph; changed?: string[]; reached?: string[] }) {
  const [t, setT] = useState({ x: 0, y: 0, k: 0.5 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const chSet = useMemo(() => new Set(changed ?? []), [changed]);
  const rSet = useMemo(() => new Set(reached ?? []), [reached]);
  const active = chSet.size > 0 || rSet.size > 0;

  const pkgColor = useMemo(() => {
    const pkgs = Array.from(new Set(graph.nodes.map((n) => n.pkg))).sort();
    const m = new Map<string, string>();
    pkgs.forEach((p, i) => m.set(p, PKG_COLORS[i % PKG_COLORS.length]));
    return m;
  }, [graph]);

  const layout = useMemo(() => {
    const nodes = [...graph.nodes].sort((a, b) => a.pkg.localeCompare(b.pkg) || b.files - a.files);
    const N = Math.max(nodes.length, 1);
    const R = Math.max(300, N * 4.2);
    const cx = R + 70, cy = R + 70;
    const pos = new Map<string, { x: number; y: number; r: number }>();
    nodes.forEach((n, i) => {
      const ang = (i / N) * 2 * Math.PI - Math.PI / 2;
      pos.set(n.id, { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang), r: 4 + Math.sqrt(n.files) * 2.0 });
    });
    const edges = graph.edges.filter((e) => pos.has(e.from) && pos.has(e.to)).sort((a, b) => b.w - a.w).slice(0, 450);
    return { nodes, pos, edges, cx, cy, W: cx * 2, H: cy * 2 };
  }, [graph]);

  const onWheel = (e: React.WheelEvent) => setT((p) => ({ ...p, k: Math.min(2.5, Math.max(0.2, p.k * (e.deltaY < 0 ? 1.1 : 0.9))) }));
  const onDown = (e: React.PointerEvent) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, ox: t.x, oy: t.y }; };
  const onMove = (e: React.PointerEvent) => { if (!drag.current) return; setT((p) => ({ ...p, x: drag.current!.ox + (e.clientX - drag.current!.px), y: drag.current!.oy + (e.clientY - drag.current!.py) })); };
  const onUp = () => { drag.current = null; };

  return (
    <div className="relative">
      <div className="absolute top-3 right-3 z-20 flex gap-1.5">
        <button onClick={() => setT((p) => ({ ...p, k: Math.min(2.5, p.k * 1.2) }))} className="w-8 h-8 rounded-lg bg-white border border-stone-200 text-slate-600 hover:border-[#AE00D0] text-lg leading-none">+</button>
        <button onClick={() => setT((p) => ({ ...p, k: Math.max(0.2, p.k * 0.83) }))} className="w-8 h-8 rounded-lg bg-white border border-stone-200 text-slate-600 hover:border-[#AE00D0] text-lg leading-none">−</button>
        <button onClick={() => setT({ x: 0, y: 0, k: 0.5 })} className="h-8 px-2.5 rounded-lg bg-white border border-stone-200 text-slate-600 hover:border-[#AE00D0] text-xs">Reset</button>
      </div>
      <div onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        className="relative h-[460px] overflow-hidden rounded-xl border border-stone-200 bg-[radial-gradient(circle,#ece8f3_1px,transparent_1px)] [background-size:22px_22px] cursor-grab active:cursor-grabbing select-none">
        <div style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.k})`, transformOrigin: "0 0" }} className="absolute">
          <svg width={layout.W} height={layout.H} className="absolute top-0 left-0">
            <g>
              {layout.edges.map((e, i) => {
                const a = layout.pos.get(e.from)!, b = layout.pos.get(e.to)!;
                const mx = (a.x + b.x) / 2 + (layout.cx - (a.x + b.x) / 2) * 0.35;
                const my = (a.y + b.y) / 2 + (layout.cy - (a.y + b.y) / 2) * 0.35;
                const hot = active && (chSet.has(e.from) || chSet.has(e.to) || rSet.has(e.from) || rSet.has(e.to));
                return <path key={i} d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`} fill="none"
                  stroke={hot ? "#D97706" : "#b9a8d6"} strokeWidth={hot ? 1 : 0.5} opacity={active ? (hot ? 0.5 : 0.05) : 0.12} />;
              })}
            </g>
            <g>
              {layout.nodes.map((n) => {
                const p = layout.pos.get(n.id)!;
                const isCh = chSet.has(n.id); const isR = rSet.has(n.id);
                const dim = active && !isCh && !isR;
                const fill = isCh ? "#7C3AED" : isR ? "#D97706" : (pkgColor.get(n.pkg) ?? "#94a3b8");
                return (
                  <g key={n.id} opacity={dim ? 0.13 : 1}>
                    <circle cx={p.x} cy={p.y} r={p.r} fill={fill} stroke={isCh || isR ? "#fff" : "none"} strokeWidth={1} />
                    {(n.files >= 18 || isCh || isR) && <text x={p.x} y={p.y - p.r - 2} textAnchor="middle" fontSize={9} fill="#475569">{n.id.split("/").slice(-2).join("/")}</text>}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        <div className="absolute bottom-3 left-3 text-[11px] text-slate-500 bg-white/85 rounded px-2 py-1">
          {active && <span><span style={{ color: "#7C3AED" }}>●</span> changed · <span style={{ color: "#D97706" }}>●</span> reached &nbsp;·&nbsp; </span>}
          {graph.counts.modules} modules · {graph.counts.edges} dependencies · scroll to zoom, drag to pan
        </div>
      </div>
    </div>
  );
}
