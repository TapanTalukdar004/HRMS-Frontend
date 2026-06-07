"use client";

/**
 * Issue Map — a zoomable / pannable node-tree of the cycle's issues.
 * Each FEATURE that has linked bugs (or sub-issues) becomes a cluster:
 * the feature node on the left, its bug/child nodes fanned to the right,
 * joined by connector lines. Scroll to zoom, drag to pan, click a node
 * for its metadata. Unlinked single issues are listed below the canvas.
 *
 * Pure client rendering (no graph lib) — positions computed in JS, nodes
 * are absolutely-positioned divs inside a CSS-transform wrapper, connectors
 * drawn in one SVG layer behind them.
 */

import { useMemo, useRef, useState } from "react";
import { statusCredit, isBug } from "@/lib/issueScoring";

export type GI = {
  issue_id: string;
  title: string | null;
  issue_type: string | null;
  status: string | null;
  story_points: number | null;
  priority: string | null;
  employee_name: string | null;
  is_bug_of: string | null;
  parent_issue_id: string | null;
  issue_url: string | null;
};

type PlacedNode = { gi: GI; x: number; y: number; held: boolean };
type Cluster = { parent: PlacedNode; children: PlacedNode[] };

const NODE_W = 230, NODE_H = 56, COL_GAP = 90, ROW_GAP = 14, CLUSTER_GAP = 26, PAD = 40;

function parentLink(i: GI): string | null {
  return i.is_bug_of ?? i.parent_issue_id ?? null;
}

function buildLayout(issues: GI[]) {
  const byId = new Map(issues.map((i) => [i.issue_id, i]));
  // group children by their parent id
  const childrenByParent = new Map<string, GI[]>();
  for (const i of issues) {
    const p = parentLink(i);
    if (p) (childrenByParent.get(p) ?? childrenByParent.set(p, []).get(p)!).push(i);
  }
  const isOpen = (i: GI) => {
    const c = statusCredit(i);
    return c !== null && c < 0.93;
  };
  const clusters: Cluster[] = [];
  let y = PAD;
  // stable order: parents with most children first
  const parentIds = [...childrenByParent.keys()].sort(
    (a, b) => (childrenByParent.get(b)!.length) - (childrenByParent.get(a)!.length),
  );
  for (const pid of parentIds) {
    const kids = childrenByParent.get(pid)!;
    // synthetic parent node if the feature isn't in this cycle's set
    const pgi: GI = byId.get(pid) ?? {
      issue_id: pid, title: "(feature outside this cycle)", issue_type: "feature",
      status: null, story_points: null, priority: null, employee_name: null,
      is_bug_of: null, parent_issue_id: null, issue_url: null,
    };
    const held = kids.some((k) => isBug(k) && isOpen(k));
    const blockH = Math.max(NODE_H, kids.length * (NODE_H + ROW_GAP) - ROW_GAP);
    const parent: PlacedNode = { gi: pgi, x: PAD, y: y + blockH / 2 - NODE_H / 2, held };
    const children: PlacedNode[] = kids.map((k, idx) => ({
      gi: k, held: false, x: PAD + NODE_W + COL_GAP, y: y + idx * (NODE_H + ROW_GAP),
    }));
    clusters.push({ parent, children });
    y += blockH + CLUSTER_GAP;
  }
  const width = PAD * 2 + NODE_W * 2 + COL_GAP;
  const height = y + PAD;
  const linkedIds = new Set<string>();
  for (const c of clusters) { linkedIds.add(c.parent.gi.issue_id); c.children.forEach((k) => linkedIds.add(k.gi.issue_id)); }
  const standalone = issues.filter((i) => !linkedIds.has(i.issue_id) && !parentLink(i));
  return { clusters, width, height, standalone };
}

function creditPct(i: GI): number {
  const c = statusCredit(i);
  return c === null ? 0 : Math.round(c * 100);
}

function NodeBox({ n, onClick, selected }: { n: PlacedNode; onClick: () => void; selected: boolean }) {
  const bug = isBug(n.gi);
  const pct = creditPct(n.gi);
  const ring = bug
    ? "border-rose-300 bg-rose-50 shadow-[0_0_8px_rgba(244,63,94,0.30)]"
    : n.held
      ? "border-violet-300 bg-violet-50 shadow-[0_0_8px_rgba(174,0,208,0.28)]"
      : "border-sky-200 bg-white";
  return (
    <div
      onClick={onClick}
      style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
      className={`absolute rounded-lg border px-2.5 py-1.5 cursor-pointer transition-all overflow-hidden ${ring} ${selected ? "ring-2 ring-[#AE00D0] ring-offset-1" : "hover:-translate-y-0.5"}`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`text-[8px] font-bold uppercase px-1 rounded ${bug ? "bg-rose-200 text-rose-800" : "bg-sky-100 text-sky-700"}`}>
          {bug ? "🐞 bug" : (n.gi.issue_type || "feat")}
        </span>
        <span className="font-mono text-[10px] text-slate-500">{n.gi.issue_id}</span>
        {n.held && <span title="held — open linked bug" className="text-[9px]">🛡</span>}
        <span className="ml-auto text-[9px] tabular-nums text-slate-400">{pct}%</span>
      </div>
      <div className="text-[10.5px] text-slate-700 truncate mt-0.5" title={n.gi.title ?? ""}>
        {n.gi.title ?? "—"}
      </div>
      <div className="h-0.5 mt-1 rounded bg-stone-100 overflow-hidden">
        <div className={`h-full ${pct >= 93 ? "bg-emerald-400" : pct >= 78 ? "bg-sky-400" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function IssueMap({ issues }: { issues: GI[] }) {
  const { clusters, width, height, standalone } = useMemo(() => buildLayout(issues), [issues]);
  const [t, setT] = useState({ x: 0, y: 0, k: 0.9 });
  const [sel, setSel] = useState<GI | null>(null);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const k = Math.min(2.5, Math.max(0.25, t.k * (e.deltaY < 0 ? 1.1 : 0.9)));
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
  const zoom = (f: number) => setT((p) => ({ ...p, k: Math.min(2.5, Math.max(0.25, p.k * f)) }));
  const reset = () => setT({ x: 0, y: 0, k: 0.9 });

  return (
    <div className="relative">
      {/* controls */}
      <div className="absolute top-3 right-3 z-20 flex gap-1.5">
        <button onClick={() => zoom(1.2)} className="w-8 h-8 rounded-lg bg-white border border-stone-200 text-slate-600 hover:border-[#AE00D0] text-lg leading-none">+</button>
        <button onClick={() => zoom(0.83)} className="w-8 h-8 rounded-lg bg-white border border-stone-200 text-slate-600 hover:border-[#AE00D0] text-lg leading-none">−</button>
        <button onClick={reset} className="h-8 px-2.5 rounded-lg bg-white border border-stone-200 text-slate-600 hover:border-[#AE00D0] text-xs">Reset</button>
      </div>

      {/* canvas */}
      <div
        onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        className="relative h-[600px] overflow-hidden rounded-xl border border-stone-200 bg-[radial-gradient(circle,#ece8f3_1px,transparent_1px)] [background-size:22px_22px] cursor-grab active:cursor-grabbing select-none"
      >
        {clusters.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            No linked bug clusters in this cycle yet — links appear here as bugs are related to features in Linear.
          </div>
        ) : (
          <div style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.k})`, transformOrigin: "0 0", width, height }} className="absolute">
            {/* connectors */}
            <svg width={width} height={height} className="absolute top-0 left-0 pointer-events-none">
              {clusters.flatMap((c) =>
                c.children.map((k) => {
                  const x1 = c.parent.x + NODE_W, y1 = c.parent.y + NODE_H / 2;
                  const x2 = k.x, y2 = k.y + NODE_H / 2;
                  const mx = (x1 + x2) / 2;
                  return (
                    <path key={`${c.parent.gi.issue_id}-${k.gi.issue_id}`}
                          d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                          fill="none" stroke="#d6cfe6" strokeWidth={1.5} />
                  );
                }),
              )}
            </svg>
            {/* nodes */}
            {clusters.flatMap((c) => [c.parent, ...c.children]).map((n) => (
              <NodeBox key={n.gi.issue_id} n={n} selected={sel?.issue_id === n.gi.issue_id} onClick={() => setSel(n.gi)} />
            ))}
          </div>
        )}

        {/* detail panel */}
        {sel && (
          <div className="absolute top-3 left-3 z-20 w-64 rounded-xl border border-stone-200 bg-white/95 backdrop-blur shadow-lg p-3.5">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-xs text-slate-500">{sel.issue_id}</span>
              <button onClick={() => setSel(null)} className="text-slate-400 hover:text-slate-700 text-xs">✕</button>
            </div>
            <div className="text-sm font-medium text-slate-900 mt-1 leading-snug">{sel.title ?? "—"}</div>
            <dl className="mt-2.5 space-y-1 text-[12px]">
              <Row k="Type" v={isBug(sel) ? "🐞 Bug" : (sel.issue_type || "feature")} />
              <Row k="Status" v={`${sel.status ?? "—"} (${creditPct(sel)}%)`} />
              <Row k="Assignee" v={sel.employee_name ?? "unassigned"} />
              <Row k="Priority" v={sel.priority ?? "—"} />
              <Row k="Story pts" v={sel.story_points != null ? String(sel.story_points) : "—"} />
              {sel.is_bug_of && <Row k="Bug of" v={sel.is_bug_of} />}
              {sel.parent_issue_id && <Row k="Parent" v={sel.parent_issue_id} />}
            </dl>
            {sel.issue_url && (
              <a href={sel.issue_url} target="_blank" rel="noopener noreferrer"
                 className="mt-2.5 inline-block text-[12px] text-[#AE00D0] hover:underline">Open in Linear ↗</a>
            )}
          </div>
        )}
      </div>

      {/* legend + unlinked */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1"><i className="inline-block w-3 h-3 rounded border border-sky-200 bg-white" /> Feature</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block w-3 h-3 rounded border border-rose-300 bg-rose-50" /> Bug</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block w-3 h-3 rounded border border-violet-300 bg-violet-50" /> 🛡 Held (open bug)</span>
        <span className="text-slate-400">· scroll to zoom · drag to pan · click a node for details</span>
      </div>

      {standalone.length > 0 && (
        <details className="mt-4 rounded-xl border border-stone-200 bg-white">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm text-slate-700 hover:bg-stone-50 select-none">
            <span className="font-medium">{standalone.length} unlinked issues</span>
            <span className="text-slate-400 text-[12px]"> — no bug/parent relation in Linear (single nodes)</span>
          </summary>
          <div className="px-4 pb-4 pt-1 flex flex-wrap gap-1.5">
            {standalone.map((i) => (
              <span key={i.issue_id} title={`${i.title ?? ""} · ${i.status ?? ""} · ${i.employee_name ?? "unassigned"}`}
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${isBug(i) ? "border-rose-200 bg-rose-50 text-rose-700" : "border-stone-200 bg-stone-50 text-slate-600"}`}>
                {i.issue_id}
              </span>
            ))}
          </div>
        </details>
      )}
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
