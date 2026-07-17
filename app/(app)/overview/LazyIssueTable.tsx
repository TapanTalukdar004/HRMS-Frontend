"use client";
import { useState } from "react";
import Link from "next/link";
import type { IssueRowLite } from "@/lib/overviewQueries";

/** The per-employee collapsible issue table, LAZY (changes/236): the <summary> row is server-rendered
 *  as before, but the table itself only mounts on first expand. With 18 employees × every in-scope
 *  issue, eagerly rendering all tables put ~1 MB of markup into every /overview response the user
 *  hadn't asked to see yet. The rows arrive as compact props and render client-side on demand —
 *  same data, same columns, no truncation, no scoring change. Once opened it stays mounted, so
 *  re-expanding is instant. */

const f1 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : (Math.round(v * 10) / 10).toFixed(1));
const dmy = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—");
function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return (((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase()) || "?";
}

const STATE_CHIP: Record<IssueRowLite["state"], { word: string; cls: string }> = {
  proven: { word: "proven", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  awaiting: { word: "awaiting proof", cls: "bg-stone-100 text-slate-500 ring-stone-200" },
  helped: { word: "helped", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
};
const ISSUE_COLS = ["Issue", "State", "Title", "Priority", "SP", "Status", "Started", "Done", "PRs", "Points"];

export type IssueTableSummary = {
  assigned: number; proven: number; awaiting: number; helped: number;
  evidencePrs: number; avgQuality: number | null; points: number;
};

export default function LazyIssueTable({ name, color, href, hasProof, summary, issues }: {
  name: string; color: string; href: string; hasProof: boolean;
  summary: IssueTableSummary | null; issues: IssueRowLite[];
}) {
  // sticky: render the table from the first expand onward (collapse keeps it mounted)
  const [opened, setOpened] = useState(false);
  const first = name.split(" ")[0];
  const d = summary;

  return (
    <details className="border-t border-stone-100 group"
      onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) setOpened(true); }}>
      <summary className="cursor-pointer list-none px-6 py-3 hover:bg-stone-50 select-none flex items-center gap-3">
        <span className="text-slate-400 group-open:rotate-90 transition-transform inline-block">▸</span>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[11px]" style={{ background: color }}>{initials(name)}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-slate-800">{name}</div>
          <div className="text-[11px] text-slate-400">{d ? `all ${d.assigned} assigned (${d.proven} proven · ${d.awaiting} awaiting) + ${d.helped} helped` : "— issues in scope"}</div>
        </div>
        <div className="hidden sm:flex items-center gap-6 text-right">
          <div><div className={`text-sm font-bold tabular-nums ${hasProof ? "text-slate-800" : "text-slate-300"}`}>{d ? d.evidencePrs : "—"}</div><div className="text-[9px] uppercase tracking-wider text-slate-400">PRs</div></div>
          <div><div className={`text-sm font-bold tabular-nums ${hasProof ? "text-slate-800" : "text-slate-300"}`}>{f1(d?.avgQuality)}</div><div className="text-[9px] uppercase tracking-wider text-slate-400">quality</div></div>
          <div><div className={`text-sm font-bold tabular-nums ${hasProof ? "text-[#7B5AFF]" : "text-slate-300"}`}>{d ? f1(d.points) : "—"}</div><div className="text-[9px] uppercase tracking-wider text-slate-400">points</div></div>
        </div>
      </summary>
      <div className="px-6 pb-5 pt-1 bg-stone-50/40">
        {opened && (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white max-h-[420px] overflow-y-auto">
            <table className="w-full min-w-[860px] text-[12px]">
              <thead className="bg-stone-50 text-[10px] uppercase tracking-wide text-slate-400 sticky top-0">
                <tr>{ISSUE_COLS.map((c) => (<th key={c} className={`px-3 py-2 bg-stone-50 ${["SP", "PRs", "Points"].includes(c) ? "text-right" : "text-left"}`}>{c}</th>))}</tr>
              </thead>
              <tbody>
                {issues.length > 0 ? issues.map((i) => {
                  const st = STATE_CHIP[i.state];
                  return (
                    <tr key={`${i.state}-${i.key}`} className="border-t border-stone-100">
                      <td className="px-3 py-2 font-mono text-[11px] text-[#7B5AFF]">{i.key}</td>
                      <td className="px-3 py-2"><span className={`inline-block text-[10px] ring-1 ring-inset rounded-full px-1.5 py-0.5 ${st.cls}`}>{st.word}</span></td>
                      <td className="px-3 py-2 text-slate-700 max-w-[240px] truncate" title={i.title ?? ""}>{i.title}</td>
                      <td className="px-3 py-2 text-slate-500">{i.priority ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{i.sp ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-500">{i.status ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{dmy(i.startedAt)}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{dmy(i.completedAt)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{i.prCount || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#7B5AFF]">{i.points === null ? "—" : f1(i.points)}</td>
                    </tr>
                  );
                }) : (
                  <tr className="border-t border-stone-100">
                    <td colSpan={ISSUE_COLS.length} className="px-3 py-4 text-center text-slate-300">no issues in this scope</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-2.5 flex items-center justify-between text-[12px]">
          <span className="text-slate-400">{issues.length > 0 ? `Every in-scope issue for ${first} — proven, awaiting, and helped. Full math + per-PR review on the profile.` : `No issues in this scope for ${first}.`}</span>
          <Link href={href} className="font-medium hover:underline" style={{ color }}>full profile →</Link>
        </div>
      </div>
    </details>
  );
}
