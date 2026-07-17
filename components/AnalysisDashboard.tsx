"use client";

/**
 * AnalysisDashboard — the ONE unified review view, identical for every repo. A repo selector,
 * a collapsible codebase map, and the professional review feed. Click any PR card → the map
 * opens and lights up that PR's reached modules. The bonus score/ranking lives on a separate
 * Performance page (link shown when the repo has scored data).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Review, ReviewOverview } from "@/lib/reviewQueries";
import type { TrialGraph } from "@/lib/trialQueries";
import { ReviewBoard } from "./ReviewBoard";
import { ModuleGraph } from "./ModuleGraph";

export function AnalysisDashboard({
  repos, repo, reviews, overview, graph, hasPerformance,
}: {
  repos: string[]; repo: string; reviews: Review[]; overview: ReviewOverview;
  graph: TrialGraph | null; hasPerformance: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);
  const [showGraph, setShowGraph] = useState(false);
  const selReview = reviews.find((r) => r.pr_number === selected) ?? null;

  const onSelect = (pr: number) => {
    setSelected((cur) => (cur === pr ? null : pr));
    if (graph) setShowGraph(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[12px] text-slate-500">Repository</label>
        <select value={repo}
          onChange={(e) => router.push(`/analysis?repo=${encodeURIComponent(e.target.value)}`)}
          className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[13px] text-slate-800 focus:border-[#AE00D0] outline-none">
          {repos.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {hasPerformance && (
          <a href={`/performance?repo=${encodeURIComponent(repo)}`}
            className="ml-auto text-[12.5px] text-[#AE00D0] hover:underline">View performance &amp; ranking →</a>
        )}
      </div>

      {graph && (
        <div className="rounded-xl border border-stone-200 bg-white">
          <button onClick={() => setShowGraph((s) => !s)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] text-slate-700 hover:bg-stone-50">
            <span className="font-medium">{showGraph ? "▾" : "▸"} Codebase map{selReview ? ` — showing #${selReview.pr_number}'s reach` : ""}</span>
            <span className="text-[11px] text-slate-400">{graph.counts.modules} modules · {graph.counts.edges} dependencies</span>
          </button>
          {showGraph && <div className="px-4 pb-4"><ModuleGraph graph={graph} changed={selReview?.changed_modules} reached={selReview?.reached_modules} /></div>}
        </div>
      )}

      <ReviewBoard reviews={reviews} overview={overview} selected={selected} onSelect={onSelect} />
    </div>
  );
}
