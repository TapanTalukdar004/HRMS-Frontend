"use client";
/**
 * PrAnalysisClient — the per-PR review feed on the employee detail page. Visual language mirrors the
 * repository-analysis ReviewBoard, but the data is our reviewer's agent_assessments (verdict is SYNTHESIZED
 * from covers + defects + flags, since our repo has no pr_reviews rows). Click a PR → the CodeGraph module
 * map lights that PR's changed (violet) / reached (amber) modules — the same map used for Flowise/OpenList.
 */
import { useState } from "react";
import { ModuleGraph } from "@/components/ModuleGraph";
import type { TrialGraph } from "@/lib/trialQueries";

export type PrAnalysis = {
  pr_number: number; title: string | null; issueKeys: string[]; issueTitles: string[];
  titleMismatch: boolean; quality: number | null; covers: number | null; narrative: string | null;
  strengths: string[]; defects: string[]; flags: string[];
  blastBand: string | null; reachedSymbols: number | null; touchesSensitive: boolean;
  changedModules: string[]; reachedModules: string[];
  reviews: number; selfMerged: boolean; ci: string | null; adds: number; dels: number;
};

const f1 = (v: number | null) => (v == null ? "—" : (Math.round(v * 10) / 10).toFixed(1));
// synthesize a verdict from our real signals
function verdict(p: PrAnalysis): { word: string; accent: string; cls: string } {
  if (p.titleMismatch || (p.touchesSensitive && p.blastBand === "wide" && p.reviews === 0))
    return { word: "Needs review", accent: "border-l-rose-400", cls: "text-rose-600" };
  if ((p.quality ?? 0) < 6 || (p.covers ?? 1) < 0.5 || p.defects.length > 0)
    return { word: "Needs changes", accent: "border-l-amber-400", cls: "text-amber-600" };
  return { word: "Looks good", accent: "border-l-emerald-400", cls: "text-emerald-600" };
}

function Card({ p, open, onToggle }: { p: PrAnalysis; open: boolean; onToggle: () => void }) {
  const v = verdict(p);
  const reviewed = p.reviews > 0 && !p.selfMerged;
  return (
    <div className={`rounded-lg border border-stone-200 bg-white border-l-4 ${v.accent} overflow-hidden`}>
      <button onClick={onToggle} className="w-full text-left px-4 py-3 hover:bg-stone-50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[12px] text-slate-400">#{p.pr_number}</span>
          <span className="text-[14px] font-medium text-slate-900 flex-1 min-w-0 truncate" title={p.title ?? ""}>{p.title ?? "—"}</span>
          <span className={`text-[12px] font-semibold shrink-0 ${v.cls}`}>{v.word}</span>
          <span className="text-[13px] tabular-nums font-semibold text-slate-700 shrink-0">{f1(p.quality)}<span className="text-[10px] text-slate-400">/10</span></span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px]">
          <span className="text-slate-400">proves</span>
          {p.issueKeys.map((k) => <span key={k} className="font-mono text-[#7B5AFF]">{k}</span>)}
          {p.titleMismatch
            ? <span className="text-rose-600" title="the diff does not match the ticket it claims">✗ doesn&apos;t match ticket</span>
            : <span className="text-emerald-600">✓ matches ticket</span>}
          {p.blastBand && <span className={p.blastBand === "wide" ? "text-violet-700" : "text-slate-500"}>blast: {p.blastBand}{p.reachedSymbols ? ` · ~${p.reachedSymbols} sym` : ""}</span>}
          {p.touchesSensitive && <span className="text-rose-600">⚠ sensitive</span>}
          {reviewed ? <span className="text-emerald-700">✓ reviewed</span> : <span className="text-amber-700">self-merged</span>}
          {p.ci === "success" ? <span className="text-emerald-700">CI ✓</span> : p.ci === "failure" ? <span className="text-rose-700">CI ✗</span> : null}
          <span className="ml-auto text-[#AE00D0]">{open ? "hide map ▾" : "show map + review ▸"}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-stone-100 space-y-3 text-[13px]">
          {p.narrative && <p className="text-slate-700 leading-snug">{p.narrative}</p>}
          {p.strengths.length > 0 && (
            <div><div className="text-[11px] uppercase tracking-wide text-emerald-700 mb-1">Strengths</div>
              <ul className="list-disc list-inside text-slate-600 space-y-0.5">{p.strengths.slice(0, 5).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          )}
          {p.defects.length > 0 && (
            <div><div className="text-[11px] uppercase tracking-wide text-rose-700 mb-1">Defects the reviewer flagged</div>
              <ul className="list-disc list-inside text-rose-700 space-y-0.5">{p.defects.slice(0, 6).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          )}
          <div className="text-[12px] text-slate-500">
            covers ticket <b className="text-slate-700">{p.covers == null ? "—" : `${Math.round(p.covers * 100)}%`}</b> ·
            +{p.adds}/−{p.dels} · touched <b className="text-violet-700">{p.changedModules.length}</b> module{p.changedModules.length === 1 ? "" : "s"} → reaches <b className="text-amber-700">{p.reachedModules.length}</b> downstream
          </div>
        </div>
      )}
    </div>
  );
}

type IssueGroup = {
  key: string; title: string; prs: PrAnalysis[];
  changed: string[]; reached: string[]; avgQuality: number | null;
};

export default function PrAnalysisClient({ prs, graph, repo }: { prs: PrAnalysis[]; graph: TrialGraph | null; repo: string }) {
  const [mode, setMode] = useState<"pr" | "issue">("pr");
  const [openPr, setOpenPr] = useState<number | null>(prs[0]?.pr_number ?? null);
  const [openIssue, setOpenIssue] = useState<string | null>(null);

  // group PRs by the issues they prove — an issue with 3 PRs unions their module footprints
  const issueGroups: IssueGroup[] = (() => {
    const m = new Map<string, IssueGroup>();
    for (const p of prs) {
      p.issueKeys.forEach((k, idx) => {
        const g = m.get(k) ?? { key: k, title: p.issueTitles[idx] ?? k, prs: [], changed: [], reached: [], avgQuality: null };
        g.prs.push(p);
        m.set(k, g);
      });
    }
    for (const g of m.values()) {
      g.changed = [...new Set(g.prs.flatMap((p) => p.changedModules))];
      g.reached = [...new Set(g.prs.flatMap((p) => p.reachedModules))];
      const qs = g.prs.map((p) => p.quality).filter((v): v is number => v != null);
      g.avgQuality = qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : null;
    }
    return [...m.values()].sort((a, b) => b.prs.length - a.prs.length || a.key.localeCompare(b.key));
  })();

  const selPr = mode === "pr" ? prs.find((p) => p.pr_number === openPr) ?? null : null;
  const selIssue = mode === "issue" ? issueGroups.find((g) => g.key === openIssue) ?? null : null;
  const changed = mode === "pr" ? selPr?.changedModules : selIssue?.changed;
  const reached = mode === "pr" ? selPr?.reachedModules : selIssue?.reached;

  return (
    <section>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Evidence analysis <span className="text-slate-300 normal-case tracking-normal">· {prs.length} merged PRs proving {issueGroups.length} issues</span></h2>
        <div className="flex rounded-lg border border-stone-200 overflow-hidden text-[12px]">
          <button onClick={() => setMode("pr")} className={`px-3 py-1 ${mode === "pr" ? "bg-[#AE00D0] text-white font-medium" : "bg-white text-slate-600 hover:bg-stone-50"}`}>By PR</button>
          <button onClick={() => { setMode("issue"); if (!openIssue && issueGroups[0]) setOpenIssue(issueGroups[0].key); }} className={`px-3 py-1 ${mode === "issue" ? "bg-[#AE00D0] text-white font-medium" : "bg-white text-slate-600 hover:bg-stone-50"}`}>By issue</button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2.5 order-2 lg:order-1">
          {mode === "pr"
            ? prs.map((p) => <Card key={p.pr_number} p={p} open={openPr === p.pr_number} onToggle={() => setOpenPr(openPr === p.pr_number ? null : p.pr_number)} />)
            : issueGroups.map((g) => (
              <div key={g.key} className={`rounded-lg border bg-white overflow-hidden ${openIssue === g.key ? "border-[#AE00D0]" : "border-stone-200"}`}>
                <button onClick={() => setOpenIssue(g.key)} className="w-full text-left px-4 py-3 hover:bg-stone-50">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[12px] text-[#7B5AFF]">{g.key}</span>
                    <span className="text-[14px] font-medium text-slate-900 flex-1 min-w-0 truncate" title={g.title}>{g.title}</span>
                    <span className="text-[12px] text-slate-500 shrink-0">{g.prs.length} PR{g.prs.length > 1 ? "s" : ""}</span>
                    <span className="text-[13px] tabular-nums font-semibold text-slate-700 shrink-0">{f1(g.avgQuality)}<span className="text-[10px] text-slate-400">/10</span></span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
                    {g.prs.map((p) => <span key={p.pr_number} className="font-mono">#{p.pr_number}</span>)}
                    <span className="text-violet-700">{g.changed.length} modules changed</span>
                    <span className="text-amber-700">→ {g.reached.length} reached</span>
                    {openIssue === g.key && <span className="ml-auto text-[#AE00D0]">shown on map ▸</span>}
                  </div>
                </button>
              </div>
            ))}
        </div>
        <div className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-4 rounded-xl border border-stone-200 bg-white p-3">
            <div className="text-[12px] text-slate-500 mb-2">
              Codebase map <span className="text-slate-400">· {repo}</span>
              {selPr ? <> — PR <span className="font-mono text-[#7B5AFF]">#{selPr.pr_number}</span></>
                : selIssue ? <> — issue <span className="font-mono text-[#7B5AFF]">{selIssue.key}</span> <span className="text-slate-400">({selIssue.prs.length} PRs united)</span></> : ""}
            </div>
            {graph ? (
              <ModuleGraph graph={graph} changed={changed} reached={reached} />
            ) : (
              <div className="text-[13px] text-slate-400 text-center py-10">Codebase map not built for this repo yet — run the CodeGraph index.</div>
            )}
            <div className="text-[11px] text-slate-400 mt-2"><span style={{ color: "#7C3AED" }}>●</span> changed · <span style={{ color: "#D97706" }}>●</span> reached downstream{mode === "issue" ? " · union of the issue's PRs" : ""}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
